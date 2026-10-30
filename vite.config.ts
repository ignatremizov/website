import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  preview: {
    allowedHosts: [
      "ignat-linux",
      "ignat-linux.tail9fd3f3.ts.net",
    ],
  },
  build: {
    manifest: true,
    target: "es2022",
    sourcemap: false,
    assetsInlineLimit: 2048,
    // Three.js is intentionally isolated at ~588 kB minified (~149 kB gzip).
    // Keep warnings useful by flagging growth beyond that known vendor floor.
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks: (moduleId) => {
          if (moduleId.includes("/node_modules/three/")) return "three";
          return undefined;
        },
        chunkFileNames: "assets/[name]-[hash].js",
      },
    },
  },
});
