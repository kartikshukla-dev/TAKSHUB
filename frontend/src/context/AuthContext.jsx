import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as authApi from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('taskhub_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('taskhub_token'));
  const [loading, setLoading] = useState(true);

  const persistSession = useCallback((nextToken, nextUser) => {
    localStorage.setItem('taskhub_token', nextToken);
    localStorage.setItem('taskhub_user', JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem('taskhub_token');
    localStorage.removeItem('taskhub_user');
    setToken(null);
    setUser(null);
  }, []);

  // On mount, if we have a token but it might be stale, verify it against /auth/me.
  useEffect(() => {
    async function verify() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const data = await authApi.fetchMe();
        setUser(data.user);
        localStorage.setItem('taskhub_user', JSON.stringify(data.user));
      } catch {
        clearSession();
      } finally {
        setLoading(false);
      }
    }
    verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const register = async (payload) => {
    const data = await authApi.register(payload);
    persistSession(data.token, data.user);
    return data.user;
  };

  const login = async (payload) => {
    const data = await authApi.login(payload);
    persistSession(data.token, data.user);
    return data.user;
  };

  const loginWithToken = async (jwt) => {
    localStorage.setItem('taskhub_token', jwt);
    setToken(jwt);
    const data = await authApi.fetchMe();
    setUser(data.user);
    localStorage.setItem('taskhub_user', JSON.stringify(data.user));
    return data.user;
  };

  const logout = () => clearSession();

  return (
    <AuthContext.Provider
      value={{ user, token, loading, register, login, loginWithToken, logout, isAdmin: user?.role === 'admin' }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
