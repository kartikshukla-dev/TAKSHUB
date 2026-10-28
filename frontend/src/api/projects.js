import apiClient from './client';

export const listProjects = () => apiClient.get('/projects').then((r) => r.data.projects);
export const createProject = (payload) => apiClient.post('/projects', payload).then((r) => r.data.project);
export const getProject = (id) => apiClient.get(`/projects/${id}`).then((r) => r.data.project);
export const addProjectMember = (id, userId) =>
  apiClient.post(`/projects/${id}/members`, { userId }).then((r) => r.data.project);
export const getActivityFeed = (id) => apiClient.get(`/projects/${id}/activity`).then((r) => r.data.feed);
