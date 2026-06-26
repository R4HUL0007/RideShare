import axiosInstance from "../utils/axiosConfig";
import { API_BASE_URL } from "../utils/constants";

const base = `${API_BASE_URL}/personal-rides`;

// Passenger
export const estimatePersonalRide = (pickup, destination) => axiosInstance.post(`${base}/estimate`, { pickup, destination });
export const personalRideStats = () => axiosInstance.get(`${base}/stats`);
export const createPersonalRide = (payload) => axiosInstance.post(base, payload);
export const myActivePersonalRide = () => axiosInstance.get(`${base}/mine`);
export const getPersonalRide = (id) => axiosInstance.get(`${base}/${id}`);
export const cancelPersonalRide = (id, reason) => axiosInstance.post(`${base}/${id}/cancel`, { reason });
export const payPersonalRide = (id, body = {}) => axiosInstance.post(`${base}/${id}/pay`, body);
export const confirmArrivalPersonal = (id) => axiosInstance.post(`${base}/${id}/arrived`);
export const personalRideHistory = () => axiosInstance.get(`${base}/history`);

// Driver
export const incomingPersonalRides = () => axiosInstance.get(`${base}/incoming`);
export const driverActivePersonalRide = () => axiosInstance.get(`${base}/driver/active`);
export const myDriverLedger = () => axiosInstance.get(`${base}/ledger`);
export const acceptPersonalRide = (id) => axiosInstance.post(`${base}/${id}/accept`);
export const declinePersonalRide = (id) => axiosInstance.post(`${base}/${id}/decline`);
export const reachedPickupPersonalRide = (id) => axiosInstance.post(`${base}/${id}/reached-pickup`);
export const verifyOtpPersonalRide = (id, code) => axiosInstance.post(`${base}/${id}/verify-otp`, { code });
export const completePersonalRide = (id) => axiosInstance.post(`${base}/${id}/complete`);
export const updateDriverLocationPersonal = (id, lat, lng) => axiosInstance.post(`${base}/${id}/location`, { lat, lng });

// Admin
export const adminPersonalRides = (params) => axiosInstance.get(`${base}/admin/list`, { params });
export const adminPersonalLedger = (params) => axiosInstance.get(`${base}/admin/ledger`, { params });
export const adminPersonalSettlements = (params) => axiosInstance.get(`${base}/admin/settlements`, { params });
export const adminPersonalDashboard = () => axiosInstance.get(`${base}/admin/dashboard`);
export const adminRunSettlement = () => axiosInstance.post(`${base}/admin/run-settlement`);
