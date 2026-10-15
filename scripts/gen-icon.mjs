// scripts/gen-icon.mjs — regenerate the app launcher icons (logo only).
// Pure Node, no image dependencies: shapes are drawn analytically with 4x4
// supersampling and encoded to RGBA PNG (zlib + manual CRC32).
//
// Design: "Violet Dusk" — midnight-plum -> royal-purple vertical gradient with
// a soft mauve ambient flare, and a warm-peach check-circle glyph (the habit
// "vote" mark) with a dark-plum checkmark cutout.
//
// Usage: node scripts/gen-icon.mjs   (writes android/app/src/main/res/mipmap-*)

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RES = join(ROOT, "android", "app", "src", "main", "res");

// ---------------------------------------------------------------- brand colors
const TOP = [0x2d, 0x18, 0x35]; // #2D1835 royal purple (top of gradient)
const BOT = [0x1c, 0x0e, 0x22]; // #1C0E22 midnight plum (bottom)
const FLARE = [0x50, 0x2d, 0x55]; // #502D55 ambient radial flare
const PEACH = [0xf6, 0xdb, 0xc0]; // #F6DBC0 warm peach glyph
const CUT = [0x24, 0x14, 0x29]; // #241429 checkmark cutout tone

// ------------------------------------------------------------------- PNG writer
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: none
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --------------------------------------------------------------------- drawing
const SS = 4; // 4x4 supersamples per pixel -> clean AA on curves

function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + t * dx;
  const qy = y1 + t * dy;
  return Math.hypot(px - qx, py - qy);
}

/** checkmark polyline in unit-disc coords (x right, y down), scaled by r */
const CHECK = [
  [-0.44, 0.02],
  [-0.11, 0.35],
  [0.47, -0.31],
];

/**
 * @param size     output px (square)
 * @param mode     "square" | "round" | "foreground"
 */
function renderIcon(size, mode) {
  const rgba = Buffer.alloc(size * size * 4);
  const half = size / 2;
  const rGlyph = size * (mode === "foreground" ? 0.27 : 0.27); // disc radius
  const cx = half;
  const cy = half;
  const flareC = { x: size * 0.5, y: size * 0.42, r: size * 0.62 };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;

          // background layer --------------------------------------------------
          let inBg = true;
          if (mode === "round") {
            inBg = Math.hypot(px - half, py - half) <= half;
          }
          if (!inBg) continue; // transparent sample (round mask)

          // background layer: gradient + ambient flare. The adaptive
          // foreground carries the full design too (the system mask crops it),
          // so adaptive and legacy renderings stay visually identical.
          let col = lerp3(TOP, BOT, py / size);
          const fd = Math.hypot(px - flareC.x, py - flareC.y) / flareC.r;
          const f = Math.max(0, 1 - fd);
          const w = f * f * 0.5; // soft ambient flare
          col = [
            Math.min(255, col[0] + (FLARE[0] - col[0]) * w),
            Math.min(255, col[1] + (FLARE[1] - col[1]) * w),
            Math.min(255, col[2] + (FLARE[2] - col[2]) * w),
          ];

          // peach disc (glyph) ------------------------------------------------
          const gd = Math.hypot(px - cx, py - cy);
          if (gd <= rGlyph) {
            col = PEACH;
            // checkmark cutout inside the disc
            const ux = (px - cx) / rGlyph;
            const uy = (py - cy) / rGlyph;
            const wStroke = 0.19; // half-stroke in unit-disc coords
            let dMin = Infinity;
            for (let i = 0; i < CHECK.length - 1; i++) {
              const d = distToSegment(
                ux,
                uy,
                CHECK[i][0],
                CHECK[i][1],
                CHECK[i + 1][0],
                CHECK[i + 1][1]
              );
              if (d < dMin) dMin = d;
            }
            if (dMin <= wStroke) col = CUT;
          }

          r += col[0];
          g += col[1];
          b += col[2];
          a += 255;
        }
      }

      const n = SS * SS;
      const i = (y * size + x) * 4;
      const count = a / 255 || 0;
      rgba[i] = count ? Math.round(r / count) : 0;
      rgba[i + 1] = count ? Math.round(g / count) : 0;
      rgba[i + 2] = count ? Math.round(b / count) : 0;
      rgba[i + 3] = Math.round(a / n); // coverage alpha
    }
  }
  return encodePng(size, size, rgba);
}

// ------------------------------------------------------------------------ write
const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

for (const [dpi, size] of Object.entries(DENSITIES)) {
  const dir = join(RES, `mipmap-${dpi}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "ic_launcher.png"), renderIcon(size, "square"));
  writeFileSync(join(dir, "ic_launcher_round.png"), renderIcon(size, "round"));
  writeFileSync(join(dir, "ic_launcher_foreground.png"), renderIcon(size, "foreground"));
  console.log(`mipmap-${dpi}: ${size}x${size} square/round/foreground`);
}

// adaptive background color resource (matches gradient bottom tone)
writeFileSync(
  join(RES, "values", "ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1C0E22</color>\n</resources>\n`
);
console.log("ic_launcher_background: #1C0E22");
