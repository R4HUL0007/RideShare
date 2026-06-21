import axiosInstance from "../utils/axiosConfig";
import { API_BASE_URL } from "../utils/constants";

const ride = (id) => `${API_BASE_URL}/rides/${id}`;

export const getVerification = (rideId) => axiosInstance.get(`${ride(rideId)}/verification`);
export const checkIn = (rideId) => axiosInstance.post(`${ride(rideId)}/checkin`, {});
export const verifyCode = (rideId, code) => axiosInstance.post(`${ride(rideId)}/verify`, { code });
export const resendOtp = (rideId) => axiosInstance.post(`${ride(rideId)}/otp/resend`, {});
export const reportNoShow = (rideId, payload) => axiosInstance.post(`${ride(rideId)}/no-show`, payload);
export const getTimeline = (rideId) => axiosInstance.get(`${ride(rideId)}/timeline`);

// Admin
export const adminVerificationLogs = (params) => axiosInstance.get(`${API_BASE_URL}/admin/verification/logs`, { params });
export const adminVerificationAnalytics = (days = 30) => axiosInstance.get(`${API_BASE_URL}/admin/verification/analytics`, { params: { days } });
