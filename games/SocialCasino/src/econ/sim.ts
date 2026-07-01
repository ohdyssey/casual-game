/**
 * econ/sim.ts — **풀루프 경제 시뮬레이터**(순수·결정론·vitest 대상). 경제 콘솔의 계산 엔진.
 *
 * 한 라운드 = 스핀 소모 → 퍼즐(보드) + 슬롯 정산 → 코인 획득 → 젬환급·대박 스핀 → 미션 → 호텔 자동빌드 → (일경계)데일리·리그.
 *   - **스토캐스틱 게임플레이**(보드 매치·릴 심볼)는 실제 로직(board/slot/economy)을 import 해 충실도 유지.
 *   - **경제 변환**(코인 스케일·환급·진행 비용/배수·미션·럭·잭팟·리그)은 **EconParams 로 파라미터화** → 콘솔 슬라이더가 즉시 재시뮬.
 *   - 구조적 상수(페이테이블·포춘 전이·특수젬 스폰)는 SSOT 그대로(콘솔 메모: '구조적·sim 비조정').
 *
 * defaultEconParams() = 현재 SSOT 값(progression·economy·playParams) → 시뮬 기본 = 라이브 게임.
 */
import { createGrid, findRuns, groupMatches, cloneGrid, resolveSwap, SPECIAL_SPIN, SPECIAL_ATTACK, SPECIAL_RAID, type Grid, type Coord, type SpecialSpawn } from '../logic/board.js';
import { ROULETTE_SEGMENTS, pickSegment, rouletteWin } from '../logic/roulette.js';
import { spinReels, evaluateReels, LINES } from '../logic/slot.js';
import { nextFortune, weightsFor, FORTUNE_START, puzzleMultiplierFromRuns, SLOT_RTP_SCALE, LUCK_TABLE, JACKPOT_RAKE, JACKPOT_HIT_PROB, type Fortune } from '../logic/economy.js';
import { CITY_COST_BASE, CITY_COST_GROWTH, INCOME_BASE, INCOME_PER_LEVEL, INCOME_MAX, HOTEL_SPIN_BASE, HOTEL_SPIN_GROWTH, MAX_CITY_LEVEL, MISSION_GROWTH_PER_LEVEL } from '../logic/progression.js';
import { HOTEL_OBJECTS, MAX_LEVEL as MAX_OBJ_LEVEL } from '../logic/hotelUpgrade.js';
import { START_SPINS, START_COINS, spinRefundMult, BIGWIN_SPIN_BIG_X, BIGWIN_SPIN_BIG, BIGWIN_SPIN_MEGA_X, BIGWIN_SPIN_MEGA, DAILY_SPINS, COIN_DENOM, BET_START, MISSION_PLAN, RAID_STAKE_SCALE, ATTACK_SPIN_STAKE_SCALE } from '../logic/playParams.js';
import { makeRng, type Rng } from '../logic/rng.js';
import { type LeagueParams, DEFAULT_LEAGUE, expectedSpinPerPeriod, expectedCoinPerPeriod, leaguePerDaySpins, leaguePerDayCoins } from './league.js';

const ROWS = 6, COLS = 6, TYPES = 5, COLLECT = 0;
const SPAWN: SpecialSpawn = { chance: 0.13, cap: 8 }; // 구조적(boardView 와 동일)

/** 미션 한 칸(시뮬용 평탄화). */
export interface SimMission {
  readonly target: number;
  readonly rewardKind: 'spins' | 'coins';
  readonly rewardAmount: number;
}

/** 콘솔이 튜닝하는 경제 파라미터 작업셋. */
export interface EconParams {
  // 스핀
  startSpins: number;
  bigWinBigX: number; bigWinBig: number;
  bigWinMegaX: number; bigWinMega: number;
  dailySpins: number;
  // 코인 엔진
  bet: number; // spinBet
  coinDenom: number;
  slotRtpScale: number;
  raidStakeScale: number; // 레이드 **코인** 룰렛 스테이크 = betCoin × M(L) × 이 값
  attackSpinStakeScale: number; // ⭐어택 **스핀** 룰렛 스테이크 = spinBet × 이 값(2026-07-01 — 어택=스핀 보상)
  startCoins: number;
  luckTable: ReadonlyArray<{ p: number; m: number }>;
  jackpotRake: number;
  jackpotHitProb: number;
  // 진행(시티)
  cityCostBase: number; cityCostGrowth: number;
  incomeBase: number; incomePerLevel: number; incomeMax: number;
  hotelSpinBase: number; hotelSpinGrowth: number;
  maxCityLevel: number;
  missionGrowthPerLevel: number;
  // 미션
  missions: readonly SimMission[];
}

