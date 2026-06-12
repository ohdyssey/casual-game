/**
 * LoadScene — 디자인 이미지(보트/노젓기 아틀라스) 프리로드 + 런타임 텍스처(물/파티클) 생성.
 * 폰트(Jua/Do Hyeon)는 캔버스 굳음 방지를 위해 씬 전환 전에 선로딩.
 */
import Phaser from 'phaser';
import { ensureGeneratedTextures, loadGameAssets, LOGO_KEY, preloadKoreanFonts } from '../assets.js';

export class LoadScene extends Phaser.Scene {
  private percentText!: Phaser.GameObjects.Text;

  constructor() {
    super('load');
  }

  preload(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x0e7fa8);
    // 드래곤비트 공식 로고 — BootScene 에서 선로딩됨 (640×480).
    const logo = this.add.image(cx, cy - 150, LOGO_KEY).setOrigin(0.5);
    logo.setScale(Math.min(1, (this.scale.width * 0.82) / logo.width));
    // 둥실 떠 있는 타이틀 모션.
    this.tweens.add({ targets: logo, y: cy - 162, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.percentText = this.add
      .text(cx, cy + 120, '준비 중... 0%', { fontFamily: '"Jua", sans-serif', fontSize: '26px', color: '#eafbff' })
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
      this.scene.start('race');
    })();
  }
}
