/**
 * GrillScene — 메인 게임플레이. 에디터 레이아웃(main.json)을 런타임에 구성하고,
 * 그 위에 그릴 보드(드래그 이동·3매치·쟁반 리필·연쇄)를 올린다.
 *
 * 상태 전이: playing ↔ resolving(애니메이션 중 입력 잠금) → won | failed.
 * 보드 로직은 logic/board.ts(순수)만 신뢰하고, 씬은 결과 이벤트를 연출한다.
 */
import Phaser from 'phaser';
import { itemKey } from '../assets.js';
import { isSfxOn, setSfxOn, sfx } from '../audio.js';
import {
  anyMatchPossible,
  canMove,
  coolNeighborChar,
  findMatchGrill,
  isDeadlocked,
  makeRng,
  moveSkewer,
  refillEmptyGrills,
  resolveMatch,
  shuffleBoard,
} from '../logic/board.js';
import { GRID_COLS, GRID_ROWS, GRILL_COUNT, generateBoard, levelConfig } from '../logic/levels.js';
import type { BoardState, ItemType, LevelCfg, RefillEvent } from '../logic/types.js';
import { loadSave, updateSave } from '../save.js';
import { buildLayout, type LayoutDoc, LayoutIndex } from '../ui/layoutLoader.js';
import { GrillView, SKEWER_H, SKEWER_W } from './grillView.js';
import { Hud } from './hud.js';
import { MissionDirector } from './missionDirector.js';
import { openPopup, type PopupButton, showToast } from './popups.js';

type GameState = 'playing' | 'resolving' | 'won' | 'failed';
type FailReason = 'time' | 'deadlock' | 'exhausted';

