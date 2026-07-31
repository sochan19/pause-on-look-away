# 手動テストチェックリスト

自動テストで担保できない項目。該当箇所を変更した commit の後、実機で確認して結果を記録する。

## Phase 1: 顔向き検出PoCページ(`npm run dev` で起動する単体ページ)

Surface(実カメラ搭載端末、LAN経由でHTTPS開発サーバーに接続)で確認済み。2026-07-31。

- [x] `npm run dev` でページを開くとカメラ許可ダイアログが表示され、許可後に映像とランドマーク(顔のメッシュ)が描画される
- [x] 顔を左右に振ったとき、画面上のYaw数値がその向きと一致した符号で変化する(例: 右を向いたら数値が増える/減るのどちらかで一貫している)
      — `computeHeadRotationDegrees()` の軸変換は理論値のみで実装しており、実機のMediaPipe出力との符号の整合は未検証のため必須確認
  - 記録: 直感と一致する符号で変化することを確認(具体的な増加/減少の向きは未記録。`isFacingCamera()`は絶対値で判定するため実害なし) — 確認日: 2026-07-31
- [x] 顔を上下に振ったとき、Pitch数値が直感と一致した符号で変化する
- [x] 顔がカメラ範囲外に外れる/手で覆うと、「顔が検出できません — 非視聴」の表示になる(F-04)
      — Phase 2でヒステリシス導入後は即座には切り替わらなくなった。下記Phase 2の項目を参照
- [x] Yawが±20度(FACING_THRESHOLD_DEG)を超えると「非視聴」、それ以内では「視聴中」と表示が切り替わる
      — Phase 2でヒステリシス導入後は即座には切り替わらなくなった。下記Phase 2の項目を参照
- [x] CPU使用率が過大でない(体感チェック)
- [ ] GPUが使えない/古い環境で開いた場合、`delegate: "GPU"`の初期化に失敗してもページがフリーズせず、エラーメッセージが画面に表示される
      — 未確認(今回使用したSurfaceはGPU delegateで正常動作したため、GPU非対応環境での検証は別途)

## Phase 2: ヒステリシス(Nフレーム継続判定)

要手動確認。実装・Vitestでの検証のみ完了しており、Surface実機での体感確認は未実施
(ユーザー指示によりPhase 2実装を優先し、実機確認は次回まとめて対応予定)。

- [ ] 顔を手で覆った瞬間ではなく、`CONFIRMATION_FRAME_COUNT`(15フレーム)相当の時間が
      経過してから「非視聴」表示に切り替わる(即座には切り替わらない)
- [ ] まばたき・一瞬の首振り程度の短い変化では表示が切り替わらない(誤検知に強くなったことの確認)
- [ ] 「非視聴」確定後、正面に戻してもすぐには「視聴中」に戻らず、同様にNフレーム相当
      経過してから切り替わる(視聴↔非視聴どちらの方向も同じ遅延になっていることの確認)
- [ ] 体感としてNフレーム(15フレーム、実機のfps次第で数百ms程度)の遅延が不自然に長すぎ
      たり短すぎたりしないか(実機での体感調整が必要ならその旨を記録)

## Phase 3: Chrome拡張の骨組み(manifest / background / content script)

要手動確認。`npm run build` で生成した `dist/` を `chrome://extensions` の
「パッケージ化されていない拡張機能を読み込む」で読み込んで確認する
(自動テストではChrome拡張としての読み込み・起動は検証できないため)。

- [x] `dist/` を読み込んでエラー(赤字の警告)が出ない
      — 確認日: 2026-07-31
- [x] 拡張機能の「service worker」リンクからコンソールを開くと、
      `[Gaze-Aware Playback] service worker starting up` と
      `[Gaze-Aware Playback] onInstalled: reason=install` のログが出ている
      — 確認日: 2026-07-31
- [x] YouTube (`youtube.com`) を開き、ページのデベロッパーツールのコンソールに
      `[Gaze-Aware Playback] content script loaded on ...(site=youtube)` が出る
      — 確認日: 2026-07-31(www.youtube.comで`site=youtube`のログを確認)
- [x] Prime Video (`primevideo.com` または `amazon.co.jp`) を開き、同様に
      `(site=primevideo)` のログが出る
      — 確認日: 2026-07-31(www.amazon.co.jpで`site=primevideo`のログを確認)
