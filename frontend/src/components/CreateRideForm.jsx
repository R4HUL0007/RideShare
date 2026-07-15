import { useState, useEffect } from "react";
import axiosInstance from "../utils/axiosConfig";
import { toast } from "react-toastify";
import { getUserVehicles } from "../services/vehicleService";
import ThemedSelect from "./ThemedSelect";
import PhoneVerifyBanner from "./PhoneVerifyBanner";
import MapsProvider from "./maps/MapsProvider";
import LocationSearchBox from "./maps/LocationSearchBox";
import CurrentLocationButton from "./maps/CurrentLocationButton";
import LiveRideMap from "./maps/LiveRideMap";
import { API_BASE_URL } from "../utils/constants";
import { CREATE_PREFILL_KEY } from "../assistant/AssistantContext";
import "../styles/createRide.css";

const CreateRideForm = ({ onSuccess, onOpenSidebar, onNavigate }) => {
    const [formData, setFormData] = useState({
        source: "",
        destination: "",
        date: "",
        time: "",
        seatsAvailable: 1,
        vehicle_id: "",
        pricePerPerson: "",
        sourceCoords: null,
        destinationCoords: null
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [vehicles, setVehicles] = useState([]);
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [checkingVehicle, setCheckingVehicle] = useState(true);
    // Driver verification gate — only verified drivers can publish rides.
    const [isVerified, setIsVerified] = useState(true); // optimistic; checked on mount
    // Distance/ETA lifted from the map once a route is calculated — also used
    // for the route summary panel below the map.
    const [routeMeta, setRouteMeta] = useState(null);

    // Check driver verification status on mount.
    useEffect(() => {
        let active = true;
        axiosInstance.get(`${API_BASE_URL}/auth/me`)
            .then((res) => { if (active) setIsVerified(Boolean(res.data?.isDriverVerified)); })
            .catch(() => { /* ignore */ });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        checkVehicles();
    }, []);

    // Optional: prefill from the AI assistant's conversational ride creation.
    // Reads a one-shot bridge value in localStorage, applies the text fields,
    // then clears it. Purely additive — no effect when the assistant wasn't used.
    // Runs on mount AND on the "rs-assistant-prefill-create" event so it also
    // works when the user is already sitting on the Create Ride page (the
    // component doesn't remount in that case).
    useEffect(() => {
        const applyPrefill = () => {
            try {
                const raw = localStorage.getItem(CREATE_PREFILL_KEY);
                if (!raw) return;
                localStorage.removeItem(CREATE_PREFILL_KEY);
                const p = JSON.parse(raw);
                // Ignore stale bridges (older than 5 minutes).
                if (p.ts && Date.now() - p.ts > 5 * 60 * 1000) return;
                setFormData((prev) => ({
                    ...prev,
                    source: p.source || prev.source,
                    destination: p.destination || prev.destination,
                    date: p.date || prev.date,
                    time: p.time || prev.time,
                    seatsAvailable: p.seats || prev.seatsAvailable,
                }));
                // Geocode the prefilled destination so the map can place the
                // drop marker and draw the route (the assistant only gives text).
                if (p.destination) geocodeToCoords(p.destination, "destination");
                // The assistant captures the destination but often not a pickup
                // (e.g. "create a ride to Ahmedabad tomorrow 8 AM"). When no source
                // was provided, offer to set the pickup from the user's current
                // location (only if they allow the browser permission prompt).
                if (!p.source) {
                    autofillSourceFromCurrentLocation();
                    toast.info("Pre-filled from the assistant. Allow location to set your pickup, or pick it on the map.");
                } else {
                    geocodeToCoords(p.source, "source");
                    toast.info("Pre-filled from the assistant. Set the pickup/destination on the map to finish.");
                }
            } catch { /* ignore */ }
        };
        applyPrefill();
        window.addEventListener("rs-assistant-prefill-create", applyPrefill);
        return () => window.removeEventListener("rs-assistant-prefill-create", applyPrefill);
    }, []);

    // Forward-geocode a text address (e.g. an assistant prefill like "Ahmedabad")
    // into coordinates so the map can render its marker + the route. Waits for
    // the Maps SDK to be ready, then sets both the formatted address and coords.
    const geocodeToCoords = (address, field, attempt = 0) => {
        if (!address) return;
        if (!window.google?.maps?.Geocoder) {
            if (attempt < 20) setTimeout(() => geocodeToCoords(address, field, attempt + 1), 500);
            return;
        }
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address }, (results, status) => {
            if (status === "OK" && results && results[0]) {
                const loc = results[0].geometry.location;
                const coords = { lat: loc.lat(), lng: loc.lng() };
                setFormData((prev) => ({
                    ...prev,
                    [field]: results[0].formatted_address || prev[field],
                    [`${field}Coords`]: coords,
                }));
            }
        });
    };

    // Best-effort: set the pickup from the device's current location (with the
    // user's permission). Reverse-geocodes to a readable address when the Maps
    // SDK is ready, else falls back to raw coordinates. Never overwrites a
    // pickup the user has already entered.
    const autofillSourceFromCurrentLocation = () => {
        if (!("geolocation" in navigator)) return;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                const finish = (address) => setFormData((prev) => (
                    prev.source ? prev : { ...prev, source: address, sourceCoords: coords }
                ));
                if (window.google?.maps?.Geocoder) {
                    const geocoder = new window.google.maps.Geocoder();
                    geocoder.geocode({ location: coords }, (results, status) => {
                        const address = (status === "OK" && results && results[0])
                            ? results[0].formatted_address
                            : `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
                        finish(address);
                        toast.success("Pickup set to your current location");
                    });
                } else {
                    finish(`${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
                    toast.success("Pickup set to your current location");
                }
            },
            () => { /* permission denied — leave pickup for manual entry */ },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
    };

    const checkVehicles = async () => {
        try {
            const response = await getUserVehicles();
            if (response.data && response.data.length > 0) {
                setVehicles(response.data);
                // Auto-select first vehicle
                setSelectedVehicle(response.data[0]);
                setFormData(prev => ({ ...prev, vehicle_id: response.data[0]._id }));
            } else {
                setVehicles([]);
                setSelectedVehicle(null);
            }
        } catch {
            // No vehicles found
            setVehicles([]);
            setSelectedVehicle(null);
        } finally {
            setCheckingVehicle(false);
        }
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        if (error) setError("");
    };

    // Fill the pickup field + coords from the user's detected current location.
    const handleUseCurrentLocation = ({ coords, address }) => {
        setFormData((prev) => ({
            ...prev,
            source: address || prev.source,
            sourceCoords: coords,
        }));
        if (error) setError("");
    };

    // Send the user to the My Vehicle page to register a vehicle (it has the
    // themed dark add-vehicle modal). Falls back to a toast if navigation
    // isn't wired (e.g. component used standalone).
    const goToAddVehicle = () => {
        if (onNavigate) {
            toast.info("Add a vehicle to start offering rides.");
            onNavigate("myVehicle");
        } else {
            toast.info("Please add a vehicle from the My Vehicle page first.");
        }
    };

    // ThemedSelect emits the selected value directly (not a DOM event).
    const handleVehicleSelect = (vehicleId) => {
        if (vehicleId === "add_new") {
            goToAddVehicle();
        } else {
            const vehicle = vehicles.find(v => v._id === vehicleId);
            setSelectedVehicle(vehicle);
            setFormData(prev => ({ ...prev, vehicle_id: vehicleId }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Check if vehicle is required but not set
        if (!selectedVehicle || !formData.vehicle_id) {
            toast.info("Please select a vehicle first to offer a ride.");
            goToAddVehicle();
            return;
        }

        // Both pickup and drop must be confirmed coordinates (chosen from the
        // suggestions or placed on the map) before a ride can be created.
        if (!formData.sourceCoords || !formData.destinationCoords) {
            const msg = "Please select both pickup and drop locations from the suggestions.";
            setError(msg);
            toast.error(msg);
            return;
        }

        setLoading(true);
        setError("");

        try {
            // Combine date and time into datetime
            const timing = formData.date && formData.time
                ? new Date(`${formData.date}T${formData.time}`).toISOString()
                : null;

            if (!timing) {
                toast.error("Please select both date and time");
                setLoading(false);
                return;
            }

            const submitData = {
                source: formData.source,
                destination: formData.destination,
                timing: timing,
                vehicle_id: formData.vehicle_id,
                pricePerPerson: formData.pricePerPerson ? parseFloat(formData.pricePerPerson) : null,
                seatsAvailable: Math.min(parseInt(formData.seatsAvailable) || 1, 4),
                sourceCoords: formData.sourceCoords,
                destinationCoords: formData.destinationCoords,
            };

            // Attach Google Maps route data for Smart Route Matching (optional).
            if (routeMeta?.polylineEncoded) {
                submitData.route = {
                    polyline: routeMeta.polylineEncoded,
                    distanceKm: routeMeta.distanceKm ?? null,
                    durationMin: routeMeta.durationMin ?? null,
                };
            }

            await axiosInstance.post(
                `${API_BASE_URL}/rides`,
                submitData
            );

            toast.success("🎉 Ride published! Taking you to My Rides…", { autoClose: 4000 });
            setFormData({
                source: "",
                destination: "",
                date: "",
                time: "",
                seatsAvailable: 1,
                vehicle_id: selectedVehicle?._id || "",
                pricePerPerson: "",
                sourceCoords: null,
                destinationCoords: null
            });
            // Reload the rides list, then send the driver straight to My Rides so
            // they immediately see the ride they just published. The toast lives
            // at the app root, so it stays visible across the tab switch.
            onSuccess();
            if (onNavigate) onNavigate("myRides");
        } catch (error) {
            console.error("Error creating ride:", error);

            // Driver verification gate — surface a clear message + redirect path.
            if (error.response?.status === 403 && error.response?.data?.code === "VERIFICATION_REQUIRED") {
                setIsVerified(false);
                const msg = error.response.data.message || "Driver verification is required before creating rides.";
                setError(msg);
                toast.error(msg);
                return;
            }

            // Phone verification gate — send them to Profile to verify.
            if (error.response?.data?.code === "PHONE_VERIFICATION_REQUIRED") {
                const msg = error.response.data.message || "Please verify your phone number before creating rides.";
                setError(msg);
                toast.info(`📱 ${msg}`, { autoClose: 5000 });
                setTimeout(() => { if (onNavigate) onNavigate("profile"); }, 1400);
                return;
            }

            // Any non-verification error means the ride was NOT created. Do not
            // falsely report success — surface the failure so the user can retry.
            const errorMessage =
                error.response?.data?.message || "Failed to create ride. Please try again.";
            setError(errorMessage);
            toast.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    // Calculate minimum date (today)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const minDate = `${year}-${month}-${day}`;

    // Tomorrow (for the quick-pick chip), formatted as yyyy-mm-dd.
    const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1);
    const tomorrowDate = `${tmrw.getFullYear()}-${String(tmrw.getMonth() + 1).padStart(2, '0')}-${String(tmrw.getDate()).padStart(2, '0')}`;

    // Quick setters for the Ola/Uber-style departure picker.
    const setQuickDate = (d) => setFormData((prev) => ({ ...prev, date: d }));
    const setQuickTime = (t) => setFormData((prev) => ({ ...prev, time: t }));
    const timePresets = [["08:00", "Morning"], ["14:00", "Afternoon"], ["18:00", "Evening"], ["20:00", "Night"]];

    // Human-readable "leaving" summary once both date & time are chosen.
    const departureSummary = (() => {
        if (!formData.date || !formData.time) return null;
        const dt = new Date(`${formData.date}T${formData.time}`);
        if (isNaN(dt)) return null;
        return dt.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    })();

    // Clamp the ride's offered seats to the selected vehicle's capacity (max 4).
    useEffect(() => {
        if (!selectedVehicle) return;
        const max = Math.min(Number(selectedVehicle.totalSeats) || 4, 4);
        setFormData((prev) => (Number(prev.seatsAvailable) > max ? { ...prev, seatsAvailable: max } : prev));
    }, [selectedVehicle]);

    // ---- Derived validation state (drives the disabled CTA + helper hint) ----
    const hasPickup = Boolean(formData.source) && Boolean(formData.sourceCoords);
    const hasDrop = Boolean(formData.destination) && Boolean(formData.destinationCoords);
    const hasVehicle = Boolean(formData.vehicle_id) && Boolean(selectedVehicle);
    const hasDate = Boolean(formData.date);
    const hasTime = Boolean(formData.time);
    const canSubmit = hasVehicle && hasPickup && hasDrop && hasDate && hasTime && isVerified && !loading;

    let validationHint = "";
    if (!isVerified) validationHint = "Complete driver verification to publish rides.";
    else if (!hasVehicle) validationHint = vehicles.length === 0
        ? "Register your vehicle to offer a ride."
        : "Select a vehicle to continue.";
    else if (!hasPickup) validationHint = "Choose a pickup location from the suggestions.";
    else if (!hasDrop) validationHint = "Choose a drop location from the suggestions.";
    else if (!hasDate) validationHint = "Pick a departure date.";
    else if (!hasTime) validationHint = "Pick a departure time.";

    // Show the map as soon as ANY coordinate exists (e.g. pickup from current
    // location), so the pickup marker appears immediately — like Uber/Ola.
    const showMap = Boolean(formData.sourceCoords) || Boolean(formData.destinationCoords);
    const hasRoute = Boolean(formData.sourceCoords) && Boolean(formData.destinationCoords);

    // Options for the themed (dark) dropdowns.
    const vehicleOptions = [
        ...vehicles.map(v => ({
            value: v._id,
            label: `${v.make} ${v.model}${v.year ? ` (${v.year})` : ''} — ${v.vehicleType}`
        })),
        { value: "add_new", label: "+ Add New Vehicle" }
    ];
    const seatOptions = (() => {
        const max = selectedVehicle ? Math.min(Number(selectedVehicle.totalSeats) || 4, 4) : 4;
        return Array.from({ length: max }, (_, i) => i + 1).map((n) => ({
            value: n,
            label: `${n} seat${n > 1 ? 's' : ''}`,
        }));
    })();

    const topBar = (
        <div className="cr-topbar">
            {onOpenSidebar && (
                <button
                    type="button"
                    className="cr-hamburger"
                    onClick={onOpenSidebar}
                    aria-label="Open menu"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                </button>
            )}
            <div className="cr-heading">
                <h1 className="cr-page-title">Create a Ride</h1>
                <p className="cr-subtitle">Share your journey with fellow university members</p>
            </div>
        </div>
    );

    // ---- Reusable blocks ----
    const vehicleCard = (
        <div className="cr-card">
            <h3 className="cr-section-title">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
                    <polygon points="12 15 17 21 7 21 12 15" />
                </svg>
                Vehicle
            </h3>

            {vehicles.length > 0 ? (
                <div className="cr-field">
                    <label className="cr-label" htmlFor="vehicle-select">Select Vehicle *</label>
                    <ThemedSelect
                        id="vehicle-select"
                        theme="dark"
                        value={formData.vehicle_id || ""}
                        onChange={handleVehicleSelect}
                        options={vehicleOptions}
                        placeholder="Choose a vehicle..."
                        ariaLabel="Select vehicle"
                    />
                    {selectedVehicle && (
                        <div className="cr-vehicle-pill">
                            <span aria-hidden="true">🚗</span>
                            <div>
                                <div className="cr-vp-name">
                                    {selectedVehicle.make} {selectedVehicle.model} {selectedVehicle.year ? `(${selectedVehicle.year})` : ''}
                                </div>
                                <div className="cr-vp-meta">
                                    {selectedVehicle.vehicleType} • {selectedVehicle.totalSeats} seats
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <>
                    <div className="cr-alert cr-alert-info">
                        You don't have a vehicle registered yet. Add one to start offering rides.
                    </div>
                    <button
                        type="button"
                        className="cr-submit"
                        style={{ marginTop: '0.75rem' }}
                        onClick={goToAddVehicle}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Register Vehicle
                    </button>
                </>
            )}
        </div>
    );

    const routeCard = (
        <div className="cr-card">
            <h3 className="cr-section-title">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Select Your Route
            </h3>

            <div className="cr-stack">
                <LocationSearchBox
                    label="Pickup Location"
                    placeholder="Where are you starting from?"
                    value={formData.source}
                    onChange={(value) =>
                        setFormData((prev) => ({ ...prev, source: value }))
                    }
                    onCoordinatesChange={(coords) =>
                        setFormData((prev) => ({ ...prev, sourceCoords: coords }))
                    }
                    isSource={true}
                />

                <div className="cr-currentloc">
                    <CurrentLocationButton onLocate={handleUseCurrentLocation} disabled={loading} />
                </div>

                <LocationSearchBox
                    label="Drop Location"
                    placeholder="Where are you going?"
                    value={formData.destination}
                    onChange={(value) =>
                        setFormData((prev) => ({ ...prev, destination: value }))
                    }
                    onCoordinatesChange={(coords) =>
                        setFormData((prev) => ({ ...prev, destinationCoords: coords }))
                    }
                    isSource={false}
                />
            </div>
        </div>
    );

    const tripCard = (
        <div className="cr-card">
            <h3 className="cr-section-title">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Trip Details
            </h3>

            <div className="cr-grid-2">
                {/* When are you leaving? — Ola/Uber-style departure picker */}
                <div className="cr-field cr-departure">
                    <label className="cr-label">When are you leaving? *</label>

                    <div className="cr-when-chips">
                        <button type="button" className={`cr-chip${formData.date === minDate ? " active" : ""}`} onClick={() => setQuickDate(minDate)}>Today</button>
                        <button type="button" className={`cr-chip${formData.date === tomorrowDate ? " active" : ""}`} onClick={() => setQuickDate(tomorrowDate)}>Tomorrow</button>
                        <div className="cr-when-date">
                            <span className="cr-input-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </span>
                            <input
                                id="date" type="date" name="date"
                                value={formData.date} onChange={handleChange}
                                min={minDate} max={tomorrowDate} className="cr-input has-icon" required
                                aria-label="Departure date"
                                onKeyDown={(e) => e.preventDefault()}
                                onPaste={(e) => e.preventDefault()}
                            />
                        </div>
                    </div>

                    <div className="cr-when-chips" style={{ marginTop: "0.6rem" }}>
                        {timePresets.map(([val, label]) => (
                            <button type="button" key={val} className={`cr-chip${formData.time === val ? " active" : ""}`} onClick={() => setQuickTime(val)}>{label}</button>
                        ))}
                        <div className="cr-when-date">
                            <span className="cr-input-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </span>
                            <input
                                id="time" type="time" name="time"
                                value={formData.time} onChange={handleChange}
                                className="cr-input has-icon" required
                                aria-label="Departure time"
                            />
                        </div>
                    </div>

                    {departureSummary && (
                        <div className="cr-when-summary">🕒 Leaving {departureSummary}</div>
                    )}
                </div>

                {/* Available seats */}
                <div className="cr-field">
                    <label htmlFor="seats-select" className="cr-label">Available Seats *</label>
                    <ThemedSelect
                        id="seats-select"
                        theme="dark"
                        value={formData.seatsAvailable}
                        onChange={(value) =>
                            setFormData((prev) => ({ ...prev, seatsAvailable: value }))
                        }
                        options={seatOptions}
                        ariaLabel="Available seats"
                    />
                    {selectedVehicle && (
                        <p className="cr-hint">Based on your {selectedVehicle.vehicleType?.toLowerCase() || "vehicle"} ({selectedVehicle.totalSeats} seats)</p>
                    )}
                </div>

                {/* Cost per seat (optional) */}
                <div className="cr-field">
                    <label htmlFor="pricePerPerson" className="cr-label">Cost Per Seat (₹) — Optional</label>
                    <div className="cr-input-wrap">
                        <span className="cr-input-icon">₹</span>
                        <input
                            id="pricePerPerson"
                            type="number"
                            name="pricePerPerson"
                            value={formData.pricePerPerson}
                            onChange={handleChange}
                            placeholder="e.g., 50 (optional)"
                            className="cr-input has-icon"
                            min="0"
                            step="1"
                        />
                    </div>
                    <p className="cr-hint">Leave empty if the ride is free.</p>
                </div>
            </div>
        </div>
    );

    // ---- Right column: live route preview (map + summary + tip) ----
    const previewPanel = (
        <div className="cr-card cr-preview">
            <h3 className="cr-section-title">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Route Preview
            </h3>

            {showMap ? (
                <div className="cr-map-wrap">
                    <LiveRideMap
                        sourceCoords={formData.sourceCoords}
                        destinationCoords={formData.destinationCoords}
                        source={formData.source}
                        destination={formData.destination}
                        pricePerPerson={formData.pricePerPerson}
                        onRouteInfo={setRouteMeta}
                        onSourceCoordsChange={(coords) =>
                            setFormData((prev) => ({ ...prev, sourceCoords: coords }))
                        }
                        onDestinationCoordsChange={(coords) =>
                            setFormData((prev) => ({ ...prev, destinationCoords: coords }))
                        }
                        onSourceAddressChange={(address) =>
                            setFormData((prev) => ({ ...prev, source: address }))
                        }
                        onDestinationAddressChange={(address) =>
                            setFormData((prev) => ({ ...prev, destination: address }))
                        }
                    />
                </div>
            ) : (
                <div className="cr-preview-empty">
                    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="cr-preview-empty-text">Pick your pickup and drop locations to see the route here.</p>
                </div>
            )}

            {hasRoute && (
                <div className="cr-preview-summary">
                    <div className="cr-summary-route">
                        <div className="cr-summary-line">
                            <span className="cr-dot pickup" />
                            <div className="cr-summary-addr">
                                <span className="cr-summary-k">Pickup</span>
                                <span className="cr-summary-v" title={formData.source}>{formData.source || '—'}</span>
                            </div>
                        </div>
                        <div className="cr-summary-connector" />
                        <div className="cr-summary-line">
                            <span className="cr-dot drop" />
                            <div className="cr-summary-addr">
                                <span className="cr-summary-k">Destination</span>
                                <span className="cr-summary-v" title={formData.destination}>{formData.destination || '—'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="cr-summary-stats">
                        <div className="cr-summary-stat">
                            <span className="cr-summary-k">Distance</span>
                            <span className="cr-summary-stat-v">{routeMeta?.distance || '—'}</span>
                        </div>
                        <div className="cr-summary-stat">
                            <span className="cr-summary-k">Est. Time</span>
                            <span className="cr-summary-stat-v">{routeMeta?.duration || '—'}</span>
                        </div>
                        <div className="cr-summary-stat">
                            <span className="cr-summary-k">Vehicle</span>
                            <span className="cr-summary-stat-v">
                                {selectedVehicle ? `${selectedVehicle.make} ${selectedVehicle.model}` : '—'}
                            </span>
                        </div>
                        <div className="cr-summary-stat">
                            <span className="cr-summary-k">Seats</span>
                            <span className="cr-summary-stat-v">
                                {formData.seatsAvailable} seat{Number(formData.seatsAvailable) !== 1 ? 's' : ''}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            <div className="cr-tip">
                <span className="cr-tip-icon" aria-hidden="true">💡</span>
                <span>Add accurate details to get more ride requests and ensure a smooth experience.</span>
            </div>
        </div>
    );

    // ---- Body: spinner → main form ----
    let body;
    if (checkingVehicle) {
        body = (
            <div className="cr-card" style={{ display: 'flex', justifyContent: 'center', padding: '2.5rem' }}>
                <div className="cr-spin" style={{ width: '2rem', height: '2rem', border: '3px solid rgba(255,255,255,0.18)', borderTopColor: '#f4f4f5', borderRadius: '50%' }} />
            </div>
        );
    } else {
        body = (
            <form onSubmit={handleSubmit} className="cr-layout">
                {error && <div className="cr-alert cr-alert-error cr-span-2">{error}</div>}

                {/* ---- Phone verification banner (only when enforced) ---- */}
                <PhoneVerifyBanner action="publish rides" onNavigate={onNavigate} className="cr-span-2" />

                {/* ---- Driver verification banner ---- */}
                {!isVerified && (
                    <div className="cr-verify-banner cr-span-2">
                        <div className="cr-verify-banner-main">
                            <span className="cr-verify-icon" aria-hidden="true">🛡️</span>
                            <div>
                                <h3 className="cr-verify-title">Driver verification required</h3>
                                <p className="cr-verify-text">
                                    Complete your verification to publish rides and build trust with riders.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            className="cr-submit cr-verify-btn"
                            onClick={() => (onNavigate ? onNavigate("verification") : null)}
                        >
                            Complete Verification
                        </button>
                    </div>
                )}

                {/* ---- Left column: the form ---- */}
                <div className="cr-form-col">
                    {/* Vehicle first — the rest of the form is gated behind
                        having a vehicle selected/registered (can't set a route,
                        timing or price without a vehicle to offer). */}
                    {vehicleCard}

                    {hasVehicle && (
                    <>
                    {routeCard}
                    {tripCard}

                    {/* ---- Submit ---- */}
                    <div className="cr-actions">
                        {!canSubmit && validationHint && (
                            <p className="cr-hint" style={{ marginBottom: '0.5rem', textAlign: 'center' }}>
                                {validationHint}
                            </p>
                        )}
                        <button type="submit" className="cr-submit" disabled={!canSubmit}>
                            {loading ? (
                                <>
                                    <svg className="cr-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
                                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                                    </svg>
                                    Creating...
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                    </svg>
                                    Create Ride
                                </>
                            )}
                        </button>
                    </div>
                    </>
                    )}

                    {/* No vehicle → gate the route/timing/price behind it. */}
                    {!hasVehicle && (
                        <div className="cr-card">
                            <p className="cr-hint" style={{ textAlign: "center", margin: 0 }}>
                                {vehicles.length === 0
                                    ? "Register a vehicle above to set your route, timing and price."
                                    : "Select a vehicle above to continue."}
                            </p>
                        </div>
                    )}
                </div>

                {/* ---- Right column: route preview ---- */}
                <aside className="cr-preview-col">
                    {previewPanel}
                </aside>
            </form>
        );
    }

    return (
        <MapsProvider>
            <div className="cr-root">
                {topBar}
                <div className="cr-shell cr-rise">
                    {body}
                </div>
            </div>
        </MapsProvider>
    );
};

export default CreateRideForm;
