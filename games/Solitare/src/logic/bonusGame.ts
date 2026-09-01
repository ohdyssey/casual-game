/**
 * bonusGame — **보너스 게임(홈 좌측 아이콘)** 의 순수 규칙: 하루 몇 판 남았나 · 이기면 얼마 받나.
 *
 * ## 무엇이 바뀌었나 (2026-08-29)
 * 예전에는 **10레벨을 깰 때마다** 보너스 라운드가 끼어들었고 화면에 `10-1` 로 표시됐다. 그 방식은
 * 두 가지가 걸렸다 — ① 메인 진행에 끼어들어 흐름을 끊고 ② 레벨 번호 체계(`10-1`)가 한 겹 늘었다.
 * 이제는 **홈에서 언제든 눌러 들어가는 독립 보너스 게임**이고, 이기면 코인을 받는다.
 * 대신 무한 파밍이 되지 않게 **하루 판수를 제한**한다.
 *
 * ## 왜 이 파일이 따로 있나
 * "몇 판 남았나"는 홈 아이콘 배지·보너스 씬 진입 가드·결과 팝업이 **모두 같은 답**을 내야 한다.
 * 세 곳에서 각자 세면 반드시 어긋나므로(예: 아이콘은 2회 남았다는데 들어가면 막힌다) 여기 한 곳에 둔다.
 * Phaser 비의존 순수 모듈이라 테스트로 고정한다.
 */
import { periodIdFor } from './league.js';

/** 하루에 **무료로** 도전할 수 있는 판 수(PO 2026-08-29 "이 기회는 하루에 2회로 제한"). */
export const BONUS_PLAYS_PER_DAY = 2;

/**
 * 무료 판을 다 쓴 뒤의 **게임비**(PO 2026-08-29 "2회 이상 하루에 플레이 할 경우 2천코인의 게임비").
 *   ⚠️ 하루 2판은 이제 "그 이상 못 한다"가 아니라 **"그 이상은 유료"** 다 — 막지 않는다.
 */
export const BONUS_PAID_FEE = 2_000;

/**
 * **보너스 게임 모드** — 스톡을 한 장씩 뒤집느냐 세 장씩 뒤집느냐(PO 2026-08-29
 *   "한장씩 뒤집는 게임과 3장씩 뒤집는 게임의 룰을 적용").
 *
 * 3장 뽑기는 웨이스트 맨 위만 쓸 수 있어 **훨씬 어렵다** — 그래서 보상이 두 배다.
 * ⚠️ 게임비와 하루 무료 판수는 **두 모드가 함께 쓴다**(모드마다 따로 주지 않는다) —
 *   어려운 쪽을 골랐다고 판을 더 받는 구조가 아니다.
 */
export type BonusMode = 'draw1' | 'draw3';

/** 모드 → 스톡에서 한 번에 뒤집는 장수. */
export const BONUS_DRAW_COUNT: Readonly<Record<BonusMode, 1 | 3>> = { draw1: 1, draw3: 3 };

/**
 * ## 승리 보상표 (PO 2026-08-30 개정)
 *
 * | | 일반 | 타임어택 |
 * |---|---|---|
 * | 1장 뽑기 | 3,000 | 5,000 |
 * | 3장 뽑기 | 5,000 | 7,000 |
 *
 * ⚠️ **배수가 아니라 표다.** 예전에는 타임어택을 일반의 ×3 으로 계산했는데, 개정값은 배수로 떨어지지
 *   않는다(3,000→5,000 은 ×1.67 · 5,000→7,000 은 ×1.4). 배수 상수를 되살리지 말 것.
 * ⚠️ 진 판의 게임비는 **돌려주지 않는다**(PO "실패는 게임비 회수") — 차감은 시작 시점이고 결과와 무관하다.
 * ⚠️ 게임비 2,000 대비 1장 일반의 순이익은 +1,000 뿐이다 — **유료 판은 승률이 50% 를 넘어야 본전**이다.
 *   보상을 만질 땐 `BONUS_PAID_FEE` 와 함께 볼 것.
 */
