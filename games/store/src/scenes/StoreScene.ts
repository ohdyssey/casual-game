import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, placeCover, strokeText, capsule } from '@casual/core';
import { createState, tap, canPlace, hasLegalMove, markLost } from '../logic/storeMachine.js';
import type { StoreState, LevelConfig, SlotRef, ProductKind } from '../logic/types.js';
import { generateLevel, PRODUCTS } from '../logic/levels.js';
import { solveStatus, solvePath, hintFirstMove, solveFullPath, type SolveMove } from '../logic/generate.js';
import { sfx, startBgm } from '../audio.js';
import { track } from '../analytics.js';
import { loadProfile, saveProfile, recordResult, addCoins, coinsFromScore } from '../meta/index.js';
import { GRID, SLOT_GAP, type CellBox, computeShelfLayout, slotGeom as computeSlotGeom, type SlotGeom } from './storeLayout.js';
import { assembleShelf, type AssembledShelf } from './shelfAssembly.js';
import { showResultOverlay, showDeadlockOverlay } from './storeOverlays.js';

const hex = (s: string): number => parseInt(s.replace('#', ''), 16);

const DEBUG_CELLS = false;
/** 데드락: **미리 예측하지 않고** 실제 반복(이미 지나온 상태로만 되돌이) 연속 횟수가 이만큼이면 셔플 제안. */
const LOOP_REPEAT_LIMIT = 6;
/** 자동완성: 최단 해법이 이 수 이하로 남으면 남은 수를 빠르게 자동 실행해 마감. */
const AUTO_FINISH_MOVES = 5;
/** 아이템을 바닥 기준 이만큼 위로 배치. */
const ITEM_LIFT = 6;
/** 그림자를 바닥(floorBase) 기준 이만큼 위로 올려 아이템 하단 뒤에 겹치게(그림자=아이템 뒤). */
const SHADOW_RAISE = 6;
/** 진열장 상단 캐릭터(Neko) — 아이템 렌더 높이의 배율(이전 1.5의 80% = 1.2배). */
const CHAR_ITEM_SCALE = 1.2;
/** 캐릭터 발이 진열대 표면에 살짝 얹혀 박히는 양(px, 자연스러운 안착감). */
const CHAR_REST_SINK = 8;
/** 캐릭터 depth(진열장/아이템 위, 디버그/오버레이 아래). */
const CHAR_DEPTH = 20;

interface MoveAnim {
  kind: string;
  srcCell: number;
  toCell: number;
  sourceSlots: number[];
  destSlots: number[];
  moveCount: number;
  suppress: Set<string>;
}

/**
 * StoreScene — 그룹 정렬 게임플레이. 샘플 UI 정밀 매칭:
 *   매장 배경(BG_01) + 나무 진열장(BG_02) 셀에 아이템 배치 + 에셋 HUD(UI_01~06).
 * 규칙은 순수 머신(storeMachine, 테스트됨)에. 씬은 렌더/입력 바인딩만.
 */
export class StoreScene extends Phaser.Scene {
  private levelIndex = 0;
  private level!: LevelConfig;
  private state!: StoreState;
  private shelfLayer!: Phaser.GameObjects.Container;
  private cellGeom: CellBox[] = [];
  // 진열장 종류별 상품 배치 보정(기존 이미지=GRID 원근값, 조립식=평면 0). buildShelf* 가 설정.
  private floorOffset = GRID.floorOffset;
  private rowOffsets: readonly number[] = GRID.rowOffset;
  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private comboImg!: Phaser.GameObjects.Container;
  private timeLeft = 0;
  private timerEvent?: Phaser.Time.TimerEvent;
  private animating = false;
  private deadlockShowing = false; // 데드락 팝업 중복 방지
  private hintText?: Phaser.GameObjects.Text; // 힌트 잔여 수
  private hintFx?: Phaser.GameObjects.Container; // 힌트 강조 표시
  private warned10 = false; // 10초 경고 1회
  private visitedStates = new Set<string>(); // 이번 레벨서 지나온 보드 상태(반복 감지)
  private loopRepeats = 0; // 새 상태 없이 연속 반복(되돌이)한 이동 수
  private autoPlaying = false; // 자동완성 진행 중(입력 차단)
  private replaying = false; // 승리 후 오버레이 뒤 배경 리플레이 중(입력 차단)
  // 상품 텍스처별 불투명 영역(하단 여백·실제 폭·높이) 캐시 — 그림자 폭·바닥 부착용.
  private opaqueCache = new Map<string, { padBottom: number; width: number; height: number }>();
  private loadingSpinner?: Phaser.GameObjects.Container; // 로딩 스피너
  private historyStateStack: StoreState[] = []; // 되돌리기용 상태 히스토리 스택
  private undoText?: Phaser.GameObjects.Text; // 되돌리기 아이템 잔여 수

  constructor() {
    super('StoreScene');
  }

  init(data: { levelIndex?: number }): void {
    this.levelIndex = data.levelIndex ?? 0;
  }

  create(): void {
    this.animating = false;
    this.deadlockShowing = false;
    this.warned10 = false;
    this.autoPlaying = false;
    this.replaying = false;
    this.events.once('shutdown', () => { this.replaying = false; }); // 씬 종료 시 리플레이 중단(late worker 가드)
    this.historyStateStack = [];
    // 레벨 번호를 기준으로 난이도 결정(1레벨=capacity3·빈칸2).
    this.level = generateLevel(this.levelIndex);
    this.state = createState(this.level);
    this.visitedStates = new Set([this.boardCanon()]);
    this.loopRepeats = 0;
    const emptyN = this.level.cells.filter((c) => c.length === 0).length;
    track('level_start', { level: this.levelIndex + 1, empty: emptyN, kinds: this.level.cells.length - emptyN });

    // 배경(매장 내부)
    if (this.textures.exists('bg_room')) placeCover(this, 'bg_room', GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT);
    else this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, hex(COLORS.surfaceFloor));

    this.ensureShadowTexture();
    this.buildHud(this.level.timeSec ?? 0);
    this.buildShelf();
    this.buildPowerups();

    this.shelfLayer = this.add.container(0, 0);
    this.render();

    if (this.level.timeSec) {
      this.timeLeft = this.level.timeSec;
      this.timerEvent = this.time.addEvent({ delay: 1000, loop: true, callback: () => this.onTick() });
    }

