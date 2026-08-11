/**
 * 리그(티어) — 난이도 다이얼 + 로비 리그 카드에 표시할 정보. 순수 로직(Phaser 무관, 테스트 대상).
 *
 * 원래 PlayScene 안에 있던 티어 표를 이리로 옮겼다 — 로비(리그 전환 버튼)와 플레이 화면(투구
 * 난이도)이 **같은 표**를 봐야 하는데, 로비가 PlayScene 을 import 하면 씬 하나 때문에 게임 전체가
 * 딸려 오기 때문이다.
 *
 * 난이도 파라미터("구질에 따른 속도 변화를 리그 티어레벨에 따라 큰 편차로 두고 싶다" — 사용자
 * 요청). 예시로 주신 "직구 110~165km/h"에 맞춰 5단계로 잡았다(PC 기준 km/h — 모바일은 기준
 * 구속이 달라 그대로 비례 적용됨).
 *  · speedMult: 투구 시간에 곱함(작을수록 빠름=어려움).
 *  · breakMult: 슬라이더/커브의 꺾임 폭에 곱함(클수록 예리하게 꺾여 더 어려움).
 *  · offspeedWeightMult: 변화구(슬라이더/커브/체인지업) 등장 가중치 배율(클수록 변화구 비중↑).
 *
 * entryFee·reward 는 economy.ts 가 실제로 차감·지급한다(입장료가 곧 재도전 게이트).
 * 접속중 인원(online)만 아직 표시 전용 자리표시자다 — 실시간 값이 생기면 그때 연결.
 *
 * 리그 이동은 **트로피 승급 게이트**로 막힌다(trophies.ts/trophyStore.ts) — 아래 stepLeagueTier 참조.
 */
import { highestUnlockedTier } from './trophyStore.js';

export interface LeagueTierDef {
  readonly id: number;
  /** 리그 이름 — 로비 카드 제목에 그대로 쓴다. */
  readonly label: string;
  readonly speedMult: number;
  readonly breakMult: number;
  readonly offspeedWeightMult: number;
  /** 카드 표시용(전용) — 입장료 코인. */
  readonly entryFee: number;
  /** 카드 표시용(전용) — 보상 코인. 입장료 × REWARD_MULTIPLIER 로 자동 산출된다. */
  readonly reward: number;
  /** 카드 표시용(전용) — 접속 인원(자리표시자). */
  readonly online: number;
}

/**
 * 보상 = 입장료 × 이 배율(사용자 요청: "입장료에 비하여 보상은 1.5배"). 표에 값을 따로 적지 않고
 * **입장료에서 파생**시킨다 — 두 값을 각각 적어 두면 한쪽만 고쳤을 때 배율이 조용히 깨진다.
 */
export const REWARD_MULTIPLIER = 1.5;

/** 표에 직접 적는 항목 — reward 는 entryFee 에서 파생되므로 뺀다. */
type LeagueTierSpec = Omit<LeagueTierDef, 'reward'>;

const TIER_SPECS: readonly LeagueTierSpec[] = [
  { id: 1, label: '신인리그', speedMult: 1.15, breakMult: 0.8, offspeedWeightMult: 0.7, entryFee: 500, online: 2140 }, // PC ≈96km/h
  { id: 2, label: '클럽리그', speedMult: 1.0, breakMult: 0.9, offspeedWeightMult: 0.85, entryFee: 2500, online: 879 }, // PC ≈110km/h(기존 기본값)
  { id: 3, label: '세미프로리그', speedMult: 0.88, breakMult: 1.0, offspeedWeightMult: 1.0, entryFee: 8000, online: 412 }, // PC ≈125km/h
  { id: 4, label: '프로리그', speedMult: 0.78, breakMult: 1.15, offspeedWeightMult: 1.2, entryFee: 20000, online: 168 }, // PC ≈141km/h
  { id: 5, label: '월드클래스', speedMult: 0.667, breakMult: 1.3, offspeedWeightMult: 1.4, entryFee: 50000, online: 57 }, // PC ≈165km/h
];

