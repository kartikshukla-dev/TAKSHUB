import apiClient from './client';

export const listUsers = () => apiClient.get('/users').then((r) => r.data.users);
