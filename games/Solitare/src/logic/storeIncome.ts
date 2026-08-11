/**
 * storeIncome.ts — **점포 수익 통합 수금**(순수·Phaser-free).
 *
 * PO 2026-07-28: "각 점포가 수익을 수집하는 기능을 3층이 건설된 후 통합적으로 수거한다. 시간은 10분 단위로
 *   수거한다. 기존 점포단위 수금도 10분 단위로 수정하라. 층이 여러 층일 경우 개별 수금이 어려우므로 여기에
 *   모아서 수금한다. 수금이 이루어지지 않으면 누적이 멈춘다."
 *
 * 규칙 3가지:
 *   ① **시간 기반** — 손님 방문이 아니라 경과 시간으로 쌓인다(10분 = 한 주기).
 *   ② **통합** — 건설 층수가 `INTEGRATED_FROM_FLOORS` 이상이면 층별로 받지 않고 한 곳에서 전부 받는다.
 *   ③ **미수금 시 정지** — 한 주기분(=전 층 합계)까지만 쌓이고 **더 늘지 않는다**. 받아야 다시 돈다.
 *      → 방치해도 무한히 불어나지 않는다(방치 수익 상한과 같은 의도).
 */
import { type EconParams, claimGoalFor } from './economy.js';

/**
 * **수금 주기 — 층이 늘수록 길어진다**(PO 2026-07-30 "층수가 늘어날수록 시간도 늘리고 한번에 회수하는
 *   수량도 늘려갑니다").
 *
 *   `주기(층) = 10분 + 2분 × (층 − 1)`, 상한 4시간.
 *   1층 10분 · 3층 14분 · 10층 28분 · 30층 68분 · 100층 3시간28분(상한 전).
 *
 *   ⚠️ **회수량은 이미 층에 비례한다** — 상한(cap)이 `incomePerPeriod`(층별 claimGoalFor 합계)이라
 *      층이 늘면 자동으로 커진다. 여기서 주기까지 늘리는 이유는 **탭 빈도를 낮추기 위해서**다:
 *      주기만 고정해 두면 100층에서도 10분마다 수령해야 해 조작 부담이 층수에 비례해 커진다.
 *      주기는 층에 **선형**, 회수량은 층에 **2차**(층가중 합)로 늘어나므로 **시간당 수입은 여전히 증가**한다
 *      (실측: 1층 600/h · 10층 3,947/h · 30층 15,128/h — 게임비 곡선 반영).
 */
export const INCOME_PERIOD_BASE_MS = 10 * 60 * 1000;
export const INCOME_PERIOD_STEP_MS = 2 * 60 * 1000;
export const INCOME_PERIOD_MAX_MS = 4 * 60 * 60 * 1000;

/** 이 층수에서의 수금 주기(ms) — 층 0·1 은 기본값, 이후 층당 +STEP, 상한에서 고정. */
export function periodFor(builtFloors: number): number {
  const f = Math.max(1, Math.floor(builtFloors));
  return Math.min(INCOME_PERIOD_MAX_MS, INCOME_PERIOD_BASE_MS + INCOME_PERIOD_STEP_MS * (f - 1));
}

/** 통합 수금이 열리는 건설 층수 — 이 층수부터 층별 말풍선 대신 **한 곳에 모아** 받는다. */
export const INTEGRATED_FROM_FLOORS = 3;

/** 통합 수금 화면을 쓰는가(층이 많아 개별 수금이 번거로운 구간). */
export function usesIntegratedClaim(builtFloors: number): boolean {
  return Math.floor(builtFloors) >= INTEGRATED_FROM_FLOORS;
}

/**
 * **한 주기(10분)에 쌓이는 코인** — 건설된 층 전체의 합.
 *   층별 금액은 기존 경제 모델(`claimGoalFor`: 게임비 × 단위배수 × 층가중)을 그대로 쓴다 —
 *   새 숫자를 만들지 않고 이미 튜닝된 값을 재사용해야 경제가 어긋나지 않는다.
 */
