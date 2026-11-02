import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as usersApi from '../api/users';
import { useAuth } from '../context/AuthContext';
import { Avatar, EmptyState, PageHeader } from '../components/ui';
import { ROLE_LABEL } from '../utils/format';

// Workspace directory. Roles and teams are managed on the Users page
// (Super Admin) and team pages (Team Heads).
export default function Team() {
  const { isAdmin, isHead, departmentId } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('people');
  const [people, setPeople] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    usersApi.listUsers().then(setPeople).catch(() => setError('Could not load people'));
    usersApi.listDepartments().then(setDepartments).catch(() => {});
  }, []);

  const canOpenTeam = (id) => isAdmin || (isHead && id === departmentId);

  return (
    <div className="page">
      <PageHeader
        title="Team"
        subtitle="People and teams in your workspace."
        actions={
          isAdmin && (
            <Link to="/users" className="btn btn-secondary">
              Manage users and roles
            </Link>
          )
        }
      />
      {error && <div className="alert alert-error">{error}</div>}

      <div className="segmented segmented-tabs">
        <button type="button" className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}>
          People ({people.length})
        </button>
        <button type="button" className={tab === 'departments' ? 'active' : ''} onClick={() => setTab('departments')}>
          Teams ({departments.length})
        </button>
      </div>

      {tab === 'people' && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Team</th>
                <th>Role</th>
                <th className="col-right">Open</th>
                <th className="col-right">Overdue</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p._id} className="row-click" onClick={() => navigate(`/team/${p._id}`)}>
                  <td>
                    <span className="cell-person">
                      <Avatar user={p} />
                      <span className="cell-stack">
                        <span>
                          {p.name} {p.status === 'invited' && <span className="chip status-invited">Invited</span>}
                        </span>
                        <span className="muted small">{p.jobTitle || p.email}</span>
                      </span>
                    </span>
                  </td>
                  <td>{p.department?.name || <span className="muted">—</span>}</td>
                  <td>
                    <span className={`chip ${p.role === 'member' ? 'chip-accent' : 'chip-strong'}`}>{ROLE_LABEL[p.role]}</span>
                  </td>
                  <td className="col-right">{p.openCount || <span className="muted">—</span>}</td>
                  <td className={`col-right ${p.overdueCount ? 'text-danger' : ''}`}>{p.overdueCount || <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'departments' &&
        (departments.length === 0 ? (
          <EmptyState icon="building" title="No teams yet">
            {isAdmin ? 'Add teams on the Users page.' : 'A Super Admin can set up teams.'}
          </EmptyState>
        ) : (
          <div className="dept-grid">
            {departments.map((d) => {
              const body = (
                <>
                  <div>
                    <strong>{d.name}</strong>
                    <span className="muted small">
                      {d.heads?.length ? `Head: ${d.heads.map((h) => h.name).join(', ')}` : 'No Team Head'} · {d.memberCount}{' '}
                      {d.memberCount === 1 ? 'person' : 'people'}
                    </span>
                  </div>
                  <div className="dept-avatars">
                    {people
                      .filter((p) => p.department?._id === d._id)
                      .slice(0, 6)
                      .map((p) => (
                        <Avatar key={p._id} user={p} size="sm" />
                      ))}
                  </div>
                </>
              );
              return canOpenTeam(d._id) ? (
                <Link key={d._id} to={`/teams/${d._id}`} className="dept-card team-card">
                  {body}
                </Link>
              ) : (
                <div key={d._id} className="dept-card">
                  {body}
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}
