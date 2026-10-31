import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as tasksApi from '../api/tasks';
import { useUsers, useProjects } from '../hooks/useDirectory';
import useTaskChanges from '../hooks/useTaskChanges';
import { useTaskUi } from '../context/TaskUiContext';
import FilterBar, { EMPTY_FILTERS } from './FilterBar';
import TaskTable from './TaskTable';
import TaskBoard from './TaskBoard';
import Icon from './Icon';
import { EmptyState } from './ui';

const SORTS = [
  { id: 'updated', label: 'Last updated' },
  { id: 'created', label: 'Created' },
  { id: 'due', label: 'Due date' },
  { id: 'priority', label: 'Priority' },
  { id: 'title', label: 'Title' },
];

// URL <-> filter state, so dashboard links like
// /tasks?due=overdue&assignee=me land on a pre-filtered list.
function filtersFromParams(params) {
  const list = (k) => (params.get(k) ? params.get(k).split(',').filter(Boolean) : []);
  return {
    ...EMPTY_FILTERS,
    q: params.get('q') || '',
    status: list('status').map((s) => (s === 'in_progress' ? 'in-progress' : s === 'in_review' ? 'in-review' : s)),
    priority: list('priority'),
    assignee: params.get('assignee') || '',
    project: params.get('project') || '',
    due: params.get('due') || '',
    blocked: params.get('blocked') === '1',
    open: params.get('open') === '1',
    label: params.get('label') || '',
  };
}

function filtersToParams(f, extra) {
  const p = {};
  if (f.q) p.q = f.q;
  if (f.status.length) p.status = f.status.join(',');
  if (f.priority.length) p.priority = f.priority.join(',');
  if (f.assignee) p.assignee = f.assignee;
  if (f.project) p.project = f.project;
  if (f.due) p.due = f.due;
  if (f.blocked) p.blocked = '1';
  if (f.open) p.open = '1';
  if (f.label) p.label = f.label;
  return { ...p, ...extra };
}

/**
 * Props:
 *  - fixed: query params always applied (e.g. { assignee: 'me' }, { project: id })
 *  - hide: filter keys not shown because `fixed` sets them
 *  - storageKey: remembers list/board choice per page
 *  - empty: { title, text } for the empty state
 *  - newTaskDefaults: passed to the "New task" modal
 *  - syncUrl: mirror filters into the URL (default true)
 */
export default function TaskView({
  fixed = {},
  hide = [],
  storageKey = 'tasks',
  empty = { title: 'No tasks yet', text: 'Tasks will appear here.' },
  newTaskDefaults = {},
  syncUrl = true,
  showProject = true,
}) {
  const [params, setParams] = useSearchParams();
  const { users } = useUsers();
  const { projects } = useProjects();
  const { openTask, openNewTask } = useTaskUi();

  const [filters, setFilters] = useState(() => filtersFromParams(params));
  const [sort, setSort] = useState(params.get('sort') || 'updated');
  const [dir, setDir] = useState(params.get('dir') || (params.get('sort') === 'due' ? 'asc' : 'desc'));
  const [view, setView] = useState(() => localStorage.getItem(`oncare_view_${storageKey}`) || 'list');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fixedKey = JSON.stringify(fixed);
  const query = useMemo(
    () => ({ ...filtersToParams(filters, {}), ...fixed, sort, dir }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, fixedKey, sort, dir]
  );

  const load = useCallback(async () => {
    try {
      const data = await tasksApi.listAllTasks(query);
      setTasks(data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load tasks');
    } finally {
      setLoading(false);
    }
  }, [query]);

  // Debounce so typing in the search box doesn't fire a request per key.
  useEffect(() => {
    const t = setTimeout(load, filters.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, filters.q]);

  useTaskChanges(load);

  useEffect(() => {
    if (!syncUrl) return;
    const next = filtersToParams(filters, sort !== 'updated' ? { sort, dir } : {});
    // Keep unrelated params (e.g. ?task= deep links) intact.
    const keep = Object.fromEntries([...params.entries()].filter(([k]) => k === 'task'));
    setParams({ ...keep, ...next }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sort, dir, syncUrl]);

  const changeView = (v) => {
    setView(v);
    localStorage.setItem(`oncare_view_${storageKey}`, v);
  };

  const labels = useMemo(() => {
    const set = new Set();
    tasks.forEach((t) => t.labels?.forEach((l) => set.add(l)));
    return [...set].sort();
  }, [tasks]);

  const hasFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <div className="task-view">
      <FilterBar filters={filters} onChange={setFilters} users={users} projects={projects} labels={labels} hide={hide} />

      <div className="view-toolbar">
        <span className="muted small">{loading ? 'Loading…' : `${tasks.length} task${tasks.length === 1 ? '' : 's'}`}</span>
        <div className="view-toolbar-right">
          <select className="input input-filter" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="icon-btn icon-btn-bordered"
            onClick={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            aria-label={dir === 'asc' ? 'Ascending' : 'Descending'}
            title={dir === 'asc' ? 'Ascending' : 'Descending'}
          >
            <Icon name="sort" size={15} className={dir === 'asc' ? 'flip-y' : ''} />
          </button>
          <div className="segmented">
            <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => changeView('list')}>
              <Icon name="list" size={14} /> List
            </button>
            <button type="button" className={view === 'board' ? 'active' : ''} onClick={() => changeView('board')}>
              <Icon name="board" size={14} /> Board
            </button>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!loading && tasks.length === 0 && view === 'list' ? (
        <EmptyState
          title={hasFilters ? 'No tasks match these filters' : empty.title}
          action={
            hasFilters ? (
              <button type="button" className="btn btn-secondary" onClick={() => setFilters({ ...EMPTY_FILTERS })}>
                Clear filters
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => openNewTask(newTaskDefaults)}>
                <Icon name="plus" size={16} /> New task
              </button>
            )
          }
        >
          {hasFilters ? 'Try removing a filter.' : empty.text}
        </EmptyState>
      ) : view === 'board' ? (
        <TaskBoard tasks={tasks} setTasks={setTasks} onOpenTask={openTask} onError={setError} />
      ) : (
        <TaskTable tasks={tasks} onOpenTask={openTask} showProject={showProject} />
      )}
    </div>
  );
}
