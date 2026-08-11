/**
 * balance.mts — **난이도 표가 실제로 어떤 곡선인지 숫자로 본다.**
 *
 *   npm run balance            초보·보통·숙련 세 실력으로 20레벨을 각 400판씩
 *   npm run balance -- 1200    판 수를 바꿔서
 *
 * ⚠️⚠️ 손잡이(`logic/stage.STAGE_TUNING`)를 만질 때는 **고치기 전과 후를 나란히 놓고** 보라.
 *    셋이 얽혀 있어 하나만 봐서는 어디가 어떻게 되는지 알 수 없다.
 *
 * ⚠️ 시간 모형은 `logic/sim/timeline.ts` 의 연출 길이를 쓴다 — 연출을 고치면 거기도 고쳐야
 *    이 표가 **딴 게임을 재지 않는다.**
 */
import { STAGE_TUNING_ROUNDS, stageOrders, stagePacingSec, stageTimeMs } from '../src/logic/stage.js';
import { STAGE_MENU_ROUNDS } from '../src/logic/stageTray.js';
import { SKILLS } from '../src/logic/sim/skill.js';
import { report, type LevelReport } from '../src/logic/sim/simulate.js';

const trials = Number(process.argv[2] ?? 400) || 400;
const levels = Array.from({ length: STAGE_MENU_ROUNDS }, (_, i) => i);

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const one = (v: number): string => v.toFixed(1);

/** 목표 곡선 — 여기서 크게 벗어나면 표를 손댈 때다. */
const TARGET: readonly { readonly upTo: number; readonly clear: [number, number] }[] = [
  { upTo: 2, clear: [0.85, 1.0] }, // 1~3판 · 배우는 구간이라 거의 다 깬다
  { upTo: 6, clear: [0.6, 0.95] }, // 4~7판 · 조여 오기 시작
  { upTo: 12, clear: [0.4, 0.85] }, // 8~13판
  { upTo: 99, clear: [0.25, 0.75] }, // 14판~ · 숙련자만 꾸준히 깬다
];
const targetFor = (level: number): [number, number] =>
  TARGET.find((t) => level <= t.upTo)?.clear ?? [0, 1];

function table(name: string, rows: readonly LevelReport[]): void {
  console.log(`\n■ ${name}`);
  console.log('| 레벨 | 목표 | 클리어율 | 처리 | 실패 | 남긴시간 | 미션 | 잔고 | 별 |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    console.log(
      `| ${r.level + 1} | ${stageOrders(r.level)}건 | ${pct(r.clearRate).padStart(4)} | ` +
        `${one(r.servedAvg)} | ${one(r.failAvg)} | ${one(r.spareSec)}초 | ` +
        `${one(r.missionsAvg)}/3 | $${Math.round(r.moneyAvg)} | ${one(r.starsAvg)} |`,
    );
  }
}

console.log(`판마다 ${trials}회 · 레벨 ${levels.length}개 · 난이도 표 ${STAGE_TUNING_ROUNDS}줄(그 뒤는 천장)`);
console.log('\n■ 지금 표');
console.log('| 레벨 | 처리량 | 판 시간 | 건당 벽시계 |');
console.log('|---|---|---|---|');
for (const l of levels) {
  console.log(
    `| ${l + 1} | ${stageOrders(l)}건 | ${(stageTimeMs(l) / 1000).toFixed(0)}초 | ${stagePacingSec(l).toFixed(1)}초 |`,
  );
}

const all = SKILLS.map((skill) => ({ skill, rows: report(levels, skill, trials) }));
for (const { skill, rows } of all) table(`${skill.name} (탭 ${skill.tapMs}ms · 실수 ${pct(skill.slipRate)})`, rows);

