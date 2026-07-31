// Vite(開発サーバー・ビルド)とVitest(単体テスト)の設定を1ファイルにまとめている。
// 別々のファイルにすると設定がずれやすいため、"vitest/config" の defineConfig を使うと
// Viteの設定に "test" フィールドを追加するだけで両方をカバーできる。
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 判定ロジック(src/shared/)は純粋関数でDOM操作を含まないため、
    // 軽量な node 環境で十分(jsdom等は不要)。
    environment: "node",
  },
});
