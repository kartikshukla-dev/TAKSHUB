import apiClient from './client';

export const listProjects = (params = {}) => apiClient.get('/projects', { params }).then((r) => r.data.projects);
export const createProject = (payload) => apiClient.post('/projects', payload).then((r) => r.data.project);
export const getProject = (id) => apiClient.get(`/projects/${id}`).then((r) => r.data.project);
export const updateProject = (id, payload) => apiClient.patch(`/projects/${id}`, payload).then((r) => r.data.project);
export const deleteProject = (id) => apiClient.delete(`/projects/${id}`);
export const addProjectMember = (id, userId) =>
  apiClient.post(`/projects/${id}/members`, { userId }).then((r) => r.data.project);
export const removeProjectMember = (id, userId) =>
  apiClient.delete(`/projects/${id}/members/${userId}`).then((r) => r.data.project);
export const getActivityFeed = (id) => apiClient.get(`/projects/${id}/activity`).then((r) => r.data.feed);
