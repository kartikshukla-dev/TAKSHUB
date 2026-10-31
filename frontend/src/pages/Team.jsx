import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as usersApi from '../api/users';
import { useAuth } from '../context/AuthContext';
import { invalidateDirectory } from '../hooks/useDirectory';
import Icon from '../components/Icon';
import { Avatar, EmptyState, Modal, PageHeader } from '../components/ui';
import { ROLE_LABEL } from '../utils/format';

function EditMemberModal({ member, departments, onClose, onSaved }) {
  const [role, setRole] = useState(member.role);
  const [department, setDepartment] = useState(member.department?._id || '');
  const [jobTitle, setJobTitle] = useState(member.jobTitle || '');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    try {
      await usersApi.updateUser(member._id, { role, department: department || null, jobTitle });
      invalidateDirectory();
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save');
    }
  };

  return (
    <Modal
      title={`Edit ${member.name}`}
      icon="users"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="edit-member-form" className="btn btn-primary">
            Save
          </button>
        </>
      }
    >
      <form id="edit-member-form" className="form-stack" onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="field">
          <label htmlFor="em-role">Role</label>
          <select id="em-role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="member">Employee</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="em-dept">Department</label>
          <select id="em-dept" className="input" value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">No department</option>
            {departments.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="em-title">Job title</label>
          <input id="em-title" className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}

export default function Team() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('people');
  const [people, setPeople] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [editing, setEditing] = useState(null);
  const [deptName, setDeptName] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    usersApi.listUsers().then(setPeople).catch(() => setError('Could not load people'));
    usersApi.listDepartments().then(setDepartments).catch(() => {});
  };

  useEffect(load, []);

  const addDepartment = async (e) => {
    e.preventDefault();
    if (!deptName.trim()) return;
    try {
      await usersApi.createDepartment({ name: deptName });
      setDeptName('');
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add department');
    }
  };

  const removeDepartment = async (d) => {
    if (!window.confirm(`Delete the ${d.name} department? People in it will have no department.`)) return;
    await usersApi.deleteDepartment(d._id);
    load();
  };

  return (
    <div className="page">
      <PageHeader title="Team" subtitle="People and departments in your workspace." />
      {error && <div className="alert alert-error">{error}</div>}

      <div className="segmented segmented-tabs">
        <button type="button" className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}>
          People ({people.length})
        </button>
        <button type="button" className={tab === 'departments' ? 'active' : ''} onClick={() => setTab('departments')}>
          Departments ({departments.length})
        </button>
      </div>

      {tab === 'people' && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Department</th>
                <th>Role</th>
                <th className="col-right">Open</th>
                <th className="col-right">Overdue</th>
                {isAdmin && <th className="col-right" aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p._id} className="row-click" onClick={() => navigate(`/team/${p._id}`)}>
                  <td>
                    <span className="cell-person">
                      <Avatar user={p} />
                      <span className="cell-stack">
                        <span>{p.name}</span>
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
                  {isAdmin && (
                    <td className="col-right">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(p);
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'departments' && (
        <>
          {isAdmin && (
            <form className="inline-form" onSubmit={addDepartment}>
              <input className="input" placeholder="New department name" value={deptName} onChange={(e) => setDeptName(e.target.value)} aria-label="Department name" />
              <button type="submit" className="btn btn-primary" disabled={!deptName.trim()}>
                <Icon name="plus" size={16} /> Add department
              </button>
            </form>
          )}
          {departments.length === 0 ? (
            <EmptyState icon="building" title="No departments yet">
              {isAdmin ? 'Add departments like Tech, Sales or Marketing, then assign people from the People tab.' : 'An admin can set up departments.'}
            </EmptyState>
          ) : (
            <div className="dept-grid">
              {departments.map((d) => (
                <div key={d._id} className="dept-card">
                  <div>
                    <strong>{d.name}</strong>
                    <span className="muted small">
                      {d.memberCount} {d.memberCount === 1 ? 'person' : 'people'}
                    </span>
                  </div>
                  <div className="dept-avatars">
                    {people
                      .filter((p) => p.department?._id === d._id)
                      .slice(0, 6)
                      .map((p) => (
                        <Link key={p._id} to={`/team/${p._id}`}>
                          <Avatar user={p} size="sm" />
                        </Link>
                      ))}
                  </div>
                  {isAdmin && (
                    <button type="button" className="icon-btn icon-btn-sm" aria-label={`Delete ${d.name}`} onClick={() => removeDepartment(d)}>
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {editing && <EditMemberModal member={editing} departments={departments} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}
