/**
 * LoadScene — 에셋(아이템 24종 + 에디터 UI 매니페스트 + 레이아웃 JSON) 프리로드.
 * 폰트(Do Hyeon/Jua)는 캔버스 굳음 방지를 위해 씬 전환 전에 선로딩.
 */
import Phaser from 'phaser';
import { loadGameAssets, preloadKoreanFonts } from '../assets.js';

export class LoadScene extends Phaser.Scene {
  private percentText!: Phaser.GameObjects.Text;

  constructor() {
    super('load');
  }

  preload(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x2b1810);
    this.add
      .text(cx, cy - 60, '꼬치왕', { fontFamily: '"Jua", sans-serif', fontSize: '64px', color: '#ffc14d' })
      .setStroke('#7a2b16', 8)
      .setOrigin(0.5);
    this.percentText = this.add
      .text(cx, cy + 30, '굽는 중... 0%', { fontFamily: '"Jua", sans-serif', fontSize: '26px', color: '#ffe3b3' })
      .setOrigin(0.5);

    this.load.on('progress', (v: number) => {
      this.percentText.setText(`굽는 중... ${Math.round(v * 100)}%`);
    });

    this.load.json('ui_layout', 'ui/layouts/main.json');
    loadGameAssets(this);
  }

  create(): void {
    void (async () => {
      await preloadKoreanFonts();
      this.scene.start('grill');
    })();
  }
}
