/**
 * reward/data — CashPOP 리워드 셸의 목(mock) 데이터.
 *   Phase A(프론트 mock) 전용. Phase B(백엔드) 에서 서버 응답으로 교체.
 *   제공된 CashPOP 디자인 목업 기준: 통화=캐시(원) 단일, 미션=순서대로 나열되는 리스트.
 */

/** 미션 종류 — 완료 시 처리 분기. */
export type MissionKind = 'attend' | 'ad' | 'roulette' | 'invite' | 'coupon' | 'game';

/** 오늘의 미션 1건(순서대로 배열되는 리스트 항목). */
export interface Mission {
  id: string;
  icon: string;
  title: string;
  desc: string;
  /** 고정 보상(원). 0 이면 가변(rewardText 표시). */
  reward: number;
  /** 가변 보상 표기(예: '최대 1,000원'). */
  rewardText?: string;
  /** 버튼 라벨(받기/시청/도전/시작/초대/열기). */
  cta: string;
  kind: MissionKind;
  /** kind==='game' 일 때 연결할 미니게임 id(games.config). */
  gameId?: string;
  /** 완료 시 병행 지급되는 리그 포인트(P). 광고류는 2배 가중(경쟁 구조가 광고 시청을 견인). */
  pts: number;
}

/** 오늘의 미션 — 위에서 아래로 '순서대로' 수행하는 리스트. 게임 미션이 중간에 편입된다. */
export const MISSIONS: readonly Mission[] = [
  { id: 'attend', icon: '📅', title: '출석 체크', desc: '매일 접속하고 캐시 받기', reward: 100, cta: '받기', kind: 'attend', pts: 50 },
  { id: 'ad1', icon: '📺', title: '광고 시청', desc: '광고 보고 캐시 적립', reward: 50, cta: '시청', kind: 'ad', pts: 100 },
  { id: 'game-store', icon: '🏪', title: '미니게임 · 열정편의점', desc: '한 판 플레이하고 캐시 적립', reward: 100, cta: '시작', kind: 'game', gameId: 'store', pts: 80 },
  { id: 'roulette', icon: '🎡', title: '행운 룰렛', desc: '룰렛을 돌려 캐시 획득', reward: 0, rewardText: '최대 1,000원', cta: '도전', kind: 'roulette', pts: 50 },
  { id: 'game-fishing', icon: '🎣', title: '미니게임 · Fish & Go', desc: '한 판 플레이하고 캐시 적립', reward: 100, cta: '시작', kind: 'game', gameId: 'fishing', pts: 80 },
  { id: 'invite', icon: '🧑‍🤝‍🧑', title: '친구 초대', desc: '친구 초대하고 캐시 받기', reward: 500, cta: '초대', kind: 'invite', pts: 100 },
  { id: 'ad2', icon: '📺', title: '보너스 광고', desc: '한 번 더 보고 추가 적립', reward: 80, cta: '시청', kind: 'ad', pts: 100 },
  { id: 'coupon', icon: '🎟️', title: '쿠폰 등록', desc: '보유 쿠폰 등록하고 적립', reward: 0, rewardText: '쿠폰함', cta: '열기', kind: 'coupon', pts: 0 },
];

/** 오늘의 적립 목표(원) — 적립 현황 진행바. */
export const GOAL_WON = 2000;

/** 최소 출금 금액(원). */
export const WITHDRAW_MIN = 100;

/** 룰렛 보상 후보(원) — mock. */
export const ROULETTE_PRIZES = [0, 50, 100, 200, 500, 1000] as const;

/* ─────────── 리그(주간 시즌 경쟁) — 미션리워드 앱 구조 벤치마크 ───────────
 * 핵심: ① 순위 구간별 계단식 캐시 차등(1위 파격 + 전원 참여보상)
 *       ② 포인트(P)는 미션·광고 완료로만 획득(광고 2배 가중)
 *       ③ 주사위 = P 가속 부스터. 광고 시청으로 충전(+유료 패키지 mock)
 */

/** 시즌 순위 구간별 보상(원). from~to 순위 포함, 위에서부터 탐색. */
export interface LeagueTier {
  from: number;
  to: number;
  cash: number;
}

/** 시즌 보상표 — 총원 100명(나+봇 99) 기준 계단식 차등. */
export const LEAGUE_TIERS: readonly LeagueTier[] = [
  { from: 1, to: 1, cash: 10000 },
  { from: 2, to: 3, cash: 5000 },
  { from: 4, to: 10, cash: 2000 },
  { from: 11, to: 30, cash: 1000 },
  { from: 31, to: 60, cash: 500 },
  { from: 61, to: 100, cash: 200 },
];

/** 시즌 참여(P>0) 전원 보상(원) — 순위 보상과 별도 합산. */
export const LEAGUE_JOIN_CASH = 100;

/** 리그 총원(나 포함). */
export const LEAGUE_SIZE = 100;

/** 광고 1회 시청 → 주사위 지급 개수. */
export const AD_DICE = 2;

/** 광고 1회 시청 → 리그 P(일반 미션의 2배 가중 — 광고가 순위 경쟁의 주 연료). */
export const AD_PTS = 100;

/** 주사위 1개 굴리기: P = 눈(1~6) × ROLL_MULT, 6이 나오면 잭팟 보너스 +ROLL_JACKPOT. */
export const ROLL_MULT = 20;
export const ROLL_JACKPOT = 60;

/** 주사위 충전 패키지(mock 인앱) — 대량일수록 보너스 비율 체증(₩990~₩9,900). */
export interface DicePack {
  n: number;
  bonus: number;
  priceWon: number;
  tag?: string;
}
export const DICE_PACKS: readonly DicePack[] = [
  { n: 10, bonus: 0, priceWon: 990 },
  { n: 30, bonus: 5, priceWon: 2490, tag: '인기' },
  { n: 70, bonus: 15, priceWon: 4990, tag: '추천' },
  { n: 150, bonus: 50, priceWon: 9900, tag: '최고혜택' },
];

/** 신규 진입 체험용 기본 주사위. */
export const DICE_START = 3;

/** 시간대 보너스(아침/점심/저녁) — 해당 시간대엔 P 적립 배수 적용(하루 접속 리듬 설계). */
export const SLOT_BONUS_MULT = 1.5;

/** 게임 미션 최소 플레이 시간(ms) — 같은 창 이동 후 이보다 빨리 복귀하면 미지급(mock 판정). */
export const GAME_MIN_PLAY_MS = 20000;

/** 모의 광고 시청 시간(초) — 데모 5초. 실서비스는 광고 SDK 영상(15~30초)으로 교체. */
export const AD_DURATION_S = 5;
