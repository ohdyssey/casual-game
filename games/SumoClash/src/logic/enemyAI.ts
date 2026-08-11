/**
 * 적 AI — 지능형 상대(순수 로직, 결정적).
 *   대본 스폰이 아니라 매 순간 전장을 읽고 스스로 배치한다:
 *     · 레인 정찰: 아군 침투 깊이/힘 vs 자기 병력 → 위협도 산출
 *     · 페르소나: aggressive(득점 압박)·defensive(전선 유지)·counter(상성 대응)·balanced
 *     · 상황 적응: 게이지가 밀리면 공세로, 앞서면 수비로 기운다
 *     · 시드 난수(mulberry32)로 소량의 변덕 — 판마다 전개가 달라지되 같은 시드는 재현 가능
 *   경제는 플레이어와 같은 규칙(같은 직업 코스트·마나) — 능력치 우위가 아닌 판단으로 싸운다.
 */
import {
  LANE_COUNT,
  LANE_LENGTH,
  type BattleState,
  type Combatant,
  type EnemyAIDef,
  type EnemyPersona,
  type Obstacle,
  type UnitKind,
} from './types.js';
import { counterDrainMult, UNIT_SPECS } from './roster.js';

/** AI 배치 결정 — kind 를 lane 에 투입, rng 는 소모 후의 난수 상태. */
export interface EnemyDeploy {
  readonly kind: UnitKind;
  readonly lane: number;
  readonly rng: number;
}

/** mulberry32 1스텝 — [0,1) 값과 다음 상태. 상태를 BattleState 에 저장해 결정적으로 유지. */
function nextRand(s: number): { v: number; s: number } {
  const t = (s + 0x6d2b79f5) | 0;
  let x = Math.imul(t ^ (t >>> 15), 1 | t);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return { v: ((x ^ (x >>> 14)) >>> 0) / 4294967296, s: t };
}

/** 시드로 페르소나 풀에서 이번 판의 페르소나를 뽑는다(풀이 없으면 기본값). */
export function pickPersona(cfg: EnemyAIDef, seed: number): EnemyPersona {
  const pool = cfg.personaPool;
  if (!pool || pool.length === 0) return cfg.persona;
  return pool[Math.abs(seed) % pool.length];
}

/** 레인 정찰 결과. */
interface LaneIntel {
  readonly lane: number;
  readonly allyPush: number;
  readonly enemyPush: number;
  /** 아군(플레이어) 선두의 침투 깊이(0~1, 1=적 끝선 도달). */
  readonly allyDepth: number;
  readonly allyFrontKind: UnitKind | null;
  /** 자기(적) 선두의 기력 비율(없으면 1). */
  readonly enemyFrontHpRatio: number;
  readonly hasObstacle: boolean;
}

function scout(combatants: ReadonlyArray<Combatant>, obstacles: ReadonlyArray<Obstacle>): LaneIntel[] {
  const intel: LaneIntel[] = [];
  for (let lane = 0; lane < LANE_COUNT; lane++) {
    let allyPush = 0;
    let enemyPush = 0;
    let allyFront: Combatant | null = null;
    let enemyFront: Combatant | null = null;
    for (const c of combatants) {
      if (c.lane !== lane) continue;
      const power = UNIT_SPECS[c.specId as UnitKind]?.power ?? 0;
      if (c.side === 'ally') {
        allyPush += power;
        if (!allyFront || c.pos > allyFront.pos) allyFront = c;
      } else {
        enemyPush += power;
        if (!enemyFront || c.pos < enemyFront.pos) enemyFront = c;
      }
    }
    intel.push({
      lane,
      allyPush,
      enemyPush,
      allyDepth: allyFront ? allyFront.pos / LANE_LENGTH : 0,
      allyFrontKind: allyFront ? (allyFront.specId as UnitKind) : null,
      enemyFrontHpRatio: enemyFront ? enemyFront.hp / enemyFront.maxHp : 1,
      hasObstacle: obstacles.some((o) => o.lane === lane),
    });
  }
  return intel;
}

/** 상성 표에서 defender 를 가장 잘 잡는 직업(공격 배수 최대) — 지불 가능한 것 중에서. */
function bestCounterKind(defender: UnitKind | null, mana: number): UnitKind | null {
  const candidates: UnitKind[] = ['brawler', 'crusher', 'pusher', 'tank'];
  let best: UnitKind | null = null;
  let bestScore = 0;
  for (const k of candidates) {
    if (UNIT_SPECS[k].cost > mana) continue;
    // 상성 우선, 동률이면 힘 대비 코스트 효율.
    const score = counterDrainMult(k, defender ?? undefined) * 10 + UNIT_SPECS[k].power / UNIT_SPECS[k].cost;
    if (score > bestScore) {
      best = k;
      bestScore = score;
    }
  }
  return best;
}

