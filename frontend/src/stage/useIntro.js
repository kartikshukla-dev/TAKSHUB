import { useEffect, useState } from 'react';
import { emitBurst } from './pointer';

// Login intro: a glowing ball in front of the page bursts into particles,
// the particles trace the Oncare ribbon, then keep cycling through shapes.
// Times are seconds: `morph` = how long the change takes, `hold` = how long
// the finished shape stays before the next one.

export const INTRO_REVEAL_EVENT = 'taskhub:intro-reveal';

export const INTRO_STEPS = [
  { shape: 'ball', morph: 0.6, hold: 1.1 },
  { shape: 'burst', morph: 0.75, hold: 0.9 },
  { shape: 'ribbon', morph: 1.6, hold: 2 },
];

export const LOOP_SHAPES = ['galaxy', 'helix', 'ring', 'sphere', 'wave', 'bars', 'grid', 'ribbon'];
const LOOP_MORPH = 1.4;
const LOOP_HOLD = 2;

// Step `index` of the endless sequence (pure, unit tested).
export function introStep(index) {
  if (index < INTRO_STEPS.length) return INTRO_STEPS[index];
  const shape = LOOP_SHAPES[(index - INTRO_STEPS.length) % LOOP_SHAPES.length];
  return { shape, morph: LOOP_MORPH, hold: LOOP_HOLD };
}

// Unscaled half-size of each shape as seen from the camera: [width, height].
// Width covers the slow spin (3D shapes turn around the vertical axis).
const EXTENT = {
  galaxy: [5.4, 5.1],
  ring: [4.3, 4.0],
  helix: [5, 1.8],
  sphere: [3.1, 3.1],
  wave: [5.8, 1.4],
  bars: [4.7, 2.4],
  grid: [5.1, 2.5],
  ribbon: [2.5, 4.1],
};

const CAMERA_Z = 10;
const HALF_FOV = (50 / 2) * (Math.PI / 180);
const PLANE_Z = -1; // where the split copies sit
const CARD_HALF_PX = 215; // login card is 384px wide, plus breathing room

// Where the field sits for each shape. The ball floats in front of the page
// and the burst fills the screen. After that, two copies of every shape sit
// in the free space either side of the login card, sized to fit, so nothing
// hides behind it. Screens too narrow for that keep one shape above the card.
// `split` is the distance of each copy's centre from the screen centre.
export function introPlacement(shape, viewport = { width: 1440, height: 900 }) {
  if (shape === 'ball') return { offset: [0, 0, 3], layout: 'center', split: 0, scale: 1 };
  if (shape === 'burst') return { offset: [0, 0, 0], layout: 'center', split: 0, scale: 1 };

  const [hw, hh] = EXTENT[shape] || EXTENT.galaxy;
  const halfH = (CAMERA_Z - PLANE_Z) * Math.tan(HALF_FOV);
  const halfW = halfH * (viewport.width / Math.max(1, viewport.height));
  const card = (CARD_HALF_PX / Math.max(1, viewport.width / 2)) * halfW;
  const room = (halfW - card) / 2;

  if (room < 1.4) {
    return { offset: [0, halfH * 0.55, PLANE_Z - 2], layout: 'center', split: 0, scale: Math.min(0.6, 3 / hw) };
  }
  const scale = Math.min((room * 0.9) / hw, (halfH * 0.8) / hh, 1.1);
  return { offset: [0, 0, PLANE_Z], layout: 'split', split: card + room, scale };
}

// Drives the sequence while `active`; returns null otherwise.
export default function useIntro(active) {
  const [step, setStep] = useState(() => (active ? introStep(0) : null));

  useEffect(() => {
    if (!active) {
      setStep(null);
      return undefined;
    }
    let timer;
    const run = (index) => {
      const s = introStep(index);
      setStep(s);
      if (s.shape === 'burst') {
        emitBurst(0, 0);
        window.dispatchEvent(new Event(INTRO_REVEAL_EVENT));
      }
      timer = setTimeout(() => run(index + 1), (s.morph + s.hold) * 1000);
    };
    run(0);
    return () => clearTimeout(timer);
  }, [active]);

  return step;
}
