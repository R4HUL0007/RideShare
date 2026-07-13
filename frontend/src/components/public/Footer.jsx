import { Link } from 'react-router-dom';
import brandLogo from '../../assets/images/RidexShare.svg';
import '../../styles/public.css';

// Site footer shown on the landing page and public info pages. Links are
// plain <Link>s so they work whether the visitor is logged in or not.
const Footer = () => {
    const year = new Date().getFullYear();
    return (
        <footer className="pub-footer">
            <div className="pub-footer-inner">
                <div className="pub-footer-brand">
                    <Link to="/" className="pub-brand">
                        <img src={brandLogo} alt="RidexShare" />
                        <span>RidexShare</span>
                    </Link>
                    <p>Student carpooling for university communities — share rides, split costs, and travel safer together.</p>
                </div>

                <div className="pub-footer-cols">
                    <div className="pub-footer-col">
                        <h4>Company</h4>
                        <Link to="/about">About</Link>
                        <Link to="/feedback">Feedback</Link>
                    </div>
                    <div className="pub-footer-col">
                        <h4>Legal</h4>
                        <Link to="/privacy">Privacy Policy</Link>
                        <Link to="/terms">Terms of Service</Link>
                    </div>
                    <div className="pub-footer-col">
                        <h4>Get started</h4>
                        <Link to="/?auth=login">Log in</Link>
                        <Link to="/?auth=register">Sign up</Link>
                    </div>
                </div>
            </div>
            <div className="pub-footer-bottom">
                © {year} RidexShare. All rights reserved.
            </div>
        </footer>
    );
};

export default Footer;
