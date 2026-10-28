import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

// Attaches the stored JWT (if any) to every outgoing request.
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('taskhub_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On a 401, clear the stale session so the UI falls back to the login page.
apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('taskhub_token');
      localStorage.removeItem('taskhub_user');
    }
    return Promise.reject(error);
  }
);

export default apiClient;
