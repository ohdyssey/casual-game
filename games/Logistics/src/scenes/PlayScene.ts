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
import { isAdGateTurn, playGateAd } from '@casual/core';
import { getStore } from '@casual/core/store/index.js';
import { loadProfile, saveProfile, applyReward, recordResult, haptics, startCountdown, type Profile } from '@casual/core';
import { createGame, deliver, deployNext, isLevelComplete, isLevelFailed, type DeliverResult } from '../logic/board.js';
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
import { makeLevel, truckTimeLimitMs } from '../logic/levels.js';
import { makeRng } from '../logic/rng.js';
import type { Coord, GameState, CollapseMove, Rng, TruckState } from '../logic/types.js';
import { makeProductIcon, productById, UI_LAYOUT_KEY, TILE_KEY, COIN_KEY, POPUP_CLEAR_TEX, POPUP_FAIL_TEX, BTN_OK_TEX, DELIVERY_DONE_TEX, DELIVERY_FAIL_TEX } from '../assets.js';
import { buildLayout, textResolution, type LayoutDoc, type LayoutIndex } from '../ui/layoutLoader.js';
import { sfx, startAudio, pitchVar, type Sfx } from '../audio.js';
import { ITEM_RGB } from '../logic/itemColors.js';

const W = 1080; // 세로 HD 디자인 폭(에디터 1080×2400)
const H = 2400; // 세로 HD 디자인 높이
type Pos = { x: number; y: number };
const TEXT_RES = textResolution(); // 또렷한 글자(고DPI FIT 확대 대비)

// ── 에디터 노드 앵커 (main.json = 디자이너 재디자인 플레이 화면) ──
// **핵심 원칙: 에디터 노드의 좌표·폰트를 그대로 사용**(레벨/코인/타이머/갯수 텍스트는 에디터 텍스트 객체를
// 재사용해 위치·폰트·크기·색을 100% 일치시킨다. 아이템/갯수는 4베이 각각의 노드에 정확 매핑).
const LEVEL_TIMER_ID = 'layer_3_copy'; // 중앙 상단 패널 안 **글로벌 레벨 타이머**("04:00", Luckiest Guy)
const PROGRESS_PANEL_ID = 'layer_2_copy14'; // 중앙 상단 진행도 패널(UI_03) — 진행바를 이 패널 하단에 그림
const COINS_PANEL_ID = 'layer_13_copy7'; // 우상단 코인바 값 텍스트("36,708", Luckiest Guy)
const SLOT_TEX = 'up_Logistics_UI_19-1'; // 셀 배경 아트(신규 — 디자이너 보드 셀 UI_19-1)
const BOARD_PANEL_ID = 'layer_3'; // 디자이너 보드 패널 아트(UI_20-1) — 그리드를 **이 패널 안쪽**에 배치
const BOARD_PANEL_INSET = 0.025; // 패널 테두리 여백(작게 — 그리드가 패널을 꽉 채우게)

// 도크 4베이(좌→우: 청·녹·오렌지·보라) — 트럭 / 오더 아이템 / 갯수 / 타이머, 각 요소는 **자기 에디터 노드** 위치.
const BAY_TRUCK_IDS = ['layer_2', 'layer_2_copy2', 'layer_2_copy3', 'layer_2_copy4'];
const BAY_ITEM_IDS = ['layer_2_copy', 'layer_2_copy8', 'layer_2_copy9', 'layer_2_copy10']; // 오더 아이템(102² 자리)
const BAY_COUNT_IDS = ['layer_10_copy4', 'layer_10_copy5', 'layer_10_copy6', 'layer_10_copy7']; // 갯수("02 / 15", Bungee)
const BAY_TIME_IDS = ['layer_10', 'layer_10_copy', 'layer_10_copy2', 'layer_10_copy3']; // 타이머("01:30", Luckiest Guy) — 재사용

// 배송 성공/실패 배너 **배치·크기 템플릿**(디자이너가 에디터에 배치 — 위치 Y·크기 SSOT).
// 샘플은 특정 베이에 하나씩(안 씀·숨김), 코드가 이 노드의 Y·w·h·key 를 읽어 닫히는 베이마다 배너를 그린다.
const DELIVERY_DONE_NODE = 'layer_12'; // 배송완료 배너(UI_48-1_v2) 템플릿
const DELIVERY_FAIL_NODE = 'layer_12_copy'; // 배송거부 배너(UI_48-2_v2) 템플릿

// 숨길 노드(디자인 샘플/플레이스홀더 → 런타임 동적 요소로 대체):
// 4베이 오더 아이템 샘플(실제 상품 아이콘으로), 보드 샘플 셀 + 샘플 아이템(실제 셀/타일로).
// 레벨/코인/타이머/갯수 **텍스트 노드는 숨기지 않고 그대로 재사용**(setText 로 값만 갱신 → 폰트/좌표 정확).
const HIDE_IDS = [
  'layer_2_copy', // 베이0 오더 아이템 샘플
  'layer_2_copy8', // 베이1
  'layer_2_copy9', // 베이2
  'layer_2_copy10', // 베이3
  'layer_10_copy4', // 베이0 갯수 샘플("02 / 15") — 폰트만 읽어 실시간 갯수로 대체
  'layer_10_copy5', // 베이1
  'layer_10_copy6', // 베이2
  'layer_10_copy7', // 베이3
  'layer_2_copy62', // 보드 아이템 샘플 → 실제 타일
  'layer_2_copy54', // 보드 셀 샘플 → 실제 셀 배경
  'layer_2_copy15', // 진행도 박스 아이콘(UI_13) → 완성/전체 카운트 텍스트로 대체
  DELIVERY_DONE_NODE, // 배송완료 배너 샘플(템플릿만 사용 → 숨김, 베이별 코드로 그림)
  DELIVERY_FAIL_NODE, // 배송거부 배너 샘플
];

