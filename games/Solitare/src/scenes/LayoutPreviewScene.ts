/**
 * LayoutPreviewScene — **레벨 디자인 배치 점검**(게임이 아닌 배치 갤러리).
 *
 * 실제 플레이(PlayScene)와 **동일한 좌표 계산**으로 각 레벨의 카드 배치(클러스터 모양·커버 겹침·그룹 간격)를
 * 정적으로 렌더한다. 카드는 뒷면으로 그리고, **초기 노출(피크)** 카드는 골드 링으로 표시해 배치 설계를 검토한다.
 *   · ◀ / ▶ : 레벨 이동   · ≡ : 1~60 점프 그리드   · 🏠 : 홈
 * ⚠️ HD(1080×2400) 절대 좌표. PlayScene 의 보드 사각형/유닛 배율과 1:1 로 맞춘다(디자인 충실도).
 */
import Phaser from 'phaser';
import { loadGameAssets, BACK_BG_KEY, CARD_BACK_KEY } from '../assets.js';
import { CardView } from './cardView.js';
import { levelDef } from '../logic/levels.js';
import type { LayoutSlot } from '../logic/layouts.js';

const W = 1080;
const H = 2400;
const BASE_CARD_W = 132;
const BASE_CARD_H = 181;
// PlayScene 과 동일한 보드 영역/배율(실제 배치 그대로).
const BOARD_TOP = 715;
const BOARD_BOTTOM = 1930;
const BOARD_LEFT = 55;
const BOARD_RIGHT = 1025;
const PX_UNIT_K = 0.86; // col 1칸당 x(그룹 내부 겹침)
const PY_UNIT_K = 0.58; // row 1칸당 y(그룹 내부 겹침)
const MIN_SCALE = 0.79; // 플레이와 동일(이전 0.72 대비 +10%)

const TOTAL = 60;
const clampLevel = (n: number): number => Math.max(1, Math.min(TOTAL, Math.floor(n)));

export class LayoutPreviewScene extends Phaser.Scene {
  private level = 1;

  constructor() {
    super('preview');
  }

  init(data: { level?: number }): void {
    this.level = clampLevel(data?.level ?? 1);
  }

  preload(): void {
    loadGameAssets(this);
    if (!this.textures.exists(CARD_BACK_KEY)) {
      this.load.image(CARD_BACK_KEY, 'ui/uploads/up_Solitaire_CARD_back.png');
    }
  }

  create(): void {
    this.render();
  }

  /** 현재 레벨 배치를 다시 그린다(네비 시 재호출). */
  private render(): void {
    this.children.removeAll();
    this.drawBackground();
    this.drawBoard();
    this.drawCards();
    this.drawHeader();
    this.drawNav();
  }

  private drawBackground(): void {
    if (this.textures.exists(BACK_BG_KEY)) {
      const img = this.add.image(W / 2, H / 2, BACK_BG_KEY).setDepth(-100);
      const src = img.texture.getSourceImage() as { width: number; height: number };
      img.setScale(Math.max(W / src.width, H / src.height)).setTint(0x5a6070);
    } else {
      this.add.rectangle(W / 2, H / 2, W, H, 0x141826).setDepth(-100);
    }
    this.add.rectangle(W / 2, H / 2, W, H, 0x05060f, 0.72).setDepth(-90);
  }

  /** 보드 영역 테두리(디자인 배치 범위 시각화). */
  private drawBoard(): void {
    const g = this.add.graphics().setDepth(-50);
    g.fillStyle(0x0a0e1a, 0.55);
    g.fillRoundedRect(BOARD_LEFT - 12, BOARD_TOP - 40, BOARD_RIGHT - BOARD_LEFT + 24, BOARD_BOTTOM - BOARD_TOP + 60, 24);
    g.lineStyle(2, 0x6da7ff, 0.4);
    g.strokeRoundedRect(BOARD_LEFT - 12, BOARD_TOP - 40, BOARD_RIGHT - BOARD_LEFT + 24, BOARD_BOTTOM - BOARD_TOP + 60, 24);
  }

  private drawCards(): void {
    const layout = levelDef(this.level).layout;
    if (!layout) {
      this.add
        .text(W / 2, H / 2, '이 레벨은 아직\n만들어지지 않았어요', {
          fontFamily: '"Jua", sans-serif',
          fontSize: '54px',
          color: '#ffd54a',
          align: 'center',
        })
        .setOrigin(0.5)
        .setDepth(700);
      return;
    }
    const slots = layout.slots;
    const cols = slots.map((s) => s.col);
    const rows = slots.map((s) => s.row);
    const minC = Math.min(...cols);
    const maxC = Math.max(...cols);
    const minR = Math.min(...rows);
    const maxR = Math.max(...rows);
    const pxUnit0 = BASE_CARD_W * PX_UNIT_K;
    const pyUnit0 = BASE_CARD_H * PY_UNIT_K;
    const neededW = (maxC - minC) * pxUnit0 + BASE_CARD_W;
    const neededH = (maxR - minR) * pyUnit0 + BASE_CARD_H;
    const boardW = BOARD_RIGHT - BOARD_LEFT;
    const boardH = BOARD_BOTTOM - BOARD_TOP;
    const scale = Math.min(MIN_SCALE, boardW / neededW, boardH / neededH);
    const cardW = BASE_CARD_W * scale;
    const cardH = BASE_CARD_H * scale;
    const cx = (BOARD_LEFT + BOARD_RIGHT) / 2;
    const topY = BOARD_TOP + Math.max(0, boardH - neededH * scale) / 2 + cardH / 2;
    const colMid = (minC + maxC) / 2;
    const pxUnit = pxUnit0 * scale;
    const pyUnit = pyUnit0 * scale;

    const peaks: LayoutSlot[] = [];
    for (const s of slots) {
      const x = cx + (s.col - colMid) * pxUnit;
      const y = topY + (s.row - minR) * pyUnit;
      // 위 행(작은 row)이 앞(높은 depth) — 상단 카드가 아래 카드를 덮는다(PlayScene 과 동일).
      const depth = Math.round((maxR - s.row) * 10);
      const cv = new CardView(this, x, y, cardW, cardH, false);
      cv.showBack();
      cv.setDepth(depth);
      if (s.coveredBy.length === 0) peaks.push(s);
    }
    // 초기 노출(피크) = 골드 링(설계 검토용).
    const ring = this.add.graphics().setDepth(500);
    ring.lineStyle(Math.max(3, cardW * 0.05), 0xffd54a, 0.95);
    for (const s of peaks) {
      const x = cx + (s.col - colMid) * pxUnit;
      const y = topY + (s.row - minR) * pyUnit;
      ring.strokeRoundedRect(x - cardW / 2 + 2, y - cardH / 2 + 2, cardW - 4, cardH - 4, cardW * 0.16);
    }
  }

