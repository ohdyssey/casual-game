/**
 * PlayScene — 김밥 롤 마스터 본편.
 *
 * 두 갈래로 동작한다:
 *   ① 에디터 레이아웃(main.json)에 노드가 있으면 → buildLayout 으로 렌더(SSOT) 후
 *      CookingView 가 조리 진행(발→김→밥→펴기→재료→말기→마무리→썰기→서빙)을 배선한다.
 *   ② 아직 비어 있으면 → 의도한 화면 영역을 라벨 플레이스홀더로 그린다(디자인 참고용).
 *
 * 조리 규칙은 src/logic/cookingFlow.ts 순수 상태머신에 있고 vitest 로 검증한다.
 * 규칙 기준안 = docs/GAME_RULES.md.
 */
import Phaser from 'phaser';
import { GAME_FONT_FAMILY, GAME_FONT_STYLE } from '../ui/font.js';
import {
  loadGameAssets,
  UI_CUT_LAYOUT_KEY,
  UI_LAYOUT_KEY,
  UI_ROLL1_LAYOUT_KEY,
  UI_ROLL2_LAYOUT_KEY,
  UI_SEASON_LAYOUT_KEY,
} from '../assets.js';
import { playBgm, preloadAudio } from '../audio.js';
import { INGREDIENT_LABEL, type IngredientId } from '../logic/ingredients.js';
import { buildLayout, type LayoutDoc, type LayoutIndex } from '../ui/layoutLoader.js';
import { CUT_LAYER_NODES, ROLL_STEP1_NODES, ROLL_STEP2_NODES, SEASON_NODES } from './cookingNodes.js';
import { CookingView } from './cookingView.js';

// 세로 HD 저작 프레임(에디터 main.json frame 과 동일). 코어 720 헬퍼는 쓰지 않는다.
const DESIGN_W = 1080;
const DESIGN_H = 2400;

/** 재료 진열 12칸(에디터 하단 진열과 같은 순서). */
const TRAY: ReadonlyArray<IngredientId> = [
  'danmuji', 'crab', 'egg', 'cucumber', 'burdock', 'spam',
  'cheese', 'perilla', 'carrot', 'spinach', 'tuna', 'jeyuk',
];

/** 재료 id → 플레이스홀더 색(실제 아트 전 단계의 임시 컬러칩). */
const SWATCH: Record<string, number> = {
  danmuji: 0xf2c12e, spinach: 0x2e7d32, carrot: 0xe5703a, egg: 0xf5d76e,
  spam: 0xd98880, crab: 0xe74c3c, tuna: 0xa1887f, cheese: 0xf7ca4d,
  cucumber: 0x66bb6a, burdock: 0x8d6e63, perilla: 0x33691e, jeyuk: 0xa63a1e,
};

export class PlayScene extends Phaser.Scene {
  constructor() {
    super('play');
  }

  preload(): void {
    loadGameAssets(this);
  }

  create(): void {
    // 사운드는 Phaser 로더가 아니라 WebAudio 로 따로 디코드한다(짧은 SFX 저지연 + 피치 변주).
    // 파일이 없으면 조용히 넘어가므로 로딩을 막지 않는다.
    preloadAudio();
    playBgm();

    const doc = (this.cache.json.get(UI_LAYOUT_KEY) ?? null) as LayoutDoc | null;
    if (doc && Array.isArray(doc.nodes) && doc.nodes.length > 0) {
      const layout = buildLayout(this, doc);
      const view = new CookingView(this, layout, {
        cut: this.pickNodes(UI_CUT_LAYOUT_KEY, CUT_LAYER_NODES),
        roll1: this.pickNodes(UI_ROLL1_LAYOUT_KEY, ROLL_STEP1_NODES),
        roll2: this.pickNodes(UI_ROLL2_LAYOUT_KEY, ROLL_STEP2_NODES),
        season: this.pickNodes(UI_SEASON_LAYOUT_KEY, SEASON_NODES),
      });
      view.start();
      // DEV 전용 — 헤드리스 QA 가 진행 상태를 읽기 위한 훅(형제 게임 TICTACTOE 와 같은 패턴).
      if (import.meta.env?.DEV) (window as unknown as Record<string, unknown>).__kimbap = view;
      return;
    }
    this.drawPlaceholder();
  }

