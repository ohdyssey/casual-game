/**
 * BattleScene — 레인 디펜스 본편 씬.
 *   에디터 레이아웃(main.json)을 단일 진실 공급원으로 렌더한다. 디자인이 비어 있으면
 *   참조 이미지의 화면 구획(헤더 HP·마나·5레인·덱·특수기 바)을 보여주는 자리표시자 스캐폴드를
 *   대신 그린다 — 에디터에서 무엇을 어디에 배치할지 시각 가이드 역할.
 *
 *   전투 시뮬레이션(스폰/이동/교전)은 후속 단계에서 logic/ 모듈과 결선한다.
 */
import Phaser from 'phaser';
import { GAME_WIDTH } from '@casual/core';
import { LAYOUT_KEY } from '../assets.js';
import { buildLayout, type LayoutDoc } from '../ui/layoutLoader.js';
import { LANE_COUNT, MANA_MAX } from '../logic/types.js';
import { ABILITY_ORDER, ABILITY_SPECS, DECK_ORDER, UNIT_SPECS } from '../logic/roster.js';

export class BattleScene extends Phaser.Scene {
  constructor() {
    super('battle');
  }

  create(): void {
    const doc = (this.cache.json.get(LAYOUT_KEY) ?? null) as LayoutDoc | null;
    const hasDesign = !!doc && Array.isArray(doc.nodes) && doc.nodes.length > 0;

    if (hasDesign) {
      buildLayout(this, doc as LayoutDoc);
    } else {
      this.drawPlaceholder();
    }
  }

  /** 에디터 디자인이 없을 때의 구획 스캐폴드(참조 이미지 레이아웃 존). */
  private drawPlaceholder(): void {
    const W = GAME_WIDTH; // 720
    const H = this.scale.height;
    const cx = W / 2;

    // 배경 그라데이션 대용 — 하늘/필드 톤 2분할.
    this.add.rectangle(cx, H * 0.22, W, H * 0.44, 0x7fb2e6).setOrigin(0.5); // 하늘
    this.add.rectangle(cx, H * 0.66, W, H * 0.66, 0xc99a5b).setOrigin(0.5); // 흙 필드

    // ── 상단: 적 본진 HP 바(존 라벨) ──
    this.zone(cx, 70, W - 80, 56, 0xb23a2e, '적 본진 HP  (Wave 1/3)');

    // ── 5개 레인 가이드 ──
    const laneTop = 150;
    const laneBottom = H - 360;
    const laneH = laneBottom - laneTop;
    const laneW = (W - 80) / LANE_COUNT;
    for (let i = 0; i < LANE_COUNT; i++) {
      const lx = 40 + laneW * i + laneW / 2;
      const tint = i % 2 === 0 ? 0x6f8f3f : 0x7c9c47;
      this.add.rectangle(lx, laneTop + laneH / 2, laneW - 8, laneH, tint, 0.55).setOrigin(0.5);
      this.add
        .text(lx, laneBottom - 20, `레인 ${i + 1}`, {
          fontFamily: '"Jua", sans-serif',
          fontSize: '18px',
          color: '#ffffff',
        })
        .setOrigin(0.5)
        .setAlpha(0.7);
    }

    // ── 좌상단: 마나(물방울) HUD ──
    this.zone(95, laneTop + 30, 120, 48, 0x2f6fb0, `마나 6/${MANA_MAX}`);

    // ── 좌측: 유닛 덱 카드 4종 ──
    let cardY = laneTop + 110;
    for (const kind of DECK_ORDER) {
      const u = UNIT_SPECS[kind];
      this.card(70, cardY, 96, 96, 0x6a4a8a, `${u.name}\n${u.cost}💧`);
      cardY += 108;
    }

    // ── 하단: 아군 본진 HP 바 ──
    this.zone(cx, H - 290, W - 80, 48, 0x2f74b0, '아군 본진 HP');

    // ── 하단: 특수기 4버튼 ──
    const abilW = (W - 100) / 4;
    let abx = 50 + abilW / 2;
    const colors = [0x2f8fc0, 0x3fae5a, 0xc0792a, 0x8a3fb0];
    ABILITY_ORDER.forEach((kind, i) => {
      const a = ABILITY_SPECS[kind];
      this.add.circle(abx, H - 130, 44, colors[i]).setStrokeStyle(4, 0xffe08a);
      this.add
        .text(abx, H - 130, `${a.name}\n${a.cost}💧`, {
          fontFamily: '"Jua", sans-serif',
          fontSize: '15px',
          color: '#ffffff',
          align: 'center',
        })
        .setOrigin(0.5);
      abx += abilW;
    });

    // ── 안내 문구 ──
    this.add
      .text(cx, H - 40, '독립 에디터에서 UI를 배치하면 이 자리표시자를 대체합니다', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '16px',
        color: '#ffe3b3',
      })
      .setOrigin(0.5)
      .setAlpha(0.8);
  }

  /** 라벨 달린 둥근 존 박스. */
  private zone(x: number, y: number, w: number, h: number, color: number, label: string): void {
    this.add.rectangle(x, y, w, h, color, 0.9).setStrokeStyle(3, 0xffe08a).setOrigin(0.5);
    this.add
      .text(x, y, label, { fontFamily: '"Jua", sans-serif', fontSize: '20px', color: '#ffffff', align: 'center' })
      .setOrigin(0.5);
  }

  /** 좌측 덱 카드. */
  private card(x: number, y: number, w: number, h: number, color: number, label: string): void {
    this.add.rectangle(x, y, w, h, color, 0.95).setStrokeStyle(3, 0xffe08a).setOrigin(0.5);
    this.add
      .text(x, y, label, { fontFamily: '"Jua", sans-serif', fontSize: '16px', color: '#ffffff', align: 'center' })
      .setOrigin(0.5);
  }
}
