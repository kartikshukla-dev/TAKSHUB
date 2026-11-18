// Generates frontend/public/stickers/office/*.svg from the office sticker
// list. Run after editing backend/src/constants/officeStickers.js:
//   node backend/scripts/buildOfficeStickers.js
const fs = require('fs');
const path = require('path');
const { OFFICE_STICKERS } = require('../src/constants/officeStickers');

const OUT = path.join(__dirname, '../../frontend/public/stickers/office');
fs.mkdirSync(OUT, { recursive: true });

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Die-cut sticker look: thick white outline, soft shadow, slight tilt.
function svg({ title, emoji, bg, ink }, i) {
  const tilt = [-6, 4, -3, 5, -4, 3][i % 6];
  const size = title.length > 11 ? 26 : title.length > 8 ? 30 : 34;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">
  <defs>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#000" flood-opacity="0.22"/>
    </filter>
  </defs>
  <g transform="rotate(${tilt} 120 120)" filter="url(#s)">
    <rect x="18" y="26" width="204" height="188" rx="46" fill="#fff"/>
    <rect x="28" y="36" width="184" height="168" rx="38" fill="${bg}"/>
    <text x="120" y="118" text-anchor="middle" font-size="76" font-family="'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif">${emoji}</text>
    <text x="120" y="176" text-anchor="middle" font-size="${size}" font-weight="900" letter-spacing="-1" fill="${ink}" font-family="'Satoshi','Arial Black','Segoe UI',Arial,sans-serif">${esc(title)}</text>
  </g>
</svg>
`;
}

OFFICE_STICKERS.forEach((s, i) => fs.writeFileSync(path.join(OUT, `${s.key}.svg`), svg(s, i)));
console.log(`wrote ${OFFICE_STICKERS.length} stickers to ${OUT}`);
