/**
 * boardView.ts — 격자(패널) 렌더러. 에디터의 보드 패널(UI_01, 정사각) 안에 칸들을 **정확히** 배치한다.
 *
 * 핵심 계산(요구사항): 레벨이 오르며 칸 수가 늘고 형태(cols×rows)가 다양해져도, 그리고 그에 따라
 * 칸 크기가 줄어도 — 셀은 항상 정사각이고 그리드 블록은 패널 정중앙에 정렬된다.
 *
 *   pitch = min(inner/cols, inner/rows)   ← 정사각 셀 보장(가로·세로 동일 간격)
 *   gridW = pitch·cols, gridH = pitch·rows
 *   left  = panelCx − gridW/2,  top = panelCy − gridH/2   ← 블록 중앙 정렬
 *   center(c,r) = (left + (c+0.5)·pitch, top + (r+0.5)·pitch)
 *
 * 선(빛나는 경로)·노드·셀 강조는 모두 pitch 의 비율로 그려 어떤 크기에서도 비례가 유지된다.
 */
import Phaser from 'phaser';
import { SLOT_KEY, TILE_KEYS } from '../assets.js';
import { colOf, rowOf, type Rng } from '../logic/board.js';

/**
 * 보드가 차지할 수 있는 최대 영역 — 중심 + 가로/세로 최대치(px, 720×1280 디자인 좌표).
 * 실제 패널(UI_01)은 이 한도 안에서 그리드 형태에 맞춰 크기/비율이 변형된다.
 */
export interface BoardArea {
  readonly cx: number;
  readonly cy: number;
  readonly maxW: number;
  readonly maxH: number;
}

/** 그리드 + 패널 기하 — 영역·cols·rows 로부터 결정. */
export interface CellLayout {
  readonly cols: number;
  readonly rows: number;
  readonly pitch: number;
  readonly left: number;
  readonly top: number;
  readonly panelW: number; // 외곽 바닥 패널(UI_01) 표시 가로
  readonly panelH: number; // 외곽 바닥 패널(UI_01) 표시 세로
}

// ── 튜닝 상수 ──
const BOARD_INSET_FRAC = 0.035; // 패널 베벨 두께(변 길이 대비). 그리드는 안쪽 평면을 꽉 채운다(디자이너 샘플 ≈10px/369).
const SLOT_FILL = 0.98; // 슬롯 스프라이트 크기 = pitch × 이 값
const TILE_FILL = 0.86; // 타일(퍼즐 조각) 크기 = pitch × 이 값
// 타일은 항상 원본 그대로 불투명(1.0). 진행 표시는 빛나는 경로 선·시작/도착 노드로 한다.
// (미방문 타일을 반투명으로 어둡게 하면 뒤의 어두운 마룬 슬롯이 비쳐 색이 탁해진다 — 원본 색감 보존.)
const DEPTH = { slot: 5, tile: 6, path: 8, node: 9 } as const;

/**
 * 영역(최대 박스)에 cols×rows 그리드를 맞추고, 그 그리드를 꽉 감싸는 패널 크기를 계산.
 *  - pitch = min(innerMaxW/cols, innerMaxH/rows) → 정사각 셀(가로=세로 간격), 박스 안에 완전히 수용
 *  - 그리드 블록은 영역 중앙 정렬
 *  - 패널 표시크기 = 그리드 / (1−2·inset) → 패널 안쪽 평면이 그리드와 일치(외곽 패널이 형태에 맞춰 변형)
 */
export function computeCellLayout(area: BoardArea, cols: number, rows: number): CellLayout {
  const f = 1 - 2 * BOARD_INSET_FRAC;
  const pitch = Math.min((area.maxW * f) / cols, (area.maxH * f) / rows);
  const gridW = pitch * cols;
  const gridH = pitch * rows;
  return {
    cols,
    rows,
    pitch,
    left: area.cx - gridW / 2,
    top: area.cy - gridH / 2,
    panelW: gridW / f,
    panelH: gridH / f,
  };
}

