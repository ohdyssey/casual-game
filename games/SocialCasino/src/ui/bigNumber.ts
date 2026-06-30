/**
 * bigNumber.ts — 대박(10배+) 코인 드랍 카운트업용 **큰 이미지 숫자**.
 *
 * 디자이너 골드 글리프(Num_01 0~9 + 기호 $/, — 베팅 숫자와 동일 세트)로 가로 배치·중앙 정렬.
 * **달러($) 접두 + 천단위 콤마**로 표기. 매 프레임 setValue 로 값이 바뀌어도 스프라이트를 풀로 재사용한다.
 *
 * 코인 드랍(금색) 위에서 금색 숫자가 묻히지 않게 **어두운 외곽**(살짝 큰 다크 실루엣)을 뒤에 깐다.
 *   외곽은 **별도 레이어(컨테이너 자식)** 라서 떨어지며 페이드아웃할 때 숫자와 **함께** 사라진다
 *   → 내려오면서 어둡게 남지 않는다(요청). (preFX 섀도는 컨테이너 알파를 안 따라가 잔상이 어둡게 남던 문제 회피.)
 */
import Phaser from 'phaser';
import { NUM_DIGIT_KEYS, NUM_DOLLAR_KEY, NUM_COMMA_KEY } from '../assets.js';

/** 외곽(다크 실루엣) 틴트 색 + 본체 대비 확대율·아래 오프셋. */
const SHADOW_TINT = 0x0c0500;
const SHADOW_SCALE = 1.08;
const SHADOW_DY = 4;

export class BigNumber {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly glyphH: number;
  private readonly gap: number;
  private readonly shadowLayer: Phaser.GameObjects.Container; // 어두운 외곽(뒤)
  private readonly mainLayer: Phaser.GameObjects.Container; // 골드 본체(앞)
  private readonly shadows: Phaser.GameObjects.Image[] = [];
  private readonly pool: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, glyphH: number, depth = 320) {
    this.scene = scene;
    this.glyphH = glyphH;
    this.gap = Math.round(glyphH * 0.03);
    this.shadowLayer = scene.add.container(0, 0);
    this.mainLayer = scene.add.container(0, 0);
    // 외곽 레이어 먼저 add → 본체보다 뒤에 렌더. 컨테이너 알파가 두 레이어에 모두 곱해져 함께 페이드.
    this.container = scene.add.container(x, y, [this.shadowLayer, this.mainLayer]).setDepth(depth);
  }

  /** 정수 값을 **$ + 천단위 콤마** 이미지 글리프(Num_01)로 렌더(중앙 정렬, 다크 외곽 포함). */
  setValue(n: number): void {
    const str = '$' + Math.max(0, Math.round(n)).toLocaleString('en-US');
    for (const im of this.pool) im.setVisible(false);
    for (const sh of this.shadows) sh.setVisible(false);

    const items: Array<{ img: Phaser.GameObjects.Image; sh: Phaser.GameObjects.Image; w: number }> = [];
    let pi = 0;
    for (const ch of str) {
      const key = ch === '$' ? NUM_DOLLAR_KEY : ch === ',' ? NUM_COMMA_KEY : NUM_DIGIT_KEYS[Number(ch)];
      if (!key) continue;
      let img = this.pool[pi];
      if (!img) {
        img = this.scene.add.image(0, 0, key);
        this.mainLayer.add(img);
        this.pool.push(img);
      }
      let sh = this.shadows[pi];
      if (!sh) {
        sh = this.scene.add.image(0, 0, key).setTint(SHADOW_TINT);
        this.shadowLayer.add(sh);
        this.shadows.push(sh);
      }
      img.setTexture(key).setVisible(true);
      sh.setTexture(key).setTint(SHADOW_TINT).setVisible(true);
      const aw = img.height > 0 ? img.width / img.height : 0.6; // 원본 비율로 폭 산출
      const w = Math.round(this.glyphH * aw);
      img.setDisplaySize(w, this.glyphH);
      sh.setDisplaySize(Math.round(w * SHADOW_SCALE), Math.round(this.glyphH * SHADOW_SCALE)); // 살짝 크게 = 외곽
      pi++;
      items.push({ img, sh, w });
    }

    const total = items.reduce((a, it) => a + it.w, 0) + this.gap * Math.max(0, items.length - 1);
    let x = -total / 2;
    for (const it of items) {
      const cx = x + it.w / 2;
      it.img.setPosition(cx, 0);
      it.sh.setPosition(cx, SHADOW_DY); // 본체 뒤, 살짝 아래(드롭 느낌 외곽)
      x += it.w + this.gap;
    }
  }

  setAlpha(a: number): this {
    this.container.setAlpha(a);
    return this;
  }
}
