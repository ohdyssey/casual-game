import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    // TODO: 로딩 스플래시 이미지 추가 시 여기서 로드
    // this.load.image('loading', '/assets/bubblepong/BP_Loading.png');
  }

  create(): void {
    this.scene.start('LoadScene');
  }
}