  /**
   * 상태 화면(썰기·말기1·말기2)에서 **필요한 노드만** 골라 조리대 화면 위에 얹는다.
   * 이 화면들은 같은 무대를 다른 상태로 저작한 것이라, 배경·도구까지 다시 만들면 이중으로 그려진다.
   * 화면끼리 노드 id 가 겹치므로 화면마다 LayoutIndex 를 따로 만든다.
   */
  private pickNodes(cacheKey: string, ids: readonly string[]): LayoutIndex | undefined {
    const doc = (this.cache.json.get(cacheKey) ?? null) as LayoutDoc | null;
    if (!doc || !Array.isArray(doc.nodes)) return undefined;
    const wanted = new Set(ids);
    const nodes = doc.nodes.filter((n) => wanted.has(n.id));
    if (nodes.length === 0) return undefined;
    return buildLayout(this, { ...doc, nodes });
  }

  /** 에디터 디자인 전 — 의도한 화면 구조를 라벨 박스로 표현(부팅 확인 + 디자이너 참고용). */
  private drawPlaceholder(): void {
    const W = DESIGN_W;
    const H = DESIGN_H;

    // 분식점 실내 느낌의 어두운 갈색 배경 + 나무 줄무늬(임시).
    this.add.rectangle(0, 0, W, H, 0x241610).setOrigin(0, 0);
    for (let y = 0; y < H; y += 96) {
      this.add.rectangle(0, y, W, 3, 0x000000, 0.08).setOrigin(0, 0);
    }

    // ── 상단: HUD + 스테이지 진행 ─────────────────────────────────────────
    this.region(30, 30, W - 60, 130, '상단 HUD', '로고 · ❤하트 5/MAX · 🪙코인 12,450 · ⚙설정', 0x3a2a1c);
    this.region(30, 180, W - 60, 110, '스테이지 진행', 'Stage 18 · 진행 노드 게이지(○─○─○─🚩)', 0x3a2a1c);

    // ── 주문 카드 3장(규칙 ①) — 좌우엔 손님 캐릭터+말풍선 ────────────────
    this.region(30, 320, W - 60, 600, '주문 카드 영역 (1~3장)', '김밥 종류 · 추가 재료 3개 · 대기 게이지 · 진행도 / 좌우=손님+말풍선', 0x4a3522);
    this.orderCards(70, 400, W - 140, 480);

    // ── 콤보 + Perfect Roll 게이지 + 점수 ─────────────────────────────────
    this.region(30, 950, W - 60, 120, '콤보 ×6 · 말기 게이지(PERFECT ROLL!) · ⭐점수', '말기 강도가 적정 구간에 들면 Perfect Roll 판정', 0x3a2a1c);
    this.gaugeBar(260, 990, W - 500, 44);

    // ── 조리대: 좌측 단계 탭 / 중앙 대나무발 / 우측 소품 ──────────────────
    this.region(30, 1100, 190, 760, '단계', '밥 펴기\n김\n말이', 0x4a3522);
    this.region(240, 1100, 620, 760, '조리대 (대나무발+김)', '김 놓기→밥 펴기→기본 재료 자동→추가 재료 배치→말기 제스처', 0x3a2a1c);
    this.matBoard(280, 1200, 540, 560);
    this.region(880, 1100, 170, 760, '소품', '감자칩통\n깨소금\n참기름+붓', 0x4a3522);

    // 안내 배너.
    this.banner(W / 2, 1910, '김을 위로 말아주세요!');

    // ── 재료 케이스(규칙 ⑥ — 주문에 맞는 추가 재료 3개 선택) ─────────────
    this.region(30, 1970, W - 60, 250, '재료 케이스 (8칸, 이후 해금 확장)', '주문 카드의 추가 재료를 정확히 선택 — 오선택 시 정확도 감점', 0x4a3522);
    this.trayRow(60, 2040, W - 120, 150);

    // ── 액션 버튼: 말기 / 썰기 / 서빙 ─────────────────────────────────────
    this.actionRow(60, 2250, W - 120, 120);

    this.add
      .text(W / 2, H - 8, '에셋 디자인 착수 단계 — 에디터 main.json 디자인 시 이 화면이 대체됩니다', {
        fontFamily: GAME_FONT_FAMILY,
        fontStyle: GAME_FONT_STYLE,
        fontSize: '22px',
        color: '#ffd9a0',
      })
      .setOrigin(0.5, 1)
      .setAlpha(0.85);
  }

