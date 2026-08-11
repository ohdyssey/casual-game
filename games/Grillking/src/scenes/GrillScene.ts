/**
 * GrillScene — 메인 게임플레이. 에디터 레이아웃(main.json)을 런타임에 구성하고,
 * 그 위에 그릴 보드(드래그 이동·3매치·쟁반 리필·연쇄)를 올린다.
 *
 * 상태: playing → won | failed. 보드 해소는 **동기**(즉시)이고 매치·리필 연출은 독립 트윈이라
 * 연출 중에도 입력이 잠기지 않는다(여러 그릴 동시 조작·매치 가능).
 * 보드 로직은 logic/board.ts(순수)만 신뢰하고, 씬은 결과 이벤트를 연출한다.
 */
import Phaser from 'phaser';
import { startCountdown } from '@casual/core';
import { itemKey } from '../assets.js';
import { isSfxOn, setSfxOn, sfx } from '../audio.js';
import {
  anyMatchPossible,
  autoFinishRemaining,
  canMove,
  coolNeighborChar,
  findMatchGrill,
  isDeadlocked,
  makeRng,
  moveSkewer,
  pinnedRemaining,
  refillEmptyGrills,
  resolveMatch,
  shuffleBoard,
  SLOT_COUNT,
  totalRemaining,
} from '../logic/board.js';
import { GRID_COLS, GRID_ROWS, GRILL_COUNT, MAX_LEVEL, generateBoard, levelConfig } from '../logic/levels.js';
import type { BoardState, ItemType, LevelCfg, RefillEvent } from '../logic/types.js';
import { loadSave, updateSave } from '../save.js';
import { buildLayout, type LayoutDoc, LayoutIndex } from '../ui/layoutLoader.js';
import { GrillView, SKEWER_H, SKEWER_W } from './grillView.js';
import { Hud } from './hud.js';
import { openLevelSelect } from './levelSelect.js';
import { MissionDirector } from './missionDirector.js';
import { openPopup, type PopupButton, showToast } from './popups.js';

type GameState = 'playing' | 'won' | 'failed';
type FailReason = 'time' | 'deadlock' | 'exhausted';

const DEPTH_SKEWER = 40;
const DEPTH_DRAG = 900;
const DEPTH_FLY = 950;
/** 서빙된 꼬치가 날아가는 클로슈(주문 접시) 위치 — main.json 쟁반 노드(layer_17) 중심. */
const CLOCHE_POS = { x: 871, y: 350 };
const COMBO_SEC = 6;
const COMBO_MAX = 9;
const COIN_PER_MATCH = 10;
const MISSION_COIN = 100;
const MISSION_BONUS_SEC = 5;
const SHUFFLE_COST = 150;
const TIME_COST = 200;
const TIME_BONUS = 30;

// 그릴 그리드는 "테이블 상판"(layer_3 윗변 ~ 하단 메뉴 버튼 윗변) 을 기준으로 런타임 산출한다.
// 에디터의 정적 그릴 노드(숨김)는 디자인 참고용일 뿐. 세로로 늘어난 화면에서 테이블이 아래로
// 늘어나면 버튼도 함께 내려가므로, 이 띠의 정중앙을 따라 그리드도 같이 내려와 항상 가운데 정렬된다.
/** 열 간격(px) — 그릴(폭 312)이 3열로 좌우 패딩(≈48px)을 두고 1080폭에 들어가도록. */
const GRID_COL_PITCH = 336;
/** 행 간격(px) — 그릴(높이 267) 4행이 테이블 띠를 고루 채우도록. */
const GRID_ROW_PITCH = 318;

interface DragInfo {
  sprite: Phaser.GameObjects.Image;
  grillId: number;
  slot: number;
}

export class GrillScene extends Phaser.Scene {
  private layout!: LayoutIndex;
  private hud!: Hud;
  private mission!: MissionDirector;
  private views: GrillView[] = [];
  private sprites: (Phaser.GameObjects.Image | null)[][] = [];

  private cfg!: LevelCfg;
  private board!: BoardState;
  private state: GameState = 'playing';
  private paused = false;

  private levelNum = 1;
  private coins = 0;
  private coinsEarned = 0;
  private timeLeft = 0;
  private chain = 0;
  private comboT = 0;
  private freeShuffleUsed = false;

  private drag: DragInfo | null = null;
  private hoverView: GrillView | null = null;
  private shuffleLabel?: Phaser.GameObjects.Text;
  /** 고정 꼬치 스프라이트 → 위에 얹은 고정 표시(밴드). 매치로 날아갈 때 함께 제거. */
  private pinOverlays = new Map<Phaser.GameObjects.Image, Phaser.GameObjects.GameObject>();
  /** 숯(방해) 타일 — grillId(항상 슬롯2) → 시각 요소. 인접 매치로 냉각/해제. */
  private charTiles = new Map<number, { objs: Phaser.GameObjects.GameObject[]; label: Phaser.GameObjects.Text; level: number }>();

  constructor() {
    super('grill');
  }

