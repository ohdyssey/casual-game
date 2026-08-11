/**
 * 트로피 — 리그 승급의 유일한 조건. 순수 로직(Phaser 무관, 테스트 대상).
 *
 * 설계(사용자 결정):
 *  · **리그마다 5개**, 5개를 다 모으면 다음 리그가 열린다.
 *  · 5개는 **각각 다른 조건**이다 — "5승"처럼 같은 걸 반복시키면 5판이 5번 다 똑같아진다.
 *    리그마다 ①진입 ②연승 ③파워(비거리) ④정밀(링 배율) ⑤복합 의 다섯 축을 두고 난이도만 올린다.
 *  · **리그별로 따로 센다.** 클럽 5개를 채웠으면 클럽에서 더 이겨도 안 쌓인다 —
 *    하위 리그를 반복해 승급하는 파밍을 막는다(하위 리그는 코인 벌이용으로만 남는다).
 *  · **순서 자유 · 한 경기 동시 획득 가능 · 중복 없음.**
 *
 * 난이도 기준선(실제 점수 규칙에서 역산):
 *   튜토리얼 상대 516점 · 잘 친 판 ~1,500 · 매우 잘 친 판 ~2,500 · 이론상 만점 6,210
 *   (홈런 최대 230m × 링 배율 최대 3 × 9회). 비거리는 어느 정도 나오지만 **퍼펙트(×3)를
 *   반복해 맞히는 것**이 순수 타이밍 실력이라, 이를 난이도의 중심축으로 삼았다.
 *
 * ⚠️ 조건 수치는 실측 튜닝 전제다(사용자: "승리조건을 다시 정할 것"). 값은 전부 이 파일의
 *    TROPHIES 표에만 있으므로 밸런싱은 이 표만 고치면 된다.
 * ⚠️ 트로피 이미지는 추후 제공 예정 — 지금은 id/이름만 쓰고 아이콘은 붙이지 않는다.
 */

/** 한 타석의 결과 — 트로피 판정에 필요한 만큼만. PlayScene 이 회차마다 채운다. */
export interface PlayedRound {
  readonly outcome: 'homerun' | 'hit' | 'foul' | 'strike' | 'out';
  readonly score: number;
  /** 홈런일 때 비거리(m). 그 외에는 없음. */
  readonly meters?: number;
  /** 홈런일 때 과녁 링 배율(1 = 미적중 · 1.5 나이스 · 2 그레이트 · 3 퍼펙트). */
  readonly ringMult?: number;
}

/** 한 경기 전체 결과 — evaluateTrophies 의 입력. */
export interface MatchStats {
  readonly won: boolean;
  readonly score: number;
  readonly rivalScore: number;
  readonly rounds: ReadonlyArray<PlayedRound>;
  /** 이 경기까지 포함한 연승 수(이겼으면 이전 연승+1, 아니면 0). */
  readonly winStreak: number;
}

/** 퍼펙트 판정 기준 — PlayScene 의 HOMERUN_TARGET_RING_MULT_INNER 와 같은 값이어야 한다. */
export const PERFECT_RING_MULT = 3;

// ── 조건 계산 도우미 ──────────────────────────────────────────────────

const homers = (s: MatchStats): ReadonlyArray<PlayedRound> => s.rounds.filter((r) => r.outcome === 'homerun');
/** 한 경기 퍼펙트(링 ×3) 홈런 개수. */
const perfectCount = (s: MatchStats): number => homers(s).filter((r) => (r.ringMult ?? 1) >= PERFECT_RING_MULT).length;
/** 한 경기 최장 비거리(홈런이 없으면 0). */
const longestMeters = (s: MatchStats): number => homers(s).reduce((m, r) => Math.max(m, r.meters ?? 0), 0);
/** 연속 홈런 최대 길이. */
function longestHomerRun(s: MatchStats): number {
  let best = 0;
  let cur = 0;
  for (const r of s.rounds) {
    cur = r.outcome === 'homerun' ? cur + 1 : 0;
    if (cur > best) best = cur;
  }
  return best;
}
/** 삼진·아웃이 하나도 없는가(파울은 허용). */
const noStrikeout = (s: MatchStats): boolean => s.rounds.every((r) => r.outcome !== 'strike' && r.outcome !== 'out');
/** 9타석 전부 안타 이상(삼진·아웃·파울 전부 없음). */
const flawless = (s: MatchStats): boolean => s.rounds.every((r) => r.outcome === 'homerun' || r.outcome === 'hit');
/**
 * 끝내기 — 마지막 타석 홈런으로 뒤집은 승리. 그 홈런 점수를 빼면 지고 있었어야 한다.
 * (라이벌 점수는 경기 내내 고정된 "지난 경기 기록"이라 마지막 시점 비교가 곧 역전 판정이다.)
 */
