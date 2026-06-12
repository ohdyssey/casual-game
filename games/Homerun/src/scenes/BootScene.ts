/** BootScene — 로고만 선로딩 후 로드 씬으로 전환(로딩 화면에서 로고를 보여주기 위함). */
import Phaser from 'phaser';
import { LOGO_KEY } from '../assets.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    this.load.image(LOGO_KEY, 'assets/logo.png');
  }

  create(): void {
    this.scene.start('load');
  }
}