export const BONUS_WIN_COINS: Readonly<Record<BonusMode, { readonly normal: number; readonly timed: number }>> = {
  draw1: { normal: 3_000, timed: 5_000 },
  draw3: { normal: 5_000, timed: 7_000 },
};

/*
 * **타임어택** — 같은 규칙에 제한시간만 얹은 변형(PO 2026-08-30). 보상은 위 표의 `timed` 열.
 *
 * 왜 별도의 모드 축인가: 뽑기 장수(1장/3장)는 *규칙*을 바꾸고 제한시간은 *압박*을 바꾼다 — 성격이
 * 달라서 곱집합(2×2 = 4가지)이 자연스럽다. 그래서 하나의 4값 열거형으로 합치지 않고 축을 둘로 둔다.
 * ⚠️ 게임비·하루 무료 판수는 **네 조합이 함께 쓴다** — 어려운 쪽을 골랐다고 판을 더 주지 않는다
 *   (1장/3장에서 이미 정한 원칙과 같다).
 */

/**
 * ## 제한시간 사다리 (PO 2026-08-30)
 *
 * "**5회 성공마다 5초씩** 줄이고, 최상 난이도는 **2분 30초**".
 * 시작값은 모드별로 다르다 — **1장 3:30 · 3장 4:00**(3장은 웨이스트 맨 위만 쓸 수 있어 손이 더 간다).
 *
 * 왜 고정값이 아닌가: 같은 4분이라도 처음 잡는 사람에게는 빠듯하고 익숙해지면 헐겁다. 승수에
 * 따라 조여 주면 **실력이 는 만큼 압박도 는다** — 난이도를 고르게 하지 않고 따라오게 한다.
 *
 * 최상 난이도까지: **1장 210→150 = 12단계 = 60승** · **3장 240→150 = 18단계 = 90승**.
 *
 * ⚠️ **사다리는 모드마다 따로 움직인다**(PO 2026-08-30 "1장 타임어택과 3장 타임어택은 다른 시간대를
 *   사용하고 줄어드는 것도 별개로"). 그래서 **승수 카운터도 모드별**이다(`BonusTimeWins`) —
 *   한쪽을 많이 이겼다고 다른 쪽이 어려워지면 안 된다.
 * ⚠️ 승수는 **날짜로 리셋되지 않는다**(`save.bonusTimeWins`) — 진행도지 일일 사용량이 아니다.
 */
export const BONUS_TIME_START_SEC: Readonly<Record<BonusMode, number>> = { draw1: 210, draw3: 240 };
export const BONUS_TIME_MIN_SEC = 150;
export const BONUS_TIME_STEP_SEC = 5;
export const BONUS_TIME_WINS_PER_STEP = 5;

/** 모드별 누적 승수 — 사다리가 **따로** 움직인다. */
export type BonusTimeWins = Readonly<Record<BonusMode, number>>;

/** 빈 기록. */
export const EMPTY_BONUS_TIME_WINS: BonusTimeWins = { draw1: 0, draw3: 0 };

/**
 * 세이브에서 온 값을 모드별 기록으로 접는다.
 * ⚠️ **옛 형식(숫자 하나)** 도 받는다 — 사다리가 모드 공용이던 시절의 값이다(2026-08-30 당일 개정).
 *   그 값은 **두 모드에 그대로 얹는다**: 버리면 플레이어가 실제로 쌓은 진행이 사라지고, 한쪽에만
 *   얹으면 어느 쪽을 고를지가 자의적이다. 값이 작을 때(기능이 하루짜리) 안전한 선택이다.
 */
export function toBonusTimeWins(v: unknown): BonusTimeWins {
  const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0);
  if (typeof v === 'number') {
    const n = num(v);
    return { draw1: n, draw3: n };
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return { draw1: num(o.draw1), draw3: num(o.draw3) };
  }
  return EMPTY_BONUS_TIME_WINS;
}

