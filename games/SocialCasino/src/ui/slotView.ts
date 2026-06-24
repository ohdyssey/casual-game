/**
 * slotView.ts — 상단 클래식 슬롯의 뷰(Phaser). 세로 스크롤 릴 + 모션블러 + 관성 감속 정지.
 *
 * 연출(레퍼런스: 코인마스터): 심볼은 자연 크기에 가깝게, 회전 중엔 세로로 살짝 늘여 반투명하게 겹쳐
 * **모션 스트릭(흐름)** 으로 보이고(통짜 바 아님), 좌→우로 짧게 회전 후 **탁탁탁** 관성 감속하며 순차 정지.
 *
 * 클리핑(중요): 회전 표시는 **슬롯 내부 프레임(릴 창) 안에서만** 보여야 한다. 각 심볼 이미지에 직접
 *   geometry 마스크를 걸어 창 밖(배너/잭팟 영역)으로 새지 않게 한다. (컨테이너+postFX 블러는 마스크를
 *   무시하고 세로로 새므로 사용하지 않는다 — 동시에 모바일 fill-rate 비용도 제거.)
 */
import Phaser from 'phaser';
import type { CellGrid } from './layoutGeom.js';
import { SLOT_SYMBOL_KEYS } from '../assets.js';
import { spin as slotSpin, REEL_COLS, REEL_ROWS, SYMBOL_COUNT, type SpinOutcome } from '../logic/slot.js';
import type { Rng } from '../logic/rng.js';

/** geom 의 릴 격자를 5열×3행으로 정규화(부족하면 균등 보간). */
function normalize(reel: CellGrid): { xs: number[]; ys: number[]; cellW: number; cellH: number } {
  const spread = (arr: number[], n: number): number[] => {
    if (arr.length === n) return arr;
    if (arr.length < 2) {
      const base = arr[0] ?? 540;
      return Array.from({ length: n }, (_, i) => base + (i - (n - 1) / 2) * 130);
    }
    const min = arr[0];
    const max = arr[arr.length - 1];
    return Array.from({ length: n }, (_, i) => Math.round(min + ((max - min) * i) / (n - 1)));
  };
  return { xs: spread(reel.xs, REEL_COLS), ys: spread(reel.ys, REEL_ROWS), cellW: reel.cellW, cellH: reel.cellH };
}

const STRIP = 8; // 보이는 3(페이라인) + 위 버퍼 4 + 아래 1 (창을 더 크게 써서 상하 부분 심볼 노출)
const BUFFER = 4; // 페이라인 시작 인덱스(위 버퍼 수)
const SPIN_SPEED = 3200; // px/s — 빠른 스크롤
const SPIN_MS = 680; // 첫 열 감속 시작까지(빠른 회전 구간 더 길게 = 회전수 ↑↑↑)
const STAGGER = 150; // 열별 정지 간격(좌→우 순차 — 텀 약간 더)
const DECEL = 12000; // px/s² — 강한 관성 감속(빨리 멈춤)
const MIN_VEL = 240; // 이 속도 이하면 안착 단계로
const SETTLE_MS = 120; // 결과 안착(짧은 탁! 마무리)
const SPIN_ALPHA = 0.82; // 회전 중 반투명(겹침이 스트릭처럼 부드럽게)
const SPIN_STRETCH = 1.42; // 회전 중 세로로 늘여 모션 스트릭(행 간격보다 약간 커 끊김 없음)
// 미세 왜곡: **중간 행(페이라인)은 모두 동일 크기**. 상단/하단 행만 좌우 외곽으로 갈수록
// 살짝 작아진다(코너만 약간). 소실점/원근 아님 — 각 심볼에 개별 적용.
const EDGE_DISTORT = 0.14; // 상/하 행 외곽 코너 최대 축소량(미세)

const IDLE = 0;
const SPIN = 1;
const DECEL_ST = 2;

export class SlotView {
  private readonly scene: Phaser.Scene;
  private readonly xs: number[];
  private readonly ys: number[];
  private readonly cellW: number;
  private readonly cellH: number;
  private readonly rowPitch: number;
  private readonly curveMaxDX: number; // 왜곡: 중심 열에서 좌우 가장자리까지 거리
  private readonly centerX: number; // 가운데 열 x
  private readonly depth: number;
  private readonly clip: ReadonlyArray<{ x: number; y: number }> | null; // "2.5D 영역" 클립 다각형(있으면)
  private readonly reels: Phaser.GameObjects.Image[][] = []; // [col][k] top→bottom
  private readonly state: number[] = [];
  private readonly vel: number[] = [];
  private readonly onUpdate: (t: number, d: number) => void;
  private outcome: number[][] = [];
  private finalizeDone: () => void = () => {};
  private busy = false;
  // 현재 스핀 타이밍(fast 모드에서 짧게 — 퍼즐 백로그 따라잡기용). spin() 이 매 스핀 설정.
  private spinMs = SPIN_MS;
  private stagger = STAGGER;
  private decel = DECEL;
  private settleMs = SETTLE_MS;
  /** 각 열이 멈출 때 호출(사운드용). isLast = 마지막(맨 오른쪽) 열. */
  onReelStop?: (isLast: boolean) => void;

