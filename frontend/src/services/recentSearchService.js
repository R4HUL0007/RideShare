import axiosInstance from "../utils/axiosConfig";
import { API_BASE_URL } from "../utils/constants";

// Recent Location Searches — per-account quick-pick places.
//
// Every call swallows errors and returns a safe default so the shared
// LocationSearchBox never breaks when the user is logged out, offline, or the
// endpoint fails. This feature is purely additive convenience.

const BASE = `${API_BASE_URL}/recent-searches`;

// GET the user's recent places (newest-first, ≤6). Returns [] on any failure.
export const getRecent = async () => {
    try {
        const { data } = await axiosInstance.get(BASE);
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
};

// Record (or bump) a chosen place. Fire-and-forget: returns the updated list on
// success, [] otherwise. Never throws.
export const addRecent = async ({ label, placeId = "", lat, lng }) => {
    try {
        const { data } = await axiosInstance.post(BASE, { label, placeId, lat, lng });
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
};

// Remove a single recent entry by id. Never throws.
export const removeRecent = async (id) => {
    try {
        const { data } = await axiosInstance.delete(`${BASE}/${id}`);
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
};

// Clear all of the user's recent entries. Never throws.
export const clearRecent = async () => {
    try {
        await axiosInstance.delete(BASE);
        return [];
    } catch {
        return [];
    }
};
