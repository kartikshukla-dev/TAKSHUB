import { Fragment, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as ws from '../api/workspace';
import RequestLogs from './RequestLogs';
import Icon from '../components/Icon';
import { PageHeader } from '../components/ui';
import { formatDateTime, timeAgo } from '../utils/format';

const CATEGORIES = ['auth', 'task', 'project', 'user', 'team', 'chat', 'todo', 'email', 'notification', 'audit'];
const EMPTY = { q: '', category: '', action: '', actor: '', ok: '', from: '', to: '' };

const short = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(0, 10) : s;
};

// "priority: low → urgent", or the raw request fields.
function ChangeList({ changes }) {
  if (!changes || typeof changes !== 'object') return <span className="muted">—</span>;
  const rows = Object.entries(changes);
  return (
    <ul className="audit-changes">
      {rows.map(([k, v]) => (
        <li key={k}>
          <strong>{k}</strong>{' '}
          {v && typeof v === 'object' && 'from' in v && 'to' in v ? (
            <>
              <span className="audit-from">{short(v.from)}</span> → <span className="audit-to">{short(v.to)}</span>
            </>
          ) : (
            <code>{short(v)}</code>
          )}
        </li>
      ))}
    </ul>
  );
}

function browserOf(ua = '') {
  const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return [b, os].filter(Boolean).join(' · ') || (ua ? ua.slice(0, 40) : '—');
}

