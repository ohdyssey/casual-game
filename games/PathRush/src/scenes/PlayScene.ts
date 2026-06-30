/**
 * PlayScene — 패스러시 본편 (한 붓 그리기 타임어택).
 *
 * 화면: 에디터 main.json(SSOT) 렌더 — 배경/로고/HUD 패널/하단 파워업 바/마스코트/말풍선.
 *       격자(칸·경로·노드)는 보드 패널(UI_01) 기준으로 매 레벨 동적 생성(BoardView). 에디터의
 *       샘플 4×4 칸 노드(UI_02/03)는 숨기고, 실제 그리드는 패널 안에 정확히 계산해 배치한다.
 *
 * 흐름: 시작 칸에서 끌어 인접 칸으로 모든 타일을 한 번씩 이어 도착 칸에 닿으면 클리어 → 점수·콤보,
 *       다음 레벨(더 크고 시간↓). 시간 초과 시 콤보 리셋 후 같은 레벨 새 보드(관대한 캐주얼 룰).
 */
import Phaser from 'phaser';
import { UI_LAYOUT_KEY, SPARK_KEY } from '../assets.js';
import { buildLayout, type LayoutDoc, type LayoutIndex } from '../ui/layoutLoader.js';
import { fillCoverLayout } from '@casual/core';
import { BoardView, type BoardArea } from '../ui/boardView.js';
import { generateHamiltonian, areAdjacent, matchPrefixLength } from '../logic/board.js';
import { gridForLevel, timeForCells, scoreForClear, GOAL_BOARDS } from '../logic/levels.js';

// ── 에디터 노드 id (main.json) ──
const NODE = {
  boardPanel: 'layer_3_copy5', // 퍼즐패널 UI_01 (정사각, 그리드의 기준 영역)
  comboBadge: 'layer_3_copy22', // RUSH COMBO! UI_05
  mascot: 'layer_3_copy27', // 마스코트 UI_06
  // HUD 텍스트(에디터가 만든 라벨을 게임 값으로 구동)
  levelText: 'layer_5',
  bestText: 'layer_5_copy',
  scoreText: 'layer_5_copy2',
  boardsText: 'layer_5_copy3',
  timeText: 'layer_5_copy4',
  // 하단 파워업 바 + 버튼
  menuBar: 'layer_4', // 메뉴패널 UI_13 (바 배경)
  btnSettings: 'layer_4_copy',
  btnMagnet: 'layer_4_copy2', // 경로 리셋(무제한)
  btnRocket: 'layer_4_copy3', // +시간
  btnStar: 'layer_4_copy4', // 힌트
  btnBomb: 'layer_4_copy5', // 자동완성
} as const;

const BEST_KEY = 'pathrush_best_v1';
const ADVANCE_MS = 1250; // 클리어/시간초과 후 다음 보드까지 대기
const TIME_BONUS_SEC = 12;

type Phase = 'playing' | 'cleared' | 'timeup';

export class PlayScene extends Phaser.Scene {
  private layout!: LayoutIndex;
  private board!: BoardView;

  // 보드 상태
  private solution: number[] = [];
  private startCell = 0;
  private endCell = 0;
  private player: number[] = [0];

  // 진행/점수
  private level = 1;
  private boards = 0;
  private score = 0;
  private best = 0;
  private combo = 0;
  private timeLimit = 30;
  private timeLeft = 30;
  private phase: Phase = 'playing';
  private phaseT = 0;
  private dragging = false;

  // 파워업 잔여(자석=무제한)
  private power = { time: 3, hint: 3, solve: 2 };

  // HUD 참조
  private levelText?: Phaser.GameObjects.Text;
  private bestText?: Phaser.GameObjects.Text;
  private scoreText?: Phaser.GameObjects.Text;
  private boardsText?: Phaser.GameObjects.Text;
  private timeText?: Phaser.GameObjects.Text;
  private comboBadge?: Phaser.GameObjects.Image;
  private comboText!: Phaser.GameObjects.Text;
  private badgeTexts: Record<'time' | 'hint' | 'solve', Phaser.GameObjects.Text | undefined> = {
    time: undefined,
    hint: undefined,
    solve: undefined,
  };

