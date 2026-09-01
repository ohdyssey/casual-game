/**
 * economyRules.ts — **판 안 경제 규칙의 단일 출처**(순수, Phaser-free).
 *
 * PO 2026-08-23: "단순한 예측이 아닌, 실제 게임과 똑같은 테스트로 나온 실데이터 기반으로."
 * 지금까지 튜닝 시뮬레이터(scripts/play-sim.mts)는 PlayScene 의 규칙(보너스 패턴·미션 보상표·
 * 뽑기 넉넉 판정)을 **베껴서** 들고 있었고, 그 사본이 어긋날 때마다 예측이 실제와 틀렸다
 * (와일드 누락 → 보너스 누락 → 미션 틱 누락 — 전부 같은 사고).
 *
 * 그래서 규칙을 여기로 승격한다 — **PlayScene 과 시뮬레이터가 같은 모듈을 import** 하면
 * 어긋남이 구조적으로 불가능해진다. 여기 있는 값을 바꾸면 게임과 튜너가 함께 바뀐다.
 */
import { seededRng } from './deck.js';
import type { PeakLayout } from './layouts.js';

// ── 레벨 경계(난이도 구간) ────────────────────────────────────────────
/**
 * 종반 구제(막힘 보정·잔량 압박)를 켜 두는 마지막 레벨.
 *
 * **2026-08-25 전 레벨 확대(Infinity)** — PO 승인 "부족하게 주고, 뒤처지면 밀어준다". 11레벨부터 구제를 껐더니
 *   (2026-08-23) 뽑기 결말의 분산이 양쪽으로 터졌다: 실측(레벨 1~100 표본, play-sim) 승리 잔여 p90 **10장** ·
 *   패배 부족 p90 **15장** — "아슬아슬함"이 사라진 원인. 구제는 **도와주는 방향만** 있어 반감이 없고(니어미스
 *   0.41→0.09/판), 잔여는 레벨별 뽑기를 **부족하게 재산출**(scripts/tune-pace.mts)해 구조적으로 없앤다.
 *   두 가지는 세트다 — 구제 없이 부족하게 주면 부족 꼬리가 폭발하고(7월 0.30 계수 사고), 구제만 켜고
 *   넉넉히 주면 잔여가 남는다.
 */
export const RESCUE_MAX_LEVEL = Number.POSITIVE_INFINITY;
/**
 * ＋5 구매 카드를 "반드시 이어지게" 주는 마지막 레벨.
 * 2026-08-23 PO 승인으로 **전 레벨 확대**(Infinity) — 완전 랜덤 뽑기(21+)의 운 변동폭 때문에
 * "잔여≤2 · 구매≤3"을 동시에 만족하는 뽑기 장수가 존재하지 않았다(실측 스윕). 시작 뽑기 더미는
 * 여전히 완전 랜덤이고, **돈 주고 산 카드만** 쓸모가 보장된다.
 */
export const PLUS5_CURATED_MAX_LEVEL = Number.POSITIVE_INFINITY;

/**
 * **＋5 구매 회차별 매칭 보조 확률**(PO 2026-08-25: "1차 랜덤 · 2차 30% 보조 · 3차 이상 50%").
 *   첫 구매는 순수 랜덤(공정성 학습), 살수록 더 도와줘 추가 구매의 체감 가치를 높인다 —
 *   구 plus5Curated(레벨 기준 전량 보정)를 **회차 기준**으로 대체한다.
 */
export const PLUS5_ASSIST_BY_BUY: readonly number[] = [0, 0.3, 0.5];

/** 그 판 n번째(1-base) ＋5 구매의 보조 확률. */
export function plus5AssistFor(buyNumber: number): number {
  const i = Math.max(1, Math.floor(buyNumber)) - 1;
  return PLUS5_ASSIST_BY_BUY[Math.min(i, PLUS5_ASSIST_BY_BUY.length - 1)] ?? 0;
}