  constructor(scene: Phaser.Scene, reel: CellGrid, depth = 50) {
    this.scene = scene;
    this.depth = depth;
    const n = normalize(reel);
    this.xs = n.xs;
    this.ys = n.ys;
    this.cellW = n.cellW;
    this.cellH = n.cellH;
    this.rowPitch = this.ys[1] - this.ys[0];
    this.centerX = (this.xs[0] + this.xs[REEL_COLS - 1]) / 2;
    this.curveMaxDX = Math.max(1, (this.xs[REEL_COLS - 1] - this.xs[0]) / 2);
    this.clip = reel.clip ?? null;
    this.onUpdate = (_t, d) => this.tick(d);
    this.build();
  }

  private texFor(symbol: number): string {
    return SLOT_SYMBOL_KEYS[symbol % SLOT_SYMBOL_KEYS.length];
  }
  private randSym(): number {
    return Math.floor(Math.random() * SYMBOL_COUNT);
  }
  private slotY(k: number): number {
    return this.ys[0] - BUFFER * this.rowPitch + k * this.rowPitch;
  }

  private build(): void {
    // 클립 영역 = "2.5D 영역" field 다각형(있으면) / 없으면 릴 격자 사각형. 이 밖으로는 회전 표시 안 됨.
    const maskG = this.scene.make.graphics({}, false);
    maskG.fillStyle(0xffffff);
    if (this.clip && this.clip.length >= 3) {
      maskG.fillPoints(this.clip.map((p) => new Phaser.Geom.Point(p.x, p.y)), true); // 소실점 미반영, 영역만 클립
    } else {
      const colPitch = this.xs[1] - this.xs[0];
      const left = this.xs[0] - colPitch / 2;
      const right = this.xs[REEL_COLS - 1] + colPitch / 2;
      const topY = this.ys[0] - this.rowPitch;
      const botY = this.ys[REEL_ROWS - 1] + this.rowPitch;
      maskG.fillRect(left, topY, right - left, botY - topY);
    }
    const mask = maskG.createGeometryMask(); // maskG 는 마스크가 매 프레임 참조하므로 destroy 하지 않음

    for (let c = 0; c < REEL_COLS; c++) {
      this.reels[c] = [];
      this.state[c] = IDLE;
      this.vel[c] = 0;
      for (let k = 0; k < STRIP; k++) {
        const img = this.scene.add.image(this.xs[c], this.slotY(k), this.texFor(this.randSym()));
        img.setDepth(this.depth);
        img.setMask(mask); // 심볼별 마스크 → 창 안에서만 표시
        this.applyRest(img); // 곡률 반영 초기 크기
        this.reels[c].push(img);
      }
    }
  }

  get isBusy(): boolean {
    return this.busy;
  }

  /**
   * 미세 왜곡 스케일 — 중간 행은 1.0(동일 크기). 상/하 행(중앙에서 멀수록 tyGate↑)만 좌우 외곽
   * (tx²)으로 갈수록 살짝 작아진다. 코너가 가장 작고, 상/하 중앙열·중간 행은 왜곡 없음.
   */
  private curveFactor(x: number, y: number): number {
    const tyGate = Math.min(1, Math.abs(y - this.ys[1]) / this.rowPitch); // 중간행 0 → 상/하행 1
    if (tyGate < 0.02) return 1; // 중간 라인은 동일 크기
    const tx = Math.min(1, Math.abs(x - this.centerX) / this.curveMaxDX);
    return 1 - EDGE_DISTORT * tyGate * tx * tx;
  }
  /** 회전 중 표시 — 세로 스트릭 + 곡률 + 반투명. */
  private applySpin(img: Phaser.GameObjects.Image): void {
    const f = this.curveFactor(img.x, img.y);
    img.setAlpha(SPIN_ALPHA);
    img.displayWidth = this.cellW * f;
    img.displayHeight = this.cellH * SPIN_STRETCH * f;
  }
  /** 정지 표시 — 곡률만(선명). */
  private applyRest(img: Phaser.GameObjects.Image): void {
    const f = this.curveFactor(img.x, img.y);
    img.setAlpha(1);
    img.displayWidth = this.cellW * f;
    img.displayHeight = this.cellH * f;
  }

  /**
   * 스핀 1회: 짧은 빠른 스크롤 → 좌→우 탁탁탁 관성 감속 → 결과 안착 → 당첨 플래시. weights=운 상태 심볼 분포.
   * fast=true 면 회전·정지·안착을 대폭 단축(퍼즐 백로그를 슬롯이 빠르게 따라잡을 때 — 적응형 가속).
   */
  spin(rng: Rng, bet: number, multiplier: number, weights?: ReadonlyArray<number>, fast = false): Promise<SpinOutcome> {
    if (this.busy) return Promise.resolve({ reels: this.outcome, wins: [], totalWin: 0 });
    // fast: 회전수↓·열간격↓·감속↑·안착↓ → 1스핀 ~0.35s(정상 ~1.4s).
    this.spinMs = fast ? 60 : SPIN_MS;
    this.stagger = fast ? 26 : STAGGER;
    this.decel = fast ? 40000 : DECEL;
    this.settleMs = fast ? 70 : SETTLE_MS;
    const outcome = slotSpin(rng, bet, multiplier, weights);
    this.outcome = outcome.reels;
    this.busy = true;
    for (let c = 0; c < REEL_COLS; c++) {
      this.state[c] = SPIN;
      this.vel[c] = SPIN_SPEED;
      for (const img of this.reels[c]) {
        img.clearTint(); // 직전 당첨 글로우 잔여 제거
        this.applySpin(img);
      }
    }
    this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate);

