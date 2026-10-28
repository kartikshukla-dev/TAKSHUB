import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function OAuthCallback() {
  const [params] = useSearchParams();
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setError('No token received from Google login');
      return;
    }
    loginWithToken(token)
      .then(() => navigate('/'))
      .catch(() => setError('Failed to complete Google login'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="centered">
        <p>{error}</p>
      </div>
    );
  }

  return <div className="centered">Completing login...</div>;
}
