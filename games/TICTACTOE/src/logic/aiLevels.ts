/**
 * 싱글플레이 AI 등급 **30단계** — 저레벨에서 고레벨까지(2026-08-05 10→20 세분화).
 *
 * 강도 조절은 두 손잡이로만 한다:
 *   depth      — 몇 수 앞을 읽는가(깊을수록 함정을 본다)
 *   tolerance  — 최선수와 몇 점 차이까지 허용하는가(넓을수록 "사람처럼" 두다 손해를 본다)
 *
 * ⚠️ **깊이는 짝수만 쓴다.** 홀수 깊이는 탐색이 자기 수로 끝나 평가가 낙관적으로 치우쳐
 * (호라이즌 파리티) 한 단계 위 등급보다 오히려 약해지는 역전이 생긴다 — 실측으로 확인.
 * 그래서 깊이는 2·4·6·8·10 다섯 계단만 쓰고(등급 4개씩 한 묶음), 묶음 안에서는
 * tolerance(60→0)로 갈라 **Lv.20 까지** 만든다.
 *
 * ⚠️ **강도는 Lv.20(depth 10·tolerance 0)에서 포화한다** — 실측상 더 깊게 봐도 안 세진다.
 * 그래서 Lv.21~30 은 강도가 아니라 **압박 축**으로 어려워진다:
 *   · Lv.11~   선공 교차(이 룰은 선공이 구조적으로 유리 — 후공을 잡는 판이 진짜 시험대)
 *   · Lv.21~   턴 제한시간이 등급당 1초씩 감소(20초 → Lv.30 은 10초)
 *
 * ⚠️ **1레벨도 멍청하지 않다.** negamax 가 깊이보다 승패를 먼저 판정하므로 depth 2 면
 * "자기 즉승은 반드시 두고, 상대의 3목은 반드시 막는다"가 보장된다. 즉승/필패 수는
 * ±100000 점이라 어떤 tolerance 로도 후보 밖으로 밀려나지 않는다. 낮은 레벨은
 * **전술적 실수를 하는 게 아니라, 자리싸움(위치 선택)이 헐거울 뿐**이다.
 */

export interface AiLevel {
  /** 1..10 */
  readonly level: number;
  /** 화면에 보여줄 등급명. */
  readonly name: string;
  /** 한 줄 소개(결과 화면·안내용). */
  readonly blurb: string;
  /** 네가맥스 탐색 깊이. */
  readonly depth: number;
  /** 최선수 대비 허용 점수폭(작을수록 정확). */
  readonly tolerance: number;
  /**
   * 다음 등급으로 오르는 데 필요한 **이 등급에서의 승수**.
   * 5승에서 시작해 등급마다 +1승, **10승에서 멈춘다**(`WINS_CAP`, 2026-08-05 유저 확정
   * "10승 이상으로 올리지 말 것"). 즉 Lv.1~6 = 5·6·7·8·9·10승, Lv.7 이상은 전부 10승.
   * 상위 등급은 승수가 아니라 압박 축(선공 교차·제한시간 감소)으로 어려워진다.
   */
  readonly winsToAdvance: number;
  /**
   * 이 등급의 턴 제한시간(초). Lv.1~20 은 20초, **Lv.21 부터 등급당 1초씩 줄어** Lv.30 은 10초.
   */
  readonly turnSeconds: number;
  /**
   * 선공을 교차로 진행하는가 — **Lv.11 부터 true**. 이 룰은 선공이 구조적으로 유리해서,
   * 매판 사람이 선공이면 상위 등급이라도 물러진다. 한 판씩 번갈아 두게 해서 압박을 준다.
   */
  readonly alternateFirst: boolean;
}

/** 이 등급부터 선공을 교차한다. */
export const ALTERNATE_FIRST_FROM = 11;
/** 이 등급부터 턴 제한시간이 1초씩 줄어든다. */
export const TIME_PRESSURE_FROM = 21;
/**
 * 이 등급부터 **화면 안내를 끊는다**(2026-08-05 유저 확정) — 붉은 위험 박스(컴퓨터가 다음 턴에
 * 3목을 만드는 자리)도, "바로 이길 수 있는 칸이 있다"는 놓친 승리 경고도 띄우지 않는다.
 * 세 번째 압박 축이다: 선공 교차(11) → 안내 차단(20) → 제한시간 감소(21).
 */
export const HINTS_OFF_FROM = 20;
/** 기본 턴 제한시간(초). */
export const TURN_SECONDS_BASE = 20;
/** 승급 요구 승수의 상한 — 어떤 등급도 이 이상을 요구하지 않는다. */
export const WINS_CAP = 10;

/** 승급에 필요한 승수의 시작값(Lv.1). 등급이 1 오를 때마다 1승씩 붙는다. */
export const WINS_BASE = 5;

