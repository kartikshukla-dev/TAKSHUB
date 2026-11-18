// Chat message sounds. "Default" is the original short ping; "Meme sounds"
// are meme-style effects synthesized with WebAudio (no audio files, so
// nothing to license and nothing extra to download).

export const SOUND_STYLE_KEY = 'oncare_msg_sound_style'; // 'default' | 'meme'
export const MEME_SOUND_KEY = 'oncare_meme_sound'; // sound id | 'random'

let shared = null;
function audio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!shared || shared.state === 'closed') shared = new Ctx();
  if (shared.state === 'suspended') shared.resume().catch(() => {});
  return shared;
}

// One oscillator note with an attack/decay envelope.
function tone(ctx, out, { type = 'sine', freq, to, start = 0, dur = 0.2, gain = 0.2, attack = 0.01, curve = 'exp' }) {
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) {
    if (curve === 'lin') osc.frequency.linearRampToValueAtTime(to, t + dur);
    else osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
  return osc;
}

// A burst of filtered white noise (drums, cymbals, clicks).
function noise(ctx, out, { start = 0, dur = 0.2, gain = 0.2, type = 'highpass', freq = 5000 }) {
  const t = ctx.currentTime + start;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(out);
  src.start(t);
}

function lowpass(ctx, freq) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  f.connect(ctx.destination);
  return f;
}

// Adds vibrato to an oscillator.
function vibrato(ctx, osc, { rate = 6, depth = 6, start = 0, dur = 1 }) {
  const t = ctx.currentTime + start;
  const lfo = ctx.createOscillator();
  const g = ctx.createGain();
  lfo.frequency.value = rate;
  g.gain.value = depth;
  lfo.connect(g).connect(osc.frequency);
  lfo.start(t);
  lfo.stop(t + dur);
}

