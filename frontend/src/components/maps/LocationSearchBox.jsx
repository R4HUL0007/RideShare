import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMaps } from './MapsProvider';
import { getRecent, addRecent, removeRecent, clearRecent } from '../../services/recentSearchService';

const LocationSearchBox = ({ 
    label, 
    placeholder, 
    value, 
    onChange, 
    onCoordinatesChange,
    // isSource is accepted for API compatibility but not currently used
    // eslint-disable-next-line no-unused-vars
    isSource = false 
}) => {
    // Shared Google Maps SDK status — drives the load-failure message (Req 2.2).
    const { loadError } = useMaps();

    const inputRef = useRef(null);
    const sessionTokenRef = useRef(null);
    const [isFocused, setIsFocused] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
    // Selection-time error, e.g. a place with no usable geometry (Req 4.3).
    const [error, setError] = useState('');
    // Recent Location Searches (per-account quick picks). Loaded lazily on the
    // first focus of an empty input; entirely additive and degrades to [] on any
    // failure so the existing autocomplete behavior is never affected.
    const [recent, setRecent] = useState([]);
    const [recentLoaded, setRecentLoaded] = useState(false);

    // Lazily load the user's recent places once (on first empty focus).
    const loadRecent = async () => {
        if (recentLoaded) return;
        setRecentLoaded(true);
        const items = await getRecent();
        setRecent(Array.isArray(items) ? items : []);
    };

    const handleFocus = () => {
        setIsFocused(true);
        if (!value) loadRecent();
    };

    // Pick a recent place: fill label + emit coords WITHOUT another geocode,
    // then bump it to the top (fire-and-forget).
    const handleRecentSelect = (entry) => {
        const c = entry?.coords || {};
        onChange(entry?.label || '');
        setSuggestions([]);
        setIsFocused(false);
        if (Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
            onCoordinatesChange({ lat: c.lat, lng: c.lng });
            addRecent({ label: entry.label, placeId: entry.placeId || '', lat: c.lat, lng: c.lng })
                .then((items) => { if (Array.isArray(items) && items.length) setRecent(items); })
                .catch(() => { /* swallow */ });
        }
    };

    const handleRemoveRecent = (e, id) => {
        e.preventDefault();
        e.stopPropagation();
        setRecent((r) => r.filter((x) => x._id !== id));
        removeRecent(id).catch(() => { /* swallow */ });
    };

    const handleClearRecent = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setRecent([]);
        clearRecent().catch(() => { /* swallow */ });
    };

    // Initialize session token on mount
    useEffect(() => {
        if (window.google && window.google.maps.places) {
            sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
        }
    }, []);

    // Recalculate dropdown position whenever focus state or value changes, and
    // keep it aligned while the page scrolls/resizes (the dropdown is a fixed,
    // viewport-positioned portal, so stale coordinates would misplace it).
    useEffect(() => {
        if (!isFocused) return;
        const reposition = () => {
            if (!inputRef.current) return;
            const rect = inputRef.current.getBoundingClientRect();
            setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
        };
        reposition();
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
        return () => {
            window.removeEventListener('scroll', reposition, true);
            window.removeEventListener('resize', reposition);
        };
    }, [isFocused, value]);

    // Debounced autocomplete search — relies on parent LoadScript
    useEffect(() => {
        if (!value || !window.google) {
            setSuggestions([]);
            setIsLoading(false);
            return;
        }

        const timer = setTimeout(() => {
            const service = new window.google.maps.places.AutocompleteService();
            setIsLoading(true);

            service.getPlacePredictions(
                {
                    input: value,
                    componentRestrictions: { country: 'in' },
                    sessionToken: sessionTokenRef.current
                },
                (predictions) => {
                    setSuggestions(predictions || []);
                    setIsLoading(false);
                }
            );
        }, 300);

        return () => clearTimeout(timer);
    }, [value]);

    const handlePlaceSelect = (prediction) => {
        if (!prediction) return;

        // Fill the field immediately so the click feels responsive.
        const displayText =
            prediction.structured_formatting?.main_text ||
            prediction.main_text ||
            prediction.description;

        onChange(displayText);
        setSuggestions([]);
        setIsFocused(false);

        // Guard against the SDK being unavailable (loadError or not yet loaded).
        if (!window.google || !window.google.maps) {
            setError('Please select a valid location from the dropdown');
            return;
        }

        // Issue a fresh session token after a completed selection so the next
        // autocomplete sequence is clean, regardless of geocode outcome (Req 4.4).
        const issueNewToken = () => {
            if (window.google && window.google.maps.places) {
                sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
            }
        };

        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ placeId: prediction.place_id }, (results) => {
            const location = results && results[0] && results[0].geometry?.location;

            if (location) {
                // Successful selection with usable geometry (Req 4.2).
                setError('');
                onCoordinatesChange({
                    lat: location.lat(),
                    lng: location.lng()
                });
                // Record for recent places — fire-and-forget, AFTER the emit so
                // it can never affect the existing selection behavior.
                addRecent({ label: displayText, placeId: prediction.place_id || '', lat: location.lat(), lng: location.lng() })
                    .then((items) => { if (Array.isArray(items) && items.length) { setRecent(items); setRecentLoaded(true); } })
                    .catch(() => { /* swallow */ });
            } else {
                // No usable geometry — surface a clear message and emit nothing bad (Req 4.3).
                setError('Please select a valid location from the dropdown');
            }

            // Reset session token after a completed selection for the next search (Req 4.4).
            issueNewToken();
        });
    };

    const handleInputChange = (e) => {
        // Clear any prior selection error once the user edits the input again.
        if (error) setError('');
        onChange(e.target.value);
    };

    const clearInput = () => {
        onChange('');
        onCoordinatesChange(null);
        setSuggestions([]);
        setError('');
        if (inputRef.current) inputRef.current.focus();
    };

    const dropdownContent = (items, emptyState = false) => {
        if (!isFocused) return null;

        const baseStyle = {
            position: 'fixed',
            top: `${dropdownPos.top}px`,
            left: `${dropdownPos.left}px`,
            width: `${dropdownPos.width}px`,
            zIndex: 2147483647,
        };

        return createPortal(
            emptyState ? (
                <div style={baseStyle} className="location-suggestions-dropdown p-4">
                    <p className="text-gray-500 text-sm text-center">No locations found</p>
                </div>
            ) : (
                <div style={baseStyle} className="location-suggestions-dropdown">
                    {items}
                </div>
            ),
            document.body
        );
    };

    return (
        <div className="lsb-root relative w-full">
            {/* Label */}
            <label className="lsb-label text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="flex-shrink-0"
                    width="16"
                    height="16"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {label}
            </label>

            {/* SDK load failure — disable input and surface a clear message (Req 2.2). */}
            {loadError ? (
                <div className="relative w-full">
                    <input
                        type="text"
                        value={value}
                        placeholder={placeholder}
                        disabled
                        autoComplete="off"
                        className="lsb-input w-full px-4 py-3 pr-10 border-2 border-gray-200 rounded-lg bg-gray-100 text-gray-400 text-sm cursor-not-allowed"
                        style={{ boxSizing: 'border-box' }}
                    />
                    <div className="mt-1 text-xs text-red-600" role="alert">
                        Location service unavailable
                    </div>
                </div>
            ) : (
            /* Input wrapper — overflow:visible so the fixed dropdown is never clipped */
            <div className="lsb-field relative w-full" style={{ overflow: 'visible' }}>
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                    placeholder={placeholder}
                    autoComplete="off"
                    className="lsb-input w-full px-4 py-3 pr-10 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-colors bg-white text-sm"
                    style={{ boxSizing: 'border-box' }}
                />

                {/* Inline icons: loading spinner OR clear button */}
                <div className="lsb-input-icons absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {isLoading && (
                        <div
                            className="border-2 border-blue-500 border-t-transparent rounded-full"
                            style={{ width: '16px', height: '16px', animation: 'spin 0.8s linear infinite' }}
                        />
                    )}
                    {value && !isLoading && (
                        <button
                            type="button"
                            onClick={clearInput}
                            className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                            aria-label="Clear location"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* Recent places quick-pick — shown when the input is empty and
                    the user has recent selections (Uber/Ola-style). Hidden as
                    soon as the user types (autocomplete takes over below). */}
                {isFocused && !value && recent.length > 0 && dropdownContent(
                    <>
                        <div className="lsb-recent-head">Recent</div>
                        {recent.map((entry) => (
                            <div
                                key={entry._id}
                                className="location-suggestion-item lsb-recent-row"
                                role="button"
                                tabIndex={0}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleRecentSelect(entry)}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="text-gray-400 flex-shrink-0" width="16" height="16" style={{ marginTop: '2px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <circle cx="12" cy="12" r="9" strokeWidth={2} />
                                    <polyline points="12 7 12 12 15 14" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <div className="location-suggestion-text">
                                    <p className="location-suggestion-main">{entry.label}</p>
                                </div>
                                <button
                                    type="button"
                                    className="lsb-recent-x"
                                    aria-label="Remove recent place"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={(e) => handleRemoveRecent(e, entry._id)}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            className="lsb-recent-clear"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={handleClearRecent}
                        >
                            Clear recent
                        </button>
                    </>
                )}

                {/* Suggestions Dropdown — rendered in a portal so it stays above the dashboard */}
                {isFocused && suggestions.length > 0 && dropdownContent(
                    suggestions.map((suggestion) => {
                        const mainText =
                            suggestion.structured_formatting?.main_text ||
                            suggestion.main_text ||
                            suggestion.description;
                        const secondaryText =
                            suggestion.structured_formatting?.secondary_text ||
                            suggestion.secondary_text ||
                            '';

                        return (
                            <button
                                key={suggestion.place_id}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handlePlaceSelect(suggestion)}
                                className="location-suggestion-item"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="text-gray-400 flex-shrink-0"
                                    width="16"
                                    height="16"
                                    style={{marginTop: '2px'}}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                </svg>
                                <div className="location-suggestion-text">
                                    <p className="location-suggestion-main">{mainText}</p>
                                    {secondaryText && (
                                        <p className="location-suggestion-secondary">{secondaryText}</p>
                                    )}
                                </div>
                            </button>
                        );
                    })
                )}

                {/* No results message */}
                {isFocused && value && suggestions.length === 0 && !isLoading && dropdownContent(null, true)}

                {/* Selection-time error, e.g. a place with no usable geometry (Req 4.3). */}
                {error && (
                    <div className="mt-1 text-xs text-red-600" role="alert">
                        {error}
                    </div>
                )}
            </div>
            )}
        </div>
    );
};

export default LocationSearchBox;
