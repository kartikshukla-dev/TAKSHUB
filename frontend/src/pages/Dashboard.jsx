import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTaskUi } from '../context/TaskUiContext';
import useTaskChanges from '../hooks/useTaskChanges';
import * as ws from '../api/workspace';
import LineChart from '../components/LineChart';
import Icon from '../components/Icon';
import { Avatar, Card, EmptyState, PageHeader, StatusPill } from '../components/ui';
import { WORKSPACE_NAME, taskKey, formatShortDate, dueState, describeActivity, timeAgo } from '../utils/format';

export const RANGES = [
  { days: 7, label: 'Last 7 days' },
  { days: 14, label: 'Last 14 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
];

export function RangeSelect({ value, onChange }) {
  return (
    <select className="input input-range" value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label="Date range">
      {RANGES.map((r) => (
        <option key={r.days} value={r.days}>
          {r.label}
        </option>
      ))}
    </select>
  );
}

function StatCard({ label, value, sub, to }) {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </>
  );
  return to ? (
    <Link to={to} className="stat-card stat-card-link">
      {body}
    </Link>
  ) : (
    <div className="stat-card">{body}</div>
  );
}

export function ProgressBar({ value }) {
  return (
    <span className="progress">
      <span className="progress-fill" style={{ width: `${Math.round(value * 100)}%` }} />
    </span>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { openTask, openNewTask } = useTaskUi();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    ws.getDashboard(days)
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch(() => setError('Could not load dashboard'));
  }, [days]);

  useEffect(load, [load]);
  useTaskChanges(load, 600);

  const firstName = user?.name?.split(' ')[0] || 'there';
  const totals = data?.series?.reduce(
    (acc, s) => ({ created: acc.created + s.created, completed: acc.completed + s.completed }),
    { created: 0, completed: 0 }
  );

  return (
    <div className="page">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle={`${WORKSPACE_NAME} · Your tasks`}
        actions={<RangeSelect value={days} onChange={setDays} />}
      />

      {error && <div className="alert alert-error">{error}</div>}

      {data && data.totalInvolved === 0 && (
        <EmptyState
          icon="dashboard"
          title="No tasks here yet"
          action={
            <button type="button" className="btn btn-primary" onClick={() => openNewTask()}>
              <Icon name="plus" size={16} /> Create a task
            </button>
          }
        >
          Tasks you&apos;re assigned, create or collaborate on show up on this dashboard, with their deadlines, progress and
          activity.
        </EmptyState>
      )}

      {data && (
        <>
          <div className="stat-grid stat-grid-8">
            <StatCard label="Open tasks" value={data.cards.open} to="/tasks?open=1&assignee=me" />
            <StatCard label="Assigned to me" value={data.cards.assignedToMe} to="/my-tasks?open=1" />
            <StatCard label="In progress" value={data.cards.inProgress} to="/my-tasks?status=in-progress" />
            <StatCard label="Awaiting review" value={data.cards.inReview} to="/my-tasks?status=in-review" />
            <StatCard label="Overdue" value={data.cards.overdue} to="/my-tasks?due=overdue" />
            <StatCard label="Due today" value={data.cards.dueToday} to="/my-tasks?due=today" />
            <StatCard label="Blocked" value={data.cards.blocked} to="/my-tasks?blocked=1&open=1" />
            <StatCard
              label="Completed"
              value={data.cards.completed}
              sub={RANGES.find((r) => r.days === days)?.label}
              to={`/my-tasks?status=done`}
            />
          </div>

          <div className="grid-2-1">
            <Card
              title="Created vs completed"
              subtitle={`${RANGES.find((r) => r.days === days)?.label} · ${totals.created} created, ${totals.completed} completed`}
            >
              <LineChart series={data.series} />
            </Card>
            <Card
              title="Upcoming deadlines"
              subtitle="Open tasks due in the next 14 days"
              action={
                <Link to="/tasks?due=week&sort=due&dir=asc" className="card-link">
                  View all
                </Link>
              }
            >
              {data.upcoming.length === 0 ? (
                <p className="card-empty">Nothing due in the next two weeks.</p>
              ) : (
                <ul className="mini-list">
                  {data.upcoming.map((t) => (
                    <li key={t._id}>
                      <button type="button" className="mini-row" onClick={() => openTask(t)}>
                        <span className="mini-main">
                          <span className="mono muted small">{taskKey(t)}</span>
                          <span className="mini-title">{t.title}</span>
                        </span>
                        <span className={`due due-${dueState(t) || 'none'}`}>{formatShortDate(t.dueDate)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="grid-2">
            <Card
              title="Workload by employee"
              subtitle="Open tasks currently assigned"
              action={
                <Link to="/reports" className="card-link">
                  Reports
                </Link>
              }
            >
              {data.workload.length === 0 ? (
                <p className="card-empty">No open assigned tasks.</p>
              ) : (
                <ul className="bar-list">
                  {data.workload.map((r) => (
                    <li key={r.user._id}>
                      <Link to={`/team/${r.user._id}`} className="bar-row">
                        <span className="cell-person">
                          <Avatar user={r.user} size="xs" />
                          {r.user.name}
                        </span>
                        <ProgressBar value={r.open / Math.max(...data.workload.map((w) => w.open))} />
                        <span className="bar-value">{r.open}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card
              title="Project progress"
              subtitle="Share of each project's tasks that are done"
              action={
                <Link to="/projects" className="card-link">
                  All projects
                </Link>
              }
            >
              {data.projects.length === 0 ? (
                <p className="card-empty">No projects with tasks yet.</p>
              ) : (
                <ul className="bar-list">
                  {data.projects.map((p) => (
                    <li key={p._id}>
                      <Link to={`/projects/${p._id}`} className="bar-row">
                        <span className="bar-name">{p.name}</span>
                        <ProgressBar value={p.total ? p.done / p.total : 0} />
                        <span className="bar-value">{p.total ? Math.round((p.done / p.total) * 100) : 0}%</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="grid-2">
            <Card title="Recently updated">
              {data.recentlyUpdated.length === 0 ? (
                <p className="card-empty">No tasks yet.</p>
              ) : (
                <ul className="mini-list">
                  {data.recentlyUpdated.map((t) => (
                    <li key={t._id}>
                      <button type="button" className="mini-row" onClick={() => openTask(t)}>
                        <span className="mini-main">
                          <span className="mono muted small">{taskKey(t)}</span>
                          <span className="mini-title">{t.title}</span>
                        </span>
                        <StatusPill status={t.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card
              title="Recent activity"
              action={
                <Link to="/activity?person=me" className="card-link">
                  View all
                </Link>
              }
            >
              {data.activity.length === 0 ? (
                <p className="card-empty">No activity on your tasks yet.</p>
              ) : (
                <ul className="feed-list">
                  {data.activity.map((e, idx) => (
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
          </div>
        </>
      )}
    </div>
  );
}
