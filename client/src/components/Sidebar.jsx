import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import BrandLogo from './BrandLogo';
import NavIcon, { iconForGroup, iconForItem } from './NavIcons';

const EXPANDED_KEY = 'sahay_sidebar_expanded';
const LEGACY_EXPANDED_KEY = 'sahay-sidebar-expanded';
const SECTIONS_KEY = 'sahay_sidebar_sections';
const LEGACY_SECTIONS_KEY = 'sahay_nav_sections';

const DEFAULT_OPEN_SECTIONS = {
  Executive: true,
  Overview: true,
  'Sales & Pre-Sales': true,
  DESIGN: true,
  OTR: true,
  Sales: true,
  'Project Execution': true,
  Work: true,
  'Design & Engineering': false,
  Design: false,
  Procurement: false,
  'PPC & Production': false,
  Planning: false,
  Production: false,
  Quality: false,
  'Stores & Logistics': false,
  Stores: false,
  Logistics: false,
  Installation: false,
  Commercial: false,
  Information: false,
  Administration: false,
};

function pathMatches(to, pathname) {
  if (to === '/dashboard' || to === '/') return pathname === '/' || pathname === '/dashboard';
  return pathname === to || pathname.startsWith(`${to}/`);
}

function groupItems(menu) {
  return menu.reduce((acc, item) => {
    const name = item.group || '';
    const last = acc[acc.length - 1];
    if (!last || last.name !== name) acc.push({ name, items: [item] });
    else last.items.push(item);
    return acc;
  }, []);
}

function readSidebarExpanded() {
  const stored = localStorage.getItem(EXPANDED_KEY) ?? localStorage.getItem(LEGACY_EXPANDED_KEY);
  if (stored == null) return true;
  return stored === 'true';
}

function persistSidebarExpanded(value) {
  localStorage.setItem(EXPANDED_KEY, String(value));
}

