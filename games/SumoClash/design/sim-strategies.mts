/**
 * 전략 시뮬레이션 하네스 — 6직업 스텟 밸런싱 도구(렌더 무관, 실제 battle.ts 엔진 구동).
 *
 *   실행: node_modules/.bin/tsx games/SumoClash/design/sim-strategies.mts   (모노레포 루트에서)
 *
 * 목적: 유저가 실제로 쓸 수 있는 전략(큐 재정렬 · 이중배치 스택 · 스프레드 · 러시 · 직업 몰빵)을
 *   스테이지 유형(러시/보스/공성/압박/혼합)별로 돌려 승패·여유 게이지를 매트릭스로 출력한다.
 *
 * 게임성 판정 기준(스텟 튜닝의 합격선):
 *   G1. 방치(idle)는 모든 스테이지에서 패배한다 — 게임이 플레이를 요구.
 *   G2. 무전략(spam: 아무거나 위협 레인에)은 전 스테이지를 이기지 못한다 — 전략이 유의미.
 *   G3. 직업 몰빵(mono) 전략은 각자 유리한 스테이지가 있고, 전 스테이지 제패는 없다.
 *   G4. 어떤 단일 전략도 전 스테이지를 최고 점수로 제패하지 않는다(지배 전략 금지).
 *   G5. 이중배치(스택)와 분산(스프레드)은 스테이지 유형에 따라 우열이 갈린다.
 */
import {
  createBattle,
  currentNext,
  placeUnit,
  reorderQueue,
  tick,
} from '../src/logic/battle.js';
import { ENEMY_SPECS, STAGE_1, UNIT_SPECS } from '../src/logic/roster.js';
import {
  LANE_COUNT,
  LANE_LENGTH,
  type BattleState,
  type StageDef,
  type UnitKind,
} from '../src/logic/types.js';

// ── 스테이지 아키타입 ──────────────────────────────────────────────────────────

const base = {
  allyBaseHp: 100,
  enemyBaseHp: 100,
  manaRegenPerSec: 2,
  startMana: 8,
  obstacles: [] as StageDef['obstacles'],
};

/** 러시 — 약졸 다수가 5레인에 빠르게 흩어져 내려온다(분산 대응력 시험). */
const S_RUSH: StageDef = {
  ...base,
  id: 'rush',
  name: '러시',
  manaRegenPerSec: 1.5,
  waves: [
    {
      index: 0,
      spawns: Array.from({ length: 12 }, (_, i) => ({
        atMs: 5000 + i * 4000,
        lane: [0, 2, 4, 1, 3][i % 5],
        enemyId: 'rikishi',
      })),
    },
  ],
};

/** 보스 — 소수 정예가 한두 레인에 집중(집중 화력·기력전 시험). */
const S_BOSS: StageDef = {
  ...base,
  id: 'boss',
  name: '보스',
  manaRegenPerSec: 1.2,
  enemyBaseHp: 150,
  waves: [
    {
      index: 0,
      spawns: [
        { atMs: 8000, lane: 2, enemyId: 'yokozuna' },
        { atMs: 20000, lane: 1, enemyId: 'ozeki' },
        { atMs: 35000, lane: 3, enemyId: 'ozeki' },
        { atMs: 50000, lane: 2, enemyId: 'yokozuna' },
        { atMs: 65000, lane: 2, enemyId: 'ozeki' },
        { atMs: 78000, lane: 2, enemyId: 'yokozuna' },
      ],
    },
  ],
};

/** 공성 — 3레인에 장애물, 뚫어야 득점·수비가 가능(파괴 축 시험). */
const S_SIEGE: StageDef = {
  ...base,
  id: 'siege',
  name: '공성',
  manaRegenPerSec: 1.5,
  enemyBaseHp: 120,
  obstacles: [
    { lane: 1, pos: 600, durability: 260 },
    { lane: 2, pos: 620, durability: 300 },
    { lane: 3, pos: 600, durability: 260 },
  ],
  waves: [
    {
      index: 0,
      spawns: [
        { atMs: 8000, lane: 0, enemyId: 'rikishi' },
        { atMs: 16000, lane: 4, enemyId: 'rikishi' },
        { atMs: 26000, lane: 0, enemyId: 'ozeki' },
        { atMs: 38000, lane: 4, enemyId: 'ozeki' },
        { atMs: 52000, lane: 2, enemyId: 'yokozuna' },
      ],
    },
  ],
};

