/**
 * LoadScene — 상품 이미지(제공 시) 프리로드 + 런타임 텍스처(셀/트럭) 생성.
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
    this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0xc8965a);
    this.add.text(cx, cy - 60, '🚚📦', { fontSize: '72px' }).setOrigin(0.5);
    this.add
      .text(cx, cy + 20, '배송대작전', {
        fontFamily: '"Do Hyeon", "Jua", sans-serif',
        fontSize: '52px',
        color: '#FFF6D8',
      })
      .setOrigin(0.5);
    this.percentText = this.add
      .text(cx, cy + 90, '준비 중... 0%', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '24px',
        color: '#fff6d8',
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
