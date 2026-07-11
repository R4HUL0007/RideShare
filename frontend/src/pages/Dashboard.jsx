import React, { useEffect, useState, Suspense, lazy } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axiosInstance from "../utils/axiosConfig";
import { toast } from "react-toastify";
import Sidebar from "../components/Sidebar";
import NotificationBell from "../components/NotificationBell";
import { API_BASE_URL } from "../utils/constants";
import { fetchPendingReviews } from "../services/reviewService";
import { AssistantProvider } from "../assistant/AssistantContext";
import { clearAuthTokens } from "../utils/authToken";
import { TAB_ROUTES } from "../router";
import "../styles/dashboard.css";

// Lazy-loaded so each dark full-bleed view (and its CSS) only loads when shown.
const DashboardHome = lazy(() => import("../components/DashboardHome"));
const ProfilePage = lazy(() => import("../components/ProfilePage"));
const VehicleManager = lazy(() => import("../components/VehicleManager"));
const CreateRideForm = lazy(() => import("../components/CreateRideForm"));
const FindRides = lazy(() => import("../components/FindRides"));
const PersonalRide = lazy(() => import("../components/PersonalRide"));
const DriverRides = lazy(() => import("../components/DriverRides"));
const MyBookings = lazy(() => import("../components/MyBookings"));
const MyRides = lazy(() => import("../components/MyRides"));
const Chats = lazy(() => import("../components/Chats"));
const RideTracking = lazy(() => import("../components/RideTracking"));
const RideHistory = lazy(() => import("../components/RideHistory"));
const ReviewModal = lazy(() => import("../components/ReviewModal"));
const PaymentHistory = lazy(() => import("../components/PaymentHistory"));
const Earnings = lazy(() => import("../components/Earnings"));
const DriverVerification = lazy(() => import("../components/DriverVerification"));
const SafetyCenter = lazy(() => import("../components/SafetyCenter"));
const Support = lazy(() => import("../components/Support"));const Sustainability = lazy(() => import("../components/Sustainability"));
const AssistantWidget = lazy(() => import("../components/assistant/AssistantWidget"));

