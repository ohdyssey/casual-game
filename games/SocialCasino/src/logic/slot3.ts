/**
 * slot3.ts — 신규 3릴×3행 심플 슬롯(코인마스터형). **가운데 1줄(center row)만 판정.**
 *
 * 중앙 3칸(reels[0][1], reels[1][1], reels[2][1])이 모두 동일 심볼일 때만 보상한다.
 *   - 망치(HAMMER_SYMBOL = up_NewUI_SlotSymbol_08) 3매치 → ATTACK 이벤트
 *   - 금화(GOLD_SYMBOL   = up_NewUI_SlotSymbol_04) 3매치 → RAID 이벤트
 *   - 그 외 심볼 3매치                              → 골드 보상(coinBase × bet)
 *   - 미매치                                        → 보상 없음
 * 상/하단 줄은 표시(연출)용일 뿐 판정에 쓰지 않는다.
 *
 * 순수 로직(Phaser 무관, vitest 대상). 릴 회전/연출·이벤트 연결은 slotView/PlayScene 이 담당.
 * reels[col][row] = 심볼 종류(0..SYMBOL_COUNT-1). 구 slot.ts(5릴/5페이라인)는 보관용으로 병존.
 */
import type { Rng } from './rng.js';
import { weightedPick } from './rng.js';

export const REEL_COLS = 3;
export const REEL_ROWS = 3;
export const SYMBOL_COUNT = 8; // up_NewUI_SlotSymbol_01..08
export const CENTER_ROW = 1; // 가운데 줄(0=상,1=중,2=하) — 이 줄만 보상 판정

/** 심볼 인덱스 → up_NewUI_SlotSymbol_(index+1). 04=금화(RAID), 08=망치(ATTACK). */
export const GOLD_SYMBOL = 3; // up_NewUI_SlotSymbol_04
export const HAMMER_SYMBOL = 7; // up_NewUI_SlotSymbol_08

export type Reels = number[][]; // [col][row]
export type SpinKind = 'none' | 'coin' | 'attack' | 'raid';

export interface SpinOutcome {
  readonly reels: Reels;
  readonly matched: boolean; // 중앙 3칸 동일 여부
  readonly symbol: number; // 매치 심볼(미매치 시 -1)
  readonly kind: SpinKind; // none / coin / attack / raid
  readonly coinBase: number; // 'coin' 시 심볼 코인 배수(× bet). attack/raid/none 은 0
}

/**
 * 심볼 등장 가중치(합=100, 클수록 흔함). 망치(7)/금화(3) 특수 심볼은 3매치 이벤트가 게임의 핵심이라
 * 코인 심볼보다 다소 높게 잡았다(가끔 어택/레이드가 떠야 재미). 중앙 1줄 판정이라 승률은 본질적으로 낮다.
 * ⚠️ 초기값 — 정확한 승률/RTP/이벤트 빈도는 econ 콘솔 몬테카를로(src/econ)로 튜닝할 것.
 */
export const WEIGHTS: ReadonlyArray<number> = [14, 13, 12, 16, 12, 11, 6, 16];
//   symbol index:                              0   1   2   3   4   5   6   7
//                                                          ↑금화             ↑망치

/** 심볼별 코인 보상 배수(× bet). 특수 심볼(금화3·망치7)은 0 — 이벤트로 대체. 고인덱스일수록 희귀·고가. */
export const SYMBOL_COIN: ReadonlyArray<number> = [12, 18, 26, 0, 40, 60, 120, 0];
//   symbol index:                                  0   1   2  3G  4   5    6  7H

/**
 * ⭐스핀당 중앙 1줄 **매칭 확률**(요청: 최소 30%↑). 릴을 강제해 이 비율로 3매치를 만든다(독립 릴의 자연 확률
 *   ≈2% 로는 30%가 불가능하므로 목표비율 방식). econ 콘솔 튜닝 대상.
 */
export const MATCH_RATE = 0.34;

