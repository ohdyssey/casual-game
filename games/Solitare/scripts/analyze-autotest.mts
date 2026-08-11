/**
 * analyze-autotest.mts — **게임 내 자동 시뮬레이션(PlayScene 배속 자동테스트) 결과 분석기**.
 *
 * 플레이 화면의 「💾 데이터 내보내기」로 받은 JSON(LevelTestResult[])을 읽어 집계 리포트를 콘솔에 찍고,
 *   scripts/reports/level-simulation-report.json 에 실측(live*) 필드로 병합한다(생성기의 오프라인 예측과 대조).
 * 같은 레벨을 여러 번 자동테스트했으면(레벨 반복 실행) 파일을 여러 개 넘겨 합칠 수 있다 — 레벨별로 그룹핑해
 *   승/패 비율·평균 잔여스톡을 낸다(표본이 1회면 승률은 0% 또는 100%로만 나오니 참고용).
 *
 * 사용: npx tsx scripts/analyze-autotest.mts <내보낸-json-경로...>
 */
import fs from 'node:fs';

interface LevelTestResult {
  level: number;
  win: boolean;
  leftoverStock: number;
  moves: number;
  maxCombo: number;
  comboRuns: number[];
  drawCount: number;
  ts: number;
}

const REPORT_FILE = './scripts/reports/level-simulation-report.json';
const avg = (xs: number[]): number => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);

const files = process.argv.slice(2);
if (!files.length) {
  console.error('사용: npx tsx scripts/analyze-autotest.mts <내보낸-json-경로...>');
  process.exit(1);
}

const all: LevelTestResult[] = [];
for (const f of files) {
  const raw = JSON.parse(fs.readFileSync(f, 'utf8')) as LevelTestResult[];
  all.push(...raw);
}
if (!all.length) {
  console.log('데이터가 비어 있습니다.');
  process.exit(0);
}

// ── 전체 요약 ──
const wins = all.filter((r) => r.win).length;
console.log(`총 ${all.length}건 | 승 ${wins}(${((wins / all.length) * 100).toFixed(1)}%) | 패(교착) ${all.length - wins}`);
console.log(`평균 이동수 ${avg(all.map((r) => r.moves)).toFixed(1)} | 평균 드로우 ${avg(all.map((r) => r.drawCount)).toFixed(1)}`);
const winLeftovers = all.filter((r) => r.win).map((r) => r.leftoverStock);
if (winLeftovers.length) {
  console.log(
    `승리 시 최종 잔여 뽑기카드: 평균 ${avg(winLeftovers).toFixed(1)} (min ${Math.min(...winLeftovers)} / max ${Math.max(...winLeftovers)})`,
  );
}

// ── 콤보런 길이 분포 ──
const allRuns = all.flatMap((r) => r.comboRuns);
const bucketOf = (n: number): string => (n <= 4 ? String(n) : n < 10 ? '5-9' : '10+');
const buckets = new Map<string, number>();
for (const n of allRuns) buckets.set(bucketOf(n), (buckets.get(bucketOf(n)) ?? 0) + 1);
console.log('\n콤보런(끊기지 않고 이어진 매치 수) 길이 분포:');
for (const k of ['1', '2', '3', '4', '5-9', '10+']) {
  const v = buckets.get(k) ?? 0;
  console.log(`  ${k}: ${v}건 (${allRuns.length ? ((v / allRuns.length) * 100).toFixed(1) : '0.0'}%)`);
}

// ── 레벨별 그룹핑 ──
const byLevel = new Map<number, LevelTestResult[]>();
for (const r of all) {
  const arr = byLevel.get(r.level) ?? [];
  arr.push(r);
  byLevel.set(r.level, arr);
}

// ── 패배(교착) 레벨 플래그 ──
const losses = all.filter((r) => !r.win).sort((a, b) => a.level - b.level);
if (losses.length) {
  console.log(`\n⚠️ 패배(교착으로 카드가 더 안 남을 때까지 못 품) ${losses.length}건:`);
  for (const r of losses) console.log(`  lv${r.level} — 이동 ${r.moves}회, 드로우 ${r.drawCount}회`);
} else {
  console.log('\n✅ 패배(교착) 없음.');
}

// ── 오프라인 생성기 예측(scripts/design-levels.mts·simulate-levels.mts 리포트)과 대조 ──
let report: Record<string, { winRate?: number; avgLeftover?: number }> = {};
try {
  report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));
} catch {
  console.log(`\n(참고: ${REPORT_FILE} 없음 — 예측 대조 생략. design-levels.mts 나 simulate-levels.mts 를 먼저 실행하면 대조됩니다)`);
}
if (Object.keys(report).length) {
  console.log('\n실측(자동테스트) vs 예측(오프라인 그리디 시뮬) 큰 괴리만 표시(표본 적으면 노이즈 큼 — 참고용):');
  let flagged = 0;
  for (const [lv, runs] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
    const pred = report[String(lv)];
    if (!pred || pred.winRate == null) continue;
    const liveWinRate = runs.filter((r) => r.win).length / runs.length;
    if ((pred.winRate >= 0.6 && liveWinRate === 0) || (pred.winRate < 0.2 && liveWinRate === 1 && runs.length >= 2)) {
      console.log(`  lv${lv}: 예측승률 ${(pred.winRate * 100).toFixed(0)}% vs 실측 ${(liveWinRate * 100).toFixed(0)}%(${runs.length}회)`);
      flagged++;
    }
  }
  if (!flagged) console.log('  (뚜렷한 괴리 없음)');
}

// ── 레벨별 실측 통계를 리포트에 병합(live* 필드, 리포트 파일이 없으면 새로 만든다) ──
try {
  let existing: Record<string, Record<string, unknown>> = {};
  try {
    existing = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));
  } catch {
    /* 생성기를 아직 안 돌렸으면 빈 리포트로 시작 */
  }
  for (const [lv, runs] of byLevel) {
    const prev = existing[String(lv)] ?? {};
    existing[String(lv)] = {
      ...prev,
      liveRuns: runs.length,
      liveWinRate: Math.round((runs.filter((r) => r.win).length / runs.length) * 1000) / 1000,
      liveAvgLeftover: Math.round(avg(runs.filter((r) => r.win).map((r) => r.leftoverStock)) * 100) / 100,
      liveAvgMoves: Math.round(avg(runs.map((r) => r.moves)) * 10) / 10,
    };
  }
  fs.mkdirSync('./scripts/reports', { recursive: true });
  fs.writeFileSync(REPORT_FILE, JSON.stringify(existing, null, 2), 'utf8');
  console.log(`\n📊 실측 통계(live* 필드)를 ${REPORT_FILE} 에 병합했습니다.`);
} catch (e) {
  console.log(`\n(리포트 병합 실패: ${e instanceof Error ? e.message : String(e)})`);
}
