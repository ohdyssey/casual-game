/**
 * 저작 슬롯에 맞춰 **가장 큰 글자 크기**로 텍스트를 놓는 헬퍼(모바일 가독성 우선).
 *
 * 저작 rect 를 그대로 쓰되 글자 크기는 slot 폭에 맞춰 키우거나 줄인다 — 계산은
 * logic/textFit 의 순수 함수가 하고, 여기서는 Phaser 텍스트로 **실측**만 제공한다.
 */
import Phaser from 'phaser';
import { scriptSizeBumpPx } from '@casual/core';
import { BODY_WEIGHT, fitFontSize } from '../logic/textFit.js';
import { FONT } from './uiKit.js';

export interface FitTextOpts {
  /** 저작 글자 크기(px) — 확대·축소의 기준이자 하한/상한의 기준. */
  size: number;
  color: string;
  /** 굵기 — 제목은 TITLE_WEIGHT(800), 본문은 기본 BODY_WEIGHT(700). */
  weight?: string;
  /** 저작 정렬 — left/center/right(기본 center). rect 안에서 기준점이 달라진다. */
  align?: 'left' | 'center' | 'right';
  strokeColor?: string;
  strokeW?: number;
  shadow?: boolean;
}

export interface SlotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 슬롯에 글자를 채워 넣는다 — 반환값은 만들어진 텍스트(호출측이 컨테이너에 add).
 * ⚠️ 크기를 재려면 텍스트 객체가 필요하므로 **한 번 만들고 크기만 바꿔 가며** 측정한다
 *   (임시 객체를 새로 만들면 GC 부담 + 해상도 설정이 달라 측정이 어긋난다).
 */
export function fitText(
  scene: Phaser.Scene,
  rect: SlotRect,
  value: string,
  o: FitTextOpts,
): Phaser.GameObjects.Text {
  // 숫자·영문은 한글보다 작아 보인다 → 기준 크기에 먼저 보정을 얹고 슬롯에 맞춘다.
  //   (코어 텍스트 팩토리도 같은 보정을 하지만, 여기서 setFontSize 로 덮으므로 다시 적용한다.)
  const baseSize = o.size + scriptSizeBumpPx(value);
  const align = o.align ?? 'center';
  const x = align === 'left' ? rect.x : align === 'right' ? rect.x + rect.w : rect.x + rect.w / 2;
  const ox = align === 'left' ? 0 : align === 'right' ? 1 : 0.5;
  const t = scene.add
    .text(x, rect.y + rect.h / 2, value, {
      fontFamily: FONT,
      fontSize: `${baseSize}px`,
      color: o.color,
      fontStyle: o.weight ?? BODY_WEIGHT,
    })
    .setOrigin(ox, 0.5);
  if (o.strokeW) t.setStroke(o.strokeColor ?? '#5a3210', o.strokeW);
  if (o.shadow) t.setShadow(2, 2, 'rgba(0,0,0,0.4)', 2, false, true);

  const best = fitFontSize(
    (size) => {
      t.setFontSize(size);
      return t.width;
    },
    baseSize,
    rect.w,
  );
  t.setFontSize(best);
  return t;
}
