/**
 * PlayScene — 픽미업 본편(스캐폴드 단계).
 *
 * 현재는 에셋 디자인 착수 직후라 두 갈래로 동작한다:
 *   ① 에디터 레이아웃(main.json)에 노드가 있으면 → buildLayout 으로 그대로 렌더(SSOT).
 *   ② 아직 비어 있으면 → 의도한 화면 영역(승객 큐 / 픽업 슬롯 / 차량 보드 / 부스터 바)을
 *      라벨이 달린 플레이스홀더로 그린다. 디자이너가 어디에 무엇이 들어갈지 한눈에 보도록.
 *
 * 게임 로직(차량 탭→슬롯 이동, 버스 채움→출발, 보드 비우기, 부스터)은 디자인 확정 후
 * src/logic/* 순수 모듈 + vitest 로 형제 게임 패턴을 따라 얹는다.
 */
import Phaser from 'phaser';
import { GAME_WIDTH } from '@casual/core';
import { loadGameAssets, UI_LAYOUT_KEY, COLOR_IDS } from '../assets.js';
import { buildLayout, type LayoutDoc } from '../ui/layoutLoader.js';

const DESIGN_H = 1280;

/** 색 id → 플레이스홀더 색(실제 아트 전 단계의 임시 컬러칩). */
const SWATCH: Record<string, number> = {
  blue: 0x3f7fe0,
  red: 0xe24b3b,
  yellow: 0xf2c12e,
  green: 0x4caf50,
  pink: 0xe85aa0,
  orange: 0xe5703a,
};

export class PlayScene extends Phaser.Scene {
  constructor() {
    super('play');
  }

  preload(): void {
    loadGameAssets(this);
  }

  create(): void {
    const doc = (this.cache.json.get(UI_LAYOUT_KEY) ?? null) as LayoutDoc | null;
    if (doc && Array.isArray(doc.nodes) && doc.nodes.length > 0) {
      buildLayout(this, doc);
      return;
    }
    this.drawPlaceholder();
  }

