/**
 * bonusRuntime — 보너스 게임 **판수 차감의 단일 지점**(순수 규칙 `bonusGame.ts` + 세이브 쓰기).
 *
 * ## 왜 씬의 `init()` 이 아니라 여기인가
 * 처음엔 `PlayKlondikeScene.init()` 에서 차감했다. 홈에서 들어올 땐 잘 됐지만, 결과 팝업의
 * **'한 번 더'**(같은 씬 재시작) 경로에서는 **차감이 일어나지 않았다**(실측 2026-08-29:
 * 재시작 뒤에도 used 가 1 그대로). Phaser 의 씬 재시작에서 `init` 이 언제 다시 도는지에 기대는 구조라
 * 경로마다 결과가 달랐다.
 *
 * 그래서 **"한 판을 시작한다"는 행동을 함수 하나로** 만들고, 들어가는 모든 문이 이 함수를 지나게 했다.
 *   · 홈 좌측 보너스 아이콘
 *   · 결과 팝업의 '한 번 더'
 * 씬은 이제 차감하지 않고 **남은 판수를 읽기만** 한다.
 *
 * ⚠️ 새 진입 경로를 만들면 **반드시 여기를 지나게 할 것** — 안 그러면 그 문으로는 무제한이 된다.
 */
import { loadSave, writeSave } from '../save.js';
import { bonusEntryFee, bonusPlaysLeft, canPlayBonus, consumeBonusPlay, bonusTimeLimitForWins, bonusTimeStage, bonusWinsToNextStage, toBonusTimeWins, type BonusMode } from './bonusGame.js';

/**
 * 그 모드의 타임어택 누적 승수(세이브 기준) — 제한시간 사다리의 단계를 정한다.
 * ⚠️ **모드별로 따로 센다** — 1장을 많이 이겼다고 3장이 어려워지면 안 된다.
 */
export function bonusTimeWins(mode: BonusMode): number {
  return toBonusTimeWins(loadSave().bonusTimeWins)[mode];
}

/** 그 모드의 지금 단계(0 = 시작) · 다음 단계까지 남은 승수 — 화면 안내용. */
export function bonusTimeProgress(mode: BonusMode): { readonly stage: number; readonly toNext: number } {
  const w = bonusTimeWins(mode);
  return { stage: bonusTimeStage(mode, w), toNext: bonusWinsToNextStage(mode, w) };
}

/**
 * 이번 판의 제한시간(초) — **그 모드의 누적 승수로 정해지는 사다리**(5승마다 −5초, 하한 2:30).
 *   시작값은 1장 3:30 · 3장 4:00 이고 **두 사다리는 서로 독립**이다.
 *   **`?bonusTime=90` 으로 덮어쓸 수 있다.**
 *
 * PO 2026-08-30 이 "테스트 플레이 후 적당한 시간을 정하겠다" 고 했다. 값을 정하려면 여러 값을
 * 실제로 쳐 봐야 하는데, 그때마다 빌드·배포를 돌리면 한 번 재보는 데 몇 분이 든다. URL 로 열어 두면
 * 같은 판에서 바로 다음 값을 시험할 수 있다(사다리 단계도 이걸로 건너뛰어 볼 수 있다).
 * ⚠️ 범위를 10~3600초로 접는다 — 0 이나 음수가 들어오면 시작하자마자 지는 판이 된다.
 */
export function bonusTimeLimitSec(mode: BonusMode): number {
  const base = bonusTimeLimitForWins(mode, bonusTimeWins(mode));
  if (typeof location === 'undefined') return base; // 테스트·비브라우저 환경.
  const raw = new URLSearchParams(location.search).get('bonusTime');
  const n = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(n) && n >= 10 && n <= 3600 ? Math.floor(n) : base;
}

/**
 * 타임어택 **승리 1회 기록** — 사다리를 한 칸 밀어 올린다. 새 누적 승수를 돌려준다.
 * ⚠️ 일반 모드 승리는 세지 않는다(제한시간이 없는 판은 난이도 진행과 무관하다).
 */
export function recordBonusTimeWin(mode: BonusMode): number {
  const save = loadSave();
  const wins = toBonusTimeWins(save.bonusTimeWins);
  const next = wins[mode] + 1;
  save.bonusTimeWins = { ...wins, [mode]: next };
  writeSave(save);
  return next;
}

/** 오늘 남은 **무료** 판 수(세이브 기준). */
export function bonusLeft(now: Date = new Date()): number {
  return bonusPlaysLeft(loadSave().bonusGame, now);
}

/** 이번 판의 게임비(0 = 무료 판). */
export function bonusFee(now: Date = new Date()): number {
  return bonusEntryFee(loadSave().bonusGame, now);
}

/** 지금 들어갈 수 있나 — 무료 판이 없으면 **게임비를 낼 코인이 있는지**까지 본다. */
export function canStartBonus(now: Date = new Date()): boolean {
  const save = loadSave();
  return canPlayBonus(save.bonusGame, now, save.coins);
}

/** 한 판 시작 결과 — 몇 번째였는지(무료 잔여)와 **실제로 낸 게임비**. */
export interface BonusStart {
  /** 시작한 뒤 남은 무료 판 수. */
  readonly freeLeft: number;
  /** 이번 판에 낸 코인(0 = 무료). */
  readonly paid: number;
}

/**
 * **한 판 시작** — 무료 판이 남았으면 그것을 쓰고, 없으면 **게임비를 차감**한다.
 *   코인이 모자라면 `null`(호출부가 안내해야 한다).
 *
 * ⚠️ 세는 시점은 **시작**이다 — 지고 나가도 한 판은 쓴 것으로 센다(이기면 세는 방식이면
 *   "무료 2판" 이 "무료 2승" 이 된다).
 * ⚠️ 코인 차감과 판수 세기는 **한 번의 writeSave 로 함께** 한다 — 따로 쓰면 중간에 끊겼을 때
 *   돈만 내고 판이 안 세지거나 그 반대가 된다.
 */
/**
 * **광고 보상으로 한 판 시작** — 게임비 대신 **보상형 광고 시청 완료**를 값으로 받는 경로
 * (2026-09-02, 광고 모델: "무료 재화 소진 후 광고로 1회 더"). 판수는 똑같이 센다(무제한 방지) —
 * 게임비만 0 이다. ⚠️ 반드시 **광고 어댑터가 'rewarded' 를 돌려준 뒤에만** 호출할 것.
 */
export function startBonusPlayFromAd(now: Date = new Date()): BonusStart {
  const save = loadSave();
  save.bonusGame = consumeBonusPlay(save.bonusGame, now);
  writeSave(save);
  return { freeLeft: bonusPlaysLeft(save.bonusGame, now), paid: 0 };
}

export function startBonusPlay(now: Date = new Date()): BonusStart | null {
  const save = loadSave();
  const fee = bonusEntryFee(save.bonusGame, now);
  if (save.coins < fee) return null; // 게임비를 못 낸다.
  if (fee > 0) save.coins -= fee;
  save.bonusGame = consumeBonusPlay(save.bonusGame, now);
  writeSave(save);
  return { freeLeft: bonusPlaysLeft(save.bonusGame, now), paid: fee };
}
