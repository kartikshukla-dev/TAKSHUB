import { useState } from 'react';
import * as tasksApi from '../api/tasks';
import { useUsers, useProjects } from '../hooks/useDirectory';
import { emitTaskChange } from '../utils/taskEvents';
import { STATUSES, PRIORITIES } from '../utils/format';
import { Modal } from './ui';

// `defaults` can pre-fill project / assignee / status (e.g. from a project
// page or a team member page).
export default function CreateTaskModal({ defaults = {}, onClose, onCreated }) {
  const { users } = useUsers();
  const { projects } = useProjects();
  const [projectId, setProjectId] = useState(defaults.project || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState(defaults.status || 'todo');
  const [priority, setPriority] = useState('medium');
  const [assignee, setAssignee] = useState(defaults.assignee || '');
  const [dueDate, setDueDate] = useState(defaults.dueDate || '');
  const [labelsInput, setLabelsInput] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!projectId) {
      setError('Pick a project');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const task = await tasksApi.createTask(projectId, {
        title,
        description,
        status,
        priority,
        assignee: assignee || null,
        dueDate: dueDate || null,
        labels: labelsInput
          .split(',')
          .map((l) => l.trim())
          .filter(Boolean),
      });
      emitTaskChange(task, 'created');
      onCreated?.(task);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create task');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="New task"
      icon="plus"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="create-task-form" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create task'}
          </button>
        </>
      }
    >
      <form id="create-task-form" onSubmit={handleSubmit} className="form-stack">
        {error && <div className="alert alert-error">{error}</div>}

        <div className="field">
          <label htmlFor="task-title">Title</label>
          <input
            id="task-title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            autoFocus
            required
          />
        </div>

        <div className="field">
          <label htmlFor="task-desc">Description</label>
          <textarea
            id="task-desc"
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>

        <div className="field-grid">
          <div className="field">
            <label htmlFor="task-project">Project</label>
            <select id="task-project" className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
              <option value="">Select a project</option>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="task-assignee">Assignee</label>
            <select id="task-assignee" className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {users.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="task-status">Status</label>
            <select id="task-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="task-priority">Priority</label>
            <select id="task-priority" className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="task-due">Due date</label>
            <input id="task-due" className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="task-labels">Labels</label>
            <input
              id="task-labels"
              className="input"
              value={labelsInput}
              placeholder="comma separated"
              onChange={(e) => setLabelsInput(e.target.value)}
            />
          </div>
        </div>
        {projects.length === 0 && (
          <p className="muted small">You don&apos;t have access to any active project yet. Ask an admin or manager to add you.</p>
        )}
      </form>
    </Modal>
  );
}
