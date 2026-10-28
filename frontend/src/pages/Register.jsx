import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { googleLoginUrl } from '../api/auth';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'member' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await register(form);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-panel">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Create your account</h1>
        <p className="muted">Join your company's Onacre workspace</p>

        {error && <div className="alert alert-error">{error}</div>}

        <label htmlFor="name">Full name</label>
        <input id="name" value={form.name} onChange={update('name')} required />

        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={form.email} onChange={update('email')} required />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={form.password}
          onChange={update('password')}
          minLength={6}
          required
        />

        <label htmlFor="role">Role</label>
        <select id="role" value={form.role} onChange={update('role')}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Creating account...' : 'Register'}
        </button>

        <a className="btn btn-google" href={googleLoginUrl()}>
          Continue with Google
        </a>

        <p className="muted">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
      </div>
      <div className="auth-showcase">
        <div className="auth-showcase-content">
          <h2>Plan. Assign. Ship. Together.</h2>
          <p>Bring your whole team onto Onacre — projects, tasks, and conversations in one place.</p>
        </div>
      </div>
    </div>
  );
}
