/**
 * PlayKlondikeScene.ts — **클론다이크(고전 솔리테어) 10레벨 보너스 라운드**(2026-07-19 PO).
 *
 * PO 지시 요약: "10레벨 단위로 프리셀을 배치하라" → "이게임을 프리셀대신 삽입하라"(Klondike 스크린샷,
 *   Microsoft Solitaire 참조) → "게임은 이와 같은 구조이다. 왼쪽 상단에서 카드가 뒤집히면서 나타나는
 *   카드를 교차로 하단으로 배치하는 구조이다"(스톡→웨이스트→태블로) → "10레벨 단위로 배치한다"(레벨
 *   10·20·30…, src/logic/klondike.ts 의 `hasBonusAfter`) → 스톡 드로우 "처음에는 한장씩 나중에는
 *   3장씩"(`drawCountForLevel`) → 조작은 **드래그앤드롭**, 승리 별점은 **고정 3★**(미션리워드 파이프라인과
 *   동일 스케일) → "프리셀에서는[=이 보너스 라운드에서는] 되돌리기 아이템 외에는 와일드카드나 +카드
 *   아이템이 없다" — 이 씬은 되돌리기만 제공하고 와일드/+5 부스터는 아예 배선하지 않는다.
 *
 * 별도 Scene 인 이유: PlayScene 은 TriPeaks 전용 상태(와일드/보너스 슬롯·콤보 게이지·손님 등)에 깊이
 *   결합된 단일 3000+줄 씬이라 그 안에 모드 분기를 넣기보다 새 씬이 훨씬 안전하다(2026-07-19 조사 결론).
 *   카드 렌더(CardView)·상단 헤더(topHeader.ts)·진입/다음레벨 팝업(entryPopup.ts)·되돌리기 가격
 *   (econRuntime.ts)·미션리워드 적립(missionReward.ts)은 기존 모듈을 그대로 재사용한다.
 *
 * 로직은 src/logic/klondike.ts(Phaser-free, 순수)에 전부 있다 — 이 씬은 그 상태를 그리고 입력을 받아
 *   move 로 변환할 뿐, 규칙 판정은 하지 않는다.
 *
 * ⚠️ **보너스 라운드**(PO 2026-07-27 "반드시 완료하지 않고도 다음 레벨로 넘어갈 수 있다") — 이 씬의
 *   `level` 은 **직전에 클리어한 메인 레벨**(10·20·30…)이고 화면에는 `10-1` 로 표시된다. 진입은 무료
 *   (게임비 없음)이고, 이기든 ✕로 건너뛰든 **똑같이 다음 메인 레벨 진입 팝업**으로 나간다. 레벨 진행은
 *   PlayScene 이 메인 레벨을 클리어할 때 이미 확정돼 있어, 이 라운드의 결과는 진행에 영향을 주지 않는다.
 */
import Phaser from 'phaser';
import { CardView } from './cardView.js';
import { openItemShop } from './itemShop.js';
import {
  drawFromStock,
  recycleWaste,
  canMove,
  applyMove,
  isWon,
  bonusLevelLabel,
  BONUS_ENTRY_FEE,
  TABLEAU_COLS,
  type KlondikeState,
  type KlondikeMove,
  type MoveSource,
  type MoveDest,
} from '../logic/klondike.js';
import { dealKlondikeForLevel } from '../logic/klondikeDifficulty.js';
import { canAutoComplete, planAutoComplete, type AutoStep, type AutoStepKind } from '../logic/klondikeAuto.js';
import { isRed, suitSymbol, type Card, type Rank, type Suit } from '../logic/types.js';
import { loadSave, writeSave, itemsOf, missionRewardOf } from '../save.js';
import { applyStars as applyMissionStars } from '../logic/missionReward.js';
import { MAX_PROGRESS_LEVEL } from '../logic/levels.js';
import { buildTopHeader, type TopHeader } from './topHeader.js';
import { buildEntryPopup } from './entryPopup.js';
import { buildMissionRewardBanner } from './missionRewardBanner.js';
import { buildLayout, type LayoutDoc, type LayoutIndex } from '../ui/layoutLoader.js';
import { DYNAMIC_NODE_IDS } from './PlayScene.js';
import { starCoinsAt, undoPriceAt, circledCount, setEconFromJson, ECON_JSON_KEY, ECON_JSON_URL } from '../econRuntime.js';
import { loadGameAssets, CARD_BACK_KEY, UI_MAIN_KEY, uploadPath } from '../assets.js';
import { preloadAudio, sfx, cycleVolume, volumeLabel } from '../audio.js';

const W = 1080;
const H = 2400;

// ── 레이아웃(디자인 좌표, 1080 폭 기준) ─────────────────────────────────
const MARGIN = 60;
const CARD_W = 126;
const CARD_H = Math.round(CARD_W * (181 / 132)); // cardView.ts 의 REF 비율(132×181)과 동일 종횡비.
/**
 * 하단 버튼 3개(다시하기·되돌리기·패스) 중심 x — 되돌리기 라벨이 코인가로 길어질 수 있어(≈380px)
 *   가운데를 넓게 쓰고 양옆을 화면 끝에 붙인다. 1080 폭 기준 세 버튼이 겹치지 않는 배치.
 */
const BOTTOM_BTN_XS = [168, 540, 916] as const;
const PITCH = (W - 2 * MARGIN - CARD_W) / (TABLEAU_COLS - 1);
const FACE_DOWN_STEP = 16;
const FACE_UP_STEP = 44;

function colX(i: number): number {
  return MARGIN + CARD_W / 2 + i * PITCH;
}

/** 이 컬럼에 카드를 한 장 더 놓는다면 놓일 y 좌표(기존 카드들 누적 오프셋 다음 자리). tabTopY=그 씬의 태블로 첫 행 y. */
function columnNextY(col: ReadonlyArray<{ faceUp: boolean }>, tabTopY: number): number {
  let y = tabTopY;
  let prevFaceUp = false;
  col.forEach((tc, idx) => {
    if (idx > 0) y += prevFaceUp ? FACE_UP_STEP : FACE_DOWN_STEP;
    prevFaceUp = tc.faceUp;
  });
  if (col.length > 0) y += prevFaceUp ? FACE_UP_STEP : FACE_DOWN_STEP;
  return y;
}

// 자석(스냅) 감지 반경 — pickDropTarget 근접 판정과 onDrag 의 당김 세기 감쇠가 같은 반경을 공유한다.
//   PO 2026-07-19: "자석이 작동하는 범위를 조금 더 확장" — PITCH(컬럼 1칸 간격)의 2.0배로 확장(1.7→2.0,
//   "빠르게 움직였을 때 자리를 잘 찾지 못하는 문제" 재지적 반영 — 빠른 플릭은 손을 뗄 때 이미 목표를
//   지나쳐 있는 경우가 많아 판정 반경을 더 넉넉히 잡는다).
const SNAP_RADIUS = PITCH * 2.0;

/**
 * **완전 흡착(락) 반경** — PO 2026-07-27 "카드를 전체 옮기는 구조가 너무 느리고 무겁다. 자석을 더 강화".
 *   컬럼 중심에서 가로로 이 안이면 손끝 위치와 무관하게 목적지에 **딱 붙는다**(당김 세기 1.0). 컬럼 간격의
 *   절반이라, 어느 컬럼 위에 있든 그 컬럼에 확실히 흡착된다 — 미세 조준이 필요 없어진다.
 */
const SNAP_LOCK_RADIUS = PITCH * 0.5;

