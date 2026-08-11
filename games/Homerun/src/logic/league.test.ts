/**
 * 리그(티어) 로직 테스트 — 로비의 좌/우 전환 버튼과 플레이 화면의 난이도가 **같은 표**를 본다.
 * 전역 상태(현재 티어)를 쓰므로 매 테스트 전에 기본값으로 되돌린다.
 *
 * 리그 이동은 **트로피 승급 게이트**로 막힌다(사용자 결정: "트로피 5개 획득 시 상위리그").
 * 그래서 이동 테스트는 트로피 저장소(localStorage)를 함께 준비해야 한다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  LEAGUE_TIERS,
  REWARD_MULTIPLIER,
  canStepLeagueTier,
  clampLeagueTierToUnlocked,
  formatLeagueNumber,
  getLeagueTier,
  setLeagueTier,
  stepLeagueTier,
} from './league.js';
import { grantTrophies } from './trophyStore.js';
import { trophiesOf } from './trophies.js';

const DEFAULT_TIER_ID = 1; // 신인리그 — 승급 게이트 도입으로 기본값이 맨 아래로 내려왔다.

/** vitest 기본 환경(Node)엔 localStorage 가 없다 — 트로피 저장소가 실제 경로를 타게 심어 준다. */
function installLocalStorageMock(): void {
  const store = new Map<string, string>();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
}

/** 해당 리그의 트로피를 전부 지급 — 그 위 리그를 연다. */
function clearLeague(tierId: number): void {
  grantTrophies(tierId, trophiesOf(tierId).map((t) => t.id));
}

beforeEach(() => {
  installLocalStorageMock();
  setLeagueTier(DEFAULT_TIER_ID);
});

describe('리그 표', () => {
  it('기본 리그는 신인리그 — 승급 게이트가 생겨 맨 아래에서 시작한다', () => {
    // 예전 기본값은 클럽리그였는데, 새로 시작한 사람에게는 아직 안 열린 리그가 기본이 돼 버렸다.
    expect(getLeagueTier().id).toBe(DEFAULT_TIER_ID);
    expect(getLeagueTier().label).toBe('신인리그');
    expect(getLeagueTier().speedMult).toBe(1.15);
  });

  it('티어가 올라갈수록 어려워진다 — 구속↑(speedMult↓)·꺾임↑·변화구 비중↑', () => {
    for (let i = 1; i < LEAGUE_TIERS.length; i += 1) {
      expect(LEAGUE_TIERS[i].speedMult).toBeLessThan(LEAGUE_TIERS[i - 1].speedMult);
      expect(LEAGUE_TIERS[i].breakMult).toBeGreaterThan(LEAGUE_TIERS[i - 1].breakMult);
      expect(LEAGUE_TIERS[i].offspeedWeightMult).toBeGreaterThan(LEAGUE_TIERS[i - 1].offspeedWeightMult);
    }
  });

  it('id 는 1..N 로 빠짐없이 이어진다 — 카드/URL 파라미터가 id 를 그대로 쓴다', () => {
    expect(LEAGUE_TIERS.map((t) => t.id)).toEqual(LEAGUE_TIERS.map((_, i) => i + 1));
  });

  it('상위 리그일수록 입장료·보상이 크고 접속 인원은 적다', () => {
    for (let i = 1; i < LEAGUE_TIERS.length; i += 1) {
      expect(LEAGUE_TIERS[i].entryFee).toBeGreaterThan(LEAGUE_TIERS[i - 1].entryFee);
      expect(LEAGUE_TIERS[i].reward).toBeGreaterThan(LEAGUE_TIERS[i - 1].reward);
      expect(LEAGUE_TIERS[i].online).toBeLessThan(LEAGUE_TIERS[i - 1].online);
    }
  });

  it('보상은 모든 리그에서 입장료의 1.5배(사용자 요청)', () => {
    expect(REWARD_MULTIPLIER).toBe(1.5);
    for (const t of LEAGUE_TIERS) {
      expect(t.reward).toBe(Math.round(t.entryFee * REWARD_MULTIPLIER));
    }
    // 표기까지 확인 — 카드에 그대로 찍히는 값이다.
    expect(formatLeagueNumber(LEAGUE_TIERS[1].reward)).toBe('3,750'); // 클럽리그 2,500 → 3,750
  });
});

