import { useEffect, useMemo, useRef, useState } from 'react';

// Two-series daily line chart (completed solid, created dotted), drawn in
// SVG at the container's real pixel width so text never scales up.
// `series`: [{ date: 'YYYY-MM-DD', created, completed }]
const H = 240;
const PAD = { top: 12, right: 12, bottom: 28, left: 32 };

function niceMax(v) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function label(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function LineChart({ series }) {
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);
  const [W, setW] = useState(720);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { x, y, ticks, xLabels } = useMemo(() => {
    const peak = Math.max(0, ...series.map((s) => Math.max(s.created, s.completed)));
    const m = niceMax(peak);
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const n = Math.max(1, series.length - 1);
    const fx = (i) => PAD.left + (i / n) * innerW;
    const fy = (v) => PAD.top + innerH - (v / m) * innerH;
    const step = m / 4;
    const t = [0, 1, 2, 3, 4].map((i) => i * step);
    // Roughly one date label per 70px.
    const every = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor(innerW / 70))));
    const last = series.length - 1;
    // Always show the last day; drop a regular tick that would crowd it.
    const xl = series
      .map((s, i) => ({ i, text: label(s.date) }))
      .filter(({ i }) => i === last || (i % every === 0 && last - i >= every));
    return { x: fx, y: fy, ticks: t, xLabels: xl };
  }, [series, W]);

  const path = (key) => series.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s[key]).toFixed(1)}`).join(' ');

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const n = Math.max(1, series.length - 1);
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * n);
    setHover(i >= 0 && i < series.length ? i : null);
  };

  return (
    <div className="line-chart" ref={wrapRef}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Created vs completed per day" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="chart-axis">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {xLabels.map(({ i, text }) => (
          <text
            key={i}
            x={x(i)}
            y={H - 8}
            textAnchor={i === series.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'}
            className="chart-axis"
          >
            {text}
          </text>
        ))}
        <path d={path('created')} className="chart-line chart-line-created" />
        <path d={path('completed')} className="chart-line chart-line-completed" />
        {hover !== null && series[hover] && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} className="chart-hover-line" />
            <circle cx={x(hover)} cy={y(series[hover].completed)} r="3.5" className="chart-dot-completed" />
            <circle cx={x(hover)} cy={y(series[hover].created)} r="3.5" className="chart-dot-created" />
          </g>
        )}
      </svg>
      {hover !== null && series[hover] && (
        <div className="chart-tooltip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <strong>{label(series[hover].date)}</strong>
          <span>Completed: {series[hover].completed}</span>
          <span>Created: {series[hover].created}</span>
        </div>
      )}
      <div className="chart-legend">
        <span className="legend-completed">Completed</span>
        <span className="legend-created">Created</span>
      </div>
    </div>
  );
}
