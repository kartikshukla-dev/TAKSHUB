import { useState } from 'react';
import { Modal } from './ui';

// `users` (optional) enables the owner picker.
export default function CreateProjectModal({ onClose, onCreate, users = [] }) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [startDate, setStartDate] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = { name, key, description };
      // Only send the optional fields when set, so the minimal payload stays minimal.
      if (owner) payload.owner = owner;
      if (startDate) payload.startDate = startDate;
      if (targetDate) payload.targetDate = targetDate;
      if (visibility !== 'private') payload.visibility = visibility;
      await onCreate(payload);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create project');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="New project"
      icon="folder"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="create-project-form" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create project'}
          </button>
        </>
      }
    >
      <form id="create-project-form" className="form-stack" onSubmit={handleSubmit}>
        {error && <div className="alert alert-error">{error}</div>}

        <div className="field">
          <label htmlFor="proj-name">Name</label>
          <input id="proj-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div className="field">
          <label htmlFor="proj-key">Key (short code, e.g. ENG)</label>
          <input
            id="proj-key"
            className="input mono"
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
            maxLength={10}
            required
          />
          <span className="field-hint">Used in task IDs, like {key || 'ENG'}-12.</span>
        </div>

        <div className="field">
          <label htmlFor="proj-desc">Description</label>
          <textarea id="proj-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>

        <div className="field-grid">
          {users.length > 0 && (
            <div className="field">
              <label htmlFor="proj-owner">Owner</label>
              <select id="proj-owner" className="input" value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="">Me</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="proj-visibility">Visibility</label>
            <select id="proj-visibility" className="input" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="private">Private (members only)</option>
              <option value="workspace">Workspace (everyone)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="proj-start">Start date</label>
            <input id="proj-start" className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="proj-target">Target date</label>
            <input id="proj-target" className="input" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </div>
        </div>
      </form>
    </Modal>
  );
}
