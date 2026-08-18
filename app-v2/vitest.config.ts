import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Vitest doesn't read tsconfig `paths`, so the app's "@/..." alias has to be
// restated here for tests that import modules by their normal app path.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
