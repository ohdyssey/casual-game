/**
 * levels.ts — 레벨 = **에디터(design/card-editor.html)에서 저작한 배치만** 사용.
 *
 * (2026-07-11: 이전의 절차적 60레벨 자동 생성은 전부 제거. 게임에는 오직 에디터에서 저작한
 *  **연속 레벨 1..N** 만 노출·플레이된다. 새 레벨은 계속 에디터로 추가한다.)
 *
 * **진행도와 콘텐츠 분리**(2026-07-19, PO 지시) — 플레이어의 "레벨"(누적 승리판수, 성장 카운터)과
 *   "저작된 카드 보드 수"는 다른 개념이다. 저작 풀(현재 500장)을 다 넘으면 **순환 재사용**하며
 *   진행도만 계속 오른다(levelCurve.ts cycleLevel 참고) — 3천 레벨까지 성장해도 콘텐츠는 그대로 500장.
 *
 * 타워(SOLITAIRE HEIGHTS) 층 아트(FLOORS)는 **시각 테마로만** 순환한다(레벨 수와 독립).
 * 층 아트는 화면 상단, 그 아래 검은 반투명 보드에서 솔리테어를 진행한다(PlayScene).
 */
import type { PeakLayout } from './layouts.js';
import { getEditorLevel, editorLevelCount, type CardBoardDoc } from './editorLevels.js';
import { cycleLevel, MAX_PROGRESS_LEVEL } from './levelCurve.js';

/** 타워 층 테마 — 실제 아트(Slitare_BG_0N) 순서. artW/artH = 원본 픽셀(비율 보존 배치용). */
export interface FloorTheme {
  readonly id: string;
  readonly name: string;
  readonly sub: string;
  readonly tint: number;
  readonly artW: number;
  readonly artH: number;
}

export const FLOORS: readonly FloorTheme[] = [
  { id: 'bakery', name: 'Golden Crust', sub: 'BAKERY', tint: 0xf6c34a, artW: 837, artH: 566 },
  { id: 'ramen', name: 'Ramen Yokocho', sub: 'ラーメン横丁', tint: 0xe0553a, artW: 766, artH: 503 },
  { id: 'coffee', name: 'Bean & Bloom', sub: 'COFFEE SHOP', tint: 0x2e7d4f, artW: 775, artH: 484 },
  { id: 'seafood', name: 'Ocean Flame', sub: 'SEAFOOD GRILL', tint: 0x2f6fb0, artW: 690, artH: 428 },
  { id: 'dessert', name: 'Sweet Escape', sub: 'DESSERT BAR', tint: 0xb05de5, artW: 654, artH: 427 },
];

export interface LevelDef {
  /** 진행도(플레이어가 보는 레벨 번호, 성장 카운터) — 1..MAX_PROGRESS_LEVEL. */
  readonly level: number;
  /** 실제 콘텐츠 조회에 쓰인 레벨 번호(1..저작 수, 순환됨) — level 과 다를 수 있다(디버그/표시용). */
  readonly contentLevel: number;
  /** 에디터 저작 배치. **저작 레벨이 하나도 없으면 null**(플레이 불가 — 호출부가 방어). */
  readonly layout: PeakLayout | null;
  readonly floor: FloorTheme;
}

/**
 * 레벨(1-base, 진행도) → 정의. 배치는 **에디터 저작분을 순환 재사용**(getEditorLevel, cycleLevel),
 *   층 테마는 아트 5종 순환. extraDocs = 씬이 번들 팩(public/levels/cardLevels.json)에서 읽어 넘겨주는
 *   문서(localStorage 와 병합).
 */
export function levelDef(level: number, extraDocs?: Record<string, CardBoardDoc>): LevelDef {
  const idx = Math.max(0, level - 1);
  const contentLevel = cycleLevel(level, editorLevelCount(extraDocs));
  return {
    level,
    contentLevel,
    layout: getEditorLevel(contentLevel, extraDocs),
    floor: FLOORS[idx % FLOORS.length],
  };
}

/** 타워 층 아트 테마 수(=5). **레벨 수가 아니라 시각 테마 순환 길이**. */
export const TOTAL_LEVELS = FLOORS.length;

/** 게임에 노출할 실제 레벨 수 = 에디터에 1부터 연속 저작된 레벨 수(재-export). */
export { editorLevelCount };

/** 진행도 상한(재-export, levelCurve.ts 가 SSOT) — save.level·"다음 레벨" 클램프에 사용. */
export { MAX_PROGRESS_LEVEL };
