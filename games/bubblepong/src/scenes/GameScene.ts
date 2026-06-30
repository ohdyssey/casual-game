import Phaser from 'phaser';
import { bubbleKey } from '../assets.js';
import { Effects, tintForColor } from '../effects/Effects.js';
import { Sfx } from '../audio/Sfx.js';
import {
  type Color,
  type BubbleColor,
  type Grid,
  BOMB_COLOR,
  RAINBOW_COLOR,
  MAX_GAME_ROW,
  START_COLOR_COUNT,
  colsForRow,
  randomColor,
  initGrid,
  colorsInGrid,
  getNeighbors,
  findConnected,
  findFloatingBubbles,
  addBubble,
  removeCells,
} from '../logic/bubbleGrid.js';
import { advanceWithReflection, type ReflectBounds } from '../logic/reflect.js';
import { nearestEmptyNeighbor } from '../logic/landing.js';

/**
 * 발사 큐 색상 — 10% 폭탄, 5% 무지개, 85% 일반.
 * 일반 색상은 가능하면 '현재 보드에 남아있는 색'에서만 뽑아(palette),
 * 매치 불가능한 죽은 색이 큐에 나오지 않게 한다 → 초반 난이도 완화.
 */
function randomBubbleColor(palette?: readonly Color[]): BubbleColor {
  const r = Math.random();
  if (r < 0.10) return BOMB_COLOR;
  if (r < 0.15) return RAINBOW_COLOR;
  if (palette && palette.length > 0) {
    return palette[Math.floor(Math.random() * palette.length)];
  }
  return randomColor();
}

// ── 레이아웃 상수 ────────────────────────────────────────────────────────────
// 그리드가 720 폭을 꽉 채우도록 10/9열 배치 + 좌우 30px 대칭 여백.
//   짝수행 10열: 63 + col*66 → 63..657 (가장자리 30..690)
//   홀수행  9열: 96 + col*66 → 96..624
const GW          = 720;
const COL_SPACING = 66;
const ROW_SPACING = 57;
const EVEN_START_X = 63;   // 짝수행 col0 중심 (가장자리 30px)
const ODD_START_X  = 96;   // 홀수행 col0 중심 (= EVEN_START_X + 반칸 33)
const GRID_TOP_Y   = 135;
const BUBBLE_DISPLAY = 66;
const BUBBLE_R       = 33;
const LAUNCH_X       = 365;
const LAUNCH_Y       = 877;
const SHOOT_SPEED    = 900; // px/s
/**
 * 공 '중심'이 거울 반사되는 좌/우 벽 = 화면(배경) 양 끝.
 *
 * 공 가장자리가 배경 끝(x=0 / x=720)에 닿는 순간 튕긴다(= 중심이 반지름만큼 안쪽,
 * 33 / 687). 10열 그리드는 양끝 30px 여백을 두지만, 반사 후 공은 곧바로 안쪽(열
 * 방향)으로 이동하며 버블에 닿으므로 그 작은 여백에서 멈춰 어긋나는 일은 없다.
 */
const WALL_BOUNDS: ReflectBounds = { left: BUBBLE_R, right: GW - BUBBLE_R };
/**
 * 총알 이동 서브스텝(px). 프레임 시간을 8px 단위로 쪼개 이동시켜
 * 프레임 드랍 시에도 터널링·"벽반사+충돌 동시 발생"으로 인한
 * 오배치가 생기지 않게 한다. 조준선 예측도 동일 스텝을 사용.
 */
const MOVE_STEP      = 8;

type GameState = 'aiming' | 'shooting' | 'settling';

// ── 좌표 유틸 ────────────────────────────────────────────────────────────────
function cellToWorld(row: number, col: number): { x: number; y: number } {
  return {
    x: (row % 2 === 0 ? EVEN_START_X : ODD_START_X) + col * COL_SPACING,
    y: GRID_TOP_Y + row * ROW_SPACING,
  };
}


// ── 씬 ───────────────────────────────────────────────────────────────────────
export class GameScene extends Phaser.Scene {
  private grid: Grid = initGrid();
  private gridSprites = new Map<string, Phaser.GameObjects.Image>();
  private aimGfx!: Phaser.GameObjects.Graphics;
  private bulletSprite!: Phaser.GameObjects.Image;
  private currentColorImg!: Phaser.GameObjects.Image;
  private nextColorImg!: Phaser.GameObjects.Image;
  private shotText!: Phaser.GameObjects.Text;
  private currentColor: BubbleColor = randomBubbleColor();
  private nextColor: BubbleColor    = randomBubbleColor();
  private shotsLeft = 25;
  private bvx = 0;
  private bvy = 0;
  private state: GameState = 'aiming';
  private isPointerDown = false;
  private fx!: Effects;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private gameEnded = false;
  /** 이번 프레임에 소진하지 못한 이동 거리(px) — 서브스텝 잔여분 이월 */
  private moveBudget = 0;
  // 특수 버블 시각 마커 정리 핸들 (현재/다음 슬롯·총알)
  private currentDecorCleanup: () => void = () => {};
  private nextDecorCleanup: () => void = () => {};
  private bulletDecorCleanup: () => void = () => {};