function walkOff(s: MatchStats): boolean {
  const last = s.rounds[s.rounds.length - 1];
  if (!s.won || !last || last.outcome !== 'homerun') return false;
  return s.score - last.score <= s.rivalScore;
}

export interface TrophyDef {
  /** 저장용 안정 식별자 — 이름을 바꿔도 획득 기록이 유지되도록 별도로 둔다. */
  readonly id: string;
  readonly name: string;
  /** 화면에 그대로 띄우는 조건 설명(결과화면의 "남은 조건" 표시에 쓴다). */
  readonly desc: string;
  readonly test: (s: MatchStats) => boolean;
}

/** 리그 승급에 필요한 트로피 수. */
export const TROPHIES_PER_LEAGUE = 5;

/**
 * 리그(티어 id) → 트로피 5개. league.ts 의 TIER_SPECS id 와 1:1 대응한다.
 * 각 리그의 1번은 상대적으로 낮게 둔다 — 도착하자마자 하나는 받아야 "할 만하다"가 되고,
 * 그러지 않으면 상위 리그 진입 직후 이탈한다.
 */
export const TROPHIES: Readonly<Record<number, ReadonlyArray<TrophyDef>>> = {
  // 1. 신인리그 — 기본기
  1: [
    { id: 'r1_debut', name: '데뷔전', desc: '승리 1회', test: (s) => s.won },
    { id: 'r1_streak', name: '연승 시동', desc: '3연승', test: (s) => s.winStreak >= 3 },
    // 승패를 안 따지는 유일한 트로피 — 입문자가 첫 트로피를 확실히 쥐게 하는 장치.
    { id: 'r1_power', name: '장타자', desc: '180m 이상 홈런', test: (s) => longestMeters(s) >= 180 },
    { id: 'r1_precision', name: '정교함의 시작', desc: '한 경기 퍼펙트 2회 + 승리', test: (s) => s.won && perfectCount(s) >= 2 },
    { id: 'r1_rookie_king', name: '신인왕', desc: '700점 이상 + 홈런 4개 + 승리', test: (s) => s.won && s.score >= 700 && homers(s).length >= 4 },
  ],
  // 2. 클럽리그 — 점수 의식
  2: [
    { id: 'r2_entry', name: '클럽 입성', desc: '삼진 없이 승리', test: (s) => s.won && noStrikeout(s) },
    { id: 'r2_streak', name: '연승 행진', desc: '5연승', test: (s) => s.winStreak >= 5 },
    { id: 'r2_power', name: '중거리포', desc: '200m 이상 홈런 + 승리', test: (s) => s.won && longestMeters(s) >= 200 },
    { id: 'r2_backtoback', name: '백투백', desc: '3타석 연속 홈런 + 승리', test: (s) => s.won && longestHomerRun(s) >= 3 },
    { id: 'r2_1200', name: '1200 클럽', desc: '1,200점 이상 + 퍼펙트 3회 + 승리', test: (s) => s.won && s.score >= 1200 && perfectCount(s) >= 3 },
  ],
  // 3. 세미프로리그 — 정밀도
  3: [
    { id: 'r3_entry', name: '신고식', desc: '라이벌보다 500점 이상 앞서 승리', test: (s) => s.won && s.score - s.rivalScore >= 500 },
    { id: 'r3_flawless', name: '무결점', desc: '9타석 전부 안타 이상으로 승리', test: (s) => s.won && flawless(s) },
    { id: 'r3_power', name: '호쾌한 손목', desc: '215m 이상 홈런 + 승리', test: (s) => s.won && longestMeters(s) >= 215 },
    { id: 'r3_precision', name: '퍼펙트 히터', desc: '한 경기 퍼펙트 4회 + 승리', test: (s) => s.won && perfectCount(s) >= 4 },
    { id: 'r3_1800', name: '1800 클럽', desc: '1,800점 이상 + 승리', test: (s) => s.won && s.score >= 1800 },
  ],
  // 4. 프로리그 — 복합
  4: [
    { id: 'r4_entry', name: '프로 데뷔', desc: '라이벌 2배 점수로 승리', test: (s) => s.won && s.score >= s.rivalScore * 2 },
    { id: 'r4_streak', name: '불패', desc: '7연승', test: (s) => s.winStreak >= 7 },
    // 비거리와 링을 **같은 타구에서** 동시에 요구한다 — 두 축을 한 번에 맞춰야 한다.
    {
      id: 'r4_power_perfect',
      name: '장외 홈런',
      desc: '225m 이상 + 퍼펙트 홈런 + 승리',
      test: (s) => s.won && homers(s).some((r) => (r.meters ?? 0) >= 225 && (r.ringMult ?? 1) >= PERFECT_RING_MULT),
    },
    { id: 'r4_precision', name: '정밀 기계', desc: '한 경기 퍼펙트 6회 + 승리', test: (s) => s.won && perfectCount(s) >= 6 },
    { id: 'r4_2600', name: '2600 클럽', desc: '2,600점 이상 + 승리', test: (s) => s.won && s.score >= 2600 },
  ],
  // 5. 월드클래스 — 엔드게임(승급 없음, 명예)
  5: [
    { id: 'r5_entry', name: '월드클래스 입성', desc: '라이벌 3배 점수로 승리', test: (s) => s.won && s.score >= s.rivalScore * 3 },
    { id: 'r5_walkoff', name: '끝내기', desc: '마지막 타석 홈런으로 역전승', test: walkOff },
    { id: 'r5_grandslam', name: '만루포', desc: '5타석 연속 홈런 + 승리', test: (s) => s.won && longestHomerRun(s) >= 5 },
    {
      id: 'r5_max',
      name: '초대형 홈런',
      desc: '230m + 퍼펙트 홈런',
      test: (s) => homers(s).some((r) => (r.meters ?? 0) >= 230 && (r.ringMult ?? 1) >= PERFECT_RING_MULT),
    },
    { id: 'r5_legend', name: '전설', desc: '3,500점 이상 + 10연승', test: (s) => s.won && s.score >= 3500 && s.winStreak >= 10 },
  ],
};

/** 해당 리그의 트로피 목록(없는 리그면 빈 배열). */
export function trophiesOf(tierId: number): ReadonlyArray<TrophyDef> {
  return TROPHIES[tierId] ?? [];
}

export function trophyById(tierId: number, id: string): TrophyDef | undefined {
  return trophiesOf(tierId).find((t) => t.id === id);
}

/**
 * 이번 경기로 **새로 딴** 트로피 id 목록. 이미 딴 것(earned)은 다시 주지 않는다.
 * 여러 개가 동시에 걸리면 전부 반환한다 — "3개 한꺼번에"가 강한 보상 순간이 된다.
 */
export function evaluateTrophies(
  tierId: number,
  stats: MatchStats,
  earned: ReadonlyArray<string>,
): string[] {
  const has = new Set(earned);
  return trophiesOf(tierId)
    .filter((t) => !has.has(t.id) && t.test(stats))
    .map((t) => t.id);
}

/** 이 리그의 트로피를 다 모았는가(= 다음 리그 해금 조건). */
export function isLeagueCleared(tierId: number, earned: ReadonlyArray<string>): boolean {
  const all = trophiesOf(tierId);
  if (all.length === 0) return false;
  const has = new Set(earned);
  return all.every((t) => has.has(t.id));
}
