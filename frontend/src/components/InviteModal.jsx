import { useState } from 'react';
import * as usersApi from '../api/users';
import { useAuth } from '../context/AuthContext';
import { useDepartments, invalidateDirectory } from '../hooks/useDirectory';
import { ROLES } from '../utils/format';
import { Modal } from './ui';

// Super Admins pick any team and role. Team Heads always invite a Member
// of their own team (`team` is fixed for them).
export default function InviteModal({ team, onClose, onInvited }) {
  const { isAdmin } = useAuth();
  const { departments } = useDepartments();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [role, setRole] = useState('member');
  const [department, setDepartment] = useState(team?._id || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = { name, email, jobTitle };
      if (isAdmin) {
        payload.role = role;
        payload.department = department || null;
      }
      const r = await usersApi.invite(payload);
      invalidateDirectory();
      onInvited?.(r);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send the invite');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={team && !isAdmin ? `Invite to ${team.name}` : 'Invite someone'}
      icon="users"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="invite-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send invite'}
          </button>
        </>
      }
    >
      <form id="invite-form" className="form-stack" onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="field-grid">
          <div className="field">
            <label htmlFor="inv-name">Full name</label>
            <input id="inv-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label htmlFor="inv-email">Work email</label>
            <input id="inv-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="inv-title">Job title</label>
            <input id="inv-title" className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Optional" />
          </div>
          {isAdmin && (
            <>
              <div className="field">
                <label htmlFor="inv-team">Team</label>
                <select id="inv-team" className="input" value={department} onChange={(e) => setDepartment(e.target.value)}>
                  <option value="">No team</option>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="inv-role">Role</label>
                <select id="inv-role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        <p className="muted small">
          They get an email with a sign-in link. They sign in with a one-time code sent to this email, or with Google using the
          same address.
        </p>
      </form>
    </Modal>
  );
}
