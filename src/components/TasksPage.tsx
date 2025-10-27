import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import OnboardingFlow from './OnboardingFlow'; // adjust path if needed

export default function TasksPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'onboarding' | 'tasks'>('tasks');
  const [onboardingDone, setOnboardingDone] = useState(
    () => localStorage.getItem('onboardingDone') === '1'
  );

  // Optional: show a subtle nudge to do onboarding first (no redirect)
  useEffect(() => {
    if (!onboardingDone) {
      // keep "tasks" as default as requested (no reroute), but you could uncomment to default to onboarding:
      // setActiveTab('onboarding');
    }
  }, [onboardingDone]);

  const tasks = useMemo(
    () => [
      {
        title: 'Reengagement after Interruptions',
        path: '/scenarios/feed',
        desc: 'Map annotations + Quick Brief after being away.',
        icon: '⏮️',
      },
      {
        title: 'Sensor Retrieval Information',
        path: '/sensor-retrieval',
        desc: 'Timeline events and replay of captured detections.',
        icon: '📡',
      },
      {
        title: 'Spatial Interactions',
        path: '/spatial-interactions',
        desc: 'Add, toggle, and interact with map layers.',
        icon: '🗺️',
      },
    ],
    []
  );

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f9fafb, #eef2ff)',
        padding: '3rem 2rem',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: '1024px', margin: '0 auto' }}>
        {/* Header */}
        <header style={{ marginBottom: '1.25rem', textAlign: 'center' }}>
          <h1
            style={{
              fontSize: '2.25rem',
              fontWeight: 800,
              color: '#111827',
              marginBottom: '0.25rem',
            }}
          >
            Web-Based UAV Interface for Firefighting Dispatchers
          </h1>
          <p style={{ fontSize: '1rem', color: '#6b7280' }}>
            Allow Information Retrieval During Multitasking
          </p>
        </header>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Main sections"
          style={{
            display: 'flex',
            gap: '0.5rem',
            justifyContent: 'center',
            marginBottom: '1.25rem',
          }}
        >
          <button
            role="tab"
            aria-selected={activeTab === 'onboarding'}
            onClick={() => setActiveTab('onboarding')}
            style={{
              padding: '.6rem 1rem',
              borderRadius: '9999px',
              border: '1px solid rgba(0,0,0,.08)',
              background: activeTab === 'onboarding' ? '#111827' : '#fff',
              color: activeTab === 'onboarding' ? '#fff' : '#111827',
              cursor: 'pointer',
              fontWeight: 600,
            }}
            title="Onboarding & Practice"
          >
            Onboarding {onboardingDone ? '✅' : '✨'}
          </button>

          <button
            role="tab"
            aria-selected={activeTab === 'tasks'}
            onClick={() => setActiveTab('tasks')}
            style={{
              padding: '.6rem 1rem',
              borderRadius: '9999px',
              border: '1px solid rgba(0,0,0,.08)',
              background: activeTab === 'tasks' ? '#111827' : '#fff',
              color: activeTab === 'tasks' ? '#fff' : '#111827',
              cursor: 'pointer',
              fontWeight: 600,
            }}
            title="Scenario Tasks"
          >
            Tasks
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
            padding: '1.25rem',
          }}
        >
          {activeTab === 'onboarding' ? (
            <div style={{ padding: '0.5rem' }}>
              <OnboardingFlow
                onStart={() => {
                  localStorage.setItem('onboardingDone', '1');
                  setOnboardingDone(true);
                  navigate('/sensor-retrieval');
                }}
                onSkip={() => {
                  localStorage.setItem('onboardingDone', '1');
                  setOnboardingDone(true);
                  navigate('/sensor-retrieval');
                }}
              />
            </div>
          ) : (
            <div style={{ padding: '0.75rem' }}>
              {/* Optional hint if onboarding not done yet */}
              {!onboardingDone && (
                <div
                  role="note"
                  style={{
                    margin: '0 0 1rem',
                    padding: '.75rem 1rem',
                    borderRadius: '12px',
                    background: '#fef9c3',
                    color: '#854d0e',
                    fontSize: '.95rem',
                    border: '1px solid #fde68a',
                  }}
                >
                  Tip: Complete the <strong>Onboarding</strong> tab first for a smoother study
                  experience.
                </div>
              )}

              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '1.25rem',
                }}
              >
                {tasks.map((task) => (
                  <li key={task.path}>
                    <Link
                      to={task.path}
                      style={{
                        display: 'block',
                        padding: '1.5rem',
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
                      <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>{task.icon}</div>
                      <h2
                        style={{
                          fontSize: '1.25rem',
                          fontWeight: 700,
                          margin: '0 0 0.5rem',
                        }}
                      >
                        {task.title}
                      </h2>
                      <p style={{ fontSize: '0.95rem', color: '#4b5563', margin: 0 }}>
                        {task.desc}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Small footer actions */}
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <button
            onClick={() => {
              localStorage.removeItem('onboardingDone');
              setOnboardingDone(false);
              setActiveTab('onboarding');
            }}
            style={{
              padding: '.45rem .8rem',
              borderRadius: '10px',
              border: '1px solid rgba(0,0,0,.08)',
              background: '#fff',
              color: '#374151',
              cursor: 'pointer',
              fontSize: '.9rem',
            }}
            title="Reset onboarding completion for next participant"
          >
            Re-run Onboarding
          </button>
        </div>
      </div>
    </div>
  );
}