function readOpenSections() {
  const defaults = { ...DEFAULT_OPEN_SECTIONS };
  try {
    const stored = localStorage.getItem(SECTIONS_KEY);
    if (stored) return { ...defaults, ...JSON.parse(stored) };
    const legacy = localStorage.getItem(LEGACY_SECTIONS_KEY);
    if (legacy) {
      const closed = JSON.parse(legacy);
      const inverted = Object.fromEntries(
        Object.entries(closed).map(([name, isClosed]) => [name, !isClosed]),
      );
      return { ...defaults, ...inverted };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return defaults;
}

function persistOpenSections(value) {
  localStorage.setItem(SECTIONS_KEY, JSON.stringify(value));
}

function SidebarHeader({ expanded, onToggle }) {
  return (
    <div className="sidebar-header">
      <div className="brand">
        <BrandLogo variant="white" compact={!expanded} />
      </div>
      {expanded && (
        <button
          className="nav-collapse is-header"
          type="button"
          onClick={onToggle}
          aria-label="Collapse sidebar"
        >
          <NavIcon name="chevronLeft" />
        </button>
      )}
    </div>
  );
}

function SidebarToggle({ expanded, onToggle, placement }) {
  const collapsed = !expanded;
  return (
    <button
      className={`nav-collapse is-${placement}`}
      type="button"
      onClick={onToggle}
      aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
      data-tooltip={collapsed ? 'Expand sidebar' : undefined}
    >
      <NavIcon name={collapsed && placement === 'footer' ? 'chevronRight' : 'menu'} />
      {expanded && <span>Collapse</span>}
    </button>
  );
}

function SidebarFooter({ expanded, onToggle }) {
  return (
    <div className="sidebar-footer">
      <SidebarToggle expanded={expanded} onToggle={onToggle} placement="footer" />
    </div>
  );
}

function HoverTip({ text, anchorRect }) {
  if (!text || !anchorRect) return null;
  return createPortal(
    <div
      className="nav-rail-tip"
      style={{
        top: anchorRect.top + anchorRect.height / 2,
        left: anchorRect.right + 10,
      }}
    >
      {text}
    </div>,
    document.body,
  );
}

function SectionHeader({ name, open, onToggle }) {
  return (
    <button
      type="button"
      className="nav-group"
      aria-expanded={open}
      onClick={onToggle}
    >
      <span>{name}</span>
      <em className={`nav-caret${open ? ' is-open' : ''}`} aria-hidden="true">
        <NavIcon name="chevronRight" />
      </em>
    </button>
  );
}

function SectionItems({ items, pathname }) {
  return items.map((item) => (
    <div key={item.to}>
      <NavLink
        to={item.to}
        end={item.to === '/' || item.to === '/dashboard' || item.to === '/otr'}
        className={pathMatches(item.to, pathname) ? 'active' : undefined}
      >
        <NavIcon name={iconForItem(item.to.split('?')[0])} />
        <span className="nav-label">{item.label}</span>
      </NavLink>
      {item.children?.map((child) => (
        <NavLink
          key={child.to}
          to={child.to}
          className={`nav-sub${!child.to.includes('?') && pathMatches(child.to, pathname) ? ' active' : ''}`}
        >
          <NavIcon name={iconForItem(child.to.split('?')[0])} />
          <span className="nav-label">{child.label}</span>
        </NavLink>
      ))}
    </div>
  ));
}

function SidebarSection({ name, items, open, expanded, pathname, onToggle }) {
  return (
    <div className="nav-section" data-expanded={expanded ? 'true' : 'false'}>
      {name ? <SectionHeader name={name} open={open} onToggle={onToggle} /> : null}
      {expanded && (!name || open) && <SectionItems items={items} pathname={pathname} />}
    </div>
  );
}

function FlyoutMenu({ group, pathname, anchorRect, onClose, onKeepOpen, onMouseLeaveDelay }) {
  const panelRef = useRef(null);
  const [coords, setCoords] = useState(() => ({
    top: anchorRect?.top ?? 0,
    left: (anchorRect?.right ?? 72) + 8,
  }));

  useLayoutEffect(() => {
    if (!anchorRect || !panelRef.current) return;
    const height = panelRef.current.offsetHeight;
    const maxTop = Math.max(8, window.innerHeight - height - 8);
    setCoords({
      top: Math.min(anchorRect.top, maxTop),
      left: anchorRect.right + 8,
    });
  }, [anchorRect, group]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose();
    }
    function onPointer(event) {
      if (panelRef.current?.contains(event.target)) return;
      if (event.target.closest?.('[data-nav-rail]')) return;
      onClose();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={panelRef}
      className="nav-flyout"
      role="menu"
      style={{ top: coords.top, left: coords.left }}
      onMouseEnter={onKeepOpen}
      onMouseLeave={onMouseLeaveDelay}
    >
      {group.name ? <h4>{group.name}</h4> : null}
      {group.items.map((item) => (
        <div key={item.to}>
          <NavLink
            to={item.to}
            role="menuitem"
            end={item.to === '/' || item.to === '/dashboard' || item.to === '/otr'}
            className={pathMatches(item.to, pathname) ? 'active' : undefined}
            onClick={onClose}
          >
            <NavIcon name={iconForItem(item.to.split('?')[0])} />
            <span>{item.label}</span>
          </NavLink>
          {item.children?.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              role="menuitem"
              className={`nav-sub${!child.to.includes('?') && pathMatches(child.to, pathname) ? ' active' : ''}`}
              onClick={onClose}
            >
              <NavIcon name={iconForItem(child.to.split('?')[0])} />
              <span>{child.label}</span>
            </NavLink>
          ))}
        </div>
      ))}
    </div>,
    document.body,
  );
}

