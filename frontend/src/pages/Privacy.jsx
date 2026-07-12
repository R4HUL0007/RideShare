import PublicLayout from '../components/public/PublicLayout';

// Public Privacy Policy. Plain-language template covering the data RidexShare
// actually handles (email, phone, location, payments). Not legal advice.
const Privacy = () => (
    <PublicLayout>
        <h1 className="pub-hero-title">Privacy Policy</h1>
        <p className="pub-updated">Last updated: July 2026</p>
        <p className="pub-lead">
            This policy explains what information RidexShare collects, why we collect it,
            and how we handle it. By using RidexShare you agree to the practices described here.
        </p>

        <div className="pub-section">
            <h2>Information we collect</h2>
            <ul>
                <li><strong>Account details</strong> — your name, university email, phone number, gender preference and profile photo.</li>
                <li><strong>Verification data</strong> — documents or details used to verify drivers and university membership.</li>
                <li><strong>Location data</strong> — pickup, drop-off and live location during a ride, used for matching and tracking.</li>
                <li><strong>Ride &amp; booking data</strong> — trips you offer, book or request, and related history.</li>
                <li><strong>Payment data</strong> — processed securely through our payment provider; we do not store your full card details.</li>
                <li><strong>Usage data</strong> — basic technical information such as device and log data to keep the service working.</li>
            </ul>
        </div>

        <div className="pub-section">
            <h2>How we use your information</h2>
            <ul>
                <li>To create and manage your account and verify eligibility.</li>
                <li>To match riders and drivers, and enable booking, tracking and payments.</li>
                <li>To provide safety features such as live tracking, boarding codes and SOS alerts.</li>
                <li>To send you service messages like verification codes and ride updates.</li>
                <li>To keep the platform secure and prevent misuse.</li>
            </ul>
        </div>

        <div className="pub-section">
            <h2>Sharing your information</h2>
            <p>
                We share limited information only as needed to run the service — for example,
                showing a driver a confirmed passenger's contact details, or sending trip
                details to your chosen emergency contacts when you trigger SOS. Contact
                numbers stay masked until a ride is confirmed. We use trusted third-party
                providers for email, SMS, maps and payments, who process data on our behalf.
                We do not sell your personal information.
            </p>
        </div>

        <div className="pub-section">
            <h2>Data retention</h2>
            <p>
                We keep your information for as long as your account is active or as needed to
                provide the service and meet legal or safety obligations. You can request
                deletion of your account and associated data by contacting us.
            </p>
        </div>

        <div className="pub-section">
            <h2>Analytics</h2>
            <p>
                We use Google Analytics to understand how visitors use our public
                site (for example, which pages are viewed). This collects anonymous
                usage data such as page views and general device information, and
                helps us improve the service. You can opt out using Google's
                browser add-on or your browser's privacy controls.
            </p>
        </div>

        <div className="pub-section">
            <h2>Your choices</h2>
            <ul>
                <li>Access or update your profile information from your account settings.</li>
                <li>Control location sharing through your device permissions.</li>
                <li>Request account and data deletion at any time.</li>
            </ul>
        </div>

        <div className="pub-section">
            <h2>Contact</h2>
            <p>
                For any privacy questions or requests,{' '}
                <a href="/feedback">send us a message</a>.
            </p>
        </div>
    </PublicLayout>
);

export default Privacy;