/**
 * 자석 추종 시간상수(ms) — 작을수록 즉각적. 기존 지수 보간은 실효 시간상수가 **약 140ms**(60fps 에서
 *   프레임당 11%만 수렴 → 90% 따라잡는 데 20프레임/330ms)라 카드가 손끝을 눈에 띄게 끌려다녔다 =
 *   PO 가 말한 "무거움"의 정체. 45ms 로 낮춰 즉각 붙되 딱딱하지 않을 만큼의 감속만 남긴다.
 */
const MAGNET_FOLLOW_TAU_MS = 45;

/**
 * **자동 완성 한 수당 간격(ms) — 수의 종류별로 다르게**(PO 2026-07-28 "자동 진행되다 멈추는 현상").
 *   예전엔 90ms 균일이었는데, 손패를 도는 `draw`/`recycle` 수는 **화면 변화가 거의 없다**(웨이스트 1장만 바뀌고
 *   리사이클은 아무 변화도 없음). 올릴 카드가 없으면 손패를 한 바퀴 이상 돌리므로 그런 수가 **20~48개 연속**으로
 *   나오고, 90ms×N = 1.8~4.3초 동안 보드가 정지한 것처럼 보였다(그 사이 토스트는 이미 사라지고 입력은 잠김).
 *   → 보여줘야 할 수(`foundation`)는 천천히, 손패 돌리는 수는 빠르게 훑는다.
 *   `foundation` 130ms 는 카드 이동 트윈(자동 완성 중 100ms 고정)보다 길어 **트윈 중첩도 함께 해소**한다.
 */
const AUTO_DELAY_MS: Record<AutoStepKind, number> = {
  foundation: 130,
  draw: 45,
  recycle: 220, // 화면 변화가 없는 수 — 여기서만 잠깐 쉬며 재순환 아이콘을 돌려 보여준다.
};
/**
 * 워치독 여유 — `delayedCall` 은 "지연 경과 후 **다음 프레임**"에 발화하므로 스텝마다 최대 한 프레임씩
 *   밀린다(30fps 기기 ≈34ms). 고정 여유만 쓰면 스텝이 많은 판에서 **정상 재생을 워치독이 오인해 끊는다**
 *   → 스텝 수에 비례하는 몫 + 마지막 트윈/승리 팝업용 기본 몫으로 나눈다.
 */
const AUTO_WATCHDOG_PER_STEP_MS = 34;
const AUTO_WATCHDOG_BASE_MS = 2000;

/**
 * 목적지까지의 **가로 거리**로 계산하는 당김 세기 0..1.
 *   ⚠️ 예전엔 직선(유클리드) 거리를 썼는데, 드롭 판정(`pickDropTarget`)은 **가로 거리만** 보기 때문에
 *      카드가 많이 쌓인 컬럼(목표 y 가 아래로 멀어짐)일수록 판정은 되는데 자석은 약해지는 불일치가 있었다.
 *      판정과 같은 축을 쓰도록 통일 — 컬럼이 잡히면 세로로도 확실히 끌어당겨진다.
 */
function magnetStrength(dxToTarget: number): number {
  if (dxToTarget <= SNAP_LOCK_RADIUS) return 1; // 락 존 = 완전 흡착.
  const t = 1 - Phaser.Math.Clamp((dxToTarget - SNAP_LOCK_RADIUS) / (SNAP_RADIUS - SNAP_LOCK_RADIUS), 0, 1);
  return t * t; // 락 밖에서는 제곱 감쇠(PO 2026-07-19 "너무 딱딱하지 않게").
}

interface DragCtx {
  readonly source: MoveSource;
  readonly views: CardView[]; // [0]=실제로 잡은 카드(런의 기준점) … [끝]=컬럼 맨 앞 카드. 드래그 좌표는 [0] 기준.
  readonly origPos: ReadonlyArray<{ x: number; y: number }>;
  /** 폴드 영역 프록시 보정 — Phaser 드래그 좌표(잡은 카드 기준)에 더해 런 기준 카드 좌표계로 옮긴다. 일반 드래그는 0. */
  readonly offX: number;
  readonly offY: number;
  desiredX: number; // 이번 프레임에 향해야 할 목표(자석 존이면 손끝↔목적지 혼합, 아니면 손끝 그대로).
  desiredY: number;
  visualX: number; // 실제로 화면에 그려지는 좌표(자석 존 안에서만 desired 를 향해 서서히 수렴).
  visualY: number;
  magnetized: boolean; // 자석 존 안(true)이면 update() 가 매 프레임 visual→desired 로 감속 추종.
  // **빠른 드래그 보정**(PO 2026-07-20 "빠르게 움직였을 때 자리를 잘 찾지 못하는 문제") — 드래그 도중
  //   한 번이라도 유효했던 마지막 목적지를 기억해둔다. 빠른 플릭은 손을 뗀 순간의 좌표가 이미 목표 반경을
  //   지나쳐 있는 경우가 많아, 정확한 릴리스 지점 판정이 실패하면 이 값으로 대신 커밋한다.
  lastValidDest: MoveDest | null;
}

export class PlayKlondikeScene extends Phaser.Scene {
  private level = 1;
  private chMult = 1;
  private floorThemeIdx = 1;
  private state!: KlondikeState;
  private history: KlondikeState[] = [];
  private header?: TopHeader;
  private chrome?: LayoutIndex;
  private ended = false;

  // **보드 배치 y 기준**(PO 2026-07-19: "이 게임도 표시한 공간에 배치해야 한다") — PlayScene 의 암막 보드
  //   패널(main.json layer_4)과 동일한 영역 안에 클론다이크 보드를 놓는다. 기본값은 챙기지 못했을 때(챙김
  //   폴백)의 값이고, applyChrome() 이 실제 패널 위치로 재계산한다.
  private boardTop = 763;
  private topY = 310; // 스톡·웨이스트·파운데이션 행.
  private tabTopY = 560; // 태블로 첫 행.

  private views = new Map<string, CardView>(); // card.id → view(재사용).
  private stockBackView?: CardView;
  private stockCountText?: Phaser.GameObjects.Text;
  private wasteCountText?: Phaser.GameObjects.Text; // 웨이스트 장수 — 맨 위 한 장만 렌더돼 아래 카드가 안 보이는 걸 보완.
  private recycleIcon?: Phaser.GameObjects.Text;
  private undoBtn?: Phaser.GameObjects.Text;

  private dragCtx?: DragCtx;
  private snapGhost?: Phaser.GameObjects.Rectangle;
  private autoPlaying = false; // 자동 완성 재생 중 — 이 동안은 모든 조작 입력을 막는다.
  /** 이기지 못한 채 끝난 뒤 재시작 차단 — 플레이어가 한 수 둘 때까지 같은 수순을 다시 걸지 않는다. */
  private autoRetryBlocked = false;
  private autoTimer?: Phaser.Time.TimerEvent; // 재생 예약(한 수마다 다시 건다) — 중단/정리용 핸들.
  private autoWatchdog?: Phaser.Time.TimerEvent; // 재생이 끝나지 않을 때 강제 해제하는 안전망.
  /** 카드별 이동 트윈 핸들 — 새로 걸기 전에 이전 것을 멈춰 좌표 경합(카드가 되돌아가/떠는 현상)을 막는다. */
  private arcTweens = new Map<CardView, Phaser.Tweens.Tween>();
  private suppressTap = false;

  constructor() {
    super('playKlondike');
  }

  init(data: { level?: number; mult?: number }): void {
    this.level = data?.level ?? loadSave().level;
    this.chMult = Math.max(1, Math.floor(data?.mult ?? 1));
    // 점포 테마 = 소유 최고층(PlayScene 과 동일 규칙) — 층별 인테리어 표시에 사용.
    const ownedFloors = Math.max(1, loadSave().ownedFloors ?? 1);
    this.floorThemeIdx = ((ownedFloors - 1) % 5) + 1;
  }

