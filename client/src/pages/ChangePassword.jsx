import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { homeFor, useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import BrandLogo from '../components/BrandLogo';

export default function ChangePassword() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirm) {
      setError('New password and confirmation do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      const next = await refreshUser();
      navigate(homeFor(next || user) || '/dashboard');
    } catch (err) {
      setError(err.message || 'Unable to update password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap" style={{ gridTemplateColumns: '1fr' }}>
      <section className="login-card">
        <form className="login-box" onSubmit={onSubmit}>
          <BrandLogo variant="color" />
          <h3>Change temporary password</h3>
          <p className="login-sub">Sign-in succeeded. Please set a new password before continuing.</p>
          {error && <div className="notice err">{error}</div>}
          <label className="field">
            Current password
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
          </label>
          <label className="field">
            New password
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          </label>
          <label className="field">
            Confirm new password
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" />
          </label>
          <button className="btn login-submit" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </section>
    </div>
  );
}
