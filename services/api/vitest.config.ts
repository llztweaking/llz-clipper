import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/env.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    server: {
      deps: {
        inline: [/@llz-clipper\//],
      },
    },
  },
});
