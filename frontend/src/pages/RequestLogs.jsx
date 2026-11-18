import { useEffect, useState } from 'react';
import * as ws from '../api/workspace';
import Icon from '../components/Icon';
import { formatDateTime } from '../utils/format';

const EMPTY = { q: '', method: '', status: '', slow: '', from: '', to: '' };

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const statusClass = (s) => (!s ? '' : s >= 500 ? 'req-5xx' : s >= 400 ? 'req-4xx' : s >= 300 ? 'req-3xx' : 'req-2xx');
const kb = (b) => (b === null || b === undefined ? '—' : b >= 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`);

// Every HTTP request (morgan): method, path, status, time, who, IP.
export default function RequestLogs() {
  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [auto, setAuto] = useState(false);
  const [tick, setTick] = useState(0);

  const params = () => Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(
      () =>
        ws
          .listRequests({ ...params(), page, limit: 100 })
          .then((d) => {
            if (!cancelled) {
              setData(d);
              setError('');
            }
          })
          .catch((err) => !cancelled && setError(err.response?.data?.message || 'Could not load requests')),
      filters.q ? 300 : 0
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page, tick]);

  // Live tail: refresh every 5 s on the first page.
  useEffect(() => {
    if (!auto || page !== 1) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, [auto, page]);

  const set = (k) => (e) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: e.target.value }));
  };

  const download = async () => {
    try {
      saveBlob(await ws.exportRequests(params()), `request-log-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch {
      setError('Could not export');
    }
  };

  return (
    <>
      <p className="muted small req-intro">
        Every request to the server, page loads included. Kept for {data?.retentionDays || 30} days. The same lines appear live in{' '}
        <code>pm2 logs taskhub-backend</code>.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="filter-bar audit-filters">
        <div className="filter-search">
          <Icon name="search" size={15} />
          <input className="input" value={filters.q} onChange={set('q')} placeholder="Search path, person, IP, browser…" aria-label="Search requests" />
        </div>
        <select className="input input-filter" value={filters.method} onChange={set('method')} aria-label="Method">
          <option value="">Any method</option>
          {['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select className="input input-filter" value={filters.status} onChange={set('status')} aria-label="Status">
          <option value="">Any status</option>
          <option value="2xx">2xx OK</option>
          <option value="3xx">3xx Redirect</option>
          <option value="4xx">4xx Client error</option>
          <option value="5xx">5xx Server error</option>
        </select>
        <select className="input input-filter" value={filters.slow} onChange={set('slow')} aria-label="Speed">
          <option value="">Any speed</option>
          <option value="500">Slower than 0.5 s</option>
          <option value="1000">Slower than 1 s</option>
          <option value="3000">Slower than 3 s</option>
        </select>
        <input className="input input-filter" type="date" value={filters.from} onChange={set('from')} aria-label="From date" />
        <input className="input input-filter" type="date" value={filters.to} onChange={set('to')} aria-label="To date" />
        <label className="check-row req-auto">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Live (5 s)
        </label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={download}>
          <Icon name="download" size={14} /> CSV
        </button>
      </div>

      <div className="table-wrap">
        <table className="task-table audit-table req-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Request</th>
              <th>Status</th>
              <th>Time</th>
              <th>Size</th>
              <th>Who</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {!data && (
              <tr>
                <td colSpan={7} className="muted">
                  Loading…
                </td>
              </tr>
            )}
            {data?.logs.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No requests match.
                </td>
              </tr>
            )}
            {data?.logs.map((l) => (
              <tr key={l._id} title={l.userAgent}>
                <td className="audit-when">{formatDateTime(l.at)}</td>
                <td className="req-path">
                  <span className={`req-method req-${l.method}`}>{l.method}</span> {l.path}
                  {l.query && <span className="muted">{l.query}</span>}
                </td>
                <td>
                  <span className={`req-status ${statusClass(l.status)}`}>{l.status ?? '—'}</span>
                </td>
                <td className={l.ms >= 1000 ? 'text-danger' : ''}>{l.ms !== null && l.ms !== undefined ? `${l.ms} ms` : '—'}</td>
                <td className="muted">{kb(l.bytes)}</td>
                <td>{l.userName || l.userEmail || <span className="muted">—</span>}</td>
                <td className="mono small">{l.ip || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 && (
        <div className="audit-pager">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
            <Icon name="chevronLeft" size={14} /> Newer
          </button>
          <span className="muted small">
            Page {data.page} of {data.pages} · {data.total.toLocaleString()} requests
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPage((p) => p + 1)} disabled={page >= data.pages}>
            Older <Icon name="chevronRight" size={14} />
          </button>
        </div>
      )}
    </>
  );
}
