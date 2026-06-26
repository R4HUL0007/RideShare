import axiosInstance from "../utils/axiosConfig";
import { API_BASE_URL } from "../utils/constants";

// All admin endpoints are gated server-side by protect + requireAdmin. A
// non-admin token gets 403; the UI also guards the route. Server-side checks
// are the real boundary — the client guard is convenience only.
const base = `${API_BASE_URL}/admin`;

export const adminDashboard = () => axiosInstance.get(`${base}/dashboard`);
export const adminAnalytics = (days = 30) => axiosInstance.get(`${base}/analytics`, { params: { days } });
export const adminNotifications = () => axiosInstance.get(`${base}/notifications`);
export const adminLive = () => axiosInstance.get(`${base}/live`);
export const adminAuditLogs = (params) => axiosInstance.get(`${base}/audit-logs`, { params });

export const adminUsers = (params) => axiosInstance.get(`${base}/users`, { params });
export const adminUserDetail = (id) => axiosInstance.get(`${base}/users/${id}`);
export const adminSetUserStatus = (id, status, reason) => axiosInstance.patch(`${base}/users/${id}/status`, { status, reason });
export const adminSetUserRole = (id, isAdmin, adminRole, reason) => axiosInstance.patch(`${base}/users/${id}/role`, { isAdmin, adminRole, reason });
export const adminDeleteUser = (id, reason) => axiosInstance.delete(`${base}/users/${id}`, { data: { reason } });

export const adminRides = (params) => axiosInstance.get(`${base}/rides`, { params });
export const adminUnpaidRides = () => axiosInstance.get(`${base}/rides/unpaid`);
export const adminCancelRide = (id, reason) => axiosInstance.post(`${base}/rides/${id}/cancel`, { reason });
export const adminBookings = (params) => axiosInstance.get(`${base}/bookings`, { params });

export const adminPayments = (params) => axiosInstance.get(`${base}/payments`, { params });
export const adminEscrow = () => axiosInstance.get(`${base}/escrow`);
export const adminPaymentEscrowAction = (id, action, note) => axiosInstance.post(`${base}/payments/${id}/escrow`, { action, note });

export const adminDisputes = (params) => axiosInstance.get(`${base}/disputes`, { params });
export const adminResolveDispute = (id, outcome, note) => axiosInstance.post(`${base}/disputes/${id}/resolve`, { outcome, note });

export const adminWithdrawals = (params) => axiosInstance.get(`${base}/withdrawals`, { params });
export const adminDecideWithdrawal = (id, decision, note) => axiosInstance.post(`${base}/withdrawals/${id}/decision`, { decision, note });

export const adminReviews = (params) => axiosInstance.get(`${base}/reviews`, { params });
export const adminRemoveReview = (id, reason) => axiosInstance.delete(`${base}/reviews/${id}`, { data: { reason } });