export default function Sidebar({ menu, pathname, mobileOpen }) {
  const [sidebarExpanded, setSidebarExpanded] = useState(readSidebarExpanded);
  const [openSections, setOpenSections] = useState(readOpenSections);
  const [flyoutName, setFlyoutName] = useState(null);
  const [flyoutRect, setFlyoutRect] = useState(null);
  const [tip, setTip] = useState(null);
  const closeTimer = useRef(null);
  const menuRef = useRef(menu);
  menuRef.current = menu;

  const groups = useMemo(() => groupItems(menu), [menu]);
  const showLabels = sidebarExpanded || mobileOpen;
  const flyoutGroup = groups.find((group) => group.name === flyoutName) || null;

  useEffect(() => {
    persistOpenSections(openSections);
  }, [openSections]);

  useEffect(() => {
    const group = groupItems(menuRef.current).find((entry) => (
      entry.items.some((item) => pathMatches(item.to, pathname))
    ));
    if (!group?.name) return;
    setOpenSections((prev) => {
      if (prev[group.name]) return prev;
      return { ...prev, [group.name]: true };
    });
  }, [pathname]);

  useEffect(() => {
    setFlyoutName(null);
    setFlyoutRect(null);
    setTip(null);
  }, [pathname, sidebarExpanded, mobileOpen]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  function toggleSidebar() {
    setSidebarExpanded((current) => {
      const next = !current;
      persistSidebarExpanded(next);
      return next;
    });
  }

  function toggleSection(event, name) {
    event.preventDefault();
    event.stopPropagation();
    setOpenSections((prev) => ({ ...prev, [name]: prev[name] === false }));
  }

  const closeFlyoutSoon = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setFlyoutName(null);
      setFlyoutRect(null);
    }, 160);
  }, []);

  const hideFlyout = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setFlyoutName(null);
    setFlyoutRect(null);
  }, []);

  const keepFlyout = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  function openFlyout(name, event) {
    keepFlyout();
    setTip(null);
    setFlyoutName(name);
    setFlyoutRect(event.currentTarget.getBoundingClientRect());
  }

  function toggleFlyout(name, event) {
    if (flyoutName === name) {
      setFlyoutName(null);
      setFlyoutRect(null);
      return;
    }
    openFlyout(name, event);
  }

  function showTip(text, event) {
    if (flyoutName) return;
    setTip({ text, rect: event.currentTarget.getBoundingClientRect() });
  }

  return (
    <aside className={`sidebar ${mobileOpen ? 'open' : ''} ${showLabels ? 'is-expanded' : 'is-collapsed'} ${flyoutName ? 'has-flyout' : ''}`}>
      <SidebarHeader expanded={showLabels} onToggle={toggleSidebar} />
      <nav className="nav" aria-label="Primary">
        {groups.map((group) => {
          const key = group.name || group.items[0]?.to;
          const open = group.name ? openSections[group.name] !== false : true;
          if (!showLabels) {
            return (
              <div key={key} className="nav-section">
                <button
                  type="button"
                  data-nav-rail
                  className={`nav-rail-btn ${group.items.some((item) => pathMatches(item.to, pathname)) ? 'active' : ''} ${flyoutName === group.name ? 'is-open' : ''}`}
                  aria-label={group.name || group.items[0]?.label}
                  aria-expanded={flyoutName === group.name}
                  aria-haspopup="menu"
                  onClick={(event) => toggleFlyout(group.name, event)}
                  onMouseEnter={(event) => showTip(group.name || group.items[0]?.label, event)}
                  onMouseLeave={() => setTip(null)}
                >
                  <NavIcon name={iconForGroup(group.name)} />
                </button>
              </div>
            );
          }
          return (
            <SidebarSection
              key={key}
              name={group.name}
              items={group.items}
              open={open}
              expanded={showLabels}
              pathname={pathname}
              onToggle={(event) => toggleSection(event, group.name)}
            />
          );
        })}
      </nav>
      {!showLabels && <SidebarFooter expanded={showLabels} onToggle={toggleSidebar} />}
      {!showLabels && flyoutGroup && flyoutRect && (
        <FlyoutMenu
          group={flyoutGroup}
          pathname={pathname}
          anchorRect={flyoutRect}
          onClose={hideFlyout}
          onKeepOpen={keepFlyout}
          onMouseLeaveDelay={closeFlyoutSoon}
        />
      )}
      {!showLabels && !flyoutName && tip && (
        <HoverTip text={tip.text} anchorRect={tip.rect} />
      )}
    </aside>
  );
}
