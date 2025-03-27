import React from "react";
import NotFound from "../components/NotFound"; // Optional: Add a 404 page
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Home from '../components/Home';
import Dashboard from '../pages/Dashboard';

const AppRouter = () => (
    <Router>
        <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="*" element={<h1>404 - Page Not Found</h1>} />
        </Routes>
    </Router>
);

export default AppRouter;
