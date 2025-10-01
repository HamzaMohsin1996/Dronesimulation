import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/main.scss';

// optional: use Vite env for Cesium base
(window as any).CESIUM_ASE_URL = import.meta.env.VITE_CESIUM_BASE_URL || '/Cesium';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
