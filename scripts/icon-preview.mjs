// scripts/icon-preview.mjs — structurally verify the generated launcher PNGs
// (signature, chunk CRCs, inflated IDAT layout, sample pixel colors) and write
// icon-preview.html with the images embedded as data: URIs (the preview server
// only serves .html files). Run: node scripts/gen-icon.mjs && node scripts/icon-preview.mjs
import { inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function decodePng(path) {
  const buf = readFileSync(path);
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!sig.every((b, i) => buf[i] === b)) throw new Error(`${path}: bad signature`);
  let off = 8;
  let w = 0;
  let h = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    const crc = buf.readUInt32BE(off + 8 + len);
    if (crc32(buf.subarray(off + 4, off + 8 + len)) !== crc) throw new Error(`${path}: CRC fail in ${type}`);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error(`${path}: not RGBA8 non-interlaced`);
    }
    if (type === "IDAT") idat.push(data);
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== h * (1 + w * 4)) throw new Error(`${path}: inflated size mismatch`);
  // every scanline must use filter 0 (our encoder emits none-filter only)
  for (let y = 0; y < h; y++) if (raw[y * (1 + w * 4)] !== 0) throw new Error(`${path}: unexpected filter`);
  const px = (x, y) => {
    const i = y * (1 + w * 4) + 1 + x * 4;
    return [raw[i], raw[i + 1], raw[i + 2], raw[i + 3]];
  };
  return { w, h, px, base64: buf.toString("base64") };
}

const ICONS = {
  fg: "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png",
  legacy: "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png",
  round: "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png",
  mdpi: "android/app/src/main/res/mipmap-mdpi/ic_launcher.png",
  hdpi: "android/app/src/main/res/mipmap-hdpi/ic_launcher.png",
  xhdpi: "android/app/src/main/res/mipmap-xhdpi/ic_launcher.png",
  xxhdpi: "android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png",
};

const ok = (label, cond, detail) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!cond) process.exitCode = 1;
};

const imgs = {};
for (const [key, rel] of Object.entries(ICONS)) imgs[key] = decodePng(join(ROOT, rel));

// geometry + color assertions on the 192px legacy square
const g = imgs.legacy;
const center = g.px(70, 80); // inside the disc, off the checkmark stroke
const corner = g.px(2, 2);
const bottom = g.px(96, 189);
ok("disc interior = warm peach glyph", center[0] > 230 && center[1] > 200 && center[2] > 170, `rgb(${center.slice(0, 3)})`);
ok("square top-left = dark plum", corner[0] < 70 && corner[1] < 50, `rgb(${corner.slice(0, 3)})`);
ok("square bottom darker than flare center", bottom[1] < center[1], "");
const cut = g.px(106, 92);
ok("checkmark cutout reads dark inside disc", cut[0] < 90 && cut[1] < 70, `rgb(${cut.slice(0, 3)})`);
const r = imgs.round;
ok("round corner transparent (circular mask)", r.px(1, 1)[3] === 0, `a=${r.px(1, 1)[3]}`);
const rc = r.px(70, 80);
ok("round disc opaque peach", rc[3] === 255 && rc[0] > 230, `rgba(${[...rc]})`);
for (const key of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "fg"]) {
  const i = imgs[key];
  ok(`${key} square ${i.w}x${i.h}`, i.w === i.h && [48, 72, 96, 144, 192].includes(i.w));
}

// ---- preview html (data URIs; the preview server only serves .html) --------
const uri = (k) => `data:image/png;base64,${imgs[k].base64}`;
const cell = (k, px, label = "") =>
  `<div class="cell"><img src="${uri(k)}" width="${px}" height="${px}" alt=""><small>${label}</small></div>`;
const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>Icon preview</title>
<style>
  body { background: #efeaf2; font: 14px system-ui; color: #221; margin: 24px; }
  .row { display: flex; gap: 24px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 28px; }
  .cell { text-align: center; }
  .cell img { display: block; margin: 0 auto 6px; }
  .dark { background: #12071a; padding: 18px; border-radius: 14px; }
  .squircle { border-radius: 28%; overflow: hidden; }
  .circle { border-radius: 50%; overflow: hidden; }
  h2 { font-size: 15px; margin: 26px 0 10px; }
  small { color: #665; }
</style></head>
<body>
<h2>Adaptive (masked) — how it appears on a modern launcher</h2>
<div class="row dark">
  <div class="cell squircle">${cell("fg", 160)}</div>
  <div class="cell circle">${cell("fg", 160)}</div>
  <div class="cell">${cell("legacy", 160, "legacy 192")}</div>
  <div class="cell circle">${cell("round", 160, "round 192")}</div>
</div>
<h2>Smallest sizes (legibility check)</h2>
<div class="row">
  ${cell("mdpi", 48, "mdpi 48")}
  ${cell("hdpi", 72, "hdpi 72")}
  ${cell("xhdpi", 96, "xhdpi 96")}
  ${cell("xxhdpi", 144, "xxhdpi 144")}
</div>
</body></html>`;
writeFileSync(join(ROOT, "icon-preview.html"), html);
console.log(`icon-preview.html written (${Math.round(html.length / 1024)}KB, data URIs embedded)`);
