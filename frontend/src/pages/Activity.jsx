import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as ws from '../api/workspace';
import { useAuth } from '../context/AuthContext';
import useTaskChanges from '../hooks/useTaskChanges';
import { Avatar, EmptyState, PageHeader } from '../components/ui';
import { describeActivity, formatDateTime, timeAgo, dateKey } from '../utils/format';

function dayLabel(key) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dateKey(new Date())) return 'Today';
  if (key === dateKey(yesterday)) return 'Yesterday';
  const [yy, mm, dd] = key.split('-').map(Number);
  return new Date(yy, mm - 1, dd).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function Activity() {
  const { isStaff } = useAuth();
  const [params, setParams] = useSearchParams();
  // Staff default to the whole workspace; employees to their own tasks.
  const scope = params.get('person') === 'me' || !isStaff ? 'me' : 'all';
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    ws.getActivity(scope === 'me' ? { person: 'me' } : {})
      .then(setFeed)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [scope]);

  useEffect(load, [load]);
  useTaskChanges(load, 600);

  const groups = [];
  feed.forEach((e) => {
    const k = dateKey(e.changedAt);
    const last = groups[groups.length - 1];
    if (last && last.key === k) last.items.push(e);
    else groups.push({ key: k, items: [e] });
  });

  return (
    <div className="page">
      <PageHeader title="Activity" subtitle="A chronological record of changes to tasks and projects." />

      {isStaff ? (
        <div className="tabs">
          <button type="button" className={scope === 'all' ? 'tab tab-active' : 'tab'} onClick={() => setParams({})}>
            Everyone
          </button>
          <button type="button" className={scope === 'me' ? 'tab tab-active' : 'tab'} onClick={() => setParams({ person: 'me' })}>
            My tasks
          </button>
        </div>
      ) : (
        <p className="muted small section-note">Activity on your tasks.</p>
      )}

      {!loading && feed.length === 0 ? (
        <EmptyState icon="activity" title="No activity yet">
          Changes to tasks and projects will appear here.
        </EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="activity-day">
            <h3 className="activity-day-title">{dayLabel(g.key)}</h3>
            <ul className="card feed-list feed-list-lg">
              {g.items.map((e, idx) => (
                <li key={idx}>
                  <Avatar user={e.changedBy} size="sm" />
                  <span className="feed-text">
                    <span>{describeActivity(e)}</span>
                    <span className="muted small">
                      <span className="mono">{e.taskKey}</span> {e.taskTitle}
                      {e.projectName && (
                        <>
                          {' · '}
                          <Link to={`/projects/${e.projectId}?task=${e.taskId}`}>{e.projectName}</Link>
                        </>
                      )}
                    </span>
                  </span>
                  <span className="muted small" title={formatDateTime(e.changedAt)}>
                    {timeAgo(e.changedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
