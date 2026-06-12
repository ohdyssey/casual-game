import Phaser from 'phaser';
import { Sfx } from '../audio/Sfx.js';

const GW = 720;
const GH = 1280;

export class HomeScene extends Phaser.Scene {
  constructor() { super('HomeScene'); }

  create(): void {
    this.add.image(GW / 2, GH / 2, 'up_BubblePong_BG_01').setDisplaySize(GW, GH);

    const logo = this.add.image(GW / 2, GH * 0.30, 'up_BubblePong_Logo').setOrigin(0.5);
    // 원본 비율 유지, 가로 500px 기준으로 균일 스케일
    logo.setScale(500 / logo.width);

    const btn = this.add
      .text(GW / 2, GH * 0.62, '게임 시작', {
        fontFamily: 'Jua, sans-serif',
        fontSize: '52px',
        color: '#ffffff',
        backgroundColor: '#4BBFE6',
        padding: { x: 56, y: 22 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#2aa5d0' }));
    btn.on('pointerout',  () => btn.setStyle({ backgroundColor: '#4BBFE6' }));
    btn.on('pointerdown', () => {
      Sfx.unlock(); // 첫 사용자 제스처에서 오디오 활성화
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('GameScene');
      });
    });
  }
}
