import { describe, it, expect } from 'vitest';
import routeToScene from './routeToScene';
import { pickQuality, stepDown, QUALITY } from './quality';
import { makeShape, SHAPE_NAMES } from './shapes';
import { toPlanets, planetSize, planetColor } from './planets';
import { chooseRibbonSource } from './ribbonSource';

describe('routeToScene', () => {
  it('maps pages to scenes and shapes', () => {
    expect(routeToScene('/login')).toEqual({ scene: 'ribbon', shape: 'helix' });
    expect(routeToScene('/dashboard/')).toMatchObject({ scene: 'ribbon' });
    expect(routeToScene('/projects')).toMatchObject({ scene: 'planets' });
    expect(routeToScene('/calendar')).toMatchObject({ shape: 'ring' });
    expect(routeToScene('/chat?c=1')).toMatchObject({ shape: 'wave' });
    expect(routeToScene('/projects/abc')).toEqual({ scene: 'particles', shape: 'galaxy' });
  });
});

describe('quality', () => {
  it('turns 3D off without WebGL, with Reduce effects or reduced motion', () => {
    expect(pickQuality({ webgl: false })).toBe('off');
    expect(pickQuality({ reduceEffects: true })).toBe('off');
    expect(pickQuality({ reducedMotion: true })).toBe('off');
  });
  it('scales with the device', () => {
    expect(pickQuality({ cores: 12, memory: 16 })).toBe('high');
    expect(pickQuality({ cores: 6, memory: 6 })).toBe('medium');
    expect(pickQuality({ cores: 4, memory: 8 })).toBe('low');
    expect(pickQuality({ mobile: true })).toBe('low');
    expect(stepDown('high')).toBe('medium');
    expect(stepDown('low')).toBe('low');
    expect(QUALITY.off.particles).toBe(0);
  });
});

describe('particle shapes', () => {
  it.each(SHAPE_NAMES)('%s returns the requested count inside the stage box', (name) => {
    const pts = makeShape(name, 500);
    expect(pts).toHaveLength(1500);
    for (const v of pts) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThan(7);
    }
  });
  it('is stable for the same seed', () => {
    expect(Array.from(makeShape('ring', 20))).toEqual(Array.from(makeShape('ring', 20)));
  });
});

describe('planets mapping', () => {
  it('sizes by task count, colours by progress and flags overdue', () => {
    expect(planetSize(0)).toBeCloseTo(0.35);
    expect(planetSize(100)).toBe(1.25);
    expect(planetColor(0, 10)).toBe('#9966ff');
    expect(planetColor(10, 10)).toBe('#4ee39a');
    const [a, b] = toPlanets([
      { id: '1', name: 'A', total: 4, done: 2, overdue: 1, href: '/p/1' },
      { id: '2', name: 'B', total: 0, done: 0, overdue: 0, moons: 30 },
    ]);
    expect(a).toMatchObject({ id: '1', progress: 0.5, overdue: true, moons: 4, href: '/p/1' });
    expect(b).toMatchObject({ overdue: false, moons: 12, progress: 0 });
    expect(a.position).not.toEqual(b.position);
  });
});

describe('ribbon source', () => {
  it('uses Spline only for a valid scene URL that has not failed', () => {
    const url = 'https://prod.spline.design/abc/scene.splinecode';
    expect(chooseRibbonSource(url)).toBe('spline');
    expect(chooseRibbonSource(url, true)).toBe('coded');
    expect(chooseRibbonSource('')).toBe('coded');
    expect(chooseRibbonSource('https://example.com/x.glb')).toBe('coded');
  });
});