export function incomePerPeriod(econ: EconParams, fee: number, builtFloors: number): number {
  const floors = Math.max(0, Math.floor(builtFloors));
  let sum = 0;
  for (let f = 1; f <= floors; f++) sum += claimGoalFor(econ, fee, f);
  return sum;
}

/**
 * **손님이 떨어뜨린 코인을 수금함에 담는다** — 상한(`cap` = 한 주기분)을 넘지 않는다.
 *   PO 2026-07-28: "손님이 동전이 떨어지면서 수령점으로 조금씩 빨아들이도록" — 수익은 시간이 아니라
 *   **손님 방문 때마다 조금씩** 들어오고, 그때마다 그 점포에서 수금함으로 코인이 날아간다.
 *   ⚠️ 상한에 닿으면 **더 담기지 않는다**(③ 미수금 시 누적 정지) → 받아야 다시 쌓인다.
 *   반환: `{ bank: 새 잔액, added: 실제로 담긴 양 }`. `added` 가 0 이면 가득 차서 연출도 생략하면 된다.
 */
export function addToBank(bank: number, coins: number, cap: number): { bank: number; added: number } {
  const cur = Math.max(0, Math.floor(bank));
  const limit = Math.max(0, Math.floor(cap));
  const inc = Math.max(0, Math.floor(coins));
  const next = Math.min(limit, cur + inc);
  return { bank: next, added: next - cur };
}

/**
 * **경과 시간만큼 수금함에 적립**(PO 2026-07-29 "게임에 접속하든 안 하든, 플레이 중이든 타워 화면이든 수집").
 *
 *   수익의 **유일한 근거는 시간**이다 — 손님 방문이나 화면 상태와 무관하게 쌓인다. 그래서 앱을 껐다 켜도,
 *   다른 화면에서 게임을 하고 있어도 그동안의 몫이 그대로 들어온다(오프라인 적립).
 *   ⚠️ 상한(`cap` = 한 주기분)에서 멈춘다 — 받아야 다시 쌓인다(미수금 시 누적 정지).
 *
 *   `lastAt` 은 **소비한 시간만큼만** 앞으로 당긴다(now 로 덮지 않는다) — 그래야 1초 단위로 자주 호출해도
 *   나머지(아직 1코인이 안 되는 시간)가 버려지지 않는다. 가득 찬 뒤에는 now 로 맞춰 시간이 새지 않게 한다.
 */
export function accrueByTime(
  bank: number,
  lastAt: number,
  now: number,
  cap: number,
  period: number = INCOME_PERIOD_BASE_MS,
): { bank: number; lastAt: number } {
  const cur = Math.max(0, Math.floor(bank));
  const limit = Math.max(0, Math.floor(cap));
  const elapsed = now - lastAt;
  if (limit <= 0) return { bank: 0, lastAt: now }; // 건설 층이 없으면 쌓이지 않는다.
  if (!Number.isFinite(elapsed) || elapsed <= 0) return { bank: cur, lastAt }; // 시계 역행 방어.
  if (cur >= limit) return { bank: limit, lastAt: now }; // 이미 가득 — 시간만 흘려보낸다.
  const span = Math.max(1, Math.floor(period));
  const gain = Math.floor((limit * elapsed) / span);
  if (gain <= 0) return { bank: cur, lastAt }; // 아직 1코인도 안 됐다 — 나머지를 보존한다.
  const next = Math.min(limit, cur + gain);
  const consumed = (gain * span) / limit; // 실제로 적립된 만큼만 시간을 당긴다.
  return { bank: next, lastAt: next >= limit ? now : lastAt + consumed };
}

/**
 * **판 하나를 클리어했을 때의 매출**(PO 2026-07-29 "솔리테어를 플레이한다 = **장사**를 한다").
 *
 *   그냥 접속만 해 두는 것(시간 적립)보다 **플레이할 때 더 벌어야** 한다. 그래서 레벨을 깰 때마다
 *   한 주기분(`cap`)의 일정 비율을 수금함에 얹는다 — 방치 10분치를 3★ 한 판이 대체하는 셈.
 *   별 등급에 비례해 **잘 풀수록 더 번다**(3★ = 기준치, 1★ = 1/3, 5★ = 5/3).
 *   ⚠️ 상한은 그대로 적용된다(`addToBank`) — 아무리 많이 플레이해도 받지 않으면 한 주기분에서 멈춘다.
 */
