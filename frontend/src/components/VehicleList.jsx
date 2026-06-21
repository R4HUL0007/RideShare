import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { getUserVehicles, deleteVehicle } from "../services/vehicleService";
import VehicleForm from "./VehicleForm";

const VehicleList = () => {
    const [vehicles, setVehicles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showVehicleForm, setShowVehicleForm] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState(null);

    useEffect(() => {
        fetchVehicles();
    }, []);

    const fetchVehicles = async () => {
        setLoading(true);
        try {
            const response = await getUserVehicles();
            setVehicles(response.data || []);
        } catch (error) {
            if (error.response?.status !== 404) {
                toast.error("Failed to load vehicles");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleAddVehicle = () => {
        setEditingVehicle(null);
        setShowVehicleForm(true);
    };

    const handleEditVehicle = (vehicle) => {
        setEditingVehicle(vehicle);
        setShowVehicleForm(true);
    };

    const handleDeleteVehicle = async (vehicleId) => {
        if (!window.confirm("Are you sure you want to delete this vehicle?")) {
            return;
        }

        try {
            await deleteVehicle(vehicleId);
            toast.success("Vehicle deleted successfully");
            fetchVehicles();
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to delete vehicle");
        }
    };

    const handleVehicleSaved = () => {
        setShowVehicleForm(false);
        setEditingVehicle(null);
        fetchVehicles();
    };

    const handleCancel = () => {
        setShowVehicleForm(false);
        setEditingVehicle(null);
    };

    if (showVehicleForm) {
        return (
            <div className="card animate-fade-in dashboard-card">
                <div className="card-header flex items-center justify-between">
                    <h2 className="text-xl font-medium">
                        {editingVehicle ? "Edit Vehicle" : "Add New Vehicle"}
                    </h2>
                    <button
                        onClick={handleCancel}
                        className="text-gray-500 hover:text-gray-700"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div className="card-body">
                    <VehicleForm 
                        vehicle={editingVehicle}
                        onSuccess={handleVehicleSaved} 
                        onCancel={handleCancel}
                    />
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">My Vehicles</h2>
                    <p className="text-gray-600 mt-1">Manage your registered vehicles</p>
                </div>
                <button
                    onClick={handleAddVehicle}
                    className="btn btn-primary flex items-center gap-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="16"></line>
                        <line x1="8" y1="12" x2="16" y2="12"></line>
                    </svg>
                    Add Vehicle
                </button>
            </div>

            {vehicles.length === 0 ? (
                <div className="empty-state">
                    <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto text-gray-400" width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1"></path>
                        <polygon points="12 15 17 21 7 21 12 15"></polygon>
                    </svg>
                    <p className="mt-4 text-lg font-medium text-gray-600">No vehicles registered yet</p>
                    <p className="mt-2 text-gray-500">Add your first vehicle to start offering rides</p>
                    <button 
                        className="mt-4 btn btn-primary"
                        onClick={handleAddVehicle}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="mr-2" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add Your First Vehicle
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {vehicles.map((vehicle) => (
                        <div key={vehicle._id} className="ride-card">
                            <div className="ride-card-content">
                                <div className="ride-card-header">
                                    <div>
                                        <h3 className="ride-card-title">
                                            {vehicle.make} {vehicle.model}
                                        </h3>
                                        <p className="ride-card-time">
                                            {vehicle.vehicleType} {vehicle.year ? `• ${vehicle.year}` : ''}
                                        </p>
                                    </div>
                                </div>

                                <div className="ride-detail-row">
                                    <div className="ride-detail-item">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="ride-detail-icon" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0z" />
                                        </svg>
                                        {vehicle.totalSeats} seats
                                    </div>
                                    {vehicle.color && (
                                        <div className="ride-detail-item">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="ride-detail-icon" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                                            </svg>
                                            {vehicle.color}
                                        </div>
                                    )}
                                </div>

                                {vehicle.licensePlate && (
                                    <div className="mt-3 text-sm text-gray-600">
                                        <strong>License:</strong> {vehicle.licensePlate}
                                    </div>
                                )}

                                {vehicle.amenities && vehicle.amenities.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-gray-200">
                                        <p className="text-xs font-semibold text-gray-600 mb-2">Amenities:</p>
                                        <div className="flex flex-wrap gap-2">
                                            {vehicle.amenities.slice(0, 3).map((amenity, idx) => (
                                                <span key={idx} className="inline-flex items-center text-xs bg-green-100 text-green-800 px-2.5 py-1 rounded-md font-medium">
                                                    ✓ {amenity}
                                                </span>
                                            ))}
                                            {vehicle.amenities.length > 3 && (
                                                <span className="inline-flex items-center text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-md font-medium">
                                                    +{vehicle.amenities.length - 3} more
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="ride-card-footer mt-4">
                                    <button
                                        onClick={() => handleEditVehicle(vehicle)}
                                        className="btn btn-sm btn-outline flex-1"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="mr-1" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => handleDeleteVehicle(vehicle._id)}
                                        className="btn btn-sm btn-danger flex-1"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="mr-1" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default VehicleList;

