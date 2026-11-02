import { useEffect, useRef, useState } from 'react';
import { taskKey, dueState, formatShortDate, timeAgo } from '../utils/format';
import { useEffects } from '../context/EffectsContext';
import { Avatar, StatusPill, PriorityBadge } from './ui';
import TaskPreview from './TaskPreview';
import Icon from './Icon';

const HOVER_DELAY = 220;

export default function TaskTable({ tasks, onOpenTask, showProject = true }) {
  const { reduceEffects } = useEffects();
  const [hovered, setHovered] = useState(null);
  const anchor = useRef({ x: 0, y: 0 });
  const timer = useRef(null);
  // Hover previews only for mouse/trackpad users.
  const canHover = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(hover: hover)').matches);
  const previews = canHover && !reduceEffects;

  useEffect(() => () => clearTimeout(timer.current), []);

  const enter = (t) => (e) => {
    if (!previews) return;
    anchor.current = { x: e.clientX, y: e.clientY };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHovered(t), HOVER_DELAY);
  };
  const move = (e) => {
    anchor.current = { x: e.clientX, y: e.clientY };
  };
  const leave = () => {
    clearTimeout(timer.current);
    setHovered(null);
  };

  return (
    <div className="table-wrap">
      <table className="table task-table">
        <thead>
          <tr>
            <th className="col-key">ID</th>
            <th>Title</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Assignee</th>
            {showProject && <th>Project</th>}
            <th>Due</th>
            <th className="col-right">Updated</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const due = dueState(t);
            return (
              <tr
                key={t._id}
                className={`row-click ${hovered?._id === t._id ? 'row-hovered' : ''}`}
                onClick={() => {
                  leave();
                  onOpenTask(t);
                }}
                onMouseEnter={enter(t)}
                onMouseMove={move}
                onMouseLeave={leave}
              >
                <td className="col-key mono">{taskKey(t)}</td>
                <td className="col-title">
                  <span className="cell-title">{t.title}</span>
                  {t.toTeam?.name && (
                    <span className="team-tag" title={t.fromTeam?.name ? `${t.fromTeam.name} → ${t.toTeam.name}` : t.toTeam.name}>
                      → {t.toTeam.name}
                    </span>
                  )}
                  {t.blocked && (
                    <span className="blocked-tag">
                      <Icon name="ban" size={12} /> Blocked
                    </span>
                  )}
                </td>
                <td>
                  <StatusPill status={t.status} />
                </td>
                <td>
                  <PriorityBadge priority={t.priority} />
                </td>
                <td>
                  {t.assignee ? (
                    <span className="cell-person">
                      <Avatar user={t.assignee} size="xs" />
                      {t.assignee.name}
                    </span>
                  ) : (
                    <span className="muted">Unassigned</span>
                  )}
                </td>
                {showProject && <td className="muted">{t.project?.name}</td>}
                <td>{t.dueDate ? <span className={`due due-${due || 'none'}`}>{formatShortDate(t.dueDate)}</span> : <span className="muted">—</span>}</td>
                <td className="col-right muted small">{timeAgo(t.updatedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {hovered && <TaskPreview key={hovered._id} task={hovered} anchor={anchor} />}
    </div>
  );
}
