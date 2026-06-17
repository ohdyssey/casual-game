/**
 * LoadScene — 에디터 레이아웃 이미지(배경/오리/HUD/샷건) 프리로드 + 런타임 텍스처(깃털/스파크) 생성.
 * 폰트(Jua/Do Hyeon)는 캔버스 굳음 방지를 위해 씬 전환 전에 선로딩.
 */
import Phaser from 'phaser';
import { ensureGeneratedTextures, loadGameAssets, preloadKoreanFonts } from '../assets.js';

export class LoadScene extends Phaser.Scene {
  private percentText!: Phaser.GameObjects.Text;

  constructor() {
    super('load');
  }

  preload(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x8fd3f4);

    // 로고(별도 제공 아트)를 우선 로드해 스플래시에 표시. 도착 전엔 이모지 폴백.
    const fallback = this.add.text(cx, cy - 40, '🦆', { fontSize: '96px' }).setOrigin(0.5);
    this.load.image('logo', 'logo.png');
    this.load.once('filecomplete-image-logo', () => {
      fallback.destroy();
      const logo = this.add.image(cx, cy - 40, 'logo').setOrigin(0.5).setDepth(2);
      const maxW = this.scale.width * 0.72;
      if (logo.width > maxW) logo.setScale(maxW / logo.width);
      this.tweens.add({ targets: logo, scale: logo.scale * 1.04, duration: 900, yoyo: true, repeat: -1 });
    });

    this.percentText = this.add
      .text(cx, cy + 200, '준비 중... 0%', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '24px',
        color: '#10425b',
      })
      .setOrigin(0.5);

    this.load.on('progress', (v: number) => {
      this.percentText.setText(`준비 중... ${Math.round(v * 100)}%`);
    });

    loadGameAssets(this);
  }

  create(): void {
    ensureGeneratedTextures(this);
    const startedAt = this.time.now;
    const MIN_SPLASH_MS = 1200; // 로고가 깜빡 지나가지 않도록 최소 노출.
    void (async () => {
      await preloadKoreanFonts();
      const elapsed = this.time.now - startedAt;
      const wait = Math.max(0, MIN_SPLASH_MS - elapsed);
      this.percentText.setText('준비 완료!');
      this.time.delayedCall(wait, () => this.scene.start('play'));
    })();
  }
}
