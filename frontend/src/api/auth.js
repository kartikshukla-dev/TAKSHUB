import apiClient from './client';

// Sign-in is email + one-time code, or Google.
export const requestOtp = (email) => apiClient.post('/auth/otp/request', { email }).then((r) => r.data);
export const verifyOtp = (email, code) => apiClient.post('/auth/otp/verify', { email, code }).then((r) => r.data);
export const fetchMe = () => apiClient.get('/auth/me').then((r) => r.data);
// Which sign-in methods the server has credentials for, e.g. { google: true }.
export const getProviders = () => apiClient.get('/auth/providers').then((r) => r.data);

export function googleLoginUrl() {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  return `${base}/auth/google`;
}
