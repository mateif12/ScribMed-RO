import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside the React Server bundler; stub it for tests.
      "server-only": path.resolve(import.meta.dirname, "tests/support/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/support/setup.ts"],
    restoreMocks: true,
    pool: "forks",
  },
});
