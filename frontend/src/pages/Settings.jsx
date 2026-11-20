import { useEffect, useState } from 'react';
import * as usersApi from '../api/users';
import * as ws from '../api/workspace';
import { useAuth } from '../context/AuthContext';
import { useLive } from '../context/LiveContext';
import { useEffects } from '../context/EffectsContext';
import { Card, PageHeader, Toggle } from '../components/ui';
import { ThemePicker } from '../components/ThemeToggle';
import Icon from '../components/Icon';
import { canInstall, isIos, isStandalone, onInstallChange, promptInstall } from '../utils/pwa';
import { ROLE_LABEL, WORKSPACE_NAME } from '../utils/format';
import {
  MEME_SOUNDS,
  MEME_SOUND_KEY,
  SOUND_STYLE_KEY,
  getMemeSound,
  getSoundStyle,
  playDefaultPing,
  playMemeSound,
} from '../utils/messageSounds';

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
              Emails when a task is assigned to you, completed, or gets a comment. Sign-in codes are always sent.
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
  const { reduceEffects, setReduceEffects, reducedMotion } = useEffects();
  return (
    <Card title="Appearance" subtitle="Saved for this browser.">
      <div className="setting-row">
        <div>
          <strong>Theme</strong>
          <span className="muted small">System follows your computer&apos;s light or dark setting.</span>
        </div>
        <ThemePicker />
      </div>
      <div className="setting-row">
        <div>
          <strong>Reduce effects</strong>
          <span className="muted small">
            Turns off animations. Use it on slower computers or if motion bothers you.
            {reducedMotion && ' Your system asks for reduced motion, so animations are already off.'}
          </span>
        </div>
        <Toggle checked={reduceEffects} onChange={setReduceEffects} label="Reduce effects" />
      </div>
    </Card>
  );
}

function PushCard() {
  const { pushEnabled, setPushEnabled, closedAppPush } = useLive();
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
            Get a pop-up on this computer or phone when someone messages you, assigns you a task, mentions you, or comments on
            or changes a task you&apos;re on, plus deadline reminders.
          </span>
        </div>
        <Toggle checked={pushEnabled} onChange={change} label="Notifications on this device" disabled={!supported} />
      </div>
      {pushEnabled && (
        <p className={`small push-mode ${closedAppPush ? 'push-mode-on' : ''}`}>
          {closedAppPush
            ? '✓ Works even when Tasks Manager is closed.'
            : 'Works while Tasks Manager is open in a tab or window.'}
        </p>
      )}
      {!supported && <p className="muted small">This browser doesn&apos;t support notifications.</p>}
    </Card>
  );
}

function InstallCard() {
  const [installable, setInstallable] = useState(canInstall);
  const [installed, setInstalled] = useState(isStandalone);
  useEffect(() => onInstallChange(() => setInstallable(canInstall())), []);
  const install = async () => {
    if ((await promptInstall()) === 'accepted') setInstalled(true);
  };

  let body;
  if (installed) body = <span className="muted small">Tasks Manager is installed on this device.</span>;
  else if (installable) {
    body = (
      <button type="button" className="btn btn-primary btn-sm" onClick={install}>
        <Icon name="download" size={14} /> Install app
      </button>
    );
  } else if (isIos()) {
    body = <span className="muted small">On iPhone / iPad: open this site in Safari, tap Share, then “Add to Home Screen”.</span>;
  } else {
    body = (
      <span className="muted small">
        Use the install icon in the browser’s address bar, or the browser menu → “Install Tasks Manager” / “Add to Home screen”.
      </span>
    );
  }

  return (
    <Card title="Install the app" subtitle="Use Tasks Manager like a normal app on your computer or phone.">
      <div className="setting-row">
        <div>
          <strong>App on this device</strong>
          <span className="muted small">Opens in its own window with an icon on your desktop or home screen. Turn on push notifications below to get pop-ups.</span>
        </div>
        {body}
      </div>
    </Card>
  );
}

function SoundCard() {
  const { soundEnabled, setSoundEnabled } = useLive();
  const [style, setStyle] = useState(getSoundStyle);
  const [meme, setMeme] = useState(getMemeSound);

  const save = (key, value, set) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage blocked */
    }
    set(value);
  };
  const preview = () => (style === 'meme' ? playMemeSound(meme) : playDefaultPing());

  return (
    <Card title="Message sound" subtitle="What plays when a new chat message arrives. Saved for this browser.">
      <div className="setting-row">
        <div>
          <strong>Play a sound</strong>
          <span className="muted small">Muted chats stay quiet unless someone @mentions you.</span>
        </div>
        <Toggle checked={soundEnabled} onChange={setSoundEnabled} label="Play a sound for new messages" />
      </div>
      <div className="setting-row">
        <div>
          <strong>Sound</strong>
          <span className="muted small">Default is the usual short ping. Meme sounds play a meme clip like FAAAH or Kaun hai re (up to 5 seconds).</span>
        </div>
        <div className="sound-pick">
          <select className="input" value={style} onChange={(e) => save(SOUND_STYLE_KEY, e.target.value, setStyle)} aria-label="Sound style" disabled={!soundEnabled}>
            <option value="default">Default</option>
            <option value="meme">Meme sounds</option>
          </select>
          {style === 'meme' && (
            <select className="input" value={meme} onChange={(e) => save(MEME_SOUND_KEY, e.target.value, setMeme)} aria-label="Meme sound" disabled={!soundEnabled}>
              <option value="random">🎲 Random each time</option>
              {MEME_SOUNDS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.emoji} {s.label}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={preview}>
            Play
          </button>
        </div>
      </div>
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
      <InstallCard />
      <PushCard />
      <SoundCard />
      <EffectsCard />
      {isAdmin && <EmailDeliveryCard />}
      <AccessCard />
    </div>
  );
}
