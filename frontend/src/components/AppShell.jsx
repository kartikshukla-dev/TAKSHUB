import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { LiveProvider, useLive } from '../context/LiveContext';
import { TaskUiProvider, useTaskUi } from '../context/TaskUiContext';
import { invalidateDirectory } from '../hooks/useDirectory';
import { ROLE_LABEL, WORKSPACE_NAME } from '../utils/format';
import Icon, { BrandMark } from './Icon';
import { Avatar } from './ui';
import CommandPalette from './CommandPalette';
import NotificationBell from './NotificationBell';

const PERSONAL = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/my-tasks', label: 'My Tasks', icon: 'userCircle' },
  { to: '/todos', label: 'My To-dos', icon: 'listTodo' },
  { to: '/chat', label: 'Chat', icon: 'message', badge: 'chat' },
  { to: '/created-by-me', label: 'Created by Me', icon: 'pen' },
  { to: '/tasks', label: 'All Tasks', icon: 'listChecks' },
];

const WORKSPACE = [
  { to: '/projects', label: 'Projects', icon: 'folder' },
  { to: '/team', label: 'Team', icon: 'users' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/activity', label: 'Activity', icon: 'activity' },
  { to: '/reports', label: 'Reports', icon: 'chart' },
];

function NavItem({ item, collapsed, badgeCount }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
      title={collapsed ? item.label : undefined}
    >
      <Icon name={item.icon} size={16} className="nav-icon" />
      {!collapsed && <span className="nav-label">{item.label}</span>}
      {badgeCount > 0 && <span className="nav-badge">{badgeCount > 99 ? '99+' : badgeCount}</span>}
    </NavLink>
  );
}

function Sidebar({ collapsed, onToggle }) {
  const { chatUnread } = useLive();
  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-head">
        <NavLink to="/dashboard" className="brand">
          <BrandMark size={28} />
          {!collapsed && <span className="brand-name">{WORKSPACE_NAME}</span>}
        </NavLink>
        <button type="button" className="icon-btn" onClick={onToggle} aria-label="Toggle sidebar">
          <Icon name={collapsed ? 'panelRight' : 'panelLeft'} size={16} />
        </button>
      </div>
      <nav className="sidebar-nav">
        <div className="nav-group">
          {PERSONAL.map((item) => (
            <NavItem key={item.to} item={item} collapsed={collapsed} badgeCount={item.badge === 'chat' ? chatUnread : 0} />
          ))}
        </div>
        <div className="nav-group">
          {!collapsed && <div className="nav-heading">Workspace</div>}
          {WORKSPACE.map((item) => (
            <NavItem key={item.to} item={item} collapsed={collapsed} />
          ))}
        </div>
        <div className="nav-group">
          <NavItem item={{ to: '/settings', label: 'Settings', icon: 'settings' }} collapsed={collapsed} />
        </div>
      </nav>
      {!collapsed && (
        <div className="sidebar-foot">
          <strong>{WORKSPACE_NAME}</strong>
          <span>Private workspace</span>
        </div>
      )}
    </aside>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const handleLogout = () => {
    invalidateDirectory();
    logout();
    navigate('/login');
  };

  return (
    <div className="popover-anchor" ref={ref}>
      <button type="button" className="avatar-btn" onClick={() => setOpen((v) => !v)} aria-label="Account menu">
        <Avatar user={user} />
      </button>
      {open && (
        <div className="popover user-popover">
          <div className="user-popover-head">
            <strong>{user?.name}</strong>
            <span className="muted small">{user?.email}</span>
            <span className="chip chip-accent">{ROLE_LABEL[user?.role] || user?.role}</span>
          </div>
          <button type="button" className="menu-item" onClick={() => { setOpen(false); navigate('/settings'); }}>
            <Icon name="settings" size={15} /> Settings
          </button>
          <button type="button" className="menu-item" onClick={handleLogout}>
            <Icon name="logout" size={15} /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

function Topbar({ onSearch }) {
  const { theme, toggleTheme } = useTheme();
  const { openNewTask } = useTaskUi();
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
  return (
    <header className="topbar">
      <button type="button" className="search-trigger" onClick={onSearch}>
        <Icon name="search" size={16} />
        <span>Search tasks, people, projects…</span>
        <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <div className="topbar-actions">
        <button type="button" className="btn btn-primary" onClick={() => openNewTask()}>
          <Icon name="plus" size={16} /> New task
        </button>
        <button type="button" className="icon-btn" onClick={toggleTheme} aria-label="Toggle dark mode">
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
        </button>
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}

function ShellLayout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('oncare_sidebar') === 'collapsed');
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggle = () => {
    setCollapsed((v) => {
      localStorage.setItem('oncare_sidebar', v ? 'open' : 'collapsed');
      return !v;
    });
  };

  return (
    <div className="shell">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="shell-main">
        <Topbar onSearch={() => setPaletteOpen(true)} />
        <main className="content">
          <Outlet />
        </main>
      </div>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

export default function AppShell() {
  return (
    <LiveProvider>
      <TaskUiProvider>
        <ShellLayout />
      </TaskUiProvider>
    </LiveProvider>
  );
}
