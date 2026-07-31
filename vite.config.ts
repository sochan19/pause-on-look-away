// Vite(開発サーバー・ビルド)とVitest(単体テスト)の設定を1ファイルにまとめている。
// 別々のファイルにすると設定がずれやすいため、"vitest/config" の defineConfig を使うと
// Viteの設定に "test" フィールドを追加するだけで両方をカバーできる。
import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vitest/config";

export default defineConfig(({ command }) => ({
  plugins: [
    // getUserMedia()(カメラ取得API)はブラウザの「セキュアコンテキスト」でしか使えない
    // 仕様になっている(HTTPS、または localhost からのアクセスのみ)。
    // 開発中に別端末(スマホ・タブレット等、実カメラ付きの端末)からLAN経由で
    // http://<自分のIP>:5173 のようにアクセスすると、この制限に引っかかって
    // navigator.mediaDevices が undefined になってしまう。
    // このプラグインは自己署名証明書を自動生成し、開発サーバーをHTTPS化することで
    // LAN上の他端末からのアクセスでもカメラAPIが使えるようにする(開発専用。本番ビルドには影響しない)。
    // 接続する端末側では「この証明書は信頼できません」という警告が出るが、
    // 自分で立てた開発サーバーだと分かっているので「詳細設定 → このまま進む」等で許可してよい。
    //
    // command === "serve" (npm run dev)の時だけ有効にする。vitest(単体テスト)実行時にまで
    // 証明書生成が走らないようにするため。
    command === "serve" ? basicSsl() : undefined,
  ],
  server: {
    // trueにすると全ネットワークインターフェース(0.0.0.0)でリッスンする。
    // これが無いと localhost からしかアクセスできず、LAN上の別端末から繋がらない。
    host: true,
  },
  test: {
    // 判定ロジック(src/shared/)は純粋関数でDOM操作を含まないため、
    // 軽量な node 環境で十分(jsdom等は不要)。
    environment: "node",
  },
}));