  preload(): void {
    loadGameAssets(this); // main.json(UI_MAIN_KEY) 포함 — PlayScene 과 동일 크롬을 재사용한다.
    if (!this.cache.json.exists(ECON_JSON_KEY)) this.load.json(ECON_JSON_KEY, ECON_JSON_URL);
    preloadAudio();
    if (!this.textures.exists(CARD_BACK_KEY)) this.load.image(CARD_BACK_KEY, uploadPath('up_Solitaire_CARD_back'));
  }

  create(): void {
    setEconFromJson(this.cache.json.get(ECON_JSON_KEY));
    this.ended = false;
    this.autoPlaying = false; // 씬 재사용 대비(이전 판 자동 완성 중 나갔을 수 있다).
    this.autoRetryBlocked = false;
    this.autoTimer?.remove(false);
    this.autoTimer = undefined;
    this.autoWatchdog?.remove(false);
    this.autoWatchdog = undefined;
    this.arcTweens.clear();
    // 씬을 떠날 때 예약이 죽은 씬을 건드리지 않게 정리(전환 중 콜백 방어).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.autoTimer?.remove(false);
      this.autoWatchdog?.remove(false);
      this.autoPlaying = false;
      this.arcTweens.clear();
    });
    this.history = [];
    this.views.clear();
    this.dragCtx = undefined; // 씬 재사용 대비(파괴된 이전 판 카드 참조가 남아있지 않게).
    this.input.dragDistanceThreshold = 12; // 이 미만 이동은 드래그가 아니라 탭(파운데이션 자동 이동)으로 처리.

    this.applyChrome(); // 배경/보드 패널(this.topY·this.tabTopY 확정) + 닫기 버튼 + 미션 배너.
    // PO 2026-07-19: "게임을 다시 실행할 때마다 새로운 게임으로 카드 배치" — TriPeaks(레벨 시드 고정, 난이도
    //   재현성 목적)와 달리 클론다이크는 재입장할 때마다 매번 새로 셔플한다(Math.random, 결정적 시드 아님).
    // PO 2026-07-27: 딜은 **레벨 난이도에 맞춰** 고른다 — 저레벨일수록 쉬운 판(klondikeDifficulty.ts).
    this.state = dealKlondikeForLevel(Math.random, this.level);
    // 헤더 레벨 표시는 보너스 라벨(`10-1`) — 메인 레벨과 구분되게(PO 2026-07-27).
    this.header = buildTopHeader(this, loadSave().coins, loadSave().diamonds ?? 0, bonusLevelLabel(this.level), () => this.openMenu());
    this.drawSlots();
    this.drawUndoButton();
    this.syncViews(true);
    // 보너스라는 것 · **게임비가 없다는 것** · **패스할 수 있다는 것**을 진입 순간에 알린다(PO 2026-07-27·29).
    this.toast(`🎁 보너스 라운드 — 게임비 ${BONUS_ENTRY_FEE === 0 ? '무료' : BONUS_ENTRY_FEE.toLocaleString()} · 패스해도 다음 레벨로 갑니다`);
  }

  /**
   * 화면 크롬 = **PlayScene 과 동일한 main.json SSOT**(스토어프론트+암막 보드 패널)를 그대로 재사용하고,
   *   그 패널 영역 안에 클론다이크 보드가 오도록 `this.topY`/`this.tabTopY` 를 확정한다(PO 2026-07-19
   *   "이 게임도 표시한 공간에 배치해야 한다"). 와일드/+5 부스터 배선(setupEditorBoosters)·손님 연출
   *   (setupStorefrontLife)·보행자(spawnPedestrians)는 TriPeaks 전용이라 가져오지 않는다 — 이 라운드엔
   *   되돌리기만 있고 손님/보행자는 필요 없다. 디자인 미저작(main.json 없음) 시 코드 배경으로 폴백.
   */
  private applyChrome(): void {
    const mainDoc = (this.cache.json.get(UI_MAIN_KEY) ?? null) as LayoutDoc | null;
    const hasChrome = !!mainDoc?.nodes?.some((n) => n.type === 'image' && this.textures.exists(n.key ?? ''));
    if (!hasChrome) {
      this.drawBackground();
      return;
    }
    const staticDoc: LayoutDoc = { ...mainDoc!, nodes: mainDoc!.nodes.filter((n) => !DYNAMIC_NODE_IDS.has(n.id)) };
    this.chrome = buildLayout(this, staticDoc);

    // 층별 인테리어(현재 소유 최고층 테마) — PlayScene.applyFloorInterior 와 동일 로직(코드 재사용은
    //   private 메서드라 불가 — 텍스처 키 규칙만 동일하게 유지).
    const interior = this.chrome.tryById<Phaser.GameObjects.Image>('layer_3');
    const interiorNode = this.chrome.nodeById('layer_3');
    if (interior && interiorNode) {
      const floorKey = `up_Slitare_BG_01-${this.floorThemeIdx}`;
      const key = this.textures.exists(floorKey) ? floorKey : 'up_Slitare_BG_01-1';
      interior.setTexture(key);
      if (interiorNode.w && interiorNode.h) interior.setDisplaySize(interiorNode.w, interiorNode.h);
    }

    // 암막 보드 패널(가장 큰 rect 노드) 범위 → 그 안쪽에 보드 y 기준을 잡는다.
    const panel = mainDoc!.nodes.filter((n) => n.type === 'rect' && (n.h ?? 0) >= 800).sort((a, b) => (b.h ?? 0) - (a.h ?? 0))[0];
    if (panel?.h) this.boardTop = Math.round(panel.y - panel.h / 2 + 48);
    // PO 2026-07-19: "약간 위치를 조금 내려 주세요" — 스토어프론트 하단(미션 리워드 배너)에 너무 붙어
    //   보여서 여백을 더 키움(30→110).
    this.topY = this.boardTop + CARD_H / 2 + 110;
    this.tabTopY = this.topY + CARD_H + 60;

    // 닫기(✕) 버튼 = layer_20 — **보너스 건너뛰기**(PO 2026-07-27 "반드시 완료하지 않고도 다음 레벨로").
    //   PlayScene 의 ✕(홈으로)와 달리 여기서는 다음 메인 레벨 진입 팝업으로 넘어간다(그 팝업에 홈 링크가 있다).
    this.chrome.tryById<Phaser.GameObjects.Image>('layer_20')?.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.skipBonus());

    // 와일드(layer_10)·+5카드(layer_11) 부스터 아트 — 이 라운드는 되돌리기만 지원하므로 숨긴다
    //   (PO 2026-07-19 "하단에 와일드카드랑 플러스 카드 아이콘 지워 주세요"). 정적 크롬 렌더는 main.json
    //   전체를 그대로 가져오다 보니 TriPeaks 전용 부스터 아트까지 같이 딸려 왔었다.
    this.chrome.tryById('layer_10')?.setVisible(false);
    this.chrome.tryById('layer_11')?.setVisible(false);

    // 미션 리워드 배너 — 홈/PlayScene 과 동일 위치/구성(정적 표시 — 이 라운드는 별점 실시간 적립 없음, 승리 시 일괄 반영).
    //   제한시간이 여기서 끝나면 리셋 상태를 즉시 반영한다(PlayScene 과 동일 규칙).
    const banner = buildMissionRewardBanner(this, missionRewardOf(loadSave(), Date.now()), 0, 1580, () => {
      const save = loadSave();
      const next = missionRewardOf(save, Date.now());
      save.missionReward = next;
      writeSave(save);
      banner.setState(next);
    });
  }

  // ── 배경/슬롯 ──────────────────────────────────────────────────────
  private drawBackground(): void {
    const g = this.add.graphics();
    g.fillGradientStyle(0x1f5c37, 0x1f5c37, 0x123521, 0x123521, 1);
    g.fillRect(0, 0, W, H);
  }

  private drawSlots(): void {
    // 자석 착지 미리보기 — 드래그 중에만 보이고 위치가 바뀐다(카드 depth 500 아래, 슬롯 윤곽 위).
    this.snapGhost = this.add
      .rectangle(0, 0, CARD_W, CARD_H, 0xffe27a, 0.16)
      .setStrokeStyle(4, 0xffe27a, 0.9)
      .setDepth(400)
      .setVisible(false);

    const outline = (x: number, y: number): Phaser.GameObjects.Rectangle => this.add.rectangle(x, y, CARD_W, CARD_H, 0, 0).setStrokeStyle(3, 0xffffff, 0.32).setDepth(5);
    outline(colX(0), this.topY); // 스톡.
    const suits: readonly Suit[] = ['S', 'H', 'D', 'C'];
    suits.forEach((s, i) => {
      outline(colX(3 + i), this.topY);
      this.add
        .text(colX(3 + i), this.topY, suitSymbol(s), { fontFamily: 'Arial, sans-serif', fontSize: '48px', color: isRed(s) ? '#e8402f55' : '#00000055' })
        .setOrigin(0.5)
        .setDepth(6);
    });
    for (let i = 0; i < TABLEAU_COLS; i++) outline(colX(i), this.tabTopY);

    // 스톡 뒷면 더미(탭=드로우/재순환) + 장수 표시 + 재순환 아이콘.
    this.stockBackView = new CardView(this, colX(0), this.topY, CARD_W, CARD_H, false);
    this.stockBackView.showBack();
    this.stockBackView.setDepth(10);
    this.stockCountText = this.add.text(colX(0), this.topY + CARD_H / 2 + 32, '', { fontFamily: '"Jua", sans-serif', fontSize: '28px', color: '#ffffff' }).setOrigin(0.5).setDepth(20);
    // **웨이스트 장수**(PO 2026-07-29) — 이 씬은 웨이스트 **맨 위 한 장만** 그리므로 그 아래 깔린 카드가
    //   화면에서 완전히 사라진다("♠5·6이 없어졌다"는 제보의 실제 원인). 스톡과 같은 형식으로 장수를 알린다.
    this.wasteCountText = this.add
      .text(colX(1), this.topY + CARD_H / 2 + 32, '', { fontFamily: '"Jua", sans-serif', fontSize: '28px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(20);
    this.recycleIcon = this.add.text(colX(0), this.topY, '↻', { fontFamily: '"Jua", sans-serif', fontSize: '64px', color: '#ffe066' }).setOrigin(0.5).setDepth(20).setVisible(false);
    const stockZone = this.add.zone(colX(0), this.topY, CARD_W + 24, CARD_H + 24).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(21);
    stockZone.on('pointerdown', () => this.onStockTap());
  }

  private drawUndoButton(): void {
    // PO 2026-07-19: "게임재시작 버튼을 만들어 주세요" — 되돌리기 옆에 무료 "다시하기"(같은 레벨 재셔플).
    this.add
      .text(BOTTOM_BTN_XS[0], H - 160, '🔄 다시하기', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '32px',
        color: '#2a1830',
        backgroundColor: '#a8d8ff',
        align: 'center',
        padding: { x: 28, y: 14 },
      })
      .setOrigin(0.5)
      .setDepth(90)
      .setShadow(0, 3, '#00000055', 5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.restartGame());

    this.undoBtn = this.add
      .text(BOTTOM_BTN_XS[1], H - 160, this.undoLabel(), {
        fontFamily: '"Jua", sans-serif',
        fontSize: '32px',
        color: '#2a1830',
        backgroundColor: '#ffd166',
        align: 'center',
        padding: { x: 28, y: 14 },
      })
      .setOrigin(0.5)
      .setDepth(90)
      .setShadow(0, 3, '#00000055', 5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.doUndo());

    // **패스**(PO 2026-07-29 "플레이하지 않고 패스할 수 있습니다") — ✕ 와 같은 동작이지만, 사라지는 토스트
    //   대신 **화면에 남는 버튼**으로 둔다. 보너스는 안 해도 손해가 없다는 걸 언제든 눈으로 확인할 수 있게.
    this.add
      .text(BOTTOM_BTN_XS[2], H - 160, '⏭ 패스', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '32px',
        color: '#2a1830',
        backgroundColor: '#d8d0e8',
        align: 'center',
        padding: { x: 28, y: 14 },
      })
      .setOrigin(0.5)
      .setDepth(90)
      .setShadow(0, 3, '#00000055', 5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.skipBonus());
  }

  /**
   * **보너스 패스** — 판을 버리고 곧장 다음 메인 레벨 진입 팝업으로. ✕ 와 ⏭ 패스 버튼이 공유한다.
   *   진행도는 PlayScene 이 메인 레벨 클리어 때 이미 확정했으므로 여기서 잃는 것은 없다.
   */
  private skipBonus(): void {
    if (this.autoPlaying || this.ended) return;
    sfx('level_close');
    this.ended = true; // 이후 자동 완성·입력이 끼어들지 않게 잠근다.
    this.enterNextLevel();
  }

  /** 게임 재시작 — 같은 레벨을 무료로 다시 셔플(진행 중이던 딜을 버리고 새 딜). */
  private restartGame(): void {
    if (this.ended || this.autoPlaying) return;
    sfx('button');
    this.history = [];
    this.state = dealKlondikeForLevel(Math.random, this.level); // 다시하기도 같은 난이도 등급으로 재배분.
    this.syncViews(true); // 완전히 새 배치라 순간이동(트윈 없이) 표시.
  }

  private undoLabel(): string {
    const n = itemsOf(loadSave()).undo;
    return n > 0 ? `↩ 되돌리기 ${circledCount(n)}` : `↩ 되돌리기  🪙${this.undoPrice().toLocaleString()}`;
  }

  /**
   * 카드 이동 연출(PO 2026-07-19: "카드 움직임이 너무 직선적입니다. 부드럽게 움직이도록") — 직선 트윈
   *   대신 살짝 떠오르는 2차 베지어 곡선으로 이동시킨다(rewardBurstFly 와 동일 기법, PlayScene.ts 참고).
   */
  private moveCardArc(v: CardView, toX: number, toY: number): void {
    // **이전 이동 트윈을 먼저 멈춘다**(PO 2026-07-28) — 이 트윈은 카운터를 타깃으로 잡고 onUpdate 에서 v.x/v.y 를
    //   직접 쓰기 때문에 `killTweensOf(v)` 로는 안 잡힌다. 겹치면 한 카드에 여러 트윈이 좌표를 써서 카드가
    //   되돌아가거나 제자리에서 떠는 것처럼 보인다(자동 완성처럼 연속 갱신될 때 특히).
    this.arcTweens.get(v)?.stop();
    this.arcTweens.delete(v);
    const fromX = v.x;
    const fromY = v.y;
    const dist = Phaser.Math.Distance.Between(fromX, fromY, toX, toY);
    if (dist < 2) {
      v.setPosition(toX, toY);
      return;
    }
    const lift = this.autoPlaying ? 0 : Math.min(52, dist * 0.16); // 자동 완성 중엔 아치 없이 직선(연속 재생에 과함).
    const ctrlX = (fromX + toX) / 2;
    const ctrlY = (fromY + toY) / 2 - lift;
    // PO 2026-07-27 "전체 옮기는 구조가 너무 느리고 무겁다" — 런 전체가 매번 최대 380ms 를 쓰던 걸 절반 이하로.
    //   아치 높이도 함께 낮춰(0.22→0.16) 떠다니는 느낌 대신 착 붙는 느낌으로 바꾼다.
    const duration = this.autoPlaying ? 100 : Phaser.Math.Clamp(Math.round(dist * 0.5), 100, 210);
    const tw = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      ease: 'Cubic.easeOut',
      onUpdate: (counter) => {
        if (!v.scene) return; // 이미 파괴된 뷰 — 좌표를 쓰면 안 된다(정리 전 남은 트윈 방어).
        const t = counter.getValue() ?? 0;
        const u = 1 - t;
        v.x = u * u * fromX + 2 * u * t * ctrlX + t * t * toX;
        v.y = u * u * fromY + 2 * u * t * ctrlY + t * t * toY;
      },
      onComplete: () => this.arcTweens.delete(v),
    });
    this.arcTweens.set(v, tw);
  }

  // ── 상태 ↔ 화면 동기화(항상 전체 재계산 — 카드 최대 52장이라 비용 무시 가능) ──────────
  private syncViews(initial = false): void {
    const seen = new Set<string>();

    const place = (card: Card, x: number, y: number, depth: number, faceUp: boolean, drag: MoveSource | null, proxy?: MoveSource): void => {
      seen.add(card.id);
      let v = this.views.get(card.id);
      const isNew = !v;
      if (!v) {
        v = new CardView(this, x, y, CARD_W, CARD_H, false);
        this.views.set(card.id, v);
      }
      v.setDepth(depth);
      if (faceUp) {
        if (v.isShowingFace(card)) {
          // 이미 같은 앞면 — 다시 그리지 않는다(setTexture 가 진행 중인 배율 트윈을 리셋한다).
        } else if (!v.isFaceUp()) {
          // **자동 완성 중엔 뒤집기 연출을 쓰지 않는다**(PO 2026-07-28) — 이 구간은 게이트상 뒷면 카드가
          //   0장이라 논리적으로 뒤집을 카드가 없고, 화면의 뒤집기는 "새 뷰는 뒷면으로 시작한다"는 렌더
          //   아티팩트일 뿐이다. 105ms 짜리 뒤집기가 45ms 간격 재생과 겹치면 뷰가 파괴된 뒤 콜백이 도는
          //   위험 구간이 생긴다(그 사고 자체는 cardView.preDestroy 로 막았지만, 애초에 만들지 않는다).
          if (this.autoPlaying) v.showFaceNow(card);
          else v.flipToFace(card);
        } else {
          v.showFace(card);
        }
      } else {
        v.showBack();
      }
      if (initial || isNew) v.setPosition(x, y);
      else this.moveCardArc(v, x, y);
      // 자동 완성 중에는 배선하지 않는다 — 모든 입력 핸들러가 `autoPlaying` 가드로 즉시 반환하므로
      //   52장 전량 재배선(removeAllListeners+setInteractive+setDraggable)은 순수한 낭비다.
      //   재생이 끝나면 finishAutoPlay 의 syncViews() 가 한 번에 복구한다.
      if (!this.autoPlaying) this.wireCard(v, drag, proxy);
    };

    // 태블로.
    this.state.tableau.forEach((col, ci) => {
      let y = this.tabTopY;
      // **폴드(뒷면) 영역 드래그 프록시**(PO 2026-07-28) — 뒷면 카드의 드러난 띠를 잡아 끌면 그 컬럼의
      //   **오픈된 런 전체**가 끌려오게 한다. 뒷면 카드 자체는 원래 입력이 꺼져 있어 그 영역을 잡으면
      //   아무것도 안 잡혔고, 결과적으로 "맨 위 오픈 카드가 안 끌려온다"는 문제가 됐다.
      const faceUpLen = col.filter((c) => c.faceUp).length; // 뒷면은 항상 앞쪽에 몰려 있다.
      const proxy: MoveSource | undefined = faceUpLen > 0 ? { kind: 'tableau', col: ci, count: faceUpLen } : undefined;
      col.forEach((tc, idx) => {
        if (idx > 0) y += col[idx - 1].faceUp ? FACE_UP_STEP : FACE_DOWN_STEP;
        const src: MoveSource | null = tc.faceUp ? { kind: 'tableau', col: ci, count: col.length - idx } : null;
        place(tc.card, colX(ci), y, 10 + idx, tc.faceUp, src, tc.faceUp ? undefined : proxy);
      });
    });

    // 웨이스트(최상단 한 장만 표시 — 나머지는 아래 정리 단계에서 자연히 숨김).
    if (this.state.waste.length > 0) {
      const card = this.state.waste[this.state.waste.length - 1];
      place(card, colX(1), this.topY, 200, true, { kind: 'waste' });
    }

    // 파운데이션(무늬별 top 카드만 — 그 아래 카드들은 흡수된 것으로 취급, 별도 뷰 불필요).
    (['S', 'H', 'D', 'C'] as const).forEach((s, i) => {
      const rank = this.state.foundations[s];
      if (rank > 0) {
        const card: Card = { id: `${s}${rank}`, suit: s, rank: rank as Rank };
        place(card, colX(3 + i), this.topY, 200, true, null); // 파운데이션에서 다시 꺼내는 건 지원하지 않는다(스코프 최소화).
      }
    });

    // 더 이상 어디에도 없는(=이번 프레임에 안 보인) 뷰 정리 — 파운데이션에 흡수된 하위 랭크 카드 등.
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        this.arcTweens.get(v)?.stop(); // 파괴 전에 이동 트윈부터 멈춘다(죽은 뷰에 좌표 쓰기 방지).
        this.arcTweens.delete(v);
        v.destroy();
        this.views.delete(id);
      }
    }

    this.stockCountText?.setText(this.state.stock.length > 0 ? `${this.state.stock.length}` : '');
    // 웨이스트는 2장 이상일 때만 표시 — 1장이면 그 카드가 곧 전부라 숫자가 군더더기다.
    this.wasteCountText?.setText(this.state.waste.length > 1 ? `${this.state.waste.length}` : '');
    this.stockBackView?.setVisible(this.state.stock.length > 0);
    this.recycleIcon?.setVisible(this.state.stock.length === 0 && this.state.waste.length > 0);
    this.undoBtn?.setText(this.undoLabel());

    if (!this.ended && isWon(this.state)) this.onWin();
    else this.maybeAutoComplete();
  }

  /**
   * **자동 완성**(PO 2026-07-27 "카드가 대부분 맞춰졌을 때 자동플레이") — 태블로 뒷면이 0장이 되면 남은 게
   *   파운데이션에 올리는 순서뿐이라 나머지를 알아서 끝낸다. 수순 계산은 순수 로직(`planAutoComplete`)이
   *   맡고 여기서는 한 수씩 재생만 한다.
   *
   *   ⚠️ **끝까지 이기는 수순일 때만 시작한다**(PO 2026-07-27 "자동 최종 플레이시 멈추는 문제") — 예전엔
   *      뒷면 0장이면 무조건 시작해서, 올릴 카드가 떨어지면 중간에 멈춰 화면이 굳은 것처럼 보였다.
   *      이제 못 끝내는 판에서는 **아예 시작하지 않고** 조작권을 그대로 둔다.
   *   ⚠️ 재생 중 `syncViews()` 가 이 함수를 다시 부르므로 `autoPlaying` 으로 재진입을 막는다(플래그 해제는
   *      마지막 `syncViews()` **뒤에**).
   */
  private maybeAutoComplete(): void {
    if (this.ended || this.autoPlaying || this.autoRetryBlocked) return;
    if (!canAutoComplete(this.state)) return; // 싼 1차 게이트(뒷면 0장).
    const steps = planAutoComplete(this.state); // 승리로 끝나는 수순이 아니면 null.
    if (!steps) return;

    this.autoPlaying = true;
    this.hideSnapGhost();
    this.toast('자동 완성!');
    // **잠금 불가 보장** — 예상 총 소요 + 여유 안에 안 끝나면 강제로 조작권을 돌려준다(원인 불문).
    const expected = steps.reduce((ms, st) => ms + AUTO_DELAY_MS[st.kind], 0);
    const slack = steps.length * AUTO_WATCHDOG_PER_STEP_MS + AUTO_WATCHDOG_BASE_MS;
    this.autoWatchdog = this.time.delayedCall(expected + slack, () => this.finishAutoPlay(true));
    this.playAutoStep(steps, 0);
  }

  /**
   * 자동 완성 한 수 재생 — **다음 수를 그 수의 종류에 맞는 간격으로 다시 예약**한다(고정 간격 타이머 대신).
   *   손패를 도는 수(draw/recycle)는 빠르게 훑되, 화면이 멈춘 것처럼 보이지 않게 **스톡 더미를 눌러 준다**.
   */
  private playAutoStep(steps: readonly AutoStep[], i: number): void {
    if (!this.autoPlaying || i >= steps.length) {
      this.finishAutoPlay(false);
      return;
    }
    const step = steps[i];
    this.state = step.state;
    sfx('card_place');
    if (step.kind !== 'foundation') this.pulseStock(step.kind); // 손패 도는 중이라는 신호(무변화 구간 제거).
    this.syncViews();
    // 마지막 수로 승리 — **종료 절차를 반드시 탄다**. 예전엔 여기서 그냥 return 해 `autoPlaying` 이 true 로
    //   남았고, ✕(건너뛰기)가 워치독이 깨울 때까지 먹통이었다.
    if (this.ended) {
      this.finishAutoPlay(false);
      return;
    }
    this.autoTimer = this.time.delayedCall(AUTO_DELAY_MS[step.kind], () => this.playAutoStep(steps, i + 1));
  }

  /** 스톡 더미(또는 재순환 아이콘)를 짧게 눌렀다 놓아 "돌아가고 있다"를 보여준다. */
  private pulseStock(kind: AutoStepKind): void {
    if (kind === 'recycle') {
      // 재순환 아이콘은 Text 라 정상 배율이 1 이다.
      const icon = this.recycleIcon;
      if (!icon) return;
      this.tweens.killTweensOf(icon);
      icon.setScale(1);
      this.tweens.add({ targets: icon, scaleX: 0.88, scaleY: 0.88, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
      return;
    }
    // ⚠️ 카드 뷰는 **정상 배율이 1 이 아니다**(텍스처가 슈퍼샘플+여백까지 구워져 있어 ≈0.48).
    //   `setScale(1)` 을 쓰면 스톡 더미가 2배 이상으로 커진 채 남는다 → CardView.pulse 가 기준 배율을 지킨다.
    this.stockBackView?.pulse();
  }

  /**
   * 자동 완성 종료 — **정상 종료와 강제 해제가 같은 경로**를 타게 해 조작권 복귀를 한 곳에서 보장한다.
   *   `forced` = 워치독이 깨운 경우(예상 시간 안에 안 끝남). 그때만 사용자에게 알린다.
   */
  private finishAutoPlay(forced: boolean): void {
    this.autoTimer?.remove(false);
    this.autoTimer = undefined;
    this.autoWatchdog?.remove(false);
    this.autoWatchdog = undefined;
    if (!this.autoPlaying) return;
    this.autoPlaying = false;
    this.hideSnapGhost();
    // 이기지 못한 채 끝났다면 **플레이어가 한 수 둘 때까지** 다시 걸지 않는다 — 같은 수순을 즉시 재시도해
    //   무한 재시작·토스트 도배가 되는 걸 막는다(해제는 아래 조작 진입점들에서).
    this.autoRetryBlocked = !this.ended && !isWon(this.state);
    this.syncViews(); // 조작권 복귀 + 자동 완성 중 건너뛴 입력 배선을 여기서 전량 복구.
    if (forced && !this.ended) this.toast('자동 완성을 끝내지 못했어요 — 계속 진행해 주세요');
  }

  /**
   * 카드 뷰의 입력 배선 — 매 sync 마다 다시 건다(리스너 누적 방지 위해 먼저 clear).
   *   `drag` = 이 카드 자신을 잡는 소스(오픈 카드). `proxy` = 이 카드를 잡으면 **대신** 끌릴 소스
   *   (뒷면 카드의 폴드 영역 → 그 컬럼의 오픈 런). 둘 다 없으면 입력을 끈다.
   */
  private wireCard(view: CardView, drag: MoveSource | null, proxy?: MoveSource): void {
    view.removeAllListeners();
    view.disableInteractive();
    const source = drag ?? proxy;
    if (!source) return;
    const isProxy = !drag;
    view.setInteractive({ useHandCursor: true });
    this.input.setDraggable(view);
    view.on('dragstart', () => this.onDragStart(view, source, isProxy));
    // 프록시로 잡았을 때는 Phaser 가 주는 좌표가 **잡은 뒷면 카드 기준**이라, 실제로 끌리는 런의
    //   기준 카드 좌표계로 보정해서 넘긴다(offX/offY 는 dragstart 에서 계산).
    view.on('drag', (_p: Phaser.Input.Pointer, dragX: number, dragY: number) =>
      this.onDrag(dragX + (this.dragCtx?.offX ?? 0), dragY + (this.dragCtx?.offY ?? 0)),
    );
    view.on('dragend', (p: Phaser.Input.Pointer) => this.onDragEnd(p));
    view.on('pointerup', () => {
      if (this.suppressTap) {
        this.suppressTap = false;
        return;
      }
      this.tryTapToFoundation(source);
    });
  }

  // ── 드래그 ─────────────────────────────────────────────────────────
  //   ⚠️ 태블로에서 잡는 카드는 **그 컬럼의 맨 앞(프론트) 카드가 아닐 수 있다** — 유효한 런(runLengthAt)
  //   안이면 중간 카드를 잡아도 그 지점부터 앞까지 전부 같이 옮겨진다(고전 규칙). `sourceCards(source)`가
  //   반환하는 배열의 **[0]이 실제로 손가락이 닿은 카드**(count 계산 기준점), 마지막이 컬럼 맨 앞 카드다.
  private onDragStart(view: CardView, source: MoveSource, isProxy = false): void {
    if (this.ended || this.autoPlaying) return;
    const cards = this.sourceCards(source);
    if (!cards) return;
    const views = cards.map((c) => this.views.get(c.id)).filter((v): v is CardView => !!v);
    if (views.length === 0) return;
    // 자기 자신을 잡은 경우만 기준점 검사(프록시는 애초에 다른 카드를 잡은 것이라 통과시킨다).
    if (!isProxy && views[0] !== view) return; // 잡은 카드가 이 런의 기준점(뒤쪽)이 아니면 무시(방어적).
    const origPos = views.map((v) => ({ x: v.x, y: v.y }));
    views.forEach((v, i) => v.setDepth(500 + i));
    this.dragCtx = {
      source,
      views,
      origPos,
      // 프록시(폴드 영역)로 잡았으면 Phaser 좌표가 그 뒷면 카드 기준이라 런 기준 카드까지의 차이를 보정한다.
      offX: isProxy ? origPos[0].x - view.x : 0,
      offY: isProxy ? origPos[0].y - view.y : 0,
      desiredX: origPos[0].x,
      desiredY: origPos[0].y,
      visualX: origPos[0].x,
      visualY: origPos[0].y,
      magnetized: false,
      lastValidDest: null,
    };
  }

  /**
   * 자석(스냅) 기능(PO 2026-07-19) — 유효한 목적지 근처로 옮기면 손끝 위치 대신 그 목적지 쪽으로
   *   끌어당겨진다. **딱딱한 즉시 잠금이 아니라**(PO "가속도 등을 연출하여 너무 딱딱하지 않게") 목적지에
   *   가까워질수록 당김이 제곱으로 강해지는 혼합 위치를 목표로 잡고, `update()` 가 매 프레임 그 목표를
   *   향해 감속 추종(지수 보간)한다 — 자석 존 밖에서는 손끝을 지연 없이 그대로 따라간다.
   */
  private onDrag(dragX: number, dragY: number): void {
    const ctx = this.dragCtx;
    if (!ctx) return;
    const dest = this.pickDropTarget(dragX, dragY, ctx.views.length === 1);
    const validDest = dest && canMove(this.state, { from: ctx.source, to: dest });
    if (validDest) {
      ctx.lastValidDest = dest; // 이후 손을 뗀 지점이 반경을 벗어나도 이 목적지로 커밋할 수 있게 기억.
      const target = this.targetPosFor(dest, ctx.source);
      const strength = magnetStrength(Math.abs(dragX - target.x));
      ctx.desiredX = Phaser.Math.Linear(dragX, target.x, strength);
      ctx.desiredY = Phaser.Math.Linear(dragY, target.y, strength);
      ctx.magnetized = true;
      this.showSnapGhost(target); // 어디에 놓이는지 미리 보여준다(자석이 걸렸다는 신호).
    } else {
      ctx.desiredX = dragX;
      ctx.desiredY = dragY;
      ctx.magnetized = false;
      ctx.visualX = dragX; // 자석 존 밖 = 지연 없이 손끝 그대로(반응성 유지).
      ctx.visualY = dragY;
      this.applyDragVisual(ctx);
      this.hideSnapGhost();
    }
  }

  /** 자석이 걸린 목적지에 착지 미리보기(고스트) 표시 — 강해진 흡착을 눈으로 확인시켜 준다(PO 2026-07-27). */
  private showSnapGhost(target: { x: number; y: number }): void {
    this.snapGhost?.setPosition(target.x, target.y).setVisible(true);
  }

  private hideSnapGhost(): void {
    this.snapGhost?.setVisible(false);
  }

  /** 매 프레임 자석 당김 추종(자석 존 안에 있는 동안만) — Phaser 씬 생명주기 훅. */
  update(_time: number, delta: number): void {
    const ctx = this.dragCtx;
    if (!ctx || !ctx.magnetized) return;
    // 프레임레이트 무관 지수 보간 — delta(ms) 가 커도 같은 시간상수(MAGNET_FOLLOW_TAU_MS)를 유지한다.
    const k = 1 - Math.exp(-delta / MAGNET_FOLLOW_TAU_MS);
    ctx.visualX = Phaser.Math.Linear(ctx.visualX, ctx.desiredX, k);
    ctx.visualY = Phaser.Math.Linear(ctx.visualY, ctx.desiredY, k);
    this.applyDragVisual(ctx);
  }

  private applyDragVisual(ctx: DragCtx): void {
    const dx = ctx.visualX - ctx.origPos[0].x;
    const dy = ctx.visualY - ctx.origPos[0].y;
    ctx.views.forEach((v, i) => {
      v.x = ctx.origPos[i].x + dx;
      v.y = ctx.origPos[i].y + dy;
    });
  }

  /** dest 에 카드를 놓았을 때의 정확한 목표 좌표(자석 스냅용) — 파운데이션은 옮기는 카드의 무늬 열, 태블로는 그 컬럼의 다음 자리. */
  private targetPosFor(dest: MoveDest, source: MoveSource): { x: number; y: number } {
    if (dest.kind === 'foundation') {
      const cards = this.sourceCards(source);
      const suit = cards ? cards[0].suit : 'S';
      const suits: readonly Suit[] = ['S', 'H', 'D', 'C'];
      const i = Math.max(0, suits.indexOf(suit));
      return { x: colX(3 + i), y: this.topY };
    }
    return { x: colX(dest.col), y: columnNextY(this.state.tableau[dest.col], this.tabTopY) };
  }

  private onDragEnd(pointer: Phaser.Input.Pointer): void {
    const ctx = this.dragCtx;
    this.dragCtx = undefined;
    this.hideSnapGhost();
    if (!ctx) return;
    this.suppressTap = true;
    let dest = this.pickDropTarget(pointer.x, pointer.y, ctx.views.length === 1);
    if ((!dest || !canMove(this.state, { from: ctx.source, to: dest })) && ctx.lastValidDest && canMove(this.state, { from: ctx.source, to: ctx.lastValidDest })) {
      // 릴리스 지점이 정확한 반경을 벗어났어도, 드래그 도중 유효했던 마지막 목적지로 대신 커밋한다
      // (PO 2026-07-20 "카드를 빠르게 움직였을 때 자리를 잘 찾지 못하는 문제").
      dest = ctx.lastValidDest;
    }
    if (dest) this.tryApply({ from: ctx.source, to: dest });
    this.syncViews(); // 실패해도 무해 — 정확한 원위치로 스냅.
  }

  private pickDropTarget(px: number, py: number, singleCardOnly: boolean): MoveDest | null {
    if (singleCardOnly && py < this.tabTopY - CARD_H / 2) {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < 4; i++) {
        const d = Math.abs(px - colX(3 + i));
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0 && bestD < SNAP_RADIUS) return { kind: 'foundation' };
    }
    if (py < this.tabTopY - CARD_H) return null; // 스톡/웨이스트 행 근처에 놓은 건 태블로로 스냅되지 않게(파운데이션도 아니면 무효).
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < TABLEAU_COLS; i++) {
      const d = Math.abs(px - colX(i));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best >= 0 && bestD < SNAP_RADIUS ? { kind: 'tableau', col: best } : null;
  }

  private sourceCards(source: MoveSource): Card[] | null {
    if (source.kind === 'waste') {
      return this.state.waste.length > 0 ? [this.state.waste[this.state.waste.length - 1]] : null;
    }
    const col = this.state.tableau[source.col];
    if (!col || source.count <= 0 || source.count > col.length) return null;
    return col.slice(col.length - source.count).map((tc) => tc.card);
  }

  /** 탭(드래그 없이) — 단일 카드일 때만 파운데이션 자동 이동 시도. */
  private tryTapToFoundation(source: MoveSource): void {
    if (this.ended || this.autoPlaying) return;
    if (source.kind === 'tableau' && source.count !== 1) return;
    this.tryApply({ from: source, to: { kind: 'foundation' } });
    this.syncViews();
  }

  private tryApply(move: KlondikeMove): boolean {
    if (!canMove(this.state, move)) return false;
    this.autoRetryBlocked = false; // 플레이어가 한 수 뒀다 — 자동 완성을 다시 평가할 가치가 생겼다.
    this.pushHistory();
    const next = applyMove(this.state, move);
    if (!next) {
      this.history.pop();
      return false;
    }
    this.state = next;
    sfx('card_place');
    return true;
  }

  // ── 스톡/웨이스트 ──────────────────────────────────────────────────
  private onStockTap(): void {
    if (this.ended || this.autoPlaying) return;
    if (this.state.stock.length === 0 && this.state.waste.length === 0) return; // 둘 다 비었으면 무반응.
    this.autoRetryBlocked = false; // 뽑기/재순환도 상태 변경 — 자동 완성 재평가 가능.
    this.pushHistory();
    this.state = this.state.stock.length > 0 ? drawFromStock(this.state) : recycleWaste(this.state);
    sfx('card_deal');
    this.syncViews();
  }

  // ── 되돌리기(유일한 부스터 — PO: "되돌리기 아이템 외에는 와일드카드나 +카드 아이템이 없다") ──
  private pushHistory(): void {
    this.history.push(this.state);
    if (this.history.length > 60) this.history.shift();
  }

  private undoPrice(): number {
    return undoPriceAt(this.level, this.chMult);
  }

  private doUndo(): void {
    if (this.ended || this.autoPlaying) return;
    if (this.history.length === 0) {
      this.toast('되돌릴 수 없어요');
      return;
    }
    const s = loadSave();
    const it = itemsOf(s);
    if (it.undo > 0) {
      it.undo -= 1;
      s.items = it;
      writeSave(s);
    } else {
      const price = this.undoPrice();
      if (s.coins < price) {
        sfx('no_coin');
        this.toast('코인이 부족해요 — ☰ 메뉴 › 🛒 상점에서 충전할 수 있어요');
        return;
      }
      s.coins -= price;
      writeSave(s);
      this.header?.setCoins(s.coins);
    }
    this.autoRetryBlocked = false; // 되돌리기로 상태가 바뀌었다.
    this.state = this.history.pop()!;
    sfx('undo');
    this.syncViews();
  }

  // ── 승리 ───────────────────────────────────────────────────────────
  private onWin(): void {
    this.ended = true;
    sfx('win_fanfare');
    const stars = 3; // PO 2026-07-19: "승리=고정 3★"(단순, 미션리워드 파이프라인 SETS_TARGET 스케일과 호환).
    const coins = starCoinsAt(this.level, stars, this.chMult);
    const save = loadSave();
    save.coins += coins;
    // 진행도는 PlayScene 이 메인 레벨을 클리어할 때 이미 확정했다 — 여기선 안전망(개발용 강제 진입 대비)일 뿐.
    save.level = Math.min(MAX_PROGRESS_LEVEL, Math.max(save.level, this.level + 1));
    const now = Date.now();
    const result = applyMissionStars(missionRewardOf(save, now), stars, now);
    save.missionReward = result.state;
    writeSave(save);
    this.header?.setCoins(save.coins);
    this.time.delayedCall(500, () => this.showWinPopup(coins));
  }

  private showWinPopup(coins: number): void {
    const layer = this.add.container(0, 0).setDepth(3000);
    layer.add(this.add.rectangle(0, 0, W, H, 0x0a0a1a, 0.85).setOrigin(0, 0).setInteractive());
    const cx = W / 2;
    const cy = H / 2;
    layer.add(
      this.add
        .text(cx, cy - 260, '🎉 CLEAR!', { fontFamily: '"Jua", sans-serif', fontSize: '80px', color: '#ffe066', stroke: '#7a2d9a', strokeThickness: 10 })
        .setOrigin(0.5),
    );
    layer.add(this.add.text(cx, cy - 140, `+🪙 ${coins.toLocaleString()}`, { fontFamily: '"Jua", sans-serif', fontSize: '54px', color: '#ffffff' }).setOrigin(0.5));
    const nextBtn = this.add
      .text(cx, cy + 40, '다음 레벨 ▶', { fontFamily: '"Jua", sans-serif', fontSize: '52px', color: '#ffffff', backgroundColor: '#4caf50', padding: { x: 40, y: 20 } })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    nextBtn.on('pointerdown', () => {
      sfx('button');
      layer.destroy();
      this.enterNextLevel();
    });
    layer.add(nextBtn);
    const homeBtn = this.add
      .text(cx, cy + 170, '🏠 홈으로', { fontFamily: '"Jua", sans-serif', fontSize: '36px', color: '#dddddd' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    homeBtn.on('pointerdown', () => {
      sfx('level_close');
      layer.destroy();
      this.scene.start('home');
    });
    layer.add(homeBtn);
    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 200 });
  }

  /**
   * 다음 **메인 레벨** 진입 팝업 — entryPopup.ts 공용(홈/PlayScene 과 동일 화면).
   *   승리했든 ✕로 건너뛰었든 같은 곳으로 나온다(보너스 결과는 진행에 영향 없음, PO 2026-07-27).
   *   `this.level` 이 보너스를 연 메인 레벨(10)이므로 다음은 11 이다.
   */
  private enterNextLevel(): void {
    const next = this.level + 1;
    const handle = buildEntryPopup(this, {
      level: next,
      initialMult: this.chMult,
      toast: (m) => this.toast(m),
      onPlay: ({ level: lv, mult }) => this.scene.start('play', { level: lv, mult }),
      onHome: () => this.scene.start('home'), // 팝업 하단 홈 버튼(PlayScene 과 동일).
    });
    if (!handle) this.scene.start('home'); // blank.json 미로드(사실상 발생 안 함) — 안전 폴백.
  }

  // ── 메뉴(☰) — 사운드 토글 + 홈으로. 와일드/+5 부스터 없음(되돌리기만 지원). ──
  private openMenu(): void {
    if (this.autoPlaying) return; // 다른 진입점과 동일 — 재생 중 홈 이탈 차단(상태 꼬임 방지).
    sfx('button');
    const layer = this.add.container(0, 0).setDepth(3000);
    layer.add(this.add.rectangle(0, 0, W, H, 0x140a1e, 0.88).setOrigin(0, 0).setInteractive());
    layer.add(
      this.add
        .text(W / 2, 620, '⚙ 메뉴', { fontFamily: '"Jua", sans-serif', fontSize: '80px', color: '#ffe066', stroke: '#7a2d9a', strokeThickness: 9 })
        .setOrigin(0.5),
    );
    const mk = (y: number, label: string, bg: string, fn: () => void): Phaser.GameObjects.Text => {
      const t = this.add
        .text(W / 2, y, label, {
          fontFamily: '"Jua", sans-serif',
          fontSize: '52px',
          color: '#ffffff',
          backgroundColor: bg,
          padding: { x: 40, y: 26 },
          align: 'center',
          fixedWidth: 620,
        })
        .setOrigin(0.5)
        .setShadow(0, 4, '#00000066', 8)
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', fn);
      layer.add(t);
      return t;
    };
    // **상점**(PO 2026-07-29 "게임플레이시 숍메뉴에 접근할 수 있어야 함") — 보너스 라운드도 되돌리기에
    //   코인을 쓰므로 PlayScene 과 동일하게 메뉴에서 연다(같은 itemShop.ts 화면).
    mk(760, '🛒 상점', '#c25e00', () => {
      sfx('button');
      openItemShop(this, {
        depth: 4500,
        onCoins: (total) => {
          this.header?.setCoins(total);
          this.undoBtn?.setText(this.undoLabel()); // 살 수 있게 된 되돌리기 가격 표기 갱신.
        },
        onDiamonds: (total) => this.header?.setDiamonds(total),
        toast: (msg) => this.toast(msg),
      });
    });
    // **사운드 볼륨**(PO 2026-07-28) — PlayScene 메뉴와 동일하게 단계 순환(100→75→50→25→꺼짐).
    const snd = mk(880, volumeLabel(), '#4a3a5a', () => {
      const v = cycleVolume();
      snd.setText(volumeLabel());
      if (v > 0) sfx('button');
    });
    mk(1000, '🏠 홈으로', '#c0392b', () => {
      sfx('level_close');
      layer.destroy();
      this.scene.start('home');
    });
    mk(1120, '▶ 계속하기', '#2e9e4f', () => {
      sfx('level_close');
      layer.destroy();
    });
  }

  private toast(msg: string): void {
    const t = this.add
      .text(W / 2, H - 320, msg, { fontFamily: '"Jua", sans-serif', fontSize: '36px', color: '#ffffff', backgroundColor: '#2a1830dd', padding: { x: 28, y: 14 }, align: 'center' })
      .setOrigin(0.5)
      .setDepth(1600);
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 40, duration: 1100, delay: 800, onComplete: () => t.destroy() });
  }
}
