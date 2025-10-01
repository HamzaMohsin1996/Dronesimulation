// src/components/pages/SensorRetrievalPage.tsx
import React from 'react';
import { Link, Routes, Route, useLocation } from 'react-router-dom';
import CategoryMap from '../MapLibreMap';
import IndividualMap from '../MapLibreMapCat';
// import CombinedMap from './CombinedMap'; // create later

export default function SensorRetrievalPage() {
  const location = useLocation();
  const atRoot =
    location.pathname === '/sensor-retrieval' ||
    location.pathname === '/sensor-retrieval/';

  const variants = [
    {
      title: 'Categories',
      path: 'categories',
      desc: 'Cluster icons by type.',
      icon: '📊',
    },
    {
      title: 'Individual',
      path: 'individual',
      desc: 'Show each detection separately.',
      icon: '📍',
    },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f9fafb, #eef2ff)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {atRoot && (
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
          <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Sensor Retrieval Variants
            </h1>
            <p style={{ color: '#6b7280' }}>Choose a representation to explore</p>
          </header>

          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1.5rem',
            }}
          >
            {variants.map((v) => (
              <li key={v.path}>
                <Link
                  to={v.path}
                  style={{
                    display: 'block',
                    padding: '1.5rem',
                    borderRadius: '12px',
                    background: '#fff',
                    color: '#111827',
                    textDecoration: 'none',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.05)',
                    transition: 'transform 0.2s ease',
                  }}
                >
                  <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>{v.icon}</div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{v.title}</h2>
                  <p style={{ fontSize: '0.9rem', color: '#4b5563' }}>{v.desc}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Nested routes */}
      <Routes>
        <Route path="categories" element={<CategoryMap />} />
        <Route path="individual" element={<IndividualMap />} />
      </Routes>
    </div>
  );
}
