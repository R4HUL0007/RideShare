import { io } from "socket.io-client";
import { API_BASE_URL } from "./constants";
import { getToken } from "./authToken";

// Socket.io server origin = API base URL without the trailing /api path.
const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, "");

let socket = null;
let joinedUserId = null;

/**
 * Get (or lazily create) the shared Socket.io client. A single connection is
 * reused across the app to avoid duplicate sockets and re-renders. The JWT is
 * sent in the handshake so the server can authenticate the socket (the cookie
 * is also sent for same-origin, but the token covers cross-origin too).
 */
export function getSocket() {
    if (!socket) {
        socket = io(SOCKET_URL, {
            withCredentials: true,
            autoConnect: true,
            transports: ["websocket", "polling"],
            auth: (cb) => cb({ token: getToken() || undefined }),
        });
    }
    return socket;
}

/**
 * Announce this user to the server so it can map userId -> socket id (matches
 * the backend `socket.on("join", userId)` contract). Re-joins on reconnect.
 */
export function joinChat(userId) {
    if (!userId) return;
    const s = getSocket();
    joinedUserId = userId;
    const emitJoin = () => s.emit("join", userId);
    if (s.connected) emitJoin();
    s.on("connect", emitJoin);
}

// Generic alias — used by features beyond chat (e.g. live tracking).
export const joinUser = joinChat;

export function getJoinedUserId() {
    return joinedUserId;
}
