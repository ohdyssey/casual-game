/**
 * PlayScene — 포링크룸 본편 (탭 연결 라인 퍼즐).
 *
 * 화면: 에디터 main.json(SSOT) 렌더 — 배경/HUD/목표 패널/시간 게이지/하단 부스터바.
 *       퍼즐 그리드(셀·아이템)는 "퍼즐 배경" 패널 기준으로 gridLayout 비례 동적 생성(BoardView).
 *       에디터의 정적 샘플 셀(UI_15)·아이템(UI_09)은 숨기고 실제 보드를 그 위에 계산 배치.
 *
 * 흐름: 같은 아이템 2개를 탭 → ≤2꺾임 경로면 연결·제거. 보드를 다 비우면 클리어 → 다음 레벨(더 큼).
 *       연결 가능한 쌍이 없으면 자동 셔플(솔버블 유지). 시간 초과 시 같은 레벨 새 보드(관대).
 */
import Phaser from 'phaser';
import { UI_LAYOUT_KEY, SPARK_KEY } from '../assets.js';
import { buildLayout, type LayoutDoc, type LayoutIndex } from '../ui/layoutLoader.js';
import { fillCoverLayout } from '@casual/core';
import { BoardView } from '../ui/boardView.js';
import type { Panel } from '../logic/gridLayout.js';
import {
  connectableCells,
  findPathCells,
  findAnyMove,
  hasMove,
  removePair,
  reshuffle,
} from '../logic/connect.js';
import { levelSpec, buildLevelBoard, goalsFor, scoreForPair, type Goal } from '../logic/levels.js';
import { filledCount, type Board, type ItemType } from '../logic/types.js';
import { itemTexKey } from '../assets.js';

// ── 에디터 노드 id (main.json) ──
const NODE = {
  puzzleBg: 'layer_4', // 퍼즐 배경 rect(그리드 앵커)
  timeText: 'layer_3', // "01:28"
  levelText: 'layer_3_copy8', // "45"
  coinText: 'layer_3_copy6', // "12,450"
  gemText: 'layer_3_copy7', // "300"
  timeGauge: 'layer_2_copy6', // 시간 게이지 UI_08
  goalPanel: 'layer_2_copy4', // 목표 말풍선 UI_16
  btnHint: 'layer_2_copy43', // UI_10
  btnShuffle: 'layer_2_copy44', // UI_11
  btnTimeStop: 'layer_2_copy46', // UI_12
  btnAutoLink: 'layer_2_copy45', // UI_13
  btnBomb: 'layer_2_copy47', // UI_14
} as const;

const MAX_TURNS = 2;
const SCORE_KEY = 'pawlink_best_v1';
const TIMESTOP_SEC = 8;
const ADVANCE_MS = 1100;

type Phase = 'playing' | 'cleared' | 'timeup';
type Booster = 'hint' | 'shuffle' | 'timeStop' | 'autoLink' | 'bomb';

export class PlayScene extends Phaser.Scene {
  private layout!: LayoutIndex;
  private board!: Board;
  private view!: BoardView;
  private panel: Panel = { cx: 361, cy: 766, w: 641, h: 648 };

  // 진행
  private level = 1;
  private score = 0;
  private best = 0;
  private combo = 0;
  private timeLimit = 60;
  private timeLeft = 60;
  private timeStopLeft = 0;
  private phase: Phase = 'playing';
  private phaseT = 0;
  private selected = -1;

  // 부스터 잔여
  private boosters: Record<Booster, number> = { hint: 5, shuffle: 4, timeStop: 3, autoLink: 3, bomb: 2 };

  // 목표
  private goals: Goal[] = [];
  private goalIcons: Phaser.GameObjects.Image[] = [];
  private goalTexts: Phaser.GameObjects.Text[] = [];

  // HUD 참조
  private timeText?: Phaser.GameObjects.Text;
  private levelText?: Phaser.GameObjects.Text;
  private timerBar!: Phaser.GameObjects.Graphics;
  private badges: Partial<Record<Booster, Phaser.GameObjects.Text>> = {};
  private popupText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private toastT = 0;

  constructor() {
    super('play');
  }

