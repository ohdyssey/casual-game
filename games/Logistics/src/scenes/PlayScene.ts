/**
 * PlayScene — 배송대작전 본편(매치-3 배송, 에디터 SSOT 구동).
 *
 * 화면 = ui/layouts/main.json(배경/베이/파워업/HUD)을 buildLayout 으로 렌더.
 * 보드는 가로 5칸 기준(5×6)으로 보드 패널 영역에 반응형으로 정밀 배치 — 셀/타일 크기는
 * 영역과 행·열 수로부터 산출(에디터 목업 슬롯 8×5 는 숨김). 매치된 상품은 그 상품을 주문한
 * 베이 트럭에 배송(적립). 트럭 1개 오더가 차면 출발 → 같은 베이에 대기열의 다음 트럭이 재진입.
 * 목표 대수(goal)만큼 출발시키면 레벨 클리어. 데드락은 자동 리셔플.
 *
 * 규칙은 순수 로직(../logic/match3, ../logic/board). 씬은 렌더·입력·애니·영속만.
 */
import Phaser from 'phaser';
import { loadProfile, saveProfile, applyReward, recordResult, type Profile } from '@casual/core';
import { createGame, deliver, deployNext, isLevelComplete, type DeliverResult } from '../logic/board.js';
import {
  findMatches,
  clearCells,
  collapse,
  swapTypes,
  isLegalSwap,
  hasLegalMove,
  findLegalSwap,
  reshuffle,
  cellKey,
} from '../logic/match3.js';
import { makeLevel } from '../logic/levels.js';
import { makeRng } from '../logic/rng.js';
import type { Coord, GameState, CollapseMove, Rng, TruckState } from '../logic/types.js';
import { makeProductIcon, productById, UI_LAYOUT_KEY, TILE_KEY } from '../assets.js';
import { buildLayout, type LayoutDoc, type LayoutIndex } from '../ui/layoutLoader.js';

const W = 720;
type Pos = { x: number; y: number };

// ── 에디터 노드 앵커 ──
const LEVEL_TEXT_ID = 'layer_3_copy';
const COINS_PANEL_ID = 'layer_2_copy16';
const PROGRESS_RECT_ID = 'layer_4';
const BOARD_GROUP = 'grp_1'; // 에디터 목업 슬롯 8×5 — 숨김(보드는 코드가 반응형으로 재배치)
const BOARD_PANEL_ID = 'layer_5'; // 보드 배경 패널 — 반응형 리프레임 + 밝게(탁함 제거)
const SLOT_TEX = 'up_Logistics_UI_19'; // 셀 배경 아트
const INFO_SIGN_ID = 'layer_2_copy6'; // 안내 입간판(보드와 겹치지 않게 위로 이동)
const BADGE_IDS = ['layer_2_copy7', 'layer_2_copy8', 'layer_2_copy9', 'layer_2_copy10'];
const BAY_PANEL_IDS = ['layer_2_copy3', 'layer_2_copy4', 'layer_2_copy5'];
const TRUCK_IDS = ['layer_2', 'layer_2_copy2', 'layer_2_copy'];
// 에디터 목업(보드 위 샘플 아이템 + 클립보드 샘플 아이템 + 샘플 카운트) 숨김.
const HIDE_IDS = [
  ...Array.from({ length: 13 }, (_, i) => `layer_2_copy${62 + i}`),
  'layer_3_copy2',
];

const ORDER_ITEM_Y = 226;
const ORDER_COUNT_Y = 256;
const ORDER_ICON = 46;

// 보드가 차지할 영역(디자인 좌표). 베이(위)와 파워업(아래) 사이. 셀 크기는 여기서 산출.
const BOARD_AREA = { left: 46, right: 674, top: 556, bottom: 1074 };

type PowerKind = 'shuffle' | 'forklift' | 'rearrange' | 'hint';
const POWER_NODES: ReadonlyArray<{ kind: PowerKind; id: string }> = [
  { kind: 'shuffle', id: 'layer_2_copy18' },
  { kind: 'forklift', id: 'layer_2_copy19' },
  { kind: 'rearrange', id: 'layer_2_copy21' },
  { kind: 'hint', id: 'layer_2_copy20' },
];

// 배송 fly — 매치 상품이 공통 경로를 따라 줄지어(stagger) 트럭으로 가속 이동.
const FLY_DUR = 340;
const FLY_STAGGER = 55;

