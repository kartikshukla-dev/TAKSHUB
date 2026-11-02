import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as projectsApi from '../api/projects';
import { useUsers, invalidateDirectory } from '../hooks/useDirectory';
import CreateProjectModal from '../components/CreateProjectModal';
import Icon from '../components/Icon';
import { Avatar, EmptyState, PageHeader, ProgressRing } from '../components/ui';
import { GalaxyToggle, Galaxy, useGalaxyMode } from '../components/GalaxySwitch';
import useTilt from '../hooks/useTilt';
import { formatShortDate } from '../utils/format';
import { ProgressBar } from './Dashboard';

function ProjectCard({ project }) {
  const tilt = useTilt();
  const pct = project.taskCount ? Math.round((project.doneCount / project.taskCount) * 100) : 0;
  return (
    <Link to={`/projects/${project._id}`} className="project-card tilt" {...tilt}>
      <span className="tilt-glare" aria-hidden="true" />
      <div className="project-card-head">
        <div>
          <h3 className="project-name">{project.name}</h3>
          <span className="mono muted small">{project.key}</span>
          <span className={`chip ${project.status === 'archived' ? 'chip-muted' : 'chip-accent'}`} style={{ marginLeft: 8 }}>
            {project.status === 'archived' ? 'Archived' : 'Active'}
          </span>
        </div>
        <ProgressRing value={pct / 100} />
      </div>
      <p className="project-desc">{project.description || 'No description'}</p>
      <div className="project-progress">
        <span className="muted small">
          {project.doneCount}/{project.taskCount} tasks done
        </span>
        <span className="muted small">{pct}%</span>
      </div>
      <ProgressBar value={pct / 100} />
      <div className="project-foot">
        <span className="cell-person small muted">
          {project.owner && <Avatar user={project.owner} size="xs" />}
          {project.owner?.name || 'No owner'} · {project.members?.length || 0} members
        </span>
        {project.targetDate && <span className="muted small">Target {formatShortDate(project.targetDate)}</span>}
      </div>
    </Link>
  );
}

export default function Projects() {
  const { isStaff } = useAuth();
  const { users } = useUsers();
  const [tab, setTab] = useState('active');
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const galaxy = useGalaxyMode('projects');
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    projectsApi
      .listProjects({ status: tab })
      // The built-in "Team requests" project is reached through task lists.
      .then((list) => setProjects(list.filter((p) => !p.system)))
      .catch(() => setError('Could not load projects'))
      .finally(() => setLoading(false));
  }, [tab]);

  const handleCreate = async (payload) => {
    const project = await projectsApi.createProject(payload);
    invalidateDirectory();
    const full = await projectsApi.getProject(project._id);
    if (tab === 'active') setProjects((prev) => [full, ...prev]);
  };

  return (
    <div className="page">
      <PageHeader
        title="Projects"
        subtitle="Projects you can access. Private projects are visible only to their members."
        actions={
          isStaff && (
            <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Icon name="plus" size={16} /> New project
            </button>
          )
        }
      />

      <div className="tabs-row">
        <div className="tabs">
          <button type="button" className={tab === 'active' ? 'tab tab-active' : 'tab'} onClick={() => setTab('active')}>
            Active
          </button>
          <button type="button" className={tab === 'archived' ? 'tab tab-active' : 'tab'} onClick={() => setTab('archived')}>
            Archived
          </button>
        </div>
        <GalaxyToggle {...galaxy} />
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <p className="muted">Loading projects…</p>}

      {!loading && projects.length === 0 && (
        <EmptyState
          icon="folder"
          title={tab === 'archived' ? 'No archived projects' : 'No projects yet'}
          action={
            tab === 'active' && isStaff ? (
              <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
                <Icon name="plus" size={16} /> New project
              </button>
            ) : null
          }
        >
          {tab === 'archived'
            ? 'Archived projects show up here.'
            : isStaff
              ? 'Create one to get started.'
              : 'Ask an admin or manager to add you to a project.'}
        </EmptyState>
      )}

      {projects.length > 0 &&
        (galaxy.mode === 'galaxy' ? (
          <Galaxy
            items={projects.map((p) => ({
              id: p._id,
              name: p.name,
              total: p.taskCount,
              done: p.doneCount,
              overdue: p.overdueCount,
              moons: (p.taskCount || 0) - (p.doneCount || 0),
              href: `/projects/${p._id}`,
            }))}
          />
        ) : (
          <div className="project-grid">
            {projects.map((p) => (
              <ProjectCard key={p._id} project={p} />
            ))}
          </div>
        ))}

      {showCreate && <CreateProjectModal users={users} onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
    </div>
  );
}