  /** 에디터 디자인 전 — 의도한 화면 구조를 라벨 박스로 표현(부팅 확인 + 디자이너 참고용). */
  private drawPlaceholder(): void {
    const W = GAME_WIDTH;
    const H = DESIGN_H;

    this.add.rectangle(0, 0, W, H, 0x2a1c12).setOrigin(0, 0);
    // 나무바닥 느낌 가로 줄무늬(임시).
    for (let y = 0; y < H; y += 64) {
      this.add.rectangle(0, y, W, 2, 0x000000, 0.06).setOrigin(0, 0);
    }

    this.region(20, 20, W - 40, 120, '상단 HUD', '레벨 · 승객 30/40 · 보드 남음 · ⚙설정', 0x3a2a1c);
    this.region(20, 156, W - 40, 96, '승객 대기 큐', '색깔 승객들이 줄 서서 대기(픽업 목표)', 0x4a3522);
    this.region(20, 268, W - 40, 168, '픽업 슬롯 (열린 5 + 잠금 3)', '같은 색 버스로 차면 출발 → 슬롯 비움', 0x4a3522);
    this.colorRow(40, 196, W - 80, 56); // 승객 큐 컬러칩
    this.slotsRow(40, 300, W - 80, 120); // 슬롯 컬러칩

    this.region(20, 452, W - 40, 56, '도로', '출발한 버스가 지나가는 연출 레인', 0x222222);

    this.region(20, 524, W - 40, 596, '차량 보드 (퍼즐)', '색깔 차량이 빽빽이 — 탭하면 같은 색 슬롯으로', 0x3a2a1c);
    this.boardGrid(60, 560, W - 120, 520);

    this.region(20, 1136, W - 40, 124, '부스터 바', '슬롯추가 · 셔플 · 터보 · VIP보드', 0x3a2a1c);
    this.boosterRow(40, 1160, W - 80, 84);

    const banner = this.add
      .text(W / 2, H - 10, '에셋 디자인 착수 단계 — main.json 디자인 시 이 화면이 대체됩니다', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '18px',
        color: '#ffd9a0',
      })
      .setOrigin(0.5, 1);
    banner.setAlpha(0.85);
  }

  /** 라벨 달린 영역 박스. */
  private region(x: number, y: number, w: number, h: number, title: string, sub: string, fill: number): void {
    const g = this.add.graphics();
    g.fillStyle(fill, 0.5);
    g.fillRoundedRect(x, y, w, h, 16);
    g.lineStyle(2, 0xffd9a0, 0.5);
    g.strokeRoundedRect(x, y, w, h, 16);
    this.add
      .text(x + 16, y + 12, title, { fontFamily: '"Jua", sans-serif', fontSize: '22px', color: '#ffe9c8' })
      .setOrigin(0, 0);
    this.add
      .text(x + 16, y + 42, sub, { fontFamily: '"Jua", sans-serif', fontSize: '15px', color: '#cdb89a' })
      .setOrigin(0, 0);
  }

  /** 색깔 승객 칩 한 줄. */
  private colorRow(x: number, y: number, w: number, h: number): void {
    const n = COLOR_IDS.length;
    const gap = 10;
    const cw = (w - gap * (n - 1)) / n;
    COLOR_IDS.forEach((c, i) => {
      const cx = x + i * (cw + gap) + cw / 2;
      this.add.circle(cx, y + h / 2, Math.min(cw, h) / 2 - 4, SWATCH[c] ?? 0x888888);
    });
  }

  /** 픽업 슬롯(열린 5 + 잠금 3) 한 줄. */
  private slotsRow(x: number, y: number, w: number, h: number): void {
    const n = 8;
    const gap = 12;
    const cw = (w - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const sx = x + i * (cw + gap);
      const locked = i >= 5;
      const g = this.add.graphics();
      g.fillStyle(locked ? 0x000000 : SWATCH[COLOR_IDS[i] ?? 'blue'] ?? 0x888888, locked ? 0.25 : 0.9);
      g.fillRoundedRect(sx, y, cw, h, 12);
      g.lineStyle(2, 0xffffff, locked ? 0.2 : 0.5);
      g.strokeRoundedRect(sx, y, cw, h, 12);
      if (locked) {
        this.add
          .text(sx + cw / 2, y + h / 2, '🔒', { fontSize: '24px' })
          .setOrigin(0.5);
      }
    }
  }

  /** 차량 보드 — 임시 격자 컬러칩(실제는 아이소 다이아 배치). */
  private boardGrid(x: number, y: number, w: number, h: number): void {
    const cols = 7;
    const rows = 8;
    const gap = 6;
    const cw = (w - gap * (cols - 1)) / cols;
    const ch = (h - gap * (rows - 1)) / rows;
    const palette = COLOR_IDS;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = x + c * (cw + gap);
        const cy = y + r * (ch + gap);
        const color = SWATCH[palette[(r * cols + c) % palette.length]] ?? 0x888888;
        const g = this.add.graphics();
        g.fillStyle(color, 0.92);
        g.fillRoundedRect(cx, cy, cw, ch, 8);
        // 진행방향 화살표 힌트.
        this.add
          .text(cx + cw / 2, cy + ch / 2, '▲', { fontSize: '16px', color: '#ffffff' })
          .setOrigin(0.5)
          .setAlpha(0.8);
      }
    }
  }

  /** 하단 부스터 4종. */
  private boosterRow(x: number, y: number, w: number, h: number): void {
    const labels = ['슬롯추가', '셔플', '터보', 'VIP보드'];
    const n = labels.length;
    const gap = 14;
    const cw = (w - gap * (n - 1)) / n;
    labels.forEach((label, i) => {
      const bx = x + i * (cw + gap);
      const g = this.add.graphics();
      g.fillStyle(0x2f80ed, 0.9);
      g.fillRoundedRect(bx, y, cw, h, 14);
      g.lineStyle(2, 0xffffff, 0.4);
      g.strokeRoundedRect(bx, y, cw, h, 14);
      this.add
        .text(bx + cw / 2, y + h / 2, label, {
          fontFamily: '"Jua", sans-serif',
          fontSize: '20px',
          color: '#ffffff',
        })
        .setOrigin(0.5);
    });
  }
}
