/**
 * 전투 시뮬레이션 검증 — 순수 로직만(렌더 무관).
 *   v10: 적 전용 스펙 폐지 — 적도 아군과 같은 6직업·같은 스텟(미러 클래스).
 *   상대는 지능형 AI(logic/enemyAI) — 페르소나·상황 적응·시드 결정론을 함께 검증한다.
 */
import { describe, expect, it } from 'vitest';
import {
  CHAIN_GAP,
  chainForce,
  createBattle,
  currentNext,
  placeUnit,
  PRESS_GAP,
  PUSHOUT_DAMAGE_K,
  QUEUE_SIZE,
  queuePreview,
  reorderQueue,
  tick,
  TURN_MS,
} from './battle.js';
import {
  ATTACK_BOOST_MULTIPLIER,
  castAbility,
  HEAL_WAVE_AMOUNT,
  RALLY_KNOCKBACK,
  SUMO_SPIRIT_DAMAGE,
} from './abilities.js';
import * as roster from './roster.js';
import { ABILITY_SPECS, KILL_BOUNTY, STAGE_1, UNIT_SPECS } from './roster.js';
import {
  LANE_LENGTH,
  MANA_MAX,
  type BattleState,
  type Combatant,
  type StageDef,
  type UnitKind,
} from './types.js';

/** 테스트용 미니 스테이지 — 대본 스폰 1개(적도 직업), AI 없음, 장애물 없음. */
function miniStage(overrides?: Partial<StageDef>): StageDef {
  return {
    id: 'test',
    name: '테스트',
    allyBaseHp: 100,
    enemyBaseHp: 100,
    manaRegenPerSec: 1,
    startMana: 6,
    obstacles: [],
    waves: [{ index: 0, spawns: [{ atMs: 1000, lane: 2, kind: 'pusher' }] }],
    ...overrides,
  };
}

/** dt 를 잘게 쪼개 총 ms 만큼 진행. */
function run(stage: StageDef, state: BattleState, totalMs: number, stepMs = 50): BattleState {
  let s = state;
  for (let t = 0; t < totalMs; t += stepMs) s = tick(stage, s, stepMs);
  return s;
}

/** 수동으로 전장에 유닛을 꽂는다(테스트 전용) — 스펙은 양 진영 공통 UNIT_SPECS. */
function inject(
  state: BattleState,
  c: Partial<Combatant> & { side: Combatant['side']; specId: UnitKind },
): BattleState {
  const spec = UNIT_SPECS[c.specId];
  const unit: Combatant = {
    uid: state.nextUid,
    lane: 2,
    pos: c.side === 'ally' ? 1 : LANE_LENGTH - 1,
    hp: spec.maxHp,
    maxHp: spec.maxHp,
    nextActAt: 0,
    ...c,
  } as Combatant;
  return { ...state, nextUid: state.nextUid + 1, combatants: [...state.combatants, unit] };
}

/** 큐 선두를 원하는 직업으로 맞추고 충전 완료 처리한 상태(테스트 전용). */
function withNext(state: BattleState, kind: UnitKind): BattleState {
  return { ...state, queue: [kind, ...state.queue.slice(1)], nextReadyAtMs: state.timeMs };
}

/** 테스트 전용 배치 헬퍼 — 큐 선두를 kind 로 맞추고 충전 시계를 해제한 뒤 배치. */
function deploy(state: BattleState, kind: UnitKind, lane: number): BattleState | null {
  return placeUnit({ ...withNext(state, kind), nextReadyAtMs: 0 }, kind, lane);
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj as object)) deepFreeze(v);
    Object.freeze(obj);
  }
  return obj;
}

const ALL_KINDS: ReadonlyArray<UnitKind> = ['pusher', 'tank', 'sprinter', 'healer', 'brawler', 'crusher'];

describe('createBattle', () => {
  it('스테이지 정의대로 초기 상태를 만든다(장애물·적 AI 포함)', () => {
    const s = createBattle(STAGE_1);
    expect(s.mana).toBe(STAGE_1.startMana);
    expect(s.manaMax).toBe(MANA_MAX);
    expect(s.allyBaseHp).toBe(STAGE_1.allyBaseHp);
    expect(s.enemyBaseHp).toBe(STAGE_1.enemyBaseHp);
    expect(s.combatants).toHaveLength(0);
    expect(s.obstacles).toHaveLength(STAGE_1.obstacles.length);
    expect(s.status).toBe('playing');
    expect(s.queue).toHaveLength(QUEUE_SIZE); // NEXT + 프리뷰 4
    expect(currentNext(s)).toBe(roster.NEXT_ROTATION[0]);
    expect(s.enemyMana).toBe(STAGE_1.enemyAI!.startMana);
    expect(s.aiDeploys).toBe(0);
  });
});

