import { useMemo, useState } from 'react';
import * as tasksApi from '../api/tasks';
import { useAuth } from '../context/AuthContext';
import { useUsers, useProjects, useDepartments } from '../hooks/useDirectory';
import { emitTaskChange } from '../utils/taskEvents';
import { STATUSES, PRIORITIES, idOf } from '../utils/format';
import { Modal } from './ui';

// `defaults` can pre-fill project / assignee / status / toTeam (e.g. from a
// project page, a team page or a member page).
export default function CreateTaskModal({ defaults = {}, onClose, onCreated }) {
  const { departmentId, canManageTeam } = useAuth();
  const { users } = useUsers();
  const { projects } = useProjects();
  const { departments } = useDepartments();
  const [toTeam, setToTeam] = useState(defaults.toTeam || '');
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

  const team = departments.find((d) => d._id === toTeam);
  // Sending to a team: only its head (or a Super Admin) picks the assignee and deadline.
  const canPlan = !toTeam || canManageTeam(toTeam);
  const pickable = useMemo(
    () => (toTeam ? users.filter((u) => idOf(u.department) === toTeam) : users),
    [users, toTeam]
  );
  const normalProjects = projects.filter((p) => !p.system);

  const changeTeam = (value) => {
    setToTeam(value);
    // Keep the assignee only if they belong to the new team.
    if (value && assignee && !users.some((u) => u._id === assignee && idOf(u.department) === value)) setAssignee('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!projectId && !toTeam) {
      setError('Pick a team to send this to, or a project');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        title,
        description,
        priority,
        labels: labelsInput
          .split(',')
          .map((l) => l.trim())
          .filter(Boolean),
      };
      if (toTeam) payload.toTeam = toTeam;
      if (!toTeam) payload.status = status;
      if (canPlan) {
        payload.assignee = assignee || null;
        payload.dueDate = dueDate || null;
      }
      const task = await tasksApi.createTask(projectId || null, payload);
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
            {submitting ? 'Creating…' : toTeam && !canPlan ? `Send to ${team?.name || 'team'}` : 'Create task'}
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
          <textarea id="task-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>

        <div className="field-grid">
          <div className="field">
            <label htmlFor="task-team">Send to team</label>
            <select id="task-team" className="input" value={toTeam} onChange={(e) => changeTeam(e.target.value)}>
              <option value="">No team (project task)</option>
              {departments.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                  {d._id === departmentId ? ' (my team)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="task-project">Project</label>
            <select id="task-project" className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">{toTeam ? 'No project (team request)' : 'Select a project'}</option>
              {normalProjects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {canPlan ? (
            <>
              <div className="field">
                <label htmlFor="task-assignee">Assignee</label>
                <select id="task-assignee" className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">Unassigned</option>
                  {pickable.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="task-due">Deadline</label>
                <input id="task-due" className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </>
          ) : (
            <div className="field field-span">
              <div className="hint-box">
                The <strong>{team?.name}</strong> head{team?.heads?.length ? ` (${team.heads.map((h) => h.name).join(', ')})` : ''} will set
                the deadline and assign it to someone in their team. Both teams will see it.
              </div>
            </div>
          )}

          {!toTeam && (
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
          )}
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
            <label htmlFor="task-labels">Labels</label>
            <input id="task-labels" className="input" value={labelsInput} placeholder="comma separated" onChange={(e) => setLabelsInput(e.target.value)} />
          </div>
        </div>
        {toTeam && team && !team.heads?.length && (
          <p className="alert alert-error small">{team.name} has no Team Head yet. A Super Admin will need to assign it.</p>
        )}
      </form>
    </Modal>
  );
}
