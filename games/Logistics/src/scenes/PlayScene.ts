/**
 * PlayScene — 배송대작전 본편(매치-3 배송, 에디터 SSOT 구동).
 *
 * 화면 = ui/layouts/blank.json(진입화면 디자인: 배경/도크 4베이/하단 차량+버튼바/HUD)을 buildLayout 으로 렌더.
 * 보드는 가로 5칸 기준(5×6)으로 도크와 하단 바 사이 영역에 반응형으로 정밀 배치 — 셀/타일 크기는
 * 영역과 행·열 수로부터 산출(에디터 디자인 샘플 셀/아이템은 숨김). 매치된 상품은 그 상품을 주문한
 * 베이 트럭에 배송(적립). 트럭 1개 오더가 차면 출발 → 같은 베이에 대기열의 다음 트럭이 재진입.
 * 목표 대수(goal)만큼 출발시키면 레벨 클리어. 데드락은 자동 리셔플.
 *
 * 규칙은 순수 로직(../logic/match3, ../logic/board). 씬은 렌더·입력·애니·영속만.
 */
import Phaser from 'phaser';
import { loadProfile, saveProfile, applyReward, recordResult, haptics, type Profile } from '@casual/core';
import { createGame, deliver, deployNext, isLevelComplete, type DeliverResult } from '../logic/board.js';
import {
  findMatches,
  findMatchGroups,
  clearCells,
  collapse,
  swapTypes,
  isLegalSwap,
  hasLegalMove,
  findLegalSwap,
  reshuffle,
  cellKey,
} from '../logic/match3.js';
import { makeLevel, makeTruckSpec, truckTimeLimitMs } from '../logic/levels.js';
import { makeRng } from '../logic/rng.js';
import type { Coord, GameState, CollapseMove, Rng, TruckState, TruckSpec } from '../logic/types.js';
import { makeProductIcon, productById, UI_LAYOUT_KEY, TILE_KEY, COIN_KEY } from '../assets.js';
import { buildLayout, textResolution, type LayoutDoc, type LayoutIndex } from '../ui/layoutLoader.js';
import { sfx, startAudio, pitchVar, type Sfx } from '../audio.js';
import { ITEM_RGB } from '../logic/itemColors.js';

const W = 1080; // 세로 HD 디자인 폭(에디터 1080×2400)
const H = 2400; // 세로 HD 디자인 높이
type Pos = { x: number; y: number };
const TEXT_RES = textResolution(); // 또렷한 글자(고DPI FIT 확대 대비)

// ── 에디터 노드 앵커 ──
const LEVEL_TEXT_ID = 'layer_6_copy2'; // 좌상단 별표(UI_28) — 레벨 숫자를 별 안에
const COINS_PANEL_ID = 'layer_6_copy'; // 상단 중앙 통화 바(UI_29) — 코인
const PROGRESS_PANEL_ID = 'layer_6_copy3'; // 우상단 바(UI_31) — 진행도
const SLOT_TEX = 'up_Logistics_UI_19'; // 셀 배경 아트(매니페스트 전체 로드라 사용 가능)

// 도크 4베이 — 트럭 / 오더 패널 / 카운트 뱃지(좌→우: 청·녹·오렌지·보라).
const BAY_TRUCK_IDS = ['layer_4', 'layer_4_copy4', 'layer_4_copy8', 'layer_4_copy3'];
const BAY_PANEL_IDS = ['layer_1', 'layer_1_copy4', 'layer_1_copy2', 'layer_1_copy3'];
const BAY_BADGE_IDS = ['layer_1_copy', 'layer_1_copy5', 'layer_1_copy6', 'layer_1_copy7'];
// 제한시간 디지털 표시 위치 = 에디터에 저장된 시간 텍스트 노드("1:30", 전부 y480 정렬) — 시계/시간을 이 위치에.
const BAY_TIME_IDS = ['layer_10_copy', 'layer_10_copy2', 'layer_10_copy3', 'layer_10_copy4'];

// 숨길 노드: ① 정적 캐릭터 노드(layer_8) — 베이별 프로그래밍 캐릭터로 대체(크기/위치는 이 노드를 기준 삼음),
// ② 오더 패널 디자인 샘플(아이템/카운트 "16 💧"), ③ 정적 샘플 시간 텍스트("1:30") — 실시간 시계/디지털로 대체,
// ④ 하단 정적 차량(뒷모습 밴 4대 + 그림자) — 빈 베이가 생길 때만 아래에서 트럭이 올라오므로 제거.
const HIDE_IDS = [
  'layer_8', // 캐릭터(정적) — 베이별 동적 캐릭터로 대체
  'layer_9',
  'layer_9_copy',
  'layer_10',
  // 정적 샘플 시간 텍스트("1:30") — 트럭별 실시간 시계/디지털시간으로 대체
  'layer_10_copy',
  'layer_10_copy2',
  'layer_10_copy3',
  'layer_10_copy4',
  // 하단 정적 차량(녹/청/오렌지/보라 뒷모습) + 그림자
  'layer_4_copy',
  'layer_4_copy__shadow',
  'layer_4_copy5',
  'layer_4_copy5__shadow',
  'layer_4_copy6',
  'layer_4_copy6__shadow',
  'layer_4_copy7',
  'layer_4_copy7__shadow',
];

// 오더 표시 기본 좌표(패널/뱃지 노드를 못 찾을 때 폴백). 실제론 노드 좌표를 읽어 배치.
const ORDER_ITEM_Y = 559; // 패널 위 아이콘
const ORDER_COUNT_Y = 487; // 뱃지 위 카운트
const ORDER_ICON = 78; // 배송목표 아이템 크기(1.5배 확대: 52→78)

// 보드 영역(도크 트럭 하단과 하단 버튼 바 상단 사이의 도로)은 레이아웃 노드에서 동적 산출
// (computeBoardArea). 세로 HD(1080×2400)에서 노드가 이동/리사이즈돼도 따라가도록 SSOT 파생.
// 폴백 값(노드 못 찾을 때)만 상수로 둔다.
const BOARD_AREA_FALLBACK = { left: 40, right: 1040, top: 880, bottom: 2170 };

// 빈 베이가 생기면 트럭이 화면 아래(밖)에서 나타나 올라온다 — 진입 시작 Y(캔버스 2400 아래).
const TRUCK_ENTER_Y = 2500;
// 출발 트럭이 사라지는 화면 아래 목표 Y.
const TRUCK_EXIT_Y = 2560;
// 트럭은 **보드(퍼즐) 밑으로** 지나간다 — 이동 중 depth 를 보드 패널(18)·셀(80)·타일(90)보다 낮게.
const TRUCK_TRAVEL_DEPTH = 12;
// 도로를 따라 이동 시 **Y 기반 투명도 그라데이션**: 위(FADE_TOP)에서 불투명, 아래(FADE_BOTTOM)로 갈수록 투명.
// 도크(트럭 정차 ~y749) 위쪽은 불투명, 보드를 가로질러 내려갈수록 투명(보드 하단 위에서 완전 투명).
const TRUCK_FADE_TOP = 860;
const TRUCK_FADE_BOTTOM = 2100;
// 올라가는(베이로 진입) 트럭은 **뒷모습** 아트(도로 위로 멀어지는 모습). bay index 순(청/녹/오렌지/보라).
const BAY_REAR_TEX = [
  'up_Logistics_Car_01-1',
  'up_Logistics_Car_02-1',
  'up_Logistics_Car_03-1',
  'up_Logistics_Car_04-1',
];

// ── 캐릭터(차량 앞에 서는 직원) ──
// 남/여 2명을 트럭 serial 짝수/홀수로 교대 배치, 4가지 포즈 변형. 차량 출발 시 사라짐.
// 표시 **크기/위치는 에디터 에셋 노드(CHAR_NODE_ID=layer_8)** 에 저장된 값을 SSOT 로 따른다:
// 블루 베이(트럭0) 기준으로 저장된 x/y/높이를 읽어, 다른 베이는 트럭 x 차이만큼 평행이동해 적용.
const CHAR_PERSONS = ['01', '02']; // Chr_01=남, Chr_02=여(교대)
const CHAR_VARIANTS = 4;
const CHAR_NODE_ID = 'layer_8'; // 에디터에 저장된 캐릭터(블루 베이) 노드 — 크기/위치 기준
const CHAR_DEPTH = 60; // 트럭 위, 보드 타일(90) 아래
// 노드 못 찾을 때 폴백(트럭 중심 기준 x오프셋·절대 y·표시 높이).
const CHAR_FALLBACK = { offX: -83, y: 755, h: 204 };

// ── 상단 제한시간: 아날로그 초시계 + 디지털 시간(MM:SS) ──
// 시계는 뱃지 좌측 끝으로, 디지털 시간은 패널(뱃지) 정중앙에. 파란 배경 없음(배경디자인 위).
const CLOCK_R = 15;
const CLOCK_DX = -54; // 뱃지 중심 기준 시계(왼쪽) — 디지털시간 1.5배 확대에 맞춰 좌측으로 더 띄움
const TIME_DX = 0; // 뱃지 정중앙
const CLOCK_DEPTH = 100; // 항상 위에
const CLOCK_ICON_KEY = 'logi_clock_icon'; // 시간 보너스 시 매치→트럭시계로 날아가는 시계 아이콘(런타임 생성 텍스처)
// 패널 안 아이템/갯수 좌우 배치(에디터 디자인 샘플 위치: 갯수 panel.x-23, 아이템 panel.x+15).
const ITEM_DX = 36; // 아이템(우) — 1.5배 확대 아이템/갯수가 겹치지 않게 간격도 비례 확대(24→36)
const ITEM_DY = 4; // 패널 기준 약간 아래(디자인 y≈290)
const COUNT_DX = -36; // 갯수(좌) — 동일하게 비례 확대(-24→-36)
// 제한시간 15초 이하 → 배송표시 패널 점멸(빠듯한 타이머에 맞춰 막판 경고).
const LOW_TIME_MS = 15000;
const DEFAULT_TIME_LIMIT_MS = 60000;
// 유휴 10초 → 매칭 가능한 아이템 깜박임 힌트.
const HINT_IDLE_MS = 10000;

type PowerKind = 'shuffle' | 'forklift' | 'rearrange' | 'hint';
const POWER_NODES: ReadonlyArray<{ kind: PowerKind; id: string }> = [
  { kind: 'shuffle', id: 'layer_9_copy3' }, // Shuffle (UI_32_v2)
  { kind: 'forklift', id: 'layer_9_copy4' }, // Forklift (UI_33)
  { kind: 'rearrange', id: 'layer_9_copy5' }, // Repack (UI_34)
  { kind: 'hint', id: 'layer_9_copy6' }, // Help (UI_35)
];

// 배송 fly — 매치 상품이 공통 경로를 따라 줄지어(stagger) 트럭으로 가속 이동.
const FLY_DUR = 340;
const FLY_STAGGER = 55;

/** 한 베이의 렌더 상태(트럭 아트 + 오더 아이콘/카운트). */
interface BayView {
  bay: number;
  homeX: number;
  /** 오더 아이콘 y(오더 패널 위). */
  iconY: number;
  /** 적재 카운트 위치(카운트 뱃지 위). */
  countX: number;
  countY: number;
  truckRestY: number;
  truck?: Phaser.GameObjects.Image;
  /** 배송표시 패널(UI_15..18) — 제한시간 30초 이하 시 점멸. */
  panel?: Phaser.GameObjects.GameObject & { setAlpha(a: number): unknown };
  icon?: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
  count?: Phaser.GameObjects.Text;
  /** 차량 앞 직원 캐릭터(출발 시 사라짐). */
  char?: Phaser.GameObjects.Image;
  /** 제한시간 아날로그 초시계(도크 상단) + 디지털 시간(MM:SS). */
  clock?: Phaser.GameObjects.Graphics;
  timeText?: Phaser.GameObjects.Text;
  clockX: number;
  clockY: number;
  timeX: number;
  /** 남은 시간/제한시간(ms) + 카운트다운 활성 여부. */
  timeLeftMs: number;
  timeLimitMs: number;
  timerActive: boolean;
  /** 30초 경고음을 한 번만 내기 위한 플래그. */
  warned: boolean;
  slotPos: Pos;
  /** 화면에 표시 중인 적재량(fly 도착마다 1씩 증가 — 한꺼번에 점프 방지). */
  shownLoaded: number;
  required: number;
  /** 적재 완료(도착) 시점에 출발시키기 위한 대기 플래그. */
  pendingDispatch?: boolean;
}

