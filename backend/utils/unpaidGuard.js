// =======================================================
// Unified "unpaid completed ride" guard.
// -------------------------------------------------------
// In the pay-after-completion model a passenger could finish a ride and never
// pay. To deter this, a passenger who has ANY completed-but-unpaid ride (shared
// OR personalized) is blocked from booking/requesting a new one until they pay.
// Pure-ish: queries the DB but holds no state; safe to call from any booking
// entry point.
// =======================================================

const Ride = require("../models/Ride");
const PersonalRideRequest = require("../models/PersonalRideRequest");

/**
 * Find the user's oldest completed-but-unpaid ride across both products.
 * @returns {Promise<null | { type:'shared'|'personal', rideId:string, amount:number, destination:string }>}
 */
async function findUnpaidCompletedRide(userId) {
    // Shared: a Completed ride where this user is a passenger, owes a fare
    // (fareAmount > 0), and hasn't paid yet.
    const shared = await Ride.findOne({
        status: "Completed",
        passengers: {
            $elemMatch: {
                user_id: userId,
                paymentStatus: "unpaid",
                fareAmount: { $gt: 0 },
            },
        },
    }).select("destination passengers").lean();

    if (shared) {
        const p = (shared.passengers || []).find(
            (x) => String(x.user_id) === String(userId) && x.paymentStatus === "unpaid" && (x.fareAmount || 0) > 0
        );
        return {
            type: "shared",
            rideId: String(shared._id),
            amount: p ? p.fareAmount : 0,
            destination: shared.destination || "",
        };
    }

    // Personal: completed but payment not yet received, with a positive fare.
    const personal = await PersonalRideRequest.findOne({
        passenger_id: userId,
        status: "RIDE_COMPLETED",
        finalFare: { $gt: 0 },
        "payment.status": { $ne: "received" },
    }).select("destination finalFare").lean();

    if (personal) {
        return {
            type: "personal",
            rideId: String(personal._id),
            amount: personal.finalFare || 0,
            destination: personal.destination?.address || "",
        };
    }

    return null;
}

module.exports = { findUnpaidCompletedRide };
