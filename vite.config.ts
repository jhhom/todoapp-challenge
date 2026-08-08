/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/web/routes",
      generatedRouteTree: "./src/web/routeTree.gen.ts",
      routeFileIgnorePrefix: "-",
      quoteStyle: "single",
    }),
    react(),
    tailwindcss(),
  ],
  test: {
    // Integration tests use a SEPARATE database (sleekflow_test) so they never
    // wipe dev data. Run files serially to avoid concurrent test data
    // clobbering each other.
    fileParallelism: false,
    env: {
      // Respect an externally-set DATABASE_URL (e.g. CI) so tests can target a
      // service-container database. Falls back to the local dev database.
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgres://joohom@localhost:5432/sleekflow_test",
    },
  },
});