/** 그 모드의 누적 승수 → 지금 단계(0 = 시작). 최상 단계에서 멈춘다. */
export function bonusTimeStage(mode: BonusMode, wins: number): number {
  const max = (BONUS_TIME_START_SEC[mode] - BONUS_TIME_MIN_SEC) / BONUS_TIME_STEP_SEC;
  const w = Number.isFinite(wins) ? Math.max(0, Math.floor(wins)) : 0;
  return Math.min(max, Math.floor(w / BONUS_TIME_WINS_PER_STEP));
}

/** 그 모드의 누적 승수 → 이번 판의 제한시간(초). 하한 `BONUS_TIME_MIN_SEC` 아래로 내려가지 않는다. */
export function bonusTimeLimitForWins(mode: BonusMode, wins: number): number {
  return Math.max(BONUS_TIME_MIN_SEC, BONUS_TIME_START_SEC[mode] - bonusTimeStage(mode, wins) * BONUS_TIME_STEP_SEC);
}

/** 그 모드에서 다음 단계까지 남은 승수(0 이면 이미 최상 단계). */
export function bonusWinsToNextStage(mode: BonusMode, wins: number): number {
  if (bonusTimeLimitForWins(mode, wins) <= BONUS_TIME_MIN_SEC) return 0;
  const w = Math.max(0, Math.floor(wins));
  return BONUS_TIME_WINS_PER_STEP - (w % BONUS_TIME_WINS_PER_STEP);
}

/** 타임어택 여부 방어 — URL·씬 데이터 등 밖에서 온 값이 깨지면 **일반 모드**로 접는다(기본이 일반). */
export function toBonusTimed(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1';
}

/**
 * 이번 판의 승리 보상 — 타임어택이면 3배.
 * ⚠️ 보상을 읽는 곳이 셋이다(홈 선택 팝업 · 진입 안내 · 승리 처리). **여기 한 함수만** 쓸 것 —
 *   따로 곱하면 화면에 보여 준 액수와 실제 지급이 어긋난다.
 */
export function bonusWinCoins(mode: BonusMode, timed: boolean): number {
  return BONUS_WIN_COINS[mode][timed ? 'timed' : 'normal'];
}

/**
 * ## 보드 다이아 배치율 (PO 2026-08-30)
 *
 * 보너스 라운드에도 보드 다이아를 둔다. 배치 **개수**는 항상 1개이고, 모드에 따라 **몇 판에 한 번**
 * 나오는지가 달라진다.
 *
 * | | 일반 | 타임어택 |
 * |---|---|---|
 * | 1장 뽑기 | 3판당 1개 (0.333) | 2판당 1개 (0.5) |
 * | 3장 뽑기 | 2판당 1개 (0.5)   | 1판당 1개 (1.0) |
 *
 * ⚠️ 이 사다리는 **승리 보상표(BONUS_WIN_COINS)와 같은 순서**다 — 3,000 < 5,000 = 5,000 < 7,000 이
 *   0.333 < 0.5 = 0.5 < 1.0 과 정확히 대응한다. 한쪽만 고치면 "어려운 판이 덜 준다"가 생기므로
 *   **두 표를 함께** 움직일 것.
 * ⚠️ 값은 **확률**이다(1.0 이면 항상 배치). 판마다 굴리므로 장기 평균이 위 주기와 같다.
 */
export const BONUS_BOARD_DIAMOND_RATE: Readonly<Record<BonusMode, { readonly normal: number; readonly timed: number }>> = {
  draw1: { normal: 1 / 3, timed: 1 / 2 },
  draw3: { normal: 1 / 2, timed: 1 },
};

/** 이 판에 보드 다이아를 배치할 확률(0~1) — 표를 그대로 읽는다. */
export function bonusBoardDiamondRate(mode: BonusMode, timed: boolean): number {
  return BONUS_BOARD_DIAMOND_RATE[mode][timed ? 'timed' : 'normal'];
}

