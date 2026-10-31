import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthLayout, GoogleButton } from './AuthLayout';

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
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <form className="form-stack" onSubmit={handleSubmit}>
        <div>
          <h1 className="auth-title">Create your account</h1>
          <p className="muted">Join your company&apos;s workspace.</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="field">
          <label htmlFor="name">Full name</label>
          <input id="name" className="input" value={form.name} onChange={update('name')} required autoFocus />
        </div>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" value={form.email} onChange={update('email')} required />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            value={form.password}
            onChange={update('password')}
            minLength={6}
            required
          />
          <span className="field-hint">At least 6 characters.</span>
        </div>

        <div className="field">
          <label htmlFor="role">Role</label>
          <select id="role" className="input" value={form.role} onChange={update('role')}>
            <option value="member">Employee</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Creating account...' : 'Register'}
        </button>
        <GoogleButton />

        <div className="auth-links">
          <span className="muted">Already have an account?</span>
          <Link to="/login">Log in</Link>
        </div>
      </form>
    </AuthLayout>
  );
}