// Cancellation Timer Component
const CancellationTimer = ({ bookedAt, label = "Cancel within" }) => {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!bookedAt) return;

    const calculateTimeLeft = () => {
      const bookingTime = new Date(bookedAt);
      const currentTime = new Date();
      const timeDifference = (currentTime - bookingTime) / 1000; // seconds
      const totalSeconds = 180 - timeDifference; // 3 minutes = 180 seconds

      if (totalSeconds <= 0) {
        setTimeLeft({ expired: true });
        return;
      }

      const minutes = Math.floor(totalSeconds / 60);
      const seconds = Math.floor(totalSeconds % 60);
      setTimeLeft({ minutes, seconds, total: totalSeconds });
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [bookedAt]);

  if (!timeLeft) return null;

  if (timeLeft.expired) {
    return null; // Don't show expired state here, let the parent handle it
  }

  // Color coding: green (>2 min), yellow (1-2 min), orange (<1 min)
  const getTimerColor = () => {
    if (timeLeft.total > 120) return 'bg-green-50 border-green-200 text-green-700';
    if (timeLeft.total > 60) return 'bg-yellow-50 border-yellow-200 text-yellow-700';
    return 'bg-orange-50 border-orange-200 text-orange-700';
  };

  const isSmall = label.includes("Remove");
  
  return (
    <div className={`flex items-center gap-1.5 border rounded ${isSmall ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'} ${getTimerColor()}`}>
      <svg xmlns="http://www.w3.org/2000/svg" className={`${isSmall ? 'h-3 w-3' : 'h-4 w-4'} flex-shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="font-medium whitespace-nowrap">
        {label}: <span className={`font-bold ${isSmall ? 'text-xs' : 'text-lg'}`}>{timeLeft.minutes}:{String(timeLeft.seconds).padStart(2, '0')}</span>
      </span>
    </div>
  );
};

// Render a ride card
const RideCard = ({ ride, formatDateTime, getStatusBadgeClass, onDelete, onBook, allowBooking = false, isBooking = false, currentUserId = null, onComplete = null, onRemovePassenger = null, isCaptain = false }) => {
  return (
    <div key={ride._id} className="ride-card">
      <div className="ride-card-content">
        <div className="ride-card-header">
          <div>
            <h3 className="ride-card-title">
              {ride.source && ride.destination ? (
                <>
                  {ride.source} → {ride.destination}
                </>
              ) : (
                ride.destination
              )}
            </h3>
            <p className="ride-card-time">{formatDateTime(ride.timing)}</p>
          </div>
          <div className="flex items-center">
            <span className={`status-indicator ${ride.status.toLowerCase()}`}></span>
            <span className={`badge ${getStatusBadgeClass(ride.status)}`}>
              {ride.status}
            </span>
          </div>
        </div>
        
        {ride.vehicle_id && (
          <div className="ride-vehicle-info">
            <div className="flex items-center gap-2 mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="text-primary-600" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1"></path>
                <polygon points="12 15 17 21 7 21 12 15"></polygon>
              </svg>
              <div className="flex-1">
                <span className="font-semibold text-gray-800 text-base">
                  {ride.vehicle_id.make} {ride.vehicle_id.model} {ride.vehicle_id.year ? `(${ride.vehicle_id.year})` : ''}
                </span>
                {ride.vehicle_id.licensePlate && (
                  <div className="text-xs text-gray-500 mt-1">
                    License: <span className="font-mono font-semibold">{ride.vehicle_id.licensePlate}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-sm text-gray-600 mb-3">
              <span>{ride.vehicle_id.vehicleType}</span>
              {ride.vehicle_id.color && <span>• {ride.vehicle_id.color}</span>}
              {ride.pricePerPerson && <span>• ₹{ride.pricePerPerson}/person</span>}
            </div>
            {ride.vehicle_id.amenities && ride.vehicle_id.amenities.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">Amenities</p>
                <div className="space-y-2">
                  {ride.vehicle_id.amenities.map((amenity, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-600 flex-shrink-0"></div>
                      <span className="text-sm text-gray-700">{amenity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Captain Information */}
        {ride.user_id && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="text-primary-600" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 text-sm">
                  Captain: {ride.user_id.name}
                </p>
                {ride.user_id.phoneNumber && (
                  <div className="flex items-center gap-2 mt-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="text-gray-500" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <a 
                      href={`tel:${ride.user_id.phoneNumber}`}
                      className="text-sm text-primary-600 hover:text-primary-700 hover:underline"
                    >
                      {ride.user_id.phoneNumber}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        <div className="ride-detail-row">
          <div className="ride-detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" className="ride-detail-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {ride.gender_preference} preference
          </div>
          <div className="ride-detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" className="ride-detail-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            {ride.seatsAvailable} seat{ride.seatsAvailable !== 1 ? 's' : ''} available
          </div>
          {ride.passengers && ride.passengers.length > 0 && (
            <div className="ride-detail-item">
              <svg xmlns="http://www.w3.org/2000/svg" className="ride-detail-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              {ride.passengers.length} passenger{ride.passengers.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Passenger List - Only show for captains */}
        {isCaptain && ride.passengers && ride.passengers.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Passengers</p>
            <div className="space-y-3">
              {ride.passengers.map((passenger, idx) => {
                // Handle both old format (just ID) and new format (object with user_id)
                const passengerData = passenger.user_id || passenger;
                const passengerId = passengerData._id || passengerData;
                
                if (!passengerData || typeof passengerData === 'string') {
                  return null; // Skip if we can't get passenger data
                }

                // Check if removal is allowed (within 3 minutes of booking)
                let canRemove = true;
                let removeMessage = '';
                let bookedAtTime = null;
                
                if (passenger && typeof passenger === 'object' && passenger.bookedAt) {
                  bookedAtTime = passenger.bookedAt;
                  const bookingTime = new Date(passenger.bookedAt);
                  const currentTime = new Date();
                  const timeDifference = (currentTime - bookingTime) / 1000 / 60; // minutes
                  
                  if (timeDifference > 3) {
                    canRemove = false;
                    removeMessage = 'Removal window expired (3 min)';
                  }
                }

                return (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-md border border-gray-200 hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <svg xmlns="http://www.w3.org/2000/svg" className="text-primary-600" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="font-medium text-gray-800 text-sm truncate">{passengerData.name || 'Unknown'}</span>
                          {passengerData.phoneNumber && (
                            <>
                              <span className="text-gray-300">•</span>
                              <a 
                                href={`tel:${passengerData.phoneNumber}`}
                                className="text-xs text-primary-600 hover:text-primary-700 hover:underline font-medium truncate"
                              >
                                {passengerData.phoneNumber}
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                      {onRemovePassenger && (
                        <button
                          onClick={() => {
                            if (!canRemove) {
                              toast.error(removeMessage || "Removal window has expired. You can only remove passengers within 3 minutes of booking.");
                              return;
                            }
                            onRemovePassenger(ride._id, passengerId);
                          }}
                          className="ml-2 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                          title={!canRemove ? removeMessage : "Remove passenger"}
                          disabled={!canRemove}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                    {bookedAtTime && canRemove && (
                      <div className="pl-2">
                        <CancellationTimer bookedAt={bookedAtTime} label="Remove within" />
                      </div>
                    )}
                    {bookedAtTime && !canRemove && (
                      <div className="px-2 py-0.5 bg-red-50 border border-red-200 rounded ml-2 inline-block">
                        <span className="text-xs text-red-700 font-medium">Expired</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        <div className="ride-card-footer">
          {allowBooking ? (
            <button
              onClick={() => onBook(ride._id)}
              className="btn btn-sm btn-primary"
              disabled={ride.status !== 'Available' || ride.seatsAvailable < 1}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="mr-1" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Book Ride
            </button>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {isCaptain && onComplete && ride.status !== 'Completed' && (
              <button
                  onClick={() => onComplete(ride._id)}
                  className="btn btn-sm btn-success"
                disabled={ride.status === 'Completed'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="mr-1" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                  Complete Ride
              </button>
              )}
              {(() => {
                // Check if cancellation is allowed (within 3 minutes of booking)
                let canCancel = true;
                let cancelMessage = '';
                let bookedAtTime = null;
                
                if (isBooking && currentUserId && ride.passengers && Array.isArray(ride.passengers)) {
                  // Find the passenger booking for current user
                  const passengerBooking = ride.passengers.find(p => {
                    if (!p) return false;
                    // Handle both old format (just ID) and new format (object with user_id and bookedAt)
                    const passengerId = p.user_id?._id || p.user_id || p;
                    return passengerId && (passengerId.toString() === currentUserId || passengerId === currentUserId);
                  });
                  
                  if (passengerBooking && passengerBooking.bookedAt) {
                    bookedAtTime = passengerBooking.bookedAt;
                    const bookingTime = new Date(passengerBooking.bookedAt);
                    const currentTime = new Date();
                    const timeDifference = (currentTime - bookingTime) / 1000 / 60; // minutes
                    
                    if (timeDifference > 3) {
                      canCancel = false;
                      cancelMessage = 'Cancellation window expired (3 min)';
                    }
                  }
                }
                
                return (
                  <div className="flex flex-col gap-3">
                    {isBooking && bookedAtTime && (
                      <CancellationTimer bookedAt={bookedAtTime} />
                    )}
              <button
                      onClick={() => {
                        if (!canCancel) {
                          toast.error(cancelMessage || "Cancellation window has expired. You can only cancel within 3 minutes of booking.");
                          return;
                        }
                        onDelete(ride._id);
                      }}
                className="btn btn-sm btn-danger"
                      disabled={ride.status === 'Completed' || !canCancel}
                      title={!canCancel ? cancelMessage : ''}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="mr-1" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                      {isBooking ? 'Cancel Booking' : 'Delete'}
              </button>
              
              {/* View Route Button - for rides with coordinates */}
              {ride.sourceCoords && ride.destinationCoords && (
                <button
                  onClick={() => {
                    const url = `https://www.google.com/maps/dir/${ride.sourceCoords.lat},${ride.sourceCoords.lng}/${ride.destinationCoords.lat},${ride.destinationCoords.lng}`;
                    window.open(url, "_blank");
                  }}
                  className="btn btn-sm btn-outline"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="mr-1" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  View Route
                </button>
              )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// localStorage-backed set of reviews the user chose to "Skip For Now", so the
