/**
 * font.ts — 이 게임의 **글꼴 한 벌**.
 *
 * 화면 전체가 **Jua 볼드** 하나로 통일된다. 텍스트를 만드는 곳은 전부 여기를 거쳐야 한다.
 *
 * ⚠️ 저작된 텍스트 노드는 글꼴이 `Roboto` 로 잡혀 있는 것이 있는데 **Roboto 에는 한글 글리프가 없다.**
 *    그대로 두면 한글만 브라우저 기본 고딕으로 떨어져 나머지 UI 와 따로 논다.
 *    그래서 **저작 글꼴은 무시하고** 여기 것으로 덮는다(크기·색은 저작대로 둔다).
 *
 * ⚠️ Jua 는 굵기가 한 벌(400)뿐이라 `bold` 는 브라우저가 합성한다 — 캔버스에서 잘 먹는다.
 *    `assets.ts` 가 400·bold 둘 다 미리 불러 두므로 첫 프레임부터 제 모양으로 그려진다.
 */
import type Phaser from 'phaser';

export const GAME_FONT_FAMILY = '"Jua", sans-serif';
export const GAME_FONT_STYLE = 'bold';

/** 텍스트 스타일 — 글꼴만 고정하고 나머지는 부르는 쪽이 정한다. */
export function gameText(
  style: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  return { ...style, fontFamily: GAME_FONT_FAMILY, fontStyle: GAME_FONT_STYLE };
}

/** 이미 만들어진 텍스트(저작 노드 등)에 게임 글꼴을 씌운다. */
export function applyGameFont(text: Phaser.GameObjects.Text): void {
  text.setFontFamily(GAME_FONT_FAMILY).setFontStyle(GAME_FONT_STYLE);
}
