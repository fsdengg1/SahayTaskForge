import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { homeFor, useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import NavIcon from '../components/NavIcons';
import BrandLogo from '../components/BrandLogo';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [forgotHint, setForgotHint] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(username, password, remember);
      navigate(user.mustChangePassword ? '/change-password' : (homeFor(user) || '/dashboard'));
    } catch (err) {
      setError(err.message || 'Invalid username or password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <section className="login-art">
        <div className="login-overlay" />
        <div className="login-art-inner">
          <p className="login-kicker">Sahay Racks (P) Ltd</p>
          <h2>Project Tracking System</h2>
          <p>Manage every project from enquiry to installation.</p>
        </div>
        <p className="login-art-foot">Engineering • Manufacturing • Quality • Installation</p>
      </section>
      <section className="login-card">
        <ThemeToggle className="icon-btn theme-toggle login-theme" />
        <form className="login-box" onSubmit={onSubmit}>
          <div className="login-form-brand">
            <BrandLogo variant="color" />
          </div>
          <h3>Welcome back</h3>
          <p className="login-sub">Sign in to Sahay Racks Project Tracking</p>
          {error && <div className="notice err">{error}</div>}
          <label className="field">
            Email address
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="Enter your email address"
              required
            />
          </label>
          <label className="field password-row">
            Password
            <input
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Enter your password"
              required
            />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
              <NavIcon name={show ? 'eyeOff' : 'eye'} />
            </button>
          </label>
          <div className="login-meta">
            <label className="login-remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember me
            </label>
            <button type="button" className="login-forgot" onClick={() => setForgotHint(true)}>Forgot password?</button>
          </div>
          {forgotHint && (
            <p className="field-hint">Contact your Sahay Racks administrator to reset your password.</p>
          )}
          <button className="btn login-submit" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="login-powered">
            <span>Powered by</span>
            <img src="/brand/careyu.png" alt="" />
            <strong>CareYu</strong>
          </p>
        </form>
      </section>
    </div>
  );
}