describe('tick — 자원/스폰/이동', () => {
  it('마나가 초당 회복되고 최대치에서 멈춘다', () => {
    const stage = miniStage({ waves: [] });
    const s = run(stage, createBattle(stage), 10_000);
    expect(s.mana).toBe(MANA_MAX);
  });

  it('예약 시각이 지나면 적이 상단에 스폰된다 — 능력치는 아군과 동일한 직업 스펙', () => {
    const stage = miniStage();
    const s = run(stage, createBattle(stage), 1200);
    expect(s.combatants).toHaveLength(1);
    const e = s.combatants[0];
    expect(e.side).toBe('enemy');
    expect(e.lane).toBe(2);
    expect(e.maxHp).toBe(UNIT_SPECS.pusher.maxHp); // "갑자기 강한 적" 없음
  });

  it('적은 아래로, 아군은 위로 모두 전진한다(밀어내기 모델)', () => {
    const stage = miniStage();
    let s = run(stage, createBattle(stage), 1200);
    s = deploy(s, 'tank', 0) as BattleState; // 다른 레인 — 접촉 없음
    const s2 = run(stage, s, 2000);
    const enemy = s2.combatants.find((c) => c.side === 'enemy')!;
    const tank = s2.combatants.find((c) => c.side === 'ally')!;
    expect(enemy.pos).toBeLessThan(LANE_LENGTH - 1);
    expect(tank.pos).toBeGreaterThan(1);
  });

  it('같은 진영 두 명은 잰걸음으로 따라붙어 밀착 대형(PRESS_GAP)을 이룬다', () => {
    const stage = miniStage({ waves: [] });
    let s = deploy(createBattle(stage), 'pusher', 1) as BattleState;
    s = run(stage, s, 1500);
    s = deploy(s, 'pusher', 1) as BattleState;
    s = run(stage, s, 8000);
    const [a, b] = s.combatants.filter((c) => c.lane === 1).sort((x, y) => y.pos - x.pos);
    const gap = a.pos - b.pos;
    expect(gap).toBeGreaterThanOrEqual(PRESS_GAP - 2); // 겹치지 않고
    expect(gap).toBeLessThanOrEqual(CHAIN_GAP); // 바짝 붙어 힘 합산 범위 안
  });

  it('밀착한 두 명은 힘이 두 배 — 혼자면 밀리는 상대를 함께는 밀어낸다', () => {
    const stage = miniStage({ waves: [] });
    // pusher(30) vs crusher(44): 1:1 은 아군이 밀린다.
    let solo = createBattle(stage);
    solo = inject(solo, { side: 'enemy', specId: 'crusher', lane: 2, pos: 500 });
    solo = inject(solo, { side: 'ally', specId: 'pusher', lane: 2, pos: 460 });
    const soloEnd = run(stage, solo, 2000);
    expect(soloEnd.combatants.find((c) => c.side === 'enemy')!.pos).toBeLessThan(500);
    // 밀착 2명(60) vs crusher(44): 아군이 민다.
    let duo = createBattle(stage);
    duo = inject(duo, { side: 'enemy', specId: 'crusher', lane: 2, pos: 500 });
    duo = inject(duo, { side: 'ally', specId: 'pusher', lane: 2, pos: 460 });
    duo = inject(duo, { side: 'ally', specId: 'pusher', lane: 2, pos: 460 - PRESS_GAP });
    const duoEnd = run(stage, duo, 2000);
    expect(duoEnd.combatants.find((c) => c.side === 'enemy')!.pos).toBeGreaterThan(500);
  });

  it('종료 상태에서는 tick 이 상태를 바꾸지 않는다', () => {
    const stage = miniStage();
    const done: BattleState = { ...createBattle(stage), status: 'won' };
    expect(tick(stage, done, 100)).toBe(done);
  });

  it('tick 은 입력 상태를 변형하지 않는다(불변)', () => {
    const stage = miniStage();
    const s0 = deepFreeze(run(stage, createBattle(stage), 1200));
    expect(() => tick(stage, s0, 100)).not.toThrow();
  });
});