/** 이 판에 보드 다이아를 놓을지 판정 — `rng` 는 0~1 난수(테스트에서 고정값 주입 가능). */
export function rollBonusBoardDiamond(mode: BonusMode, timed: boolean, rng: () => number): boolean {
  const p = bonusBoardDiamondRate(mode, timed);
  return p >= 1 ? true : rng() < p;
}

/** 기본 모드(한 장씩) — 인자 없이 들어온 경로가 어려운 판을 만나지 않게. */
export const BONUS_DEFAULT_MODE: BonusMode = 'draw1';

/** 모드 문자열 방어 — 저장·URL 등 밖에서 온 값이 깨져도 기본 모드로 접는다. */
export function toBonusMode(v: unknown): BonusMode {
  return v === 'draw3' ? 'draw3' : BONUS_DEFAULT_MODE;
}

/** 세이브에 남는 일일 사용 기록 — `day` 가 오늘이 아니면 `used` 는 무시된다(자동 리셋). */
export interface BonusGameUse {
  /** 로컬 자정 기준 일자 id(`periodIdFor`). */
  readonly day: number;
  /** 그 날 **시작한** 판 수. */
  readonly used: number;
}

/**
 * 오늘 남은 판 수. 기록이 없거나 어제 것이면 가득 찬 값이다.
 * ⚠️ **날짜가 바뀌면 자동으로 회복된다** — 별도 리셋 처리가 필요 없다(기록의 `day` 만 비교).
 */
export function bonusPlaysLeft(use: BonusGameUse | undefined, now: Date): number {
  const today = periodIdFor(now);
  if (!use || use.day !== today) return BONUS_PLAYS_PER_DAY;
  return Math.max(0, BONUS_PLAYS_PER_DAY - Math.max(0, Math.floor(use.used)));
}

/**
 * 이번 판의 **게임비** — 무료 판이 남았으면 0, 아니면 `BONUS_PAID_FEE`.
 * 화면(홈 아이콘 배지·결과 팝업 버튼)과 실제 차감이 **같은 답**을 써야 하므로 여기 한 곳에서만 정한다.
 */
export function bonusEntryFee(use: BonusGameUse | undefined, now: Date): number {
  return bonusPlaysLeft(use, now) > 0 ? 0 : BONUS_PAID_FEE;
}

/**
 * 지금 들어갈 수 있나 — **코인까지 본다**. 무료 판이 남았으면 항상 true, 아니면 게임비를 낼 수 있어야 한다.
 * ⚠️ 예전엔 무료 판이 없으면 무조건 false 였다(하루 2회 하드 제한). 지금은 유료로 계속할 수 있다.
 */
export function canPlayBonus(use: BonusGameUse | undefined, now: Date, coins = Infinity): boolean {
  return coins >= bonusEntryFee(use, now);
}

/**
 * 판을 **시작할 때** 1회 센 새 기록을 돌려준다(원본은 그대로 — 불변).
 *
 * ⚠️ 세는 시점은 **시작**이지 승리가 아니다. 이기면 세는 방식이면 질 때마다 무한 재도전이 되어
 *   "무료 2판" 이 사실상 "무료 2승" 이 된다. 지고 나가도 한 판은 쓴 것으로 센다.
 * ⚠️ **상한을 두지 않는다** — 무료 2판을 넘겨도 계속 세야 유료 판이 몇 번째인지 알 수 있다.
 *   (예전엔 2에서 멈췄다 — 하루 2회가 하드 제한이던 시절의 잔재.)
 */
export function consumeBonusPlay(use: BonusGameUse | undefined, now: Date): BonusGameUse {
  const today = periodIdFor(now);
  const used = !use || use.day !== today ? 0 : Math.max(0, Math.floor(use.used));
  return { day: today, used: used + 1 };
}
