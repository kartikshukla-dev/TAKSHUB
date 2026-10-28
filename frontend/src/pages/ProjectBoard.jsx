import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DndContext } from '@dnd-kit/core';
import * as projectsApi from '../api/projects';
import * as tasksApi from '../api/tasks';
import * as usersApi from '../api/users';
import { useSocket } from '../context/SocketContext';
import { shouldPlayDropAnimation } from '../utils/dropAnimation';
import Column from '../components/Column';
import TaskModal from '../components/TaskModal';
import CreateTaskModal from '../components/CreateTaskModal';
import FilterBar from '../components/FilterBar';
import ActivityFeed from '../components/ActivityFeed';

const COLUMNS = [
  { id: 'todo', title: 'To Do' },
  { id: 'in-progress', title: 'In Progress' },
  { id: 'done', title: 'Done' },
];

export default function ProjectBoard() {
  const { id: projectId } = useParams();
  const { joinProject, leaveProject, on, off } = useSocket();

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [openTask, setOpenTask] = useState(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [activityFeed, setActivityFeed] = useState([]);
  const [filters, setFilters] = useState({ assignee: '', priority: '', label: '' });
  const [justCompleted, setJustCompleted] = useState(null); // id of the task currently playing the drop-to-done animation

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [proj, taskList, allUsers] = await Promise.all([
          projectsApi.getProject(projectId),
          tasksApi.listTasks(projectId),
          usersApi.listUsers(),
        ]);
        if (cancelled) return;
        setProject(proj);
        setTasks(taskList);
        setMembers(allUsers);
      } catch {
        if (!cancelled) setError('Could not load project board');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Join the project's socket room so live task events reach this board.
  useEffect(() => {
    joinProject(projectId);

    const handleCreated = (task) => {
      setTasks((prev) => (prev.some((t) => t._id === task._id) ? prev : [task, ...prev]));
    };
    const handleUpdated = (task) => {
      setTasks((prev) => prev.map((t) => (t._id === task._id ? task : t)));
    };
    const handleDeleted = ({ id }) => {
      setTasks((prev) => prev.filter((t) => t._id !== id));
    };
    const handleCommented = (task) => {
      setTasks((prev) => prev.map((t) => (t._id === task._id ? { ...t, comments: task.comments } : t)));
    };

    on('task:created', handleCreated);
    on('task:updated', handleUpdated);
    on('task:deleted', handleDeleted);
    on('task:commented', handleCommented);

    return () => {
      leaveProject(projectId);
      off('task:created', handleCreated);
      off('task:updated', handleUpdated);
      off('task:deleted', handleDeleted);
      off('task:commented', handleCommented);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const allLabels = useMemo(() => {
    const set = new Set();
    tasks.forEach((t) => t.labels?.forEach((l) => set.add(l)));
    return Array.from(set);
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filters.assignee && (t.assignee?._id || t.assignee) !== filters.assignee) return false;
      if (filters.priority && t.priority !== filters.priority) return false;
      if (filters.label && !t.labels?.includes(filters.label)) return false;
      return true;
    });
  }, [tasks, filters]);

  const tasksByStatus = useMemo(() => {
    const grouped = { todo: [], 'in-progress': [], done: [] };
    filteredTasks.forEach((t) => grouped[t.status]?.push(t));
    return grouped;
  }, [filteredTasks]);

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over) return;
    const taskId = active.id;
    const newStatus = over.id;
    const task = tasks.find((t) => t._id === taskId);
    if (!task || task.status === newStatus) return;

    if (shouldPlayDropAnimation(task.status, newStatus)) setJustCompleted(taskId);

    // Optimistic update, backend is the source of truth once the response/socket arrives.
    setTasks((prev) => prev.map((t) => (t._id === taskId ? { ...t, status: newStatus } : t)));
    try {
      const updated = await tasksApi.updateTask(projectId, taskId, { status: newStatus });
      setTasks((prev) => prev.map((t) => (t._id === taskId ? updated : t)));
    } catch {
      setError('Could not move task, reverting');
      setTasks((prev) => prev.map((t) => (t._id === taskId ? task : t)));
      // The move was reverted, so don't play "fell into done" on a card that's
      // visibly back in its original column.
      setJustCompleted((id) => (id === taskId ? null : id));
    }
  };

  const handleCreateTask = async (payload) => {
    const task = await tasksApi.createTask(projectId, payload);
    setTasks((prev) => [task, ...prev]);
  };

  const handleTaskUpdated = (updatedTask) => {
    // Derive prevStatus from the authoritative `tasks` array (kept in sync by
    // the socket listeners too), not from the modal's possibly-stale snapshot.
    const prev = tasks.find((t) => t._id === updatedTask._id);
    if (prev && shouldPlayDropAnimation(prev.status, updatedTask.status)) {
      setJustCompleted(updatedTask._id);
    }
    setTasks((prevTasks) => prevTasks.map((t) => (t._id === updatedTask._id ? updatedTask : t)));
    setOpenTask(updatedTask);
  };

  const clearCompleting = (id) => setJustCompleted((cur) => (cur === id ? null : cur));

  const toggleActivityFeed = async () => {
    if (!showActivity) {
      const feed = await projectsApi.getActivityFeed(projectId);
      setActivityFeed(feed);
    }
    setShowActivity((v) => !v);
  };

  if (loading) return <div className="centered">Loading board...</div>;
  if (!project) return <div className="centered">{error || 'Project not found'}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <span className="project-key">{project.key}</span>
          <h1>{project.name}</h1>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-ghost" onClick={toggleActivityFeed}>
            {showActivity ? 'Hide activity' : 'Project activity'}
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreateTask(true)}>
            + New task
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <FilterBar members={members} allLabels={allLabels} filters={filters} onChange={setFilters} />

      <div className="board-layout">
        <DndContext onDragEnd={handleDragEnd}>
          <div className="board">
            {COLUMNS.map((col) => (
              <Column
                key={col.id}
                id={col.id}
                title={col.title}
                tasks={tasksByStatus[col.id] || []}
                onOpenTask={setOpenTask}
                justCompleted={justCompleted}
                onCompletingDone={clearCompleting}
              />
            ))}
          </div>
        </DndContext>

        {showActivity && <ActivityFeed feed={activityFeed} onClose={() => setShowActivity(false)} />}
      </div>

      {openTask && (
        <TaskModal
          task={openTask}
          members={members}
          projectId={projectId}
          onClose={() => setOpenTask(null)}
          onUpdated={handleTaskUpdated}
        />
      )}

      {showCreateTask && (
        <CreateTaskModal
          members={members}
          onClose={() => setShowCreateTask(false)}
          onCreate={handleCreateTask}
        />
      )}
    </div>
  );
}
