import apiClient from './client';

export const register = (payload) => apiClient.post('/auth/register', payload).then((r) => r.data);
export const login = (payload) => apiClient.post('/auth/login', payload).then((r) => r.data);
export const fetchMe = () => apiClient.get('/auth/me').then((r) => r.data);
// Which sign-in methods the server has credentials for, e.g. { google: true }.
export const getProviders = () => apiClient.get('/auth/providers').then((r) => r.data);

export function googleLoginUrl() {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  return `${base}/auth/google`;
}