export class BoardView {
  private layout: CellLayout = { cols: 0, rows: 0, pitch: 0, left: 0, top: 0, panelW: 0, panelH: 0 };
  private slots: Phaser.GameObjects.Image[] = [];
  private tiles: Phaser.GameObjects.Image[] = [];
  private readonly pathGfx: Phaser.GameObjects.Graphics;
  private readonly nodeGfx: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly area: BoardArea,
    private readonly panelImg?: Phaser.GameObjects.Image,
  ) {
    this.pathGfx = scene.add.graphics().setDepth(DEPTH.path);
    this.nodeGfx = scene.add.graphics().setDepth(DEPTH.node);
  }

  get cols(): number {
    return this.layout.cols;
  }
  get rows(): number {
    return this.layout.rows;
  }
  get cellCount(): number {
    return this.layout.cols * this.layout.rows;
  }

  /** 칸 중심의 화면 좌표(디자인 좌표). */
  centerOf(i: number): { x: number; y: number } {
    const { left, top, pitch, cols } = this.layout;
    return {
      x: left + (colOf(i, cols) + 0.5) * pitch,
      y: top + (rowOf(i, cols) + 0.5) * pitch,
    };
  }

  /** 화면 좌표 → 칸 인덱스(영역 밖이면 -1). */
  cellAt(x: number, y: number): number {
    const { left, top, pitch, cols, rows } = this.layout;
    const c = Math.floor((x - left) / pitch);
    const r = Math.floor((y - top) / pitch);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return -1;
    return r * cols + c;
  }

  /** 새 그리드 구성 — 외곽 패널을 그리드 형태에 맞춰 변형하고, 슬롯·타일을 정확한 위치/크기로 재생성. */
  build(cols: number, rows: number, rng: Rng = Math.random): void {
    this.destroyCells();
    this.layout = computeCellLayout(this.area, cols, rows);
    // 외곽 바닥 패널(UI_01)을 그리드를 꽉 감싸는 크기로 변형(형태·비율이 그리드에 맞춰 바뀐다).
    this.panelImg?.setDisplaySize(this.layout.panelW, this.layout.panelH).setPosition(this.area.cx, this.area.cy);
    const n = cols * rows;
    const slotSize = this.layout.pitch * SLOT_FILL;
    const tileSize = this.layout.pitch * TILE_FILL;
    for (let i = 0; i < n; i++) {
      const { x, y } = this.centerOf(i);
      const slot = this.scene.add.image(x, y, SLOT_KEY).setDisplaySize(slotSize, slotSize).setDepth(DEPTH.slot);
      const key = TILE_KEYS[Math.floor(rng() * TILE_KEYS.length)] ?? TILE_KEYS[0];
      const tile = this.scene.add.image(x, y, key).setDisplaySize(tileSize, tileSize).setDepth(DEPTH.tile);
      this.slots.push(slot);
      this.tiles.push(tile);
    }
    this.pathGfx.clear();
    this.nodeGfx.clear();
  }

  /** 플레이어 경로 + 시작/도착 노드를 다시 그린다(타일 색은 원본 그대로, 진행은 경로 선으로 표시). */
  renderPath(player: readonly number[], startCell: number, endCell: number): void {
    this.drawPathLine(player);
    this.drawNodes(player, startCell, endCell);
  }

  /** 클리어 연출 — 경로 위 칸을 차례로 살짝 튀게(빠른 yoyo). */
  celebrate(player: readonly number[]): void {
    player.forEach((cell, k) => {
      const tile = this.tiles[cell];
      if (!tile) return;
      const s = tile.scaleX;
      this.scene.tweens.add({
        targets: tile,
        scaleX: s * 1.16,
        scaleY: s * 1.16,
        duration: 130,
        delay: k * 14,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    });
  }

  destroy(): void {
    this.destroyCells();
    this.pathGfx.destroy();
    this.nodeGfx.destroy();
  }

  // ── 내부 ──

  private destroyCells(): void {
    for (const s of this.slots) s.destroy();
    for (const t of this.tiles) t.destroy();
    this.slots = [];
    this.tiles = [];
  }

  private drawPathLine(player: readonly number[]): void {
    const g = this.pathGfx;
    g.clear();
    if (player.length === 0) return;
    const pitch = this.layout.pitch;
    const pts = player.map((i) => this.centerOf(i));

    if (player.length === 1) {
      // 시작만 — 작은 점(시작 노드가 위에 그려짐).
      return;
    }
    // 3겹: 넓은 글로우 → 중간 → 코어. 둥근 조인트로 부드럽게.
    const layers: Array<{ w: number; color: number; alpha: number }> = [
      { w: pitch * 0.5, color: 0xffd86e, alpha: 0.22 },
      { w: pitch * 0.4, color: 0xffe89a, alpha: 0.55 },
      { w: pitch * 0.26, color: 0xffc23d, alpha: 1 },
    ];
    for (const ly of layers) {
      g.lineStyle(ly.w, ly.color, ly.alpha);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) g.lineTo(pts[k].x, pts[k].y);
      g.strokePath();
    }
  }

  private drawNodes(player: readonly number[], startCell: number, endCell: number): void {
    const g = this.nodeGfx;
    g.clear();
    const pitch = this.layout.pitch;
    const r = pitch * 0.24;
    const s = this.centerOf(startCell);
    const e = this.centerOf(endCell);
    const reached = player.length > 1 && player[player.length - 1] === endCell;

    // 시작: 채워진 금색 원.
    g.fillStyle(0xffe89a, 1);
    g.fillCircle(s.x, s.y, r);
    g.lineStyle(Math.max(3, pitch * 0.06), 0xe8a21e, 1);
    g.strokeCircle(s.x, s.y, r);

    // 도착: 링(도달 시 안쪽이 채워짐).
    g.fillStyle(reached ? 0xffe89a : 0xffffff, reached ? 1 : 0.85);
    g.fillCircle(e.x, e.y, r);
    g.lineStyle(Math.max(4, pitch * 0.08), 0xe8a21e, 1);
    g.strokeCircle(e.x, e.y, r);
    g.fillStyle(0xe8a21e, reached ? 1 : 0.45);
    g.fillCircle(e.x, e.y, r * 0.5);
  }
}
