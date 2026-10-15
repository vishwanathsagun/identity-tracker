// One-time (re-runnable) vendor script: downloads the exact Google Fonts CSS + woff2
// files used by the Stitch prototype and rewrites them to local paths under public/fonts.
// Run: node scripts/vendor-fonts.mjs   (requires network; the APP itself never does)
import fs from "fs";
import path from "path";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const REQUESTS = [
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700&display=swap",
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200",
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap",
];

const OUT_DIR = path.join("public", "fonts");
fs.mkdirSync(OUT_DIR, { recursive: true });

let cssAll = "";
for (const url of REQUESTS) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`CSS fetch failed ${res.status}: ${url}`);
  cssAll += (await res.text()) + "\n";
}

// find all woff2 urls
const urls = [...new Set([...cssAll.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]))];
console.log(`downloading ${urls.length} font files...`);

let css = cssAll;
for (const u of urls) {
  const name = u.split("/").pop().replace(/[^a-zA-Z0-9._-]/g, "_");
  const dest = path.join(OUT_DIR, name);
  if (!fs.existsSync(dest)) {
    const fr = await fetch(u, { headers: { "User-Agent": UA } });
    if (!fr.ok) throw new Error(`font fetch failed ${fr.status}: ${u}`);
    fs.writeFileSync(dest, Buffer.from(await fr.arrayBuffer()));
  }
  css = css.split(u).join("./" + name);
}

fs.writeFileSync(path.join(OUT_DIR, "fonts.css"), css);
console.log("wrote", path.join(OUT_DIR, "fonts.css"), "| external urls left:", (css.match(/https?:\/\//g) || []).length);
