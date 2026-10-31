import { useEffect, useState } from 'react';
import * as tasksApi from '../api/tasks';
import { useAuth } from '../context/AuthContext';
import { useUsers } from '../hooks/useDirectory';
import { emitTaskChange } from '../utils/taskEvents';
import { STATUSES, PRIORITIES, taskKey, projectIdOf, idOf, describeActivity, formatDateTime, timeAgo } from '../utils/format';
import { Avatar, Modal, Toggle } from './ui';
import Icon from './Icon';

export default function TaskModal({ task: initialTask, onClose, onUpdated }) {
  const { userId, isStaff } = useAuth();
  const { users } = useUsers();
  const [task, setTask] = useState(initialTask);
  const [title, setTitle] = useState(initialTask.title);
  const [description, setDescription] = useState(initialTask.description || '');
  const [labels, setLabels] = useState((initialTask.labels || []).join(', '));
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const projectId = projectIdOf(task);

  // List rows don't carry comments/activity, so load the full task.
  useEffect(() => {
    let cancelled = false;
    tasksApi
      .getTask(projectIdOf(initialTask), initialTask._id)
      .then((full) => {
        if (cancelled) return;
        setTask(full);
        setTitle(full.title);
        setDescription(full.description || '');
        setLabels((full.labels || []).join(', '));
      })
      .catch((err) => !cancelled && setError(err.response?.data?.message || 'Could not load task'));
    return () => {
      cancelled = true;
    };
  }, [initialTask]);

  const apply = (updated) => {
    // PATCH responses omit populated comment authors; keep what we have.
    setTask((prev) => ({
      ...prev,
      ...updated,
      comments: updated.comments?.[0]?.author?.name ? updated.comments : prev.comments,
      activityLog: updated.activityLog?.[0]?.changedBy?.name ? updated.activityLog : prev.activityLog,
    }));
    emitTaskChange(updated);
    onUpdated?.(updated);
  };

  const patch = async (payload) => {
    setError('');
    try {
      const updated = await tasksApi.updateTask(projectId, task._id, payload);
      apply(updated);
      // Refresh activity log so the change shows up immediately.
      tasksApi.getTask(projectId, task._id).then(setTask).catch(() => {});
    } catch (err) {
      setError(err.response?.data?.message || 'Update failed');
    }
  };

  const saveTitle = () => {
    const next = title.trim();
    if (next && next !== task.title) patch({ title: next });
    else setTitle(task.title);
  };

  const saveDescription = () => {
    if (description !== (task.description || '')) patch({ description });
  };

  const saveLabels = () => {
    const next = labels
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);
    if (JSON.stringify(next) !== JSON.stringify(task.labels || [])) patch({ labels: next });
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setPosting(true);
    try {
      const updated = await tasksApi.addComment(projectId, task._id, commentText.trim());
      setTask(updated);
      emitTaskChange(updated);
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
      setTask(updated);
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDownload = async (attachment) => {
    try {
      await tasksApi.downloadAttachment(projectId, task._id, attachment);
    } catch {
      setError('Download failed');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${taskKey(task) || 'this task'}? This cannot be undone.`)) return;
    try {
      await tasksApi.deleteTask(projectId, task._id);
      emitTaskChange(task, 'deleted');
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete task');
    }
  };

  const canDelete = isStaff || idOf(task.reporter) === userId;

  return (
    <Modal title={taskKey(task) || 'Task'} icon="listChecks" onClose={onClose} wide>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="task-detail">
        <div className="task-detail-main">
          <input
            className="task-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            aria-label="Title"
          />
          {task.blocked && (
            <div className="blocked-banner">
              <Icon name="ban" size={14} /> This task is blocked
            </div>
          )}

          <label className="field-label" htmlFor="task-description">
            Description
          </label>
          <textarea
            id="task-description"
            className="input"
            rows={4}
            value={description}
            placeholder="Add more detail…"
            onChange={(e) => setDescription(e.target.value)}
            onBlur={saveDescription}
          />

          <section className="task-section">
            <div className="task-section-head">
              <h4>Attachments</h4>
              <label className="btn btn-secondary btn-sm">
                <Icon name="paperclip" size={14} />
                {uploading ? 'Uploading…' : 'Attach file'}
                <input type="file" hidden onChange={handleFileChange} disabled={uploading} />
              </label>
            </div>
            {task.attachments?.length ? (
              <ul className="plain-list">
                {task.attachments.map((a) => (
                  <li key={a.fileId}>
                    <button type="button" className="link-btn" onClick={() => handleDownload(a)}>
                      <Icon name="paperclip" size={13} /> {a.filename}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">No attachments</p>
            )}
          </section>

          <section className="task-section">
            <h4>Comments</h4>
            <ul className="comment-list">
              {task.comments?.map((c) => (
                <li key={c._id} className="comment">
                  <Avatar user={c.author} size="sm" />
                  <div>
                    <div className="comment-meta">
                      <strong>{c.author?.name || 'User'}</strong>
                      <span className="muted small">{timeAgo(c.createdAt)}</span>
                    </div>
                    <p className="comment-text">{c.text}</p>
                  </div>
                </li>
              ))}
              {(!task.comments || task.comments.length === 0) && <li className="muted small">No comments yet</li>}
            </ul>
            <form onSubmit={handleComment} className="comment-form">
              <input
                className="input"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment…"
              />
              <button type="submit" className="btn btn-primary" disabled={posting || !commentText.trim()}>
                Post
              </button>
            </form>
          </section>

          <section className="task-section">
            <h4>Activity</h4>
            <ul className="timeline">
              {task.activityLog
                ?.slice()
                .reverse()
                .map((entry, idx) => (
                  <li key={idx}>
                    <span className="timeline-dot" />
                    <span>{describeActivity(entry)}</span>
                    <span className="muted small">{formatDateTime(entry.changedAt)}</span>
                  </li>
                ))}
              {(!task.activityLog || task.activityLog.length === 0) && <li className="muted small">No activity yet</li>}
            </ul>
          </section>
        </div>

        <aside className="task-detail-side">
          <div className="side-field">
            <span className="field-label">Status</span>
            <select className="input" value={task.status} onChange={(e) => patch({ status: e.target.value })}>
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="side-field">
            <span className="field-label">Priority</span>
            <select className="input" value={task.priority} onChange={(e) => patch({ priority: e.target.value })}>
              {PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="side-field">
            <span className="field-label">Assignee</span>
            <select
              className="input"
              value={idOf(task.assignee)}
              onChange={(e) => patch({ assignee: e.target.value || null })}
            >
              <option value="">Unassigned</option>
              {users.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="side-field">
            <span className="field-label">Due date</span>
            <input
              className="input"
              type="date"
              value={task.dueDate ? task.dueDate.substring(0, 10) : ''}
              onChange={(e) => patch({ dueDate: e.target.value || null })}
            />
          </div>
          <div className="side-field">
            <span className="field-label">Labels</span>
            <input
              className="input"
              value={labels}
              placeholder="bug, design"
              onChange={(e) => setLabels(e.target.value)}
              onBlur={saveLabels}
            />
          </div>
          <div className="side-field side-field-row">
            <span className="field-label">Blocked</span>
            <Toggle checked={Boolean(task.blocked)} onChange={(v) => patch({ blocked: v })} label="Blocked" />
          </div>
          <dl className="side-meta">
            <dt>Project</dt>
            <dd>{task.project?.name || '—'}</dd>
            <dt>Reporter</dt>
            <dd>{task.reporter?.name || '—'}</dd>
            <dt>Created</dt>
            <dd>{formatDateTime(task.createdAt)}</dd>
            {task.completedAt && (
              <>
                <dt>Completed</dt>
                <dd>{formatDateTime(task.completedAt)}</dd>
              </>
            )}
          </dl>
          {canDelete && (
            <button type="button" className="btn btn-danger-ghost btn-sm" onClick={handleDelete}>
              <Icon name="trash" size={14} /> Delete task
            </button>
          )}
        </aside>
      </div>
    </Modal>
  );
}
