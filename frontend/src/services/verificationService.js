import axiosInstance from "../utils/axiosConfig";
import { API_BASE_URL } from "../utils/constants";

const base = `${API_BASE_URL}/verification`;

export const getMyVerification = () => axiosInstance.get(`${base}/status`);
export const submitVerification = (payload) => axiosInstance.post(`${base}/submit`, payload);

// Admin
export const adminVerificationList = (params) => axiosInstance.get(`${base}/admin/list`, { params });
export const adminVerificationDetail = (id) => axiosInstance.get(`${base}/admin/${id}`);
export const adminVerificationDecision = (id, decision, remarks) => axiosInstance.post(`${base}/admin/${id}/decision`, { decision, remarks });