describe('tick — 스크럼(힘 합산 밀어내기)', () => {
  it('힘이 큰 쪽이 상대를 밀어낸다: 밀치기 무리가 적 벽을 처리한다', () => {
    const stage = miniStage({ waves: [] });
    let s = createBattle(stage);
    s = inject(s, { side: 'enemy', specId: 'tank', lane: 2, pos: 500 });
    s = inject(s, { side: 'ally', specId: 'pusher', lane: 2, pos: 400 });
    s = inject(s, { side: 'ally', specId: 'pusher', lane: 2, pos: 330 });
    // pusher×2 힘 60 vs tank 14 → 아군 우세, 적이 뒤로 밀린다.
    const mid = run(stage, s, 3000);
    const enemy = mid.combatants.find((c) => c.side === 'enemy');
    expect(enemy && enemy.pos).toBeGreaterThan(500);
    // 결말: 적 제거(링아웃/기력) + 아군 완주 득점 — 방향만 고정(수치는 튜닝 가변).
    const end = run(stage, mid, 40_000);
    expect(end.combatants.some((c) => c.side === 'enemy')).toBe(false);
    expect(end.enemyBaseHp).toBeLessThan(100);
  });

  it('힘이 밀리는 아군은 하단 끝선 밖으로 밀려나고 아군 게이지가 깎인다', () => {
    const stage = miniStage({ waves: [] });
    let s = createBattle(stage);
    s = inject(s, { side: 'enemy', specId: 'crusher', lane: 2, pos: 300 });
    s = inject(s, { side: 'ally', specId: 'healer', lane: 2, pos: 250 });
    // crusher 44 vs healer 8 → 아군이 밀려 내려간다.
    const end = run(stage, s, 20_000);
    expect(end.combatants.some((c) => c.side === 'ally')).toBe(false);
    expect(end.allyBaseHp).toBeLessThan(100);
  });

  it('스크럼 중 양측 선두는 상대 힘 총합에 비례해 기력이 깎인다', () => {
    const stage = miniStage({ waves: [] });
    let s = createBattle(stage);
    s = inject(s, { side: 'enemy', specId: 'crusher', lane: 2, pos: 500 });
    s = inject(s, { side: 'ally', specId: 'tank', lane: 2, pos: 460 });
    const after = run(stage, s, 3000);
    const tank = after.combatants.find((c) => c.side === 'ally')!;
    const crusher = after.combatants.find((c) => c.side === 'enemy')!;
    expect(tank.hp).toBeLessThan(tank.maxHp);
    expect(crusher.hp).toBeLessThan(crusher.maxHp);
  });

  it('장시간 스크럼이면 기력이 약한 선두가 쓰러지고 처치 바운티가 들어온다', () => {
    const stage = miniStage({ waves: [] });
    let s = createBattle(stage);
    // 아군 벽(360) vs 적 밀치기(100): 밀리는 건 벽이지만 기력전은 밀치기가 먼저 진다.
    s = inject(s, { side: 'enemy', specId: 'pusher', lane: 2, pos: 500 });
    s = inject(s, { side: 'ally', specId: 'tank', lane: 2, pos: 460 });
    const manaBefore = s.mana;
    const end = run(stage, s, 120_000);
    expect(end.combatants.some((c) => c.side === 'enemy')).toBe(false);
    expect(end.mana).toBeGreaterThanOrEqual(Math.min(MANA_MAX, manaBefore)); // 바운티 포함
  });
});

describe('tick — 장애물', () => {
  const withObstacle = (): StageDef =>
    miniStage({ waves: [], obstacles: [{ lane: 2, pos: 500, durability: 100 }] });

  it('아군 무리는 장애물 앞에 멈추고 힘으로 내구도를 깎아 깬 뒤 지나간다', () => {
    const stage = withObstacle();
    const s = deploy(createBattle(stage), 'pusher', 2) as BattleState;
    // 장애물 도달 전까지 전진(속도 55 → 도달 ~8.3s).
    const blocked = run(stage, s, 9000);
    const unit = blocked.combatants[0];
    expect(unit.pos).toBeLessThanOrEqual(500);
    // pusher 힘 30 × 1.0/s → 내구도 100 은 약 3.4초. 여유를 두고 파괴 확인.
    const broken = run(stage, blocked, 4000);
    expect(broken.obstacles).toHaveLength(0);
    // 깨고 나면 계속 전진(너무 오래 돌리면 상단 장외되므로 짧게).
    const passed = run(stage, broken, 2000);
    expect(passed.combatants[0].pos).toBeGreaterThan(500);
  });

  it('적도 장애물을 깨야 내려올 수 있다', () => {
    const stage = miniStage({
      obstacles: [{ lane: 2, pos: 500, durability: 100 }],
      waves: [{ index: 0, spawns: [{ atMs: 0, lane: 2, kind: 'pusher' }] }],
    });
    // 적 pusher 속도 55: 545 지점 도달 ~8.3s — 6초 시점엔 아직 장애물 위에서 정체 전 구간.
    const mid = run(stage, createBattle(stage), 6_000);
    expect(mid.combatants[0].pos).toBeGreaterThanOrEqual(500);
    expect(mid.obstacles).toHaveLength(1);
    // 도달(8.3s)+파괴(3.4s)+통과 이동까지: 16초면 아래로 내려와 있다.
    const later = run(stage, mid, 10_000);
    expect(later.obstacles).toHaveLength(0);
    expect(later.combatants[0].pos).toBeLessThan(500);
  });
});

