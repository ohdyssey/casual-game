/**
 * 전투 시뮬레이션 v2 — 밀어내기(스모 줄다리기) 모델. 순수 로직(Phaser 무의존),
 * 모든 상태 전이는 새 객체를 반환한다.
 *
 * 좌표 모델: 레인 진행 좌표 pos ∈ [0, LANE_LENGTH].
 *   0 = 아군 끝선(하단) · LANE_LENGTH = 적 끝선(상단).
 *   아군은 +방향(위), 적은 -방향(아래)으로 **전원 전진**한다.
 *
 * 규칙:
 *   - 접촉(스크럼): 양측 선두가 CONTACT_DIST 이내로 만나면, 각 진영의 "연결된"
 *     유닛(선두부터 CHAIN_GAP 이내로 이어진 무리)의 힘 총합 차이로 밀림 속도가 결정된다.
 *     양측 선두는 상대 총합에 비례해 기력(hp)을 소모하며, 0이 되면 쓰러진다.
 *   - 장애물: 진로의 장애물 앞에서 멈추고, 연결 무리의 힘 총합으로 내구도를 깎아 깬다.
 *   - 끝선 돌파: 어느 유닛이든 하단(0) 아래로 나가면 아군 게이지가, 상단(LANE_LENGTH)
 *     위로 나가면 적 게이지가 그 유닛의 힘 × PUSHOUT_DAMAGE_K 만큼 깎인다.
 *     (밀려난 쪽도, 뚫린 쪽도 같은 규칙 — "끝선을 넘어간 값"이 피해 기준.)
 *   - 승리: 적 게이지 0 또는 모든 웨이브 소진+적 전멸. 패배: 아군 게이지 0.
 */
import {
  LANE_COUNT,
  LANE_LENGTH,
  MANA_MAX,
  type BattleState,
  type Combatant,
  type Obstacle,
  type StageDef,
  type UnitKind,
} from './types.js';
import { counterDrainMult, KILL_BOUNTY, NEXT_ROTATION, UNIT_SPECS } from './roster.js';
import { ATTACK_BOOST_MULTIPLIER } from './abilities.js';
import { decideEnemyDeploy, pickPersona } from './enemyAI.js';

/**
 * NEXT 충전 시계 1회전(ms) — 배치 속도 제한기.
 *   배치하면 NEXT 가 비고 시계가 돌기 시작 → 한 바퀴 돌아야 다음 캐릭터가 나타난다.
 *   나타난 캐릭터는 소멸하지 않고 보유 가능(다음 시계는 배치해야 돈다).
 * TODO(디자이너 확인): 기획 수치 미확정.
 */
export const TURN_MS = 6_000;

/** 한 틱에 반영하는 최대 경과(ms) — 탭 전환 등 큰 dt 폭주 방지. */
export const TICK_CAP_MS = 100;

// ── 밀어내기 물리 상수(밸런싱 노브) ──────────────────────────────────────────
/** 스크럼 성립 거리(선두 간). */
export const CONTACT_DIST = 55;
/** 밀착 간격 — 같은 진영 유닛은 앞 동료 뒤 이 간격까지 바짝 붙는다(스크럼 대열). */
export const PRESS_GAP = 34;
/** 힘 합산 인정 간격 — 밀착(PRESS_GAP) 상태의 유닛만 무리로 묶여 힘이 합산된다. */
export const CHAIN_GAP = 50;
/** 밀착 전 따라붙기 속도 배수 — 뒤 유닛이 앞 동료에 합류할 때까지 잰걸음. */
export const CATCHUP_MULT = 1.35;
/** 힘 1점당 밀림 속도(좌표/초). */
export const PUSH_V_PER_POWER = 1.2;
/**
 * 밀림 속도 상한(좌표/초).
 *   v7 튜닝: 60 → 40. 힘 스택이 정예를 "즉시 링아웃"으로 치워버리는 탈출구를 막는다 —
 *   스크럼이 길어져 얇은 기력의 힘 직업 선두는 반드시 드레인에 노출된다(벽/치유 필요).
 */