// 오더 아이콘 폴백 크기(아이템 노드를 못 찾을 때). 실제론 노드 w 를 사용.
const ORDER_ICON = 102;

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
// 캐릭터(차량 앞 직원) 노드 — 신규 디자인(main.json)엔 없어 캐릭터 생략(빈 문자열 = 없음).
const CHAR_NODE_ID = ''; // 에디터에 캐릭터 노드가 추가되면 그 id 로 지정 → 자동으로 다시 그림
const CHAR_DEPTH = 60; // 트럭 위, 보드 타일(90) 아래
// 노드 못 찾을 때 폴백(트럭 중심 기준 x오프셋·절대 y·표시 높이).
const CHAR_FALLBACK = { offX: -83, y: 755, h: 204 };

// ── 상단 제한시간: **디지털 시간(MM:SS)만** — 에디터 타이머 텍스트 노드를 그대로 재사용(아날로그 시계 아이콘 없음). ──
const CLOCK_ICON_KEY = 'logi_clock_icon'; // 시간 보너스 시 매치→트럭 타이머로 날아가는 시계 아이콘(런타임 생성 텍스처, 연출용)
// 제한시간 6초 이하 → 배송표시 패널 점멸(배송시간 30~60s 스케일에 맞춘 막판 경고).
const LOW_TIME_MS = 6000;
const DEFAULT_TIME_LIMIT_MS = 30000;
// 유휴 10초 → 매칭 가능한 아이템 깜박임 힌트.
const HINT_IDLE_MS = 10000;

type PowerKind = 'shuffle' | 'forklift' | 'rearrange' | 'hint';
const POWER_NODES: ReadonlyArray<{ kind: PowerKind; id: string }> = [
  { kind: 'shuffle', id: 'layer_2_copy18' }, // Shuffle (UI_32-1)
  { kind: 'forklift', id: 'layer_2_copy5' }, // Forklift (UI_33-1)
  { kind: 'rearrange', id: 'layer_2_copy6' }, // Repack (UI_34-1)
  { kind: 'hint', id: 'layer_2_copy7' }, // Help (UI_35-1)
];

// 배송 fly — 매치 상품이 공통 경로를 따라 줄지어(stagger) 트럭으로 가속 이동. (SocialCasino 급 스냅감)
const FLY_DUR = 240;
const FLY_STAGGER = 36;

/** 한 베이의 렌더 상태(트럭 아트 + 오더 아이콘/카운트). */
interface BayView {
  bay: number;
  /** 베이 중심 x(= 트럭 노드 x) — 코인 드랍/출발 스탬프 기준. */
  homeX: number;
  /** 오더 아이템 아이콘 위치/크기 = 에디터 아이템 노드(BAY_ITEM_IDS[b]). */
  iconX: number;
  iconY: number;
  iconSize: number;
  /** 적재 카운트 위치 = 에디터 갯수 노드(BAY_COUNT_IDS[b], "02 / 15"). */
  countX: number;
  countY: number;
  truckRestY: number;
  truck?: Phaser.GameObjects.Image;
  /** 배송표시 패널(구 디자인) — 신규 디자인엔 없음(항상 undefined). */
  panel?: Phaser.GameObjects.GameObject & { setAlpha(a: number): unknown };
  icon?: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
  count?: Phaser.GameObjects.Text;
  /** 차량 앞 직원 캐릭터(출발 시 사라짐). */
  char?: Phaser.GameObjects.Image;
  /** 제한시간 디지털 시간(MM:SS) — **에디터 타이머 텍스트 노드 재사용**(아날로그 시계 없음). */
  timeText?: Phaser.GameObjects.Text;
  /** 시간 보너스 연출(flyTimeBonus) 목표 = 타이머 텍스트 위치. */
  clockX: number;
  clockY: number;
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
  /** **닫힌 레인** — 배송완료(대기 트럭 소진) 또는 배송거부(시간초과)되어 새 트럭이 오지 않는 베이. */
  rejected?: boolean;
  rejectedLabel?: Phaser.GameObjects.Text;
  /** 닫힘 배너 이미지(UI_48-1 배송완료 / UI_48-2 배송거부) — 텍스트 스탬프 대체. */
  rejectedIcon?: Phaser.GameObjects.Image;
}

export class PlayScene extends Phaser.Scene {
  private profile!: Profile;
  private rng!: Rng;
  private state!: GameState;
  private layout!: LayoutIndex;
  private busy = false;
  private finished = false;
  /** 3·2·1 시작 카운트다운 완료 여부 — 완료 전엔 트럭 제한시간이 흐르지 않는다. */
  private introDone = false;

