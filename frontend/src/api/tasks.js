import apiClient from './client';

// Workspace-wide list with server-side filters (see backend utils/taskQuery.js).
export const listAllTasks = (params = {}) => apiClient.get('/tasks', { params }).then((r) => r.data.tasks);

export const listTasks = (projectId) =>
  apiClient.get(`/projects/${projectId}/tasks`).then((r) => r.data.tasks);

export const getTask = (projectId, taskId) =>
  apiClient.get(`/projects/${projectId}/tasks/${taskId}`).then((r) => r.data.task);

export const createTask = (projectId, payload) =>
  apiClient.post(`/projects/${projectId}/tasks`, payload).then((r) => r.data.task);

export const updateTask = (projectId, taskId, payload) =>
  apiClient.patch(`/projects/${projectId}/tasks/${taskId}`, payload).then((r) => r.data.task);

export const deleteTask = (projectId, taskId) => apiClient.delete(`/projects/${projectId}/tasks/${taskId}`);

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

// Downloads through the API client so the auth header is sent, then hands
// the blob to the browser. A plain <a href> would get a 401.
export async function downloadAttachment(projectId, taskId, attachment) {
  const res = await apiClient.get(`/projects/${projectId}/tasks/${taskId}/attachments/${attachment.fileId}`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = attachment.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