describe('tick — 끝선 돌파 게이지', () => {
  it('막지 않으면 적이 하단 끝선을 뚫고 직업 돌파 피해만큼 아군 게이지가 깎인다', () => {
    const stage = miniStage({
      waves: [{ index: 0, spawns: [{ atMs: 0, lane: 0, kind: 'crusher' }] }],
    });
    const end = run(stage, createBattle(stage), 60_000);
    expect(end.combatants).toHaveLength(0); // 뚫고 장외
    const spec = UNIT_SPECS.crusher;
    expect(end.allyBaseHp).toBeCloseTo(100 - spec.power * (spec.pushoutMult ?? 1) * PUSHOUT_DAMAGE_K, 5);
  });

  it('아군 러너(Sprinter)의 돌파 피해는 pushoutMult 배수가 붙는다', () => {
    const stage = miniStage({ waves: [] });
    const s = deploy(createBattle(stage), 'sprinter', 0) as BattleState;
    const end = run(stage, s, 20_000);
    expect(end.combatants).toHaveLength(0);
    const spec = UNIT_SPECS.sprinter;
    expect(end.enemyBaseHp).toBeCloseTo(100 - spec.power * (spec.pushoutMult ?? 1) * PUSHOUT_DAMAGE_K, 5);
  });

  it('아군 게이지가 0이 되면 패배한다', () => {
    const stage = miniStage({
      allyBaseHp: 10,
      waves: [{ index: 0, spawns: [{ atMs: 0, lane: 0, kind: 'crusher' }] }],
    });
    const end = run(stage, createBattle(stage), 120_000);
    expect(end.status).toBe('lost');
  });
});

describe('placeUnit — NEXT 충전 시계 규칙', () => {
  it('개전 시 첫 캐릭터는 즉시 준비 상태로 배치 가능하다', () => {
    const s0 = createBattle(STAGE_1);
    expect(s0.nextReadyAtMs).toBeLessThanOrEqual(s0.timeMs);
    expect(placeUnit(s0, currentNext(s0), 0)).not.toBeNull();
  });

  it('배치하면 큐가 전진하고 충전 시계가 돌기 시작한다', () => {
    const s0 = createBattle(STAGE_1);
    const head = currentNext(s0);
    const preview = queuePreview(s0, 4);
    const s = placeUnit(s0, head, 0);
    expect(s).not.toBeNull();
    expect(s!.mana).toBe(s0.mana - UNIT_SPECS[head].cost);
    expect(s!.combatants).toHaveLength(1);
    expect(currentNext(s!)).toBe(preview[0]); // 다음 순번이 NEXT 슬롯으로
    expect(s!.queue).toHaveLength(QUEUE_SIZE); // 꼬리 보충
    expect(s!.nextReadyAtMs).toBe(s0.timeMs + TURN_MS); // 충전 시작
    expect(s0.combatants).toHaveLength(0); // 원본 불변
  });

  it('충전 중(시계가 도는 동안)에는 연속 배치가 불가능하다 — 배치 속도 제한', () => {
    const s0 = { ...createBattle(STAGE_1), mana: MANA_MAX };
    const s1 = placeUnit(s0, currentNext(s0), 0)!;
    expect(placeUnit(s1, currentNext(s1), 1)).toBeNull(); // 시계가 도는 중
    const stage = miniStage({ waves: [] });
    const charged = { ...run(stage, s1, TURN_MS + 200), mana: MANA_MAX };
    expect(placeUnit(charged, currentNext(charged), 1)).not.toBeNull();
  });

  it('시계는 자동으로 캐릭터를 버리지 않는다 — 충전 완료 후엔 계속 보유', () => {
    const stage = miniStage({ waves: [] });
    const s0 = createBattle(stage);
    const head = currentNext(s0);
    const s = run(stage, s0, TURN_MS * 3);
    expect(currentNext(s)).toBe(head);
  });

  it('큐 선두가 아닌 직업은 배치할 수 없다', () => {
    const s0 = createBattle(STAGE_1); // 선두 = pusher(NEXT_ROTATION[0])
    expect(currentNext(s0)).toBe('pusher');
    expect(placeUnit(s0, 'tank', 0)).toBeNull();
  });

  it('마나 부족/잘못된 레인이면 null', () => {
    const poor = { ...createBattle(STAGE_1), mana: 1 };
    expect(placeUnit(poor, currentNext(poor), 0)).toBeNull();
    const s0 = createBattle(STAGE_1);
    expect(placeUnit(s0, currentNext(s0), 9)).toBeNull();
    expect(placeUnit(s0, currentNext(s0), -1)).toBeNull();
  });
});

