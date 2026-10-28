import { useDraggable } from '@dnd-kit/core';
import { getAgingStage, getAgingDays } from '../utils/taskAge';

const PRIORITY_COLORS = {
  low: 'var(--priority-low)',
  medium: 'var(--priority-medium)',
  high: 'var(--priority-high)',
  urgent: 'var(--priority-urgent)',
};

export default function TaskCard({ task, onOpen, isCompleting = false, onCompletingDone }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task._id,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 10 : undefined,
        opacity: isDragging ? 0.8 : 1,
      }
    : undefined;

  // Aging only applies to tasks still in flight; a "done" task has landed.
  const agingStage = task.status !== 'done' ? getAgingStage(task.createdAt) : 'fresh';
  const agingDays = getAgingDays(task.createdAt);

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
        <span className="priority-dot" style={{ backgroundColor: PRIORITY_COLORS[task.priority] }} />
        <span className="task-title">{task.title}</span>
      </div>
      {task.labels?.length > 0 && (
        <div className="label-list">
          {task.labels.map((l, idx) => (
            <span key={l} className={`label-chip ${idx % 2 === 0 ? 'label-chip-indigo' : 'label-chip-violet'}`}>
              {l}
            </span>
          ))}
        </div>
      )}
      {(agingStage === 'deep-amber' || agingStage === 'red') && (
        <span className={`aging-badge aging-badge-${agingStage}`}>
          {agingStage === 'deep-amber' ? 'aging' : `${agingDays} days old`}
        </span>
      )}
      <div className="task-card-bottom">
        <span className="muted small">{task.assignee ? task.assignee.name : 'Unassigned'}</span>
        {task.dueDate && <span className="muted small">{new Date(task.dueDate).toLocaleDateString()}</span>}
      </div>
    </div>
  );
}
