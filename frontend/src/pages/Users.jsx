import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as usersApi from '../api/users';
import { useAuth } from '../context/AuthContext';
import { useDepartments, invalidateDirectory } from '../hooks/useDirectory';
import InviteModal from '../components/InviteModal';
import Icon from '../components/Icon';
import { Avatar, PageHeader } from '../components/ui';
import { ROLES, idOf, timeAgo } from '../utils/format';

const STATUS_LABEL = { active: 'Active', invited: 'Invited', disabled: 'Disabled' };

// Super Admin only: give roles, move people between teams, invite and disable.
export default function Users() {
  const { userId } = useAuth();
  const { departments, refresh: refreshDepts } = useDepartments();
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [status, setStatus] = useState({ type: '', text: '' });
  const [deptName, setDeptName] = useState('');

  const load = () => usersApi.listUsers({ all: '1' }).then(setUsers).catch(() => setStatus({ type: 'error', text: 'Could not load users' }));
  useEffect(() => {
    load();
  }, []);

  const flash = (type, text) => setStatus({ type, text });

  const update = async (u, payload, okText) => {
    try {
      await usersApi.updateUser(u._id, payload);
      invalidateDirectory();
      refreshDepts();
      await load();
      flash('success', okText);
    } catch (err) {
      flash('error', err.response?.data?.message || 'Could not save');
    }
  };

  const resend = async (u) => {
    try {
      await usersApi.resendInvite(u._id);
      flash('success', `Invite re-sent to ${u.email}`);
    } catch (err) {
      flash('error', err.response?.data?.message || 'Could not re-send invite');
    }
  };

  const addDepartment = async (e) => {
    e.preventDefault();
    try {
      await usersApi.createDepartment({ name: deptName });
      setDeptName('');
      invalidateDirectory();
      refreshDepts();
      flash('success', 'Team added');
    } catch (err) {
      flash('error', err.response?.data?.message || 'Could not add team');
    }
  };

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? users.filter((u) => `${u.name} ${u.email} ${u.department?.name || ''}`.toLowerCase().includes(term)) : users;
  }, [users, q]);

  return (
    <div className="page">
      <PageHeader
        title="Users"
        subtitle="Give roles, move people between teams and manage access. Only Super Admins see this page."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setShowInvite(true)}>
            <Icon name="plus" size={16} /> Invite user
          </button>
        }
      />
      {status.text && <div className={`alert alert-${status.type}`}>{status.text}</div>}

      <div className="view-toolbar">
        <div className="filter-search">
          <Icon name="search" size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, team" aria-label="Search users" />
        </div>
        <form className="inline-form" style={{ marginTop: 0 }} onSubmit={addDepartment}>
          <input className="input input-sm" value={deptName} onChange={(e) => setDeptName(e.target.value)} placeholder="New team name" aria-label="New team name" />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={!deptName.trim()}>
            Add team
          </button>
        </form>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Team</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last sign-in</th>
              <th className="col-right" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => {
              const self = u._id === userId;
              return (
                <tr key={u._id}>
                  <td>
                    <Link to={`/team/${u._id}`} className="cell-person">
                      <Avatar user={u} />
                      <span className="cell-stack">
                        <span>{u.name}</span>
                        <span className="muted small">{u.email}</span>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <select
                      className="input select-inline"
                      value={idOf(u.department)}
                      onChange={(e) => update(u, { department: e.target.value || null }, `${u.name} moved`)}
                      aria-label={`Team of ${u.name}`}
                    >
                      <option value="">No team</option>
                      {departments.map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="input select-inline"
                      value={u.role}
                      disabled={self}
                      onChange={(e) => update(u, { role: e.target.value }, `${u.name} is now ${ROLES.find((r) => r.id === e.target.value)?.label}. They were emailed.`)}
                      aria-label={`Role of ${u.name}`}
                    >
                      {ROLES.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className={`chip status-${u.status}`}>{STATUS_LABEL[u.status] || u.status}</span>
                  </td>
                  <td className="muted small">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}</td>
                  <td className="col-right">
                    <span className="member-side">
                      {u.status === 'invited' && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => resend(u)}>
                          Resend invite
                        </button>
                      )}
                      {!self &&
                        (u.status === 'disabled' ? (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => update(u, { status: 'active' }, `${u.name} re-enabled`)}>
                            Enable
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-danger-ghost btn-sm"
                            onClick={() => window.confirm(`Disable ${u.name}? They won't be able to sign in.`) && update(u, { status: 'disabled' }, `${u.name} disabled`)}
                          >
                            Disable
                          </button>
                        ))}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onInvited={(r) => { load(); flash(r.emailed ? 'success' : 'error', r.emailed ? `Invite sent to ${r.user.email}` : `${r.user.email} was added, but the invite email could not be sent. Check email settings.`); }} />}
    </div>
  );
}