describe('reorderQueue — 좌측 카드 끌어서 순서 변경', () => {
  it('프리뷰(1..4) 사이 이동은 허용되고 구성은 보존된다', () => {
    const s0 = createBattle(STAGE_1);
    const s = reorderQueue(s0, 4, 1);
    expect(s).not.toBeNull();
    expect(s!.queue[0]).toBe(s0.queue[0]); // NEXT 불변
    expect(s!.queue[1]).toBe(s0.queue[4]); // 끌어당긴 카드가 다음 순번으로
    expect([...s!.queue].sort()).toEqual([...s0.queue].sort()); // 구성 동일
  });

  it('NEXT(0) 로/에서의 이동과 범위 밖 인덱스는 거부된다', () => {
    const s0 = createBattle(STAGE_1);
    expect(reorderQueue(s0, 0, 2)).toBeNull();
    expect(reorderQueue(s0, 2, 0)).toBeNull();
    expect(reorderQueue(s0, 1, 9)).toBeNull();
    expect(reorderQueue(s0, 1, 1)).toBe(s0);
  });
});

describe('castAbility', () => {
  const stage = miniStage();

  function withEnemy(pos = 500): BattleState {
    let s = createBattle(stage);
    s = inject(s, { side: 'enemy', specId: 'pusher', lane: 2, pos });
    return { ...s, mana: MANA_MAX };
  }

  it('rally 는 적을 위로 밀어낸다(상한 LANE_LENGTH)', () => {
    const s = castAbility(withEnemy(500), 'rally');
    expect(s!.combatants[0].pos).toBe(500 + RALLY_KNOCKBACK);
    const s2 = castAbility(withEnemy(LANE_LENGTH - 10), 'rally');
    expect(s2!.combatants[0].pos).toBe(LANE_LENGTH);
  });

  it('healWave 는 아군만 회복한다', () => {
    let s = deploy(withEnemy(), 'tank', 1) as BattleState;
    s = {
      ...s,
      combatants: s.combatants.map((c) => (c.side === 'ally' ? { ...c, hp: 50 } : c)),
    };
    const healed = castAbility(s, 'healWave')!;
    const ally = healed.combatants.find((c) => c.side === 'ally')!;
    expect(ally.hp).toBe(50 + HEAL_WAVE_AMOUNT);
    expect(healed.combatants.find((c) => c.side === 'enemy')!.hp).toBe(UNIT_SPECS.pusher.maxHp);
  });

  it('attackBoost 는 스크럼 힘을 배수로 올려 전세를 뒤집는다', () => {
    expect(ATTACK_BOOST_MULTIPLIER).toBeGreaterThan(1);
    const st = miniStage({ waves: [] });
    // tank(14) vs sprinter(16): 평시엔 아군이 밀리지만 부스트(14×1.6=22.4)면 아군이 민다.
    let s = createBattle(st);
    s = inject(s, { side: 'enemy', specId: 'sprinter', lane: 2, pos: 500 });
    s = inject(s, { side: 'ally', specId: 'tank', lane: 2, pos: 460 });
    s = { ...s, mana: MANA_MAX };
    const plain = run(st, s, 2000);
    expect(plain.combatants.find((c) => c.side === 'enemy')!.pos).toBeLessThan(500);
    const boosted = run(st, castAbility(s, 'attackBoost')!, 2000);
    expect(boosted.combatants.find((c) => c.side === 'enemy')!.pos).toBeGreaterThan(500);
  });

  it('sumoSpirit 는 전장 전체 기력 피해 + 처치 바운티 정산', () => {
    const weak = withEnemy();
    const hurt: BattleState = {
      ...weak,
      mana: MANA_MAX - 2,
      combatants: weak.combatants.map((c) => ({ ...c, hp: SUMO_SPIRIT_DAMAGE - 1 })),
    };
    const s = castAbility(hurt, 'sumoSpirit')!;
    expect(s.combatants).toHaveLength(0);
    expect(s.mana).toBe(MANA_MAX - 2 - ABILITY_SPECS.sumoSpirit.cost + KILL_BOUNTY.pusher);
  });

  it('쿨다운/마나 부족이면 null', () => {
    const s = castAbility(withEnemy(), 'rally')!;
    expect(castAbility(s, 'rally')).toBeNull();
    const poor: BattleState = { ...withEnemy(), mana: 0 };
    expect(castAbility(poor, 'healWave')).toBeNull();
  });
});