// ── 보너스 +N 보드 카드 ──────────────────────────────────────────────
/** 초반 보너스 상한 — 10레벨까지는 +1/+2 만(재설계 2026-08-23: +5 가 그대로 승리 잔여로 남았다). */
export const EARLY_BONUS_MAX_LEVEL = 10;
export const EARLY_BONUS_CAP = 2;

/**
 * 보너스 값 **역빈도(∝ 1/N) 정확 할당 패턴** — +1×30 · +2×15 · +3×10 · +5×6 을 고정 시드로
 * 결정적 셔플. 레벨→패턴 인덱스 고정이라 모든 클라·시뮬에서 동일하다.
 */
export const BONUS_PATTERN: readonly number[] = (() => {
  const counts: ReadonlyArray<readonly [number, number]> = [[1, 30], [2, 15], [3, 10], [5, 6]];
  const arr: number[] = [];
  for (const [v, c] of counts) for (let i = 0; i < c; i++) arr.push(v);
  const rng = seededRng(424242);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
})();

/** 이 레벨의 보너스 +N 값(초반 상한 반영). */
export function bonusValueForLevel(level: number): number {
  const raw = BONUS_PATTERN[(level - 1) % BONUS_PATTERN.length];
  return level <= EARLY_BONUS_MAX_LEVEL ? Math.min(raw, EARLY_BONUS_CAP) : raw;
}

// ── 미션(연속 5매칭) 보상 ────────────────────────────────────────────
/** 미션 틱 = 연속 N매칭(콤보가 끊기면 리셋). */
export const MISSION_SET_SIZE = 5;

/**
 * 미션(5매치) 완성 보상의 종류.
 *
 * ⚠️ `coins` 는 **`stars` 로 대체됐다**(PO 2026-08-24). 미션 보상으로 골드를 주면 그 골드가 어디서
 *   왔는지 화면에 남지 않고 사라진다. 대신 **투데이 리그 별**을 준다 — 보드에 꽂혔다가 그 카드를 낼 때
 *   회수되고, 곧바로 리그 게이지로 들어가 "무엇을 왜 모으는지"가 한 화면에서 이어진다.
 *   ⚠️ 이 별은 **그 판의 등급(1★~5★) 판정에는 들어가지 않는다** — 리그 점수 전용이다.
 */
export type MissionRewardKind = 'stars' | 'cards' | 'plus5' | 'wild' | 'undo' | 'diamond' | 'collection';

/** 미션 보상으로 나오는 리그 별 개수 범위(랜덤, PO 2026-08-24). */
export const MISSION_STARS_MIN = 1;
export const MISSION_STARS_MAX = 10;
/**
 * 보상표(가중 추첨) — amount 는 종류별 의미(스톡 추가 장수 / 지급 개수). 아이콘·연출은 씬이 소유.
 *
 * ⚠️ **이 표가 곧 실제 출현 비율이다**(PO 2026-08-24: "정해진 확률대로 나타나야 한다").
 *   추첨 결과의 **종류를 바꾸는 보정은 금지**한다 — 예전에는 뽑기가 넉넉하면 cards/plus5/wild 를
 *   통째로 stars 로 치환했는데, 그 조건(`stockIsAmple`)이 거의 항상 참이라 표의 절반(가중 50)이
 *   증발했다(실측: 뽑기 계열 44.5% 설계 → 2.9% 출현, stars 34.8% → 76.2%).
 *   공급 조절은 **종류가 아니라 장수**로 한다 → `missionStockAmount`.
 *
 * ⚠️ **부스터 3종은 모두 여기 있어야 한다**(PO 2026-08-24). 예전에는 되돌리기(리와인드)만 표에 없었는데,
 *   plus5 의 예고 아이콘이 하필 리와인드 그림(up_Solitare_UI_07)이라 화면에는 리와인드가 뜨고 실제로는
 *   뽑기 +3장이 나왔다 — 표에 없는 보상이 표시되고 표시된 보상은 안 나오는 상태였다.
 *
 * collection 가중치는 레벨에 따라 34(레벨1) → 14(레벨20+)로 바뀐다(`collectionWeightForLevel`).
 *   여기 적힌 값은 그 하한(=레벨20+)이며, 추첨할 때 레벨값으로 교체된다.
 */
