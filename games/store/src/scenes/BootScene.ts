import Phaser from 'phaser';
import { STORE_ASSETS } from '../assets.js';

/** BootScene — 스플래시 1장만 먼저 로드 후 LoadScene 으로(나머지 에셋은 LoadScene 이 진행바와 함께 로드). */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    // 로딩 화면 이미지부터(작고 빠름) — 이게 있어야 LoadScene 에서 스플래시를 그릴 수 있다.
    this.load.image('loading', STORE_ASSETS.loading);
  }

  create(): void {
    this.scene.start('LoadScene');
  }
}
