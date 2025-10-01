import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import TasksPage from './components/TasksPage';
// import ReengagementPage from './components/pages/ReengagementPage';
import ScenarioSelector from './components/ScenarioSelector';
import SensorRetrievalPage from './components/pages/SensorRetrievalMap';
import SpatialInteractionsPage from './components/pages/SpatialInteractionsPage';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<TasksPage />} />
        {/* <Route path="/reengagement" element={<ReengagementPage />} /> */}
        <Route path="/scenarios/*" element={<ScenarioSelector />} />
        <Route path="/sensor-retrieval/*" element={<SensorRetrievalPage />} />
        <Route path="/spatial-interactions" element={<SpatialInteractionsPage />} />
      </Routes>
    </Router>
  );
}

export default App;