describe('6직업 밸런스 하네스 — 미러 클래스(양 진영 동일 스텟)', () => {
  const arena = (): StageDef => miniStage({ waves: [] });

  it('T+H 전열 vs 적 난투 — 힐이 드레인을 상쇄하며 기력전에서 이긴다', () => {
    let s = createBattle(arena());
    s = inject(s, { side: 'enemy', specId: 'brawler', lane: 2, pos: 500 });
    s = inject(s, { side: 'ally', specId: 'tank', lane: 2, pos: 460 });
    s = inject(s, { side: 'ally', specId: 'healer', lane: 2, pos: 460 - PRESS_GAP });
    // 15초: 스크럼 한창(승리 후 상단 장외 전) — 벽이 힐로 버티는 중임을 확인.
    const mid = run(arena(), s, 15_000);
    const tank = mid.combatants.find((c) => c.specId === 'tank');
    expect(tank).toBeDefined();
    expect(tank!.hp).toBeGreaterThan(tank!.maxHp * 0.4); // 드레인 26.4/s vs 힐 20/s
    // 결말: 기력전은 아군 승 — 적 난투가 먼저 쓰러진다.
    const end = run(arena(), mid, 10_000);
    expect(end.combatants.some((c) => c.side === 'enemy')).toBe(false);
    expect(end.allyBaseHp).toBe(100);
  });

  it('처치 축 B×2+H — 상성(B>C)으로 적 분쇄를 빠르게 쓰러뜨린다', () => {
    let s = createBattle(arena());
    s = inject(s, { side: 'enemy', specId: 'crusher', lane: 2, pos: 700 });
    s = inject(s, { side: 'ally', specId: 'brawler', lane: 2, pos: 660 });
    s = inject(s, { side: 'ally', specId: 'brawler', lane: 2, pos: 660 - PRESS_GAP });
    s = inject(s, { side: 'ally', specId: 'healer', lane: 2, pos: 660 - PRESS_GAP * 2 });
    const end = run(arena(), s, 20_000);
    expect(end.combatants.some((c) => c.side === 'enemy')).toBe(false);
    expect(end.allyBaseHp).toBe(100); // 아군 장외 없음
  });

  it('C 장애물 파괴 — breakMult 3 으로 Pusher 대비 압도적으로 빠르다', () => {
    const stage = miniStage({ waves: [], obstacles: [{ lane: 2, pos: 500, durability: 300 }] });
    const s = deploy({ ...createBattle(stage), mana: MANA_MAX }, 'crusher', 2) as BattleState;
    const afterC = run(stage, s, 15_000);
    expect(afterC.obstacles).toHaveLength(0);
    const p = deploy({ ...createBattle(stage), mana: MANA_MAX }, 'pusher', 2) as BattleState;
    const afterP = run(stage, p, 15_000);
    expect(afterP.obstacles).toHaveLength(1);
  });

  it('상성 배수 — 순환(P>B>C>T>S)과 역상성이 COUNTER_DRAIN 대로 조회된다', () => {
    expect(roster.counterDrainMult('pusher', 'brawler')).toBe(1.4);
    expect(roster.counterDrainMult('brawler', 'crusher')).toBe(1.5);
    expect(roster.counterDrainMult('crusher', 'tank')).toBe(1.4);
    expect(roster.counterDrainMult('tank', 'sprinter')).toBe(1.5);
    expect(roster.counterDrainMult('pusher', 'crusher')).toBe(0.7); // 역상성
    expect(roster.counterDrainMult('crusher', 'sprinter')).toBe(0.6); // 역상성
    expect(roster.counterDrainMult('healer', 'crusher')).toBe(1); // 서포트 상성 없음
    expect(roster.counterDrainMult('brawler', undefined)).toBe(1); // 상대 없음
  });

  it('상성 규약 — 배수 0.5~2, 모든 직업에 유리 카운터가 최소 1개', () => {
    const all = Object.values(roster.COUNTER_DRAIN).flatMap((m) => Object.values(m ?? {}));
    for (const v of all) {
      expect(v).toBeGreaterThanOrEqual(0.5);
      expect(v).toBeLessThanOrEqual(2);
    }
    for (const defender of ALL_KINDS) {
      const hasCounter = ALL_KINDS.some((k) => roster.counterDrainMult(k, defender) > 1);
      expect(hasCounter, `${defender} 를 잡는 직업이 없음`).toBe(true);
    }
  });

  it('상성은 처치 축에만 작용 — chainForce 의 drain 만 변하고 push 는 불변', () => {
    let s = createBattle(arena());
    s = inject(s, { side: 'ally', specId: 'brawler', lane: 2, pos: 400 });
    const chain = s.combatants;
    const vsCrusher = chainForce(chain, false, 'crusher');
    const vsNone = chainForce(chain, false);
    expect(vsCrusher.push).toBe(vsNone.push); // 밀기 불변
    const b = UNIT_SPECS.brawler;
    expect(vsCrusher.drain).toBeCloseTo(b.power * (b.drainMult ?? 1) * 1.5, 5);
    expect(vsNone.drain).toBeCloseTo(b.power * (b.drainMult ?? 1), 5);
  });

  it('상성 행동 검증 — 같은 적 벽을 상성조(B)가 비상성조(P)보다 훨씬 빨리 잡는다', () => {
    const duel = (kind: UnitKind): number => {
      let s = createBattle(arena());
      s = inject(s, { side: 'enemy', specId: 'tank', lane: 2, pos: 700 });
      s = inject(s, { side: 'ally', specId: kind, lane: 2, pos: 660 });
      s = inject(s, { side: 'ally', specId: kind, lane: 2, pos: 660 - PRESS_GAP });
      const end = run(arena(), s, 5_000);
      return end.combatants.find((c) => c.side === 'enemy')?.hp ?? 0;
    };
    const vsBrawler = duel('brawler'); // (22×2×1.2)×2×0.5 = 52.8/s
    const vsPusher = duel('pusher'); // (30×0.7×1)×2×0.5 = 21/s
    expect(vsBrawler).toBeLessThan(vsPusher - 100);
  });

  it('정적 검사 — 어떤 직업도 효율 2축(밀기힘/㎃ · 기력/㎃) 동시 1등 금지', () => {
    const kinds = Object.values(UNIT_SPECS);
    const top = (score: (s: (typeof kinds)[number]) => number): string =>
      [...kinds].sort((a, b) => score(b) - score(a))[0].kind;
    const pushTop = top((s) => s.power / s.cost);
    const hpTop = top((s) => s.maxHp / s.cost);
    expect(pushTop).toBe('pusher');
    expect(hpTop).toBe('tank');
    expect(pushTop).not.toBe(hpTop);
  });

  it('NEXT 로테이션 — 6직업이 모두 등장하고 기본 직업이 다수를 차지한다', () => {
    const { NEXT_ROTATION } = roster;
    const count = (k: string): number => NEXT_ROTATION.filter((x) => x === k).length;
    for (const k of ALL_KINDS) expect(count(k)).toBeGreaterThan(0);
    const basic = count('pusher') + count('tank') + count('sprinter') + count('healer');
    expect(basic / NEXT_ROTATION.length).toBeGreaterThanOrEqual(0.6);
    expect(count('crusher')).toBeLessThanOrEqual(count('brawler')); // 최고 코스트가 가장 희귀
  });
});

