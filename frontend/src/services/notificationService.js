import axiosInstance from "../utils/axiosConfig";
import { API_BASE_URL } from "../utils/constants";

// All endpoints are JWT-protected and hard-scoped to the logged-in user
// server-side, so a user can only ever touch their own notifications.
export const fetchNotifications = (limit = 50) =>
    axiosInstance.get(`${API_BASE_URL}/notifications`, { params: { limit } });

export const fetchUnreadCount = () =>
    axiosInstance.get(`${API_BASE_URL}/notifications/unread-count`);

export const markNotificationRead = (id) =>
    axiosInstance.patch(`${API_BASE_URL}/notifications/${id}/read`);

export const markAllNotificationsRead = () =>
    axiosInstance.patch(`${API_BASE_URL}/notifications/read-all`);

export const deleteNotification = (id) =>
    axiosInstance.delete(`${API_BASE_URL}/notifications/${id}`);

export const clearAllNotifications = () =>
    axiosInstance.delete(`${API_BASE_URL}/notifications`);
