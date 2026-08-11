/**
 * econ/payoutSim.ts — **3릴 코인마스터형 지급 시뮬레이터**(순수·결정론·즉시). 보상구조 재설계 데이터 확보용.
 *
 * ⚠️ 왜 새로 만들었나: 라이브 게임 AUTO 구동은 애니메이션·연출 타이밍에 묶여 300스핀 소진에 ~수 시간(실측 6.5분에 5라운드).
 *   지급구조 설계에는 **수천 라운드를 즉시** 돌리는 순수 시뮬이 필요하다. 기존 econ/sim.ts 는 **구 5릴 슬롯(slot.ts)** 기준이라
 *   현재 게임(**3릴 slot3.ts** + 미션플랜 + 시설 마일스톤 + 레이드4.0)을 반영 못 한다 → 현재 로직을 그대로 import 해 모델링.
 *
 * 모델(= PlayScene 라운드 루프 1:1):
 *   1) 스핀 −betting. 2) 퍼즐(board.resolveSwap) → 퍼즐멀티·미션젬 수집·특수젬(레이드/스핀) 그룹.
 *   3) 슬롯(slot3.spin) → none/coin/attack/raid.
 *      • coin  → coinBase×betCoin×luck×RTP × 퍼즐멀티 × M(L) 코인.
 *      • attack(망치) → 룰렛 → **스핀**(stake=spinBet×attackScale).
 *      • raid(금화)   → 슬롯 담당 아님(SLOT_STAGE_KIND=attack) → **orphan 코인**(SLOT_ORPHAN_COIN_BASE).
 *   4) 퍼즐 레이드(특수젬≥2) → 룰렛 → **코인**(stake=betCoin×M(L)×raidScale=4.0).
 *   5) 스핀젬 그룹(≥3) → 스핀 환급(spinRefundMult). 6) 대박 → 스핀(×2/×10). 7) 잭팟(EV중립).
 *   8) 미션: 진행 += 미션젬×betting → 목표 도달 시 보상 스핀 + 다음 미션(플랜 루프). 9) 시설 자동빌드 → 10업=100스핀 마일스톤.
 *
 * **초기 상태 = 레벨1**(스핀300·코인 START_COINS·시티레벨0·미션1). 스핀<betting 이면 소진 종료(현실 게이트).
 *   미션 시간제한은 무모델(목표 도달=완료 상한) — sim.ts 주석과 동일한 보수적 해석.
 */
import { createGrid, findRuns, groupMatches, cloneGrid, resolveSwap, SPECIAL_RAID, SPECIAL_SPIN, type Grid, type Coord } from '../logic/board.js';
import { spin as slot3Spin, type SpinOutcome } from '../logic/slot3.js';
import { decideStageTrigger } from '../logic/stageTrigger.js';
import { ROULETTE_SEGMENTS, pickSegment, rouletteWin } from '../logic/roulette.js';
import {
  luckMultiplier, LUCK_TABLE, SLOT_RTP_SCALE, puzzleMultiplierFromRuns,
  jackpotContribution, rollJackpot, JACKPOT_SEED,
} from '../logic/economy.js';
import { cityCost, incomeMultiplier } from '../logic/progression.js';
import { HOTEL_OBJECTS, MAX_LEVEL as MAX_OBJ_LEVEL } from '../logic/hotelUpgrade.js';
import {
  START_SPINS, START_COINS, BET_START, COIN_DENOM, spinRefundMult, MISSION_PLAN,
  RAID_STAKE_SCALE, ATTACK_SPIN_STAKE_SCALE,
} from '../logic/playParams.js';
import { SPIN_REGEN_PER_HOUR, SPIN_REGEN_CEILING } from '../logic/spinRegen.js';
import { makeRng, type Rng } from '../logic/rng.js';

