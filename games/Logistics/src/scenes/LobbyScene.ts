/**
 * LobbyScene — 로비(시작) 화면. 에디터 ui/layouts/blank_2.json 을 SSOT 로 렌더.
 *
 * 배경 + 여자 캐릭터(spriteDocClip 자동재생) + [시작하기] 버튼 + 하단 네비(상점/배송패스/홈/보상/설정)
 * + 좌상단 프로필/레벨. [시작하기] 탭 → 본편(play) 진입. 네비는 현재 탭 피드백만(추후 화면 연결).
 *
 * 버튼 탭/맥동 연출은 **버튼 이미지 + 그 위 텍스트를 함께**(비율 유지) 키운다. 텍스트는 고DPI 에서
 * 흐려지지 않게 makeText 가 setResolution 처리(layoutLoader). 화면은 고정 1080×2400(세로 HD) + FIT 1:1.
 */
import Phaser from 'phaser';
import { loadProfile } from '@casual/core';
import { buildLayout, textResolution, type LayoutDoc, type LayoutIndex, type LayoutObject } from '../ui/layoutLoader.js';
import { LOBBY_LAYOUT_KEY } from '../assets.js';
import { sfx, startAudio } from '../audio.js';

const W = 1080; // 세로 HD 디자인 폭(에디터 1080×2400)

// 하단 네비: [아이콘 노드, 라벨 텍스트 노드] — 탭 시 둘을 함께 통통.
const NAV_PAIRS: ReadonlyArray<[string, string]> = [
  ['layer_4', 'layer_6_copy'], // 상점
  ['layer_4_copy', 'layer_6_copy2'], // 배송패스
  ['layer_4_copy2', 'layer_6_copy3'], // 홈
  ['layer_4_copy3', 'layer_6_copy4'], // 보상
  ['layer_4_copy4', 'layer_6_copy5'], // 설정
];

export class LobbyScene extends Phaser.Scene {
  private layout!: LayoutIndex;

  constructor() {
    super('lobby');
  }

  create(): void {
    this.tweens.killAll();
    const profile = loadProfile();
    const level = Math.max(1, profile.level);

    const doc = this.cache.json.get(LOBBY_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!doc) {
      this.add
        .text(W / 2, 1100, '로비 로드 실패', { fontFamily: '"Jua"', fontSize: '28px', color: '#fff' })
        .setOrigin(0.5)
        .setResolution(textResolution());
      this.makeStartButton(W / 2, 1926, 589, 181, []);
      return;
    }
    this.layout = buildLayout(this, doc);

    // 레벨(별표 안 숫자) / 스테이지(버튼 아래 중앙) 표시.
    this.layout.tryById<Phaser.GameObjects.Text>('layer_8')?.setText(String(level));
    const stage = this.layout.tryById<Phaser.GameObjects.Text>('layer_6');
    const startNode = this.layout.nodeById('layer_3');
    if (stage) {
      stage.setText(`스테이지 ${level}`).setOrigin(0.5, 0.5).setAlign('center');
      stage.setX(startNode?.x ?? W / 2); // 시작 버튼 정중앙 아래로 정렬
    }

    // 시작 버튼(이미지 + "시작하기" 텍스트) — 함께 맥동 + 탭 시 함께 눌림.
    const startGroup = [this.layout.tryById('layer_3'), this.layout.tryById('layer_5')].filter(
      (o): o is LayoutObject => !!o,
    );
    if (startGroup.length) this.pulseLoop(startGroup, 1.05, 760);
    this.makeStartButton(startNode?.x ?? W / 2, startNode?.y ?? 1926, startNode?.w ?? 589, startNode?.h ?? 181, startGroup);

    // 하단 네비 — 탭 시 [아이콘 + 라벨]을 함께 통통(피드백). 화면 연결은 추후.
    for (const [iconId, labelId] of NAV_PAIRS) {
      const icon = this.layout.tryById(iconId);
      if (!icon) continue;
      const grp = [icon, this.layout.tryById(labelId)].filter((o): o is LayoutObject => !!o);
      (icon as Phaser.GameObjects.Image).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        startAudio();
        sfx('ui_tap', { volume: 0.5 });
        this.pulseOnce(grp, 1.18, 110);
      });
    }
  }

  /** 시작 버튼 히트영역 — 탭 시 [버튼+텍스트] 함께 눌림 → 본편(play)으로 전환(짧은 페이드). */
  private makeStartButton(x: number, y: number, w: number, h: number, group: LayoutObject[]): void {
    let started = false;
    this.add
      .rectangle(x, y, w, h, 0x000000, 0.001)
      .setDepth(100)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (started) return;
        started = true;
        startAudio();
        sfx('ui_tap', { volume: 0.7 });
        this.pulseOnce(group, 0.92, 90); // 살짝 눌리는 느낌(이미지+텍스트 함께)
        this.cameras.main.fadeOut(240, 0, 0, 0);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('play'));
      });
  }

  /** 여러 오브젝트를 각자 base 비율 기준으로 한 번 통통(yoyo). 텍스트/이미지 base 가 달라도 비율 유지. */
  private pulseOnce(objs: LayoutObject[], factor: number, duration: number): void {
    if (!objs.length) return;
    this.tweens.killTweensOf(objs);
    const bases = objs.map((o) => o.scale);
    const p = { t: 0 };
    this.tweens.add({
      targets: p,
      t: 1,
      duration,
      yoyo: true,
      ease: 'Sine.easeInOut',
      onUpdate: () => objs.forEach((o, i) => o.setScale(bases[i] * (1 + (factor - 1) * p.t))),
      onComplete: () => objs.forEach((o, i) => o.setScale(bases[i])),
    });
  }

  /** 여러 오브젝트를 비율 유지로 무한 맥동. */
  private pulseLoop(objs: LayoutObject[], factor: number, duration: number): void {
    if (!objs.length) return;
    const bases = objs.map((o) => o.scale);
    const p = { t: 0 };
    this.tweens.add({
      targets: p,
      t: 1,
      duration,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => objs.forEach((o, i) => o.setScale(bases[i] * (1 + (factor - 1) * p.t))),
    });
  }
}
