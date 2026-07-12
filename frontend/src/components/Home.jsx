import { useState } from 'react';
import { Link } from 'react-router-dom';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import Footer from './public/Footer';
import carImg from '../assets/images/Car.png';
import brandLogo from '../assets/images/RidexShare.svg';
import '../styles/Home.css';
import '../styles/public.css';

const Home = () => {
    const [activeTab, setActiveTab] = useState('login');

    return (
        <div className="landing">
        <header className="landing-nav">
            <Link to="/" className="pub-brand">
                <img src={brandLogo} alt="RidexShare" />
                <span>RidexShare</span>
            </Link>
            <nav className="landing-nav-links">
                <a href="#how">How it works</a>
                <Link to="/about" className="landing-nav-about">About</Link>
                <Link to="/privacy">Privacy</Link>
                <Link to="/terms">Terms</Link>
            </nav>
        </header>
        <div className="home-container">
            <div className="form-container">
                <div className="logo-section">
                    <div className="logo-icon">
                        <img src={brandLogo} alt="RidexShare" className="brand-logo-img" />
                    </div>
                    <h1 className="brand-name">RidexShare</h1>
                    <p className="brand-motto">Share · Ride · Connect</p>
                    <p className="tagline">Your trusted campus ride-sharing platform</p>
                </div>
                <div className="tab-buttons">
                    <button
                        className={activeTab === 'login' ? 'active' : ''}
                        onClick={() => setActiveTab('login')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                            <polyline points="10 17 15 12 10 7"></polyline>
                            <line x1="15" y1="12" x2="3" y2="12"></line>
                        </svg>
                        Login
                    </button>
                    <button
                        className={activeTab === 'register' ? 'active' : ''}
                        onClick={() => setActiveTab('register')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <line x1="19" y1="8" x2="19" y2="14"></line>
                            <line x1="22" y1="11" x2="16" y2="11"></line>
                        </svg>
                        Register
                    </button>
                </div>

                {activeTab === 'login' && <LoginForm />}
                {activeTab === 'register' && (
                    <RegisterForm onSwitchToLogin={() => setActiveTab('login')} />
                )}
            </div>

            <div className="info-section">
                <div className="rs-hero">
                    {/* CSS road scene — markers + animated car (GPU-friendly transforms) */}
                    <div className="rs-road" aria-hidden="true">
                        <div className="rs-road-surface" />
                        <div className="rs-lane" />

                        <div className="rs-marker rs-marker-top">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" /></svg>
                            Campus Hub
                        </div>

                        <div className="rs-car">
                            <img src={carImg} alt="" className="rs-car-img" loading="eager" decoding="async" />
                        </div>

                        <div className="rs-marker rs-marker-bottom">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>
                            Student Housing
                        </div>
                    </div>

                    {/* Headline + supporting copy */}
                    <div className="rs-hero-copy">
                        <h2 className="rs-hero-headline">
                            Share rides.<br />Save money.<br />Build <em>connections.</em>
                        </h2>
                        <p className="rs-hero-sub">
                            Connect with fellow students and faculty for convenient, safe
                            rides across the university community.
                        </p>

                        <div className="rs-stats">
                            <div className="rs-stat">
                                <span className="rs-stat-icon">👥</span>
                                <div><div className="rs-stat-v">5000+</div><div className="rs-stat-l">Active Riders</div></div>
                            </div>
                            <div className="rs-stat">
                                <span className="rs-stat-icon">🌱</span>
                                <div><div className="rs-stat-v">18.6 kg</div><div className="rs-stat-l">CO₂ Saved</div></div>
                            </div>
                            <div className="rs-stat">
                                <span className="rs-stat-icon">₹</span>
                                <div><div className="rs-stat-v">70%</div><div className="rs-stat-l">Avg. Cost Saving</div></div>
                            </div>
                            <div className="rs-stat">
                                <span className="rs-stat-icon">🛡️</span>
                                <div><div className="rs-stat-v">100%</div><div className="rs-stat-l">Verified Users</div></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Public info — shown to everyone (no login) so visitors understand
            what RidexShare is before signing up. */}
        <section className="landing-info" id="how">
            <div className="landing-info-inner">
                <p className="landing-eyebrow">How it works</p>
                <h2>Share the ride, split the cost</h2>
                <p className="landing-info-sub">
                    RidexShare connects verified students and faculty travelling the
                    same way — so getting to campus is cheaper, greener and safer.
                </p>

                <div className="landing-steps">
                    <div className="landing-step">
                        <div className="landing-step-num">1</div>
                        <h3>Sign up &amp; verify</h3>
                        <p>Join with your university email. Everyone on RidexShare is a verified member of your community.</p>
                    </div>
                    <div className="landing-step">
                        <div className="landing-step-num">2</div>
                        <h3>Find or offer a ride</h3>
                        <p>Drivers post trips with seats and price. Passengers search, book, or request a ride along their route.</p>
                    </div>
                    <div className="landing-step">
                        <div className="landing-step-num">3</div>
                        <h3>Travel &amp; track</h3>
                        <p>Follow the trip live on the map, share a boarding code, and pay securely — with SOS built in.</p>
                    </div>
                </div>

                <div className="pub-cards">
                    <div className="pub-card">
                        <div className="pub-card-icon">🛡️</div>
                        <h3>Verified community</h3>
                        <p>University-email verification means you only ride with people from your own campus.</p>
                    </div>
                    <div className="pub-card">
                        <div className="pub-card-icon">📍</div>
                        <h3>Live tracking</h3>
                        <p>Real-time location, ETA and route so you and your contacts always know where you are.</p>
                    </div>
                    <div className="pub-card">
                        <div className="pub-card-icon">💳</div>
                        <h3>Secure payments</h3>
                        <p>Fares are handled through secure payments that protect both riders and drivers.</p>
                    </div>
                </div>

                <div className="landing-cta-row">
                    <Link to="/about" className="landing-cta-link">Learn more about RidexShare →</Link>
                </div>
            </div>
        </section>

        <Footer />
        </div>
    );
};

export default Home;
