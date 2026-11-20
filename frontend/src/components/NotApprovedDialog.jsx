import { useState } from 'react';
import { Modal } from './ui';

const MIN = 3;
const MAX = 1000;

// Asks the team head why a task is Not approved. The reason is shown on
// the task and sent to everyone on it.
export default function NotApprovedDialog({ task, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const text = reason.trim();

  const submit = async (e) => {
    e.preventDefault();
    if (text.length < MIN) return setError('Write a short reason so the team knows what to fix.');
    setBusy(true);
    setError('');
    const err = await onConfirm(text);
    if (err) {
      setError(err);
      setBusy(false);
    }
    return undefined;
  };

  return (
    <Modal
      title="Mark as Not approved"
      icon="ban"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" form="not-approved-form" className="btn btn-primary" disabled={busy || text.length < MIN}>
            {busy ? 'Saving…' : 'Mark Not approved'}
          </button>
        </>
      }
    >
      <form id="not-approved-form" className="form-stack" onSubmit={submit}>
        {task?.title && <p className="muted small">{task.title}</p>}
        <div className="field">
          <label htmlFor="na-reason">What needs to change?</label>
          <textarea
            id="na-reason"
            className="input"
            rows={4}
            maxLength={MAX}
            value={reason}
            placeholder="e.g. Totals don't match the October sheet. Please recheck rows 12-30."
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
          <span className="muted small">
            The assignee and everyone on the task will see this. {text.length}/{MAX}
          </span>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
      </form>
    </Modal>
  );
}
