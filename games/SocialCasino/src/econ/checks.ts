/**
 * econ/checks.ts — **경제 건강 점검(헬스체크) + KPI**. 콘솔 pass/fail 배지 + 상단 카드의 판단 근거.
 *
 *   runBundle: 필요한 풀루프 시뮬을 **한 번만** 실행(콘솔 응답성) → KPI·심(sim)체크 둘 다 이 번들에서 파생.
 *   formulaChecks: 닫힌형 불변식(시뮬無) — α<γ, T(n) 단조, 리그코인 vs 비용곡선.
 *   설계 출처: econ-console-research league-model healthChecks.
 */
import { simulateAvg, estimateRtp, cityCostP, incomeMultP, defaultEconParams, type EconParams, type SimOptions, type SimResult } from './sim.js';
import { leaguePerDayCoins, type LeagueParams } from './league.js';
import type { WorkingState } from './levers.js';

export type Severity = 'critical' | 'warn';
export interface CheckResult {
  id: string; label: string; pass: boolean; valueStr: string; targetStr: string; rationale: string; severity: Severity;
}

/** 각 점검의 보조 설명(맥락·조치). 콘솔 배지에 함께 표시. */
export const PLAIN_HELP: Record<string, string> = {
  alpha_lt_gamma: '도시 업그레이드 비용 증가율(γ)이 코인 획득 배수 증가율(α)보다 커야 다음 목표가 계속 유지됩니다. 위반 시 후반에 코인이 과잉 축적되어 목표가 소실됩니다.',
  t_monotonic: '상위 단계로 갈수록 업그레이드 1회 소요가 길어져야 장기 진행이 유지됩니다. 위반 시 후반 난이도가 하락합니다.',
  league_coin_vs_cost: '리그 코인 보상이 동시점 도시 업그레이드 비용의 25%를 넘지 않아야 합니다. 초과 시 리그만으로 진행이 가능해져 목표 동기가 약화됩니다.',
  drain_band: '순수 플레이의 라운드당 스핀 순소모가 베팅의 30~80% 범위여야 합니다. 과도하면 이탈, 과소하면 긴장도가 저하됩니다.',
  rtp_band: '숙련 플레이 기준 베팅 대비 코인 환수율입니다. 코인은 소비처(도시)가 있는 소프트 화폐라 90~170%를 허용합니다.',
  net_day_band: '1일 플레이 기준 스핀 순증감입니다. 완만한 감소~소폭 증가가 정상이며, 지속 우상향(인플레)·급감(이탈)은 경계합니다. 저베팅의 소폭 증가는 의도된 동작입니다.',
  uptick_band: '플레이 중 스핀 잔고가 증가하는 라운드 비율(누적 체감)입니다. 8~40%가 적정이며, 과소는 단조 감소, 과다는 상시 증가를 의미합니다.',
  league_not_flip: '리그 활성 시에도 스핀이 영구 순증가(무한 우상향)로 전환되면 안 됩니다(자동충전 폐지 취지). 초과 시 리그 보상을 하향하십시오.',
};

const fmtPct = (x: number): string => `${(x * 100).toFixed(1)}%`;

// ── 시뮬 번들(한 번만 실행) ──
// ⚠️ 흐름(flow) 측정은 **정착 상태**(autoBuildHotel=false): 호텔 환급은 1회성 진행보상이라 steady 유입이 아님 →
//    포함하면 초반 보너스 덩어리가 net/일·드레인을 왜곡. 정착 유입 = 데일리+젬환급+대박+미션+리그. (호텔 빌드 형태는 톱니 차트에서.)
export interface SimBundle {
  playOnly: SimResult; // 데일리0·미션0·리그OFF·빌드OFF (순수 플레이 라운드 드레인)
  flowOff: SimResult; // 리그 OFF 정착 flow
  flowOn: SimResult; // 리그 ON 정착 flow
  live: SimResult; // 리그 현 상태 정착 flow (KPI)
  rtp: number; // 구조 RTP(수렴 추정, M·리그 무관)
}

function flowOpts(league: LeagueParams, rounds: number): SimOptions {
  return { rounds, seed: 31, roundsPerDay: 50, league, autoBuildHotel: false, allowNegative: true, sampleEvery: 0 };
}

