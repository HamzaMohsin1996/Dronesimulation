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
    /* ... your existing auth gate UI unchanged ... */
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
        navigate('/sensor-retrieval'); // 🚀 straight into your interface
      }}
    />
  );
}
