import { useState } from "react";
import axiosInstance from "../utils/axiosConfig";
import { toast } from "react-toastify";
import { API_BASE_URL } from "../utils/constants";

const SearchRidesForm = ({ onSearchResults }) => {
    const [searchData, setSearchData] = useState({
        destination: "",
        gender_preference: "Any",
        timing: "",
    });

    const handleChange = (e) => {
        setSearchData({ ...searchData, [e.target.name]: e.target.value });
    };

    const handleSearch = async (e) => {
        e.preventDefault();

        try {
            const response = await axiosInstance.get(
                `${API_BASE_URL}/rides`,
                {
                    params: searchData
                }
            );

            onSearchResults(response.data); // Pass results to parent component
            toast.success("Rides found successfully!");
        } catch (error) {
            const errorMessage = error.response?.data?.message || "No rides found";
            toast.error(errorMessage);
            onSearchResults([]); // Clear results if no rides are found
        }
    };

    return (
        <div className="bg-white p-6 rounded-md shadow-md w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">Search Rides</h2>
            <form onSubmit={handleSearch} className="flex flex-col gap-4">
                {/* Destination Input */}
                <input
                    type="text"
                    name="destination"
                    value={searchData.destination}
                    onChange={handleChange}
                    placeholder="Enter destination"
                    className="p-2 border border-gray-300 rounded-md"
                    required
                />

                {/* Gender Preference Dropdown */}
                <select
                    name="gender_preference"
                    value={searchData.gender_preference}
                    onChange={handleChange}
                    className="p-2 border border-gray-300 rounded-md"
                >
                    <option value="Any">Any</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                </select>

                {/* Timing Input */}
                <input
                    type="datetime-local"
                    name="timing"
                    value={searchData.timing}
                    onChange={handleChange}
                    className="p-2 border border-gray-300 rounded-md"
                />

                {/* Search Button */}
                <button
                    type="submit"
                    className="bg-blue-500 text-white p-2 rounded-md hover:bg-blue-600"
                >
                    Search Rides
                </button>
            </form>
        </div>
    );
};

export default SearchRidesForm;
