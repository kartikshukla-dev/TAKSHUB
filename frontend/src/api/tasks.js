import apiClient from './client';

export const listTasks = (projectId) =>
  apiClient.get(`/projects/${projectId}/tasks`).then((r) => r.data.tasks);

export const getTask = (projectId, taskId) =>
  apiClient.get(`/projects/${projectId}/tasks/${taskId}`).then((r) => r.data.task);

export const createTask = (projectId, payload) =>
  apiClient.post(`/projects/${projectId}/tasks`, payload).then((r) => r.data.task);

export const updateTask = (projectId, taskId, payload) =>
  apiClient.patch(`/projects/${projectId}/tasks/${taskId}`, payload).then((r) => r.data.task);

export const deleteTask = (projectId, taskId) =>
  apiClient.delete(`/projects/${projectId}/tasks/${taskId}`);

export const addComment = (projectId, taskId, text) =>
  apiClient.post(`/projects/${projectId}/tasks/${taskId}/comments`, { text }).then((r) => r.data.task);

export const uploadAttachment = (projectId, taskId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient
    .post(`/projects/${projectId}/tasks/${taskId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data.task);
};

export const attachmentDownloadUrl = (projectId, taskId, fileId) => {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  return `${base}/projects/${projectId}/tasks/${taskId}/attachments/${fileId}`;
};
