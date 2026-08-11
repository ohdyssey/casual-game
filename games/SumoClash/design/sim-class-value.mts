/**
 * 직업 가치 시뮬레이션 — 6직업의 스텟 역학(축별 가치·힘 역보상) 검증 도구.
 *
 *   실행: node_modules/.bin/tsx games/SumoClash/design/sim-class-value.mts   (모노레포 루트)
 *
 * 원칙: **힘(power)이 약한 직업은 다른 축이 그만큼 강해야 한다** — 6직업 × 6축 분업.
 *   밀기(P) · 기력(T) · 득점(S) · 유지(H) · 처치(B) · 공성(C) — 축마다 챔피언은 하나.
 *
 * 판정(합격선):
 *   V1. 축 챔피언 전담제 — 6축의 1등이 정확히 설계된 직업과 일치(중복 챔피언 금지).
 *   V2. 힘 역보상 — 밀기/㎃ 하위 3직업은 자기 전문축에서 2위와 1.3배 이상 격차.
 *   V3. 처치 역학 — 듀얼(2인 스택 vs 적)에서 B 는 4적종 전부 처치 가능, 최속 처치.
 *   (거시 가치 등가는 sim-strategies.mts 의 V4 판정 — mono-X 스테이지 총점 밴드.)
 */
import { createBattle, MAX_PUSH_V, PUSHOUT_DAMAGE_K, tick } from '../src/logic/battle.js';
import { ENEMY_SPECS, UNIT_SPECS } from '../src/logic/roster.js';
import {
  type BattleState,
  type Combatant,
  type StageDef,
  type UnitKind,
} from '../src/logic/types.js';

// ── 벤치 전장(웨이브 없음) ────────────────────────────────────────────────────
function arena(obstacle?: { pos: number; durability: number }): StageDef {
  return {
    id: 'bench',
    name: '벤치',
    allyBaseHp: 1000,
    enemyBaseHp: 1000,
    manaRegenPerSec: 0,
    startMana: 0,
    obstacles: obstacle ? [{ lane: 2, ...obstacle }] : [],
    waves: [],
  };
}

let uid = 1000;
function inject(s: BattleState, side: Combatant['side'], specId: string, pos: number): BattleState {
  const spec = side === 'ally' ? UNIT_SPECS[specId as UnitKind] : ENEMY_SPECS[specId];
  const c: Combatant = {
    uid: uid++,
    side,
    lane: 2,
    pos,
    hp: spec.maxHp,
    maxHp: spec.maxHp,
    specId,
    nextActAt: 0,
  };
  return { ...s, combatants: [...s.combatants, c] };
}

function run(stage: StageDef, s: BattleState, ms: number, until?: (s: BattleState) => boolean): BattleState {
  for (let t = 0; t < ms; t += 100) {
    s = tick(stage, s, 100);
    if (until?.(s)) break;
  }
  return s;
}

const KINDS = Object.keys(UNIT_SPECS) as UnitKind[];
const ENEMIES = Object.keys(ENEMY_SPECS);

// ── 미시 벤치마크(실제 엔진 듀얼) ─────────────────────────────────────────────

/** 듀얼: 아군 2인 스택(+선택 힐러) vs 적 1 — 결말과 소요 시간. */
interface DuelResult {
  readonly outcome: 'kill' | 'ringout' | 'wiped' | 'stall';
  readonly timeSec: number;
}

function duel(kind: UnitKind, enemyId: string, withHealer = false): DuelResult {
  const stage = arena();
  let s = createBattle(stage);
  s = inject(s, 'enemy', enemyId, 700);
  s = inject(s, 'ally', kind, 660);
  s = inject(s, 'ally', kind, 660 - 34);
  if (withHealer) s = inject(s, 'ally', 'healer', 660 - 68);
  const enemyUid = s.combatants[0].uid;
  const end = run(stage, s, 60_000, (st) => !st.combatants.some((c) => c.uid === enemyUid) || !st.combatants.some((c) => c.side === 'ally'));
  const t = end.timeMs / 1000;
  const enemyGone = !end.combatants.some((c) => c.uid === enemyUid);
  if (enemyGone) {
    // 링아웃(상단 밖)과 처치 구분 — 게이지가 깎였으면 링아웃.
    return { outcome: end.enemyBaseHp < 1000 ? 'ringout' : 'kill', timeSec: t };
  }
  if (!end.combatants.some((c) => c.side === 'ally')) return { outcome: 'wiped', timeSec: t };
  return { outcome: 'stall', timeSec: t };
}

