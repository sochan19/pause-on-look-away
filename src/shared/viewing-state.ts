// このファイルの役割:
// 1フレームごとの単発判定(head-pose.tsのisFacingCamera()の結果など)は、
// まばたきや一瞬の首振りだけで簡単にひっくり返ってしまい、そのまま動画の
// 一時停止/再開に使うと画面がちらついてしまう。
// そこで「候補状態がNフレーム連続したら初めて確定状態を切り替える」という
// ヒステリシス(履歴に基づく安定化)の状態機械を実装する(要件F-03)。
// head-pose.tsと同様、chrome拡張機能のAPIやDOM、MediaPipeには一切依存しない
// 「純粋関数」として実装し、Vitestで単体テストできるようにする(アーキテクチャ絶対ルール1)。

import { isFacingCamera } from "./head-pose";

// CandidateStateとConfirmedStateは、今のところ実体としては同じ"looking" | "away"だが、
// 「1フレームだけの生の判定結果」と「Nフレーム継続を経て確定した結果」という意味が
// 異なるため、あえて別の型名として分けている(将来どちらかにだけ状態が増えても
// 型の意味を混同しないようにするため)。

// 1フレームごとの単発判定結果(まだ確定していない「候補」)。
export type CandidateState = "looking" | "away";

// Nフレーム継続判定を経て確定した状態。実際に動画を一時停止/再開する判断は
// この値の変化にのみ基づく(候補状態が1フレーム変わっただけでは反応しない)。
export type ConfirmedState = "looking" | "away";

// ヒステリシス状態機械が保持する状態。呼び出し側(main.tsや将来のoffscreen)は
// フレームごとにこの値を受け取り、updateHysteresisState()の戻り値で置き換えていく
// (状態を直接書き換えず、新しいオブジェクトを返す不変更新にすることで、
// 「前回の状態」と「今回の状態」を混同するバグを防ぎやすくする)。
export interface HysteresisState {
  // 現在確定している状態
  confirmed: ConfirmedState;
  // 直近フレームの候補状態(継続カウントの比較に使う)
  candidate: CandidateState;
  // candidateがconfirmedと異なる状態のまま何フレーム連続しているか
  continuousCount: number;
}

/**
 * ヒステリシス状態機械の初期状態を作る。
 *
 * 初期確定状態はデフォルトで"looking"(視聴中)とする。拡張機能・PoCページが
 * 起動した直後は「これから視聴を始める」場面が普通で、いきなり「非視聴」から
 * 始まるのは不自然なため。
 */
export function createInitialHysteresisState(
  initialConfirmed: ConfirmedState = "looking",
): HysteresisState {
  return {
    confirmed: initialConfirmed,
    candidate: initialConfirmed,
    continuousCount: 0,
  };
}

/**
 * 新しい候補状態を1フレーム分受け取り、ヒステリシス状態機械を1ステップ進める。
 *
 * architecture.md 7章の擬似コードに対応:
 * - candidateがconfirmedと同じ → 継続カウントをリセット(揺れていないので数える必要がない)
 * - candidateがconfirmedと異なる → 継続カウントを増やし、requiredFrameCountに達したら確定状態を切り替える
 *
 * candidateは"looking"/"away"の2値しかないため、「confirmedと異なる」は常に同じ1つの値を
 * 指す。そのため「前フレームの候補と同じ値が連続しているか」を別途見なくても、
 * 単純に+1していくだけで「confirmedと異なる状態が何フレーム連続しているか」を正しく
 * 数えられる(確定状態が切り替わった直後に候補が揺れ戻れば、上のcandidate===confirmedの
 * 分岐でカウントが0にリセットされるため、二重にチェックする必要がない)。
 */
export function updateHysteresisState(
  state: HysteresisState,
  candidate: CandidateState,
  requiredFrameCount: number,
): HysteresisState {
  if (candidate === state.confirmed) {
    return { confirmed: state.confirmed, candidate, continuousCount: 0 };
  }

  const continuousCount = state.continuousCount + 1;

  if (continuousCount >= requiredFrameCount) {
    return { confirmed: candidate, candidate, continuousCount: 0 };
  }

  return { confirmed: state.confirmed, candidate, continuousCount };
}

/**
 * 1フレーム分の検出結果から候補状態を導く。
 *
 * 顔が検出できない場合(カメラ範囲外・遮蔽・退席など)は、Yaw角度に関わらず
 * "away"(非視聴候補)として扱う(要件F-04)。顔が検出できている場合は
 * isFacingCamera()の単発判定(1フレームだけを見て正面を向いているかどうか)に従う。
 */
export function deriveCandidateState(
  hasFace: boolean,
  yawDeg: number,
  thresholdDeg: number,
): CandidateState {
  if (!hasFace) {
    return "away";
  }
  return isFacingCamera(yawDeg, thresholdDeg) ? "looking" : "away";
}
