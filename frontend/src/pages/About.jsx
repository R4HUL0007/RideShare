import PublicLayout from '../components/public/PublicLayout';

// Public "About" page — explains what RidexShare is and the goal behind it.
// Reachable at /about whether the visitor is logged in or not.
const About = () => (
    <PublicLayout>
        <h1 className="pub-hero-title">Getting around campus, <em>together.</em></h1>
        <p className="pub-lead">
            RidexShare is a student carpooling platform built for university communities.
            We help verified students and faculty share rides to and from campus — cutting
            travel costs, reducing traffic and emissions, and turning everyday commutes into
            a safer, more connected experience.
        </p>

        <div className="pub-section">
            <h2>Our goal</h2>
            <p>
                Getting to university shouldn't be expensive, lonely, or unsafe. Too many
                students travel the same routes every day in separate vehicles, paying full
                fare and adding to congestion. RidexShare brings those journeys together —
                so a trip that once cost one person can be shared by many, safely and
                affordably, among people from the same trusted community.
            </p>
        </div>

        <div className="pub-section">
            <h2>What you can do</h2>
            <div className="pub-cards">
                <div className="pub-card">
                    <div className="pub-card-icon">🚗</div>
                    <h3>Offer a ride</h3>
                    <p>Drivers post trips with seats, route and price. Passengers book the seats that fit their journey.</p>
                </div>
                <div className="pub-card">
                    <div className="pub-card-icon">🔎</div>
                    <h3>Find a ride</h3>
                    <p>Search rides along your route, filter by time and preferences, and book in a couple of taps.</p>
                </div>
                <div className="pub-card">
                    <div className="pub-card-icon">📍</div>
                    <h3>Request a ride</h3>
                    <p>No matching ride? Post a request and nearby drivers can accept and pick you up.</p>
                </div>
                <div className="pub-card">
                    <div className="pub-card-icon">🛰️</div>
                    <h3>Track live</h3>
                    <p>Follow your trip in real time with live location, ETA and route on the map.</p>
                </div>
                <div className="pub-card">
                    <div className="pub-card-icon">🛡️</div>
                    <h3>Stay safe</h3>
                    <p>Verified university members only, boarding codes, contact masking, and one-tap SOS.</p>
                </div>
                <div className="pub-card">
                    <div className="pub-card-icon">💳</div>
                    <h3>Pay securely</h3>
                    <p>Fares are handled through secure payments so both riders and drivers are protected.</p>
                </div>
            </div>
        </div>

        <div className="pub-section">
            <h2>Built on trust</h2>
            <p>
                Every member joins with a verified university email, so you always travel
                with people from your own community. Phone numbers stay masked until a ride
                is confirmed, in-app chat keeps conversations on-platform, and safety tools
                like live tracking and emergency SOS are built in from the start.
            </p>
        </div>

        <div className="pub-section">
            <h2>Say hello</h2>
            <p>
                Questions, feedback or ideas?{' '}
                <a href="/feedback">Send us a message</a>.
            </p>
        </div>
    </PublicLayout>
);

export default About;
