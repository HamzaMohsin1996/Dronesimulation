import { useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";

import TasksPage from "./components/TasksPage";
import ScenarioEventFeed from "./components/scenarios/ScenarioEventFeed";
import SensorRetrievalPage from "./components/pages/SensorRetrievalMap";
import SpatialInteractionsPage from "./components/pages/SpatialInteractionsPage";
import OnboardingFlow from "./components/OnboardingFlow";
import ExperimentLogger from "./components/ExperimentLogger";
import "./App.css";

function App() {
  const [authorized, setAuthorized] = useState(false);
  const [input, setInput] = useState("");

  // 🧠 researcher-only access code
  const secretCode = import.meta.env.VITE_ACCESS_CODE || "1234";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input === secretCode) {
      setAuthorized(true);
    } else {
      alert("❌ Wrong code");
    }
  };

  // 🔒 simple access gate before experiment
  if (!authorized) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-screen bg-gradient-to-br from-slate-100 to-blue-100">
        <h2 className="text-2xl font-bold mb-3 text-blue-700">
          Researcher Access
        </h2>
        <p className="text-gray-600 text-sm mb-6 text-center max-w-sm">
          Please enter the access code to unlock the UAV Control Experiment
          interface. This prevents unauthorized users from running test sessions.
        </p>
        <form onSubmit={handleSubmit} className="flex items-center">
          <input
            type="password"
            className="border border-gray-300 p-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="Access Code"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            type="submit"
            className="ml-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition duration-200"
          >
            Enter
          </button>
        </form>
      </div>
    );
  }

  // 🚀 Main app routes after authorization
  return (
    <Router basename="/Dronesimulation">
      <Routes>
        {/* Default route → go to participant logger */}
        <Route path="/" element={<Navigate to="/start" replace />} />

        {/* 🧭 Participant setup + logger page */}
        <Route path="/start" element={<LoggerToOnboarding />} />

        {/* 👋 Onboarding screen before main experiment */}
        <Route path="/onboarding" element={<OnboardingToSensor />} />

        {/* 🧠 Optional: extra routes for other modules */}
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/scenarios/feed" element={<ScenarioEventFeed />} />
        <Route path="/sensor-retrieval/*" element={<SensorRetrievalPage />} />
        <Route
          path="/spatial-interactions"
          element={<SpatialInteractionsPage />}
        />
      </Routes>
    </Router>
  );
}

export default App;

/** 🧩 Helper 1 — Logger navigates to onboarding when session starts */
function LoggerToOnboarding() {
  const navigate = useNavigate();

  return (
    <ExperimentLogger
      onSessionStart={(session) => {
        // Save session data in localStorage for global access
        localStorage.setItem("participantSession", JSON.stringify(session));

        // Move automatically to onboarding flow
        navigate("/onboarding");
      }}
    />
  );
}

/** 🧩 Helper 2 — Onboarding navigates to main simulation */
function OnboardingToSensor() {
  const navigate = useNavigate();

  return (
    <OnboardingFlow
      targetPath="/sensor-retrieval"
      onStart={() => {
        localStorage.setItem("onboardingDone", "1");
        navigate("/sensor-retrieval");
      }}
    />
  );
}
