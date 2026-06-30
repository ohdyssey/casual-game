/**
 * HomeScene — phaser-ui-editor 로 디자인한 메인 화면(public/ui/layouts/main.json)을 그대로 렌더한다.
 * 에디터 레이아웃이 단일 진실 공급원(SSOT): 코드는 동적 동작(둥실 모션 + 탭하여 시작)만 얹는다.
 *
 * 에디터 레이아웃은 인게임 HUD 한 장(전용 타이틀/START 버튼 없음)이라, 살아있는 프리뷰로 쓰고
 * 화면 어디든 탭/아무 키로 레이스를 시작한다. 디자인 720×1280 → 캔버스(designHeight 고정 시 1:1).
 * 레이아웃/업로드/스프라이트 텍스처는 LoadScene 의 loadGameAssets 가 이미 프리로드해 둠.
 */
import Phaser from 'phaser';
import { startBgm, sfx } from '../audio.js';
import { UI_LAYOUT_KEY } from '../assets.js';
import { buildLayout, type LayoutDoc, type LayoutIndex } from '../ui/layoutLoader.js';
import { fillCoverLayout } from '@casual/core';

/** 중앙 캐릭터(춤/노젓기)/보트 — 둥실 모션 대상(타이틀이 살아있는 느낌). */
const FLOAT_NODES = ['layer_2', 'layer_3', 'layer_2_copy'] as const;
const PROMPT_DEPTH = 2000;

export class HomeScene extends Phaser.Scene {
  private started = false;

  constructor() {
    super('home');
  }

  create(): void {
    this.started = false;
    const doc = this.cache.json.get(UI_LAYOUT_KEY) as LayoutDoc | undefined;
    // 레이아웃이 없으면(에디터 미산출) 바로 레이스로 폴백 — 게임 진행을 막지 않는다.
    if (!doc || !doc.nodes?.length) {
      this.scene.start('race');
      return;
    }

    const layout = buildLayout(this, doc);
    // 반응형 — 창 높이로 채우고 배경 cover + 메뉴 요소 세로 중앙(FIT 레터박스 제거).
    const h = fillCoverLayout(this, layout, { centerMiddle: true });
    const offsetY = Math.max(0, (h - doc.frame.designH) / 2);

    this.addIdleMotion(layout);
    this.showStartPrompt(offsetY);

    // 전용 START 버튼이 없는 인게임 레이아웃 — 화면 어디든 탭/아무 키로 레이스 시작.
    this.input.once('pointerdown', () => {
      startBgm();
      this.launch();
    });
    this.input.keyboard?.once('keydown', () => this.launch());
  }

  /** 캐릭터/보트 둥실 모션(타이틀이 살아있는 느낌). 클립 캐릭터는 컨테이너 y 만 움직여 클립 트랜스폼과 무관. */
  private addIdleMotion(layout: LayoutIndex): void {
    for (const id of FLOAT_NODES) {
      const obj = layout.tryById(id);
      if (!obj) continue;
      this.tweens.add({
        targets: obj,
        y: obj.y - 10,
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  /** '탭하여 시작' 안내 — 화면이 인터랙티브함을 알린다(중앙 상부, 보트 위 빈 영역). */
  private showStartPrompt(offsetY: number): void {
    const W = this.scale.width;
    const prompt = this.add
      .text(W / 2, 540 + offsetY, '탭하여 시작!', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '36px',
        color: '#eafbff',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(PROMPT_DEPTH);
    prompt.setStroke('#0a3a52', 8);
    this.tweens.add({
      targets: prompt,
      alpha: { from: 1, to: 0.3 },
      duration: 650,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** 레이스로 전환 — 페이드 아웃 후 1회만. */
  private launch(): void {
    if (this.started) return;
    this.started = true;
    startBgm();
    sfx('horn');
    this.cameras.main.fadeOut(260, 14, 127, 168); // #0E7FA8 테마색
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('race');
    });
  }
}
