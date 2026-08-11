/**
 * compare-payout.mjs — **보상구조 재설계 비교**. 현행(BASELINE) vs 제안안들을 동일 조건으로 시뮬해 표로 출력.
 *   목표: "아슬아슬하게 통과"(net≈0·소폭 음수·Stage1 완주 즈음 소진) + 스핀 유입을 **진행(시설·미션) 주도**로.
 */
import { defaultPayoutParams, simulatePayoutAvg } from '../src/econ/payoutSim.ts';

const scenarios = {
  BASELINE: (p) => p, // 현행 SSOT

  // P1 "진행 주도" — 시설 마일스톤 강화(5업=100)·어택/대박 스핀 축소·코인 RTP 절반(코인=시설 게이트)
  P1: (p) => ({
    ...p,
    facilityMilestoneEvery: 5, facilityMilestoneSpins: 100, // 5업=100 → 20업=400(백본)
    attackSpinStakeScale: 0.3,   // 어택 스핀 절반↓
    megaWinSpinMult: 5,          // 초대박 스핀 10→5
    slotRtpScale: 0.09,          // 코인 배당 절반 → 코인 인플레↓·시설 코인게이트 부활
  }),

  // P2 "미션 주도" — 미션 보상 1.3×·시설 10업=120·어택 0.4·대박 유지·RTP 0.12
  P2: (p) => ({
    ...p,
    missionRewardScale: 1.3,
    facilityMilestoneEvery: 10, facilityMilestoneSpins: 120,
    attackSpinStakeScale: 0.4,
    megaWinSpinMult: 6,
    slotRtpScale: 0.12,
  }),

  // P3 "타이트" — 아슬아슬 극대화: 시설 5업=80·미션 1.15·어택 0.3·대박 3/×4·RTP 0.08
  P3: (p) => ({
    ...p,
    facilityMilestoneEvery: 5, facilityMilestoneSpins: 80,
    missionRewardScale: 1.15,
    attackSpinStakeScale: 0.3,
    bigWinSpinMult: 1, megaWinSpinMult: 4,
    slotRtpScale: 0.08,
  }),

  // ⭐P4 "벌어서 올리는 루프" — 시작코인 8만(Stage1 코인게이트 부활) + 진행주도 스핀 + RTP 0.11 + 레이드 4.0 유지.
  //   시설이 코인으로 게이트되어 slot/raid 코인이 진짜 진행 자원이 됨(레이드 높은 보상이 의미).
  P4: (p) => ({
    ...p,
    startCoins: 80_000,
    facilityMilestoneEvery: 5, facilityMilestoneSpins: 100,
    missionRewardScale: 1.2,
    attackSpinStakeScale: 0.35,
    megaWinSpinMult: 5,
    slotRtpScale: 0.11,
    raidStakeScale: 4.0,
  }),

  // P5 "P4 + 더 타이트" — 시작코인 5만·시설 5업=90·RTP 0.10
  P5: (p) => ({
    ...p,
    startCoins: 50_000,
    facilityMilestoneEvery: 5, facilityMilestoneSpins: 90,
    missionRewardScale: 1.2,
    attackSpinStakeScale: 0.35,
    megaWinSpinMult: 5,
    slotRtpScale: 0.10,
    raidStakeScale: 4.0,
  }),
};

const pct = (x) => (x * 100).toFixed(0) + '%';
const shareOf = (rec, key) => {
  const tot = Object.values(rec).reduce((a, b) => a + b, 0) || 1;
  return pct((rec[key] ?? 0) / tot);
};

const base = defaultPayoutParams();
console.log('═══ 보상구조 재설계 비교 (초기 레벨1·스핀300·16시드 평균) ═══\n');
const rows = [];
for (const [name, fn] of Object.entries(scenarios)) {
  const r = simulatePayoutAvg(fn(base), 16);
  const si = r.spinIn;
  const tot = Object.values(si).reduce((a, b) => a + b, 0);
  const coinTot = Object.values(r.coinIn).reduce((a, b) => a + b, 0) || 1;
  rows.push({
    안: name,
    라운드: r.rounds,
    'net/r': r.netSpinPerRound,
    시설업: r.facilityUpgrades, // 20=Stage1완주. <20=코인게이트로 미완주
    미션: r.missionsCompleted,
    끝코인: r.endCoins,
    '레이드코인%': pct((r.coinIn.raid ?? 0) / coinTot),
    '시설%': shareOf(si, 'facility'),
    '미션%': shareOf(si, 'mission'),
    '어택%': shareOf(si, 'attack'),
    '대박%': shareOf(si, 'bigwin'),
    유입합: tot,
  });
}
console.table(rows);
console.log('\n@@JSON@@ ' + JSON.stringify(rows));
