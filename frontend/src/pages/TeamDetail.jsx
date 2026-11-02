import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as usersApi from '../api/users';
import { useAuth } from '../context/AuthContext';
import useTaskChanges from '../hooks/useTaskChanges';
import InviteModal from '../components/InviteModal';
import TaskView from '../components/TaskView';
import Icon from '../components/Icon';
import { CountUp } from '../components/motion';
import { Avatar, Card, PageHeader } from '../components/ui';
import { ROLE_LABEL, timeAgo } from '../utils/format';

// A team's page: its heads, members and every task it owns.
// Open to Super Admins and that team's heads.
export default function TeamDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [team, setTeam] = useState(null);
  const [error, setError] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [flash, setFlash] = useState({ type: '', text: '' });

  const load = useCallback(() => {
    usersApi
      .getTeam(id)
      .then((t) => {
        setTeam(t);
        setError('');
      })
      .catch((err) => setError(err.response?.data?.message || 'Could not load team'));
  }, [id]);

  useEffect(load, [load]);
  useTaskChanges(load, 800);

  const act = async (fn, ok) => {
    try {
      await fn();
      setFlash({ type: 'success', text: ok });
      load();
    } catch (err) {
      setFlash({ type: 'error', text: err.response?.data?.message || 'Something went wrong' });
    }
  };

  if (error) return <div className="page"><div className="alert alert-error">{error}</div></div>;
  if (!team) return <div className="centered">Loading team…</div>;

  return (
    <div className="page">
      <PageHeader
        breadcrumb={
          isAdmin ? (
            <>
              <Link to="/team-leads">Team Leads</Link>
              <Icon name="chevronRight" size={12} />
              <span>{team.name}</span>
            </>
          ) : null
        }
        title={team.name}
        subtitle={team.heads.length ? `Team Head: ${team.heads.map((h) => h.name).join(', ')}` : 'No Team Head yet'}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setShowInvite(true)}>
            <Icon name="plus" size={16} /> Invite member
          </button>
        }
      />
      {flash.text && <div className={`alert alert-${flash.type}`}>{flash.text}</div>}

      <div className="stat-grid stat-grid-5">
        <div className="stat-card"><span className="stat-label">People</span><span className="stat-value"><CountUp value={team.members.length} /></span></div>
        <div className="stat-card"><span className="stat-label">Open tasks</span><span className="stat-value"><CountUp value={team.open} /></span></div>
        <div className="stat-card"><span className="stat-label">Overdue</span><span className={`stat-value ${team.overdue ? 'text-danger' : ''}`}><CountUp value={team.overdue} /></span></div>
        <div className="stat-card"><span className="stat-label">Waiting to be assigned</span><span className="stat-value"><CountUp value={team.unassigned} /></span><span className="stat-sub">Sent to this team, no assignee</span></div>
        <div className="stat-card"><span className="stat-label">Pending invites</span><span className="stat-value"><CountUp value={team.members.filter((m) => m.status === 'invited').length} /></span></div>
      </div>

      <Card title="Team members">
        <div className="table-wrap table-flush">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th className="col-right">Open</th>
                <th className="col-right">Overdue</th>
                <th>Last sign-in</th>
                <th className="col-right" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {team.members.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted center">
                    No one in this team yet. Invite your first member.
                  </td>
                </tr>
              )}
              {team.members.map((m) => (
                <tr key={m._id}>
                  <td>
                    <Link to={`/team/${m._id}`} className="cell-person">
                      <Avatar user={m} />
                      <span className="cell-stack">
                        <span>{m.name}</span>
                        <span className="muted small">{m.jobTitle || m.email}</span>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <span className={`chip ${m.role === 'member' ? 'chip-accent' : 'chip-strong'}`}>{ROLE_LABEL[m.role]}</span>
                    {m.status === 'invited' && <span className="chip status-invited" style={{ marginLeft: 6 }}>Invited</span>}
                  </td>
                  <td className="col-right">{m.openCount || <span className="muted">—</span>}</td>
                  <td className={`col-right ${m.overdueCount ? 'text-danger' : ''}`}>{m.overdueCount || <span className="muted">—</span>}</td>
                  <td className="muted small">{m.lastLoginAt ? timeAgo(m.lastLoginAt) : 'Never'}</td>
                  <td className="col-right">
                    {m.status === 'invited' && (
                      <span className="member-side">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(() => usersApi.resendInvite(m._id), `Invite re-sent to ${m.email}`)}>
                          Resend
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger-ghost btn-sm"
                          onClick={() => window.confirm(`Cancel the invite for ${m.email}?`) && act(() => usersApi.revokeInvite(m._id), 'Invite cancelled')}
                        >
                          Cancel
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <h2 className="section-title">Team tasks</h2>
      <p className="muted small section-note">Tasks sent to {team.name}, raised by {team.name}, or assigned to someone in it.</p>
      <TaskView
        key={id}
        fixed={{ team: id }}
        storageKey="team"
        syncUrl={false}
        empty={{ title: `No tasks for ${team.name} yet`, text: 'Tasks sent to this team will show up here.' }}
        newTaskDefaults={{ toTeam: id }}
      />

      {showInvite && (
        <InviteModal
          team={team}
          onClose={() => setShowInvite(false)}
          onInvited={(r) => {
            load();
            setFlash(
              r.emailed
                ? { type: 'success', text: `Invite sent to ${r.user.email}` }
                : { type: 'error', text: `${r.user.email} was added, but no invite email went out (email is not set up). They can still sign in with this email.` }
            );
          }}
        />
      )}
    </div>
  );
}