export const LEAGUE_TIERS: readonly LeagueTierDef[] = TIER_SPECS.map((t) => ({
  ...t,
  reward: Math.round(t.entryFee * REWARD_MULTIPLIER),
}));

/**
 * 기본 리그 = **신인리그(Tier1)**. 예전엔 클럽리그(Tier2)였지만, 트로피 승급 게이트가 생기면서
 * 처음 시작한 사람에게는 아직 열리지 않은 리그가 기본값이 되어 버렸다(신인리그 트로피 5개를
 * 모아야 클럽이 열린다). 성장 구조상 맨 아래에서 시작하는 게 맞다.
 */
const DEFAULT_TIER_INDEX = 0;

let currentIndex = DEFAULT_TIER_INDEX;

export function getLeagueTier(): LeagueTierDef {
  return LEAGUE_TIERS[currentIndex];
}

/** 티어 id 로 설정 — 허브/라이브옵스 등 외부에서 부를 훅. 잘못된 id 는 무시(방어적). */
export function setLeagueTier(tierId: number): void {
  const idx = LEAGUE_TIERS.findIndex((t) => t.id === tierId);
  if (idx >= 0) currentIndex = idx;
}

/**
 * 갈 수 있는 가장 높은 리그의 인덱스 — **트로피 승급 게이트**(사용자 결정: "트로피 5개 획득 시
 * 상위리그"). 예전엔 좌우 버튼으로 아무 리그나 갈 수 있어 리그가 성장이 아니라 난이도 선택기였다.
 * 이제 트로피를 다 모은 리그의 다음까지만 열리고, **하위 리그는 자유롭게 오갈 수 있다**
 * (코인 벌이·쉬운 트로피 재도전용 — 이미 딴 트로피는 다시 안 쌓이므로 파밍이 되지 않는다).
 */
function maxUnlockedIndex(): number {
  const unlockedId = highestUnlockedTier(LEAGUE_TIERS.map((t) => t.id));
  const idx = LEAGUE_TIERS.findIndex((t) => t.id === unlockedId);
  return idx >= 0 ? idx : 0;
}

/**
 * 한 칸 이동(로비 좌/우 버튼). 양 끝에서는 **멈춘다** — 순환시키면 최고 난이도에서 오른쪽을 한 번
 * 더 눌렀을 때 최저 난이도로 떨어져, 리그가 한 줄로 늘어선 화면에서 방향 감각이 깨진다.
 * 위쪽 한계는 배열 끝이 아니라 **해금된 리그**다.
 * @returns 실제로 바뀌었으면 true.
 */
export function stepLeagueTier(step: number): boolean {
  const next = Math.min(maxUnlockedIndex(), Math.max(0, currentIndex + step));
  if (next === currentIndex) return false;
  currentIndex = next;
  return true;
}

/** 이 방향으로 더 갈 수 있는가(버튼 활성/비활성 표시용). */
export function canStepLeagueTier(step: number): boolean {
  const next = currentIndex + step;
  return next >= 0 && next <= maxUnlockedIndex();
}

/** 아직 안 열린 리그를 보고 있으면 열린 최고 리그로 되돌린다(저장값·URL 로 앞서간 경우 방어). */
export function clampLeagueTierToUnlocked(): void {
  const max = maxUnlockedIndex();
  if (currentIndex > max) currentIndex = max;
}

/**
 * 개발용 — URL 쿼리(?tier=1~5)로 즉시 티어를 바꿔 테스트한다. 로비 UI 가 생긴 뒤에도 남겨 둔다
 * (플레이 화면만 직접 열어 확인할 때 유용).
 */
export function initLeagueTierFromUrl(): void {
  if (typeof window === 'undefined') return;
  clampLeagueTierToUnlocked(); // URL 로 안 열린 리그를 지정해도 해금 범위를 넘지 않게.
  const raw = new URLSearchParams(window.location.search).get('tier');
  const id = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(id)) setLeagueTier(id);
}

/** 카드에 쓰는 천단위 구분 표기(예: 2500 → "2,500"). */
export function formatLeagueNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
