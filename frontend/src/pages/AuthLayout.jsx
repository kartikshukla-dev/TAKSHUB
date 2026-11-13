import { useEffect, useState } from 'react';
import { BrandMark } from '../components/Icon';
import { WORKSPACE_NAME, APP_NAME } from '../utils/format';
import { getProviders, googleLoginUrl } from '../api/auth';

export const GOOGLE_ERRORS = {
  google_not_configured: 'Google sign-in is not set up on this server yet.',
  google_failed: 'Google sign-in failed. Please try again.',
  google_cancelled: 'Google sign-in was cancelled.',
  google_no_email: 'Your Google account did not share an email address.',
  google_not_invited: 'This Google account has not been invited to Tasks Manager. Ask your team head for an invite.',
  google_disabled: 'This account has been disabled. Contact your Super Admin.',
};

// Sample cards for the login feed (decorative, not real data). Listed
// twice so the CSS loop (translateY -50%) is seamless.
const FEED = [
  ['REQ-12', 'Monthly patient report', 'Operations → Data', 'In progress', 'st-progress'],
  ['WEB-4', 'Doctor profile pages', 'Marketing', 'In review', 'st-review'],
  ['REQ-9', 'Pharmacy items in estimate', 'Ops → Tech', 'Done', 'st-done'],
  ['CLN-2', 'Staff training slots', 'Operations', 'To do', 'st-todo'],
  ['APP-7', 'Appointment reminders', 'Tech', 'In progress', 'st-progress'],
  ['DWH-3', 'Clinic KPI dashboard', 'Data', 'Done', 'st-done'],
];

function AuthHero() {
  return (
    <aside className="auth-hero" aria-hidden="true">
      <div className="auth-hero-brand">
        <BrandMark size={30} />
        <span>
          {APP_NAME} <small>by {WORKSPACE_NAME}</small>
        </span>
      </div>
      <div>
        <p className="kicker auth-kicker">
          {WORKSPACE_NAME} · {APP_NAME}
          <br />
          Tasks · Teams · Deadlines
        </p>
        <h2 className="auth-statement">
          Every team&apos;s work, <em>in one place.</em>
        </h2>
        <p className="auth-lede">Raise a task to any team, see who is on it and when it is due, and know the moment it is done.</p>
      </div>
      <div className="auth-feed">
        <div className="auth-feed-track">
          {[...FEED, ...FEED].map(([key, title, team, status, cls], i) => (
            <div className="auth-feed-card" key={i}>
              <span className="key">{key}</span>
              <span className="title">
                {title}
                <small>{team}</small>
              </span>
              <span className={`st ${cls}`}>{status}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="auth-hero-foot">
        <span>◇ {WORKSPACE_NAME} · Private workspace</span>
        <span>Invite only / 01</span>
      </div>
    </aside>
  );
}

export function AuthLayout({ children }) {
  return (
    <div className="auth-split">
      <AuthHero />
      <main className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-brand">
            <BrandMark size={28} />
            <span className="brand-name">{APP_NAME}</span>
          </div>
          {children}
          <p className="auth-foot">
            {APP_NAME} is {WORKSPACE_NAME}&apos;s private workspace. Use your work email.
          </p>
        </div>
      </main>
    </div>
  );
}

// Renders "Continue with Google" only when the server has Google
// credentials, so users never hit a broken redirect.
export function GoogleButton() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProviders()
      .then((p) => !cancelled && setEnabled(Boolean(p?.google)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled) return null;

  return (
    <>
      <div className="auth-divider">
        <span>or</span>
      </div>
      <a className="btn btn-secondary btn-block btn-google" href={googleLoginUrl()}>
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        Continue with Google
      </a>
    </>
  );
}
