import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { logoutUser } from '../services/authService';
import axiosInstance from '../utils/axiosConfig';
import { API_BASE_URL } from '../utils/constants';
import { getSocket } from '../utils/socket';
import { clearAuthTokens, clearAppCaches } from '../utils/authToken';
import brandLogo from '../assets/images/RidexShare.svg';

const Sidebar = ({ user, activeTab, setActiveTab, sidebarOpen, setSidebarOpen }) => {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [driverVerified, setDriverVerified] = useState(null);
  // Collapsible nav section groups (visual carets, like the mockup).
  const [collapsed, setCollapsed] = useState({});

  const toggleSection = (key) =>
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  // Check if the user is admin
  useEffect(() => {
    let active = true;
    const checkAdmin = async () => {
      try {
        const res = await axiosInstance.get(`${API_BASE_URL}/auth/me`);
        if (active) {
          setIsAdmin(res.data?.isAdmin || false);
          setDriverVerified(Boolean(res.data?.isDriverVerified));
        }
      } catch { /* ignore */ }
    };
    if (user) checkAdmin();
    return () => { active = false; };
  }, [user]);

  // Fetch the chat unread count, then keep it live via socket events.
  useEffect(() => {
    let active = true;
    const fetchUnread = async () => {
      try {
        const res = await axiosInstance.get(`${API_BASE_URL}/chat/unread-count`);
        if (active) setUnread(res.data?.count || 0);
      } catch { /* ignore */ }
    };
    fetchUnread();

    const socket = getSocket();
    const userId = user?.id || user?._id;
    const onMsg = (msg) => {
      const receiver = msg?.receiver?._id || msg?.receiver;
      // Count only incoming messages, and not while the Chats tab is open.
      if (userId && String(receiver) === String(userId) && activeTab !== 'chats') {
        setUnread((n) => n + 1);
      }
    };
    socket.on('chat:message', onMsg);
    return () => { active = false; socket.off('chat:message', onMsg); };
  }, [user, activeTab]);

  // Clear the badge when the user opens the Chats tab.
  useEffect(() => {
    if (activeTab === 'chats') setUnread(0);
  }, [activeTab]);

  const handleLogout = async () => {
    try {
      await logoutUser();
      clearAuthTokens();
      await clearAppCaches();
      navigate("/");
      toast.info("You've been logged out");
    } catch (error) {
      console.error("Logout error:", error);
      clearAuthTokens();
      await clearAppCaches();
      navigate("/");
      toast.info("You've been logged out");
    }
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // Build initials (e.g. "RM") from the user's name for the avatar circle.
  const initials = (user?.name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'U';

  // Caret used on collapsible section headers.
  const Caret = ({ open }) => (
    <svg
      className={`nav-section-caret ${open ? 'open' : ''}`}
      xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  );

  return (
    <>
      {/* Mobile Toggle Button */}
      <button 
        className="sidebar-toggle" 
        onClick={toggleSidebar}
        aria-label="Toggle navigation menu"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>

      {/* Mobile Overlay */}
      <div 
        className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`} 
        onClick={toggleSidebar}
      ></div>

      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <button
            type="button"
            className="sidebar-logo sidebar-logo-btn"
            onClick={() => { setActiveTab('home'); setSidebarOpen(false); }}
            aria-label="Go to Home"
          >
            <span className="sidebar-logo-tile">
              <img src={brandLogo} alt="RidexShare" className="brand-logo-img" />
            </span>
            <span className="sidebar-logo-text">
              <span className="sidebar-logo-title">RidexShare</span>
              <span className="sidebar-logo-sub">Share · Ride · Connect</span>
            </span>
          </button>
          <button 
            className="sidebar-close" 
            onClick={toggleSidebar}
            aria-label="Close navigation menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        <div className="sidebar-nav">
          <div className="nav-section">
            <button type="button" className="nav-section-title" onClick={() => toggleSection('ride')}>
              RIDE MANAGEMENT
              <Caret open={!collapsed.ride} />
            </button>
            {!collapsed.ride && (
            <ul>
              <li
                className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
                onClick={() => setActiveTab('home')}
              >
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                  </svg>
                </span>
                Home
              </li>
              <li 
                className={`nav-item ${activeTab === 'createRide' ? 'active' : ''}`}
                onClick={() => setActiveTab('createRide')}
              >
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="16"></line>
                    <line x1="8" y1="12" x2="16" y2="12"></line>
                  </svg>
                </span>
                Create New Ride
              </li>
              <li 
                className={`nav-item ${activeTab === 'myRides' ? 'active' : ''}`}
                onClick={() => setActiveTab('myRides')}
              >
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </span>
                My Rides
              </li>
              <li 
                className={`nav-item ${activeTab === 'findRides' ? 'active' : ''}`}
                onClick={() => setActiveTab('findRides')}
              >
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </span>
                Find Available Rides
              </li>
              <li
                className={`nav-item ${activeTab === 'requestRide' ? 'active' : ''}`}
                onClick={() => setActiveTab('requestRide')}
              >
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 17H4a2 2 0 0 1-2-2v-3.34a2 2 0 0 1 .38-1.17l1.86-2.5A2 2 0 0 1 5.85 7H15l3.5 4.5 1.9.63A2 2 0 0 1 22 14v1a2 2 0 0 1-2 2h-1"></path>
                    <circle cx="7" cy="17" r="2"></circle>
                    <circle cx="17" cy="17" r="2"></circle>
                  </svg>
                </span>
                Request a Ride
              </li>
              {driverVerified && (
              <li
                className={`nav-item ${activeTab === 'driveRequests' ? 'active' : ''}`}
                onClick={() => setActiveTab('driveRequests')}
              >
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                    <line x1="9" y1="9" x2="9.01" y2="9"></line>
                    <line x1="15" y1="9" x2="15.01" y2="9"></line>
                  </svg>
                </span>
                Drive & Earn
              </li>
              )}
              <li 
                className={`nav-item ${activeTab === 'myBookings' ? 'active' : ''}`}
                onClick={() => setActiveTab('myBookings')}
              >
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                </span>
                My Bookings
              </li>
              <li
                className={`nav-item ${activeTab === 'chats' ? 'active' : ''}`}
                onClick={() => setActiveTab('chats')}
              >
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                </span>
                Chats
                {unread > 0 && <span className="nav-badge">{unread > 5 ? '5+' : unread}</span>}
              </li>
              <li 
                className={`nav-item ${activeTab === 'rideHistory' ? 'active' : ''}`}
                onClick={() => setActiveTab('rideHistory')}
              >
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                </span>
                Ride History
              </li>
              <li
                className={`nav-item ${activeTab === 'payments' ? 'active' : ''}`}
                onClick={() => setActiveTab('payments')}
              >
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                    <line x1="2" y1="10" x2="22" y2="10"></line>
                  </svg>
                </span>
                Payments
              </li>
              <li
                className={`nav-item ${activeTab === 'earnings' ? 'active' : ''}`}
                onClick={() => setActiveTab('earnings')}
              >
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23"></line>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                  </svg>
                </span>
                Earnings
              </li>
            </ul>
            )}
          </div>

          <div className="nav-section">
            <button type="button" className="nav-section-title" onClick={() => toggleSection('vehicle')}>
              VEHICLE
              <Caret open={!collapsed.vehicle} />
            </button>
            {!collapsed.vehicle && (
            <ul>
              <li 
                className={`nav-item ${activeTab === 'myVehicle' ? 'active' : ''}`}
                onClick={() => setActiveTab('myVehicle')}
              >
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1"></path>
                    <polygon points="12 15 17 21 7 21 12 15"></polygon>
                  </svg>
                </span>
                My Vehicle
              </li>
              <li
                className={`nav-item ${activeTab === 'verification' ? 'active' : ''}`}
                onClick={() => setActiveTab('verification')}
              >
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                    <path d="M9 12l2 2 4-4"></path>
                  </svg>
                </span>
                Verification
                <span className={`nav-dot ${driverVerified ? "ok" : "warn"}`} aria-hidden="true"></span>
              </li>
            </ul>
            )}
          </div>

          <div className="nav-section">
            <button type="button" className="nav-section-title" onClick={() => toggleSection('safety')}>
              SAFETY
              <Caret open={!collapsed.safety} />
            </button>
            {!collapsed.safety && (
            <ul>
              <li
                className={`nav-item ${activeTab === 'safety' ? 'active' : ''}`}
                onClick={() => setActiveTab('safety')}
              >
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                </span>
                Safety Center
              </li>
              <li
                className={`nav-item ${activeTab === 'support' ? 'active' : ''}`}
                onClick={() => setActiveTab('support')}
              >
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 18v-6a9 9 0 0 1 18 0v6"></path>
                    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path>
                  </svg>
                </span>
                Support
              </li>
              <li
                className={`nav-item ${activeTab === 'feedback' ? 'active' : ''}`}
                onClick={() => { setActiveTab('feedback'); setSidebarOpen(false); }}
              >
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                </span>
                Feedback
              </li>
              <li
                className={`nav-item ${activeTab === 'sustainability' ? 'active' : ''}`}
                onClick={() => setActiveTab('sustainability')}
              >
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"></path>
                    <path d="M2 21c0-3 1.85-5.36 5.08-6"></path>
                  </svg>
                </span>
                Sustainability
              </li>
            </ul>
            )}
          </div>
          
          <div className="nav-section">
            <button type="button" className="nav-section-title" onClick={() => toggleSection('account')}>
              ACCOUNT
              <Caret open={!collapsed.account} />
            </button>
            {!collapsed.account && (
            <ul>
              <li
                className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
                onClick={() => setActiveTab('profile')}
              >
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </span>
                My Profile
              </li>
              {isAdmin && (
                <li className="nav-item" onClick={() => navigate('/admin')}>
                  <span className="nav-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                    </svg>
                  </span>
                  Admin Panel
                </li>
              )}
              <li className="nav-item nav-item-logout" onClick={handleLogout}>
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                </span>
                Logout
              </li>
            </ul>
            )}
          </div>
        </div>

        {/* Bottom promo card */}
        <button
          type="button"
          className="sidebar-promo"
          onClick={() => { setActiveTab('createRide'); setSidebarOpen(false); }}
          aria-label="Create a new ride"
        >
          <span className="sidebar-promo-illu" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 17H4a2 2 0 0 1-2-2v-3.34a2 2 0 0 1 .38-1.17l1.86-2.5A2 2 0 0 1 5.85 7H15l3.5 4.5 1.9.63A2 2 0 0 1 22 14v1a2 2 0 0 1-2 2h-1"></path>
              <circle cx="7" cy="17" r="2"></circle>
              <circle cx="17" cy="17" r="2"></circle>
            </svg>
          </span>
          <span className="sidebar-promo-text">
            <strong>Share rides. Save more.</strong>
            <span>Help reduce emissions and build a better campus community.</span>
          </span>
          <span className="sidebar-promo-arrow" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </span>
        </button>
      </div>
    </>
  );
};

export default Sidebar;