  create(): void {
    const doc = this.cache.json.get(UI_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!doc?.nodes) {
      this.add
        .text(this.scale.width / 2, this.scale.height / 2, '레이아웃을 불러오지 못했습니다', {
          fontFamily: '"Jua", sans-serif',
          fontSize: '26px',
          color: '#fff',
        })
        .setOrigin(0.5);
      return;
    }

    // 1) 에디터 SSOT 렌더 + 샘플 그리드 숨김.
    this.layout = buildLayout(this, doc);
    // 반응형 — 창 높이로 채우고 배경 cover + 하단 부스터 바닥정렬(FIT 레터박스 제거).
    fillCoverLayout(this, this.layout);
    this.hideSampleGrid();

    // 2) 퍼즐 패널 → BoardView.
    const pn = this.layout.nodeById(NODE.puzzleBg);
    if (pn?.w && pn?.h) this.panel = { cx: pn.x, cy: pn.y, w: pn.w, h: pn.h };
    this.view = new BoardView(this, this.panel);

    // 3) HUD 바인딩.
    this.timeText = this.layout.tryById<Phaser.GameObjects.Text>(NODE.timeText);
    this.levelText = this.layout.tryById<Phaser.GameObjects.Text>(NODE.levelText);
    this.bindBoosterButtons();
    this.timerBar = this.add.graphics().setDepth(8);

    // 4) 연출 텍스트.
    this.popupText = this.add
      .text(this.panel.cx, this.panel.cy - 20, '', { fontFamily: '"Do Hyeon", sans-serif', fontSize: '52px', color: '#ffe07a' })
      .setOrigin(0.5)
      .setStroke('#6a3a12', 9)
      .setDepth(60)
      .setVisible(false);
    this.toastText = this.add
      .text(this.panel.cx, this.panel.cy + this.panel.h / 2 + 30, '', { fontFamily: '"Jua", sans-serif', fontSize: '26px', color: '#ffe8b0' })
      .setOrigin(0.5)
      .setStroke('#3a1e0c', 6)
      .setDepth(60)
      .setVisible(false);

    // 5) 입력.
    this.input.on('pointerdown', this.onPointerDown, this);

    // 6) 시작.
    this.best = this.loadBest();
    this.level = 1;
    this.score = 0;
    this.combo = 0;
    this.boosters = { hint: 5, shuffle: 4, timeStop: 3, autoLink: 3, bomb: 2 };
    this.newLevel();
  }

  // ── 셋업 ─────────────────────────────────────────────────────
  private hideSampleGrid(): void {
    for (const e of this.layout.entries()) {
      const key = e.node.key ?? '';
      if (key === 'up_PawLink_UI_15' || key.startsWith('up_PawLink_UI_09-')) e.obj.setVisible(false);
    }
  }

  private bindBoosterButtons(): void {
    this.wireButton(NODE.btnHint, () => this.useHint());
    this.wireButton(NODE.btnShuffle, () => this.useShuffle());
    this.wireButton(NODE.btnTimeStop, () => this.useTimeStop());
    this.wireButton(NODE.btnAutoLink, () => this.useAutoLink());
    this.wireButton(NODE.btnBomb, () => this.useBomb());
    this.badges.hint = this.makeBadge(NODE.btnHint);
    this.badges.shuffle = this.makeBadge(NODE.btnShuffle);
    this.badges.timeStop = this.makeBadge(NODE.btnTimeStop);
    this.badges.autoLink = this.makeBadge(NODE.btnAutoLink);
    this.badges.bomb = this.makeBadge(NODE.btnBomb);
  }

  private wireButton(id: string, handler: () => void): void {
    const obj = this.layout.tryById<Phaser.GameObjects.Image>(id);
    if (!obj) return;
    const sx = obj.scaleX;
    const sy = obj.scaleY;
    obj.setInteractive({ useHandCursor: true });
    obj.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation?.();
      this.tweens.killTweensOf(obj);
      obj.setScale(sx, sy);
      this.tweens.add({ targets: obj, scaleX: sx * 0.86, scaleY: sy * 0.86, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
      handler();
    });
  }