    startBgm(this); // 배경음악 지속(씬 전환에도 끊기지 않음)
    sfx(this, 'sfx_level_start');
  }

  // ─── 이미지 배치 헬퍼(높이 기준 스케일) ───
  private imgH(key: string, x: number, y: number, h: number): Phaser.GameObjects.Image {
    const img = this.add.image(x, y, key).setOrigin(0.5);
    const tex = img.texture.getSourceImage() as { width: number; height: number };
    img.setScale(h / tex.height);
    return img;
  }

  // ─── 상단 HUD (UI 에셋 + 동적 숫자) ───
  private buildHud(timeSec: number): void {
    const y = 64;
    // 상단 HUD 바 배경(나무톤)
    capsule(this, 12, 28, GAME_WIDTH - 24, 78, '#f3d6a4', { radius: 26, outline: 5, outlineColor: '#e2b277', shadowAlpha: 0.18 });
    // Lv 뱃지 (UI_01) + 레벨 숫자 오버레이
    if (this.textures.exists('ui_lv')) {
      this.imgH('ui_lv', 84, y, 52);
      strokeText(this, 84, y, `Lv.${this.levelIndex + 1}`, 22, { color: '#ffffff', strokeWidth: 0 }).setOrigin(0.5);
    }
    // 타이머 (UI_02) + 시간 오버레이 (새 HUD에 맞춰 패치 제거 및 텍스트 위치 정렬)
    if (this.textures.exists('ui_timer')) {
      this.imgH('ui_timer', 300, y, 60);
      const tx = 300 + 20; // 오른편 영역 보정
      this.timerText = strokeText(this, tx, y, this.fmtTime(timeSec), 26, { color: '#5a3a1a', strokeWidth: 0 });
      this.timerText.setOrigin(0.5);
    }
    // 점수(별) (UI_03) + 숫자 오버레이 (새 HUD에 맞춰 패치 제거 및 텍스트 위치 정렬)
    if (this.textures.exists('ui_score')) {
      this.imgH('ui_score', 500, y, 56);
      const sx = 500 + 15; // 오른편 영역 보정
      this.scoreText = strokeText(this, sx, y, '0', 24, { color: '#5a3a1a', strokeWidth: 0 });
      this.scoreText.setOrigin(0.5);
    } else {
      this.scoreText = strokeText(this, 500, y, '0', 24, { strokeColor: COLORS.brandGreen, strokeWidth: 5 }).setOrigin(0.5);
    }
    // 일시정지 (UI_04) → 홈
    if (this.textures.exists('ui_pause')) {
      const p = this.imgH('ui_pause', 672, y, 56);
      p.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        sfx(this, 'sfx_button_tap');
        this.scene.start('HomeScene');
      });
    }
    // 콤보 (UI_05) — combo>1 일 때 표시
    this.comboImg = this.add.container(GAME_WIDTH / 2, 134).setVisible(false);
    if (this.textures.exists('ui_combo')) {
      const c = this.add.image(0, 0, 'ui_combo').setOrigin(0.5);
      const tex = c.texture.getSourceImage() as { width: number; height: number };
      c.setScale(46 / tex.height);
      const label = strokeText(this, 0, -1, '', 22, { color: '#ffffff', strokeWidth: 0 }).setOrigin(0.5).setName('lbl');
      this.comboImg.add([c, label]);
    }
  }

  private fmtTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  private updateHud(): void {
    this.scoreText.setText(String(this.state.score));
    if (this.timerText) {
      this.timerText.setText(this.fmtTime(this.timeLeft));
      this.timerText.setColor(this.timeLeft <= 10 ? '#e63946' : '#5a3a1a');
    }
    const on = this.state.combo > 1;
    this.comboImg.setVisible(on);
    if (on) (this.comboImg.getByName('lbl') as Phaser.GameObjects.Text)?.setText(`Combo x${this.state.combo}`);
  }

  private onTick(): void {
    if (this.state.status !== 'playing') return;
    this.timeLeft -= 1;
    this.updateHud();
    if (this.timeLeft === 10 && !this.warned10) {
      this.warned10 = true;
      sfx(this, 'sfx_timer_warning'); // 10초 경고 1회
    } else if (this.timeLeft > 0 && this.timeLeft <= 5) {
      sfx(this, 'sfx_timer_tick'); // 5초 이하 카운트다운 틱
    }
    if (this.timeLeft <= 0) {
      this.state = markLost(this.state);
      this.timerEvent?.remove();
      track('level_fail', { level: this.levelIndex + 1, score: this.state.score });
      saveProfile(recordResult(loadProfile(), this.levelIndex + 1, this.state.score, false));
      sfx(this, 'sfx_level_fail');
      this.showOverlay('시간 초과', COLORS.stateWarn, '');
    }
  }

  // ─── 진열장(BG_02) 배치 + 셀 좌표 계산(기하는 storeLayout) ───
  private buildShelf(): void {
    if (this.level.useShelfParts) {
      this.buildShelfFromParts();
      return;
    }
    const shelfKey = this.level.shelfKey ?? 'shelf';
    const tex = this.textures.exists(shelfKey)
      ? (this.textures.get(shelfKey).getSourceImage() as { width: number; height: number })
      : null;
    const layout = computeShelfLayout(this.level, GAME_WIDTH, tex);

    if (tex) {
      this.add.image(layout.shelfCx, layout.shelfCy, shelfKey).setDisplaySize(layout.shelfW, layout.shelfH);
    } else {
      this.add.rectangle(layout.shelfCx, layout.shelfCy, layout.shelfW, layout.shelfH, hex(COLORS.surfaceWood), 0.9);
    }
    this.cellGeom = layout.cells;
    this.drawDebugCells();
  }

  // ─── 조립식 진열장(9-slice 부품, shelfAssembly) — 레벨1 ───
  private buildShelfFromParts(): void {
    const cols = this.level.cols ?? 3;
    const rows = this.level.rows ?? 3; // 연결 베이스 play 행
    const displayRows = this.level.displayRows ?? 0; // 전시행(필요 레벨만)
    const bumps = this.level.bumps ?? []; // 열별 상단 돌출(요철)
    // 하단(sBottom) 정렬 + 세로 밴드 맞춤 → 행수 2→6 이 하단부터 위로 성장(6행도 밴드 초과 안 함).
    const targetH = GRID.sBottom - GRID.sTop;
    const asm = assembleShelf(cols, rows, GAME_WIDTH * 0.95 - 10, GAME_WIDTH / 2, GRID.sBottom, displayRows, bumps, targetH);

    for (const p of asm.parts) {
      if (this.textures.exists(p.key)) {
        // +2px 블리드(겹침): 고해상도 스케일업 시 부품 사이 헤어라인 seam 방지.
        this.add.image(p.cx, p.cy, p.key).setDisplaySize(p.w + 2, p.h + 2);
      } else {
        this.add.rectangle(p.cx, p.cy, p.w, p.h, hex(COLORS.surfaceWood), 0.9).setStrokeStyle(2, 0x000000, 0.15);
      }
    }
    this.cellGeom = asm.cells; // 게임 칸 = 돌출 칸 + 베이스 play 칸(전시행 제외)
    this.placeDisplayGoods(asm.displayCells); // 전시행(있으면)에 전시용 상품
    this.placeShelfCharacter(asm); // 진열장 상단 중앙 캐릭터(아이템 ~1.2배, 표면에 자연 안착)
    // 내부 칸 좌표가 정확 → 원근/바닥 보정 없음(평면). render/slotGeom 의 rowOffset[row] 는 ?? 0 으로 폴백.
    this.floorOffset = 0;
    this.rowOffsets = [];
    this.drawDebugCells();
  }

  /** 하단 전시 행 칸에 전시용 상품(goods) 배치 — 게임 무관 장식, 칸 바닥 정렬. */
  private placeDisplayGoods(cells: CellBox[]): void {
    const keys = ['goods01', 'goods02', 'goods03'];
    const widthFrac = 0.84; // 칸 폭 대비 전시 상품 폭(안쪽 여백 — 약간 줄임)
    cells.forEach((cell, i) => {
      const key = keys[i % keys.length]!;
      if (!this.textures.exists(key)) return;
      const img = this.add.image(cell.cx, cell.cy + cell.h / 2, key).setOrigin(0.5, 1);
      const tex = img.texture.getSourceImage() as { width: number; height: number };
      img.setScale(Math.min((cell.w * widthFrac) / tex.width, (cell.h * 0.92) / tex.height));
    });
  }

  /**
   * 진열장 상단 캐릭터(Neko_01) 배치 — 중앙, 아이템 렌더 높이의 ~1.2배, 중앙 열 실제 최상단 표면에 자연 안착.
   * (칸 완성 시 좌단 불 점등 + 캐릭터 메달 변경 애니메이션은 이후 단계.)
   */
  private placeShelfCharacter(asm: AssembledShelf): void {
    const refCell = asm.cells[0];
    if (!this.textures.exists('neko_01') || !refCell) return;
    // 대표 칸(refCell)에서 아이템 렌더 높이 산출 — render() 와 동일 규칙(slotW=칸폭/용량, 0.97/0.92).
    const itemTex = this.textures.get('item_01').getSourceImage() as { width: number; height: number };
    const slotW = refCell.w / this.level.capacity;
    const itemScale = Math.min((slotW * 0.97) / itemTex.width, (refCell.h * 0.92) / itemTex.height);
    const itemH = itemTex.height * itemScale;
    // 캐릭터 높이 = 아이템 높이 × CHAR_ITEM_SCALE, 폭은 원본 비율 유지.
    const nekoTex = this.textures.get('neko_01').getSourceImage() as { width: number; height: number };
    const charH = itemH * CHAR_ITEM_SCALE;
    const charW = charH * (nekoTex.width / nekoTex.height);
    const charScale = charH / nekoTex.height; // 표시 배율(가로/세로 동일)
    // 중앙 X + 중앙 열의 실제 최상단 표면 Y(돌출 있으면 돌출 위, 없으면 베이스 위 — 떠보이지 않게).
    const cx = asm.bounds.left + asm.bounds.w / 2;
    let surfaceY = Infinity;
    for (const p of asm.parts) {
      if (Math.abs(p.cx - cx) <= p.w / 2) surfaceY = Math.min(surfaceY, p.cy - p.h / 2);
    }
    if (!Number.isFinite(surfaceY)) surfaceY = asm.bounds.top;
    // 불투명 하단(발)을 표면에 맞춘 뒤 살짝 박아 자연스럽게 얹힌 느낌(origin 하단).
    const op = this.getOpaque('neko_01', nekoTex.width, nekoTex.height);
    const y = surfaceY + op.padBottom * charScale + CHAR_REST_SINK;
    this.add.image(cx, y, 'neko_01').setOrigin(0.5, 1).setDisplaySize(charW, charH).setDepth(CHAR_DEPTH);
  }

  /** DEBUG_CELLS 시 셀 경계 표시. */
  private drawDebugCells(): void {
    if (!DEBUG_CELLS) return;
    this.cellGeom.forEach((b) => {
      const g = this.add.graphics().setDepth(60);
      g.lineStyle(4, 0xff00ff, 1);
      g.strokeRect(b.cx - b.w / 2, b.cy - b.h / 2, b.w, b.h);
    });
  }

  /** 아이템 하단 그림자용 라디얼 그라데이션 텍스처 1회 생성(중심 진함→외곽 투명). */
  private ensureShadowTexture(): void {
    if (this.textures.exists('item_shadow')) return;
    const size = 128;
    const cv = this.textures.createCanvas('item_shadow', size, size);
    if (!cv) return;
    const ctx = cv.context;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.2)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    cv.refresh();
  }

  /** 상품 텍스처의 불투명 영역(하단 투명여백·실제 폭·높이) 1회 분석·캐시. */
  private getOpaque(key: string, texW: number, texH: number): { padBottom: number; width: number; height: number } {
    const cached = this.opaqueCache.get(key);
    if (cached) return cached;
    let result = { padBottom: 0, width: texW, height: texH };
    try {
      const src = this.textures.get(key).getSourceImage() as CanvasImageSource;
      const cv = document.createElement('canvas');
      cv.width = texW;
      cv.height = texH;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(src, 0, 0);
        const d = ctx.getImageData(0, 0, texW, texH).data;
        let minX = texW;
        let maxX = -1;
        let minY = texH;
        let maxY = -1;
        for (let y = 0; y < texH; y++) {
          for (let x = 0; x < texW; x++) {
            if (d[(y * texW + x) * 4 + 3] > 16) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX >= 0) result = { padBottom: texH - 1 - maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
      }
    } catch {
      /* CORS/실패 시 기본값 */
    }
    this.opaqueCache.set(key, result);
    return result;
  }

  // ─── 하단 파워업 바 ───
  private buildPowerups(): void {
    const y = GAME_HEIGHT - 80;
    if (this.textures.exists('bar')) {
      const bar = this.add.image(GAME_WIDTH / 2, y, 'bar').setOrigin(0.5);
      const tex = bar.texture.getSourceImage() as { width: number; height: number };
      bar.setScale((GAME_WIDTH - 24) / tex.width);
    } else {
      capsule(this, 12, y - 60, GAME_WIDTH - 24, 120, '#fdeccf', { radius: 28 });
    }
    const slotXs = [110, 290, 450, 610];
    const profile = loadProfile();
    slotXs.forEach((sx, i) => {
      if (this.textures.exists('ui_reward_box')) {
        this.imgH('ui_reward_box', sx, y, 108);
      } else {
        capsule(this, sx - 64, y - 60, 128, 120, '#fff4df', { radius: 20, outline: 3, outlineColor: '#e7c79a' });
      }
      if (i === 0) {
        // 힌트 부스터(💡) — 탭 시 다음에 둘 아이템을 표시(제거 없음).
        strokeText(this, sx, y - 6, '💡', 56, { strokeWidth: 0 }).setOrigin(0.5);
        this.add.circle(sx + 36, y + 36, 18, hex(COLORS.brandGreen));
        this.hintText = strokeText(this, sx + 36, y + 36, String(profile.powerups.hint), 18, { strokeWidth: 0 }).setOrigin(0.5);
        this.add
          .zone(sx, y, 128, 120)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.useHint());
      } else if (i === 1) {
        // 🔄 다시 시작 — 현재 레벨 재시작(시드 고정이라 같은 문제).
        strokeText(this, sx, y - 6, '🔄', 52, { strokeWidth: 0 }).setOrigin(0.5);
        this.add
          .zone(sx, y, 128, 120)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            sfx(this, 'sfx_button_tap');
            this.scene.start('StoreScene', { levelIndex: this.levelIndex });
          });
      } else if (i === 2) {
        // 🧪 테스트 힌트 — 5수 연속 실행
        strokeText(this, sx, y - 6, '🧪', 52, { strokeWidth: 0 }).setOrigin(0.5);
        strokeText(this, sx, y + 36, '테스트 5수', 16, { color: '#5a3a1a', strokeWidth: 0 }).setOrigin(0.5);
        this.add
          .zone(sx, y, 128, 120)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.useTestHint());
      } else if (i === 3) {
        // 🔙 되돌리기(Undo) 부스터 — 직전 상태로 복원
        strokeText(this, sx, y - 6, '🔙', 52, { strokeWidth: 0 }).setOrigin(0.5);
        this.add.circle(sx + 36, y + 36, 18, hex(COLORS.brandGreen));
        this.undoText = strokeText(this, sx + 36, y + 36, String(profile.powerups.undo ?? 0), 18, { strokeWidth: 0 }).setOrigin(0.5);
        this.add
          .zone(sx, y, 128, 120)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.useUndo());
      }
    });
  }

  // ─── 진열장 셀에 아이템 렌더 (suppress: 이동 애니 중 숨길 'ci:slot') ───
  private render(suppress?: Set<string>): void {
    this.shelfLayer.removeAll(true);
    const sel = this.state.selected;

    this.state.cells.forEach((cell, ci) => {
      const box = this.cellGeom[ci];
      if (!box) return;
      const slotW = box.w / cell.capacity; // 용량만큼 슬롯 분할(용량↑=더 좁고 빽빽)
      const itemBoxW = slotW * 0.97; // 슬롯 폭 가득(빽빽)
      const itemBoxH = box.h * 0.92;
      // 행별 수직 보정
      const cols = this.level.cols ?? 3;
      const row = Math.floor(ci / cols);
      const rowAdj = this.rowOffsets[row] ?? 0;
      const floorBase = box.cy + box.h / 2 + this.floorOffset + rowAdj; // 선반 바닥 + 안착 보정 + 원근 수직 보정(진열장별)
      const hasItems = cell.slots.some((s) => s !== null);

      for (let j = 0; j < cell.capacity; j++) {
        const sx = box.cx + (j - (cell.capacity - 1) / 2) * (slotW - SLOT_GAP);
        const kind = cell.slots[j];
        const isSel = sel !== null && sel.cell === ci && sel.slot === j;

        if (kind && !suppress?.has(`${ci}:${j}`)) {
          const floorY = floorBase - (isSel ? 12 : 0);
          const product = PRODUCTS[kind];
          if (product && this.textures.exists(product.key)) {
            const tex = this.textures.get(product.key).getSourceImage() as { width: number; height: number };
            const scale = Math.min(itemBoxW / tex.width, itemBoxH / tex.height);
            const op = this.getOpaque(product.key, tex.width, tex.height);
            const yShift = op.padBottom * scale; // 하단 투명여백 제거 보정 후 ITEM_LIFT 만큼 위로
            const img = this.add.image(sx, floorY + yShift - ITEM_LIFT, product.key).setOrigin(0.5, 1);
            img.setScale(scale);
            const dw = op.width * scale; // 실제(불투명) 상품 폭
            // 하단 그림자 — 폭 상품폭 2.0배 + 라디얼 그라데이션 + 투명. floorBase 기준 SHADOW_RAISE 만큼 올려 아이템 하단 뒤에 겹침.
            const shadowW = dw * 2.0;
            this.shelfLayer.add(this.add.image(sx, floorBase - SHADOW_RAISE, 'item_shadow').setDisplaySize(shadowW, dw * 0.44).setAlpha(0.4));
            this.shelfLayer.add(img);
            if (isSel) {
              const dh = op.height * scale;
              const hl = this.add.graphics();
              hl.lineStyle(5, hex(COLORS.brandAccent), 1);
              hl.strokeRoundedRect(sx - dw / 2 - 3, floorY - ITEM_LIFT - dh - 3, dw + 6, dh + 6, 10);
              this.shelfLayer.add(hl);
            }
          } else {
            this.shelfLayer.add(this.add.rectangle(sx, floorY, itemBoxW * 0.8, itemBoxH * 0.7, hex(COLORS.brandAccent)).setOrigin(0.5, 1));
          }
        } else if (!kind && hasItems) {
          // 부분 채워진 칸의 빈 슬롯 — 배치 가상선(흰색 라운드). 폭은 상품 footprint에 가깝게 축소, 높이도 약간 축소.
          const guideW = itemBoxW * 0.78; // 폭 축소(슬롯폭 가득 → 좁게)
          const guideH = itemBoxH * 0.64; // 높이 약간 축소(0.74 → 0.64)
          const guideBottom = floorBase - itemBoxH * 0.04; // 바닥 바로 위
          const g = this.add.graphics();
          g.lineStyle(2, 0xffffff, 0.5);
          g.strokeRoundedRect(sx - guideW / 2, guideBottom - guideH, guideW, guideH, 8);
          this.shelfLayer.add(g);
        }
      }
      // 칸 단위 입력 존(오른쪽 끝 선택/배치는 칸 단위 — 슬롯 무관, 상품 Y축 보정 및 1.1배 터치 범위 확장)
      const zoneY = box.cy + this.floorOffset + rowAdj;
      const z = this.add
        .zone(box.cx, zoneY, box.w, box.h * 1.1)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.handleTap(ci, 0));
      this.shelfLayer.add(z);
    });
  }

  private handleTap(ci: number, si: number): void {
    if (this.state.status !== 'playing' || this.animating || this.autoPlaying || this.replaying) return;
    const prev = this.state;
    const sel = prev.selected;
    const next = tap(prev, ci, si, this.level);
    const moved = next.validMoves > prev.validMoves;

    if (moved && sel) {
      // 되돌리기용 이전 상태 백업 (selected가 해제된 딥카피 객체 보관)
      this.historyStateStack.push(JSON.parse(JSON.stringify({ ...prev, selected: null })));
      // 수를 막지 않는다 — 막다른 길로 가는 수도 그대로 실행(플레이어 실수·실패 가능).
      const anim = this.computeMove(prev, sel, ci);
      this.state = next;
      this.animating = true;
      this.render(anim.suppress); // 대상 슬롯 숨기고 나머지 갱신
      this.updateHud();
      this.flyItems(anim, () => {
        this.animating = false;
        this.render();
        this.playMoveSfx(prev, anim); // 착지 시 배치/매칭/콤보 사운드
        this.trackLoopAndCheck(); // 반복 추적 + 종료 판정
      });
      return;
    }

    this.state = next;
    this.render();
    this.updateHud();
    this.playTapSfx(sel, ci); // 선택/무효/복귀 사운드
    this.checkEnd();
  }

  /** 이동(착지) 사운드 — 완성=match, 다수 붓기=collect, 단일=place + 콤보. */
  private playMoveSfx(prev: StoreState, anim: MoveAnim): void {
    if (this.state.completed > prev.completed) sfx(this, 'sfx_match');
    else if (anim.moveCount > 1) sfx(this, 'sfx_match_collect');
    else sfx(this, 'sfx_item_place');
    const combo = this.state.combo;
    if (combo >= 4) sfx(this, 'sfx_combo_4');
    else if (combo === 3) sfx(this, 'sfx_combo_3');
    else if (combo === 2) sfx(this, 'sfx_combo_2');
  }

  /** 비이동 탭 사운드 — 선택/무효배치/해제. */
  private playTapSfx(sel: SlotRef | null, ci: number): void {
    const now = this.state.selected;
    if (!sel && now) {
      sfx(this, 'sfx_item_select'); // 첫 선택
    } else if (sel && now && now.cell === ci && sel.cell !== ci) {
      sfx(this, 'sfx_item_invalid'); // 다른 칸에 못 놓아 재선택 = 이동 불가
    } else if (sel && !now) {
      sfx(this, 'sfx_item_return'); // 해제(같은 칸 재탭/빈 칸)
    }
  }

  /** 망치 부스터: 토글 선택 → 다음 칸 탭 시 오른쪽 끝 1개 제거(여유 확보). */
  /** 힌트: 다음에 둘 아이템(과 목적지)을 표시. **제거·이동 없음** — 알려주기만 한다. */
  private useHint(): void {
    if (this.state.status !== 'playing' || this.animating || this.autoPlaying || this.replaying) return;
    const p = loadProfile();
    if ((p.powerups.hint ?? 0) <= 0) {
      sfx(this, 'sfx_item_invalid'); // 힌트 소진
      return;
    }
    const board = this.state.cells.map((c) => c.slots.filter((s) => s !== null)) as ProductKind[][];
    const mv = hintFirstMove(board, this.level.capacity);
    if (!mv) {
      sfx(this, 'sfx_item_invalid'); // 둘 수 없음(풀이불가 등) — 카운트 유지
      return;
    }
    const left = Math.max(0, (p.powerups.hint ?? 0) - 1);
    saveProfile({ ...p, powerups: { ...p.powerups, hint: left } });
    this.hintText?.setText(String(left));
    sfx(this, 'sfx_hammer_select'); // 부스터 딩(힌트)
    this.showHint(mv.from, mv.to);
  }

  /** 되돌리기(Undo) 부스터: 직전 상태로 복원. */
  private useUndo(): void {
    if (this.state.status !== 'playing' || this.animating || this.autoPlaying || this.replaying) return;
    const p = loadProfile();
    const currentUndo = p.powerups.undo ?? 0;
    if (currentUndo <= 0) {
      sfx(this, 'sfx_item_invalid');
      this.toast('되돌리기 아이템이 부족합니다.');
      return;
    }
    if (this.historyStateStack.length === 0) {
      sfx(this, 'sfx_item_invalid');
      this.toast('되돌릴 기록이 없습니다.');
      return;
    }
    const prevState = this.historyStateStack.pop();
    if (prevState) {
      const left = Math.max(0, currentUndo - 1);
      saveProfile({ ...p, powerups: { ...p.powerups, undo: left } });
      this.undoText?.setText(String(left));

      this.state = prevState;
      this.render();
      this.updateHud();
      sfx(this, 'sfx_item_return');
    }
  }

  /** 테스트 힌트: 다음 5수 자동 연속 실행 */
  private async useTestHint(): Promise<void> {
    if (this.state.status !== 'playing' || this.animating || this.autoPlaying || this.replaying) return;
    this.showLoadingSpinner();
    try {
      const board = this.state.cells.map((c) => c.slots.filter((s) => s !== null)) as ProductKind[][];
      // 휴리스틱 DFS 전체 해법(solveFullPath) — BFS(solvePathAsync)는 깊은 보드서 nodeCap 초과로 null 이라 교체.
      const moves = solveFullPath(board, this.level.capacity);
      if (!moves || moves.length === 0) {
        sfx(this, 'sfx_item_invalid');
        this.toast('풀 수 있는 해법이 없습니다.');
        return;
      }
      sfx(this, 'sfx_hammer_select'); // 힌트 작동음
      const next5Moves = moves.slice(0, 5);
      this.autoComplete(next5Moves);
    } finally {
      this.hideLoadingSpinner();
    }
  }

  /** 힌트 강조 — 출발 아이템(오른쪽 끝) + 목적지 칸을 깜빡여 표시(제거 없음). */
  private showHint(fromCell: number, toCell: number): void {
    this.hintFx?.destroy();
    const layer = this.add.container(0, 0).setDepth(70);

    const from = this.state.cells[fromCell];
    let r = -1;
    if (from) for (let s = from.slots.length - 1; s >= 0; s--) if (from.slots[s] !== null) { r = s; break; }
    if (r !== -1) {
      const g = this.slotGeom(fromCell, r);
      const ring = this.add.graphics();
      ring.lineStyle(6, hex(COLORS.brandAccent), 1);
      ring.strokeRoundedRect(g.x - g.boxW / 2 - 4, g.y - g.boxH - 4, g.boxW + 8, g.boxH + 8, 12);
      layer.add(ring);
    }
    const box = this.cellGeom[toCell];
    if (box) {
      const dg = this.add.graphics();
      dg.lineStyle(5, hex(COLORS.stateWin), 1);
      dg.strokeRoundedRect(box.cx - box.w / 2, box.cy - box.h / 2, box.w, box.h, 10);
      layer.add(dg);
    }

    this.hintFx = layer;
    this.tweens.add({
      targets: layer,
      alpha: 0.25,
      duration: 350,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        layer.destroy();
        if (this.hintFx === layer) this.hintFx = undefined;
      },
    });
  }

  /** 이동 애니메이션 정보 수집(prev 상태 기준). */
  private computeMove(prev: StoreState, sel: SlotRef, toCell: number): MoveAnim {
    const src = prev.cells[sel.cell]!;
    const dst = prev.cells[toCell]!;
    const kind = src.slots[sel.slot]!;
    const r = sel.slot; // 오른쪽 끝
    let run = 0;
    for (let i = r; i >= 0 && src.slots[i] === kind; i--) run++;
    const destFilled = dst.slots.filter((x) => x !== null).length;
    const moveCount = Math.min(run, dst.capacity - destFilled);
    const sourceSlots: number[] = [];
    const destSlots: number[] = [];
    const suppress = new Set<string>();
    for (let i = 0; i < moveCount; i++) {
      sourceSlots.push(r - moveCount + 1 + i);
      const ds = destFilled + i;
      destSlots.push(ds);
      suppress.add(`${toCell}:${ds}`);
    }
    return { kind, srcCell: sel.cell, toCell, sourceSlots, destSlots, moveCount, suppress };
  }

  /** 슬롯의 화면상 위치/크기(storeLayout.slotGeom 위임, 진열장별 보정 전달). */
  private slotGeom(ci: number, slot: number): SlotGeom {
    return computeSlotGeom(this.cellGeom[ci]!, this.state.cells[ci]!.capacity, this.level.cols ?? 3, ci, slot, this.floorOffset, this.rowOffsets);
  }

  /** 좌측 ~20° 기울여 날아가는 이동 연출. 여러 개면 주루룩 이어서(stagger). opts=자동완성 가속 타이밍. */
  private flyItems(anim: MoveAnim, onDone: () => void, opts?: { duration: number; stagger: number }): void {
    if (anim.moveCount === 0) {
      onDone();
      return;
    }
    const product = PRODUCTS[anim.kind];
    const stagger = opts?.stagger ?? 70;
    const duration = opts?.duration ?? 230;
    // 정적 렌더와 동일한 하단 부착 보정(yShift) — 착지 시 스냅 방지.
    let yShift = 0;
    if (product && this.textures.exists(product.key)) {
      const t = this.textures.get(product.key).getSourceImage() as { width: number; height: number };
      const s0 = this.slotGeom(anim.srcCell, anim.sourceSlots[0] ?? 0);
      yShift = this.getOpaque(product.key, t.width, t.height).padBottom * Math.min(s0.boxW / t.width, s0.boxH / t.height);
    }
    let done = 0;
    for (let i = 0; i < anim.moveCount; i++) {
      const from = this.slotGeom(anim.srcCell, anim.sourceSlots[i]!);
      const to = this.slotGeom(anim.toCell, anim.destSlots[i]!);
      let sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
      if (product && this.textures.exists(product.key)) {
        const img = this.add.image(from.x, from.y + yShift - ITEM_LIFT, product.key).setOrigin(0.5, 1).setDepth(60);
        const tex = img.texture.getSourceImage() as { width: number; height: number };
        img.setScale(Math.min(from.boxW / tex.width, from.boxH / tex.height));
        sprite = img;
      } else {
        sprite = this.add.rectangle(from.x, from.y, from.boxW * 0.8, from.boxH * 0.7, hex(COLORS.brandAccent)).setOrigin(0.5, 1).setDepth(60);
      }
      sprite.setAngle(-20); // 좌측으로 ~20° 기울여 날아감
      this.tweens.add({
        targets: sprite,
        x: to.x,
        y: to.y + yShift - ITEM_LIFT,
        delay: i * stagger,
        duration,
        ease: 'Quad.easeInOut',
        onComplete: () => {
          sprite.destroy();
          if (++done === anim.moveCount) onDone();
        },
      });
    }
  }

  private checkEnd(): void {
    if (this.state.status === 'won') {
      this.timerEvent?.remove();
      this.deadlockShowing = false;
      track('level_complete', { level: this.levelIndex + 1, score: this.state.score, combo: this.state.combo });
      const earned = coinsFromScore(this.state.score);
      saveProfile(addCoins(recordResult(loadProfile(), this.levelIndex + 1, this.state.score, true), earned));
      sfx(this, 'sfx_level_clear');
      this.time.delayedCall(450, () => sfx(this, 'sfx_star')); // 별 획득 연출
      this.showOverlay('정리 완료!', COLORS.stateWin, `+🪙 ${earned}`);
      // 오버레이 뒤 배경 매칭 리플레이(무음). tween 지연 사용(게임루프 밖 호출에도 확실히 발화).
      this.tweens.addCounter({ from: 0, to: 1, duration: 700, onComplete: () => this.startWinReplay() });
    } else if (!this.deadlockShowing && this.isStuck()) {
      this.deadlockShowing = true;
      track('deadlock', { level: this.levelIndex + 1 });
      this.showDeadlock();
    }
  }

  /** 현재 보드의 정규형(칸 순서 무관, 좌측팩 스택). 반복 감지 키. */
  private boardCanon(): string {
    return this.state.cells
      .map((c) => c.slots.filter((s) => s !== null).join('.'))
      .sort()
      .join('|');
  }

  /** 이동 후: 반복 추적 갱신 + 자동완성 감지 + 종료 판정. 새 상태=리셋, 기존 상태로 되돌이=카운트. */
  private trackLoopAndCheck(): void {
    const key = this.boardCanon();
    if (this.visitedStates.has(key)) {
      this.loopRepeats += 1; // 이미 지나온 상태 — 되돌이
    } else {
      this.visitedStates.add(key); // 새 상태 도달 — 진전 있음
      this.loopRepeats = 0;
    }

    // 거의 다 풀렸으면(최단 ≤AUTO_FINISH_MOVES) 남은 수를 빠르게 자동 마감.
    if (this.state.status === 'playing' && !this.autoPlaying) {
      const finish = this.findAutoSolution();
      if (finish && finish.length > 0) {
        this.autoComplete(finish);
        return;
      }
    }
    this.checkEnd();
  }

  /** 싼 게이트 통과 시에만 BFS — 최단 해법이 AUTO_FINISH_MOVES 이하면 그 이동 시퀀스. */
  private findAutoSolution(): SolveMove[] | null {
    // 게이트: 비균일 칸 + 여러 칸에 흩어진 종류 ≈ 남은 수 하한. 명백히 멀면 BFS 생략.
    const kindCells = new Map<string, number>();
    let nonUniform = 0;
    for (const c of this.state.cells) {
      const items = c.slots.filter((s) => s !== null) as string[];
      if (items.length === 0) continue;
      if (items.every((x) => x === items[0])) kindCells.set(items[0]!, (kindCells.get(items[0]!) ?? 0) + 1);
      else nonUniform += 1;
    }
    let splitKinds = 0;
    for (const cnt of kindCells.values()) if (cnt > 1) splitKinds += 1;
    if (nonUniform + splitKinds > AUTO_FINISH_MOVES + 2) return null; // 확실히 멀다

    const board = this.state.cells.map((c) => c.slots.filter((s) => s !== null)) as ProductKind[][];
    return solvePath(board, this.level.capacity, AUTO_FINISH_MOVES);
  }

  /**
   * 남은 해법 수를 자동 실행해 마감 — **처음엔 조금 느리게 시작해 점점 빨라지는(가속) 곡선**.
   * 전체적으론 아주 약간만 느린 정도. t=진행도(0→1)에 따라 비행시간·간격이 줄어든다.
   */
  private autoComplete(moves: SolveMove[]): void {
    this.autoPlaying = true;
    this.state = { ...this.state, selected: null };
    if (this.timerEvent) this.timerEvent.paused = true; // 자동완성 중 타이머 정지
    const total = moves.length;

    const step = (i: number): void => {
      if (i >= total || this.state.status === 'won') {
        this.autoPlaying = false;
        if (this.state.status !== 'won' && this.timerEvent) this.timerEvent.paused = false; // 미완 시 타이머 재개
        this.render();
        this.checkEnd();
        return;
      }
      const mv = moves[i]!;
      const fromCell = this.state.cells[mv.from];
      let r = -1;
      if (fromCell) for (let s = fromCell.slots.length - 1; s >= 0; s--) if (fromCell.slots[s] !== null) { r = s; break; }
      const sel: SlotRef = { cell: mv.from, slot: r };
      const withSel = { ...this.state, selected: sel };
      if (r === -1 || !canPlace(withSel, sel, mv.to)) {
        step(i + 1); // 안전장치(해법이 어긋나면 스킵)
        return;
      }
      // 가속 곡선: 진행도 t(첫 수 0 → 마지막 수 1). 처음 느림 → 끝 빠름. (전체 속도 한 단계 더 완화)
      const t = total <= 1 ? 0 : i / (total - 1);
      const duration = Math.round(235 - t * 100); // 235 → 135
      // stagger 크게 — 정리 연출서 여러 개가 한꺼번에가 아니라 **하나씩 주루룩 뒤따라** 날아가도록.
      const stagger = Math.round(165 - t * 55); // 165 → 110
      const gap = Math.round(165 - t * 110); // 수 사이 간격 165 → 55

      const anim = this.computeMove(withSel, sel, mv.to);
      this.state = tap(withSel, mv.to, 0, this.level);
      this.render(anim.suppress);
      this.updateHud();
      this.flyItems(
        anim,
        () => {
          this.render();
          this.playMoveSfx(withSel, anim);
          this.time.delayedCall(gap, () => step(i + 1));
        },
        { duration, stagger },
      );
    };
    step(0);
  }

  // ─── 승리 후 배경 리플레이: 초기 상태부터 해법 자동 재생(반복·무음·입력차단), 오버레이 뒤에서 ───
  private startWinReplay(): void {
    if (this.replaying) return;
    this.replaying = true;
    this.beginReplayCycle();
  }

  /** 한 사이클: 초기 상태로 리셋 → 전체 해법 수순 생성 → 순차 재생. */
  private beginReplayCycle(): void {
    if (!this.replaying) return;
    this.state = createState(this.level); // 처음부터
    this.render();
    const moves = this.buildReplayMoves();
    if (moves.length === 0) {
      this.replaying = false; // 해법 못 만들면 리플레이 생략
      return;
    }
    this.replayStep(moves, 0);
  }

  /** 초기 상태부터 전체 해법 수순 생성(휴리스틱 DFS 풀경로). 못 풀면 빈 배열 → 리플레이 생략. */
  private buildReplayMoves(): SolveMove[] {
    const board = createState(this.level).cells.map((c) => c.slots.filter((s) => s !== null)) as ProductKind[][];
    return solveFullPath(board, this.level.capacity, 200000) ?? [];
  }

  /** 리플레이 한 수 — 이동 애니만, **사운드 없음**. 끝나면 잠시 후 처음부터 반복. */
  private replayStep(moves: SolveMove[], i: number): void {
    if (!this.replaying) return;
    if (i >= moves.length) {
      this.time.delayedCall(900, () => this.beginReplayCycle()); // 완성 잠깐 보여주고 반복
      return;
    }
    const mv = moves[i]!;
    const fromCell = this.state.cells[mv.from];
    let r = -1;
    if (fromCell) for (let s = fromCell.slots.length - 1; s >= 0; s--) if (fromCell.slots[s] !== null) { r = s; break; }
    const sel: SlotRef = { cell: mv.from, slot: r };
    const withSel = { ...this.state, selected: sel };
    if (r === -1 || !canPlace(withSel, sel, mv.to)) {
      this.replayStep(moves, i + 1); // 어긋나면 스킵
      return;
    }
    const anim = this.computeMove(withSel, sel, mv.to);
    this.state = tap(withSel, mv.to, 0, this.level);
    this.render(anim.suppress);
    // 백그라운드 애니메이션 무음(사용자 지정) → playMoveSfx 호출하지 않음.
    this.flyItems(
      anim,
      () => {
        this.render();
        this.time.delayedCall(120, () => this.replayStep(moves, i + 1));
      },
      { duration: 200, stagger: 80 },
    );
  }

  // ─── 로딩 스피너 UI ───
  private showLoadingSpinner(): void {
    if (this.loadingSpinner) return;
    const spinner = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(100);
    const circle = this.add.graphics();
    circle.lineStyle(6, 0xffffff, 0.8);
    circle.strokeCircle(0, 0, 30);
    spinner.add(circle);
    this.tweens.add({
      targets: circle,
      angle: 360,
      duration: 800,
      repeat: -1,
    });
    this.loadingSpinner = spinner;
  }

  private hideLoadingSpinner(): void {
    if (!this.loadingSpinner) return;
    this.loadingSpinner.destroy();
    this.loadingSpinner = undefined;
  }

  /** 하단 토스트 메시지(1.8s 후 페이드 아웃). */
  private toast(msg: string): void {
    const c = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 260).setDepth(300);
    const bg = this.add.graphics();
    bg.fillStyle(hex(COLORS.hudText), 1);
    bg.fillRoundedRect(-290, -34, 580, 68, 18);
    c.add(bg);
    c.add(strokeText(this, 0, -10, msg, 20, { color: COLORS.textWhite, strokeWidth: 0 }).setOrigin(0.5));
    this.tweens.add({ targets: c, alpha: 0, delay: 1800, duration: 600, onComplete: () => c.destroy() });
  }

  /**
   * 막힘(셔플 유도) 판정 — **미리 예측하지 않는다**.
   *  ① 합법 이동이 아예 없음(완전 동결) → 즉시.
   *  ② 새 상태를 못 만들고 **이미 지나온 상태로만 연속 반복(되돌이)** → LOOP_REPEAT_LIMIT 회 누적 시.
   * 풀이가능 여부를 깊게 탐색(예측)하지 않으므로 일찍 뜨지 않는다.
   */
  private isStuck(): boolean {
    return !hasLegalMove(this.state) || this.loopRepeats >= LOOP_REPEAT_LIMIT;
  }

  // ─── 데드락: 셔플 유도(오버레이는 storeOverlays) ───
  private showDeadlock(): void {
    showDeadlockOverlay(this, {
      onShuffle: () => this.shuffle(),
      onRetry: () => this.scene.start('StoreScene', { levelIndex: this.levelIndex }),
    });
  }

  private shuffle(): void {
    this.deadlockShowing = false; // 팝업 닫혔으니 플래그 해제
    track('shuffle', { level: this.levelIndex + 1 });
    const positions: Array<{ c: number; s: number }> = [];
    const flat: string[] = [];
    this.state.cells.forEach((cell, ci) =>
      cell.slots.forEach((kind, si) => {
        if (kind !== null) {
          positions.push({ c: ci, s: si });
          flat.push(kind);
        }
      }),
    );
    // 같은 아이템을 재배치하되 **풀이 가능한** 배치만 채택(랜덤 배치는 대부분 풀이불가일 수 있음).
    let solvable: StoreState | null = null;
    for (let attempt = 0; attempt < 80; attempt++) {
      Phaser.Utils.Array.Shuffle(flat);
      const cells = this.state.cells.map((c) => ({ slots: c.slots.map(() => null as string | null), capacity: c.capacity }));
      positions.forEach((p, idx) => {
        cells[p.c]!.slots[p.s] = flat[idx]!;
      });
      const candidate: StoreState = { ...this.state, cells, selected: null };
      if (!hasLegalMove(candidate)) continue;
      const board = candidate.cells.map((c) => c.slots.filter((s) => s !== null)) as ProductKind[][];
      if (solveStatus(board, this.level.capacity) === 'solvable') {
        solvable = candidate;
        break;
      }
    }
    if (solvable) {
      this.state = solvable;
    } else {
      // 보장: 풀이가능 재배치를 못 찾으면 같은 난이도의 **새 풀이가능 보드** 생성.
      const fresh = generateLevel(this.levelIndex);
      this.level = fresh;
      this.state = { ...this.state, cells: createState(fresh).cells, selected: null };
    }
    // 셔플 = 새 보드 → 반복 추적 리셋.
    this.visitedStates = new Set([this.boardCanon()]);
    this.loopRepeats = 0;
    this.render();
    this.updateHud();
  }

  // ─── 승/패 오버레이(오버레이는 storeOverlays) ───
  private showOverlay(title: string, color: string, subtitle: string): void {
    showResultOverlay(this, {
      title,
      color,
      subtitle,
      score: this.state.score,
      isWin: title === '정리 완료!',
      onRetry: () => this.scene.start('StoreScene', { levelIndex: this.levelIndex }),
      onHome: () => this.scene.start('HomeScene'),
      onNext: () => this.scene.start('StoreScene', { levelIndex: this.levelIndex + 1 }),
    });
  }
}
