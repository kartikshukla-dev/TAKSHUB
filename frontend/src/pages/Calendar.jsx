import { useCallback, useEffect, useMemo, useState } from 'react';
import * as tasksApi from '../api/tasks';
import { useTaskUi } from '../context/TaskUiContext';
import useTaskChanges from '../hooks/useTaskChanges';
import Icon from '../components/Icon';
import { PageHeader } from '../components/ui';
import { dateKey, dueKey, dueState, startOfDay, taskKey } from '../utils/format';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Monday-based week start.
function weekStart(d) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export default function Calendar() {
  const { openTask, openNewTask } = useTaskUi();
  const [mode, setMode] = useState('month');
  const [cursor, setCursor] = useState(() => startOfDay());
  const [tasks, setTasks] = useState([]);

  const days = useMemo(() => {
    if (mode === 'week') {
      const s = weekStart(cursor);
      return Array.from({ length: 7 }, (_, i) => addDays(s, i));
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const s = weekStart(first);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const cells = Math.ceil(((last - s) / 86400000 + 1) / 7) * 7;
    return Array.from({ length: cells }, (_, i) => addDays(s, i));
  }, [mode, cursor]);

  const load = useCallback(() => {
    const from = days[0];
    const to = addDays(days[days.length - 1], 1);
    tasksApi
      .listAllTasks({ due_from: from.toISOString(), due_to: to.toISOString(), sort: 'priority', dir: 'asc' })
      .then(setTasks)
      .catch(() => {});
  }, [days]);

  useEffect(load, [load]);
  useTaskChanges(load);

  const byDay = useMemo(() => {
    const map = new Map();
    tasks.forEach((t) => {
      const k = dueKey(t.dueDate);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(t);
    });
    return map;
  }, [tasks]);

  const move = (dir) => {
    if (mode === 'week') setCursor((c) => addDays(c, dir * 7));
    else setCursor((c) => new Date(c.getFullYear(), c.getMonth() + dir, 1));
  };

  const title =
    mode === 'week'
      ? `${days[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}`
      : cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const todayKey = dateKey(new Date());
  const perCell = mode === 'week' ? 20 : 3;

  return (
    <div className="page">
      <PageHeader title="Calendar" subtitle="Tasks by due date. Archived tasks are hidden." />

      <div className="cal-toolbar">
        <div className="cal-nav">
          <button type="button" className="icon-btn icon-btn-bordered" onClick={() => move(-1)} aria-label="Previous">
            <Icon name="chevronLeft" />
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setCursor(startOfDay())}>
            Today
          </button>
          <button type="button" className="icon-btn icon-btn-bordered" onClick={() => move(1)} aria-label="Next">
            <Icon name="chevronRight" />
          </button>
          <h2 className="cal-title">{title}</h2>
        </div>
        <div className="segmented">
          <button type="button" className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')}>
            Month
          </button>
          <button type="button" className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}>
            Week
          </button>
        </div>
      </div>

      <div className={`cal cal-${mode}`}>
        {WEEKDAYS.map((d) => (
          <div key={d} className="cal-weekday">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const k = dateKey(d);
          const items = byDay.get(k) || [];
          const outside = mode === 'month' && d.getMonth() !== cursor.getMonth();
          return (
            <div
              key={k}
              className={`cal-cell ${outside ? 'cal-outside' : ''}`}
              onDoubleClick={() => openNewTask({ dueDate: k })}
              title="Double-click to add a task on this day"
            >
              <span className={`cal-date ${k === todayKey ? 'cal-today' : ''}`}>{d.getDate()}</span>
              <div className="cal-items">
                {items.slice(0, perCell).map((t) => (
                  <button
                    key={t._id}
                    type="button"
                    className={`cal-task cal-task-${dueState(t) || 'normal'}`}
                    onClick={() => openTask(t)}
                    title={`${taskKey(t)} ${t.title}`}
                  >
                    {t.title}
                  </button>
                ))}
                {items.length > perCell && <span className="cal-more">+{items.length - perCell} more</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="cal-legend">
        <span className="legend-swatch swatch-overdue" /> Overdue
        <span className="legend-swatch swatch-soon" /> Due today / within 3 days
        <span className="legend-swatch swatch-done" /> Done
      </div>
    </div>
  );
}
