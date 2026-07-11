import axiosInstance from "../utils/axiosConfig";
import { API_BASE_URL } from "../utils/constants";

// Smart Ride Suggestions — homepage smart card + recent searches + favorites.
// Every call swallows errors and returns a safe default so the homepage never
// breaks when logged out, offline, or the endpoint fails. Purely additive.

const BASE = `${API_BASE_URL}/suggestions`;
const EMPTY = { smartCard: null, favoritePlaces: [], frequentDestinations: [], recentSearches: [] };

// GET suggestions for the current time/location (local hour/day so the server
// time zone is irrelevant). Returns the full payload or safe empties.
export const getSuggestions = async ({ lat, lng, hour, day } = {}) => {
    try {
        const params = {};
        if (Number.isFinite(lat) && Number.isFinite(lng)) { params.lat = lat; params.lng = lng; }
        if (Number.isFinite(hour)) params.hour = hour;
        if (Number.isFinite(day)) params.day = day;
        const { data } = await axiosInstance.get(BASE, { params });
        return { ...EMPTY, ...(data || {}) };
    } catch {
        return EMPTY;
    }
};

// Record a route search (pickup → destination). Fire-and-forget.
export const recordSearch = async (pickup, destination) => {
    try {
        await axiosInstance.post(`${BASE}/record`, { pickup, destination });
    } catch {
        /* swallow — never blocks the search */
    }
};

// Remove one recent search; returns the updated list (or []).
export const removeSearch = async (id) => {
    try {
        const { data } = await axiosInstance.delete(`${BASE}/searches/${id}`);
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
};

// Clear all recent searches; returns [].
export const clearSearches = async () => {
    try {
        await axiosInstance.delete(`${BASE}/searches`);
        return [];
    } catch {
        return [];
    }
};
