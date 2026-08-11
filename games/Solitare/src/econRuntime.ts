/**
 * econRuntime.ts — 게임 런타임의 경제 SSOT 어댑터 (P3 1단계, 2026-07-16 PO "지금까지 만든 내용 적용").
 *
 * 시뮬 도구(design/econ-board.html)의 "게임 반영"이 저장한 `public/econ/economy.json` 을 로드해
 * 순수 경제 모델(src/logic/economy.ts)의 공식을 게임 씬에 공급한다. 파일이 없으면 DEFAULT_ECON.
 *
 * 적용 범위(이번 단계): 게임비 레벨 곡선(100단위 내림) · **도전 배수**(비도박 프레임 — '베팅' 용어 금지) ·
 * 별/남은카드 보상 · 부스터(+5/와일드/되돌리기) 모델 가격(레벨 램프 포함). 함정 레벨·100층 타워·미션은 후속.
 */
import {
  DEFAULT_ECON,
  coerceEcon,
  type EconParams,
  feeForLevel,
  starCoinsFor,
  stockBonusFor,
  plus5CostFor,
  wildCostFor,
  undoCostFor,
} from './logic/economy.js';

let ECON: EconParams = DEFAULT_ECON;

/** Phaser json 캐시 키 / 로드 경로 — Home/Play preload 에서 공용. */
export const ECON_JSON_KEY = 'econ_params';
export const ECON_JSON_URL = 'econ/economy.json';

/** economy.json 원문({kind,params} 또는 bare) → 런타임 파라미터로 병합. 없으면(undefined) 기본값 유지. */
export function setEconFromJson(raw: unknown): void {
  if (raw == null) return;
  const obj = typeof raw === 'object' && raw !== null && 'params' in (raw as Record<string, unknown>) ? (raw as { params: unknown }).params : raw;
  ECON = coerceEcon(obj);
}

export function econ(): EconParams {
  return ECON;
}

/** 도전 배수 옵션(해금 여부 포함) — 진입 팝업의 배수 선택 UI 용. */
export function challengeOptions(level: number): Array<{ mult: number; unlockLevel: number; unlocked: boolean }> {
  return ECON.challengeMults.map((m, i) => {
    const req = ECON.challengeUnlockLevels[i] ?? 1;
    return { mult: m, unlockLevel: req, unlocked: req <= level };
  });
}

/** 게임 입장비 — 레벨 곡선 × 도전 배수. */
export function entryFeeFor(level: number, mult = 1): number {
  return feeForLevel(ECON, level) * Math.max(1, mult);
}

/** 별 보상(코인) — 레벨 곡선 기반 + 도전 배수. */
export function starCoinsAt(level: number, stars: number, mult = 1): number {
  return Math.round(starCoinsFor(ECON, feeForLevel(ECON, level), stars) * Math.max(1, mult));
}

/** 남은카드 보너스 장당 단가(코인) — 레벨 곡선 기반 + 도전 배수. */
export function stockBonusPerCardAt(level: number, mult = 1): number {
  return Math.round(stockBonusFor(ECON, feeForLevel(ECON, level), 1) * Math.max(1, mult));
}

/** +5카드 가격 — 모델 곡선(기저×레벨램프, 100단위 내림) × 도전 배수. uses=이번 판 사용 횟수. */
export function plus5PriceAt(level: number, uses: number, mult = 1): number {
  return Math.round(plus5CostFor(ECON, feeForLevel(ECON, level), uses, level) * Math.max(1, mult));
}

/** 와일드 가격. */
export function wildPriceAt(level: number, uses: number, mult = 1): number {
  return Math.round(wildCostFor(ECON, feeForLevel(ECON, level), uses, level) * Math.max(1, mult));
}

/** 되돌리기 가격(PO 2026-07-16: 되돌리기도 금액 적용) — 게임비×undoFeeMult × 도전 배수, 최소 100. */
export function undoPriceAt(level: number, mult = 1): number {
  return Math.max(100, Math.round(undoCostFor(ECON, feeForLevel(ECON, level)) * Math.max(1, mult)));
}

/** 보유 개수 → **원문자** 표기(PO: 기보유 부스터는 원문자로) — ①~⑳, 초과는 ㉑식 대신 (n). 0은 빈 문자열. */
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];
export function circledCount(n: number): string {
  if (n <= 0) return '';
  return n <= CIRCLED.length ? CIRCLED[n - 1] : `(${n})`;
}
