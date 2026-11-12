import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthLayout, GoogleButton, GOOGLE_ERRORS } from './AuthLayout';

// Two steps: email -> 6-digit code from the inbox. Or Google.
export default function Login() {
  const { requestCode, verifyCode } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') || '');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email');
  const [info, setInfo] = useState('');
  const [error, setError] = useState(() => GOOGLE_ERRORS[params.get('error')] || '');
  const [busy, setBusy] = useState(false);

  const sendCode = async (e) => {
    e?.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await requestCode(email.trim());
      setInfo(r.message || 'Check your inbox for a 6-digit code.');
      setStep('code');
      setCode('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send the code');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await verifyCode(email.trim(), code);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      {step === 'email' ? (
        <form className="form-stack" onSubmit={sendCode}>
          <div>
            <p className="kicker">01 / 02 · Sign in</p>
            <h1 className="auth-title">Welcome back</h1>
            <p className="muted">Sign in with your work email. We&apos;ll send you a one-time code.</p>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Sending code...' : 'Send code'}
          </button>
          <GoogleButton />
          <p className="muted small center">Access is by invite only. Ask your team head if you can&apos;t sign in.</p>
        </form>
      ) : (
        <form className="form-stack" onSubmit={verify}>
          <div>
            <p className="kicker">02 / 02 · Verify</p>
            <h1 className="auth-title">Check your email</h1>
            <p className="muted">
              We sent a 6-digit code to <strong>{email}</strong>.
            </p>
          </div>

          {info && !error && <div className="alert alert-success">{info}</div>}
          {error && <div className="alert alert-error">{error}</div>}

          <div className="field">
            <label htmlFor="code">Sign-in code</label>
            <input
              id="code"
              className="input input-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              autoFocus
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>
            {busy ? 'Signing in...' : 'Sign in'}
          </button>

          <div className="auth-links">
            <button type="button" className="link-btn" onClick={() => { setStep('email'); setError(''); }}>
              Use a different email
            </button>
            <button type="button" className="link-btn" onClick={sendCode} disabled={busy}>
              Resend code
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
