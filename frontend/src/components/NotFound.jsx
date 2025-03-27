import React from "react";
import { Link } from "react-router-dom";

const NotFound = () => {
    return (
        <div style={{ textAlign: "center", marginTop: "20vh" }}>
            <h1>404 - Page Not Found</h1>
            <p>Oops! The page you're looking for doesn't exist.</p>
            <Link to="/" style={{ color: "#0078ff", textDecoration: "none" }}>
                Return to Homepage
            </Link>
        </div>
    );
};

export default NotFound;
