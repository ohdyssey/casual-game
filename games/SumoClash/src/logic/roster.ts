/**
 * 로스터 — 유닛/적/특수기 정적 스펙 테이블과 1스테이지 정의.
 *   밸런싱은 전부 여기서 조정한다(매직넘버 코드 산재 금지). 값은 밀어내기 모델 v2 자리표시자.
 *
 * 힘(power) 감각: 스크럼에서 레인 내 연결 유닛의 power 총합 차이가 밀림 속도.
 *   끝선 돌파 시 게이지 피해도 power 비례(battle.PUSHOUT_DAMAGE_K).
 */
import {
  type AbilityKind,
  type AbilitySpec,
  type StageDef,
  type UnitKind,
  type UnitSpec,
} from './types.js';

/**
 * 아군 유닛 6직업 — 번호=직업 고정(1P 2T 3S 4H 5B 6C, 에셋 Chr_me_0N/UI_015-0N 과 1:1).
 *   전원 전진(밀어내기 모델). 아군 발이 적보다 확연히 빠르다 — 교전선이 중앙~적진에 형성.
 *   설계 원칙(v3 — 전략 시뮬레이션 튜닝, design/sim-strategies.mts 로 검증):
 *   1) 마나 효율 축(밀기 힘/㎃ · 기력/㎃ · 특수)에서 **직업당 1등은 하나만**.
 *      - pusher: 밀기 효율 기준점 · tank: 기력 방벽 · sprinter: 돌파 러너(pushoutMult)
 *      - healer: 후열 유지 · brawler: 기력 킬러(drainMult) · crusher: 최고 단일 힘+공성(breakMult)
 *   2) **득점(끝선 돌파) 축은 pushoutMult 로 전 직업 명시** — 러너(S)만 본업 득점원.
 *      비득점 직업(0.1~0.15)은 빈 레인 산책이 사실상 무득점 — 잘못 놓은 유닛=낭비가 되어
 *      "아무 데나 배치" 무전략이 게이지 레이스를 공짜로 이기지 못한다.
 *      돌파 피해 = power × pushoutMult × PUSHOUT_DAMAGE_K(0.7):
 *      P 3.2 · T 1.0 · S 11.2 · H 0.6 · B 2.3 · C 10.8 — S 본업, C 는 부업(공성 후 득점).
 *      게이지의 주 수입은 **적 밀어내기(ring-out, 적 power×0.7)** — 스모답게 스크럼 지배가 득점.
 *   3) 발 속도는 "빈 레인 무혈 완주"가 공짜가 되지 않게 — 러너만 빠르고 나머지는 보통.
 *   4) 경제(코스트 3~6 + 정예 바운티 절제)는 물량 융단을 막는다 — 유닛 하나하나가 결정이며,
 *      잘못 놓은 유닛의 기회비용이 커야 배치(레인 선택·이중배치·타이밍)가 실력 축이 된다.
 *   5) **힘 직업은 유리대포(v6)** — 힘(P/B/C)일수록 기력이 얇아 선두에서 오래 못 버틴다.
 *      큐를 힘 위주로만 세우면(힐러/탱커 뒤로) 선두가 드레인에 연쇄로 녹아 체인이 붕괴 —
 *      전선 유지는 벽(T)+치유(H)가 담당해야 한다(힘몰빵 재정렬 지배 방지).
 *   6) **드레인(처치) 축 분리(v7)** — 밀기 전문(P/C)과 러너(S)는 drainMult 0.6~0.7 로
 *      스크럼 처치 기여가 낮다. 처치는 난투(B, ×2.0)의 본업 — "힘=밀기+처치 겸업" 결합을
 *      끊어 힘몰빵이 공격으로 수비를 대체하지 못하게 한다.
 *   7) **직업 가치 등가(v9)** — 힘이 약한 직업은 다른 축이 그만큼 강하다. 6축(밀기·기력·
 *      처치·득점·유지·공성) 챔피언 전담제: 축마다 1등 직업이 정확히 하나(P·T·B·S·H·C).
 *      검증: design/sim-class-value.mts(미시 축 가치·듀얼 역학) + sim-strategies.mts V4
 *      (각 직업 몰빵 플레이의 스테이지 총점 등가 밴드 — 5직업 1% 이내 수렴).
 */
