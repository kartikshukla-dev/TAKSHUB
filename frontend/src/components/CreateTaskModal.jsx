import { useState } from 'react';

export default function CreateTaskModal({ members, onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assignee, setAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [labelsInput, setLabelsInput] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onCreate({
        title,
        description,
        priority,
        assignee: assignee || null,
        dueDate: dueDate || null,
        labels: labelsInput
          .split(',')
          .map((l) => l.trim())
          .filter(Boolean),
      });
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create task');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>New task</h2>
        <form onSubmit={handleSubmit}>
          {error && <div className="alert alert-error">{error}</div>}

          <label htmlFor="task-title">Title</label>
          <input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} required />

          <label htmlFor="task-desc">Description</label>
          <textarea id="task-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />

          <label htmlFor="task-priority">Priority</label>
          <select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>

          <label htmlFor="task-assignee">Assignee</label>
          <select id="task-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m._id || m.id} value={m._id || m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <label htmlFor="task-due">Due date</label>
          <input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />

          <label htmlFor="task-labels">Labels (comma separated)</label>
          <input id="task-labels" value={labelsInput} onChange={(e) => setLabelsInput(e.target.value)} />

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
