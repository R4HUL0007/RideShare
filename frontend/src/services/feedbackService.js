import axiosInstance from "../utils/axiosConfig";
import { API_BASE_URL } from "../utils/constants";

// Submit site feedback / a suggestion. The destination inbox is resolved
// entirely on the server — the frontend never knows or sends it. Uses the
// shared axios instance so a logged-in user's session cookie is included
// (lets the backend attach their identity for context), while logged-out
// visitors submit anonymously.
export const submitFeedback = async ({ message, name, email, company }) => {
    return await axiosInstance.post(`${API_BASE_URL}/feedback`, { message, name, email, company });
};
