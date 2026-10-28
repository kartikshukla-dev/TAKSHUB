import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as projectsApi from '../api/projects';
import CreateProjectModal from '../components/CreateProjectModal';

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await projectsApi.listProjects();
      setProjects(data);
    } catch {
      setError('Could not load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (payload) => {
    const project = await projectsApi.createProject(payload);
    setProjects((prev) => [project, ...prev]);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Projects</h1>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + New project
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <p className="muted">Loading projects...</p>}
      {!loading && projects.length === 0 && (
        <div className="empty-state">
          <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 9h18M8 3v4M16 3v4" />
          </svg>
          <h3>No projects yet</h3>
          <p className="muted">{isAdmin ? 'Create one to get started.' : 'Ask an admin to add you to a project.'}</p>
        </div>
      )}

      <div className="project-grid">
        {projects.map((p) => (
          <Link key={p._id} to={`/projects/${p._id}`} className="project-card">
            <span className="project-key">{p.key}</span>
            <h3>{p.name}</h3>
            <p className="muted">{p.description || 'No description'}</p>
            <span className="muted small">{p.members?.length || 0} member(s)</span>
          </Link>
        ))}
      </div>

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
    </div>
  );
}