  constructor() { super('GameScene'); }

  // ── create ─────────────────────────────────────────────────────────────────
  create(): void {
    // scene.restart() 시 클래스 프로퍼티가 유지되므로 명시적 초기화
    this.grid         = initGrid(START_COLOR_COUNT);
    this.gridSprites  = new Map();
    this.shotsLeft    = 25;
    this.currentColor = this.queueColor();
    this.nextColor    = this.queueColor();
    this.state        = 'aiming';
    this.isPointerDown = false;
    this.bvx = 0;
    this.bvy = 0;
    this.moveBudget = 0;
    this.gameEnded = false;
    // scene.restart() 시 프로퍼티가 유지되므로 정리 핸들을 no-op 으로 재설정
    // (이전 씬의 객체를 참조하는 옛 클로저는 호출하지 않음)
    this.currentDecorCleanup = () => {};
    this.nextDecorCleanup    = () => {};
    this.bulletDecorCleanup  = () => {};

    // 이펙트 시스템 초기화 (파티클 텍스처 프리빌드)
    Effects.createTextures(this);
    this.fx = new Effects(this);

    this.cameras.main.fadeIn(200);

    // 배경
    this.add.image(GW / 2, 640, 'up_BubblePong_BG_01').setDisplaySize(GW, 1280).setDepth(1);

    // 상단 헤더
    this.add.image(360, 51,  'up_BubblePong_UI_10')     .setDisplaySize(721, 103).setDepth(2);
    this.add.image(97,  50,  'up_BubblePong_header_01') .setDisplaySize(103, 75) .setDepth(7);
    this.add.image(307, 52,  'up_BubblePong_header_02') .setDisplaySize(285, 81) .setDepth(6);
    this.add.image(537, 52,  'up_BubblePong_header_03') .setDisplaySize(145, 55) .setDepth(5);
    this.add.image(650, 50,  'up_BubblePong_header_05') .setDisplaySize(50,  51) .setDepth(4);

    // 헤더 텍스트
    this.add.text(97, 26, 'Level', this.textStyle(19, '"Russo One"', '#9777fa')).setOrigin(0.5).setDepth(12);
    this.add.text(97, 59, '1',     this.textStyle(35, '"Russo One"', '#9777fa')).setOrigin(0.5).setDepth(13);

    // 하단 패널
    this.add.image(360, 1204, 'up_BubblePong_UI_09').setDisplaySize(723, 155).setDepth(3);
    this.add.image(365, 923,  'up_BubblePong_UI_06').setDisplaySize(201, 239).setDepth(14);
    this.add.image(164, 976,  'up_BubblePong_UI_01').setDisplaySize(130, 110).setDepth(15);
    this.add.image(110, 1021, 'up_BubblePong_UI_08-1').setDisplaySize(85, 69).setDepth(16);

    // 샷 카운터
    this.add.text(164, 996, 'shot', this.textStyle(20, '"Russo One"', '#9777fa')).setOrigin(0.5).setDepth(17);
    this.shotText = this.add
      .text(164, 969, String(this.shotsLeft), this.textStyle(35, '"Russo One"', '#9777fa'))
      .setOrigin(0.5).setDepth(17);

    // 아이템 버튼 (장식용)
    this.add.image(220, 1176, 'up_BubblePong_UI_03').setDisplaySize(103, 105).setDepth(31);
    this.add.image(356, 1176, 'up_BubblePong_UI_04').setDisplaySize(103, 106).setDepth(30);
    this.add.image(493, 1176, 'up_BubblePong_UI_05').setDisplaySize(103, 106).setDepth(29);

    // 발사 버블 (현재 / 대기)
    this.currentColorImg = this.add
      .image(LAUNCH_X, LAUNCH_Y, bubbleKey(this.currentColor))
      .setDisplaySize(75, 75).setDepth(25);
    this.nextColorImg = this.add
      .image(LAUNCH_X, 994, bubbleKey(this.nextColor))
      .setDisplaySize(55, 55).setDepth(27);

    // 날아다니는 버블 (비활성 초기)
    this.bulletSprite = this.add
      .image(LAUNCH_X, LAUNCH_Y, bubbleKey(this.currentColor))
      .setDisplaySize(BUBBLE_DISPLAY, BUBBLE_DISPLAY)
      .setDepth(60).setVisible(false);

    // 발사체 글로우 트레일 (총알을 따라다님)
    this.trail = this.fx.createTrail();
    this.trail.startFollow(this.bulletSprite);

    // 대기 버블 부드러운 펄스
    this.tweens.add({
      targets: this.currentColorImg,
      scale: this.currentColorImg.scale * 1.08,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // 특수 버블(폭탄/무지개) 시각 마커
    this.currentDecorCleanup = this.decorateSpecial(this.currentColorImg, this.currentColor);
    this.nextDecorCleanup    = this.decorateSpecial(this.nextColorImg, this.nextColor);

    // 조준선 그래픽
    this.aimGfx = this.add.graphics().setDepth(50);

    // 초기 그리드 렌더링
    this.renderFullGrid();

    // 입력 이벤트
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup',   this.onPointerUp,   this);
  }

  // ── update ─────────────────────────────────────────────────────────────────
  update(_time: number, delta: number): void {
    if (this.state !== 'shooting') return;

    // 프레임 시간을 고정 서브스텝으로 분할.
    // 한 번에 속도×dt 만큼 점프하면 프레임 드랍 시 벽반사와 충돌이 같은
    // 프레임에 겹쳐 "반사 이전 위치"가 배치 기준이 되는 버그가 발생한다.
    this.moveBudget += SHOOT_SPEED * (delta / 1000);
    const wallTint = tintForColor(this.currentColor);

    while (this.moveBudget >= MOVE_STEP) {
      this.moveBudget -= MOVE_STEP;

      // 이 스텝 시작 위치 = 마지막으로 확인된 열린 공간 (배치 기준점)
      const openX = this.bulletSprite.x;
      const openY = this.bulletSprite.y;

      // 좌우 벽 거울 반사 — 조준선 예측(traceTrajectory)과 동일 함수 사용.
      const r = advanceWithReflection(
        openX, openY,
        this.bvx / SHOOT_SPEED, this.bvy / SHOOT_SPEED,
        MOVE_STEP, WALL_BOUNDS,
      );
      const nx = r.x;
      const ny = r.y;
      this.bvx = r.ux * SHOOT_SPEED;
      this.bvy = r.uy * SHOOT_SPEED;
      if (r.bounced) {
        this.fx.wallSpark(r.contactX, r.contactY, wallTint);
        Sfx.bounce();
      }

      this.bulletSprite.setPosition(nx, ny);

      // 상단 벽 도달
      if (ny <= GRID_TOP_Y) {
        this.onBulletLand(nx, GRID_TOP_Y, -1, -1);
        return;
      }

      // 그리드 버블 충돌 — 스텝 시작점(열린 공간, 접촉점에서 최대 8px)이 기준
      const hit = this.collisionAt(nx, ny);
      if (hit) {
        this.onBulletLand(openX, openY, hit.row, hit.col);
        return;
      }
    }
  }

  /** (x, y) 지점에서 충돌한 그리드 버블 — 가장 가까운 셀 반환 (없으면 null) */
  private collisionAt(x: number, y: number): { row: number; col: number } | null {
    const approxRow = Math.round((y - GRID_TOP_Y) / ROW_SPACING);
    let best: { row: number; col: number } | null = null;
    let bestDist = Infinity;
    for (let r = Math.max(0, approxRow - 1); r <= approxRow + 1; r++) {
      if (!this.grid[r]) continue;
      const maxC = colsForRow(r);
      for (let c = 0; c < maxC; c++) {
        if (!this.grid[r][c]) continue;
        const { x: cxp, y: cyp } = cellToWorld(r, c);
        const dist = Math.hypot(cxp - x, cyp - y);
        if (dist < BUBBLE_R * 2 && dist < bestDist) {
          bestDist = dist;
          best = { row: r, col: c };
        }
      }
    }
    return best;
  }

  // ── 포인터 이벤트 ───────────────────────────────────────────────────────────
  private onPointerDown(ptr: Phaser.Input.Pointer): void {
    Sfx.unlock(); // 자동재생 정책 — 첫 제스처에서 오디오 활성화
    if (this.state !== 'aiming' || ptr.y >= LAUNCH_Y) return;
    this.isPointerDown = true;
    this.drawAimLine(ptr.x, ptr.y);
  }

  private onPointerMove(ptr: Phaser.Input.Pointer): void {
    if (!this.isPointerDown || ptr.y >= LAUNCH_Y) return;
    this.drawAimLine(ptr.x, ptr.y);
  }

  private onPointerUp(ptr: Phaser.Input.Pointer): void {
    if (!this.isPointerDown) return;
    this.isPointerDown = false;
    this.aimGfx.clear();
    if (ptr.y >= LAUNCH_Y) return;
    this.shoot(ptr.x, ptr.y);
  }

  // ── 조준선 ─────────────────────────────────────────────────────────────────
  private drawAimLine(tx: number, ty: number): void {
    this.aimGfx.clear();
    const dx = tx - LAUNCH_X;
    const dy = ty - LAUNCH_Y;
    const len = Math.hypot(dx, dy);
    if (len < 10) return;

    // 실제 발사 물리와 동일한 궤적 추적 (그리드 충돌·천장에서 정지)
    const trace = this.traceTrajectory(dx / len, dy / len);

    // 특수 버블 조준선 색상
    const dotColor = this.currentColor === BOMB_COLOR    ? 0xff6633
                   : this.currentColor === RAINBOW_COLOR ? 0xffee55
                   : tintForColor(this.currentColor);

    const pts = trace.points;
    for (let i = 0; i < pts.length; i++) {
      const { x, y, bounce } = pts[i];
      const t = i / pts.length;
      if (bounce) {
        // 벽 반사 지점 마커
        this.aimGfx.fillStyle(dotColor, 0.9);
        this.aimGfx.fillCircle(x, y, 9);
      }
      // 거리에 따라 점감하는 글로우 점
      const fade = 0.7 * (1 - t * 0.6);
      const radius = 6 * (1 - t * 0.4);
      this.aimGfx.fillStyle(dotColor, fade * 0.4);
      this.aimGfx.fillCircle(x, y, radius + 3);
      this.aimGfx.fillStyle(0xffffff, fade);
      this.aimGfx.fillCircle(x, y, radius);
    }

    // 실제 착지 예상 셀에 타겟 레티클 (없으면 궤적 끝점)
    let rx: number;
    let ry: number;
    if (trace.land) {
      const w = cellToWorld(trace.land[0], trace.land[1]);
      rx = w.x; ry = w.y;
    } else if (pts.length > 0) {
      const last = pts[pts.length - 1];
      rx = last.x; ry = last.y;
    } else {
      return;
    }
    this.aimGfx.lineStyle(3, dotColor, 0.95);
    this.aimGfx.strokeCircle(rx, ry, BUBBLE_R);
    this.aimGfx.lineStyle(2, 0xffffff, 0.75);
    this.aimGfx.strokeCircle(rx, ry, BUBBLE_R - 6);
  }

  /**
   * 발사 궤적 시뮬레이션 — 실시간 물리(update)와 완전히 동일한
   * MOVE_STEP 서브스텝·연산 순서로 진행하므로 예측 착지 = 실제 착지.
   * @returns 표시용 점 목록(샘플링)과 예상 착지 셀
   */
  private traceTrajectory(
    ux: number, uy: number,
  ): { points: { x: number; y: number; bounce: boolean }[]; land: [number, number] | null } {
    const points: { x: number; y: number; bounce: boolean }[] = [];
    let vx = ux;
    let vy = uy;
    let px = LAUNCH_X;
    let py = LAUNCH_Y;

    for (let i = 0; i < 500; i++) {
      const openX = px;
      const openY = py;

      // 실시간 비행(update)과 완전히 동일한 거울 반사 스텝.
      const r = advanceWithReflection(px, py, vx, vy, MOVE_STEP, WALL_BOUNDS);
      px = r.x;
      py = r.y;
      vx = r.ux;
      vy = r.uy;
      const bounce = r.bounced;

      // 천장 도달 — update와 동일한 기준점·동일 착지 해석기
      if (py <= GRID_TOP_Y) {
        return { points, land: this.resolveLanding(px, GRID_TOP_Y, -1, -1) };
      }

      // 그리드 충돌 — update와 동일하게 스텝 시작점(열린 공간)·충돌 버블 기준
      const hit = this.collisionAt(px, py);
      if (hit) {
        return { points, land: this.resolveLanding(openX, openY, hit.row, hit.col) };
      }

      // 표시용 점: 24px 간격 샘플 + 벽 반사 지점
      if (bounce || i % 3 === 0) points.push({ x: px, y: py, bounce });
    }
    return { points, land: null };
  }

  // ── 발사 ───────────────────────────────────────────────────────────────────
  private shoot(tx: number, ty: number): void {
    if (this.shotsLeft <= 0) return;
    const dx = tx - LAUNCH_X;
    const dy = ty - LAUNCH_Y;
    const len = Math.hypot(dx, dy);
    this.bvx = (dx / len) * SHOOT_SPEED;
    this.bvy = (dy / len) * SHOOT_SPEED;

    this.bulletSprite
      .setTexture(bubbleKey(this.currentColor))
      .setPosition(LAUNCH_X, LAUNCH_Y)
      .setVisible(true);
    this.currentColorImg.setVisible(false);

    // 발사 슬롯 마커 해제 → 날아가는 총알로 이동
    this.currentDecorCleanup();
    this.currentDecorCleanup = () => {};
    this.bulletDecorCleanup = this.decorateSpecial(this.bulletSprite, this.currentColor);

    // 발사 머즐 플래시 + 트레일 ON + 사운드
    const tint = tintForColor(this.currentColor);
    this.fx.muzzleFlash(LAUNCH_X, LAUNCH_Y, tint);
    this.trail.setParticleTint(tint);
    this.trail.start();
    Sfx.shoot();

    this.shotsLeft--;
    this.shotText.setText(String(this.shotsLeft));
    this.state = 'shooting';
  }

  // ── 착지 처리 ──────────────────────────────────────────────────────────────
  private onBulletLand(bx: number, by: number, hitRow: number, hitCol: number): void {
    this.bulletSprite.setVisible(false);
    this.trail.stop();
    this.bulletDecorCleanup();
    this.bulletDecorCleanup = () => {};
    this.state = 'settling';

    const cell = this.resolveLanding(bx, by, hitRow, hitCol);
    if (!cell) { this.advance(); return; }

    const [lr, lc] = cell;
    if (lr >= MAX_GAME_ROW) { this.endGame(); return; }

    if (this.currentColor === BOMB_COLOR) {
      this.onBombLand(lr, lc);
    } else if (this.currentColor === RAINBOW_COLOR) {
      this.onRainbowLand(lr, lc, hitRow, hitCol);
    } else {
      this.grid = addBubble(this.grid, lr, lc, this.currentColor);
      this.placeSpriteAt(lr, lc, this.currentColor);
      this.checkMatchAndAdvance(lr, lc);
    }
  }

  /** 폭탄 버블 — 착지 위치 주변 반경 1 헥사곤 파괴 */
  private onBombLand(lr: number, lc: number): void {
    // 폭탄 스프라이트 잠깐 표시
    this.placeSpriteAt(lr, lc, BOMB_COLOR);

    this.time.delayedCall(80, () => {
      // 폭발 이펙트 + 사운드
      const { x, y } = cellToWorld(lr, lc);
      this.fx.bombBlast(x, y);
      Sfx.bomb();

      // 주변 + 자신 제거
      const targets: [number, number][] = [];
      for (const [nr, nc] of getNeighbors(lr, lc)) {
        if (nr >= 0 && nr <= MAX_GAME_ROW && nc >= 0 && nc < colsForRow(nr)
          && !this.isCellEmpty(nr, nc)) {
          targets.push([nr, nc]);
        }
      }
      targets.forEach(([r, c]) => this.popSpriteAt(r, c));
      this.popSpriteAt(lr, lc); // 폭탄 자신
      this.grid = removeCells(this.grid, targets);

      const floating = findFloatingBubbles(this.grid);
      if (floating.length > 0) {
        this.grid = removeCells(this.grid, floating);
        floating.forEach(([r, c]) => this.dropSpriteAt(r, c));
        Sfx.drop();
        this.time.delayedCall(400, () => this.advance());
      } else {
        this.time.delayedCall(220, () => this.advance());
      }
    });
  }

  /** 무지개 버블 — 맞은 버블의 색상으로 와일드카드 매치 */
  private onRainbowLand(lr: number, lc: number, hitRow: number, hitCol: number): void {
    let matchColor: Color;
    const hitCell = this.grid[hitRow]?.[hitCol];
    if (hitRow >= 0 && hitCell && hitCell >= 1 && hitCell <= 6) {
      matchColor = hitCell as Color;
    } else {
      // 상단 벽이나 인접 버블 없는 경우 — 이웃 중 가장 많은 색상,
      // 그마저 없으면 보드에 실재하는 색 중 하나(죽은 색 방지)
      matchColor = this.dominantNeighborColor(lr, lc)
        ?? colorsInGrid(this.grid)[0]
        ?? randomColor();
    }

    // 무지개 스프라이트 잠깐 표시 후 matchColor 로 전환
    this.placeSpriteAt(lr, lc, RAINBOW_COLOR);
    const { x: rx, y: ry } = cellToWorld(lr, lc);
    this.fx.rainbowBurst(rx, ry);
    Sfx.rainbow();
    this.time.delayedCall(60, () => {
      this.grid = addBubble(this.grid, lr, lc, matchColor);
      this.placeSpriteAt(lr, lc, matchColor);
      this.checkMatchAndAdvance(lr, lc);
    });
  }

  /** 이웃 중 가장 많이 등장하는 색상 */
  private dominantNeighborColor(row: number, col: number): Color | null {
    const counts = new Map<Color, number>();
    for (const [nr, nc] of getNeighbors(row, col)) {
      const c = this.grid[nr]?.[nc];
      if (c && c >= 1 && c <= 6) {
        const color = c as Color;
        counts.set(color, (counts.get(color) ?? 0) + 1);
      }
    }
    if (counts.size === 0) return null;
    return [...counts.entries()].reduce((a, b) => b[1] > a[1] ? b : a)[0];
  }

  /** 매치 판정 + 부유 버블 처리 + advance */
  private checkMatchAndAdvance(lr: number, lc: number): void {
    const matched = findConnected(this.grid, lr, lc);
    if (matched.length >= 3) {
      // 매치 클러스터 중심 좌표 → 콤보 팝업 + 색상 충격파
      const cx = matched.reduce((s, [r, c]) => s + cellToWorld(r, c).x, 0) / matched.length;
      const cy = matched.reduce((s, [r, c]) => s + cellToWorld(r, c).y, 0) / matched.length;
      const matchTint = tintForColor(this.grid[lr]?.[lc] ?? 1);
      this.fx.comboPopup(cx, cy, matched.length);
      this.fx.shockwave(cx, cy, matchTint, 2.2, 380);
      if (matched.length >= 5) this.fx.screenFlash(matchTint, 0.18, 200);
      Sfx.pops(matched.length);

      matched.forEach(([r, c]) => this.popSpriteAt(r, c));
      this.grid = removeCells(this.grid, matched);

      const floating = findFloatingBubbles(this.grid);
      if (floating.length > 0) {
        this.grid = removeCells(this.grid, floating);
        floating.forEach(([r, c]) => this.dropSpriteAt(r, c));
        Sfx.drop();
        this.time.delayedCall(400, () => this.advance());
      } else {
        this.time.delayedCall(220, () => this.advance());
      }
    } else {
      Sfx.attach();
      this.advance();
    }
  }

  /**
   * 착지 셀 해석 — 보이는 궤적의 끝점과 실제 착지를 일치시키는 핵심 로직.
   *
   * 버블 충돌 시: 충돌 버블(hitRow,hitCol)의 '빈 이웃 칸' 중 접근 지점
   * (refX,refY = 정지 직전 열린 공간)에 가장 가까운 칸에 붙인다. 그러면
   * 착지가 항상 공이 닿은 버블 바로 옆·날아온 방향 쪽이 되어, 벽 반사 후에도
   * 조준선이 가리킨 지점에 그대로 박힌다.
   *
   * 천장 착지(hitRow<0)나 이웃이 모두 찬 예외는 전역 최근접 빈칸으로 폴백.
   * 실시간 비행(update)·예측(traceTrajectory) 모두 이 함수만 사용한다.
   */
  private resolveLanding(
    refX: number, refY: number, hitRow: number, hitCol: number,
  ): [number, number] | null {
    if (hitRow >= 0) {
      const n = nearestEmptyNeighbor(this.grid, hitRow, hitCol, refX, refY, cellToWorld);
      if (n) return [n.row, n.col];
    }
    return this.pickLandingCell(refX, refY);
  }

  /**
   * 착지 셀 선택 — 기준점(refX, refY)에 가장 가까운 "배치 가능한 빈 셀".
   *
   * 배치 가능한 빈 셀 = 점유 셀에 인접하거나 최상단(row 0)인 빈 셀.
   * 천장 착지·이웃이 모두 찬 폴백 용도. (버블 충돌 착지는 resolveLanding)
   */
  private pickLandingCell(refX: number, refY: number): [number, number] | null {
    let best: [number, number] | null = null;
    let bestDist = Infinity;

    for (let r = 0; r <= MAX_GAME_ROW; r++) {
      const cols = colsForRow(r);
      for (let c = 0; c < cols; c++) {
        if (!this.isCellEmpty(r, c)) continue;

        // 최상단이거나 점유 셀과 인접한 빈 셀만 후보
        let attached = r === 0;
        if (!attached) {
          for (const [nr, nc] of getNeighbors(r, c)) {
            if (nr >= 0 && nr <= MAX_GAME_ROW && nc >= 0 && nc < colsForRow(nr)
              && !this.isCellEmpty(nr, nc)) {
              attached = true;
              break;
            }
          }
        }
        if (!attached) continue;

        const { x, y } = cellToWorld(r, c);
        const dist = Math.hypot(x - refX, y - refY);
        if (dist < bestDist) {
          bestDist = dist;
          best = [r, c];
        }
      }
    }
    return best;
  }

  private isCellEmpty(row: number, col: number): boolean {
    return (this.grid[row]?.[col] ?? 0) === 0;
  }

  /** 보드에 남은 색 기준으로 다음 발사 색을 뽑는다 (특수 버블 확률 포함) */
  private queueColor(): BubbleColor {
    return randomBubbleColor(colorsInGrid(this.grid));
  }

  // ── 다음 버블 준비 ──────────────────────────────────────────────────────────
  private advance(): void {
    // 모든 버블 제거 시 승리
    if (this.isGridEmpty()) { this.winGame(); return; }

    this.currentColor = this.nextColor;
    this.nextColor    = this.queueColor();
    this.currentColorImg.setTexture(bubbleKey(this.currentColor)).setVisible(true);
    this.nextColorImg.setTexture(bubbleKey(this.nextColor));

    // 특수 버블 마커 갱신
    this.currentDecorCleanup();
    this.currentDecorCleanup = this.decorateSpecial(this.currentColorImg, this.currentColor);
    this.nextDecorCleanup();
    this.nextDecorCleanup = this.decorateSpecial(this.nextColorImg, this.nextColor);

    if (this.shotsLeft <= 0) { this.endGame(); return; }
    this.state = 'aiming';
  }

  /**
   * 특수 버블(폭탄/무지개) 시각 마커 부착.
   * 일반 버블이면 틴트만 초기화하고 no-op 반환.
   * 반환된 함수 호출 시 마커·트윈·프레임 추적을 모두 정리한다.
   */
  private decorateSpecial(img: Phaser.GameObjects.Image, color: BubbleColor): () => void {
    img.clearTint();
    if (color !== BOMB_COLOR && color !== RAINBOW_COLOR) return () => {};

    const auras: Phaser.GameObjects.Image[] = [];
    const tws: Phaser.Tweens.Tween[] = [];
    const ringSize = img.displayWidth * 1.45;

    if (color === RAINBOW_COLOR) {
      // 무지개: 색상 순환 틴트 + 회전 레인보우 링
      const RT = [0xff5a7a, 0xff9a3d, 0xffe14d, 0x57e08a, 0x4fa8ff, 0xc06bff];
      tws.push(this.tweens.addCounter({
        from: 0, to: RT.length, duration: 1500, repeat: -1,
        onUpdate: t => img.setTint(RT[Math.floor(t.getValue() ?? 0) % RT.length]),
      }));
      const ring = this.add.image(img.x, img.y, 'fx_ring')
        .setDepth(img.depth + 1)
        .setDisplaySize(ringSize, ringSize)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.55);
      auras.push(ring);
      tws.push(this.tweens.add({ targets: ring, angle: 360, duration: 1800, repeat: -1 }));
      tws.push(this.tweens.add({
        targets: ring, alpha: 0.25, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      }));
    } else {
      // 폭탄: 위험 적색 펄스 글로우
      const glow = this.add.image(img.x, img.y, 'fx_glow')
        .setTint(0xff3322)
        .setDepth(img.depth - 1)
        .setDisplaySize(ringSize * 1.2, ringSize * 1.2)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.65);
      auras.push(glow);
      tws.push(this.tweens.add({
        targets: glow, alpha: 0.25, scale: glow.scale * 1.25,
        duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      }));
    }

    // 마커가 대상 스프라이트를 매 프레임 따라가도록
    const follow = (): void => auras.forEach(a => a.setPosition(img.x, img.y));
    this.events.on('update', follow);

    return () => {
      this.events.off('update', follow);
      tws.forEach(t => t.stop());
      auras.forEach(a => a.destroy());
      img.clearTint();
    };
  }