  // 연출
  private timerBar!: Phaser.GameObjects.Graphics;
  private popupText!: Phaser.GameObjects.Text;
  private subPopup!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private toastT = 0;

  constructor() {
    super('play');
  }

  create(): void {
    const doc = this.cache.json.get(UI_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!doc || !doc.nodes) {
      this.add
        .text(this.scale.width / 2, this.scale.height / 2, '레이아웃을 불러오지 못했습니다', {
          fontFamily: '"Jua", sans-serif',
          fontSize: '26px',
          color: '#ffffff',
        })
        .setOrigin(0.5);
      return;
    }

    // 1) 에디터 디자인(SSOT) 렌더 + 샘플 그리드 노드 숨김.
    this.layout = buildLayout(this, doc);
    // 반응형 — 창 높이로 채우고 배경 cover + 하단 부스터 바닥정렬(FIT 레터박스 제거). 보드 영역 읽기 전에 호출.
    fillCoverLayout(this, this.layout);
    this.hideSampleGrid();

    // 2) 보드 패널 영역(최대 박스) → BoardView. 패널 이미지를 넘겨 그리드 형태에 맞춰 변형시킨다.
    const area = this.readBoardArea();
    const panelImg = this.layout.tryById<Phaser.GameObjects.Image>(NODE.boardPanel);
    this.board = new BoardView(this, area, panelImg);

    // 3) HUD 텍스트/배지/버튼 바인딩.
    this.bindHud();
    this.bindButtons();
    this.bindComboBadge();

    // 4) 연출 오브젝트.
    this.timerBar = this.add.graphics().setDepth(46);
    this.popupText = this.add
      .text(area.cx, area.cy - 20, '', { fontFamily: '"Do Hyeon", sans-serif', fontSize: '54px', color: '#ffe07a' })
      .setOrigin(0.5)
      .setStroke('#7a1428', 9)
      .setDepth(60)
      .setVisible(false);
    this.subPopup = this.add
      .text(area.cx, area.cy + 34, '', { fontFamily: '"Do Hyeon", sans-serif', fontSize: '34px', color: '#ffffff' })
      .setOrigin(0.5)
      .setStroke('#7a1428', 7)
      .setDepth(60)
      .setVisible(false);
    this.toastText = this.add
      .text(area.cx, area.cy + area.maxH / 2 + 44, '', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '26px',
        color: '#ffe89a',
      })
      .setOrigin(0.5)
      .setStroke('#3a0e1c', 6)
      .setDepth(60)
      .setVisible(false);

