import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    // Prisma and better-sqlite3 must stay external: they are resolved from
    // node_modules at runtime rather than bundled into the main process.
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve("electron/main.ts") } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve("electron/preload.ts") } },
    },
  },
  renderer: {
    root: resolve("src/renderer"),
    plugins: [react()],
    resolve: {
      alias: { "@": resolve("src") },
    },
    build: {
      rollupOptions: { input: { index: resolve("src/renderer/index.html") } },
    },
  },
});