const ROWS = 6, COLS = 6, TYPES = 5;
// 라이브 boardView 와 동일 — 특수젬 4+ 매치 origin 생성, 레이드:스핀 = 7:3, cap 8. 어택 젬 미스폰(어택=슬롯).
const SPECIAL_POOL = [SPECIAL_RAID, SPECIAL_RAID, SPECIAL_RAID, SPECIAL_RAID, SPECIAL_RAID, SPECIAL_RAID, SPECIAL_RAID, SPECIAL_SPIN, SPECIAL_SPIN, SPECIAL_SPIN];
const SPECIAL_ON_MATCH = { pool: SPECIAL_POOL, minSize: 4, cap: 8 } as const;

// ── PlayScene 경제 상수(현재 SSOT 미러) ──
const SLOT_ORPHAN_COIN_BASE = 6;
const SLOT_BIG_WIN_MULT = 30;   // win ≥ betCoin×30 → 대박 스핀 ×2
const SLOT_MEGA_WIN_MULT = 100; // win ≥ betCoin×100 → 초대박 스핀 ×10
const SLOT_BIGWIN_SPIN_MULT = 2;
const SLOT_MEGA_SPIN_MULT = 10;
const GEM_CYCLE_LEN = 5; // GAUGE_GEM_CYCLE=[0..4]

/** 지급 시뮬 파라미터 — 재설계 레버(값 조정 → 재시뮬). 기본 = 현재 라이브 SSOT. */
export interface PayoutParams {
  startSpins: number;
  startCoins: number;
  spinBet: number;
  coinDenom: number;
  slotRtpScale: number;
  raidStakeScale: number;
  attackSpinStakeScale: number;
  orphanCoinBase: number;
  bigWinMult: number; bigWinSpinMult: number;
  megaWinMult: number; megaWinSpinMult: number;
  // ⭐재설계 레버(2026-07-07) — 시설 마일스톤·미션 보상 배수(값 조정으로 지급구조 재설계 비교).
  facilityMilestoneEvery: number; // 누적 업그레이드 N 마다 마일스톤 스핀
  facilityMilestoneSpins: number; // 마일스톤당 스핀
  missionRewardScale: number; // 미션 보상 스핀 배수(1.0=SSOT)
  autoBuildFacility: boolean; // 코인 충분 시 즉시 시설 업그레이드(적극 빌더)
  dailySpins: number; // 일일 보충(0=무보충 순수 소진 측정)
  roundsPerDay: number; // dailySpins 지급 주기(라운드). 0=무보충
  // ⭐시간당 스핀 재생(상한 ceiling까지) — spinRegen SSOT 반영. 라운드→시간 환산(secondsPerRound)으로 라운드당 재생 산출.
  regenPerHour: number; // 시간당 재생 스핀(0=끄기)
  regenCeiling: number; // 재생 상한(보유 스핀 < ceiling 일 때만 채움)
  secondsPerRound: number; // 라운드당 실시간(초) 가정 — 오토 ≈5초
  maxRounds: number; // 안전 상한(무한 방지)
}

export function defaultPayoutParams(): PayoutParams {
  return {
    startSpins: START_SPINS,
    startCoins: START_COINS,
    spinBet: BET_START,
    coinDenom: COIN_DENOM,
    slotRtpScale: SLOT_RTP_SCALE,
    raidStakeScale: RAID_STAKE_SCALE,
    attackSpinStakeScale: ATTACK_SPIN_STAKE_SCALE,
    orphanCoinBase: SLOT_ORPHAN_COIN_BASE,
    bigWinMult: SLOT_BIG_WIN_MULT, bigWinSpinMult: SLOT_BIGWIN_SPIN_MULT,
    megaWinMult: SLOT_MEGA_WIN_MULT, megaWinSpinMult: SLOT_MEGA_SPIN_MULT,
    facilityMilestoneEvery: 10, // SSOT: 10업=100스핀
    facilityMilestoneSpins: 100,
    missionRewardScale: 1.0,
    autoBuildFacility: true,
    dailySpins: 0,
    roundsPerDay: 0,
    regenPerHour: SPIN_REGEN_PER_HOUR,
    regenCeiling: SPIN_REGEN_CEILING,
    secondsPerRound: 5, // 오토 라운드 ≈5초(MISSION_PLAN 가정과 동일)
    maxRounds: 200_000,
  };
}

