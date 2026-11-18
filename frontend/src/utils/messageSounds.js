// Chat message sounds. "Default" is the original short ping; "Meme sounds"
// play one of the mp3 clips in frontend/public/sounds/memes/.
// To add a sound: drop the mp3 in that folder and add a line to MEME_SOUNDS.

export const SOUND_STYLE_KEY = 'oncare_msg_sound_style'; // 'default' | 'meme'
export const MEME_SOUND_KEY = 'oncare_meme_sound'; // sound id | 'random'

// Long clips are cut off so a notification never drags on.
const MAX_SECONDS = 5;
const VOLUME = 0.7;

export const MEME_SOUNDS = [
  { id: 'faaah', label: 'FAAAH', emoji: '😩', file: 'faaah.mp3' },
  { id: 'are-baap-re', label: 'Are baap re, yaad aaya', emoji: '😲', file: 'are-baap-re.mp3' },
  { id: 'kaun-hai-re', label: 'Kaun hai re', emoji: '🤨', file: 'kaun-hai-re.mp3' },
  { id: 'chicken-screaming', label: 'Chicken screaming', emoji: '🐔', file: 'chicken-screaming.mp3' },
  { id: 'depression', label: 'Depression (Indian)', emoji: '😔', file: 'depression.mp3' },
  { id: 'mystery', label: 'Mystery meme', emoji: '🎲', file: 'mystery.mp3' },
].map((s) => ({ ...s, url: `/sounds/memes/${s.file}` }));

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

export function findMemeSound(id) {
  if (id === 'random' || !id) return MEME_SOUNDS[Math.floor(Math.random() * MEME_SOUNDS.length)];
  // Unknown id (e.g. a sound that was removed): pick one at random.
  return MEME_SOUNDS.find((s) => s.id === id) || findMemeSound('random');
}

// Only one clip at a time: a burst of messages doesn't stack sounds.
let current = null;
let stopTimer = null;
export function stopMemeSound() {
  clearTimeout(stopTimer);
  if (current) {
    current.pause();
    current = null;
  }
}

export function playMemeSound(id) {
  try {
    if (typeof Audio === 'undefined') return null;
    stopMemeSound();
    const sound = findMemeSound(id);
    const clip = new Audio(sound.url);
    clip.volume = VOLUME;
    current = clip;
    const played = clip.play();
    if (played && played.catch) played.catch(() => {}); // autoplay blocked: stay quiet
    stopTimer = setTimeout(() => {
      if (current === clip) stopMemeSound();
    }, MAX_SECONDS * 1000);
    return sound;
  } catch {
    return null;
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
export const getMemeSound = () => {
  const id = read(MEME_SOUND_KEY, 'random');
  return id === 'random' || MEME_SOUNDS.some((s) => s.id === id) ? id : 'random';
};

// What a new chat message plays, based on the Settings choice.
export function playMessageSound() {
  if (getSoundStyle() === 'meme') playMemeSound(getMemeSound());
  else playDefaultPing();
}