describe('setLeagueTier', () => {
  it('id 로 바꾼다', () => {
    setLeagueTier(4);
    expect(getLeagueTier().id).toBe(4);
  });

  it('없는 id 는 무시한다 — 잘못된 URL 파라미터로 리그가 깨지지 않게', () => {
    setLeagueTier(99);
    expect(getLeagueTier().id).toBe(DEFAULT_TIER_ID);
  });
});

describe('stepLeagueTier (로비 좌/우 버튼)', () => {
  it('해금된 범위 안에서 한 칸씩 오르내린다', () => {
    clearLeague(1); // 신인리그 완료 → 클럽리그 열림
    expect(stepLeagueTier(+1)).toBe(true);
    expect(getLeagueTier().id).toBe(2);
    expect(stepLeagueTier(-1)).toBe(true);
    expect(getLeagueTier().id).toBe(1);
  });

  it('양 끝에서는 멈춘다 — 순환시키면 최고에서 최저로 떨어져 방향 감각이 깨진다', () => {
    for (const t of LEAGUE_TIERS) clearLeague(t.id); // 전 리그 해금
    setLeagueTier(LEAGUE_TIERS[LEAGUE_TIERS.length - 1].id);
    expect(stepLeagueTier(+1)).toBe(false);
    expect(getLeagueTier().id).toBe(LEAGUE_TIERS[LEAGUE_TIERS.length - 1].id);

    setLeagueTier(LEAGUE_TIERS[0].id);
    expect(stepLeagueTier(-1)).toBe(false);
    expect(getLeagueTier().id).toBe(LEAGUE_TIERS[0].id);
  });

  it('canStepLeagueTier 가 버튼 활성 상태와 일치한다', () => {
    for (const t of LEAGUE_TIERS) clearLeague(t.id);
    setLeagueTier(LEAGUE_TIERS[0].id);
    expect(canStepLeagueTier(-1)).toBe(false);
    expect(canStepLeagueTier(+1)).toBe(true);

    setLeagueTier(LEAGUE_TIERS[LEAGUE_TIERS.length - 1].id);
    expect(canStepLeagueTier(-1)).toBe(true);
    expect(canStepLeagueTier(+1)).toBe(false);
  });
});

/**
 * 승급 게이트 — 리그가 "난이도 선택기"가 아니라 성장축이 되게 하는 핵심 규칙이다.
 * 트로피를 다 모으기 전에는 위로 못 가고, 이미 지나온 리그는 자유롭게 오갈 수 있어야 한다
 * (하위 리그는 코인 벌이용 — 이미 딴 트로피는 다시 안 쌓이므로 파밍이 되지 않는다).
 */
describe('트로피 승급 게이트', () => {
  it('트로피가 없으면 상위 리그로 못 간다', () => {
    expect(canStepLeagueTier(+1)).toBe(false);
    expect(stepLeagueTier(+1)).toBe(false);
    expect(getLeagueTier().id).toBe(1);
  });

  it('트로피를 일부만 모아도 열리지 않는다 — 5개를 다 채워야 한다', () => {
    const ids = trophiesOf(1).map((t) => t.id);
    grantTrophies(1, ids.slice(0, ids.length - 1));
    expect(canStepLeagueTier(+1)).toBe(false);
    grantTrophies(1, ids); // 마지막 하나까지
    expect(canStepLeagueTier(+1)).toBe(true);
  });

  it('중간 리그를 건너뛰지 않는다 — 3리그를 깨도 2리그를 안 깼으면 안 열린다', () => {
    clearLeague(3);
    setLeagueTier(1);
    expect(canStepLeagueTier(+1)).toBe(false);
  });

  it('해금된 뒤에는 하위 리그로 자유롭게 내려갈 수 있다', () => {
    clearLeague(1);
    clearLeague(2);
    setLeagueTier(3);
    expect(stepLeagueTier(-1)).toBe(true);
    expect(getLeagueTier().id).toBe(2);
  });

  it('안 열린 리그를 보고 있으면 해금 범위로 되돌린다', () => {
    setLeagueTier(5); // 저장값·URL 등으로 앞서간 상태
    clampLeagueTierToUnlocked();
    expect(getLeagueTier().id).toBe(1);
  });
});

describe('formatLeagueNumber', () => {
  it('천단위 구분 — 카드의 기존 표기(2,500)와 같은 형식', () => {
    expect(formatLeagueNumber(2500)).toBe('2,500');
    expect(formatLeagueNumber(879)).toBe('879');
    expect(formatLeagueNumber(50000)).toBe('50,000');
  });
});
