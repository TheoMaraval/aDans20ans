// Génère public/icon-192.png et icon-512.png (sans dépendance) : fond sombre + courbe montante.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function icon(size: number): Buffer {
  const px = Buffer.alloc(size * size * 4);
  const pts = [[12, 44], [26, 30], [36, 38], [52, 18]].map(([x, y]) => [x * size / 64, y * size / 64]);
  const w = 3 * size / 64;
  const distSeg = (x: number, y: number, [ax, ay]: number[], [bx, by]: number[]) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let col = [11, 16, 32];
    for (let k = 0; k < 3; k++) if (distSeg(x, y, pts[k], pts[k + 1]) <= w) col = [129, 140, 248];
    if (Math.hypot(x - pts[3][0], y - pts[3][1]) <= 4 * size / 64) col = [52, 211, 153];
    px.set([...col, 255], (y * size + x) * 4);
  }
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const s of [192, 512]) writeFileSync(`public/icon-${s}.png`, icon(s));
console.log('✔ icônes générées');
