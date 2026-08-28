import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/env.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    server: {
      deps: {
        inline: [/@llz-clipper\//],
      },
    },
  },
});
