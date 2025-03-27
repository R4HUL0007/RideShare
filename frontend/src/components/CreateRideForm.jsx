import { useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";

const CreateRideForm = ({ onSuccess }) => {
    const [formData, setFormData] = useState({
        destination: "",
        timing: "",
        gender_preference: "Any",
        seatsAvailable: 1
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        if (error) setError("");
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const token = localStorage.getItem("token");
            await axios.post(`${import.meta.env.VITE_API_URL}/rides`, formData, { 
                headers: { Authorization: `Bearer ${token}` } 
            });
            
            toast.success("Ride created successfully!");
            setFormData({
                destination: "",
                timing: "",
                gender_preference: "Any",
                seatsAvailable: 1
            });
            onSuccess(); // Trigger reload or update UI
        } catch (error) {
            const errorMessage =
                error.response?.data?.message || "Failed to create ride";
            setError(errorMessage);
            toast.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    // Calculate minimum date-time (now)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const minDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
                <div className="p-3 bg-danger-50 border border-danger-200 text-danger-800 rounded-md">
                    {error}
                </div>
            )}
            
            {/* Destination field */}
            <div className="form-control">
                <label htmlFor="destination" className="form-label">Destination</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </div>
                    <input
                        id="destination"
                        type="text"
                        name="destination"
                        value={formData.destination}
                        onChange={handleChange}
                        placeholder="Where are you going?"
                        className="form-input pl-10"
                        required
                    />
                </div>
            </div>

            {/* Departure time field */}
            <div className="form-control">
                <label htmlFor="timing" className="form-label">Departure Time</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <input
                        id="timing"
                        type="datetime-local"
                        name="timing"
                        value={formData.timing}
                        onChange={handleChange}
                        min={minDateTime}
                        className="form-input pl-10"
                        required
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Gender preference field */}
                <div className="form-control">
                    <label htmlFor="gender_preference" className="form-label">Gender Preference</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                        <select
                            id="gender_preference"
                            name="gender_preference"
                            value={formData.gender_preference}
                            onChange={handleChange}
                            className="form-input pl-10"
                        >
                            <option value="Any">Any gender</option>
                            <option value="Male">Male only</option>
                            <option value="Female">Female only</option>
                        </select>
                    </div>
                </div>

                {/* Available seats field */}
                <div className="form-control">
                    <label htmlFor="seatsAvailable" className="form-label">Available Seats</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </div>
                        <select
                            id="seatsAvailable"
                            name="seatsAvailable"
                            value={formData.seatsAvailable}
                            onChange={handleChange}
                            className="form-input pl-10"
                        >
                            {[1, 2, 3, 4].map(num => (
                                <option key={num} value={num}>{num} seat{num > 1 ? 's' : ''}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Submit button */}
            <div className="pt-2">
                <button
                    type="submit"
                    className="btn btn-primary w-full"
                    disabled={loading}
                >
                    {loading ? (
                        <div className="flex items-center justify-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Creating...
                        </div>
                    ) : (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            Create Ride
                        </>
                    )}
                </button>
            </div>
        </form>
    );
};

export default CreateRideForm;
