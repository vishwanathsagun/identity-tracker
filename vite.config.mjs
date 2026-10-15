"use strict";
import { defineConfig } from "vite";

// Vite is used ONLY for bundling (per spec: no framework rewrite).
// Output goes to /dist, which Capacitor serves as the web root.
export default defineConfig({
  build: {
    outDir: "dist",
    target: "es2020",
    assetsInlineLimit: 0,
    // Keep filenames stable for Capacitor updates
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
});