/**
 * 이번 틱의 적 배치 결정. 배치하지 않으면(쿨다운/예산/저마나 대기) null.
 *   순수 함수 — 같은 입력이면 같은 결정(난수 상태는 명시적으로 흘러간다).
 */
export function decideEnemyDeploy(
  cfg: EnemyAIDef,
  state: BattleState,
  t: number,
  combatants: ReadonlyArray<Combatant>,
  enemyMana: number,
): EnemyDeploy | null {
  if (t < state.enemyDeployReadyAtMs) return null;
  if (state.aiDeploys >= cfg.maxDeploys) return null;

  const persona = state.aiPersona;
  const intel = scout(combatants, state.obstacles);
  let rng = state.aiRng;
  const rand = (): number => {
    const r = nextRand(rng);
    rng = r.s;
    return r.v;
  };

  // ── 페르소나 성향 + 상황 적응(게이지 열세면 공세, 우세면 수비) ──
  let atkMult = 1;
  let defMult = 1;
  if (persona === 'aggressive') {
    atkMult = 1.6;
    defMult = 0.7;
  } else if (persona === 'defensive') {
    atkMult = 0.7;
    defMult = 1.5;
  } else if (persona === 'counter') {
    defMult = 1.3;
  }
  if (state.enemyBaseHp < state.allyBaseHp - 12) atkMult *= 1.35; // 밀리면 승부수
  else if (state.allyBaseHp < state.enemyBaseHp - 12) defMult *= 1.2; // 앞서면 굳히기

  // ── 레인×의도 후보 채점 ──
  let bestScore = -Infinity;
  let bestLane = 0;
  let bestMode: 'defend' | 'attack' = 'attack';
  for (const li of intel) {
    // 수비: 아군(플레이어)이 힘으로 앞서거나 깊이 침투한 레인을 막는다.
    if (li.allyPush > 0) {
      const defend = (li.allyPush - li.enemyPush + li.allyDepth * 22) * defMult + rand() * 6;
      if (defend > bestScore) {
        bestScore = defend;
        bestLane = li.lane;
        bestMode = 'defend';
      }
    }
    // 공격: 비었거나 얇은 레인으로 득점 압박(자기 병력이 이미 많은 곳은 덜).
    let attack = (18 - li.allyPush * 0.5 - li.enemyPush * 0.35) * atkMult + rand() * 6;
    if (li.hasObstacle) attack -= 8; // 장애물 레인은 득점 루트로 비효율
    if (attack > bestScore) {
      bestScore = attack;
      bestLane = li.lane;
      bestMode = 'attack';
    }
  }
  const li = intel[bestLane];

  // ── 직업 선택 ──
  let kind: UnitKind | null = null;
  if (bestMode === 'defend') {
    // 자기 선두가 다쳐 있으면 페르소나 무관 치유 우선(전선 유지 지능).
    if (li.enemyFrontHpRatio < 0.55 && UNIT_SPECS.healer.cost <= enemyMana && rand() < 0.6) {
      kind = 'healer';
    } else if (li.allyDepth > 0.72 && UNIT_SPECS.tank.cost <= enemyMana) {
      kind = 'tank'; // 코앞까지 뚫렸으면 일단 벽
    } else {
      kind = bestCounterKind(li.allyFrontKind, enemyMana);
    }
  } else {
    // 공격: 러너(득점) 또는 밀치기(압박). 장애물 레인을 굳이 공격하면 분쇄.
    if (li.hasObstacle && UNIT_SPECS.crusher.cost <= enemyMana && rand() < 0.5) kind = 'crusher';
    else kind = rand() < 0.55 ? 'sprinter' : 'pusher';
    if (kind && UNIT_SPECS[kind].cost > enemyMana) kind = null;
  }
  // 지불 불가 — 공격형은 싼 유닛으로라도 템포 유지, 그 외엔 마나를 모은다.
  if (!kind) {
    if (persona === 'aggressive') {
      const cheap: UnitKind[] = ['sprinter', 'pusher'];
      kind = cheap.find((k) => UNIT_SPECS[k].cost <= enemyMana) ?? null;
    }
    if (!kind) return null;
  }

  return { kind, lane: bestLane, rng };
}