export const MEME_SOUNDS = [
  {
    id: 'boom',
    label: 'Dramatic boom',
    emoji: '💥',
    play(ctx) {
      const out = lowpass(ctx, 900);
      tone(ctx, out, { freq: 130, to: 36, dur: 1.1, gain: 0.7, attack: 0.005 });
      tone(ctx, out, { type: 'triangle', freq: 65, to: 30, dur: 0.9, gain: 0.35, attack: 0.005 });
      noise(ctx, out, { dur: 0.18, gain: 0.35, type: 'lowpass', freq: 600 });
    },
  },
  {
    id: 'airhorn',
    label: 'Air horn',
    emoji: '📯',
    play(ctx) {
      const out = lowpass(ctx, 3200);
      [
        [0, 0.12],
        [0.17, 0.12],
        [0.34, 0.55],
      ].forEach(([start, dur]) => {
        [466, 471, 933].forEach((freq) => tone(ctx, out, { type: 'sawtooth', freq, start, dur, gain: 0.07, attack: 0.01 }));
      });
    },
  },
  {
    id: 'sad-trombone',
    label: 'Sad trombone',
    emoji: '🎺',
    play(ctx) {
      const out = lowpass(ctx, 1400);
      const notes = [392, 370, 349, 330];
      notes.forEach((freq, i) => {
        const last = i === notes.length - 1;
        const osc = tone(ctx, out, { type: 'sawtooth', freq, start: i * 0.38, dur: last ? 1.0 : 0.34, gain: 0.12, attack: 0.03 });
        if (last) vibrato(ctx, osc, { start: i * 0.38, dur: 1.0, rate: 5, depth: 8 });
      });
    },
  },
  {
    id: 'rimshot',
    label: 'Ba dum tss',
    emoji: '🥁',
    play(ctx) {
      const out = ctx.destination;
      tone(ctx, out, { freq: 210, to: 110, dur: 0.16, gain: 0.5, attack: 0.003 });
      tone(ctx, out, { freq: 150, to: 75, start: 0.2, dur: 0.2, gain: 0.5, attack: 0.003 });
      noise(ctx, out, { start: 0.44, dur: 0.7, gain: 0.25, type: 'highpass', freq: 7000 });
    },
  },
  {
    id: 'bonk',
    label: 'Bonk',
    emoji: '🔨',
    play(ctx) {
      const out = lowpass(ctx, 2500);
      tone(ctx, out, { type: 'square', freq: 620, to: 140, dur: 0.12, gain: 0.18, attack: 0.002 });
      tone(ctx, out, { type: 'triangle', freq: 320, to: 90, dur: 0.22, gain: 0.35, attack: 0.002 });
      noise(ctx, out, { dur: 0.04, gain: 0.3, type: 'bandpass', freq: 1800 });
    },
  },
  {
    id: 'boing',
    label: 'Boing',
    emoji: '🪀',
    play(ctx) {
      const osc = tone(ctx, ctx.destination, { type: 'sine', freq: 180, to: 520, dur: 0.6, gain: 0.3, attack: 0.005 });
      vibrato(ctx, osc, { rate: 16, depth: 60, dur: 0.6 });
    },
  },
  {
    id: 'dun-dun',
    label: 'Dun dun dunnn',
    emoji: '😱',
    play(ctx) {
      const out = lowpass(ctx, 1600);
      [
        [196, 0, 0.24],
        [207.65, 0.28, 0.24],
        [185, 0.56, 1.1],
      ].forEach(([freq, start, dur]) => {
        const a = tone(ctx, out, { type: 'sawtooth', freq, start, dur, gain: 0.1, attack: 0.01 });
        tone(ctx, out, { type: 'square', freq: freq / 2, start, dur, gain: 0.06, attack: 0.01 });
        if (dur > 1) vibrato(ctx, a, { start, dur, rate: 7, depth: 5 });
      });
    },
  },
  {
    id: 'crickets',
    label: 'Awkward crickets',
    emoji: '🦗',
    play(ctx) {
      const out = ctx.destination;
      [0, 0.09, 0.18, 0.6, 0.69, 0.78].forEach((start) => tone(ctx, out, { freq: 4300, start, dur: 0.06, gain: 0.08, attack: 0.005 }));
    },
  },
  {
    id: 'tada',
    label: 'Ta-da!',
    emoji: '🎉',
    play(ctx) {
      const out = lowpass(ctx, 4000);
      [523, 659, 784].forEach((freq, i) => tone(ctx, out, { type: 'triangle', freq, start: i * 0.08, dur: 0.18, gain: 0.18 }));
      [523, 659, 784, 1047].forEach((freq) => tone(ctx, out, { type: 'triangle', freq, start: 0.26, dur: 0.7, gain: 0.12 }));
    },
  },
  {
    id: 'slide-whistle',
    label: 'Slide whistle',
    emoji: '🪈',
    play(ctx) {
      const osc = tone(ctx, ctx.destination, { freq: 420, to: 1700, dur: 0.45, gain: 0.18, attack: 0.02 });
      vibrato(ctx, osc, { rate: 9, depth: 14, dur: 0.45 });
    },
  },
  {
    id: 'pop',
    label: 'Bubble pop',
    emoji: '🫧',
    play(ctx) {
      tone(ctx, ctx.destination, { freq: 380, to: 1300, dur: 0.07, gain: 0.35, attack: 0.002 });
      tone(ctx, ctx.destination, { freq: 500, to: 1600, start: 0.1, dur: 0.06, gain: 0.25, attack: 0.002 });
    },
  },
];

// The original ping, unchanged.
export function playDefaultPing() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
    osc.onended = () => ctx.close();
  } catch {
    // Audio is a nicety; ignore failures (e.g. autoplay policy).
  }
}

export function playMemeSound(id) {
  try {
    const ctx = audio();
    if (!ctx) return;
    const pick = id === 'random' || !id ? MEME_SOUNDS[Math.floor(Math.random() * MEME_SOUNDS.length)] : MEME_SOUNDS.find((s) => s.id === id) || MEME_SOUNDS[0];
    pick.play(ctx);
  } catch {
    /* ignore */
  }
}

const read = (key, fallback) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};

export const getSoundStyle = () => (read(SOUND_STYLE_KEY, 'default') === 'meme' ? 'meme' : 'default');
export const getMemeSound = () => read(MEME_SOUND_KEY, 'random');

// What a new chat message plays, based on the Settings choice.
export function playMessageSound() {
  if (getSoundStyle() === 'meme') playMemeSound(getMemeSound());
  else playDefaultPing();
}
