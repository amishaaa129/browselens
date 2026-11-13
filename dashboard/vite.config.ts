import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dashboardDirectory = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [react()],

  build: {
    outDir: resolve(dashboardDirectory, "../extension/dashboard"),
    emptyOutDir: true,
  },

  server: {
    host: "127.0.0.1",
    port: 5173,
  },

  test: {
    environment: "jsdom",
  },
});