export function runBundle(ws: WorkingState, seeds = 2, rounds = 1500): SimBundle {
  const p = ws.params;
  const off: LeagueParams = { ...ws.league, enabled: false };
  const on: LeagueParams = { ...ws.league, enabled: true };
  return {
    // 순수 플레이: 데일리·미션·호텔 보충 전부 제거 → 라운드 경제(소모 vs 젬환급+대박)만.
    playOnly: simulateAvg({ ...p, dailySpins: 0, missions: [] }, flowOpts(off, rounds), seeds),
    flowOff: simulateAvg(p, flowOpts(off, rounds), seeds),
    flowOn: simulateAvg(p, flowOpts(on, rounds), seeds),
    live: simulateAvg(p, flowOpts(ws.league, rounds), seeds),
    rtp: estimateRtp(p),
  };
}

export interface Kpis {
  netSpinPerDay: number; drainFactor: number; uptickRatio: number; rtpBase: number;
  coinPerRound: number; leagueDeltaSpinPerDay: number;
}

export function kpisFromBundle(ws: WorkingState, b: SimBundle): Kpis {
  return {
    netSpinPerDay: b.live.netSpinPerDay,
    drainFactor: b.playOnly.drainFactor,
    uptickRatio: b.live.uptickRatio,
    rtpBase: b.rtp,
    coinPerRound: b.live.coinPerRound,
    leagueDeltaSpinPerDay: ws.league.enabled ? b.flowOn.netSpinPerDay - b.flowOff.netSpinPerDay : 0,
  };
}

/** 닫힌형 불변식(시뮬 불필요). */
export function formulaChecks(ws: WorkingState): CheckResult[] {
  const p = ws.params;
  const out: CheckResult[] = [];

  let alphaOk = true, worstL = 0, worstGap = Infinity;
  for (let L = 1; L <= 40; L++) {
    const costRatio = Math.pow(p.cityCostGrowth, L);
    const incRatio = incomeMultP(p, L) / incomeMultP(p, 0);
    const gap = costRatio - incRatio;
    if (gap < worstGap) { worstGap = gap; worstL = L; }
    if (costRatio <= incRatio) alphaOk = false;
  }
  out.push({
    id: 'alpha_lt_gamma', label: '핵심 불변식 α<γ (목표 영속)', pass: alphaOk, severity: 'critical',
    valueStr: `최소격차 L${worstL}: ${worstGap.toFixed(2)}`, targetStr: '모든 L에서 γ^L > M(L)/M(0)',
    rationale: '코인 비용이 획득배수보다 빨리 자라야 "다음 목표"가 영원히 살아있음(완주·인플레 방지).',
  });

  let tMono = true;
  for (let L = 0; L < p.maxCityLevel; L++) {
    if (cityCostP(p, L + 1) / incomeMultP(p, L + 1) <= cityCostP(p, L) / incomeMultP(p, L)) tMono = false;
  }
  out.push({
    id: 't_monotonic', label: '업그레이드 소요 T(n) 단조증가', pass: tMono, severity: 'warn',
    valueStr: tMono ? '단조 증가' : '비단조(후반 쉬워짐)', targetStr: 'T(n+1) > T(n)',
    rationale: '비용 성장이 획득배수를 추월 → 업그레이드 간격이 점점 길어져 장기 리텐션.',
  });

  const weeklyCoin = leaguePerDayCoins({ ...ws.league, enabled: true }) * ws.league.periodDays;
  let maxRatio = 0;
  for (let L = 5; L <= p.maxCityLevel; L++) maxRatio = Math.max(maxRatio, weeklyCoin / cityCostP(p, L));
  const leagueCoinOk = !ws.league.enabled || maxRatio <= 0.25;
  out.push({
    id: 'league_coin_vs_cost', label: '리그 코인 ≤ 시티비용 25%', pass: leagueCoinOk, severity: 'warn',
    valueStr: ws.league.enabled ? `L≥5 최대 ${fmtPct(maxRatio)}` : '리그 OFF', targetStr: '≤ 25%',
    rationale: '리그 코인이 시티비용 곡선을 추월하면 진행 영속목표가 무너지고 후반 코인 인플레.',
  });

  return out;
}