export const MISSION_REWARD_TABLE: readonly { kind: MissionRewardKind; weight: number; amount: number }[] = [
  { kind: 'stars', weight: 42, amount: 0 }, // amount 는 뽑을 때 1~10 랜덤으로 채운다. (38 + 되돌리기에서 옮긴 4)
  { kind: 'cards', weight: 42, amount: 2 }, // 34 + ＋5카드에서 넘어온 8.
  /*
   * ⚠️ **＋5카드는 미션 보상에서 뺐다**(PO 2026-08-24: "플레이 미션 목표에서 +5카드는 삭제하세요").
   *   그 몫(가중치 8)은 `cards`(뽑기 추가)로 합쳤다 — 성격이 가장 가깝고, 빼면서 표의 총합이
   *   달라지면 다른 보상들의 확률이 통째로 흔들리기 때문이다.
   */
  { kind: 'wild', weight: 8, amount: 2 },
  /*
   * 되돌리기 8 → 4(PO 2026-08-30 "되돌리기 아이템이 너무 많이 나온다"). 뺀 4 는 stars 로 옮겨 **표 총합을
   *   유지**한다(총합이 바뀌면 다른 보상 확률이 통째로 흔들린다). 실측(200k 추첨)으로 표 = 출현 비율임을
   *   확인했다(undo 6.9% 설계 = 6.8% 실측) — 많아 보인 것은 확률 오류가 아니라, 되돌리기는 **쓰기 전엔
   *   보유량이 계속 쌓이는** 유일한 미션 보상이라(다른 것은 그 자리에서 소비·전환) 체감이 누적된 것이다.
   */
  { kind: 'undo', weight: 4, amount: 1 }, // 되돌리기(리와인드) — 보유 아이템 items.undo 로 적립.
  { kind: 'diamond', weight: 6, amount: 1 },
  { kind: 'collection', weight: 14, amount: 1 }, // = COLLECTION_WEIGHT_BASE(레벨별로 교체된다).
];

/**
 * 콜렉션 드랍 가중치 — 레벨1 부스트에서 20레벨까지 선형 감소.
 *
 * ⚠️ **부스트를 34 → 18 로 낮췄다**(PO 2026-08-24 "A안"). 34 이던 시절 레벨2의 미션 예고는
 *   ＋2카드(34) + 컬렉션(33) = 카드 그림이 **49.6%** 로, 예고 두 번 중 한 번이 카드였다(별은 28.1%).
 *   둘 다 카드 모양이라 눈으로는 한 덩어리로 읽혀 "카드만 나온다"가 됐다. 18 로 낮추면 레벨2 카드류
 *   43.3% · 별 31.7% 가 된다. 레벨20 이후(하한 14)는 **전혀 바뀌지 않는다** — 초반 구간만 손보는 값이다.
 */
export const COLLECTION_WEIGHT_EARLY = 18;
export const COLLECTION_WEIGHT_BASE = 14;
export const COLLECTION_BOOST_UNTIL_LEVEL = 20;
export function collectionWeightForLevel(level: number): number {
  if (level >= COLLECTION_BOOST_UNTIL_LEVEL) return COLLECTION_WEIGHT_BASE;
  const t = Math.max(0, level - 1) / (COLLECTION_BOOST_UNTIL_LEVEL - 1);
  return Math.round(COLLECTION_WEIGHT_EARLY - t * (COLLECTION_WEIGHT_EARLY - COLLECTION_WEIGHT_BASE));
}

