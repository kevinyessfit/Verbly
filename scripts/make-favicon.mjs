// Génère assets/favicon.png : l'étincelle ambre de la marque sur un carré
// encre à coins arrondis. Aucune dépendance — PNG écrit à la main avec zlib.
//
//   node scripts/make-favicon.mjs
//
// Le tracé de l'étincelle est une astroïde : |x|^p + |y|^p <= r^p avec p < 1,
// ce qui donne les quatre branches concaves du symbole ✦.

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SIZE = 512;
const SS = 4; // supersampling, pour des bords lisses
const INK = [0x14, 0x15, 0x1f];
const AMBER = [0xf5, 0xa6, 0x23];
const CORNER = 0.22; // rayon des coins, en fraction du côté
const STAR = 0.46; // rayon de l'étincelle, en fraction du côté
const POINTINESS = 0.5; // exposant de l'astroïde : plus bas = branches plus fines

const inRoundedSquare = (x, y) => {
  const r = CORNER;
  const dx = Math.abs(x) - (1 - r);
  const dy = Math.abs(y) - (1 - r);
  if (dx <= 0 || dy <= 0) return Math.abs(x) <= 1 && Math.abs(y) <= 1;
  return dx * dx + dy * dy <= r * r;
};

const inStar = (x, y) => {
  const p = POINTINESS;
  return Math.pow(Math.abs(x), p) + Math.pow(Math.abs(y), p) <= Math.pow(STAR, p);
};

// Chaque pixel est moyenné sur SS×SS échantillons.
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
let o = 0;
for (let py = 0; py < SIZE; py++) {
  raw[o++] = 0; // filtre PNG « None »
  for (let px = 0; px < SIZE; px++) {
    let bg = 0, fg = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = ((px + (sx + 0.5) / SS) / SIZE) * 2 - 1;
        const y = ((py + (sy + 0.5) / SS) / SIZE) * 2 - 1;
        if (!inRoundedSquare(x, y)) continue;
        bg++;
        if (inStar(x, y)) fg++;
      }
    }
    const total = SS * SS;
    const alpha = bg / total;
    const mix = bg ? fg / bg : 0;
    for (let c = 0; c < 3; c++) {
      raw[o++] = Math.round(INK[c] * (1 - mix) + AMBER[c] * mix);
    }
    raw[o++] = Math.round(alpha * 255);
  }
}

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // 8 bits par canal
ihdr[9] = 6; // RGBA

writeFileSync('assets/favicon.png', Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]));

console.log(`assets/favicon.png écrit (${SIZE}x${SIZE})`);
