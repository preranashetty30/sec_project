import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import {
  Bell, Briefcase, Check, ClipboardCheck, FolderGit2, GraduationCap, LayoutDashboard, LogOut,
  Menu, Moon, Search, Settings, Shield, Sparkles, Star, Sun, User,
} from 'lucide-react';
import { useAuth } from './auth.jsx';
import { api } from './api.js';
import { ErrorBoundary, Tooltip } from './ui.jsx';
import { storage } from './hooks.js';

const NAV = {
  student: [
    ['/dashboard', 'Dashboard', LayoutDashboard], ['/profile', 'Profile and skills', User], ['/evidence', 'Projects and certificates', FolderGit2],
    ['/assessments', 'Assessments', ClipboardCheck], ['/coach', 'AI coach', Sparkles], ['/classes', 'Classes', GraduationCap],
  ],
  faculty: [['/dashboard', 'Dashboard', LayoutDashboard], ['/classes', 'My classes', GraduationCap]],
  recruiter: [['/dashboard', 'Dashboard', LayoutDashboard], ['/talent', 'Find talent', Search], ['/shortlist', 'Shortlist', Star]],
  admin: [['/dashboard', 'Dashboard', LayoutDashboard], ['/admin', 'Admin console', Shield]],
};

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="SkillProof home">
      <span className="brand-mark"><Check size={18} strokeWidth={3} aria-hidden /></span> SkillProof
    </Link>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    storage.set('theme', theme);
  }, [theme]);
  const dark = theme === 'dark';
  return (
    <Tooltip label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <button className="btn btn-ghost icon-btn" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
        {dark ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
      </button>
    </Tooltip>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
    const c = new AbortController();
    api('/notifications', { signal: c.signal }).then((d) => setUnread(d.unread)).catch(() => {});
    return () => c.abort();
  }, [location.pathname]);

  return (
    <div className="shell">
      <a href="#main" className="skip-link">Skip to content</a>
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden />}
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Main navigation">
        <Brand />
        <nav className="nav">
          {NAV[user.role].map(([to, label, Icon]) => (
            <NavLink key={to} to={to}><Icon size={20} aria-hidden /> {label}</NavLink>
          ))}
          <NavLink to="/settings"><Settings size={20} aria-hidden /> Account</NavLink>
        </nav>
        <div className="sidebar-foot stack-sm">
          <div className="small">
            <strong>{user.name}</strong>
            <div className="muted">{user.role}{user.organization ? ` · ${user.organization}` : ''}</div>
          </div>
          <button className="btn btn-ghost" onClick={logout}><LogOut size={18} aria-hidden /> Log out</button>
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <button className="btn btn-ghost icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}>
            <Menu size={22} aria-hidden />
          </button>
          <span className="grow" />
          <ThemeToggle />
          <Tooltip label={unread ? `${unread} unread notifications` : 'Notifications'}>
            <Link to="/notifications" className="btn btn-ghost icon-btn" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
              <Bell size={20} aria-hidden />
              {unread > 0 && <span className="count-dot" aria-hidden>{unread > 9 ? '9+' : unread}</span>}
            </Link>
          </Tooltip>
        </header>
        <main id="main" className="main">
          {user.status === 'pending' && !['/notifications', '/settings'].includes(location.pathname) ? <PendingApproval /> : (
            <ErrorBoundary key={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          )}
        </main>
      </div>
    </div>
  );
}

function PendingApproval() {
  return (
    <div className="card empty">
      <Briefcase size={40} aria-hidden />
      <h1>Awaiting approval</h1>
      <p className="muted">An administrator reviews every faculty and recruiter account. You'll get a notification and an email once you're approved.</p>
      <Link className="btn btn-secondary" to="/notifications">View notifications</Link>
    </div>
  );
}
