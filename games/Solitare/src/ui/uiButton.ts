/**
 * uiButton.ts — **공용 버튼**(저작 아트 `Solitare_UI_30-1~5`).
 *
 * PO 2026-08-23: "UI_30-1~5 버튼을 다양한 버튼 표시에 일관성 있게 배치하라."
 *   예전엔 팝업마다 `text` 에 `backgroundColor` 를 얹은 네모 버튼을 각자 그려 색·크기·여백이 제각각이었다.
 *   여기 한 곳에서만 만들어 어느 화면에서든 같은 모양·같은 눌림 반응을 쓴다.
 *
 * 아트는 5색 알약 버튼(2172×724, 크림 바탕 + 색 테두리)이다. 색 이름으로 고른다.
 */
import Phaser from 'phaser';
import { sfx, type Sfx } from '../audio.js';

export type ButtonColor = 'green' | 'blue' | 'orange' | 'purple' | 'red';

/** 색 → 저작 아트 키(실측한 테두리 색 기준). */
const BUTTON_KEY: Record<ButtonColor, string> = {
  green: 'up_Solitare_UI_30-1',
  blue: 'up_Solitare_UI_30-2',
  orange: 'up_Solitare_UI_30-3',
  purple: 'up_Solitare_UI_30-4',
  red: 'up_Solitare_UI_30-5',
};
/** 아트가 없을 때 폴백으로 칠할 색. */
const FALLBACK_FILL: Record<ButtonColor, number> = {
  green: 0x2e9e4f,
  blue: 0x2b6fd6,
  orange: 0xd08a12,
  purple: 0x7a3fc0,
  red: 0xc0392b,
};

/** 아트 비율(세로/가로). */
export const BUTTON_RATIO = 724 / 2172;
/** 글자가 앉을 수 있는 안쪽 비율(테두리 제외) — 실측. */
const INNER_W = 0.86;
const INNER_H = 0.62;
const FONT = '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif';

export interface UiButtonOpts {
  /** 강제 폭(월드 px). 없으면 글자에 맞춰 잡는다. */
  readonly width?: number;
  readonly fontSize?: number;
  /** 글자색 — 기본은 아트 바탕(크림)에 맞춘 진한 갈색. */
  readonly color?: string;
  /** 누를 때 소리(기본 'button'). null 이면 소리 없음. */
  readonly sound?: Sfx | null;
}

/**
 * 라벨에 맞춰 크기를 잡은 버튼을 만든다. 반환값은 컨테이너(위치는 (x, y) 중심).
 *   눌리면 살짝 줄었다 돌아오며 `onTap` 을 부른다.
 */
export function uiButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  color: ButtonColor,
  onTap: () => void,
  opts: UiButtonOpts = {},
): Phaser.GameObjects.Container {
  const fontSize = opts.fontSize ?? 46;
  const box = scene.add.container(x, y);
  const t = scene.add
    .text(0, 0, label, { fontFamily: FONT, fontSize: `${fontSize}px`, color: opts.color ?? '#4a2f14' })
    .setOrigin(0.5);
  // 글자에 여백을 더해 폭을 잡고(안쪽 비율 역산), 세로는 아트 비율을 따른다.
  const bw = opts.width ?? Math.max(300, (t.width + 90) / INNER_W, (t.height + 30) / INNER_H / BUTTON_RATIO);
  const bh = bw * BUTTON_RATIO;
  const key = BUTTON_KEY[color];
  if (scene.textures.exists(key)) {
    box.add(scene.add.image(0, 0, key).setDisplaySize(bw, bh));
  } else {
    box.add(scene.add.rectangle(0, 0, bw, bh, FALLBACK_FILL[color], 0.98).setStrokeStyle(5, 0xffffff, 0.9));
    t.setColor('#ffffff');
  }
  box.add(t);
  box.setData('label', t); // setButtonLabel 로 글자만 바꿀 수 있게(예: 소리 on/off).
  /*
   * **클릭 영역 = 버튼 전체**(PO 2026-08-24: "클릭하는 점이 텍스트에 맞춰져 있어서 잘 클릭되지 않습니다").
   *
   * 예전엔 `setInteractive(new Rectangle(-bw/2, -bh/2, bw, bh), …)` 처럼 **직접 만든 사각형**을 넘겼는데,
   * 컨테이너에서는 그 사각형의 좌상단 오프셋이 한 번 더 반영돼 유효 영역이 **좌·상으로 통째로 밀린다**.
   * 실측(설정 화면 버튼 560×187): 눌리는 범위가 x −280..0 / y −93..0 — 중심 기준 **좌상단 사분면뿐**이라
   * 사실상 글자 근처만 눌렸다.
   *
   * `setSize` 로 크기만 알려 주고 **인자 없이** `setInteractive()` 를 부르면 Phaser 가 컨테이너 중심을
   * 기준으로 올바른 사각형을 만든다. ⚠️ 컨테이너 버튼에는 커스텀 히트영역을 넘기지 말 것.
   */
  box.setSize(bw, bh);
  box.setInteractive({ useHandCursor: true });
  box.on('pointerdown', () => {
    const s = opts.sound === undefined ? 'button' : opts.sound;
    if (s) sfx(s);
    scene.tweens.add({ targets: box, scale: 0.94, duration: 70, yoyo: true, onComplete: () => onTap() });
  });
  return box;
}

/** 만들어 둔 버튼의 글자만 바꾼다(폭은 그대로 — 고정폭 버튼용). */
export function setButtonLabel(box: Phaser.GameObjects.Container, label: string): void {
  (box.getData('label') as Phaser.GameObjects.Text | undefined)?.setText(label);
}
