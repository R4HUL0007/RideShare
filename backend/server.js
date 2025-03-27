const express = require("express");
const http = require("http");  // Required for Socket.io
const dotenv = require("dotenv");
const socketIo = require("socket.io");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const rideRoutes = require("./routes/rideRoutes");
dotenv.config();
connectDB();

const app = express();
app.use(express.json());
app.use(cors());

// app.use("/api/payment", require("./routes/paymentRoutes"));

const server = http.createServer(app);  // Create an HTTP server
const io = socketIo(server, {
    cors: { origin: "*" },
});

// Store connected users
const users = {};

io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);

    // Store user ID when they join
    socket.on("join", (userId) => {
        users[userId] = socket.id;
    });

    // Notify when a new ride is created
    socket.on("rideCreated", (data) => {
        io.emit("rideCreated", data);
    });
        
    // Notify when a ride is booked
    socket.on("rideBooked", (data) => {
        io.emit("rideBooked", data);
    });
        
    // Notify when a ride is canceled
    socket.on("rideCanceled", (data) => {
        io.emit("rideCanceled", data);
    });
        
    // Notify when a ride is completed
    socket.on("rideCompleted", (data) => {
        io.emit("rideCompleted", data);
    });

    // Send notifications
    socket.on("notify", ({ receiverId, message }) => {
        const receiverSocket = users[receiverId];
        if (!receiverSocket) {
            console.log(`User ${receiverId} is not connected.`);
            return;
        }
        io.to(receiverSocket).emit("notification", message);
     });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
         // Remove user from list when they disconnect
         Object.keys(users).forEach((key) => {
            if (users[key] === socket.id) delete users[key];
        });
    });
});


module.exports = { io,users };
app.use("/api/auth", authRoutes);
app.use("/api/rides", rideRoutes);
app.use("/api/rides", require("./routes/rideRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));



const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
