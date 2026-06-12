/**
 * GrillView — 그릴 1칸의 정적 렌더링(본체/불판 점멸/석쇠/쟁반 미리보기/잠금).
 * 꼬치 스프라이트(이동 대상)는 GrillScene 이 소유한다. 좌표·크기는 에디터 디자인 값.
 *
 * 사용자 지정: 플레이 그릴은 그릴2(up_GK_UI_10-1), 그릴2-1(붉은 불판)은 알파 점멸,
 * 그 위에 그릴2-2(석쇠). 잠금 그릴은 그릴3(up_GK_UI_09).
 */
import Phaser from 'phaser';
import { itemKey } from '../assets.js';
import type { ItemType } from '../logic/types.js';

export const GRILL_BODY_KEY = 'up_GK_UI_10-1';
export const GRILL_GRATE_KEY = 'up_GK_UI_10-2_v2';
export const GRILL_LOCKED_KEY = 'up_GK_UI_09';

/** 에디터 그릴2 노드에서 추출한 상대 오프셋. */
const BODY_W = 198;
const BODY_H = 170;
const FIRE_DY = -22;
const FIRE_W = 146;
const FIRE_H = 74;
const FIRE_RADIUS = 42;
const GRATE_DY = -25;
const GRATE_W = 201;
const GRATE_H = 91;
export const SLOT_DX = [-55, 0, 56] as const;
export const SLOT_DY = -28;
export const SKEWER_W = 52;
export const SKEWER_H = 110;
const TRAY_DX = [-39, 0, 40] as const;
const TRAY_DY = 58;
const TRAY_ITEM_W = 28;
const TRAY_ITEM_H = 60;
const TRAY_ANGLE = 15;

const DEPTH_BODY = 30;
const DEPTH_FIRE = 31;
const DEPTH_GRATE = 32;
const DEPTH_TRAY = 33;

const LOCK_TEXT_STYLE = { fontFamily: '"Do Hyeon", "Jua", sans-serif', color: '#ffffff', align: 'center' } as const;

export class GrillView {
  private readonly body: Phaser.GameObjects.Image;
  private fire?: Phaser.GameObjects.Graphics;
  private fireTween?: Phaser.Tweens.Tween;
  private trayItems: Phaser.GameObjects.Image[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    readonly id: number,
    readonly x: number,
    readonly y: number,
    readonly locked: boolean,
  ) {
    if (locked) {
      this.body = scene.add.image(x, y, GRILL_LOCKED_KEY).setDisplaySize(BODY_W, 172).setDepth(DEPTH_BODY);
      scene.add
        .text(x, y + 10, '잠금해제', { ...LOCK_TEXT_STYLE, fontSize: '22px' })
        .setStroke('#5a3210', 4)
        .setOrigin(0.5)
        .setDepth(DEPTH_GRATE);
      scene.add
        .text(x, y + 36, 'Lv 30', { ...LOCK_TEXT_STYLE, fontSize: '20px' })
        .setStroke('#5a3210', 4)
        .setOrigin(0.5)
        .setDepth(DEPTH_GRATE);
      return;
    }

    this.body = scene.add.image(x, y, GRILL_BODY_KEY).setDisplaySize(BODY_W, BODY_H).setDepth(DEPTH_BODY);

    // 그릴2-1 — 불판. 붉은 라운드 렉트가 일렁이며 점멸(요구사항).
    this.fire = scene.add.graphics({ x: x - FIRE_W / 2, y: y + FIRE_DY - FIRE_H / 2 }).setDepth(DEPTH_FIRE);
    this.fire.fillStyle(0xee1717, 1);
    this.fire.fillRoundedRect(0, 0, FIRE_W, FIRE_H, FIRE_RADIUS / 2);
    this.fire.setAlpha(0.08);
    this.fireTween = scene.tweens.add({
      targets: this.fire,
      alpha: { from: 0.08, to: 0.38 },
      duration: 650 + (id % 3) * 90,
      delay: id * 110,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    scene.add.image(x, y + GRATE_DY, GRILL_GRATE_KEY).setDisplaySize(GRATE_W, GRATE_H).setDepth(DEPTH_GRATE);
  }

  /** 슬롯의 월드 좌표. */
  slotPos(slot: number): { x: number; y: number } {
    return { x: this.x + SLOT_DX[slot], y: this.y + SLOT_DY };
  }

  /** 쟁반 미리보기 좌표(리필 애니메이션 출발점). */
  trayPos(idx: number): { x: number; y: number } {
    return { x: this.x + TRAY_DX[Math.min(idx, 2)], y: this.y + TRAY_DY };
  }

  /** 쟁반 미리보기 갱신 — 큐 앞 3개를 작게 표시. */
  setQueuePreview(queue: ReadonlyArray<ItemType>): void {
    for (const s of this.trayItems) s.destroy();
    this.trayItems = [];
    if (this.locked) return;
    queue.slice(0, 3).forEach((t, i) => {
      const p = this.trayPos(i);
      const img = this.scene.add
        .image(p.x, p.y, itemKey(t))
        .setDisplaySize(TRAY_ITEM_W, TRAY_ITEM_H)
        .setAngle(TRAY_ANGLE)
        .setDepth(DEPTH_TRAY);
      this.trayItems.push(img);
    });
  }

  /** 드래그 오버 하이라이트. */
  setHighlight(on: boolean): void {
    if (this.locked) return;
    if (on) this.body.setTint(0xffd9a0);
    else this.body.clearTint();
  }

  /** 매치 순간 불판 화력 burst. */
  sizzleBurst(): void {
    if (!this.fire) return;
    this.fireTween?.pause();
    this.scene.tweens.add({
      targets: this.fire,
      alpha: { from: 0.85, to: 0.12 },
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => this.fireTween?.resume(),
    });
  }

  /** 포인터가 이 그릴 히트영역(본체+쟁반) 안인가. */
  contains(px: number, py: number): boolean {
    return Math.abs(px - this.x) <= BODY_W / 2 + 12 && Math.abs(py - this.y) <= BODY_H / 2 + 26;
  }
}
