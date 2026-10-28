import { useState } from 'react';

export default function CreateProjectModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onCreate({ name, key, description });
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create project');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>New project</h2>
        <form onSubmit={handleSubmit}>
          {error && <div className="alert alert-error">{error}</div>}

          <label htmlFor="proj-name">Name</label>
          <input id="proj-name" value={name} onChange={(e) => setName(e.target.value)} required />

          <label htmlFor="proj-key">Key (short code, e.g. ENG)</label>
          <input
            id="proj-key"
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
            maxLength={10}
            required
          />

          <label htmlFor="proj-desc">Description</label>
          <textarea
            id="proj-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
