import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { getUserVehicle, createVehicle, updateVehicle } from "../services/vehicleService";

const VehicleForm = ({ vehicle, onSuccess, onCancel, isModal = false }) => {
    const [formData, setFormData] = useState({
        vehicleType: "",
        make: "",
        model: "",
        year: "",
        color: "",
        licensePlate: "",
        totalSeats: 4,
        amenities: [],
        drivingLicense: "",
        experience: "",
        preferredCommunication: "In-app"
    });
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(!vehicle);

    const amenitiesOptions = [
        "AC Available",
        "Music System",
        "Charging Port",
        "Spacious",
        "Clean & Well Maintained"
    ];

    useEffect(() => {
        if (vehicle) {
            // If vehicle is passed as prop, use it directly
            setFormData({
                vehicleType: vehicle.vehicleType || "",
                make: vehicle.make || "",
                model: vehicle.model || "",
                year: vehicle.year || "",
                color: vehicle.color || "",
                licensePlate: vehicle.licensePlate || "",
                totalSeats: vehicle.totalSeats || 4,
                amenities: vehicle.amenities || [],
                drivingLicense: vehicle.drivingLicense || "",
                experience: vehicle.experience || "",
                preferredCommunication: vehicle.preferredCommunication || "In-app"
            });
            setFetching(false);
        } else {
            fetchVehicle();
        }
    }, [vehicle]);

    const fetchVehicle = async () => {
        try {
            const response = await getUserVehicle();
            if (response.data) {
                setFormData({
                    vehicleType: response.data.vehicleType || "",
                    make: response.data.make || "",
                    model: response.data.model || "",
                    year: response.data.year || "",
                    color: response.data.color || "",
                    licensePlate: response.data.licensePlate || "",
                    totalSeats: response.data.totalSeats || 4,
                    amenities: response.data.amenities || [],
                    drivingLicense: response.data.drivingLicense || "",
                    experience: response.data.experience || "",
                    preferredCommunication: response.data.preferredCommunication || "In-app"
                });
            }
        } catch (error) {
            // Vehicle doesn't exist yet, that's okay
            console.log("No vehicle found, creating new one");
        } finally {
            setFetching(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
    };

    const handleAmenityChange = (amenity) => {
        setFormData(prev => ({
            ...prev,
            amenities: prev.amenities.includes(amenity)
                ? prev.amenities.filter(a => a !== amenity)
                : [...prev.amenities, amenity]
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (vehicle && vehicle._id) {
                // Update existing vehicle
                await updateVehicle(vehicle._id, formData);
                toast.success("Vehicle updated successfully!");
            } else {
                // Create new vehicle
                await createVehicle(formData);
                toast.success("Vehicle added successfully!");
            }
            if (onSuccess) onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to save vehicle details");
        } finally {
            setLoading(false);
        }
    };

    if (fetching) {
        return (
            <div className="flex justify-center items-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    const formContent = (
        <form onSubmit={handleSubmit} className="space-y-5">
            {/* Vehicle Type */}
            <div className="form-control">
                <label htmlFor="vehicleType" className="form-label">Vehicle Type *</label>
                <select
                    id="vehicleType"
                    name="vehicleType"
                    value={formData.vehicleType}
                    onChange={handleChange}
                    className="form-input"
                    required
                >
                    <option value="">Select Vehicle Type</option>
                    <option value="Car">Car</option>
                    <option value="Motorcycle">Motorcycle</option>
                    <option value="Scooter">Scooter</option>
                    <option value="Auto-rickshaw">Auto-rickshaw</option>
                </select>
            </div>

            {/* Make and Model */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="form-control">
                    <label htmlFor="make" className="form-label">Make *</label>
                    <input
                        id="make"
                        type="text"
                        name="make"
                        value={formData.make}
                        onChange={handleChange}
                        placeholder="e.g., Maruti, Honda"
                        className="form-input"
                        required
                    />
                </div>
                <div className="form-control">
                    <label htmlFor="model" className="form-label">Model *</label>
                    <input
                        id="model"
                        type="text"
                        name="model"
                        value={formData.model}
                        onChange={handleChange}
                        placeholder="e.g., Swift, Activa"
                        className="form-input"
                        required
                    />
                </div>
            </div>

            {/* Year and Color */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="form-control">
                    <label htmlFor="year" className="form-label">Year</label>
                    <input
                        id="year"
                        type="number"
                        name="year"
                        value={formData.year}
                        onChange={handleChange}
                        placeholder="e.g., 2020"
                        className="form-input"
                        min="1900"
                        max={new Date().getFullYear() + 1}
                    />
                </div>
                <div className="form-control">
                    <label htmlFor="color" className="form-label">Color</label>
                    <input
                        id="color"
                        type="text"
                        name="color"
                        value={formData.color}
                        onChange={handleChange}
                        placeholder="e.g., White, Black"
                        className="form-input"
                    />
                </div>
            </div>

            {/* License Plate and Total Seats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="form-control">
                    <label htmlFor="licensePlate" className="form-label">License Plate</label>
                    <input
                        id="licensePlate"
                        type="text"
                        name="licensePlate"
                        value={formData.licensePlate}
                        onChange={handleChange}
                        placeholder="e.g., GJ-06-AB-1234"
                        className="form-input"
                    />
                </div>
                <div className="form-control">
                    <label htmlFor="totalSeats" className="form-label">Total Seats *</label>
                    <select
                        id="totalSeats"
                        name="totalSeats"
                        value={formData.totalSeats}
                        onChange={handleChange}
                        className="form-input"
                        required
                    >
                        {[2, 3, 4, 5, 6, 7, 8].map(num => (
                            <option key={num} value={num}>{num} seats</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Driving License and Experience */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="form-control">
                    <label htmlFor="drivingLicense" className="form-label">Driving License Number *</label>
                    <input
                        id="drivingLicense"
                        type="text"
                        name="drivingLicense"
                        value={formData.drivingLicense}
                        onChange={handleChange}
                        placeholder="e.g., DL-1234567890"
                        className="form-input"
                        required
                    />
                </div>
                <div className="form-control">
                    <label htmlFor="experience" className="form-label">Years of Experience</label>
                    <input
                        id="experience"
                        type="number"
                        name="experience"
                        value={formData.experience}
                        onChange={handleChange}
                        placeholder="e.g., 5"
                        className="form-input"
                        min="0"
                    />
                </div>
            </div>

            {/* Preferred Communication */}
            <div className="form-control">
                <label htmlFor="preferredCommunication" className="form-label">Preferred Communication</label>
                <select
                    id="preferredCommunication"
                    name="preferredCommunication"
                    value={formData.preferredCommunication}
                    onChange={handleChange}
                    className="form-input"
                >
                    <option value="In-app">In-app</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Phone">Phone</option>
                </select>
            </div>

            {/* Amenities */}
            <div className="form-control">
                <label className="form-label">Vehicle Amenities</label>
                <div className="space-y-2 mt-2">
                    {amenitiesOptions.map(amenity => (
                        <label 
                            key={amenity} 
                            className={`flex items-center space-x-3 cursor-pointer p-2 rounded-md transition-colors ${
                                formData.amenities.includes(amenity) 
                                    ? 'bg-blue-50 hover:bg-blue-100' 
                                    : 'hover:bg-gray-50'
                            }`}
                        >
                            <input
                                type="checkbox"
                                checked={formData.amenities.includes(amenity)}
                                onChange={() => handleAmenityChange(amenity)}
                                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                            />
                            <span className="text-sm text-gray-700 select-none">{amenity}</span>
                        </label>
                    ))}
                </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="btn btn-outline flex-1"
                        disabled={loading}
                    >
                        Cancel
                    </button>
                )}
                <button
                    type="submit"
                    className="btn btn-primary flex-1"
                    disabled={loading}
                >
                    {loading ? "Saving..." : "Save Vehicle Details"}
                </button>
            </div>
        </form>
    );

    if (isModal) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
                    <h2 className="text-2xl font-bold mb-4">Vehicle Details</h2>
                    {formContent}
                </div>
            </div>
        );
    }

    return (
        <div className="card animate-fade-in dashboard-card">
            <div className="card-header">
                <h2 className="text-xl font-medium">Vehicle Information</h2>
            </div>
            <div className="card-body">
                {formContent}
            </div>
        </div>
    );
};

export default VehicleForm;