describe('적 AI — 지능형 상대(페르소나·적응·결정론)', () => {
  /** AI 전용 미니 스테이지 — 대본 없음, 예산/쿨다운 제어. */
  function aiStage(over?: Partial<NonNullable<StageDef['enemyAI']>>): StageDef {
    return miniStage({
      waves: [],
      enemyAI: {
        persona: 'balanced',
        manaRegenPerSec: 1.5,
        startMana: 6,
        deployCooldownMs: 6000,
        firstDeployAtMs: 1000,
        maxDeploys: 6,
        seed: 11,
        ...over,
      },
    });
  }

  it('적 배치는 쿨다운·예산·직업 코스트(같은 경제 규칙)를 지킨다', () => {
    const stage = aiStage();
    const s = run(stage, createBattle(stage), 60_000);
    // 예산 6 을 넘지 않는다.
    expect(s.aiDeploys).toBeLessThanOrEqual(6);
    // 등장한 모든 적은 정규 직업 스펙 그대로(강화 개체 없음).
    for (const c of s.combatants.filter((c) => c.side === 'enemy')) {
      const spec = UNIT_SPECS[c.specId as UnitKind];
      expect(spec).toBeDefined();
      expect(c.maxHp).toBe(spec.maxHp);
    }
  });

  it('같은 시드는 같은 전개(재현), 다른 시드는 다른 전개(매판 다른 전략)', () => {
    const stage = STAGE_1;
    const a1 = run(stage, createBattle(stage, { aiSeed: 12345 }), 40_000);
    const a2 = run(stage, createBattle(stage, { aiSeed: 12345 }), 40_000);
    expect(JSON.stringify(a1)).toBe(JSON.stringify(a2)); // 결정론
    const b = run(stage, createBattle(stage, { aiSeed: 98765 }), 40_000);
    const sig = (s: BattleState): string =>
      JSON.stringify([s.aiPersona, s.combatants.filter((c) => c.side === 'enemy').map((c) => c.specId + '@' + c.lane)]);
    expect(sig(b)).not.toBe(sig(a1)); // 시드가 다르면 페르소나/전개가 달라진다
  });

  it('지능 — 아군이 깊이 밀고 들어간 레인을 읽고 그 레인을 수비한다', () => {
    const stage = aiStage({ persona: 'counter', firstDeployAtMs: 500 });
    let s = createBattle(stage);
    // 플레이어가 4번 레인을 강하게 푸시 중인 상황을 만든다.
    s = inject(s, { side: 'ally', specId: 'pusher', lane: 4, pos: 640 });
    s = inject(s, { side: 'ally', specId: 'pusher', lane: 4, pos: 606 });
    s = inject(s, { side: 'ally', specId: 'tank', lane: 4, pos: 572 });
    const after = run(stage, s, 2_000); // 첫 AI 배치 발생
    const enemies = after.combatants.filter((c) => c.side === 'enemy');
    expect(enemies.length).toBeGreaterThan(0);
    expect(enemies[0].lane).toBe(4); // 위협 레인을 정확히 수비
  });

  it('예산 소진 후 적을 모두 처리하면 승리한다', () => {
    // 약한 적: 2기만 배치하고 끝 — 방치해도 그 2기가 끝선을 뚫고 장외되면 전멸=승리.
    const stage = aiStage({ maxDeploys: 2, manaRegenPerSec: 1, startMana: 3 });
    const end = run(stage, createBattle(stage), 120_000);
    expect(end.aiDeploys).toBe(2);
    expect(end.status).toBe('won');
    expect(end.allyBaseHp).toBeLessThan(100); // 대신 게이지는 내주었다
  });
});

