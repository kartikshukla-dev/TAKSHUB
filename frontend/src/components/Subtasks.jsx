import { useState } from 'react';
import * as tasksApi from '../api/tasks';
import Icon from './Icon';
import { Avatar } from './ui';
import { idOf, formatShortDate } from '../utils/format';

export function subtaskProgress(task) {
  const list = task?.subtasks || [];
  return { done: list.filter((s) => s.done).length, total: list.length };
}

// "☑ 2/5" on board cards and list rows; hidden when there are none.
export function SubtaskBadge({ task }) {
  const { done, total } = subtaskProgress(task);
  if (!total) return null;
  return (
    <span className={`subtask-badge ${done === total ? 'subtask-badge-done' : ''}`} title={`${done} of ${total} subtasks done`}>
      <Icon name="listChecks" size={12} /> {done}/{total}
    </span>
  );
}

const isOverdue = (s) => !s.done && s.dueDate && new Date(s.dueDate) < new Date(new Date().toDateString());

function SubtaskRow({ sub, people, busy, first, last, onPatch, onDelete, onMove }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(sub.title);
  const [details, setDetails] = useState(false);

  const saveTitle = () => {
    setEditing(false);
    const next = title.trim();
    if (next && next !== sub.title) onPatch({ title: next });
    else setTitle(sub.title);
  };

  return (
    <li className={`subtask ${sub.done ? 'subtask-done' : ''}`}>
      <input
        type="checkbox"
        checked={sub.done}
        onChange={(e) => onPatch({ done: e.target.checked })}
        disabled={busy}
        aria-label={`Mark "${sub.title}" ${sub.done ? 'not done' : 'done'}`}
      />
      <div className="subtask-main">
        {editing ? (
          <input
            className="input subtask-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setTitle(sub.title);
                setEditing(false);
              }
            }}
            maxLength={300}
            aria-label="Subtask title"
            autoFocus
          />
        ) : (
          <button type="button" className="subtask-title" onClick={() => setEditing(true)} title="Click to rename">
            {sub.title}
          </button>
        )}
        {(sub.assignee || sub.dueDate) && !details && (
          <span className="subtask-meta">
            {sub.assignee && (
              <span className="cell-person small">
                <Avatar user={sub.assignee} size="xs" /> {sub.assignee.name}
              </span>
            )}
            {sub.dueDate && <span className={`small ${isOverdue(sub) ? 'text-danger' : 'muted'}`}>{formatShortDate(sub.dueDate)}</span>}
          </span>
        )}
        {details && (
          <div className="subtask-details">
            <select
              className="input select-inline"
              value={idOf(sub.assignee)}
              onChange={(e) => onPatch({ assignee: e.target.value || null })}
              aria-label="Subtask assignee"
            >
              <option value="">No assignee</option>
              {sub.assignee && !people.some((p) => p._id === idOf(sub.assignee)) && (
                <option value={idOf(sub.assignee)}>{sub.assignee.name}</option>
              )}
              {people.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              className="input select-inline"
              value={sub.dueDate ? String(sub.dueDate).slice(0, 10) : ''}
              onChange={(e) => onPatch({ dueDate: e.target.value || null })}
              aria-label="Subtask deadline"
            />
          </div>
        )}
      </div>
      <div className="subtask-actions">
        <button type="button" className={`icon-btn icon-btn-sm ${details ? 'is-on' : ''}`} onClick={() => setDetails((v) => !v)} aria-label="Assignee and deadline" title="Assignee and deadline">
          <Icon name="calendar" size={14} />
        </button>
        <button type="button" className="icon-btn icon-btn-sm" onClick={() => onMove(-1)} disabled={first || busy} aria-label="Move up" title="Move up">
          <Icon name="chevronDown" size={14} className="flip-y" />
        </button>
        <button type="button" className="icon-btn icon-btn-sm" onClick={() => onMove(1)} disabled={last || busy} aria-label="Move down" title="Move down">
          <Icon name="chevronDown" size={14} />
        </button>
        <button type="button" className="icon-btn icon-btn-sm" onClick={onDelete} disabled={busy} aria-label={`Delete "${sub.title}"`} title="Delete">
          <Icon name="trash" size={14} />
        </button>
      </div>
    </li>
  );
}

/**
 * Checklist inside the task modal. Changes show instantly and roll back if
 * the server refuses. props: task, projectId, people (who can be assigned),
 * onTask(updatedTask), onError(message)
 */
export default function Subtasks({ task, projectId, people, onTask, onError }) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const list = [...(task.subtasks || [])].sort((a, b) => a.order - b.order);
  const { done, total } = subtaskProgress(task);

  const run = async (optimistic, call) => {
    const before = task;
    if (optimistic) onTask({ ...task, subtasks: optimistic });
    setBusy(true);
    try {
      onTask(await call());
      onError('');
      return true;
    } catch (err) {
      onTask(before);
      onError(err.response?.data?.message || 'Could not update the subtask');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    const ok = await run(null, () => tasksApi.addSubtask(projectId, task._id, { title }));
    if (!ok) setDraft(title);
  };

  const patch = (sub, payload) => {
    const local = { ...payload };
    if ('assignee' in local) local.assignee = local.assignee ? people.find((p) => p._id === local.assignee) || local.assignee : null;
    return run(
      list.map((s) => (s._id === sub._id ? { ...s, ...local } : s)),
      () => tasksApi.updateSubtask(projectId, task._id, sub._id, payload)
    );
  };

  const remove = (sub) => {
    if (!window.confirm(`Delete subtask "${sub.title}"?`)) return;
    run(
      list.filter((s) => s._id !== sub._id),
      () => tasksApi.deleteSubtask(projectId, task._id, sub._id)
    );
  };

  const move = (i, dir) => {
    const next = [...list];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    const ordered = next.map((s, idx) => ({ ...s, order: idx }));
    run(ordered, () => tasksApi.reorderSubtasks(projectId, task._id, ordered.map((s) => s._id)));
  };

  return (
    <section className="task-section">
      <div className="task-section-head">
        <h4>
          Subtasks {total > 0 && <span className="muted small">{done}/{total}</span>}
        </h4>
      </div>
      {total > 0 && (
        <span className="progress subtask-progress" aria-hidden="true">
          <span className="progress-fill" style={{ width: `${Math.round((done / total) * 100)}%` }} />
        </span>
      )}
      {total > 0 && (
        <ul className="subtask-list">
          {list.map((s, i) => (
            <SubtaskRow
              key={s._id}
              sub={s}
              people={people}
              busy={busy}
              first={i === 0}
              last={i === list.length - 1}
              onPatch={(payload) => patch(s, payload)}
              onDelete={() => remove(s)}
              onMove={(dir) => move(i, dir)}
            />
          ))}
        </ul>
      )}
      <form className="subtask-add" onSubmit={add}>
        <Icon name="plus" size={14} />
        <input
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a subtask and press Enter"
          maxLength={300}
          aria-label="New subtask"
        />
      </form>
    </section>
  );
}
