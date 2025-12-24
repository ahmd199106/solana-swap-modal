import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: {
      "@turnkey/react-wallet-kit": path.resolve(
        __dirname,
        "./src/test/mocks/turnkey.ts"
      ),
      "@turnkey/core": path.resolve(__dirname, "./src/test/mocks/turnkey.ts"),
      "@turnkey/http": path.resolve(__dirname, "./src/test/mocks/turnkey.ts"),
      "@turnkey/sdk-browser": path.resolve(
        __dirname,
        "./src/test/mocks/turnkey.ts"
      ),
      "@turnkey/viem": path.resolve(__dirname, "./src/test/mocks/turnkey.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/test/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/mockData",
        "**/.{idea,git,cache,output,temp}",
      ],
    },
  },
});
