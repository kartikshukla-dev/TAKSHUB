import apiClient from './client';

export const listUsers = (params = {}) => apiClient.get('/users', { params }).then((r) => r.data.users);
export const getUser = (id) => apiClient.get(`/users/${id}`).then((r) => r.data.user);
export const updateUser = (id, payload) => apiClient.patch(`/users/${id}`, payload).then((r) => r.data.user);
export const updateMe = (payload) => apiClient.patch('/users/me', payload).then((r) => r.data.user);

export const listDepartments = () => apiClient.get('/departments').then((r) => r.data.departments);
export const createDepartment = (payload) => apiClient.post('/departments', payload).then((r) => r.data.department);
export const deleteDepartment = (id) => apiClient.delete(`/departments/${id}`);

// Teams (departments) with heads, members and task numbers.
export const listTeams = () => apiClient.get('/teams').then((r) => r.data.teams);
export const getTeam = (id) => apiClient.get(`/teams/${id}`).then((r) => r.data.team);

export const invite = (payload) => apiClient.post('/invites', payload).then((r) => r.data);
export const resendInvite = (id) => apiClient.post(`/invites/${id}/resend`);
export const revokeInvite = (id) => apiClient.delete(`/invites/${id}`);
