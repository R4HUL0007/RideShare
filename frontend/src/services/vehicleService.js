import axiosInstance from '../utils/axiosConfig';
import { API_BASE_URL } from '../utils/constants';

export const getUserVehicles = async () => {
    return await axiosInstance.get(`${API_BASE_URL}/vehicles`);
};

export const getUserVehicle = async () => {
    return await axiosInstance.get(`${API_BASE_URL}/vehicles/single`);
};

export const createVehicle = async (vehicleData) => {
    return await axiosInstance.post(`${API_BASE_URL}/vehicles`, vehicleData);
};

export const updateVehicle = async (vehicleId, vehicleData) => {
    return await axiosInstance.put(`${API_BASE_URL}/vehicles/${vehicleId}`, vehicleData);
};

export const deleteVehicle = async (vehicleId) => {
    return await axiosInstance.delete(`${API_BASE_URL}/vehicles/${vehicleId}`);
};

export const getVehicleById = async (vehicleId) => {
    return await axiosInstance.get(`${API_BASE_URL}/vehicles/${vehicleId}`);
};