/** 한 베이의 렌더 상태(트럭 아트 + 오더 아이콘/카운트). */
interface BayView {
  bay: number;
  homeX: number;
  truckRestY: number;
  truck?: Phaser.GameObjects.Image;
  icon?: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
  count?: Phaser.GameObjects.Text;
  slotPos: Pos;
  /** 화면에 표시 중인 적재량(fly 도착마다 1씩 증가 — 한꺼번에 점프 방지). */
  shownLoaded: number;
  required: number;
  /** 적재 완료(도착) 시점에 출발시키기 위한 대기 플래그. */
  pendingDispatch?: boolean;
}

export class PlayScene extends Phaser.Scene {
  private profile!: Profile;
  private rng!: Rng;
  private state!: GameState;
  private layout!: LayoutIndex;
  private busy = false;
  private finished = false;

  // 보드 기하/타일
  private cellCenters = new Map<string, Pos>();
  private tiles = new Map<string, Phaser.GameObjects.Image>();
  private cellBgs: Phaser.GameObjects.GameObject[] = [];
  private boardPanel?: Phaser.GameObjects.Graphics;
  private cellSize = 80;
  private cellH = 80;
  private tileDisp = 72;
  private selected: Coord | null = null;
  private pressCell: Coord | null = null;
  private pressX = 0;
  private pressY = 0;

  // 베이/HUD
  private bayViews: BayView[] = [];
  private coinsText?: Phaser.GameObjects.Text;
  private progressText?: Phaser.GameObjects.Text;

  private powerCounts: Record<PowerKind, number> = { shuffle: 3, forklift: 3, rearrange: 3, hint: 3 };
  private powerCountTexts: Partial<Record<PowerKind, Phaser.GameObjects.Text>> = {};

  constructor() {
    super('play');
  }

  create(): void {
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.busy = false;
    this.finished = false;
    this.cellCenters = new Map();
    this.tiles = new Map();
    this.cellBgs = [];
    this.boardPanel = undefined;
    this.selected = null;
    this.pressCell = null;
    this.bayViews = [];
    this.powerCounts = { shuffle: 3, forklift: 3, rearrange: 3, hint: 3 };
    this.powerCountTexts = {};

    this.profile = loadProfile();
    const level = Math.max(1, this.profile.level);
    this.rng = makeRng((level * 2654435 + 13) >>> 0);
    this.state = createGame(makeLevel(level, makeRng(level * 100003 + 7)), this.rng);

    const doc = this.cache.json.get(UI_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!doc) {
      this.add.text(W / 2, 640, '레이아웃 로드 실패', { fontFamily: '"Jua"', fontSize: '28px', color: '#fff' }).setOrigin(0.5);
      return;
    }
    this.layout = buildLayout(this, doc);
    this.layout.setGroupVisible(BOARD_GROUP, false); // 에디터 목업 슬롯 숨김
    for (const id of HIDE_IDS) this.layout.tryById(id)?.setVisible(false);
    // 안내 입간판을 보드 위쪽 빈 공간으로 이동(보드와 겹침 방지).
    this.layout.tryById<Phaser.GameObjects.Image>(INFO_SIGN_ID)?.setPosition(590, 474);

    this.setupHud(level);
    this.setupBoardGeometry();
    this.setupBays();
    this.spawnAllTiles();
    this.setupPowerBar();

    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
  }

  private nodePos(id: string): Pos | null {
    const n = this.layout.nodeById(id);
    return n ? { x: n.x, y: n.y } : null;
  }

  // ─── HUD ───
  private setupHud(level: number): void {
    this.layout.tryById<Phaser.GameObjects.Text>(LEVEL_TEXT_ID)?.setText(`Level ${level}`);

    const coin = this.nodePos(COINS_PANEL_ID) ?? { x: 567, y: 62 };
    this.coinsText = this.add
      .text(coin.x - 16, coin.y, this.fmtCoins(), { fontFamily: '"Jua", sans-serif', fontSize: '22px', color: '#3c2816' })
      .setOrigin(0.5)
      .setDepth(95);

    const bar = this.nodePos(PROGRESS_RECT_ID) ?? { x: 322, y: 77 };
    this.progressText = this.add
      .text(bar.x, bar.y, this.fmtProgress(), { fontFamily: '"Jua", sans-serif', fontSize: '15px', color: '#3c2816', fontStyle: '700' })
      .setOrigin(0.5)
      .setDepth(95);
  }