export class PlayScene extends Phaser.Scene {
  private profile!: Profile;
  private rng!: Rng;
  private state!: GameState;
  private layout!: LayoutIndex;
  private busy = false;
  private finished = false;

  // 보드 기하/타일
  private cellCenters = new Map<string, Pos>();
  private tiles = new Map<string, Phaser.GameObjects.Image>();
  private cellBgs: Phaser.GameObjects.GameObject[] = [];
  private boardPanel?: Phaser.GameObjects.Graphics;
  private cellSize = 80;
  private cellH = 80;
  private tileDisp = 72;
  /** 보드가 차지할 도로 영역(디자인 좌표) — 도크/버튼 노드에서 산출(setupBoardGeometry). */
  private boardArea = { ...BOARD_AREA_FALLBACK };
  private selected: Coord | null = null;
  /** 선택된 타일을 둘러싸는 하이라이트 링(선택 표시). */
  private selectRing?: Phaser.GameObjects.Graphics;
  /** 선택 타일 아래 들어올림 그림자(보드 위로 떠 있는 느낌). */
  private selectShadow?: Phaser.GameObjects.Ellipse;
  private pressCell: Coord | null = null;
  private pressX = 0;
  private pressY = 0;
  /** 이번 누름이 이미 선택돼 있던 타일인지(탭 토글 해제 판단). */
  private pressWasSelected = false;
  /** 손가락 추종 드래그가 시작됐는지(임계 초과). */
  private dragging = false;
  /** 드래그로 집은 타일(포인터를 따라옴). */
  private dragTile?: Phaser.GameObjects.Image;
  /** 집은 타일의 원래 셀 중심 좌표. */
  private dragOrigin?: Pos;
  /** 드래그 중 자리를 비켜주는 이웃 타일(스왑 미리보기). */
  private dragNeighbor: { img: Phaser.GameObjects.Image; cell: Coord; ox: number; oy: number } | null = null;
  /** 매칭 애니 중에 시도한 다음 수(버퍼) — 현재 캐스케이드가 끝나면 적용. */
  private pendingSwap: { a: Coord; b: Coord } | null = null;
  /** 유휴 시간 누적(ms) — 10초 동안 수가 없으면 매칭 가능한 아이템을 깜박여 힌트. */
  private idleMs = 0;
  private hintActive = false;
  private hintTiles: Phaser.GameObjects.Image[] = [];
  /** 한 스왑의 연쇄(콤보) 횟수 — 0이면 첫 매치(match), 1+면 콤보(combo) 효과음. */
  private comboCount = 0;

  // 베이/HUD
  private bayViews: BayView[] = [];
  private coinsText?: Phaser.GameObjects.Text;
  private progressText?: Phaser.GameObjects.Text;
  // 캐릭터 기준 기하(에디터 layer_8 노드에서 산출) — 트럭 중심 기준 x오프셋 · 절대 y · 표시 높이.
  private charOffX = CHAR_FALLBACK.offX;
  private charY = CHAR_FALLBACK.y;
  private charH = CHAR_FALLBACK.h;

  private powerCounts: Record<PowerKind, number> = { shuffle: 3, forklift: 3, rearrange: 3, hint: 3 };
  private powerCountTexts: Partial<Record<PowerKind, Phaser.GameObjects.Text>> = {};

  constructor() {
    super('play');
  }

  create(): void {
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.busy = false;
    this.finished = false;
    this.cellCenters = new Map();
    this.tiles = new Map();
    this.cellBgs = [];
    this.boardPanel = undefined;
    this.selected = null;
    this.selectRing = undefined;
    this.selectShadow = undefined;
    this.pressCell = null;
    this.pressWasSelected = false;
    this.dragging = false;
    this.dragTile = undefined;
    this.dragOrigin = undefined;
    this.dragNeighbor = null;
    this.pendingSwap = null;
    this.idleMs = 0;
    this.hintActive = false;
    this.hintTiles = [];
    this.bayViews = [];
    this.powerCounts = { shuffle: 3, forklift: 3, rearrange: 3, hint: 3 };
    this.powerCountTexts = {};

    this.profile = loadProfile();
    const level = Math.max(1, this.profile.level);
    this.rng = makeRng((level * 2654435 + 13) >>> 0);
    this.state = createGame(makeLevel(level, makeRng(level * 100003 + 7)), this.rng);
    this.refillQueue(); // 무한 공급 — 시간초과 자동출발이 큐를 소진해도 늘 다음 트럭이 진입.
    // 동시 정차한 베이들은 서로 다른 상품을 주문하도록(같은 품목 중복 방지).
    for (let b = 0; b < this.state.bays.length; b++) this.ensureBayDistinct(b);

    const doc = this.cache.json.get(UI_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!doc) {
      this.mkText(W / 2, H / 2, '레이아웃 로드 실패', { fontFamily: '"Jua"', fontSize: '28px', color: '#fff' }).setOrigin(0.5);
      return;
    }
    this.layout = buildLayout(this, doc);
    // 에디터 디자인을 1:1 재현(고정 1080×2400 세로 HD + Phaser FIT 레터박스). cover 스트레치를 쓰면 배경만
    // 따로 늘어나 도크(차고)가 아스팔트에서 어긋나므로 사용하지 않는다 — 구조/정렬을 그대로 유지.
    for (const id of HIDE_IDS) this.layout.tryById(id)?.setVisible(false);

    this.setupHud(level);
    this.setupBoardGeometry();
    this.setupBays();
    this.spawnAllTiles();
    this.setupPowerBar();

    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
  }

  private nodePos(id: string): Pos | null {
    const n = this.layout.nodeById(id);
    return n ? { x: n.x, y: n.y } : null;
  }

  /** 또렷한 텍스트 생성(고DPI FIT 확대로 흐려지지 않게 setResolution). */
  private mkText(x: number, y: number, s: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
    return this.add.text(x, y, s, style).setResolution(TEXT_RES);
  }

  /** 클릭 유동 — base 비율 기준으로 통통 키웠다 복원(버튼 이미지/베이크된 텍스트 함께). */
  private pulseScale(obj: Phaser.GameObjects.Image, base: number, factor: number, duration: number): void {
    this.tweens.killTweensOf(obj);
    obj.setScale(base);
    const p = { t: 0 };
    this.tweens.add({
      targets: p,
      t: 1,
      duration,
      yoyo: true,
      ease: 'Back.easeOut',
      onUpdate: () => obj.setScale(base * (1 + (factor - 1) * p.t)),
      onComplete: () => obj.setScale(base),
    });
  }

  // ─── HUD ───
  // 좌상단 뱃지=레벨 · 상단 중앙 통화바=코인 · 우상단 바=진행도. 패널 노드 좌표 위에 텍스트를 올린다.
  private setupHud(level: number): void {
    // 레벨 = 별표(UI_28) 안에 숫자만.
    const lv = this.nodePos(LEVEL_TEXT_ID) ?? { x: 74, y: 145 };
    this.mkText(lv.x, lv.y, String(level), { fontFamily: '"Do Hyeon", "Jua", sans-serif', fontSize: '22px', color: '#ffffff' })
      .setOrigin(0.5)
      .setStroke('#5a3210', 5)
      .setDepth(96);

    // 코인(상단 헤더 점수) — 패널 안에서 약간 아래로.
    const coin = this.nodePos(COINS_PANEL_ID) ?? { x: 540, y: 104 };
    this.coinsText = this.mkText(coin.x + 26, coin.y + 14, this.fmtCoins(), { fontFamily: '"Jua", sans-serif', fontSize: '24px', color: '#3c2816' })
      .setOrigin(0.5)
      .setDepth(95);

    const bar = this.nodePos(PROGRESS_PANEL_ID) ?? { x: 934, y: 85 };
    this.progressText = this.mkText(bar.x, bar.y, this.fmtProgress(), { fontFamily: '"Jua", sans-serif', fontSize: '18px', color: '#ffffff', fontStyle: '700' })
      .setOrigin(0.5)
      .setStroke('#3a2a12', 4)
      .setDepth(95);
  }

  private fmtCoins(): string {
    return this.profile.coins.toLocaleString('en-US');
  }
  private fmtProgress(): string {
    return `🚚 ${this.state.dispatched}/${this.state.goal}`;
  }

  /**
   * 보드가 차지할 도로 영역을 **레이아웃 노드에서 산출** — 도크(트럭 하단)와 하단 버튼 바(상단)
   * 사이를 보드 영역으로 삼는다(좌우는 작은 여백). 세로 HD 디자인이 바뀌어도 따라가도록 SSOT 파생.
   */
  private computeBoardArea(): { left: number; right: number; top: number; bottom: number } {
    let truckBottom = 0;
    for (const id of BAY_TRUCK_IDS) {
      const n = this.layout.nodeById(id);
      if (n?.h) truckBottom = Math.max(truckBottom, n.y + n.h / 2);
    }
    let buttonTop = H;
    for (const pw of POWER_NODES) {
      const n = this.layout.nodeById(pw.id);
      if (n?.h) buttonTop = Math.min(buttonTop, n.y - n.h / 2);
    }
    if (truckBottom <= 0) return { ...BOARD_AREA_FALLBACK };
    const left = 40;
    return { left, right: W - left, top: truckBottom + 40, bottom: buttonTop - 40 };
  }

  /** 보드 영역 세로 중심(폴백 좌표용). */
  private boardCy(): number {
    return (this.boardArea.top + this.boardArea.bottom) / 2;
  }

