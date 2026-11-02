import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as tasksApi from '../api/tasks';
import { taskKey, projectIdOf, formatShortDate, dueState, timeAgo } from '../utils/format';
import { Avatar, StatusPill, PriorityBadge } from './ui';

// Full task details are fetched once per task and kept for the session.
const cache = new Map();
export function clearPreviewCache() {
  cache.clear();
}

function loadDetails(task) {
  if (!cache.has(task._id)) {
    cache.set(
      task._id,
      tasksApi.getTask(projectIdOf(task), task._id).catch((err) => {
        cache.delete(task._id);
        throw err;
      })
    );
  }
  return cache.get(task._id);
}

// Floating card that follows the pointer next to a hovered task row and
// leans towards the direction of movement.
export default function TaskPreview({ task, anchor }) {
  const ref = useRef(null);
  const [full, setFull] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setFull(null);
    loadDetails(task)
      .then((t) => !cancelled && setFull(t))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [task]);

  // Position from the latest pointer coordinates without re-rendering.
  useEffect(() => {
    let raf;
    let last = { x: anchor.current.x, y: anchor.current.y };
    const tick = () => {
      const el = ref.current;
      if (el) {
        const { x, y } = anchor.current;
        const w = el.offsetWidth || 320;
        const h = el.offsetHeight || 200;
        const left = x + 28 + w > window.innerWidth ? x - w - 28 : x + 28;
        const top = Math.min(Math.max(12, y - h / 2), window.innerHeight - h - 12);
        const lean = Math.max(-12, Math.min(12, (x - last.x) * 0.8));
        el.style.transform = `translate3d(${left}px, ${top}px, 0) perspective(800px) rotateY(${-lean}deg) rotateZ(${lean * 0.15}deg)`;
        last = { x: last.x + (x - last.x) * 0.25, y };
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anchor]);

  const t = full || task;
  const lastComment = full?.comments?.length ? full.comments[full.comments.length - 1] : null;
  const due = dueState(t);

  return createPortal(
    <div ref={ref} className="task-preview" role="tooltip" data-testid="task-preview">
      <div className="task-preview-head">
        <span className="mono muted small">{taskKey(t)}</span>
        <StatusPill status={t.status} />
      </div>
      <strong className="task-preview-title">{t.title}</strong>
      {t.toTeam?.name && (
        <span className="route-line small">
          {t.fromTeam?.name && <span className="chip">{t.fromTeam.name}</span>}
          {t.fromTeam?.name && '→'}
          <span className="chip chip-team">{t.toTeam.name}</span>
        </span>
      )}
      <p className="task-preview-desc">
        {full ? full.description || 'No description' : <span className="shimmer">Loading details…</span>}
      </p>
      <div className="task-preview-meta">
        <PriorityBadge priority={t.priority} />
        {t.dueDate ? <span className={`due due-${due || 'none'}`}>Due {formatShortDate(t.dueDate)}</span> : <span className="muted small">No deadline</span>}
        <span className="cell-person small">
          {t.assignee ? (
            <>
              <Avatar user={t.assignee} size="xs" /> {t.assignee.name}
            </>
          ) : (
            <span className="muted">Unassigned</span>
          )}
        </span>
      </div>
      {lastComment && (
        <div className="task-preview-comment">
          <Avatar user={lastComment.author} size="xs" />
          <span>
            <strong>{lastComment.author?.name}</strong> {lastComment.text.length > 110 ? `${lastComment.text.slice(0, 110)}…` : lastComment.text}
            <span className="muted small"> · {timeAgo(lastComment.createdAt)}</span>
          </span>
        </div>
      )}
    </div>,
    document.body
  );
}