/** 선두 생존: 1인이 오제키를 정면에서 받아낼 때 버티는 시간(처치/링아웃하면 60s 만점). */
function frontSurvival(kind: UnitKind): number {
  const stage = arena();
  let s = createBattle(stage);
  s = inject(s, 'enemy', 'ozeki', 520);
  s = inject(s, 'ally', kind, 480);
  const myUid = s.combatants[1].uid;
  const end = run(stage, s, 60_000, (st) => !st.combatants.some((c) => c.uid === myUid));
  return end.combatants.some((c) => c.uid === myUid) ? 60 : end.timeMs / 1000;
}

/** 공성: 장애물 접촉 상태에서 내구도 300을 깨는 순수 파괴 시간(도달 제외, 상한 60s). */
function siegeTime(kind: UnitKind): number {
  const stage = arena({ pos: 500, durability: 300 });
  let s = createBattle(stage);
  s = inject(s, 'ally', kind, 500 - 46); // OBSTACLE_GAP 바로 앞 — 즉시 파괴 시작
  const end = run(stage, s, 60_000, (st) => st.obstacles.length === 0);
  return end.obstacles.length === 0 ? end.timeMs / 1000 : 60;
}

/** 득점: 빈 레인 완주 시간과 1회 돌파 게이지 피해 → 분당 게이지 피해 / ㎃. */
function scoreAxis(kind: UnitKind): { crossSec: number; dmg: number; ratePerMana: number } {
  const u = UNIT_SPECS[kind];
  const stage = arena();
  let s = createBattle(stage);
  s = inject(s, 'ally', kind, 1);
  const end = run(stage, s, 60_000, (st) => st.combatants.length === 0);
  const crossSec = end.timeMs / 1000;
  const dmg = u.power * (u.pushoutMult ?? 1) * PUSHOUT_DAMAGE_K;
  return { crossSec, dmg, ratePerMana: (dmg / crossSec) * 60 / u.cost };
}

// ── 측정 ─────────────────────────────────────────────────────────────────────

interface AxisRow {
  readonly kind: UnitKind;
  readonly push: number; // 밀기/㎃
  readonly stamina: number; // 기력/㎃
  readonly kill: number; // 처치력/㎃ — 정예(오제키·요코즈나) 처치 속도(잡졸 제외)
  readonly score: number; // 득점/㎃ — 분당 게이지 피해
  readonly sustain: number; // 유지/㎃ — 초당 회복량
  readonly siege: number; // 공성/㎃ — 접촉 후 분당 내구도 파괴량
}

/** 처치 축은 정예전 기준 — 잡졸(rikishi/sekiwake)은 누구나 잡아서 변별력이 없다. */
const ELITES = ['ozeki', 'yokozuna'];

const rows: AxisRow[] = [];
const duelTable = new Map<UnitKind, Map<string, DuelResult>>();

for (const kind of KINDS) {
  const u = UNIT_SPECS[kind];
  const duels = new Map<string, DuelResult>();
  let killScore = 0;
  for (const e of ENEMIES) {
    const r = duel(kind, e, true); // 힐러 지원 표준 듀얼(전선 유지 전제의 처치 역학)
    duels.set(e, r);
    if (ELITES.includes(e) && r.outcome === 'kill') killScore += 60 / r.timeSec; // 정예만 가산
  }
  duelTable.set(kind, duels);
  const sc = scoreAxis(kind);
  rows.push({
    kind,
    push: u.power / u.cost,
    stamina: u.maxHp / u.cost,
    kill: killScore / ELITES.length / u.cost,
    score: sc.ratePerMana,
    sustain: (u.heal ?? 0) / ((u.healMs ?? 1000) / 1000) / u.cost,
    siege: (300 / siegeTime(kind)) * 60 / u.cost / 100, // 분당 파괴량(백단위 스케일)
  });
}

// ── 리포트 ────────────────────────────────────────────────────────────────────

const AXES = ['push', 'stamina', 'kill', 'score', 'sustain', 'siege'] as const;
type Axis = (typeof AXES)[number];
const AXIS_KO: Record<Axis, string> = {
  push: '밀기', stamina: '기력', kill: '처치', score: '득점', sustain: '유지', siege: '공성',
};
/** 설계상 축 챔피언(전담제). */
const DESIGNED_CHAMPION: Record<Axis, UnitKind> = {
  push: 'pusher', stamina: 'tank', kill: 'brawler', score: 'sprinter', sustain: 'healer', siege: 'crusher',
};