  private fmtCoins(): string {
    return this.profile.coins.toLocaleString('en-US');
  }
  private fmtProgress(): string {
    return `${this.state.dispatched}/${this.state.goal}`;
  }

  // ─── 보드 기하(영역+행·열로 반응형 산출) ───
  private setupBoardGeometry(): void {
    const { cols, rows } = this.state.board;
    const areaW = BOARD_AREA.right - BOARD_AREA.left;
    const areaH = BOARD_AREA.bottom - BOARD_AREA.top;
    // 정사각 셀이 영역에 꼭 맞도록 가로/세로 중 작은 쪽으로 셀 크기 결정.
    const cell = Math.min(areaW / cols, areaH / rows);
    this.cellSize = cell;
    this.cellH = cell;
    this.tileDisp = cell * 0.9;

    const cx = (BOARD_AREA.left + BOARD_AREA.right) / 2;
    const cy = (BOARD_AREA.top + BOARD_AREA.bottom) / 2;
    const startX = cx - (cols * cell) / 2 + cell / 2;
    const startY = cy - (rows * cell) / 2 + cell / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.cellCenters.set(cellKey(c, r), { x: startX + c * cell, y: startY + r * cell });
      }
    }

    this.reframeBoardPanel(cols, rows, cell, cx, cy);
    this.drawCellBackgrounds();
  }

  /**
   * 보드 패널을 그리드에 맞춰 리프레임 — 에디터 기본 사각 패널(탁한 갈색)은 숨기고,
   * **외곽 라운드 코너**의 밝은 크림 반투명 패널로 대체(탁함 제거 + 라운드 외곽선).
   */
  private reframeBoardPanel(cols: number, rows: number, cell: number, cx: number, cy: number): void {
    this.layout.tryById(BOARD_PANEL_ID)?.setVisible(false);
    const pad = cell * 0.22;
    const w = cols * cell + pad * 2;
    const h = rows * cell + pad * 2;
    const r = Math.min(30, w * 0.06, h * 0.06);
    const x = cx - w / 2;
    const y = cy - h / 2;
    this.boardPanel?.destroy();
    const g = this.add.graphics().setDepth(18);
    g.fillStyle(0xfff3e0, 0.5); // 밝은 크림 반투명(도로 BG 살짝 비침)
    g.fillRoundedRect(x, y, w, h, r);
    g.lineStyle(3, 0xffffff, 0.55); // 외곽 라운드 선
    g.strokeRoundedRect(x, y, w, h, r);
    this.boardPanel = g;
  }

  /** 각 셀 배경(에디터 슬롯 아트)을 산출 위치/크기로 배치. */
  private drawCellBackgrounds(): void {
    for (const o of this.cellBgs) o.destroy();
    this.cellBgs = [];
    const size = this.cellSize * 0.94;
    const hasArt = this.textures.exists(SLOT_TEX);
    for (const pos of this.cellCenters.values()) {
      if (hasArt) {
        this.cellBgs.push(this.add.image(pos.x, pos.y, SLOT_TEX).setDisplaySize(size, size).setDepth(80));
      } else {
        this.cellBgs.push(this.add.rectangle(pos.x, pos.y, size, size, 0xfbe9cf, 1).setDepth(80));
      }
    }
  }

  private cellPos(col: number, row: number): Pos {
    return this.cellCenters.get(cellKey(col, row)) ?? { x: W / 2, y: 800 };
  }

  // ─── 베이(트럭 + 단일 오더) ───
  private setupBays(): void {
    const n = this.state.bays.length;
    for (let b = 0; b < n; b++) {
      const panel = this.nodePos(BAY_PANEL_IDS[b]) ?? { x: 134 + b * 151, y: ORDER_ITEM_Y };
      const truck = this.layout.tryById<Phaser.GameObjects.Image>(TRUCK_IDS[b]);
      const truckRestY = truck ? truck.y : 357;
      if (truck) truck.setX(panel.x);
      const view: BayView = { bay: b, homeX: panel.x, truckRestY, truck, slotPos: { x: panel.x, y: ORDER_ITEM_Y }, shownLoaded: 0, required: 0 };
      this.bayViews[b] = view;
      this.renderBayOrder(view, this.state.bays[b]);
    }
    // 남는 베이 노드 숨김.
    for (let b = n; b < BADGE_IDS.length; b++) this.layout.tryById(BADGE_IDS[b])?.setVisible(false);
    for (let b = n; b < BAY_PANEL_IDS.length; b++) this.layout.tryById(BAY_PANEL_IDS[b])?.setVisible(false);
    for (let b = n; b < TRUCK_IDS.length; b++) this.layout.tryById(TRUCK_IDS[b])?.setVisible(false);
  }

  /** 베이의 오더 아이콘/카운트를 (재)생성. truck=null 이면 빈 베이(트럭 숨김). */
  private renderBayOrder(view: BayView, truck: TruckState | null): void {
    view.icon?.destroy();
    view.count?.destroy();
    view.icon = undefined;
    view.count = undefined;
    view.pendingDispatch = false;
    if (!truck) {
      view.truck?.setVisible(false);
      view.shownLoaded = 0;
      view.required = 0;
      return;
    }
    view.truck?.setVisible(true);
    const slot = truck.orders[0];
    view.shownLoaded = slot.loaded;
    view.required = slot.required;
    const icon = makeProductIcon(this, slot.type, ORDER_ICON).setPosition(view.homeX, ORDER_ITEM_Y).setDepth(95);
    const count = this.add
      .text(view.homeX, ORDER_COUNT_Y, `${slot.loaded}/${slot.required}`, {
        fontFamily: '"Jua", sans-serif',
        fontSize: '15px',
        color: '#3c2816',
        fontStyle: '700',
      })
      .setOrigin(0.5)
      .setDepth(96);
    view.icon = icon;
    view.count = count;
    view.slotPos = { x: view.homeX, y: ORDER_ITEM_Y };
  }

  // ─── 타일 ───
  private texKeyFor(localType: number): string {
    const p = productById(this.state.typePool[localType]);
    return this.textures.exists(p.texKey) ? p.texKey : TILE_KEY;
  }

  private makeTile(col: number, row: number, localType: number, atY?: number): Phaser.GameObjects.Image {
    const pos = this.cellPos(col, row);
    const img = this.add
      .image(pos.x, atY ?? pos.y, this.texKeyFor(localType))
      .setDisplaySize(this.tileDisp, this.tileDisp)
      .setDepth(90)
      .setInteractive({ useHandCursor: true });
    img.setData('col', col);
    img.setData('row', row);
    img.on('pointerdown', (ptr: Phaser.Input.Pointer) => this.onTilePress(img, ptr));
    return img;
  }

  private spawnAllTiles(): void {
    const b = this.state.board;
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        const t = b.cells[r][c];
        if (t == null) continue;
        this.tiles.set(cellKey(c, r), this.makeTile(c, r, t));
      }
    }
  }

  private clearAllTiles(): void {
    for (const img of this.tiles.values()) img.destroy();
    this.tiles.clear();
  }

  private doReshuffle(): void {
    if (this.busy) return;
    this.deselect();
    this.clearAllTiles();
    this.state = { ...this.state, board: reshuffle(this.state.board, this.rng) };
    this.spawnAllTiles();
  }

  private ensurePlayable(): void {
    if (this.busy) {
      this.time.delayedCall(250, () => this.ensurePlayable());
      return;
    }
    if (!hasLegalMove(this.state.board)) this.doReshuffle();
  }

  // ─── 입력(드래그/탭 스왑) ───
  private onTilePress(img: Phaser.GameObjects.Image, pointer: Phaser.Input.Pointer): void {
    if (this.busy || this.finished) return;
    this.pressCell = { col: img.getData('col') as number, row: img.getData('row') as number };
    this.pressX = pointer.worldX;
    this.pressY = pointer.worldY;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.busy || this.finished || !this.pressCell) return;
    const dx = pointer.worldX - this.pressX;
    const dy = pointer.worldY - this.pressY;
    const thresh = this.tileDisp * 0.4;
    if (Math.abs(dx) < thresh && Math.abs(dy) < thresh) return;
    const from = this.pressCell;
    this.pressCell = null;
    let tc = from.col;
    let tr = from.row;
    if (Math.abs(dx) >= Math.abs(dy)) tc += dx > 0 ? 1 : -1;
    else tr += dy > 0 ? 1 : -1;
    if (this.cellCenters.has(cellKey(tc, tr))) {
      this.deselect();
      this.attemptSwap(from, { col: tc, row: tr });
    }
  }

  private onPointerUp(): void {
    if (!this.pressCell || this.busy || this.finished) {
      this.pressCell = null;
      return;
    }
    const here = this.pressCell;
    this.pressCell = null;
    this.handleTap(here);
  }

  private handleTap(here: Coord): void {
    if (!this.selected) {
      this.select(here);
      return;
    }
    if (this.selected.col === here.col && this.selected.row === here.row) {
      this.deselect();
      return;
    }
    if (Math.abs(this.selected.col - here.col) + Math.abs(this.selected.row - here.row) === 1) {
      const a = this.selected;
      this.deselect();
      this.attemptSwap(a, here);
    } else {
      this.deselect();
      this.select(here);
    }
  }

  private select(c: Coord): void {
    this.selected = c;
    const img = this.tiles.get(cellKey(c.col, c.row));
    if (img) this.tweens.add({ targets: img, scale: img.scale * 1.16, duration: 130, yoyo: true, repeat: -1 });
  }
  private deselect(): void {
    if (!this.selected) return;
    const img = this.tiles.get(cellKey(this.selected.col, this.selected.row));
    if (img) {
      this.tweens.killTweensOf(img);
      img.setDisplaySize(this.tileDisp, this.tileDisp);
    }
    this.selected = null;
  }

  private attemptSwap(a: Coord, b: Coord): void {
    const imgA = this.tiles.get(cellKey(a.col, a.row));
    const imgB = this.tiles.get(cellKey(b.col, b.row));
    if (!imgA || !imgB) return;
    this.busy = true;
    const legal = isLegalSwap(this.state.board, a, b);
    const pa = this.cellPos(a.col, a.row);
    const pb = this.cellPos(b.col, b.row);

    this.tweens.add({ targets: imgA, x: pb.x, y: pb.y, duration: 150 });
    this.tweens.add({
      targets: imgB,
      x: pa.x,
      y: pa.y,
      duration: 150,
      onComplete: () => {
        if (legal) {
          this.state = { ...this.state, board: swapTypes(this.state.board, a, b) };
          this.swapTileRefs(a, b);
          this.resolveCascade();
        } else {
          this.tweens.add({ targets: imgA, x: pa.x, y: pa.y, duration: 150 });
          this.tweens.add({ targets: imgB, x: pb.x, y: pb.y, duration: 150, onComplete: () => (this.busy = false) });
        }
      },
    });
  }

  private swapTileRefs(a: Coord, b: Coord): void {
    const ka = cellKey(a.col, a.row);
    const kb = cellKey(b.col, b.row);
    const ia = this.tiles.get(ka);
    const ib = this.tiles.get(kb);
    if (ia) {
      ia.setData('col', b.col);
      ia.setData('row', b.row);
    }
    if (ib) {
      ib.setData('col', a.col);
      ib.setData('row', a.row);
    }
    if (ia) this.tiles.set(kb, ia);
    if (ib) this.tiles.set(ka, ib);
  }

  // ─── 캐스케이드(매치→배송→제거→중력→반복) ───
  private resolveCascade(): void {
    const matches = findMatches(this.state.board);
    if (matches.length === 0) {
      this.busy = false;
      if (this.finished) return;
      if (isLevelComplete(this.state)) {
        this.levelClear();
        return;
      }
      if (!hasLegalMove(this.state.board)) this.time.delayedCall(280, () => this.ensurePlayable());
      return;
    }

    // 매치 상품 → 배송.
    const productTypes = matches.map((m) => this.state.typePool[this.state.board.cells[m.row][m.col] as number]);
    const d = deliver(this.state.bays, productTypes);
    this.state = { ...this.state, bays: d.bays, dispatched: this.state.dispatched + d.dispatchedBays.length };
    this.applyDeliveries(d, matches, productTypes);

    // 제거 연출.
    let pending = matches.length;
    let idx = 0;
    for (const m of matches) {
      const k = cellKey(m.col, m.row);
      const img = this.tiles.get(k);
      this.tiles.delete(k);
      if (!img) {
        if (--pending === 0) this.afterClear(matches);
        continue;
      }
      this.clearTileFx(img, idx++, () => {
        if (--pending === 0) this.afterClear(matches);
      });
    }
    if (pending === 0) this.afterClear(matches);
  }

  private afterClear(matches: Coord[]): void {
    this.state = { ...this.state, board: clearCells(this.state.board, matches) };
    const { board, moves } = collapse(this.state.board, this.rng);
    this.state = { ...this.state, board };
    this.animateMoves(moves, () => this.resolveCascade());
  }

  private animateMoves(moves: CollapseMove[], done: () => void): void {
    const spawnsPerCol = new Map<number, number>();
    for (const mv of moves) if (mv.fromRow == null) spawnsPerCol.set(mv.col, (spawnsPerCol.get(mv.col) ?? 0) + 1);

    const oldTiles = this.tiles;
    const newTiles = new Map<string, Phaser.GameObjects.Image>();
    let pending = 0;
    let anyMove = false;

    for (const mv of moves) {
      const destKey = cellKey(mv.col, mv.toRow);
      const dest = this.cellPos(mv.col, mv.toRow);
      let img: Phaser.GameObjects.Image | undefined;
      if (mv.fromRow != null) {
        img = oldTiles.get(cellKey(mv.col, mv.fromRow));
        if (img) {
          img.setData('col', mv.col);
          img.setData('row', mv.toRow);
        }
      } else {
        const startY = dest.y - (spawnsPerCol.get(mv.col) ?? 1) * this.cellH - this.cellH;
        img = this.makeTile(mv.col, mv.toRow, mv.type, startY);
      }
      if (!img) continue;
      newTiles.set(destKey, img);
      if (Math.abs(img.y - dest.y) > 0.5 || Math.abs(img.x - dest.x) > 0.5) {
        anyMove = true;
        pending++;
        this.tweens.add({
          targets: img,
          x: dest.x,
          y: dest.y,
          duration: 220,
          ease: 'Quad.easeIn',
          onComplete: () => {
            if (--pending === 0) done();
          },
        });
      }
    }
    this.tiles = newTiles;
    if (!anyMove) this.time.delayedCall(0, done);
  }

  private clearTileFx(img: Phaser.GameObjects.Image, idx: number, done: () => void): void {
    this.tweens.add({
      targets: img,
      scale: img.scale * 1.3,
      duration: 90,
      ease: 'Back.easeOut',
      delay: idx * 14,
      onComplete: () => {
        this.tweens.add({
          targets: img,
          scale: 0,
          alpha: 0,
          angle: img.angle + 120,
          duration: 150,
          ease: 'Quad.easeIn',
          onComplete: () => {
            img.destroy();
            done();
          },
        });
      },
    });
  }

  // ─── 배송 반영(HUD/연출) ───
  /**
   * 매치 상품을 트럭으로 **하나씩 빠르게**(stagger) 날려 보낸다. 각 상품은 자기 매치 타일에서
   * 출발해 순차로 이동하고, 도착할 때마다 카운트가 1씩 오른다(한꺼번에 점프 X). 출발(dispatch)은
   * 마지막 상품이 도착해 카운트가 가득 찬 뒤에 일어난다.
   */
  private applyDeliveries(d: DeliverResult, matches: Coord[], productTypes: number[]): void {
    // 종류별 매치 타일 좌표(상품 스트림의 공통 출발점 산출).
    const srcByType = new Map<number, Coord[]>();
    matches.forEach((m, i) => {
      const t = productTypes[i];
      const arr = srcByType.get(t);
      if (arr) arr.push(m);
      else srcByType.set(t, [m]);
    });
    // 전체 매치 중심(폴백).
    let sx = 0;
    let sy = 0;
    for (const m of matches) {
      const p = this.cellPos(m.col, m.row);
      sx += p.x;
      sy += p.y;
    }
    const fallback: Pos = { x: matches.length ? sx / matches.length : W / 2, y: matches.length ? sy / matches.length : 800 };

    const dispatchedSet = new Set(d.dispatchedBays);

    for (const g of d.delivered) {
      const view = this.bayViews[g.bay];
      if (!view) continue;
      if (dispatchedSet.has(g.bay)) view.pendingDispatch = true;

      // 이 상품 매치들의 중심을 공통 출발점으로 → 모든 상품이 한 경로를 줄지어 따라간다.
      const startP = this.centroidOf(srcByType.get(g.type) ?? []) ?? fallback;
      const curve = this.deliveryCurve(startP, view.slotPos);
      const key = this.iconKeyForProduct(g.type);
      for (let i = 0; i < g.count; i++) this.spawnDeliveryFly(curve, key, i, g.bay);
    }
  }

  private centroidOf(coords: ReadonlyArray<Coord>): Pos | null {
    if (!coords.length) return null;
    let x = 0;
    let y = 0;
    for (const c of coords) {
      const p = this.cellPos(c.col, c.row);
      x += p.x;
      y += p.y;
    }
    return { x: x / coords.length, y: y / coords.length };
  }

  /** 출발→트럭 슬롯으로 위로 솟는 완만한 아치(스트림이 줄지어 따라가는 공통 경로). */
  private deliveryCurve(from: Pos, to: Pos): Phaser.Curves.QuadraticBezier {
    const lift = 80 + Math.abs(to.x - from.x) * 0.12;
    return new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(from.x, from.y),
      new Phaser.Math.Vector2((from.x + to.x) / 2, Math.min(from.y, to.y) - lift),
      new Phaser.Math.Vector2(to.x, to.y),
    );
  }

  /**
   * 상품 한 개가 공통 경로를 따라 **가속하며(easeIn)** 트럭으로 이동. index*STAGGER 만큼 늦게 출발해
   * 앞 상품을 줄지어 따라간다. 도착 시 카운트 1 증가(한꺼번에 점프 X).
   */
  private spawnDeliveryFly(curve: Phaser.Curves.QuadraticBezier, key: string, index: number, bay: number): void {
    const p0 = curve.getStartPoint();
    const fly = this.add.image(p0.x, p0.y, key).setDisplaySize(44, 44).setDepth(130);
    const baseScale = fly.scale;
    const prog = { t: 0 };
    const pt = new Phaser.Math.Vector2();
    this.tweens.add({
      targets: prog,
      t: 1,
      duration: FLY_DUR,
      delay: index * FLY_STAGGER,
      ease: 'Quart.easeIn', // 가속도: 천천히 출발 → 트럭으로 빨려들 듯 가속
      onUpdate: () => {
        curve.getPoint(prog.t, pt);
        fly.setPosition(pt.x, pt.y);
        fly.setScale(baseScale * (1 - 0.5 * prog.t));
      },
      onComplete: () => {
        fly.destroy();
        this.onDeliveryArrive(bay);
      },
    });
  }

  /** fly 한 개 도착 — 카운트 1 증가. 가득 차면 초록 + (대기 중이면) 트럭 출발. */
  private onDeliveryArrive(bay: number): void {
    const view = this.bayViews[bay];
    if (!view || !view.count || !view.count.active) return;
    view.shownLoaded = Math.min(view.shownLoaded + 1, view.required);
    view.count.setText(`${view.shownLoaded}/${view.required}`);
    if (view.shownLoaded >= view.required) {
      view.count.setColor('#2f9e44');
      if (view.pendingDispatch) {
        view.pendingDispatch = false;
        this.dispatchBay(bay);
      }
    }
  }

  private iconKeyForProduct(productType: number): string {
    const p = productById(productType);
    return this.textures.exists(p.texKey) ? p.texKey : TILE_KEY;
  }

  /** 베이 트럭 출발 → 위로 빠져나감 → 대기열의 다음 트럭이 위에서 진입. */
  private dispatchBay(bay: number): void {
    const view = this.bayViews[bay];
    if (!view) return;

    this.progressText?.setText(this.fmtProgress());

    const stamp = this.add
      .text(view.homeX, ORDER_ITEM_Y - 30, '출발! 🚚', { fontFamily: '"Do Hyeon", "Jua", sans-serif', fontSize: '22px', color: '#2f9e44' })
      .setOrigin(0.5)
      .setDepth(140);
    this.tweens.add({ targets: stamp, y: stamp.y - 26, alpha: 0, duration: 900, onComplete: () => stamp.destroy() });

    // 현재 오더 아이콘/카운트 페이드아웃(트럭이 비울 동안).
    const oldIcon = view.icon;
    const oldCount = view.count;
    view.icon = undefined;
    view.count = undefined;
    if (oldIcon) this.tweens.add({ targets: oldIcon, alpha: 0, y: ORDER_ITEM_Y - 14, duration: 240, onComplete: () => oldIcon.destroy() });
    if (oldCount) this.tweens.add({ targets: oldCount, alpha: 0, duration: 220, onComplete: () => oldCount.destroy() });

    const truck = view.truck;
    const restY = view.truckRestY;

    const enter = (): void => {
      const { state, truck: newTruck } = deployNext(this.state, bay);
      this.state = state;
      this.renderBayOrder(view, newTruck);
      if (newTruck && truck) {
        // 새 트럭 진입: 위(차고)에서 제자리로 내려옴.
        truck.setVisible(true).setY(restY - 150).setAlpha(0);
        this.tweens.add({ targets: truck, y: restY, alpha: 1, duration: 380, ease: 'Back.easeOut' });
        // 새 오더 팝인.
        const ic = view.icon;
        const ct = view.count;
        if (ic) {
          ic.setAlpha(0);
          this.tweens.add({ targets: ic, alpha: 1, duration: 260 });
        }
        if (ct) {
          ct.setAlpha(0);
          this.tweens.add({ targets: ct, alpha: 1, duration: 260 });
        }
      } else {
        truck?.setVisible(false); // 대기열 소진 → 빈 베이
      }
    };

    if (truck) {
      this.tweens.add({ targets: truck, y: restY - 210, alpha: 0, duration: 420, ease: 'Quad.easeIn', onComplete: enter });
    } else {
      enter();
    }
  }

  // ─── 파워업 ───
  private setupPowerBar(): void {
    for (const pw of POWER_NODES) {
      const node = this.layout.nodeById(pw.id);
      if (!node) continue;
      const w = node.w ?? 150;
      const h = node.h ?? 120;
      this.add
        .rectangle(node.x, node.y, w, h, 0x000000, 0.001)
        .setDepth(110)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.usePower(pw.kind));

      const bx = node.x + w * 0.3;
      const by = node.y + h * 0.26;
      const badge = this.add.graphics().setDepth(111);
      badge.fillStyle(0xffffff, 1);
      badge.fillCircle(bx, by, 15);
      badge.lineStyle(2, 0x5b3a86, 1);
      badge.strokeCircle(bx, by, 15);
      this.powerCountTexts[pw.kind] = this.add
        .text(bx, by, String(this.powerCounts[pw.kind]), { fontFamily: '"Jua", sans-serif', fontSize: '20px', color: '#5b3a86' })
        .setOrigin(0.5)
        .setDepth(112);
    }
  }

  private usePower(kind: PowerKind): void {
    if (this.busy || this.finished || this.powerCounts[kind] <= 0) return;

    if (kind === 'shuffle' || kind === 'rearrange') {
      this.doReshuffle();
    } else if (kind === 'forklift') {
      const sw = findLegalSwap(this.state.board);
      if (!sw) return;
      this.attemptSwap(sw.a, sw.c);
    } else {
      const sw = findLegalSwap(this.state.board);
      if (!sw) return;
      for (const c of [sw.a, sw.c]) {
        const img = this.tiles.get(cellKey(c.col, c.row));
        if (img) this.tweens.add({ targets: img, scale: img.scale * 1.25, duration: 200, yoyo: true, repeat: 2 });
      }
    }

    this.powerCounts[kind] -= 1;
    this.powerCountTexts[kind]?.setText(String(this.powerCounts[kind]));
  }

  // ─── 레벨 클리어 ───
  private levelClear(): void {
    if (this.finished) return;
    this.finished = true;
    const cleared = this.state.level;
    const reward = 40 + cleared * 10;

    this.profile = applyReward(this.profile, { coins: reward });
    this.profile = recordResult(this.profile, cleared, reward, true);
    saveProfile(this.profile);
    this.coinsText?.setText(this.fmtCoins());

    this.add.rectangle(W / 2, 640, W, 1280, 0x000000, 0.55).setDepth(200);
    this.add
      .text(W / 2, 560, '레벨 클리어! 🎉', { fontFamily: '"Do Hyeon", "Jua", sans-serif', fontSize: '52px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(201);
    this.add
      .text(W / 2, 650, `+${reward} 🪙`, { fontFamily: '"Jua", sans-serif', fontSize: '40px', color: '#ffe48a' })
      .setOrigin(0.5)
      .setDepth(201);

    this.time.delayedCall(1500, () => this.scene.restart());
  }
}
