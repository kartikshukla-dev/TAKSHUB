import { useEffect, useRef, useState } from 'react';
import { NOT_APPROVED, taskKey, timeAgo } from '../utils/format';
import { Avatar } from './ui';
import Icon from './Icon';

// "Not approved (2)" button above the board. Opens a small list of the
// Not approved tasks in the current view; click one to open it.
export default function NotApprovedMenu({ tasks, onOpenTask }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const list = tasks.filter((t) => t.status === NOT_APPROVED);

  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const key = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <div className="popover-anchor" ref={ref}>
      <button
        type="button"
        className={`btn btn-secondary btn-sm na-menu-btn ${list.length ? 'na-menu-btn-on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="status-dot status-dot-not-approved" />
        Not approved
        <span className="na-menu-count">{list.length}</span>
      </button>
      {open && (
        <div className="popover na-menu" role="dialog" aria-label="Not approved tasks">
          <div className="na-menu-head">
            <strong>Not approved</strong>
            <span className="muted small">
              {list.length} task{list.length === 1 ? '' : 's'}
            </span>
          </div>
          {list.length === 0 ? (
            <p className="muted small na-menu-empty">No tasks are Not approved right now.</p>
          ) : (
            <ul className="na-menu-list">
              {list.map((t) => (
                <li key={t._id}>
                  <button
                    type="button"
                    className="na-menu-item"
                    onClick={() => {
                      setOpen(false);
                      onOpenTask(t);
                    }}
                  >
                    <span className="na-menu-top">
                      <span className="task-key">{taskKey(t)}</span>
                      {t.toTeam?.name && <span className="team-tag">→ {t.toTeam.name}</span>}
                      <span className="na-menu-who">
                        {t.assignee ? <Avatar user={t.assignee} size="xs" /> : null}
                      </span>
                    </span>
                    <span className="na-menu-title">{t.title}</span>
                    {t.notApproved?.reason && (
                      <span className="na-menu-reason">
                        “{t.notApproved.reason}”
                        <span className="muted"> · {t.notApproved.by?.name || 'Team head'}, {timeAgo(t.notApproved.at)}</span>
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small na-menu-foot">
            <Icon name="info" size={12} /> Only the team head can change these. Open a task to see why.
          </p>
        </div>
      )}
    </div>
  );
}
