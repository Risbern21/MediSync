import { useState, useEffect } from 'react';
import { Bell, Menu, RefreshCw, Stethoscope } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { reportsAPI } from '../api/client';
import { getAlerts, formatDate } from '../api/health';
import './Topbar.css';

export default function Topbar({ onMenuClick }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    setLoading(true);
    reportsAPI.getAll({ limit: 50 })
      .then((data) => setAlerts(getAlerts(data)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const criticalAlerts = alerts.filter((a) => a.severity === 'critical');
  const badgeCount = alerts.length;

  return (
    <header className="topbar" role="banner">
      {/* Left: hamburger + breadcrumb */}
      <div className="topbar-left">
        <button className="topbar-menu-btn" onClick={onMenuClick} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <div className="topbar-brand" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div className="sidebar-logo-icon" style={{ width: 28, height: 28 }}>
            <Stethoscope size={14} />
          </div>
          <span className="topbar-brand-name">MediSync</span>
        </div>
      </div>

      {/* Right: alerts + user */}
      <div className="topbar-right">
        {/* Notification bell */}
        <div className="topbar-bell-wrap">
          <button
            className="topbar-icon-btn"
            onClick={() => setShowDropdown(!showDropdown)}
            aria-label={`${badgeCount} health alerts`}
          >
            <Bell size={18} />
            {badgeCount > 0 && (
              <span className={`topbar-badge ${criticalAlerts.length > 0 ? 'topbar-badge--critical' : ''}`}>
                {badgeCount > 9 ? '9+' : badgeCount}
              </span>
            )}
          </button>

          {showDropdown && (
            <div className="topbar-dropdown" role="dialog" aria-label="Health alerts">
              <div className="topbar-dropdown-header">
                <span>Health Alerts</span>
                {loading && <RefreshCw size={14} className="spin" />}
              </div>

              {alerts.length === 0 && !loading && (
                <div className="topbar-dropdown-empty">
                  <p>No alerts detected</p>
                </div>
              )}

              <div className="topbar-alert-list">
                {alerts.slice(0, 8).map((a, i) => (
                  <div
                    key={i}
                    className={`topbar-alert-item topbar-alert--${a.severity}`}
                    onClick={() => { navigate('/records'); setShowDropdown(false); }}
                  >
                    <div className="topbar-alert-top">
                      <strong>{a.testName}</strong>
                      <span className={`badge badge-${a.severity === 'critical' ? 'danger' : 'warning'}`}>
                        {a.label}
                      </span>
                    </div>
                    <div className="topbar-alert-bottom">
                      <span>{a.value} {a.unit}</span>
                      {a.referenceRange && <span> · Ref: {a.referenceRange}</span>}
                      <span className="topbar-alert-date"> · {formatDate(a.reportDate)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {alerts.length > 8 && (
                <button
                  className="topbar-see-all"
                  onClick={() => { navigate('/analytics'); setShowDropdown(false); }}
                >
                  See all {alerts.length} alerts →
                </button>
              )}
            </div>
          )}
        </div>

        {/* User avatar */}
        <div
          className="topbar-user"
          onClick={() => navigate('/profile')}
          role="button"
          tabIndex={0}
          aria-label="Go to profile"
        >
          <div className="topbar-avatar">
            {user?.username?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="topbar-user-info">
            <span className="topbar-user-name">{user?.username ?? 'User'}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
