// Contact-privacy masking for rides.
//
// Phone numbers are only shared between CONFIRMED counterparts:
//   - the ride's driver (ride.user_id) may see the numbers of booked passengers
//   - a booked passenger (in ride.passengers[]) may see the driver's number
//   - every user always sees their OWN number
//   - everyone else (people browsing rides, co-passengers) is masked
//
// Masked = phoneNumber set to null + `contactLocked: true` so the UI can show a
// "unlocks after booking" hint. Numbers are never revealed on Cancelled rides.
//
// Applied at the response layer (on lean() ride objects) so no query logic
// changes and nothing can leak by accident. Safety/SOS and admin paths do NOT
// use this — they must keep real numbers.

function idStr(v) {
    if (!v) return "";
    if (typeof v === "object") return String(v._id || v.id || v);
    return String(v);
}

// Mutates and returns a single (lean) ride object with contacts masked for `viewerId`.
function maskRideContacts(ride, viewerId) {
    if (!ride || typeof ride !== "object") return ride;

    const viewer = idStr(viewerId);
    const driverId = idStr(ride.user_id && (ride.user_id._id || ride.user_id));
    const passengers = Array.isArray(ride.passengers) ? ride.passengers : [];
    const bookedIds = new Set(
        passengers.map((p) => idStr(p.user_id && (p.user_id._id || p.user_id))).filter(Boolean)
    );

    const viewerIsDriver = Boolean(viewer) && viewer === driverId;
    const viewerIsBookedPassenger = Boolean(viewer) && bookedIds.has(viewer);
    const active = ride.status !== "Cancelled";

    // Mask a populated user object unless the viewer is allowed to see it (or it's
    // the viewer's own record).
    const applyToUser = (userObj, revealAllowed) => {
        if (!userObj || typeof userObj !== "object") return;
        const isSelf = Boolean(viewer) && idStr(userObj._id || userObj.id) === viewer;
        if (isSelf) return;
        if (!(revealAllowed && active)) {
            if ("phoneNumber" in userObj) userObj.phoneNumber = null;
            userObj.contactLocked = true;
        }
    };

    // Driver's number → only to booked passengers (driver sees own via isSelf).
    applyToUser(ride.user_id, viewerIsBookedPassenger);
    // Passengers' numbers → only to the driver (each passenger sees own via isSelf).
    passengers.forEach((p) => applyToUser(p.user_id, viewerIsDriver));

    return ride;
}

// Convenience for arrays of rides.
function maskRidesContacts(rides, viewerId) {
    if (!Array.isArray(rides)) return rides;
    rides.forEach((r) => maskRideContacts(r, viewerId));
    return rides;
}

module.exports = { maskRideContacts, maskRidesContacts };
