/**
 * headerText.ts — 헤더(코인/젬/라이프) 숫자 텍스트 공통 스타일.
 *
 * buildLayout 은 텍스트를 전부 중앙고정(origin 0.5)으로 렌더하며 디자이너의 `align` 을 버린다.
 * 디자이너는 코인/젬 잔액에 align:right(옆 '+' 버튼 왼쪽에 우측고정 → 왼쪽으로 자람), 라이프에
 * align:center 를 지정했는데, 이를 무시하면 숫자가 '+' 버튼을 침범한다. 이 헬퍼가 노드 align 을
 * origin 으로 반영(우=1·좌=0·중앙=0.5)하고 **좁은 자간**을 적용해 게임/로비 헤더를 동일하게 맞춘다.
 */
import type Phaser from 'phaser';
import type { LayoutEntry } from './layoutLoader.js';

/** 헤더 숫자 자간(좁게) — 같은 폭에 더 큰/긴 숫자. */
const HEADER_LETTER_SPACING = -3;

/**
 * 상단(y<yMax) 텍스트에 헤더 스타일(align→origin + 좁은 자간)을 적용하고 좌→우 정렬해 돌려준다.
 * 게임(PlayScene)·로비(LobbyScene) 모두 같은 헤더 바(up_SC_UI_42_v2)를 쓰므로 공유한다.
 */
export function styleHeaderTexts(entries: LayoutEntry[], yMax = 200): LayoutEntry[] {
  const texts = entries
    .filter((e) => e.node.type === 'text' && (e.node.y ?? 0) < yMax)
    .sort((a, b) => (a.node.x ?? 0) - (b.node.x ?? 0));
  for (const ht of texts) {
    const t = ht.obj as Phaser.GameObjects.Text;
    t.setLetterSpacing(HEADER_LETTER_SPACING);
    const align = (ht.node as { align?: string }).align;
    t.setOrigin(align === 'right' ? 1 : align === 'left' ? 0 : 0.5, 0.5);
  }
  return texts;
}
