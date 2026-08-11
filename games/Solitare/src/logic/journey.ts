/**
 * journey.ts — **유저 여정 몬테카를로 시뮬**(시뮬 도구 B계층) + 문제 검출기.
 *
 * 판 시뮬(simulate.ts)이 실측한 성능 분포(승률·별 분포·남은카드)와 경제 파라미터(economy.ts),
 * 행동 파라미터(BehaviorParams)로 "일 N판 × D일 × U명"의 재화 잔고·성장 궤적을 굴린다.
 * docs/ECONOMY_DESIGN.md §10.5 의 문제 검출(파산·이중병목·정체·인플레·결제압박)을 자동 플래그.
 *
 * 게임 규칙 재현이 아니라 **경제 흐름 모델**이다 — 판의 내부는 perf 분포로 추상화한다.
 */
import type { Rng } from './types.js';
import { seededRng } from './deck.js';
import {
  type EconParams,
  feeForLevel,
  starCoinsFor,
  stockBonusFor,
  missionCoinPerSet,
  missionDiamondPerSet,
  floorReqFor,
  diamondCostForFloor,
  totalDiamondsPerLevelExpected,
  floorCoinCost,
  boosterLevelFactor,
  maxChallengeMult,
  compAuctionCost,
  compFloorCost,
  compDiamondCost,
  compDailyYield,
  offlineIncomeFor,
} from './economy.js';

/** 유저 행동 모델(시뮬 조정 대상). */
export interface BehaviorParams {
  /** 접속일 하루 판수(시도 기준 — 코인 부족이면 중단). */
  readonly gamesPerDay: number;
  /** 주당 접속일(1~7). */
  readonly activeDaysPerWeek: number;
  /** 판당 부스터 평균 지출(게임비 배수 — 기대값 모델). */
  readonly boosterSpendMult: number;
  /** 점포 은행 수령 성실도 0~1(방치 수익 중 실제 회수 비율). */
  readonly claimDiligence: number;
  /** 하루 오프라인 경과 시간(방치 수익 계산용). */
  readonly offlineHoursPerDay: number;
  /** 경쟁부지 투자 성향 — 잔고가 (비용×이 값) 이상이면 투자. 0=투자 안 함. */
  readonly compInvestAppetite: number;
  /** **도전 배수 성향** 0~1 — 0=항상 x1, 1=항상 해금 최대 배수. 기대 배수 = 1+성향×(최대-1). */
  readonly challengeAppetite: number;
}

export const DEFAULT_BEHAVIOR: BehaviorParams = {
  gamesPerDay: 7,
  activeDaysPerWeek: 7,
  boosterSpendMult: 0.15,
  claimDiligence: 0.8,
  offlineHoursPerDay: 12,
  compInvestAppetite: 2.0,
  challengeAppetite: 0.3,
};

/** 판 성능 분포(판 시뮬 실측 or 수동 입력). */
export interface PerfParams {
  readonly winRate: number;
  /** 승리 판 별 분포 [1★,2★,3★] — 합 1 로 정규화해 사용. */
  readonly starDist: readonly [number, number, number];
  /** 승리 판 평균 남은 스톡. */
  readonly avgLeftover: number;
  /** **판당 평균 세트 수**(5매치 = 미션 틱, 판 시뮬 avgSets). 미지정=0(미션 수입 미반영). */
  readonly avgSets?: number;
}

export const DEFAULT_PERF: PerfParams = { winRate: 0.9, starDist: [0.45, 0.4, 0.15], avgLeftover: 2, avgSets: 2.7 };

/** 하루 스냅샷(유저 평균 집계). */
export interface DaySnap {
  readonly day: number;
  readonly coins: number;
  readonly diamonds: number;
  readonly level: number;
  readonly floor: number;
  readonly gamesPlayed: number;
  readonly bankruptRate: number; // 이 날 파산 상태(플레이 불가로 중단) 경험 비율
  readonly payPromptRate: number; // 이 날 결제 노출(코인/다이아 부족 순간) 경험 비율
}

/** 여정 결과 + 문제 플래그. */
export interface JourneyReport {
  readonly days: readonly DaySnap[];
  readonly issues: readonly JourneyIssue[];
  /** 층별 도달일(평균, 미도달 = -1). index=층. */
  readonly floorReachedDay: readonly number[];
  readonly users: number;
}