  /** 라벨 달린 영역 박스. */
  private region(x: number, y: number, w: number, h: number, title: string, sub: string, fill: number): void {
    const g = this.add.graphics();
    g.fillStyle(fill, 0.5);
    g.fillRoundedRect(x, y, w, h, 20);
    g.lineStyle(3, 0xffd9a0, 0.5);
    g.strokeRoundedRect(x, y, w, h, 20);
    this.add
      .text(x + 20, y + 14, title, { fontFamily: GAME_FONT_FAMILY,
        fontStyle: GAME_FONT_STYLE, fontSize: '30px', color: '#ffe9c8', wordWrap: { width: w - 40 } })
      .setOrigin(0, 0);
    this.add
      .text(x + 20, y + 54, sub, { fontFamily: GAME_FONT_FAMILY,
        fontStyle: GAME_FONT_STYLE, fontSize: '21px', color: '#cdb89a', wordWrap: { width: w - 40 } })
      .setOrigin(0, 0);
  }

  /** 주문 카드 3장 — 김밥 단면 + 추가 재료 3칩 + 진행 게이지. */
  private orderCards(x: number, y: number, w: number, h: number): void {
    const names = ['참치김밥', '치즈김밥', '스팸김밥'];
    const extras: IngredientId[][] = [
      ['tuna', 'spinach', 'egg'],
      ['cheese', 'spam', 'egg'],
      ['spam', 'egg', 'spinach'],
    ];
    const gap = 24;
    const cw = (w - gap * 2) / 3;
    names.forEach((name, i) => {
      const cx = x + i * (cw + gap);
      const g = this.add.graphics();
      g.fillStyle(0xf5e9d0, 0.92);
      g.fillRoundedRect(cx, y, cw, h, 18);
      this.add
        .text(cx + cw / 2, y + 40, name, { fontFamily: GAME_FONT_FAMILY,
        fontStyle: GAME_FONT_STYLE, fontSize: '32px', color: '#4a2f18' })
        .setOrigin(0.5);
      // 김밥 단면(임시 원).
      this.add.circle(cx + cw / 2, y + h * 0.42, cw * 0.28, 0x2b2b2b);
      this.add.circle(cx + cw / 2, y + h * 0.42, cw * 0.23, 0xf5f5f0);
      // 추가 재료 3칩.
      extras[i]?.forEach((ing, k) => {
        const px = cx + cw / 2 + (k - 1) * 64;
        this.add.circle(px, y + h * 0.72, 26, SWATCH[ing] ?? 0x888888);
      });
      // 진행 게이지.
      const gg = this.add.graphics();
      gg.fillStyle(0x8bc34a, 0.9);
      gg.fillRoundedRect(cx + 24, y + h - 44, (cw - 48) * 0.4, 20, 10);
      gg.lineStyle(2, 0x4a2f18, 0.4);
      gg.strokeRoundedRect(cx + 24, y + h - 44, cw - 48, 20, 10);
    });
  }

  /** Perfect Roll 게이지 — 빨강→노랑→초록 구간 바. */
  private gaugeBar(x: number, y: number, w: number, h: number): void {
    const seg = [0xe74c3c, 0xf39c12, 0xf2c12e, 0x8bc34a, 0x4caf50];
    const sw = w / seg.length;
    seg.forEach((c, i) => {
      this.add.rectangle(x + i * sw, y, sw - 4, h, c, 0.9).setOrigin(0, 0);
    });
  }

