import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MEME_SOUNDS, playMessageSound, getSoundStyle, SOUND_STYLE_KEY, MEME_SOUND_KEY } from './messageSounds';
import { STATUSES, CREATE_STATUSES, NOT_APPROVED } from './format';

// Minimal WebAudio stand-in that records which oscillator types were made.
function fakeAudio() {
  const made = [];
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
  const node = () => ({ connect: (n) => n || node(), frequency: param(), gain: param(), type: '' });
  class Ctx {
    constructor() {
      this.currentTime = 0;
      this.sampleRate = 8000;
      this.state = 'running';
      this.destination = node();
    }
    createOscillator() {
      const o = { ...node(), start() {}, stop() {} };
      made.push(o);
      return o;
    }
    createGain() {
      return node();
    }
    createBiquadFilter() {
      return node();
    }
    createBuffer(_c, length) {
      return { getChannelData: () => new Float32Array(length) };
    }
    createBufferSource() {
      return { ...node(), start() {} };
    }
    close() {}
  }
  return { Ctx, made };
}

describe('message sounds', () => {
  let audio;
  beforeEach(() => {
    localStorage.clear();
    audio = fakeAudio();
    vi.stubGlobal('AudioContext', audio.Ctx);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the default ping unless meme sounds are picked', () => {
    expect(getSoundStyle()).toBe('default');
    playMessageSound();
    expect(audio.made).toHaveLength(1);
    expect(audio.made[0].type).toBe('sine');
  });

  it('plays the chosen meme sound', () => {
    localStorage.setItem(SOUND_STYLE_KEY, 'meme');
    localStorage.setItem(MEME_SOUND_KEY, 'airhorn');
    playMessageSound();
    expect(audio.made.length).toBeGreaterThan(3);
    expect(audio.made.every((o) => o.type === 'sawtooth')).toBe(true);
  });

  it('every meme sound plays without errors', () => {
    expect(MEME_SOUNDS.length).toBeGreaterThanOrEqual(8);
    const ctx = new audio.Ctx();
    MEME_SOUNDS.forEach((s) => expect(() => s.play(ctx)).not.toThrow());
  });
});

describe('Not approved status', () => {
  it('is a board status but not offered when creating a task', () => {
    expect(STATUSES.map((s) => s.id)).toContain(NOT_APPROVED);
    expect(CREATE_STATUSES.map((s) => s.id)).not.toContain(NOT_APPROVED);
  });
});
