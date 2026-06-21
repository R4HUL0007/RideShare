import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import { API_BASE_URL } from "../utils/constants";

// Derive the socket server origin from the API base URL (strip a trailing /api).
const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, "");

const SocketContext = createContext({ socket: null, connected: false });

/**
 * SocketProvider — maintains a single Socket.io connection for the app and
 * joins the user's personal room (by userId) so the server can deliver
 * targeted real-time events (chat messages, read receipts, notifications).
 *
 * Pass the authenticated userId; the provider (re)joins whenever it changes.
 */
export function SocketProvider({ userId, children }) {
    const socketRef = useRef(null);
    const [connected, setConnected] = useState(false);

    if (!socketRef.current) {
        socketRef.current = io(SOCKET_URL, {
            withCredentials: true,
            autoConnect: true,
            transports: ["websocket", "polling"],
        });
    }

    useEffect(() => {
        const socket = socketRef.current;
        const onConnect = () => {
            setConnected(true);
            if (userId) socket.emit("join", userId);
        };
        const onDisconnect = () => setConnected(false);

        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);

        // If already connected when userId becomes available, join immediately.
        if (socket.connected && userId) socket.emit("join", userId);

        return () => {
            socket.off("connect", onConnect);
            socket.off("disconnect", onDisconnect);
        };
    }, [userId]);

    // Disconnect on unmount of the provider (app teardown).
    useEffect(() => {
        const socket = socketRef.current;
        return () => {
            if (socket) socket.disconnect();
        };
    }, []);

    return (
        <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
            {children}
        </SocketContext.Provider>
    );
}

export const useSocket = () => useContext(SocketContext);

/**
 * useChatSocket — subscribe to chat events with stable cleanup.
 * Handlers: { onMessage, onRead }.
 */
export function useChatSocket({ onMessage, onRead } = {}) {
    const { socket } = useSocket();
    const msgRef = useRef(onMessage);
    const readRef = useRef(onRead);
    msgRef.current = onMessage;
    readRef.current = onRead;

    useEffect(() => {
        if (!socket) return undefined;
        const handleMessage = (m) => msgRef.current?.(m);
        const handleRead = (r) => readRef.current?.(r);
        socket.on("chat:message", handleMessage);
        socket.on("chat:read", handleRead);
        return () => {
            socket.off("chat:message", handleMessage);
            socket.off("chat:read", handleRead);
        };
    }, [socket]);

    const emitJoin = useCallback((userId) => {
        if (socket && userId) socket.emit("join", userId);
    }, [socket]);

    return { emitJoin };
}

export default SocketProvider;
