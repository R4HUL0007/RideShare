const jwt = require("jsonwebtoken");

const generateToken = (user) => {
    return jwt.sign(
        {
            id: user._id,       // ✅ User ID
            name: user.name,     // ✅ Include Name
            email: user.email    // ✅ Include Email
        },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }     // Token expiration time
    );
};

module.exports = generateToken;
