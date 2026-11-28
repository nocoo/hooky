import { defineConfig } from "vitest/config";
import RequireSelectedTests from "./tests/require-selected-tests.js";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    environment: "node",
    allowOnly: false,
    passWithNoTests: false,
    reporters: ["default", new RequireSelectedTests()],
    coverage: {
      provider: "v8",
      // AST-aware remapping is built into vitest v4+; no opt-in needed.
      reporter: ["text", "html"],
      include: ["src/**/*.js"],
      exclude: [
        // Legacy exclusion — file no longer exists, harmless to keep.
        "src/content.js",
        // Extension UI page scripts — covered by Puppeteer L4 E2E.
        "src/options/**",
        "src/popup/**",
        "**/*.d.ts",
        "**/index.js",
        "**/index.ts",
        "**/types.ts",
      ],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
