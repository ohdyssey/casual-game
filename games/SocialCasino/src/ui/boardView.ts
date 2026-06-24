/**
 * boardView.ts — 하단 매치-3 보드의 뷰(Phaser). 형제 eco01/Logistics 의 매치-3 "손맛"을 계승.
 *
 * 입력: **드래그-스왑 주 + 탭-탭 보조**(씬 레벨 pointermove/up). 잘못된 스왑은 되돌리고 흔든다.
 * 연쇄: 순수 로직(logic/board.resolveSwap)이 step 단위로 결과를 주면 뷰가 단계별로 연출한다 —
 *   2단 팝(오버슈트→소멸+회전) · 파티클 버스트 · 거리정확 중력낙하/리필 · 콤보 배너 · 카메라 흔들/플래시.
 * 매치가 끝나면 onResolved({spins,multiplier,cleared}) 로 상단 슬롯에 스핀을 적립한다.
 * 교착(이동 불가) 시 자동 셔플.
 */
import Phaser from 'phaser';
import { haptics } from '@casual/core';
import type { BoardGeom } from './layoutGeom.js';
import { PUZZLE_TILE_KEYS } from '../assets.js';
import {
  createGrid,
  resolveSwap,
  isAdjacent,
  hasAnyMove,
  findRuns,
  type Grid,
  type Coord,
  type ResolveStep,
} from '../logic/board.js';
import type { Rng } from '../logic/rng.js';
import { puzzleMultiplierFromRuns } from '../logic/economy.js';
import type { Sfx } from '../audio.js';
import { FancyNumber } from './fancyNumber.js';

/** 한 매치 결과 — 퍼즐 멀티(매치 구조 기반: 각 run 배수의 곱 + 제거수×0.1)와 제거 타일수. */
export interface ResolvedInfo {
  readonly puzzleMult: number;
  readonly cleared: number;
}

const TYPES = PUZZLE_TILE_KEYS.length;
const SPARK_TEX = 'sc_spark';

/** 매치 크기 → 콤보 배수(요청: 4개=2배, 5개=4배, 6개+=8배). */
function puzzleCombo(runLen: number): number {
  if (runLen >= 6) return 8;
  if (runLen === 5) return 4;
  if (runLen === 4) return 2;
  return 1;
}

export class BoardView {
  private readonly scene: Phaser.Scene;
  private readonly geom: BoardGeom;
  private readonly rng: Rng;
  /** 퍼즐 1회 조작이 매치를 만들면 호출(퍼즐-우선 모드: 슬롯을 돌린다). */
  private readonly onPuzzle: (info: ResolvedInfo) => void;
  private readonly sfx?: Sfx;
  private readonly sprites: Phaser.GameObjects.Image[][] = []; // [r][c]
  private readonly depth: number;
  private grid: Grid;
  private combo!: FancyNumber; // 콤보 배너 — 굵은 이텔릭 폰트(정보패널 점수와 동일 톤)
  private emitter!: Phaser.GameObjects.Particles.ParticleEmitter; // 재사용 파티클(버스트마다 생성 안 함)
  private readonly boundMove = (p: Phaser.Input.Pointer): void => this.onMove(p);
  private readonly boundUp = (p: Phaser.Input.Pointer): void => this.onUp(p);

  // 입력 상태
  private selected: Coord | null = null;
  private pressCell: Coord | null = null;
  private pressX = 0;
  private pressY = 0;
  private dragConsumed = false;
  private busy = false;

  constructor(
    scene: Phaser.Scene,
    geom: BoardGeom,
    rng: Rng,
    onPuzzle: (info: ResolvedInfo) => void,
    sfx?: Sfx,
    depth = 60,
  ) {
    this.scene = scene;
    this.geom = geom;
    this.rng = rng;
    this.onPuzzle = onPuzzle;
    this.sfx = sfx;
    this.depth = depth;
    this.grid = createGrid(geom.rows, geom.cols, TYPES, rng);
    this.ensureSpark();
    this.build();
  }

  // ── 좌표/텍스처 ──
  private cx(c: number): number {
    return this.geom.startX + c * this.geom.pitchX;
  }
  private cy(r: number): number {
    return this.geom.startY + r * this.geom.pitchY;
  }
  private texFor(type: number): string {
    return PUZZLE_TILE_KEYS[type % TYPES];
  }

