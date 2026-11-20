import { useEffect, useState } from 'react';
import * as ws from '../api/workspace';
import { formatDateTime } from '../utils/format';
import { scheduleLabel } from '../utils/repeat';
import Icon from './Icon';

// "🔁 Every Monday · next on …" in the task side panel, with Stop / Resume
// for the person who set it up, the team head or a Super Admin.
export default function RepeatInfo({ id }) {
  const [rt, setRt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    ws.getRecurring(id)
      .then((r) => live && setRt(r))
      .catch(() => live && setRt(false));
    return () => {
      live = false;
    };
  }, [id]);

  if (rt === false) {
    return (
      <div className="side-field">
        <span className="field-label">Repeats</span>
        <span className="muted small">
          <Icon name="refresh" size={12} /> Created by a repeating schedule
        </span>
      </div>
    );
  }
  if (!rt) return null;

  const toggle = async () => {
    if (rt.active && !window.confirm('Stop repeating? Tasks already created stay as they are.')) return;
    setBusy(true);
    setError('');
    try {
      setRt(await ws.updateRecurring(id, { active: !rt.active }));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not change it');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="side-field repeat-info">
      <span className="field-label">Repeats</span>
      <span className={`repeat-chip ${rt.active ? '' : 'repeat-chip-off'}`}>
        <Icon name="refresh" size={13} /> {scheduleLabel(rt.schedule)}
      </span>
      <span className="muted small">
        {rt.active ? `Next one: ${formatDateTime(rt.nextRunAt)}` : 'Stopped. No new tasks will be created.'}
        {rt.dueInDays !== null && rt.dueInDays !== undefined && rt.active && ` · due ${rt.dueInDays === 0 ? 'the same day' : `${rt.dueInDays} day${rt.dueInDays === 1 ? '' : 's'} later`}`}
      </span>
      {rt.canManage && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={toggle} disabled={busy}>
          {rt.active ? 'Stop repeating' : 'Resume repeating'}
        </button>
      )}
      {error && <span className="small text-danger">{error}</span>}
    </div>
  );
}