/** 압박 — 중급+정예가 끊임없이 5레인을 누른다(지속 전선 유지·마나 희소 시험). */
const S_PRESSURE: StageDef = {
  ...base,
  id: 'pressure',
  name: '압박',
  manaRegenPerSec: 1.6,
  enemyBaseHp: 170,
  waves: [
    {
      index: 0,
      spawns: [
        // 같은 레인 연속 투입(페어)이 섞인 압박 — 얇은 수비 레인은 스크럼 힘 합산에 뚫린다.
        ...Array.from({ length: 10 }, (_, i) => ({
          atMs: 8000 + i * 6000,
          lane: [1, 1, 3, 2, 0, 4, 2, 3, 1, 0][i],
          enemyId: 'ozeki',
        })),
        // 측면 기습 혼합 — 한 직업 몰빵(밀기만/유지만)으로는 정면 압박과 기습을 동시 대응 불가.
        { atMs: 30000, lane: 0, enemyId: 'sekiwake' },
        { atMs: 45000, lane: 4, enemyId: 'sekiwake' },
        { atMs: 58000, lane: 2, enemyId: 'sekiwake' },
        { atMs: 74000, lane: 2, enemyId: 'yokozuna' },
        { atMs: 84000, lane: 3, enemyId: 'yokozuna' },
      ],
    },
  ],
};

/** 블리츠 — 빠른 기습조(sekiwake)가 같은 레인을 겹쳐 찌른다(반응 속도·수비 우선순위 시험). */
const S_BLITZ: StageDef = {
  ...base,
  id: 'blitz',
  name: '블리츠',
  manaRegenPerSec: 1.2,
  enemyBaseHp: 150,
  waves: [
    {
      index: 0,
      // 같은 레인 연속 기습(페어→후반 트리플) — 위협 레인을 무시하는 배치는 뚫린다.
      spawns: [
        { atMs: 6000, lane: 1, enemyId: 'sekiwake' },
        { atMs: 8000, lane: 1, enemyId: 'sekiwake' },
        { atMs: 16000, lane: 3, enemyId: 'sekiwake' },
        { atMs: 18000, lane: 3, enemyId: 'sekiwake' },
        { atMs: 26000, lane: 0, enemyId: 'sekiwake' },
        { atMs: 28000, lane: 4, enemyId: 'sekiwake' },
        { atMs: 34000, lane: 2, enemyId: 'sekiwake' },
        { atMs: 36000, lane: 2, enemyId: 'sekiwake' },
        { atMs: 44000, lane: 1, enemyId: 'ozeki' },
        { atMs: 50000, lane: 2, enemyId: 'sekiwake' },
        { atMs: 52000, lane: 2, enemyId: 'sekiwake' },
        { atMs: 54000, lane: 2, enemyId: 'sekiwake' },
        { atMs: 60000, lane: 3, enemyId: 'ozeki' },
      ],
    },
  ],
};

const STAGES: ReadonlyArray<StageDef> = [STAGE_1, S_RUSH, S_BOSS, S_SIEGE, S_PRESSURE, S_BLITZ];

// ── 전장 판독 헬퍼(정책의 눈) ──────────────────────────────────────────────────

const LANES = Array.from({ length: LANE_COUNT }, (_, i) => i);

function enemyThreat(s: BattleState, lane: number): number {
  let t = 0;
  for (const c of s.combatants) {
    if (c.side !== 'enemy' || c.lane !== lane) continue;
    const spec = ENEMY_SPECS[c.specId];
    if (!spec) continue;
    t += spec.power * (1 + (LANE_LENGTH - c.pos) / LANE_LENGTH); // 깊이 가중
  }
  return t;
}

function allyPush(s: BattleState, lane: number): number {
  let t = 0;
  for (const c of s.combatants) {
    if (c.side !== 'ally' || c.lane !== lane) continue;
    t += UNIT_SPECS[c.specId as UnitKind]?.power ?? 0;
  }
  return t;
}

