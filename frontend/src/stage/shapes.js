// Particle target shapes. Each returns a Float32Array of count*3 positions,
// roughly within a 10 x 6 x 6 box around the origin. Pure + seeded so the
// same shape is stable between renders (and testable).

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const TAU = Math.PI * 2;

// Awareness ribbon outline: a loop crossing over itself with two tails.
const RIBBON_POINTS = [
  [-0.95, -1.75, 0.12],
  [-0.62, -1.05, 0.14],
  [-0.2, -0.25, 0.1],
  [0.28, 0.55, 0.02],
  [0.56, 1.12, -0.06],
  [0.42, 1.58, -0.12],
  [0, 1.78, -0.15],
  [-0.42, 1.58, -0.12],
  [-0.56, 1.12, -0.06],
  [-0.28, 0.55, -0.02],
  [0.2, -0.25, -0.1],
  [0.62, -1.05, -0.14],
  [0.95, -1.75, -0.12],
];

const generators = {
  // Spiral galaxy with 3 arms and a bright core.
  galaxy(count, r) {
    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const radius = Math.pow(r(), 1.6) * 5.2;
      const arm = (i % 3) * (TAU / 3);
      const spin = radius * 0.9;
      const spread = (1 - radius / 6) * 0.6 + 0.12;
      const a = arm + spin + (r() - 0.5) * spread * 2;
      out[i * 3] = Math.cos(a) * radius + (r() - 0.5) * spread;
      out[i * 3 + 1] = (r() - 0.5) * (0.6 - radius * 0.07) * 1.4;
      out[i * 3 + 2] = Math.sin(a) * radius + (r() - 0.5) * spread;
    }
    return out;
  },

  // Tilted torus ring, like a calendar wheel.
  ring(count, r) {
    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const u = r() * TAU;
      const v = r() * TAU;
      const R = 3.6;
      const tube = 0.35 + r() * 0.35;
      out[i * 3] = (R + tube * Math.cos(v)) * Math.cos(u);
      out[i * 3 + 1] = tube * Math.sin(v) * 1.2;
      out[i * 3 + 2] = (R + tube * Math.cos(v)) * Math.sin(u);
    }
    return out;
  },

  // Floating lattice of points (people grid).
  grid(count, r) {
    const out = new Float32Array(count * 3);
    const side = Math.ceil(Math.cbrt(count));
    for (let i = 0; i < count; i += 1) {
      const x = i % side;
      const y = Math.floor(i / side) % side;
      const z = Math.floor(i / (side * side));
      out[i * 3] = (x / (side - 1 || 1) - 0.5) * 9 + (r() - 0.5) * 0.05;
      out[i * 3 + 1] = (y / (side - 1 || 1) - 0.5) * 5;
      out[i * 3 + 2] = (z / (side - 1 || 1) - 0.5) * 5;
    }
    return out;
  },

  // Rolling wave surface (chat).
  wave(count, r) {
    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const x = (r() - 0.5) * 10;
      const z = (r() - 0.5) * 6;
      out[i * 3] = x;
      out[i * 3 + 1] = Math.sin(x * 0.9) * 0.8 + Math.cos(z * 1.3) * 0.5 + (r() - 0.5) * 0.08;
      out[i * 3 + 2] = z;
    }
    return out;
  },

  // Bar chart skyline (reports / activity).
  bars(count, r) {
    const out = new Float32Array(count * 3);
    const columns = 14;
    const heights = Array.from({ length: columns }, (_, c) => 0.8 + (Math.sin(c * 1.7) * 0.5 + 0.5) * 3.8);
    for (let i = 0; i < count; i += 1) {
      const c = i % columns;
      out[i * 3] = (c / (columns - 1) - 0.5) * 9 + (r() - 0.5) * 0.35;
      out[i * 3 + 1] = -2.4 + r() * heights[c];
      out[i * 3 + 2] = (r() - 0.5) * 0.9;
    }
    return out;
  },

  // Sphere shell (settings, to-dos, behind planets).
  sphere(count, r) {
    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const u = r() * 2 - 1;
      const t = r() * TAU;
      const radius = 3 + (r() - 0.5) * 0.25;
      const s = Math.sqrt(1 - u * u);
      out[i * 3] = radius * s * Math.cos(t);
      out[i * 3 + 1] = radius * u;
      out[i * 3 + 2] = radius * s * Math.sin(t);
    }
    return out;
  },

  // Small dense glowing ball (login intro, before it bursts).
  ball(count, r) {
    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const u = r() * 2 - 1;
      const t = r() * TAU;
      const radius = 0.85 * Math.cbrt(r());
      const s = Math.sqrt(1 - u * u);
      out[i * 3] = radius * s * Math.cos(t);
      out[i * 3 + 1] = radius * u;
      out[i * 3 + 2] = radius * s * Math.sin(t);
    }
    return out;
  },

  // The ball after it bursts: particles scattered across the whole screen.
  burst(count, r) {
    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      out[i * 3] = (r() - 0.5) * 22;
      out[i * 3 + 1] = (r() - 0.5) * 13;
      out[i * 3 + 2] = -7 + r() * 11;
    }
    return out;
  },

  // Oncare awareness ribbon traced in particles (same outline as the 3D ribbon).
  ribbon(count, r) {
    const P = RIBBON_POINTS.map(([x, y, z]) => [x * 2.3, y * 2.3, z * 2.3]);
    const n = P.length;
    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const t = r() * (n - 1);
      const seg = Math.min(n - 2, Math.floor(t));
      const u = t - seg;
      const p0 = P[Math.max(seg - 1, 0)];
      const p1 = P[seg];
      const p2 = P[seg + 1];
      const p3 = P[Math.min(seg + 2, n - 1)];
      for (let k = 0; k < 3; k += 1) {
        // Uniform Catmull-Rom through the control points.
        out[i * 3 + k] =
          0.5 *
          (2 * p1[k] +
            (-p0[k] + p2[k]) * u +
            (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u * u +
            (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u * u * u);
      }
      // Give the band some width and a little depth.
      out[i * 3] += (r() - 0.5) * 0.7;
      out[i * 3 + 1] += (r() - 0.5) * 0.5;
      out[i * 3 + 2] += (r() - 0.5) * 0.25;
    }
    return out;
  },

  // Double helix (login, ribbon companion).
  helix(count, r) {
    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const t = (i / count) * TAU * 3.5;
      const strand = i % 2 ? Math.PI : 0;
      const jitter = (r() - 0.5) * 0.35;
      out[i * 3] = (i / count - 0.5) * 10;
      out[i * 3 + 1] = Math.sin(t + strand) * 1.6 + jitter;
      out[i * 3 + 2] = Math.cos(t + strand) * 1.6 + jitter;
    }
    return out;
  },
};

export function makeShape(name, count, seed = 7) {
  const gen = generators[name] || generators.galaxy;
  return gen(count, rng(seed + name.length * 101));
}

// Discs that face the camera; they spin around the view axis so they never
// turn edge-on (an edge-on disc reads as a thin line).
export const FACE_ON = ['galaxy', 'ring'];

// `split` builds two copies of the shape, each centred on the origin: the
// first half of the particles (left copy) and a mirrored second half (right
// copy). The shader pushes them apart by `uSplit` so both sides of the login
// card get a shape. `center` is a single full-count shape.
export function makeLayout(name, count, layout = 'center', seed = 7) {
  if (layout !== 'split') return makeShape(name, count, seed);
  const half = Math.floor(count / 2);
  const out = new Float32Array(count * 3);
  out.set(makeShape(name, half, seed), 0);
  const right = makeShape(name, count - half, seed + 1);
  for (let i = 0; i < right.length; i += 3) right[i] = -right[i];
  out.set(right, half * 3);
  return out;
}

// -1 for the left copy, +1 for the right copy (matches makeLayout).
export const sideOf = (i, count) => (i < Math.floor(count / 2) ? -1 : 1);

export const SHAPE_NAMES = Object.keys(generators);
