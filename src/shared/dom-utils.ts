// このファイルの役割:
// DOM要素を取得する際の「見つからなければ即エラーにする」小さなヘルパー。
// main.ts(PoCページ)・popup.ts・offscreen.tsの3箇所で同じ形のチェックが
// 必要になったため、重複させずここに1つだけ置く。

/**
 * document.querySelector() などが返す `T | null` を受け取り、nullなら例外を投げる。
 *
 * document.querySelector() は「見つからない可能性」を型に含む(戻り値が `T | null`)。
 * 呼び出し元の関数から離れた場所で参照する際、TypeScriptは関数境界をまたいだ
 * nullチェックの絞り込みをしてくれない(constでも同様)ため、ここで一度
 * 「無ければ即エラー」というヘルパーに通し、以降は非null型の変数として扱えるようにする。
 */
export function requireNonNull<T>(value: T | null, errorMessage: string): T {
  if (value === null) {
    // 対象のHTML側の要素が見つからない = HTMLの構造が壊れている異常事態なので、
    // ここで早期に気づけるようにエラーを投げる(通常の実行パスでは起こらないはず)。
    throw new Error(errorMessage);
  }
  return value;
}