/**
 * **보너스 라운드(클론다이크) 미션 보상 풀** — 순수 **수집 아이템만**(PO 2026-08-30:
 *   "＋카드·와일드 카드 및 기타 솔리테어를 진행하는데 따르는 아이템은 적용하지 말 것").
 *
 * 즉 판을 유리하게 만드는 것(cards·plus5·wild·undo)은 빼고, **모으는 것**(리그 별·다이아·컬렉션 카드)만
 * 남긴다. 가중치는 메인 표(MISSION_REWARD_TABLE)를 그대로 물려받아 **두 게임의 체감이 어긋나지 않게** 한다
 * (레벨20+ 기준 별 65.5% · 컬렉션 24.1% · 다이아 10.3%).
 */
export const BONUS_MISSION_KINDS: ReadonlySet<MissionRewardKind> = new Set<MissionRewardKind>(['stars', 'diamond', 'collection']);

/** 보너스 라운드의 보상표 — 메인 표에서 진행 아이템을 걷어내고 컬렉션 가중치만 레벨로 교체한다. */
export function bonusMissionTable(level: number): { kind: MissionRewardKind; weight: number; amount: number }[] {
  return MISSION_REWARD_TABLE.filter((r) => BONUS_MISSION_KINDS.has(r.kind)).map((r) =>
    r.kind === 'collection' ? { ...r, weight: collectionWeightForLevel(level) } : { ...r },
  );
}

/**
 * **직전과 같은 종류를 피해 한 번만 다시 뽑는다** — 예고 아이콘이 안 바뀌는 체감을 줄인다.
 *
 * PO 2026-08-30 "이 미션콤보가 바뀌지 않는 경우가 많다". 원인은 버그가 아니라 **가중치 구조**다 —
 * 별이 66% 라 직전과 같은 종류가 나올 확률이 `Σp²  ≈ 50%` 다. 두 번 연속 같은 그림이 뜨면 화면이
 * 멈춘 것처럼 읽힌다.
 *
 * ⚠️ **다시 뽑는 것은 한 번뿐이다.** 같아질 때까지 돌리면 연속이 원천 금지되어 분포가 크게 휘고,
 *   가중치가 극단적일 때 루프가 길어진다. 한 번만 다시 뽑으면 연속 확률이 `Σp² → (Σp²)²` 로
 *   약 50% → 25% 로 내려가면서 분포 왜곡은 작게 유지된다.
 * ⚠️ 이 함수는 **분포를 바꾼다**(흔한 종류가 조금 줄고 드문 종류가 조금 는다). 경제 표를 볼 때는
 *   `rollBonusMissionReward` 의 원 분포가 아니라 **이 함수의 실측 분포**를 기준으로 삼을 것.
 */
export function rollBonusMissionRewardAvoiding(
  level: number,
  rng: () => number,
  avoid: MissionRewardKind | undefined,
): MissionRewardKind {
  const first = rollBonusMissionReward(level, rng);
  if (avoid === undefined || first !== avoid) return first;
  return rollBonusMissionReward(level, rng); // 한 번만 — 결과가 또 같아도 그대로 받는다.
}

/** 보너스 라운드 미션 보상 1건 추첨 — `rng` 는 0~1 난수(테스트 주입 가능). */
export function rollBonusMissionReward(level: number, rng: () => number): MissionRewardKind {
  const table = bonusMissionTable(level);
  const total = table.reduce((a, r) => a + r.weight, 0);
  let r = rng() * total;
  for (const row of table) {
    r -= row.weight;
    if (r <= 0) return row.kind;
  }
  return table[0].kind;
}

// ── 뽑기 넉넉 판정(미션의 카드 보상을 코인으로 대체하는 기준) ─────────
export const STOCK_AMPLE_RATIO = 0.25;
export const STOCK_AMPLE_MIN = 3;
/** 튜닝 훅(계측 스크립트 전용) — 넉넉 판정 비율을 코드 수정 없이 스윕. 게임은 호출하지 않는다. */
const ampleTuning = { ratio: STOCK_AMPLE_RATIO, min: STOCK_AMPLE_MIN };
export function configureAmple(t: Partial<typeof ampleTuning>): void {
  Object.assign(ampleTuning, t);
}
export function stockIsAmple(boardLeft: number, stockLeft: number): boolean {
  return stockLeft >= Math.max(ampleTuning.min, Math.ceil(boardLeft * ampleTuning.ratio));
}

