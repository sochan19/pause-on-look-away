import { describe, expect, it } from "vitest";
import {
  createInitialHysteresisState,
  deriveCandidateState,
  type HysteresisState,
  updateHysteresisState,
} from "./viewing-state";

// N回連続で同じcandidateをupdateHysteresisState()に流し込むテスト用ヘルパー。
// 「N-1回では切り替わらない、Nちょうどで切り替わる」という境界値テストを
// 簡潔に書けるようにするためのもの(判定ロジック自体はupdateHysteresisStateにしかない)。
function applyCandidateNTimes(
  state: HysteresisState,
  candidate: "looking" | "away",
  times: number,
  requiredFrameCount: number,
): HysteresisState {
  let current = state;
  for (let i = 0; i < times; i++) {
    current = updateHysteresisState(current, candidate, requiredFrameCount);
  }
  return current;
}

describe("createInitialHysteresisState", () => {
  it("引数なしで呼ぶとconfirmed/candidateが looking、continuousCountが0になる", () => {
    const state = createInitialHysteresisState();
    expect(state.confirmed).toBe("looking");
    expect(state.candidate).toBe("looking");
    expect(state.continuousCount).toBe(0);
  });

  it("初期確定状態を指定できる", () => {
    const state = createInitialHysteresisState("away");
    expect(state.confirmed).toBe("away");
    expect(state.candidate).toBe("away");
  });
});

describe("updateHysteresisState", () => {
  it("candidateがconfirmedと同じ間はcontinuousCountが0のまま", () => {
    const initial = createInitialHysteresisState("looking");
    const next = updateHysteresisState(initial, "looking", 5);
    expect(next.confirmed).toBe("looking");
    expect(next.continuousCount).toBe(0);
  });

  it("N-1フレーム連続では確定状態が切り替わらない(境界値)", () => {
    const initial = createInitialHysteresisState("looking");
    const requiredFrameCount = 5;
    const next = applyCandidateNTimes(
      initial,
      "away",
      requiredFrameCount - 1,
      requiredFrameCount,
    );
    expect(next.confirmed).toBe("looking");
    expect(next.continuousCount).toBe(requiredFrameCount - 1);
  });

  it("Nフレームちょうどで確定状態が切り替わる(境界値)", () => {
    const initial = createInitialHysteresisState("looking");
    const requiredFrameCount = 5;
    const next = applyCandidateNTimes(
      initial,
      "away",
      requiredFrameCount,
      requiredFrameCount,
    );
    expect(next.confirmed).toBe("away");
    expect(next.continuousCount).toBe(0);
  });

  it("away→lookingの復帰も同じロジックでNフレーム必要", () => {
    const requiredFrameCount = 3;
    const awayConfirmed = applyCandidateNTimes(
      createInitialHysteresisState("looking"),
      "away",
      requiredFrameCount,
      requiredFrameCount,
    );
    expect(awayConfirmed.confirmed).toBe("away");

    const stillAway = applyCandidateNTimes(
      awayConfirmed,
      "looking",
      requiredFrameCount - 1,
      requiredFrameCount,
    );
    expect(stillAway.confirmed).toBe("away");

    const backToLooking = updateHysteresisState(
      stillAway,
      "looking",
      requiredFrameCount,
    );
    expect(backToLooking.confirmed).toBe("looking");
  });

  it("確定後に候補が1フレームだけ揺れ戻ると連続カウントがリセットされる", () => {
    // away, away, looking(揺れ), away, away という並び。requiredFrameCount=3なら
    // 「awayが3連続」には一度もならないため、確定状態はlookingのまま変わらないはず。
    const requiredFrameCount = 3;
    let state = createInitialHysteresisState("looking");
    state = updateHysteresisState(state, "away", requiredFrameCount);
    state = updateHysteresisState(state, "away", requiredFrameCount);
    expect(state.continuousCount).toBe(2);

    state = updateHysteresisState(state, "looking", requiredFrameCount);
    expect(state.confirmed).toBe("looking");
    expect(state.continuousCount).toBe(0);

    state = updateHysteresisState(state, "away", requiredFrameCount);
    state = updateHysteresisState(state, "away", requiredFrameCount);
    expect(state.confirmed).toBe("looking");
    expect(state.continuousCount).toBe(2);
  });
});

describe("deriveCandidateState", () => {
  it("顔が検出できない場合は常にaway(Yaw角度に関わらず)", () => {
    expect(deriveCandidateState(false, 0, 20)).toBe("away");
    expect(deriveCandidateState(false, 999, 20)).toBe("away");
  });

  it("顔が検出できていてYawがしきい値以内ならlooking", () => {
    expect(deriveCandidateState(true, 10, 20)).toBe("looking");
  });

  it("顔が検出できていてもYawがしきい値を超えていればaway", () => {
    expect(deriveCandidateState(true, 30, 20)).toBe("away");
  });
});