/*
 * 이미지 순서 규약(2026-07-24 사용자 확정): 캐릭터/카드 이미지 번호는
 *   1 Pusher · 2 Tank · 3 **Brawler** · 4 **Sprinter** · 5 **Healer** · 6 Crusher.
 *   (엠블럼 Stl_0N 만 직업 번호 순: 3=S · 4=H · 5=B — 디자이너 레이아웃 페어링으로 확인)
 */
export const UNIT_SPECS: Readonly<Record<UnitKind, UnitSpec>> = {
  pusher: { kind: 'pusher', name: '밀치기', cost: 3, maxHp: 100, power: 30, speed: 55, drainMult: 0.7, pushoutMult: 0.15, art: 'up_SC_Chr_me_01' },
  tank: { kind: 'tank', name: '벽', cost: 4, maxHp: 360, power: 14, speed: 45, pushoutMult: 0.1, art: 'up_SC_Chr_me_02' },
  sprinter: { kind: 'sprinter', name: '돌격', cost: 3, maxHp: 70, power: 16, speed: 115, drainMult: 0.7, pushoutMult: 1.0, art: 'up_SC_Chr_me_04' },
  healer: { kind: 'healer', name: '치유', cost: 4, maxHp: 120, power: 8, speed: 55, heal: 22, healMs: 1100, healRange: 160, pushoutMult: 0.1, art: 'up_SC_Chr_me_05' },
  brawler: { kind: 'brawler', name: '난투', cost: 5, maxHp: 190, power: 22, speed: 68, drainMult: 2.0, pushoutMult: 0.15, art: 'up_SC_Chr_me_03' },
  crusher: { kind: 'crusher', name: '분쇄', cost: 6, maxHp: 230, power: 44, speed: 42, drainMult: 0.6, breakMult: 3, pushoutMult: 0.35, art: 'up_SC_Chr_me_06' },
};

/*
 * 적 전용 스펙 폐지(2026-07-24) — 적도 UNIT_SPECS 의 6직업을 그대로 쓴다.
 *   "갑자기 능력이 뛰어난 적" 금지: 능력치는 직업으로만 결정(양 진영 동일).
 *   난이도·개성은 적 AI(logic/enemyAI.ts)의 경제/페르소나/예산으로만 조절한다.
 */

/** 처치(기력 소진)·밀어내기 보상 마나 — 직업별(양 진영 공통, 절제된 수치). */
export const KILL_BOUNTY: Readonly<Record<UnitKind, number>> = {
  pusher: 1,
  tank: 1,
  sprinter: 1,
  healer: 1,
  brawler: 2,
  crusher: 2,
};

/**
 * 직업 상성 매트릭스(v9 — 미러 클래스판) — 공격 직업 → 상대 직업별 **처치(드레인) 기여 배수**.
 *   스크럼에서 상대 선두가 해당 직업일 때 곱해진다(기본 1). 밀기·파괴 축에는 영향 없음.
 *   양 진영이 같은 표를 쓴다(대칭) — 능력치 동일 원칙 유지.
 *
 *   순환 상성(외우기 쉬운 4문장):
 *     밀치기(P)는 난투(B)를 밀어 세운다 · 난투(B)는 분쇄(C)를 붙잡아 눕힌다
 *     분쇄(C)는 벽(T)을 부순다 · 벽(T)은 돌격(S)을 받아낸다   — P>B>C>T>S
 *   역상성: P는 분쇄(C)에 무력 · B는 날쌘 돌격(S)을 못 잡고 · C도 돌격(S)을 못 쫓는다.
 *   S(러너)·H(치유)는 공격 상성 없음 — 득점/유지 축이 본업.
 *   범위 규약: 0.5 ≤ 배수 ≤ 2 · 피격 직업마다 유리(>1) 공격 직업이 최소 1개.
 */
