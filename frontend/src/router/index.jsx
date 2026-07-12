import React, { lazy, Suspense } from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';

const Home = lazy(() => import('../components/Home'));
const Dashboard = lazy(() => import('../pages/Dashboard'));
const AdminPanel = lazy(() => import('../pages/AdminPanel'));
const SharedTrip = lazy(() => import('../pages/SharedTrip'));
const About = lazy(() => import('../pages/About'));
const Privacy = lazy(() => import('../pages/Privacy'));
const Terms = lazy(() => import('../pages/Terms'));
const Feedback = lazy(() => import('../pages/Feedback'));

const Loading = () => <div style={{ minHeight: '100vh', background: '#0a0a0b' }} />;

// Map of route paths to tab keys used by the Dashboard component
const TAB_ROUTES = [
    { path: "home", tab: "home" },
    { path: "create-ride", tab: "createRide" },
    { path: "my-rides", tab: "myRides" },
    { path: "find-rides", tab: "findRides" },
    { path: "request-ride", tab: "requestRide" },
    { path: "drive", tab: "driveRequests" },
    { path: "my-bookings", tab: "myBookings" },
    { path: "chats", tab: "chats" },
    { path: "ride-history", tab: "rideHistory" },
    { path: "payments", tab: "payments" },
    { path: "earnings", tab: "earnings" },
    { path: "my-vehicle", tab: "myVehicle" },
    { path: "verification", tab: "verification" },
    { path: "safety", tab: "safety" },
    { path: "support", tab: "support" },
    { path: "sustainability", tab: "sustainability" },
    { path: "profile", tab: "profile" },
    { path: "search-results", tab: "searchResults" },
];

const AppRouter = () => (
    <Router>
        <Suspense fallback={<Loading />}>
            <Routes>
                <Route path="/" element={<Home />} />

                {/* Dashboard home */}
                <Route path="/dashboard" element={<Dashboard />} />

                {/* Each page has its own clean URL */}
                {TAB_ROUTES.map(({ path }) => (
                    <Route key={path} path={`/${path}`} element={<Dashboard />} />
                ))}

                {/* Admin panel — completely separate layout */}
                <Route path="/admin" element={<AdminPanel />} />
                <Route path="/admin/:section" element={<AdminPanel />} />

                {/* Public shared trip tracking (no auth — secured by token) */}
                <Route path="/track/:token" element={<SharedTrip />} />

                {/* Public info pages (no auth) */}
                <Route path="/about" element={<About />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/feedback" element={<Feedback />} />

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Suspense>
    </Router>
);

export { TAB_ROUTES };
export default AppRouter;