  /** 조리대 중앙 — 대나무발 + 김 + 밥/재료 스트립(임시). */
  private matBoard(x: number, y: number, w: number, h: number): void {
    // 대나무발.
    const mat = this.add.graphics();
    mat.fillStyle(0xc8a05a, 0.6);
    mat.fillRoundedRect(x, y, w, h, 12);
    for (let i = 1; i < 12; i++) mat.fillRect(x, y + (h / 12) * i, w, 2);
    // 김.
    this.add.rectangle(x + w / 2, y + h / 2, w * 0.86, h * 0.8, 0x1d2b1a).setOrigin(0.5);
    // 밥 + 재료 스트립(위→아래: 밥/참치/계란/시금치/당근/스팸/맛살).
    const strips: Array<[number, number]> = [
      [0xf5f5f0, 0.26], [0xa1887f, 0.1], [0xf5d76e, 0.08],
      [0x2e7d32, 0.08], [0xe5703a, 0.08], [0xd98880, 0.1], [0xe74c3c, 0.06],
    ];
    let sy = y + h * 0.14;
    for (const [color, ratio] of strips) {
      const sh = h * ratio * 0.72;
      this.add.rectangle(x + w / 2, sy + sh / 2, w * 0.74, sh, color).setOrigin(0.5);
      sy += sh + 4;
    }
    // 말기 방향 안내 화살표.
    this.add
      .text(x + w / 2, y + h * 0.62, '⬆', { fontSize: '72px', color: '#ffffff' })
      .setOrigin(0.5)
      .setAlpha(0.85);
  }

  /** 하단 안내 배너. */
  private banner(cx: number, cy: number, msg: string): void {
    const w = 520;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.55);
    g.fillRoundedRect(cx - w / 2, cy - 34, w, 68, 34);
    this.add
      .text(cx, cy, msg, { fontFamily: GAME_FONT_FAMILY,
        fontStyle: GAME_FONT_STYLE, fontSize: '32px', color: '#ffffff' })
      .setOrigin(0.5);
  }

  /** 재료 케이스 8칸 — 컬러칩 + 한글 라벨. */
  private trayRow(x: number, y: number, w: number, h: number): void {
    const n = TRAY.length;
    const gap = 14;
    const cw = (w - gap * (n - 1)) / n;
    TRAY.forEach((ing, i) => {
      const bx = x + i * (cw + gap);
      const g = this.add.graphics();
      g.fillStyle(0x9aa0a6, 0.35);
      g.fillRoundedRect(bx, y, cw, h, 12);
      g.fillStyle(SWATCH[ing] ?? 0x888888, 0.95);
      g.fillRoundedRect(bx + 8, y + 8, cw - 16, h - 52, 10);
      this.add
        .text(bx + cw / 2, y + h - 22, INGREDIENT_LABEL[ing], {
          fontFamily: GAME_FONT_FAMILY,
        fontStyle: GAME_FONT_STYLE,
          fontSize: '22px',
          color: '#ffffff',
        })
        .setOrigin(0.5);
    });
  }

  /** 액션 버튼 3종 — 말기(ROLL) / 썰기(CUT) / 서빙(SERVE). */
  private actionRow(x: number, y: number, w: number, h: number): void {
    const buttons: Array<[string, string, number]> = [
      ['말기', 'ROLL', 0x4caf50],
      ['썰기', 'CUT', 0x2f80ed],
      ['서빙', 'SERVE', 0xe5703a],
    ];
    const gap = 30;
    const cw = (w - gap * 2) / 3;
    buttons.forEach(([ko, en, color], i) => {
      const bx = x + i * (cw + gap);
      const g = this.add.graphics();
      g.fillStyle(color, 0.95);
      g.fillRoundedRect(bx, y, cw, h, 30);
      g.lineStyle(4, 0xffffff, 0.4);
      g.strokeRoundedRect(bx, y, cw, h, 30);
      this.add
        .text(bx + cw / 2, y + h / 2 - 14, ko, { fontFamily: GAME_FONT_FAMILY,
        fontStyle: GAME_FONT_STYLE, fontSize: '42px', color: '#ffffff' })
        .setOrigin(0.5);
      this.add
        .text(bx + cw / 2, y + h / 2 + 32, en, { fontFamily: GAME_FONT_FAMILY,
        fontStyle: GAME_FONT_STYLE, fontSize: '22px', color: '#ffffff' })
        .setOrigin(0.5)
        .setAlpha(0.85);
    });
  }
}
