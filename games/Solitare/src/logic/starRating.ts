/**
 * starRating.ts — **레벨 클리어 별 등급(1~5)** 판정, 순수 로직(Phaser-free).
 *
 * ── 최종평가 3축(PO 2026-07-29 확정) ───────────────────────────────────────────
 *   ① **연속 콤보 성과** — 끊기지 않고 이어 낼수록 **높은 점수**("연속별획득을 높이 점수를 주고").
 *   ② **남은 카드 수** — 판이 끝났을 때 뽑기 더미에 남은 장수("남은 카드갯수에 점수를 줘야 합니다").
 *   ③ **추가카드(＋5) 없이 한 번에 성공** — 부스터를 한 번도 쓰지 않고 클리어하면 보너스.
 *
 * 세 축을 각각 **0~1 로 정규화**한 뒤 가중합해 최종 품질을 낸다. 축마다 단위가 달라(점수·장수·불리언)
 *   먼저 정규화하지 않으면 콤보 항이 나머지를 압도한다.
 *
 * ── 지켜야 하는 계약 ────────────────────────────────────────────────────────
 *   • **되감김 금지**(PO 2026-07-29) — 플레이 중 게이지는 ①만 반영하고 ①은 매치마다 **더하기만** 한다.
 *     ②③은 승리 정산에서 한 번 더해지므로 게이지는 끝까지 단조 증가한다(내려가는 지점이 없다).
 *   • **그 판을 최적으로 풀었을 때 5★**(PO 2026-07-29) — 절대 점수가 아니라 그 레벨 **정답 수순 대비 비율**로
 *     매긴다. 정답 수순도 같은 3축으로 채점한다(`referenceQuality`).
 *   • **＋5 없이 클리어 = 3★ 하한**(PO 2026-07-29) — 컷은 클린 클리어의 **94% 가 3★ 이상**이 되게 잡는다.
 *     ＋5 를 쓰면 축③을 통째로 잃어 대략 한 등급 내려간다(1·2★ 는 주로 그쪽 자리).
 */

/**
 * 한 매치가 더할 수 있는 콤보 가산 상한(초선형 폭주 방지).
 *   8 → **12**(PO 2026-07-29 "5개와 1개의 베리에이션을 더 풍부하게") — 상한이 낮으면 긴 연쇄가 8에서
 *   잘려 최상위 플레이가 평범한 플레이와 같은 점수를 받는다. 12 로 올리자 비율 분포 폭이
 *   0.42~2.78 → 0.38~3.26 으로 넓어져 1★·5★ 가 실제 실력 차로 갈린다(실측).
 */
export const COMBO_CAP = 12;

/** ＋5 부스터 1회가 스톡에 넣어 주는 카드 수 — 축② 에서 **부스터로 늘린 몫을 빼기** 위해 필요. */
export const PLUS5_CARDS = 5;

/** 최대 별 수. */
export const MAX_STARS = 5;

/**
 * **3축 가중치**(합 1.0) — PO "연속별획득을 높이 점수를 주고, 남은 카드갯수에 점수를 줘야 합니다".
 *   콤보가 가장 크고, 남은 카드가 그 다음, 무부스터 클리어가 마지막 한 끗을 가른다.
 */
export const STAR_WEIGHTS = { combo: 0.55, leftover: 0.35, clean: 0.1 } as const;

/**
 * **매치 1회의 콤보 가산** = `min(현재 연속 런 길이, 8)`.
 *   끊기지 않고 이으면 가산이 1,2,3,4,5… 로 커지므로 **런 전체의 합은 초선형**(삼각수)이다 —
 *   같은 5매치라도 5연속이면 15점, 따로따로면 5점. 이것이 "연속에 높은 점수"의 실체다.
 */
export function matchGain(runLength: number): number {
  return Math.min(Math.max(0, runLength), COMBO_CAP);
}

