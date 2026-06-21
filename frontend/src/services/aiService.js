// =======================================================
// RidexShare AI — Frontend service
// -------------------------------------------------------
// Thin client for the backend AI gateway (/api/ai/chat). The AssistantContext
// calls this first; on ANY failure it falls back to the local rule-based engine
// so the assistant always works (existing functionality preserved).
// =======================================================

import axiosInstance from "../utils/axiosConfig";
import { API_BASE_URL } from "../utils/constants";

/**
 * Send a message to the backend AI agent.
 * @param {string} message
 * @param {string} sessionId
 * @returns {Promise<{reply, actions, cards, suggestions, sources, intent}>}
 */
export async function aiChat(message, sessionId = "default") {
    const { data } = await axiosInstance.post(`${API_BASE_URL}/ai/chat`, { message, sessionId });
    return data;
}

/** Admin: AI usage analytics. */
export async function aiAnalytics(days = 30) {
    return axiosInstance.get(`${API_BASE_URL}/ai/analytics`, { params: { days } });
}

/** Admin: re-index the knowledge base. */
export async function aiReindex() {
    return axiosInstance.post(`${API_BASE_URL}/ai/reindex`);
}