// ── 목표에서 벗어난 구간 ────────────────────────────────────────────────
console.log('\n■ 검토가 필요한 곳 — 「보통」 실력 기준');
const normal = all.find((a) => a.skill.name === '보통')?.rows ?? [];
let flagged = 0;
for (const r of normal) {
  const [lo, hi] = targetFor(r.level);
  if (r.clearRate >= lo && r.clearRate <= hi) continue;
  flagged++;
  const why = r.clearRate < lo ? '너무 어렵다' : '너무 쉽다';
  console.log(
    `  ${String(r.level + 1).padStart(2)}판  클리어율 ${pct(r.clearRate)} (목표 ${pct(lo)}~${pct(hi)}) — ${why}` +
      `   처리 ${one(r.servedAvg)}/${stageOrders(r.level)} · 남긴시간 ${one(r.spareSec)}초`,
  );
}
if (flagged === 0) console.log('  없음 — 목표 곡선 안이다.');

// ── 미션 종류별 달성률 — 어느 미션이 헐거운지는 종류로 갈라 봐야 보인다 ──────
console.log('\n■ 미션이 헐거운가 — 「보통」 실력, 종류별');
const kinds = new Map<string, { done: number; n: number; pot: number; goal: number }>();
for (const r of normal) {
  for (const k of r.kinds) {
    const at = kinds.get(k.kind) ?? { done: 0, n: 0, pot: 0, goal: 0 };
    kinds.set(k.kind, {
      done: at.done + k.doneRate,
      n: at.n + 1,
      pot: at.pot + k.potentialAvg,
      goal: at.goal + k.goal,
    });
  }
}
console.log('| 미션 | 달성률 | 평균 목표 | 낼 수 있었던 값 | 여유 |');
console.log('|---|---|---|---|---|');
for (const [kind, v] of [...kinds.entries()].sort((a, b) => b[1].done / b[1].n - a[1].done / a[1].n)) {
  const goal = v.goal / v.n;
  const got = v.pot / v.n;
  const slack = goal > 0 ? got / goal : 0;
  console.log(
    `| ${kind.padEnd(9)} | ${pct(v.done / v.n).padStart(4)} | ${one(goal)} | ${one(got)} | ×${slack.toFixed(2)} |`,
  );
}

// ── 제한시간 역산 — 미션을 다 채우는 데 실제로 걸린 시간에서 거꾸로 잡는다 ────
console.log('\n■ 제한시간 역산 — 미션 셋을 다 채우는 데 걸린 시간(다 채운 판만)');
console.log('| 레벨 | 지금 판 시간 | 보통 중앙값 | 보통 상위80% | 숙련 중앙값 | 지금 여유(보통 80% 대비) |');
console.log('|---|---|---|---|---|---|');
// ⚠️ **넉넉한 예산으로 다시 잰다** — 지금 판 시간으로 재면 오래 걸린 판이 시간에 잘려
//    「상위 80% = 판 시간」으로 나와 진짜 소요 시간을 알 수 없다.
const FREE_BUDGET_MS = 900_000;
const freeNormal = report(levels, SKILLS.find((s) => s.name === '보통')!, trials, FREE_BUDGET_MS);
const freeSkilled = report(levels, SKILLS.find((s) => s.name === '숙련')!, trials, FREE_BUDGET_MS);
const skilled = freeSkilled;
for (const r of freeNormal) {
  const budget = stageTimeMs(r.level) / 1000;
  const p80 = r.usedSecP80;
  const slack = p80 > 0 ? budget / p80 : 0;
  console.log(
    `| ${r.level + 1} | ${budget.toFixed(0)}초 | ${one(r.usedSecMedian)}초 | ${one(p80)}초 | ` +
      `${one(skilled[r.level]?.usedSecMedian ?? 0)}초 | ×${slack.toFixed(2)} |`,
  );
}

console.log('\n■ 실력이 갈리는가 — 같은 판에서 셋의 클리어율');
console.log('| 레벨 | ' + SKILLS.map((s) => s.name).join(' | ') + ' |');
console.log('|---|' + SKILLS.map(() => '---|').join(''));
for (const l of levels) {
  console.log(`| ${l + 1} | ` + all.map((a) => pct(a.rows[l]?.clearRate ?? 0)).join(' | ') + ' |');
}