export interface PayoutResult {
  depleted: boolean;      // 스핀 소진으로 종료(false=maxRounds 도달)
  rounds: number;         // 소진까지 생존 라운드(= 플레이한 스핀 수)
  endSpins: number;
  endCoins: number;
  cityLevel: number;      // 도달 시티레벨(=누적 시설 업그레이드)
  facilityUpgrades: number;
  missionsCompleted: number;
  minSpins: number;       // 관측 최저 스핀(아슬아슬 지표 — 0 근처 스침이 이상적)
  netSpinPerRound: number; // (유입−소모)/라운드. ≈0(살짝 음수)면 '아슬아슬'
  coinRtp: number;         // Σ획득코인 / Σ코인베팅
  matchRate: number;       // 슬롯 3매치율
  spinIn: Record<string, number>;  // 소스별 스핀 유입 합
  spinInCount: Record<string, number>; // 소스별 지급 횟수
  coinIn: Record<string, number>;  // 코인 획득 출처
  attackEvents: number; raidEvents: number;
}

const add = (r: Record<string, number>, k: string, n: number): void => { r[k] = (r[k] ?? 0) + n; };

// AI 최적 매치(boardView 순수부) — sim.ts 와 동일.
function swap(g: Grid, a: Coord, b: Coord): Grid {
  const n = cloneGrid(g); const t = n[a.r][a.c]; n[a.r][a.c] = n[b.r][b.c]; n[b.r][b.c] = t; return n;
}
function puzzleCombo(len: number): number { return len >= 6 ? 8 : len === 5 ? 4 : len === 4 ? 2 : 1; }
function findBestMove(g: Grid): { a: Coord; b: Coord } | null {
  let best: { a: Coord; b: Coord } | null = null, bestScore = 0;
  const tryPair = (a: Coord, b: Coord): void => {
    const sg = swap(g, a, b); const { matched } = findRuns(sg);
    if (matched.length === 0) return;
    let maxRun = 0; for (const gr of groupMatches(matched, sg)) maxRun = Math.max(maxRun, gr.size);
    const sc = matched.length * puzzleCombo(maxRun);
    if (sc > bestScore) { bestScore = sc; best = { a, b }; }
  };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (c + 1 < COLS) tryPair({ r, c }, { r, c: c + 1 });
    if (r + 1 < ROWS) tryPair({ r, c }, { r: r + 1, c });
  }
  return best;
}

