#!/usr/bin/env node
// Placeholder brand assets — a flat disc on a flat field — so a fresh product builds,
// installs and passes store validation before it has a mark. Replace the PNGs under
// `assets/` with the product's own (`app.config.js` names each one); rerun this to get
// the placeholders back. Pure node: the PNG is written by hand, no image library.
//
//   node scripts/render-placeholder-assets.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");

/** `SPLASH_GROUND` in app.config.js — the two are edited together. */
const FIELD = [15, 23, 42];
const MARK = [255, 255, 255];

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** An RGBA PNG of `size`², each pixel painted by `paint(x, y) -> [r, g, b, a]`. */
function png(size, paint) {
  const rows = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y += 1) {
    const row = y * (1 + size * 4);
    rows[row] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = paint(x, y);
      rows.set([r, g, b, a], row + 1 + x * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit, RGBA, deflate, no filter, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** The disc's coverage of a pixel, edge softened over one pixel. */
function disc(x, y, size, radius) {
  const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
  return Math.max(0, Math.min(1, radius - d + 0.5));
}

const onField = (size, radius) => (x, y) => {
  const t = disc(x, y, size, radius);
  return [...FIELD.map((f, i) => Math.round(f + (MARK[i] - f) * t)), 255];
};
const onClear = (size, radius) => (x, y) => [...MARK, Math.round(255 * disc(x, y, size, radius))];

mkdirSync(join(ASSETS, "icon"), { recursive: true });
const files = {
  "icon/icon.png": png(1024, onField(1024, 300)),
  // Android keeps the inner 66% of the adaptive layers; the disc stays inside it.
  "icon/adaptive-foreground.png": png(1024, onClear(1024, 220)),
  "icon/adaptive-monochrome.png": png(1024, onClear(1024, 220)),
  "splash-icon.png": png(512, onClear(512, 160)),
};
for (const [name, bytes] of Object.entries(files)) {
  writeFileSync(join(ASSETS, name), bytes);
  console.log(`wrote assets/${name} (${bytes.length} bytes)`);
}
