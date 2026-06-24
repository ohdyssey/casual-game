/**
 * bigNumber.ts — 대박(10배+) 코인 드랍 카운트업용 **큰 컬러 이미지 숫자**.
 *
 * 숫자(0~9)+천단위 콤마를 디자이너 컬러 글리프(Font_01 -2, 골드/레드 3D)로 가로 배치·중앙 정렬.
 * 매 프레임 setValue 로 값이 바뀌어도(차르르 카운트업) 스프라이트를 풀로 재사용한다.
 */
import Phaser from 'phaser';
import { BIGWIN_DIGIT_KEYS, BIGWIN_COMMA_KEY } from '../assets.js';

export class BigNumber {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly glyphH: number;
  private readonly gap: number;
  private readonly pool: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, glyphH: number, depth = 320) {
    this.scene = scene;
    this.glyphH = glyphH;
    this.gap = Math.round(glyphH * 0.03);
    this.container = scene.add.container(x, y).setDepth(depth);
  }

  /** 정수 값을 천단위 콤마 포함해 이미지 글리프로 렌더(중앙 정렬). */
  setValue(n: number): void {
    const str = Math.max(0, Math.round(n)).toLocaleString('en-US');
    for (const im of this.pool) im.setVisible(false);

    const items: Array<{ img: Phaser.GameObjects.Image; w: number }> = [];
    let pi = 0;
    for (const ch of str) {
      const key = ch === ',' ? BIGWIN_COMMA_KEY : BIGWIN_DIGIT_KEYS[Number(ch)];
      if (!key) continue;
      let img = this.pool[pi];
      if (!img) {
        img = this.scene.add.image(0, 0, key);
        this.container.add(img);
        this.pool.push(img);
      }
      img.setTexture(key).setVisible(true);
      const aw = img.height > 0 ? img.width / img.height : 0.6; // 원본 비율로 폭 산출
      const w = Math.round(this.glyphH * aw);
      img.setDisplaySize(w, this.glyphH);
      pi++;
      items.push({ img, w });
    }

    const total = items.reduce((a, it) => a + it.w, 0) + this.gap * Math.max(0, items.length - 1);
    let x = -total / 2;
    for (const it of items) {
      it.img.x = x + it.w / 2;
      it.img.y = 0;
      x += it.w + this.gap;
    }
  }

  setAlpha(a: number): this {
    this.container.setAlpha(a);
    return this;
  }
}