    // 5) 입력 — 드래그로 경로 그리기.
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);

    // 6) 시작.
    this.best = this.loadBest();
    this.level = 1;
    this.boards = 0;
    this.score = 0;
    this.combo = 0;
    this.power = { time: 3, hint: 3, solve: 2 };
    this.newBoard();
    this.refreshHud();
  }

  // ── 셋업 헬퍼 ─────────────────────────────────────────────────

  /** 에디터의 정적 샘플 격자(슬롯/타일 = UI_02/UI_03)는 런타임에 동적 생성하므로 숨긴다. */
  private hideSampleGrid(): void {
    for (const e of this.layout.entries()) {
      const key = e.node.key ?? '';
      if (key.startsWith('up_PathRush_UI_02') || key.startsWith('up_PathRush_UI_03')) {
        e.obj.setVisible(false);
      }
    }
  }

  /**
   * 보드 패널 노드에서 최대 박스(중심 + 가로/세로 한도) 추출. 이 박스 안에서 패널이 그리드 형태에
   * 맞춰 변형된다. 한도를 에디터 패널 크기에 묶어 디자인(SSOT)을 따른다.
   */
  private readBoardArea(): BoardArea {
    const n = this.layout.nodeById(NODE.boardPanel);
    return { cx: n?.x ?? 360, cy: n?.y ?? 642, maxW: n?.w ?? 369, maxH: n?.h ?? 369 };
  }

  private bindHud(): void {
    this.levelText = this.layout.tryById<Phaser.GameObjects.Text>(NODE.levelText);
    this.bestText = this.layout.tryById<Phaser.GameObjects.Text>(NODE.bestText);
    this.scoreText = this.layout.tryById<Phaser.GameObjects.Text>(NODE.scoreText);
    this.boardsText = this.layout.tryById<Phaser.GameObjects.Text>(NODE.boardsText);
    this.timeText = this.layout.tryById<Phaser.GameObjects.Text>(NODE.timeText);
  }

  private bindButtons(): void {
    // 에디터 데이터상 아이콘(UI_14~18, depth 4~8)이 메뉴 바(UI_13, depth 9)보다 아래라 바에 가려진다.
    // 런타임에서 아이콘을 바 위로 올려 항상 보이게 한다(배지는 그 위).
    const barDepth = this.layout.tryById<Phaser.GameObjects.Image>(NODE.menuBar)?.depth ?? 9;
    const iconDepth = barDepth + 1;
    const badgeDepth = barDepth + 2;
    this.wireButton(NODE.btnSettings, () => this.restartGame(), iconDepth);
    this.wireButton(NODE.btnMagnet, () => this.useReset(), iconDepth);
    this.wireButton(NODE.btnRocket, () => this.useTime(), iconDepth);
    this.wireButton(NODE.btnStar, () => this.useHint(), iconDepth);
    this.wireButton(NODE.btnBomb, () => this.useSolve(), iconDepth);
    this.badgeTexts.time = this.makeBadge(NODE.btnRocket, badgeDepth);
    this.badgeTexts.hint = this.makeBadge(NODE.btnStar, badgeDepth);
    this.badgeTexts.solve = this.makeBadge(NODE.btnBomb, badgeDepth);
  }

  private wireButton(id: string, handler: () => void, depth: number): void {
    const obj = this.layout.tryById<Phaser.GameObjects.Image>(id);
    if (!obj) return;
    obj.setDepth(depth); // 메뉴 바 위로 올림(에디터 depth 가 바보다 낮아 가려지는 문제 보정)
    const sx = obj.scaleX;
    const sy = obj.scaleY;
    obj.setInteractive({ useHandCursor: true });
    obj.on('pointerdown', () => {
      this.tweens.killTweensOf(obj);
      obj.setScale(sx, sy);
      this.tweens.add({ targets: obj, scaleX: sx * 0.88, scaleY: sy * 0.88, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
      handler();
    });
  }

  /** 버튼 우하단에 잔여 횟수 배지. */
  private makeBadge(id: string, depth: number): Phaser.GameObjects.Text | undefined {
    const n = this.layout.nodeById(id);
    if (!n) return undefined;
    const bx = n.x + (n.w ?? 90) * 0.32;
    const by = n.y + (n.h ?? 90) * 0.32;
    return this.add
      .text(bx, by, '', { fontFamily: '"Do Hyeon", sans-serif', fontSize: '22px', color: '#ffffff' })
      .setOrigin(0.5)
      .setStroke('#1f7a2e', 5)
      .setDepth(depth);
  }

  private bindComboBadge(): void {
    this.comboBadge = this.layout.tryById<Phaser.GameObjects.Image>(NODE.comboBadge);
    const cx = this.comboBadge?.x ?? 630;
    const cy = this.comboBadge?.y ?? 712;
    this.comboText = this.add
      .text(cx, cy + 6, '', { fontFamily: '"Do Hyeon", sans-serif', fontSize: '30px', color: '#ffffff' })
      .setOrigin(0.5)
      .setStroke('#b1102f', 6)
      .setDepth((this.layout.nodeById(NODE.comboBadge)?.depth ?? 42) + 1)
      .setVisible(false);
    this.comboBadge?.setVisible(false);
  }

  // ── 보드 진행 ─────────────────────────────────────────────────

  private newBoard(): void {
    const { cols, rows } = gridForLevel(this.level);
    this.solution = generateHamiltonian(cols, rows);
    this.startCell = this.solution[0];
    this.endCell = this.solution[this.solution.length - 1];
    this.player = [this.startCell];
    this.timeLimit = timeForCells(cols * rows);
    this.timeLeft = this.timeLimit;
    this.phase = 'playing';
    this.phaseT = 0;
    this.dragging = false;
    this.board.build(cols, rows);
    this.board.renderPath(this.player, this.startCell, this.endCell);
    this.refreshHud();
  }

  private triggerClear(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'cleared';
    this.phaseT = 0;
    this.combo += 1;
    const gain = scoreForClear(this.level, this.timeLeft, this.combo);
    this.score += gain;
    if (this.score > this.best) {
      this.best = this.score;
      this.saveBest(this.best);
    }
    this.board.celebrate(this.player);
    this.burst();
    this.showPopup('BOARD CLEAR!', `+${gain.toLocaleString()}`);
    if (this.combo >= 2) this.showCombo();
    this.refreshHud();
  }

  private triggerTimeup(): void {
    this.phase = 'timeup';
    this.phaseT = 0;
    this.combo = 0;
    this.hideCombo();
    this.showPopup('시간 종료!', '콤보 초기화');
    this.refreshHud();
  }

  // ── 입력 / 경로 ───────────────────────────────────────────────

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (this.phase !== 'playing') return;
    const cell = this.board.cellAt(p.x, p.y);
    if (cell < 0) return; // 보드 밖(버튼 등) → 무시
    const pos = this.player.indexOf(cell);
    if (pos >= 0) {
      this.player = this.player.slice(0, pos + 1); // 지나온 칸 잡으면 거기까지 되돌림
    } else {
      this.tryMove(cell);
    }
    this.dragging = true;
    this.board.renderPath(this.player, this.startCell, this.endCell);
    this.checkWin();
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (!this.dragging || !p.isDown || this.phase !== 'playing') return;
    const cell = this.board.cellAt(p.x, p.y);
    if (cell < 0) return;
    const before = this.player.length;
    const tip = this.player[this.player.length - 1];
    if (cell === tip) return;
    const pos = this.player.indexOf(cell);
    if (pos >= 0) {
      if (pos < this.player.length - 1) this.player = this.player.slice(0, pos + 1); // 되돌리며 지우기
    } else {
      this.tryMove(cell);
    }
    if (this.player.length !== before || this.player[this.player.length - 1] !== tip) {
      this.board.renderPath(this.player, this.startCell, this.endCell);
      this.checkWin();
    }
  }

  private onPointerUp(): void {
    this.dragging = false;
  }

  /** tip 에 인접한 새 칸이면 잇는다. */
  private tryMove(cell: number): void {
    const tip = this.player[this.player.length - 1];
    if (this.player.includes(cell)) return;
    if (areAdjacent(cell, tip, this.board.cols)) this.player.push(cell);
  }

  private checkWin(): void {
    const tip = this.player[this.player.length - 1];
    if (this.player.length === this.board.cellCount && tip === this.endCell && this.player[0] === this.startCell) {
      this.triggerClear();
    }
  }

  // ── 파워업 ────────────────────────────────────────────────────

  private useReset(): void {
    if (this.phase !== 'playing') return;
    this.player = [this.startCell];
    this.board.renderPath(this.player, this.startCell, this.endCell);
    this.toast('경로 초기화');
  }

  private useTime(): void {
    if (this.phase !== 'playing') return;
    if (this.power.time <= 0) return void this.toast('시간 아이템 없음');
    this.power.time--;
    this.timeLeft = Math.min(this.timeLimit, this.timeLeft + TIME_BONUS_SEC);
    this.toast(`+${TIME_BONUS_SEC}초`);
    this.refreshHud();
  }

  private useHint(): void {
    if (this.phase !== 'playing') return;
    if (this.power.hint <= 0) return void this.toast('힌트 없음');
    this.power.hint--;
    const m = matchPrefixLength(this.player, this.solution);
    const len = Math.max(1, Math.min(this.solution.length, m + 1));
    this.player = this.solution.slice(0, len); // 정답으로 보정 + 한 칸 전진
    this.board.renderPath(this.player, this.startCell, this.endCell);
    this.refreshHud();
    this.checkWin();
  }

  private useSolve(): void {
    if (this.phase !== 'playing') return;
    if (this.power.solve <= 0) return void this.toast('자동완성 없음');
    this.power.solve--;
    this.player = this.solution.slice();
    this.board.renderPath(this.player, this.startCell, this.endCell);
    this.refreshHud();
    this.checkWin();
  }

  private restartGame(): void {
    this.level = 1;
    this.boards = 0;
    this.score = 0;
    this.combo = 0;
    this.power = { time: 3, hint: 3, solve: 2 };
    this.hideCombo();
    this.newBoard();
    this.refreshHud();
    this.toast('새 게임');
  }

  // ── 루프 ──────────────────────────────────────────────────────

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastText.setVisible(false);
    }
    if (this.phase === 'playing') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.triggerTimeup();
      }
      this.updateTimeText();
    } else {
      this.phaseT += dt;
      if (this.phaseT > ADVANCE_MS / 1000) {
        if (this.phase === 'cleared') {
          this.level += 1;
          this.boards += 1;
        }
        this.hidePopup();
        this.newBoard();
      }
    }
    this.drawTimerBar();
  }

  // ── HUD/연출 갱신 ────────────────────────────────────────────

  private refreshHud(): void {
    this.levelText?.setText(String(this.level));
    this.bestText?.setText(this.best.toLocaleString());
    this.scoreText?.setText(this.score.toLocaleString());
    this.boardsText?.setText(`${this.boards}/${GOAL_BOARDS}`);
    this.updateTimeText();
    this.badgeTexts.time?.setText(String(this.power.time));
    this.badgeTexts.hint?.setText(String(this.power.hint));
    this.badgeTexts.solve?.setText(String(this.power.solve));
  }

  private updateTimeText(): void {
    const s = Math.max(0, Math.ceil(this.timeLeft));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    const low = this.timeLimit > 0 && this.timeLeft / this.timeLimit < 0.25;
    this.timeText?.setText(`${mm < 10 ? '0' + mm : mm}:${ss < 10 ? '0' + ss : ss}`);
    this.timeText?.setColor(low ? '#ff5b5b' : '#ffffff');
  }

  private drawTimerBar(): void {
    const g = this.timerBar;
    g.clear();
    const w = 248;
    const h = 14;
    const x = 360 - w / 2;
    const y = 410;
    g.fillStyle(0x3a0e1c, 0.55);
    g.fillRoundedRect(x, y, w, h, h / 2);
    const frac = this.timeLimit > 0 ? Phaser.Math.Clamp(this.timeLeft / this.timeLimit, 0, 1) : 0;
    if (frac > 0) {
      const low = frac < 0.25;
      g.fillStyle(low ? 0xff5b5b : 0xffc83d, 1);
      g.fillRoundedRect(x, y, Math.max(h, w * frac), h, h / 2);
    }
  }

  private showPopup(main: string, sub: string): void {
    this.popupText.setText(main).setScale(0.5).setAlpha(1).setVisible(true);
    this.subPopup.setText(sub).setAlpha(1).setVisible(!!sub);
    this.tweens.add({ targets: this.popupText, scale: 1, duration: 280, ease: 'Back.easeOut' });
  }
  private hidePopup(): void {
    this.popupText.setVisible(false);
    this.subPopup.setVisible(false);
  }

  private showCombo(): void {
    this.comboText.setText(`×${this.combo}`).setVisible(true);
    const badge = this.comboBadge;
    if (!badge) return;
    badge.setVisible(true);
    const bx = badge.scaleX;
    const by = badge.scaleY;
    this.tweens.killTweensOf(badge);
    badge.setScale(bx * 1.25, by * 1.25);
    this.tweens.add({ targets: badge, scaleX: bx, scaleY: by, duration: 260, ease: 'Back.easeOut' });
  }
  private hideCombo(): void {
    this.comboBadge?.setVisible(false);
    this.comboText.setVisible(false);
  }

  private toast(msg: string): void {
    this.toastText.setText(msg).setVisible(true).setAlpha(1);
    this.toastT = 1.4;
  }

  private burst(): void {
    const c = this.board.centerOf(this.endCell);
    const p = this.add.particles(c.x, c.y, SPARK_KEY, {
      speed: { min: 80, max: 260 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      lifespan: 520,
      quantity: 18,
      tint: [0xffd86e, 0xffffff, 0xff8ab0],
      blendMode: 'ADD',
      emitting: false,
    });
    p.setDepth(58);
    p.explode(18);
    this.time.delayedCall(620, () => p.destroy());
  }

  // ── 영속 ──────────────────────────────────────────────────────

  private loadBest(): number {
    try {
      return parseInt(localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
    } catch {
      return 0;
    }
  }
  private saveBest(v: number): void {
    try {
      localStorage.setItem(BEST_KEY, String(v));
    } catch {
      /* 저장 실패 무시 */
    }
  }
}
