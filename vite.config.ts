// Vite(開発サーバー・ビルド)とVitest(単体テスト)の設定を1ファイルにまとめている。
// 別々のファイルにすると設定がずれやすいため、"vitest/config" の defineConfig を使うと
// Viteの設定に "test" フィールドを追加するだけで両方をカバーできる。
import { fileURLToPath } from "node:url";
import { crx } from "@crxjs/vite-plugin";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vitest/config";
import manifest from "./manifest.json" with { type: "json" };

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
    // manifest.json を起点に background/content script を自動でバンドルしてくれるプラグイン。
    // MV3はリモートコード実行禁止(=CDNからのJS読み込み禁止)なので、MediaPipeのwasmと同様に
    // 拡張機能本体のコードも全部ローカルにバンドルする必要があり、このプラグインが必須になる。
    // また開発時はHMR(コード変更を拡張機能に即反映する仕組み)にも対応してくれる。
    crx({ manifest }),
  ],
  server: {
    // trueにすると全ネットワークインターフェース(0.0.0.0)でリッスンする。
    // これが無いと localhost からしかアクセスできず、LAN上の別端末から繋がらない。
    host: true,
  },
  build: {
    rollupOptions: {
      // crx()はmanifest.json由来のエントリ(background/content script/popup)を
      // 自動でinputに設定してくれるが、それ以外の2つは明示的にinputへ追加する必要がある。
      // - index.html: 「単体HTMLのPoCページ」(main.ts)。manifest.jsonから参照されない
      //   独立したページなので、明示しないとビルド対象から外れてしまう。
      // - offscreen.html: chrome.offscreen.createDocument()が実行時にURLを指定して
      //   開くページで、manifest.json上はどこからも参照されない(popup/content_scripts
      //   と違いmanifestに書く欄が無い)。そのためcrx()もこの存在に気づけず、
      //   明示しないとdist/にoffscreen.html自体がビルドされず実行時に404になる
      //   (npm run buildの結果でdist/を都度確認して検証済み)。
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        offscreen: fileURLToPath(
          new URL("./src/offscreen/offscreen.html", import.meta.url),
        ),
      },
    },
  },
  test: {
    // 判定ロジック(src/shared/)は純粋関数でDOM操作を含まないため、
    // 軽量な node 環境で十分(jsdom等は不要)。
    environment: "node",
  },
}));
