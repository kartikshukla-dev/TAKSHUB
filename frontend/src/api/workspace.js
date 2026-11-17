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
export const createChannel = (name, description, memberIds = []) =>
  apiClient.post('/chat/conversations', { type: 'channel', name, description, memberIds }).then((r) => r.data.conversation);
export const listChannels = () => apiClient.get('/chat/channels').then((r) => r.data.channels);
export const joinChannel = (id) => apiClient.post(`/chat/conversations/${id}/join`).then((r) => r.data.conversation);
export const updateConversation = (id, payload) => apiClient.patch(`/chat/conversations/${id}`, payload).then((r) => r.data.conversation);
export const addConversationMembers = (id, userIds) =>
  apiClient.post(`/chat/conversations/${id}/members`, { userIds }).then((r) => r.data.conversation);
export const removeConversationMember = (id, userId) => apiClient.delete(`/chat/conversations/${id}/members/${userId}`);
export const muteConversation = (id, on) => apiClient.post(`/chat/conversations/${id}/mute`, { on }).then((r) => r.data.conversation);
export const starConversation = (id, on) => apiClient.post(`/chat/conversations/${id}/star`, { on }).then((r) => r.data.conversation);
// params: { before } or { around: messageId }
export const listMessages = (id, params = {}) =>
  apiClient.get(`/chat/conversations/${id}/messages`, { params }).then((r) => r.data);
export const getThread = (messageId) => apiClient.get(`/chat/messages/${messageId}/thread`).then((r) => r.data);
// { text, parent?, snippet?, mentions?, files? }. Files switch to multipart.
export const sendMessage = (id, { text = '', parent, snippet, mentions = [], files = [] } = {}) => {
  if (files.length) {
    const form = new FormData();
    form.append('text', text);
    if (parent) form.append('parent', parent);
    if (snippet) form.append('snippet', JSON.stringify(snippet));
    form.append('mentions', JSON.stringify(mentions));
    files.forEach((f) => form.append('files', f));
    return apiClient
      .post(`/chat/conversations/${id}/messages`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data.message);
  }
  return apiClient.post(`/chat/conversations/${id}/messages`, { text, parent, snippet, mentions }).then((r) => r.data.message);
};
export const editMessage = (mid, text) => apiClient.patch(`/chat/messages/${mid}`, { text }).then((r) => r.data.message);
export const deleteMessage = (mid) => apiClient.delete(`/chat/messages/${mid}`).then((r) => r.data.message);
export const reactToMessage = (mid, emoji) => apiClient.post(`/chat/messages/${mid}/reactions`, { emoji }).then((r) => r.data.message);
export const pinMessage = (mid) => apiClient.post(`/chat/messages/${mid}/pin`).then((r) => r.data.message);
export const saveMessage = (mid) => apiClient.post(`/chat/messages/${mid}/save`).then((r) => r.data.message);
export const listPins = (id) => apiClient.get(`/chat/conversations/${id}/pins`).then((r) => r.data.messages);
export const listSaved = () => apiClient.get('/chat/saved').then((r) => r.data.messages);
export const searchChat = (q) => apiClient.get('/chat/search', { params: { q } }).then((r) => r.data.messages);
export const getPresence = () => apiClient.get('/chat/presence').then((r) => r.data.presence);
export const fetchChatFile = (mid, fileId, inline = false) =>
  apiClient.get(`/chat/messages/${mid}/files/${fileId}`, { params: inline ? { inline: 1 } : {}, responseType: 'blob' }).then((r) => r.data);
export const markConversationRead = (id) => apiClient.post(`/chat/conversations/${id}/read`);

export const listNotifications = () => apiClient.get('/notifications').then((r) => r.data);
export const markNotificationRead = (id) => apiClient.post(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => apiClient.post('/notifications/read-all');

export const getEmailStatus = () => apiClient.get('/admin/email/status').then((r) => r.data);
export const sendTestEmail = (to) => apiClient.post('/admin/email/test', { to }).then((r) => r.data);
export const previewEmail = (template) => apiClient.get(`/admin/email/preview/${template}`).then((r) => r.data);
