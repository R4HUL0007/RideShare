import { Link } from 'react-router-dom';
import brandLogo from '../../assets/images/RidexShare.svg';
import Footer from './Footer';
import '../../styles/public.css';

// Wrapper for the public info pages (About / Privacy / Terms): a sticky top
// bar with the brand + nav, the page content, and the shared Footer. Fully
// public — no auth required.
const PublicLayout = ({ children }) => (
    <div className="pub-page">
        <nav className="pub-nav">
            <Link to="/" className="pub-brand">
                <img src={brandLogo} alt="RidexShare" />
                <span>RidexShare</span>
            </Link>
            <div className="pub-nav-links">
                <Link to="/about">About</Link>
                <Link to="/privacy">Privacy</Link>
                <Link to="/terms">Terms</Link>
                <Link to="/" className="pub-cta">Log in</Link>
            </div>
        </nav>
        <main className="pub-main">{children}</main>
        <Footer />
    </div>
);

export default PublicLayout;