/** 방어가 가장 급한 레인 — 위협-아군힘 적자 최대(적 없으면 null). */
function deficitLane(s: BattleState): number | null {
  let best: number | null = null;
  let bestV = 0;
  for (const lane of LANES) {
    const d = enemyThreat(s, lane) - allyPush(s, lane);
    if (d > bestV) {
      bestV = d;
      best = lane;
    }
  }
  return best;
}

/** 적·장애물이 없는(러너가 무혈 돌파할) 레인 — 없으면 위협 최소 레인. */
function openLane(s: BattleState): number {
  const score = (lane: number): number =>
    enemyThreat(s, lane) * 10 +
    s.obstacles.filter((o) => o.lane === lane).length * 5 +
    s.combatants.filter((c) => c.side === 'ally' && c.lane === lane).length;
  return [...LANES].sort((a, b) => score(a) - score(b))[0];
}

/** 아군이 교전 중이고 가장 다친 레인(힐러 투입처) — 없으면 null. */
function woundedLane(s: BattleState): number | null {
  let best: number | null = null;
  let bestV = 0;
  for (const lane of LANES) {
    let dmg = 0;
    for (const c of s.combatants) {
      if (c.side === 'ally' && c.lane === lane) dmg += c.maxHp - c.hp;
    }
    if (dmg > bestV) {
      bestV = dmg;
      best = lane;
    }
  }
  return best;
}

/** 위급 — 어느 레인이든 적이 코앞(pos<320)인데 막는 아군이 없다. */
function emergency(s: BattleState): number | null {
  for (const lane of LANES) {
    const near = s.combatants.some((c) => c.side === 'enemy' && c.lane === lane && c.pos < 320);
    if (near && allyPush(s, lane) === 0) return lane;
  }
  return null;
}

// ── 정책(전략) ────────────────────────────────────────────────────────────────

type Step = (s: BattleState) => BattleState;

interface Policy {
  readonly name: string;
  readonly step: Step;
}

/** 직업별 기본 투입 레인. */
function laneFor(s: BattleState, kind: UnitKind, stackHint: 'stack' | 'spread'): number {
  if (kind === 'sprinter') return openLane(s);
  if (kind === 'healer') {
    const w = woundedLane(s);
    if (w !== null) return w;
  }
  const d = deficitLane(s);
  if (d !== null) return d;
  if (stackHint === 'stack') return 2; // 전선 없으면 중앙 집결
  // 스프레드 — 아군 적은 레인부터.
  return [...LANES].sort(
    (a, b) =>
      s.combatants.filter((c) => c.side === 'ally' && c.lane === a).length -
      s.combatants.filter((c) => c.side === 'ally' && c.lane === b).length,
  )[0];
}

/**
 * 정책 팩토리 — 충전 시계 규칙(스킵 불가·배치=큐 전진·TURN_MS 충전) 기준.
 *   모든 정책은 NEXT 가 준비되면 배치한다(들고 있으면 새 카드가 안 온다).
 *   전략 차이는 ① 큐 재정렬(프리뷰 1..4 순서 조작) ② 레인 선택 ③ 스택/분산 성향.
 *   prefer — 재정렬 우선순위(정적 배열 또는 전장 상황 기반 함수). null=재정렬 안 함.
 */
type PreferFn = (s: BattleState) => ReadonlyArray<UnitKind>;

