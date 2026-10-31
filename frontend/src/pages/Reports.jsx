import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as ws from '../api/workspace';
import useTaskChanges from '../hooks/useTaskChanges';
import LineChart from '../components/LineChart';
import { Card, PageHeader } from '../components/ui';
import { RANGES, RangeSelect, ProgressBar } from './Dashboard';
import { formatDate, formatDuration, STATUS_LABEL, PRIORITY_LABEL } from '../utils/format';

function Stat({ label, value, sub }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

function Breakdown({ rows, dotClass }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="bar-list">
      {rows.map((r) => (
        <li key={r.id} className="bar-row">
          <span className="bar-name">
            {dotClass && <span className={`status-dot ${dotClass}-${r.id}`} />}
            {r.label}
          </span>
          <ProgressBar value={r.value / max} />
          <span className="bar-value">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Reports() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    ws.getReports(days)
      .then(setData)
      .catch(() => setError('Could not load reports'));
  }, [days]);

  useEffect(load, [load]);
  useTaskChanges(load, 800);

  const rangeLabel = RANGES.find((r) => r.days === days)?.label;

  return (
    <div className="page">
      <PageHeader
        title="Reports"
        subtitle="Workload, throughput and progress from live data."
        actions={<RangeSelect value={days} onChange={setDays} />}
      />
      {error && <div className="alert alert-error">{error}</div>}
      {data && (
        <>
          <p className="muted small section-note">
            {data.scope === 'workspace' ? 'Whole workspace.' : 'Your tasks.'} Archived tasks are excluded.
          </p>
          <div className="stat-grid stat-grid-5">
            <Stat label="Created" value={data.cards.created} sub={rangeLabel} />
            <Stat label="Completed" value={data.cards.completed} sub={rangeLabel} />
            <Stat label="Avg. time to complete" value={formatDuration(data.cards.avgCompleteMs)} sub="for tasks completed in range" />
            <Stat label="Open now" value={data.cards.openNow} sub={`${data.cards.unassigned} unassigned`} />
            <Stat label="Overdue now" value={data.cards.overdueNow} sub={`${data.cards.blocked} blocked`} />
          </div>

          <Card title="Throughput" subtitle={`Tasks created and completed per day · ${rangeLabel}`}>
            <LineChart series={data.series} />
          </Card>

          <div className="grid-2">
            <Card title="Open tasks by status">
              <Breakdown
                dotClass="status-dot"
                rows={['todo', 'in-progress', 'in-review'].map((id) => ({ id, label: STATUS_LABEL[id], value: data.byStatus[id] }))}
              />
            </Card>
            <Card title="Open tasks by priority">
              <Breakdown
                rows={['urgent', 'high', 'medium', 'low'].map((id) => ({ id, label: PRIORITY_LABEL[id], value: data.byPriority[id] }))}
              />
            </Card>
          </div>

          <Card title="Workload by employee" subtitle="Current open work; “Completed” counts tasks finished in the selected range.">
            <div className="table-wrap table-flush">
              <table className="table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Department</th>
                    <th className="col-right">Open</th>
                    <th className="col-right">In progress</th>
                    <th className="col-right">In review</th>
                    <th className="col-right">Urgent</th>
                    <th className="col-right">Overdue</th>
                    <th className="col-right">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.workload.length === 0 && (
                    <tr>
                      <td colSpan={8} className="muted center">
                        No assigned tasks yet.
                      </td>
                    </tr>
                  )}
                  {data.workload.map((r) => (
                    <tr key={r.user._id}>
                      <td>
                        <Link to={`/team/${r.user._id}`}>{r.user.name}</Link>
                      </td>
                      <td className="muted">{r.user.department?.name || '—'}</td>
                      <td className="col-right">{r.open}</td>
                      <td className="col-right">{r.inProgress}</td>
                      <td className="col-right">{r.inReview}</td>
                      <td className="col-right">{r.urgent}</td>
                      <td className={`col-right ${r.overdue ? 'text-danger' : ''}`}>{r.overdue}</td>
                      <td className="col-right">{r.completed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Projects">
            <div className="table-wrap table-flush">
              <table className="table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th className="col-right">Tasks</th>
                    <th className="col-right">Overdue</th>
                    <th>Target</th>
                  </tr>
                </thead>
                <tbody>
                  {data.projects.length === 0 && (
                    <tr>
                      <td colSpan={6} className="muted center">
                        No active projects.
                      </td>
                    </tr>
                  )}
                  {data.projects.map((p) => {
                    const pct = p.total ? p.done / p.total : 0;
                    return (
                      <tr key={p._id}>
                        <td>
                          <Link to={`/projects/${p._id}`}>{p.name}</Link>
                        </td>
                        <td>{p.status === 'archived' ? 'Archived' : 'Active'}</td>
                        <td>
                          <span className="progress-cell">
                            <ProgressBar value={pct} />
                            <span className="muted small">{Math.round(pct * 100)}%</span>
                          </span>
                        </td>
                        <td className="col-right">
                          {p.done}/{p.total}
                        </td>
                        <td className={`col-right ${p.overdue ? 'text-danger' : ''}`}>{p.overdue}</td>
                        <td>{p.targetDate ? formatDate(p.targetDate) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
