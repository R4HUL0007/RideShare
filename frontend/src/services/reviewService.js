import axiosInstance from "../utils/axiosConfig";
import { API_BASE_URL } from "../utils/constants";

// All review endpoints are JWT-protected. Server-side checks enforce that a
// user can only review rides they were part of, can't review themselves, and
// can't submit duplicates for the same ride/pair.

// Completed rides where the logged-in user still owes a review.
export const fetchPendingReviews = () =>
    axiosInstance.get(`${API_BASE_URL}/reviews/pending`);

// Reviews received by a user (+ that user's rating aggregates).
// direction: optional "driver" | "passenger" filter; limit: optional cap.
export const getUserReviews = (userId, { direction, limit } = {}) =>
    axiosInstance.get(`${API_BASE_URL}/reviews/user/${userId}`, {
        params: { direction, limit },
    });

// Submit a review for `revieweeId` on `rideId`.
// payload: { rating: 1-5, comment?: string, categories?: {...} }
export const submitReview = (rideId, revieweeId, payload) =>
    axiosInstance.post(`${API_BASE_URL}/reviews/${rideId}/${revieweeId}`, payload);