    return new Promise((resolve) => {
      let stopped = 0;
      this.finalizeDone = () => {
        stopped++;
        if (stopped === REEL_COLS) {
          this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate);
          this.flashWins(outcome);
          this.scene.time.delayedCall(this.settleMs <= 80 ? 40 : outcome.totalWin > 0 ? 360 : 100, () => {
            this.busy = false;
            resolve(outcome);
          });
        }
      };
      for (let c = 0; c < REEL_COLS; c++) {
        this.scene.time.delayedCall(this.spinMs + c * this.stagger, () => {
          this.state[c] = DECEL_ST;
        });
      }
    });
  }

  private tick(delta: number): void {
    const dt = Math.min(delta, 50) / 1000; // 큰 delta(스로틀) 클램프
    const wrap = this.ys[REEL_ROWS - 1] + this.rowPitch * 1.6; // 창(아래 한 행 확장) 밖으로 나가면 순환
    for (let c = 0; c < REEL_COLS; c++) {
      const st = this.state[c];
      if (st === IDLE) continue;
      if (st === DECEL_ST) this.vel[c] = Math.max(0, this.vel[c] - this.decel * dt);
      const dy = this.vel[c] * dt;
      for (const img of this.reels[c]) {
        img.y += dy;
        if (img.y > wrap) {
          img.y -= STRIP * this.rowPitch;
          img.setTexture(this.texFor(this.randSym()));
        }
        this.applySpin(img); // 매 프레임 곡률+스트릭 갱신 → 스크롤하며 가운데서 살짝 커지는 실린더 느낌
      }
      if (st === DECEL_ST && this.vel[c] <= MIN_VEL) {
        this.state[c] = IDLE;
        this.finalizeReel(c);
      }
    }
  }

  /** 감속 끝 → 결과 심볼을 현재 위치에서 가까운 격자로 부드럽게 안착(선명하게). */
  private finalizeReel(c: number): void {
    this.onReelStop?.(c === REEL_COLS - 1); // 열 정지음
    const reel = this.reels[c];
    const colSymbols = this.outcome[c] ?? [this.randSym(), this.randSym(), this.randSym()];
    const order = [...reel].sort((a, b) => a.y - b.y); // 위→아래
    for (let k = 0; k < STRIP; k++) {
      const img = order[k];
      const visible = k >= BUFFER && k < BUFFER + REEL_ROWS; // 페이라인 3행만 결과 심볼, 나머지는 부분 노출용 랜덤
      const sym = visible ? colSymbols[k - BUFFER] : this.randSym();
      const f = this.curveFactor(this.xs[c], this.slotY(k)); // 정지 위치의 곡률(가운데 열·행 크게)
      img.setTexture(this.texFor(sym));
      img.setAlpha(1);
      this.scene.tweens.add({
        targets: img,
        y: this.slotY(k),
        displayWidth: this.cellW * f,
        displayHeight: this.cellH * f,
        duration: this.settleMs,
        ease: 'Back.easeOut',
      });
    }
    for (let k = 0; k < STRIP; k++) reel[k] = order[k]; // imgs[k] == 시각적 행 순서(flashWins 정확)
    this.scene.time.delayedCall(this.settleMs + 10, () => this.finalizeDone());
  }

  private flashWins(outcome: SpinOutcome): void {
    const PAYLINES_ROWS: number[][] = [
      [1, 1, 1, 1, 1],
      [0, 0, 0, 0, 0],
      [2, 2, 2, 2, 2],
      [0, 1, 2, 1, 0],
      [2, 1, 0, 1, 2],
    ];
    for (const w of outcome.wins) {
      const rows = PAYLINES_ROWS[w.line];
      for (let c = 0; c < w.count; c++) {
        const img = this.reels[c][BUFFER + rows[c]];
        img.setDepth(this.depth + 12); // 당첨 심볼을 위로
        img.setTint(0xfff39a); // 금빛 글로우
        const sx = img.scaleX;
        const sy = img.scaleY;
        // 부풀리기(인플레이트) 강하게 + 여러 번 → 당첨 인식 명확.
        this.scene.tweens.add({
          targets: img,
          scaleX: sx * 1.45,
          scaleY: sy * 1.45,
          duration: 200,
          yoyo: true,
          repeat: 2,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            img.clearTint();
            img.setDepth(this.depth);
            img.setScale(sx, sy);
          },
        });
        // 반짝임(트윙클).
        this.scene.tweens.add({ targets: img, alpha: 0.5, duration: 130, yoyo: true, repeat: 3 });
      }
    }
  }
}
