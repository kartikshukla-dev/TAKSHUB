import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { googleLoginUrl } from '../api/auth';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-panel">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Welcome back</h1>
        <p className="muted">Log in to your Onacre workspace</p>

        {error && <div className="alert alert-error">{error}</div>}

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Logging in...' : 'Log in'}
        </button>

        <a className="btn btn-google" href={googleLoginUrl()}>
          Continue with Google
        </a>

        <p className="muted">
          No account? <Link to="/register">Register</Link>
        </p>
      </form>
      </div>
      <div className="auth-showcase">
        <div className="auth-showcase-content">
          <h2>Plan. Assign. Ship. Together.</h2>
          <p>Onacre brings your team's projects, tasks, and conversations into one focused workspace.</p>
        </div>
      </div>
    </div>
  );
}