/** 뽑기가 넉넉할 때 스톡 계열 보상이 주는 장수(종류는 그대로 — 출현 확률을 건드리지 않는다). */
export const STOCK_AMPLE_AMOUNT = 1;
/**
 * 스톡 계열(cards/plus5/wild) 보상의 **실지급 장수** — 뽑기가 이미 넉넉하면 최소 장수로 깎는다.
 *   ⚠️ 예전처럼 **종류를 stars 로 바꾸지 않는다**(그러면 보상표가 통째로 무너진다 — MISSION_REWARD_TABLE 주석).
 *   공급 억제 효과는 유지된다: 넉넉할 때 틱당 기대 +1.0장 → +0.45장.
 */
export function missionStockAmount(amount: number, ample: boolean): number {
  return ample ? Math.min(amount, STOCK_AMPLE_AMOUNT) : amount;
}

// ── 특수 슬롯(와일드·보너스) 위치 결정 ───────────────────────────────
/**
 * 초기 비노출 슬롯 중 와일드·보너스 자리를 고른다 — PlayScene.designateWild 와 동일 규칙:
 * 노출까지의 깊이(BFS)를 재서 **마지막 35% 구간은 제외**(늦게 나오는 와일드는 무의미), 레벨 시드로
 * 결정적 셔플. `excluded`(예: 다이아 슬롯)는 후보에서 뺀다.
 */
export function pickSpecialSlots(
  layout: PeakLayout,
  exposedNow: ReadonlySet<string>,
  level: number,
  excluded: ReadonlySet<string> = new Set(),
): { wildSlotId?: string; bonusSlotId?: string } {
  const covered = layout.order.filter((id) => !exposedNow.has(id) && !excluded.has(id));
  let pool = covered.length ? covered : layout.order.filter((id) => !exposedNow.has(id));
  if (!pool.length) return {};
  const depth = new Map<string, number>();
  {
    const cleared = new Set(exposedNow);
    let frontier = [...exposedNow];
    for (const id of frontier) depth.set(id, 0);
    let d = 0;
    while (frontier.length) {
      d++;
      const next: string[] = [];
      for (const s of layout.slots) {
        if (cleared.has(s.id)) continue;
        if (s.coveredBy.every((c) => cleared.has(c))) next.push(s.id);
      }
      for (const id of next) {
        cleared.add(id);
        depth.set(id, d);
      }
      frontier = next;
    }
  }
  const maxDepth = Math.max(0, ...pool.map((id) => depth.get(id) ?? 0));
  const cutoff = Math.floor(maxDepth * 0.65);
  const shallow = pool.filter((id) => (depth.get(id) ?? 0) <= cutoff);
  if (shallow.length) pool = shallow;
  const rng = seededRng(level * 733 + 991);
  const shuffled = pool.map((id) => ({ id, r: rng() })).sort((a, b) => a.r - b.r).map((o) => o.id);
  return { wildSlotId: shuffled[0], bonusSlotId: shuffled.length >= 2 ? shuffled[1] : undefined };
}

