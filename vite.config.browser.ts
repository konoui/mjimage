import { defineConfig } from "vite";
import { resolve } from "path";

/**
 * ブラウザ向けの配布物を作る設定。
 *
 * - `vite build --config vite.config.browser.ts` で dist-browser/ に生成する
 * - `vite --config vite.config.browser.ts` で dev/index.html を開発サーバに出す
 *
 * ライブラリ本体（vite.config.ts）とは出力先を分けている。
 * 同じ dist/ に出すと emptyOutDir で互いの成果物を消してしまうため。
 */
export default defineConfig({
  // 牌の画像。dev では / 直下に、build では dist-browser/ にコピーされる。
  // 変換元の png/giff は配布しないので assets/ に置き public/ には入れない。
  publicDir: "public",
  build: {
    outDir: "dist-browser",
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, "src/browser/global.ts"),
      // global.ts が自身で window.mjimage を代入するため、この名前は使われない
      name: "__mjimageGlobal",
      formats: ["iife"],
      fileName: () => "global.js",
    },
  },
});
