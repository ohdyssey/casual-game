import Phaser from 'phaser';
import { BP_ASSETS } from '../assets.js';

const GW = 720;
const GH = 1280;

const BAR = { cx: GW / 2, cy: GH * 0.88, w: 512, h: 50, r: 25 } as const;
const C_BORDER = 0x1a6b8a;
const C_TRACK  = 0xd4f0fb;
const C_FILL   = 0x4bbfe6;
const C_GLOSS  = 0x7dd8f0;

export class LoadScene extends Phaser.Scene {
  private fillGfx?: Phaser.GameObjects.Graphics;
  private pctText?: Phaser.GameObjects.Text;

  constructor() { super('LoadScene'); }

  preload(): void {
    this.cameras.main.setBackgroundColor('#B8E8F5');

    const left = BAR.cx - BAR.w / 2;
    const top  = BAR.cy - BAR.h / 2;
    const track = this.add.graphics();
    track.fillStyle(C_BORDER, 1);
    track.fillRoundedRect(left - 3, top - 3, BAR.w + 6, BAR.h + 6, BAR.r + 3);
    track.fillStyle(C_TRACK, 1);
    track.fillRoundedRect(left, top, BAR.w, BAR.h, BAR.r);

    this.fillGfx = this.add.graphics();
    this.pctText = this.add
      .text(BAR.cx, BAR.cy, '0%', {
        fontFamily: '"Russo One", sans-serif',
        fontSize: '30px',
        color: '#1a6b8a',
      })
      .setOrigin(0.5);
    this.drawFill(0);

    this.load.on('progress', (v: number) => this.drawFill(v));

    // 모든 게임 에셋 로드
    for (const [key, path] of Object.entries(BP_ASSETS)) {
      this.load.image(key, path);
    }
  }

  create(): void {
    this.drawFill(1);
    this.scene.start('HomeScene');
  }

  private drawFill(p: number): void {
    const g = this.fillGfx;
    if (!g) return;
    g.clear();
    const innerW = BAR.w - 8;
    const innerH = BAR.h - 8;
    const left   = BAR.cx - BAR.w / 2 + 4;
    const top    = BAR.cy - BAR.h / 2 + 4;
    const w = Math.max(0, Math.min(1, p)) * innerW;
    if (w > 3) {
      const fr = Math.max(1, Math.min(BAR.r - 2, w / 2, innerH / 2));
      g.fillStyle(C_FILL, 1);
      g.fillRoundedRect(left, top, w, innerH, fr);
      const glossW = Math.max(0, w - 4);
      if (glossW > 3) {
        const gr = Math.max(1, Math.min(fr, glossW / 2, (innerH * 0.4) / 2));
        g.fillStyle(C_GLOSS, 0.7);
        g.fillRoundedRect(left + 2, top + 2, glossW, innerH * 0.4, gr);
      }
    }
    this.pctText?.setText(`${Math.round(Math.min(1, Math.max(0, p)) * 100)}%`);
  }
}