/**
 * 매칭 발생 시 **어떤 심볼로 매치되는지**의 분포(가중치).
 *   ⭐2026-07-06 요청 "슬롯 어택 비율↓": 망치(7·어택)를 18→**8** 로 하향. 이제 슬롯 특수는 어택(망치)뿐이라
 *     — 금화(3)는 PlayScene 라우팅에서 코인으로 대체(슬롯 레이드 없음) — 어택만 낮추면 된다.
 *   합=98: 망치 8(≈8.2%)·금화 18(코인 대체)·코인 각 12. → 스핀당 어택 ≈ 0.34×0.082 ≈ **2.8%**(기존 5.7%의 절반↓).
 */
export const MATCH_SYMBOL_WEIGHTS: ReadonlyArray<number> = [12, 12, 12, 18, 12, 12, 12, 8];
//   symbol index:                                          0   1   2   3G  4   5   6   7H

/** 한 릴(열) 3칸을 가중 추출. weights 미지정 시 기본 WEIGHTS. */
export function spinColumn(rng: Rng, weights: ReadonlyArray<number> = WEIGHTS): number[] {
  return [weightedPick(rng, weights), weightedPick(rng, weights), weightedPick(rng, weights)];
}

/** 3릴 × 3행 결과 생성. weights 로 심볼 분포(운 상태)를 바꿀 수 있다. */
export function spinReels(rng: Rng, weights: ReadonlyArray<number> = WEIGHTS): Reels {
  const reels: Reels = [];
  for (let c = 0; c < REEL_COLS; c++) reels.push(spinColumn(rng, weights));
  return reels;
}

/** 심볼 → 결과 종류. 망치=attack, 금화=raid, 그 외=coin. */
export function kindOf(symbol: number): Exclude<SpinKind, 'none'> {
  if (symbol === HAMMER_SYMBOL) return 'attack';
  if (symbol === GOLD_SYMBOL) return 'raid';
  return 'coin';
}

/** 중앙 1줄 판정: reels[*][CENTER_ROW] 3칸이 동일하면 보상, 아니면 무보상. */
export function evaluate(reels: Reels): SpinOutcome {
  const a = reels[0][CENTER_ROW];
  const b = reels[1][CENTER_ROW];
  const c = reels[2][CENTER_ROW];
  if (a !== b || b !== c) {
    return { reels, matched: false, symbol: -1, kind: 'none', coinBase: 0 };
  }
  const symbol = a;
  const kind = kindOf(symbol);
  const coinBase = kind === 'coin' ? SYMBOL_COIN[symbol] : 0;
  return { reels, matched: true, symbol, kind, coinBase };
}

/**
 * 스핀 1회: 릴 생성 후 **목표 매칭 확률(MATCH_RATE)** 로 중앙 3매치를 강제한다(요청: 승률 30%↑).
 *   - MATCH_RATE 확률로 매칭: 중앙 3칸을 동일 심볼(MATCH_SYMBOL_WEIGHTS 로 선택 — 특수 빈도↑)로 채움.
 *   - 그 외: 우연히 3매치가 나왔으면 한 칸을 바꿔 목표 승률을 유지(오탐 방지).
 *   상/하단 행은 항상 랜덤(연출용). 평가는 evaluate(중앙 1줄).
 */
export function spin(rng: Rng, weights: ReadonlyArray<number> = WEIGHTS): SpinOutcome {
  const reels = spinReels(rng, weights);
  if (rng() < MATCH_RATE) {
    const symbol = weightedPick(rng, MATCH_SYMBOL_WEIGHTS);
    reels[0][CENTER_ROW] = symbol;
    reels[1][CENTER_ROW] = symbol;
    reels[2][CENTER_ROW] = symbol;
  } else if (reels[0][CENTER_ROW] === reels[1][CENTER_ROW] && reels[1][CENTER_ROW] === reels[2][CENTER_ROW]) {
    reels[2][CENTER_ROW] = (reels[2][CENTER_ROW] + 1) % SYMBOL_COUNT; // 비매치 스핀의 우연한 3매치 해제
  }
  return evaluate(reels);
}

/** 'coin' 결과의 실제 코인 지급액(= coinBase × bet). 도시레벨 income/luck 배수는 PlayScene/economy 에서 적용. */
export function coinPayout(outcome: SpinOutcome, bet: number): number {
  return outcome.kind === 'coin' ? outcome.coinBase * bet : 0;
}
