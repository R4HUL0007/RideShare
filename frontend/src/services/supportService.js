import axiosInstance from "../utils/axiosConfig";
import { API_BASE_URL } from "../utils/constants";

const base = `${API_BASE_URL}/support`;

// User
export const requestSupport = (topic) => axiosInstance.post(`${base}/request`, { topic });
export const getMySupportSession = () => axiosInstance.get(`${base}/my-session`);
export const sendSupportMessage = (id, text) => axiosInstance.post(`${base}/${id}/message`, { text });
export const closeMySupport = (id) => axiosInstance.post(`${base}/${id}/close`);

// Support tickets ("Email us")
export const submitSupportTicket = (topic, description) => axiosInstance.post(`${base}/ticket`, { topic, description });
export const getMyTickets = () => axiosInstance.get(`${base}/my-tickets`);
export const getMyTicket = (id) => axiosInstance.get(`${base}/my-tickets/${id}`);
export const replyToTicket = (id, text) => axiosInstance.post(`${base}/ticket/${id}/reply`, { text });
export const deleteMyTicket = (id) => axiosInstance.delete(`${base}/ticket/${id}`);

// Agent (admin)
export const adminSupportList = (params) => axiosInstance.get(`${base}/admin/list`, { params });
export const adminSupportGet = (id) => axiosInstance.get(`${base}/admin/${id}`);
export const adminSupportClaim = (id) => axiosInstance.post(`${base}/admin/${id}/claim`);
export const adminSupportMessage = (id, text) => axiosInstance.post(`${base}/admin/${id}/message`, { text });
export const adminSupportClose = (id) => axiosInstance.post(`${base}/admin/${id}/close`);

// Admin tickets ("Email us")
export const adminTicketList = (params) => axiosInstance.get(`${base}/admin/tickets`, { params });
export const adminTicketGet = (id) => axiosInstance.get(`${base}/admin/tickets/${id}`);
export const adminTicketReply = (id, text) => axiosInstance.post(`${base}/admin/tickets/${id}/reply`, { text });
export const adminTicketUpdate = (id, body) => axiosInstance.patch(`${base}/admin/tickets/${id}`, body);
export const adminTicketClear = (id) => axiosInstance.post(`${base}/admin/tickets/${id}/clear`);
export const adminTicketDelete = (id) => axiosInstance.delete(`${base}/admin/tickets/${id}`);