  private ensureSpark(): void {
    if (this.scene.textures.exists(SPARK_TEX)) return;
    const g = this.scene.make.graphics({}, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 7);
    g.generateTexture(SPARK_TEX, 16, 16);
    g.destroy();
  }

  private build(): void {
    // 보드 프레임 마스크 — 셔플/리필 시 타일이 보드(그리드) 밖으로 안 보이게(프레임 안에서만 이동).
    const g = this.geom;
    const padX = g.pitchX * 0.22;
    const padY = g.pitchY * 0.22;
    const maskG = this.scene.make.graphics({}, false);
    maskG.fillStyle(0xffffff);
    maskG.fillRect(
      g.startX - g.pitchX / 2 - padX,
      g.startY - g.pitchY / 2 - padY,
      g.cols * g.pitchX + padX * 2,
      g.rows * g.pitchY + padY * 2,
    );
    const mask = maskG.createGeometryMask(); // maskG 는 마스크가 매 프레임 참조 → destroy 안 함

    for (let r = 0; r < this.geom.rows; r++) {
      this.sprites[r] = [];
      for (let c = 0; c < this.geom.cols; c++) {
        const img = this.scene.add.image(this.cx(c), this.cy(r), this.texFor(this.grid[r][c]));
        img.setDisplaySize(this.geom.tile, this.geom.tile).setDepth(this.depth);
        img.setMask(mask); // 프레임 클립
        img.setInteractive({ useHandCursor: true });
        img.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown({ r, c }, p));
        this.sprites[r][c] = img;
      }
    }
    // 씬 레벨 드래그/탭 처리(스프라이트 단위 아님). 씬 종료 시 정리(재시작 대비 방어).
    this.scene.input.on('pointermove', this.boundMove);
    this.scene.input.on('pointerup', this.boundUp);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.input.off('pointermove', this.boundMove);
      this.scene.input.off('pointerup', this.boundUp);
    });

    // 재사용 파티클 이미터 1개(버스트마다 새로 만들지 않음 = GC/GPU churn 감소).
    this.emitter = this.scene.add
      .particles(0, 0, SPARK_TEX, {
        blendMode: 'ADD',
        lifespan: { min: 360, max: 640 },
        speed: { min: 40, max: 130 },
        angle: { min: 200, max: 340 },
        gravityY: -90,
        scale: { start: 0.9, end: 0.12 },
        alpha: { start: 0.95, end: 0 },
        rotate: { min: 0, max: 360 },
        emitting: false,
      })
      .setDepth(this.depth + 8);

    // 콤보 배너 — 퍼즐 패널 정중앙에 ~2배 크게(요청). 굵은 이텔릭 폰트(정보패널 점수와 동일 톤).
    this.combo = new FancyNumber(
      this.scene,
      this.cx((this.geom.cols - 1) / 2),
      this.cy((this.geom.rows - 1) / 2),
      120,
      this.depth + 40,
    );
    this.combo.setAlpha(0);
  }

  get isBusy(): boolean {
    return this.busy;
  }

  /** 매치가 성립하는 첫 인접 스왑을 찾는다(없으면 null). */
  private findValidMove(): { a: Coord; b: Coord } | null {
    const test = (a: Coord, b: Coord): boolean => findRuns(this.swapGrid(this.grid, a, b)).matched.length > 0;
    for (let r = 0; r < this.geom.rows; r++) {
      for (let c = 0; c < this.geom.cols; c++) {
        if (c + 1 < this.geom.cols && test({ r, c }, { r, c: c + 1 })) return { a: { r, c }, b: { r, c: c + 1 } };
        if (r + 1 < this.geom.rows && test({ r, c }, { r: r + 1, c })) return { a: { r, c }, b: { r: r + 1, c } };
      }
    }
    return null;
  }

  /**
   * AI 최적수 — 모든 인접 스왑을 평가해 **가장 효율적인(점수 높은) 매치**를 고른다.
   * 점수 = 즉시 제거 타일 수 × 최대 콤보 배수(실제 퍼즐 점수 공식 P 근사). 동점이면 첫 발견.
   */
  private findBestMove(): { a: Coord; b: Coord } | null {
    let best: { a: Coord; b: Coord } | null = null;
    let bestScore = 0;
    const evalPair = (a: Coord, b: Coord): void => {
      const { matched, runs } = findRuns(this.swapGrid(this.grid, a, b));
      if (matched.length === 0) return;
      let maxRun = 0;
      for (const len of runs) maxRun = Math.max(maxRun, len);
      const score = matched.length * puzzleCombo(maxRun);
      if (score > bestScore) {
        bestScore = score;
        best = { a, b };
      }
    };
    for (let r = 0; r < this.geom.rows; r++) {
      for (let c = 0; c < this.geom.cols; c++) {
        if (c + 1 < this.geom.cols) evalPair({ r, c }, { r, c: c + 1 });
        if (r + 1 < this.geom.rows) evalPair({ r, c }, { r: r + 1, c });
      }
    }
    return best;
  }

  /**
   * AI 자동 매치(역방향 모드: 슬롯 먼저 돌린 뒤 호출). 유효한 스왑을 찾아 자동 실행하고
   * 퍼즐 점수를 반환한다. 이동이 없으면 셔플 후 재시도. onPuzzle 은 호출하지 않는다(PlayScene 가 합산 주도).
   */
  async autoMatch(): Promise<number> {
    if (this.busy) return 0;
    const mv = this.findBestMove(); // AI: 가장 효율적인 매치
    if (!mv) return 0; // 이동 없음 → 셔플은 라운드 종료 후(reshuffleIfNeeded)에서 처리
    // 선택 강조를 또렷이 보여준 뒤(절차적) 스왑 — 수동 플레이와 동일 임팩트·약간 느린 진행.
    await this.flashPick(mv.a, mv.b);
    return this.trySwap(mv.a, mv.b, false);
  }

  /** 라운드(결과 표시)가 모두 끝난 뒤 호출 — 이동 불가면 그때 셔플(중간에 안 함). */
  async reshuffleIfNeeded(): Promise<void> {
    if (this.busy || hasAnyMove(this.grid)) return;
    this.busy = true;
    await this.reshuffle();
    this.busy = false;
  }

  /** AI가 고른 두 칸을 또렷이 강조(자동 매치 가시화 — 수동 '선택'과 동일 임팩트). 끝날 때까지 await 가능. */
  private flashPick(a: Coord, b: Coord): Promise<void> {
    const base = this.geom.tile;
    this.sfx?.play('select', 0.4);
    haptics.tap();
    const tw = [a, b].map((cd) => {
      const img = this.sprites[cd.r][cd.c];
      img.setDepth(this.depth + 4); // 강조 중 앞으로
      return this.tween({ targets: img, displayWidth: base * 1.22, displayHeight: base * 1.22, duration: 160, ease: 'Back.easeOut', yoyo: true });
    });
    return Promise.all(tw).then(() => {
      for (const cd of [a, b]) this.sprites[cd.r][cd.c].setDepth(this.depth);
    });
  }

  /** DEV 전용 — 유효 스왑 1회 실행(헤드리스 검증용, 퍼즐-우선 알림 포함). */
  devTriggerMove(): boolean {
    const mv = this.findValidMove();
    if (!mv) return false;
    void this.trySwap(mv.a, mv.b, true);
    return true;
  }

  // ── 입력 ──
  private onDown(coord: Coord, p: Phaser.Input.Pointer): void {
    if (this.busy) return;
    this.pressCell = coord;
    this.pressX = p.x;
    this.pressY = p.y;
    this.dragConsumed = false;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.pressCell || this.dragConsumed || this.busy) return;
    const dx = p.x - this.pressX;
    const dy = p.y - this.pressY;
    const thr = Math.min(this.geom.pitchX, this.geom.pitchY) * 0.3;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < thr) return;
    this.dragConsumed = true;
    const a = this.pressCell;
    this.pressCell = null;
    this.clearSelection();
    const b =
      Math.abs(dx) >= Math.abs(dy)
        ? { r: a.r, c: a.c + (dx > 0 ? 1 : -1) }
        : { r: a.r + (dy > 0 ? 1 : -1), c: a.c };
    if (this.inBounds(b)) void this.trySwap(a, b);
  }

  private onUp(_p: Phaser.Input.Pointer): void {
    if (this.dragConsumed) {
      this.pressCell = null;
      return;
    }
    const tapped = this.pressCell;
    this.pressCell = null;
    if (tapped) this.handleTap(tapped);
  }

  private handleTap(coord: Coord): void {
    if (this.busy) return;
    if (!this.selected) {
      this.select(coord);
      return;
    }
    const prev = this.selected;
    if (prev.r === coord.r && prev.c === coord.c) {
      this.clearSelection();
      return;
    }
    if (isAdjacent(prev, coord)) {
      this.clearSelection();
      void this.trySwap(prev, coord);
    } else {
      this.clearSelection();
      this.select(coord);
    }
  }

  private inBounds(c: Coord): boolean {
    return c.r >= 0 && c.r < this.geom.rows && c.c >= 0 && c.c < this.geom.cols;
  }

  // ── 선택 연출(들어올리기 + 숨쉬기) ──
  private select(coord: Coord): void {
    this.selected = coord;
    haptics.tap();
    this.sfx?.play('select', 0.45);
    const img = this.sprites[coord.r][coord.c];
    const base = this.geom.tile;
    // 즉각적인 가벼운 펄스(딱딱함 제거 — 2단 스퀴즈 없이 바로 반응).
    this.scene.tweens.add({
      targets: img,
      displayWidth: base * 1.16,
      displayHeight: base * 1.16,
      duration: 200,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  private clearSelection(): void {
    if (!this.selected) return;
    const img = this.sprites[this.selected.r][this.selected.c];
    this.scene.tweens.killTweensOf(img);
    img.setDisplaySize(this.geom.tile, this.geom.tile);
    this.selected = null;
  }

  // ── 트윈 유틸 ──
  private tween(cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => this.scene.tweens.add({ ...cfg, onComplete: () => resolve() }));
  }

  // ── 스왑 + 연쇄 ──
  /**
   * 스왑 시도. 매치가 없으면 되돌리고 0 반환. 매치면 연쇄를 재생하고 **퍼즐 점수**(제거 타일 수 ×
   * 콤보 배수)를 반환한다. notify=true(퍼즐-우선 입력)면 즉시 onPuzzle 로 알려 슬롯을 돌린다.
   * notify=false(역방향 AI 자동매치)면 알리지 않고 점수만 반환(PlayScene 가 슬롯 결과와 합산).
   */
  private async trySwap(a: Coord, b: Coord, notify = true): Promise<number> {
    this.busy = true;
    const res = resolveSwap(this.grid, a, b, TYPES, this.rng);
    const sa = this.sprites[a.r][a.c];
    const sb = this.sprites[b.r][b.c];

    // 스왑 글라이드(임팩트) — 두 타일이 **커지면서 앞으로 튀어올라** 서로의 자리로 교차(Back 바운스) → 안착.
    const base = this.geom.tile;
    const pop = base * 1.28;
    sa.setDepth(this.depth + 6);
    sb.setDepth(this.depth + 6); // 스왑 중 앞으로(위로 솟은 느낌)
    haptics.tap();
    await Promise.all([
      this.tween({ targets: sa, x: this.cx(b.c), y: this.cy(b.r), displayWidth: pop, displayHeight: pop, duration: 230, ease: 'Back.easeOut' }),
      this.tween({ targets: sb, x: this.cx(a.c), y: this.cy(a.r), displayWidth: pop, displayHeight: pop, duration: 230, ease: 'Back.easeOut' }),
    ]);
    // 정상 크기로 안착(살짝 스쿼시감).
    await Promise.all([
      this.tween({ targets: sa, displayWidth: base, displayHeight: base, duration: 120, ease: 'Sine.easeIn' }),
      this.tween({ targets: sb, displayWidth: base, displayHeight: base, duration: 120, ease: 'Sine.easeIn' }),
    ]);
    sa.setDepth(this.depth);
    sb.setDepth(this.depth);
    sa.setPosition(this.cx(a.c), this.cy(a.r));
    sb.setPosition(this.cx(b.c), this.cy(b.r));

    if (!res.valid) {
      haptics.warn();
      this.sfx?.play('error', 0.6);
      await this.rejectShake([sa, sb]);
      this.busy = false;
      return 0;
    }

    haptics.tap();
    this.sfx?.play('swap', 0.55);
    this.grid = this.swapGrid(this.grid, a, b);
    this.syncTextures(this.grid);

    // 퍼즐 멀티 = (각 매치 배수(L−2)의 곱) + 전체 제거수×0.1. (economy.ts SSOT, 결정론)
    const allRuns: number[] = [];
    for (const st of res.steps) for (const len of st.runs) allRuns.push(len);
    const puzzleMult = puzzleMultiplierFromRuns(allRuns, res.cleared);
    if (notify) this.onPuzzle({ puzzleMult, cleared: res.cleared });

    // 연쇄 애니메이션.
    let step = 0;
    for (const st of res.steps) {
      step++;
      this.stepJuice(st, step);
      await this.popCells(st, step);
      this.grid = st.gridAfter as Grid;
      await this.settle(st);
    }

    // 셔플은 여기서 하지 않는다 — 라운드(결과 표시)가 끝난 뒤 reshuffleIfNeeded 에서.
    this.busy = false;
    return puzzleMult;
  }

  private swapGrid(g: Grid, a: Coord, b: Coord): Grid {
    const n = g.map((row) => row.slice());
    const t = n[a.r][a.c];
    n[a.r][a.c] = n[b.r][b.c];
    n[b.r][b.c] = t;
    return n;
  }

  /** 모든 타일 텍스처/위치/스케일 정상화. */
  private syncTextures(g: Grid): void {
    for (let r = 0; r < this.geom.rows; r++) {
      for (let c = 0; c < this.geom.cols; c++) {
        const img = this.sprites[r][c];
        img.setTexture(this.texFor(g[r][c]));
        img.setPosition(this.cx(c), this.cy(r));
        img.setDisplaySize(this.geom.tile, this.geom.tile);
        img.setAlpha(1).setAngle(0);
      }
    }
  }

  // ── 연출 ──
  private stepJuice(st: ResolveStep, step: number): void {
    // 화면 전체 흔들기/플래시 없음(요청). 햅틱 + 콤보 배너 + 매치 사운드.
    const maxRun = st.runs.length ? Math.max(...st.runs) : 0;
    if (maxRun >= 4) haptics.success();
    this.sfx?.play(maxRun >= 5 ? 'match5' : maxRun >= 4 ? 'match4' : 'match3', 0.55);
    if (step >= 2) {
      this.showCombo(step);
      this.sfx?.play('combo', 0.5);
    }
  }

  /** 매치 칸 2단 팝(오버슈트 → 소멸+회전) + 파티클 + 스핀 팝업. */
  private async popCells(st: ResolveStep, step: number): Promise<void> {
    const big = step >= 3 || (st.runs.length ? Math.max(...st.runs) : 0) >= 5 || st.matched.length >= 8;
    st.matched.forEach((m) => this.burst(this.cx(m.c), this.cy(m.r), big));
    this.spinPopup(st);

    await Promise.all(
      st.matched.map((m, i) => {
        const img = this.sprites[m.r][m.c];
        const base = this.geom.tile;
        return this.tween({
          targets: img,
          displayWidth: base * 1.32,
          displayHeight: base * 1.32,
          duration: 55,
          delay: i * 6,
          ease: 'Back.easeOut',
        }).then(() =>
          this.tween({
            targets: img,
            scaleX: 0,
            scaleY: 0,
            alpha: 0,
            angle: 120,
            duration: 110,
            ease: 'Quad.easeIn',
          }),
        );
      }),
    );
  }

  /** 거리정확 중력낙하 + 리필 — step.matched(생존자)와 gridAfter 로 열별 재구성. */
  private async settle(st: ResolveStep): Promise<void> {
    this.sfx?.play('drop', 0.3);
    const matched = new Set(st.matched.map((m) => `${m.r},${m.c}`));
    const rows = this.geom.rows;
    const drops: Promise<void>[] = [];
    for (let c = 0; c < this.geom.cols; c++) {
      // before 에서 이 열의 생존자 행(아래→위) = collapse 순서.
      const survivors: number[] = [];
      for (let r = rows - 1; r >= 0; r--) if (!matched.has(`${r},${c}`)) survivors.push(r);
      let si = 0;
      let spawn = 0;
      for (let r = rows - 1; r >= 0; r--) {
        const img = this.sprites[r][c];
        img.setTexture(this.texFor(this.grid[r][c]));
        img.setDisplaySize(this.geom.tile, this.geom.tile);
        img.setAlpha(1).setAngle(0);
        if (si < survivors.length) {
          img.setPosition(this.cx(c), this.cy(survivors[si++])); // 떨어진 거리만큼 위에서 시작
        } else {
          spawn++;
          img.setPosition(this.cx(c), this.cy(0) - spawn * this.geom.pitchY); // 보드 위에서 생성
        }
        drops.push(
          this.tween({ targets: img, y: this.cy(r), duration: 150, delay: c * 8, ease: 'Quad.easeIn' }),
        );
      }
    }
    await Promise.all(drops);
  }

  /** 파티클 버스트(재사용 이미터에서 explode). */
  private burst(x: number, y: number, big: boolean): void {
    this.emitter.explode(big ? 18 : 11, x, y);
  }

  /** 적립 스핀 팝업(매치 중심에서 떠오름). */
  private spinPopup(st: ResolveStep): void {
    const n = st.matched.length;
    let cx = 0;
    let cy = 0;
    for (const m of st.matched) {
      cx += this.cx(m.c);
      cy += this.cy(m.r);
    }
    cx /= n;
    cy /= n;
    const tier = n >= 10 ? 0 : n >= 7 ? 1 : n >= 4 ? 2 : 3;
    const sizes = [60, 50, 42, 34];
    const colors = ['#ffd34d', '#ffe27a', '#8fe3ff', '#ffffff'];
    const t = this.scene.add
      .text(cx, cy, `+${st.runs.length} 스핀`, {
        fontFamily: '"Jua", sans-serif',
        fontSize: `${sizes[tier]}px`,
        color: colors[tier],
        stroke: '#5a2b00',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(this.depth + 50)
      .setScale(0.4);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 140, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: t,
      y: cy - (90 + tier * -8),
      alpha: 0,
      delay: 160,
      duration: 720,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private showCombo(step: number): void {
    // 숫자=컬러 이미지 폰트(골드/레드), "COMBO!"=숫자와 어울리는 골드 텍스트. 단계별 살짝 확대.
    this.combo.setText(`${step} COMBO!`, '#ffe27a');
    const c = this.combo.container;
    const scale = Math.min(1 + (step - 2) * 0.08, 1.3);
    this.scene.tweens.killTweensOf(c);
    this.combo.setAlpha(0.75); // 반투명(요청) — 뒤 타일이 비치도록
    c.setScale(0.2);
    this.scene.tweens.add({ targets: c, scaleX: scale, scaleY: scale, duration: 220, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: c, scaleX: scale * 1.12, scaleY: scale * 1.12, duration: 90, delay: 220, yoyo: true });
    this.scene.tweens.add({ targets: c, alpha: 0, delay: 700, duration: 200 });
  }

  private async rejectShake(imgs: Phaser.GameObjects.Image[]): Promise<void> {
    imgs.forEach((img) => img.setTintFill(0xff5a5a));
    const homeX = imgs.map((img) => img.x);
    await this.tween({
      targets: imgs,
      x: `+=8`,
      duration: 38,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: 2,
    });
    imgs.forEach((img, i) => {
      img.clearTint();
      img.x = homeX[i];
    });
  }

  /** 교착 시 보드 재생성 + 떨어뜨리기. */
  private async reshuffle(): Promise<void> {
    const banner = this.scene.add
      .text(this.cx((this.geom.cols - 1) / 2), this.cy((this.geom.rows - 1) / 2), '셔플!', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '72px',
        color: '#ffffff',
        stroke: '#5a2b00',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(this.depth + 60);
    haptics.warn();
    this.sfx?.play('shuffle', 0.6);
    this.grid = createGrid(this.geom.rows, this.geom.cols, TYPES, this.rng);
    const drops: Promise<void>[] = [];
    for (let r = 0; r < this.geom.rows; r++) {
      for (let c = 0; c < this.geom.cols; c++) {
        const img = this.sprites[r][c];
        img.setTexture(this.texFor(this.grid[r][c]));
        img.setDisplaySize(this.geom.tile, this.geom.tile);
        img.setAlpha(1).setAngle(0);
        img.setPosition(this.cx(c), this.cy(r) - this.geom.pitchY * (this.geom.rows + 1));
        drops.push(
          this.tween({ targets: img, y: this.cy(r), duration: 430, delay: c * 70, ease: 'Bounce.easeOut' }),
        );
      }
    }
    await Promise.all(drops);
    banner.destroy();
  }
}
