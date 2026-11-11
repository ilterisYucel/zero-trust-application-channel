import { defineConfig } from "vitest/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
    },
    reporters: ["default", "junit"],
    outputFile: {
      junit: "./test-results/junit.xml",
    },
  },
});
