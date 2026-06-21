import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import axiosInstance from "../utils/axiosConfig";
import { API_BASE_URL } from "../utils/constants";
import { processMessage, defaultSuggestions } from "./engine";
import { aiChat } from "../services/aiService";
import { getPageContext } from "./pageContext";

// localStorage key for the prefill bridge that Create Ride optionally reads.
export const CREATE_PREFILL_KEY = "rs_assistant_create_prefill";
const HISTORY_KEY = "rs_assistant_history";
// Stable per-tab session id so the backend agent can keep conversation memory.
const SESSION_KEY = "rs_assistant_session";
function getSessionId() {
    try {
        let sid = sessionStorage.getItem(SESSION_KEY);
        if (!sid) {
            sid = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            sessionStorage.setItem(SESSION_KEY, sid);
        }
        return sid;
    } catch {
        return "default";
    }
}

const AssistantContext = createContext(null);
export const useAssistant = () => useContext(AssistantContext);

let idSeq = 0;
const mkId = () => `m${Date.now()}_${idSeq++}`;
const botMsg = (patch) => ({ id: mkId(), role: "bot", text: "", ...patch });
const userMsg = (text) => ({ id: mkId(), role: "user", text });

// Normalize a backend AI card into the widget's RideCard shape. Ride/search
// cards pass through; booking/myride cards split their "A → B" route. Cards
// that can't be rendered as a ride card (e.g. payments) are dropped (their
// details are already summarized in the reply text).
function normalizeCard(c) {
    if (!c) return null;
    if (c.source && c.destination) {
        return { id: c.id, source: c.source, destination: c.destination, driver: c.driver, vehicle: c.vehicle, seats: c.seats, timing: c.timing, price: c.price };
    }
    if (c.route && String(c.route).includes("→")) {
        const [source, destination] = String(c.route).split("→").map((s) => s.trim());
        return { id: c.id, source, destination, driver: c.driver || "", vehicle: "", seats: c.seatsAvailable ?? c.seats, timing: c.timing, price: c.price };
    }
    return null;
}

/**
 * AssistantProvider — global state + the bridge between the pure engine and the
 * platform. Runtime side-effects (navigation, tracking, ride search) are passed
 * in as props so the engine stays framework/IO-free.
 *
 * props:
 *   onNavigate(tab)   — switch dashboard tab
 *   onTrack(rideId)   — open live tracking overlay
 *   currentPage       — active tab (for context-awareness)
 *   user              — { name, id }
 */
