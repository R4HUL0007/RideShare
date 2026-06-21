import axiosInstance from "../utils/axiosConfig";
import { API_BASE_URL } from "../utils/constants";

// All payment endpoints are JWT-protected and hard-scoped to the logged-in
// user server-side. Verification is signature-checked on the backend — the
// frontend NEVER decides whether a payment succeeded.

// Whether online payments are configured + the publishable key id.
export const getPaymentConfig = () =>
    axiosInstance.get(`${API_BASE_URL}/payments/config`);

// Create a Razorpay order for booking `seats` on a ride (Pending payment).
export const createOrder = (rideId, seats = 1) =>
    axiosInstance.post(`${API_BASE_URL}/payments/order/${rideId}`, { seats });

// Verify a completed checkout server-side → confirms the booking.
export const verifyPayment = (payload) =>
    axiosInstance.post(`${API_BASE_URL}/payments/verify`, payload);

// Record a cancelled/failed checkout (no seats reserved).
export const markPaymentFailed = (orderId, reason) =>
    axiosInstance.post(`${API_BASE_URL}/payments/failed`, { orderId, reason });

// The logged-in user's own payment history (optional status/date filters).
export const getMyPayments = (params = {}) =>
    axiosInstance.get(`${API_BASE_URL}/payments/history`, { params });

// Driver earnings summary + history.
export const getEarnings = () =>
    axiosInstance.get(`${API_BASE_URL}/payments/earnings`);

// Receipt data for a single payment (payer or driver only).
export const getReceipt = (paymentId) =>
    axiosInstance.get(`${API_BASE_URL}/payments/${paymentId}/receipt`);

// --- Escrow lifecycle ---
// Passenger confirms the ride → release escrow to the driver immediately.
export const confirmCompletion = (paymentId) =>
    axiosInstance.post(`${API_BASE_URL}/payments/${paymentId}/confirm`);

// Passenger raises a dispute → freezes escrow pending review.
// payload: { reason, description?, evidence?[] }
export const raiseDispute = (paymentId, payload) =>
    axiosInstance.post(`${API_BASE_URL}/payments/${paymentId}/dispute`, payload);

// The logged-in user's disputes.
export const getMyDisputes = () =>
    axiosInstance.get(`${API_BASE_URL}/payments/disputes`);

// --- Driver payouts ---
// Save/update payout destination (UPI for MVP).
export const updatePayoutDetails = (payload) =>
    axiosInstance.put(`${API_BASE_URL}/payments/payout-details`, payload);

// Request a withdrawal of the available (released) balance.
export const requestWithdrawal = () =>
    axiosInstance.post(`${API_BASE_URL}/payments/withdraw`);

// The logged-in driver's withdrawal requests.
export const getMyWithdrawals = () =>
    axiosInstance.get(`${API_BASE_URL}/payments/withdrawals`);

/**
 * Dynamically load the Razorpay Checkout script once. Resolves to the global
 * `window.Razorpay` constructor, or rejects if it can't load.
 */
let razorpayPromise = null;
export const loadRazorpay = () => {
    if (window.Razorpay) return Promise.resolve(window.Razorpay);
    if (razorpayPromise) return razorpayPromise;
    razorpayPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.async = true;
        script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Razorpay unavailable")));
        script.onerror = () => { razorpayPromise = null; reject(new Error("Failed to load Razorpay")); };
        document.body.appendChild(script);
    });
    return razorpayPromise;
};

/**
 * Run the full pay→verify flow for a ride booking.
 *   1. create order  2. open Razorpay checkout  3. verify signature server-side
 * Resolves with the verified payment on success; rejects/sends to failure otherwise.
 *
 * opts: { rideId, seats, user, onFailure(reason), notes }
 * Returns: { payment, ride } from the verified response.
 */
export const payForRide = async ({ rideId, seats = 1, user = {} }) => {
    const Razorpay = await loadRazorpay();
    const { data: order } = await createOrder(rideId, seats);

    return new Promise((resolve, reject) => {
        const rzp = new Razorpay({
            key: order.keyId,
            amount: order.amount, // paise
            currency: order.currency,
            name: "RidexShare",
            description: "Ride booking payment",
            order_id: order.orderId,
            prefill: {
                name: user.name || "",
                email: user.email || "",
                contact: user.phoneNumber || "",
            },
            theme: { color: "#0a0a0b" },
            handler: async (response) => {
                try {
                    const { data } = await verifyPayment({
                        razorpay_order_id: response.razorpay_order_id,
                        razorpay_payment_id: response.razorpay_payment_id,
                        razorpay_signature: response.razorpay_signature,
                    });
                    resolve({ ...data, order, breakdown: order.breakdown });
                } catch (err) {
                    reject({ code: "verify_failed", message: err.response?.data?.message || "Verification failed", orderId: order.orderId });
                }
            },
            modal: {
                ondismiss: () => {
                    markPaymentFailed(order.orderId, "Payment cancelled by user").catch(() => {});
                    reject({ code: "dismissed", message: "Payment cancelled", orderId: order.orderId });
                },
            },
        });
        rzp.on("payment.failed", (resp) => {
            const reason = resp?.error?.description || "Payment failed";
            markPaymentFailed(order.orderId, reason).catch(() => {});
            reject({ code: "payment_failed", message: reason, orderId: order.orderId });
        });
        rzp.open();
    });
};
