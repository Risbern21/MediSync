import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Upload, FileText, BarChart2, User, LogOut, Stethoscope, X
} from 'lucide-react';
import './Sidebar.css';

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/upload',    icon: Upload,          label: 'Upload'    },
  { to: '/records',   icon: FileText,         label: 'Records'   },
  { to: '/analytics', icon: BarChart2,        label: 'Analytics' },
  { to: '/profile',   icon: User,             label: 'Profile'   },
];

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };

  return (
    <>
      {/* Mobile backdrop */}
      {open && <div className="sidebar-backdrop" onClick={onClose} />}

      <aside className={`sidebar ${open ? 'sidebar--open' : ''}`}>
        {/* Logo + Close (mobile) */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Stethoscope size={18} />
          </div>
          <span className="sidebar-logo-text">MediSync</span>
          <button className="sidebar-close" onClick={onClose} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav" aria-label="Main navigation">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'sidebar-link--active' : ''}`
              }
            >
              <Icon size={18} className="sidebar-icon" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {user?.username?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="sidebar-user-info">
              <p className="sidebar-user-name">{user?.username ?? 'User'}</p>
              <p className="sidebar-user-email">{user?.email ?? ''}</p>
            </div>
          </div>
          <button className="sidebar-logout" onClick={handleLogout} aria-label="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}