export interface JourneyIssue {
  readonly severity: 'critical' | 'warn' | 'info';
  readonly kind: 'bankrupt' | 'dual-bottleneck' | 'stagnation' | 'inflation' | 'pay-pressure' | 'pay-scarcity';
  readonly message: string;
  readonly day: number;
}

interface UserState {
  coins: number;
  diamonds: number;
  level: number;
  floor: number; // 최고 건설층(경제 티어)
  diamondStage: number; // (레거시 카운터 — 비용은 층 기준 diamondCostForFloor 로 산출)
  compFloors: number; // 경쟁부지 진행(0=미보유)
  lastBuildDay: number;
  bankruptToday: boolean;
  payPromptToday: boolean;
  gamesToday: number;
}

function sampleStars(rng: Rng, dist: readonly [number, number, number]): 1 | 2 | 3 {
  const total = dist[0] + dist[1] + dist[2] || 1;
  const r = rng() * total;
  if (r < dist[0]) return 1;
  if (r < dist[0] + dist[1]) return 2;
  return 3;
}

/**
 * 여정 시뮬 본체 — users 명을 days 일 굴려 일별 평균 스냅샷 + 문제 플래그.
 *   perfByFloor: 층(티어)별 성능(없으면 단일 perf 재사용) — 난이도 커브 반영용.
 */
