import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as usersApi from '../api/users';
import TaskView from '../components/TaskView';
import Icon from '../components/Icon';
import { Avatar, PageHeader } from '../components/ui';
import { ROLE_LABEL } from '../utils/format';

export default function MemberDetail() {
  const { id } = useParams();
  const [member, setMember] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setMember(null);
    usersApi
      .getUser(id)
      .then(setMember)
      .catch(() => setError('Person not found'));
  }, [id]);

  if (error) return <div className="page"><div className="alert alert-error">{error}</div></div>;
  if (!member) return <div className="centered">Loading…</div>;

  const firstName = member.name.split(' ')[0];

  return (
    <div className="page">
      <PageHeader
        breadcrumb={
          <>
            <Link to="/team">Team</Link>
            <Icon name="chevronRight" size={12} />
            <span>{member.name}</span>
          </>
        }
        title={
          <span className="person-head">
            <Avatar user={member} size="lg" />
            <span className="cell-stack">
              <span>{member.name}</span>
              <span className="page-subtitle">
                {[member.jobTitle, member.email].filter(Boolean).join(' · ')}
              </span>
            </span>
          </span>
        }
        actions={
          <span className="head-meta">
            <span className="chip chip-accent">{ROLE_LABEL[member.role]}</span>
            {member.department && <span className="chip">{member.department.name}</span>}
          </span>
        }
      />

      <h2 className="section-title">Assigned tasks you can see</h2>
      <TaskView
        key={id}
        fixed={{ assignee: id }}
        hide={['assignee']}
        storageKey="member"
        syncUrl={false}
        empty={{ title: `No tasks assigned to ${firstName}`, text: 'Only tasks you have access to are listed.' }}
        newTaskDefaults={{ assignee: id }}
      />
    </div>
  );
}