/** 현재 SSOT 값으로 채운 기본 파라미터(= 라이브 게임). */
export function defaultEconParams(): EconParams {
  return {
    startSpins: START_SPINS,
    bigWinBigX: BIGWIN_SPIN_BIG_X, bigWinBig: BIGWIN_SPIN_BIG,
    bigWinMegaX: BIGWIN_SPIN_MEGA_X, bigWinMega: BIGWIN_SPIN_MEGA,
    dailySpins: DAILY_SPINS,
    bet: BET_START,
    coinDenom: COIN_DENOM,
    slotRtpScale: SLOT_RTP_SCALE,
    raidStakeScale: RAID_STAKE_SCALE,
    attackSpinStakeScale: ATTACK_SPIN_STAKE_SCALE,
    startCoins: START_COINS,
    luckTable: LUCK_TABLE.map((t) => ({ ...t })),
    jackpotRake: JACKPOT_RAKE,
    jackpotHitProb: JACKPOT_HIT_PROB,
    cityCostBase: CITY_COST_BASE, cityCostGrowth: CITY_COST_GROWTH,
    incomeBase: INCOME_BASE, incomePerLevel: INCOME_PER_LEVEL, incomeMax: INCOME_MAX,
    hotelSpinBase: HOTEL_SPIN_BASE, hotelSpinGrowth: HOTEL_SPIN_GROWTH,
    maxCityLevel: MAX_CITY_LEVEL,
    missionGrowthPerLevel: MISSION_GROWTH_PER_LEVEL,
    missions: MISSION_PLAN.map((m) => ({ target: m.target, rewardKind: m.reward.kind as 'spins' | 'coins', rewardAmount: m.reward.amount })),
  };
}

// ── 파라미터화된 진행 수식(콘솔 튜닝 반영) ──
export function cityCostP(p: EconParams, L: number): number {
  return Math.round(p.cityCostBase * Math.pow(p.cityCostGrowth, Math.max(0, L)));
}
export function incomeMultP(p: EconParams, L: number): number {
  return Math.min(p.incomeMax, p.incomeBase + p.incomePerLevel * Math.max(0, L));
}
export function hotelSpinP(p: EconParams, L: number): number {
  return Math.round(p.hotelSpinBase * Math.pow(p.hotelSpinGrowth, Math.max(0, L)));
}
export function missionTargetP(p: EconParams, base: number, L: number): number {
  return Math.round(base * (1 + p.missionGrowthPerLevel * Math.max(0, L)));
}
function luckP(rng: Rng, table: ReadonlyArray<{ p: number; m: number }>): number {
  const r = rng();
  let acc = 0;
  for (const t of table) { acc += t.p; if (r < acc) return t.m; }
  return 1;
}

