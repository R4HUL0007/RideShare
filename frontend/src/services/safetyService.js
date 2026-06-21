import axiosInstance from "../utils/axiosConfig";
import { API_BASE_URL } from "../utils/constants";

const base = `${API_BASE_URL}/safety`;

// Overview
export const getSafetyOverview = () => axiosInstance.get(`${base}/overview`);

// Emergency contacts
export const listContacts = () => axiosInstance.get(`${base}/contacts`);
export const addContact = (payload) => axiosInstance.post(`${base}/contacts`, payload);
export const updateContact = (id, payload) => axiosInstance.put(`${base}/contacts/${id}`, payload);
export const deleteContact = (id) => axiosInstance.delete(`${base}/contacts/${id}`);
export const setPrimaryContact = (id) => axiosInstance.patch(`${base}/contacts/${id}/primary`);

// SOS
export const triggerSos = (payload) => axiosInstance.post(`${base}/sos`, payload);
export const cancelSos = (id) => axiosInstance.post(`${base}/sos/${id}/cancel`);

// Trip sharing
export const shareTrip = (rideId) => axiosInstance.post(`${base}/share`, { rideId });

// Reports
export const submitReport = (payload) => axiosInstance.post(`${base}/report`, payload);

// Incident history
export const myIncidents = () => axiosInstance.get(`${base}/incidents`);

// Admin
export const adminSafetyReports = (params) => axiosInstance.get(`${API_BASE_URL}/admin/safety/reports`, { params });
export const adminResolveReport = (id, status, resolution) => axiosInstance.post(`${API_BASE_URL}/admin/safety/reports/${id}/resolve`, { status, resolution });
export const adminSosEvents = (params) => axiosInstance.get(`${API_BASE_URL}/admin/safety/sos`, { params });
export const adminUpdateSos = (id, status, notes) => axiosInstance.post(`${API_BASE_URL}/admin/safety/sos/${id}/update`, { status, notes });
