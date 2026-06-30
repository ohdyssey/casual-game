/**
 * economy.ts — 코인 경제(승률/RTP)의 단일 출처(SSOT). 순수 로직(뷰/Phaser 무관, vitest 대상).
 *
 * 설계 철학: **퍼즐 스킬이 배당을 끌어올리는 하이브리드 — 단, 표시된 당첨금은 절대 깎지 않는다.**
 *   - ⭐**슬롯 기본 배당은 낮게**(SLOT_RTP_SCALE 작게). 슬롯 단독 RTP 는 낮아 그냥 돌리면 손해.
 *   - ⭐**퍼즐 매칭이 고배당 엔진**: 매치가 클수록(P↑) **확률적으로** 높은 멀티플라이어 티어
 *     (×1/1.5/2/3/5/10)가 나올 확률이 커진다 → 잘 맞출수록 큰 코인. (puzzleMultiplier)
 *     "확률적"이라 완벽 매치도 가끔 ×1(운 나쁨), ×10 은 드물게(스킬↑이면 더 자주) — 스킬+운 결합.
 *   - 운(luck)은 추가로 **릴 심볼 분포**(포춘 Cold/Neutral/Hot)에만 들어간다. 뜬 결과는 페이테이블 100% 지급.
 *   - 튜닝: **AI 최적매치(또는 고수 플레이) ≈ 결합 RTP 96%**(하우스 엣지 4%, 폭주 방지). 약한 매치는
 *     그보다 한참 낮음 → 퍼즐 스킬이 RTP 를 크게 좌우. ×5/×10 티어가 '고배당' 한 방을 만든다.
 *
 *   ⚠️ 포춘 상태·잭팟 풀은 런타임 상태. 유저 영속화·실결제는 서버 권위 필요.
 */
import { WEIGHTS } from './slot.js';

// ── 포춘(운) 상태 마르코프 체인 ────────────────────────────────
export type Fortune = 'cold' | 'neutral' | 'hot';

/**
 * 상태별 릴 심볼 가중치(slot.WEIGHTS 와 같은 8칸, 합은 무관 — weightedPick 가 정규화).
 * ⭐**진폭 확대(2026-06-23)**: Cold↓·Hot↑ 스프레드를 크게 + 긴 streak → 잔고가 크게 출렁(긴 상승/하강 파동).
 *   raw RTP ≈ Cold **76%**(가장 메마른 분포, 매치 희귀) / Neutral 94% / Hot **190%**(집중, 매치 잦고 큼).
 * (RTP 는 가중치에 비단조 — 시뮬로 측정. economy.fortune.sweep 참조. Cold 는 ~76%가 바닥.)
 */
export const FORTUNE_WEIGHTS: Record<Fortune, ReadonlyArray<number>> = {
  cold: [20, 18, 16, 13, 11, 9, 7, 6],
  neutral: WEIGHTS, // = [26, 22, 18, 13, 9, 6, 4, 2]
  hot: [38, 27, 16, 9, 5, 3, 1.5, 0.5],
};

/** 상태 유지 확률(⭐0.95 → 방문당 평균 streak ≈ 20스핀, 극단(Cold/Hot) 체류 ↑ = 더 긴 상승/하강 파동 = 진폭 大). */
export const FORTUNE_STAY = 0.95;
/** Neutral 에서 Hot/Cold 로 빠질 확률(각각). */
export const FORTUNE_SWING = 0.1;
export const FORTUNE_START: Fortune = 'neutral';

/**
 * 다음 포춘 상태. Neutral→유지(1-2·SWING)·Hot SWING·Cold SWING, Hot/Cold→유지 STAY·Neutral(1-STAY).
 * ⭐STAY=0.95·SWING=0.1 → 정상분포 ≈ Cold 0.4 / Neutral 0.2 / Hot 0.4 (극단 체류↑·긴 streak = 진폭 大).
 */
