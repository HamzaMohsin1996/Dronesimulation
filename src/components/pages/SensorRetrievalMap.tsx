import Header from '../Header/Header';
import CategoryMap from '../MapLibreMapCat';
import IndividualMap from '../MapLibreMap';
import { Routes, Route, Navigate } from 'react-router-dom';
import React, { useState } from 'react';

export default function SensorRetrievalPage() {
  // 🟢 Manage global connection state here
  const [connectionStatus, setConnectionStatus] = useState<
    'disconnected' | 'connecting' | 'connected'
  >('disconnected');

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #f9fafb, #eef2ff)',
      }}
    >
      {/* ✅ Header now shows connection state */}
      <Header
        notifications={[]}
        onSelectNotification={() => {}}
        connectionStatus={connectionStatus} // 👈 new prop
       /*  tabs={[
          { title: 'Individual', path: '/sensor-retrieval/individual', icon: '📍' },
          { title: 'Categories', path: '/sensor-retrieval/categories', icon: '📊' },
        ]}
           */
      />

      <main style={{ flex: 1 }}>
        <Routes>
          <Route index element={<Navigate to="individual" replace />} />

          {/* 👇 Pass setter down so IndividualMap can report status */}
          <Route
            path="individual"
            element={<IndividualMap setConnectionStatus={setConnectionStatus} />}
          />

          <Route path="categories" element={<CategoryMap />} />
        </Routes>
      </main>
    </div>
  );
}
