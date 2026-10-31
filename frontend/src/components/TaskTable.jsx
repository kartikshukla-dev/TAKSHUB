import { taskKey, dueState, formatShortDate, timeAgo } from '../utils/format';
import { Avatar, StatusPill, PriorityBadge } from './ui';
import Icon from './Icon';

export default function TaskTable({ tasks, onOpenTask, showProject = true }) {
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
              <tr key={t._id} className="row-click" onClick={() => onOpenTask(t)}>
                <td className="col-key mono">{taskKey(t)}</td>
                <td className="col-title">
                  <span className="cell-title">{t.title}</span>
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
    </div>
  );
}
