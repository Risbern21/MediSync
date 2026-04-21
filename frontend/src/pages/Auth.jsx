import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Stethoscope, Eye, EyeOff, Loader, ArrowRight } from 'lucide-react';
import ParticleCanvas from '../components/ParticleCanvas';
import './Auth.css';

export default function Auth() {
  const [mode, setMode] = useState('login');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { login, signin } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ username: '', email: '', password: '', phone: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess(''); setLoading(true);
    try {
      if (mode === 'login') {
        await login({ email: form.email, password: form.password });
        navigate('/dashboard');
      } else {
        await signin({ username: form.username, email: form.email, password: form.password, phone: form.phone });
        setSuccess('Account created! Please sign in.');
        setMode('login');
        setForm((f) => ({ ...f, username: '', phone: '' }));
      }
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message || 'Something went wrong.';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* ── Hero Panel ── */}
      <div className="auth-hero" aria-hidden="true">
        <ParticleCanvas />
        <div className="auth-hero-content">
          <div className="auth-hero-logo">
            <Stethoscope size={32} />
          </div>
          <h1 className="auth-hero-title">MediSync</h1>
          <p className="auth-hero-tagline">Personal Health Intelligence</p>
          <p className="auth-hero-sub">
            Upload lab reports, track metrics over time, and detect anomalies — all in one place.
          </p>
        </div>
      </div>

      {/* ── Form Panel ── */}
      <div className="auth-form-panel">
        <div className="auth-form-wrap anim-fade-up">
          <div className="auth-form-logo">
            <Stethoscope size={20} />
          </div>

          {/* Tabs */}
          <div className="auth-tabs" role="tablist">
            {[['login','Sign In'],['signup','Create Account']].map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={mode === id}
                className={`auth-tab ${mode === id ? 'auth-tab--active' : ''}`}
                onClick={() => { setMode(id); setError(''); setSuccess(''); }}
              >
                {label}
              </button>
            ))}
          </div>

          <h2 className="auth-form-title">
            {mode === 'login' ? 'Welcome back' : 'Get started'}
          </h2>
          <p className="auth-form-subtitle">
            {mode === 'login' ? 'Sign in to your MediSync account' : 'Create a free account in seconds'}
          </p>

          {error   && <div className="auth-alert auth-alert--error"   role="alert">{error}</div>}
          {success && <div className="auth-alert auth-alert--success" role="alert">{success}</div>}

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            {mode === 'signup' && (
              <div className="form-group">
                <label className="form-label" htmlFor="auth-username">Full Name</label>
                <input id="auth-username" className="form-input" type="text" placeholder="Jane Smith"
                  value={form.username} onChange={set('username')} required autoComplete="name" />
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="auth-email">Email Address</label>
              <input id="auth-email" className="form-input" type="email" placeholder="you@example.com"
                value={form.email} onChange={set('email')} required autoComplete="email" />
            </div>

            {mode === 'signup' && (
              <div className="form-group">
                <label className="form-label" htmlFor="auth-phone">Phone Number</label>
                <input id="auth-phone" className="form-input" type="tel" placeholder="+1 234 567 8900"
                  value={form.phone} onChange={set('phone')} required autoComplete="tel" />
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="auth-password">Password</label>
              <div className="auth-password-wrap">
                <input id="auth-password" className="form-input" type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••" value={form.password} onChange={set('password')} required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                <button type="button" className="auth-eye-btn"
                  onClick={() => setShowPwd(!showPwd)} aria-label="Toggle password">
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button type="submit" id="auth-submit-btn" className="btn btn-primary btn-full auth-submit" disabled={loading}>
              {loading
                ? <><Loader size={17} className="spin" /> {mode === 'login' ? 'Signing in…' : 'Creating account…'}</>
                : <>{mode === 'login' ? 'Sign In' : 'Create Account'} <ArrowRight size={16} /></>
              }
            </button>
          </form>

          <p className="auth-switch">
            {mode === 'login'
              ? <>Don't have an account? <button className="auth-link" onClick={() => setMode('signup')}>Sign up free</button></>
              : <>Already have an account? <button className="auth-link" onClick={() => setMode('login')}>Sign in</button></>
            }
          </p>
        </div>
      </div>
    </div>
  );
}
