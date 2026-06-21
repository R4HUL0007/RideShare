import { useState } from "react";
import axiosInstance from "../utils/axiosConfig";
import { API_BASE_URL } from "../utils/constants";
import { toast } from "react-toastify";

const SearchRides = ({ setSearchResults }) => {
    const [destination, setDestination] = useState("");
    const [genderPreference, setGenderPreference] = useState("Any");
    const [timing, setTiming] = useState("");

    const handleSearch = async (e) => {
        e.preventDefault();

        try {
            const response = await axiosInstance.get(
                `${API_BASE_URL}/rides`,
                {
                    params: {
                        destination: destination,
                        gender_preference: genderPreference,
                        timing: timing
                    }
                }
            );

            setSearchResults(response.data);
            toast.success("Rides found successfully!");
        } catch (error) {
            console.error("Search error:", error);
            toast.error(
                error.response?.data?.message || "Failed to search rides"
            );
        }
    };

    return (
        <div className="p-4 bg-white shadow-md rounded-md">
            <h2 className="text-lg font-semibold mb-4">Search for Rides</h2>
            <form onSubmit={handleSearch}>
                <div className="mb-3">
                    <label className="block text-sm font-medium">Destination</label>
                    <input
                        type="text"
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        placeholder="Enter your destination"
                        className="w-full p-2 border border-gray-300 rounded-md"
                    />
                </div>

                <div className="mb-3">
                    <label className="block text-sm font-medium">Gender Preference</label>
                    <select
                        value={genderPreference}
                        onChange={(e) => setGenderPreference(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md"
                    >
                        <option value="Any">Any</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                    </select>
                </div>

                <div className="mb-3">
                    <label className="block text-sm font-medium">Timing</label>
                    <input
                        type="datetime-local"
                        value={timing}
                        onChange={(e) => setTiming(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md"
                    />
                </div>

                <button
                    type="submit"
                    className="w-full bg-blue-500 text-white py-2 rounded-md hover:bg-blue-600"
                >
                    Search
                </button>
            </form>
        </div>
    );
};

export default SearchRides;