// ── AI 최적 매치(boardView 순수부) ──
function swap(g: Grid, a: Coord, b: Coord): Grid {
  const n = cloneGrid(g); const t = n[a.r][a.c]; n[a.r][a.c] = n[b.r][b.c]; n[b.r][b.c] = t; return n;
}
function puzzleCombo(len: number): number { return len >= 6 ? 8 : len === 5 ? 4 : len === 4 ? 2 : 1; }
function findBestMove(g: Grid): { a: Coord; b: Coord } | null {
  let best: { a: Coord; b: Coord } | null = null, bestScore = 0;
  const tryPair = (a: Coord, b: Coord) => {
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

/**
 * 구조 RTP 추정(수렴) — 슬롯 럭의 ×600 티어는 풀루프 소표본서 노이즈 큼 → **슬롯-단독 다표본**으로 분리 수렴.
 *   RTP = (평균 럭적용 슬롯배당/베팅) × (AI 평균 퍼즐멀티). M(L)·리그 무관(구조값). 빠름(보드 없는 릴 N회 + 보드 M회).
 */
export function estimateRtp(p: EconParams, spins = 40000, boardMoves = 4000, seed = 246810): number {
  const rng: Rng = makeRng(seed);
  const betCoin = p.bet * p.coinDenom;
  let fortune: Fortune = FORTUNE_START, payoutSum = 0;
  for (let i = 0; i < spins; i++) {
    const slotRaw = evaluateReels(spinReels(rng, weightsFor(fortune)), 1, 1).totalWin;
    const luck = luckP(rng, p.luckTable);
    let sp = Math.round(Math.round((betCoin * slotRaw * p.slotRtpScale) / LINES) * luck);
    if (sp > 0) sp = Math.max(betCoin, sp);
    payoutSum += sp;
    fortune = nextFortune(fortune, rng);
  }
  const slotRtp = payoutSum / (spins * betCoin);
  let grid = createGrid(ROWS, COLS, TYPES, rng), pmSum = 0, moves = 0;
  for (let i = 0; i < boardMoves; i++) {
    const mv = findBestMove(grid);
    if (!mv) { grid = createGrid(ROWS, COLS, TYPES, rng); continue; }
    const res = resolveSwap(grid, mv.a, mv.b, TYPES, rng, SPAWN);
    const runs: number[] = []; for (const st of res.steps) for (const len of st.runs) runs.push(len);
    pmSum += puzzleMultiplierFromRuns(runs, res.cleared); grid = res.finalGrid; moves++;
  }
  return slotRtp * (pmSum / Math.max(1, moves));
}

export interface SimOptions {
  rounds: number;
  seed: number;
  roundsPerDay: number; // 하루 경계(데일리·리그 일주입)
  league: LeagueParams;
  autoBuildHotel: boolean; // 코인 충분 시 즉시 업그레이드(적극 빌더)
  allowNegative: boolean; // true=막힘 없이 흐름 측정(net flow), false=스핀<베팅이면 정지(현실)
  sampleEvery: number; // 궤적 샘플 간격(라운드)
}

export interface SimResult {
  rounds: number;
  days: number;
  endSpins: number;
  netSpinTotal: number; // endSpins - startSpins
  netSpinPerDay: number;
  netSpinPerRound: number;
  drainFactor: number; // -netSpinPerRound / bet (양수=순소모)
  uptickRatio: number; // 잔고 상승 라운드 비율
  blocked: boolean;
  endCoins: number;
  cityLevel: number;
  upgrades: number;
  avgRoundsPerUpgrade: number;
  rtpBase: number; // 진행/리그 무관 구조 RTP(M=1)
  rtpEffective: number; // M(L) 반영
  coinPerRound: number;
  spinSources: { gem: number; bigwin: number; attack: number; mission: number; hotel: number; daily: number; league: number };
  coinSources: { slot: number; jackpot: number; mission: number; raid: number }; // 코인 획득 출처(슬롯 vs 레이드 비교)
  raidEvents: number; // 레이드/어텍 발동 횟수
  trajectory: number[]; // 스핀 잔고 샘플
  trajectoryDays: number[]; // 일 단위 잔고(톱니)
  upgradeRounds: number[];
}

/** 풀루프 시뮬 1회. */
export function simulate(p: EconParams, opts: SimOptions): SimResult {
  const rng: Rng = makeRng(opts.seed);
  const betCoin = p.bet * p.coinDenom;
  const NUM_OBJ = HOTEL_OBJECTS.length; // 호텔 오브젝트 수(5)
  const objLevels = HOTEL_OBJECTS.map(() => 1); // 오브젝트별 레벨(1..MAX_OBJ_LEVEL) — 실게임 per-object 비용 모델
  let spins = p.startSpins, coins = p.startCoins, L = 0; // L = 글로벌 시티레벨 = Σ레벨 − 오브젝트수
  let grid = createGrid(ROWS, COLS, TYPES, rng);
  let fortune: Fortune = FORTUNE_START;
  let pool = 0;
  let mi = 0, prog = 0;
  let rounds = 0, days = 0, upticks = 0, prevSpins = spins, blocked = false;
  let wagered = 0, returnedBase = 0, returnedEff = 0, coinEarned = 0, raidEvents = 0;
  const src = { gem: 0, bigwin: 0, attack: 0, mission: 0, hotel: 0, daily: 0, league: 0 };
  const coinSrc = { slot: 0, jackpot: 0, mission: 0, raid: 0 };
  const upgradeRounds: number[] = [];
  const trajectory: number[] = [];
  const trajectoryDays: number[] = [];
  const leagueDay = opts.league.enabled ? leaguePerDaySpins(opts.league) : 0;
  const leagueDayCoins = opts.league.enabled ? leaguePerDayCoins(opts.league) : 0;
  const leagueRound = opts.league.enabled && opts.league.amortization === 'per-round'
    ? expectedSpinPerPeriod(opts.league) / Math.max(1, opts.league.periodDays * opts.roundsPerDay) : 0;
  const leagueRoundCoins = opts.league.enabled && opts.league.amortization === 'per-round'
    ? expectedCoinPerPeriod(opts.league) / Math.max(1, opts.league.periodDays * opts.roundsPerDay) : 0;

  for (let i = 0; i < opts.rounds; i++) {
    if (!opts.allowNegative && spins < p.bet) { blocked = true; break; }
    spins -= p.bet;
    const mv = findBestMove(grid);
    if (!mv) { grid = createGrid(ROWS, COLS, TYPES, rng); continue; }
    const res = resolveSwap(grid, mv.a, mv.b, TYPES, rng, SPAWN);
    grid = res.finalGrid;
    rounds++;

    const runs: number[] = []; for (const st of res.steps) for (const len of st.runs) runs.push(len);
    const pmult = puzzleMultiplierFromRuns(runs, res.cleared);
    const slotRaw = evaluateReels(spinReels(rng, weightsFor(fortune)), 1, 1).totalWin;
    const luck = luckP(rng, p.luckTable);
    let slotPayout = Math.round(Math.round((betCoin * slotRaw * p.slotRtpScale) / LINES) * luck);
    if (slotPayout > 0) slotPayout = Math.max(betCoin, slotPayout);
    const winBase = Math.round(slotPayout * pmult);
    const win = Math.round(winBase * incomeMultP(p, L));
    coins += win; coinEarned += win; coinSrc.slot += win;
    wagered += betCoin; returnedBase += winBase; returnedEff += win;
    fortune = nextFortune(fortune, rng);

    // 잭팟(EV 중립): 레이크 적립 + 희귀 판정
    pool += Math.round(betCoin * p.jackpotRake);
    if (rng() < p.jackpotHitProb) { coins += pool; returnedBase += pool; returnedEff += pool; coinSrc.jackpot += pool; pool = 0; }

    // 어택/레이드(특수젬 ≥2) → 룰렛. **통화 분기**(2026-07-01, PlayScene.onStageTrigger/maybeEnterStage 와 1:1):
    //   • 어택(어텍젬 우세) → 룰렛 → **스핀**(stake = spinBet × attackSpinStakeScale).
    //   • 레이드(약탈젬 ≥2)  → 룰렛 → **코인**(stake = betCoin × M(L) × raidStakeScale).
    let totalAtk = 0, totalRaid = 0;
    for (const st of res.steps) { totalAtk += st.collected[SPECIAL_ATTACK] ?? 0; totalRaid += st.collected[SPECIAL_RAID] ?? 0; }
    if (totalAtk >= 2 && totalAtk >= totalRaid) {
      const stake = Math.round(p.bet * p.attackSpinStakeScale);
      const sw = rouletteWin(stake, ROULETTE_SEGMENTS[pickSegment(rng)]);
      spins += sw; src.attack += sw; raidEvents++;
    } else if (totalRaid >= 2) {
      const stake = Math.round(betCoin * incomeMultP(p, L) * p.raidStakeScale);
      const rw = rouletteWin(stake, ROULETTE_SEGMENTS[pickSegment(rng)]);
      coins += rw; coinSrc.raid += rw; raidEvents++;
    }

    // 스핀 환급(젬) — **매치(스텝)당 spinRefundMult**(1~2=×1·3+=배수). 게임 onCollectSpecials 와 동일.
    let refund = 0;
    for (const st of res.steps) { const sg = st.collected[SPECIAL_SPIN] ?? 0; if (sg > 0) refund += p.bet * spinRefundMult(sg); }
    if (refund > 0) { spins += refund; src.gem += refund; }
    // 대박 주입
    const bw = win >= betCoin * p.bigWinMegaX ? p.bigWinMega : win >= betCoin * p.bigWinBigX ? p.bigWinBig : 0;
    if (bw > 0) { const s = p.bet * bw; spins += s; src.bigwin += s; }

    // 미션(젬×베팅) → 목표 도달 시 보상.
    // ⚠️ 라이브(2026-06-30 개편)는 **2분 타임어택**: 시간 내 미달성 시 보상 몰수(PlayScene.tickGauge/forfeitGauge).
    //   이 시뮬은 **시간(분) 모델이 없어** 목표 도달 = 항상 완료로 처리한다 → spinSources.mission 은 **상한(upper bound)**.
    //   실게임의 몰수율만큼 실제 미션 스핀 유입은 더 낮다(net/day·league 배지는 이 상한을 반영하므로 미션 스핀을 보수적으로 할인해 해석할 것).
    //   (정확 모델은 minutes×rounds/min 예산으로 미완료 시 prog=0·무보상 재도전을 넣어야 하나, 몰수율이 플레이어 의존이라 상한 표기를 택함.)
    prog += (res.clearedByType[COLLECT] ?? 0) * p.bet;
    const m = p.missions.length ? p.missions[mi % p.missions.length] : null;
    if (m && prog >= missionTargetP(p, m.target, L)) {
      if (m.rewardKind === 'spins') { spins += m.rewardAmount; src.mission += m.rewardAmount; }
      else { coins += m.rewardAmount; coinSrc.mission += m.rewardAmount; }
      mi++; prog = 0;
    }

    // 호텔 자동 빌드(실게임 **per-object** 비용 = cityCost(오브젝트레벨−1)) → 가장 싼 오브젝트부터. 환급=hotelSpinGrant(글로벌L).
    if (opts.autoBuildHotel) {
      const cap = Math.min(p.maxCityLevel, NUM_OBJ * (MAX_OBJ_LEVEL - 1));
      for (;;) {
        if (L >= cap) break;
        let best = -1, bestCost = Infinity;
        for (let oi = 0; oi < NUM_OBJ; oi++) {
          if (objLevels[oi] >= MAX_OBJ_LEVEL) continue;
          const c = cityCostP(p, objLevels[oi] - 1); // per-object: 자기 레벨 기준
          if (c < bestCost) { bestCost = c; best = oi; }
        }
        if (best < 0 || coins < bestCost) break;
        coins -= bestCost;
        const g = hotelSpinP(p, L); spins += g; src.hotel += g; // 환급은 글로벌 시티레벨 기준(실게임 upgradeSpinGrant)
        objLevels[best]++;
        L = objLevels.reduce((s, v) => s + v, 0) - NUM_OBJ;
        upgradeRounds.push(rounds);
      }
    }

    // 리그 per-round 주입
    if (leagueRound > 0) { spins += leagueRound; src.league += leagueRound; coins += leagueRoundCoins; }

    // 일 경계: 데일리 + 리그(per-day/lumpy)
    if (opts.roundsPerDay > 0 && rounds % opts.roundsPerDay === 0) {
      days++;
      spins += p.dailySpins; src.daily += p.dailySpins;
      if (opts.league.enabled && opts.league.amortization === 'per-day') {
        spins += leagueDay; src.league += leagueDay; coins += leagueDayCoins;
      }
      if (opts.league.enabled && opts.league.amortization === 'lumpy' && days % opts.league.periodDays === 0) {
        const lump = expectedSpinPerPeriod(opts.league); spins += lump; src.league += lump; coins += expectedCoinPerPeriod(opts.league);
      }
      trajectoryDays.push(spins);
    }

    if (spins > prevSpins) upticks++;
    prevSpins = spins;
    if (opts.sampleEvery > 0 && rounds % opts.sampleEvery === 0) trajectory.push(spins);
  }

  const effDays = days > 0 ? days : rounds / Math.max(1, opts.roundsPerDay);
  const netTotal = spins - p.startSpins;
  return {
    rounds, days,
    endSpins: spins,
    netSpinTotal: netTotal,
    netSpinPerDay: effDays > 0 ? netTotal / effDays : 0,
    netSpinPerRound: rounds > 0 ? netTotal / rounds : 0,
    drainFactor: rounds > 0 ? -(netTotal / rounds) / p.bet : 0,
    uptickRatio: rounds > 0 ? upticks / rounds : 0,
    blocked,
    endCoins: coins,
    cityLevel: L,
    upgrades: upgradeRounds.length,
    avgRoundsPerUpgrade: upgradeRounds.length > 1 ? (upgradeRounds[upgradeRounds.length - 1] - upgradeRounds[0]) / (upgradeRounds.length - 1) : 0,
    rtpBase: wagered > 0 ? returnedBase / wagered : 0,
    rtpEffective: wagered > 0 ? returnedEff / wagered : 0,
    coinPerRound: rounds > 0 ? coinEarned / rounds : 0,
    spinSources: src,
    coinSources: coinSrc,
    raidEvents,
    trajectory,
    trajectoryDays,
    upgradeRounds,
  };
}

/** 평균(여러 시드) — 노이즈 제거. */
export function simulateAvg(p: EconParams, opts: SimOptions, seeds: number): SimResult {
  const runs: SimResult[] = [];
  for (let s = 0; s < seeds; s++) runs.push(simulate(p, { ...opts, seed: opts.seed + s * 101 }));
  const n = runs.length;
  const avg = (f: (r: SimResult) => number) => runs.reduce((s, r) => s + f(r), 0) / n;
  return {
    rounds: Math.round(avg((r) => r.rounds)),
    days: Math.round(avg((r) => r.days)),
    endSpins: Math.round(avg((r) => r.endSpins)),
    netSpinTotal: Math.round(avg((r) => r.netSpinTotal)),
    netSpinPerDay: avg((r) => r.netSpinPerDay),
    netSpinPerRound: avg((r) => r.netSpinPerRound),
    drainFactor: avg((r) => r.drainFactor),
    uptickRatio: avg((r) => r.uptickRatio),
    blocked: avg((r) => (r.blocked ? 1 : 0)) >= 0.5,
    endCoins: Math.round(avg((r) => r.endCoins)),
    cityLevel: avg((r) => r.cityLevel),
    upgrades: avg((r) => r.upgrades),
    avgRoundsPerUpgrade: avg((r) => r.avgRoundsPerUpgrade),
    rtpBase: avg((r) => r.rtpBase),
    rtpEffective: avg((r) => r.rtpEffective),
    coinPerRound: avg((r) => r.coinPerRound),
    spinSources: {
      gem: Math.round(avg((r) => r.spinSources.gem)),
      bigwin: Math.round(avg((r) => r.spinSources.bigwin)),
      attack: Math.round(avg((r) => r.spinSources.attack)),
      mission: Math.round(avg((r) => r.spinSources.mission)),
      hotel: Math.round(avg((r) => r.spinSources.hotel)),
      daily: Math.round(avg((r) => r.spinSources.daily)),
      league: Math.round(avg((r) => r.spinSources.league)),
    },
    coinSources: {
      slot: Math.round(avg((r) => r.coinSources.slot)),
      jackpot: Math.round(avg((r) => r.coinSources.jackpot)),
      mission: Math.round(avg((r) => r.coinSources.mission)),
      raid: Math.round(avg((r) => r.coinSources.raid)),
    },
    raidEvents: Math.round(avg((r) => r.raidEvents)),
    trajectory: runs[0].trajectory,
    trajectoryDays: runs[0].trajectoryDays,
    upgradeRounds: runs[0].upgradeRounds,
  };
}

/** 리그 ON/OFF 비교(동일 시드·흐름측정 모드). */
export function compareLeague(p: EconParams, opts: SimOptions, seeds: number): {
  without: SimResult; with: SimResult; deltaSpinPerDay: number; deltaCoinPerDayApprox: number;
} {
  const flowOpts: SimOptions = { ...opts, allowNegative: true };
  const without = simulateAvg(p, { ...flowOpts, league: { ...opts.league, enabled: false } }, seeds);
  const withL = simulateAvg(p, { ...flowOpts, league: { ...opts.league, enabled: true } }, seeds);
  return {
    without,
    with: withL,
    deltaSpinPerDay: withL.netSpinPerDay - without.netSpinPerDay,
    deltaCoinPerDayApprox: opts.league.enabled || true ? leaguePerDayCoins({ ...opts.league, enabled: true }) : 0,
  };
}

export { DEFAULT_LEAGUE };
