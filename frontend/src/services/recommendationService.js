import axiosInstance from "../utils/axiosConfig";
import { API_BASE_URL } from "../utils/constants";

const base = `${API_BASE_URL}/recommendations`;

export const getPassengerRecommendations = () => axiosInstance.get(`${base}/passenger`);
export const getDriverInsights = (days = 7) => axiosInstance.get(`${base}/driver`, { params: { days } });
export const getTrendingRoutes = () => axiosInstance.get(`${base}/trending`);
export const trackRecommendation = (payload) => axiosInstance.post(`${base}/track`, payload);

// Admin
export const recommendationAnalytics = (days = 30) => axiosInstance.get(`${base}/analytics`, { params: { days } });
