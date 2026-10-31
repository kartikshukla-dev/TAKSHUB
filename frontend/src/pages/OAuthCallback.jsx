import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthLayout } from './AuthLayout';

// The backend redirects here with the JWT in the URL fragment (#token=...).
// The query string is still read as a fallback for older links.
function readToken() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  return hash.get('token') || query.get('token');
}

export default function OAuthCallback() {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = readToken();
    // Remove the token from the address bar and browser history.
    window.history.replaceState(null, '', window.location.pathname);
    if (!token) {
      setError('No sign-in token was received from Google.');
      return;
    }
    loginWithToken(token)
      .then(() => navigate('/dashboard', { replace: true }))
      .catch(() => setError('Could not complete Google sign-in. Please try again.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthLayout>
      {error ? (
        <div className="form-stack">
          <div className="alert alert-error">{error}</div>
          <Link to="/login" className="btn btn-secondary btn-block">
            Back to log in
          </Link>
        </div>
      ) : (
        <p className="muted center">Signing you in with Google…</p>
      )}
    </AuthLayout>
  );
}
