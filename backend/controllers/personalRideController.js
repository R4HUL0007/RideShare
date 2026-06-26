// =======================================================
// Personalized Ride Request — Uber/Ola-style on-demand ride lifecycle.
// Completely separate from the shared-ride Create/Find/Book/Escrow flow.
// =======================================================
const mongoose = require("mongoose");
const PersonalRideRequest = require("../models/PersonalRideRequest");
const DriverLedger = require("../models/DriverLedger");
const Vehicle = require("../models/Vehicle");
const User = require("../models/User");
const { haversineKm } = require("../utils/geo");
const { createNotification } = require("../utils/notify");
const { computeFare, computeDurationMin, splitFare, VEHICLE_PRICING, VEHICLE_TYPES, config } = require("../utils/personalFare");
const { getOnlineIds } = require("../utils/presence");

const idStr = (v) => (v == null ? null : typeof v === "string" ? v : v._id ? v._id.toString() : v.toString());

// Map our Bike/Auto/Car classes to the Vehicle model's vehicleType values.
const VEHICLE_MATCH = { Bike: ["Motorcycle", "Scooter"], Auto: ["Auto-rickshaw"], Car: ["Car"] };

const io_ = (req) => req.app.get("io");
const users_ = (req) => req.app.get("users") || {};

// Emit a socket event to a specific user (all their devices) — never broadcast PII.
function emitToUser(io, users, userId, event, payload) {
    if (io && userId) io.to(idStr(userId)).emit(event, payload);
}

// Public-safe shape for the passenger / driver app.
async function populated(id) {
    return PersonalRideRequest.findById(id)
        .populate("driver_id", "name phoneNumber ratings profilePicture")
        .populate("vehicle_id", "make model vehicleType licensePlate color")
        .lean();
}

// Driver-facing view: never expose the boarding OTP code to the driver (the
// passenger shares it). `otpGenerated` tells the driver an OTP is active.
function driverView(obj) {
    if (!obj) return obj;
    const otpGenerated = Boolean(obj.reachedPickupAt) && !obj.otp?.verifiedAt;
    if (obj.otp) obj.otp = { ...obj.otp, code: "" };
    return { ...obj, otpGenerated };
}

// Eligible drivers for a broadcast: online (socket-connected), verified, owning
// at least one verified vehicle matching the requested class.
async function eligibleDrivers(req, vehicleType, excludeUserId) {
    const onlineIds = await getOnlineIds();
    if (onlineIds.length === 0) return [];
    const matchTypes = VEHICLE_MATCH[vehicleType] || ["Car"];
    const verifiedVehicles = await Vehicle.find({ user_id: { $in: onlineIds }, isVerified: true, vehicleType: { $in: matchTypes } })
        .select("user_id").lean();
    const driverIds = [...new Set(verifiedVehicles.map((v) => idStr(v.user_id)))]
        .filter((id) => id !== idStr(excludeUserId));
    if (driverIds.length === 0) return [];
    const drivers = await User.find({ _id: { $in: driverIds }, isDriverVerified: true, status: "active" }).select("_id name").lean();
    return drivers;
}

