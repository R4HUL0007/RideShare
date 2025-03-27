const Ride = require("../models/Ride");
const User = require("../models/User");
const { io, users} = require("../server"); // Import Socket.io instance
const Notification = require("../models/Notification"); 


// ✅ 1. Create a Ride (Host Offers a Ride)
exports.createRide = async (req, res) => {
    const { destination, timing, gender_preference } = req.body;
    const userId = req.user.id; // Get logged-in user's ID

    try {
        // Fetch the logged-in user's role
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Ensure gender_preference is valid
        const validGenders = ["Male", "Female"];
        if (!validGenders.includes(gender_preference)) {
            return res.status(400).json({ message: "Invalid gender preference" });
        }

        // Create a new ride
        const ride = await Ride.create({
            user_id: userId,
            role: user.role, // Match role (student/faculty)
            gender_preference,
            destination,
            timing,
            status: "Available",
        });

        // 🔥 Notify users with matching filters
        const matchingUsers = await User.find({
            role: user.role, // Only notify users of the same role (student/faculty)
        });

        for (const matchedUser of matchingUsers) {
            const notificationMessage = `New ride to ${destination} available!`;

            // Save in DB
            await Notification.create({
                user_id: matchedUser._id,
                message: notificationMessage,
                ride_id: ride._id,
            });

            // Send real-time notification only if user is online
            if (users[matchedUser._id]) {
                io.to(users[matchedUser._id]).emit("notification", notificationMessage);
            }
        }

        
        res.status(201).json(ride);
    } catch (error) {
        console.error("Error in createRide:", error);
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};


// ✅ 2. Find Matching Rides (Rider Looking for a Ride)
exports.findRides = async (req, res) => {
    const { destination, gender_preference } = req.query;
    const userId = req.user.id; // Get logged-in user

    try {
        // Fetch the logged-in user's role
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Build the query with filters
        let query = {
            destination: destination,
            role: user.role, // Match students with students, faculty with faculty
            status: "Available"
        };

        // Apply gender preference filter only if provided and not 'Any'
        if (gender_preference && gender_preference !== "Any") {
            query.gender_preference = gender_preference;
        }

        // Find rides that match criteria
        const rides = await Ride.find(query);
        if (rides.length === 0) {
            return res.status(404).json({ message: "No rides found matching the criteria" });
        }

        res.status(200).json(rides);
    } catch (error) {
        console.error("Error in findRides:", error);
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ Book a Ride
exports.bookRide = async (req, res) => {
    const { rideId } = req.params;
    const userId = req.user.id;

    try {
        // Check if ride exists
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });

        // Check if seats are available
        if (ride.seatsAvailable <= 0) {
            return res.status(400).json({ message: "No seats available" });
        }

        // Check if user is already booked
        if (ride.passengers.includes(userId)) {
            return res.status(400).json({ message: "You have already booked this ride" });
        }

        // Add user to passengers & reduce seat count
        ride.passengers.push(userId);
        ride.seatsAvailable -= 1;

        // Update status if full
        if (ride.seatsAvailable === 0) {
            ride.status = "Booked";
        }

        await ride.save();

        // Notify ride owner
        const driver = await User.findById(ride.user_id);
        const message = `${req.user.name} booked a seat in your ride to ${ride.destination}`;

        await Notification.create({ user_id: driver._id, message, ride_id: ride._id });

        if (users[driver._id]) {
            io.to(users[driver._id]).emit("notification", message);
        }

        res.status(200).json({ message: "Ride booked successfully", ride });

    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// ✅ Cancel Ride Booking
exports.cancelRide = async (req, res) => {
    const { rideId } = req.params;
    const userId = req.user.id;

    try {
        // Find ride
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });

        // Check if user is a passenger
        if (!ride.passengers.includes(userId)) {
            return res.status(400).json({ message: "You are not booked in this ride" });
        }

        // Remove user from passengers & increase seat count
        ride.passengers = ride.passengers.filter(passenger => passenger.toString() !== userId);
        ride.seatsAvailable += 1;

        // Update ride status
        if (ride.status === "Booked") {
            ride.status = "Available";
        }

        await ride.save();

        // Notify ride owner
        const driver = await User.findById(ride.user_id);
        const message = `${req.user.name} canceled their ride to ${ride.destination}`;

        await Notification.create({ user_id: driver._id, message, ride_id: ride._id });

        if (users[driver._id]) {
            io.to(users[driver._id]).emit("notification", message);
        }

        res.status(200).json({ message: "Ride booking canceled successfully", ride });

    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// ✅ Complete a Ride
// ✅ Complete a Ride
exports.completeRide = async (req, res) => {
    const { rideId } = req.params;
    const userId = req.user.id; // Logged-in user ID

    try {
        // Find the ride
        const ride = await Ride.findById(rideId);
        if (!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        // Ensure only the host can mark the ride as completed
        if (ride.user_id.toString() !== userId) {
            return res.status(403).json({ message: "Unauthorized: You can only complete your own rides" });
        }

        // Update ride status
        ride.status = "Completed";
        await ride.save();

        // 🔥 Notify the rider and passengers
        const notificationMessage = `Your ride to ${ride.destination} has been completed.`;

        // Save notification in DB for all users who booked the ride
        await Notification.create({
            user_id: ride.user_id,  // The ride host
            message: notificationMessage,
            ride_id: ride._id
        });

        // Send WebSocket notification to the host
        if (users[ride.user_id]) {
            io.to(users[ride.user_id]).emit("notification", notificationMessage);
        }

        res.status(200).json({ message: "Ride marked as completed", ride });
    } catch (error) {
        console.error("Error in completeRide:", error);
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ Get Rides by History
exports.getRideHistory = async (req, res) => {
    const userId = req.user.id; // Get logged-in user

    try {
        const rides = await Ride.find({
            $or: [{ user_id: userId }, { passengers: userId }],
            status: "Completed"
        }).sort({ updatedAt: -1 });

        if (rides.length === 0) {
            return res.status(404).json({ message: "No past rides found" });
        }

        res.status(200).json(rides);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// ✅ Get Rides Created by User
exports.getUserRides = async (req, res) => {
    const userId = req.user.id; // Logged-in user's ID

    try {
        const rides = await Ride.find({ user_id: userId }).sort({ createdAt: -1 });

        if (rides.length === 0) {
            return res.status(404).json({ message: "No rides created yet." });
        }

        res.status(200).json(rides);
    } catch (error) {
        console.error("Error in getUserRides:", error);
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ Delete a Ride
exports.deleteRide = async (req, res) => {
    const { rideId } = req.params;
    const userId = req.user.id;

    try {
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });

        // Ensure only the ride creator can delete the ride
        if (ride.user_id.toString() !== userId) {
            return res.status(403).json({ message: "Unauthorized: You can only delete your own rides" });
        }

        await Ride.findByIdAndDelete(rideId);

        res.status(200).json({ message: "Ride deleted successfully" });
    } catch (error) {
        console.error("❌ Error in deleteRide:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