/**
 * 축① **연속 콤보 성과**(0~1) — 누적 콤보 점수 ÷ 이론상 최대(모든 매치가 최대 콤보일 때).
 *   보드 크기로 정규화되므로 레벨 크기가 달라도 같은 잣대로 비교된다.
 */
export function comboTerm(comboScore: number, boardSize: number): number {
  const max = Math.max(1, Math.floor(boardSize)) * COMBO_CAP;
  return clamp01(Math.max(0, comboScore) / max);
}

/**
 * 축② **남은 카드 수**(0~1) — 남은 스톡 ÷ 처음 받은 스톡. 1 = 한 장도 안 뽑고 클리어.
 *   ⚠️ ＋5 로 채워 넣은 몫(`plus5Uses × 5`)은 **빼고 센다** — 안 그러면 부스터를 쓸수록 이 항이 올라가
 *      "＋5 를 쓰면 별이 오르는" 역전이 생긴다(축③ 과 정면으로 모순).
 */
export function leftoverTerm(leftover: number, plus5Uses: number, stockSize: number): number {
  const net = Math.max(0, leftover) - Math.max(0, plus5Uses) * PLUS5_CARDS;
  return clamp01(net / Math.max(1, stockSize));
}

/** 축③ **추가카드 없이 한 번에 성공**(0 또는 1) — ＋5 를 한 번도 쓰지 않았으면 1. */
export function cleanTerm(plus5Uses: number): number {
  return plus5Uses > 0 ? 0 : 1;
}

/** 한 판의 최종 성적 — 세 축의 원재료. */
export interface PlayOutcome {
  /** 누적 콤보 점수(매치마다 `matchGain` 가산). */
  readonly comboScore: number;
  /** 보드 카드 수(축① 정규화 분모). */
  readonly boardSize: number;
  /** 종료 시 남은 스톡 장수(축②). */
  readonly leftover: number;
  /** 처음 받은 스톡 장수(축② 정규화 분모). */
  readonly stockSize: number;
  /** ＋5 부스터 사용 횟수(축②의 보정 + 축③). */
  readonly plus5Uses: number;
}

/** **최종 품질**(0~1) = 3축 가중합. 별 판정은 전부 이 값(또는 기준 대비 비율)으로 한다. */
export function finalQuality(o: PlayOutcome): number {
  return (
    STAR_WEIGHTS.combo * comboTerm(o.comboScore, o.boardSize) +
    STAR_WEIGHTS.leftover * leftoverTerm(o.leftover, o.plus5Uses, o.stockSize) +
    STAR_WEIGHTS.clean * cleanTerm(o.plus5Uses)
  );
}

/**
 * **플레이 중 품질**(0~1) — 아직 확정되지 않은 축②③ 을 빼고 축①만 반영한다.
 *   게이지가 여기서 출발해 승리 정산에서 `finalQuality` 까지 **올라가기만** 한다(되감김 없음).
 */
export function playingQuality(comboScore: number, boardSize: number): number {
  return STAR_WEIGHTS.combo * comboTerm(comboScore, boardSize);
}

/**
 * **기준(정답 수순)의 품질** — 에디터가 저작·검증한 해답(`deal.solution`)을 **같은 3축**으로 채점.
 *   표기: `p<슬롯>` = 카드 내기(런 이어짐) · `d` = 뽑기(런을 끊고 남은 카드를 줄인다).
 *   정답 수순은 부스터를 쓰지 않으므로 축③ = 1, 축② 는 `처음 스톡 − 뽑은 횟수`.
 */
export function referenceQuality(solution: readonly string[], boardSize: number, stockSize: number): number {
  if (!solution.length) return 0;
  let comboScore = 0;
  let run = 0;
  let draws = 0;
  for (const step of solution) {
    if (step === 'd') {
      draws++;
      run = 0;
      continue;
    }
    run++;
    comboScore += matchGain(run);
  }
  return finalQuality({
    comboScore,
    boardSize,
    leftover: Math.max(0, stockSize - draws),
    stockSize,
    plus5Uses: 0,
  });
}

