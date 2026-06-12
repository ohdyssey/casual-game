/** BootScene — 즉시 로드 씬으로 전환(셸 부팅 후 첫 씬). */
import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    this.scene.start('load');
  }
}
