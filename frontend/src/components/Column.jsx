import { useDroppable } from '@dnd-kit/core';
import TaskCard from './TaskCard';

export default function Column({ id, title, tasks, onOpenTask, justCompleted, onCompletingDone }) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div ref={setNodeRef} className={`board-column ${isOver ? 'board-column-over' : ''}`}>
      <div className="board-column-header">
        <span className={`status-dot status-dot-${id}`} />
        <h3>{title}</h3>
        <span className="count-chip">{tasks.length}</span>
      </div>
      <div className="board-column-body">
        {tasks.map((task) => (
          <TaskCard
            key={task._id}
            task={task}
            onOpen={onOpenTask}
            isCompleting={task._id === justCompleted}
            onCompletingDone={onCompletingDone}
          />
        ))}
        {tasks.length === 0 && <div className="board-column-empty">Drop tasks here</div>}
      </div>
    </div>
  );
}
