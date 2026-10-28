import { useState } from 'react';
import * as tasksApi from '../api/tasks';

function describeActivity(entry) {
  const who = entry.changedBy?.name || 'Someone';
  if (entry.field === 'comment') return `${who} added a comment`;
  return `${who} changed ${entry.field}: "${entry.oldValue ?? '-'}" -> "${entry.newValue ?? '-'}"`;
}

export default function TaskModal({ task, members, projectId, onClose, onUpdated }) {
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const patch = async (payload) => {
    setError('');
    try {
      const updated = await tasksApi.updateTask(projectId, task._id, payload);
      onUpdated(updated);
    } catch (err) {
      setError(err.response?.data?.message || 'Update failed');
    }
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setPosting(true);
    try {
      const updated = await tasksApi.addComment(projectId, task._id, commentText.trim());
      onUpdated(updated);
      setCommentText('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add comment');
    } finally {
      setPosting(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const updated = await tasksApi.uploadAttachment(projectId, task._id, file);
      onUpdated(updated);
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{task.title}</h2>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <p className="muted">{task.description || 'No description'}</p>

        <div className="task-fields">
          <label>
            Status
            <select value={task.status} onChange={(e) => patch({ status: e.target.value })}>
              <option value="todo">To Do</option>
              <option value="in-progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          </label>

          <label>
            Priority
            <select value={task.priority} onChange={(e) => patch({ priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>

          <label>
            Assignee
            <select
              value={task.assignee?._id || task.assignee || ''}
              onChange={(e) => patch({ assignee: e.target.value || null })}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m._id || m.id} value={m._id || m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Due date
            <input
              type="date"
              value={task.dueDate ? task.dueDate.substring(0, 10) : ''}
              onChange={(e) => patch({ dueDate: e.target.value || null })}
            />
          </label>
        </div>

        <section className="task-section">
          <h4>Attachments</h4>
          <ul className="attachment-list">
            {task.attachments?.map((a) => (
              <li key={a.fileId}>
                <a href={tasksApi.attachmentDownloadUrl(projectId, task._id, a.fileId)}>{a.filename}</a>
              </li>
            ))}
            {(!task.attachments || task.attachments.length === 0) && <li className="muted">No attachments</li>}
          </ul>
          <input type="file" onChange={handleFileChange} disabled={uploading} />
        </section>

        <section className="task-section">
          <h4>Comments</h4>
          <ul className="comment-list">
            {task.comments?.map((c) => (
              <li key={c._id}>
                <strong>{c.author?.name || 'User'}</strong>
                <p>{c.text}</p>
                <span className="muted small">{new Date(c.createdAt).toLocaleString()}</span>
              </li>
            ))}
            {(!task.comments || task.comments.length === 0) && <li className="muted">No comments yet</li>}
          </ul>
          <form onSubmit={handleComment} className="comment-form">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment..."
            />
            <button type="submit" className="btn btn-primary" disabled={posting}>
              Post
            </button>
          </form>
        </section>

        <section className="task-section">
          <h4>Activity log</h4>
          <ul className="activity-log-list">
            {task.activityLog?.slice().reverse().map((entry, idx) => (
              <li key={idx}>
                <span>{describeActivity(entry)}</span>
                <span className="muted small">{new Date(entry.changedAt).toLocaleString()}</span>
              </li>
            ))}
            {(!task.activityLog || task.activityLog.length === 0) && <li className="muted">No activity yet</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
