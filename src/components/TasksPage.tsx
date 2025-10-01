import { Link } from 'react-router-dom';

export default function TasksPage() {
  const tasks = [
    {
      title: 'Reengagement after Interruptions',
      path: '/scenarios',
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
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f9fafb, #eef2ff)',
        padding: '3rem 2rem',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        <header style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
          <h1
            style={{
              fontSize: '2.5rem',
              fontWeight: 800,
              color: '#111827',
              marginBottom: '0.5rem',
            }}
          >
            Web-Based UAV Interface for Firefighting Dispatchers
          </h1>
          <p style={{ fontSize: '1.125rem', color: '#6b7280' }}>
            Allow Information Retrieval During Multitasking
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
          {tasks.map((task) => (
            <li key={task.path}>
              <Link
                to={task.path}
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
                <p style={{ fontSize: '0.95rem', color: '#4b5563', margin: 0 }}>{task.desc}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
