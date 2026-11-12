import { useEffect, useMemo, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import * as tasksApi from '../api/tasks';
import { shouldPlayDropAnimation } from '../utils/dropAnimation';
import { onTaskChange, emitTaskChange } from '../utils/taskEvents';
import { STATUSES, projectIdOf } from '../utils/format';
import Column from './Column';

// Kanban view over an already-filtered task list. Owns the optimistic
// drag-to-move and the drop-to-done animation; `setTasks` comes from the
// parent so the list and board views share one source of truth.
export default function TaskBoard({ tasks, setTasks, onOpenTask, onError }) {
  const [justCompleted, setJustCompleted] = useState(null);
  // A small drag threshold keeps plain clicks opening the task.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const tasksByStatus = useMemo(() => {
    const grouped = Object.fromEntries(STATUSES.map((s) => [s.id, []]));
    tasks.forEach((t) => grouped[t.status]?.push(t));
    return grouped;
  }, [tasks]);

  // Status changes made in the task modal also trigger the animation.
  // prevStatus comes from this board's own task list, not the modal snapshot.
  useEffect(
    () =>
      onTaskChange(({ task, kind }) => {
        if (kind !== 'updated' || !task?._id) return;
        const prev = tasks.find((t) => t._id === task._id);
        if (prev && shouldPlayDropAnimation(prev.status, task.status)) setJustCompleted(task._id);
      }),
    [tasks]
  );

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over) return;
    const taskId = active.id;
    const newStatus = over.id;
    const task = tasks.find((t) => t._id === taskId);
    if (!task || task.status === newStatus) return;

    if (shouldPlayDropAnimation(task.status, newStatus)) setJustCompleted(taskId);

    // Optimistic update; the server response is the source of truth.
    setTasks((prev) => prev.map((t) => (t._id === taskId ? { ...t, status: newStatus } : t)));
    try {
      const updated = await tasksApi.updateTask(projectIdOf(task), taskId, { status: newStatus });
      setTasks((prev) => prev.map((t) => (t._id === taskId ? { ...t, ...updated } : t)));
      emitTaskChange(updated, 'moved');
    } catch (err) {
      onError?.(err.response?.data?.message || 'Could not move task, reverting');
      setTasks((prev) => prev.map((t) => (t._id === taskId ? task : t)));
      // Don't play "fell into done" on a card that's back in its old column.
      setJustCompleted((id) => (id === taskId ? null : id));
    }
  };

  const clearCompleting = (id) => setJustCompleted((cur) => (cur === id ? null : cur));

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="board">
        {STATUSES.map((col) => (
          <Column
            key={col.id}
            id={col.id}
            title={col.label}
            tasks={tasksByStatus[col.id] || []}
            onOpenTask={onOpenTask}
            justCompleted={justCompleted}
            onCompletingDone={clearCompleting}
          />
        ))}
      </div>
    </DndContext>
  );
}
