import { createContext, useContext, useState } from 'react';
import TaskModal from '../components/TaskModal';
import CreateTaskModal from '../components/CreateTaskModal';

// Lets any page open the task detail modal or the "New task" modal without
// owning that state itself.
const TaskUiContext = createContext(null);

export function TaskUiProvider({ children }) {
  const [openTask, setOpenTask] = useState(null);
  const [createDefaults, setCreateDefaults] = useState(null);

  return (
    <TaskUiContext.Provider
      value={{
        openTask: (task) => setOpenTask(task),
        openNewTask: (defaults = {}) => setCreateDefaults(defaults),
      }}
    >
      {children}
      {openTask && <TaskModal key={openTask._id} task={openTask} onClose={() => setOpenTask(null)} />}
      {createDefaults && <CreateTaskModal defaults={createDefaults} onClose={() => setCreateDefaults(null)} />}
    </TaskUiContext.Provider>
  );
}

export function useTaskUi() {
  const ctx = useContext(TaskUiContext);
  if (!ctx) throw new Error('useTaskUi must be used within a TaskUiProvider');
  return ctx;
}
