import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import * as projectsApi from '../api/projects';
import * as tasksApi from '../api/tasks';
import { useAuth } from '../context/AuthContext';
import { useTaskUi } from '../context/TaskUiContext';
import { useUsers, invalidateDirectory } from '../hooks/useDirectory';
import useTaskChanges from '../hooks/useTaskChanges';
import TaskView from '../components/TaskView';
import Icon from '../components/Icon';
import { Avatar, Card, Modal, PageHeader } from '../components/ui';
import { formatShortDate, formatDate, describeActivity, timeAgo, idOf } from '../utils/format';
import { ProgressBar } from './Dashboard';

function EditProjectModal({ project, users, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: project.name,
    description: project.description || '',
    owner: idOf(project.owner),
    startDate: project.startDate ? project.startDate.substring(0, 10) : '',
    targetDate: project.targetDate ? project.targetDate.substring(0, 10) : '',
    visibility: project.visibility || 'private',
    status: project.status || 'active',
  });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    try {
      const saved = await projectsApi.updateProject(project._id, { ...form, owner: form.owner || null });
      invalidateDirectory();
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save project');
    }
  };

  return (
    <Modal
      title="Edit project"
      icon="folder"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="edit-project-form" className="btn btn-primary">
            Save
          </button>
        </>
      }
    >
      <form id="edit-project-form" className="form-stack" onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="field">
          <label htmlFor="ep-name">Name</label>
          <input id="ep-name" className="input" value={form.name} onChange={set('name')} required />
        </div>
        <div className="field">
          <label htmlFor="ep-desc">Description</label>
          <textarea id="ep-desc" className="input" rows={3} value={form.description} onChange={set('description')} />
        </div>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="ep-owner">Owner</label>
            <select id="ep-owner" className="input" value={form.owner} onChange={set('owner')}>
              <option value="">No owner</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ep-vis">Visibility</label>
            <select id="ep-vis" className="input" value={form.visibility} onChange={set('visibility')}>
              <option value="private">Private (members only)</option>
              <option value="workspace">Workspace (everyone)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="ep-start">Start date</label>
            <input id="ep-start" className="input" type="date" value={form.startDate} onChange={set('startDate')} />
          </div>
          <div className="field">
            <label htmlFor="ep-target">Target date</label>
            <input id="ep-target" className="input" type="date" value={form.targetDate} onChange={set('targetDate')} />
          </div>
          <div className="field">
            <label htmlFor="ep-status">Status</label>
            <select id="ep-status" className="input" value={form.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { isStaff } = useAuth();
  const { users } = useUsers();
  const { openTask, openNewTask } = useTaskUi();
  const [project, setProject] = useState(null);
  const [feed, setFeed] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState('');

  const load = useCallback(() => {
    projectsApi
      .getProject(id)
      .then((p) => {
        setProject(p);
        setError('');
      })
      .catch((err) => setError(err.response?.status === 403 ? 'You do not have access to this project.' : 'Project not found'));
    projectsApi.getActivityFeed(id).then(setFeed).catch(() => {});
  }, [id]);

  useEffect(load, [load]);
  useTaskChanges(load, 800);

  // Deep link from notifications: /projects/:id?task=<taskId>
  const deepTask = params.get('task');
  useEffect(() => {
    if (!deepTask) return;
    tasksApi
      .getTask(id, deepTask)
      .then((t) => openTask(t))
      .catch(() => {})
      .finally(() => {
        const next = new URLSearchParams(params);
        next.delete('task');
        setParams(next, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepTask, id]);

  if (error && !project) {
    return (
      <div className="page">
        <div className="alert alert-error">{error}</div>
        <Link to="/projects" className="link-btn">
          <Icon name="arrowLeft" size={14} /> Back to projects
        </Link>
      </div>
    );
  }
  if (!project) return <div className="centered">Loading project…</div>;

  const pct = project.taskCount ? Math.round((project.doneCount / project.taskCount) * 100) : 0;
  const memberIds = new Set(project.members.map((m) => idOf(m)));
  const ownerId = idOf(project.owner);

  const addMember = async () => {
    if (!adding) return;
    try {
      await projectsApi.addProjectMember(project._id, adding);
      setAdding('');
      invalidateDirectory();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add member');
    }
  };

  const removeMember = async (userId) => {
    try {
      await projectsApi.removeProjectMember(project._id, userId);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not remove member');
    }
  };

  return (
    <div className="page">
      <PageHeader
        breadcrumb={
          <>
            <Link to="/projects">Projects</Link>
            <Icon name="chevronRight" size={12} />
            <span>{project.name}</span>
          </>
        }
        title={project.name}
        subtitle={
          <span className="head-meta">
            <span className={`chip ${project.status === 'archived' ? 'chip-muted' : 'chip-accent'}`}>
              {project.status === 'archived' ? 'Archived' : 'Active'}
            </span>
            <span className="mono">{project.key}</span>
            {project.targetDate && <span>Target {formatShortDate(project.targetDate)}</span>}
          </span>
        }
        actions={
          <>
            {isStaff && (
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => openNewTask({ project: project._id })}>
              <Icon name="plus" size={16} /> Add task
            </button>
          </>
        }
      />

      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid-2-1">
        <Card title="Overview">
          <p className="muted">{project.description || 'No description'}</p>
          <div className="project-progress">
            <span>
              {project.doneCount} of {project.taskCount} tasks done
            </span>
            <span>{pct}%</span>
          </div>
          <ProgressBar value={pct / 100} />
          <dl className="meta-grid">
            <div>
              <dt>Owner</dt>
              <dd>{project.owner?.name || '—'}</dd>
            </div>
            <div>
              <dt>Start</dt>
              <dd>{project.startDate ? formatDate(project.startDate) : '—'}</dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>{project.targetDate ? formatDate(project.targetDate) : '—'}</dd>
            </div>
            <div>
              <dt>Visibility</dt>
              <dd>{project.visibility === 'workspace' ? 'Workspace' : 'Private'}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Members">
          <ul className="member-list">
            {project.members.map((m) => (
              <li key={idOf(m)}>
                <Link to={`/team/${idOf(m)}`} className="cell-person">
                  <Avatar user={m} size="sm" />
                  {m.name}
                </Link>
                <span className="member-side">
                  <span className="muted small">{idOf(m) === ownerId ? 'Owner' : 'Member'}</span>
                  {isStaff && idOf(m) !== ownerId && (
                    <button type="button" className="icon-btn icon-btn-sm" aria-label={`Remove ${m.name}`} onClick={() => removeMember(idOf(m))}>
                      <Icon name="x" size={13} />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {isStaff && (
            <div className="inline-form">
              <select className="input input-sm" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Add member">
                <option value="">Add a member…</option>
                {users
                  .filter((u) => !memberIds.has(u._id))
                  .map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name}
                    </option>
                  ))}
              </select>
              <button type="button" className="btn btn-secondary btn-sm" onClick={addMember} disabled={!adding}>
                Add
              </button>
            </div>
          )}
        </Card>
      </div>

      <h2 className="section-title">Tasks</h2>
      <TaskView
        fixed={{ project: project._id, include_archived: '1' }}
        hide={['project']}
        storageKey="project"
        showProject={false}
        syncUrl={false}
        empty={{ title: 'No tasks in this project', text: 'Create a task to get started.' }}
        newTaskDefaults={{ project: project._id }}
      />

      <Card title="Project activity" className="mt">
        {feed.length === 0 ? (
          <p className="card-empty">No activity yet.</p>
        ) : (
          <ul className="feed-list">
            {feed.slice(0, 20).map((e, idx) => (
              <li key={idx}>
                <Avatar user={e.changedBy} size="xs" />
                <span className="feed-text">
                  <span>{describeActivity(e)}</span>
                  <span className="muted small">
                    <span className="mono">{e.taskKey}</span> {e.taskTitle}
                  </span>
                </span>
                <span className="muted small">{timeAgo(e.changedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && <EditProjectModal project={project} users={users} onClose={() => setEditing(false)} onSaved={() => load()} />}
    </div>
  );
}