  // 보드 기하/타일
  private cellCenters = new Map<string, Pos>();
  private tiles = new Map<string, Phaser.GameObjects.Image>();
  private cellBgs: Phaser.GameObjects.GameObject[] = [];
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
  /** 글로벌 레벨 타이머(타임어택) — 중앙 UI_03 패널의 "04:00" 노드 재사용 + 남은시간(ms). */
  private levelTimerText?: Phaser.GameObjects.Text;
  private levelTimeLeftMs = 240000;
  private levelTimeTotalMs = 240000;
  private levelTimerBaseColor = '#ffffff';
  /** 목표 진행바(dispatched/goal) — UI_03 패널 하단에 그림. */
  private progressBar?: Phaser.GameObjects.Graphics;
  private progressGeom = { x: 0, y: 0, w: 0, h: 0 };
  /** 목표 진행 텍스트(완성/전체 배송 = dispatched/goal) — 시간 하단 진행바 위에 표시. */
  private progressText?: Phaser.GameObjects.Text;
  /** 타이머 기본 글자색(에디터 타이머 노드 색 — 위급 시 빨강으로만 변경). */
  private timerBaseColor = '#ffffff';
  // 캐릭터 기준 기하(에디터 캐릭터 노드에서 산출) — 트럭 중심 기준 x오프셋 · 절대 y · 표시 높이.
  private charOffX = CHAR_FALLBACK.offX;
  private charY = CHAR_FALLBACK.y;
  private charH = CHAR_FALLBACK.h;
  /** 에디터에 캐릭터 노드가 있을 때만 차량 앞 직원을 그린다(신규 디자인엔 없어 생략). */
  private hasCharNode = false;

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
    // 무한 공급 폐지 — 각 차고는 대기열(goal 대)이 소진되면 '배송완료'로 닫힌다(무한 트럭 대기 안 함).
    // 동시 정차한 베이들은 서로 다른 상품을 주문하도록(같은 품목 중복 방지).
    for (let b = 0; b < this.state.bays.length; b++) this.ensureBayDistinct(b);

    const doc = this.cache.json.get(UI_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!doc) {
      this.mkText(W / 2, H / 2, '레이아웃 로드 실패', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '28px', color: '#fff' }).setOrigin(0.5);
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
    // ⚠️캔버스 밖에서 버튼을 떼면 'pointerup' 이 안 온다 → 드래그가 안 풀려 타일이 마우스에 붙어
    //   계속 따라다니는 버그(사용자 보고). 캔버스 밖 릴리즈도 동일하게 드래그 종료로 처리.
    this.input.on('pointerupoutside', this.onPointerUp, this);