export function AssistantProvider({ children, onNavigate, onTrack, currentPage = "home", user }) {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [session, setSession] = useState({});
    const [busy, setBusy] = useState(false);
    const pageRef = useRef(currentPage);
    pageRef.current = currentPage;

    // Restore recent conversation (last session) once.
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "null");
            if (saved && Array.isArray(saved.messages)) {
                setMessages(saved.messages.slice(-40));
                setSession(saved.session || {});
            }
        } catch { /* ignore */ }
    }, []);

    // Persist (debounced-ish: on every change, cheap enough at this size).
    useEffect(() => {
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify({ messages: messages.slice(-40), session }));
        } catch { /* ignore */ }
    }, [messages, session]);

    const pushBot = useCallback((patch) => setMessages((m) => [...m, botMsg(patch)]), []);

    // Allow any part of the app to open the assistant via a window event
    // (e.g. the Safety Center "Need help?" support button).
    useEffect(() => {
        const onOpen = () => setOpen(true);
        window.addEventListener("rs-assistant-open", onOpen);
        return () => window.removeEventListener("rs-assistant-open", onOpen);
    }, []);

    // Execute a tool action emitted by the engine (or tapped by the user).
    const runAction = useCallback(async (action) => {
        if (!action) return;
        switch (action.tool) {
            case "navigate":
                onNavigate?.(action.args?.tab);
                setOpen(false);
                return;

            case "prefillCreateRide": {
                try {
                    localStorage.setItem(CREATE_PREFILL_KEY, JSON.stringify({ ...action.args, ts: Date.now() }));
                } catch { /* ignore */ }
                toast.info("Opening Create Ride with your details pre-filled.");
                onNavigate?.("createRide");
                // If the user is *already* on the Create Ride page the component
                // won't remount, so notify it to re-read the prefill bridge live.
                try { window.dispatchEvent(new CustomEvent("rs-assistant-prefill-create")); } catch { /* ignore */ }
                setOpen(false);
                return;
            }

            case "openTracking": {
                setBusy(true);
                try {
                    let rideId = action.args?.rideId;
                    if (!rideId) {
                        // Find an active (confirmed, coords-bearing) booking to track.
                        const { data } = await axiosInstance.get(`${API_BASE_URL}/rides/my-bookings`);
                        const list = Array.isArray(data) ? data : [];
                        const active = list.find((r) =>
                            r.status !== "Completed" && r.status !== "Cancelled" &&
                            r.sourceCoords?.lat != null && r.destinationCoords?.lat != null);
                        rideId = active?._id;
                    }
                    if (rideId && onTrack) {
                        onTrack(rideId);
                        setOpen(false);
                    } else {
                        pushBot({ text: "I couldn't find an active ride to track right now. You can start tracking from a confirmed booking in My Bookings.", actions: [{ label: "Open My Bookings", tool: "navigate", args: { tab: "myBookings" } }] });
                    }
                } catch {
                    pushBot({ text: "Couldn't load your rides to track. Try opening My Bookings.", actions: [{ label: "Open My Bookings", tool: "navigate", args: { tab: "myBookings" } }] });
                } finally { setBusy(false); }
                return;
            }

            case "searchRides": {
                setBusy(true);
                try {
                    const params = { destination: action.args?.destination, gender_preference: "Any" };
                    if (action.args?.date) params.timing = action.args.date;
                    const res = await axiosInstance.get(`${API_BASE_URL}/rides`, { params });
                    const rides = Array.isArray(res.data) ? res.data : [];
                    if (rides.length === 0) {
                        pushBot({ text: `No rides found to ${action.args?.destination} right now. Want me to broadcast a request? Nearby verified drivers get alerted and your ride is created automatically when one accepts.`, actions: [{ label: `Request a ride to ${action.args?.destination || "there"}`, tool: "navigate", args: { tab: "requestRide" }, primary: true }, { label: "Open Find Rides", tool: "navigate", args: { tab: "findRides" } }] });
                    } else {
                        pushBot({
                            text: `Found ${rides.length} ride${rides.length > 1 ? "s" : ""} to ${action.args?.destination}:`,
                            cards: rides.slice(0, 5).map((r) => ({
                                id: r._id,
                                source: r.source, destination: r.destination,
                                driver: r.user_id?.name || "Driver",
                                vehicle: r.vehicle_id ? `${r.vehicle_id.make || ""} ${r.vehicle_id.model || ""}`.trim() : "—",
                                seats: r.seatsAvailable, timing: r.timing,
                                price: r.pricePerPerson,
                            })),
                            actions: [{ label: "Open Find Rides", tool: "navigate", args: { tab: "findRides" } }],
                        });
                    }
                } catch (e) {
                    if (e.response?.status === 404) {
                        pushBot({ text: `No rides found to ${action.args?.destination} right now. Want me to broadcast a request to nearby drivers?`, actions: [{ label: `Request a ride to ${action.args?.destination || "there"}`, tool: "navigate", args: { tab: "requestRide" }, primary: true }, { label: "Open Find Rides", tool: "navigate", args: { tab: "findRides" } }] });
                    } else {
                        pushBot({ text: "Couldn't search rides just now. Try the Find Rides page.", actions: [{ label: "Open Find Rides", tool: "navigate", args: { tab: "findRides" } }] });
                    }
                } finally { setBusy(false); }
                return;
            }

            case "bookRide": {
                const rideId = action.args?.rideId;
                const seats = action.args?.seats || 1;
                if (!rideId) {
                    pushBot({ text: "I couldn't tell which ride to book. Try searching again, then say \"book the first one\".", actions: [{ label: "Open Find Rides", tool: "navigate", args: { tab: "findRides" } }] });
                    return;
                }
                setBusy(true);
                try {
                    await axiosInstance.post(`${API_BASE_URL}/rides/book/${rideId}`, { seats });
                    pushBot({ text: `✅ Booked ${seats} seat${seats > 1 ? "s" : ""}! You can view it in My Bookings or track it once the ride starts.`, actions: [{ label: "Open My Bookings", tool: "navigate", args: { tab: "myBookings" }, primary: true }] });
                } catch (e) {
                    pushBot({ text: e.response?.data?.message || "Couldn't complete the booking. Please try from the Find Rides page.", actions: [{ label: "Open Find Rides", tool: "navigate", args: { tab: "findRides" } }] });
                } finally { setBusy(false); }
                return;
            }

            default:
                return;
        }
    }, [onNavigate, onTrack, pushBot]);

    // Core: send a user message through the backend AI agent, with a local
    // rule-based fallback so the assistant always works (offline / API down).
    const send = useCallback(async (text) => {
        const clean = (text || "").trim();
        if (!clean || busy) return;
        setMessages((m) => [...m, userMsg(clean)]);
        setBusy(true);

        let result;
        let autoActions = [];
        try {
            // Primary path: backend AI agent (LangChain/RAG/tools + memory).
            const data = await aiChat(clean, getSessionId());
            result = {
                reply: data.reply,
                actions: data.actions || [],
                suggestions: data.suggestions || [],
                cards: (data.cards || []).map(normalizeCard).filter(Boolean),
                sources: data.sources || [],
            };
            autoActions = (data.actions || []).filter((a) => a.auto);
            const shown = (data.actions || []).filter((a) => !a.auto);
            pushBot({ text: result.reply, actions: shown, suggestions: result.suggestions, cards: result.cards, sources: result.sources });
        } catch (err) {
            // Fallback path: local deterministic engine (existing behavior).
            await new Promise((r) => setTimeout(r, 200));
            let local;
            try {
                local = processMessage(clean, { page: pageRef.current, session });
            } catch {
                local = { reply: "Something went wrong understanding that. Mind rephrasing?", actions: [], suggestions: defaultSuggestions(), cards: [], session: {} };
            }
            setSession(local.session || {});
            autoActions = (local.actions || []).filter((a) => a.auto);
            const shown = (local.actions || []).filter((a) => !a.auto);
            pushBot({ text: local.reply, actions: shown, suggestions: local.suggestions, cards: local.cards });
        }
        setBusy(false);

        // Auto-run actions flagged by the engine (e.g. immediate ride search).
        for (const a of autoActions) {
            await runAction(a);
        }
    }, [busy, session, pushBot, runAction]);

    const clear = useCallback(() => {
        setMessages([]);
        setSession({});
        try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
    }, []);

    const toggle = useCallback(() => setOpen((o) => !o), []);

    const value = useMemo(() => ({
        open, setOpen, toggle,
        messages, busy, send, runAction, clear,
        page: currentPage,
        pageContext: getPageContext(currentPage),
        user,
    }), [open, toggle, messages, busy, send, runAction, clear, currentPage, user]);

    return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}