// auto-prompt doesn't reappear every time navigating between pages remounts the
// dashboard and re-fetches the still-pending reviews from the server.
const SKIPPED_REVIEWS_KEY = "rs-skipped-reviews";
const reviewKey = (r) => `${r?.rideId || ""}:${r?.reviewee?._id || ""}`;
const getSkippedReviews = () => {
    try { return new Set(JSON.parse(localStorage.getItem(SKIPPED_REVIEWS_KEY) || "[]")); }
    catch { return new Set(); }
};
const addSkippedReviews = (keys) => {
    try {
        const s = getSkippedReviews();
        keys.forEach((k) => s.add(k));
        localStorage.setItem(SKIPPED_REVIEWS_KEY, JSON.stringify([...s]));
    } catch { /* ignore */ }
};

const Dashboard = () => {
    const [user, setUser] = useState(null);
    const [searchResults, setSearchResults] = useState([]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    // Live ride tracking overlay (full-screen) — holds the rideId being tracked.
    const [trackingRideId, setTrackingRideId] = useState(null);

    // ---- Swipe-to-open/close the mobile sidebar ----
    // Right-swipe starting from the left edge opens the drawer; left-swipe (while
    // open) closes it. Touch-only, so desktop is unaffected. Mirrors native app
    // navigation-drawer behavior.
    useEffect(() => {
        const EDGE_PX = 28;      // how close to the left edge an "open" swipe must start
        const THRESHOLD = 55;    // min horizontal travel to count as a swipe
        let startX = null, startY = null, tracking = false;

        const onStart = (e) => {
            if (window.innerWidth > 768) return; // mobile only
            const t = e.touches[0];
            startX = t.clientX; startY = t.clientY;
            // Track an OPEN gesture only when starting near the left edge while
            // closed; track a CLOSE gesture anywhere while the drawer is open.
            tracking = sidebarOpen || startX <= EDGE_PX;
        };
        const onEnd = (e) => {
            if (!tracking || startX == null) { tracking = false; startX = null; return; }
            const t = e.changedTouches[0];
            const dx = t.clientX - startX;
            const dy = t.clientY - startY;
            // Mostly-horizontal swipe past the threshold.
            if (Math.abs(dx) > THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
                if (dx > 0 && !sidebarOpen) setSidebarOpen(true);
                else if (dx < 0 && sidebarOpen) setSidebarOpen(false);
            }
            startX = startY = null; tracking = false;
        };

        document.addEventListener("touchstart", onStart, { passive: true });
        document.addEventListener("touchend", onEnd, { passive: true });
        return () => {
            document.removeEventListener("touchstart", onStart);
            document.removeEventListener("touchend", onEnd);
        };
    }, [sidebarOpen]);

    // Queue of reviews the user still owes after completed rides. The first item
    // is surfaced as an auto-opening review modal (user can Skip).
    const [reviewQueue, setReviewQueue] = useState([]);
    const activeReview = reviewQueue[0] || null;

    // URL-based tab routing: derive active tab from current path
    const location = useLocation();
    const getTabFromPath = () => {
        const path = location.pathname.replace(/^\//, ""); // remove leading slash
        if (!path || path === "dashboard") return "home";
        const match = TAB_ROUTES.find((r) => r.path === path);
        return match ? match.tab : "home";
    };
    const activeTab = getTabFromPath();

    const [searchParams] = useState({
        destination: "",
        genderPreference: "Any",
    });

    const navigate = useNavigate();

    // Navigate to a tab by updating the URL
    const setActiveTab = (newTab) => {
        if (newTab === 'home') {
            navigate('/dashboard');
        } else {
            const route = TAB_ROUTES.find((r) => r.tab === newTab);
            navigate(route ? `/${route.path}` : '/dashboard');
        }
    };

    useEffect(() => {
        const checkAuth = async () => {
        try {
                // Try to get user info from API (cookie-based auth)
                const response = await axiosInstance.get(
                    `${API_BASE_URL}/auth/me`
                );
                
                setUser({
                    name: response.data.name,
                    email: response.data.email,
                    id: response.data._id
                });
            fetchRides();
            loadPendingReviews();
        } catch (error) {
                console.error("❌ Auth check failed:", error);
                // Refresh already attempted by the axios interceptor; reaching
                // here means the session is truly gone. Clear and bounce to login.
                clearAuthTokens();
                toast.error("Session expired. Please log in again.");
            navigate("/");
        }
        };

        checkAuth();
    }, [navigate]);

    // Verify the session is still valid (used on mount and after creating a
    // ride). Navigates to login on 401. The My Rides page fetches its own data.
    const fetchRides = async () => {
        try {
            await axiosInstance.get(`${API_BASE_URL}/rides/user-rides`);
        } catch (error) {
            if (error.response?.status === 401) {
                toast.error("Session expired. Please log in again.");
                navigate("/");
            }
        }
    };

    // Load reviews the user still owes (completed rides). Auto-opens the first
    // one as a modal; the rest are surfaced after each submit/skip.
    const loadPendingReviews = async () => {
        try {
            const { data } = await fetchPendingReviews();
            if (Array.isArray(data) && data.length > 0) {
                const skipped = getSkippedReviews();
                const pending = data.filter((r) => !skipped.has(reviewKey(r)));
                if (pending.length > 0) setReviewQueue(pending);
            }
        } catch {
            // Non-critical — silently ignore (e.g. offline or no completed rides).
        }
    };

    // Advance past the current review. On submit we pop it; on skip we clear the
    // queue AND remember the skip in localStorage so it doesn't pop up again on
    // the next page (the user can still review later from Ride History).
    const dismissActiveReview = (skip = false) => {
        setReviewQueue((prev) => {
            if (skip) {
                addSkippedReviews(prev.map(reviewKey));
                return [];
            }
            return prev.slice(1);
        });
    };

    // Book a Ride
    const bookRide = async (rideId) => {
        try {
            await axiosInstance.post(
                `${API_BASE_URL}/rides/book/${rideId}`,
                {}
            );

            toast.success("Ride booked successfully!");
            // Refresh search results after booking
            handleSearch(null, searchParams.destination, searchParams.genderPreference);
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to book ride");
        }
    };

    // Search for rides
    const handleSearch = async (e, destinationParam, genderParam) => {
        if (e) e.preventDefault();

        const destination = destinationParam || searchParams.destination;
        const genderPreference = genderParam || searchParams.genderPreference;

        try {
            const response = await axiosInstance.get(
                `${API_BASE_URL}/rides`,
                { 
                    params: {
                        destination: destination,
                        gender_preference: genderPreference
                    }
                }
            );

            setSearchResults(response.data);
            setActiveTab('searchResults');
            toast.success("Rides found successfully!");
        } catch (error) {
            console.error("❌ Search error:", error);
            toast.error(
                error.response?.data?.message || "No matching rides found."
            );
            setSearchResults([]);
        }
    };

    const formatDateTime = (dateString) => {
        const options = { 
            weekday: 'short',
            month: 'short', 
            day: 'numeric',
            hour: '2-digit', 
            minute: '2-digit'
        };
        return new Date(dateString).toLocaleString(undefined, options);
    };

    // Get status badge class based on ride status
    const getStatusBadgeClass = (status) => {
        switch(status) {
            case 'Available':
                return 'badge-success';
            case 'Booked':
                return 'badge-info';
            case 'Completed':
                return 'badge-pending';
            default:
                return 'badge-info';
        }
    };

    // Wait for the session/user to load before rendering any tab. On a hard
    // reload of a deep route (e.g. /find-rides), `user` is null until checkAuth
    // resolves — rendering tab content against a null user crashes some views
    // (caught by the ErrorBoundary, hence the "Something went wrong" screen that
    // a reload couldn't fix). If auth fails, checkAuth redirects to "/".
    if (!user) {
        return <div style={{ minHeight: "100vh", background: "#0a0a0b" }} aria-busy="true" />;
    }

    // Render the dashboard once the user is available.
    return (
        <div className="dashboard-layout">
            <Sidebar 
                user={user}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                sidebarOpen={sidebarOpen}
                setSidebarOpen={setSidebarOpen}
            />

            {/* Global notification bell — fixed top-right, present on every page. */}
            {user && (
                <div className="rs-global-bell">
                    <NotificationBell
                        user={user}
                        onNavigate={setActiveTab}
                        onTrack={setTrackingRideId}
                    />
                </div>
            )}

            {/* Global AI assistant — floating bottom-right, present on every page. */}
            {user && (
                <AssistantProvider
                    onNavigate={setActiveTab}
                    onTrack={setTrackingRideId}
                    currentPage={activeTab}
                    user={user}
                >
                    <Suspense fallback={null}>
                        <AssistantWidget />
                    </Suspense>
                </AssistantProvider>
            )}

            {activeTab === 'home' ? (
                <div className="main-content">
                    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0b' }} />}>
                        <DashboardHome
                            user={user}
                            onNavigate={setActiveTab}
                            onOpenSidebar={() => setSidebarOpen(true)}
                        />
                    </Suspense>
                </div>
            ) : activeTab === 'profile' ? (
                <div className="main-content">
                    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0b' }} />}>
                        <ProfilePage
                            onOpenSidebar={() => setSidebarOpen(true)}
                            onUserUpdated={(u) => setUser({ name: u.name, email: u.email, id: u._id })}
                            onNavigate={setActiveTab}
                        />
                    </Suspense>
                </div>
            ) : activeTab === 'myVehicle' ? (
                <div className="main-content">
                    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0b' }} />}>
                        <VehicleManager onOpenSidebar={() => setSidebarOpen(true)} />
                    </Suspense>
                </div>
            ) : activeTab === 'createRide' ? (
                <div className="main-content">
                    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0b' }} />}>
                        <CreateRideForm
                            onSuccess={fetchRides}
                            onOpenSidebar={() => setSidebarOpen(true)}
                            onNavigate={setActiveTab}
                        />
                    </Suspense>
                </div>
            ) : activeTab === 'findRides' ? (
                <div className="main-content">
                    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0b' }} />}>
                        <FindRides onOpenSidebar={() => setSidebarOpen(true)} onNavigate={setActiveTab} user={user} />
                    </Suspense>
                </div>
            ) : activeTab === 'requestRide' ? (
                <div className="main-content">
                    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0b' }} />}>
                        <PersonalRide onOpenSidebar={() => setSidebarOpen(true)} onNavigate={setActiveTab} />
                    </Suspense>
                </div>
            ) : activeTab === 'driveRequests' ? (
                <div className="main-content">
                    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0b' }} />}>
                        <DriverRides onOpenSidebar={() => setSidebarOpen(true)} onNavigate={setActiveTab} />
                    </Suspense>
                </div>
            ) : activeTab === 'myBookings' ? (
                <div className="main-content">
                    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0b' }} />}>
                        <MyBookings user={user} onOpenSidebar={() => setSidebarOpen(true)} onNavigate={setActiveTab} />
                    </Suspense>
                </div>
            ) : activeTab === 'myRides' ? (
                <div className="main-content">
                    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0b' }} />}>
                        <MyRides onOpenSidebar={() => setSidebarOpen(true)} onNavigate={setActiveTab} onTrack={setTrackingRideId} />
                    </Suspense>
                </div>
            ) : activeTab === 'chats' ? (
                <div className="main-content">
                    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0b' }} />}>
                        <Chats user={user} onOpenSidebar={() => setSidebarOpen(true)} onNavigate={setActiveTab} />
                    </Suspense>
                </div>
            ) : activeTab === 'rideHistory' ? (
                <div className="main-content">
                    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0b' }} />}>
                        <RideHistory user={user} onOpenSidebar={() => setSidebarOpen(true)} onNavigate={setActiveTab} />
                    </Suspense>
                </div>
            ) : activeTab === 'payments' ? (
                <div className="main-content">
                    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0b' }} />}>
                        <PaymentHistory onOpenSidebar={() => setSidebarOpen(true)} onNavigate={setActiveTab} />
                    </Suspense>
                </div>
            ) : activeTab === 'earnings' ? (
                <div className="main-content">
                    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0b' }} />}>
                        <Earnings onOpenSidebar={() => setSidebarOpen(true)} onNavigate={setActiveTab} />
                    </Suspense>
                </div>
            ) : activeTab === 'verification' ? (
                <div className="main-content">
                    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0b' }} />}>
                        <DriverVerification onOpenSidebar={() => setSidebarOpen(true)} onNavigate={setActiveTab} />
                    </Suspense>
                </div>
            ) : activeTab === 'safety' ? (
                <div className="main-content">
                    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0b' }} />}>
                        <SafetyCenter onOpenSidebar={() => setSidebarOpen(true)} onNavigate={setActiveTab} />
                    </Suspense>
                </div>
            ) : activeTab === 'support' ? (
                <div className="main-content">
                    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0b' }} />}>
                        <Support onOpenSidebar={() => setSidebarOpen(true)} onNavigate={setActiveTab} />
                    </Suspense>
                </div>
            ) : activeTab === 'sustainability' ? (
                <div className="main-content">
                    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0b' }} />}>
                        <Sustainability onOpenSidebar={() => setSidebarOpen(true)} />
                    </Suspense>
                </div>
            ) : (
            <div className="main-content">
                <div className="dashboard-header">
                    <div className="mobile-menu-toggle">
                        <button
                            className="p-2 rounded-md text-primary-600"
                            onClick={() => setSidebarOpen(true)}
                            aria-label="Open menu"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="3" y1="12" x2="21" y2="12"></line>
                                <line x1="3" y1="6" x2="21" y2="6"></line>
                                <line x1="3" y1="18" x2="21" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    {user && (
                        <div className="user-greeting">
                            <span>Welcome, {user.name}</span>
                        </div>
                    )}
                </div>

                <div className="container-center">
                    <div className="content-header">
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
                            {activeTab === 'findRides' && 'Find Available Rides'}
                            {activeTab === 'searchResults' && 'Search Results'}
                            {activeTab === 'myVehicle' && 'My Vehicle'}
                        </h1>
                        <p className="text-gray-600 mt-2">
                            {activeTab === 'findRides' && 'Find rides that match your requirements'}
                            {activeTab === 'searchResults' && 'Available rides matching your search'}
                            {activeTab === 'myVehicle' && 'Manage your vehicle information'}
                        </p>
                    </div>

                    <div className="dashboard-content">
                        {/* Search Results Tab */}
                        {activeTab === 'searchResults' && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="flex justify-between items-center">
                                    <h2 className="text-xl font-medium">Available Rides</h2>
                                    <button
                                        onClick={() => setActiveTab('findRides')}
                                        className="text-sm text-primary-600 hover:underline flex items-center"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="mr-1" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                        </svg>
                                        Back to Search
                                    </button>
                                </div>
                                {searchResults.length > 0 ? (
                                    <div className="ride-grid">
                                        {searchResults.map((ride) => (
                                            <RideCard 
                                                key={ride._id}
                                                ride={ride}
                                                formatDateTime={formatDateTime}
                                                getStatusBadgeClass={getStatusBadgeClass}
                                                onBook={bookRide}
                                                allowBooking={true}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="empty-state">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        <p className="mt-4 text-lg font-medium text-gray-600">No rides match your search criteria</p>
                                        <p className="mt-2 text-gray-500">Try adjusting your search parameters</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            )}

            {/* Full-screen live tracking overlay (driver or passenger). */}
            {trackingRideId && (
                <div className="rt-overlay-root">
                    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0b' }} />}>
                        <RideTracking
                            rideId={trackingRideId}
                            user={user}
                            onClose={() => setTrackingRideId(null)}
                        />
                    </Suspense>
                </div>
            )}

            {/* Auto-opening review prompt for completed rides the user hasn't rated. */}
            {activeReview && (
                <Suspense fallback={null}>
                    <ReviewModal
                        pending={activeReview}
                        onClose={() => dismissActiveReview(true)}
                        onSubmitted={() => dismissActiveReview(false)}
                    />
                </Suspense>
            )}
        </div>
    );
};

export default Dashboard;