// ── 레벨 클리어 정산 — **보너스 게임과 같은 자로 잰 한 판 기준**(PO 2026-08-30) ──────────────
/**
 * ## 왜 생겼나 — 두 게임의 "한 판" 이 열 배 어긋나 있었다
 *
 * `scripts/yield-audit.mts`(그리디 봇 × 두 씬의 미션 규칙 그대로, 43레벨 × 15판) 실측, **승리 1판당**:
 *
 * | | 리그 별 | 다이아 | 컬렉션 카드 | 미션 틱 |
 * |---|---|---|---|---|
 * | 메인 솔리테어 | **3.8** (+등급 별 1~5) | 1.2 | 0.5 | 1.7/판 |
 * | 보너스 1장 일반 | **41.5** | 1.7 | 2.9 | 7.7/판 |
 * | 보너스 3장 | 47.5 | 2.1 | 3.6 | 8.6/판 |
 *
 * 보너스는 **성공한 수마다** 콤보가 올라 5수마다 미션이 터지고(판당 7~9건), 건마다 별 = 콤보 길이(≥5)라
 * 판당 40별이 쏟아진다. 메인은 매칭만 콤보고 뽑기로 끊겨 판당 1.7건이다. 그 결과 투데이 리그 하루 최종
 * 마일스톤(78)이 **보너스 한 판 승리로 절반**이 찼고, 메인 하루치(4승 × ~6별 = 24)는 두 번째 칸에 겨우
 * 닿았다 — 리그가 보너스에 지배되는 구조였다.
 *
 * ## 설계 — 보너스 승리 1판을 기준 단위로 삼고, 메인 승리 1판을 거기에 맞춘다
 *
 * PO: "프리셀의 획득 데이터를 점검하고 그 기준에 맞춰 솔리테어 한 판당 획득 밸런스를 맞춰라."
 * 메인의 미션 틱 수를 늘리는 것은 판의 리듬(뽑기·콤보)을 바꾸므로 손대지 않고, **클리어 정산**으로 맞춘다 —
 * 보너스도 승리해야 원장이 확정되는 구조라 "이겨야 받는다"는 같다.
 *
 * | 클리어 정산 | 값 | 승리 1판 기대(등급 평균 ≈2.5) |
 * |---|---|---|
 * | 리그 별 | `16 + 6 × 등급`(1★ 22 … 5★ 46) | ≈31 + 미션 3.8 ≈ **35~40** (보너스 41) |
 * | 다이아 | 등급 4★ 이상이면 +1 | 보드 1.2 + ≈0.3 ≈ **1.5** (보너스 1.7) |
 * | 컬렉션 카드 | 2장 + 5★이면 +1 | 0.5 + ≈2.2 ≈ **2.7** (보너스 2.9) |
 * | 코인 | 변경 없음 — 경제 모델(게임비 배수)이 정한다 | |
 *
 * ⚠️ 별 유입이 ×6 이 되므로 **리그 목표도 같이 옮겼다**(`STAR_SCALE` — 마일스톤·봇 목표·단계 목표 ×6, 별당 코인 ÷6).
 *   한쪽만 바꾸면 리그가 첫날 오전에 끝나거나(목표 그대로) 영영 안 찬다(정산만 되돌림).
 * ⚠️ 등급(`stars` 1~5)은 완성한 세트 수다 — 등급이 곧 정산 배수라 "잘 끝낸 판" 이 더 받는다.
 */
export const CLEAR_LEAGUE_STARS_BASE = 16;
export const CLEAR_LEAGUE_STARS_PER_GRADE = 6;
export const CLEAR_DIAMOND_BONUS_FROM_GRADE = 4;
export const CLEAR_COLLECTION_CARDS = 2;
export const CLEAR_COLLECTION_BONUS_AT_GRADE = 5;

export interface ClearRewards {
  readonly leagueStars: number;
  readonly diamonds: number;
  readonly collectionCards: number;
}

/** 레벨 클리어 정산(등급 1~5 → 리그 별·다이아·컬렉션 카드). 깨진 등급은 1~5 로 접는다. */
export function clearRewardsForGrade(grade: number): ClearRewards {
  const g = Math.max(1, Math.min(5, Math.floor(Number.isFinite(grade) ? grade : 1)));
  return {
    leagueStars: CLEAR_LEAGUE_STARS_BASE + CLEAR_LEAGUE_STARS_PER_GRADE * g,
    diamonds: g >= CLEAR_DIAMOND_BONUS_FROM_GRADE ? 1 : 0,
    collectionCards: CLEAR_COLLECTION_CARDS + (g >= CLEAR_COLLECTION_BONUS_AT_GRADE ? 1 : 0),
  };
}
