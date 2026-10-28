import { useDroppable } from '@dnd-kit/core';
import TaskCard from './TaskCard';

export default function Column({ id, title, tasks, onOpenTask, justCompleted, onCompletingDone }) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div ref={setNodeRef} className={`board-column ${isOver ? 'board-column-over' : ''}`}>
      <div className="board-column-header">
        <h3>{title}</h3>
        <span className="muted small mono">{tasks.length}</span>
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
      </div>
    </div>
  );
}
