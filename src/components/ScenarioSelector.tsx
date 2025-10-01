import React from 'react';
import { Link, Routes, Route, useLocation } from 'react-router-dom';
import ScenarioEventFeed from './scenarios/ScenarioEventFeed';
import ScenarioOverlay from './scenarios/ScenarioOverlay';
import ScenarioTimeline from './scenarios/ScenarioTimeline';

export default function ScenarioSelector() {
  const location = useLocation();

  // show the card grid only when we are exactly at /scenarios
  const showCards = location.pathname === '/scenarios' || location.pathname === '/scenarios/';

  const scenarios = [
    {
      title: 'Event Feed',
      path: 'feed', // note: relative path
      desc: 'Chat-style incident log with live map events.',
      icon: '🗂',
    },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f9fafb, #eef2ff)',
        // padding: '3rem 2rem',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {showCards && (
        <div style={{ maxWidth: '460px', margin: '0 auto' }}>
          <header style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
            <h1
              style={{
                fontSize: '2.5rem',
                fontWeight: 800,
                color: '#111827',
                marginBottom: '0.5rem',
              }}
            >
              Firefighting Dispatcher Scenarios
            </h1>
            <p style={{ fontSize: '1.125rem', color: '#6b7280' }}>
              Choose a scenario to view its details
            </p>
          </header>

          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1.5rem',
            }}
          >
            {scenarios.map((s) => (
              <li key={s.path}>
                <Link
                  to={s.path} // relative path works with nested routes
                  style={{
                    display: 'block',
                    padding: '1.75rem',
                    borderRadius: '16px',
                    textDecoration: 'none',
                    color: '#111827',
                    background: '#ffffff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-4px)';
                    (e.currentTarget as HTMLAnchorElement).style.boxShadow =
                      '0 8px 20px rgba(0,0,0,0.08)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
                    (e.currentTarget as HTMLAnchorElement).style.boxShadow =
                      '0 4px 12px rgba(0,0,0,0.05)';
                  }}
                >
                  <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>{s.icon}</div>
                  <h2
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      margin: '0 0 0.5rem',
                    }}
                  >
                    {s.title}
                  </h2>
                  <p style={{ fontSize: '0.95rem', color: '#4b5563', margin: 0 }}>{s.desc}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Nested detail pages */}
      <Routes>
        <Route path="feed" element={<ScenarioEventFeed />} />
        <Route path="overlay" element={<ScenarioOverlay />} />
        <Route path="timeline" element={<ScenarioTimeline />} />
      </Routes>
    </div>
  );
}
