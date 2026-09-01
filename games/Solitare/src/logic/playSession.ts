/**
 * playSession.ts — **판 도중 지급된 보상의 회수**(PO 2026-08-24).
 *
 * ## 왜 필요한가
 * 이 게임은 판이 끝나기 전에도 보상이 나간다 — 투데이 리그 단계 코인, 위클리 칸 코인·다이아,
 * 컬렉션 카드. 그런데 판을 중간에 그만두면 **게임비만 내고 보상은 챙긴** 상태가 된다.
 * 리그·위클리를 코인으로 바꿔 먹는 지름길이 열리는 셈이다.
 *
 * 그래서 판이 시작될 때 **보상 관련 저장값을 통째로 찍어 두고**(`beginPlaySession`), 중단하면
 * 그 시점으로 되돌린다(`revokePlaySession`). 정상적으로 끝나면 표식만 지운다(`endPlaySession`).
 *
 * ## 강제 종료(브라우저 종료·새로고침)
 * 표식은 **세이브에 남는다.** 다음 부팅 때 표식이 남아 있으면 "판 도중에 끊겼다"는 뜻이므로
 * 그때 회수한다(`revokeIfInterrupted`). 그래서 앱을 죽여도 빠져나갈 수 없다.
 *
 * ⚠️ **되돌리는 것은 보상뿐**이다. 게임비와 판 중에 쓴 ＋5·와일드 비용은 **돌려주지 않는다** —
 *   이미 소비한 것이고, 환불하면 이번엔 "중단해서 부스터를 무르는" 다른 구멍이 생긴다.
 */
import { loadSave, writeSave, type SaveData } from '../save.js';

/** 판 시작 시점의 보상 관련 상태 + 그 뒤 지급된 총량. */
export interface PlaySessionSnap {
  /** 이 판에서 **보상으로 지급된** 코인 총합(회수 대상). */
  coins: number;
  /** 이 판에서 보상으로 지급된 다이아 총합(회수 대상). */
  diamonds: number;
  /** 판 시작 시점의 리그 사다리/점수 — 되돌릴 목표값. */
  readonly leagueStage: SaveData['leagueStage'];
  readonly leaguePeriodId: number;
  readonly leaguePoints: number;
  /** 판 시작 시점의 주간 이벤트 사다리. */
  readonly thiefEvent: SaveData['thiefEvent'];
  /** 판 시작 시점의 컬렉션 보유(판 중 지급분 회수용). */
  readonly collection: SaveData['collection'];
}

/** 판을 시작한다 — 지금 상태를 찍어 세이브에 남긴다(강제 종료 대비). */
export function beginPlaySession(): void {
  const save = loadSave();
  const snap: PlaySessionSnap = {
    coins: 0,
    diamonds: 0,
    leagueStage: save.leagueStage,
    leaguePeriodId: save.leaguePeriodId ?? -1,
    leaguePoints: save.leaguePoints ?? 0,
    thiefEvent: save.thiefEvent,
    collection: save.collection,
  };
  writeSave({ ...save, playSession: snap });
}

/** 판 중 보상이 지급될 때마다 그 양을 적어 둔다(회수 총량). */
export function notePlayReward(coins: number, diamonds = 0): void {
  const save = loadSave();
  const s = save.playSession;
  if (!s) return; // 판 밖에서 온 보상(홈 정산 등)은 회수 대상이 아니다.
  writeSave({
    ...save,
    playSession: { ...s, coins: s.coins + Math.max(0, coins), diamonds: s.diamonds + Math.max(0, diamonds) },
  });
}

/** 판이 정상적으로 끝났다 — 표식만 지운다(보상은 그대로 유지). */
export function endPlaySession(): void {
  const save = loadSave();
  if (!save.playSession) return;
  const next = { ...save };
  delete next.playSession;
  writeSave(next);
}

/** 이 판에서 나간 보상이 있는가(경고창에 숫자를 보여 줄 때 쓴다). */
export function playSessionRewards(): { coins: number; diamonds: number } {
  const s = loadSave().playSession;
  return { coins: s?.coins ?? 0, diamonds: s?.diamonds ?? 0 };
}

/**
 * **중단 — 지급된 보상을 회수한다.** 코인·다이아를 빼고 리그·위클리·컬렉션을 판 시작 시점으로 되돌린다.
 * @returns 실제로 회수한 양(0이면 회수할 것이 없었다).
 */
export function revokePlaySession(): { coins: number; diamonds: number } {
  const save = loadSave();
  const s = save.playSession;
  if (!s) return { coins: 0, diamonds: 0 };
  const next: SaveData = {
    ...save,
    coins: Math.max(0, save.coins - s.coins),
    diamonds: Math.max(0, (save.diamonds ?? 0) - s.diamonds),
    leagueStage: s.leagueStage,
    leaguePeriodId: s.leaguePeriodId,
    leaguePoints: s.leaguePoints,
    thiefEvent: s.thiefEvent,
    collection: s.collection,
  };
  delete next.playSession;
  writeSave(next);
  return { coins: s.coins, diamonds: s.diamonds };
}

/**
 * **부팅 시 회수** — 표식이 남아 있으면 지난 판이 강제 종료된 것이다.
 * @returns 회수한 양(0이면 정상 종료였다).
 */
export function revokeIfInterrupted(): { coins: number; diamonds: number } {
  return revokePlaySession();
}
