import Header from '../Header/Header';
import CategoryMap from '../MapLibreMapCat';
import IndividualMap from '../MapLibreMap';
import { Routes, Route, Navigate } from 'react-router-dom';
import React from 'react';

export default function SensorRetrievalPage() {


  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #f9fafb, #eef2ff)',
      }}
    >
      {/* ✅ Header gets tabs only on this page */}
      <Header
  notifications={[]} 
  onSelectNotification={() => {}}
  tabs={[
    { title: 'Individual', path: '/sensor-retrieval/individual', icon: '📍' },
    { title: 'Categories', path: '/sensor-retrieval/categories', icon: '📊' },
  ]}
/>


      <main style={{ flex: 1 }}>
        <Routes>
          <Route index element={<Navigate to="individual" replace />} />
          <Route path="individual" element={<IndividualMap />} />
          <Route path="categories" element={<CategoryMap />} />
        </Routes>
      </main>
    </div>
  );
}
