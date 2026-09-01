import Phaser from 'phaser';
import { isAdGateTurn, playGateAd } from '@casual/core';
import { getStore } from '@casual/core/store/index.js';
import { COLORS, startCountdown, strokeText } from '@casual/core';
import { createState, tap, canPlace, hasLegalMove, markLost } from '../logic/storeMachine.js';
import type { StoreState, LevelConfig, SlotRef, ProductKind } from '../logic/types.js';
import { generateLevel, PRODUCTS } from '../logic/levels.js';
import { solveStatus, solvePath, hintFirstMove, solveFullPath, type SolveMove } from '../logic/generate.js';
import { sfx, startBgm, isBgmOn, isSfxOn, setBgmEnabled, setSfxEnabled } from '../audio.js';
import { track } from '../analytics.js';
import { loadProfile, saveProfile, recordResult, addCoins, coinsFromScore, consumeLife, availableLives, DEFAULT_AVATAR_KEY } from '../meta/index.js';
import { GRID, SLOT_GAP, type CellBox, computeShelfLayout, slotGeom as computeSlotGeom, type SlotGeom } from './storeLayout.js';
import { assembleShelf, type AssembledShelf } from './shelfAssembly.js';
import { showResultPopup, showMessagePopup, showConfirmPopup, renderLayoutFit, applyProfile } from './storeOverlays.js';
import { buildLayout, type LayoutDoc, type LayoutIndex, type LayoutObject } from '../ui/layoutLoader.js';
import { UI_PLAY_LAYOUT_KEY, UI_WIN_LAYOUT_KEY, UI_LOSE_LAYOUT_KEY, UI_MSG_LAYOUT_KEY, UI_MENU_LAYOUT_KEY } from '../assets.js';

const hex = (s: string): number => parseInt(s.replace('#', ''), 16);

const DEBUG_CELLS = false;
/** 데드락: **미리 예측하지 않고** 실제 반복(이미 지나온 상태로만 되돌이) 연속 횟수가 이만큼이면 자동 셔플. */
const LOOP_REPEAT_LIMIT = 6;
/** 자동완성: 최단 해법이 이 수 이하로 남으면 남은 수를 빠르게 자동 실행해 마감. */
const AUTO_FINISH_MOVES = 5;

/** 승리 후 배경 리플레이 — 전체가 아니라 **마지막 N수(마감 장면)만** 반복 재생. */
const WIN_REPLAY_TAIL = 3;
/** 아이템을 바닥 기준 이만큼 위로 배치. */
const ITEM_LIFT = 6;
/** 그림자를 바닥(floorBase) 기준 이만큼 위로 올려 아이템 하단 뒤에 겹치게(그림자=아이템 뒤). */
const SHADOW_RAISE = 6;
/** 진열장 상단 캐릭터(Neko) — 아이템 렌더 높이의 배율(이전 1.5의 80% = 1.2배). */
const CHAR_ITEM_SCALE = 1.2;
/** 캐릭터 발이 진열대 표면에 살짝 얹혀 박히는 양(px, 자연스러운 안착감). */
const CHAR_REST_SINK = 8;
/** 캐릭터 depth(진열장/아이템 위, 헤더/오버레이 아래). */
const CHAR_DEPTH = 6;

// ── 세로 HD(1080×2400) 게임플레이 보드 배치(에디터 크롬의 빈 중앙 밴드) ──
/** 진열장 depth(배경 위, 헤더/사이드/하단메뉴 아래). 에디터 배경=depth1, 헤더=11~. */
const SHELF_DEPTH = 2;
const ITEM_DEPTH = 3;
/** 진열장 하단 정렬 Y — 하단 메뉴(y≈2221) 위. */
const BOARD_BOTTOM_Y = 2055;
/** 진열장 세로 밴드 상한(초과 시 축소해 사이드 아이콘 행/하단 메뉴 침범 방지). */
const BOARD_TARGET_H = 1440;