- [x] 上記以外の任意のサイトではcontent scriptが注入されない(そもそもログが出ない)
      — 確認日: 2026-07-31

## Phase 4: YouTube pause/play制御

要手動確認。`npm run build`で生成した`dist/`を`chrome://extensions`で再読み込みして確認する
(拡張機能アイコンのクリックイベント・実際のYouTube DOMへのpause/play実行は自動テスト不可のため)。
カメラ判定(Phase5)がまだ無いため、拡張機能アイコンのクリックを「視聴⇔非視聴が切り替わった」
ことの仮のトリガーとして使う(`src/shared/chrome/action.ts`のコメント参照)。

- [x] YouTubeの動画再生ページ(`/watch`)で動画を再生し、拡張機能アイコンをクリックすると
      一時停止する(F-10, F-12)
      — 確認日: 2026-07-31(目視確認)
- [x] もう一度アイコンをクリックすると再生が再開する(自動再開ON固定のため。F-11)
      — 確認日: 2026-07-31(目視確認)
- [x] service workerのコンソールに`state=... -> command=... response=...`のログが出て、
      content script側のタブでpause/playが実行されていることが追える
      — 確認日: 2026-07-31(目視確認)
- [x] ホバープレビュー動画が存在しうる一覧ページ(検索結果・ホーム等)を開いた状態で
      アイコンをクリックしても、意図しない小さいプレビュー動画ではなく、実際に再生中の
      メイン動画(あれば)が制御される(「可視かつ最大面積」の選定ルールの確認)
      — 確認日: 2026-07-31(目視確認)
- [x] 動画Aを視聴中に別の動画Bへページ内遷移(SPA、URLだけ変わりリロードなし)した後、
      アイコンをクリックすると動画Bが正しく制御される(video要素の再クエリが
      機能していることの確認。E-5決定事項)
      — 確認日: 2026-07-31(目視確認)
- [x] YouTube以外のタブ(Prime Videoや無関係なサイト)でアイコンをクリックしてもエラーで
      壊れない(content script側が`unsupported-site`/`no-video-found`を返すのみ)
      — 確認日: 2026-07-31。content scriptが注入されていない無関係なサイト(Google
      トップページ等)で確認。`chrome.tabs.sendMessage`が
      `Could not establish connection. Receiving end does not exist.`を投げるが、
      `sendMessageToTab()`内のtry/catchで受け止められ`console.warn`ログ→`response= null`
      として処理が正常に続くことをservice workerのコンソールログで確認(赤字の
      Uncaughtエラーにはなっていない)。Prime Video等content script注入済みサイトでの
      `unsupported-site`/`no-video-found`は未確認(任意項目のため見送り)

## Phase 5: offscreen documentへのカメラ処理統合

要手動確認。実カメラが無い開発環境だったため、LAN経由でSurface(実カメラ搭載端末)に
ビルド済み`dist/`を転送して確認した。2026-07-31。

- [x] popupを開くとカメラ許可の状態("未許可"等)が表示される
      — 確認日: 2026-07-31
- [x] ~~popupの「カメラを許可する」ボタンを押すと許可ダイアログが表示され~~
      → **実機検証の結果、popupから`getUserMedia()`を呼ぶと許可ダイアログが出ずに
      即座に`NotAllowedError`(DOMException)になることを確認**(2026-07-31)。
      popupは正式なタブとして扱われないため許可ダイアログを表示できない制約による
      もので、DECISIONS.md E-1で想定していたリスクが実際に発生した。
      → **optionsページ方式(`options_ui`、`open_in_tab: true`で通常タブとして開く)へ
      切り替え済み**。popupは状態表示と「設定ページを開く」ボタンのみに縮小し、
      実際の許可取得は`src/options/options.ts`で行う。以下は切り替え後の確認項目
- [x] popupの「設定ページを開く」ボタンを押すとoptionsページが新しいタブとして開く
      — 確認日: 2026-07-31(Surface実機)
- [x] optionsページの「カメラを許可する」ボタンを押すと許可ダイアログが表示され、
      許可すると「許可済み」の表示に切り替わる
      — 確認日: 2026-07-31(Surface実機)。合わせて、offscreen documentで
      `WebAssembly.instantiate()`がCSP違反で失敗する不具合を発見・修正
      (manifest.jsonに`content_security_policy.extension_pages`で
      `wasm-unsafe-eval`を追加。MV3のデフォルトCSPはWASMコンパイルを許可しないため)