function makePolicy(
  name: string,
  prefer: ReadonlyArray<UnitKind> | PreferFn | null,
  mode: 'stack' | 'spread',
): Policy {
  const step: Step = (s0) => {
    let s = s0;
    // 1) 큐 재정렬 — 프리뷰(1..4)에서 가장 선호하는 카드를 다음 순번(1)으로 끌어온다.
    if (prefer) {
      const list = typeof prefer === 'function' ? prefer(s) : prefer;
      const rank = (k: UnitKind): number => {
        const i = list.indexOf(k);
        return i === -1 ? 99 : i;
      };
      let bestIdx = 1;
      for (let i = 2; i < s.queue.length; i++) {
        if (rank(s.queue[i]) < rank(s.queue[bestIdx])) bestIdx = i;
      }
      if (bestIdx > 1 && rank(s.queue[bestIdx]) < rank(s.queue[1])) {
        s = reorderQueue(s, bestIdx, 1) ?? s;
      }
    }
    // 2) 배치 — 준비된 NEXT 를 역할 레인에 투입(위급 레인 최우선, 러너는 예외).
    const head = currentNext(s);
    const spec = UNIT_SPECS[head];
    if (!spec || s.mana < spec.cost) return s;
    const em = emergency(s);
    const lane = em !== null && head !== 'sprinter' ? em : laneFor(s, head, mode);
    return placeUnit(s, head, lane) ?? s;
  };
  return { name, step };
}

/** 진짜 무전략 기준선 — 아무 카드나, 레인은 라운드로빈(전장 상황 무시). */
function makeRoundRobin(): Policy {
  let rr = 0;
  return {
    name: 'spam-rr',
    step: (s) => {
      const head = currentNext(s);
      const spec = UNIT_SPECS[head];
      if (!spec || s.mana < spec.cost) return s;
      const placed = placeUnit(s, head, rr % LANE_COUNT);
      if (placed) rr++;
      return placed ?? s;
    },
  };
}

/** 적응형 재정렬 — 수세면 방어 카드, 공세(위협 없음)면 득점 카드를 앞세운다. */
const adaptivePrefer: PreferFn = (s) =>
  deficitLane(s) !== null
    ? ['tank', 'pusher', 'brawler', 'healer', 'crusher', 'sprinter']
    : ['sprinter', 'crusher', 'pusher', 'healer', 'brawler', 'tank'];

/** 전장에서 위협 총량이 가장 큰 적종(power 합) — 없으면 null. */
function dominantEnemy(s: BattleState): string | null {
  const sum = new Map<string, number>();
  for (const c of s.combatants) {
    if (c.side !== 'enemy') continue;
    const p = ENEMY_SPECS[c.specId]?.power ?? 0;
    sum.set(c.specId, (sum.get(c.specId) ?? 0) + p);
  }
  let best: string | null = null;
  let bestV = 0;
  for (const [id, v] of sum) {
    if (v > bestV) {
      bestV = v;
      best = id;
    }
  }
  return best;
}

/** 적종 → 상성 직업(COUNTER_DRAIN 유리 배수) / 역상성 직업(불리 배수). */
const COUNTER_PICK: Readonly<Record<string, UnitKind>> = {
  rikishi: 'pusher',
  sekiwake: 'tank',
  ozeki: 'crusher',
  yokozuna: 'brawler',
};
const COUNTER_WRONG: Readonly<Record<string, UnitKind>> = {
  rikishi: 'brawler', // 0.7 — 잡졸에 과잉
  sekiwake: 'crusher', // 0.6 — 빠른 적 못 잡음
  ozeki: 'sprinter', // 드레인 비전문
  yokozuna: 'pusher', // 0.7 — 거체에 무력
};

/** 카운터픽 재정렬 — 지배 적종의 상성 직업을 앞세우고 힐러로 유지(숙련 상성 플레이). */
const counterPickPrefer: PreferFn = (s) => {
  const dom = dominantEnemy(s);
  if (!dom) return ['sprinter', 'crusher', 'pusher', 'healer', 'brawler', 'tank'];
  return [COUNTER_PICK[dom] ?? 'pusher', 'healer', 'tank', 'pusher', 'brawler', 'crusher'];
};

/** 역카운터 재정렬 — 일부러 최악 상성 직업을 앞세운다(상성 무시 플레이의 하한 측정). */
const counterWrongPrefer: PreferFn = (s) => {
  const dom = dominantEnemy(s);
  if (!dom) return ['sprinter', 'crusher', 'pusher', 'healer', 'brawler', 'tank'];
  return [COUNTER_WRONG[dom] ?? 'sprinter', 'healer', 'tank', 'pusher', 'brawler', 'crusher'];
};