export function simulateJourney(
  econ: EconParams,
  behavior: BehaviorParams,
  perf: PerfParams | readonly PerfParams[],
  days: number,
  users: number,
  seed = 1,
): JourneyReport {
  const perfFor = (floor: number): PerfParams =>
    Array.isArray(perf) ? ((perf as readonly PerfParams[])[Math.min(perf.length - 1, Math.max(0, floor - 1))] ?? DEFAULT_PERF) : (perf as PerfParams);

  const states: UserState[] = Array.from({ length: users }, () => ({
    coins: econ.startCoins,
    diamonds: econ.startDiamonds,
    level: 1,
    floor: 1,
    diamondStage: 0,
    compFloors: 0,
    lastBuildDay: 0,
    bankruptToday: false,
    payPromptToday: false,
    gamesToday: 0,
  }));
  const rng = seededRng(seed * 7919 + 3);
  const snaps: DaySnap[] = [];
  const issues: JourneyIssue[] = [];
  const floorReachedSum = new Array(econ.maxFloors + 1).fill(0);
  const floorReachedCnt = new Array(econ.maxFloors + 1).fill(0);

  const activeProb = Math.min(1, behavior.activeDaysPerWeek / 7);

  for (let day = 1; day <= days; day++) {
    for (const u of states) {
      u.bankruptToday = false;
      u.payPromptToday = false;
      u.gamesToday = 0;
      const fee = feeForLevel(econ, u.level); // 기준 게임비 = 레벨 단위 계단(PO) — 보급선 기준.
      // **도전 배수**(비도박 프레임) — 플레이 흐름(입장·보상·부스터·함정)에만 기대 배수 적용.
      //   기대 배수 = 1 + 성향×(해금 최대 − 1). 다이아·별은 v1 모델에선 미가중(검토 항목).
      const chMult = 1 + behavior.challengeAppetite * (maxChallengeMult(econ, u.level) - 1);
      const playFee = Math.round(fee * chMult);

      // ── 방치(오프라인) 수익 — 층 수 비례 가중 + 일일 캡 + 수령 성실도.
      const idleBase = offlineIncomeFor(econ, fee, behavior.offlineHoursPerDay);
      const idleRaw = idleBase * (1 + econ.claimFloorWeight * (u.floor - 1));
      const idleCapped = Math.min(idleRaw, fee * econ.idleDailyCapMult);
      u.coins += Math.round(idleCapped * behavior.claimDiligence);
      // 경쟁부지 일 수익.
      if (u.compFloors > 0) u.coins += compDailyYield(econ, fee, u.compFloors);

      // ── 접속일 판정.
      const active = rng() < activeProb;
      if (active) {
        const p = perfFor(u.floor);
        const sets = Math.max(0, p.avgSets ?? 0); // 판당 세트 수(미션 틱) — 인게임 미션 보상 수입.
        for (let g = 0; g < behavior.gamesPerDay; g++) {
          if (u.coins < playFee) {
            // 파산 안전망 모델(§9-1): 여기서는 "그 날 플레이 중단"으로 집계(안전망 미구현 상태 재현).
            u.bankruptToday = true;
            u.payPromptToday = true;
            break;
          }
          u.coins -= playFee;
          u.gamesToday++;
          // **인게임 미션 보상 코인**(세트당, 승패 무관 — 5매치마다 즉시 지급). 게임비 연동(도전 배수 미적용, 게임 정합).
          u.coins += Math.round(sets * missionCoinPerSet(econ, fee));
          const win = rng() < p.winRate;
          if (win) {
            const stars = sampleStars(rng, p.starDist);
            // 보상도 도전 배수에 비례(입장·보상 동시 배수 = 비도박 프레임의 핵심).
            u.coins += Math.round((starCoinsFor(econ, fee, stars) + stockBonusFor(econ, fee, p.avgLeftover)) * chMult);
            u.diamonds += totalDiamondsPerLevelExpected(econ); // 보드+미션리워드+데일리챌린지 합산(PO 2026-07-18).
            u.diamonds += sets * missionDiamondPerSet(econ); // 미션 다이아(완성 보상풀 → 승리 시 지급).
            if (u.level < econ.levelCap) u.level++; // 레벨캡 1,000(PO) — 초과 레벨업 없음.
            // **함정 레벨 지출**(PO: 승리 보장 + 부스터 스파이크 싱크) — 함정 레벨을 "클리어한" 판에
            //   부스터 기대 지출(게임비×trapSpendMult)이 발생. 잔고 부족이면 있는 만큼 소모 + 결제 노출.
            if (u.level >= econ.trapStartLevel && u.level % econ.trapCycleLevels === 0) {
              // 함정 지출 = 부스터 소비 → 부스터 레벨 램프 + 도전 배수 함께 적용.
              const trapSpend = Math.round(fee * econ.trapSpendMult * boosterLevelFactor(econ, u.level) * chMult);
              if (u.coins < trapSpend) u.payPromptToday = true;
              u.coins = Math.max(0, u.coins - trapSpend);
            }
          }
          // 일반 판 부스터 기대 지출(레벨 램프·도전 배수 적용).
          u.coins -= Math.round(fee * behavior.boosterSpendMult * boosterLevelFactor(econ, u.level) * chMult);
          if (u.coins < 0) u.coins = 0;
          if (u.coins < playFee) u.payPromptToday = true;
        }
        // 데일리 미션(플레이 있던 날만).
        if (u.gamesToday > 0) u.coins += Math.round(fee * econ.missionDailyMult);
      }
      // 위클리 다이아.
      if (day % 7 === 0) u.diamonds += econ.weeklyDiamonds;

      // ── 메인타워 건설(레벨 게이트 + **복합 비용**: 다이아 + 5층부터 코인 병행) — 가능한 만큼 자동.
      while (u.floor < econ.maxFloors) {
        const next = u.floor + 1;
        if (u.level < floorReqFor(econ, next)) break;
        const dCost = diamondCostForFloor(econ, next); // 구간 수입 연동(누진 방지, PO).
        const cCost = floorCoinCost(econ, feeForLevel(econ, u.level), next); // 그 시점 게임비 기준.
        if (u.diamonds < dCost || u.coins < cCost) {
          u.payPromptToday = true; // 재화 부족 = 결제 노출 순간.
          break;
        }
        u.diamonds -= dCost;
        u.coins -= cCost;
        u.diamondStage++;
        u.floor = next;
        u.lastBuildDay = day;
        if (floorReachedCnt[next] < users) {
          floorReachedSum[next] += day;
          floorReachedCnt[next]++;
        }
      }

      // ── 경쟁부지 투자(성향 기반) — 낙찰 → 증축 순. **코인 + 다이아 복합 소모**(PO: 다이아 대량 소모처).
      if (behavior.compInvestAppetite > 0 && u.compFloors < econ.compFloors) {
        const feeNow = feeForLevel(econ, u.level);
        const cost = u.compFloors === 0 ? compAuctionCost(econ, feeNow) : compFloorCost(econ, feeNow, u.compFloors + 1);
        const dCost = compDiamondCost(econ, u.compFloors);
        if (cost > 0 && u.coins >= cost * behavior.compInvestAppetite && u.diamonds >= dCost) {
          u.coins -= cost;
          u.diamonds -= dCost;
          u.compFloors++;
        }
      }
    }

    // ── 일별 집계.
    const n = states.length;
    const avg = (f: (u: UserState) => number): number => states.reduce((a, u) => a + f(u), 0) / Math.max(1, n);
    snaps.push({
      day,
      coins: Math.round(avg((u) => u.coins)),
      diamonds: Math.round(avg((u) => u.diamonds)),
      level: Math.round(avg((u) => u.level) * 10) / 10,
      floor: Math.round(avg((u) => u.floor) * 100) / 100,
      gamesPlayed: Math.round(avg((u) => u.gamesToday) * 10) / 10,
      bankruptRate: avg((u) => (u.bankruptToday ? 1 : 0)),
      payPromptRate: avg((u) => (u.payPromptToday ? 1 : 0)),
    });
  }

  // ── 문제 검출(§10.5) — 스냅샷 후처리.
  const last = snaps[snaps.length - 1];
  for (const s of snaps) {
    if (s.bankruptRate >= 0.3 && !issues.some((i) => i.kind === 'bankrupt')) {
      issues.push({ severity: 'critical', kind: 'bankrupt', day: s.day, message: `D${s.day}: 유저 ${Math.round(s.bankruptRate * 100)}%가 코인 파산으로 플레이 중단` });
    }
    if (s.payPromptRate >= 0.6 && !issues.some((i) => i.kind === 'pay-pressure')) {
      issues.push({ severity: 'warn', kind: 'pay-pressure', day: s.day, message: `D${s.day}: 유저 ${Math.round(s.payPromptRate * 100)}%가 매일 결제 압박 노출(이탈 위험)` });
    }
  }
  // 결제 포인트 부족(목표: 지속성장 + **중간중간 결제 포인트**) — 재화가 남아돌아 구매할 이유가
  //   없으면 매출 0. 평균 결제 노출률이 5% 미만이면 경고(과다 60%는 위 pay-pressure 가 잡는다).
  {
    const avgPrompt = snaps.reduce((a, s) => a + s.payPromptRate, 0) / Math.max(1, snaps.length);
    if (avgPrompt < 0.05) {
      issues.push({ severity: 'warn', kind: 'pay-scarcity', day: days, message: `평균 결제 노출 ${Math.round(avgPrompt * 100)}%/일 — 재화 잉여로 구매 이유가 없음(매출 0 위험). 싱크 강화 또는 보상 하향 검토` });
    }
  }
  // 이중 병목: 마지막 날 기준 코인<게임비 & 다이아<다음 건설비 & 레벨은 충족.
  {
    const stuckBoth = states.filter((u) => {
      const fee = feeForLevel(econ, u.level); // 게임비 = 레벨 단위 계단(PO).
      const next = u.floor + 1;
      return u.floor < econ.maxFloors && u.coins < fee && u.level >= floorReqFor(econ, next) && u.diamonds < diamondCostForFloor(econ, next);
    }).length;
    if (stuckBoth / users >= 0.2) {
      issues.push({ severity: 'critical', kind: 'dual-bottleneck', day: days, message: `종료 시점 유저 ${Math.round((stuckBoth / users) * 100)}%가 코인·다이아 동시 고갈(이중 병목)` });
    }
  }
  // 정체: 평균 층이 3일+ 제자리(4층 이후 구간).
  for (let i = 3; i < snaps.length; i++) {
    if (snaps[i].floor >= 4 && snaps[i].floor - snaps[i - 3].floor < 0.01 && snaps[i].floor < econ.maxFloors - 0.05) {
      issues.push({ severity: 'warn', kind: 'stagnation', day: snaps[i].day, message: `D${snaps[i - 3].day}~D${snaps[i].day}: 평균 층 ${snaps[i].floor.toFixed(1)}에서 3일+ 정체` });
      break;
    }
  }
  // 인플레: 잔고가 게임비×50 초과 & 상승 추세.
  if (last) {
    const feeLast = feeForLevel(econ, Math.round(last.level));
    const mid = snaps[Math.floor(snaps.length / 2)];
    if (last.coins > feeLast * 50 && mid && last.coins > mid.coins * 1.5) {
      issues.push({ severity: 'warn', kind: 'inflation', day: last.day, message: `종료 잔고 ${last.coins.toLocaleString()} > 게임비×50 — 코인 싱크 부족(발산 추세)` });
    }
  }

  const floorReachedDay = floorReachedSum.map((sum, f) => (floorReachedCnt[f] > 0 ? Math.round((sum / floorReachedCnt[f]) * 10) / 10 : -1));
  return { days: snaps, issues, floorReachedDay, users };
}
