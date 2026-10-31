import { useEffect, useRef, useState } from 'react';
import { STATUSES, PRIORITIES } from '../utils/format';
import Icon from './Icon';

export const EMPTY_FILTERS = {
  q: '',
  status: [],
  priority: [],
  assignee: '',
  project: '',
  due: '',
  blocked: false,
  open: false,
  label: '',
};

export function activeFilterCount(f) {
  return (
    (f.q ? 1 : 0) +
    f.status.length +
    f.priority.length +
    (f.assignee ? 1 : 0) +
    (f.project ? 1 : 0) +
    (f.due ? 1 : 0) +
    (f.blocked ? 1 : 0) +
    (f.open ? 1 : 0) +
    (f.label ? 1 : 0)
  );
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return { open, setOpen, ref };
}

function MultiSelect({ label, options, value, onChange }) {
  const { open, setOpen, ref } = usePopover();
  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="popover-anchor" ref={ref}>
      <button
        type="button"
        className={`btn btn-filter ${value.length ? 'btn-filter-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {label}
        {value.length > 0 && <span className="count-chip">{value.length}</span>}
      </button>
      {open && (
        <div className="popover menu-popover">
          {options.map((o) => (
            <label key={o.id} className="check-row">
              <input type="checkbox" checked={value.includes(o.id)} onChange={() => toggle(o.id)} />
              <span>{o.label}</span>
            </label>
          ))}
          {value.length > 0 && (
            <button type="button" className="link-btn small" onClick={() => onChange([])}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MoreFilters({ filters, set, labels }) {
  const { open, setOpen, ref } = usePopover();
  const count = (filters.blocked ? 1 : 0) + (filters.open ? 1 : 0) + (filters.label ? 1 : 0);
  return (
    <div className="popover-anchor" ref={ref}>
      <button type="button" className={`btn btn-filter ${count ? 'btn-filter-active' : ''}`} onClick={() => setOpen((v) => !v)}>
        <Icon name="sliders" size={15} /> More
        {count > 0 && <span className="count-chip">{count}</span>}
      </button>
      {open && (
        <div className="popover menu-popover">
          <label className="check-row">
            <input type="checkbox" checked={filters.open} onChange={(e) => set('open', e.target.checked)} />
            <span>Open only (hide done)</span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={filters.blocked} onChange={(e) => set('blocked', e.target.checked)} />
            <span>Blocked only</span>
          </label>
          <div className="menu-field">
            <span className="field-label">Label</span>
            <select className="input input-sm" value={filters.label} onChange={(e) => set('label', e.target.value)}>
              <option value="">Any label</option>
              {labels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// `hide` lists filter keys that are fixed by the page (e.g. 'assignee' on My Tasks).
export default function FilterBar({ filters, onChange, users = [], projects = [], labels = [], hide = [] }) {
  const set = (field, value) => onChange({ ...filters, [field]: value });
  const shown = (key) => !hide.includes(key);

  return (
    <div className="filter-bar">
      <div className="filter-search">
        <Icon name="search" size={15} />
        <input
          value={filters.q}
          onChange={(e) => set('q', e.target.value)}
          placeholder="Filter by ID, title, description"
          aria-label="Filter tasks"
        />
      </div>
      {shown('status') && <MultiSelect label="Status" options={STATUSES} value={filters.status} onChange={(v) => set('status', v)} />}
      <MultiSelect label="Priority" options={PRIORITIES} value={filters.priority} onChange={(v) => set('priority', v)} />
      {shown('assignee') && (
        <select className="input input-filter" value={filters.assignee} onChange={(e) => set('assignee', e.target.value)} aria-label="Assignee">
          <option value="">Any assignee</option>
          <option value="me">Me</option>
          <option value="none">Unassigned</option>
          {users.map((u) => (
            <option key={u._id} value={u._id}>
              {u.name}
            </option>
          ))}
        </select>
      )}
      {shown('project') && (
        <select className="input input-filter" value={filters.project} onChange={(e) => set('project', e.target.value)} aria-label="Project">
          <option value="">Any project</option>
          {projects.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <select className="input input-filter" value={filters.due} onChange={(e) => set('due', e.target.value)} aria-label="Due date">
        <option value="">Any due date</option>
        <option value="overdue">Overdue</option>
        <option value="today">Due today</option>
        <option value="week">Due this week</option>
        <option value="none">No due date</option>
      </select>
      <MoreFilters filters={filters} set={set} labels={labels} />
      {activeFilterCount(filters) > 0 && (
        <button type="button" className="link-btn small" onClick={() => onChange({ ...EMPTY_FILTERS })}>
          Clear filters
        </button>
      )}
    </div>
  );
}
