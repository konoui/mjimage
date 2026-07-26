import { copyFileSync } from "node:fs";
import dts from "vite-plugin-dts";
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    // vite-tsconfig-paths の代替。Vite 8 が tsconfig の paths を解決する。
    tsconfigPaths: true,
  },
  plugins: [
    dts({
      rollupTypes: true,
      afterBuild: () => {
        // https://github.com/qmhc/vite-plugin-dts/issues/267
        copyFileSync("dist/index.d.ts", "dist/index.d.cts");
      },
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "./src/index.ts"),
      name: "mjimage",
      fileName: "index",
      formats: ["es", "cjs"],
    },
  },
  test: {
    globals: true,
  },
});
