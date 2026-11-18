import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MEME_SOUNDS, playMessageSound, getSoundStyle, getMemeSound, SOUND_STYLE_KEY, MEME_SOUND_KEY } from './messageSounds';
import { STATUSES, CREATE_STATUSES, NOT_APPROVED } from './format';

describe('message sounds', () => {
  let played;
  let oscillators;
  beforeEach(() => {
    localStorage.clear();
    played = [];
    oscillators = 0;
    vi.stubGlobal(
      'Audio',
      class {
        constructor(src) {
          this.src = src;
        }
        play() {
          played.push(this.src);
          return Promise.resolve();
        }
        pause() {}
      }
    );
    const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          this.currentTime = 0;
          this.destination = {};
        }
        createOscillator() {
          oscillators += 1;
          return { type: '', frequency: param(), connect: (n) => n, start() {}, stop() {} };
        }
        createGain() {
          return { gain: param(), connect: (n) => n };
        }
        close() {}
      }
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the default ping unless meme sounds are picked', () => {
    expect(getSoundStyle()).toBe('default');
    playMessageSound();
    expect(oscillators).toBe(1);
    expect(played).toEqual([]);
  });

  it('plays the chosen meme clip', () => {
    localStorage.setItem(SOUND_STYLE_KEY, 'meme');
    localStorage.setItem(MEME_SOUND_KEY, 'faaah');
    playMessageSound();
    expect(played).toEqual(['/sounds/memes/faaah.mp3']);
  });

  it('falls back to random for a sound that no longer exists', () => {
    localStorage.setItem(MEME_SOUND_KEY, 'airhorn');
    expect(getMemeSound()).toBe('random');
  });

  it('every listed sound has its mp3 in public/sounds/memes', () => {
    expect(MEME_SOUNDS.length).toBeGreaterThan(0);
    MEME_SOUNDS.forEach((s) => {
      expect(fs.existsSync(path.resolve(__dirname, '../../public/sounds/memes', s.file))).toBe(true);
    });
  });
});

describe('Not approved status', () => {
  it('is a board status but not offered when creating a task', () => {
    expect(STATUSES.map((s) => s.id)).toContain(NOT_APPROVED);
    expect(CREATE_STATUSES.map((s) => s.id)).not.toContain(NOT_APPROVED);
  });
});
