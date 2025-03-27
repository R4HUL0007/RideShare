import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "react-toastify";
import CreateRideForm from "../components/CreateRideForm";
import Sidebar from "../components/Sidebar";
import "../styles/dashboard.css";

// Render a ride card
const RideCard = ({ ride, formatDateTime, getStatusBadgeClass, onDelete, onBook, allowBooking = false }) => {
  return (
    <div key={ride._id} className="ride-card">
      <div className="ride-card-content">
        <div className="ride-card-header">
          <div>
            <h3 className="ride-card-title">{ride.destination}</h3>
            <p className="ride-card-time">{formatDateTime(ride.timing)}</p>
          </div>
          <div className="flex items-center">
            <span className={`status-indicator ${ride.status.toLowerCase()}`}></span>
            <span className={`badge ${getStatusBadgeClass(ride.status)}`}>
              {ride.status}
            </span>
          </div>
        </div>
        
        <div className="ride-detail-row">
          <div className="ride-detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" className="ride-detail-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {ride.gender_preference} preference
          </div>
          <div className="ride-detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" className="ride-detail-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            {ride.seatsAvailable} seat{ride.seatsAvailable !== 1 ? 's' : ''} available
          </div>
          {ride.passengers && ride.passengers.length > 0 && (
            <div className="ride-detail-item">
              <svg xmlns="http://www.w3.org/2000/svg" className="ride-detail-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              {ride.passengers.length} passenger{ride.passengers.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
        
        <div className="ride-card-footer">
          {allowBooking ? (
            <button
              onClick={() => onBook(ride._id)}
              className="btn btn-sm btn-primary"
              disabled={ride.status !== 'Available' || ride.seatsAvailable < 1}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Book Ride
            </button>
          ) : (
            <>
              <button
                onClick={() => toast.info("This feature is coming soon!")}
                className="btn btn-sm btn-outline"
                disabled={ride.status === 'Completed'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Edit
              </button>
              <button
                onClick={() => onDelete(ride._id)}
                className="btn btn-sm btn-danger"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const Dashboard = () => {
    const [user, setUser] = useState(null);
    const [rides, setRides] = useState([]);
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(true); 
    const [searchLoading, setSearchLoading] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('myRides');
    const [searchParams, setSearchParams] = useState({
        destination: "",
        genderPreference: "Any",
    });

    const navigate = useNavigate();

    useEffect(() => {
        const token = localStorage.getItem("token");

        if (!token) {
            toast.error("Session expired. Please log in again.");
            navigate("/");
            return;
        }

        try {
            const decodedToken = JSON.parse(atob(token.split(".")[1]));

            if (!decodedToken.name) {
                toast.error("Invalid session data. Please log in again.");
                navigate("/");
                return;
            }

            setUser({ name: decodedToken.name, email: decodedToken.email });
            fetchRides();
        } catch (error) {
            console.error("❌ Invalid token structure:", error);
            toast.error("Invalid session. Please log in again.");
            navigate("/");
        }
    }, [navigate]);

    // Fetch rides from the API
    const fetchRides = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const response = await axios.get(
                `${import.meta.env.VITE_API_URL}/rides/user-rides`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setRides(response.data);
        } catch (error) {
            console.error("❌ Error fetching user rides:", error);
            toast.error("Failed to fetch your rides. Please try again later.");
        } finally {
            setLoading(false);
        }
    };

    // Delete a Ride
    const deleteRide = async (rideId) => {
        if (!window.confirm("Are you sure you want to delete this ride?")) return;

        try {
            const token = localStorage.getItem("token");
            await axios.delete(
                `${import.meta.env.VITE_API_URL}/rides/${rideId}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            toast.success("Ride deleted successfully");
            fetchRides(); // Refresh the ride list
        } catch (error) {
            console.error("❌ Error deleting ride:", error);
            toast.error("Failed to delete ride. Please try again.");
        }
    };

    // Book a Ride
    const bookRide = async (rideId) => {
        try {
            const token = localStorage.getItem("token");
            await axios.post(
                `${import.meta.env.VITE_API_URL}/rides/book/${rideId}`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );

            toast.success("Ride booked successfully!");
            // Refresh search results after booking
            handleSearch(null, searchParams.destination, searchParams.genderPreference);
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to book ride");
        }
    };

    // Search for rides
    const handleSearch = async (e, destinationParam, genderParam) => {
        if (e) e.preventDefault();
        
        setSearchLoading(true);
        const destination = destinationParam || searchParams.destination;
        const genderPreference = genderParam || searchParams.genderPreference;

        try {
            const token = localStorage.getItem("token");
            const response = await axios.get(
                `${import.meta.env.VITE_API_URL}/rides`,
                { 
                    params: {
                        destination: destination,
                        gender_preference: genderPreference
                    },
                    headers: { Authorization: `Bearer ${token}` } 
                }
            );

            setSearchResults(response.data);
            setActiveTab('searchResults');
            toast.success("Rides found successfully!");
        } catch (error) {
            console.error("❌ Search error:", error);
            toast.error(
                error.response?.data?.message || "No matching rides found."
            );
            setSearchResults([]);
        } finally {
            setSearchLoading(false);
        }
    };

    const formatDateTime = (dateString) => {
        const options = { 
            weekday: 'short',
            month: 'short', 
            day: 'numeric',
            hour: '2-digit', 
            minute: '2-digit'
        };
        return new Date(dateString).toLocaleString(undefined, options);
    };

    // Get status badge class based on ride status
    const getStatusBadgeClass = (status) => {
        switch(status) {
            case 'Available':
                return 'badge-success';
            case 'Booked':
                return 'badge-info';
            case 'Completed':
                return 'badge-pending';
            default:
                return 'badge-info';
        }
    };

    // Render loading spinner
    const renderLoader = () => (
        <div className="loader">
            <svg className="loader-spinner" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
        </div>
    );

    return (
        <div className="dashboard-layout">
            <Sidebar 
                user={user}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                sidebarOpen={sidebarOpen}
                setSidebarOpen={setSidebarOpen}
            />

            <div className="main-content">
                <div className="dashboard-header">
                    <div className="mobile-menu-toggle">
                        <button
                            className="p-2 rounded-md text-primary-600"
                            onClick={() => setSidebarOpen(true)}
                            aria-label="Open menu"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="3" y1="12" x2="21" y2="12"></line>
                                <line x1="3" y1="6" x2="21" y2="6"></line>
                                <line x1="3" y1="18" x2="21" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    {user && (
                        <div className="user-greeting">
                            <span>Welcome, {user.name}</span>
                        </div>
                    )}
                </div>

                <div className="container-center">
                    <div className="content-header">
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
                            {activeTab === 'createRide' && 'Create a New Ride'}
                            {activeTab === 'myRides' && 'My Rides'}
                            {activeTab === 'findRides' && 'Find Available Rides'}
                            {activeTab === 'searchResults' && 'Search Results'}
                        </h1>
                        <p className="text-gray-600 mt-2">
                            {activeTab === 'createRide' && 'Share a ride with your fellow university members'}
                            {activeTab === 'myRides' && 'Manage the rides you have created'}
                            {activeTab === 'findRides' && 'Find rides that match your requirements'}
                            {activeTab === 'searchResults' && 'Available rides matching your search'}
                        </p>
                    </div>

                    <div className="dashboard-content">
                        {/* Create Ride Tab */}
                        {activeTab === 'createRide' && (
                            <div className="card animate-fade-in dashboard-card">
                                <div className="card-header">
                                    <h2 className="text-xl font-medium">Offer a Ride</h2>
                                </div>
                                <div className="card-body">
                                    <CreateRideForm onSuccess={fetchRides} />
                                </div>
                            </div>
                        )}

                        {/* Find Rides Tab */}
                        {activeTab === 'findRides' && (
                            <div className="card animate-fade-in dashboard-card">
                                <div className="card-header">
                                    <h2 className="text-xl font-medium">Find a Ride</h2>
                                </div>
                                <div className="card-body">
                                    <form onSubmit={handleSearch} className="space-y-5">
                                        <div className="form-control">
                                            <label htmlFor="destination" className="form-label">Destination</label>
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                    </svg>
                                                </div>
                                                <input
                                                    id="destination"
                                                    type="text"
                                                    value={searchParams.destination}
                                                    onChange={(e) => setSearchParams({ 
                                                        ...searchParams, 
                                                        destination: e.target.value 
                                                    })}
                                                    placeholder="Where do you want to go?"
                                                    className="form-input pl-10"
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div className="form-control">
                                            <label htmlFor="genderPref" className="form-label">Gender Preference</label>
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                    </svg>
                                                </div>
                                                <select
                                                    id="genderPref"
                                                    value={searchParams.genderPreference}
                                                    onChange={(e) => setSearchParams({
                                                        ...searchParams,
                                                        genderPreference: e.target.value
                                                    })}
                                                    className="form-input pl-10"
                                                >
                                                    <option value="Any">Any gender</option>
                                                    <option value="Male">Male only</option>
                                                    <option value="Female">Female only</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="pt-2">
                                            <button
                                                type="submit"
                                                className="btn btn-primary w-full"
                                                disabled={searchLoading}
                                            >
                                                {searchLoading ? (
                                                    <div className="flex items-center justify-center">
                                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        Searching...
                                                    </div>
                                                ) : (
                                                    <>
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                        </svg>
                                                        Search Rides
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}

                        {/* Search Results Tab */}
                        {activeTab === 'searchResults' && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="flex justify-between items-center">
                                    <h2 className="text-xl font-medium">Available Rides</h2>
                                    <button
                                        onClick={() => setActiveTab('findRides')}
                                        className="text-sm text-primary-600 hover:underline flex items-center"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                        </svg>
                                        Back to Search
                                    </button>
                                </div>
                                {searchResults.length > 0 ? (
                                    <div className="ride-grid">
                                        {searchResults.map((ride) => (
                                            <RideCard 
                                                key={ride._id}
                                                ride={ride}
                                                formatDateTime={formatDateTime}
                                                getStatusBadgeClass={getStatusBadgeClass}
                                                onBook={bookRide}
                                                allowBooking={true}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="empty-state">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        <p className="mt-4 text-lg font-medium text-gray-600">No rides match your search criteria</p>
                                        <p className="mt-2 text-gray-500">Try adjusting your search parameters</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* My Rides Tab */}
                        {activeTab === 'myRides' && (
                            <div className="animate-fade-in">
                                {loading ? renderLoader() : (
                                    <>
                                        {rides.length > 0 ? (
                                            <div className="ride-grid">
                                                {rides.map((ride) => (
                                                    <RideCard
                                                        key={ride._id}
                                                        ride={ride}
                                                        formatDateTime={formatDateTime}
                                                        getStatusBadgeClass={getStatusBadgeClass}
                                                        onDelete={deleteRide}
                                                    />
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="empty-state">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4v16m8-8H4" />
                                                </svg>
                                                <p className="mt-4 text-lg font-medium text-gray-600">You haven't created any rides yet</p>
                                                <button 
                                                    className="mt-4 btn btn-primary"
                                                    onClick={() => setActiveTab('createRide')}
                                                >
                                                    Create Your First Ride
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;

