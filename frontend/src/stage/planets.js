// Maps projects / teams to planet visuals. Pure, unit tested.
// input item: { id, name, total, done, overdue, moons, href }

const VIOLET = [0x99, 0x66, 0xff];
const GREEN = [0x4e, 0xe3, 0x9a];

function mix(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function hex(rgb) {
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function planetSize(total) {
  return Math.min(1.25, 0.35 + 0.16 * Math.sqrt(Math.max(0, total || 0)));
}

export function planetColor(done, total) {
  const progress = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  return hex(mix(VIOLET, GREEN, progress));
}

export function toPlanets(items = []) {
  const n = items.length;
  return items.map((item, i) => {
    const total = item.total || 0;
    const progress = total > 0 ? Math.min(1, (item.done || 0) / total) : 0;
    // Spread planets on a flat spiral so they never overlap.
    const angle = i * 2.399963; // golden angle
    const orbit = n === 1 ? 0 : 1.8 + Math.sqrt(i + 1) * 1.25;
    return {
      id: item.id,
      name: item.name,
      href: item.href,
      size: planetSize(total),
      color: planetColor(item.done || 0, total),
      progress,
      overdue: (item.overdue || 0) > 0,
      moons: Math.min(12, Math.max(0, item.moons ?? total)),
      position: [Math.cos(angle) * orbit, ((i % 3) - 1) * 0.45, Math.sin(angle) * orbit],
    };
  });
}