/** 지급 시뮬 1회(결정론). 초기 레벨1·스핀 startSpins 에서 소진(또는 maxRounds)까지. */
export function simulatePayout(p: PayoutParams, seed = 12345): PayoutResult {
  const rng: Rng = makeRng(seed);
  const betCoin = p.spinBet * p.coinDenom;
  const NUM_OBJ = HOTEL_OBJECTS.length;
  const objLevels = HOTEL_OBJECTS.map(() => 1);
  let spins = p.startSpins, coins = p.startCoins, L = 0;
  let grid = createGrid(ROWS, COLS, TYPES, rng);
  let pool = JACKPOT_SEED;
  let missionIndex = 0, missionProgress = 0, missionsCompleted = 0, facilityUpgrades = 0;
  let rounds = 0, attackEvents = 0, raidEvents = 0, matched = 0;
  let minSpins = spins, wageredCoin = 0, coinWon = 0, regenAccum = 0;
  const spinIn: Record<string, number> = {}, spinInCount: Record<string, number> = {}, coinIn: Record<string, number> = {};
  const grantSpin = (src: string, n: number): void => { if (n > 0) { spins += n; add(spinIn, src, n); add(spinInCount, src, 1); } };

  for (let i = 0; i < p.maxRounds; i++) {
    if (spins < p.spinBet) break; // 소진 = 종료
    spins -= p.spinBet;
    wageredCoin += betCoin;
    rounds++;

    // ── ① 퍼즐 ──
    const mv = findBestMove(grid);
    if (!mv) { grid = createGrid(ROWS, COLS, TYPES, rng); continue; }
    const res = resolveSwap(grid, mv.a, mv.b, TYPES, rng, undefined, 0, false, SPECIAL_ON_MATCH);
    grid = res.finalGrid;
    const runs: number[] = []; for (const st of res.steps) for (const len of st.runs) runs.push(len);
    const pmult = puzzleMultiplierFromRuns(runs, res.cleared);
    const gemType = missionIndex % GEM_CYCLE_LEN; // 현 미션 수집 젬(cycle)
    const missionGems = res.clearedByType[gemType] ?? 0;

    // ── ② 슬롯(slot3) ──
    const outcome: SpinOutcome = slot3Spin(rng);
    if (outcome.matched) matched++;
    let win = 0;
    if (outcome.kind === 'attack') {
      // 어택(망치) → 룰렛 → 스핀. stake = spinBet × attackScale.
      const stake = Math.round(p.spinBet * p.attackSpinStakeScale);
      grantSpin('attack', rouletteWin(stake, ROULETTE_SEGMENTS[pickSegment(rng)]));
      attackEvents++;
    } else {
      // coin(코인 심볼) 또는 raid(금화=orphan 코인). 둘 다 코인 win 경로.
      const base = outcome.kind === 'raid' ? p.orphanCoinBase : outcome.coinBase; // raid(gold)=orphan
      let slotPayout = 0;
      if (base > 0) {
        slotPayout = Math.round(base * betCoin * luckMultiplier(rng, LUCK_TABLE) * p.slotRtpScale);
        if (slotPayout > 0) slotPayout = Math.max(betCoin, slotPayout);
      }
      win = Math.round(slotPayout * pmult * incomeMultiplier(L));
      if (win > 0) { coins += win; coinWon += win; add(coinIn, 'slot', win); }
    }

    // ── 대박 스핀(win 기준) ──
    if (win >= betCoin * p.megaWinMult) grantSpin('bigwin', p.spinBet * p.megaWinSpinMult);
    else if (win >= betCoin * p.bigWinMult) grantSpin('bigwin', p.spinBet * p.bigWinSpinMult);

    // ── ③ 퍼즐 레이드(특수젬 그룹 ≥2) → 룰렛 코인 ──
    const decision = decideStageTrigger(res.steps.map((st) => st.specialGroups).flat(), 'raid');
    if (decision.kind === 'raid') {
      const stake = Math.round(betCoin * incomeMultiplier(L) * p.raidStakeScale);
      const rw = rouletteWin(stake, ROULETTE_SEGMENTS[pickSegment(rng)]);
      if (rw > 0) { coins += rw; coinWon += rw; add(coinIn, 'raid', rw); }
      raidEvents++;
    }

    // ── ④ 스핀젬 환급(그룹 3+) ──
    let refund = 0;
    for (const st of res.steps) for (const g of st.specialGroups) { const sg = g[SPECIAL_SPIN] ?? 0; if (sg >= 3) refund += p.spinBet * spinRefundMult(sg); }
    grantSpin('gem', refund);

    // ── ⑤ 잭팟(EV 중립) ──
    pool += jackpotContribution(p.spinBet);
    const jb = rollJackpot(rng, pool);
    if (jb > 0) { coins += jb; coinWon += jb; add(coinIn, 'jackpot', jb); pool = JACKPOT_SEED; }

    // ── ⑥ 미션(진행 = 미션젬 × betting) → 목표 도달 시 보상 스핀 + 다음 미션(루프) ──
    missionProgress += missionGems * p.spinBet;
    const m = MISSION_PLAN[missionIndex % MISSION_PLAN.length];
    if (missionProgress >= m.target) {
      if (m.reward.kind === 'spins') grantSpin('mission', Math.round(m.reward.amount * p.missionRewardScale));
      else { coins += m.reward.amount; add(coinIn, 'mission', m.reward.amount); }
      missionIndex++; missionsCompleted++; missionProgress = 0;
    }

    // ── ⑦ 시설 자동빌드(개별 비용 cityCost(objLv−1)) → 마일스톤 10업=100스핀 ──
    if (p.autoBuildFacility) {
      for (;;) {
        let best = -1, bestCost = Infinity;
        for (let oi = 0; oi < NUM_OBJ; oi++) {
          if (objLevels[oi] >= MAX_OBJ_LEVEL) continue;
          const c = cityCost(objLevels[oi] - 1);
          if (c < bestCost) { bestCost = c; best = oi; }
        }
        if (best < 0 || coins < bestCost) break;
        coins -= bestCost;
        const prevL = L;
        objLevels[best]++;
        L = objLevels.reduce((s, v) => s + v, 0) - NUM_OBJ;
        facilityUpgrades++;
        // ⭐파라미터화 마일스톤(재설계 레버): 누적 업그레이드 every 경계 통과 수 × spins.
        const crossed = Math.floor(L / p.facilityMilestoneEvery) - Math.floor(prevL / p.facilityMilestoneEvery);
        if (crossed > 0) grantSpin('facility', crossed * p.facilityMilestoneSpins);
      }
    }

    // ── ⑧ 시간당 재생(상한 ceiling까지) — 라운드당 재생분 누적, 보유<ceiling 일 때만 채움 ──
    if (p.regenPerHour > 0 && spins < p.regenCeiling) {
      regenAccum += (p.regenPerHour / 3600) * p.secondsPerRound; // 라운드당 재생 스핀(분수 누적)
      const whole = Math.floor(regenAccum);
      if (whole > 0) {
        regenAccum -= whole;
        grantSpin('regen', Math.min(whole, p.regenCeiling - spins)); // 상한 클램프
      }
    }

    // ── ⑨ 일일 보충(옵션) ──
    if (p.roundsPerDay > 0 && rounds % p.roundsPerDay === 0) grantSpin('daily', p.dailySpins);

    if (spins < minSpins) minSpins = spins;
  }

  const netSpin = spins - p.startSpins;
  return {
    depleted: spins < p.spinBet,
    rounds, endSpins: spins, endCoins: coins, cityLevel: L,
    facilityUpgrades, missionsCompleted, minSpins,
    netSpinPerRound: rounds > 0 ? netSpin / rounds : 0,
    coinRtp: wageredCoin > 0 ? coinWon / wageredCoin : 0,
    matchRate: rounds > 0 ? matched / rounds : 0,
    spinIn, spinInCount, coinIn, attackEvents, raidEvents,
  };
}