/** 시뮬 번들 기반 체크. */
export function simChecksFromBundle(ws: WorkingState, b: SimBundle): CheckResult[] {
  const p = ws.params;
  const out: CheckResult[] = [];

  const drainOk = b.playOnly.drainFactor >= 0.3 && b.playOnly.drainFactor <= 0.9;
  out.push({
    id: 'drain_band', label: '순소모 밴드 (플레이 단독)', pass: drainOk, severity: 'critical',
    valueStr: `drain = ${b.playOnly.drainFactor.toFixed(2)}·베팅/라운드`, targetStr: '0.30 ~ 0.90',
    rationale: '너무 빠르면(>0.9) 페이월·이탈, 너무 느리면(<0.3) 텐션 소실. 0.85≈300스핀 35라운드(설계 기준). 데일리·미션 전 순수 라운드 드레인.',
  });

  const rtpBandOk = b.rtp >= 0.9 && b.rtp <= 1.7;
  out.push({
    id: 'rtp_band', label: '구조 RTP 밴드 (수렴 추정)', pass: rtpBandOk, severity: 'warn',
    valueStr: `RTP ${fmtPct(b.rtp)} (AI최적·4만스핀 수렴)`, targetStr: '0.90 ~ 1.70',
    rationale: 'AI 최적 결합 RTP(스킬보상+당첨하한이라 휴먼보다 높음). 코인은 의도적 소프트/인플레 화폐(시티 소비처) → 관대 허용, 단 폭주 감시.',
  });

  // 정착 순스핀/일 밴드: 완만 드레인 ~ 소폭 누적(저베팅 "쌓이는 느낌"). 데일리·젬·미션·리그 포함, 호텔 1회성 제외.
  const netLo = -0.6 * p.dailySpins, netHi = 0.5 * p.dailySpins;
  const netOk = b.live.netSpinPerDay >= netLo && b.live.netSpinPerDay <= netHi;
  out.push({
    id: 'net_day_band', label: '정착 순스핀/일 밴드', pass: netOk, severity: 'critical',
    valueStr: `net/일 = ${b.live.netSpinPerDay.toFixed(0)} (베팅 ${p.bet})`, targetStr: `${netLo.toFixed(0)} ~ ${netHi.toFixed(0)}`,
    rationale: '호텔 1회성 제외 정착 유입 vs 소모. 저베팅 소폭누적=의도된 "쌓이는 느낌"·고베팅은 드레인. 폭주(우상향)·급드레인(이탈)만 차단.',
  });

  const upOk = b.live.uptickRatio >= 0.04 && b.live.uptickRatio <= 0.4;
  out.push({
    id: 'uptick_band', label: '톱니 업틱 ("쌓이는 느낌")', pass: upOk, severity: 'warn',
    valueStr: `업틱 ${fmtPct(b.live.uptickRatio)}`, targetStr: '4% ~ 40%',
    rationale: '라운드 단위 상승 비율(1~2젬은 ×1=거의 본전). "쌓이는 느낌"은 주로 마일스톤(호텔·미션·데일리) 큰 상승니가 담당.',
  });

  if (ws.league.enabled) {
    const band = 0.2 * p.dailySpins; // 리그는 보충원 — 소폭 양(陽) 허용하되 runaway 금지
    const netWith = b.flowOn.netSpinPerDay;
    out.push({
      id: 'league_not_flip', label: '리그가 스핀 영구 net-positive 로 안 뒤집음', pass: netWith <= band, severity: 'critical',
      valueStr: `net/일 WITH=${netWith.toFixed(0)} (OFF ${b.flowOff.netSpinPerDay.toFixed(0)}, Δ${(netWith - b.flowOff.netSpinPerDay).toFixed(0)})`,
      targetStr: `≤ ${band.toFixed(0)}`,
      rationale: '사용자 명시 요구 — 리그를 켜도 스핀이 영구 증가(무한 우상향)로 뒤집히면 안 됨(자동충전 폐지 취지).',
    });
  } else {
    out.push({
      id: 'league_not_flip', label: '리그가 스핀 영구 net-positive 로 안 뒤집음', pass: true, severity: 'critical',
      valueStr: '리그 OFF', targetStr: 'net/일 ≤ 소폭밴드', rationale: '리그 활성 시 평가. 현재 비활성.',
    });
  }

  return out;
}

/** 전체 점검(번들 1회 실행). */
export function allChecks(ws: WorkingState, seeds = 2): CheckResult[] {
  return [...formulaChecks(ws), ...simChecksFromBundle(ws, runBundle(ws, seeds))];
}

export function defaultWorkingState(league: LeagueParams): WorkingState {
  return { params: defaultEconParams(), league };
}
export type { EconParams };