describe('tick — 도메인 이벤트(사운드/연출 트리거)', () => {
  it('스크럼이 처음 성립하면 newClashes 가 1회만 발생한다(지속 접촉은 재발화 없음)', () => {
    const stage = miniStage({ waves: [] });
    let s = createBattle(stage);
    s = inject(s, { side: 'enemy', specId: 'tank', lane: 2, pos: 480 });
    s = inject(s, { side: 'ally', specId: 'tank', lane: 2, pos: 460 });
    // 첫 접촉 틱.
    let sawClash = 0;
    let cur = s;
    for (let i = 0; i < 40; i++) {
      cur = tick(stage, cur, 50);
      sawClash += cur.events.newClashes;
    }
    expect(sawClash).toBe(1); // 벽 vs 벽은 계속 붙어 있어도 새 접촉은 한 번
  });

  it('적을 상단 밖으로 밀어내면 scores 와 bounty 이벤트가 발생한다', () => {
    const stage = miniStage({ waves: [] });
    let s = createBattle(stage);
    // 적을 상단 코앞에 두고 아군 무리로 밀어낸다.
    s = inject(s, { side: 'enemy', specId: 'healer', lane: 2, pos: LANE_LENGTH - 30 });
    s = inject(s, { side: 'ally', specId: 'crusher', lane: 2, pos: LANE_LENGTH - 70 });
    let scores = 0;
    let bounty = 0;
    let cur = s;
    for (let i = 0; i < 60; i++) {
      cur = tick(stage, cur, 50);
      scores += cur.events.scores;
      bounty += cur.events.bounty;
    }
    expect(scores).toBeGreaterThan(0);
    expect(bounty).toBeGreaterThan(0);
  });

  it('기력 소진 처치는 kos 이벤트로 잡힌다', () => {
    const stage = miniStage({ waves: [] });
    let s = createBattle(stage);
    s = inject(s, { side: 'enemy', specId: 'pusher', lane: 2, pos: 500, hp: 5 });
    s = inject(s, { side: 'ally', specId: 'tank', lane: 2, pos: 470 });
    let kos = 0;
    let cur = s;
    for (let i = 0; i < 40; i++) {
      cur = tick(stage, cur, 50);
      kos += cur.events.kos;
    }
    expect(kos).toBe(1);
  });
});

describe('STAGE_1 통합(지능형 적)', () => {
  it('방치하면 적 공세가 게이지를 깎아 패배한다', () => {
    const idle = run(STAGE_1, createBattle(STAGE_1), 240_000);
    expect(idle.status).toBe('lost');
  });

  it('반응형 플레이(위협 레인에 계속 배치)면 지능형 적을 상대로 패배하지 않는다', () => {
    // 전원 전진 모델에선 개막 배치만으로 못 막는다 — 규칙대로(NEXT 큐·시계·마나) 계속
    // 가장 위협적인 레인에 응수하는 단순 반응형 플레이어를 시뮬레이션한다.
    let s = createBattle(STAGE_1); // 기본 시드 → 결정적
    for (let t = 0; t < 240_000; t += 50) {
      s = tick(STAGE_1, s, 50);
      if (s.status !== 'playing') break;
      const head = currentNext(s);
      if (s.timeMs >= s.nextReadyAtMs && s.mana >= UNIT_SPECS[head].cost) {
        // 가장 깊이 내려온 적의 레인에 배치(없으면 중앙).
        let lane = 2;
        let deepest = Infinity;
        for (const c of s.combatants) {
          if (c.side === 'enemy' && c.pos < deepest) {
            deepest = c.pos;
            lane = c.lane;
          }
        }
        const placed = placeUnit(s, head, lane);
        if (placed) s = placed;
      }
    }
    expect(s.status).not.toBe('lost');
    expect(s.allyBaseHp).toBeGreaterThan(20); // 방어가 실질적으로 작동
  });
});
