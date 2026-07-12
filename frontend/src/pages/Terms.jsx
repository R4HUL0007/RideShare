import PublicLayout from '../components/public/PublicLayout';

// Public Terms of Service. Plain-language template setting out the rules for
// using RidexShare and limiting platform liability. Not legal advice.
const Terms = () => (
    <PublicLayout>
        <h1 className="pub-hero-title">Terms of Service</h1>
        <p className="pub-updated">Last updated: July 2026</p>
        <p className="pub-lead">
            These terms govern your use of RidexShare. By creating an account or using the
            platform, you agree to them. Please read them carefully.
        </p>

        <div className="pub-section">
            <h2>1. Eligibility</h2>
            <p>
                RidexShare is intended for verified members of the university community. You
                must register with a valid university email and provide accurate information.
                You are responsible for keeping your account credentials secure.
            </p>
        </div>

        <div className="pub-section">
            <h2>2. What RidexShare is</h2>
            <p>
                RidexShare is a platform that connects riders and drivers within a university
                community to share journeys. We provide the technology to find, offer, book
                and track rides. We are not a transport company and do not own vehicles or
                employ drivers.
            </p>
        </div>

        <div className="pub-section">
            <h2>3. Rides and conduct</h2>
            <ul>
                <li>Drivers are responsible for holding valid licences, insurance and roadworthy vehicles as required by law.</li>
                <li>All users must treat each other with respect. Harassment, abuse, unsafe driving or illegal activity is prohibited.</li>
                <li>Fares, routes and timings agreed between riders and drivers should be honoured in good faith.</li>
                <li>We may suspend or remove accounts that violate these terms or compromise community safety.</li>
            </ul>
        </div>

        <div className="pub-section">
            <h2>4. Payments</h2>
            <p>
                Payments are processed through our secure payment provider. Fares, any platform
                fees, and refund or cancellation handling are shown in the app at the time of
                booking. You agree to pay the amounts applicable to your rides.
            </p>
        </div>

        <div className="pub-section">
            <h2>5. Safety</h2>
            <p>
                We provide safety features such as verified membership, contact masking,
                boarding verification codes, live tracking and emergency SOS. These tools
                assist but do not guarantee safety. Always use your own judgement, and contact
                local emergency services (112 in India) in an emergency.
            </p>
        </div>

        <div className="pub-section">
            <h2>6. Limitation of liability</h2>
            <p>
                RidexShare connects users but is not a party to the rides arranged between
                them. To the fullest extent permitted by law, we are not responsible for the
                conduct of any user, the condition of any vehicle, or any loss, injury or
                dispute arising from a ride. The service is provided "as is" without warranties
                of any kind.
            </p>
        </div>

        <div className="pub-section">
            <h2>7. Changes to these terms</h2>
            <p>
                We may update these terms from time to time. Continued use of RidexShare after
                changes take effect means you accept the updated terms.
            </p>
        </div>

        <div className="pub-section">
            <h2>8. Contact</h2>
            <p>
                Questions about these terms?{' '}
                <a href="/feedback">Send us a message</a>.
            </p>
        </div>
    </PublicLayout>
);

export default Terms;
