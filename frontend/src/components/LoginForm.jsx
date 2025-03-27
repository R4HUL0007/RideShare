import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { loginUser } from "../services/authService";

const LoginForm = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const response = await loginUser({ email, password });
            console.log("✅ Login Response Structure:", response);

            const token = response?.token || response?.data?.token; // Handle both cases
            if (!token) throw new Error("Token missing in response");

            // Save token
            localStorage.setItem("token", token);
            console.log("✅ Token Saved Successfully");

            toast.success("Login successful!");
            navigate("/dashboard"); // Redirect to Dashboard
        } catch (error) {
            console.error("❌ Login Error:", error);
            toast.error(error.response?.data?.message || "Login failed. Please try again.");
        }
    };

    return (
        <form onSubmit={handleLogin}>
            <h2>Login</h2>
            <div>
                <label>Email</label>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                />
            </div>
            <div>
                <label>Password</label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
            </div>
            <button type="submit">Login</button>
        </form>
    );
};

export default LoginForm;