- [x] 許可済みの状態でYouTubeの動画ページをアクティブなタブにすると、offscreen
      documentのコンソールに`[offscreen] offscreen document loaded`・
      `[offscreen] カメラ起動・検出ループ開始`のログが出る
      — 確認日: 2026-07-31(Surface実機)。`INFO: Created TensorFlow Lite XNNPACK
      delegate for CPU.`等、MediaPipe内部のINFO/WARNINGログがChromeの「エラー」欄に
      赤字/警告として出るが機能上の問題ではないことを確認(既知の表示上の癖)
- [x] 拡張機能アイコンクリックを使わずに、実際に顔をカメラから背けて数秒待つと、
      YouTubeの動画が自動で一時停止する。向き直すと自動で再生が再開する
      (Phase5のゴールとなる一気通貫の確認。F-03, F-04, F-10〜F-12対応)
      — 確認日: 2026-07-31(Surface実機・目視確認)。offscreenのコンソールで
      `確定状態が変化: away`/`looking`の交互ログ、service workerのコンソールで
      `state=away -> command=pause response= {ok: true}`/
      `state=looking -> command=resume response= {ok: true}`のログも合わせて確認
- [x] YouTube以外のタブに切り替えると、offscreen/service worker両方のコンソールに
      `カメラ停止`/`対象サイトから離脱 -> STOP_CAMERA`が出る
      — 確認日: 2026-07-31(Surface実機)
- [x] service workerが一度アイドルで再起動されても
      (`[Gaze-Aware Playback] service worker starting up`が再度ログに出た後も)、
      START_CAMERA/STOP_CAMERAの送信・pause/resumeの中継が問題なく続くことを確認
      — 確認日: 2026-07-31(Surface実機。検証中に自然に発生したservice worker再起動後も
      正常動作を確認できた)
- [ ] カメラを他アプリで使用中/OSレベルで無効化した状態でYouTubeを開き、
      拡張機能がエラーで壊れず、offscreenのコンソールに`CAMERA_ERROR`関連のログが出る
      (許可はしているが物理的に使えない場合のエラーハンドリング確認)
      — 未確認(任意項目のため見送り。コード上はtry/catchで実装済み)
- [x] CPU使用率が動画再生を阻害しない水準(N-01)
      — 確認日: 2026-07-31(Surface実機、体感チェック。動画再生の目立った引っかかりなし)

既知の制約(今回未対応、必要になれば別途対応):
- `isCameraTargetUrl()`は`amazon.co.jp`ドメイン全体を対象サイトと判定するため
  (Phase4のE-4決定事項をそのまま流用)、Prime Video以外の通常のAmazon買い物ページを
  開いている間もカメラが起動する。影響が気になる場合はパス(`/gp/video/`等)で
  絞り込む改善を別途検討する

## カメラ・顔検出(汎用チェックリスト、上記Phase5の詳細確認で代替)

- [ ] 顔を左右に振る → 設定した角度・時間を超えたときのみ「非視聴」になる(まばたき・一瞬の首振りで誤発動しない)
- [ ] カメラの前から離席 → 「非視聴」になる(F-04)

## YouTube

- [ ] ページ内遷移(動画→別の動画)後も制御が効く(Phase4で確認済みのpause/resume経路がそのまま使われるため、カメラ判定と組み合わせても機能するかの確認)
- [ ] ホバープレビュー動画がある一覧ページで誤った video を操作しない(Phase4で確認済み)

## Prime Video

- [ ] 再生中に pause が効く(F-13)
- [ ] 再開時の挙動(プレイヤー UI との整合)を記録: ____

## 設定 UI

- [ ] カメラ ON/OFF 切り替えが即時反映される(F-20)
- [ ] 感度(角度・ディレイ)変更が判定に反映される(F-21)
- [ ] 一時停止発生時に視覚的通知が出る(F-22)

---
最終確認日: 2026-07-31 / 確認者: ユーザー / 対象コミット: 9f30e5b(Phase 5 offscreen documentへのカメラ処理統合。Surface実機で本物の視線検出によるYouTube自動pause/resumeを一気通貫で確認。検証中にoptionsページ方式への切り替え・CSP(wasm-unsafe-eval)修正の2件のバグを発見・対応)
