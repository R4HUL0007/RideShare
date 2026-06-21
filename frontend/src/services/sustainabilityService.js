import axiosInstance from "../utils/axiosConfig";
import { API_BASE_URL } from "../utils/constants";

const base = `${API_BASE_URL}/sustainability`;

export const getMyImpact = () => axiosInstance.get(`${base}/me`);
export const getPlatformImpact = () => axiosInstance.get(`${base}/platform`);
