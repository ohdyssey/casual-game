/**
 * boardView.ts — 퍼즐 그리드 렌더러. `퍼즐 배경` 패널(Panel) 안에 cols×rows 셀을 **비례 동적** 배치한다.
 *
 * 모든 좌표·크기는 gridLayout(패널 앵커, 정사각 셀, 중앙 정렬)에서 파생 → cols/rows 가 변해도 어긋나지 않는다.
 * 셀 슬롯(UI_15)은 항상 깔리고, 아이템(UI_09-NN)은 점유 칸에만 올린다. 제거 시 아이템만 사라지고 슬롯은 남는다.
 */
import Phaser from 'phaser';
import { gridLayout, cellCenter, cellAt, type GridGeom, type Panel } from '../logic/gridLayout.js';
import { colOf, rowOf, type Board } from '../logic/types.js';
import { SLOT_KEY, itemTexKey } from '../assets.js';

const SLOT_FILL = 1.0; // 슬롯 변 = cell × 이 값
const ITEM_FILL = 0.82; // 아이템 변 = cell × 이 값
const DEPTH = { slot: 10, item: 12, sel: 14, path: 16 } as const;

export class BoardView {
  private geom: GridGeom = gridLayout({ cx: 0, cy: 0, w: 10, h: 10 }, 1, 1);
  private slots: Phaser.GameObjects.Image[] = [];
  private items: Array<Phaser.GameObjects.Image | null> = [];
  private cols = 0;
  private readonly pathGfx: Phaser.GameObjects.Graphics;
  private readonly selGfx: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly panel: Panel,
  ) {
    this.selGfx = scene.add.graphics().setDepth(DEPTH.sel);
    this.pathGfx = scene.add.graphics().setDepth(DEPTH.path);
  }

  get layout(): GridGeom {
    return this.geom;
  }
  get colCount(): number {
    return this.cols;
  }

  /** 칸 중심(디자인 좌표). */
  centerOf(i: number): { x: number; y: number } {
    return cellCenter(this.geom, colOf(i, this.cols), rowOf(i, this.cols));
  }

  /** 화면 좌표 → 칸 평면 인덱스(밖이면 -1). */
  cellIndexAt(x: number, y: number): number {
    const hit = cellAt(this.geom, x, y);
    return hit ? hit.r * this.cols + hit.c : -1;
  }

  /** 보드로부터 슬롯·아이템 전체 재생성. */
  build(board: Board): void {
    this.destroyCells();
    this.cols = board.cols;
    this.geom = gridLayout(this.panel, board.cols, board.rows);
    const slotSize = this.geom.cell * SLOT_FILL;
    const itemSize = this.geom.cell * ITEM_FILL;
    const n = board.cols * board.rows;
    this.items = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      const { x, y } = this.centerOf(i);
      const slot = this.scene.add.image(x, y, SLOT_KEY).setDisplaySize(slotSize, slotSize).setDepth(DEPTH.slot);
      this.slots.push(slot);
      const type = board.cells[i];
      if (type != null && this.scene.textures.exists(itemTexKey(type))) {
        const it = this.scene.add.image(x, y, itemTexKey(type)).setDisplaySize(itemSize, itemSize).setDepth(DEPTH.item);
        this.items[i] = it;
      }
    }
    this.selGfx.clear();
    this.pathGfx.clear();
  }

  /** 선택 칸 강조 링(없으면 해제). */
  setSelected(i: number | null): void {
    const g = this.selGfx;
    g.clear();
    if (i == null || i < 0) return;
    const { x, y } = this.centerOf(i);
    const r = this.geom.cell * 0.5;
    g.lineStyle(Math.max(3, this.geom.cell * 0.07), 0xf2a33c, 1);
    g.strokeRoundedRect(x - r, y - r, r * 2, r * 2, this.geom.cell * 0.18);
  }

  /** 연결 경로(확장 인덱스 배열)를 잠깐 그렸다가 사라지게 한다. */
  flashPath(expanded: ReadonlyArray<number>, holdMs = 240): void {
    const W = this.cols + 2;
    const pts = expanded.map((e) => {
      const ec = e % W;
      const er = Math.floor(e / W);
      return cellCenter(this.geom, ec - 1, er - 1); // 외곽 여백 칸은 -1/cols 좌표로 그려짐
    });
    const g = this.pathGfx;
    g.clear();
    if (pts.length >= 2) {
      const w = this.geom.cell;
      const layers = [
        { lw: w * 0.34, color: 0xffe6b0, alpha: 0.35 },
        { lw: w * 0.18, color: 0xf2a33c, alpha: 1 },
      ];
      for (const ly of layers) {
        g.lineStyle(ly.lw, ly.color, ly.alpha);
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let k = 1; k < pts.length; k++) g.lineTo(pts[k].x, pts[k].y);
        g.strokePath();
      }
    }
    this.scene.time.delayedCall(holdMs, () => g.clear());
  }

  /** 두 칸의 아이템을 제거(축소+페이드). 슬롯은 남는다. onDone 은 연출 종료 후 호출. */
  removePair(a: number, b: number, onDone?: () => void): void {
    let pending = 0;
    const kill = (i: number) => {
      const it = this.items[i];
      this.items[i] = null;
      if (!it) return;
      pending++;
      this.scene.tweens.add({
        targets: it,
        scaleX: 0,
        scaleY: 0,
        alpha: 0,
        duration: 200,
        ease: 'Back.easeIn',
        onComplete: () => {
          it.destroy();
          if (--pending <= 0) onDone?.();
        },
      });
    };
    kill(a);
    kill(b);
    if (pending === 0) onDone?.();
  }

  /** 선택 칸 살짝 튀기기(잘못된 연결 피드백 등). */
  pop(i: number): void {
    const it = this.items[i];
    if (!it) return;
    const sx = it.scaleX;
    const sy = it.scaleY;
    this.scene.tweens.killTweensOf(it);
    this.scene.tweens.add({ targets: it, scaleX: sx * 1.15, scaleY: sy * 1.15, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
  }

  destroy(): void {
    this.destroyCells();
    this.selGfx.destroy();
    this.pathGfx.destroy();
  }

  private destroyCells(): void {
    for (const s of this.slots) s.destroy();
    for (const it of this.items) it?.destroy();
    this.slots = [];
    this.items = [];
  }
}
