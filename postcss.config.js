"use strict";
// PostCSS config for Vite.
//
// Why the guard: Vite extracts the frozen prototype's INLINE <style> block into a
// virtual file (`index.html?html-proxy&inline-css&index=0.css`) and runs PostCSS
// on it. Tailwind v3 throws "`@layer base` is used but no matching `@tailwind base`
// directive is present" on any CSS containing @layer base without @tailwind
// directives. The Play CDN never PostCSS-processed inline styles either, so for
// html-proxy files Tailwind is skipped entirely (byte-identical original behavior).
// The config-function ctx only carries {cwd, env} in Vite, so the guard lives on
// the plugin itself, keyed on result.opts.from.
const tailwindcss = require("tailwindcss");
const autoprefixer = require("autoprefixer");

const rawTailwind = tailwindcss(require("path").resolve(__dirname, "tailwind.config.js"));
const guardedTailwind = {
  postcssPlugin: rawTailwind.postcssPlugin,
  plugins: rawTailwind.plugins.map((fn) => {
    if (typeof fn !== "function") return fn;
    return function (root, result) {
      const from = String((result && result.opts && result.opts.from) || "");
      if (from.includes("html-proxy")) return; // frozen inline <style>: pass through untouched
      return fn.call(this, root, result);
    };
  }),
};

module.exports = {
  plugins: [guardedTailwind, autoprefixer],
};
