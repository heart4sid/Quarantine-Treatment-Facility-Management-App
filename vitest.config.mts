import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Use Node environment for server-side tests (domain, authz, services)
    environment: "node",
    env: {
      AUTH_SECRET: "antigravity-dev-secret-at-least-32-chars-long",
    },
    // Collect coverage from domain and server modules
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/server/authz/**"],
      exclude: ["src/domain/__tests__/**", "src/server/authz/__tests__/**"],
      // All clinical domain code requires 100% branch coverage (TRD §4.2)
      thresholds: {
        "src/domain/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        "src/server/authz/**": {
          branches: 100,
          functions: 90,
          lines: 90,
          statements: 90,
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
