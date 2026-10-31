import { useDraggable } from '@dnd-kit/core';
import { getAgingStage, getAgingDays } from '../utils/taskAge';
import { taskKey, dueState, formatShortDate } from '../utils/format';
import { Avatar, PriorityBadge } from './ui';
import Icon from './Icon';

export default function TaskCard({ task, onOpen, isCompleting = false, onCompletingDone }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task._id,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 10 : undefined,
        opacity: isDragging ? 0.85 : 1,
      }
    : undefined;

  // Aging only applies to tasks still in flight; a "done" task has landed.
  const agingStage = task.status !== 'done' ? getAgingStage(task.createdAt) : 'fresh';
  const agingDays = getAgingDays(task.createdAt);
  const due = dueState(task);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`task-card${isCompleting ? ' task-card-completing' : ''}`}
      data-aging={task.status !== 'done' ? agingStage : undefined}
      onClick={() => onOpen(task)}
      onAnimationEnd={() => isCompleting && onCompletingDone?.(task._id)}
    >
      <div className="task-card-top">
        <span className="task-key">{taskKey(task)}</span>
        {task.blocked && (
          <span className="blocked-tag" title="Blocked">
            <Icon name="ban" size={12} /> Blocked
          </span>
        )}
        {(agingStage === 'deep-amber' || agingStage === 'red') && (
          <span className={`aging-badge aging-badge-${agingStage}`}>
            {agingStage === 'deep-amber' ? 'aging' : `${agingDays} days old`}
          </span>
        )}
      </div>
      <div className="task-title">{task.title}</div>
      {task.labels?.length > 0 && (
        <div className="label-list">
          {task.labels.map((l, idx) => (
            <span key={l} className={`label-chip ${idx % 2 === 0 ? 'label-chip-indigo' : 'label-chip-violet'}`}>
              {l}
            </span>
          ))}
        </div>
      )}
      <div className="task-card-bottom">
        <PriorityBadge priority={task.priority} />
        <span className="task-card-meta">
          {task.dueDate && <span className={`due due-${due || 'none'}`}>{formatShortDate(task.dueDate)}</span>}
          {task.assignee ? <Avatar user={task.assignee} size="xs" /> : <span className="avatar avatar-xs avatar-empty">?</span>}
        </span>
      </div>
    </div>
  );
}