const maxOf = (a: Axis): number => Math.max(...rows.map((r) => r[a]));
const norm = (r: AxisRow, a: Axis): number => (maxOf(a) > 0 ? r[a] / maxOf(a) : 0);

console.log('\n=== 직업 × 6축 가치(/㎃ 정규화 — 축 1등=1.00) ===');
console.log('직업'.padEnd(9) + AXES.map((a) => AXIS_KO[a].padStart(6)).join('') + '   전문축');
for (const r of rows) {
  const specialty = AXES.filter((a) => DESIGNED_CHAMPION[a] === r.kind).map((a) => AXIS_KO[a]).join(',');
  console.log(
    r.kind.padEnd(9) +
      AXES.map((a) => norm(r, a).toFixed(2).padStart(6)).join('') +
      `   ${specialty || '-'}`,
  );
}

console.log('\n=== 듀얼 역학(2인 스택+힐러 vs 적 1) — 결말(초) ===');
console.log('직업'.padEnd(9) + ENEMIES.map((e) => e.padStart(10)).join(''));
const mark = (r: DuelResult): string =>
  `${{ kill: '처치', ringout: '링아웃', wiped: '전멸', stall: '교착' }[r.outcome]}${Math.round(r.timeSec)}`.padStart(10);
for (const kind of KINDS) {
  const m = duelTable.get(kind)!;
  console.log(kind.padEnd(9) + ENEMIES.map((e) => mark(m.get(e)!)).join(''));
}

console.log('\n=== 판정 ===');
// V1 축 챔피언 전담제.
let v1 = true;
for (const a of AXES) {
  const champ = [...rows].sort((x, y) => y[a] - x[a])[0].kind;
  const ok = champ === DESIGNED_CHAMPION[a];
  if (!ok) v1 = false;
  console.log(`   ${AXIS_KO[a]} 축 1등: ${champ}${ok ? '' : ` (설계는 ${DESIGNED_CHAMPION[a]}!)`}`);
}
console.log(`V1 축 챔피언 전담제(6축=6직업): ${v1 ? 'PASS' : 'FAIL'}`);

// V2 힘 역보상 — 밀기/㎃ 하위 3직업은 전문축에서 2위 대비 1.3배 이상.
const pushSorted = [...rows].sort((x, y) => x.push - y.push);
const weak3 = pushSorted.slice(0, 3).map((r) => r.kind);
let v2 = true;
for (const kind of weak3) {
  const myAxis = AXES.find((a) => DESIGNED_CHAMPION[a] === kind);
  if (!myAxis) {
    v2 = false;
    console.log(`   ${kind}: 전문축 없음!`);
    continue;
  }
  const sorted = [...rows].sort((x, y) => y[myAxis] - x[myAxis]);
  const lead = sorted[0][myAxis] / Math.max(1e-9, sorted[1][myAxis]);
  const ok = sorted[0].kind === kind && lead >= 1.3;
  if (!ok) v2 = false;
  console.log(`   힘 약자 ${kind} → ${AXIS_KO[myAxis]} 축 격차 ×${lead.toFixed(2)} ${ok ? 'OK' : 'FAIL'}`);
}
console.log(`V2 힘 역보상(하위 3직업 전문축 압도): ${v2 ? 'PASS' : 'FAIL'}`);

// V3 처치 역학 — B 는 4적종 전부 처치, 그리고 요코즈나 최속 처치.
const bDuels = duelTable.get('brawler')!;
const bAllKill = ENEMIES.every((e) => bDuels.get(e)!.outcome === 'kill');
const yokoKillTimes = KINDS.map((k) => {
  const r = duelTable.get(k)!.get('yokozuna')!;
  return { k, t: r.outcome === 'kill' ? r.timeSec : Infinity };
}).sort((x, y) => x.t - y.t);
const v3 = bAllKill && yokoKillTimes[0].k === 'brawler';
console.log(
  `V3 처치 역학(B 전적종 처치·요코즈나 최속): ${v3 ? 'PASS' : 'FAIL'} ` +
    `(요코즈나 처치 순위: ${yokoKillTimes.filter((x) => x.t < Infinity).map((x) => `${x.k} ${x.t.toFixed(0)}s`).join(' > ') || '없음'})`,
);
console.log(`(참고) MAX_PUSH_V=${MAX_PUSH_V} — 링아웃 결말은 밀기 축의 성과로 별도 해석.`);
console.log(`(거시 등가는 sim-strategies.mts 의 V4 — mono-X 총점 밴드 판정 참조)`);
