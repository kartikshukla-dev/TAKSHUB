import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as ws from '../api/workspace';
import { useTaskUi } from '../context/TaskUiContext';
import { STATUS_LABEL } from '../utils/format';
import Icon from './Icon';
import { Avatar } from './ui';

const PAGES = [
  { label: 'Dashboard', to: '/dashboard', icon: 'dashboard' },
  { label: 'My Tasks', to: '/my-tasks', icon: 'userCircle' },
  { label: 'My To-dos', to: '/todos', icon: 'listTodo' },
  { label: 'Chat', to: '/chat', icon: 'message' },
  { label: 'Created by Me', to: '/created-by-me', icon: 'pen' },
  { label: 'All Tasks', to: '/tasks', icon: 'listChecks' },
  { label: 'Projects', to: '/projects', icon: 'folder' },
  { label: 'Team', to: '/team', icon: 'users' },
  { label: 'Calendar', to: '/calendar', icon: 'calendar' },
  { label: 'Activity', to: '/activity', icon: 'activity' },
  { label: 'Reports', to: '/reports', icon: 'chart' },
  { label: 'Settings', to: '/settings', icon: 'settings' },
];

export default function CommandPalette({ onClose }) {
  const navigate = useNavigate();
  const { openTask, openNewTask } = useTaskUi();
  const [q, setQ] = useState('');
  const [results, setResults] = useState({ tasks: [], projects: [], people: [] });
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults({ tasks: [], projects: [], people: [] });
      return undefined;
    }
    const t = setTimeout(() => {
      ws.search(term).then(setResults).catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    const pages = PAGES.filter((p) => !term || p.label.toLowerCase().includes(term)).map((p) => ({
      group: 'Go to',
      key: p.to,
      icon: p.icon,
      label: p.label,
      run: () => navigate(p.to),
    }));
    const actions = !term || 'new task'.includes(term)
      ? [{ group: 'Actions', key: 'new-task', icon: 'plus', label: 'New task', run: () => openNewTask() }]
      : [];
    const tasks = results.tasks.map((t) => ({
      group: 'Tasks',
      key: `t-${t._id}`,
      icon: 'listChecks',
      label: t.title,
      meta: `${t.project?.key ? `${t.project.key}-${t.number}` : ''} · ${STATUS_LABEL[t.status] || ''}`,
      run: () => openTask(t),
    }));
    const projects = results.projects.map((p) => ({
      group: 'Projects',
      key: `p-${p._id}`,
      icon: 'folder',
      label: p.name,
      meta: p.key,
      run: () => navigate(`/projects/${p._id}`),
    }));
    const people = results.people.map((u) => ({
      group: 'People',
      key: `u-${u._id}`,
      user: u,
      label: u.name,
      meta: u.jobTitle || u.email,
      run: () => navigate(`/team/${u._id}`),
    }));
    return [...actions, ...tasks, ...projects, ...people, ...pages];
  }, [q, results, navigate, openNewTask, openTask]);

  useEffect(() => setActive(0), [items.length]);

  const choose = (item) => {
    onClose();
    item.run();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault();
      choose(items[active]);
    }
  };

  let lastGroup = null;
  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Search">
        <div className="palette-input">
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search tasks, people, projects…"
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-list">
          {items.length === 0 && <li className="palette-empty">No results for “{q}”</li>}
          {items.map((item, idx) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.key}>
                {header && <div className="palette-group">{header}</div>}
                <button
                  type="button"
                  className={`palette-item ${idx === active ? 'palette-item-active' : ''}`}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => choose(item)}
                >
                  {item.user ? <Avatar user={item.user} size="xs" /> : <Icon name={item.icon} size={15} />}
                  <span className="palette-label">{item.label}</span>
                  {item.meta && <span className="palette-meta">{item.meta}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