export const PLAY_CLEAR_RATIO = 0.35;

export function playIncomeFor(cap: number, stars: number): number {
  const limit = Math.max(0, Math.floor(cap));
  const st = Math.max(0, Math.floor(stars));
  if (limit <= 0 || st <= 0) return 0;
  return Math.floor((limit * PLAY_CLEAR_RATIO * st) / 3);
}

/** 수금함이 가득 찼는가(더 담기지 않는 상태) — 배지에 '가득' 표시로 수령을 유도한다. */
export function isBankFull(bank: number, cap: number): boolean {
  return cap > 0 && Math.floor(bank) >= Math.floor(cap);
}

/**
 * 가득 찰 때까지 남은 ms(0 = 이미 가득 = 수금 가능) — **수금함 잔액에서 역산**한다.
 *
 * 🐞 2026-07-29 수정(PO "가득인데 회수가 안 된다"): 예전엔 `lastAt` 의 나이(`now - lastAt`)로 계산했는데,
 *    `accrueByTime` 은 **가득 찬 뒤 매 틱 `lastAt` 을 now 로 밀어** 시간이 새지 않게 한다. 그래서 배지가
 *    1초마다 갱신되는 동안 `now - lastAt` 이 영원히 0 근처에 머물러 **10분이 절대 채워지지 않았고**,
 *    수금함이 가득 차 있어도 `canClaim` 이 계속 false 였다(영구 잠금).
 *    잔액 기준으로 바꾸면 두 함수가 같은 사실("얼마나 찼나") 하나만 보므로 모순이 생길 수 없다.
 */
export function msUntilFull(bank: number, cap: number, period: number = INCOME_PERIOD_BASE_MS): number {
  const limit = Math.max(0, Math.floor(cap));
  const span = Math.max(1, Math.floor(period));
  if (limit <= 0) return span; // 건설 층이 없으면 채워지지 않는다.
  const remain = Math.max(0, limit - Math.max(0, Math.floor(bank)));
  return Math.ceil((remain * span) / limit);
}

/** 수금 가능한가 — **가득 찼을 때만** 받게 한다(찔끔 수금 방지). 잔액 기준이라 타이머와 어긋나지 않는다. */
export function canClaim(bank: number, cap: number): boolean {
  return isBankFull(bank, cap);
}

/**
 * **수금함 용량 업그레이드**(PO 2026-07-29 "이 회수 아이콘은 더 많은 코인을 회수할 수 있는 업그레이드가
 *   가능하도록 이후에 기능을 추가할 예정") — 지금은 **배선만** 열어 둔다(UI·구매 없음, 항상 레벨 0).
 *
 *   용량이 곧 **한 주기 수입**이다(`accrueByTime` 이 `cap` 을 10분에 채우므로) — 레벨을 올리면 상한과
 *   시간당 수입이 함께 오른다. 그래서 업그레이드 하나로 "더 많이 담고 더 빨리 번다"가 동시에 성립한다.
 *   레벨당 +25%(선형) — 곱셈 폭주를 피해 100층까지 완만하게 오르도록 잡은 초안이다.
 */
export const CLAIM_UPGRADE_STEP = 0.25;

export function capacityFor(basePerPeriod: number, upgradeLevel = 0): number {
  const base = Math.max(0, Math.floor(basePerPeriod));
  const lv = Math.max(0, Math.floor(upgradeLevel));
  return Math.floor(base * (1 + CLAIM_UPGRADE_STEP * lv));
}

/**
 * 배지 타이머 표기 — 1시간 미만은 `MM:SS`, 그 이상은 `H:MM:SS`.
 *   주기가 층에 따라 최대 4시간까지 늘어나므로(`periodFor`) 시 단위가 필요하다.
 *   예전 `MM:SS` 고정 표기는 68분을 "68:00" 으로 보여 초처럼 읽혔다.
 */
export function formatIncomeTimer(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