export default function AuditLog() {
  const [search, setSearch] = useSearchParams();
  const tab = search.get('tab') === 'requests' ? 'requests' : 'activity';
  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [facets, setFacets] = useState({ actions: [], actors: [] });
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const params = useCallback(() => Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')), [filters]);

  useEffect(() => {
    ws.auditFacets().then(setFacets).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(
      () =>
        ws
          .listAudit({ ...params(), page, limit: 50 })
          .then((d) => {
            if (!cancelled) {
              setData(d);
              setError('');
            }
          })
          .catch((err) => !cancelled && setError(err.response?.data?.message || 'Could not load the audit log')),
      filters.q ? 300 : 0
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [params, page, filters.q]);

  const set = (k) => (e) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: e.target.value }));
  };

  const download = async () => {
    setExporting(true);
    try {
      const blob = await ws.exportAudit(params());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('Could not export');
    } finally {
      setExporting(false);
    }
  };

  const hasFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY);

  return (
    <div className="page">
      <PageHeader
        title="Audit log"
        subtitle={`Every change, sign-in, download and email, with who, when and from where. Read-only. Kept for ${data?.retentionDays || 365} days.`}
        actions={
          tab === 'activity' && (
            <button type="button" className="btn btn-secondary" onClick={download} disabled={exporting}>
              <Icon name="download" size={15} /> {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          )
        }
      />
      <div className="tabs audit-tabs" role="tablist">
        {[
          ['activity', 'Activity'],
          ['requests', 'Requests'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`tab ${tab === id ? 'tab-active' : ''}`}
            onClick={() => setSearch(id === 'activity' ? {} : { tab: id })}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'requests' ? (
        <RequestLogs />
      ) : (
        <>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="filter-bar audit-filters">
        <div className="filter-search">
          <Icon name="search" size={15} />
          <input className="input" value={filters.q} onChange={set('q')} placeholder="Search person, task, IP, action…" aria-label="Search audit log" />
        </div>
        <select className="input input-filter" value={filters.category} onChange={set('category')} aria-label="Area">
          <option value="">All areas</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c[0].toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
        <select className="input input-filter" value={filters.action} onChange={set('action')} aria-label="Action">
          <option value="">Any action</option>
          {facets.actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select className="input input-filter" value={filters.actor} onChange={set('actor')} aria-label="Person">
          <option value="">Anyone</option>
          {facets.actors.map((a) => (
            <option key={a._id} value={a._id}>
              {a.name || a.email}
            </option>
          ))}
        </select>
        <select className="input input-filter" value={filters.ok} onChange={set('ok')} aria-label="Result">
          <option value="">Any result</option>
          <option value="true">Succeeded</option>
          <option value="false">Failed</option>
        </select>
        <input className="input input-filter" type="date" value={filters.from} onChange={set('from')} aria-label="From date" />
        <input className="input input-filter" type="date" value={filters.to} onChange={set('to')} aria-label="To date" />
        {hasFilters && (
          <button type="button" className="link-btn" onClick={() => { setFilters(EMPTY); setPage(1); }}>
            Clear filters
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table className="task-table audit-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>On</th>
              <th>Result</th>
              <th>From</th>
            </tr>
          </thead>
          <tbody>
            {!data && (
              <tr>
                <td colSpan={6} className="muted">
                  Loading…
                </td>
              </tr>
            )}
            {data && data.logs.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  {hasFilters ? 'Nothing matches these filters.' : 'No activity recorded yet.'}
                </td>
              </tr>
            )}
            {data?.logs.map((l) => (
              <Fragment key={l._id}>
                <tr className="row-click" onClick={() => setOpen(open === l._id ? null : l._id)} aria-expanded={open === l._id}>
                  <td title={formatDateTime(l.at)}>
                    <span className="audit-when">{formatDateTime(l.at)}</span>
                    <span className="muted small">{timeAgo(l.at)}</span>
                  </td>
                  <td>
                    <span className="cell-stack">
                      <span>{l.actorName || l.actorEmail || 'System'}</span>
                      <span className="muted small">{l.actorName ? l.actorEmail : l.actorRole}</span>
                    </span>
                  </td>
                  <td>
                    <span className="cell-stack">
                      <span>{l.summary}</span>
                      <code className="audit-action">{l.action}</code>
                    </span>
                  </td>
                  <td className="audit-on">{l.entityLabel || (l.entity ? `${l.entity}${l.entityId ? ` ${l.entityId.slice(-6)}` : ''}` : '—')}</td>
                  <td>
                    <span className={`chip ${l.ok ? 'chip-accent' : 'status-disabled audit-fail'}`}>
                      {l.ok ? 'OK' : 'Failed'}
                      {l.status ? ` · ${l.status}` : ''}
                    </span>
                  </td>
                  <td>
                    <span className="cell-stack">
                      <span className="mono small">{l.ip || '—'}</span>
                      <span className="muted small">{browserOf(l.userAgent)}</span>
                    </span>
                  </td>
                </tr>
                {open === l._id && (
                  <tr className="audit-detail-row">
                    <td colSpan={6}>
                      <div className="audit-detail">
                        <div>
                          <span className="field-label">Changes</span>
                          <ChangeList changes={l.changes} />
                        </div>
                        <div>
                          <span className="field-label">Details</span>
                          <ul className="audit-changes">
                            {l.error && (
                              <li>
                                <strong>error</strong> <span className="text-danger">{l.error}</span>
                              </li>
                            )}
                            <li>
                              <strong>request</strong> <code>{`${l.method || ''} ${l.path || ''}`.trim() || '—'}</code>
                            </li>
                            {l.durationMs !== null && l.durationMs !== undefined && (
                              <li>
                                <strong>took</strong> {l.durationMs} ms
                              </li>
                            )}
                            {l.meta &&
                              Object.entries(l.meta).map(([k, v]) => (
                                <li key={k}>
                                  <strong>{k}</strong> <code>{short(v)}</code>
                                </li>
                              ))}
                            <li>
                              <strong>browser</strong> <span className="muted small">{l.userAgent || '—'}</span>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
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
            Page {data.page} of {data.pages} · {data.total.toLocaleString()} entries
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPage((p) => p + 1)} disabled={page >= data.pages}>
            Older <Icon name="chevronRight" size={14} />
          </button>
        </div>
      )}
        </>
      )}
    </div>
  );
}