/* ============== Passenger: estimate ============== */
exports.estimate = async (req, res) => {
    try {
        const { pickup, destination } = req.body || {};
        const km = (pickup?.lat != null && destination?.lat != null)
            ? haversineKm(pickup, destination) : 0;
        const durationMin = computeDurationMin(km);
        const options = VEHICLE_TYPES.map((vt) => ({
            vehicleType: vt, fare: computeFare(vt, km), eta: VEHICLE_PRICING[vt].eta,
        }));
        // Nearby availability (online verified drivers with any verified vehicle).
        const onlineIds = await getOnlineIds();
        let driversAvailable = 0;
        if (onlineIds.length) {
            const vs = await Vehicle.find({ user_id: { $in: onlineIds }, isVerified: true }).select("user_id").lean();
            driversAvailable = new Set(vs.map((v) => idStr(v.user_id))).size;
        }
        res.status(200).json({ distanceKm: Number(km.toFixed(2)), durationMin, options, driversAvailable, radiusKm: config.radiusKm() });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* ============== Passenger: live availability stats ============== */
// Powers the header strip + "Nearby Drivers" panel on the Request a Ride page.
exports.stats = async (req, res) => {
    try {
        const onlineIds = await getOnlineIds();
        const [driversOnline, verifiedDrivers, ratingAgg, total, accepted] = await Promise.all([
            onlineIds.length
                ? User.countDocuments({ _id: { $in: onlineIds }, isDriverVerified: true, status: "active" })
                : Promise.resolve(0),
            User.countDocuments({ isDriverVerified: true }),
            User.aggregate([
                { $match: { "ratings.driver.count": { $gt: 0 } } },
                { $group: { _id: null, avg: { $avg: "$ratings.driver.average" } } },
            ]),
            PersonalRideRequest.countDocuments({}),
            PersonalRideRequest.countDocuments({ status: { $in: ["DRIVER_ASSIGNED", "RIDE_STARTED", "RIDE_COMPLETED", "PAYMENT_RECEIVED"] } }),
        ]);
        const avgRating = ratingAgg[0]?.avg ? Number(ratingAgg[0].avg.toFixed(1)) : null;
        const acceptanceRate = total > 0 ? Math.round((accepted / total) * 100) : null;
        res.status(200).json({ driversOnline, verifiedDrivers, avgRating, acceptanceRate, radiusKm: config.radiusKm() });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* ============== Passenger: create request ============== */
exports.createRequest = async (req, res) => {
    try {
        const { pickup, destination, vehicleType, notes } = req.body || {};
        if (!destination?.address) return res.status(400).json({ message: "Destination is required." });
        if (!VEHICLE_TYPES.includes(vehicleType)) return res.status(400).json({ message: "Choose a valid ride type." });

        // One active request at a time.
        const existing = await PersonalRideRequest.findOne({ passenger_id: req.user._id, status: { $in: ["SEARCHING", "DRIVER_ASSIGNED", "RIDE_STARTED", "RIDE_COMPLETED"] } });
        if (existing) return res.status(409).json({ message: "You already have an active ride.", request: await populated(existing._id) });

        // Pay-after-completion safeguard: block a new request if the passenger
        // has a completed ride they haven't paid for yet (shared or personal).
        const { findUnpaidCompletedRide } = require("../utils/unpaidGuard");
        const unpaid = await findUnpaidCompletedRide(req.user._id);
        if (unpaid) {
            return res.status(402).json({
                code: "UNPAID_RIDE",
                message: `Please pay for your completed ride to ${unpaid.destination || "your last trip"} (₹${unpaid.amount}) before requesting another.`,
                unpaid,
            });
        }

        const km = (pickup?.lat != null && destination?.lat != null) ? haversineKm(pickup, destination) : 0;
        const fare = computeFare(vehicleType, km);
        const drivers = await eligibleDrivers(req, vehicleType, req.user._id);

        const doc = await PersonalRideRequest.create({
            passenger_id: req.user._id,
            passengerName: req.user.name,
            pickup: pickup || {},
            destination,
            distanceKm: Number(km.toFixed(2)),
            durationMin: computeDurationMin(km),
            vehicleType,
            notes: (notes || "").slice(0, 300),
            estimatedFare: fare,
            status: drivers.length ? "SEARCHING" : "SEARCHING", // still searching even if 0 online (job will expire)
            notifiedDriverIds: drivers.map((d) => d._id),
            radiusKm: config.radiusKm(),
            expiresAt: new Date(Date.now() + config.requestExpiryMin() * 60 * 1000),
        });

        const io = io_(req); const users = users_(req);
        // Socket: tell the passenger their request was created.
        emitToUser(io, users, req.user._id, "ride_request_created", { id: idStr(doc._id), status: doc.status });
        // Broadcast to each eligible driver + notify in-app.
        for (const d of drivers) {
            emitToUser(io, users, d._id, "ride_request_broadcast", {
                id: idStr(doc._id), pickup: doc.pickup?.address, destination: doc.destination?.address,
                distanceKm: doc.distanceKm, fare: doc.estimatedFare, vehicleType: doc.vehicleType,
            });
            await createNotification({ io, users, userId: d._id, type: "ride", title: "New ride request", message: `${req.user.name} needs a ${vehicleType} to ${destination.address} (₹${fare}).`, link: { tab: "driveRequests" } });
        }
        if (io) io.emit("personal_ride:update", { at: Date.now() });

        res.status(201).json({ request: await populated(doc._id), broadcastTo: drivers.length });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* ============== Passenger: my active request ============== */
exports.myActive = async (req, res) => {
    try {
        const doc = await PersonalRideRequest.findOne({
            passenger_id: req.user._id,
            status: { $in: ["SEARCHING", "DRIVER_ASSIGNED", "RIDE_STARTED", "RIDE_COMPLETED"] },
        }).sort({ createdAt: -1 });
        if (!doc) return res.status(200).json(null);
        res.status(200).json(await populated(doc._id));
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

exports.getById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const doc = await PersonalRideRequest.findById(id);
        if (!doc) return res.status(404).json({ message: "Not found" });
        const uid = idStr(req.user._id);
        if (idStr(doc.passenger_id) !== uid && idStr(doc.driver_id) !== uid && !req.user.isAdmin) {
            return res.status(403).json({ message: "Not your ride" });
        }
        // Hide the OTP from the driver until they've reached pickup; passenger always sees it.
        const out = await populated(id);
        if (idStr(doc.driver_id) === uid && doc.otp?.verifiedAt == null) {
            if (out.otp) out.otp = { ...out.otp, code: "" };
        }
        res.status(200).json(out);
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* ============== Passenger: my ride history ============== */
exports.myHistory = async (req, res) => {
    try {
        const items = await PersonalRideRequest.find({ passenger_id: req.user._id })
            .sort({ createdAt: -1 }).limit(50)
            .populate("driver_id", "name").populate("vehicle_id", "make model licensePlate").lean();
        res.status(200).json(items);
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* ============== Passenger / driver: cancel ============== */
exports.cancel = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const doc = await PersonalRideRequest.findById(id);
        if (!doc) return res.status(404).json({ message: "Not found" });
        const uid = idStr(req.user._id);
        const isPassenger = idStr(doc.passenger_id) === uid;
        const isDriver = idStr(doc.driver_id) === uid;
        if (!isPassenger && !isDriver) return res.status(403).json({ message: "Not your ride" });
        if (["RIDE_COMPLETED", "PAYMENT_RECEIVED", "CANCELLED", "EXPIRED"].includes(doc.status)) {
            return res.status(400).json({ message: "This ride can no longer be cancelled." });
        }
        doc.status = "CANCELLED";
        doc.cancelledBy = isPassenger ? "passenger" : "driver";
        doc.cancelReason = (req.body?.reason || "").slice(0, 200);
        await doc.save();

        const io = io_(req); const users = users_(req);
        const other = isPassenger ? doc.driver_id : doc.passenger_id;
        if (other) {
            emitToUser(io, users, other, "ride_cancelled", { id: idStr(doc._id), by: doc.cancelledBy });
            await createNotification({ io, users, userId: other, type: "ride", title: "Ride cancelled", message: `The ${doc.cancelledBy} cancelled the ride to ${doc.destination?.address}.`, link: { tab: isPassenger ? "driveRequests" : "requestRide" } });
        }
        if (io) io.emit("personal_ride:update", { at: Date.now() });
        res.status(200).json(await populated(doc._id));
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* ============== Driver: incoming requests ============== */
exports.incoming = async (req, res) => {
    try {
        const items = await PersonalRideRequest.find({
            status: "SEARCHING",
            notifiedDriverIds: req.user._id,
            declinedDriverIds: { $ne: req.user._id },
            expiresAt: { $gt: new Date() },
        }).sort({ createdAt: -1 }).populate("passenger_id", "name ratings").lean();
        res.status(200).json(items);
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

exports.driverActive = async (req, res) => {
    try {
        const doc = await PersonalRideRequest.findOne({
            driver_id: req.user._id,
            status: { $in: ["DRIVER_ASSIGNED", "RIDE_STARTED", "RIDE_COMPLETED"] },
        }).sort({ createdAt: -1 });
        if (!doc) return res.status(200).json(null);
        res.status(200).json(driverView(await populated(doc._id)));
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* ============== Driver: accept ============== */
exports.accept = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        if (!req.user.isDriverVerified) return res.status(403).json({ message: "Only verified drivers can accept rides." });

        // Pick a verified vehicle matching the requested class.
        const doc = await PersonalRideRequest.findById(id);
        if (!doc) return res.status(404).json({ message: "Not found" });
        if (doc.status !== "SEARCHING") return res.status(409).json({ message: "This ride is no longer available." });
        const matchTypes = VEHICLE_MATCH[doc.vehicleType] || ["Car"];
        const vehicle = await Vehicle.findOne({ user_id: req.user._id, isVerified: true, vehicleType: { $in: matchTypes } });
        if (!vehicle) return res.status(400).json({ message: `You need a verified ${doc.vehicleType} to accept this ride.` });

        // Atomic claim: only assign if still SEARCHING (first driver wins).
        const claimed = await PersonalRideRequest.findOneAndUpdate(
            { _id: id, status: "SEARCHING" },
            {
                $set: {
                    status: "DRIVER_ASSIGNED", driver_id: req.user._id, driverName: req.user.name,
                    vehicle_id: vehicle._id, assignedAt: new Date(), "tracking.state": "enroute_pickup",
                },
                $push: { interestedDrivers: { driver_id: req.user._id, name: req.user.name, at: new Date() } },
            },
            { new: true }
        );
        if (!claimed) return res.status(409).json({ message: "Another driver already accepted this ride." });

        const io = io_(req); const users = users_(req);
        emitToUser(io, users, req.user._id, "driver_accepted_request", { id: idStr(claimed._id) });
        emitToUser(io, users, claimed.passenger_id, "driver_assigned", { id: idStr(claimed._id) });
        await createNotification({ io, users, userId: claimed.passenger_id, type: "ride", title: "Driver on the way! 🚗", message: `${req.user.name} accepted your ride and is heading to your pickup.`, link: { tab: "requestRide" } });
        if (io) io.emit("personal_ride:update", { at: Date.now() });

        res.status(200).json(driverView(await populated(claimed._id)));
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* ============== Driver: decline ============== */
exports.decline = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        await PersonalRideRequest.updateOne({ _id: id, status: "SEARCHING" }, { $addToSet: { declinedDriverIds: req.user._id } });
        res.status(200).json({ message: "Declined" });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* ============== Driver: reached pickup → generate OTP ============== */
exports.reachedPickup = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const doc = await PersonalRideRequest.findById(id);
        if (!doc) return res.status(404).json({ message: "Not found" });
        if (idStr(doc.driver_id) !== idStr(req.user._id)) return res.status(403).json({ message: "Not your ride" });
        if (doc.status !== "DRIVER_ASSIGNED") return res.status(400).json({ message: "Ride is not in the right state." });

        const code = String(Math.floor(100000 + Math.random() * 900000));
        doc.otp = { code, expiresAt: new Date(Date.now() + config.otpExpiryMin() * 60 * 1000), attempts: 0, verifiedAt: null };
        doc.reachedPickupAt = new Date();
        doc.tracking.state = "arrived";
        await doc.save();

        const io = io_(req); const users = users_(req);
        // Passenger sees the OTP (in-app + socket); the driver must type it in.
        emitToUser(io, users, doc.passenger_id, "otp_generated", { id: idStr(doc._id), otp: code });
        await createNotification({ io, users, userId: doc.passenger_id, type: "ride", title: "Your driver has arrived", message: `Share OTP ${code} with your driver to start the ride.`, link: { tab: "requestRide" } });
        emitToUser(io, users, doc.driver_id, "otp_generated", { id: idStr(doc._id) });

        res.status(200).json(driverView(await populated(doc._id)));
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* ============== Driver: verify OTP → start ride ============== */
exports.verifyOtp = async (req, res) => {
    try {
        const { id } = req.params;
        const { code } = req.body || {};
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const doc = await PersonalRideRequest.findById(id);
        if (!doc) return res.status(404).json({ message: "Not found" });
        if (idStr(doc.driver_id) !== idStr(req.user._id)) return res.status(403).json({ message: "Not your ride" });
        if (doc.status !== "DRIVER_ASSIGNED") return res.status(400).json({ message: "Ride is not in the right state." });
        if (!doc.otp?.code) return res.status(400).json({ message: "Tap 'Reached Pickup' to generate the OTP first." });
        if (doc.otp.expiresAt && doc.otp.expiresAt < new Date()) return res.status(400).json({ message: "OTP expired. Regenerate it." });
        if (doc.otp.attempts >= 5) return res.status(429).json({ message: "Too many attempts. Regenerate the OTP." });

        if (String(code).trim() !== doc.otp.code) {
            doc.otp.attempts += 1;
            await doc.save();
            return res.status(400).json({ message: "Incorrect OTP." });
        }

        doc.otp.verifiedAt = new Date();
        doc.status = "RIDE_STARTED";
        doc.startedAt = new Date();
        doc.tracking.state = "in_progress";
        await doc.save();

        const io = io_(req); const users = users_(req);
        emitToUser(io, users, doc.passenger_id, "otp_verified", { id: idStr(doc._id) });
        emitToUser(io, users, doc.passenger_id, "ride_started", { id: idStr(doc._id) });
        emitToUser(io, users, doc.driver_id, "ride_started", { id: idStr(doc._id) });
        await createNotification({ io, users, userId: doc.passenger_id, type: "ride", title: "Ride started", message: "Your ride is underway. Live tracking and safety tools are on.", link: { tab: "requestRide" } });
        if (io) io.emit("personal_ride:update", { at: Date.now() });

        res.status(200).json(driverView(await populated(doc._id)));
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* ============== Driver: live location ============== */
exports.updateLocation = async (req, res) => {
    try {
        const { id } = req.params;
        const { lat, lng } = req.body || {};
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const nlat = Number(lat), nlng = Number(lng);
        if (!Number.isFinite(nlat) || !Number.isFinite(nlng)) {
            return res.status(400).json({ message: "Valid coordinates required" });
        }
        const doc = await PersonalRideRequest.findById(id);
        if (!doc) return res.status(404).json({ message: "Not found" });
        if (idStr(doc.driver_id) !== idStr(req.user._id)) return res.status(403).json({ message: "Not your ride" });
        if (!["DRIVER_ASSIGNED", "RIDE_STARTED"].includes(doc.status)) {
            return res.status(400).json({ message: "Ride is not active." });
        }
        doc.tracking = doc.tracking || {};
        // Accumulate the real travelled distance (GPS) while the ride is in
        // progress, so the final fare bills the actual route rather than the
        // straight-line estimate. Ignore implausible GPS jumps.
        const prev = doc.tracking.driverLocation;
        if (doc.status === "RIDE_STARTED" && prev && prev.lat != null && prev.lng != null) {
            const seg = haversineKm({ lat: prev.lat, lng: prev.lng }, { lat: nlat, lng: nlng });
            if (Number.isFinite(seg) && seg > 0 && seg < 50) {
                doc.tracking.distanceKm = Number(((doc.tracking.distanceKm || 0) + seg).toFixed(3));
            }
        }
        doc.tracking.driverLocation = { lat: nlat, lng: nlng, updatedAt: new Date() };
        await doc.save();
        const io = io_(req); const users = users_(req);
        emitToUser(io, users, doc.passenger_id, "driver_location", { id: idStr(doc._id), lat: nlat, lng: nlng });
        res.status(200).json({ ok: true });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* ============== Driver: complete ride ============== */
exports.complete = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const doc = await PersonalRideRequest.findById(id);
        if (!doc) return res.status(404).json({ message: "Not found" });
        if (idStr(doc.driver_id) !== idStr(req.user._id)) return res.status(403).json({ message: "Not your ride" });
        if (doc.status !== "RIDE_STARTED") return res.status(400).json({ message: "Ride is not in progress." });

        // Final fare = recomputed from the ACTUAL travelled distance when we have
        // it (GPS-accumulated), falling back to the straight-line estimate for
        // rides with no location stream. Server-authoritative either way.
        const billedKm = (doc.tracking?.distanceKm && doc.tracking.distanceKm > 0)
            ? doc.tracking.distanceKm
            : doc.distanceKm;
        const finalFare = computeFare(doc.vehicleType, billedKm);
        const { commission, netEarnings } = splitFare(finalFare);
        doc.finalFare = finalFare;
        doc.commission = commission;
        doc.driverEarnings = netEarnings;
        doc.status = "RIDE_COMPLETED";
        doc.completedAt = new Date();
        doc.tracking.state = "completed";
        await doc.save();

        const io = io_(req); const users = users_(req);
        emitToUser(io, users, doc.passenger_id, "ride_completed", { id: idStr(doc._id), fare: finalFare });
        emitToUser(io, users, doc.driver_id, "ride_completed", { id: idStr(doc._id), earnings: netEarnings });
        await createNotification({ io, users, userId: doc.passenger_id, type: "ride", title: "Ride completed", message: `Your trip is complete. Pay ₹${finalFare} via UPI to finish.`, link: { tab: "requestRide" } });
        if (io) io.emit("personal_ride:update", { at: Date.now() });

        res.status(200).json(driverView(await populated(doc._id)));
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* ============== Passenger: pay (UPI to RidexShare) → ledger ============== */
exports.confirmPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { razorpayPaymentId } = req.body || {};
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const doc = await PersonalRideRequest.findById(id);
        if (!doc) return res.status(404).json({ message: "Not found" });
        if (idStr(doc.passenger_id) !== idStr(req.user._id)) return res.status(403).json({ message: "Not your ride" });
        if (doc.status !== "RIDE_COMPLETED") return res.status(400).json({ message: "Ride isn't ready for payment yet." });
        if (doc.payment.status === "received") return res.status(200).json(await populated(doc._id));

        // Server-side payment verification. When a real Razorpay gateway is
        // configured, confirm the payment actually happened (captured + correct
        // amount) BEFORE crediting the driver ledger — otherwise a passenger
        // could mark a completed ride "paid" for free and trigger a real payout.
        // With no gateway configured (manual/dev UPI), the existing flow is kept.
        const { isRazorpayConfigured, getRazorpay } = require("../config/razorpay");
        if (isRazorpayConfigured()) {
            const pid = String(razorpayPaymentId || "");
            if (!/^pay_/.test(pid)) {
                return res.status(400).json({ message: "A valid payment reference is required." });
            }
            try {
                const pay = await getRazorpay().payments.fetch(pid);
                const expectedPaise = Math.round((doc.finalFare || 0) * 100);
                const okStatus = pay && (pay.status === "captured" || pay.status === "authorized");
                if (!okStatus || Number(pay.amount) !== expectedPaise) {
                    return res.status(400).json({ message: "Payment could not be verified. Contact support if you were charged." });
                }
            } catch (e) {
                return res.status(400).json({ message: "Payment verification failed.", error: e?.error?.description || e.message });
            }
        }

        doc.payment.status = "received";
        doc.payment.paidAt = new Date();
        if (razorpayPaymentId) doc.payment.razorpayPaymentId = String(razorpayPaymentId).slice(0, 120);
        doc.status = "PAYMENT_RECEIVED";

        // Ledger entry (idempotent — one per ride).
        let ledger = await DriverLedger.findOne({ ride_id: doc._id });
        if (!ledger) {
            ledger = await DriverLedger.create({
                driver_id: doc.driver_id,
                ride_id: doc._id,
                grossAmount: doc.finalFare,
                commission: doc.commission,
                netEarnings: doc.driverEarnings,
                status: "pending",
            });
        }
        doc.ledger_id = ledger._id;
        await doc.save();

        const io = io_(req); const users = users_(req);
        emitToUser(io, users, doc.driver_id, "payment_received", { id: idStr(doc._id), earnings: doc.driverEarnings });
        await createNotification({ io, users, userId: doc.driver_id, type: "system", title: "Payment received 💰", message: `₹${doc.driverEarnings} added to your ledger for the trip to ${doc.destination?.address}. Paid out in the weekly settlement.`, link: { tab: "earnings" } });
        await createNotification({ io, users, userId: doc.passenger_id, type: "system", title: "Payment successful", message: `₹${doc.finalFare} paid for your ride. Thanks for riding with RidexShare!`, link: { tab: "requestRide" } });
        if (io) io.emit("personal_ride:update", { at: Date.now() });

        res.status(200).json(await populated(doc._id));
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* ============== Driver: my ledger / earnings ============== */
exports.myLedger = async (req, res) => {
    try {
        const entries = await DriverLedger.find({ driver_id: req.user._id })
            .sort({ createdAt: -1 }).limit(100)
            .populate("ride_id", "destination pickup finalFare completedAt").lean();
        const agg = entries.reduce((a, e) => {
            // Exclude permanently-failed payouts from lifetime earnings so that
            // total === pending + settled (a failed entry is neither).
            if (e.status !== "failed") a.total += e.netEarnings;
            if (e.status === "pending" || e.status === "processing") a.pending += e.netEarnings;
            if (e.status === "settled") a.settled += e.netEarnings;
            return a;
        }, { total: 0, pending: 0, settled: 0 });
        res.status(200).json({ entries, summary: agg });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

module.exports.idStr = idStr;

// =======================================================
// Admin + Settlement engine
// =======================================================
const Settlement = require("../models/Settlement");
const { getRazorpay } = require("../config/razorpay");
const { writeAudit } = require("../middleware/adminMiddleware");

const ACTIVE_STATUSES = ["SEARCHING", "DRIVER_ASSIGNED", "RIDE_STARTED", "RIDE_COMPLETED"];

function pagize(req) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    return { page, limit, skip: (page - 1) * limit };
}

/* ---------- Admin: personalized rides ---------- */
exports.adminList = async (req, res) => {
    try {
        const { page, limit, skip } = pagize(req);
        const filter = {};
        if (req.query.status && req.query.status !== "All") filter.status = req.query.status;
        if (req.query.q) {
            const rx = new RegExp(String(req.query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            filter.$or = [{ passengerName: rx }, { driverName: rx }, { "destination.address": rx }, { "pickup.address": rx }];
        }
        const [items, total, searching, assigned, started, completed, paid, cancelled, expired] = await Promise.all([
            PersonalRideRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
                .populate("passenger_id", "name email").populate("driver_id", "name email").lean(),
            PersonalRideRequest.countDocuments(filter),
            PersonalRideRequest.countDocuments({ status: "SEARCHING" }),
            PersonalRideRequest.countDocuments({ status: "DRIVER_ASSIGNED" }),
            PersonalRideRequest.countDocuments({ status: "RIDE_STARTED" }),
            PersonalRideRequest.countDocuments({ status: { $in: ["RIDE_COMPLETED", "PAYMENT_RECEIVED"] } }),
            PersonalRideRequest.countDocuments({ status: "PAYMENT_RECEIVED" }),
            PersonalRideRequest.countDocuments({ status: "CANCELLED" }),
            PersonalRideRequest.countDocuments({ status: { $in: ["EXPIRED", "NO_DRIVERS"] } }),
        ]);
        res.status(200).json({
            items, meta: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
            stats: { active: searching + assigned + started, assigned, started, completed, paid, cancelled, failed: expired },
        });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* ---------- Admin: driver ledger ---------- */
exports.adminLedger = async (req, res) => {
    try {
        const { page, limit, skip } = pagize(req);
        const filter = {};
        if (req.query.status && req.query.status !== "All") filter.status = req.query.status;
        const [items, total, pendingAgg, settledAgg, commissionAgg] = await Promise.all([
            DriverLedger.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
                .populate("driver_id", "name email").populate("ride_id", "destination finalFare").lean(),
            DriverLedger.countDocuments(filter),
            DriverLedger.aggregate([{ $match: { status: { $in: ["pending", "processing"] } } }, { $group: { _id: null, t: { $sum: "$netEarnings" } } }]),
            DriverLedger.aggregate([{ $match: { status: "settled" } }, { $group: { _id: null, t: { $sum: "$netEarnings" } } }]),
            DriverLedger.aggregate([{ $group: { _id: null, t: { $sum: "$commission" } } }]),
        ]);
        res.status(200).json({
            items, meta: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
            stats: { pendingSettlement: pendingAgg[0]?.t || 0, settled: settledAgg[0]?.t || 0, totalCommission: commissionAgg[0]?.t || 0 },
        });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* ---------- Admin: settlements ---------- */
exports.adminSettlements = async (req, res) => {
    try {
        const { page, limit, skip } = pagize(req);
        const filter = {};
        if (req.query.status && req.query.status !== "All") filter.status = req.query.status;
        const [items, total] = await Promise.all([
            Settlement.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("driver_id", "name email").lean(),
            Settlement.countDocuments(filter),
        ]);
        res.status(200).json({ items, meta: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* ---------- Admin: settlement dashboard metrics ---------- */
exports.adminDashboard = async (req, res) => {
    try {
        const [revenueAgg, earningsAgg, pendingAgg, completedAgg] = await Promise.all([
            PersonalRideRequest.aggregate([{ $match: { status: "PAYMENT_RECEIVED" } }, { $group: { _id: null, t: { $sum: "$finalFare" } } }]),
            DriverLedger.aggregate([{ $group: { _id: null, t: { $sum: "$netEarnings" } } }]),
            Settlement.aggregate([{ $match: { status: { $in: ["pending", "processing", "failed"] } } }, { $group: { _id: null, t: { $sum: "$totalNet" } } }]),
            Settlement.aggregate([{ $match: { status: "settled" } }, { $group: { _id: null, t: { $sum: "$totalNet" } } }]),
        ]);
        const pendingLedger = await DriverLedger.aggregate([{ $match: { status: { $in: ["pending", "processing"] } } }, { $group: { _id: null, t: { $sum: "$netEarnings" } } }]);
        res.status(200).json({
            totalRevenue: revenueAgg[0]?.t || 0,
            totalDriverEarnings: earningsAgg[0]?.t || 0,
            pendingPayouts: pendingAgg[0]?.t || 0,
            completedPayouts: completedAgg[0]?.t || 0,
            weeklyPending: pendingLedger[0]?.t || 0,
        });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Friday batch id helper: "WK-YYYY-MM-DD".
function batchIdFor(date = new Date()) {
    const d = date.toISOString().slice(0, 10);
    return `WK-${d}`;
}

/**
 * Weekly settlement engine. Groups all `pending` ledger entries per driver into
 * a Settlement, attempts a Razorpay payout (only when RAZORPAY_PAYOUTS_ENABLED
 * is set + the driver has a UPI id), and marks entries settled on success. When
 * real payouts aren't enabled the settlement is recorded as settled with a
 * SIMULATED ref so the ledger flow completes end-to-end in dev/demo.
 *
 * @returns {Promise<{settlements:number, paidNet:number}>}
 */
async function runWeeklySettlement({ io, users } = {}) {
    const pending = await DriverLedger.find({ status: "pending" }).lean();
    if (pending.length === 0) return { settlements: 0, paidNet: 0 };

    // Group by driver.
    const byDriver = new Map();
    for (const e of pending) {
        const k = idStr(e.driver_id);
        if (!byDriver.has(k)) byDriver.set(k, []);
        byDriver.get(k).push(e);
    }

    const batchId = batchIdFor();
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - 7 * 86400000);
    const payoutsEnabled = process.env.RAZORPAY_PAYOUTS_ENABLED === "true";
    const rzp = getRazorpay();
    let made = 0, paidNet = 0;

    for (const [driverId, entries] of byDriver.entries()) {
        const candidateIds = entries.map((e) => e._id);
        // Atomically CLAIM only still-pending entries. Under concurrent runs (or
        // a restart on Friday), the second run claims nothing and skips, so a
        // driver can never be settled/paid twice for the same ledger entries.
        const claim = await DriverLedger.updateMany(
            { _id: { $in: candidateIds }, status: "pending" },
            { $set: { status: "processing" } }
        );
        if (!claim.modifiedCount) continue;
        const claimed = await DriverLedger.find({ _id: { $in: candidateIds }, status: "processing", settlement_id: null }).lean();
        if (!claimed.length) continue;

        const ids = claimed.map((e) => e._id);
        const totalNet = claimed.reduce((s, e) => s + e.netEarnings, 0);
        const totalGross = claimed.reduce((s, e) => s + e.grossAmount, 0);
        const totalCommission = claimed.reduce((s, e) => s + e.commission, 0);
        const driver = await User.findById(driverId).select("name payoutDetails").lean();
        const upiId = driver?.payoutDetails?.upiId || "";

        // Create the settlement record for the claimed entries.
        const settlement = await Settlement.create({
            driver_id: driverId, batchId, periodStart, periodEnd,
            rideCount: claimed.length, totalGross, totalCommission, totalNet,
            ledgerEntryIds: ids, upiId, status: "processing",
        });
        await DriverLedger.updateMany({ _id: { $in: ids } }, { $set: { settlement_id: settlement._id } });

        // Attempt payout.
        let ok = false, ref = "", reason = "";
        if (payoutsEnabled && rzp && upiId) {
            try {
                const payout = await rzp.payouts.create({
                    account_number: process.env.RAZORPAY_PAYOUT_ACCOUNT,
                    amount: Math.round(totalNet * 100), currency: "INR", mode: "UPI",
                    purpose: "payout", fund_account: { account_type: "vpa", vpa: { address: upiId } },
                    queue_if_low_balance: true,
                    reference_id: `stl_${settlement._id}`, // idempotency: a retried call won't double-pay
                    notes: { batchId, driverId },
                });
                ok = true; ref = payout?.id || "";
            } catch (e) {
                reason = e?.error?.description || e?.message || "Payout failed";
            }
        } else if (!payoutsEnabled) {
            // Dev/demo: simulate a successful payout so the flow completes.
            ok = true; ref = "SIMULATED";
        } else {
            reason = upiId ? "Payouts not configured" : "Driver has no UPI id on file";
        }

        settlement.status = ok ? "settled" : "failed";
        settlement.payoutRef = ref;
        settlement.failureReason = reason;
        settlement.processedAt = new Date();
        await settlement.save();
        await DriverLedger.updateMany({ _id: { $in: ids } }, { $set: { status: ok ? "settled" : "failed" } });

        if (ok) {
            made += 1; paidNet += totalNet;
            try {
                await createNotification({ io, users, userId: driverId, type: "system", title: "Earnings settled 🎉", message: `₹${totalNet} for ${claimed.length} ride(s) has been settled to your UPI.`, link: { tab: "earnings" } });
            } catch { /* ignore */ }
            if (io) io.to(idStr(driverId)).emit("settlement_completed", { settlementId: idStr(settlement._id), amount: totalNet });
        }
    }
    if (made > 0) console.log(`[settlement] ${made} driver settlement(s), ₹${paidNet} net paid.`);
    return { settlements: made, paidNet };
}
exports.runWeeklySettlement = runWeeklySettlement;

// Retry settlements that failed their payout (background job / admin).
async function retryFailedPayouts({ io, users } = {}) {
    const failed = await Settlement.find({ status: "failed", retries: { $lt: 5 } });
    let retried = 0;
    const payoutsEnabled = process.env.RAZORPAY_PAYOUTS_ENABLED === "true";
    const rzp = getRazorpay();
    for (const s of failed) {
        s.retries += 1;
        let ok = false, ref = "", reason = "";
        if (payoutsEnabled && rzp && s.upiId) {
            try {
                const payout = await rzp.payouts.create({
                    account_number: process.env.RAZORPAY_PAYOUT_ACCOUNT,
                    amount: Math.round(s.totalNet * 100), currency: "INR", mode: "UPI",
                    purpose: "payout", fund_account: { account_type: "vpa", vpa: { address: s.upiId } },
                    queue_if_low_balance: true,
                    reference_id: `stl_${s._id}`, // idempotency across retries
                    notes: { batchId: s.batchId, retry: s.retries },
                });
                ok = true; ref = payout?.id || "";
            } catch (e) { reason = e?.error?.description || e?.message || "Payout failed"; }
        } else if (!payoutsEnabled) { ok = true; ref = "SIMULATED"; }
        else { reason = "Payouts not configured / no UPI"; }

        s.status = ok ? "settled" : "failed";
        s.payoutRef = ref; s.failureReason = reason; s.processedAt = new Date();
        await s.save();
        await DriverLedger.updateMany({ _id: { $in: s.ledgerEntryIds } }, { $set: { status: ok ? "settled" : "failed" } });
        if (ok) {
            retried += 1;
            try { await createNotification({ io, users, userId: s.driver_id, type: "system", title: "Earnings settled", message: `₹${s.totalNet} has been settled to your UPI.`, link: { tab: "earnings" } }); } catch { /* */ }
        }
    }
    if (retried > 0) console.log(`[settlement] retried ${retried} failed payout(s).`);
    return { retried };
}
exports.retryFailedPayouts = retryFailedPayouts;

// Admin: trigger the weekly settlement now.
exports.adminRunSettlement = async (req, res) => {
    try {
        const result = await runWeeklySettlement({ io: io_(req), users: users_(req) });
        await writeAudit(req, "settlement.run", { targetType: "settlement", details: result });
        res.status(200).json({ message: `Settlement run complete: ${result.settlements} driver(s), ₹${result.paidNet} net.`, ...result });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};