    // 타임어택(트럭별 제한시간) — 3·2·1 카운트다운(코어 공용) 후 시간 개시.
    void startCountdown(this).then(() => {
      this.introDone = true;
    });
  }

  private nodePos(id: string): Pos | null {
    const n = this.layout.nodeById(id);
    return n ? { x: n.x, y: n.y } : null;
  }

  /** 또렷한 텍스트 생성(고DPI FIT 확대로 흐려지지 않게 setResolution). */
  private mkText(x: number, y: number, s: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
    return this.add.text(x, y, s, style).setResolution(TEXT_RES);
  }

  /**
   * 에디터 텍스트 노드의 **폰트/크기/색/외곽선을 그대로** 딴 텍스트를 지정 좌표에 생성(정확 폰트 재현).
   * layoutLoader.makeText 와 동일한 폰트 폴백 규칙(지정 폰트 → Jua → sans-serif).
   */
  private mkTextLikeNode(id: string, x: number, y: number, s: string): Phaser.GameObjects.Text {
    const n = this.layout.nodeById(id);
    const family = n?.fontFamily ? `"${n.fontFamily}", "Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif` : '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif';
    const t = this.mkText(x, y, s, {
      fontFamily: family,
      fontSize: `${n?.fontSize ?? 24}px`,
      color: n?.color ?? '#ffffff',
      align: 'center',
    }).setOrigin(0.5);
    if (n?.stroke && (n.strokeW ?? 0) > 0) t.setStroke(n.stroke, (n.strokeW ?? 0) * 2);
    return t;
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
  // 중앙 상단 UI_03 패널 = **글로벌 레벨 타이머(타임어택)** + 목표 진행바 · 우상단 = 코인.
  private setupHud(_level: number): void {
    // 글로벌 레벨 타이머 = 중앙 패널 "04:00" 텍스트 노드 재사용(위치·폰트 그대로) — 값만 갱신.
    this.levelTimeTotalMs = this.state.levelTimeMs ?? 240000;
    this.levelTimeLeftMs = this.levelTimeTotalMs;
    this.levelTimerText = this.layout.tryById<Phaser.GameObjects.Text>(LEVEL_TIMER_ID);
    this.levelTimerBaseColor = this.layout.nodeById(LEVEL_TIMER_ID)?.color ?? '#ffffff';
    this.refreshLevelTimer();
    // 코인 = 에디터 텍스트 노드 재사용.
    this.coinsText = this.layout.tryById<Phaser.GameObjects.Text>(COINS_PANEL_ID);
    this.coinsText?.setText(this.fmtCoins());
    // 목표 진행바 — UI_03 패널 하단 영역에 채움 그래픽.
    this.setupProgressBar();
    this.refreshProgress();
  }

  private fmtCoins(): string {
    return this.profile.coins.toLocaleString('en-US');
  }

  /** 글로벌 타임어택 남은시간 갱신(MM:SS) — 위급(≤30초) 시 빨강. */
  private refreshLevelTimer(): void {
    if (!this.levelTimerText) return;
    this.levelTimerText.setText(this.fmtTime(this.levelTimeLeftMs));
    this.levelTimerText.setColor(this.levelTimeLeftMs <= 30000 ? '#ff5a5a' : this.levelTimerBaseColor);
  }

  /** 목표 진행바 기하 = UI_03 패널 하단 영역에서 산출 + 그래픽 생성. */
  private setupProgressBar(): void {
    const p = this.layout.nodeById(PROGRESS_PANEL_ID);
    if (p?.w && p?.h) {
      const w = p.w * 0.78;
      const h = p.h * 0.3;
      this.progressGeom = { x: p.x - w / 2, y: p.y + p.h * 0.16 - h / 2, w, h };
    } else {
      this.progressGeom = { x: 428, y: 300, w: 224, h: 34 };
    }
    this.progressBar?.destroy();
    this.progressBar = this.add.graphics().setDepth(4); // 패널(3) 위, 타이머(6) 아래
    // **완성/전체 배송 수(시간 하단)** = 진행바 정중앙에 "🚚 dispatched / goal".
    const { x, y, w, h } = this.progressGeom;
    this.progressText = this.mkText(x + w / 2, y + h / 2, '', {
      fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
      fontSize: '25px',
      color: '#ffffff',
      fontStyle: '700',
    })
      .setOrigin(0.5)
      .setStroke('#2a1c0c', 5)
      .setDepth(7);
  }

  /** 진행바 채움(dispatched/goal) + 완성/전체 숫자 재그림. */
  private refreshProgress(): void {
    const g = this.progressBar;
    if (!g) return;
    const { x, y, w, h } = this.progressGeom;
    const frac = Phaser.Math.Clamp(this.state.goal > 0 ? this.state.dispatched / this.state.goal : 0, 0, 1);
    g.clear();
    if (frac > 0) {
      const fw = Math.max(h, w * frac); // 최소 폭 = 높이(라운드 캡)
      g.fillStyle(0x2f9e44, 0.95); // 초록 채움
      g.fillRoundedRect(x, y, fw, h, h / 2);
      g.fillStyle(0xffffff, 0.25); // 상단 하이라이트
      g.fillRoundedRect(x + 3, y + 3, Math.max(h - 6, fw - 6), h * 0.32, h * 0.16);
    }
    this.progressText?.setText(`🚚 ${this.state.dispatched} / ${this.state.goal}`);
  }

  /**
   * 보드가 차지할 도로 영역을 **레이아웃 노드에서 산출** — 도크(트럭 하단)와 하단 버튼 바(상단)
   * 사이를 보드 영역으로 삼는다(좌우는 작은 여백). 세로 HD 디자인이 바뀌어도 따라가도록 SSOT 파생.
   */
  private computeBoardArea(): { left: number; right: number; top: number; bottom: number } {
    // **디자이너 보드 패널(UI_20-1) 안쪽**에 그리드 배치(사용자 요청) — 패널 경계를 여백만큼 안으로.
    const panel = this.layout.nodeById(BOARD_PANEL_ID);
    if (panel?.w && panel?.h) {
      const insetX = panel.w * BOARD_PANEL_INSET;
      const insetY = panel.h * BOARD_PANEL_INSET;
      return {
        left: panel.x - panel.w / 2 + insetX,
        right: panel.x + panel.w / 2 - insetX,
        top: panel.y - panel.h / 2 + insetY,
        bottom: panel.y + panel.h / 2 - insetY,
      };
    }
    // 폴백: 트럭 하단 ~ 파워버튼 상단.
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
    this.tileDisp = cell * 0.96; // 상품 타일이 셀을 꽉 채우도록(비율 유지, 셀 간 최소 간격만 남김)

    const cx = (this.boardArea.left + this.boardArea.right) / 2;
    const cy = (this.boardArea.top + this.boardArea.bottom) / 2;
    const startX = cx - (cols * cell) / 2 + cell / 2;
    const startY = cy - (rows * cell) / 2 + cell / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.cellCenters.set(cellKey(c, r), { x: startX + c * cell, y: startY + r * cell });
      }
    }

    // 보드 패널 바탕 = **디자이너 에디터 노드(UI_20-1, layer_3)** 하나만 사용(코드 크림 패널 제거 — 이중 배치 방지).
    this.drawCellBackgrounds();
  }

  /** 각 셀 배경(에디터 슬롯 아트)을 산출 위치/크기로 배치. */
  private drawCellBackgrounds(): void {
    for (const o of this.cellBgs) o.destroy();
    this.cellBgs = [];
    const size = this.cellSize * 0.99; // 슬롯 아트가 셀을 거의 꽉 채우도록(그리드가 빽빽하게)
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
    // 캐릭터 기준 기하 = 에디터 캐릭터 노드에서 산출(있을 때만). 신규 디자인엔 노드가 없어 캐릭터 생략.
    const charNode = CHAR_NODE_ID ? this.layout.nodeById(CHAR_NODE_ID) : null;
    const truck0Node = this.layout.nodeById(BAY_TRUCK_IDS[0]);
    this.hasCharNode = !!charNode;
    if (charNode && truck0Node) {
      this.charOffX = charNode.x - truck0Node.x;
      this.charY = charNode.y;
      if (charNode.h) this.charH = charNode.h;
    }
    this.timerBaseColor = this.layout.nodeById(BAY_TIME_IDS[0])?.color ?? '#ffffff'; // 타이머 기본색(에디터 노드)
    const n = this.state.bays.length;
    for (let b = 0; b < n; b++) {
      const truck = this.layout.tryById<Phaser.GameObjects.Image>(BAY_TRUCK_IDS[b]);
      const truckNode = this.layout.nodeById(BAY_TRUCK_IDS[b]);
      const bayX = truckNode?.x ?? (truck ? truck.x : 222 + b * 209); // 트럭 중심 = 코인드랍 기준
      // **각 요소는 자기 에디터 노드 좌표를 그대로 사용**(아이템/갯수/타이머).
      const itemNode = this.layout.nodeById(BAY_ITEM_IDS[b]);
      const countNode = this.nodePos(BAY_COUNT_IDS[b]);
      const timeNode = this.nodePos(BAY_TIME_IDS[b]) ?? { x: bayX, y: 601 };
      const iconX = itemNode?.x ?? bayX;
      const iconY = itemNode?.y ?? 693;
      const iconSize = itemNode?.w ?? ORDER_ICON;
      const truckRestY = truck ? truck.y : 940;
      // 트럭 그림자(__shadow)는 트럭과 같은 depth 라 일부 베이에서 트럭을 덮어 어둡게 보였다
      // → 그림자를 트럭보다 한 단계 아래로 내려 항상 트럭이 또렷하게 보이도록 한다.
      const shadowNode = this.layout.tryById<Phaser.GameObjects.Image>(BAY_TRUCK_IDS[b] + '__shadow');
      if (truck && shadowNode) shadowNode.setDepth(truck.depth - 1);
      // 타이머 = **에디터 텍스트 노드를 그대로 재사용**(위치·폰트 정확) — setText 로 MM:SS 만 갱신.
      const timeText = this.layout.tryById<Phaser.GameObjects.Text>(BAY_TIME_IDS[b]);
      const view: BayView = {
        bay: b,
        homeX: bayX,
        iconX,
        iconY,
        iconSize,
        countX: countNode?.x ?? iconX,
        countY: countNode?.y ?? iconY + 61,
        panel: undefined,
        truckRestY,
        truck,
        timeText,
        clockX: timeNode.x,
        clockY: timeNode.y,
        timeLeftMs: 0,
        timeLimitMs: this.state.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS,
        timerActive: false,
        warned: false,
        slotPos: { x: iconX, y: iconY },
        shownLoaded: 0,
        required: 0,
      };
      this.bayViews[b] = view;
      const truckState = this.state.bays[b];
      this.renderBayOrder(view, truckState);
      if (truckState) this.attachTruckExtras(view, truckState);
    }
    // 남는 트럭 노드 숨김(베이 수가 디자인 도크보다 적을 때).
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
    // 캐릭터(차량 앞-좌). 의상색=차량색, serial 짝/홀로 남/여 교대. **크기/위치는 에디터 캐릭터 노드 기준**.
    // 신규 디자인(main.json)엔 캐릭터 노드가 없어 생략 — 에디터에 노드를 추가하면 자동으로 다시 그린다.
    view.char?.destroy();
    let key = this.charKeyFor(view.bay, serial);
    if (this.textures.exists(key + '_v2')) key = key + '_v2';
    const truckX = view.truck ? view.truck.x : view.homeX;
    if (this.hasCharNode && this.textures.exists(key)) {
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
    // 제한시간 — **트럭마다 다른 ~2분**(주문량+serial). 디지털 시간(에디터 타이머 노드) 시작.
    view.timeLimitMs = truckTimeLimitMs(truck.orders[0].required, serial, this.state.level);
    view.timeLeftMs = view.timeLimitMs;
    view.timerActive = true;
    view.warned = false; // 새 트럭 = 경고음 재무장
    view.timeText?.setVisible(true);
    this.refreshTimer(view);
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

  /** 트럭 출발 시 캐릭터 제거 + 타이머 정지 + 시간 숨김. */
  private detachTruckExtras(view: BayView): void {
    view.timerActive = false;
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
   * 디지털 제한시간(MM:SS) 갱신 — **에디터 타이머 텍스트 노드(재사용)의 값만 setText**.
   * 아날로그 시계 아이콘은 사용하지 않는다(요청). 위급(≤5초) 시 글자색만 빨강으로.
   */
  private refreshTimer(view: BayView): void {
    if (!view.timeText) return;
    const remainSec = Math.max(0, view.timeLeftMs) / 1000;
    view.timeText.setText(this.fmtTime(view.timeLeftMs));
    view.timeText.setColor(remainSec <= 5 ? '#ff5a5a' : this.timerBaseColor);
  }

  /** 매 프레임 — 글로벌 타임어택 + 각 베이 제한시간 카운트다운 + 시간초과 배송거부. */
  update(_time: number, delta: number): void {
    if (this.finished) return;

    // 글로벌 레벨 타이머(타임어택) — 0 도달 시 목표 미달이면 미션 실패.
    this.levelTimeLeftMs -= delta;
    this.refreshLevelTimer();
    if (this.levelTimeLeftMs <= 0) {
      this.levelTimeLeftMs = 0;
      if (!isLevelComplete(this.state)) {
        this.levelFail();
        return;
      }
    }

    for (const view of this.bayViews) {
      if (!view || !view.timerActive || !this.introDone) continue; // 카운트다운 전엔 정지
      view.timeLeftMs -= delta;
      this.refreshTimer(view);
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
    // 오더 아이콘 = **에디터 아이템 노드 위치/크기 그대로**, 갯수 = **에디터 갯수 노드 위치/폰트 그대로**(Bungee).
    // ⚠️디자이너 재저장으로 오른쪽 2베이(2·3) 갯수 노드가 삭제됨 → 폰트/색이 흰색 폴백(밝은 슬롯에서 안 보임).
    //   그 베이는 **베이0 갯수 노드(존재) 스타일**(검정 Bungee)을 빌려 쓴다(위치는 자기 countX/countY).
    const icon = makeProductIcon(this, slot.type, view.iconSize).setPosition(view.iconX, view.iconY).setDepth(95);
    const countStyleId = this.layout.nodeById(BAY_COUNT_IDS[view.bay]) ? BAY_COUNT_IDS[view.bay] : BAY_COUNT_IDS[0];
    const count = this.mkTextLikeNode(countStyleId, view.countX, view.countY, `${slot.loaded} / ${slot.required}`).setDepth(96);
    view.icon = icon;
    view.count = count;
    view.slotPos = { x: view.iconX, y: view.iconY };
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
    const COL_STAGGER = 46; // 라인(열)마다 순차 지연 → 왼→오 차례로 떨어짐(스냅)
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
            duration: 230,
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
          duration: 300, // 보드 인 낙하 430→300(스냅)
          delay: dropOld ? delay + 70 : delay, // 셔플은 기존 열이 빠지기 시작한 뒤
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
    // 안전장치: 버튼이 떼진 상태로 이동 중이면(pointerup 을 놓친 경우) 드래그를 강제 종료 —
    // 안 하면 버튼을 뗀 뒤에도 타일이 마우스를 계속 따라다니는 버그(사용자 보고)가 남는다.
    if (!pointer.isDown) {
      if (this.dragging && this.dragTile) this.endDrag(pointer);
      this.pressCell = null;
      this.dragging = false;
      return;
    }
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
      // 방어: 집었던 타일이 있으면 크기·각도·위치를 원복(스케일 1.4 상태로 멈춰있지 않게).
      if (dragTile) {
        this.tweens.killTweensOf(dragTile);
        dragTile.setScale((dragTile.getData('baseScale') as number) ?? dragTile.scale).setAngle(0).setDepth(90);
        if (origin) dragTile.setPosition(origin.x, origin.y);
      }
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
    // 스왑 중 두 타일을 위로(이웃 가림) 올리고 **부드럽게 미끄러지듯**(Sine.easeInOut) 자리 교환 —
    // 딱딱한 오버슈트 스냅(Back)+팝 대신 소프트 글라이드(사용자 "소프트한 매칭").
    imgA.setDepth(96);
    imgB.setDepth(95);
    const SWAP_MS = 140; // 소프트하되 **빠른** 글라이드(부드러운 Sine, 느리지 않게 — 130→140)

    this.tweens.add({ targets: imgA, x: pb.x, y: pb.y, scale: baseA, duration: SWAP_MS, ease: 'Sine.easeInOut' });
    this.tweens.add({
      targets: imgB,
      x: pa.x,
      y: pa.y,
      scale: baseB,
      duration: SWAP_MS,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        if (legal) {
          imgA.setScale(baseA).setDepth(90);
          imgB.setScale(baseB).setDepth(90);
          this.comboCount = 0; // 이번 스왑의 콤보 카운터 초기화
          this.state = { ...this.state, board: swapTypes(this.state.board, a, b) };
          this.swapTileRefs(a, b);
          // 히트스톱(딱 멈춤) 제거 — 글라이드가 끝나면 곧바로 부드럽게 매치 해소로 이어진다.
          this.time.delayedCall(0, () => this.resolveCascade());
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

    // 라인 길이 — 두 가지 이익: ① 보너스 코인(awardLineBonus, ×2/×4/×8 배수 유지)
    //   ② 해당 배송 트럭의 제한시간 **선형** 증가(4매치 +10s · 5매치 +20s · 6매치 +30s …, 사용자 요청).
    for (const g of findMatchGroups(this.state.board)) {
      if (g.len < 4) continue;
      const mult = Math.pow(2, g.len - 3); // 코인/×N 표시용(지수)
      const timeBonusMs = (g.len - 3) * 10000; // 시간 보너스(선형): 4→+10s · 5→+20s · 6→+30s
      const center = this.centroidOf(g.coords) ?? { x: W / 2, y: this.boardCy() };
      this.spawnLineMultiplier(center, mult);
      this.awardLineBonus(mult);
      // ② 이 라인 상품을 받은 트럭의 시간 증가(선형 +10s×(len-3)). 출발하는 트럭/미주문 상품은 제외.
      //    매치 위치에서 **시계 아이템이 나타나 해당 트럭 시계로 날아가** 도착 시 시간이 가산된다.
      const first = g.coords[0];
      const localType = first ? this.state.board.cells[first.row][first.col] : null;
      if (localType != null) {
        const bay = bayByType.get(this.state.typePool[localType]);
        if (bay != null && !dispatchedSet.has(bay)) this.flyTimeBonus(center, bay, timeBonusMs);
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
          duration: 150, // 소프트하되 빠른 낙하(느리지 않게)
          ease: 'Quad.easeOut', // 하드 슬램(Quad.easeIn) 대신 부드러운 감속 착지
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
    // 매칭 시점에 타일을 **살짝 부풀렸다가**(소프트 1.25배 팝) → 부드럽게 작아지며 사라짐.
    img.setDepth(92); // 부푸는 동안 이웃 위로
    this.tweens.add({
      targets: img,
      scale: img.scale * 1.25, // 팝 1.5→1.25(과한 오버슈트 완화)
      duration: 100, // 소프트하되 빠른 팝(부드러운 커브, 느리지 않게)
      ease: 'Sine.easeOut', // 오버슈트 없는 소프트 팝
      delay: idx * 9, // 스태거(빠른 물결)
      onComplete: () => {
        this.tweens.add({
          targets: img,
          scale: 0,
          alpha: 0,
          angle: img.angle + 100, // 회전 160→100(덜 격하게)
          duration: 115, // 소프트하되 빠른 축소(느리지 않게)
          ease: 'Sine.easeIn',
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
  private flyTimeBonus(from: Pos, bay: number, bonusMs: number): void {
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
        this.addTruckTime(bay, bonusMs); // 도착 순간 실제 시간 가산 + "+N초" 팝 + 시계 갱신
      },
    });
  }

  /**
   * 라인 매치 보상 ② — 해당 배송 트럭(배송퍼즐)의 제한시간 증가(선형).
   * **4매치 +10초, 5매치 +20초, 6매치 +30초**(= 10초 × (len-3)). 시계/디지털 즉시 반영 + "+N초" 팝.
   * (보통 flyTimeBonus 의 시계 아이템이 도착하는 순간 호출된다.)
   */
  private addTruckTime(bay: number, bonusMs: number): void {
    const view = this.bayViews[bay];
    if (!view || !view.timerActive) return;
    view.timeLeftMs += bonusMs;
    // 다시 여유가 생기면 위급 경고 상태 해제 + 점멸 알파 원복.
    if (view.timeLeftMs > LOW_TIME_MS) {
      view.warned = false;
      view.panel?.setAlpha(1);
      view.icon?.setAlpha(1);
      view.count?.setAlpha(1);
    }
    this.refreshTimer(view); // 디지털 시간 즉시 갱신
    this.spawnTimeBonus(view, bonusMs);
  }

  /** 시간 보너스 연출 — 시계 위로 떠오르는 초록 "+N초" 팝(시간 증가 강조). */
  private spawnTimeBonus(view: BayView, bonusMs: number): void {
    const secs = Math.round(bonusMs / 1000);
    const x = view.clockX;
    const y = view.clockY - 6;
    sfx('order_ping', { volume: 0.4, pitch: 1.25 });
    const label = this.mkText(x, y, `+${secs}초`, {
      fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
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
      fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
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
    const plus = this.mkText(x, y - 20, `+${reward}`, { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '26px', color: '#ffd54a', fontStyle: '700' })
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

    if (filled) this.refreshProgress(); // 목표 진행바 갱신(성공 배송만 집계)

    // 시간 내 성공 → 코인 보상(빠를수록 많이) + 트럭에서 코인이 떨어진다.
    if (filled) this.awardDispatchCoins(view, speedFrac);

    // 배송 성공/실패 **순간 피드백 아이콘**(48-3 초록체크 / 48-4 빨강X) — 트럭 출발 시 표시 칸에 잠깐 팝.
    this.spawnResultIcon(view, filled ? 'done' : 'rejected', false);

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
      if (this.finished) return;
      const deployed = deployNext(this.state, bay); // 무한 공급 폐지 — 대기열에서만 진입.
      this.state = deployed.state;
      if (!deployed.truck) {
        // **대기 트럭 소진 = 이 차고 배송완료**(무한 트럭 대기 안 함). 배송거부와 동일하게 스탬프 + 레인 닫힘.
        truck?.setVisible(false).setDepth(restDepth);
        this.showBayClosed(view, 'done');
        if (isLevelFailed(this.state)) this.levelFail(); // 전 베이 닫힘 & 목표 미달 → 실패
        return;
      }
      this.ensureBayDistinct(bay); // 다른 정차 베이와 다른 상품으로(중복 방지)
      const newTruck = this.state.bays[bay]; // 교체 반영본 재조회
      this.renderBayOrder(view, newTruck); // 오더 아이콘/카운트 생성 + 앞 트럭 visible
      if (!newTruck || !truck) {
        truck?.setVisible(false).setDepth(restDepth);
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

    // 배송거부(timeout)여도 **레인은 죽지 않는다** — 이번 트럭만 미집계(dispatched↑ 안 함)로 버리고
    // 다음 트럭이 진입한다(enter). 사용자 요청: 배송거부가 많아도 목표 갯수만 채우면 미션 완수 가능.
    // (트럭 대기열에 목표+버퍼가 있어 거부로 몇 대 날려도 목표 달성 여지가 남는다.)
    const onDeparted = enter;

    if (truck) {
      // 출발(앞모습): 보드 밑으로 도로를 따라 아래로 가속 + 아래로 갈수록 투명.
      truck.setDepth(TRUCK_TRAVEL_DEPTH);
      this.tweens.add({
        targets: truck,
        y: TRUCK_EXIT_Y,
        duration: 640,
        ease: 'Quad.easeIn',
        onUpdate: () => truck.setAlpha(this.truckAlphaForY(truck.y)),
        onComplete: onDeparted,
      });
    } else {
      onDeparted();
    }
  }

  /**
   * 배송 결과 아이콘(**UI_48-3 초록체크=성공 / UI_48-4 빨강X=실패**, 텍스트 없는 컴팩트 정사각 아이콘)을
   * 베이 표시 칸에 팝인. persist=true → 배송완료 스탬프(레인 닫힘·유지). persist=false → 배송 성공/실패
   * **순간 피드백**(잠깐 뜨고 사라짐, 트럭 출발 시). 위치 Y 는 디자이너 템플릿 노드(layer_12/_copy),
   * 정사각 아이콘이라 크기는 높이를 슬롯에 맞춰 비율유지(에디터 노드의 배너용 w/h 는 안 씀).
   */
  private spawnResultIcon(view: BayView, kind: 'done' | 'rejected', persist: boolean): void {
    const done = kind === 'done';
    const tex = done ? DELIVERY_DONE_TEX : DELIVERY_FAIL_TEX;
    if (this.textures.exists(tex)) {
      const node = this.layout.nodeById(done ? DELIVERY_DONE_NODE : DELIVERY_FAIL_NODE);
      const y = node?.y ?? view.iconY;
      const img = this.add.image(view.homeX, y, tex).setDepth(persist ? 120 : 140);
      const targetH = view.iconSize * 1.1; // 제품 아이콘보다 살짝 큰 정사각 결과 아이콘
      const s = targetH / (img.height || targetH); // 비율유지(정사각 아이콘, 높이 기준)
      img.setScale(0);
      this.tweens.add({
        targets: img,
        scale: s,
        duration: 260,
        ease: 'Back.easeOut',
        onComplete: persist
          ? undefined
          : () => this.tweens.add({ targets: img, scale: s * 0.9, alpha: 0, duration: 360, delay: 340, onComplete: () => img.destroy() }),
      });
      if (persist) view.rejectedIcon = img;
      return;
    }
    if (!persist) return;
    // 폴백: 텍스트 스탬프(이미지 미로드 시).
    const label = this.mkText(view.homeX, view.iconY, done ? '배송완료' : '배송거부', {
      fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
      fontSize: '30px',
      color: done ? '#2f9e44' : '#e03131',
      fontStyle: '700',
    })
      .setOrigin(0.5)
      .setStroke('#ffffff', 5)
      .setDepth(120)
      .setAngle(-8)
      .setScale(0);
    this.tweens.add({ targets: label, scale: 1, duration: 260, ease: 'Back.easeOut' });
    view.rejectedLabel = label;
  }

  /** 닫힌 차고(대기 트럭 소진=배송완료) 스탬프 — 지속 결과 아이콘. */
  private showBayClosed(view: BayView, kind: 'done' | 'rejected'): void {
    view.rejected = true; // 닫힌 레인 마커(새 트럭 없음)
    if (view.rejectedLabel || view.rejectedIcon) return; // 이미 스탬프 표시됨(중복 방지)
    this.spawnResultIcon(view, kind, true);
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
      this.powerCountTexts[pw.kind] = this.mkText(bx, by, String(this.powerCounts[pw.kind]), { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '20px', color: '#5b3a86' })
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
    this.profile = recordResult(this.profile, cleared, reward, true); // 승리 → 레벨+1 저장
    saveProfile(this.profile);
    this.coinsText?.setText(this.fmtCoins());

    // 자동 진행 대신 **"다음 레벨로 이동" 메시지 + OK 버튼** → OK 클릭 시 다음 레벨 시작(사용자 요청).
    // 3레벨마다 관문(전면) 광고(`@casual/core` adPolicy, 2026-09-02) — 초반(≤4) 면제,
    //   광고가 닫힌 뒤에 다음 레벨로 간다.
    this.showResultPopup(POPUP_CLEAR_TEX, `레벨 ${cleared} 클리어!`, `다음 레벨로 이동합니다\n+${reward} 🪙`, '#3a6b1e', () => {
      const { ads } = getStore();
      const gate = isAdGateTurn({
        count: cleared,
        adsUsable: ads.fullscreenSupported || ads.allowPlaceholders,
        exempt: cleared <= 4,
        every: 3,
      });
      if (!gate) this.scene.restart();
      else playGateAd(this, ads, () => this.scene.restart());
    });
  }

  /** 미션 실패 — 글로벌 시간 초과(목표 미달) 또는 전 베이 배송거부. 코인 보상 없음 → OK 로 같은 레벨 재시도. */
  private levelFail(): void {
    if (this.finished) return;
    this.finished = true;
    sfx('fail', { volume: 0.8 });
    haptics.warn();
    this.profile = recordResult(this.profile, this.state.level, 0, false);
    saveProfile(this.profile);

    const reason = this.levelTimeLeftMs <= 0 ? '시간 초과!' : '배송거부가 너무 많아요!';
    this.showResultPopup(POPUP_FAIL_TEX, '미션 실패…', `${reason}\n다시 도전해요`, '#1e4a6b', () => this.scene.restart());
  }

  /**
   * 레벨 결과 팝업(공통에셋 패널 + OK 버튼) — **OK 입력 전까진 자동 진행하지 않는다**.
   * onOk 클릭 시 콜백(다음 레벨/재시도). 패널/버튼은 popup 에셋(Pannel_02/01 · UI_btn_01).
   */
  private showResultPopup(panelTex: string, title: string, subtitle: string, textColor: string, onOk: () => void): void {
    const vh = this.scale.height;
    const cx = W / 2, cy = vh / 2;
    // 뒷배경 딤 + 입력 차단(팝업 밖 클릭 무시).
    this.add.rectangle(cx, cy, W, vh, 0x000000, 0.6).setDepth(200).setInteractive();

    const cont = this.add.container(cx, cy).setDepth(201);
    const hasPanel = this.textures.exists(panelTex);
    let dh = 620;
    if (hasPanel) {
      const panel = this.add.image(0, 0, panelTex);
      const k = Math.min((W * 0.82) / panel.width, 1.4);
      panel.setScale(k);
      dh = panel.displayHeight;
      cont.add(panel);
    } else {
      const g = this.add.graphics();
      g.fillStyle(0xfff3e0, 0.98);
      g.fillRoundedRect(-360, -dh / 2, 720, dh, 40);
      cont.add(g);
    }
    // 제목(왕관 배너 아래) · 부제 · OK 버튼 — 패널 표시높이 비례 배치.
    cont.add(this.mkText(0, -dh * 0.16, title, { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '48px', color: textColor, align: 'center' }).setOrigin(0.5).setStroke('#ffffff', 5));
    cont.add(this.mkText(0, dh * 0.02, subtitle, { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '32px', color: '#5a3a1a', align: 'center', lineSpacing: 8 }).setOrigin(0.5));

    const btn = this.add.image(0, dh * 0.3, BTN_OK_TEX);
    const bScale = this.textures.exists(BTN_OK_TEX) ? Math.min((W * 0.32) / btn.width, 1.3) : 1;
    btn.setScale(bScale).setInteractive({ useHandCursor: true });
    cont.add(btn);
    this.tweens.add({ targets: btn, scale: bScale * 1.06, duration: 720, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // 팝업 등장(스케일 팝).
    cont.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: cont, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });

    let done = false;
    btn.on('pointerup', () => {
      if (done) return;
      done = true;
      sfx('order_complete', { volume: 0.5 });
      haptics.tap();
      this.tweens.add({ targets: cont, scale: 0.85, alpha: 0, duration: 160, onComplete: onOk });
    });
  }
}
