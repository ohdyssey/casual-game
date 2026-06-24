/**
 * confetti.ts — 대박(10배+) 축포(색종이) 연출.
 *
 * 화면 전체에 색종이가 쏟아진다. **배경 위·다른 모든 레이어 아래**(depth 1.5)에 깔려, 게임 UI 를 가리지 않고
 * 배경(하늘)·여백에서 흩날린다(요청). 단일 파티클 이미터(GPU 배치·풀링)라 런타임 비용이 매우 낮다.
 */
import Phaser from 'phaser';

const TEX = 'sc_confetti';
/** 색종이 색상(틴트 랜덤). */
const COLORS = [0xff5d5d, 0xffd23f, 0x4fd1ff, 0x76e36a, 0xff7ad6, 0xa98bff, 0xffffff, 0xff9f43];

export class Confetti {
  private readonly scene: Phaser.Scene;
  private readonly w: number;
  private readonly h: number;
  private readonly depth: number;

  constructor(scene: Phaser.Scene, width: number, height: number, depth = 1.5) {
    this.scene = scene;
    this.w = width;
    this.h = height;
    this.depth = depth;
    this.ensureTex();
  }

  /** 화면 상단 전폭에서 색종이가 쏟아져 내린다(중력 낙하 + 회전). 더 길게(3.3초 방출 + 긴 수명). */
  burst(): void {
    if (!this.scene.textures.exists(TEX)) return;
    const DURATION = 3300; // 방출 시간(요청: 더 길게)
    const LIFE_MAX = 4200; // 입자 수명 상한
    const emitter = this.scene.add.particles(0, 0, TEX, {
      x: { min: 0, max: this.w },
      y: { min: -60, max: this.h * 0.12 },
      lifespan: { min: 2600, max: LIFE_MAX },
      speedY: { min: 200, max: 520 },
      speedX: { min: -200, max: 200 },
      gravityY: 340,
      scale: { min: 0.5, max: 1.2 },
      rotate: { min: 0, max: 360 },
      tint: COLORS,
      alpha: { start: 1, end: 0.8 },
      frequency: 28, // ms — 방출 간격↑·수량↓ 로 더 길어도 동시 입자 수는 비슷(~280, GPU 배치라 가벼움)
      quantity: 2,
      duration: DURATION, // 이 시간만 방출(이후 입자는 수명까지 낙하)
    });
    emitter.setDepth(this.depth);
    this.scene.time.delayedCall(DURATION + LIFE_MAX + 100, () => emitter.destroy());
  }

  private ensureTex(): void {
    if (this.scene.textures.exists(TEX)) return;
    const g = this.scene.make.graphics({}, false);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(0, 0, 22, 13, 3); // 색종이 한 조각(흰색 → 입자별 틴트)
    g.generateTexture(TEX, 22, 13);
    g.destroy();
  }
}