  private drawHeader(): void {
    const layout = levelDef(this.level).layout;
    const peaks = layout ? layout.slots.filter((s) => s.coveredBy.length === 0).length : 0;
    this.add
      .rectangle(W / 2, 90, W - 80, 130, 0x0a0e1a, 0.72)
      .setDepth(700)
      .setStrokeStyle(2, 0x6da7ff, 0.4);
    this.add
      .text(W / 2, 62, `레벨 디자인 점검 · Lv.${this.level}`, {
        fontFamily: '"Jua", sans-serif',
        fontSize: '52px',
        color: '#ffe066',
        stroke: '#20143a',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(701);
    this.add
      .text(W / 2, 118, `카드 ${layout ? layout.slots.length : 0}장 · 피크 ${peaks}개 (🟡 초기 노출)`, {
        fontFamily: '"Jua", sans-serif',
        fontSize: '30px',
        color: '#cfe0ff',
      })
      .setOrigin(0.5)
      .setDepth(701);
  }

  private drawNav(): void {
    const y = H - 150;
    const btn = (x: number, label: string, color: string, fn: () => void, w = 150): void => {
      this.add
        .text(x, y, label, {
          fontFamily: '"Jua", sans-serif',
          fontSize: '48px',
          color: '#ffffff',
          backgroundColor: color,
          fixedWidth: w,
          align: 'center',
          padding: { x: 0, y: 22 },
        })
        .setOrigin(0.5)
        .setDepth(800)
        .setShadow(0, 3, '#00000066', 6)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', fn);
    };
    btn(180, '◀', '#3a2a52', () => this.go(this.level - 1));
    btn(360, '▶', '#3a2a52', () => this.go(this.level + 1));
    btn(600, '≡ 목록', '#2e6f4f', () => this.showGrid(), 240);
    btn(900, '🏠 홈', '#c0392b', () => this.scene.start('home'), 220);
  }

  private go(level: number): void {
    this.level = clampLevel(level);
    this.render();
  }

  /** 1~60 점프 그리드(드래그 스크롤). */
  private showGrid(): void {
    const layer = this.add.container(0, 0).setDepth(2000);
    const bg = this.add.rectangle(0, 0, W, H, 0x0a0e1a, 0.95).setOrigin(0, 0).setInteractive();
    layer.add(bg);
    layer.add(
      this.add
        .text(W / 2, 120, '레벨 선택 (1~60)', {
          fontFamily: '"Jua", sans-serif',
          fontSize: '60px',
          color: '#ffe066',
          stroke: '#20143a',
          strokeThickness: 7,
        })
        .setOrigin(0.5),
    );
    const cols = 6;
    const cellW = 165;
    const cellH = 150;
    const startX = W / 2 - ((cols - 1) * cellW) / 2;
    const startY = 260;
    const gridC = this.add.container(0, 0);
    layer.add(gridC);
    for (let lv = 1; lv <= TOTAL; lv++) {
      const i = lv - 1;
      const x = startX + (i % cols) * cellW;
      const yy = startY + Math.floor(i / cols) * cellH;
      const cur = lv === this.level;
      const t = this.add
        .text(x, yy, `${lv}`, {
          fontFamily: '"Jua", sans-serif',
          fontSize: '46px',
          color: cur ? '#20143a' : '#ffffff',
          backgroundColor: cur ? '#ffd166' : '#3a2a52',
          fixedWidth: 130,
          fixedHeight: 110,
          align: 'center',
        })
        .setOrigin(0.5)
        .setPadding(0, 34, 0, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          layer.destroy();
          this.go(lv);
        });
      gridC.add(t);
    }
    const rows = Math.ceil(TOTAL / cols);
    const contentBottom = startY + rows * cellH;
    const minY = Math.min(0, H - 120 - contentBottom);
    if (minY < 0) {
      bg.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (p.isDown) gridC.y = Phaser.Math.Clamp(gridC.y + (p.position.y - p.prevPosition.y), minY, 0);
      });
    }
    layer.add(
      this.add
        .text(W / 2, H - 90, '✕ 닫기', {
          fontFamily: '"Jua", sans-serif',
          fontSize: '44px',
          color: '#ffffff',
          backgroundColor: '#c0392b',
          padding: { x: 40, y: 16 },
        })
        .setOrigin(0.5)
        .setDepth(2001)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => layer.destroy()),
    );
  }
}
