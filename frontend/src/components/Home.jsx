import { useState } from 'react';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import '../styles/Home.css';

const Home = () => {
    const [activeTab, setActiveTab] = useState('login');

    return (
        <div className="home-container">
            <div className="form-container">
                <h1>PU Ride Share</h1>
                <div className="tab-buttons">
                    <button
                        className={activeTab === 'login' ? 'active' : ''}
                        onClick={() => setActiveTab('login')}
                    >
                        Login
                    </button>
                    <button
                        className={activeTab === 'register' ? 'active' : ''}
                        onClick={() => setActiveTab('register')}
                    >
                        Register
                    </button>
                </div>

                {activeTab === 'login' && <LoginForm />}
                {activeTab === 'register' && <RegisterForm />}
            </div>

            <div className="info-section">
                <h2>University Ride Sharing</h2>
                <p>
                    Connect with fellow students and faculty for convenient and safe rides
                    within the university community. Share costs, reduce your carbon footprint,
                    and make new connections on your daily commute.
                </p>
            </div>
        </div>
    );
};

export default Home;