const DESIGN_H = 1280;
const DEPTH_SKEWER = 40;
const DEPTH_DRAG = 900;
const DEPTH_FLY = 950;
const CLOCHE_POS = { x: 579, y: 238 };
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
/** 열 간격(px). 좌우 여백을 줄이려고 디자인값(≈219)보다 넓혀 화면 폭을 더 채운다. */
const GRID_COL_PITCH = 234;
/** 행 간격(px). 디자인 그리드값 유지(그릴 본체 170 과 안전 간격). */
const GRID_ROW_PITCH = 177;

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
  private pendingTimeFail = false;
  /** 씬 세대 토큰 — restart 후 살아남은 비동기 연쇄(resolveBoard)가 새 씬을 오염시키지 않게 차단. */
  private epoch = 0;

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
    this.epoch += 1;
    const save = loadSave();
    this.levelNum = save.level;
    this.coins = save.coins;
    this.coinsEarned = 0;
    this.state = 'playing';
    this.paused = false;
    this.pendingTimeFail = false;
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
    this.adjustForViewport();

    // 에디터의 정적 그릴/샘플 꼬치는 게임이 직접 그린다 — 숨김.
    this.layout.setGroupVisible('grp_2', false);
    this.layout.setGroupVisible('grp_3', false);
    this.layout.setGroupVisible('grp_4', false);

    this.createGrills();
    this.hud = new Hud(this, this.layout, this.levelNum);
    this.mission = new MissionDirector(this, this.layout, {
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

    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickTimer() });
    showToast(this, `레벨 ${this.levelNum} — 꼬치 ${this.cfg.targetSkewers}개 서빙!`);
    // 신규 메커니즘 안내 — 레벨 토스트 뒤에 이어서 길게 표시.
    if (this.cfg.tutorial) {
      const tip = this.cfg.tutorial;
      this.time.delayedCall(1500, () => {
        if (this.state === 'playing' || this.state === 'resolving') showToast(this, tip, 3200);
      });
    }
  }

  override update(_time: number, deltaMs: number): void {
    if (this.paused || (this.state !== 'playing' && this.state !== 'resolving')) return;
    const dt = deltaMs / 1000;
    if (this.comboT > 0) {
      this.comboT = Math.max(0, this.comboT - dt);
      if (this.comboT <= 0) this.chain = 0;
      this.hud.setMultiplier(Math.max(1, this.chain), this.comboT / COMBO_SEC);
    }
    if (this.state === 'playing') this.mission.update(dt, this.board);
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
    for (let lv = this.levelNum + 1; lv <= this.levelNum + 15; lv++) {
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
    g.fillStyle(0x4a525c, 1).fillRoundedRect(x - 22, y - 8, 44, 16, 5);
    g.fillStyle(0xc6ced6, 1).fillRoundedRect(x - 22, y - 8, 44, 6, 3);
    g.fillStyle(0x2a2f36, 1).fillCircle(x - 14, y + 1, 2.6).fillCircle(x + 14, y + 1, 2.6);
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
    g.fillStyle(0x1d0f07, 0.94).fillRoundedRect(p.x - 24, p.y - 50, 48, 100, 12);
    g.fillStyle(0xff7a1e, 0.22).fillCircle(p.x, p.y + 24, 17);
    g.lineStyle(3, 0xff6a1a, 0.85).strokeRoundedRect(p.x - 24, p.y - 50, 48, 100, 12);
    const label = this.add
      .text(p.x, p.y, level > 1 ? `🔥\n${level}` : '🔥', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '24px',
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
        void this.commitMove(sprite, grillId, slot, target.id);
        return;
      }
      if (target && target.id !== grillId) sfx('invalid');
      this.springBack(sprite, grillId, slot);
    });
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

  private async commitMove(sprite: Phaser.GameObjects.Image, fromId: number, fromSlot: number, toId: number): Promise<void> {
    const ep = this.epoch;
    const { board, toSlot } = moveSkewer(this.board, fromId, fromSlot, toId);
    this.board = board;
    this.state = 'resolving';

    this.sprites[fromId][fromSlot] = null;
    this.sprites[toId][toSlot] = sprite;
    sprite.setData({ grillId: toId, slot: toSlot });

    const p = this.views[toId].slotPos(toSlot);
    this.tweenScaleTo(sprite, SKEWER_W, SKEWER_H, 180);
    await this.tweenP({ targets: sprite, x: p.x, y: p.y, duration: 190, ease: 'Quad.easeOut' });
    if (ep !== this.epoch) return;
    sprite.setDepth(DEPTH_SKEWER + toSlot);
    sfx('place');

    await this.resolveBoard(ep);
  }

  /** 매치→리필 연쇄가 끝날 때까지 진행. 종료 후 승패 판정. ep 불일치 = 씬 재시작 → 즉시 중단. */
  private async resolveBoard(ep: number): Promise<void> {
    for (;;) {
      if (ep !== this.epoch) return;
      if ((this.state as GameState) === 'won' || (this.state as GameState) === 'failed') return;
      const matchId = findMatchGrill(this.board);
      if (matchId !== -1) {
        await this.animateMatch(matchId);
        if (ep !== this.epoch) return;
        // 숯 냉각 — 방금 매치한 그릴의 인접 숯을 1 줄이고(0이면 해제) 타일 동기화.
        const cool = coolNeighborChar(this.board, matchId);
        this.board = cool.board;
        this.syncCharTiles();
        if ((this.state as GameState) === 'won') return;
        continue;
      }
      const { board, refills } = refillEmptyGrills(this.board);
      if (refills.length > 0) {
        this.board = board;
        await this.animateRefills(refills);
        continue;
      }
      break;
    }

    if (ep !== this.epoch) return;
    this.state = 'playing';
    if (this.pendingTimeFail) {
      this.fail('time');
      return;
    }
    if (isDeadlocked(this.board)) {
      this.fail('deadlock');
      return;
    }
    if (this.board.served < this.cfg.targetSkewers && !anyMatchPossible(this.board)) {
      this.fail('exhausted');
    }
  }

  private async animateMatch(grillId: number): Promise<void> {
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

    await this.delay(560);
    if (this.board.served >= this.cfg.targetSkewers) this.win();
  }

  private async animateRefills(refills: ReadonlyArray<RefillEvent>): Promise<void> {
    sfx('refill');
    let maxDur = 0;
    for (const ev of refills) {
      const view = this.views[ev.grillId];
      const grill = this.board.grills[ev.grillId];
      view.setQueuePreview(grill.queue);
      ev.items.forEach((t, slot) => {
        const from = view.trayPos(slot);
        const to = view.slotPos(slot);
        const img = this.spawnSlotSprite(ev.grillId, slot, t);
        img.setPosition(from.x, from.y).setDisplaySize(28, 60).setAngle(15);
        const delay = slot * 80;
        const dur = 250;
        maxDur = Math.max(maxDur, delay + dur);
        this.tweens.add({ targets: img, x: to.x, y: to.y, angle: 0, delay, duration: dur, ease: 'Quad.easeOut' });
        this.tweenScaleTo(img, SKEWER_W, SKEWER_H, dur, delay);
      });
    }
    await this.delay(maxDur + 60);
  }

  // ─────────────────────── 승패/구출 ───────────────────────

  private win(): void {
    this.state = 'won';
    this.mission.stop();
    updateSave({ level: this.levelNum + 1, coins: this.coins });
    sfx('win');
    this.time.delayedCall(550, () => {
      openPopup(this, {
        title: '주문 완료! 🎉',
        lines: [`레벨 ${this.levelNum} 클리어!`, `획득 코인 +${this.coinsEarned}`, `완성 접시 ${this.board.dishes}개`],
        buttons: [
          {
            label: '다음 레벨',
            color: 0x3cb54a,
            onTap: () => {
              this.scene.restart();
            },
          },
        ],
      });
    });
  }

  private fail(reason: FailReason): void {
    if (this.state === 'won' || this.state === 'failed') return;
    this.state = 'failed';
    this.pendingTimeFail = false;
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
        this.scene.restart();
      },
    });

    this.time.delayedCall(350, () => {
      if (this.state !== 'failed') return;
      openPopup(this, {
        title: titles[reason],
        lines: [`서빙 ${this.board.served}/${this.cfg.targetSkewers}`],
        buttons,
      });
    });
  }

  /** 셔플 적용 + 전체 보드 다시 그리기. 재진입 차단을 위해 가장 먼저 resolving 으로 잠근다. */
  private applyShuffle(): void {
    this.state = 'resolving';
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
    void this.resolveBoard(this.epoch);
  }

  // ─────────────────────── 타이머/재화 ───────────────────────

  private tickTimer(): void {
    if (this.paused || this.state === 'won' || this.state === 'failed') return;
    this.timeLeft -= 1;
    this.hud.setTime(this.timeLeft);
    if (this.timeLeft <= 10 && this.timeLeft > 0) sfx('tick');
    if (this.timeLeft <= 0) {
      if (this.state === 'playing') this.fail('time');
      else this.pendingTimeFail = true;
    }
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
    this.makeButton('layer_10', () => this.openShop()); // 상점 버튼
    this.makeButton('layer_10_copy', () => this.tapShuffle()); // 셔플 버튼
    this.makeButton('layer_10_copy3', () => this.tapLocked('layer_10_copy3'));
    this.makeButton('layer_10_copy2', () => this.tapLocked('layer_10_copy2'));

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

  private tapLocked(id: string): void {
    const obj = this.layout.byId(id);
    this.tweens.add({ targets: obj, angle: { from: -3, to: 3 }, duration: 70, yoyo: true, repeat: 2, onComplete: () => obj.setAngle(0) });
    showToast(this, '아직 잠겨 있어요 — 곧 만나요!');
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
          onTap: () => {
            this.scene.restart();
          },
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

  // ─────────────────────── 레이아웃 보정/유틸 ───────────────────────

  /** 세로로 긴 화면: 배경/테이블을 늘리고 하단 버튼을 바닥에 고정. */
  private adjustForViewport(): void {
    const H = this.scale.height;
    const dy = H - DESIGN_H;
    if (dy <= 0) return;
    const bg = this.layout.byId<Phaser.GameObjects.Image>('layer_1');
    bg.setPosition(360, H / 2).setDisplaySize(720, H);
    const table = this.layout.byId<Phaser.GameObjects.Image>('layer_3');
    const tableTop = 808 - 947 / 2;
    table.setDisplaySize(721, H - tableTop).setPosition(361, tableTop + (H - tableTop) / 2);
    for (const id of ['layer_10', 'layer_10_copy', 'layer_10_copy2', 'layer_10_copy3']) {
      const obj = this.layout.byId(id);
      (obj as Phaser.GameObjects.Image).setY((obj as Phaser.GameObjects.Image).y + dy);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }

  private tweenP(cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.add({ ...cfg, onComplete: () => resolve() });
    });
  }
}