/**
 * 기준 대비 비율 컷 — `플레이 품질 ÷ 기준 품질`. 값이 클수록 정답 수순보다 잘 푼 것.
 *
 * ⚠️ 저작 `solution` 은 **최적이 아니라 유효한 한 가지 풀이**다(에디터 솔버의 첫 해답이라 뽑기가 많다).
 *    그래서 비율 1.0(기준과 동일)은 5★ 가 아니라 하위권이다.
 *
 * **＋5 없이 완성 = 3★ 하한**(PO 2026-07-29, 2회 지시: "추가＋5 카드를 받지 않고 성공할 경우를 기준으로
 *    별 3개를 기준으로 다시 설계하라") — 부스터 없이 깨끗하게 끝냈으면 **기본이 3★**이고, 잘 풀수록 4·5★.
 *    1·2★ 는 주로 **＋5 를 쓴 판**의 자리다(축③ 상실 = 약 1 등급).
 *    그래서 2★↔3★ 컷을 클린 표본의 **하위 6%** 지점에 놓는다 — 클린 클리어의 94% 가 3★ 이상.
 *    4★ 컷 = 클린 중앙값 · 5★ 컷 = 클린 상위 18% → **5★ 도 충분히 자주 나온다**(PO "5개와 1개의 베리에이션을
 *    더 풍부하게"). 1★ 은 클린에서는 거의 안 나오고 부스터를 쓴 판에서 나온다.
 *
 * 실측(2026-07-29, 저작 레벨 500 × 12판 = 6000판 그리디 봇 = **전부 클린 클리어**, 3축 최종평가 모델):
 *    승률 51.4% · 승리 3085판 기준
 *    비율   min 0.38 · 하위5% 0.90 · 중앙 1.40 · 최대 3.26 → 컷 [0.73, 0.92, 1.40, 1.90]
 *    절대   min 0.16 · 중앙 0.31 · 최대 0.76 → 컷 [0.18, 0.20, 0.31, 0.43]
 *    결과 — 클린   1★ 1.0% · 2★ 4.9% · 3★ 44.3% · 4★ 32.1% · 5★ 17.8% (평균 3.61★)
 *           ＋5 1회 1★ 29.4% · 2★ 19.6% · 3★ 31.4% · 4★ 14.7% · 5★ 4.9% (평균 2.46★, 등급차 1.15)
 *    ⚠️ 축③ 가중치를 0.15 로 두면 페널티가 1.5 등급이 되고 ＋5 판의 66% 가 1★ 로 몰렸다 → 0.10 으로 낮추고
 *       남은 0.05 를 축②(남은 카드)로 옮겼다. PO "최종 보상이 너무 짜다" 에 대한 조정.
 */
export const STAR_RATIO_CUTS = [0, 0.73, 0.92, 1.4, 1.9] as const;

/** 절대 컷(정답 수순이 없는 레벨 폴백) — 위 실측의 절대 품질 분위수. 상대 컷과 같은 목표 분포. */
export const STAR_CUTS = [0, 0.18, 0.2, 0.31, 0.43] as const;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function litBy(value: number, cuts: readonly number[]): number {
  let lit = 0;
  for (const cut of cuts) if (value >= cut) lit++;
  return Math.min(MAX_STARS, Math.max(1, lit));
}

/** 품질 → 별 수(1..5) — 기준 수순이 없는 레벨용 절대 판정. */
export function starsForQuality(quality: number): number {
  return litBy(quality, STAR_CUTS);
}

/** 기준 대비 비율 → 별 수(1..5). 기준 품질이 없거나 0이면 절대 컷으로 폴백. */
export function starsForRatio(quality: number, refQuality: number): number {
  if (!Number.isFinite(refQuality) || refQuality <= 0) return starsForQuality(quality);
  return litBy(quality / refQuality, STAR_RATIO_CUTS);
}
