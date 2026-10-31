import apiClient from './client';

export const getDashboard = (days) => apiClient.get('/stats/dashboard', { params: { days } }).then((r) => r.data);
export const getReports = (days) => apiClient.get('/stats/reports', { params: { days } }).then((r) => r.data);
export const getActivity = (params = {}) => apiClient.get('/activity', { params }).then((r) => r.data.feed);
export const search = (q) => apiClient.get('/search', { params: { q } }).then((r) => r.data);

export const listTodos = (params = {}) => apiClient.get('/todos', { params }).then((r) => r.data.todos);
export const createTodo = (payload) => apiClient.post('/todos', payload).then((r) => r.data.todo);
export const updateTodo = (id, payload) => apiClient.patch(`/todos/${id}`, payload).then((r) => r.data.todo);
export const deleteTodo = (id) => apiClient.delete(`/todos/${id}`);

export const listConversations = () => apiClient.get('/chat/conversations').then((r) => r.data.conversations);
export const openDirect = (userId) =>
  apiClient.post('/chat/conversations', { type: 'direct', userId }).then((r) => r.data.conversation);
export const createGroup = (name, memberIds) =>
  apiClient.post('/chat/conversations', { type: 'group', name, memberIds }).then((r) => r.data.conversation);
export const listMessages = (id) => apiClient.get(`/chat/conversations/${id}/messages`).then((r) => r.data.messages);
export const sendMessage = (id, text) =>
  apiClient.post(`/chat/conversations/${id}/messages`, { text }).then((r) => r.data.message);
export const markConversationRead = (id) => apiClient.post(`/chat/conversations/${id}/read`);

export const listNotifications = () => apiClient.get('/notifications').then((r) => r.data);
export const markNotificationRead = (id) => apiClient.post(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => apiClient.post('/notifications/read-all');
