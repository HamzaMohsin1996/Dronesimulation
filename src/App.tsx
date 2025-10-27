import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import TasksPage from './components/TasksPage';
import ScenarioEventFeed from './components/scenarios/ScenarioEventFeed';
import SensorRetrievalPage from './components/pages/SensorRetrievalMap';
import SpatialInteractionsPage from './components/pages/SpatialInteractionsPage';
import OnboardingFlow from './components/OnboardingFlow';
import './App.css';

function App() {
  const [authorized, setAuthorized] = useState(false);
  const [input, setInput] = useState('');

  const secretCode = import.meta.env.VITE_ACCESS_CODE || '1234';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input === secretCode) {
      setAuthorized(true);
    } else {
      alert('❌ Wrong code');
    }
  };

  if (!authorized) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
          color: 'white',
          fontFamily: 'Arial, sans-serif',
          padding: '20px',
        }}
      >
        <div
          style={{
            maxWidth: '450px',
            width: '100%',
            background: 'rgba(255,255,255,0.08)',
            padding: '40px',
            borderRadius: '16px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            textAlign: 'center',
          }}
        >
          {/* Drone SVG (replace with your own asset if you have one) */}
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>🛸</div>

          <h1 style={{ marginBottom: '10px', fontSize: '28px', fontWeight: 'bold' }}>
            Drone Simulation Portal
          </h1>
          <p style={{ fontSize: '14px', opacity: 0.8, marginBottom: '30px', lineHeight: 1.6 }}>
            Welcome to <strong>iC-FRED</strong> — an interactive drone simulation project showcasing
            advanced features like <em>sensor retrieval</em>,<em>spatial interactions</em>, and{' '}
            <em>real-time re-engagement</em>. Enter the access code below to continue.
          </p>

          <form onSubmit={handleSubmit}>
            <input
              type="password"
              placeholder="Enter access code"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={{
                padding: '12px',
                width: '100%',
                borderRadius: '8px',
                border: 'none',
                marginBottom: '20px',
                fontSize: '16px',
                textAlign: 'center',
              }}
            />
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '12px',
                background: '#00c6ff',
                backgroundImage: 'linear-gradient(45deg, #00c6ff, #0072ff)',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
              onMouseOver={(e) =>
                ((e.target as HTMLButtonElement).style.backgroundImage =
                  'linear-gradient(45deg, #0072ff, #00c6ff)')
              }
              onMouseOut={(e) =>
                ((e.target as HTMLButtonElement).style.backgroundImage =
                  'linear-gradient(45deg, #00c6ff, #0072ff)')
              }
            >
              Enter
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <Router basename="/Dronesimulation">
      <Routes>
        {/* ✅ default landing goes to onboarding */}
        <Route path="/" element={<Navigate to="/onboarding" replace />} />

        {/* ✅ onboarding screen */}
        <Route
          path="/onboarding"
          element={<OnboardingToSensor />} // see helper below
        />

        {/* tasks hub is still reachable manually */}
        <Route path="/tasks" element={<TasksPage />} />

        {/* your scenarios */}
        <Route path="/scenarios/feed" element={<ScenarioEventFeed />} />
        <Route path="/sensor-retrieval/*" element={<SensorRetrievalPage />} />
        <Route path="/spatial-interactions" element={<SpatialInteractionsPage />} />
      </Routes>
    </Router>
  );
}

export default App;

/** Helper so Start Study navigates correctly */
function OnboardingToSensor() {
  const navigate = useNavigate();
  return (
    <OnboardingFlow
      targetPath="/sensor-retrieval" // optional; your component already defaults to this
      onStart={() => {
        localStorage.setItem('onboardingDone', '1');
        navigate('/sensor-retrieval'); //  straight into your interface
      }}
    />
  );
}
