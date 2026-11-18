import apiClient from './client';

// Workspace-wide list with server-side filters (see backend utils/taskQuery.js).
export const listAllTasks = (params = {}) => apiClient.get('/tasks', { params }).then((r) => r.data.tasks);

export const listTasks = (projectId) =>
  apiClient.get(`/projects/${projectId}/tasks`).then((r) => r.data.tasks);

export const getTask = (projectId, taskId) =>
  apiClient.get(`/projects/${projectId}/tasks/${taskId}`).then((r) => r.data.task);

// Without a project the task goes to the built-in "Team requests" project
// (payload.toTeam is then required by the server).
export const createTask = (projectId, payload) =>
  (projectId ? apiClient.post(`/projects/${projectId}/tasks`, payload) : apiClient.post('/tasks', payload)).then(
    (r) => r.data.task
  );

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
const subtaskUrl = (projectId, taskId, sid = '') => `/projects/${projectId}/tasks/${taskId}/subtasks${sid ? `/${sid}` : ''}`;
export const addSubtask = (projectId, taskId, payload) =>
  apiClient.post(subtaskUrl(projectId, taskId), payload).then((r) => r.data.task);
export const updateSubtask = (projectId, taskId, sid, payload) =>
  apiClient.patch(subtaskUrl(projectId, taskId, sid), payload).then((r) => r.data.task);
export const deleteSubtask = (projectId, taskId, sid) =>
  apiClient.delete(subtaskUrl(projectId, taskId, sid)).then((r) => r.data.task);
export const reorderSubtasks = (projectId, taskId, ids) =>
  apiClient.put(subtaskUrl(projectId, taskId, 'order'), { ids }).then((r) => r.data.task);

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
