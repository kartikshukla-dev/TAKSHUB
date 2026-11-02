import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as usersApi from '../api/users';
import { Avatar, EmptyState, PageHeader } from '../components/ui';

// Super Admin: every team with its head(s). Click through for members and tasks.
export default function TeamLeads() {
  const [teams, setTeams] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    usersApi
      .listTeams()
      .then(setTeams)
      .catch(() => setError('Could not load teams'));
  }, []);

  return (
    <div className="page">
      <PageHeader title="Team Leads" subtitle="Every team, its head, and how much work is open. Open a team to see its people and tasks." />
      {error && <div className="alert alert-error">{error}</div>}
      {teams && teams.length === 0 && (
        <EmptyState icon="building" title="No teams yet">
          Create teams on the Users page, then make someone a Team Head.
        </EmptyState>
      )}
      <div className="team-grid">
        {teams?.map((t) => (
          <Link key={t._id} to={`/teams/${t._id}`} className="team-card">
            <div className="team-card-head">
              <h3 className="project-name">{t.name}</h3>
              <span className="muted small">
                {t.memberCount} {t.memberCount === 1 ? 'person' : 'people'}
              </span>
            </div>
            <div className="team-head-list">
              {t.heads.length === 0 ? (
                <span className="muted small">No Team Head yet</span>
              ) : (
                t.heads.map((h) => (
                  <span key={h._id} className="cell-person">
                    <Avatar user={h} size="sm" />
                    <span className="cell-stack">
                      <span>{h.name}</span>
                      <span className="muted small">Team Head{h.jobTitle ? ` · ${h.jobTitle}` : ''}</span>
                    </span>
                  </span>
                ))
              )}
            </div>
            <div className="team-stats">
              <div>
                <strong>{t.open}</strong>
                <span className="muted small">Open</span>
              </div>
              <div>
                <strong className={t.overdue ? 'text-danger' : ''}>{t.overdue}</strong>
                <span className="muted small">Overdue</span>
              </div>
              <div>
                <strong>{t.unassigned}</strong>
                <span className="muted small">To assign</span>
              </div>
              <div>
                <strong>{t.pendingInvites}</strong>
                <span className="muted small">Invites</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