export const MAX_PUSH_V = 40;
/**
 * 스크럼 중 선두 기력 소모 = 상대 힘 총합 × 이 계수(초당).
 *   v3 튜닝: 0.3 → 0.5. 드레인이 밀어내기보다 빨라야 물량 체인이 정예를 "공짜 링아웃"으로
 *   게이지를 깎지 못한다(처치=바운티만, 링아웃=게이지 — 기력전이 먼저 끝나게).
 *   부수 효과: 스크럼이 치명적이 되어 힐러(유지)·탱커(방벽)의 전술 가치가 올라간다.
 */
export const DRAIN_K = 0.5;
/** 장애물 내구도 소모 = 무리 힘 총합 × 이 계수(초당). */
export const OBSTACLE_BREAK_K = 1.0;
/** 장애물 앞 정지 간격. */
export const OBSTACLE_GAP = 45;
/** 끝선 돌파 게이지 피해 = 넘어간 유닛의 힘 × 이 계수. */
export const PUSHOUT_DAMAGE_K = 0.7;

interface CombatSpec {
  readonly power: number;
  readonly speed: number;
  readonly heal: number;
  readonly healMs: number;
  readonly healRange: number;
  /** 직업 특수 배수 — 기본 1(적 포함). */
  readonly drainMult: number;
  readonly breakMult: number;
  readonly pushoutMult: number;
}

/** 양 진영 공통 — 능력치는 직업으로만 결정된다(적 전용 스펙 없음). */
function specOf(c: Combatant): CombatSpec | null {
  const u = UNIT_SPECS[c.specId as UnitKind];
  return u
    ? {
        power: u.power,
        speed: u.speed,
        heal: u.heal ?? 0,
        healMs: u.healMs ?? 1000,
        healRange: u.healRange ?? 0,
        drainMult: u.drainMult ?? 1,
        breakMult: u.breakMult ?? 1,
        pushoutMult: u.pushoutMult ?? 1,
      }
    : null;
}

/** 스테이지 스폰을 시간순으로 평탄화(스테이지별 1회 캐시). */
interface FlatSpawn {
  readonly atMs: number;
  readonly lane: number;
  readonly kind: UnitKind;
  readonly wave: number;
}
const flatCache = new WeakMap<StageDef, ReadonlyArray<FlatSpawn>>();