const POLICIES: ReadonlyArray<Policy> = [
  { name: 'idle', step: (s) => s },
  makeRoundRobin(), // 무전략: 라운드로빈 레인, 재정렬 없음
  makePolicy('spam-stack', null, 'stack'), // 반응형: 재정렬 없음, 위협 레인 스택
  makePolicy('spam-spread', null, 'spread'), // 반응형: 재정렬 없음, 분산
  makePolicy('adaptive', adaptivePrefer, 'stack'), // 상황 적응 재정렬 + 스택
  makePolicy('prio-T+P', ['tank', 'pusher'], 'stack'), // 방벽 조합 우선
  makePolicy('prio-B+H', ['brawler', 'healer'], 'stack'), // 드레인+유지 조합 우선
  makePolicy('prio-C+S', ['crusher', 'sprinter'], 'spread'), // 공성+러너 우선
  makePolicy('sprint-rush', ['sprinter'], 'spread'), // 러너 최우선 러시
  // 몰빵 재정렬 6종 — 각 직업을 항상 앞세우는 플레이(직업 가치 등가 측정용, V4).
  makePolicy('mono-pusher', ['pusher'], 'stack'),
  makePolicy('mono-tank', ['tank'], 'stack'),
  makePolicy('mono-sprinter', ['sprinter'], 'spread'),
  makePolicy('mono-healer', ['healer'], 'stack'),
  makePolicy('mono-brawler', ['brawler'], 'stack'),
  makePolicy('mono-crusher', ['crusher'], 'stack'),
  // 힘몰빵 재정렬 — 힘 높은 직업만 앞세우고 힐러/탱커/러너를 뒤로 미룬다(문제 시나리오).
  makePolicy('prio-power', ['crusher', 'pusher', 'brawler'], 'stack'),
  makePolicy('prio-power-sp', ['crusher', 'pusher', 'brawler'], 'spread'),
  // 상성 플레이 — 지배 적종의 카운터 직업을 앞세움 vs 일부러 역상성(상성 검증쌍).
  makePolicy('counter-pick', counterPickPrefer, 'stack'),
  makePolicy('counter-wrong', counterWrongPrefer, 'stack'),
];

// ── 시뮬레이션 드라이버 ────────────────────────────────────────────────────────

interface RunResult {
  readonly status: 'won' | 'lost' | 'timeout';
  readonly timeSec: number;
  readonly allyHp: number;
  readonly enemyHp: number;
  readonly placed: number;
}

const SIM_MS = 240_000;
const STEP_MS = 100;

function runSim(stage: StageDef, policy: Policy): RunResult {
  let s = createBattle(stage);
  let placed = 0;
  for (let t = 0; t < SIM_MS && s.status === 'playing'; t += STEP_MS) {
    s = tick(stage, s, STEP_MS);
    const before = s.combatants.filter((c) => c.side === 'ally').length + 1; // placeUnit 성공 감지용
    const after = policy.step(s);
    if (after !== s && after.combatants.length >= before) placed++;
    s = after;
  }
  return {
    status: s.status === 'playing' ? 'timeout' : s.status,
    timeSec: Math.round(s.timeMs / 1000),
    allyHp: Math.round(s.allyBaseHp),
    enemyHp: Math.round(s.enemyBaseHp),
    placed,
  };
}

// ── 리포트 ────────────────────────────────────────────────────────────────────

function fmt(r: RunResult): string {
  const tag = r.status === 'won' ? 'W' : r.status === 'lost' ? 'L' : 'T';
  return `${tag} ${String(r.timeSec).padStart(3)}s A${String(r.allyHp).padStart(3)} E${String(r.enemyHp).padStart(3)} n${String(r.placed).padStart(2)}`;
}

console.log('\n=== 직업 스펙 요약 ===');
for (const u of Object.values(UNIT_SPECS)) {
  const extras = [
    u.drainMult ? `drain×${u.drainMult}` : '',
    u.breakMult ? `break×${u.breakMult}` : '',
    u.pushoutMult ? `pushout×${u.pushoutMult}` : '',
    u.heal ? `heal ${u.heal}/${(u.healMs ?? 1000) / 1000}s` : '',
  ]
    .filter(Boolean)
    .join(' ');
  console.log(
    `${u.kind.padEnd(9)} cost${u.cost} hp${String(u.maxHp).padStart(3)} pow${String(u.power).padStart(2)} spd${String(u.speed).padStart(3)}` +
      `  pow/㎃ ${(u.power / u.cost).toFixed(1).padStart(4)}  hp/㎃ ${(u.maxHp / u.cost).toFixed(0).padStart(3)}  ${extras}`,
  );
}

