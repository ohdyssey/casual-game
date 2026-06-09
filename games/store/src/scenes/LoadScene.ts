import Phaser from 'phaser';
import { STORE_ASSETS } from '../assets.js';
import { loadAudio } from '../audio.js';

/**
 * LoadScene — CG_ST_Loading 스플래시 + 동적 진행바.
 *   BootScene 이 스플래시 1장만 먼저 로드 → 여기서 나머지 에셋 전부 로드하며 진행바 연출 → HomeScene.
 *   진행바는 아트워크에 박힌 정적 75% 바를 동일 위치의 동적 알약바로 덮어 기능화.
 */
const GW = 720;
const GH = 1280;

// 박힌 진행바 위치(CG_ST_Loading.png 941×1672 픽셀분석 → 게임좌표 환산).
const BAR = { cx: GW / 2, cy: 1181, w: 512, h: 50, r: 25 } as const;

// 팔레트(아트워크 라임 톤).
const C_BORDER = 0x3f6b1e; // 짙은 녹 테두리
const C_TRACK = 0xe9f2d4;  // 빈 트랙(연한 라임크림)
const C_FILL = 0x9dd942;   // 채움 라임(아트워크 샘플값)
const C_GLOSS = 0xb6e85f;  // 상단 광택

const MIN_SPLASH_MS = 1000; // 진행바 채움 연출 시간(최소 노출)

export class LoadScene extends Phaser.Scene {
  private fillGfx?: Phaser.GameObjects.Graphics;
  private pctText?: Phaser.GameObjects.Text;

  constructor() {
    super('LoadScene');
  }

  preload(): void {
    // ── 스플래시(BootScene 에서 로드됨) 풀스크린 ──
    if (this.textures.exists('loading')) {
      this.add.image(GW / 2, GH / 2, 'loading').setDisplaySize(GW, GH);
    } else {
      this.cameras.main.setBackgroundColor('#F4C6CE');
    }

    // ── 진행바: 박힌 바를 덮는 트랙 ──
    const left = BAR.cx - BAR.w / 2;
    const top = BAR.cy - BAR.h / 2;
    const track = this.add.graphics();
    track.fillStyle(C_BORDER, 1);
    track.fillRoundedRect(left - 3, top - 3, BAR.w + 6, BAR.h + 6, BAR.r + 3);
    track.fillStyle(C_TRACK, 1);
    track.fillRoundedRect(left, top, BAR.w, BAR.h, BAR.r);

    this.fillGfx = this.add.graphics();
    this.pctText = this.add
      .text(BAR.cx, BAR.cy, '0%', { fontFamily: 'Jua, sans-serif', fontSize: '30px', color: '#3f6b1e' })
      .setOrigin(0.5);
    this.drawFill(0);

    // ── 나머지 에셋 전부 로드(스플래시 제외) ──
    for (const [key, path] of Object.entries(STORE_ASSETS)) {
      if (key === 'loading') continue;
      this.load.image(key, path);
    }
    // ── 오디오(SFX 20 + BGM) 프리로드 ──
    loadAudio(this);
  }

  create(): void {
    // 에셋은 preload 에서 이미 로드 완료 → 진행바를 부드럽게 0→100% 연출 후 전환.
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: MIN_SPLASH_MS,
      ease: 'Sine.easeInOut',
      onUpdate: (tw) => this.drawFill(tw.getValue() ?? 0),
      onComplete: () => {
        this.drawFill(1);
        this.scene.start('HomeScene');
      },
    });
  }

  /** 진행률 p(0~1)로 채움 + % 텍스트 갱신. */
  private drawFill(p: number): void {
    const g = this.fillGfx;
    if (!g) return;
    g.clear();
    const innerW = BAR.w - 8;
    const innerH = BAR.h - 8;
    const left = BAR.cx - BAR.w / 2 + 4;
    const top = BAR.cy - BAR.h / 2 + 4;
    const w = Math.max(0, Math.min(1, p)) * innerW;
    if (w > 3) {
      const fr = Math.max(1, Math.min((BAR.r - 2), w / 2, innerH / 2));
      g.fillStyle(C_FILL, 1);
      g.fillRoundedRect(left, top, w, innerH, fr);
      // 상단 광택
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