// ── 에디터 "플레이 화면"(blank_copy2.json) 노드 id ──
const P = {
  bg: 'layer_1',
  profile: 'layer_5', // 프로필창(프레임) — 안에 통합 아바타 렌더
  lv: 'layer_3_copy', // "Lv 21"
  timer: 'layer_3', // "02:30"
  coin: 'layer_13_copy7', // "36,708"
  settings: 'layer_8',
  clock: 'layer_10_copy', // 02-1 시계(장식)
  pause: 'layer_10_copy2', // 02-2 일시정지
  // 하단 메뉴 5종
  home: 'layer_10_copy3', // 02-3 홈
  hint: 'layer_10_copy4', // 02-4 힌트
  restart: 'layer_10_copy5', // 02-5 재시작
  test: 'layer_10_copy6', // 02-6 테스트 5수
  undo: 'layer_10_copy7', // 02-7 되돌리기(BACK)
} as const;

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
  private chrome?: LayoutIndex; // 에디터 플레이 화면(크롬) 인덱스
  private timerText?: Phaser.GameObjects.Text; // 에디터 타이머 노드(동적 바인딩)
  private lvText?: Phaser.GameObjects.Text; // 에디터 레벨 노드
  private coinText?: Phaser.GameObjects.Text; // 에디터 코인 노드
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
  private replayMoves: SolveMove[] = []; // 승리 리플레이 전체 해법(1회 계산 후 마지막 N수만 반복)
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
    // 하트 게이트 — 0이면 진입 불가(실패로 소진 후 재시도 포함). 홈으로 복귀.
    if (availableLives(loadProfile(), Date.now()) <= 0) {
      this.scene.start('HomeScene');
      return;
    }
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

    // 에디터 "플레이 화면"(SSOT) = 배경 + 헤더(프로필/하트/코인/설정) + 타이머 + 사이드 아이콘 + 하단 메뉴.
    // 진열장/아이템은 이 크롬의 빈 중앙 밴드에 코드로 그린다(네이티브 1080×2400).
    this.buildChrome();

    this.ensureShadowTexture();
    this.buildShelf();

    this.shelfLayer = this.add.container(0, 0).setDepth(ITEM_DEPTH);
    this.render();

    if (this.level.timeSec) {
      this.timeLeft = this.level.timeSec; // 표시값은 즉시(HUD), 감소는 카운트다운 뒤부터.
      // 타임어택 시작 예고 — 3·2·1 카운트다운(코어 공용) 후 타이머 개시.
      void startCountdown(this).then(() => {
        if (!this.scene.isActive()) return; // 카운트 중 씬 이탈 방어
        this.timerEvent = this.time.addEvent({ delay: 1000, loop: true, callback: () => this.onTick() });
      });
    }

    startBgm(this); // 배경음악 지속(씬 전환에도 끊기지 않음)
    sfx(this, 'sfx_level_start');
    this.showStageIntro(); // 스테이지 진입 시 레벨 배너(다음 스테이지 이동 시 현재 레벨 표시)
  }

  /** 레벨 시작(다음 스테이지 이동 포함) 시 "STAGE N" 배너를 잠깐 표시 후 사라짐. */
  private showStageIntro(): void {
    const c = this.add.container(this.scale.width / 2, this.scale.height * 0.3).setDepth(200);
    c.add(strokeText(this, 0, -34, 'STAGE', 40, { strokeColor: COLORS.brandGreen, strokeWidth: 6 }).setOrigin(0.5));
    c.add(strokeText(this, 0, 26, `${this.levelIndex + 1}`, 96, { strokeColor: COLORS.brandGreen, strokeWidth: 10 }).setOrigin(0.5));
    c.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, alpha: 0, delay: 1150, duration: 500, onComplete: () => c.destroy() });
  }

  // ─── 에디터 "플레이 화면"(SSOT 크롬) 렌더 + 동적 바인딩 ───
  private buildChrome(): void {
    const doc = this.cache.json.get(UI_PLAY_LAYOUT_KEY) as LayoutDoc | undefined;
    if (doc?.nodes?.length) {
      this.chrome = buildLayout(this, doc);
      this.bindChrome();
    } else {
      // 레이아웃 로드 실패 방어 — 배경색만(화면 비지 않게).
      this.add
        .rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, hex(COLORS.surfaceFloor))
        .setDepth(0);
    }
  }

  private bindChrome(): void {
    const c = this.chrome;
    if (!c) return;
    // 통합 프로필 — 에디터 저작 디자인(배경+아바타) 적용. 플레이 레이아웃 미갱신 시 코드로 보강.
    const playDoc = this.cache.json.get(UI_PLAY_LAYOUT_KEY) as LayoutDoc | undefined;
    if (playDoc) applyProfile(this, c, playDoc, P.profile, loadProfile().avatarKey ?? DEFAULT_AVATAR_KEY);
    // 정적 수치: 레벨 · 코인.
    this.lvText = c.tryById<Phaser.GameObjects.Text>(P.lv);
    this.lvText?.setText(`Lv ${this.levelIndex + 1}`);
    this.coinText = c.tryById<Phaser.GameObjects.Text>(P.coin);
    this.coinText?.setText(loadProfile().coins.toLocaleString());
    // 타이머(동적) — 에디터 텍스트 노드 재사용.
    this.timerText = c.tryById<Phaser.GameObjects.Text>(P.timer);
    this.timerText?.setText(this.fmtTime(this.level.timeSec ?? 0));

    // 설정 기어 · 일시정지 → 공용 메뉴(계속/사운드/홈).
    this.wireBtn(P.settings, () => this.openMenu());
    this.wireBtn(P.pause, () => this.openMenu());
    // 하단 메뉴 5종.
    this.wireBtn(P.home, () => { sfx(this, 'sfx_button_tap'); this.scene.start('HomeScene'); });
    this.wireBtn(P.hint, () => this.useHint());
    this.wireBtn(P.restart, () => { sfx(this, 'sfx_button_tap'); this.scene.start('StoreScene', { levelIndex: this.levelIndex }); });
    this.wireBtn(P.test, () => this.useTestHint());
    this.wireBtn(P.undo, () => this.useUndo());

    // 힌트·되돌리기 잔여 수 뱃지(에디터 아이콘 우하단).
    const p = loadProfile();
    this.hintText = this.badge(P.hint, String(p.powerups.hint ?? 0));
    this.undoText = this.badge(P.undo, String(p.powerups.undo ?? 0));
  }

  /** 에디터 노드 위에 탭 존 + 눌림 연출을 얹는다(히트 영역 = 노드 표시 크기). */
  private wireBtn(id: string, onClick: () => void): void {
    const node = this.chrome?.nodeById(id);
    const obj = this.chrome?.tryById<LayoutObject>(id) as
      | (LayoutObject & { x: number; y: number; scaleX: number; scaleY: number; setScale: (x: number, y?: number) => unknown })
      | undefined;
    if (!node || !obj) return;
    this.add
      .zone(obj.x, obj.y, node.w ?? 100, node.h ?? 100)
      .setInteractive({ useHandCursor: true })
      .setDepth(90)
      .on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
        ev?.stopPropagation?.();
        const sx = obj.scaleX;
        const sy = obj.scaleY;
        this.tweens.killTweensOf(obj);
        obj.setScale(sx, sy);
        this.tweens.add({ targets: obj, scaleX: sx * 0.9, scaleY: sy * 0.9, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
        onClick();
      });
  }

  /** 에디터 아이콘 우하단 카운트 뱃지(힌트·되돌리기 잔여 수). */
  private badge(id: string, value: string): Phaser.GameObjects.Text | undefined {
    const node = this.chrome?.nodeById(id);
    if (!node) return undefined;
    const bx = node.x + (node.w ?? 100) / 2 - 14;
    const by = node.y + (node.h ?? 100) / 2 - 14;
    this.add.circle(bx, by, 24, hex(COLORS.brandGreen)).setDepth(48).setStrokeStyle(3, 0xffffff);
    return strokeText(this, bx, by, value, 26, { strokeWidth: 0 }).setOrigin(0.5).setDepth(49);
  }

  // ─── 일시정지 메뉴 — 에디터 "팝업 메뉴표시"(blank_3_copy_copy) SSOT. 버튼은 이미지 키로 매핑(순서 무관). ───
  private openMenu(): void {
    if (this.timerEvent) this.timerEvent.paused = true;
    sfx(this, 'sfx_popup_open');
    const doc = this.cache.json.get(UI_MENU_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!doc?.nodes?.length) { this.openMenuLegacy(); return; } // 방어: 레이아웃 미로드 시 코드 메뉴

    const w = this.scale.width;
    const h = this.scale.height;
    const layer = this.add.container(0, 0).setDepth(250);
    layer.add(this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.6).setInteractive());
    const rl = renderLayoutFit(this, doc, 251);
    layer.add(rl.container);

    const resume = (): void => {
      sfx(this, 'sfx_popup_close');
      if (this.timerEvent && this.state.status === 'playing') this.timerEvent.paused = false;
      layer.destroy();
    };
    const reopen = (): void => { layer.destroy(); this.openMenu(); };

    // 버튼 이미지 키 → 동작(노드 id·배치 순서 변경에 무관).
    const actions: Record<string, () => void> = {
      'up_UI_profile_04-3': resume, // ▶ CONTINUE
      'up_UI_profile_04-1': () => { setSfxEnabled(!isSfxOn()); reopen(); }, // 🔔 SFX
      'up_UI_profile_04-2': () => { setBgmEnabled(this, !isBgmOn()); reopen(); }, // 🎵 BGM
      'up_UI_profile_04-4': () => { sfx(this, 'sfx_button_tap'); this.scene.start('HomeScene'); }, // 🏠 HOME
    };
    // 토글 OFF 상태는 흐리게 — 현재 켜짐/꺼짐 피드백(에셋은 단일 상태 이미지라 알파로 표현).
    const dimmed: Record<string, boolean> = {
      'up_UI_profile_04-1': !isSfxOn(),
      'up_UI_profile_04-2': !isBgmOn(),
    };

    for (const n of doc.nodes) {
      if (n.type !== 'image' || !n.key) continue;
      const obj = rl.index.tryById<Phaser.GameObjects.Image>(n.id);
      if (obj && dimmed[n.key]) obj.setAlpha(0.45);
      const onClick = actions[n.key];
      const rect = rl.worldRect(n.id);
      if (!onClick || !rect) continue;
      const zone = this.add
        .zone(rect.x, rect.y, rect.w, rect.h)
        .setInteractive({ useHandCursor: true })
        .setDepth(252)
        .on('pointerdown', () => {
          if (obj) {
            const bx = obj.scaleX;
            const by = obj.scaleY;
            this.tweens.killTweensOf(obj);
            this.tweens.add({ targets: obj, scaleX: bx * 0.9, scaleY: by * 0.9, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
          }
          onClick();
        });
      layer.add(zone); // layer 파괴 시 존도 함께 제거
    }
  }

  // ─── (폴백) 코드 드로우 일시정지 메뉴 — 에디터 레이아웃 미로드 시. ───
  private openMenuLegacy(): void {
    if (this.timerEvent) this.timerEvent.paused = true;
    sfx(this, 'sfx_popup_open');
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const cy = h / 2;
    const layer = this.add.container(0, 0).setDepth(250);
    layer.add(this.add.rectangle(cx, cy, w, h, 0x000000, 0.6).setInteractive());
    const pg = this.add.graphics();
    pg.fillStyle(0xffffff, 1);
    pg.fillRoundedRect(cx - 330, cy - 380, 660, 760, 32);
    layer.add(pg);
    layer.add(strokeText(this, cx, cy - 280, '일시정지', 46, { strokeColor: COLORS.brandGreen, strokeWidth: 7 }).setOrigin(0.5));
    const resume = (): void => {
      sfx(this, 'sfx_popup_close');
      if (this.timerEvent && this.state.status === 'playing') this.timerEvent.paused = false;
      layer.destroy();
    };
    const reopen = (): void => { layer.destroy(); this.openMenu(); };
    this.menuBtn(layer, cx, cy - 130, 400, 100, '▶ 계속하기', COLORS.brandGreen, resume);
    this.menuBtn(layer, cx, cy - 10, 400, 100, isBgmOn() ? '🎵 배경음악 ON' : '🎵 배경음악 OFF', isBgmOn() ? COLORS.gemBlue : COLORS.surfaceWood, () => { setBgmEnabled(this, !isBgmOn()); reopen(); });
    this.menuBtn(layer, cx, cy + 110, 400, 100, isSfxOn() ? '🔔 효과음 ON' : '🔔 효과음 OFF', isSfxOn() ? COLORS.gemBlue : COLORS.surfaceWood, () => { setSfxEnabled(!isSfxOn()); reopen(); });
    this.menuBtn(layer, cx, cy + 250, 400, 100, '🏠 홈으로', COLORS.stateWarn, () => { sfx(this, 'sfx_button_tap'); this.scene.start('HomeScene'); });
  }

  private menuBtn(layer: Phaser.GameObjects.Container, cx: number, cy: number, w: number, h: number, label: string, fill: string, onClick: () => void): void {
    const g = this.add.graphics();
    g.fillStyle(hex(fill), 1);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 22);
    layer.add(g);
    layer.add(strokeText(this, cx, cy, label, 30, { strokeWidth: 0 }).setOrigin(0.5));
    layer.add(
      this.add
        .zone(cx, cy, w, h)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => { sfx(this, 'sfx_button_tap'); onClick(); }),
    );
  }

  private fmtTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  private updateHud(): void {
    if (this.timerText) {
      this.timerText.setText(this.fmtTime(this.timeLeft));
      this.timerText.setColor(this.timeLeft <= 10 ? '#e63946' : '#ffffff');
    }
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
      // 실패 시 하트 1개 차감(진입 시엔 소모하지 않음). 실패 기록도 함께 저장.
      const failed = recordResult(loadProfile(), this.levelIndex + 1, this.state.score, false);
      saveProfile(consumeLife(failed, Date.now()) ?? failed);
      sfx(this, 'sfx_level_fail');
      this.showLosePopup();
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
    const layout = computeShelfLayout(this.level, this.scale.width, tex);

    if (tex) {
      this.add.image(layout.shelfCx, layout.shelfCy, shelfKey).setDisplaySize(layout.shelfW, layout.shelfH).setDepth(SHELF_DEPTH);
    } else {
      this.add.rectangle(layout.shelfCx, layout.shelfCy, layout.shelfW, layout.shelfH, hex(COLORS.surfaceWood), 0.9).setDepth(SHELF_DEPTH);
    }
    this.cellGeom = layout.cells;
    this.drawDebugCells();
  }

  // ─── 조립식 진열장(9-slice 부품, shelfAssembly) — 에디터 플레이 화면 중앙 밴드에 네이티브 배치 ───
  private buildShelfFromParts(): void {
    const cols = this.level.cols ?? 3;
    const rows = this.level.rows ?? 3; // 연결 베이스 play 행
    const displayRows = this.level.displayRows ?? 0; // 전시행(필요 레벨만)
    const bumps = this.level.bumps ?? []; // 열별 상단 돌출(요철)
    // 하단(BOARD_BOTTOM_Y) 정렬 + 세로 밴드(BOARD_TARGET_H) 맞춤 → 행수 2→6 이 하단부터 위로 성장.
    // 폭·세로 중 작은 스케일을 assembleShelf 가 고르므로 6행도 밴드 초과 안 함(1080 폭 네이티브).
    const asm = assembleShelf(cols, rows, this.scale.width * 0.95 - 10, this.scale.width / 2, BOARD_BOTTOM_Y, displayRows, bumps, BOARD_TARGET_H);

    for (const p of asm.parts) {
      if (this.textures.exists(p.key)) {
        // +2px 블리드(겹침): 고해상도 스케일업 시 부품 사이 헤어라인 seam 방지.
        this.add.image(p.cx, p.cy, p.key).setDisplaySize(p.w + 2, p.h + 2).setDepth(SHELF_DEPTH);
      } else {
        this.add.rectangle(p.cx, p.cy, p.w, p.h, hex(COLORS.surfaceWood), 0.9).setStrokeStyle(2, 0x000000, 0.15).setDepth(SHELF_DEPTH);
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
      const img = this.add.image(cell.cx, cell.cy + cell.h / 2, key).setOrigin(0.5, 1).setDepth(SHELF_DEPTH);
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

  // (하단 파워업/HUD는 에디터 "플레이 화면" 크롬으로 대체됨 — bindChrome 참고.)

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
      this.toast('되돌리기 아이템을 모두 사용했어요');
      return;
    }
    if (this.historyStateStack.length === 0) {
      sfx(this, 'sfx_item_invalid');
      this.toast('되돌릴 이동이 없어요');
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
        this.toast('지금은 추천할 이동이 없어요');
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
      this.showWinPopup(earned);
      // 오버레이 뒤 배경 매칭 리플레이(무음). tween 지연 사용(게임루프 밖 호출에도 확실히 발화).
      this.tweens.addCounter({ from: 0, to: 1, duration: 700, onComplete: () => this.startWinReplay() });
    } else if (!this.deadlockShowing && this.isStuck()) {
      // 데드락 = 자동 셔플(풀이가능 보드로 재배치) — 새 팝업 세트는 승/패 2종뿐이라 팝업 대신 무중단 처리.
      track('deadlock', { level: this.levelIndex + 1 });
      this.autoShuffle();
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

  // ─── 승리 후 배경 리플레이: **마지막 마감 장면(마지막 N수)만** 반복 재생(무음·입력차단), 오버레이 뒤 ───
  private startWinReplay(): void {
    if (this.replaying) return;
    this.replaying = true;
    this.replayMoves = this.buildReplayMoves(); // 전체 해법 1회 계산 → 사이클마다 재사용(마지막 N수만 재생)
    if (this.replayMoves.length === 0) {
      this.replaying = false; // 해법 못 만들면 리플레이 생략
      return;
    }
    this.beginReplayCycle();
  }

  /** 한 사이클: 마지막 N수 직전 상태까지 즉시 진행(무애니) → 마지막 N수만 애니메이션 재생. */
  private beginReplayCycle(): void {
    if (!this.replaying) return;
    const all = this.replayMoves;
    const tail = Math.min(WIN_REPLAY_TAIL, all.length);
    const head = all.length - tail;
    // 초기 상태에서 head 수를 즉시 적용 → 마감 직전(마지막 N수 시작) 상태로 세팅.
    let s = createState(this.level);
    for (let i = 0; i < head; i++) s = this.applyMoveInstant(s, all[i]!);
    this.state = s;
    this.render();
    this.replayStep(all.slice(head), 0);
  }

  /** 이동 하나를 즉시(무애니) 상태에 적용 — 리플레이 마감 직전 상태로 빠르게 감기. 어긋나면 원상태 유지. */
  private applyMoveInstant(state: StoreState, mv: SolveMove): StoreState {
    const fromCell = state.cells[mv.from];
    let r = -1;
    if (fromCell) for (let s = fromCell.slots.length - 1; s >= 0; s--) if (fromCell.slots[s] !== null) { r = s; break; }
    if (r === -1) return state;
    const sel: SlotRef = { cell: mv.from, slot: r };
    const withSel = { ...state, selected: sel };
    if (!canPlace(withSel, sel, mv.to)) return state;
    return tap(withSel, mv.to, 0, this.level);
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
    const spinner = this.add.container(this.scale.width / 2, this.scale.height / 2).setDepth(260);
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

  /** 메시지 토스트 — 에디터 "빈 화면"(blank_4) SSOT 로 표시. 레이아웃 미로드 시 코드 폴백. */
  private toast(msg: string): void {
    if (showMessagePopup(this, UI_MSG_LAYOUT_KEY, msg)) return;
    this.toastFallback(msg);
  }

  /** 코드 폴백 토스트(레이아웃 미로드 방어) — 상단 배치, 폰트·배경폭 메시지 적응, ~3s 후 페이드. */
  private toastFallback(msg: string): void {
    const label = strokeText(this, 0, 0, msg, 30, { color: COLORS.textWhite, strokeWidth: 0 }).setOrigin(0.5);
    const halfW = Math.max(300, Math.ceil(label.width / 2) + 44);
    const y = this.timerText ? this.timerText.getBounds().bottom + 72 : 460;
    const c = this.add.container(this.scale.width / 2, y).setDepth(300);
    const bg = this.add.graphics();
    bg.fillStyle(hex(COLORS.hudText), 1);
    bg.fillRoundedRect(-halfW, -40, halfW * 2, 80, 20);
    c.add(bg);
    c.add(label);
    this.tweens.add({ targets: c, alpha: 0, delay: 2400, duration: 600, onComplete: () => c.destroy() });
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

  // ─── 데드락: 확인(OK) 후 셔플(풀이가능 보드로 재배치) — 즉시 정리하지 않고 플레이어 확인을 받는다 ───
  private autoShuffle(): void {
    this.deadlockShowing = true; // 확인 대기·셔플 중 재진입 방지
    if (this.timerEvent) this.timerEvent.paused = true; // 확인 대기 중 타이머 정지(무이동 데드락 상태)
    showConfirmPopup(this, UI_MSG_LAYOUT_KEY, '옮길 곳이 없어 진열대를 다시 정리해요', 'UI_btn_01', () => {
      if (this.timerEvent && this.state.status === 'playing') this.timerEvent.paused = false;
      this.shuffle();
    });
  }

  private shuffle(): void {
    this.deadlockShowing = false; // 셔플 완료 → 가드 해제
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

  // ─── 결과 팝업(에디터 SSOT: 성공=blank_3 / 실패=blank_3_copy) ───
  /** 승리 팝업 — RETRY/HOME/NEXT. 점수·획득 코인 바인딩. 배경 딤 옅게(뒤 리플레이 노출). */
  private showWinPopup(earned: number): void {
    showResultPopup(this, UI_WIN_LAYOUT_KEY, {
      backdropAlpha: 0.35,
      binds: { layer_4: `점수 ${this.state.score}`, layer_4_copy: `+${earned}` },
      buttons: {
        layer_2_copy: () => this.scene.start('StoreScene', { levelIndex: this.levelIndex }), // RETRY
        layer_2: () => this.scene.start('HomeScene'), // HOME
        layer_2_copy2: () => this.gateThenNextLevel(), // NEXT — 3레벨마다 관문 광고(공통 광고 정책)
      },
    });
  }

  /**
   * 레벨 전환 **관문(전면) 광고** — 3레벨마다 1번(`@casual/core` adPolicy, 2026-09-02 광고 모델).
   * 초반(레벨 인덱스 ≤3 = 표시 레벨 ≤4)은 면제. 광고가 닫힌 **뒤에** 다음 레벨로 간다.
   */
  private gateThenNextLevel(): void {
    const next = (): void => {
      this.scene.start('StoreScene', { levelIndex: this.levelIndex + 1 });
    };
    const { ads } = getStore();
    const gate = isAdGateTurn({
      count: this.levelIndex + 1,
      adsUsable: ads.fullscreenSupported || ads.allowPlaceholders,
      exempt: this.levelIndex + 1 <= 4,
      every: 3,
    });
    if (!gate) {
      next();
      return;
    }
    playGateAd(this, ads, next);
  }

  /** 실패 팝업 — RETRY/HOME. 점수 바인딩. */
  private showLosePopup(): void {
    showResultPopup(this, UI_LOSE_LAYOUT_KEY, {
      backdropAlpha: 0.55,
      binds: { layer_4: `점수 ${this.state.score}` },
      buttons: {
        layer_2_copy: () => this.scene.start('StoreScene', { levelIndex: this.levelIndex }), // RETRY
        layer_2: () => this.scene.start('HomeScene'), // HOME
      },
    });
  }
}
