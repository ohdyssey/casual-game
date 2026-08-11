/**
 * run-payout-sim.mjs — payoutSim.ts 를 tsx 로 실행해 **초기 레벨1·300스핀 지급 시뮬** 결과를 콘솔+JSON 출력.
 *
 * 사용: npx tsx scripts/run-payout-sim.mjs [--daily 300 --roundsPerDay 100]
 *   기본 = 무보충(순수 300스핀 소진). --daily/--roundsPerDay 로 일일 보충 시나리오도 측정.
 */
import { defaultPayoutParams, simulatePayoutAvg, simulatePayout } from '../src/econ/payoutSim.ts';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : def;
};

const p = defaultPayoutParams();
p.dailySpins = arg('daily', 0);
p.roundsPerDay = arg('roundsPerDay', 0);

const pct = (x) => (x * 100).toFixed(1) + '%';
const share = (rec) => {
  const tot = Object.values(rec).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(rec)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}(${pct(v / tot)})`)
    .join('  ');
};

console.log('═══ 지급 시뮬레이션 — 초기 레벨1 · 스핀 ' + p.startSpins + ' ═══');
console.log(`파라미터: betting=${p.spinBet} betCoin=${p.spinBet * p.coinDenom} RTP=${p.slotRtpScale} raidScale=${p.raidStakeScale} attackScale=${p.attackSpinStakeScale} daily=${p.dailySpins}/${p.roundsPerDay}r\n`);

const r = simulatePayoutAvg(p, 16);
const spinInTotal = Object.values(r.spinIn).reduce((a, b) => a + b, 0);
console.log('─ 생존/소진 ─');
console.log(`  소진됨: ${r.depleted ? 'YES (스핀 고갈)' : 'NO (무한 지속 — 순유입 ≥ 소모)'}`);
console.log(`  생존 라운드: ${r.rounds}  (플레이한 스핀 수 = 라운드)`);
console.log(`  최종 스핀: ${r.endSpins}  · 최저 스핀(아슬아슬 지표): ${r.minSpins}`);
console.log(`  순 스핀/라운드: ${r.netSpinPerRound}  (0 근처=아슬아슬 · 양수=인플레·음수=소진)`);
console.log('─ 진행 ─');
console.log(`  시티레벨(누적 시설업): ${r.cityLevel}  · 시설 업그레이드: ${r.facilityUpgrades}  · 미션 완료: ${r.missionsCompleted}`);
console.log('─ 스핀 유입(소스별, 총 ' + Math.round(spinInTotal) + ') ─');
console.log('  ' + share(r.spinIn));
console.log('  지급횟수: ' + share(r.spinInCount));
console.log('─ 코인 ─');
console.log(`  코인 RTP: ${r.coinRtp}  · 슬롯 매치율: ${pct(r.matchRate)}`);
console.log('  코인 출처: ' + share(r.coinIn));
console.log(`  이벤트: 어택 ${r.attackEvents}회 · 레이드 ${r.raidEvents}회`);

// 소진 시나리오 단일 궤적(대표 시드)도 출력.
const one = simulatePayout(p, 1000);
console.log(`\n단일 시드(1000): 소진=${one.depleted} 라운드=${one.rounds} 최저스핀=${one.minSpins} 미션완료=${one.missionsCompleted} 시설업=${one.facilityUpgrades}`);

// 기계 판독용 JSON.
console.log('\n@@JSON@@ ' + JSON.stringify({ params: { daily: p.dailySpins, roundsPerDay: p.roundsPerDay }, avg: r, one }));
