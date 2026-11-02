import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useIntro, { introStep, introPlacement, INTRO_STEPS, LOOP_SHAPES, INTRO_REVEAL_EVENT } from './useIntro';
import { SHAPE_NAMES, makeLayout, makeShape, sideOf } from './shapes';

describe('split layout', () => {
  it('makes a left copy and a mirrored right copy of the shape', () => {
    const pts = makeLayout('helix', 10, 'split');
    expect(pts).toHaveLength(30);
    expect(Array.from(pts.slice(0, 15))).toEqual(Array.from(makeShape('helix', 5)));
    expect(sideOf(0, 10)).toBe(-1);
    expect(sideOf(9, 10)).toBe(1);
    expect(Array.from(makeLayout('helix', 10))).toEqual(Array.from(makeShape('helix', 10)));
  });
});

describe('login intro timeline', () => {
  it('goes ball -> burst -> ribbon, then loops shapes with a 2s hold', () => {
    expect([0, 1, 2].map((i) => introStep(i).shape)).toEqual(['ball', 'burst', 'ribbon']);
    const first = introStep(INTRO_STEPS.length);
    expect(first.shape).toBe(LOOP_SHAPES[0]);
    expect(first.hold).toBe(2);
    expect(introStep(INTRO_STEPS.length + LOOP_SHAPES.length).shape).toBe(LOOP_SHAPES[0]);
    for (const s of LOOP_SHAPES) expect(SHAPE_NAMES).toContain(s);
  });

  it('puts the ball in front and splits later shapes clear of the card', () => {
    expect(introPlacement('ball').offset[2]).toBeGreaterThan(0);
    for (const vp of [{ width: 1440, height: 900 }, { width: 1024, height: 486 }, { width: 1920, height: 1080 }]) {
      // World units at the split plane (camera z=10, fov 50, plane z=-1).
      const halfH = 11 * Math.tan((25 * Math.PI) / 180);
      const halfW = halfH * (vp.width / vp.height);
      const cardEdge = (192 / (vp.width / 2)) * halfW;
      for (const shape of LOOP_SHAPES) {
        const p = introPlacement(shape, vp);
        expect(p.layout).toBe('split');
        expect(p.scale).toBeGreaterThan(0.2);
        // Inner edge of each copy stays outside the card.
        const inner = p.split - p.scale * ({ galaxy: 5.4, ring: 4.3, helix: 5, sphere: 3.1, wave: 5.8, bars: 4.7, grid: 5.1, ribbon: 2.5 })[shape];
        expect(inner).toBeGreaterThan(cardEdge);
      }
    }
  });

  it('keeps one shape above the card on phones', () => {
    expect(introPlacement('galaxy', { width: 390, height: 844 }).layout).toBe('center');
  });
});

describe('useIntro', () => {
  afterEach(() => vi.useRealTimers());

  it('does nothing when inactive', () => {
    const { result } = renderHook(() => useIntro(false));
    expect(result.current).toBeNull();
  });

  it('fires the reveal event when the ball bursts and keeps advancing', () => {
    vi.useFakeTimers();
    const onReveal = vi.fn();
    window.addEventListener(INTRO_REVEAL_EVENT, onReveal);
    const { result, unmount } = renderHook(() => useIntro(true));
    expect(result.current.shape).toBe('ball');
    expect(onReveal).not.toHaveBeenCalled();

    const ball = INTRO_STEPS[0];
    act(() => vi.advanceTimersByTime((ball.morph + ball.hold) * 1000));
    expect(result.current.shape).toBe('burst');
    expect(onReveal).toHaveBeenCalledTimes(1);

    const burst = INTRO_STEPS[1];
    act(() => vi.advanceTimersByTime((burst.morph + burst.hold) * 1000));
    expect(result.current.shape).toBe('ribbon');

    unmount();
    window.removeEventListener(INTRO_REVEAL_EVENT, onReveal);
  });
});
