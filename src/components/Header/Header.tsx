import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import './Header.scss';
import logo from '../../assets/images/logo.svg';
import NotificationIcon from '../../assets/images/icons/notification.svg';
import UserIcon from '../../assets/images/icons/user.svg';
import PlaybackIcon from '../../assets/images/icons/playback.svg';
import type { DetectionEvent } from '../../shared/DetectionEvent';

type HeaderProps = {
  notifications: DetectionEvent[];
  onSelectNotification: (e: DetectionEvent) => void;
  tabs?: { title: string; path: string; icon?: string }[];
  connectionStatus?: 'connected' | 'connecting' | 'disconnected';
};

const Header: React.FC<HeaderProps> = ({
  notifications,
  onSelectNotification,
  tabs,
  connectionStatus,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <header className="header">
      <div className="container-fluid">
        <div className="row align-items-center">
          {/* --- Left: Logo & Breadcrumb --- */}
          <div className="col d-flex align-items-center">
            <NavLink to="/" aria-label="Go to home" className="logo-link">
              <img src={logo} alt="Logo" className="logo" draggable={false} />
            </NavLink>

            <div className="ms-3 d-flex flex-column">
              <span className="title">ILS Ingolstadt</span>
              <div className="d-flex align-items-center text-white small gap-2">
                <span className="breadcrumb-separator">›</span>
                <span>Overview</span>
                <span className="breadcrumb-separator">›</span>
                <span> +6</span>
                <span className="breadcrumb-separator">›</span>
                <span>S. Schwerd</span>
              </div>
            </div>
          </div>

          {/* --- Center: Tabs (only if provided) --- */}
          {tabs && tabs.length > 0 && (
            <div className="col-auto d-flex justify-content-center">
              <nav className="d-flex gap-3">
                {tabs.map((tab) => (
                  <NavLink
                    key={tab.path}
                    to={tab.path}
                    className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
                  >
                    <span style={{ fontSize: '1.2rem', marginRight: '0.3rem' }}>{tab.icon}</span>
                    {tab.title}
                  </NavLink>
                ))}
              </nav>
            </div>
          )}

          {/* --- Right: Icons --- */}
          <div className="col d-flex justify-content-end">
            <div className="icon-buttons position-relative">
              {connectionStatus && (
                <div
                  className={`status-chip ${connectionStatus}`}
                  title={
                    connectionStatus === 'connected'
                      ? 'Drone link established — live feed active'
                      : connectionStatus === 'connecting'
                      ? 'Connecting to drone...'
                      : 'Disconnected — waiting for launch'
                  }
                >
                  {connectionStatus === 'connected'
                    ? '🟢 Drone Flying'
                    : connectionStatus === 'connecting'
                    ? '🟡 Connecting...'
                    : '🔴 Disconnected'}
                </div>
              )}

              <button className="btn-custom">
                <img src={PlaybackIcon} alt="Playback" width={24} height={24} />
              </button>

              {/* Notification Bell */}
              <button
                className="btn-custom notification position-relative"
                onClick={() => setOpen((o) => !o)}
              >
                <img src={NotificationIcon} alt="Notifications" width={24} height={24} />
                {notifications.length > 0 && (
                  <span className="notif-badge">{notifications.length}</span>
                )}
              </button>

              {/* Dropdown */}
              {open && notifications.length > 0 && (
                <div className="notif-dropdown">
                  {notifications.map((ev) => (
                    <div
                      key={ev.id}
                      className="notif-item"
                      onClick={() => {
                        onSelectNotification(ev);
                        setOpen(false);
                      }}
                    >
                      <div className="icon">
                        {ev.label === 'fire'
                          ? '🔥'
                          : ev.label === 'chemical'
                          ? '🧪'
                          : ev.label === 'person'
                          ? '👥'
                          : '📸'}
                      </div>
                      <div className="info">
                        <div className="label">{ev.label}</div>
                        <small>{new Date(ev.ts).toLocaleTimeString()}</small>
                        {ev.thumbnail && (
                          <img src={ev.thumbnail} alt="snapshot" className="thumb" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button className="btn-custom">
                <img src={UserIcon} alt="User" width={24} height={24} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