function flattenSpawns(stage: StageDef): ReadonlyArray<FlatSpawn> {
  const hit = flatCache.get(stage);
  if (hit) return hit;
  const flat = stage.waves
    .flatMap((w) => w.spawns.map((s) => ({ atMs: s.atMs, lane: s.lane, kind: s.kind, wave: w.index })))
    .sort((a, b) => a.atMs - b.atMs);
  flatCache.set(stage, flat);
  return flat;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** 세팅된 비트 수(레인 마스크 카운트). */
function popcount(n: number): number {
  let c = 0;
  let x = n;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

/**
 * 초기 전투 상태 생성.
 *   aiSeed 를 주면 적 AI 의 난수/페르소나가 판마다 달라진다(미지정 시 스테이지 기본 시드 — 재현 가능).
 */
export function createBattle(stage: StageDef, opts?: { readonly aiSeed?: number }): BattleState {
  const seed = opts?.aiSeed ?? stage.enemyAI?.seed ?? 1;
  return {
    timeMs: 0,
    waveIndex: 0,
    waveCount: stage.waves.length,
    mana: stage.startMana,
    manaMax: MANA_MAX,
    allyBaseHp: stage.allyBaseHp,
    allyBaseHpMax: stage.allyBaseHp,
    enemyBaseHp: stage.enemyBaseHp,
    enemyBaseHpMax: stage.enemyBaseHp,
    combatants: [],
    obstacles: stage.obstacles.map((o, i) => ({
      uid: -(i + 1), // 유닛 uid(양수)와 충돌하지 않는 음수 대역
      lane: o.lane,
      pos: o.pos,
      durability: o.durability,
      maxDurability: o.durability,
    })),
    status: 'playing',
    attackBoostUntilMs: 0,
    abilityReadyAtMs: { rally: 0, healWave: 0, attackBoost: 0, sumoSpirit: 0 },
    nextUid: 1,
    spawnCursor: 0,
    queue: NEXT_ROTATION.slice(0, QUEUE_SIZE),
    queueCursor: QUEUE_SIZE,
    nextReadyAtMs: 0, // 개전 시 첫 캐릭터는 즉시 준비 상태
    enemyMana: stage.enemyAI?.startMana ?? 0,
    enemyDeployReadyAtMs: stage.enemyAI?.firstDeployAtMs ?? 0,
    aiDeploys: 0,
    aiRng: seed,
    aiPersona: stage.enemyAI ? pickPersona(stage.enemyAI, seed) : 'balanced',
    clashMask: 0,
    events: NO_EVENTS,
  };
}

/** NEXT 캐릭터가 충전 완료(배치 가능) 상태인가. */
export function isNextReady(state: BattleState): boolean {
  return state.timeMs >= state.nextReadyAtMs;
}

/** 큐 창 크기 — NEXT 1 + 좌측 프리뷰 카드 4. */
export const QUEUE_SIZE = 5;

/** 지금 배치 가능한 NEXT 캐릭터(큐 선두). */
export function currentNext(state: BattleState): UnitKind {
  return state.queue[0];
}

/** 큐 프리뷰 — 선두 다음부터 count 개(좌측 카드열 표시용, 가까운 순). */
export function queuePreview(state: BattleState, count: number): UnitKind[] {
  return state.queue.slice(1, 1 + count);
}

/** 큐 전진 — 선두 제거 + 로테이션에서 꼬리 보충. */
function advanceQueue(
  queue: ReadonlyArray<UnitKind>,
  cursor: number,
): { queue: UnitKind[]; cursor: number } {
  return {
    queue: [...queue.slice(1), NEXT_ROTATION[cursor % NEXT_ROTATION.length]],
    cursor: cursor + 1,
  };
}

/**
 * 큐 재정렬 — 좌측 프리뷰 카드(인덱스 1..4)를 끌어 순서를 바꾼다.
 *   **NEXT(인덱스 0)에 들어간 캐릭터는 바꿀 수 없다** — 이미 순번이 확정된 카드.
 */
export function reorderQueue(state: BattleState, from: number, to: number): BattleState | null {
  if (state.status !== 'playing') return null;
  const len = state.queue.length;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  if (from < 1 || from >= len || to < 1 || to >= len) return null; // 0(NEXT) 불가침
  if (from === to) return state;
  const q = [...state.queue];
  const [item] = q.splice(from, 1);
  q.splice(to, 0, item);
  return { ...state, queue: q };
}

/** 레인 하나의 이동/스크럼/장애물 해소 결과. */
interface LaneResult {
  readonly moved: Map<number, number>; // uid → 새 pos
  readonly drained: Map<number, number>; // uid → 기력 감소량
  readonly obstacleDamage: Map<number, number>; // obstacle uid → 내구도 감소량
  clashing: boolean; // 이 레인에서 스크럼(선두 접촉)이 성립했는가
}

/** 빈 이벤트(초기 상태·종료 상태용). */
const NO_EVENTS = { kos: 0, allyRingouts: 0, scores: 0, bounty: 0, newClashes: 0 } as const;

/**
 * 선두부터 밀착(CHAIN_GAP 이내)으로 이어진 무리를 반환. front 는 배열 첫 원소.
 * 두 명이 바짝 붙으면 힘이 정확히 두 배 — 밀착이 곧 합산 조건이다.
 * allies: pos 내림차순(선두=최고점) · enemies: pos 오름차순(선두=최저점) 정렬 전제.
 */
export function chainOf(sorted: ReadonlyArray<Combatant>): Combatant[] {
  const chain: Combatant[] = [];
  for (const c of sorted) {
    if (chain.length === 0) {
      chain.push(c);
      continue;
    }
    const prev = chain[chain.length - 1];
    if (Math.abs(prev.pos - c.pos) <= CHAIN_GAP) chain.push(c);
    else break;
  }
  return chain;
}

/** 무리의 힘 분해 — push(밀기)·drain(상대 선두 기력 소모 기여)·brk(장애물 파괴 기여). */
export interface ChainForce {
  readonly push: number;
  readonly drain: number;
  readonly brk: number;
}

/**
 * 무리 힘 분해 계산. opposingFrontId 를 주면 아군 유닛의 드레인 기여에
 * 직업 상성 배수(COUNTER_DRAIN)가 곱해진다 — 상성은 처치 축에만 작용(밀기·파괴 불변).
 */
export function chainForce(
  chain: ReadonlyArray<Combatant>,
  boosted: boolean,
  opposingFrontId?: string,
): ChainForce {
  let push = 0;
  let drain = 0;
  let brk = 0;
  for (const c of chain) {
    const spec = specOf(c);
    if (!spec) continue;
    const base = c.side === 'ally' && boosted ? spec.power * ATTACK_BOOST_MULTIPLIER : spec.power;
    // 상성은 양 진영 대칭 — 같은 직업 표를 같은 규칙으로(능력치 동일 원칙).
    const counter = counterDrainMult(c.specId, opposingFrontId);
    push += base;
    drain += base * spec.drainMult * counter;
    brk += base * spec.breakMult;
  }
  return { push, drain, brk };
}

/**
 * 한 진영의 자유 보행 — 선두는 한계(limit)까지, 뒤 유닛은 앞 동료 뒤
 * PRESS_GAP 까지 바짝 붙는다(밀착 전에는 CATCHUP_MULT 잰걸음으로 따라붙음).
 */
function walkSide(
  result: LaneResult,
  sorted: ReadonlyArray<Combatant>, // 선두 먼저
  dir: 1 | -1,
  frontLimit: number, // 선두가 넘을 수 없는 pos(방향 기준). Infinity/-Infinity = 제한 없음
  dtSec: number,
): void {
  let prevPos: number | null = null;
  for (const c of sorted) {
    const spec = specOf(c);
    if (!spec) continue;
    // 밀착 전이면 잰걸음 — 같은 속도끼리도 대열이 완성되게 한다.
    let speed = spec.speed;
    if (prevPos !== null && Math.abs(prevPos - c.pos) > PRESS_GAP + 2) speed *= CATCHUP_MULT;
    let next = c.pos + dir * speed * dtSec;
    if (prevPos === null) {
      // 선두 한계(적/장애물).
      next = dir === 1 ? Math.min(next, frontLimit) : Math.max(next, frontLimit);
    } else {
      // 앞 동료 뒤 밀착 간격까지.
      next = dir === 1 ? Math.min(next, prevPos - PRESS_GAP) : Math.max(next, prevPos + PRESS_GAP);
    }
    // 후퇴는 하지 않는다(간격 규칙이 현재 위치보다 뒤를 요구해도 제자리).
    if ((dir === 1 && next < c.pos) || (dir === -1 && next > c.pos)) next = c.pos;
    if (next !== c.pos) result.moved.set(c.uid, next);
    prevPos = next;
  }
}

/** 무리 전체를 v(좌표/초)로 함께 이동(스크럼 밀림). */
function shoveChain(result: LaneResult, chain: ReadonlyArray<Combatant>, v: number, dtSec: number): void {
  const dp = v * dtSec;
  if (dp === 0) return;
  for (const c of chain) result.moved.set(c.uid, c.pos + dp);
}

/** 레인 하나 해소 — 스크럼 > 장애물 > 자유 보행 우선순위. */
function resolveLane(
  allies: ReadonlyArray<Combatant>, // pos 내림차순(선두=최고점)
  enemies: ReadonlyArray<Combatant>, // pos 오름차순(선두=최저점)
  obstacles: ReadonlyArray<Obstacle>,
  boosted: boolean,
  dtSec: number,
): LaneResult {
  const result: LaneResult = { moved: new Map(), drained: new Map(), obstacleDamage: new Map(), clashing: false };
  const allyFront = allies[0];
  const enemyFront = enemies[0];

  // ── 스크럼: 선두끼리 접촉 ──
  if (allyFront && enemyFront && enemyFront.pos - allyFront.pos <= CONTACT_DIST) {
    result.clashing = true;
    const allyChain = chainOf(allies);
    const enemyChain = chainOf(enemies);
    const fAlly = chainForce(allyChain, boosted, enemyFront.specId); // 상성: 상대 선두 직업 기준
    const fEnemy = chainForce(enemyChain, false, allyFront.specId); // 상성은 양 진영 대칭
    const v = clamp((fAlly.push - fEnemy.push) * PUSH_V_PER_POWER, -MAX_PUSH_V, MAX_PUSH_V);
    shoveChain(result, allyChain, v, dtSec);
    shoveChain(result, enemyChain, v, dtSec);
    // 선두 기력 소모 — 상대 무리 드레인 힘(drainMult 반영·Brawler 특기) 비례.
    result.drained.set(allyFront.uid, fEnemy.drain * DRAIN_K * dtSec);
    result.drained.set(enemyFront.uid, fAlly.drain * DRAIN_K * dtSec);
    // 무리 밖 유닛은 무리 꼬리 뒤 밀착 간격까지 잰걸음으로 합류(붙는 순간 힘 합산).
    const allyRest = allies.slice(allyChain.length);
    if (allyRest.length) {
      const tail = allyChain[allyChain.length - 1];
      const tailPos = result.moved.get(tail.uid) ?? tail.pos;
      walkSide(result, allyRest, 1, tailPos - PRESS_GAP, dtSec);
    }
    const enemyRest = enemies.slice(enemyChain.length);
    if (enemyRest.length) {
      const tail = enemyChain[enemyChain.length - 1];
      const tailPos = result.moved.get(tail.uid) ?? tail.pos;
      walkSide(result, enemyRest, -1, tailPos + PRESS_GAP, dtSec);
    }
    return result;
  }

  // ── 비접촉: 각 진영 자유 보행(적 선두/장애물 앞 정지 + 장애물 파괴) ──
  const firstObstacleAbove = (from: number): Obstacle | undefined =>
    obstacles.filter((o) => o.pos > from).sort((a, b) => a.pos - b.pos)[0];
  const firstObstacleBelow = (from: number): Obstacle | undefined =>
    obstacles.filter((o) => o.pos < from).sort((a, b) => b.pos - a.pos)[0];

  if (allyFront) {
    const ob = firstObstacleAbove(allyFront.pos);
    const enemyLimit = enemyFront ? enemyFront.pos - CONTACT_DIST : Infinity;
    const obLimit = ob ? ob.pos - OBSTACLE_GAP : Infinity;
    walkSide(result, allies, 1, Math.min(enemyLimit, obLimit), dtSec);
    // 장애물 접촉 → 무리 파괴력(breakMult 반영·Crusher 특기)으로 내구도 소모.
    if (ob) {
      const frontPos = result.moved.get(allyFront.uid) ?? allyFront.pos;
      if (ob.pos - frontPos <= OBSTACLE_GAP + 1) {
        const force = chainForce(chainOf(allies), boosted).brk;
        result.obstacleDamage.set(ob.uid, (result.obstacleDamage.get(ob.uid) ?? 0) + force * OBSTACLE_BREAK_K * dtSec);
      }
    }
  }
  if (enemyFront) {
    const ob = firstObstacleBelow(enemyFront.pos);
    const allyLimit = allyFront ? allyFront.pos + CONTACT_DIST : -Infinity;
    const obLimit = ob ? ob.pos + OBSTACLE_GAP : -Infinity;
    walkSide(result, enemies, -1, Math.max(allyLimit, obLimit), dtSec);
    if (ob) {
      const frontPos = result.moved.get(enemyFront.uid) ?? enemyFront.pos;
      if (frontPos - ob.pos <= OBSTACLE_GAP + 1) {
        const force = chainForce(chainOf(enemies), false).brk;
        result.obstacleDamage.set(ob.uid, (result.obstacleDamage.get(ob.uid) ?? 0) + force * OBSTACLE_BREAK_K * dtSec);
      }
    }
  }
  return result;
}

/** 1틱 진행 — 스폰→레인 해소(스크럼/장애물/보행)→힐→끝선 돌파→사망→NEXT→승패. */
export function tick(stage: StageDef, state: BattleState, dtMs: number): BattleState {
  if (state.status !== 'playing' || dtMs <= 0) return state;
  const dt = Math.min(dtMs, TICK_CAP_MS);
  const dtSec = dt / 1000;
  const t = state.timeMs + dt;
  let mana = Math.min(state.manaMax, state.mana + stage.manaRegenPerSec * dtSec);

  // 1) 대본 스폰(적도 직업으로 — 능력치는 아군과 동일).
  const flat = flattenSpawns(stage);
  let cursor = state.spawnCursor;
  let nextUid = state.nextUid;
  let waveIndex = state.waveIndex;
  const spawned: Combatant[] = [];
  while (cursor < flat.length && flat[cursor].atMs <= t) {
    const s = flat[cursor];
    const spec = UNIT_SPECS[s.kind];
    if (spec && s.lane >= 0 && s.lane < LANE_COUNT) {
      spawned.push({
        uid: nextUid++,
        side: 'enemy',
        lane: s.lane,
        pos: LANE_LENGTH - 1, // 끝선(장외 판정) 바로 아래에서 출발
        hp: spec.maxHp,
        maxHp: spec.maxHp,
        specId: s.kind,
        nextActAt: 0,
      });
      waveIndex = Math.max(waveIndex, s.wave);
    }
    cursor++;
  }

  // 1b) 지능형 적 — 전장을 읽고 스스로 배치(플레이어와 같은 경제 규칙).
  const ai = stage.enemyAI;
  let enemyMana = ai ? Math.min(MANA_MAX, state.enemyMana + ai.manaRegenPerSec * dtSec) : state.enemyMana;
  let enemyDeployReadyAtMs = state.enemyDeployReadyAtMs;
  let aiDeploys = state.aiDeploys;
  let aiRng = state.aiRng;
  if (ai) {
    const preAI: ReadonlyArray<Combatant> = spawned.length ? [...state.combatants, ...spawned] : state.combatants;
    const d = decideEnemyDeploy(ai, state, t, preAI, enemyMana);
    if (d) {
      const spec = UNIT_SPECS[d.kind];
      spawned.push({
        uid: nextUid++,
        side: 'enemy',
        lane: d.lane,
        pos: LANE_LENGTH - 1,
        hp: spec.maxHp,
        maxHp: spec.maxHp,
        specId: d.kind,
        nextActAt: 0,
      });
      enemyMana -= spec.cost;
      enemyDeployReadyAtMs = t + ai.deployCooldownMs;
      aiDeploys++;
      aiRng = d.rng;
    }
  }
  const all: ReadonlyArray<Combatant> = spawned.length ? [...state.combatants, ...spawned] : state.combatants;
  const boosted = t < state.attackBoostUntilMs;

  // 2) 레인별 해소.
  const moved = new Map<number, number>();
  const drained = new Map<number, number>();
  const obstacleDamage = new Map<number, number>();
  let clashMask = 0;
  for (let lane = 0; lane < LANE_COUNT; lane++) {
    const allies = all.filter((c) => c.lane === lane && c.side === 'ally').sort((a, b) => b.pos - a.pos);
    const enemies = all.filter((c) => c.lane === lane && c.side === 'enemy').sort((a, b) => a.pos - b.pos);
    if (!allies.length && !enemies.length) continue;
    const obs = state.obstacles.filter((o) => o.lane === lane);
    const r = resolveLane(allies, enemies, obs, boosted, dtSec);
    r.moved.forEach((v, k) => moved.set(k, v));
    r.drained.forEach((v, k) => drained.set(k, v));
    r.obstacleDamage.forEach((v, k) => obstacleDamage.set(k, (obstacleDamage.get(k) ?? 0) + v));
    if (r.clashing) clashMask |= 1 << lane;
  }
  // 새로 성립한 스크럼(직전엔 접촉 아니던 레인)만 카운트 — 지속 접촉은 재발화 안 함.
  const newClashes = popcount(clashMask & ~state.clashMask);

  // 3) 힐러 — 같은 진영·같은 레인 사거리 내 가장 다친 동료 회복(자신 포함, 양 진영 공통).
  const healed = new Map<number, number>();
  const actAt = new Map<number, number>();
  for (const c of all) {
    const spec = specOf(c);
    if (!spec || spec.heal <= 0 || t < c.nextActAt) continue;
    let best: Combatant | null = null;
    let bestRatio = 1;
    for (const o of all) {
      if (o.side !== c.side || o.lane !== c.lane) continue;
      if (Math.abs(o.pos - c.pos) > spec.healRange) continue;
      const hp = o.hp - (drained.get(o.uid) ?? 0);
      const ratio = hp / o.maxHp;
      if (ratio < bestRatio) {
        best = o;
        bestRatio = ratio;
      }
    }
    if (best) {
      healed.set(best.uid, (healed.get(best.uid) ?? 0) + spec.heal);
      actAt.set(c.uid, t + spec.healMs);
    }
  }

  // 4) 적용 + 끝선 돌파 + 사망 정산 — 바운티는 양 진영 대칭(직업별 KILL_BOUNTY).
  let allyBaseHp = state.allyBaseHp;
  let enemyBaseHp = state.enemyBaseHp;
  let bounty = 0; // 플레이어 획득
  let enemyBounty = 0; // 적 AI 획득(아군을 잡거나 밀어냈을 때)
  let kos = 0;
  let allyRingouts = 0;
  let scores = 0;
  const list: Combatant[] = [];
  for (const c of all) {
    const pos = moved.get(c.uid) ?? c.pos;
    const hp = Math.min(c.maxHp, c.hp - (drained.get(c.uid) ?? 0) + (healed.get(c.uid) ?? 0));
    const spec = specOf(c);
    const kindBounty = KILL_BOUNTY[c.specId as UnitKind] ?? 1;
    // 끝선 돌파 피해 — 힘 × 직업 돌파 배수(Sprinter 특기) × 계수.
    const pushout = (spec?.power ?? 0) * (spec?.pushoutMult ?? 1) * PUSHOUT_DAMAGE_K;

    // 끝선 돌파 — 아군 끝선(하단)을 넘으면 실점, 적 끝선(상단)을 넘으면 득점(진영 무관).
    if (pos <= 0) {
      allyBaseHp = Math.max(0, allyBaseHp - pushout);
      allyRingouts++; // 아군 게이지 감소 = 실점 사운드
      if (c.side === 'ally') enemyBounty += kindBounty; // 밀려난 아군 = 적 보상
      continue; // 장외 — 제거(아군이 밀려났든 적이 뚫었든 동일 규칙)
    }
    if (pos >= LANE_LENGTH) {
      enemyBaseHp = Math.max(0, enemyBaseHp - pushout);
      scores++; // 적 게이지 감소 = 득점 사운드
      if (c.side === 'enemy') bounty += kindBounty; // 밀어낸 적 = 플레이어 보상
      continue;
    }
    // 기력 소진.
    if (hp <= 0) {
      kos++;
      if (c.side === 'enemy') bounty += kindBounty;
      else enemyBounty += kindBounty;
      continue;
    }
    const nextActAt = actAt.get(c.uid) ?? c.nextActAt;
    list.push(pos === c.pos && hp === c.hp && nextActAt === c.nextActAt ? c : { ...c, pos, hp, nextActAt });
  }
  mana = Math.min(state.manaMax, mana + bounty);
  if (ai) enemyMana = Math.min(MANA_MAX, enemyMana + enemyBounty);

  // 5) 장애물 내구도.
  const obstacles = state.obstacles
    .map((o) => {
      const dmg = obstacleDamage.get(o.uid) ?? 0;
      return dmg > 0 ? { ...o, durability: o.durability - dmg } : o;
    })
    .filter((o) => o.durability > 0);

  // 6) NEXT 충전 — 시계는 시간 경과로만 채워진다(자동 소멸 없음). 큐 전진은 배치 시점에만.

  // 7) 승패 — 게이지 0, 또는 적 공급원(대본+AI 예산) 소진 후 전멸.
  const scriptedDone = cursor >= flat.length;
  const aiDone = !ai || aiDeploys >= ai.maxDeploys;
  const hadEnemySource = flat.length > 0 || !!ai; // 빈 스테이지 즉시 승리 방지
  let status: BattleState['status'] = 'playing';
  if (allyBaseHp <= 0) status = 'lost';
  else if (enemyBaseHp <= 0) status = 'won';
  else if (hadEnemySource && scriptedDone && aiDone && !list.some((c) => c.side === 'enemy')) status = 'won';

  return {
    ...state,
    timeMs: t,
    waveIndex,
    mana,
    allyBaseHp,
    enemyBaseHp,
    combatants: list,
    obstacles,
    status,
    nextUid,
    spawnCursor: cursor,
    enemyMana,
    enemyDeployReadyAtMs,
    aiDeploys,
    aiRng,
    clashMask,
    events: { kos, allyRingouts, scores, bounty, newClashes },
  };
}

/**
 * 유닛 배치 — **충전 완료된 NEXT 캐릭터만** 배치 가능. 마나 소비. 불가하면 null.
 * 성공 시 큐가 전진하고 NEXT 가 비며 충전 시계가 돌기 시작한다
 * (시계가 한 바퀴 돌아야 다음 캐릭터가 나타난다 — 배치 속도 제한).
 * 배치 위치는 해당 레인의 출발점(pos 0 바로 위) — 이후 스스로 전진한다.
 */
export function placeUnit(state: BattleState, kind: UnitKind, lane: number): BattleState | null {
  if (state.status !== 'playing') return null;
  if (!Number.isInteger(lane) || lane < 0 || lane >= LANE_COUNT) return null;
  const spec = UNIT_SPECS[kind];
  if (!spec) return null;
  if (kind !== currentNext(state)) return null; // 큐 규칙 — 순서가 온 캐릭터만
  if (!isNextReady(state)) return null; // 충전 중 — 시계가 다 돌아야 배치 가능
  if (state.mana < spec.cost) return null;

  const unit: Combatant = {
    uid: state.nextUid,
    side: 'ally',
    lane,
    pos: 1, // 0 은 끝선(장외 판정) — 바로 위에서 출발
    hp: spec.maxHp,
    maxHp: spec.maxHp,
    specId: kind,
    nextActAt: 0,
  };
  const adv = advanceQueue(state.queue, state.queueCursor);
  return {
    ...state,
    mana: state.mana - spec.cost,
    nextUid: state.nextUid + 1,
    combatants: [...state.combatants, unit],
    queue: adv.queue,
    queueCursor: adv.cursor,
    nextReadyAtMs: state.timeMs + TURN_MS, // 충전 시작 — 다 돌아야 다음 캐릭터 등장
  };
}
