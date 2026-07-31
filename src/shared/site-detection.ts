// このファイルの役割:
// URLのホスト名(location.hostname)から「YouTubeなのかPrime Videoなのか」を
// 判定する純粋関数を提供する。DOM操作やchrome.*には依存しないため
// (アーキテクチャ絶対ルール1)、Vitestで単体テストできる。
// Phase 3時点ではcontent scriptの起動ログでの表示にしか使わないが、
// Phase 4でサイトごとにvideo要素の特定・pause/play制御を出し分ける際の土台になる。

// 対象サイトを表す型。まだ判定できていない/対象外のサイトは "unknown" とする。
export type Site = "youtube" | "primevideo" | "unknown";

// "example.com" のような部分一致だけで判定すると "notyoutube.com" のような
// 無関係なドメインも誤って一致してしまう。「ドメイン自体が一致」または
// 「そのドメインのサブドメインである(前に'.'が付く)」場合のみ一致とみなす。
function isDomainOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function identifySite(hostname: string): Site {
  // location.hostnameは通常ブラウザによって小文字化されているが、
  // この関数は純粋関数として「どんな入力が来ても正しく動く」ことを
  // 保証しておきたいため、念のため小文字化してから比較する。
  const normalizedHostname = hostname.toLowerCase();

  if (isDomainOrSubdomain(normalizedHostname, "youtube.com")) {
    return "youtube";
  }
  if (
    isDomainOrSubdomain(normalizedHostname, "primevideo.com") ||
    isDomainOrSubdomain(normalizedHostname, "amazon.co.jp")
  ) {
    return "primevideo";
  }
  return "unknown";
}
