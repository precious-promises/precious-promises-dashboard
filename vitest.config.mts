import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // jsdom is the default so component tests work without ceremony. The few
    // suites that need real Node globals opt out with a
    // `@vitest-environment node` docblock.
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
    // Playwright owns tests/e2e; Vitest must not try to run those specs.
    exclude: ["node_modules/**", ".next/**", "tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Source only — the glob deliberately excludes assets such as
      // globals.css and favicon.ico, which report as trivially covered and
      // only inflate the numbers.
      include: ["src/**/*.{ts,tsx}"],
    },
  },
});