export function nextFortune(s: Fortune, rng: () => number): Fortune {
  const r = rng();
  if (s === 'neutral') {
    if (r < FORTUNE_SWING) return 'cold';
    if (r < FORTUNE_SWING * 2) return 'hot';
    return 'neutral';
  }
  return r < 1 - FORTUNE_STAY ? 'neutral' : s; // hot/cold: 0.2 로 neutral 복귀, 아니면 유지
}

/** 현재 운 상태의 릴 가중치 — slot.spin/spinReels 에 그대로 넘긴다. */
export function weightsFor(s: Fortune): ReadonlyArray<number> {
  return FORTUNE_WEIGHTS[s];
}

// ── RTP 닻 ───────────────────────────────────────────────────
/** 중립 가중치의 해석적 슬롯 raw RTP(문서/기준값). slot.ts 배당표 손계산. */
export const RAW_SLOT_RTP_NEUTRAL = 0.9366;

/**
 * 라인 당첨금 스케일(직접 튜닝 노브) — ⭐**낮게**(슬롯 단독 배당 축소). 퍼즐 멀티가 배당을 끌어올린다.
 * 포춘 π가중 raw RTP × 스케일 × 평균 퍼즐멀티(AI최적) + 잭팟환원 ≈ 96% 가 되게 economy.sim 으로 잠금.
 */
export const SLOT_RTP_SCALE = 0.18; // ⭐2026-06-30: 0.23→0.18(−22%) — 슬롯 보상을 줄여 레이드/어텍 보상과 균형(요청). 슬롯 단독 비중↓.

// ── 퍼즐 멀티플라이어(결정론적 — 매치 구조 기반) ───────────────────────────────
// ⭐사용자 규칙(2026-06-23): 매치(run) 길이 L → 배수 **(L−2)**. 3개→×1·4개→×2·5개→×3·6개→×4·7개→×5…
//   매치가 여러 개(연쇄/동시)면 그 배수들을 **곱한다**. 거기에 **전체 맞춘 타일수 × 0.1** 을 **합산**.
//   예) 5매치+4매치 = (3×2) + 9×0.1 = 6.9.   단일 3매치 = (1) + 3×0.1 = 1.3.
//   확률 없음(결정론) → 화면 표시와 정확히 일치. 운(확률)은 슬롯 릴(포춘)에만.
/** 갯수 하나당 멀티 가산(0.1/타일). */
export const MATCH_DECIMAL_PER = 0.1;

/** run(매치) 길이 → 배수 (L−2, 최소 1). 3→1·4→2·5→3·6→4·7→5… */
export function runMultiplier(runLen: number): number {
  return Math.max(1, runLen - 2);
}

/**
 * 퍼즐 멀티플라이어 = (각 run 배수의 곱) + (전체 맞춘 타일수 × 0.1). 항상 ≥1(표시 당첨 안 깎음).
 * runs = 이번 스왑이 만든 모든 매치(연쇄 포함) 길이 배열, totalCleared = 제거된 총 타일수.
 */
export function puzzleMultiplierFromRuns(runs: ReadonlyArray<number>, totalCleared: number): number {
  let product = 1;
  for (const len of runs) product *= runMultiplier(len);
  return product + totalCleared * MATCH_DECIMAL_PER;
}