/** 여러 시드 평균(노이즈 제거) — 소스별 유입·생존 라운드의 대표값. */
export function simulatePayoutAvg(p: PayoutParams, seeds = 12): PayoutResult {
  const runs: PayoutResult[] = [];
  for (let s = 0; s < seeds; s++) runs.push(simulatePayout(p, 1000 + s * 4099));
  const n = runs.length;
  const avg = (f: (r: PayoutResult) => number): number => runs.reduce((s, r) => s + f(r), 0) / n;
  const mergeKeys = (pick: (r: PayoutResult) => Record<string, number>): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const r of runs) for (const [k, v] of Object.entries(pick(r))) out[k] = (out[k] ?? 0) + v / n;
    for (const k of Object.keys(out)) out[k] = Math.round(out[k]);
    return out;
  };
  return {
    depleted: avg((r) => (r.depleted ? 1 : 0)) >= 0.5,
    rounds: Math.round(avg((r) => r.rounds)),
    endSpins: Math.round(avg((r) => r.endSpins)),
    endCoins: Math.round(avg((r) => r.endCoins)),
    cityLevel: +avg((r) => r.cityLevel).toFixed(2),
    facilityUpgrades: +avg((r) => r.facilityUpgrades).toFixed(1),
    missionsCompleted: +avg((r) => r.missionsCompleted).toFixed(1),
    minSpins: Math.round(avg((r) => r.minSpins)),
    netSpinPerRound: +avg((r) => r.netSpinPerRound).toFixed(3),
    coinRtp: +avg((r) => r.coinRtp).toFixed(3),
    matchRate: +avg((r) => r.matchRate).toFixed(3),
    spinIn: mergeKeys((r) => r.spinIn),
    spinInCount: mergeKeys((r) => r.spinInCount),
    coinIn: mergeKeys((r) => r.coinIn),
    attackEvents: Math.round(avg((r) => r.attackEvents)),
    raidEvents: Math.round(avg((r) => r.raidEvents)),
  };
}
