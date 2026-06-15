/**
 * LoadScene — 에디터 레이아웃 이미지(배경/HUD/활) + 좀비 스프라이트 시트 프리로드,
 * 화살/혈흔 텍스처 생성, 좀비 워크 애니메이션 등록, 폰트 선로딩 후 Play 로 전환.
 */
import Phaser from 'phaser';
import {
  ensureGeneratedTextures,
  ensureZombieAnims,
  loadGameAssets,
  preloadKoreanFonts,
} from '../assets.js';
import { preloadAudio } from '../audio.js';

export class LoadScene extends Phaser.Scene {
  private percentText!: Phaser.GameObjects.Text;

  constructor() {
    super('load');
  }

  preload(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x12160f);
    this.add.text(cx, cy - 60, '🧟', { fontSize: '72px' }).setOrigin(0.5);
    this.add
      .text(cx, cy + 20, '좀비애로우러시', {
        fontFamily: '"Do Hyeon", "Jua", sans-serif',
        fontSize: '48px',
        color: '#74C13A',
      })
      .setOrigin(0.5);
    this.percentText = this.add
      .text(cx, cy + 90, '준비 중... 0%', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '24px',
        color: '#e8f5e9',
      })
      .setOrigin(0.5);

    this.load.on('progress', (v: number) => {
      this.percentText.setText(`준비 중... ${Math.round(v * 100)}%`);
    });

    loadGameAssets(this);
    void preloadAudio(); // m4a 사운드팩 백그라운드 디코드(비치명적)
  }

  create(): void {
    ensureGeneratedTextures(this);
    ensureZombieAnims(this);
    void (async () => {
      await preloadKoreanFonts();
      this.scene.start('play');
    })();
  }
}