// ── 슬롯 럭 스트라이크(고변동 = 큰 한 방) ──────────────────────────────────────
// ⭐"찔끔찔끔" 평탄한 드립을 깨는 변동성 엔진. 대부분 ×1(평소)지만 가끔 ×4/×12/×50 으로 슬롯이 크게 터진다.
//   → 마른 구간(소액·꽝)이 이어지다 가끔 대박 → "따고 잃고 순환 + 크게 딸 수도". 평균 ≈1.5(스케일로 상쇄).
// ⭐진폭 大 재설계(2026-06-25): 강타를 훨씬 크고(최대 50→600) 드물게 → 평소엔 잔잔(×1)·가끔 초대박(수백 배).
//   평균 ≈2.56(이전 1.5) → SLOT_RTP_SCALE 를 낮춰 RTP 평균은 유지(mean-preserving spread = 순수 진폭 확대).
export const LUCK_TABLE: ReadonlyArray<{ p: number; m: number }> = [
  { p: 0.0006, m: 600 }, // ≈1/1666 — 메가(초대박 한 방)
  { p: 0.003, m: 120 }, //  ≈1/333  — 잭팟급
  { p: 0.012, m: 30 }, //   ≈1.2%   — 대박
  { p: 0.05, m: 7 }, //     ≈5%     — 큰 한 방
  { p: 0.13, m: 2.5 }, //   ≈13%    — 중간 부스트
  // 나머지(≈80.5%) → ×1
];
/** 슬롯 럭 배수 — 누적 확률로 큰 배수 추출. 항상 ≥1(표시 당첨 안 깎음). table 미지정 시 SSOT(LUCK_TABLE) — 라이브는 오버라이드 주입. */
export function luckMultiplier(rng: () => number, table: ReadonlyArray<{ p: number; m: number }> = LUCK_TABLE): number {
  const r = rng();
  let acc = 0;
  for (const t of table) {
    acc += t.p;
    if (r < acc) return t.m;
  }
  return 1;
}

// ── 잭팟(덩어리 운, 레이크 기반 EV 중립) ──────────────────────
export const JACKPOT_RAKE = 0.02;
export const JACKPOT_HIT_PROB = 0.0008; // ≈ 1/1250 스핀
export const JACKPOT_SEED = 0;

// ── 순수 함수 ─────────────────────────────────────────────────
/** 슬롯 라인 당첨금 → 코인(RTP 스케일 적용, 라인수 분산). 포춘은 이미 릴 결과(slotRaw)에 반영됨. */
export function slotPayout(bet: number, slotRaw: number, lines: number, rtpScale: number = SLOT_RTP_SCALE): number {
  return Math.round((bet * slotRaw * rtpScale) / lines);
}

/** 럭 적용 슬롯 당첨금(표시·정산 공통) = round(기본 슬롯당첨 × 럭배수). rtpScale 미지정 시 SSOT — 라이브는 오버라이드 주입. */
export function slotPayoutWithLuck(bet: number, slotRaw: number, lines: number, luck: number, rtpScale: number = SLOT_RTP_SCALE): number {
  return Math.round(slotPayout(bet, slotRaw, lines, rtpScale) * luck);
}

/** 최종 획득 코인 = (럭 적용 슬롯당첨) × 퍼즐 멀티. (운은 slotRaw·luck 에 들어있어 안 깎음.) */
export function settleWin(bet: number, slotRaw: number, puzzleMult: number, lines: number, luck = 1, rtpScale: number = SLOT_RTP_SCALE): number {
  return Math.round(slotPayoutWithLuck(bet, slotRaw, lines, luck, rtpScale) * puzzleMult);
}

/**
 * ⭐캐릭터 레벨 → 보상 배수(요청 2026-06-25: **레벨 × 보상금액**, 선형). 레벨1=×1·2=×2·3=×3…
 * 최종 획득 = round(슬롯 × 퍼즐) × levelRewardMultiplier(level). 최소 1(레벨 0/음수 방어).
 * (완만한 곡선이나 레벨별 표로 바꾸려면 이 함수만 교체 — 호출부 불변.)
 */
export function levelRewardMultiplier(level: number): number {
  return Math.max(1, Math.floor(level));
}

/** 이번 스핀이 잭팟 풀에 적립할 금액. */
export function jackpotContribution(bet: number): number {
  return Math.round(bet * JACKPOT_RAKE);
}

/** 잭팟 당첨 판정 — 당첨이면 풀 전액(코인), 아니면 0. */
export function rollJackpot(rng: () => number, pool: number): number {
  return rng() < JACKPOT_HIT_PROB ? pool : 0;
}
