import { useEffect, useState } from 'react';
import * as usersApi from '../api/users';
import * as ws from '../api/workspace';
import { useAuth } from '../context/AuthContext';
import { useLive } from '../context/LiveContext';
import { useEffects } from '../context/EffectsContext';
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
            <span className="muted small">
              Emails when a task is assigned to you, completed, or gets a comment. Security emails (like password changes)
              are always sent.
            </span>
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

function EffectsCard() {
  const { reduceEffects, setReduceEffects, reducedMotion, webgl } = useEffects();
  return (
    <Card title="Visual effects" subtitle="The 3D background and animations. Saved for this browser.">
      <div className="setting-row">
        <div>
          <strong>Reduce effects</strong>
          <span className="muted small">
            Turns off the 3D background and most animations. Use it on slower computers or if motion bothers you.
            {reducedMotion && ' Your system asks for reduced motion, so effects are already off.'}
            {!webgl && ' This browser has no WebGL, so a static background is shown.'}
          </span>
        </div>
        <Toggle checked={reduceEffects} onChange={setReduceEffects} label="Reduce effects" />
      </div>
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
            you&apos;re on. Works while TaskHub is open in a tab.
          </span>
        </div>
        <Toggle checked={pushEnabled} onChange={change} label="Notifications on this device" disabled={!supported} />
      </div>
      {!supported && <p className="muted small">This browser doesn&apos;t support notifications.</p>}
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
        <dt>Team</dt>
        <dd>{user?.department?.name || '—'}</dd>
        <dt>Sign-in</dt>
        <dd>One-time code to {user?.email}, or Google with the same email</dd>
        <dt>Assigning team tasks</dt>
        <dd>Only the receiving team&apos;s head (or a Super Admin) sets the deadline and assignee</dd>
        <dt>Task visibility</dt>
        <dd>
          {user?.role === 'admin'
            ? 'Super Admins see every task'
            : 'Tasks your team raised or received, tasks you are on, and tasks in your projects'}
        </dd>
      </dl>
    </Card>
  );
}

const PROVIDER_LABEL = { smtp: 'SMTP', resend: 'Resend API', brevo: 'Brevo API' };
const TEMPLATE_LABEL = {
  'login-code': 'Sign-in code',
  invite: 'Invite',
  'role-changed': 'Role changed',
  'team-request': 'Team request',
  'task-assigned': 'Assigned',
  'task-updated': 'Deadline / update',
  'task-completed': 'Completed',
  'task-comment': 'Comment',
};

// Admin only: shows which email provider the server uses, sends a test
// email and previews every template with sample data.
function EmailDeliveryCard() {
  const { user } = useAuth();
  const [info, setInfo] = useState(null);
  const [to, setTo] = useState(user?.email || '');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState({ type: '', text: '' });
  const [template, setTemplate] = useState('team-request');
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    ws.getEmailStatus().then(setInfo).catch(() => setInfo({ configured: false, provider: null }));
  }, []);

  useEffect(() => {
    ws.previewEmail(template).then(setPreview).catch(() => setPreview(null));
  }, [template]);

  const send = async (e) => {
    e.preventDefault();
    setSending(true);
    setStatus({ type: '', text: '' });
    try {
      const r = await ws.sendTestEmail(to);
      setStatus({ type: 'success', text: `Test email sent to ${r.to} through ${PROVIDER_LABEL[r.provider] || r.provider}. Check the inbox (and spam).` });
    } catch (err) {
      setStatus({ type: 'error', text: err.response?.data?.message || 'Could not send test email' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card title="Email delivery" subtitle="Admins only. Credentials live in backend/.env and are never shown here.">
      <div className="form-stack">
        <div className="status-line">
          <span className={`chip ${info?.configured ? 'chip-accent' : 'chip-muted'}`}>
            {info === null ? 'Checking…' : info.configured ? `Active: ${PROVIDER_LABEL[info.provider]}` : 'Not configured'}
          </span>
          {info?.configured && <span className="muted small">From: {info.from}</span>}
        </div>
        {info && !info.configured && (
          <p className="muted small">
            Add RESEND_API_KEY, BREVO_API_KEY or SMTP_USER/SMTP_PASS to backend/.env and restart the server. Until then,
            emails are skipped.
          </p>
        )}
        {status.text && <div className={`alert alert-${status.type}`}>{status.text}</div>}
        <form className="inline-form" onSubmit={send}>
          <input className="input" type="email" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Send test email to" required />
          <button type="submit" className="btn btn-secondary" disabled={!info?.configured || sending}>
            {sending ? 'Sending…' : 'Send test email'}
          </button>
        </form>

        <div className="field">
          <span className="field-label">Template preview</span>
          <div className="segmented">
            {Object.keys(TEMPLATE_LABEL).map((t) => (
              <button key={t} type="button" className={template === t ? 'active' : ''} onClick={() => setTemplate(t)}>
                {TEMPLATE_LABEL[t]}
              </button>
            ))}
          </div>
          {preview && (
            <>
              <span className="muted small">Subject: {preview.subject}</span>
              <iframe title="Email preview" className="email-preview" srcDoc={preview.html} sandbox="" />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function Settings() {
  const { isAdmin } = useAuth();
  return (
    <div className="page page-narrow">
      <PageHeader title="Settings" subtitle="Your profile, password and notification preferences." />
      <ProfileCard />
      <PushCard />
      <EffectsCard />
      {isAdmin && <EmailDeliveryCard />}
      <AccessCard />
    </div>
  );
}
