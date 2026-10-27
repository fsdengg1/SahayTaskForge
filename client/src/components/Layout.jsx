import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { menuFor } from '../utils/roles';
import { OtrAccessProvider } from './OtrGate';
import NavIcon from './NavIcons';
import ThemeToggle from './ThemeToggle';
import Sidebar from './Sidebar';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [notes, setNotes] = useState([]);
  const [showNotes, setShowNotes] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [otrStages, setOtrStages] = useState([]);
  const [otrReady, setOtrReady] = useState(false);

  useEffect(() => {
    api.get('/notifications').then(setNotes).catch(() => setNotes([]));
  }, []);

  useEffect(() => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      api.get(`/search?q=${encodeURIComponent(q)}`).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let active = true;
    api.get('/projects/otr')
      .then((data) => {
        if (active) setOtrStages(data.unlockedStages || []);
      })
      .catch(() => {
        if (active) setOtrStages([]);
      })
      .finally(() => {
        if (active) setOtrReady(true);
      });
    return () => { active = false; };
  }, [location.pathname]);

  const unread = notes.filter((n) => !n.readAt).length;
  const role = user?.roles?.[0]?.name || 'User';
  const initials = (user?.fullName || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
  const menu = useMemo(() => menuFor(user, otrStages), [user, otrStages]);

  function openNote(note) {
    api.patch(`/notifications/${note.id}/read`).catch(() => {});
    setNotes((current) => current.map((item) => (
      item.id === note.id ? { ...item, readAt: item.readAt || new Date().toISOString() } : item
    )));
    setShowNotes(false);
    if (note.link) navigate(note.link);
  }

  return (
    <div className="app-shell">
      <Sidebar menu={menu} pathname={location.pathname} mobileOpen={mobileOpen} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn mobile-nav" type="button" onClick={() => setMobileOpen((v) => !v)} aria-label="Menu">
            <NavIcon name="menu" />
          </button>
          <div className="search">
            <span className="search-icon"><NavIcon name="search" /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search lead, project, customer, PO..." />
            {results.length > 0 && (
              <div className="search-results">
                {results.map((r) => (
                  <a key={`${r.type}-${r.id}`} href={r.href} onClick={(e) => { e.preventDefault(); setQ(''); navigate(r.href); }}>
                    {r.label} <small>{r.type} · {r.sub}</small>
                  </a>
                ))}
              </div>
            )}
          </div>
          <div className="top-actions">
            <ThemeToggle />
            <button className="icon-btn" type="button" onClick={() => setShowNotes((v) => !v)} aria-label="Notifications" title="Notifications">
              <NavIcon name="bell" />
              {unread > 0 && <span className="badge-dot">{unread}</span>}
            </button>
            <div className="user-chip">
              <span className="user-avatar" aria-hidden="true">{initials}</span>
              <span className="user-meta">
                <strong>{user?.fullName}</strong>
                <span>{role}</span>
              </span>
            </div>
            <button className="btn ghost top-logout" type="button" onClick={() => { logout(); navigate('/login'); }}>Log out</button>
          </div>
        </header>
        {showNotes && (
          <div className="notes-pop">
            <div className="page-head">
              <h3>Notifications</h3>
              <button className="btn ghost" type="button" onClick={() => api.post('/notifications/read-all').then(() => setNotes((n) => n.map((x) => ({ ...x, readAt: new Date().toISOString() }))))}>Mark all read</button>
            </div>
            {notes.length === 0 && <div className="empty">No notifications.</div>}
            {notes.map((n) => (
              <button key={n.id} className="check-row note-item" type="button" onClick={() => openNote(n)}>
                <div>
                  <strong>{n.title}</strong>
                  <p>{n.message}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        <div className="page">
          <OtrAccessProvider ready={otrReady} unlocked={otrStages}>
            <Outlet />
          </OtrAccessProvider>
        </div>
      </div>
    </div>
  );
}