  create(): void {
    const save = loadSave();
    // 레벨 선택/다음 레벨 등에서 넘긴 명시 레벨이 있으면 그걸, 없으면 세이브의 현재 레벨을 쓴다.
    const override = (this.scene.settings.data as { level?: number } | undefined)?.level;
    this.levelNum = Math.max(1, Math.min(MAX_LEVEL, Math.floor(override ?? save.level) || 1));
    this.coins = save.coins;
    this.coinsEarned = 0;
    this.state = 'playing';
    this.paused = false;
    this.chain = 0;
    this.comboT = 0;
    this.freeShuffleUsed = false;
    this.drag = null;
    this.hoverView = null;
    // 씬 재시작 시 이전 세대의 죽은 GameObject 참조가 남지 않게 비운다.
    this.pinOverlays.clear();
    this.charTiles.clear();

    this.cfg = levelConfig(this.levelNum);
    this.timeLeft = this.cfg.timeSec;

    const doc = this.cache.json.get('ui_layout') as LayoutDoc;
    this.layout = buildLayout(this, doc);

    // 에디터의 정적 그릴/샘플 꼬치는 게임이 직접 그린다 — 숨김.
    this.layout.setGroupVisible('grp_2', false);
    this.layout.setGroupVisible('grp_3', false);
    this.layout.setGroupVisible('grp_4', false);

    this.createGrills();
    this.hud = new Hud(this, this.layout, this.levelNum);
    // 특별주문은 이 레벨의 메뉴(typePool) 중에서만 요청하고, 레벨이 오를수록 더 자주 등장한다.
    this.mission = new MissionDirector(this, this.layout, this.cfg.typePool, this.levelNum, {
      onSuccess: () => {
        this.coins += MISSION_COIN;
        this.coinsEarned += MISSION_COIN;
        this.timeLeft += MISSION_BONUS_SEC;
        this.persistCoins();
        this.hud.setCoins(this.coins);
        this.hud.setTime(this.timeLeft);
        showToast(this, `미션 성공! +${MISSION_COIN}코인 +${MISSION_BONUS_SEC}초`);
      },
      onExpire: () => showToast(this, '미션 시간이 끝났어요...'),
    });

    const seed = (Math.floor(Math.random() * 0x7fffffff) ^ (this.levelNum * 7919)) >>> 0;
    this.board = generateBoard(this.cfg, seed);
    this.renderInitialBoard();

    this.hud.setTime(this.timeLeft);
    this.hud.setProgress(0, this.cfg.targetSkewers);
    this.hud.setCoins(this.coins);
    this.hud.setMultiplier(1, 0);
    this.hud.setDishes(0, false);

    this.wireButtons();
    this.wireDrag();
    this.installEdgeGuard();

    // 타임어택 — 3·2·1 카운트다운(코어 공용) 후 레벨 타이머 개시.
    void startCountdown(this).then(() => {
      if (this.state !== 'playing') return; // 카운트 중 결과/이탈 방어
      this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickTimer() });
    });
    showToast(this, `레벨 ${this.levelNum} — 꼬치 ${this.cfg.targetSkewers}개 서빙!`);
    // 신규 메커니즘 안내 — 레벨 토스트 뒤에 이어서 길게 표시.
    if (this.cfg.tutorial) {
      const tip = this.cfg.tutorial;
      this.time.delayedCall(1500, () => {
        if (this.state === 'playing') showToast(this, tip, 3200);
      });
    }
  }

  override update(_time: number, deltaMs: number): void {
    if (this.paused || this.state !== 'playing') return;
    const dt = deltaMs / 1000;
    if (this.comboT > 0) {
      this.comboT = Math.max(0, this.comboT - dt);
      if (this.comboT <= 0) this.chain = 0;
      this.hud.setMultiplier(Math.max(1, this.chain), this.comboT / COMBO_SEC);
    }
    this.mission.update(dt, this.board);
  }

  // ─────────────────────── 보드 구성 ───────────────────────

  /**
   * "테이블 상판" 영역(layer_3 윗변 ~ 하단 메뉴 버튼 윗변)의 정중앙을 기준으로 그릴 자리를 산출한다.
   * - 가로: 테이블 중심에 대칭 배치(열 간격을 넓혀 좌우 여백 축소).
   * - 세로: 이 레벨의 "활성 칸이 차지하는 행 범위"의 중심을 상판 띠 중심에 맞춘다 → 보드 모양·개수가
   *   달라져도(작은 보드·이형 모양) 항상 가운데 정렬. adjustForViewport 가 버튼을 이미 내려두므로 반응형.
   */
  private grillSpots(): Array<{ x: number; y: number; locked: boolean; absent: boolean }> {
    const table = this.layout.byId<Phaser.GameObjects.Image>('layer_3');
    const btn = this.layout.byId<Phaser.GameObjects.Image>('layer_10');
    const cx = table.x;
    const cols = Array.from({ length: GRID_COLS }, (_, c) => cx + (c - (GRID_COLS - 1) / 2) * GRID_COL_PITCH);

    const active = new Set(this.cfg.layout);
    const locked = new Set(this.cfg.lockedGrills);
    // 활성 칸의 행 범위로 세로 중심을 잡는다(작은/이형 보드도 가운데 오게).
    const activeRows = [...active].map((i) => Math.floor(i / GRID_COLS));
    const midRow = activeRows.length ? (Math.min(...activeRows) + Math.max(...activeRows)) / 2 : (GRID_ROWS - 1) / 2;

    const bandTop = table.y - table.displayHeight / 2;
    const bandBottom = btn.y - btn.displayHeight / 2;
    const centerY = (bandTop + bandBottom) / 2;

    const spots: Array<{ x: number; y: number; locked: boolean; absent: boolean }> = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      const y = centerY + (r - midRow) * GRID_ROW_PITCH;
      for (let c = 0; c < GRID_COLS; c++) {
        const id = r * GRID_COLS + c;
        spots.push({ x: cols[c], y, locked: locked.has(id), absent: !active.has(id) });
      }
    }
    return spots;
  }

  /** 잠긴 그릴이 해제되는 레벨(없으면 미상). 온보딩 표지("Lv N")용. */
  private unlockLevel(id: number): number | undefined {
    // 그릴은 20레벨마다 하나씩 열리므로 최대 레벨까지 탐색(가까운 개방 레벨 = 🔒Lv 표시).
    for (let lv = this.levelNum + 1; lv <= MAX_LEVEL; lv++) {
      if (!levelConfig(lv).lockedGrills.includes(id)) return lv;
    }
    return undefined;
  }

  private createGrills(): void {
    this.views = this.grillSpots().map((s, id) => {
      if (s.absent) return new GrillView(this, id, s.x, s.y, true, undefined, true); // 빈 테이블(그릴 없음)
      const label = s.locked ? `🔒\n${this.unlockLevel(id) ? `Lv ${this.unlockLevel(id)}` : '준비 중'}` : undefined;
      return new GrillView(this, id, s.x, s.y, s.locked, label);
    });
    this.sprites = Array.from({ length: GRILL_COUNT }, () => [null, null, null]);
  }

  private renderInitialBoard(): void {
    for (const g of this.board.grills) {
      this.views[g.id].setQueuePreview(g.queue);
      const charLv = g.char?.[2] ?? 0;
      if (charLv > 0) this.renderCharTile(g.id, charLv);
      g.slots.forEach((t, slot) => {
        if (t === null) return;
        const img = this.spawnSlotSprite(g.id, slot, t, g.pinned?.[slot] === true);
        img.setScale(0);
        this.tweenScaleTo(img, SKEWER_W, SKEWER_H, 260, 90 + (g.id * 3 + slot) * 28);
      });
    }
  }

  /** 슬롯 꼬치 스프라이트 생성. 고정 꼬치는 드래그 미등록 + 고정 밴드 표시. */
  private spawnSlotSprite(grillId: number, slot: number, type: ItemType, pinned = false): Phaser.GameObjects.Image {
    const p = this.views[grillId].slotPos(slot);
    const img = this.add
      .image(p.x, p.y, itemKey(type))
      .setDisplaySize(SKEWER_W, SKEWER_H)
      .setDepth(DEPTH_SKEWER + slot);
    img.setData({ grillId, slot, type, pinned });
    if (pinned) this.addPinOverlay(img, p.x, p.y, slot);
    else img.setInteractive({ useHandCursor: true, draggable: true });
    this.sprites[grillId][slot] = img;
    return img;
  }

  /** 고정 꼬치 위에 얹는 금속 밴드(고정 표시). 매치로 날아갈 때 destroyPinOverlay 로 제거. */
  private addPinOverlay(img: Phaser.GameObjects.Image, x: number, y: number, slot: number): void {
    const g = this.add.graphics().setDepth(DEPTH_SKEWER + slot + 0.5);
    g.fillStyle(0x4a525c, 1).fillRoundedRect(x - 35, y - 13, 71, 26, 9);
    g.fillStyle(0xc6ced6, 1).fillRoundedRect(x - 35, y - 13, 71, 10, 5);
    g.fillStyle(0x2a2f36, 1).fillCircle(x - 22, y + 2, 5).fillCircle(x + 22, y + 2, 5);
    this.pinOverlays.set(img, g);
  }

  private destroyPinOverlay(img: Phaser.GameObjects.Image): void {
    const ov = this.pinOverlays.get(img);
    if (ov) {
      ov.destroy();
      this.pinOverlays.delete(img);
    }
  }

  /** 숯(방해) 타일 — 그릴 슬롯2 위에 검게 그을린 칸 + 잔불 + 단계 표시. */
  private renderCharTile(grillId: number, level: number): void {
    const p = this.views[grillId].slotPos(2);
    const g = this.add.graphics().setDepth(DEPTH_SKEWER + 2);
    g.fillStyle(0x1d0f07, 0.94).fillRoundedRect(p.x - 38, p.y - 80, 77, 161, 20);
    g.fillStyle(0xff7a1e, 0.22).fillCircle(p.x, p.y + 38, 28);
    g.lineStyle(4, 0xff6a1a, 0.85).strokeRoundedRect(p.x - 38, p.y - 80, 77, 161, 20);
    const label = this.add
      .text(p.x, p.y, level > 1 ? `🔥\n${level}` : '🔥', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '36px',
        color: '#ffcaa0',
        align: 'center',
      })
      .setOrigin(0.5)
      .setLineSpacing(-2)
      .setDepth(DEPTH_SKEWER + 3);
    this.charTiles.set(grillId, { objs: [g], label, level });
  }

  /** 냉각 후 숯 타일을 보드 상태와 동기화 — 0이면 구워 없애고, 남으면 단계 갱신. */
  private syncCharTiles(): void {
    for (const [id, t] of [...this.charTiles]) {
      const lvl = this.board.grills[id].char?.[2] ?? 0;
      if (lvl <= 0) {
        this.cookOffCharTile(t);
        this.charTiles.delete(id);
      } else if (lvl !== t.level) {
        t.level = lvl;
        t.label.setText(lvl > 1 ? `🔥\n${lvl}` : '🔥');
        this.tweens.add({ targets: t.label, scale: { from: 1.35, to: 1 }, duration: 220, ease: 'Back.easeOut' });
      }
    }
  }

  private cookOffCharTile(t: { objs: Phaser.GameObjects.GameObject[]; label: Phaser.GameObjects.Text }): void {
    sfx('refill');
    const targets = [...t.objs, t.label];
    this.tweens.add({ targets, alpha: 0, duration: 420, ease: 'Cubic.easeOut', onComplete: () => targets.forEach((o) => o.destroy()) });
    this.tweens.add({ targets: t.label, y: t.label.y - 26, scale: 1.5, duration: 420, ease: 'Cubic.easeOut' });
  }

  /** displaySize 목표로 스케일 팝 트윈(이미지 원본비 유지 전제). */
  private tweenScaleTo(img: Phaser.GameObjects.Image, w: number, h: number, dur: number, delay = 0): void {
    const sx = w / img.width;
    const sy = h / img.height;
    this.tweens.add({ targets: img, scaleX: sx, scaleY: sy, duration: dur, delay, ease: 'Back.easeOut' });
  }

  // ─────────────────────── 입력(드래그) ───────────────────────

  private wireDrag(): void {
    this.input.dragDistanceThreshold = 8;

    this.input.on('dragstart', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      const img = obj as Phaser.GameObjects.Image;
      if (this.state !== 'playing' || this.paused || this.drag !== null) return;
      const grillId = img.getData('grillId') as number;
      const slot = img.getData('slot') as number;
      if (this.sprites[grillId]?.[slot] !== img) return;
      // 아직 슬라이드/리필 애니 중인 꼬치를 잡으면 진행 중 트윈을 멈추고 즉시 드래그로 전환(동시 플레이).
      this.tweens.killTweensOf(img);
      this.drag = { sprite: img, grillId, slot };
      img.setDepth(DEPTH_DRAG);
      this.tweenScaleTo(img, SKEWER_W * 1.18, SKEWER_H * 1.18, 120);
      sfx('pick');
    });

    this.input.on('drag', (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, dragX: number, dragY: number) => {
      if (this.drag?.sprite !== obj) return;
      this.drag.sprite.setPosition(dragX, dragY - 24);
      const target = this.findDropTarget(p.worldX, p.worldY);
      if (target !== this.hoverView) {
        this.hoverView?.setHighlight(false);
        this.hoverView = target;
        this.hoverView?.setHighlight(true);
      }
    });

    this.input.on('dragend', (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      if (this.drag?.sprite !== obj) return;
      const { sprite, grillId, slot } = this.drag;
      this.drag = null;
      this.hoverView?.setHighlight(false);
      this.hoverView = null;

      const target = this.findDropTarget(p.worldX, p.worldY);
      if (target && this.state === 'playing' && !this.paused && canMove(this.board, grillId, slot, target.id)) {
        this.commitMove(sprite, grillId, slot, target.id);
        return;
      }
      if (target && target.id !== grillId) sfx('invalid');
      this.springBack(sprite, grillId, slot);
    });
  }

  // ───────────────────── 가장자리 제스처 가드 ─────────────────────

  /**
   * 좌/우 화면 끝(엣지 밴드)에서 **시작하는** 터치를 게임이 먼저 claim 한다. 캡처 단계의
   * non-passive 리스너로 `preventDefault()` 를 걸어, 브라우저의 뒤로가기 스와이프·오버스크롤
   * 같은 기본 제스처가 발동하기 전에 흡수한다 → 가장자리 꼬치를 잡아 옮기는 동작이 제스처에
   * 가로채이는 문제를 완화한다.
   *
   * 한계(정직하게): OS 시스템 제스처(갤럭시 엣지패널·iOS 화면끝 백스와이프)는 터치가 엣지
   * 활성영역에서 시작되는 순간 OS(컴포지터)가 웹보다 먼저 가로채므로 웹에서 완전 차단은 불가.
   * 이 가드는 "완화"이고, 최종 안전망은 코어 backGuard(history 흡수)와 병행한다.
   *
   * 밴드(좌우 끝 EDGE px)에서 시작한 터치만 취소하므로 중앙 게임플레이 입력에는 영향이 없다.
   * 결과/일시정지/카운트다운 등 playing 이 아닐 땐 개입하지 않아(메뉴·다이얼로그) 정상 스크롤/탭 허용.
   */
  private installEdgeGuard(): void {
    const canvas = this.game.canvas;
    if (!canvas || typeof window === 'undefined') return;
    // 캔버스 자체에도 touch-action:none 을 확실히 걸어 브라우저 제스처 여지를 없앤다(방어적).
    canvas.style.touchAction = 'none';

    /** OS/브라우저 엣지 활성영역 근사(CSS px). 좌우 끝에서 이 폭 안에서 시작한 터치를 가드. */
    const EDGE = 28;
    const onTouchStart = (e: TouchEvent) => {
      if (this.state !== 'playing' || this.paused) return;
      const w = window.innerWidth;
      for (let i = 0; i < e.touches.length; i++) {
        const x = e.touches[i].clientX;
        if (x <= EDGE || x >= w - EDGE) {
          // 엣지 밴드에서 시작 → 우리가 먼저 처리(선택). 브라우저 제스처 기본동작만 취소하고
          // Phaser 는 터치 이벤트를 직접 읽으므로 드래그/탭 입력은 그대로 동작한다.
          e.preventDefault();
          return;
        }
      }
    };
    canvas.addEventListener('touchstart', onTouchStart, { passive: false, capture: true });

    const cleanup = (): void => {
      canvas.removeEventListener('touchstart', onTouchStart, { capture: true } as EventListenerOptions);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  }

  /** 포인터 아래의 이동 가능 그릴(잠금/자기 자신 제외). */
  private findDropTarget(px: number, py: number): GrillView | null {
    const v = this.views.find((view) => !view.locked && view.contains(px, py));
    if (!v || this.drag?.grillId === v.id) return null;
    return v;
  }

  private springBack(sprite: Phaser.GameObjects.Image, grillId: number, slot: number): void {
    const p = this.views[grillId].slotPos(slot);
    this.tweens.add({
      targets: sprite,
      x: p.x,
      y: p.y,
      duration: 200,
      ease: 'Back.easeOut',
      onComplete: () => sprite.setDepth(DEPTH_SKEWER + slot),
    });
    this.tweenScaleTo(sprite, SKEWER_W, SKEWER_H, 200);
  }

  // ─────────────────────── 이동/매치/리필 연출 ───────────────────────
  //
  // 보드 로직은 **동기적**으로 즉시 해소하고(this.board = 진실), 각 매치·리필 연출은 독립 트윈으로
  // 발사(await 없음)한다. → 한 매치의 연출이 재생되는 동안에도 입력이 전역으로 잠기지 않아
  // 다른 그릴을 동시에 조작·매치할 수 있다. (JS 단일 스레드 + 동기 해소라 보드 갱신은 원자적.)

  /** 드롭한 꼬치를 목적지로 옮기고(보드 즉시 갱신) 슬라이드 연출 후 보드를 해소한다. */
  private commitMove(sprite: Phaser.GameObjects.Image, fromId: number, fromSlot: number, toId: number): void {
    const { board, toSlot } = moveSkewer(this.board, fromId, fromSlot, toId);
    this.board = board;

    this.sprites[fromId][fromSlot] = null;
    this.sprites[toId][toSlot] = sprite;
    sprite.setData({ grillId: toId, slot: toSlot });

    const p = this.views[toId].slotPos(toSlot);
    this.tweens.killTweensOf(sprite);
    this.tweenScaleTo(sprite, SKEWER_W, SKEWER_H, 180);
    this.tweens.add({
      targets: sprite,
      x: p.x,
      y: p.y,
      duration: 190,
      ease: 'Quad.easeOut',
      // 그 사이 다시 잡히거나 매치로 사라졌으면(슬롯 점유가 바뀜) 건드리지 않는다.
      onComplete: () => {
        if (this.sprites[toId]?.[toSlot] === sprite) sprite.setDepth(DEPTH_SKEWER + toSlot);
      },
    });
    sfx('place');

    this.resolveBoard();
  }

  /**
   * 보드를 안정 상태까지 **동기적으로** 해소한다(매치→냉각→리필 반복). 각 매치·리필 연출은
   * 독립 트윈으로 발사(대기 없음) → 연출 중에도 입력이 잠기지 않는다. 마지막에 승패를 판정한다.
   */
  private resolveBoard(): void {
    for (;;) {
      if (this.state === 'won' || this.state === 'failed') return;
      const matchId = findMatchGrill(this.board);
      if (matchId !== -1) {
        this.doMatch(matchId);
        // 숯 냉각 — 방금 매치한 그릴의 인접 숯을 1 줄이고(0이면 해제) 타일 동기화.
        const cool = coolNeighborChar(this.board, matchId);
        this.board = cool.board;
        this.syncCharTiles();
        continue;
      }
      const { board, refills } = refillEmptyGrills(this.board);
      if (refills.length > 0) {
        this.board = board;
        this.spawnRefills(refills);
        continue;
      }
      break;
    }

    // 남는 음식 0 — 맨 마지막 한 세트(자유 꼬치 3개)만 자동으로 3매치해 깔끔히 마무리한다
    // (요구: "마지막 자동매칭은 3개 매칭만"). 플레이어가 목표−3 까지 직접 서빙하면 게임이 마지막 3개를 자동.
    // ⚠️ 고정(이동 불가) 꼬치가 남아 있으면 자동 서빙하지 않는다(요구: 고정은 자동 매칭 금지 →
    //    플레이어가 직접 완성). 고정을 다 푼 뒤 남은 마지막 자유 세트만 자동 마무리된다.
    if (this.state === 'playing' && this.board.served < this.cfg.targetSkewers && pinnedRemaining(this.board) === 0) {
      const remaining = totalRemaining(this.board);
      if (remaining > 0 && remaining <= SLOT_COUNT) {
        this.autoFinish();
        return;
      }
    }

    // 루프는 항상 state==='playing' 로 break(승리는 루프 상단 가드에서 이미 반환) → 여기서 교착/소진 판정.
    if (isDeadlocked(this.board)) {
      this.fail('deadlock');
      return;
    }
    if (this.board.served < this.cfg.targetSkewers && !anyMatchPossible(this.board)) {
      this.fail('exhausted');
    }
  }

  /**
   * 막판 자동 서빙 — 보드에 남은 전량(꼬리)을 한 번에 서빙 처리하고 승리로 마무리한다.
   * 남아있는 슬롯 스프라이트·쟁반 미리보기를 클로슈로 순차 비행시키고, 숯/고정 블로커도 해제한다.
   */
  private autoFinish(): void {
    const before = this.board;
    const { board } = autoFinishRemaining(before);
    this.board = board;

    // 서빙된(자유) 슬롯 스프라이트만 걷어 순차 비행. 고정 꼬치는 자동 서빙 대상이 아니므로 남긴다
    // (트리거상 이 시점엔 고정이 없지만, 연출에서도 고정은 건드리지 않도록 방어적으로 스킵).
    const flying: Phaser.GameObjects.Image[] = [];
    for (let g = 0; g < this.sprites.length; g++) {
      for (let s = 0; s < SLOT_COUNT; s++) {
        const img = this.sprites[g]?.[s];
        if (img && !before.grills[g]?.pinned?.[s]) {
          flying.push(img);
          this.sprites[g][s] = null;
        }
      }
    }
    flying.forEach((img, i) => {
      this.destroyPinOverlay(img);
      img.disableInteractive();
      this.tweens.killTweensOf(img);
      img.setDepth(DEPTH_FLY + (i % 12));
      this.tweens.add({
        targets: img,
        x: CLOCHE_POS.x,
        y: CLOCHE_POS.y,
        scaleX: img.scaleX * 0.3,
        scaleY: img.scaleY * 0.3,
        alpha: 0.7,
        delay: i * 55,
        duration: 360,
        ease: 'Cubic.easeIn',
        onComplete: () => img.destroy(),
      });
    });

    // 쟁반 미리보기 비우고 숯 타일 해제(보드 char 를 이미 비웠으므로 동기화가 걷어낸다).
    this.views.forEach((v) => v.setQueuePreview([]));
    this.syncCharTiles();
    sfx('match');

    this.hud.setProgress(this.board.served, this.cfg.targetSkewers);
    this.hud.pulseProgress();
    this.hud.setDishes(this.board.dishes, true);
    this.hud.setCoins(this.coins);
    this.win();
  }

  /** 매치 1건 — 보드 즉시 갱신 + 콤보/보상 + 서빙 꼬치를 클로슈로 날리는 독립 연출. */
  private doMatch(grillId: number): void {
    const { board, itemType } = resolveMatch(this.board, grillId);
    this.board = board;

    // 콤보/보상
    this.chain = this.comboT > 0 ? Math.min(this.chain + 1, COMBO_MAX) : 1;
    this.comboT = COMBO_SEC;
    const earned = COIN_PER_MATCH * this.chain;
    this.coins += earned;
    this.coinsEarned += earned;
    this.persistCoins();

    const view = this.views[grillId];
    view.sizzleBurst();
    sfx('match');

    const flying = this.sprites[grillId].filter((s): s is Phaser.GameObjects.Image => s !== null);
    this.sprites[grillId] = [null, null, null];
    flying.forEach((img, i) => {
      this.destroyPinOverlay(img); // 고정 꼬치가 서빙되면 고정 표시도 제거
      img.disableInteractive();
      this.tweens.killTweensOf(img); // 방금 옮겨온 슬라이드 트윈이 있으면 정리 후 비행
      img.setDepth(DEPTH_FLY + i);
      this.tweens.add({
        targets: img,
        x: CLOCHE_POS.x,
        y: CLOCHE_POS.y,
        scaleX: img.scaleX * 0.3,
        scaleY: img.scaleY * 0.3,
        alpha: 0.7,
        delay: 90 + i * 70,
        duration: 380,
        ease: 'Cubic.easeIn',
        onComplete: () => img.destroy(),
      });
    });

    this.hud.setProgress(this.board.served, this.cfg.targetSkewers);
    this.hud.pulseProgress();
    this.hud.setDishes(this.board.dishes, true);
    this.hud.setCoins(this.coins);
    this.hud.setMultiplier(this.chain, 1);
    this.mission.notifyMatch(itemType);

    if (this.board.served >= this.cfg.targetSkewers) this.win();
  }

  /** 리필 — 빈 그릴을 큐에서 채우고(보드는 이미 갱신됨) 쟁반→슬롯 낙하 연출을 독립 발사. */
  private spawnRefills(refills: ReadonlyArray<RefillEvent>): void {
    sfx('refill');
    for (const ev of refills) {
      const view = this.views[ev.grillId];
      const grill = this.board.grills[ev.grillId];
      view.setQueuePreview(grill.queue);
      ev.items.forEach((t, slot) => {
        const from = view.trayPos(slot);
        const to = view.slotPos(slot);
        const img = this.spawnSlotSprite(ev.grillId, slot, t);
        img.setPosition(from.x, from.y).setDisplaySize(43, 92).setAngle(15);
        const delay = slot * 80;
        const dur = 250;
        this.tweens.add({ targets: img, x: to.x, y: to.y, angle: 0, delay, duration: dur, ease: 'Quad.easeOut' });
        this.tweenScaleTo(img, SKEWER_W, SKEWER_H, dur, delay);
      });
    }
  }

  // ─────────────────────── 승패/구출 ───────────────────────

  private win(): void {
    this.state = 'won';
    this.mission.stop();
    // 진행도는 되돌리지 않는다(낮은 레벨 재도전 시 최고 레벨 보존).
    updateSave({ level: Math.max(loadSave().level, this.levelNum + 1), coins: this.coins });
    sfx('win');
    const isLast = this.levelNum >= MAX_LEVEL;
    this.time.delayedCall(550, () => {
      openPopup(this, {
        title: isLast ? '전 레벨 클리어! 🏆' : '주문 완료! 🎉',
        lines: isLast
          ? [`레벨 ${this.levelNum} 클리어!`, '새 레벨이 곧 추가돼요.', `획득 코인 +${this.coinsEarned}`]
          : [`레벨 ${this.levelNum} 클리어!`, `획득 코인 +${this.coinsEarned}`, `완성 접시 ${this.board.dishes}개`],
        buttons: [
          {
            label: isLast ? '다시 도전' : '다음 레벨',
            color: 0x3cb54a,
            onTap: () => {
              this.scene.restart({ level: isLast ? this.levelNum : this.levelNum + 1 });
            },
          },
          { label: '홈으로', color: 0x7a9cc6, small: true, onTap: () => this.goHome() },
        ],
      });
    });
  }

  private fail(reason: FailReason): void {
    if (this.state === 'won' || this.state === 'failed') return;
    this.state = 'failed';
    this.mission.stop();
    this.persistCoins();
    sfx('fail');

    const titles: Record<FailReason, string> = {
      time: '시간 초과!',
      deadlock: '그릴이 가득 찼어요!',
      exhausted: '재료가 부족해요!',
    };
    const buttons: PopupButton[] = [];
    if (reason === 'deadlock' && this.coins >= SHUFFLE_COST) {
      buttons.push({
        label: `셔플하고 계속 (${SHUFFLE_COST}코인)`,
        color: 0x3cb54a,
        onTap: () => {
          this.spendCoins(SHUFFLE_COST);
          this.state = 'playing';
          this.applyShuffle();
        },
      });
    }
    buttons.push({
      label: '재도전',
      color: 0xff8a2a,
      onTap: () => {
        this.scene.restart({ level: this.levelNum });
      },
    });
    buttons.push({ label: '홈으로', color: 0x9b8b78, small: true, onTap: () => this.goHome() });

    this.time.delayedCall(350, () => {
      if (this.state !== 'failed') return;
      openPopup(this, {
        title: titles[reason],
        lines: [`서빙 ${this.board.served}/${this.cfg.targetSkewers}`],
        buttons,
      });
    });
  }

  /** 셔플 적용 + 전체 보드 다시 그리기(호출 측이 state='playing' 보장). */
  private applyShuffle(): void {
    this.board = shuffleBoard(this.board, makeRng((Math.random() * 0x7fffffff) >>> 0));
    for (const row of this.sprites) {
      for (const s of row) {
        if (!s) continue;
        this.tweens.killTweensOf(s);
        s.destroy();
      }
    }
    this.sprites = Array.from({ length: GRILL_COUNT }, () => [null, null, null]);
    // 고정 표시는 스프라이트와 별개 그래픽 → 직접 정리(숯 타일은 셔플이 보존하므로 유지).
    for (const ov of this.pinOverlays.values()) ov.destroy();
    this.pinOverlays.clear();
    for (const g of this.board.grills) {
      this.views[g.id].setQueuePreview(g.queue);
      g.slots.forEach((t, slot) => {
        if (t === null) return;
        const img = this.spawnSlotSprite(g.id, slot, t, g.pinned?.[slot] === true);
        img.setScale(0);
        this.tweenScaleTo(img, SKEWER_W, SKEWER_H, 240, (g.id + slot) * 22);
      });
    }
    sfx('refill');
    this.resolveBoard();
  }

  // ─────────────────────── 타이머/재화 ───────────────────────

  private tickTimer(): void {
    if (this.paused || this.state === 'won' || this.state === 'failed') return;
    this.timeLeft -= 1;
    this.hud.setTime(this.timeLeft);
    if (this.timeLeft <= 10 && this.timeLeft > 0) sfx('tick');
    // 보드 해소가 동기라 타이머 시점의 상태는 항상 안정 → 즉시 실패 처리(state 가드는 위에서).
    if (this.timeLeft <= 0) this.fail('time');
  }

  private persistCoins(): void {
    updateSave({ coins: this.coins });
  }

  private spendCoins(amount: number): boolean {
    if (this.coins < amount) return false;
    this.coins -= amount;
    this.persistCoins();
    this.hud.setCoins(this.coins);
    return true;
  }

  // ─────────────────────── 버튼/팝업 ───────────────────────

  private wireButtons(): void {
    this.makeButton('layer_9', () => this.openSettings()); // 설정
    this.makeButton('layer_9_copy', () => showToast(this, '옷장은 준비 중이에요!')); // 옷
    this.makeButton('layer_8', () => this.openShop()); // 코인 바(+)
    this.makeButton('layer_10', () => this.goHome()); // 하단 1번 = 홈(로비) 가기
    this.makeButton('layer_10_copy', () => this.tapShuffle()); // 셔플 버튼
    this.makeButton('layer_10_copy3', () => this.openShop()); // 상점
    this.makeButton('layer_10_copy2', () => this.openLevelSelectMenu()); // 하단 맨 오른쪽 = 레벨 선택

    // 주황 버튼에 셔플 라벨(에디터 버튼은 무지 상태).
    const btn = this.layout.byId<Phaser.GameObjects.Image>('layer_10_copy');
    this.shuffleLabel = this.add
      .text(btn.x, btn.y, '셔플\n무료 1회', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '22px',
        color: '#fff6e6',
        align: 'center',
      })
      .setStroke('#7a3c12', 4)
      .setOrigin(0.5)
      .setDepth((btn.depth ?? 20) + 1)
      .setLineSpacing(-2);
  }

  private makeButton(id: string, onTap: () => void): void {
    const obj = this.layout.byId(id) as Phaser.GameObjects.Image;
    const baseSX = obj.scaleX;
    const baseSY = obj.scaleY;
    obj.setInteractive({ useHandCursor: true });
    obj.on('pointerdown', () =>
      this.tweens.add({ targets: obj, scaleX: baseSX * 0.93, scaleY: baseSY * 0.93, duration: 70 }),
    );
    const restore = (): void => {
      this.tweens.add({ targets: obj, scaleX: baseSX, scaleY: baseSY, duration: 90 });
    };
    obj.on('pointerup', () => {
      restore();
      sfx('tap');
      onTap();
    });
    obj.on('pointerout', restore);
  }

  /** 홈(로비) 화면으로 — 페이드 후 이동. */
  private goHome(): void {
    if (this.paused) return;
    this.cameras.main.fadeOut(240, 43, 24, 16);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('home'));
  }

  /** 레벨 선택 메뉴 — 아무 레벨이나 골라 바로 시작(레벨 테스트용, 1~300 전부 선택 가능). */
  private openLevelSelectMenu(): void {
    if (this.paused || this.state !== 'playing') return;
    this.paused = true;
    openLevelSelect(this, {
      maxLevel: MAX_LEVEL,
      unlocked: MAX_LEVEL, // 테스트: 전 레벨 선택 가능(출시 시 loadSave().level 로 게이팅)
      current: this.levelNum,
      onPick: (lv) => this.scene.restart({ level: lv }),
      onClose: () => {
        this.paused = false;
      },
    });
  }

  private tapShuffle(): void {
    if (this.state !== 'playing' || this.paused) return;
    if (!this.freeShuffleUsed) {
      this.freeShuffleUsed = true;
      this.shuffleLabel?.setText(`셔플\n${SHUFFLE_COST}코인`);
      this.applyShuffle();
      showToast(this, '꼬치를 재배치했어요!');
      return;
    }
    if (!this.spendCoins(SHUFFLE_COST)) {
      showToast(this, '코인이 부족해요!');
      return;
    }
    this.applyShuffle();
    showToast(this, '꼬치를 재배치했어요!');
  }

  private openSettings(): void {
    if (this.paused || this.state !== 'playing') return;
    this.paused = true;
    openPopup(this, {
      title: '설정',
      lines: [`레벨 ${this.levelNum} · 코인 ${this.coins}`],
      dismissible: true,
      onClose: () => {
        this.paused = false;
      },
      buttons: [
        {
          label: `사운드: ${isSfxOn() ? 'ON' : 'OFF'}`,
          color: 0x7a9cc6,
          onTap: () => {
            setSfxOn(!isSfxOn());
            showToast(this, `사운드 ${isSfxOn() ? 'ON' : 'OFF'}`);
          },
        },
        {
          label: '레벨 다시 시작',
          color: 0xff8a2a,
          onTap: () => this.scene.restart({ level: this.levelNum }),
        },
        { label: '닫기', color: 0x9b8b78, small: true, onTap: () => undefined },
      ],
    });
  }

  private openShop(): void {
    if (this.paused || this.state !== 'playing') return;
    this.paused = true;
    openPopup(this, {
      title: '상점',
      lines: [`보유 코인: ${this.coins}`],
      dismissible: true,
      onClose: () => {
        this.paused = false;
      },
      buttons: [
        {
          label: `⏱ 시간 +${TIME_BONUS}초 — ${TIME_COST}코인`,
          color: 0x3cb54a,
          onTap: () => {
            if (!this.spendCoins(TIME_COST)) {
              showToast(this, '코인이 부족해요!');
              return false;
            }
            this.timeLeft += TIME_BONUS;
            this.hud.setTime(this.timeLeft);
            showToast(this, `+${TIME_BONUS}초!`);
            return undefined;
          },
        },
        {
          label: `🔀 셔플 — ${SHUFFLE_COST}코인`,
          color: 0xff8a2a,
          onTap: () => {
            if (!this.spendCoins(SHUFFLE_COST)) {
              showToast(this, '코인이 부족해요!');
              return false;
            }
            this.paused = false;
            this.applyShuffle();
            return undefined;
          },
        },
        { label: '닫기', color: 0x9b8b78, small: true, onTap: () => undefined },
      ],
    });
  }

}
