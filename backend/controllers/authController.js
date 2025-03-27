const bcrypt = require("bcryptjs");
const User = require("../models/User");
const generateToken = require("../config/jwt");

exports.registerUser = async (req, res) => {
    const { name, email, password, role, gender } = req.body;

    try {
        console.log("Checking if user exists...");
        const userExists = await User.findOne({ email });

        if (userExists) {
            console.log("User already exists");
            return res.status(400).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({ name, email, password: hashedPassword, role, gender });

        res.status(201).json({
            _id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user),  // ✅ Updated to pass the whole user object
        });
    } catch (error) {
        console.error("Error in registerUser:", error);

        if (error.name === "ValidationError") {
            const errorMessage = Object.values(error.errors).map((err) => err.message).join(", ");
            return res.status(400).json({ message: errorMessage });
        }

        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.loginUser = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: "Invalid credentials" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

        res.json({
            _id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user),  // ✅ Updated to pass the whole user object
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};