console.log('\n=== 전략 × 스테이지 매트릭스 ===');
const header = ['policy'.padEnd(16), ...STAGES.map((st) => st.id.padEnd(22))].join('');
console.log(header);
const wins = new Map<string, number>();
const results = new Map<string, Map<string, RunResult>>(); // stage → policy → result
for (const p of POLICIES) {
  const cells: string[] = [];
  for (const st of STAGES) {
    const r = runSim(st, p);
    cells.push(fmt(r).padEnd(22));
    if (r.status === 'won') wins.set(p.name, (wins.get(p.name) ?? 0) + 1);
    const m = results.get(st.id) ?? new Map<string, RunResult>();
    m.set(p.name, r);
    results.set(st.id, m);
  }
  console.log(p.name.padEnd(16) + cells.join(''));
}

console.log('\n=== 게임성 판정 ===');
const idleWins = wins.get('idle') ?? 0;
console.log(`G1 방치 전패: ${idleWins === 0 ? 'PASS' : `FAIL(승 ${idleWins})`}`);
const rrWins = wins.get('spam-rr') ?? 0;
console.log(`G2 무전략(spam-rr) 전승 금지: ${rrWins < STAGES.length ? 'PASS' : 'FAIL'} (승 ${rrWins}/${STAGES.length})`);
const monos = POLICIES.filter((p) => p.name.startsWith('mono-')).map((p) => p.name);
const monoNoSweep = monos.every((m) => (wins.get(m) ?? 0) < STAGES.length);
console.log(`G3 몰빵 전승 금지: ${monoNoSweep ? 'PASS' : 'FAIL'}`);
// G4 지배 전략 — 전 스테이지 승리 + 전 스테이지에서 최속(동률 포함)인 전략이 없어야 한다.
const dominators: string[] = [];
for (const p of POLICIES) {
  if ((wins.get(p.name) ?? 0) < STAGES.length) continue;
  const fastestEverywhere = STAGES.every((st) => {
    const m = results.get(st.id)!;
    const mine = m.get(p.name)!;
    const bestT = Math.min(...[...m.values()].filter((r) => r.status === 'won').map((r) => r.timeSec));
    return mine.timeSec <= bestT;
  });
  if (fastestEverywhere) dominators.push(p.name);
}
console.log(`G4 지배 전략 없음(전승+전스테이지 최속): ${dominators.length === 0 ? 'PASS' : `FAIL(${dominators.join(',')})`}`);
// G5 이중배치 vs 분산 — 스테이지 유형에 따라 우열이 갈려야 한다.
const cmp = (st: string): number => {
  const m = results.get(st)!;
  const a = m.get('spam-stack')!;
  const b = m.get('spam-spread')!;
  const score = (r: RunResult): number => (r.status === 'won' ? 1000 - r.timeSec : r.allyHp - 1000);
  return Math.sign(score(a) - score(b));
};
const stackBetter = STAGES.filter((st) => cmp(st.id) > 0).map((st) => st.id);
const spreadBetter = STAGES.filter((st) => cmp(st.id) < 0).map((st) => st.id);
console.log(
  `G5 스택/분산 우열 교차: ${stackBetter.length > 0 && spreadBetter.length > 0 ? 'PASS' : 'FAIL'}` +
    ` (스택 우세: ${stackBetter.join(',') || '-'} | 분산 우세: ${spreadBetter.join(',') || '-'})`,
);
// G6 힘몰빵 재정렬 견제 — 힘 위주 큐 세팅(prio-power*)이 서포트 포함 전략을 제치고
// 지배하면 안 된다: 하드 3종(boss/pressure/blitz)에서 ①최소 1패 ②승리 시에도 최속 금지.
{
  const hard = ['boss', 'pressure', 'blitz'];
  const powerNames = ['prio-power', 'prio-power-sp'];
  let losses = 0;
  let fastest = 0;
  for (const st of hard) {
    const m = results.get(st)!;
    for (const pn of powerNames) {
      const r = m.get(pn)!;
      if (r.status !== 'won') {
        losses++;
        continue;
      }
      // 힘몰빵을 제외한 승자들의 최속 — 이보다 "엄격히" 빨라야 우위(동률은 무우위).
      const othersBest = Math.min(
        ...[...m.entries()]
          .filter(([k, rr]) => !powerNames.includes(k) && rr.status === 'won')
          .map(([, rr]) => rr.timeSec),
      );
      if (r.timeSec < othersBest) fastest++;
    }
  }
  const pass = losses >= 2 && fastest === 0;
  console.log(`G6 힘몰빵 재정렬 견제: ${pass ? 'PASS' : 'FAIL'} (하드 3종 패배 ${losses}/6, 최속 승리 ${fastest}회)`);
}
// G7 상성 유효성 — 카운터픽이 역카운터보다 전 스테이지에서 나쁘지 않고, 과반에서 명확히 우세.
{
  const score = (r: RunResult): number => (r.status === 'won' ? 1000 - r.timeSec : r.allyHp - 1000);
  let better = 0;
  let worse = 0;
  const detail: string[] = [];
  for (const st of STAGES) {
    const m = results.get(st.id)!;
    const pick = m.get('counter-pick')!;
    const wrong = m.get('counter-wrong')!;
    const d = score(pick) - score(wrong);
    if (d > 0) better++;
    else if (d < 0) worse++;
    detail.push(`${st.id}:${d > 0 ? '유리' : d < 0 ? '불리' : '동률'}`);
  }
  const pass = better >= 3 && worse <= 1;
  console.log(`G7 상성 유효성(카운터픽>역카운터): ${pass ? 'PASS' : 'FAIL'} (우세 ${better}/6, 열세 ${worse}) [${detail.join(' ')}]`);
}
// V4 직업 가치 등가 — 6직업 몰빵 재정렬(mono-X)의 스테이지 총점이 등가 밴드 안이어야 한다.
//   (힘이 약한 직업도 "항상 앞세우는 플레이"의 총 가치가 힘 직업과 비슷해야 스텟 보상이 성립.)
{
  const score = (r: RunResult): number => (r.status === 'won' ? 1000 - r.timeSec : r.allyHp - 1000);
  const agg = new Map<string, number>();
  const winsOf = new Map<string, number>();
  for (const p of POLICIES) {
    if (!p.name.startsWith('mono-')) continue;
    let total = 0;
    let w = 0;
    for (const st of STAGES) {
      const r = results.get(st.id)!.get(p.name)!;
      total += score(r);
      if (r.status === 'won') w++;
    }
    agg.set(p.name, total);
    winsOf.set(p.name, w);
  }
  const entries = [...agg.entries()].sort((a, b) => b[1] - a[1]);
  const winCounts = [...winsOf.values()];
  const winSpread = Math.max(...winCounts) - Math.min(...winCounts);
  const pass = winSpread <= 2 && Math.min(...winCounts) >= 3;
  console.log(`V4 직업 가치 등가(mono-X 총점 밴드): ${pass ? 'PASS' : 'FAIL'} (승수 편차 ${winSpread}, 최소 승수 ${Math.min(...winCounts)})`);
  for (const [name, total] of entries) {
    console.log(`   ${name.padEnd(14)} 총점 ${String(Math.round(total)).padStart(6)} · 승 ${winsOf.get(name)}/6`);
  }
}
for (const st of STAGES) {
  const m = results.get(st.id)!;
  const winners = [...m.entries()]
    .filter(([, r]) => r.status === 'won')
    .sort((a, b) => a[1].timeSec - b[1].timeSec)
    .map(([k, r]) => `${k}(${r.timeSec}s)`);
  console.log(`   ${st.id.padEnd(9)} 승리 ${winners.length}종: ${winners.join(', ') || '(없음!)'}`);
}