export const COUNTER_DRAIN: Readonly<Partial<Record<UnitKind, Readonly<Partial<Record<UnitKind, number>>>>>> = {
  pusher: { brawler: 1.4, crusher: 0.7 },
  tank: { sprinter: 1.5, pusher: 1.2 }, // 벽은 돌격·밀치기를 받아 세운다
  brawler: { crusher: 1.5, tank: 1.2, sprinter: 0.7 },
  crusher: { tank: 1.4, healer: 1.3, sprinter: 0.6 }, // 분쇄는 벽과 후열(힐러)을 뭉갠다
};

/** 상성 배수 조회 — attacker 직업이 defender 직업 선두를 상대할 때. 기본 1. */
export function counterDrainMult(attackerKind: string, defenderKind: string | undefined): number {
  if (!defenderKind) return 1;
  return COUNTER_DRAIN[attackerKind as UnitKind]?.[defenderKind as UnitKind] ?? 1;
}

/** 특수기 4종 — 참조 이미지 하단 버튼(코스트 일치). */
export const ABILITY_SPECS: Readonly<Record<AbilityKind, AbilitySpec>> = {
  rally: { kind: 'rally', name: '집결', cost: 3, cooldownMs: 12000 },
  healWave: { kind: 'healWave', name: '치유의 물결', cost: 4, cooldownMs: 15000 },
  attackBoost: { kind: 'attackBoost', name: '힘 강화', cost: 3, cooldownMs: 14000 },
  sumoSpirit: { kind: 'sumoSpirit', name: '스모의 혼', cost: 5, cooldownMs: 25000 },
};

/** 카드 UI 순서(좌측 덱 4슬롯) — 기본 덱. Brawler/Crusher 는 NEXT 큐 로테이션으로 등장(해금 전 티저). */
export const DECK_ORDER: ReadonlyArray<UnitKind> = ['pusher', 'tank', 'sprinter', 'healer'];

/**
 * NEXT 무료 지원군 로테이션 — 결정적 순환(nextUid % len)으로 가중 등장.
 *   기본 4직업 70% · brawler 20% · crusher 10% — 고급 직업을 무료 큐로 맛보게 하는 티저.
 */
export const NEXT_ROTATION: ReadonlyArray<UnitKind> = [
  'pusher', 'tank', 'sprinter', 'healer', 'brawler',
  'pusher', 'tank', 'sprinter', 'healer', 'crusher',
  'pusher', 'brawler', 'tank', 'sprinter', 'healer',
  'brawler', 'pusher', 'crusher', 'tank', 'brawler',
];

/** 특수기 버튼 순서(하단 바). */
export const ABILITY_ORDER: ReadonlyArray<AbilityKind> = ['rally', 'healWave', 'attackBoost', 'sumoSpirit'];

/**
 * 1스테이지 — 지능형 적(대본 스폰 없음).
 *   적은 아군과 같은 6직업·같은 스텟으로, 판마다 다른 페르소나(personaPool×시드)로 싸운다.
 *   플레이어 우위는 경제(회복 2.0 vs 1.7)와 특수기 — 적 지능은 페르소나/예산으로 조절.
 *   중앙 장애물(lane 2, pos 620)은 에디터 마스코트(개+깃발) 위치와 일치 — 공통 초크포인트.
 */
export const STAGE_1: StageDef = {
  id: 'stage_1',
  name: '도장 입구',
  allyBaseHp: 100,
  enemyBaseHp: 100,
  manaRegenPerSec: 2,
  startMana: 8,
  obstacles: [{ lane: 2, pos: 620, durability: 300 }],
  waves: [],
  enemyAI: {
    persona: 'balanced',
    personaPool: ['balanced', 'aggressive', 'defensive', 'counter'],
    manaRegenPerSec: 1.7,
    startMana: 6,
    deployCooldownMs: 6500,
    firstDeployAtMs: 6000,
    maxDeploys: 16,
    seed: 7,
  },
};