  // ─── 보드 기하(영역+행·열로 반응형 산출) ───
  private setupBoardGeometry(): void {
    this.boardArea = this.computeBoardArea();
    const { cols, rows } = this.state.board;
    const areaW = this.boardArea.right - this.boardArea.left;
    const areaH = this.boardArea.bottom - this.boardArea.top;
    // 정사각 셀이 영역에 꼭 맞도록 가로/세로 중 작은 쪽으로 셀 크기 결정.
    const cell = Math.min(areaW / cols, areaH / rows);
    this.cellSize = cell;
    this.cellH = cell;
    this.tileDisp = cell * 0.84; // 비율 유지 + 살짝 축소(셀 안 여백)

    const cx = (this.boardArea.left + this.boardArea.right) / 2;
    const cy = (this.boardArea.top + this.boardArea.bottom) / 2;
    const startX = cx - (cols * cell) / 2 + cell / 2;
    const startY = cy - (rows * cell) / 2 + cell / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.cellCenters.set(cellKey(c, r), { x: startX + c * cell, y: startY + r * cell });
      }
    }

    this.reframeBoardPanel(cols, rows, cell, cx, cy);
    this.drawCellBackgrounds();
  }

  /**
   * 보드 패널을 그리드에 맞춰 리프레임 — 에디터 기본 사각 패널(탁한 갈색)은 숨기고,
   * **외곽 라운드 코너**의 밝은 크림 반투명 패널로 대체(탁함 제거 + 라운드 외곽선).
   */
  private reframeBoardPanel(cols: number, rows: number, cell: number, cx: number, cy: number): void {
    const pad = cell * 0.22;
    const w = cols * cell + pad * 2;
    const h = rows * cell + pad * 2;
    const r = Math.min(30, w * 0.06, h * 0.06);
    const x = cx - w / 2;
    const y = cy - h / 2;
    this.boardPanel?.destroy();
    const g = this.add.graphics().setDepth(18);
    g.fillStyle(0xfff3e0, 0.5); // 밝은 크림 반투명(도로 BG 살짝 비침)
    g.fillRoundedRect(x, y, w, h, r);
    g.lineStyle(3, 0xffffff, 0.55); // 외곽 라운드 선
    g.strokeRoundedRect(x, y, w, h, r);
    this.boardPanel = g;
  }

  /** 각 셀 배경(에디터 슬롯 아트)을 산출 위치/크기로 배치. */
  private drawCellBackgrounds(): void {
    for (const o of this.cellBgs) o.destroy();
    this.cellBgs = [];
    const size = this.cellSize * 0.94;
    const hasArt = this.textures.exists(SLOT_TEX);
    for (const pos of this.cellCenters.values()) {
      if (hasArt) {
        this.cellBgs.push(this.add.image(pos.x, pos.y, SLOT_TEX).setDisplaySize(size, size).setDepth(80));
      } else {
        this.cellBgs.push(this.add.rectangle(pos.x, pos.y, size, size, 0xfbe9cf, 1).setDepth(80));
      }
    }
  }

  private cellPos(col: number, row: number): Pos {
    return this.cellCenters.get(cellKey(col, row)) ?? { x: W / 2, y: this.boardCy() };
  }

  // ─── 베이(트럭 + 단일 오더) ───
  private setupBays(): void {
    // 캐릭터 기준 기하 = 에디터 에셋 노드(layer_8)에서 산출. 블루 베이(트럭0) 기준 x오프셋·절대 y·표시 높이.
    const charNode = this.layout.nodeById(CHAR_NODE_ID);
    const truck0Node = this.layout.nodeById(BAY_TRUCK_IDS[0]);
    if (charNode && truck0Node) {
      this.charOffX = charNode.x - truck0Node.x;
      this.charY = charNode.y;
      if (charNode.h) this.charH = charNode.h;
    }

    const n = this.state.bays.length;
    for (let b = 0; b < n; b++) {
      const panel = this.nodePos(BAY_PANEL_IDS[b]) ?? { x: 239 + b * 196, y: ORDER_ITEM_Y };
      const badge = this.nodePos(BAY_BADGE_IDS[b]) ?? { x: panel.x, y: ORDER_COUNT_Y };
      // 시계/디지털시간은 에디터에 저장된 시간 텍스트 노드 위치(전부 y480 정렬)에 배치 — 없으면 뱃지 폴백.
      const timeNode = this.nodePos(BAY_TIME_IDS[b]) ?? badge;
      const truck = this.layout.tryById<Phaser.GameObjects.Image>(BAY_TRUCK_IDS[b]);
      const truckRestY = truck ? truck.y : 749;
      // 트럭 그림자(__shadow)는 트럭과 같은 depth 라 일부 베이(녹/오렌지)에서 트럭을 덮어 어둡게
      // 보였다 → 그림자를 트럭보다 한 단계 아래로 내려 항상 트럭이 또렷하게 보이도록 한다.
      const shadowNode = this.layout.tryById<Phaser.GameObjects.Image>(BAY_TRUCK_IDS[b] + '__shadow');
      if (truck && shadowNode) shadowNode.setDepth(truck.depth - 1);
      const view: BayView = {
        bay: b,
        homeX: panel.x,
        iconY: panel.y + ITEM_DY, // 디자인 샘플 y≈290
        // 갯수는 패널 좌측, 아이템은 우측(상단 뱃지 줄은 시계/시간이 차지).
        countX: panel.x + COUNT_DX,
        countY: panel.y + ITEM_DY,
        panel: this.layout.tryById(BAY_PANEL_IDS[b]) as (Phaser.GameObjects.GameObject & { setAlpha(a: number): unknown }) | undefined,
        truckRestY,
        truck,
        // 아날로그 초시계+디지털시간을 **에디터에 저장된 시간 텍스트 노드(layer_10_copy*) 위치**에 배치.
        // 시간 노드는 4베이 모두 y480 으로 정렬돼 있어 타이머가 한 줄로 가지런하다. 시계는 그 좌측에.
        clockX: timeNode.x + CLOCK_DX,
        clockY: timeNode.y,
        timeX: timeNode.x + TIME_DX,
        timeLeftMs: 0,
        timeLimitMs: this.state.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS,
        timerActive: false,
        warned: false,
        slotPos: { x: panel.x, y: panel.y },
        shownLoaded: 0,
        required: 0,
      };
      this.bayViews[b] = view;
      const truckState = this.state.bays[b];
      this.renderBayOrder(view, truckState);
      if (truckState) this.attachTruckExtras(view, truckState);
    }
    // 남는 베이 노드 숨김(베이 수가 디자인 도크보다 적을 때).
    for (let b = n; b < BAY_BADGE_IDS.length; b++) this.layout.tryById(BAY_BADGE_IDS[b])?.setVisible(false);
    for (let b = n; b < BAY_PANEL_IDS.length; b++) this.layout.tryById(BAY_PANEL_IDS[b])?.setVisible(false);
    for (let b = n; b < BAY_TRUCK_IDS.length; b++) this.layout.tryById(BAY_TRUCK_IDS[b])?.setVisible(false);
  }

  // ─── 캐릭터 + 제한시간 시계 ───
  /** 트럭 serial → 캐릭터 텍스처(남/여 교대 + 포즈 변형). */
  // 캐릭터 = 베이(차량) 색의 의상(variant 1~4 = 청/녹/오렌지/보라) + serial 짝/홀로 남/여 교대.
  private charKeyFor(bay: number, serial: number): string {
    const person = CHAR_PERSONS[serial % CHAR_PERSONS.length];
    const variant = (bay % CHAR_VARIANTS) + 1; // 차량 색과 매칭(블루/그린/오렌지/퍼플)
    return `up_Logistics_Chr_${person}-${variant}`;
  }

  /** 차량 앞 캐릭터 생성 + 트럭별 개별 제한시간/시계 시작(트럭 정차 시). */
  private attachTruckExtras(view: BayView, truck: TruckState): void {
    const serial = truck.serial;
    // 캐릭터(차량 앞-좌). 의상색=차량색, serial 짝/홀로 남/여 교대. **크기/위치는 에디터 에셋 노드 기준**:
    // 높이=charH, x=트럭중심+charOffX, y=charY(전부 layer_8 노드에서 산출). 재업로드된 _v2 아트가 있으면 우선.
    view.char?.destroy();
    let key = this.charKeyFor(view.bay, serial);
    if (this.textures.exists(key + '_v2')) key = key + '_v2';
    const truckX = view.truck ? view.truck.x : view.homeX;
    if (this.textures.exists(key)) {
      const src = this.textures.get(key).getSourceImage() as { height: number };
      const scale = this.charH / (src.height || this.charH); // 비율 유지로 에셋 높이에 맞춤
      const img = this.add
        .image(truckX + this.charOffX, this.charY, key)
        .setScale(scale)
        .setDepth(CHAR_DEPTH)
        .setAlpha(0);
      this.tweens.add({ targets: img, alpha: 1, duration: 220 });
      view.char = img;
    }
    // 제한시간 — **트럭마다 다른 ~2분**(주문량+serial). 시계+디지털 시간(상단) 시작.
    view.timeLimitMs = truckTimeLimitMs(truck.orders[0].required, serial);
    view.timeLeftMs = view.timeLimitMs;
    view.timerActive = true;
    view.warned = false; // 새 트럭 = 경고음 재무장
    view.panel?.setAlpha(1); // 점멸 알파 초기화(새 트럭은 충분한 시간)
    if (!view.clock) view.clock = this.add.graphics().setDepth(CLOCK_DEPTH);
    if (!view.timeText) {
      view.timeText = this.mkText(view.timeX, view.clockY, '', {
          fontFamily: '"Jua", sans-serif',
          fontSize: '26px', // 1.5배 확대(17→26)
          color: '#ffffff',
          fontStyle: '700',
        })
        .setOrigin(0.5)
        .setDepth(CLOCK_DEPTH + 1);
      view.timeText.setStroke('#2a1c0c', 4); // 파란 배경 대신 외곽선으로 가독성
    }
    view.clock.setVisible(true);
    view.timeText.setVisible(true);
    this.drawClock(view);
  }

  /** typePool 에서 avoid 에 없는 상품 1종 선택(없으면 아무거나). */
  private pickTypeAvoiding(avoid: Set<number>): number {
    const pool = this.state.typePool;
    const free = pool.filter((t) => !avoid.has(t));
    const arr = free.length ? free : pool;
    return arr[Math.floor(this.rng() * arr.length)] ?? pool[0];
  }

  /** 해당 베이 트럭의 주문 상품이 다른 정차 베이와 겹치면 다른 상품으로 교체(동시 중복 방지). */
  private ensureBayDistinct(bay: number): void {
    const t = this.state.bays[bay];
    if (!t) return;
    const others = new Set<number>();
    this.state.bays.forEach((b, i) => {
      if (i !== bay && b) others.add(b.orders[0].type);
    });
    if (!others.has(t.orders[0].type)) return;
    const newType = this.pickTypeAvoiding(others);
    const bays = this.state.bays.slice();
    bays[bay] = { ...t, orders: [{ ...t.orders[0], type: newType }] };
    this.state = { ...this.state, bays };
  }

  /** 트럭 출발 시 캐릭터 제거 + 타이머 정지 + 시계/시간 숨김. */
  private detachTruckExtras(view: BayView): void {
    view.timerActive = false;
    view.clock?.setVisible(false);
    view.timeText?.setVisible(false);
    const c = view.char;
    view.char = undefined;
    if (c) this.tweens.add({ targets: c, alpha: 0, duration: 160, onComplete: () => c.destroy() });
  }

  /** 남은시간(ms) → MM:SS. */
  private fmtTime(ms: number): string {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  /**
   * 아날로그 초시계 그리기(상단) + 디지털 시간 갱신.
   * **초침은 남은 초수에 정확히 대응**(1회전=60초): 12시=0초, 3시=15초, 6시=30초, 9시=45초.
   * ms 기반 분수초로 매 프레임 그려 **부드럽고 정교하게** 회전한다. 남은비율로 잔량 파이/색 표시.
   */
  private drawClock(view: BayView): void {
    const g = view.clock;
    if (!g) return;
    const cx = view.clockX;
    const cy = view.clockY;
    const r = CLOCK_R;
    const remainMs = Math.max(0, view.timeLeftMs);
    const remainSec = remainMs / 1000;
    const f = Phaser.Math.Clamp(remainMs / Math.max(1, view.timeLimitMs), 0, 1);
    const color = remainSec <= 5 ? 0xe03131 : f < 0.4 ? 0xf2b705 : 0x2f9e44;
    g.clear();
    // 시계 배경 그림자 + 면.
    g.fillStyle(0x000000, 0.18);
    g.fillCircle(cx, cy + 1.5, r + 1.5);
    g.fillStyle(0xffffff, 0.97);
    g.fillCircle(cx, cy, r);
    // 잔량 파이(12시부터 남은비율만큼).
    if (f > 0) {
      g.fillStyle(color, 0.16);
      g.slice(cx, cy, r - 4, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + 360 * f), false);
      g.fillPath();
    }
    // 분 눈금 12개(정교함).
    g.lineStyle(1.4, 0x9aa0a6, 0.85);
    for (let i = 0; i < 12; i++) {
      const a = Phaser.Math.DegToRad(i * 30 - 90);
      g.lineBetween(
        cx + Math.cos(a) * (r - 2.5),
        cy + Math.sin(a) * (r - 2.5),
        cx + Math.cos(a) * (r - 5.5),
        cy + Math.sin(a) * (r - 5.5),
      );
    }
    // 테두리.
    g.lineStyle(2.5, color, 1);
    g.strokeCircle(cx, cy, r);
    // 초침 — 남은 초수에 정확히 대응(분수초 → 부드러운 sweep).
    const secAngle = Phaser.Math.DegToRad(-90 + ((remainSec % 60) / 60) * 360);
    g.lineStyle(2.5, color, 1);
    g.lineBetween(cx, cy, cx + Math.cos(secAngle) * (r - 4), cy + Math.sin(secAngle) * (r - 4));
    // 짧은 꼬리(밸런스).
    g.lineStyle(2.5, color, 1);
    g.lineBetween(cx, cy, cx - Math.cos(secAngle) * 4, cy - Math.sin(secAngle) * 4);
    g.fillStyle(color, 1);
    g.fillCircle(cx, cy, 2.6);
    // 디지털 시간(MM:SS) — **파란 배경 없이** 뱃지 위 텍스트만(외곽선으로 가독성). 위급 시 빨강.
    if (view.timeText) {
      view.timeText.setText(this.fmtTime(view.timeLeftMs));
      view.timeText.setColor(remainSec <= 5 ? '#ffd2d2' : '#ffffff');
    }
  }

  /** 무한 공급 — 큐가 모자라면 새 트럭 명세를 결정적으로 보충(동일 품목 연속 방지). */
  private refillQueue(): void {
    const minQ = this.state.bays.length + 2;
    if (this.state.queue.length >= minQ) return;
    const typePool = this.state.typePool;
    const reqMin = this.state.reqMin ?? 5;
    const reqMax = this.state.reqMax ?? 10;
    const add: TruckSpec[] = [];
    const last = this.state.queue[this.state.queue.length - 1];
    let prev: number | undefined = last ? last.orders[0].type : undefined;
    while (this.state.queue.length + add.length < minQ + 4) {
      const spec = makeTruckSpec(typePool, reqMin, reqMax, this.rng, prev);
      prev = spec.orders[0].type;
      add.push(spec);
    }
    this.state = { ...this.state, queue: [...this.state.queue, ...add] };
  }

  /** 매 프레임 — 각 베이 제한시간 카운트다운 + 시계 갱신 + 시간초과 자동출발. */
  update(_time: number, delta: number): void {
    if (this.finished) return;
    for (const view of this.bayViews) {
      if (!view || !view.timerActive) continue;
      view.timeLeftMs -= delta;
      this.drawClock(view);
      // 30초 이하 → 배송표시 패널(+아이템·갯수) 점멸로 경고 + 경고음(트럭당 1회).
      if (view.timeLeftMs <= LOW_TIME_MS) {
        if (!view.warned) {
          view.warned = true;
          sfx('time_warning', { volume: 0.55 });
        }
        const a = 0.35 + 0.65 * Math.abs(Math.sin(this.time.now / 150));
        view.panel?.setAlpha(a);
        view.icon?.setAlpha(a);
        view.count?.setAlpha(a);
      }
      if (view.timeLeftMs <= 0) {
        view.timerActive = false;
        this.onTruckTimeout(view.bay);
      }
    }

    // 유휴 힌트 — 보드가 멈춰있고(매칭 애니 아님) 10초 동안 수가 없으면 매칭 가능 쌍 깜박임.
    if (this.busy) {
      this.idleMs = 0;
    } else if (!this.hintActive) {
      this.idleMs += delta;
      if (this.idleMs >= HINT_IDLE_MS) this.showHint();
    }
  }

  /** 제한시간 초과 — 트럭 자동 출발(성공 집계 X). */
  private onTruckTimeout(bay: number): void {
    if (this.finished) return;
    const view = this.bayViews[bay];
    if (!view || !view.truck) return;
    this.dispatchBay(bay, 'timeout');
  }

  /** 매칭 가능한 한 쌍을 두세 번 간단히 깜박여 힌트. (유휴 10초 / 잘못된 스왑 시) */
  private showHint(): void {
    this.idleMs = 0;
    if (this.hintActive || this.busy || this.finished) return;
    const sw = findLegalSwap(this.state.board);
    if (!sw) return;
    const imgs = [sw.a, sw.c]
      .map((c) => this.tiles.get(cellKey(c.col, c.row)))
      .filter((t): t is Phaser.GameObjects.Image => !!t);
    if (!imgs.length) return;
    this.hintActive = true;
    this.hintTiles = imgs;
    let done = 0;
    for (const img of imgs) {
      this.tweens.add({
        targets: img,
        alpha: 0.3,
        duration: 220,
        yoyo: true,
        repeat: 2, // 1→0.3→1 을 3회 = 두세 번 깜박
        onComplete: () => {
          if (img.active) img.setAlpha(1);
          if (++done >= imgs.length) {
            this.hintTiles = [];
            this.hintActive = false;
          }
        },
      });
    }
  }

  /** 진행 중 힌트 깜박임 중단 + 복원(플레이어가 행동하면). */
  private clearHint(): void {
    for (const img of this.hintTiles) {
      if (img && img.active) {
        this.tweens.killTweensOf(img);
        img.setAlpha(1);
      }
    }
    this.hintTiles = [];
    this.hintActive = false;
  }

  /** 플레이어 활동 시 유휴 타이머 리셋 + 힌트 중단. */
  private resetIdle(): void {
    this.idleMs = 0;
    if (this.hintActive) this.clearHint();
  }

  /** 베이의 오더 아이콘/카운트를 (재)생성. truck=null 이면 빈 베이(트럭 숨김). */
  private renderBayOrder(view: BayView, truck: TruckState | null): void {
    view.icon?.destroy();
    view.count?.destroy();
    view.icon = undefined;
    view.count = undefined;
    view.pendingDispatch = false;
    if (!truck) {
      view.truck?.setVisible(false);
      view.shownLoaded = 0;
      view.required = 0;
      return;
    }
    view.truck?.setVisible(true);
    const slot = truck.orders[0];
    view.shownLoaded = slot.loaded;
    view.required = slot.required;
    // 패널: 아이템(우) + 갯수(좌). 상단 뱃지 줄은 시계/시간.
    const icon = makeProductIcon(this, slot.type, ORDER_ICON).setPosition(view.homeX + ITEM_DX, view.iconY).setDepth(95);
    const count = this.mkText(view.countX, view.countY, `${slot.loaded}/${slot.required}`, {
        fontFamily: '"Jua", sans-serif',
        fontSize: '26px', // 1.5배 확대(17→26)
        color: '#3c2816',
        fontStyle: '700',
      })
      .setOrigin(0.5)
      .setDepth(96);
    view.icon = icon;
    view.count = count;
    view.slotPos = { x: view.homeX + ITEM_DX, y: view.iconY };
  }

  // ─── 타일 ───
  private texKeyFor(localType: number): string {
    const p = productById(this.state.typePool[localType]);
    return this.textures.exists(p.texKey) ? p.texKey : TILE_KEY;
  }

  /** 이미지를 box 안에 **가로세로비 유지**로 맞춤(더 긴 변=box). baseScale 저장(선택/해제 복원용). */
  private fitItem(img: Phaser.GameObjects.Image, box: number): number {
    const w = img.width || box;
    const h = img.height || box;
    const s = box / Math.max(w, h);
    img.setScale(s);
    img.setData('baseScale', s);
    return s;
  }

  private makeTile(col: number, row: number, localType: number, atY?: number): Phaser.GameObjects.Image {
    const pos = this.cellPos(col, row);
    const img = this.add
      .image(pos.x, atY ?? pos.y, this.texKeyFor(localType))
      .setDepth(90)
      .setInteractive({ useHandCursor: true });
    this.fitItem(img, this.tileDisp); // 비율 유지(정사각 강제 금지)
    img.setData('col', col);
    img.setData('row', row);
    img.on('pointerdown', (ptr: Phaser.Input.Pointer) => this.onTilePress(img, ptr));
    return img;
  }

  /** 초기 배치도 셔플과 같은 연출 — 위에서부터 열별로 순차 낙하해 채운다(기존 타일 없음). */
  private spawnAllTiles(): void {
    this.busy = true;
    this.dropBoardIn(this.state.board, false);
  }

  /**
   * 보드를 **위에서부터 라인(열)을 따라 순차적으로 떨어뜨려** 채우는 공용 연출.
   * 초기 배치(`dropOld=false`)와 셔플(`dropOld=true`)이 같은 모션을 쓴다 — 열마다(왼→오)
   * 약간씩 지연(`COL_STAGGER`)을 두고, 새 열이 위에서 한 줄로 내려와 바운스 안착한다.
   * 셔플 시엔 기존 열을 동시에 아래로 빼낸다. 보드 영역 밖(도크/버튼 위)으로 타일이 보이지
   * 않도록 보드 영역 마스크로 가둔다.
   */
  private dropBoardIn(board: GameState['board'], dropOld: boolean): void {
    const { cols, rows } = board;
    const cell = this.cellSize;
    const cx = (this.boardArea.left + this.boardArea.right) / 2;
    const cy = (this.boardArea.top + this.boardArea.bottom) / 2;
    const gridTop = cy - (rows * cell) / 2;
    const gridBottom = cy + (rows * cell) / 2;
    const gridLeft = cx - (cols * cell) / 2;
    const gridW = cols * cell;

    // 보드 영역 마스크 — 떨어지는 타일이 위/아래 모서리에서 나타나고 사라지게(도크·버튼 위로 안 보이게).
    const maskG = this.make.graphics({ x: 0, y: 0 }, false);
    maskG.fillStyle(0xffffff);
    maskG.fillRect(gridLeft - 6, gridTop - 4, gridW + 12, gridBottom - gridTop + 8);
    const mask = maskG.createGeometryMask();

    const oldTiles = this.tiles;
    this.tiles = new Map();
    const COL_STAGGER = 70; // 라인(열)마다 순차 지연 → 왼→오 차례로 떨어짐
    const dropDist = rows * cell + 120; // 위에서 떨어지는 거리(보드 위로 충분히)
    const outY = gridBottom + cell + 60; // 기존 타일이 빠져나갈 아래(마스크 밖)

    let pending = 0;
    const finish = (): void => {
      maskG.destroy();
      this.busy = false;
      this.applyPendingSwap();
    };

    for (let c = 0; c < cols; c++) {
      const delay = c * COL_STAGGER;
      // 1) (셔플) 기존 열: 아래로 떨어져 보드 하단 모서리에서 사라짐.
      if (dropOld) {
        for (let r = 0; r < rows; r++) {
          const img = oldTiles.get(cellKey(c, r));
          if (!img) continue;
          img.setMask(mask);
          this.tweens.add({
            targets: img,
            y: outY,
            duration: 320,
            delay,
            ease: 'Quad.easeIn',
            onComplete: () => img.destroy(),
          });
        }
      }
      // 2) 새 열: 위에서 한 줄(열 단위)로 내려와 제자리에 안착(바운스).
      for (let r = 0; r < rows; r++) {
        const type = board.cells[r][c];
        if (type == null) continue;
        const dest = this.cellPos(c, r);
        const img = this.makeTile(c, r, type, dest.y - dropDist);
        img.setMask(mask);
        this.tiles.set(cellKey(c, r), img);
        pending++;
        this.tweens.add({
          targets: img,
          y: dest.y,
          duration: 430,
          delay: dropOld ? delay + 110 : delay, // 셔플은 기존 열이 빠지기 시작한 뒤
          ease: 'Bounce.easeOut',
          onComplete: () => {
            img.clearMask();
            if (--pending === 0) finish();
          },
        });
      }
    }
    if (pending === 0) finish();
  }

  /**
   * 셔플 연출 — 제자리에서 섞지 않고, 초기 배치와 **같은 위→아래 열별 낙하**로 보드를 새로 채운다.
   * 기존 열은 아래로 빠지고 새 열이 위에서 내려와 안착. 매칭 가능한 보드가 나올 때까지 재셔플(데드락 방지).
   */
  private doReshuffle(sound: Sfx = 'shuffle'): void {
    if (this.busy) return;
    this.busy = true;
    sfx(sound, { volume: 0.7 });
    this.deselect();
    this.resetIdle();

    let board = reshuffle(this.state.board, this.rng);
    for (let i = 0; i < 12 && !hasLegalMove(board); i++) board = reshuffle(this.state.board, this.rng);
    this.state = { ...this.state, board };

    this.dropBoardIn(board, true);
  }

  private ensurePlayable(): void {
    if (this.busy) {
      this.time.delayedCall(250, () => this.ensurePlayable());
      return;
    }
    if (!hasLegalMove(this.state.board)) this.doReshuffle();
  }

  // ─── 입력(손가락 추종 드래그 + 탭-탭 폴백) ───
  // 누르면 집기(select 뽑기 연출). 임계를 넘겨 끌면 타일이 손가락을 1:1로 따라오고(축고정 ±1칸),
  // 이웃이 자리를 비켜주며(텔레그래프) 손 떼는 위치로 스왑. 끌지 않고 떼면 탭-탭(인접 탭=스왑).
  // 매칭 애니(busy) 중엔 라이브 추종 대신 **버퍼링**(requestSwap)으로 다음 수를 받는다.
  private isAdjacent(a: Coord, b: Coord): boolean {
    return Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
  }

  /** dx/dy 우세축 방향의 인접 셀(클램프 전 후보). */
  private towardCell(from: Coord, dx: number, dy: number): Coord {
    if (Math.abs(dx) >= Math.abs(dy)) return { col: from.col + (dx > 0 ? 1 : -1), row: from.row };
    return { col: from.col, row: from.row + (dy > 0 ? 1 : -1) };
  }

  private onTilePress(img: Phaser.GameObjects.Image, pointer: Phaser.Input.Pointer): void {
    if (this.finished) return;
    startAudio(); // 첫 제스처에서 오디오 컨텍스트 resume
    this.resetIdle(); // 활동 → 유휴 힌트 리셋/중단
    const cell = { col: img.getData('col') as number, row: img.getData('row') as number };
    this.pressCell = cell;
    this.pressX = pointer.worldX;
    this.pressY = pointer.worldY;
    this.dragging = false;
    this.pressWasSelected = !!this.selected && this.selected.col === cell.col && this.selected.row === cell.row;

    // 탭-탭 폴백: 이미 다른 인접 타일이 선택돼 있으면 누르는 즉시 스왑(busy면 버퍼). 드래그/탭 후속 없음.
    if (this.selected && !this.pressWasSelected && this.isAdjacent(this.selected, cell)) {
      this.requestSwap(this.selected, cell);
      this.pressCell = null;
      return;
    }
    // 비인접 선택이 남아 있으면 해제하고 새로 집기. 같은 타일 재누름이면 선택 유지(탭 토글은 pointerup).
    if (this.selected && !this.pressWasSelected) this.deselect();
    if (!this.selected) this.select(cell); // 집기 뽑기 연출
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.finished || !this.pressCell) return;
    const dx = pointer.worldX - this.pressX;
    const dy = pointer.worldY - this.pressY;
    if (!this.dragging) {
      const thresh = this.cellSize * 0.22; // 살짝만 끌어도 드래그 시작(터치 반응성)
      if (Math.abs(dx) < thresh && Math.abs(dy) < thresh) return;
      this.dragging = true;
      if (this.busy) {
        // 애니 중: 라이브 추종 대신 인접 타깃을 버퍼 스왑(기존 거동 유지).
        const from = this.pressCell;
        this.pressCell = null;
        const t = this.towardCell(from, dx, dy);
        if (this.cellCenters.has(cellKey(t.col, t.row))) this.requestSwap(from, t);
        return;
      }
      this.beginDrag(this.pressCell);
    }
    if (this.busy || !this.dragTile || !this.dragOrigin) return;
    this.updateDrag(dx, dy);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.finished) {
      this.pressCell = null;
      this.dragging = false;
      return;
    }
    if (this.dragging && this.dragTile) {
      this.endDrag(pointer);
      this.pressCell = null;
      this.dragging = false;
      return;
    }
    // 끌지 않고 뗌 = 탭. 같은 타일 재탭이면 토글 해제, 새 선택이면 유지(다음 탭에서 인접 스왑).
    this.dragging = false;
    if (!this.pressCell) return;
    this.pressCell = null;
    if (this.pressWasSelected) this.deselect();
  }

  /** 드래그 시작 — 집은 타일을 들어올려 포인터 제어로 전환(집기 호흡 트윈 중지). */
  private beginDrag(cell: Coord): void {
    const img = this.tiles.get(cellKey(cell.col, cell.row));
    if (!img) return;
    this.dragTile = img;
    this.dragOrigin = this.cellPos(cell.col, cell.row);
    const base = (img.getData('baseScale') as number) ?? img.scale;
    this.tweens.killTweensOf(img); // 위치를 직접 제어하므로 자동 트윈 중지
    img.setScale(base * 1.4).setDepth(96);
    this.dragNeighbor = null;
  }

  /** 드래그 중 — 축 고정 + ±1칸 클램프로 타일을 손가락에 붙이고, 이웃을 반대로 밀어 스왑 미리보기. */
  private updateDrag(dx: number, dy: number): void {
    const from = this.selected;
    if (!from || !this.dragTile || !this.dragOrigin) return;
    const cell = this.cellSize;
    let offX = 0;
    let offY = 0;
    let target: Coord | null;
    if (Math.abs(dx) >= Math.abs(dy)) {
      target = { col: from.col + (dx > 0 ? 1 : -1), row: from.row };
      const valid = this.cellCenters.has(cellKey(target.col, target.row));
      offX = valid ? Phaser.Math.Clamp(dx, -cell, cell) : dx * 0.18; // 가장자리=고무줄(못 나감)
      if (!valid) target = null;
    } else {
      target = { col: from.col, row: from.row + (dy > 0 ? 1 : -1) };
      const valid = this.cellCenters.has(cellKey(target.col, target.row));
      offY = valid ? Phaser.Math.Clamp(dy, -cell, cell) : dy * 0.18;
      if (!valid) target = null;
    }
    const x = this.dragOrigin.x + offX;
    const y = this.dragOrigin.y + offY;
    this.dragTile.setPosition(x, y);
    if (this.selectShadow) this.selectShadow.setPosition(x, y + cell * 0.46);
    if (this.selectRing) this.selectRing.setPosition(x, y);
    this.updateDragNeighbor(target, offX, offY);
  }

  /** 이웃 텔레그래프 — 타깃 이웃을 집은 타일과 반대로 이동(자리 비켜줌). 타깃 변경 시 이전 이웃 원위치. */
  private updateDragNeighbor(target: Coord | null, offX: number, offY: number): void {
    const cur = this.dragNeighbor;
    if (cur && (!target || cur.cell.col !== target.col || cur.cell.row !== target.row)) {
      cur.img.setPosition(cur.ox, cur.oy);
      this.dragNeighbor = null;
    }
    if (!target) return;
    if (!this.dragNeighbor) {
      const nimg = this.tiles.get(cellKey(target.col, target.row));
      if (!nimg) return;
      const npos = this.cellPos(target.col, target.row);
      this.dragNeighbor = { img: nimg, cell: target, ox: npos.x, oy: npos.y };
    }
    this.dragNeighbor.img.setPosition(this.dragNeighbor.ox - offX, this.dragNeighbor.oy - offY);
  }

  /** 드래그 종료 — 반칸 이상 끌었으면 그 방향으로 스왑, 아니면 부드럽게 원위치 스냅. */
  private endDrag(pointer: Phaser.Input.Pointer): void {
    const from = this.selected;
    const dragTile = this.dragTile;
    const origin = this.dragOrigin;
    const neighbor = this.dragNeighbor;
    this.dragTile = undefined;
    this.dragOrigin = undefined;
    this.dragNeighbor = null;
    if (!from || !dragTile || !origin) {
      this.deselect();
      return;
    }
    const dx = pointer.worldX - this.pressX;
    const dy = pointer.worldY - this.pressY;
    const axisOff = Math.abs(dx) >= Math.abs(dy) ? Math.abs(dx) : Math.abs(dy);
    const target = this.towardCell(from, dx, dy);
    const valid = this.cellCenters.has(cellKey(target.col, target.row));
    if (valid && axisOff >= this.cellSize * 0.5) {
      // 커밋: 이웃 원위치 스냅 후 스왑(attemptSwap 가 현재 위치에서 이어 애니).
      if (neighbor) neighbor.img.setPosition(neighbor.ox, neighbor.oy);
      this.requestSwap(from, target); // deselect 처리 + 스왑
    } else {
      // 미달: 집은 타일·이웃을 부드럽게 원위치로(deselect 의 즉시 setScale 회피 위해 직접 정리).
      const base = (dragTile.getData('baseScale') as number) ?? dragTile.scale;
      this.tweens.killTweensOf(dragTile);
      this.tweens.add({
        targets: dragTile,
        x: origin.x,
        y: origin.y,
        scale: base,
        duration: 150,
        ease: 'Back.easeOut',
        onComplete: () => dragTile.setAngle(0).setDepth(90),
      });
      if (neighbor) {
        this.tweens.killTweensOf(neighbor.img);
        this.tweens.add({ targets: neighbor.img, x: neighbor.ox, y: neighbor.oy, duration: 150, ease: 'Back.easeOut' });
      }
      this.clearSelectRing();
      this.selected = null;
      haptics.tap();
    }
  }

  /** 스왑 요청 — 애니 중이면 버퍼(pendingSwap), 아니면 즉시 실행. */
  private requestSwap(a: Coord, b: Coord): void {
    if (this.finished) return;
    this.resetIdle();
    this.deselect();
    if (this.busy) {
      this.pendingSwap = { a, b }; // 최신 시도만 보관(다음 턴에 적용)
      return;
    }
    this.attemptSwap(a, b);
  }

  /** 버퍼된 다음 수가 있으면(정착 보드 기준) 적용. 적용했으면 true. */
  private applyPendingSwap(): boolean {
    if (!this.pendingSwap || this.busy || this.finished) return false;
    const { a, b } = this.pendingSwap;
    this.pendingSwap = null;
    if (!this.cellCenters.has(cellKey(a.col, a.row)) || !this.cellCenters.has(cellKey(b.col, b.row))) return false;
    if (Math.abs(a.col - b.col) + Math.abs(a.row - b.row) !== 1) return false;
    this.attemptSwap(a, b);
    return true;
  }

  /** 선택 하이라이트 링 + 들어올림 그림자 제거. */
  private clearSelectRing(): void {
    if (this.selectRing) {
      this.tweens.killTweensOf(this.selectRing);
      this.selectRing.destroy();
      this.selectRing = undefined;
    }
    if (this.selectShadow) {
      this.tweens.killTweensOf(this.selectShadow);
      this.selectShadow.destroy();
      this.selectShadow = undefined;
    }
  }

  private select(c: Coord): void {
    this.selected = c;
    sfx('tile_select', { volume: 0.5 });
    haptics.tap(); // 집는 순간 가벼운 진동 — 손에 "잡혔다"
    if (this.busy) return; // 애니 중엔 펄스 생략(타일 ref 변동 방지) — 좌표만 추적
    const img = this.tiles.get(cellKey(c.col, c.row));
    if (!img) return;
    const base = (img.getData('baseScale') as number) ?? img.scale;
    img.setDepth(95); // 선택 타일을 이웃 위로
    this.tweens.killTweensOf(img);

    this.clearSelectRing();
    const pos = this.cellPos(c.col, c.row);

    // ① 들어올림 그림자 — 타일이 보드 위로 떠 있는 듯한 깊이감.
    this.selectShadow = this.add
      .ellipse(pos.x, pos.y + this.cellSize * 0.46, this.cellSize * 0.82, this.cellSize * 0.3, 0x000000, 0.22)
      .setDepth(94);

    // ② 선택 하이라이트 링 — 맥동이 아니라 "탁" 조여드는 스냅인(로컬좌표로 그려 위치 기준 스케일).
    const s = this.cellSize * 0.5;
    const g = this.add.graphics();
    g.lineStyle(5, 0xffe24a, 1);
    g.strokeRoundedRect(-s, -s, s * 2, s * 2, 14);
    g.setPosition(pos.x, pos.y).setDepth(93).setScale(1.6).setAlpha(0);
    this.selectRing = g;
    this.tweens.add({
      targets: g,
      scale: 1,
      alpha: 1,
      duration: 180,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({ targets: g, alpha: 0.55, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      },
    });

    // ③ 집기 "뽑기" — 살짝 눌렀다가(anticipation) 크게 튀어오르고(lift) 은은히 호흡.
    //    각도 흔들(노이즈로 읽힘)을 호흡하는 스케일로 대체 → 또렷한 손맛.
    this.tweens.add({
      targets: img,
      scale: base * 0.88,
      duration: 70,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: img,
          scale: base * 1.5,
          duration: 170,
          ease: 'Back.easeOut',
          onComplete: () => {
            this.tweens.add({
              targets: img,
              scale: base * 1.44,
              duration: 700,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
            });
          },
        });
      },
    });
  }
  private deselect(): void {
    if (!this.selected) return;
    this.clearSelectRing();
    if (!this.busy) {
      const img = this.tiles.get(cellKey(this.selected.col, this.selected.row));
      if (img) {
        this.tweens.killTweensOf(img);
        img.setScale((img.getData('baseScale') as number) ?? img.scale).setAngle(0).setDepth(90); // 비율·각도·depth 복원
      }
    }
    this.selected = null;
  }

  private attemptSwap(a: Coord, b: Coord): void {
    const imgA = this.tiles.get(cellKey(a.col, a.row));
    const imgB = this.tiles.get(cellKey(b.col, b.row));
    if (!imgA || !imgB) return;
    this.busy = true;
    sfx('tile_swap', { volume: 0.55 });
    const legal = isLegalSwap(this.state.board, a, b);
    const pa = this.cellPos(a.col, a.row);
    const pb = this.cellPos(b.col, b.row);
    const baseA = (imgA.getData('baseScale') as number) ?? imgA.scale;
    const baseB = (imgB.getData('baseScale') as number) ?? imgB.scale;
    // 스왑 중 두 타일을 위로(이웃 가림) + 둘 다 **확실히 커지며** 방향으로 이동(스위칭 강조).
    imgA.setDepth(96);
    imgB.setDepth(95);
    const SWAP_MS = 260;

    this.tweens.add({ targets: imgA, x: pb.x, y: pb.y, scale: baseA * 1.5, duration: SWAP_MS, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: imgB,
      x: pa.x,
      y: pa.y,
      scale: baseB * 1.5,
      duration: SWAP_MS,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (legal) {
          imgA.setScale(baseA).setDepth(90);
          imgB.setScale(baseB).setDepth(90);
          this.comboCount = 0; // 이번 스왑의 콤보 카운터 초기화
          this.state = { ...this.state, board: swapTypes(this.state.board, a, b) };
          this.swapTileRefs(a, b);
          // 히트스톱 한 박자 — 교환이 "딱" 멈췄다가 매치가 터지며 타격감을 키운다(매치 햅틱은 resolveCascade).
          this.time.delayedCall(60, () => this.resolveCascade());
        } else {
          // 불법: 제자리로 빠르게 복귀 → 좌우 셰이크 + 붉은 플래시 + 경고 진동(성공과 확실히 구분).
          this.tweens.add({ targets: imgA, x: pa.x, y: pa.y, scale: baseA, duration: 120, ease: 'Quad.easeInOut', onComplete: () => imgA.setDepth(90) });
          this.tweens.add({
            targets: imgB,
            x: pb.x,
            y: pb.y,
            scale: baseB,
            duration: 120,
            ease: 'Quad.easeInOut',
            onComplete: () => {
              imgB.setDepth(90);
              sfx('wrong', { volume: 0.6 });
              this.rejectShake(imgA, pa.x, imgB, pb.x, () => {
                this.busy = false;
                // 버퍼된 다음 수가 있으면 적용, 없으면 잘못된 스왑이므로 매칭 가능한 쌍을 깜박여 힌트.
                if (!this.applyPendingSwap()) this.showHint();
              });
            },
          });
        }
      },
    });
  }

  /** 잘못된 스왑 피드백 — 두 타일을 붉게 번뜩이며 좌우로 짧게 흔든 뒤 done(). */
  private rejectShake(
    imgA: Phaser.GameObjects.Image,
    ax: number,
    imgB: Phaser.GameObjects.Image,
    bx: number,
    done: () => void,
  ): void {
    haptics.warn();
    const pairs: ReadonlyArray<{ img: Phaser.GameObjects.Image; x: number }> = [
      { img: imgA, x: ax },
      { img: imgB, x: bx },
    ];
    let left = pairs.length;
    for (const { img, x } of pairs) {
      img.setTint(0xff5a5a); // 붉은 플래시
      this.tweens.add({
        targets: img,
        x: x - 9,
        duration: 48,
        yoyo: true,
        repeat: 3,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          img.x = x;
          img.clearTint();
          if (--left === 0) done();
        },
      });
    }
  }

  private swapTileRefs(a: Coord, b: Coord): void {
    const ka = cellKey(a.col, a.row);
    const kb = cellKey(b.col, b.row);
    const ia = this.tiles.get(ka);
    const ib = this.tiles.get(kb);
    if (ia) {
      ia.setData('col', b.col);
      ia.setData('row', b.row);
    }
    if (ib) {
      ib.setData('col', a.col);
      ib.setData('row', a.row);
    }
    if (ia) this.tiles.set(kb, ia);
    if (ib) this.tiles.set(ka, ib);
  }

  // ─── 캐스케이드(매치→배송→제거→중력→반복) ───
  private resolveCascade(): void {
    const matches = findMatches(this.state.board);
    if (matches.length === 0) {
      this.busy = false;
      if (this.finished) return;
      if (isLevelComplete(this.state)) {
        this.levelClear();
        return;
      }
      if (this.applyPendingSwap()) return; // 버퍼된 다음 수를 정착 보드에 적용
      if (!hasLegalMove(this.state.board)) this.time.delayedCall(280, () => this.ensurePlayable());
      return;
    }

    // 매치 효과음 + 햅틱 — 첫 매치=match(성공 진동), 연쇄(콤보)=combo(점점 높은 피치 + 가벼운 진동).
    if (this.comboCount === 0) {
      sfx('match', { volume: 0.7 });
      haptics.success();
    } else {
      sfx('combo', { volume: 0.7, pitch: Math.min(1.5, 1 + this.comboCount * 0.08) });
      haptics.tap();
    }
    this.comboCount++;

    // 매치 상품 → 배송(먼저 계산: 어떤 베이가 어떤 상품을 받는지 알아야 시간 보너스를 줄 수 있다).
    const productTypes = matches.map((m) => this.state.typePool[this.state.board.cells[m.row][m.col] as number]);
    const d = deliver(this.state.bays, productTypes);
    this.state = { ...this.state, bays: d.bays, dispatched: this.state.dispatched + d.dispatchedBays.length };
    const dispatchedSet = new Set(d.dispatchedBays);
    const bayByType = new Map<number, number>(); // 배송받은 상품(global type) → 베이
    for (const g of d.delivered) bayByType.set(g.type, g.bay);

    // 라인 길이 배수 — 4개=×2, 5개=×4, 6개=×8 …(2^(len-3)). 두 가지 이익:
    //   ① 보너스 코인(awardLineBonus)  ② 해당 배송 트럭(배송퍼즐)의 제한시간 증가(addTruckTime).
    for (const g of findMatchGroups(this.state.board)) {
      if (g.len < 4) continue;
      const mult = Math.pow(2, g.len - 3);
      const center = this.centroidOf(g.coords) ?? { x: W / 2, y: this.boardCy() };
      this.spawnLineMultiplier(center, mult);
      this.awardLineBonus(mult);
      // ② 이 라인 상품을 받은 트럭의 시간 증가(10초×배수). 출발하는 트럭/미주문 상품은 제외.
      //    매치 위치에서 **시계 아이템이 나타나 해당 트럭 시계로 날아가** 도착 시 시간이 가산된다.
      const first = g.coords[0];
      const localType = first ? this.state.board.cells[first.row][first.col] : null;
      if (localType != null) {
        const bay = bayByType.get(this.state.typePool[localType]);
        if (bay != null && !dispatchedSet.has(bay)) this.flyTimeBonus(center, bay, mult);
      }
    }

    this.applyDeliveries(d, matches, productTypes);

    // 제거 연출.
    let pending = matches.length;
    let idx = 0;
    for (const m of matches) {
      const k = cellKey(m.col, m.row);
      const img = this.tiles.get(k);
      this.tiles.delete(k);
      if (!img) {
        if (--pending === 0) this.afterClear(matches);
        continue;
      }
      this.clearTileFx(img, idx++, () => {
        if (--pending === 0) this.afterClear(matches);
      });
    }
    if (pending === 0) this.afterClear(matches);
  }

  private afterClear(matches: Coord[]): void {
    this.state = { ...this.state, board: clearCells(this.state.board, matches) };
    const { board, moves } = collapse(this.state.board, this.rng);
    this.state = { ...this.state, board };
    this.animateMoves(moves, () => this.resolveCascade());
  }

  private animateMoves(moves: CollapseMove[], done: () => void): void {
    const spawnsPerCol = new Map<number, number>();
    for (const mv of moves) if (mv.fromRow == null) spawnsPerCol.set(mv.col, (spawnsPerCol.get(mv.col) ?? 0) + 1);

    const oldTiles = this.tiles;
    const newTiles = new Map<string, Phaser.GameObjects.Image>();
    let pending = 0;
    let anyMove = false;

    for (const mv of moves) {
      const destKey = cellKey(mv.col, mv.toRow);
      const dest = this.cellPos(mv.col, mv.toRow);
      let img: Phaser.GameObjects.Image | undefined;
      if (mv.fromRow != null) {
        img = oldTiles.get(cellKey(mv.col, mv.fromRow));
        if (img) {
          img.setData('col', mv.col);
          img.setData('row', mv.toRow);
        }
      } else {
        const startY = dest.y - (spawnsPerCol.get(mv.col) ?? 1) * this.cellH - this.cellH;
        img = this.makeTile(mv.col, mv.toRow, mv.type, startY);
      }
      if (!img) continue;
      newTiles.set(destKey, img);
      if (Math.abs(img.y - dest.y) > 0.5 || Math.abs(img.x - dest.x) > 0.5) {
        anyMove = true;
        pending++;
        this.tweens.add({
          targets: img,
          x: dest.x,
          y: dest.y,
          duration: 220,
          ease: 'Quad.easeIn',
          onComplete: () => {
            if (--pending === 0) done();
          },
        });
      }
    }
    this.tiles = newTiles;
    if (!anyMove) this.time.delayedCall(0, done);
  }

  private clearTileFx(img: Phaser.GameObjects.Image, idx: number, done: () => void): void {
    // 매칭되는 시점에 타일을 **확실히 크게 부풀렸다가**(1.55배 팝) → 회전하며 사라짐.
    img.setDepth(92); // 부푸는 동안 이웃 위로
    this.tweens.add({
      targets: img,
      scale: img.scale * 1.55,
      duration: 150,
      ease: 'Back.easeOut',
      delay: idx * 16,
      onComplete: () => {
        this.tweens.add({
          targets: img,
          scale: 0,
          alpha: 0,
          angle: img.angle + 160,
          duration: 170,
          ease: 'Back.easeIn',
          onComplete: () => {
            img.destroy();
            done();
          },
        });
      },
    });
  }

  // ─── 배송 반영(HUD/연출) ───
  /**
   * 매치 상품을 트럭으로 **하나씩 빠르게**(stagger) 날려 보낸다. 각 상품은 자기 매치 타일에서
   * 출발해 순차로 이동하고, 도착할 때마다 카운트가 1씩 오른다(한꺼번에 점프 X). 출발(dispatch)은
   * 마지막 상품이 도착해 카운트가 가득 찬 뒤에 일어난다.
   */
  private applyDeliveries(d: DeliverResult, matches: Coord[], productTypes: number[]): void {
    // 종류별 매치 타일 좌표(상품 스트림의 공통 출발점 산출).
    const srcByType = new Map<number, Coord[]>();
    matches.forEach((m, i) => {
      const t = productTypes[i];
      const arr = srcByType.get(t);
      if (arr) arr.push(m);
      else srcByType.set(t, [m]);
    });
    // 전체 매치 중심(폴백).
    let sx = 0;
    let sy = 0;
    for (const m of matches) {
      const p = this.cellPos(m.col, m.row);
      sx += p.x;
      sy += p.y;
    }
    const fallback: Pos = { x: matches.length ? sx / matches.length : W / 2, y: matches.length ? sy / matches.length : this.boardCy() };

    const dispatchedSet = new Set(d.dispatchedBays);

    for (const g of d.delivered) {
      const view = this.bayViews[g.bay];
      if (!view) continue;
      if (dispatchedSet.has(g.bay)) view.pendingDispatch = true;
      // 상품 색에 맞는 수집 효과음(초록=야채/노랑=바나나/그외=박스), 베이별 1회.
      sfx(this.collectSfxFor(g.type), { volume: 0.5, pitch: pitchVar(0.04) });

      // 이 상품 매치들의 중심을 공통 출발점으로 → 모든 상품이 한 경로를 줄지어 따라간다.
      const startP = this.centroidOf(srcByType.get(g.type) ?? []) ?? fallback;
      const curve = this.deliveryCurve(startP, view.slotPos);
      const key = this.iconKeyForProduct(g.type);
      for (let i = 0; i < g.count; i++) this.spawnDeliveryFly(curve, key, i, g.bay);
    }
  }

  /** 상품 평균색으로 수집 효과음 선택(초록→야채, 노랑→바나나, 그외→박스). */
  private collectSfxFor(type: number): Sfx {
    const c = ITEM_RGB[type - 1];
    if (!c) return 'collect_box';
    const [r, g, b] = c;
    if (g > r && g > b + 20 && g > 110) return 'collect_veggie';
    if (r > 150 && g > 140 && b < 130) return 'collect_banana';
    return 'collect_box';
  }

  private centroidOf(coords: ReadonlyArray<Coord>): Pos | null {
    if (!coords.length) return null;
    let x = 0;
    let y = 0;
    for (const c of coords) {
      const p = this.cellPos(c.col, c.row);
      x += p.x;
      y += p.y;
    }
    return { x: x / coords.length, y: y / coords.length };
  }

  /** 출발→트럭 슬롯으로 위로 솟는 완만한 아치(스트림이 줄지어 따라가는 공통 경로). */
  private deliveryCurve(from: Pos, to: Pos): Phaser.Curves.QuadraticBezier {
    const lift = 80 + Math.abs(to.x - from.x) * 0.12;
    return new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(from.x, from.y),
      new Phaser.Math.Vector2((from.x + to.x) / 2, Math.min(from.y, to.y) - lift),
      new Phaser.Math.Vector2(to.x, to.y),
    );
  }

  /**
   * 상품 한 개가 공통 경로를 따라 **가속하며(easeIn)** 트럭으로 이동. index*STAGGER 만큼 늦게 출발해
   * 앞 상품을 줄지어 따라간다. 도착 시 카운트 1 증가(한꺼번에 점프 X).
   */
  private spawnDeliveryFly(curve: Phaser.Curves.QuadraticBezier, key: string, index: number, bay: number): void {
    const p0 = curve.getStartPoint();
    const fly = this.add.image(p0.x, p0.y, key).setDepth(130);
    this.fitItem(fly, 42); // 비율 유지(정사각 강제 금지)
    const baseScale = fly.scale;
    const prog = { t: 0 };
    const pt = new Phaser.Math.Vector2();
    this.tweens.add({
      targets: prog,
      t: 1,
      duration: FLY_DUR,
      delay: index * FLY_STAGGER,
      ease: 'Quart.easeIn', // 가속도: 천천히 출발 → 트럭으로 빨려들 듯 가속
      onUpdate: () => {
        curve.getPoint(prog.t, pt);
        fly.setPosition(pt.x, pt.y);
        fly.setScale(baseScale * (1 - 0.5 * prog.t));
      },
      onComplete: () => {
        fly.destroy();
        this.onDeliveryArrive(bay);
      },
    });
  }

  /** fly 한 개 도착 — 카운트 1 증가. 가득 차면 초록 + (대기 중이면) 트럭 출발. */
  private onDeliveryArrive(bay: number): void {
    const view = this.bayViews[bay];
    if (!view || !view.count || !view.count.active) return;
    view.shownLoaded = Math.min(view.shownLoaded + 1, view.required);
    view.count.setText(`${view.shownLoaded}/${view.required}`);
    // 카운터 증가 핑(낮게, 적재 진행도 표시).
    sfx('order_ping', { volume: 0.22, pitch: 0.9 + (view.shownLoaded / Math.max(1, view.required)) * 0.5 });
    if (view.shownLoaded >= view.required) {
      view.count.setColor('#2f9e44');
      if (view.pendingDispatch) {
        view.pendingDispatch = false;
        this.dispatchBay(bay, 'filled');
      }
    }
  }

  private iconKeyForProduct(productType: number): string {
    const p = productById(productType);
    return this.textures.exists(p.texKey) ? p.texKey : TILE_KEY;
  }

  /** 배송 성공 보상 — 빠를수록(남은시간↑) 코인↑. 코인 카운터 증가 + 트럭에서 코인 낙하 연출. */
  private awardDispatchCoins(view: BayView, speedFrac: number): void {
    const reward = Math.round(10 + 80 * speedFrac + view.required * 0.5);
    this.profile = applyReward(this.profile, { coins: reward });
    saveProfile(this.profile);
    if (this.coinsText) {
      this.coinsText.setText(this.fmtCoins());
      this.tweens.add({ targets: this.coinsText, scale: 1.2, duration: 120, yoyo: true });
    }
    sfx('coin', { volume: 0.7 });
    this.spawnCoinDrop(view, reward);
  }

  /** 라인 길이 보너스 코인(배수에 비례). HUD 팝. */
  private awardLineBonus(mult: number): void {
    const bonus = Math.round(8 * mult);
    this.profile = applyReward(this.profile, { coins: bonus });
    saveProfile(this.profile);
    if (this.coinsText) {
      this.coinsText.setText(this.fmtCoins());
      this.tweens.add({ targets: this.coinsText, scale: 1.22, duration: 110, yoyo: true });
    }
  }

  /** 시계 아이콘 텍스처(흰 면+초록 링+눈금+바늘)를 1회 런타임 생성 — 날아가는 시간 보너스용. */
  private ensureClockIconTexture(): void {
    if (this.textures.exists(CLOCK_ICON_KEY)) return;
    const s = 56;
    const cx = s / 2;
    const cy = s / 2;
    const r = s / 2 - 4;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.18);
    g.fillCircle(cx, cy + 2, r + 2); // 그림자
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx, cy, r); // 면
    g.lineStyle(4, 0x37e07a, 1);
    g.strokeCircle(cx, cy, r); // 초록 링
    g.lineStyle(2, 0x9aa0a6, 0.9); // 12눈금
    for (let i = 0; i < 12; i++) {
      const a = Phaser.Math.DegToRad(i * 30 - 90);
      g.lineBetween(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3), cx + Math.cos(a) * (r - 7), cy + Math.sin(a) * (r - 7));
    }
    g.lineStyle(3, 0x2f9e44, 1); // 바늘
    g.lineBetween(cx, cy, cx, cy - r * 0.55);
    g.lineBetween(cx, cy, cx + r * 0.5, cy + r * 0.18);
    g.fillStyle(0x2f9e44, 1);
    g.fillCircle(cx, cy, 3);
    g.generateTexture(CLOCK_ICON_KEY, s, s);
    g.destroy();
  }

  /**
   * 시간 보너스 연출 — **매치 위치에서 시계 아이템이 나타나** 해당 트럭의 시계로 **아치를 그리며 날아가고**,
   * 도착하는 순간 실제 시간이 가산된다(addTruckTime). 비행 중엔 회전 + 살짝 커졌다 작아짐.
   */
  private flyTimeBonus(from: Pos, bay: number, mult: number): void {
    const view = this.bayViews[bay];
    if (!view || !view.timerActive) return;
    this.ensureClockIconTexture();
    const to: Pos = { x: view.clockX, y: view.clockY };
    const curve = this.deliveryCurve(from, to);
    const icon = this.add.image(from.x, from.y, CLOCK_ICON_KEY).setDepth(179).setScale(0.45);
    sfx('order_ping', { volume: 0.35, pitch: 1.1 }); // 출발 신호
    this.tweens.add({ targets: icon, scale: 0.9, duration: 160, ease: 'Back.easeOut' }); // 등장 팝
    const t = { v: 0 };
    this.tweens.add({
      targets: t,
      v: 1,
      duration: 560,
      delay: 130,
      ease: 'Quad.easeIn', // 가속하며 시계로
      onUpdate: () => {
        const pt = curve.getPoint(t.v);
        icon.setPosition(pt.x, pt.y);
        icon.setAngle(t.v * 360); // 회전
        icon.setScale(0.9 - 0.35 * t.v); // 도착할수록 작게
      },
      onComplete: () => {
        icon.destroy();
        this.addTruckTime(bay, mult); // 도착 순간 실제 시간 가산 + "+N초" 팝 + 시계 갱신
      },
    });
  }

  /**
   * 라인 배수 보상 ② — 해당 배송 트럭(배송퍼즐)의 제한시간 증가.
   * **×2 → +20초, ×4 → +40초, ×8 → +80초**(= 10초 × 배수). 시계/디지털 즉시 반영 + "+N초" 팝.
   * (보통 flyTimeBonus 의 시계 아이템이 도착하는 순간 호출된다.)
   */
  private addTruckTime(bay: number, mult: number): void {
    const view = this.bayViews[bay];
    if (!view || !view.timerActive) return;
    const bonusMs = 10000 * mult; // 10초 × 배수
    view.timeLeftMs += bonusMs;
    // 다시 여유가 생기면 위급 경고 상태 해제 + 점멸 알파 원복.
    if (view.timeLeftMs > LOW_TIME_MS) {
      view.warned = false;
      view.panel?.setAlpha(1);
      view.icon?.setAlpha(1);
      view.count?.setAlpha(1);
    }
    this.drawClock(view); // 잔량 파이/초침/디지털 즉시 갱신
    this.spawnTimeBonus(view, bonusMs);
  }

  /** 시간 보너스 연출 — 시계 위로 떠오르는 초록 "+N초" 팝(시간 증가 강조). */
  private spawnTimeBonus(view: BayView, bonusMs: number): void {
    const secs = Math.round(bonusMs / 1000);
    const x = view.clockX;
    const y = view.clockY - 6;
    sfx('order_ping', { volume: 0.4, pitch: 1.25 });
    const label = this.mkText(x, y, `+${secs}초`, {
      fontFamily: '"Do Hyeon", "Jua", sans-serif',
      fontSize: '26px',
      color: '#37e07a',
      fontStyle: '700',
    })
      .setOrigin(0.5)
      .setStroke('#0b5132', 6)
      .setDepth(180)
      .setScale(0.3);
    this.tweens.add({
      targets: label,
      scale: 1.1,
      duration: 200,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: label,
          y: y - 48,
          alpha: 0,
          duration: 640,
          ease: 'Quad.easeIn',
          onComplete: () => label.destroy(),
        });
      },
    });
  }

  /** 큰 라인(4+) **화려한 ×N 연출** — 팝되는 금색 ×N + 사방 스파클 버스트 + 콤보음. */
  private spawnLineMultiplier(pos: Pos, mult: number): void {
    const fs = Math.min(72, 34 + mult * 5);
    const label = this.mkText(pos.x, pos.y, `×${mult}`, {
      fontFamily: '"Do Hyeon", "Jua", sans-serif',
      fontSize: `${fs}px`,
      color: '#ffe24a',
      fontStyle: '700',
    })
      .setOrigin(0.5)
      .setStroke('#b5470b', 9)
      .setDepth(175)
      .setScale(0.2)
      .setAngle(-12);
    this.tweens.add({
      targets: label,
      scale: 1.18,
      angle: 0,
      duration: 280,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: label,
          y: pos.y - 80,
          alpha: 0,
          scale: 1.34,
          duration: 720,
          ease: 'Quad.easeIn',
          onComplete: () => label.destroy(),
        });
      },
    });

    // 사방 스파클(코인) 버스트 — 배수 클수록 많이/멀리.
    const n = Math.min(18, 6 + mult);
    const hasArt = this.textures.exists(COIN_KEY);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + this.rng() * 0.6;
      const dist = 55 + this.rng() * (60 + mult * 6);
      const sp = this.add.image(pos.x, pos.y, hasArt ? COIN_KEY : TILE_KEY).setDisplaySize(24, 24).setDepth(172);
      this.tweens.add({
        targets: sp,
        x: pos.x + Math.cos(ang) * dist,
        y: pos.y + Math.sin(ang) * dist,
        alpha: 0,
        scale: 0.3,
        angle: 220,
        duration: 460 + this.rng() * 220,
        ease: 'Quad.easeOut',
        onComplete: () => sp.destroy(),
      });
    }
    sfx('combo', { volume: 0.85, pitch: Math.min(1.8, 1 + Math.log2(mult) * 0.14) });
  }

  /** 트럭 위치에서 코인이 톡 튀어 아래로 떨어지며 사라진다 + "+N" 플로팅. */
  private spawnCoinDrop(view: BayView, reward: number): void {
    const x = view.truck ? view.truck.x : view.homeX;
    const y = view.truckRestY;
    const plus = this.mkText(x, y - 20, `+${reward}`, { fontFamily: '"Do Hyeon", "Jua", sans-serif', fontSize: '26px', color: '#ffd54a', fontStyle: '700' })
      .setOrigin(0.5)
      .setStroke('#7a5a00', 5)
      .setDepth(160);
    this.tweens.add({ targets: plus, y: y - 84, alpha: 0, duration: 1000, ease: 'Quad.easeOut', onComplete: () => plus.destroy() });

    const n = Phaser.Math.Clamp(Math.round(reward / 12), 4, 10);
    const hasArt = this.textures.exists(COIN_KEY);
    for (let i = 0; i < n; i++) {
      const coin = this.add.image(x, y - 10, hasArt ? COIN_KEY : TILE_KEY).setDisplaySize(28, 28).setDepth(155);
      const dx = (this.rng() - 0.5) * 130;
      const upY = y - (40 + this.rng() * 55);
      this.tweens.add({
        targets: coin,
        x: x + dx,
        y: upY,
        duration: 220 + this.rng() * 120,
        ease: 'Quad.easeOut',
        delay: i * 28,
        onComplete: () => {
          this.tweens.add({
            targets: coin,
            y: y + 240,
            alpha: 0,
            angle: coin.angle + 200,
            duration: 540,
            ease: 'Quad.easeIn',
            onComplete: () => coin.destroy(),
          });
        },
      });
    }
  }

  /** 도로 이동 중 트럭 투명도 — 위(FADE_TOP)=불투명, 아래(FADE_BOTTOM)=투명, 그 사이 선형. */
  private truckAlphaForY(y: number): number {
    return Phaser.Math.Clamp((TRUCK_FADE_BOTTOM - y) / (TRUCK_FADE_BOTTOM - TRUCK_FADE_TOP), 0, 1);
  }

  /**
   * 상차 완료 트럭 출발 → **앞모습 그대로 도로를 따라 화면 아래로** 빠져나간다(보드 밑으로 지나가며
   * 아래로 갈수록 투명). 그 뒤 빈 베이가 생기면 다음 트럭이 **뒷모습으로 화면 아래에서 나타나
   * 보드 밑을 지나 위로(멀어지며) 올라와** 정차하고, 정차 순간 앞모습 도크 트럭으로 교체된다.
   * 도로 이동물은 모두 보드(퍼즐) 밑(depth=TRUCK_TRAVEL_DEPTH) + Y기반 투명도 그라데이션.
   * reason='filled'(시간 내 성공, 진행도 집계됨) / 'timeout'(시간초과 자동출발, 집계 안 됨).
   */
  private dispatchBay(bay: number, reason: 'filled' | 'timeout'): void {
    const view = this.bayViews[bay];
    if (!view) return;

    const filled = reason === 'filled';
    // 점수/코인 = 얼마나 빨리 채웠는가(남은시간 비율↑ = 코인↑). detach 전에 비율 캡처.
    const speedFrac = Phaser.Math.Clamp(view.timeLeftMs / Math.max(1, view.timeLimitMs), 0, 1);

    // 효과음: 성공=주문완료 팡파레, 시간초과=실패 버저. 둘 다 출발음.
    sfx(filled ? 'order_complete' : 'fail', { volume: filled ? 0.8 : 0.6 });
    sfx('truck_depart', { volume: 0.6 });

    // 출발 → 캐릭터 제거 + 타이머 정지 + 시계 숨김(차량이 떠나므로).
    this.detachTruckExtras(view);

    this.progressText?.setText(this.fmtProgress());

    // 시간 내 성공 → 코인 보상(빠를수록 많이) + 트럭에서 코인이 떨어진다.
    if (filled) this.awardDispatchCoins(view, speedFrac);

    const stamp = this.mkText(view.homeX, view.iconY - 30, filled ? '출발! 🚚' : '시간초과! ⏰', {
        fontFamily: '"Do Hyeon", "Jua", sans-serif',
        fontSize: '22px',
        color: filled ? '#2f9e44' : '#e03131',
      })
      .setOrigin(0.5)
      .setDepth(140);
    this.tweens.add({ targets: stamp, y: stamp.y - 26, alpha: 0, duration: 900, onComplete: () => stamp.destroy() });

    // 현재 오더 아이콘/카운트 페이드아웃(트럭이 떠나는 동안).
    const oldIcon = view.icon;
    const oldCount = view.count;
    view.icon = undefined;
    view.count = undefined;
    if (oldIcon) this.tweens.add({ targets: oldIcon, alpha: 0, y: view.iconY - 14, duration: 240, onComplete: () => oldIcon.destroy() });
    if (oldCount) this.tweens.add({ targets: oldCount, alpha: 0, duration: 220, onComplete: () => oldCount.destroy() });

    const truck = view.truck;
    const restY = view.truckRestY;
    const restDepth = truck ? truck.depth : 0;

    // 다음 트럭(뒷모습)이 아래에서 올라와 정차 → 앞모습 도크 트럭으로 교체.
    const enter = (): void => {
      this.refillQueue(); // 무한 공급 — 항상 다음 트럭이 진입.
      this.state = deployNext(this.state, bay).state;
      this.ensureBayDistinct(bay); // 다른 정차 베이와 다른 상품으로(중복 방지)
      const newTruck = this.state.bays[bay]; // 교체 반영본 재조회
      this.renderBayOrder(view, newTruck); // 오더 아이콘/카운트 생성 + 앞 트럭 visible
      if (!newTruck || !truck) {
        truck?.setVisible(false).setDepth(restDepth); // (이론상) 공급 소진 → 빈 베이
        return;
      }
      // 앞 트럭과 오더는 뒷모습 트럭이 도착할 때까지 숨긴다.
      truck.setVisible(false);
      const ic = view.icon;
      const ct = view.count;
      ic?.setAlpha(0);
      ct?.setAlpha(0);

      const rearKey = BAY_REAR_TEX[bay];
      const showFront = (): void => {
        truck.setVisible(true).setAlpha(1).setY(restY).setDepth(restDepth);
        if (ic) this.tweens.add({ targets: ic, alpha: 1, duration: 220 });
        if (ct) this.tweens.add({ targets: ct, alpha: 1, duration: 220 });
        sfx('truck_ready', { volume: 0.45 }); // 새 트럭 정차 신호
        // 새 트럭 정차 → 새 캐릭터(남/여 교대) + 제한시간 시계 시작.
        this.attachTruckExtras(view, newTruck);
      };

      if (rearKey && this.textures.exists(rearKey)) {
        // 뒷모습 트럭: 아래(큼·가까움)에서 위(작아지며 멀어짐)로, 보드 밑 + Y 투명도.
        // 크기는 앞모습 도크 트럭 표시크기에서 파생(디자인 폭 변경에 따라감) — 진입 시 1.35배(가까움).
        const fw = truck.displayWidth || 215;
        const fh = truck.displayHeight || 244;
        const rear = this.add.image(truck.x, TRUCK_ENTER_Y, rearKey).setDepth(TRUCK_TRAVEL_DEPTH);
        rear.setDisplaySize(fw * 1.35, fh * 1.35);
        rear.setAlpha(this.truckAlphaForY(TRUCK_ENTER_Y));
        const sx = rear.scaleX;
        const sy = rear.scaleY;
        this.tweens.add({
          targets: rear,
          y: restY,
          scaleX: sx * 0.6,
          scaleY: sy * 0.6,
          duration: 580,
          ease: 'Sine.easeOut',
          onUpdate: () => rear.setAlpha(this.truckAlphaForY(rear.y)),
          onComplete: () => {
            // 차고 도착 후 ~0.5초 머물렀다가(뒷모습) 정면 트럭으로 교체.
            this.time.delayedCall(500, () => {
              rear.destroy();
              showFront();
            });
          },
        });
      } else {
        // 폴백: 뒷모습 아트 없으면 앞 트럭을 아래에서 위로(투명도 그라데이션).
        truck.setVisible(true).setDepth(TRUCK_TRAVEL_DEPTH).setY(TRUCK_ENTER_Y).setAlpha(0);
        this.tweens.add({
          targets: truck,
          y: restY,
          duration: 560,
          ease: 'Sine.easeOut',
          onUpdate: () => truck.setAlpha(this.truckAlphaForY(truck.y)),
          onComplete: () => {
            truck.setDepth(restDepth).setAlpha(1);
            if (ic) this.tweens.add({ targets: ic, alpha: 1, duration: 220 });
            if (ct) this.tweens.add({ targets: ct, alpha: 1, duration: 220 });
            this.attachTruckExtras(view, newTruck);
          },
        });
      }
    };

    if (truck) {
      // 출발(앞모습): 보드 밑으로 도로를 따라 아래로 가속 + 아래로 갈수록 투명.
      truck.setDepth(TRUCK_TRAVEL_DEPTH);
      this.tweens.add({
        targets: truck,
        y: TRUCK_EXIT_Y,
        duration: 640,
        ease: 'Quad.easeIn',
        onUpdate: () => truck.setAlpha(this.truckAlphaForY(truck.y)),
        onComplete: enter,
      });
    } else {
      enter();
    }
  }

  // ─── 파워업 ───
  // 렌더된 버튼 오브젝트의 실제 위치/표시크기를 읽어 히트영역·카운트 뱃지를 올린다(FIT 1:1 재현).
  private setupPowerBar(): void {
    for (const pw of POWER_NODES) {
      const btn = this.layout.tryById<Phaser.GameObjects.Image>(pw.id);
      const node = this.layout.nodeById(pw.id);
      if (!btn || !node) continue;
      const x = btn.x;
      const y = btn.y;
      const w = btn.displayWidth || node.w || 160;
      const h = btn.displayHeight || node.h || 85;
      const btnBase = btn.scale; // 클릭 유동 복원용(텍스트는 버튼 이미지에 포함)
      this.add
        .rectangle(x, y, w, h, 0x000000, 0.001)
        .setDepth(110)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.pulseScale(btn, btnBase, 1.12, 150); // 버튼(이미지+베이크된 텍스트) 클릭 유동
          this.usePower(pw.kind);
        });

      // 남은 사용 횟수 뱃지 — 버튼 우상단.
      const bx = x + w * 0.34;
      const by = y - h * 0.36;
      const badge = this.add.graphics().setDepth(111);
      badge.fillStyle(0xffffff, 1);
      badge.fillCircle(bx, by, 15);
      badge.lineStyle(2, 0x5b3a86, 1);
      badge.strokeCircle(bx, by, 15);
      this.powerCountTexts[pw.kind] = this.mkText(bx, by, String(this.powerCounts[pw.kind]), { fontFamily: '"Jua", sans-serif', fontSize: '20px', color: '#5b3a86' })
        .setOrigin(0.5)
        .setDepth(112);
    }
  }

  private usePower(kind: PowerKind): void {
    startAudio(); // 버튼 탭(제스처)에서 오디오 resume
    if (this.busy || this.finished || this.powerCounts[kind] <= 0) return;

    if (kind === 'shuffle') {
      this.doReshuffle('shuffle');
    } else if (kind === 'rearrange') {
      this.doReshuffle('repack');
    } else if (kind === 'forklift') {
      const sw = findLegalSwap(this.state.board);
      if (!sw) return;
      sfx('forklift', { volume: 0.7 });
      this.attemptSwap(sw.a, sw.c);
    } else {
      const sw = findLegalSwap(this.state.board);
      if (!sw) return;
      sfx('help', { volume: 0.7 });
      for (const c of [sw.a, sw.c]) {
        const img = this.tiles.get(cellKey(c.col, c.row));
        if (img) this.tweens.add({ targets: img, scale: img.scale * 1.25, duration: 200, yoyo: true, repeat: 2 });
      }
    }

    this.powerCounts[kind] -= 1;
    this.powerCountTexts[kind]?.setText(String(this.powerCounts[kind]));
  }

  // ─── 레벨 클리어 ───
  private levelClear(): void {
    if (this.finished) return;
    this.finished = true;
    sfx('level_up', { volume: 0.9 });
    const cleared = this.state.level;
    const reward = 40 + cleared * 10;

    this.profile = applyReward(this.profile, { coins: reward });
    this.profile = recordResult(this.profile, cleared, reward, true);
    saveProfile(this.profile);
    this.coinsText?.setText(this.fmtCoins());

    const vh = this.scale.height;
    this.add.rectangle(W / 2, vh / 2, W, vh, 0x000000, 0.55).setDepth(200);
    this.mkText(W / 2, vh / 2 - 60, '레벨 클리어! 🎉', { fontFamily: '"Do Hyeon", "Jua", sans-serif', fontSize: '52px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(201);
    this.mkText(W / 2, vh / 2 + 30, `+${reward} 🪙`, { fontFamily: '"Jua", sans-serif', fontSize: '40px', color: '#ffe48a' })
      .setOrigin(0.5)
      .setDepth(201);

    this.time.delayedCall(1500, () => this.scene.restart());
  }
}
