import { useState } from 'react';
import * as usersApi from '../api/users';
import { useAuth } from '../context/AuthContext';
import { useLive } from '../context/LiveContext';
import { Card, PageHeader, Toggle } from '../components/ui';
import { ROLE_LABEL, WORKSPACE_NAME } from '../utils/format';

function ProfileCard() {
  const { user, updateCurrentUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [jobTitle, setJobTitle] = useState(user?.jobTitle || '');
  const [emailNotifications, setEmailNotifications] = useState(user?.emailNotifications !== false);
  const [status, setStatus] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);

  const dirty =
    name !== (user?.name || '') ||
    jobTitle !== (user?.jobTitle || '') ||
    emailNotifications !== (user?.emailNotifications !== false);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatus({ type: '', text: '' });
    try {
      const updated = await usersApi.updateMe({ name, jobTitle, emailNotifications });
      updateCurrentUser(updated);
      setStatus({ type: 'success', text: 'Profile saved' });
    } catch (err) {
      setStatus({ type: 'error', text: err.response?.data?.message || 'Could not save profile' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Profile" subtitle={user?.email}>
      <form className="form-stack" onSubmit={save}>
        {status.text && <div className={`alert alert-${status.type}`}>{status.text}</div>}
        <div className="field-grid">
          <div className="field">
            <label htmlFor="s-name">Full name</label>
            <input id="s-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="s-title">Job title</label>
            <input id="s-title" className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </div>
        </div>
        <div className="setting-row">
          <div>
            <strong>Email me notifications</strong>
            <span className="muted small">Task assigned to you and task completed emails. Needs SMTP set up on the server.</span>
          </div>
          <Toggle checked={emailNotifications} onChange={setEmailNotifications} label="Email me notifications" />
        </div>
        <div>
          <button type="submit" className="btn btn-primary" disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </Card>
  );
}

function PushCard() {
  const { pushEnabled, setPushEnabled } = useLive();
  const [error, setError] = useState('');
  const supported = typeof Notification !== 'undefined';

  const change = async (on) => {
    setError('');
    try {
      await setPushEnabled(on);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Card title="Push notifications" subtitle="Free pop-up alerts in your browser. Turn on for each device.">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="setting-row">
        <div>
          <strong>Notifications on this device</strong>
          <span className="muted small">
            Get a pop-up on this computer when someone messages you, assigns you a task, or comments on or changes a task
            you&apos;re on. Works while Oncare is open in a tab.
          </span>
        </div>
        <Toggle checked={pushEnabled} onChange={change} label="Notifications on this device" disabled={!supported} />
      </div>
      {!supported && <p className="muted small">This browser doesn&apos;t support notifications.</p>}
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState({ type: '', text: '' });

  const submit = async (e) => {
    e.preventDefault();
    if (next !== confirm) {
      setStatus({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    try {
      await usersApi.changePassword({ currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      setStatus({ type: 'success', text: 'Password changed' });
    } catch (err) {
      setStatus({ type: 'error', text: err.response?.data?.message || 'Could not change password' });
    }
  };

  return (
    <Card title="Password">
      <form className="form-stack form-narrow" onSubmit={submit}>
        {status.text && <div className={`alert alert-${status.type}`}>{status.text}</div>}
        <div className="field">
          <label htmlFor="pw-current">Current password</label>
          <input id="pw-current" className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </div>
        <div className="field">
          <label htmlFor="pw-new">New password</label>
          <input id="pw-new" className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={6} required autoComplete="new-password" />
          <span className="field-hint">At least 6 characters.</span>
        </div>
        <div className="field">
          <label htmlFor="pw-confirm">Confirm new password</label>
          <input id="pw-confirm" className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
        </div>
        <div>
          <button type="submit" className="btn btn-secondary" disabled={!next || !confirm}>
            Change password
          </button>
        </div>
      </form>
    </Card>
  );
}

function AccessCard() {
  const { user } = useAuth();
  return (
    <Card title="Your access" subtitle="Managed by your workspace admins.">
      <dl className="kv">
        <dt>Workspace</dt>
        <dd>{WORKSPACE_NAME}</dd>
        <dt>Role</dt>
        <dd>{ROLE_LABEL[user?.role] || user?.role}</dd>
        <dt>Department</dt>
        <dd>{user?.department?.name || '—'}</dd>
        <dt>Assignment policy</dt>
        <dd>Everyone can assign tasks to anyone</dd>
        <dt>Task visibility</dt>
        <dd>
          {user?.role === 'member'
            ? 'Employees see tasks in their projects and tasks they are involved in'
            : 'Admins and managers see all tasks'}
        </dd>
      </dl>
    </Card>
  );
}

export default function Settings() {
  return (
    <div className="page page-narrow">
      <PageHeader title="Settings" subtitle="Your profile, password and notification preferences." />
      <ProfileCard />
      <PushCard />
      <PasswordCard />
      <AccessCard />
    </div>
  );
}