export const AI_LEVELS: readonly AiLevel[] = [
  {
    level: 1,
    name: '훈련봇',
    blurb: '이길 자리와 막을 자리는 압니다',
    depth: 2,
    tolerance: 60,
    winsToAdvance: Math.min(WINS_BASE + 0, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE,
    alternateFirst: false,
  },
  {
    level: 2,
    name: '연습생',
    blurb: '한 수 앞을 봅니다',
    depth: 2,
    tolerance: 48,
    winsToAdvance: Math.min(WINS_BASE + 1, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE,
    alternateFirst: false,
  },
  {
    level: 3,
    name: '견습생',
    blurb: '빈 칸을 고를 줄 압니다',
    depth: 2,
    tolerance: 38,
    winsToAdvance: Math.min(WINS_BASE + 2, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE,
    alternateFirst: false,
  },
  {
    level: 4,
    name: '수련생',
    blurb: '자리싸움을 시작합니다',
    depth: 2,
    tolerance: 30,
    winsToAdvance: Math.min(WINS_BASE + 3, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE,
    alternateFirst: false,
  },
  {
    level: 5,
    name: '초급검사',
    blurb: '두 수 앞의 노림을 봅니다',
    depth: 4,
    tolerance: 24,
    winsToAdvance: Math.min(WINS_BASE + 4, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE,
    alternateFirst: false,
  },
  {
    level: 6,
    name: '정예대원',
    blurb: '허술한 수는 줄었습니다',
    depth: 4,
    tolerance: 20,
    winsToAdvance: Math.min(WINS_BASE + 5, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE,
    alternateFirst: false,
  },
  {
    level: 7,
    name: '결투가',
    blurb: '줄을 끊을 자리를 압니다',
    depth: 4,
    tolerance: 17,
    winsToAdvance: Math.min(WINS_BASE + 6, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE,
    alternateFirst: false,
  },
  {
    level: 8,
    name: '검투사',
    blurb: '이동 뒤의 빈칸까지 셉니다',
    depth: 4,
    tolerance: 14,
    winsToAdvance: Math.min(WINS_BASE + 7, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE,
    alternateFirst: false,
  },
  {
    level: 9,
    name: '상급검사',
    blurb: '세 수 앞을 내다봅니다',
    depth: 6,
    tolerance: 12,
    winsToAdvance: Math.min(WINS_BASE + 8, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE,
    alternateFirst: false,
  },
  {
    level: 10,
    name: '정예검사',
    blurb: '흐름을 읽기 시작합니다',
    depth: 6,
    tolerance: 10,
    winsToAdvance: Math.min(WINS_BASE + 9, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE,
    alternateFirst: false,
  },
  {
    level: 11,
    name: '기사',
    blurb: '여기서부터 선공을 번갈아 잡습니다',
    depth: 6,
    tolerance: 9,
    winsToAdvance: Math.min(WINS_BASE + 10, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE,
    alternateFirst: true,
  },
  {
    level: 12,
    name: '기사단원',
    blurb: '함정을 파기 시작합니다',
    depth: 6,
    tolerance: 8,
    winsToAdvance: Math.min(WINS_BASE + 11, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE,
    alternateFirst: true,
  },
  {
    level: 13,
    name: '기사단장',
    blurb: '네 수 앞을 계산합니다',
    depth: 8,
    tolerance: 7,
    winsToAdvance: Math.min(WINS_BASE + 12, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE,
    alternateFirst: true,
  },
  {
    level: 14,
    name: '검성',
    blurb: '빈틈을 노려 파고듭니다',
    depth: 8,
    tolerance: 6,
    winsToAdvance: Math.min(WINS_BASE + 13, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE,
    alternateFirst: true,
  },
  {
    level: 15,
    name: '대검성',
    blurb: '거의 흔들리지 않습니다',
    depth: 8,
    tolerance: 5,
    winsToAdvance: Math.min(WINS_BASE + 14, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE,
    alternateFirst: true,
  },
  {
    level: 16,
    name: '수호자',
    blurb: '실수를 하지 않습니다',
    depth: 8,
    tolerance: 4,
    winsToAdvance: Math.min(WINS_BASE + 15, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE,
    alternateFirst: true,
  },
  {
    level: 17,
    name: '대마스터',
    blurb: '다섯 수 앞을 봅니다',
    depth: 10,
    tolerance: 3,
    winsToAdvance: Math.min(WINS_BASE + 16, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE,
    alternateFirst: true,
  },
  {
    level: 18,
    name: '그랜드마스터',
    blurb: '수읽기로 몰아붙입니다',
    depth: 10,
    tolerance: 2,
    winsToAdvance: Math.min(WINS_BASE + 17, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE,
    alternateFirst: true,
  },
  {
    level: 19,
    name: '전설',
    blurb: '빈틈이 보이지 않습니다',
    depth: 10,
    tolerance: 1,
    winsToAdvance: Math.min(WINS_BASE + 18, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE,
    alternateFirst: true,
  },
  {
    level: 20,
    name: '네온로드',
    blurb: '틈이 없습니다',
    depth: 10,
    tolerance: 0,
    winsToAdvance: Math.min(WINS_BASE + 19, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE,
    alternateFirst: true,
  },
  {
    level: 21,
    name: '잔상검사',
    blurb: '여기서부터 시간이 줄어듭니다',
    depth: 10,
    tolerance: 0,
    winsToAdvance: Math.min(WINS_BASE + 20, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE - 1,
    alternateFirst: true,
  },
  {
    level: 22,
    name: '폭풍검객',
    blurb: '생각할 틈을 주지 않습니다',
    depth: 10,
    tolerance: 0,
    winsToAdvance: Math.min(WINS_BASE + 21, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE - 2,
    alternateFirst: true,
  },
  {
    level: 23,
    name: '섬광검사',
    blurb: '한순간에 승부가 갈립니다',
    depth: 10,
    tolerance: 0,
    winsToAdvance: Math.min(WINS_BASE + 22, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE - 3,
    alternateFirst: true,
  },
  {
    level: 24,
    name: '초신성',
    blurb: '압박이 더 거세집니다',
    depth: 10,
    tolerance: 0,
    winsToAdvance: Math.min(WINS_BASE + 23, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE - 4,
    alternateFirst: true,
  },
  {
    level: 25,
    name: '시간사냥꾼',
    blurb: '시계가 적입니다',
    depth: 10,
    tolerance: 0,
    winsToAdvance: Math.min(WINS_BASE + 24, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE - 5,
    alternateFirst: true,
  },
  {
    level: 26,
    name: '광속검',
    blurb: '손이 눈보다 빨라야 합니다',
    depth: 10,
    tolerance: 0,
    winsToAdvance: Math.min(WINS_BASE + 25, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE - 6,
    alternateFirst: true,
  },
  {
    level: 27,
    name: '영원기사',
    blurb: '실수 한 번이 곧 패배입니다',
    depth: 10,
    tolerance: 0,
    winsToAdvance: Math.min(WINS_BASE + 26, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE - 7,
    alternateFirst: true,
  },
  {
    level: 28,
    name: '절대검',
    blurb: '완벽한 수읽기 + 촉박한 시간',
    depth: 10,
    tolerance: 0,
    winsToAdvance: Math.min(WINS_BASE + 27, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE - 8,
    alternateFirst: true,
  },
  {
    level: 29,
    name: '무한검제',
    blurb: '거의 남지 않은 시간',
    depth: 10,
    tolerance: 0,
    winsToAdvance: Math.min(WINS_BASE + 28, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE - 9,
    alternateFirst: true,
  },
  {
    level: 30,
    name: '오메가로드',
    blurb: '최후의 상대 — 10초',
    depth: 10,
    tolerance: 0,
    winsToAdvance: Math.min(WINS_BASE + 29, WINS_CAP),
    turnSeconds: TURN_SECONDS_BASE - 10,
    alternateFirst: true,
  },
];

export const AI_LEVEL_MIN = 1;
export const AI_LEVEL_MAX = AI_LEVELS.length;

/** 범위를 벗어난 값도 안전하게 — 저장값이 깨져도 게임이 돌아가야 한다. */
export function aiLevelAt(level: number): AiLevel {
  const i = Math.min(AI_LEVEL_MAX, Math.max(AI_LEVEL_MIN, Math.floor(level || AI_LEVEL_MIN)));
  return AI_LEVELS[i - 1];
}

/** "Lv.3 수련생" — HUD 표기. */
export function aiLevelLabel(level: number): string {
  const lv = aiLevelAt(level);
  return `Lv.${lv.level} ${lv.name}`;
}

/** 이 등급에서 다음 등급으로 오르는 데 필요한 승수(저장값이 깨져도 안전). */
export function winsToAdvanceFor(level: number): number {
  return aiLevelAt(level).winsToAdvance;
}

/** 이 등급의 턴 제한시간(ms). */
export function turnMsFor(level: number): number {
  return aiLevelAt(level).turnSeconds * 1000;
}

/** 이 등급에서 선공을 교차하는가. */
export function alternatesFirst(level: number): boolean {
  return aiLevelAt(level).alternateFirst;
}

/** 이 등급에서 화면 안내(위험 박스·놓친 승리 경고)를 보여 주는가 — Lv.20 부터 끊긴다. */
export function showsHints(level: number): boolean {
  return aiLevelAt(level).level < HINTS_OFF_FROM;
}