  private makeBadge(id: string): Phaser.GameObjects.Text | undefined {
    const n = this.layout.nodeById(id);
    if (!n) return undefined;
    return this.add
      .text(n.x + (n.w ?? 90) * 0.3, n.y - (n.h ?? 90) * 0.34, '', {
        fontFamily: '"Do Hyeon", sans-serif',
        fontSize: '22px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setStroke('#1f7a2e', 5)
      .setDepth((n.depth ?? 50) + 2);
  }

  // ── 레벨/보드 ────────────────────────────────────────────────
  private newLevel(): void {
    const spec = levelSpec(this.level);
    this.board = buildLevelBoard(spec);
    this.timeLimit = spec.timeSec;
    this.timeLeft = spec.timeSec;
    this.timeStopLeft = 0;
    this.combo = 0;
    this.selected = -1;
    this.phase = 'playing';
    this.phaseT = 0;
    this.view.build(this.board);
    this.view.setSelected(null);
    this.buildGoals();
    this.refreshHud();
  }

  /** 시간 초과 → 같은 레벨 새 보드(관대). */
  private regenSameLevel(): void {
    const spec = levelSpec(this.level);
    this.board = buildLevelBoard(spec);
    this.timeLimit = spec.timeSec;
    this.timeLeft = spec.timeSec;
    this.timeStopLeft = 0;
    this.combo = 0;
    this.selected = -1;
    this.phase = 'playing';
    this.view.build(this.board);
    this.view.setSelected(null);
    this.buildGoals();
    this.refreshHud();
  }

  private buildGoals(): void {
    for (const i of this.goalIcons) i.destroy();
    for (const t of this.goalTexts) t.destroy();
    this.goalIcons = [];
    this.goalTexts = [];
    this.goals = goalsFor(this.board, 3);
    const n = this.layout.nodeById(NODE.goalPanel);
    const cx = n?.x ?? 241;
    const cy = (n?.y ?? 261) + (n?.h ?? 185) * 0.06;
    const w = n?.w ?? 322;
    const iconSize = (n?.h ?? 185) * 0.4;
    const spacing = w * 0.26;
    const depth = (n?.depth ?? 5) + 2;
    const startX = cx - spacing * (this.goals.length - 1) / 2;
    this.goals.forEach((g, k) => {
      const x = startX + k * spacing;
      const icon = this.add.image(x, cy, itemTexKey(g.type)).setDisplaySize(iconSize, iconSize).setDepth(depth);
      const txt = this.add
        .text(x, cy + iconSize * 0.72, String(g.count), {
          fontFamily: '"Do Hyeon", sans-serif',
          fontSize: '22px',
          color: '#5a3a1a',
        })
        .setOrigin(0.5)
        .setDepth(depth);
      this.goalIcons.push(icon);
      this.goalTexts.push(txt);
    });
    this.updateGoals();
  }

  private updateGoals(): void {
    const counts = new Map<ItemType, number>();
    for (const v of this.board.cells) if (v != null) counts.set(v, (counts.get(v) ?? 0) + 1);
    this.goals.forEach((g, k) => {
      const cur = counts.get(g.type) ?? 0;
      const txt = this.goalTexts[k];
      if (!txt) return;
      if (cur <= 0) {
        txt.setText('✓').setColor('#2f9e44');
        this.goalIcons[k]?.setAlpha(0.45);
      } else {
        txt.setText(String(cur)).setColor('#5a3a1a');
      }
    });
  }

  // ── 입력/연결 ────────────────────────────────────────────────
  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (this.phase !== 'playing') return;
    const i = this.view.cellIndexAt(p.x, p.y);
    if (i < 0 || this.board.cells[i] == null) {
      this.selected = -1;
      this.view.setSelected(null);
      return;
    }
    if (this.selected < 0) {
      this.selected = i;
      this.view.setSelected(i);
      return;
    }
    if (this.selected === i) {
      this.selected = -1;
      this.view.setSelected(null);
      return;
    }
    if (this.board.cells[this.selected] !== this.board.cells[i]) {
      this.selected = i; // 다른 종류 → 선택 이동
      this.view.setSelected(i);
      return;
    }
    // 같은 종류 → 연결 시도
    if (connectableCells(this.board, this.selected, i, MAX_TURNS)) {
      const path = findPathCells(this.board, this.selected, i, MAX_TURNS);
      if (path) this.view.flashPath(path);
      this.resolveMatch(this.selected, i);
    } else {
      this.view.pop(i);
      this.view.pop(this.selected);
      this.toast('연결할 수 없어요');
      this.selected = i;
      this.view.setSelected(i);
    }
  }

  private resolveMatch(a: number, b: number): void {
    const matchType = this.board.cells[a];
    this.board = removePair(this.board, a, b);
    this.combo += 1;
    this.score += scoreForPair(this.level, this.combo);
    if (this.score > this.best) {
      this.best = this.score;
      this.saveBest(this.best);
    }
    this.selected = -1;
    this.view.setSelected(null);
    const c = this.view.centerOf(b);
    this.burst(c.x, c.y);
    this.view.removePair(a, b, () => {
      this.updateGoals();
      this.afterRemoval(matchType);
    });
    this.refreshHud();
  }

  private afterRemoval(_matchType: ItemType | null): void {
    if (filledCount(this.board) === 0) {
      this.triggerClear();
      return;
    }
    if (!hasMove(this.board, MAX_TURNS)) {
      this.board = reshuffle(this.board, MAX_TURNS);
      this.view.build(this.board);
      this.updateGoals();
      this.toast('연결 가능한 짝이 없어 섞었어요');
    }
  }

  private triggerClear(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'cleared';
    this.phaseT = 0;
    this.showPopup('클리어!');
    this.toast(`+${this.score.toLocaleString()}점`);
  }

  // ── 부스터 ───────────────────────────────────────────────────
  private useHint(): void {
    if (this.phase !== 'playing') return;
    if (this.boosters.hint <= 0) return this.toast('힌트 없음');
    const m = findAnyMove(this.board, MAX_TURNS);
    if (!m) return this.toast('연결 가능한 짝이 없어요');
    this.boosters.hint--;
    const path = findPathCells(this.board, m.a, m.b, MAX_TURNS);
    if (path) this.view.flashPath(path, 900);
    this.view.pop(m.a);
    this.view.pop(m.b);
    this.refreshHud();
  }

  private useShuffle(): void {
    if (this.phase !== 'playing') return;
    if (this.boosters.shuffle <= 0) return this.toast('셔플 없음');
    this.boosters.shuffle--;
    this.board = reshuffle(this.board, MAX_TURNS);
    this.view.build(this.board);
    this.updateGoals();
    this.selected = -1;
    this.refreshHud();
    this.toast('보드를 섞었어요');
  }

  private useTimeStop(): void {
    if (this.phase !== 'playing') return;
    if (this.boosters.timeStop <= 0) return this.toast('시간정지 없음');
    this.boosters.timeStop--;
    this.timeStopLeft = Math.max(this.timeStopLeft, TIMESTOP_SEC);
    this.refreshHud();
    this.toast(`시간 정지 ${TIMESTOP_SEC}초`);
  }

  private useAutoLink(): void {
    if (this.phase !== 'playing') return;
    if (this.boosters.autoLink <= 0) return this.toast('자동연결 없음');
    const m = findAnyMove(this.board, MAX_TURNS);
    if (!m) return this.toast('연결 가능한 짝이 없어요');
    this.boosters.autoLink--;
    const path = findPathCells(this.board, m.a, m.b, MAX_TURNS);
    if (path) this.view.flashPath(path);
    this.resolveMatch(m.a, m.b);
  }

  private useBomb(): void {
    if (this.phase !== 'playing') return;
    if (this.boosters.bomb <= 0) return this.toast('폭탄 없음');
    // 폭탄: 연결 여부와 무관하게 같은 종류 한 쌍을 제거.
    const pair = this.anySameTypePair();
    if (!pair) return this.toast('제거할 짝이 없어요');
    this.boosters.bomb--;
    const c = this.view.centerOf(pair.b);
    this.burst(c.x, c.y);
    this.board = removePair(this.board, pair.a, pair.b);
    this.selected = -1;
    this.view.setSelected(null);
    this.view.removePair(pair.a, pair.b, () => {
      this.updateGoals();
      this.afterRemoval(null);
    });
    this.refreshHud();
  }

  private anySameTypePair(): { a: number; b: number } | null {
    const byType = new Map<ItemType, number[]>();
    for (let i = 0; i < this.board.cells.length; i++) {
      const v = this.board.cells[i];
      if (v == null) continue;
      let arr = byType.get(v);
      if (!arr) { arr = []; byType.set(v, arr); }
      arr.push(i);
    }
    for (const arr of byType.values()) if (arr.length >= 2) return { a: arr[0], b: arr[1] };
    return null;
  }

  // ── 루프 ─────────────────────────────────────────────────────
  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastText.setVisible(false);
    }
    if (this.phase === 'playing') {
      if (this.timeStopLeft > 0) {
        this.timeStopLeft = Math.max(0, this.timeStopLeft - dt);
      } else {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
          this.timeLeft = 0;
          this.triggerTimeup();
        }
      }
      this.updateTimeText();
    } else {
      this.phaseT += dt;
      if (this.phaseT > ADVANCE_MS / 1000) {
        this.hidePopup();
        if (this.phase === 'cleared') {
          this.level += 1;
          this.newLevel();
        } else {
          this.regenSameLevel();
        }
      }
    }
    this.drawTimerBar();
  }

  private triggerTimeup(): void {
    this.phase = 'timeup';
    this.phaseT = 0;
    this.combo = 0;
    this.selected = -1;
    this.view.setSelected(null);
    this.showPopup('시간 종료!');
  }

  // ── HUD/연출 ─────────────────────────────────────────────────
  private refreshHud(): void {
    this.levelText?.setText(String(this.level));
    this.updateTimeText();
    this.badges.hint?.setText(String(this.boosters.hint));
    this.badges.shuffle?.setText(String(this.boosters.shuffle));
    this.badges.timeStop?.setText(String(this.boosters.timeStop));
    this.badges.autoLink?.setText(String(this.boosters.autoLink));
    this.badges.bomb?.setText(String(this.boosters.bomb));
  }

  private updateTimeText(): void {
    const s = Math.max(0, Math.ceil(this.timeLeft));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    const low = this.timeStopLeft <= 0 && this.timeLimit > 0 && this.timeLeft / this.timeLimit < 0.25;
    this.timeText?.setText(`${mm < 10 ? '0' + mm : mm}:${ss < 10 ? '0' + ss : ss}`);
    this.timeText?.setColor(this.timeStopLeft > 0 ? '#7ad0ff' : low ? '#ff6b6b' : '#ffffff');
  }

  private drawTimerBar(): void {
    const n = this.layout.nodeById(NODE.timeGauge);
    if (!n) return;
    const g = this.timerBar;
    g.clear();
    // UI_08 트랙(별 박힌 브라운 바)의 안쪽 채널에 정확히 맞춰 채운다 — 좌우 라운드 캡 인셋 + 막대 두께.
    const trackW = n.w ?? 560;
    const trackH = n.h ?? 52;
    const cap = trackH * 0.42; // 좌우 둥근 끝(채널 시작 인셋)
    const innerW = trackW - cap * 2; // 실제 채워지는 가로 길이
    const fillH = trackH * 0.46; // 막대 두께(별 돌출분 제외)
    const x0 = n.x - innerW / 2; // 노드 중심 기준 채널 좌측
    const y0 = n.y - fillH / 2; // 노드 중심에 수직 정렬
    const frac = this.timeLimit > 0 ? Phaser.Math.Clamp(this.timeLeft / this.timeLimit, 0, 1) : 0;
    if (frac > 0) {
      const stop = this.timeStopLeft > 0;
      const color = stop ? 0x4ec3ff : frac < 0.25 ? 0xff6b6b : 0xffcf4d;
      g.fillStyle(color, 1);
      g.fillRoundedRect(x0, y0, Math.max(fillH, innerW * frac), fillH, fillH / 2);
    }
  }

  private showPopup(main: string): void {
    this.popupText.setText(main).setScale(0.5).setAlpha(1).setVisible(true);
    this.tweens.add({ targets: this.popupText, scale: 1, duration: 280, ease: 'Back.easeOut' });
  }
  private hidePopup(): void {
    this.popupText.setVisible(false);
  }

  private toast(msg: string): void {
    this.toastText.setText(msg).setVisible(true).setAlpha(1);
    this.toastT = 1.4;
  }

  private burst(x: number, y: number): void {
    const p = this.add.particles(x, y, SPARK_KEY, {
      speed: { min: 70, max: 220 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 0 },
      lifespan: 480,
      quantity: 14,
      tint: [0xffd86e, 0xffffff, 0xf2a33c],
      blendMode: 'ADD',
      emitting: false,
    });
    p.setDepth(58);
    p.explode(14);
    this.time.delayedCall(560, () => p.destroy());
  }

  // ── 영속 ─────────────────────────────────────────────────────
  private loadBest(): number {
    try {
      return parseInt(localStorage.getItem(SCORE_KEY) ?? '0', 10) || 0;
    } catch {
      return 0;
    }
  }
  private saveBest(v: number): void {
    try {
      localStorage.setItem(SCORE_KEY, String(v));
    } catch {
      /* 무시 */
    }
  }
}
