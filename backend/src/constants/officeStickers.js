// Built-in "Office stickers" pack, available to everyone from day one.
// Images live in frontend/public/stickers/office/<key>.svg (served as static
// files by the frontend / nginx). [key, caption, emoji, background, ink]
const OFFICE_STICKERS = [
  ['done', 'Done!', '✅', '#d9f7e6', '#0f7a45'],
  ['on-it', 'On it!', '🚀', '#e6defe', '#4c22c4'],
  ['approved', 'Approved', '👍', '#dff1ff', '#1f5fae'],
  ['lgtm', 'LGTM', '👌', '#fff1d6', '#9a5a00'],
  ['thank-you', 'Thank you', '🙏', '#ffe4ec', '#b0194f'],
  ['great-job', 'Great job!', '🎉', '#fff4c7', '#8a6a00'],
  ['meeting', 'Meeting?', '📅', '#e3f0ff', '#2a5bb8'],
  ['coffee', 'Coffee break', '☕', '#f3e6da', '#7a4a22'],
  ['lunch', 'Lunch?', '🍱', '#fde7d9', '#a24a12'],
  ['urgent', 'Urgent!', '🚨', '#ffe0e0', '#c21d2f'],
  ['checking', 'Checking…', '👀', '#ece8ff', '#5a3fd0'],
  ['wfh', 'WFH today', '🏠', '#e2f5f1', '#0f6e5c'],
  ['brb', 'BRB', '⏳', '#f0f0f3', '#3f3f4a'],
  ['deadline', 'Deadline!', '⏰', '#ffe9d1', '#b35400'],
  ['bug', 'Found a bug', '🐛', '#e6f6d8', '#3f7a12'],
  ['shipped', 'Shipped', '📦', '#e5ecff', '#2c3fae'],
  ['call-me', 'Call me', '📞', '#dcf6ff', '#0b6b8a'],
  ['noted', 'Noted', '📝', '#f6f0d9', '#6b5a12'],
  ['good-morning', 'Good morning', '☀️', '#fff3c4', '#8a6200'],
  ['party', 'Party time', '🥳', '#fbe3ff', '#8a1fa6'],
].map(([key, title, emoji, bg, ink]) => ({ key, title, emoji, bg, ink, url: `/stickers/office/${key}.svg` }));

const OFFICE_KEYS = new Set(OFFICE_STICKERS.map((s) => s.key));

module.exports = { OFFICE_STICKERS, OFFICE_KEYS };
