// このファイルの役割:
// 複数のvideo要素(YouTubeのホバープレビュー等)の中から、実際に制御すべき
// 「メインのvideo要素」を1つ選ぶための純粋関数を提供する。
// なぜ絞り込みが必要か: YouTubeの動画一覧ページなどでは、サムネイルにマウスを
// 乗せると再生される小さいプレビュー用のvideo要素が同時にDOM上へ複数存在しうる。
// これらを誤って一時停止/再生してしまわないよう、「画面上で最も大きく表示されている
// video要素」をメイン動画とみなして選ぶ(docs/DECISIONS.md E-4の決定事項)。
// chrome拡張機能のAPIやDOMには一切依存しない「純粋関数」として実装するため、
// Vitestで単体テストできる(アーキテクチャ絶対ルール1)。実際のDOMからこの関数へ
// 渡すデータを作る処理はsrc/content/video-control.tsが担当する。

// content script側でDOMから抽出した、各video候補の情報。
// 実際のHTMLVideoElementそのものではなく単純なデータ(プレーンオブジェクト)に
// しているのは、この関数をDOM(jsdom等)無しでVitestテストできるようにするため。
export interface VideoElementInfo {
  // 画面上に表示されているか(offsetWidth/offsetHeightが0より大きいか等で判定する想定)。
  // display:noneのプレイヤーなど、非表示のvideo要素は選択対象から除外する。
  isVisible: boolean;
  // 表示されている幅・高さ(ピクセル)。面積(width * height)の比較に使う。
  width: number;
  height: number;
}

/**
 * 複数のvideo候補から、制御すべき1つのindexを選ぶ。
 *
 * ルール: 「可視 かつ 表示面積が最大」のものを選ぶ(E-4決定事項)。
 * あえて「再生中かどうか」を条件にしないのは、この拡張機能自身が pause() を
 * 呼んだ直後は対象のvideoが「一時停止中」になってしまい、再開(resume)時に
 * 同じ基準で再選択できなくなる(自分で止めた動画を見失う)問題を避けるため。
 * 可視・最大面積という基準はpause/play操作の前後で変化しないため、
 * pause時とresume時で同じ要素を安定して選び続けられる。
 *
 * @returns 選ばれたvideoのindex。可視なvideoが1つも無ければnull。
 *          面積が同点の場合はDOM順で先に現れた方(indexが小さい方)を選ぶ。
 */
export function selectPrimaryVideoIndex(
  candidates: readonly VideoElementInfo[],
): number | null {
  let bestIndex: number | null = null;
  let bestArea = -1;

  candidates.forEach((candidate, index) => {
    if (!candidate.isVisible) {
      return;
    }
    const area = candidate.width * candidate.height;
    if (area > bestArea) {
      bestArea = area;
      bestIndex = index;
    }
  });

  return bestIndex;
}