  private isGridEmpty(): boolean {
    return this.grid.every(row => row.every(cell => cell === 0));
  }

  // ── 스프라이트 관리 ─────────────────────────────────────────────────────────
  private renderFullGrid(): void {
    this.gridSprites.forEach(s => s.destroy());
    this.gridSprites.clear();
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[r].length; c++) {
        const color = this.grid[r][c];
        if (color) this.placeSpriteAt(r, c, color);
      }
    }
  }

  private placeSpriteAt(row: number, col: number, color: BubbleColor): void {
    const key = `${row},${col}`;
    this.gridSprites.get(key)?.destroy();
    const { x, y } = cellToWorld(row, col);
    const img = this.add
      .image(x, y, bubbleKey(color))
      .setDisplaySize(BUBBLE_DISPLAY, BUBBLE_DISPLAY)
      .setDepth(20)
      .setData('color', color);
    this.gridSprites.set(key, img);
  }

  private popSpriteAt(row: number, col: number): void {
    const key = `${row},${col}`;
    const sprite = this.gridSprites.get(key);
    if (!sprite) return;
    this.gridSprites.delete(key);

    const color = (sprite.getData('color') as number | undefined) ?? 1;
    // 텍스처 파편 폭발 + 스파클 + 충격파
    this.fx.bubblePop(sprite.x, sprite.y, sprite.texture.key, color);

    // 살짝 부풀었다 즉시 사라짐 (파티클이 메인 연출)
    this.tweens.add({
      targets: sprite,
      scaleX: sprite.scaleX * 1.3, scaleY: sprite.scaleY * 1.3,
      alpha: 0,
      duration: 120,
      ease: 'Quad.easeOut',
      onComplete: () => sprite.destroy(),
    });
  }

  /** 부유 버블 낙하 애니메이션 — 회전하며 떨어지고 스파클을 흘림 */
  private dropSpriteAt(row: number, col: number): void {
    const key = `${row},${col}`;
    const sprite = this.gridSprites.get(key);
    if (!sprite) return;
    this.gridSprites.delete(key);

    const color = (sprite.getData('color') as number | undefined) ?? 1;
    const tint = tintForColor(color);

    // 낙하 중 스파클 흘리기
    const sparkTimer = this.time.addEvent({
      delay: 60,
      repeat: 5,
      callback: () => this.fx.dropTrail(sprite.x, sprite.y, tint),
    });

    // 회전하며 중력 낙하
    this.tweens.add({
      targets: sprite,
      y: sprite.y + 640,
      angle: 360,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeIn',
      onComplete: () => { sparkTimer.remove(); sprite.destroy(); },
    });
  }

  // ── 게임오버 ───────────────────────────────────────────────────────────────
  private endGame(): void {
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.trail.stop();
    this.cameras.main.shake(220, 0.01);
    Sfx.lose();
    this.showEndOverlay('GAME OVER', '#ff6b6b');
  }

  // ── 클리어 승리 ──────────────────────────────────────────────────────────────
  private winGame(): void {
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.state = 'settling';
    this.trail.stop();
    // 연속 폭죽 → 잠시 후 오버레이
    this.fx.fireworks(GW, 1280, 10);
    this.fx.screenFlash(0xffffff, 0.4, 300);
    Sfx.win();
    this.time.delayedCall(900, () => this.showEndOverlay('CLEAR!', '#ffe14d'));
  }

  /** 게임 종료 오버레이 — 어두운 막 + 펀치 인 타이틀 + 재시작 버튼 */
  private showEndOverlay(title: string, titleColor: string): void {
    this.state = 'settling';

    const veil = this.add
      .rectangle(GW / 2, 640, GW, 1280, 0x000000, 0)
      .setDepth(100);
    this.tweens.add({ targets: veil, fillAlpha: 0.68, duration: 300 });

    const heading = this.add
      .text(GW / 2, 540, title, {
        fontFamily: '"Russo One", sans-serif',
        fontSize: '80px',
        color: titleColor,
        stroke: '#000000',
        strokeThickness: 8,
        shadow: { offsetX: 0, offsetY: 4, blur: 10, color: '#000000', fill: true },
      })
      .setOrigin(0.5).setDepth(101).setScale(0).setAlpha(0);
    this.tweens.add({
      targets: heading,
      scale: 1, alpha: 1,
      duration: 460,
      ease: 'Back.easeOut',
    });

    const btn = this.add
      .text(GW / 2, 720, '다시 시작', {
        fontFamily: 'Jua, sans-serif',
        fontSize: '52px',
        color: '#ffffff',
        backgroundColor: '#4BBFE6',
        padding: { x: 48, y: 22 },
      })
      .setOrigin(0.5).setDepth(101)
      .setAlpha(0)
      .setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: btn, alpha: 1, duration: 300, delay: 360 });
    btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#2aa5d0' }));
    btn.on('pointerout',  () => btn.setStyle({ backgroundColor: '#4BBFE6' }));
    btn.on('pointerdown', () => {
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart());
    });
  }

  // ── 공통 텍스트 스타일 ─────────────────────────────────────────────────────
  private textStyle(
    fontSize: number,
    fontFamily: string,
    strokeColor: string,
  ): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: `${fontFamily}, sans-serif`,
      fontSize: `${fontSize}px`,
      color: '#ffffff',
      stroke: strokeColor,
      strokeThickness: 2,
      shadow: { offsetX: 2, offsetY: 2, blur: 2, color: '#000000', fill: true },
    };
  }
}
