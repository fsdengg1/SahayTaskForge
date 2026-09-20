import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { menuFor } from '../utils/roles';
import NavIcon, { iconForGroup, iconForItem } from './NavIcons';
import ThemeToggle from './ThemeToggle';
import BrandLogo from './BrandLogo';

const EXPANDED_KEY = 'sahay-sidebar-expanded';
const SECTIONS_KEY = 'sahay_nav_sections';

function readExpanded() {
  return localStorage.getItem(EXPANDED_KEY) === 'true';
}

function pathMatches(to, pathname) {
  if (to === '/dashboard' || to === '/') return pathname === '/' || pathname === '/dashboard';
  return pathname === to || pathname.startsWith(`${to}/`);
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [notes, setNotes] = useState([]);
  const [showNotes, setShowNotes] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState(readExpanded);
  const [closedGroups, setClosedGroups] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SECTIONS_KEY) || '{}');
    } catch {
      return {};
    }
  });

  const railCollapsed = !expanded && !mobileOpen;

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

  const unread = notes.filter((n) => !n.readAt).length;
  const role = user?.roles?.[0]?.name || 'User';
  const menu = menuFor(user);
  const groups = useMemo(() => menu.reduce((acc, item) => {
    const name = item.group || '';
    const last = acc[acc.length - 1];
    if (!last || last.name !== name) acc.push({ name, items: [item] });
    else last.items.push(item);
    return acc;
  }, []), [menu]);

  function toggleExpanded() {
    setExpanded((current) => {
      const next = !current;
      localStorage.setItem(EXPANDED_KEY, String(next));
      return next;
    });
  }

  function toggleGroup(name) {
    setClosedGroups((cur) => {
      const next = { ...cur, [name]: !cur[name] };
      localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function groupActive(group) {
    return group.items.some((item) => pathMatches(item.to, location.pathname));
  }

  return (
    <div className={`app-shell ${railCollapsed ? 'nav-collapsed' : ''}`}>
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="brand" data-tooltip={railCollapsed ? 'Sahay Racks' : undefined}>
          <BrandLogo variant={railCollapsed ? 'color' : 'white'} compact={railCollapsed} />
          {!railCollapsed && (
            <>
              <h1>Sahay Racks</h1>
              <p>Project Tracking</p>
            </>
          )}
        </div>
        <nav className="nav">
          {groups.map((g) => {
            const open = !closedGroups[g.name];
            if (railCollapsed) {
              const home = g.items[0];
              return (
                <div key={g.name || home.to} className="nav-section">
                  <NavLink
                    to={home.to}
                    end={home.to === '/' || home.to === '/dashboard'}
                    data-tooltip={g.name || home.label}
                    className={groupActive(g) ? 'active' : undefined}
                  >
                    <NavIcon name={iconForGroup(g.name)} />
                  </NavLink>
                </div>
              );
            }
            return (
              <div key={g.name || 'menu'} className="nav-section">
                {g.name && (
                  <button type="button" className="nav-group" onClick={() => toggleGroup(g.name)}>
                    <span>{g.name}</span>
                    <em>{open ? '▾' : '▸'}</em>
                  </button>
                )}
                {open && g.items.map((m) => (
                  <NavLink
                    key={m.to}
                    to={m.to}
                    end={m.to === '/' || m.to === '/dashboard'}
                    className={pathMatches(m.to, location.pathname) ? 'active' : undefined}
                  >
                    <NavIcon name={iconForItem(m.to)} />
                    <span className="nav-label">{m.label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <button
          className="nav-collapse"
          type="button"
          onClick={toggleExpanded}
          data-tooltip={railCollapsed ? 'Expand sidebar' : undefined}
          title={railCollapsed ? 'Expand sidebar' : 'Collapse'}
        >
          {railCollapsed ? '»' : '« Collapse'}
        </button>
      </aside>
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
              <strong>{user?.fullName}</strong>
              <span>{role}</span>
            </div>
            <button className="btn secondary" type="button" onClick={() => { logout(); navigate('/login'); }}>Logout</button>
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
              <div key={n.id} className="check-row">
                <div>
                  <strong>{n.title}</strong>
                  <p>{n.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="page">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
