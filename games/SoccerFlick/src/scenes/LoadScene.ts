/**
 * LoadScene — 에디터 레이아웃 이미지(필드/골대/헤더/HUD/말·공/파워업) 프리로드 +
 * 런타임 텍스처(조준점/그림자/스파크) 생성. 폰트 선로딩 후 Play 로 전환.
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
    this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x14532d);
    this.add.text(cx, cy - 60, '⚽', { fontSize: '72px' }).setOrigin(0.5);
    this.add
      .text(cx, cy + 20, '사커플릭', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '52px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.percentText = this.add
      .text(cx, cy + 90, '준비 중... 0%', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '24px',
        color: '#cfe8d6',
      })
      .setOrigin(0.5);

    this.load.on('progress', (v: number) => {
      this.percentText.setText(`준비 중... ${Math.round(v * 100)}%`);
    });

    loadGameAssets(this);
  }

  create(): void {
    ensureGeneratedTextures(this);
    void (async () => {
      await preloadKoreanFonts();
      this.scene.start('play');
    })();
  }
}
