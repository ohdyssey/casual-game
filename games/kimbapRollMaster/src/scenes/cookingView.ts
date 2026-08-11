/**
 * cookingView.ts — 조리 상태머신(logic/cookingFlow)을 에디터 화면에 배선하는 컨트롤러.
 *
 * 좌표는 코드에 적지 않는다. 전부 레이아웃 노드(SSOT)에서 읽어 파생시킨다.
 */
import Phaser from 'phaser';
import { GAME_FONT_FAMILY, GAME_FONT_STYLE, applyGameFont } from '../ui/font.js';
import { TEX_RICE_LUMP } from '../assets.js';
import {
  sfx,
  sfxChop,
  sfxIngredientPlace,
  sfxPlatePiece,
  sfxResult,
  sfxStar,
  spreadLoop,
  stopSpreadLoop,
} from '../audio.js';
import { stageProgress, stageRemainingMs } from '../logic/stage.js';
// 손끝 피드백 — 코어 공용(미지원 기기에서는 조용히 아무 일도 안 한다).
import { haptics } from '@casual/core';

/** 큐에서 같은 입력인지 가릴 때 쓰는 열쇠(참기름/깨소금 구분). */
const queueKey = (a: CookAction): string =>
  a.type === 'season' ? a.id : a.type === 'pickIngredient' ? a.id : a.type;

/**
 * **연출이 도는 동안 눌러 둘 수 있는 입력** — 마무리 네 가지(참기름·칼·깨소금·종)에
 * **밥통과 재료**를 더한다.
 *
 * ⚠️⚠️ 여러 줄 주문(×2·×3)은 줄과 줄 사이에 조리대를 비우는 연출이 돌고, 한 줄을 마칠 때도
 * 말기 1초 · 칼질 1.6초 · 담기 1초가 흘러간다. 그동안 **다음 줄의 밥통을 눌러도 아무 일이 없으면**
 * 「먹통」으로 읽히고, 빠듯한 제한시간에서 그 뜸이 곧 손해다.
 * 그래서 **순서대로 눌러 둔 것은 차례가 오는 즉시 이어서 진행한다**(`flushPending`).
 *
 * ⚠️ 넣지 않는 것 — `spreadAt`(드래그라 눌러 둘 수 없다) · `roll`(스와이프) · `chooseMenu`
 *    (카드는 이 큐가 아니라 **예약**으로 따로 다룬다 — `CookingView.reserved`).
 */
const QUEUEABLE = new Set<CookAction['type']>(['pickIngredient']);
import {
  actionStage,
  autoAdvance,
  canReserve,
  isUpcoming,
  CHOP_TOTAL,
  SPREAD_COLS,
  SPREAD_ROWS,
  currentOrder,
  currentTray,
  formatClock,
  initialState,
  pickProgress,
  reduce,
  remainingMsOf,
  waitRatioOf,
  type CookAction,
  type CookEffect,
  type NudgeHint,
  type CookState,
  type SeasoningId,
} from '../logic/cookingFlow.js';
import { INGREDIENT_LABEL, type IngredientId } from '../logic/ingredients.js';
import { MENU_LABEL, MENU_PIECE_TEX } from '../logic/menu.js';
import { FORBIDDEN_PENALTY, extraCost } from '../logic/economy.js';
import { BALANCE_BONUS, type ScoreResult } from '../logic/scoring.js';
import type { LayoutIndex } from '../ui/layoutLoader.js';
import {
  COOKED_NODES,
  CUT_LAYER_DEPTH_BASE,
  CUT_MARK_NODES,
  CUT_NODE,
  NODE,
  PLATE_DEPTH_BASE,
  PLATE_NODE,
  PLATE_PIECE_NODES,
  rollDepths,
  stripDepth,
  ROLL_STEP1_NODE,
  ROLL_STEP2_NODE,
  SEASON_DEPTH,
  STAR_DEPTH,
  SEASON_NODE,
  SPREAD_HAND_DEPTH,
  STRIP_SAMPLE_EXTRA_NODES,
  STRIP_SAMPLE_NODE,
  TRAY_SLOT_HIT,
  designRect,
  image,
  restore,
  snapshot,
  type DesignRect,
  type Transform,
} from './cookingNodes.js';
import { CheckBadge, type CheckTone } from './checkBadge.js';
import { burstCoins, registerCoinSpin } from './coinBurst.js';
import { IngredientStrips } from './ingredientStrips.js';
import { markCostTipSeen, seenCostTip } from '../costTipStore.js';
import { CostTip } from './costTip.js';
import { Customers } from './customers.js';
import { RecipePanel } from './recipePanel.js';
import { MenuCardView } from './menuCards.js';
import { ResultStars } from './resultStars.js';
import { ServeGlow } from './serveGlow.js';
import { MissionPanel } from './missionPanel.js';
import { RiceScoop, SpreadHand } from './riceHands.js';
import { StageTimer } from './stageTimer.js';
import { TrayShelf } from './trayStacks.js';
import { playRollSequence, type RollFrame } from './rollSequence.js';
import { GRAIN_POOL_SIZE, SEASON_SWEEP_MS, makeGrainTexture, playOilSweep, playSesameSweep } from './seasoning.js';

/** 말기로 인정할 최소 위쪽 스와이프 거리(디자인 px). */
const ROLL_SWIPE_DISTANCE = 80;
/** 말기 스와이프를 시작해도 되는 범위 — 대나무발 주변까지 넉넉히 인정한다. */
const ROLL_AREA_INFLATE = 1.25;
/** 밥 브러시 — 반투명 방사형 스탬프를 겹쳐 찍어 불규칙한 가장자리를 만든다. */
const BRUSH_TEXTURE_KEY = 'kbrm_rice_brush';
const BRUSH_CANVAS_SIZE = 128;
/** 스탬프 한 번의 기준 지름(디자인 px). */
const BRUSH_SIZE = 210;
/** 진행도로 인정할 반경 — 붓이 덮은 범위 전체. 한 번 휘저으면 세 줄이 통째로 칠해진다. */
const BRUSH_COVER_RADIUS = BRUSH_SIZE * 0.48;
/** 드래그 궤적을 이 간격으로 잘게 나눠 찍는다(빠르게 그어도 끊기지 않도록). */
const BRUSH_STEP = 24;
const BRUSH_MAX_STEPS = 20;

/** 마지막 이만큼은 카드 시계가 붉어지고 **매초 재촉 소리**가 난다(숫자는 띄우지 않는다). */
/** 몇 연속부터 「콤보」로 축하하는가. 첫 완벽은 그냥 완벽이고, 이어 가야 콤보다. */
const PERFECT_COMBO_MIN = 2;
const CLOCK_URGENT_MS = 10_000;
const COUNTDOWN_FROM = 10;
/** 타이머 갱신 주기 — 연출 중(busy)에는 멈춘다. */
const TICK_MS = 100;

/**
 * 고른 재료는 진열에서 흐려진다.
 * ⚠️ **너무 흐리면 무엇이었는지 안 보인다** — 이미 담았다는 표시(체크)는 따로 붙으므로,
 * 여기서는 「손댈 수 없다」만 알리면 된다. 0.3 은 거의 사라져 보여서 올렸다.
 */
const TRAY_DIM_ALPHA = 0.62;
/** 토스트(재료 이름·썰기 횟수)를 붙잡아 두는 시간 — 짧으면 읽기도 전에 사라진다. */
const TOAST_HOLD_MS = 1100;
/** 자동 칼질 한 번의 간격 — 칼이 내리치고 다음 칼집으로 옮겨 가는 데 걸리는 만큼. */
const CHOP_STEP_MS = 180;
/** 김밥 위에 떠서 「여기를 누르세요」를 알리는 칼의 투명도. */
const GHOST_KNIFE_ALPHA = 0.4;
/** 접시가 내려오고 조각이 하나씩 담기는 박자. */
const PLATE = { rise: 240, firstPieceAt: 300, stagger: 45, pieceIn: 190 } as const;
/**
 * 마무리 손이 **다 지나가기 전에** 다음 단계를 시작한다 — 이 비율 지점에서 넘긴다.
 * 손이 멎기를 기다렸다 넘기면 매번 0.7~1.3초씩 멈춰 선 것처럼 보인다. 빠듯한 제한시간에서는
 * 그 뜸이 곧 손해다. **약간 겹치더라도** 곧바로 다음 동작이 시작되는 편이 훨씬 시원하다.
 */
const SEASON_HANDOFF = 0.35;
/** 손님에게 내미는 데 걸리는 시간과, 멀어지며 작아지는 정도. */
const SERVE_MS = 520;
const SERVE_SHRINK = 0.78;
/** 미리 깔리는 재료가 한 장씩 얹히는 간격. 밥을 편 직후라 여유를 오래 줄 수 없다. */
const PRESET_STEP_MS = 90;

/** 살짝 편 뒤 나머지가 저절로 퍼지는 연출 — 위에서 아래로 훑는다. */
const AUTO_SPREAD_ROWS = 5;
const AUTO_SPREAD_COLS = 6;
const AUTO_SPREAD_STEP_MS = 45;

const DEPTH = { trayCheck: 60, counter: 90, money: 90, chopText: 140, zone: 100 } as const;


/** 달러 표기. `signed` 면 이번 주문의 증감으로 읽히도록 부호를 붙인다. */
const formatMoney = (v: number, signed = false): string =>
  signed ? `${v >= 0 ? '+' : '−'}$${Math.abs(v)}` : `$${v}`;


/**
 * 앞질러 누른 입력에 붙이는 한 줄 안내 — **실패시키지 않고 알려만 준다**(`CookEffect.nudge`).
 * 밥도 안 편 채 재료를 집는 건 순서를 통째로 어긴 것이 아니라 한 단계를 앞지른 것뿐이라,
 * 주문을 날리는 대신 무엇을 먼저 해야 하는지 일러 준다.
 */
const NUDGE_TEXT: Record<NudgeHint, string> = {
  spreadRice: '밥을 펴세요',
};

/** 재료 카운터를 띄우는 단계 — 주문을 고른 뒤부터 말기 전까지. */
const COUNTER_STAGES = new Set<CookState['stage']>(['riceLump', 'riceSpread', 'filled']);

/**
 * **처음 여덟 주문 동안** 단계별로 무엇을 할지 한 줄로 알려 준다.
 * ⚠️ 이 한 줄이 **이 게임의 유일한 안내**다(별도 튜토리얼은 걷어냈다) — 그래서 넉넉히 보여 준다.
 * 조작을 익히고 나면 화면을 가리기만 하므로 그 뒤로는 사라진다
 * (재료 카운터는 안내가 아니라 정보라서 계속 남는다).
 */
const GUIDE_ORDERS = 8;

const STAGE_GUIDE: Partial<Record<CookState['stage'], string>> = {
  menu: '① 주문 카드를 탭하세요',
  // ⚠️ 밥통 단계는 없앴다 — 발·김과 마찬가지로 **밥덩이까지 저절로 올라온다.**
  //    매판 똑같이 한 번 더 탭하는 건 판단할 거리가 없는 손품이었다.
  riceLump: '② 김 위를 문질러 밥을 펴세요',
  // ③ 은 재료 단계 — 카운터와 한 줄을 나눠 쓴다(`guideLabel`).
  filled: '④ 아래에서 위로 쓸어 말기',
  // ⚠️ 마무리 두 줄은 **일부러 짧다** — 같은 줄에 남은 시간을 붙이기 때문이다(`guideLabel`).
  //    20자를 넘기면 1080 폭에서 글자가 잘려 나간다.
  rolled: '⑤ 참기름 또는 칼질',
  plated: '⑥ 깨소금 또는 종',
};

/**
 * **말고 난 뒤부터 종까지** — 이 구간에는 남은 시간을 한 줄에 띄운다.
 *
 * ⚠️⚠️ 이 구간은 **입력이 잠긴 채 연출이 1~2초씩 도는데 시계는 계속 흐른다**(`clockHold` 를 걸지 않는다).
 * 그래서 플레이어가 할 수 있는 일이 없는 동안에도 시간이 다 될 수 있는데, 예전에는 그 사이
 * 화면에 남은 시간이 **어디에도 크게 보이지 않아** 「왜 갑자기 실패했는지」를 알 수 없었다.
 * 카드에 붙은 작은 숫자만으로는 조리대를 보고 있는 눈에 들어오지 않는다.
 */
const FINISH_COUNT_STAGES = new Set<CookState['stage']>(['rolled', 'cutting', 'plating', 'plated']);

/**
 * 미션 완수 배너를 늦추는 시간 — **별이 다 뜬 뒤**에 온다.
 * ⚠️ 같이 터뜨리면 별·결과 줄·배너가 한자리에서 겹쳐 셋 다 안 읽힌다.
 */
const MISSION_BANNER_DELAY_MS = 1_100;

/** 눌러 둘 수 있는 입력의 최대 개수 — 한 줄에 담는 재료 수보다 조금 넉넉하게. */
const PENDING_MAX = 10;

/** 정산 결과를 한 줄에 붙잡아 두는 시간 — 접시가 날아가는 동안 계속 보인다. */
const STAMP_HOLD_MS = 1_800;

/** 실패 사유 — 한 줄에 들어가도록 짧게(자세한 설명은 결과 화면이 한다). */
const FAIL_SHORT: Partial<Record<NonNullable<ScoreResult['failReason']>, string>> = {
  timeout: '시간 초과',
  required: '필수 재료 누락',
  core: '핵심 재료 누락',
  sequence: '조리 순서',
};

/** 한 줄의 글자색 — 평소는 크림, 촉박하면 붉게, 완성이면 초록, 실패면 빨강. */
const PILL_INK = {
  normal: '#fff6e2',
  urgent: '#ffb4a2',
  done: '#9ef0a8',
  fail: '#ff9c8f',
} as const;

/** 알약 배경 — 글자 길이에 맞춰 다시 그린다. */
/**
 * 알약 배경 — 글자 길이에 맞춰 다시 그린다.
 * ⚠️ **글자가 길면 화면 밖으로 나간다**(1080 폭). 한 줄은 스무 자 안쪽으로 적을 것 —
 * 예전 마무리 안내가 서른 자를 넘겨 양끝이 잘려 나갔다.
 */
const GUIDE_PILL = { h: 84, padX: 48, minW: 320, maxW: 1000 } as const;

export class CookingView {
  private state: CookState = initialState();
  /** 연출 중에는 입력을 받지 않는다. */
  private busy = false;
  /**
   * 시계를 멈춰야 하는 구간 — **컷신(말기·서빙)만**이다.
   * ⚠️ 입력 잠금(`busy`)과 **같지 않다**. 칼질은 플레이어가 스스로 낸 동작이 풀려 나가는 것이라
   *    입력만 잠그고 시계는 계속 흐른다(멈추면 그 2초가 공짜가 된다).
   */
  private clockHold = false;
  /** 자동 칼질로 예약해 둔 연출들 — 시간이 다 되면 도중에 걷어내야 한다. */
  private chopEvents: Phaser.Time.TimerEvent[] = [];
  /**
   * **손님 쪽으로 날아가는 중인 접시·조각.** 서빙 연출이 끝나기를 기다리지 않고 다음 주문을 걸기 때문에,
   * 이 물건들은 이미 「지난 주문의 것」이면서 아직 화면에 떠 있다.
   * ⚠️ `clearBoard` 가 이것들을 건드리면 안 된다 — 트윈을 끊고 저작 자리로 되돌려 버려서
   *    날아가던 접시가 **손님 코앞에서 순간이동해 사라진다.** 다 날아간 뒤 `landServeFlight` 가 치운다.
   */
  private servingAway: Phaser.GameObjects.Image[] = [];

  /**
   * 노드의 디자인 상태(위치·크기·투명도).
   * ⚠️ **키는 반드시 객체**다. main 과 main_copy 는 같은 id 를 다른 뜻으로 쓴다
   * (main 의 layer_3=김밥발 · main_copy 의 layer_3=김밥, layer_4=김 vs 칼집)
   * — id 문자열로 키를 잡으면 서로 덮어써서 김밥발이 김밥 크기로 줄어든다.
   */
  private readonly base = new Map<Phaser.GameObjects.Image, Transform>();
  private readonly matRect: DesignRect;
  private readonly riceRect: DesignRect;

  /** 눌림 피드백의 기준 크기 — 연타로 트윈이 겹쳐도 원래 크기를 잃지 않도록 한 번만 기록한다. */
  private readonly restScale = new Map<Phaser.GameObjects.Image, { readonly sx: number; readonly sy: number }>();

  /** 밥이 드러난 범위를 담는 텍스처(비트맵 마스크 원본) — 알파가 그대로 밥의 투명도가 된다. */
  private riceRT?: Phaser.GameObjects.RenderTexture;
  /** 스탬프용 붓(화면에 붙이지 않고 riceRT 에 찍기만 한다). */
  private brush?: Phaser.GameObjects.Image;
  private lastStamp?: { readonly x: number; readonly y: number };

  private lump?: Phaser.GameObjects.Image;
  /** 밥덩이의 기준 스케일 — 사라질 때 줄어들므로 주문마다 여기로 되돌린다. */
  private lumpScale = 1;
  private lumpFading = false;
  /** 다 말린 김밥 — 썰기 화면(main_copy)에 저작된 노드를 그대로 쓴다. */
  private roll?: Phaser.GameObjects.Image;
  /** 칼집 8개(오른쪽→왼쪽). 한 번 썰 때마다 하나씩 드러난다. */
  private cutMarks: readonly Phaser.GameObjects.Image[] = [];
  /** 손에 쥔 썰기용 칼 — 칼집을 따라 왼쪽으로 옮겨 간다. */
  private cutKnife?: Phaser.GameObjects.Image;
  /**
   * 접시를 **조리대 한가운데로 내려 놓기** 위한 이동량(저작 자리 → 조리대 중앙).
   * ⚠️ 저작된 접시 자리(`main_copy2` 의 `up_Item_12`)는 **손님 쪽**이다 —
   *    거기가 곧 「내미는 자리」라서, 담을 때만 조리대로 끌어내렸다가 서빙 때 제자리로 돌려보낸다.
   */
  private plateShift = { x: 0, y: 0 };
  /** 조리대에 내려 놓았을 때의 접시 자리 — 깨소금은 여기 위를 훑는다. */
  private plateRect?: DesignRect;
  /** 반투명 칼의 맥동 트윈 — 썰기 시작하면 끊는다. */
  private ghostTween?: Phaser.Tweens.Tween;
  /** 말기 중간 키프레임(에디터의 말기1·말기2 화면). */
  private rollStep1?: RollFrame;
  private rollStep2?: RollFrame;
  /** 서빙 접시와 그 위에 담기는 조각들. */
  private plate?: Phaser.GameObjects.Image;
  private platePieces: readonly Phaser.GameObjects.Image[] = [];
  /** 조각의 저작 높이 — 종류마다 원본 크기가 달라 텍스처를 갈아 끼운 뒤 이 높이로 맞춘다. */
  private pieceHeight = 80;
  /** 마무리 손(참기름 붓 · 깨 뿌리는 손)과 깨 알갱이 풀. */
  private oilHand?: Phaser.GameObjects.Image;
  private sesameHand?: Phaser.GameObjects.Image;
  private grains: readonly Phaser.GameObjects.Image[] = [];
  /** 칼질 반동 트윈 — 이것만 따로 끊는다(칼집 등장 트윈까지 죽이면 투명한 채로 남는다). */
  private shakeTween?: Phaser.Tweens.Tween;
  private bellPulse?: Phaser.Tweens.Tween;

  private cards?: MenuCardView;
  private strips?: IngredientStrips;
  /** 밥통에서 밥을 퍼 오는 주걱과, 밥을 문지르는 흰 손. */
  /** 아직 차례가 아니어서 눌러 둔 마무리 입력(`dispatch` 참조). */
  private pending: CookAction[] = [];
  private scoop?: RiceScoop;
  private spreadHand?: SpreadHand;
  /** 화면 가운데 스테이지 시계(분침 한 바퀴 = 3분) + 명판의 처리량. */
  private stageTimer?: StageTimer;
  private stars?: ResultStars;
  /** 접시가 나갈 때 터지는 빛 — 완성도(별)에 따라 세기가 갈린다. */
  private serveGlow?: ServeGlow;
  /** 이 판의 미션 세 칸 — 주문마다 한 칸씩 차오른다. */
  private missions?: MissionPanel;
  /**
   * 하단 진열 12칸 — **판마다 담기는 재료가 갈린다**(재료는 23종, 칸은 12개).
   * 「어느 재료가 어느 자리에 있나」는 여기 물어본다.
   */
  private tray?: TrayShelf;
  /** **자리마다**의 「선택됨」 체크 — 재료가 아니라 칸에 붙는다(칸의 내용은 판마다 갈린다). */
  private readonly slotChecks: CheckBadge[] = [];
  /** 좌상단 배지의 레벨 숫자(저작 노드). */
  private levelText?: Phaser.GameObjects.Text;
  /** 정산 결과를 한 줄에 붙잡아 두는 동안의 글자(시간이 지나면 원래 안내로 돌아간다). */
  private pillStamp?: { readonly text: string; readonly color: string; readonly until: number };
  private lastCountSec = 0;
  private counter?: Phaser.GameObjects.Text;
  private counterPad?: Phaser.GameObjects.Graphics;
  private money?: Phaser.GameObjects.Text;
  /** 조리대 오른쪽 메뉴판 — 고른 주문의 레시피·필수·금지가 여기 적힌다. */
  private recipe?: RecipePanel;
  /** 양옆에 선 손님 두 사람 — 살짝살짝 흔들리고, 주문이 바뀌면 다른 사람으로 갈린다. */
  private customers?: Customers;
  /** 한 판을 끝내고 딱 한 번 뜨는 재료값 알림. */
  private costTip?: CostTip;
  /** 그 알림을 이미 봤는가 — 다음 실행에서도 조용하도록 기록에 남긴다. */
  private costTipSeen = seenCostTip();
  private toast?: Phaser.GameObjects.Text;

  private swipeStart?: { readonly x: number; readonly y: number };
  private lastClock = '';
  private lastGuide = '';
  /** 재료를 다 채운 순간(옅은→짙은 체크)을 한 번만 알리려고 직전 상태를 기억한다. */
  private lastCheckTone: CheckTone = 'light';
  /** 카드별 「시간 얼마 안 남음」 알림을 카드마다 한 번씩만 낸다. */

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: LayoutIndex,
    /** 상태 화면(썰기·말기1·말기2)에서 골라 온 노드들. 없으면 그 연출만 생략된다. */
    private readonly stateLayers: {
      readonly cut?: LayoutIndex;
      readonly roll1?: LayoutIndex;
      readonly roll2?: LayoutIndex;
      readonly season?: LayoutIndex;
    } = {},
  ) {
    const fallback: DesignRect = { cx: 540, cy: 1354, w: 512, h: 520 };
    this.matRect = designRect(layout, NODE.mat) ?? fallback;
    this.riceRect = designRect(layout, NODE.rice) ?? fallback;
  }

  /** 헤드리스 검증용 — 현재 진행 상태(읽기 전용). */
  get debugState(): CookState {
    return this.state;
  }

  start(): void {
    this.captureBaseTransforms();
    this.buildRuntimeObjects();
    this.wireTools();
    this.wireTray();
    this.wireCookingZone();
    this.customers = new Customers(this.scene, this.layout);
    this.costTip = new CostTip(this.scene);
    this.startTimer();
    // 첫 판의 미션은 `initialState` 가 이미 뽑아 두었다 — 화면에 걸기만 한다.
    this.missions?.setMissions(this.state.missions);
    this.resetBoard();
  }

  // ── 초기화 ────────────────────────────────────────────────────────────────

  /** 디자인 상태(위치·스케일·투명도)를 저장해 두고 주문마다 되돌린다. */
  private captureBaseTransforms(): void {
    for (const id of COOKED_NODES) {
      const obj = image(this.layout, id);
      if (obj) this.base.set(obj, snapshot(obj));
    }
    // 탭 대상(용기 — 중복 선택 시 흔들린다)도 원래 상태가 필요하다.
    // 진열 재료 그림은 다발 복제까지 끝난 뒤(buildTrayStacks) 따로 기록한다.
    for (const id of TRAY_SLOT_HIT) {
      const obj = image(this.layout, id);
      if (obj) this.base.set(obj, snapshot(obj));
    }
    const bell = image(this.layout, NODE.bell);
    if (bell) this.base.set(bell, snapshot(bell));
  }

  /** 이 객체의 디자인 상태. */
  private baseOf(obj: Phaser.GameObjects.Image | undefined): Transform | undefined {
    return obj ? this.base.get(obj) : undefined;
  }

  /** 조리대(main) 노드와 그 디자인 상태를 함께 꺼낸다. */
  private nodeOf(id: string): { obj: Phaser.GameObjects.Image; t: Transform } | undefined {
    const obj = image(this.layout, id);
    const t = this.baseOf(obj);
    return obj && t ? { obj, t } : undefined;
  }

  private buildRuntimeObjects(): void {
    const { scene } = this;
    const rice = image(this.layout, NODE.rice);

    // 밥 펴기 — 문지른 자리만 드러나도록 비트맵 마스크를 씌운다.
    // (기하 마스크는 켜짐/꺼짐뿐이라 사각형으로 뚝뚝 끊긴다. 비트맵 마스크는 알파를 그대로 써서
    //  붓 가장자리의 반투명이 밥의 반투명이 된다 → 자연스럽게 번지듯 퍼진다.)
    if (rice) {
      const rt = scene.make.renderTexture(
        { x: this.riceRect.cx, y: this.riceRect.cy, width: this.riceRect.w, height: this.riceRect.h },
        false,
      );
      rt.setOrigin(0.5, 0.5);
      this.riceRT = rt;
      rice.setMask(rt.createBitmapMask());
    }
    this.brush = this.makeBrush();

    // 밥덩이(Item_06-1) — 밥통을 누르면 김 위에 올라오고, 펴는 만큼 작아진다.
    if (scene.textures.exists(TEX_RICE_LUMP)) {
      const lump = scene.add.image(this.riceRect.cx, this.riceRect.cy, TEX_RICE_LUMP);
      this.lumpScale = (this.riceRect.w * 0.55) / lump.width;
      lump.setScale(this.lumpScale).setDepth((rice?.depth ?? 7) + 0.5);
      this.lump = lump.setVisible(false);
    }

    // 스테이지 시계 — 저작된 시계판과 분침을 그대로 쓴다.
    const minuteHand = image(this.layout, NODE.stageHand);
    const minuteRect = designRect(this.layout, NODE.stageHand);
    this.stageTimer = new StageTimer(
      scene,
      designRect(this.layout, NODE.stageClock) ?? null,
      minuteHand && minuteRect ? { obj: minuteHand, rect: minuteRect } : null,
      this.layout.tryById<Phaser.GameObjects.Text>(NODE.stageCount),
    );

    // 밥주걱 — 저작된 자리에서 출발해 밥을 퍼 오고 제자리로 돌아간다.
    this.scoop = new RiceScoop(scene, image(this.layout, NODE.scoop));
    // 밥을 펴는 흰 손 — 저작된 「김밥마는 손」에서 그림과 크기만 빌린다(그 노드는 말기가 쓴다).
    const handArt = image(this.layout, NODE.handLeft);
    const handRect = designRect(this.layout, NODE.handLeft);
    this.spreadHand = new SpreadHand(
      scene,
      handArt && handRect ? { key: handArt.texture.key, w: handRect.w, h: handRect.h } : null,
      SPREAD_HAND_DEPTH,
    );

    // 재료 스트립 — 저작 본보기 한 줄에서 길이·위치를 읽는다(본보기 자체는 감춘다).
    const sample = designRect(this.layout, STRIP_SAMPLE_NODE);
    // 본보기로 저작된 줄들은 실제 스트립이 대신하므로 전부 감춘다.
    for (const id of [STRIP_SAMPLE_NODE, ...STRIP_SAMPLE_EXTRA_NODES]) image(this.layout, id)?.setVisible(false);
    if (sample) this.strips = new IngredientStrips(scene, sample, stripDepth(this.layout));

    this.buildTrayStacks();

    this.cards = new MenuCardView(scene, this.layout);
    this.cards.setOnPick((slot) => this.dispatch({ type: 'chooseMenu', slot }));

    this.adoptCutLayer();

    this.stars = new ResultStars(scene, { x: this.matRect.cx, y: this.matRect.cy - this.matRect.h * 0.1 });
    // 미션 줄 — 잔고 아래 · 카드 위의 빈 띠. 배너는 별보다 위쪽에 뜬다(겹치면 둘 다 안 읽힌다).
    this.missions = new MissionPanel(scene, DEPTH.money, STAR_DEPTH + 6, {
      x: this.matRect.cx,
      y: this.matRect.cy - this.matRect.h * 0.62,
    });
    // 서빙 순간의 빛 — 후광·광선은 접시 **뒤**, 반짝이는 조각 **앞**이라야 「접시가 빛난다」로 읽힌다.
    this.serveGlow = new ServeGlow(
      scene,
      PLATE_DEPTH_BASE - 2,
      SEASON_DEPTH.sesameGrain + 8,
      this.plateSize(),
    );

    this.buildCounter();
    // 값을 치를 때 튀어오르는 회전 코인 — 그림이 다 와 있을 때만 애니가 생긴다.
    registerCoinSpin(scene);
    this.buildMoney();
    this.recipe = new RecipePanel(scene, this.layout);

    this.toast = scene.add
      .text(this.matRect.cx, this.matRect.cy - this.matRect.h * 0.42, '', {
        fontFamily: GAME_FONT_FAMILY,
        fontStyle: GAME_FONT_STYLE,
        fontSize: '52px',
        color: '#ffe9a8',
        stroke: '#5a2c06',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.chopText)
      .setVisible(false);
  }

  /**
   * 진열 12칸을 잡고 **자리마다** 체크 표시를 준비한다.
   * ⚠️ 체크는 **재료가 아니라 칸**에 붙는다 — 판이 바뀌면 같은 칸에 다른 재료가 들어오기 때문이다.
   */
  private buildTrayStacks(): void {
    this.tray = new TrayShelf(this.scene, this.layout);
    // 첫 판 편성을 곧바로 깔아 둔다(그래야 아래에서 기록하는 「저작 상태」가 실제로 보이는 모습이다).
    this.tray.fill(currentTray(this.state));
    TRAY_SLOT_HIT.forEach((nodeId, i) => {
      const obj = image(this.layout, nodeId);
      if (obj) this.base.set(obj, snapshot(obj));
      const spot = designRect(this.layout, nodeId);
      if (!spot) return;
      // 재료를 다 채우기 전에는 옅은 초록 — 다 채우면 한꺼번에 짙은 녹색으로 바뀐다.
      const badge = new CheckBadge(this.scene, DEPTH.trayCheck, 'light');
      // 칸 위쪽 **가운데** — 오른쪽 모서리에 두면 옆 칸 것인지 헷갈린다.
      const r = Math.min(spot.w, spot.h) * 0.21;
      badge.place(spot.cx, spot.cy - spot.h / 2 + r * 1.15, r);
      this.slotChecks[i] = badge;
    });
  }

  /**
   * 판이 바뀌었으면 진열을 갈아 끼운다 — 그림·이름표가 통째로 바뀐다.
   * ⚠️ 갈아 끼운 **뒤에** 저작 상태를 다시 기록해야 한다. 재료마다 원본 크기가 달라 배율이 바뀌는데,
   *    옛 배율로 되돌리면 리셋 때마다 그림이 조금씩 커지거나 작아진다.
   */
  private refillTray(): void {
    const shelf = this.tray;
    if (!shelf || !shelf.fill(currentTray(this.state))) return;
    TRAY_SLOT_HIT.forEach((nodeId) => {
      const obj = image(this.layout, nodeId);
      if (obj) this.base.set(obj, snapshot(obj));
    });
  }

  /**
   * ⚠️⚠️ **판을 강제로 넘기는 단추는 없다**(PO 지시).
   *
   * 개발 중에 편성을 훑어보려고 좌상단에 「n판 ▶ 다음」을 뒀었는데, **레벨은 미션을 깨야 오르는 것**이라
   * 강제 이동 수단이 화면에 있으면 그 규칙이 무너진다. 좌상단 배지는 **지금 레벨을 보여 주기만** 한다.
   * 편성을 훑어보려면 `npm run balance` 나 `logic/stageTray` 테스트를 쓸 것.
   */

  /**
   * 조리대 위 한 줄 — **단계 안내**(처음 다섯 주문)와 **재료 카운터**가 같은 자리를 쓴다.
   * 둘을 따로 띄우면 서로 겹치거나 화면이 어지러워진다. 나무 바닥에서도 읽히도록 어두운 알약을 깐다.
   */
  private buildCounter(): void {
    this.counterPad = this.scene.add
      .graphics()
      .setDepth(DEPTH.counter - 1)
      .setVisible(false);

    this.counter = this.scene.add
      .text(this.matRect.cx, this.matRect.cy - this.matRect.h / 2 - 40, '', {
        fontFamily: GAME_FONT_FAMILY,
        fontStyle: GAME_FONT_STYLE,
        // ⚠️ 유일한 안내라 **크고 또렷하게** 쓴다 — 놓치면 무엇을 해야 할지 알 길이 없다.
        fontSize: '46px',
        color: '#fff6e2',
        stroke: '#3a1d05',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.counter)
      .setVisible(false);
  }

  /**
   * 고른 주문을 오른쪽 메뉴판에 옮겨 적고, 담은 재료에 체크를 붙인다.
   * 주문이 없거나 서빙이 끝났으면 판을 비운다.
   */
  private refreshRecipe(): void {
    const order = currentOrder(this.state);
    const showing = !!order && this.state.stage !== 'served';
    this.recipe?.setOrder(showing ? order : null);
    if (showing) this.recipe?.setPicked(this.state.picked);
  }

  /**
   * 화면 맨 위 두 숫자 — **저작된 텍스트 노드를 그대로 쓴다.**
   *   · 가운데 보라색 왕관 프레임(`up_UI_10`) 안 → **미션 보상 누적**
   *   · 좌상단 보라색 배지(`up_UI_09`) 안 → **지금 레벨**
   *
   * ⚠️⚠️ **배경을 코드가 그리지 않는다.** 예전에는 여기에 둥근 알약을 하나 더 깔았는데,
   * 디자이너가 보라색 프레임을 저작하면서 **회색 알약이 그 위에 겹쳐** 배경이 이중으로 보였다.
   * 저작 프레임이 곧 배경이다 — 코드는 **숫자만** 갈아 끼운다.
   * ⚠️ 글꼴만 게임 것으로 덮는다(저작 `Roboto` 에는 한글 글리프가 없다 — `ui/font.ts` 참조).
   */
  private buildMoney(): void {
    this.money = this.layout.tryById<Phaser.GameObjects.Text>(NODE.money);
    this.levelText = this.layout.tryById<Phaser.GameObjects.Text>(NODE.level);
    for (const text of [this.money, this.levelText]) {
      if (!text || !('setText' in text)) continue;
      // ⚠️ 저작 텍스트에 좁은 줄바꿈 폭이 걸려 있으면 「$12」가 세로로 쪼개진다.
      text.setWordWrapWidth(undefined as unknown as number).setOrigin(0.5);
      applyGameFont(text);
    }
    this.refreshMoney();
    this.refreshLevel();
  }

  /** 좌상단 배지의 레벨 — 미션을 다 깨야 오른다(강제로 넘기는 수단은 없다). */
  private refreshLevel(): void {
    this.levelText?.setText(String(this.state.stageIndex + 1));
  }

  /**
   * 썰기 화면에서 가져온 김밥·칼집을 조리대 위에 얹는다.
   * 위치·크기는 저작된 그대로 두고(그게 진실), 깊이만 main 위로 통째로 밀어 올린다.
   */
  private adoptCutLayer(): void {
    const cut = this.stateLayers.cut;
    if (!cut) return;

    const roll = image(cut, CUT_NODE.roll);
    if (roll) {
      roll.setDepth(CUT_LAYER_DEPTH_BASE).setVisible(false);
      this.base.set(roll, snapshot(roll));
      this.roll = roll;
    }

    const marks: Phaser.GameObjects.Image[] = [];
    CUT_MARK_NODES.forEach((id, i) => {
      const mark = image(cut, id);
      if (!mark) return;
      mark.setDepth(CUT_LAYER_DEPTH_BASE + 1 + i).setVisible(false);
      this.base.set(mark, snapshot(mark));
      marks.push(mark);
    });
    this.cutMarks = marks;

    // 썰기용 칼은 김밥·칼집보다 위에 온다.
    const knife = image(cut, CUT_NODE.knife);
    if (knife) {
      knife.setDepth(CUT_LAYER_DEPTH_BASE + CUT_MARK_NODES.length + 2).setVisible(false);
      this.base.set(knife, snapshot(knife));
      this.cutKnife = knife;
    }

    this.adoptRollSteps();
  }

  /** 말기 1·2단계의 중간 그림을 감춰 둔 채 준비한다(손은 좌표만 쓰고 그림은 감춘다). */
  private adoptRollSteps(): void {
    const build = (
      layer: LayoutIndex | undefined,
      ids: { nori: string; rice: string; roll: string; handLeft: string; handRight: string },
      depths: { nori: number; rice: number; roll: number },
    ): RollFrame | undefined => {
      if (!layer) return undefined;
      const take = (id: string, depth: number): Phaser.GameObjects.Image | undefined => {
        const obj = image(layer, id);
        if (!obj) return undefined;
        obj.setDepth(depth).setVisible(false);
        this.base.set(obj, snapshot(obj));
        return obj;
      };
      // 손 그림은 main 것을 움직이므로 여기 것은 좌표만 쓰고 감춘다.
      image(layer, ids.handLeft)?.setVisible(false);
      image(layer, ids.handRight)?.setVisible(false);
      return {
        nori: take(ids.nori, depths.nori),
        rice: take(ids.rice, depths.rice),
        roll: take(ids.roll, depths.roll),
        handLeft: designRect(layer, ids.handLeft),
        handRight: designRect(layer, ids.handRight),
      };
    };

    // ⚠️ 깊이는 **저작값에서 뽑는다** — 에디터에서 노드를 쌓으면 main 의 depth 가 통째로 밀린다.
    const depths = rollDepths(this.layout);
    this.rollStep1 = build(this.stateLayers.roll1, ROLL_STEP1_NODE, depths);
    this.rollStep2 = build(this.stateLayers.roll2, ROLL_STEP2_NODE, depths);
    this.adoptPlate();
    this.adoptSeasonHands();
  }

  /** 마무리 손 두 개와 깨 알갱이 풀을 준비한다(알갱이는 재사용만 하고 지우지 않는다). */
  private adoptSeasonHands(): void {
    const layer = this.stateLayers.season;
    if (layer) {
      const take = (id: string, depth: number): Phaser.GameObjects.Image | undefined => {
        const obj = image(layer, id);
        if (!obj) return undefined;
        obj.setDepth(depth).setVisible(false);
        this.base.set(obj, snapshot(obj));
        return obj;
      };
      // ⚠️ 층이 다르다 — 참기름은 김밥 겉을, 깨소금은 **접시에 담긴 조각 위를** 지난다.
      this.oilHand = take(SEASON_NODE.oilHand, SEASON_DEPTH.oilHand);
      this.sesameHand = take(SEASON_NODE.sesameHand, SEASON_DEPTH.sesameHand);
    }

    const grainKey = makeGrainTexture(this.scene);
    if (!grainKey) return;
    this.grains = Array.from({ length: GRAIN_POOL_SIZE }, () =>
      this.scene.add.image(0, 0, grainKey).setDepth(SEASON_DEPTH.sesameGrain).setVisible(false),
    );
  }

  /** 서빙 접시와 조각들을 감춰 둔 채 준비한다(접시도 말기1 화면에 저작돼 있다). */
  private adoptPlate(): void {
    const layer = this.stateLayers.roll1;
    if (!layer) return;

    const plate = image(layer, PLATE_NODE.plate);
    if (plate) {
      plate.setDepth(PLATE_DEPTH_BASE).setVisible(false);
      this.base.set(plate, snapshot(plate));
      this.plate = plate;
      const authored = designRect(layer, PLATE_NODE.plate);
      if (authored) {
        // 저작 자리(손님 쪽) → 조리대 한가운데. 담기는 여기서, 서빙은 저작 자리로 되돌아가며 이뤄진다.
        this.plateShift = { x: this.matRect.cx - authored.cx, y: this.matRect.cy - authored.cy };
        this.plateRect = { ...authored, cx: this.matRect.cx, cy: this.matRect.cy };
      }
    }

    const pieces: Phaser.GameObjects.Image[] = [];
    PLATE_PIECE_NODES.forEach((id, i) => {
      const piece = image(layer, id);
      if (!piece) return;
      piece.setDepth(PLATE_DEPTH_BASE + 1 + i).setVisible(false);
      this.base.set(piece, snapshot(piece));
      pieces.push(piece);
    });
    this.platePieces = pieces;

    const rect = designRect(layer, PLATE_PIECE_NODES[0] ?? '');
    if (rect && rect.h > 0) this.pieceHeight = rect.h;
  }

  /**
   * 가운데가 진하고 밖으로 갈수록 투명해지는 원형 붓을 한 번만 만든다.
   * 이 그라데이션이 그대로 밥 가장자리의 반투명이 된다.
   */
  private makeBrush(): Phaser.GameObjects.Image | undefined {
    const { scene } = this;
    if (!scene.textures.exists(BRUSH_TEXTURE_KEY)) {
      const canvas = scene.textures.createCanvas(BRUSH_TEXTURE_KEY, BRUSH_CANVAS_SIZE, BRUSH_CANVAS_SIZE);
      const ctx = canvas?.getContext();
      if (!canvas || !ctx) return undefined;
      const r = BRUSH_CANVAS_SIZE / 2;
      const gradient = ctx.createRadialGradient(r, r, r * 0.15, r, r, r);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      gradient.addColorStop(0.78, 'rgba(255,255,255,0.42)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, BRUSH_CANVAS_SIZE, BRUSH_CANVAS_SIZE);
      canvas.refresh();
    }
    return scene.make.image({ key: BRUSH_TEXTURE_KEY }, false).setOrigin(0.5, 0.5);
  }

  // ── 입력 배선 ─────────────────────────────────────────────────────────────

  private wireTools(): void {
    // 여분 대나무발·김은 **탭 대상이 아니다** — 주문을 고르면 저절로 깔린다(진열용 소품으로만 남는다).
    this.onTap(NODE.oil, { type: 'season', id: 'oil' });
    this.onTap(NODE.sesame, { type: 'season', id: 'sesame' });
    this.onTap(NODE.bell, { type: 'ringBell' });
  }

  /**
   * 진열 12칸 — **칸을 누르면 그 칸에 지금 담긴 재료**를 집는다.
   * ⚠️ 재료 id 로 배선하면 안 된다. 칸의 내용은 판마다 갈리는데 배선은 한 번뿐이라,
   *    id 로 묶어 두면 2판부터 **엉뚱한 재료가 집힌다.**
   */
  private wireTray(): void {
    TRAY_SLOT_HIT.forEach((nodeId, slot) => {
      this.onTapSlot(nodeId, slot);
    });
  }

  /** 진열 한 칸 — 누르는 순간의 편성을 보고 무엇을 집을지 정한다. */
  private onTapSlot(nodeId: string, slot: number): void {
    const obj = image(this.layout, nodeId);
    if (!obj) return;
    obj.setInteractive({ useHandCursor: true });
    obj.on('pointerdown', () => {
      const id = this.tray?.at(slot);
      if (id) this.dispatch({ type: 'pickIngredient', id });
    });
  }

  /**
   * 탭 배선. `padY` 를 주면 **눌리는 범위만** 위아래로 그만큼(디자인 px) 넓힌다 — 그림은 그대로다.
   * 칼처럼 납작한 도구는 저작 높이 그대로면 손가락으로 맞히기가 거의 불가능하다.
   */
  private onTap(nodeId: string, action: CookAction, padY = 0): void {
    const obj = image(this.layout, nodeId);
    if (!obj) return;
    if (padY > 0 && obj.scaleY > 0) {
      // 히트 영역은 **원본 텍스처 좌표**라, 디자인 px 을 스케일로 나눠 되돌린다.
      const grow = padY / obj.scaleY;
      obj.setInteractive(
        new Phaser.Geom.Rectangle(0, -grow, obj.width, obj.height + grow * 2),
        Phaser.Geom.Rectangle.Contains,
      );
      obj.input!.cursor = 'pointer';
    } else {
      obj.setInteractive({ useHandCursor: true });
    }
    obj.on('pointerdown', () => {
      this.pressFeedback(obj);
      this.dispatch(action);
    });
  }

  /** 조리대 위 제스처 — 단계에 따라 밥 펴기 / 말기 스와이프 / 썰기 두드림으로 갈린다. */
  private wireCookingZone(): void {
    const zone = this.scene.add
      .zone(this.matRect.cx, this.matRect.cy, this.matRect.w, this.matRect.h)
      .setDepth(DEPTH.zone)
      .setInteractive();

    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.state.stage === 'riceLump') this.spreadStroke(p);
      // 다 말고 나면 김밥 위에 반투명 칼이 떠 있다 — **칼이든 그 자리든** 누르면 썰린다.
      else if (this.state.stage === 'rolled') this.dispatch({ type: 'slice' });
    });

    zone.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown && this.state.stage === 'riceLump') this.spreadStroke(p);
    });

    // 말기 스와이프는 씬 전체에서 본다.
    // 조리대 밖에서 손을 떼면 zone 의 pointerup 이 오지 않아 인식이 자주 새는데,
    // 손을 떼기 전에(움직이는 중에) 판정하고 시작점만 발 주변으로 제한하면 훨씬 잘 잡힌다.
    const input = this.scene.input;
    input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.swipeStart = { x: p.worldX, y: p.worldY };
    });
    input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown) this.trackRollSwipe(p);
    });
    input.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.trackRollSwipe(p);
      this.swipeStart = undefined;
      this.lastStamp = undefined;
    });
  }

  /**
   * 제한시간 — 주문을 고른 순간부터 흐르고, **컷신(말기·서빙) 동안만** 멈춘다.
   * 입력 잠금(`busy`)을 기준으로 삼으면 칼질하는 2초가 통째로 공짜가 되므로 따로 본다.
   */
  private startTimer(): void {
    this.scene.time.addEvent({
      delay: TICK_MS,
      loop: true,
      callback: () => this.tickClock(TICK_MS),
    });
  }

  /** 한 판을 끝낸 뒤 **딱 한 번** — 재료값이 이름표 색으로 정해진다는 것만 알린다. */
  private showCostTip(): void {
    if (this.costTipSeen || !this.costTip) return;
    this.costTipSeen = true;
    markCostTipSeen();
    // ⚠️ **지금 진열에 깔린 재료만** 적는다 — 주재료가 열여섯 종이라 전부 적으면 안 읽힌다.
    this.costTip.show(currentTray(this.state).slots, () => undefined);
  }

  /**
   * 시계만 따로 굴린다 — `dispatch` 의 입력 잠금(busy)을 타지 않는다.
   * ⚠️ tick 은 **언제나** 보낸다. 카드 시계를 멈춰야 하는 구간(컷신·서빙 대기)은 `hold` 로 알린다 —
   *    **스테이지 시계는 그때도 흘러야** 하기 때문이다(판의 3분은 벽시계다).
   */
  private tickClock(deltaMs: number): void {
    // 알림을 읽는 동안에는 시계를 멈춘다 — 읽는 시간이 벌칙이 되면 아무도 안 읽는다.
    if (this.costTip?.visible) return;
    const hold = this.clockHold || this.state.stage === 'served';
    const { state, effects } = reduce(this.state, { type: 'tick', deltaMs, hold });
    this.state = state;
    for (const effect of effects) this.play(effect);
    this.refreshClock();
    // ⚠️ 한 줄도 여기서 다시 쓴다 — 마무리 구간의 남은 시간은 **입력이 아니라 시계**를 따라 줄어드는데,
    //    `dispatch` 는 연출이 도는 동안(`busy`) 아무것도 하지 않아 숫자가 얼어붙는다.
    this.refreshCounter();
    // 연출이 끝나 `busy` 가 풀리는 순간을 놓치지 않도록 여기서도 눌러 둔 입력을 밀어 준다.
    this.flushPending();
  }

  /** 위로 충분히 그었으면 손을 떼기 전에 곧바로 말기로 넘어간다. */
  private trackRollSwipe(p: Phaser.Input.Pointer): void {
    const start = this.swipeStart;
    if (!start || this.state.stage !== 'filled') return;
    if (!this.inRollArea(start.x, start.y)) return;

    const up = start.y - p.worldY;
    const sideways = Math.abs(p.worldX - start.x);
    if (up < ROLL_SWIPE_DISTANCE || sideways > up) return;

    this.swipeStart = undefined;
    this.dispatch({ type: 'roll' });
  }

  /** 말기 스와이프 시작을 인정할 범위 — 대나무발 주변까지 넉넉하게. */
  private inRollArea(x: number, y: number): boolean {
    const halfW = (this.matRect.w * ROLL_AREA_INFLATE) / 2;
    const halfH = (this.matRect.h * ROLL_AREA_INFLATE) / 2;
    return Math.abs(x - this.matRect.cx) <= halfW && Math.abs(y - this.matRect.cy) <= halfH;
  }

  /** 손가락이 지나간 궤적을 촘촘히 이어 붓으로 찍고, 지나간 칸을 진행도로 센다. */
  private spreadStroke(p: Phaser.Input.Pointer): void {
    const last = this.lastStamp;
    const x = p.worldX;
    const y = p.worldY;
    if (!last) {
      this.paintAt(x, y);
    } else {
      const dist = Phaser.Math.Distance.Between(last.x, last.y, x, y);
      const steps = Phaser.Math.Clamp(Math.round(dist / BRUSH_STEP), 1, BRUSH_MAX_STEPS);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        this.paintAt(Phaser.Math.Linear(last.x, x, t), Phaser.Math.Linear(last.y, y, t));
      }
    }
    this.lastStamp = { x, y };
  }

  private paintAt(x: number, y: number): void {
    this.spreadHand?.moveTo(x, y);
    this.stampBrush(x, y);
    for (const cell of this.cellsUnderBrush(x, y)) this.dispatch({ type: 'spreadAt', cell });
  }

  /**
   * 붓이 덮은 칸을 모두 진행도로 인정한다.
   * (붓 중심이 지나간 한 칸만 세면 36칸을 일일이 훑어야 해서 한참 걸린다.)
   */
  private cellsUnderBrush(x: number, y: number): readonly number[] {
    const { cx, cy, w, h } = this.riceRect;
    if (w <= 0 || h <= 0) return [];
    const cw = w / SPREAD_COLS;
    const ch = h / SPREAD_ROWS;
    const left = cx - w / 2;
    const top = cy - h / 2;
    const r = BRUSH_COVER_RADIUS;
    const colFrom = Math.max(0, Math.floor((x - r - left) / cw));
    const colTo = Math.min(SPREAD_COLS - 1, Math.floor((x + r - left) / cw));
    const rowFrom = Math.max(0, Math.floor((y - r - top) / ch));
    const rowTo = Math.min(SPREAD_ROWS - 1, Math.floor((y + r - top) / ch));

    const cells: number[] = [];
    for (let row = rowFrom; row <= rowTo; row++) {
      for (let col = colFrom; col <= colTo; col++) {
        const dx = left + (col + 0.5) * cw - x;
        const dy = top + (row + 0.5) * ch - y;
        if (dx * dx + dy * dy <= r * r) cells.push(row * SPREAD_COLS + col);
      }
    }
    return cells;
  }

  /** 붓 한 번 — 크기·기울기·투명도를 조금씩 흔들어 가장자리가 규칙적으로 보이지 않게 한다. */
  private stampBrush(worldX: number, worldY: number): void {
    const rt = this.riceRT;
    const brush = this.brush;
    if (!rt || !brush) return;
    const size = BRUSH_SIZE * Phaser.Math.FloatBetween(0.82, 1.24);
    brush
      .setPosition(
        worldX - (this.riceRect.cx - this.riceRect.w / 2) + Phaser.Math.FloatBetween(-7, 7),
        worldY - (this.riceRect.cy - this.riceRect.h / 2) + Phaser.Math.FloatBetween(-7, 7),
      )
      .setDisplaySize(size, size * Phaser.Math.FloatBetween(0.84, 1.16))
      .setAngle(Phaser.Math.Between(0, 359))
      .setAlpha(Phaser.Math.FloatBetween(0.5, 0.8));
    rt.draw(brush);
  }

  // ── 상태 반영 ─────────────────────────────────────────────────────────────

  /**
   * ⚠️ **차례가 아니어도 버튼은 눌린다.** 연출이 도는 중이거나(`busy`) 아직 이른 마무리 입력이면
   * 실패시키거나 흘려버리지 않고 **눌러 둔 채로 기다렸다가**(`pending`) 차례가 오면 이어서 진행한다.
   * 썰기·담기 연출이 1~2초씩 도는데 그동안 손을 묶어 두면 빠듯한 제한시간에서 억울하게 늦어진다.
   */
  private dispatch(action: CookAction): void {
    // ⚠️ **카드는 큐가 아니라 예약으로 다룬다.** 만드는 도중에 누른 카드는 「지금 바꾸겠다」가 아니라
    //    「이번 것이 끝나면 저걸로」라는 뜻이다(두 개를 동시에 만들 수는 없다).
    if (action.type === 'chooseMenu' && canReserve(this.state, action.slot)) {
      // ⚠️⚠️ **미리 받기는 입력 잠금(`busy`)을 타지 않는다.** 연출이 도는 동안에도 되어야 하는 것이
      //    바로 이것인데, `dispatch` 로 다시 태웠더니 아래 잠금 검사에 걸려 **큐에서 버려졌다**
      //    (`QUEUEABLE` 에 없다) — 서빙 중에 카드를 눌러도 아무 일이 없던 원인이다.
      this.apply({ type: 'reserveMenu', slot: action.slot });
      return;
    }
    // ⚠️⚠️ **아직 받을 수 없는 선행 입력도 눌러 둔다.** 잠금(`busy`)만 보면 잠기지 않은 구간
    //    (말고 난 뒤 · 종 대기)에서 누른 밥통이 `reduce` 로 흘러가 조용히 사라진다.
    if (this.busy || isUpcoming(this.state, action)) {
      this.queue(action);
      // 눌러 두기만 하면 멈춰 선 것처럼 보이는 경우가 있다 — 「앞 단계를 건너뛴다」는 뜻이면
      // 그 앞 단계를 대신 시작한다(`autoAdvance`). 연출 중이면 끝난 뒤에 다시 본다.
      this.flushPending();
      return;
    }
    this.apply(action);
  }

  /** 잠금·순서 검사를 다 거친 입력을 실제로 흘려보낸다. */
  private apply(action: CookAction): void {
    const { state, effects } = reduce(this.state, action);
    this.state = state;
    // 칼질은 한 번의 탭이 여덟 번을 낸다 — 한꺼번에 그리면 안 되고 간격을 둬야 한다.
    if (effects.filter((e) => e.kind === 'chop').length > 1) this.playAutoChop(effects);
    // 밥을 다 펴면 미리 깔릴 재료가 한꺼번에 온다 — 같은 프레임에 겹쳐 쌓으면 소리도 토스트도 뭉갠다.
    else if (effects.filter((e) => e.kind === 'ingredient').length > 1) this.playPreset(effects);
    else for (const effect of effects) this.play(effect);
    this.refreshCounter();
    this.refreshRecipe();
    this.flushPending();
  }

  /**
   * 카드가 새로 걸렸다 — **미리 받아 둔 주문이 있으면 그대로 시작한다.**
   * ⚠️ 이어받을 수 있는지는 상태머신이 판단해 뒀다(`nextOrder` 의 `reserved`) — 손님이 가 버렸거나
   *    판이 바뀌어 못 만들게 된 자리면 거기서 이미 null 이다.
   */
  private applyReserved(): void {
    const slot = this.state.reserved;
    if (slot === null) return;
    this.dispatch({ type: 'chooseMenu', slot });
  }

  /**
   * 아직 못 받은 입력을 **순서대로** 눌러 둔다. 같은 것을 여러 번 눌러도 한 번만 쌓인다.
   * ⚠️ 마무리 넷(참기름·칼·깨소금·종)에 **재료**까지 담는다 — 무엇을 담는지는 `QUEUEABLE` 참조.
   */
  private queue(action: CookAction): void {
    if (actionStage(action) === null && !QUEUEABLE.has(action.type)) return;
    if (this.pending.some((a) => a.type === action.type && queueKey(a) === queueKey(action))) return;
    // 마구 두드려도 밀린 입력이 산더미가 되지는 않게 — 한 줄에 담을 수 있는 만큼이면 충분하다.
    if (this.pending.length >= PENDING_MAX) return;
    this.pending.push(action);
  }

  /**
   * 눌러 둔 입력을 이어서 진행한다(그 안에서 다시 flush 되므로 줄줄이 이어진다).
   *
   * 차례가 온 것이 있으면 그것부터 꺼내 쓰고, **아직 이른 것만 남았으면 그 앞 단계를 대신 시작한다** —
   * 말고 나서 깨소금이나 종을 누르는 건 「참기름은 건너뛴다」는 뜻이라, 칼질을 대신 시작해 줘야
   * 버튼이 먹통으로 보이지 않는다(`autoAdvance`).
   */
  private flushPending(): void {
    if (this.busy || this.pending.length === 0) return;
    // ⚠️ **꺼낼 때도 같은 잣대**를 쓴다 — 아직 받을 수 없는 것을 꺼내면 `dispatch` 가 도로 넣어 되돌이가 된다.
    const next = this.pending.find((a) => !isUpcoming(this.state, a));
    if (next) {
      this.pending = this.pending.filter((a) => a !== next);
      this.dispatch(next);
      return;
    }
    const skip = this.pending.map((a) => autoAdvance(this.state, a)).find((a): a is CookAction => !!a);
    if (skip) this.dispatch(skip);
  }

  /**
   * 칼질 연타 — 효과를 차례로 늦춰 재생하고 그동안 **입력만** 잠근다.
   * 시계는 계속 흐르므로(clockHold 를 걸지 않는다) 여기서 시간이 다 될 수 있다 —
   * 그때는 `playServe` 가 남은 예약을 걷어낸다.
   */
  private playAutoChop(effects: readonly CookEffect[]): void {
    this.busy = true;
    this.clearChopEvents();
    let step = 0;
    for (const effect of effects) {
      this.chopEvents.push(this.scene.time.delayedCall(step * CHOP_STEP_MS, () => this.play(effect)));
      // 칼이 나타난 뒤 한 박자 쉬고 첫 칼질이 들어가야 "들고 → 썬다"로 읽힌다.
      if (effect.kind === 'knife') step = Math.max(step, 1);
      else if (effect.kind === 'chop') step += 1;
    }
    this.chopEvents.push(
      this.scene.time.delayedCall(step * CHOP_STEP_MS + 120, () => {
        this.busy = false;
        // 다 썰었다 — 이제 종을 쳐야 접시가 나온다.
        this.dispatch({ type: 'chopDone' });
      }),
    );
  }

  /** 예약해 둔 칼질 연출을 걷어낸다(시간 초과·리셋). */
  private clearChopEvents(): void {
    for (const e of this.chopEvents) e.remove(false);
    this.chopEvents = [];
  }

  private play(effect: CookEffect): void {
    switch (effect.kind) {
      case 'menuChosen':
        // 주문을 고른 순간 — 손끝에 「집었다」가 온다.
        haptics.tap();
        // 앞 주문 결과를 아직 보고 있었다면 여기서 치운다(다음 조리를 가리면 안 된다).
        this.stars?.hide();
        this.pillStamp = undefined;
        this.cards?.choose(effect.slot);
        sfx('card_pick');
        // 여러 줄짜리 주문은 고르는 순간 몇 줄인지 한 번 더 짚어 준다(카드에도 `X2` 로 적혀 있다).
        if (effect.order.rolls > 1) this.showToast(`${effect.order.rolls}줄 주문!`);
        return;
      case 'mat':
        this.popIn(NODE.mat);
        sfx('mat_place');
        return;
      case 'nori':
        this.popIn(NODE.nori);
        sfx('nori_place');
        return;
      case 'riceLump':
        haptics.tap();
        // ⚠️ 발·김과 **같은 프레임에** 온다(주문을 고르면 셋이 한꺼번에 깔린다).
        //    주걱을 곧바로 돌리면 아직 김도 안 나타난 자리에 밥이 쏟아지므로 한 박자 늦춘다.
        this.scene.time.delayedCall(180, () => this.scoopRice());
        return;
      case 'spread':
        this.paintSpread();
        // 문지르는 동안만 도는 루프 — 손이 멎으면 스스로 꺼진다.
        spreadLoop();
        return;
      case 'riceDone':
        this.finishSpread();
        return;
      case 'ingredient':
        // ⚠️ 미리 깔리는 재료는 `playPreset` 이 따로 그린다 — **플레이어가 고른 것만** 여기로 온다.
        haptics.tap();
        this.placeIngredient(effect.id, effect.index, effect.need);
        return;
      case 'ingredientFull':
        // 이름과 달리 「이미 고른 재료를 또 눌렀다」는 뜻이다 — 거절음.
        haptics.warn();
        this.rejectIngredient(effect.id);
        sfx('ingredient_deny');
        return;
      case 'nudge':
        // ⚠️ 실패가 아니라 **안내**다 — 무엇을 먼저 해야 하는지만 알려 준다.
        haptics.warn();
        this.showToast(NUDGE_TEXT[effect.hint]);
        sfx('ingredient_deny');
        return;
      case 'rolled':
        haptics.tap();
        this.spreadHand?.hide();
        this.playRoll();
        return;
      case 'season':
        haptics.tap();
        this.playSeasoning(effect.id);
        return;
      case 'knife':
        // 종을 치면 칼이 저절로 나온다 — 플레이어가 드는 게 아니다.
        // ⚠️ 칼질은 여덟 번이지만 진동은 **여기 한 번만** — 매 칼집마다 울리면 손이 얼얼하다.
        haptics.tap();
        this.takeKnife();
        sfx('knife_take');
        return;
      case 'chop':
        this.playChop(effect.count);
        if (effect.count >= effect.total) sfx('cut_done');
        return;
      case 'rollDone':
        // 한 줄이 나갔다. 아직 남았으면 접시가 빠지기를 기다렸다가 조리대를 비우고 이어 간다.
        if (effect.more) this.playNextRoll(effect.index, effect.total);
        return;
      case 'mission':
        // ⚠️ **게이지는 곧바로 오르고, 완수 배너는 별이 다 뜬 뒤에 온다.**
        //    같이 터뜨리면 별·결과 줄·배너가 한자리에서 겹쳐 셋 다 안 읽힌다.
        this.missions?.update(this.state.missions, effect.completed, effect.reward, MISSION_BANNER_DELAY_MS);
        if (effect.completed.length > 0) {
          this.scene.time.delayedCall(MISSION_BANNER_DELAY_MS, () => {
            haptics.success();
            sfxResult(3);
            this.refreshMoney();
          });
        }
        return;
      case 'served':
        // ⚠️ **도장을 먼저 찍는다** — `playServe` 가 곧바로 다음 주문을 걸어 상태를 갈아치우므로,
        //    남은 시간을 읽으려면 그 전이어야 한다.
        this.stampResult(effect.result);
        // 잘 냈으면 짧게 두 번, 망쳤으면 길게 한 번 — 눈을 안 봐도 결과가 손에 온다.
        if (effect.result.failed || effect.result.stars < 2) haptics.warn();
        else haptics.success();
        this.refreshMoney();
        this.playServe(effect.result, effect.revenue, effect.perfectCombo);
        return;
      case 'plate':
        // 다 썰었다 — 접시를 올려 조각을 담는다.
        sfx('cut_done');
        this.playPlating();
        return;
      case 'plated':
        // 다 담았다 — 이제 깨소금(선택)을 뿌리고 종을 치면 끝이다.
        // (종은 말자마자 이미 깨어 있다 — 여기서는 차례가 왔다는 신호만 한 번 더 준다.)
        this.wakeBell();
        sfx('bell_wake', { volume: 0.6 });
        return;
      case 'timeout':
        this.showToast('시간 초과!');
        return;
      case 'stageEnd':
        // ⚠️ **레벨이 끝났다.** 깼으면 다음 레벨의 미션이, 시간이 다 됐으면 **같은 레벨의 미션이
        //    진행만 0으로** 다시 걸려 있다(`withStageEnd`).
        this.missions?.setMissions(this.state.missions);
        // 판이 끝났다 — 시계와 처리량을 되감고 결과를 한 번 알린다.
        this.stageTimer?.announce(effect.cleared, effect.stageIndex);
        // 판이 넘어갔다 — 좌상단 배지의 레벨도 여기서 따라간다.
        this.refreshLevel();
        sfx(effect.cleared ? 'result_3star' : 'result_fail', { volume: 0.9 });
        // 한 판을 다 겪어 본 지금이 **재료값 이야기를 들을 만한 때**다 — 딱 한 번만 띄운다.
        this.showCostTip();
        return;
      case 'customerLeft': {
        // 기다리다 그냥 갔다 — 그 자리에만 새 카드와 새 손님이 온다(실패가 아니라 놓친 장사다).
        this.cards?.setCards(effect.cards);
        this.cards?.setReserved(this.state.reserved);
        this.customers?.setCards(effect.cards, [effect.slot]);
        haptics.warn();
        this.refreshMoney();
        // ⚠️ 조리대가 아니라 **그 손님 머리 위**에 띄운다 — 조리대에 띄우면 지금 만들던 김밥이 잘못된 줄 안다.
        const head = this.customers?.headSpot(effect.slot);
        this.showToast(`그냥 갔어요  −$${effect.penalty}`, head ?? undefined);
        sfx('money_down', { volume: 0.85 });
        return;
      }
      case 'reserved':
        // 미리 받았다(또는 취소했다) — **이 순간부터 그 카드의 시계가 흐른다.**
        this.cards?.setReserved(effect.slot);
        haptics.tap();
        sfx('card_pick', { volume: 0.55 });
        this.showToast(
          effect.order ? `다음은 ${MENU_LABEL[effect.order.menu]} — 시계 시작!` : '미리 받기를 취소했어요',
        );
        return;
      case 'reservedTimeout': {
        // 미리 받아 두고 손도 못 댄 채 시간이 다 됐다 — 그 손님 머리 위에 알린다(조리대는 남의 일이다).
        this.cards?.setCards(effect.cards);
        this.cards?.setReserved(this.state.reserved);
        this.customers?.setCards(effect.cards, [effect.slot]);
        haptics.warn();
        this.refreshMoney();
        const head = this.customers?.headSpot(effect.slot);
        this.showToast(`미리 받은 주문 시간 초과  −$${effect.penalty}`, head ?? undefined);
        sfx('money_down', { volume: 0.85 });
        return;
      }
      case 'reset':
        // ⚠️ **새 주문표가 걸린 자리만** 밀려 나갔다 다시 들어온다 — 남겨 둔 주문표는 제자리 그대로다.
        this.resetBoard(effect.replaced);
        // ⚠️ **새 카드가 걸린 자리의 손님만** 갈아 세운다 — 주문을 받아 간 손님은 떠나고,
        //    아직 기다리는 손님은 제 카드와 함께 그대로 서 있는다.
        //    ⚠️ 인사 말풍선이 뜬 뒤에 갈려야 한다 — 먼저 갈면 새 손님이 남의 주문에 인사한 꼴이 된다.
        this.customers?.setCards(effect.cards, effect.replaced);
        sfx('order_in');
        return;
      default:
        return;
    }
  }

  // ── 연출 ──────────────────────────────────────────────────────────────────

  private popIn(nodeId: string, delay = 0): void {
    const found = this.nodeOf(nodeId);
    if (!found) return;
    const { obj, t } = found;
    obj.setVisible(true).setAlpha(0).setScale(t.scaleX * 0.82, t.scaleY * 0.82);
    this.scene.tweens.add({
      targets: obj,
      alpha: t.alpha,
      scaleX: t.scaleX,
      scaleY: t.scaleY,
      duration: 240,
      delay,
      ease: 'Back.easeOut',
    });
  }

  /**
   * 밥통을 누르면 **주걱이 밥을 퍼서** 김 위로 옮겨 쏟는다.
   * 밥덩이는 주걱이 기울어지는 순간에 나타난다 — 그래야 "퍼 왔다"로 읽힌다.
   * ⚠️ 연출이 도는 동안에도 조작은 막지 않는다(0.5초를 통째로 빼앗기면 빠듯한 제한시간이 더 빠듯해진다).
   *    그래서 그 사이에 벌써 문지르기 시작했다면 밥덩이는 띄우지 않는다.
   */
  private scoopRice(): void {
    // ⚠️ **밥 그림은 여기서 곧바로 켠다.** 마스크가 비어 있어 문지르기 전에는 아무것도 안 보이므로
    //    미리 켜도 화면은 그대로다. 주걱이 쏟을 때까지 기다렸다 켜면, 그 0.46초 사이에 문지르기
    //    시작한 판에서는 `drop` 이 취소되면서 **밥이 영영 안 나타난다**(밥 없이 재료만 얹힌다).
    image(this.layout, NODE.rice)?.setVisible(true).setAlpha(1);
    const drop = (): void => {
      // 밥덩이(퍼 온 덩어리)만 조건부다 — 벌써 문지르고 있으면 덩어리를 새로 띄우지 않는다.
      if (this.state.stage !== 'riceLump' || this.state.spread.length > 0) return;
      this.showLump();
      sfx('rice_lump');
    };
    if (this.scoop) this.scoop.play(this.riceRect, drop);
    else drop();
  }

  private showLump(): void {
    const lump = this.lump;
    if (!lump) return;
    // 앞 주문에서 밥을 펴며 줄여 놓은 스케일을 되돌린 뒤 올린다.
    this.lumpFading = false;
    lump.setScale(this.lumpScale).setVisible(true).setAlpha(0).setPosition(this.riceRect.cx, this.riceRect.cy - 90);
    this.scene.tweens.add({
      targets: lump,
      y: this.riceRect.cy,
      alpha: 1,
      duration: 300,
      ease: 'Bounce.easeOut',
    });
    image(this.layout, NODE.rice)?.setVisible(true).setAlpha(1);
  }

  /** 밥이 퍼진 자국은 붓이 이미 찍었다. 문지르기 시작하면 밥덩이는 곧바로 치운다. */
  private paintSpread(): void {
    this.hideLump();
  }

  /**
   * 살짝 폈으면 나머지는 저절로 퍼진다 — 남은 자리를 붓으로 빠르게 훑은 뒤
   * 마스크를 가득 채워 밥 그림의 원래 외곽선을 드러낸다.
   */
  private finishSpread(): void {
    this.hideLump();
    stopSpreadLoop();
    sfx('rice_auto_spread');
    const { cx, cy, w, h } = this.riceRect;
    for (let row = 0; row < AUTO_SPREAD_ROWS; row++) {
      const y = cy - h / 2 + ((row + 0.5) * h) / AUTO_SPREAD_ROWS;
      this.scene.time.delayedCall(row * AUTO_SPREAD_STEP_MS, () => {
        for (let col = 0; col < AUTO_SPREAD_COLS; col++) {
          this.stampBrush(cx - w / 2 + ((col + 0.5) * w) / AUTO_SPREAD_COLS, y);
        }
      });
    }
    // 저절로 퍼지는 구간도 손이 훑고 지나가야 "손이 마저 폈다"로 보인다.
    this.spreadHand?.sweep(
      Array.from({ length: AUTO_SPREAD_ROWS }, (_, row) => ({
        // 줄마다 반대쪽에서 시작해 지그재그로 훑는다.
        x: cx + (row % 2 === 0 ? w : -w) * 0.3,
        y: cy - h / 2 + ((row + 0.5) * h) / AUTO_SPREAD_ROWS,
      })),
      AUTO_SPREAD_STEP_MS,
    );
    this.scene.time.delayedCall(AUTO_SPREAD_ROWS * AUTO_SPREAD_STEP_MS + 60, () => {
      this.riceRT?.fill(0xffffff, 1);
      sfx('rice_done');
      this.spreadHand?.hide();
    });
  }

  /** 밥덩이를 펴는 순간 사라지게 한다(문지를 때마다 호출되므로 한 번만 동작). */
  private hideLump(): void {
    const lump = this.lump;
    if (!lump || !lump.visible || this.lumpFading) return;
    this.lumpFading = true;
    this.scene.tweens.add({
      targets: lump,
      alpha: 0,
      scale: this.lumpScale * 0.55,
      duration: 180,
      ease: 'Quad.easeIn',
      onComplete: () => lump.setVisible(false),
    });
  }

  /** 고른 재료를 김 위에 눕히고, 진열에서는 흐려지며 체크가 붙는다. */
  private placeIngredient(id: IngredientId, index: number, need: number): void {
    this.strips?.place(id, index, need);
    sfxIngredientPlace(index);
    this.markTrayPicked(id);
    this.refreshCheckTone();
    this.showToast(INGREDIENT_LABEL[id]);
  }

  /**
   * 밥을 다 편 순간 저절로 깔리는 재료들 — 착착 얹히도록 한 박자씩 늦춰 재생한다.
   * 재료 이름 토스트는 띄우지 않는다. 넉 장이 연달아 스치면 읽히지도 않고,
   * 이 단계에서 알아야 할 것은 「몇 개 남았나」뿐이라 카운터가 그 몫을 한다.
   */
  private playPreset(effects: readonly CookEffect[]): void {
    let step = 0;
    for (const effect of effects) {
      if (effect.kind !== 'ingredient') {
        this.play(effect);
        continue;
      }
      const { id, index, need } = effect;
      this.scene.time.delayedCall(step * PRESET_STEP_MS, () => {
        this.strips?.place(id, index, need);
        sfxIngredientPlace(index);
        this.markTrayPicked(id);
        this.refreshCheckTone();
        this.refreshCounter();
      });
      step += 1;
    }
  }

  /** 그 재료가 놓인 **칸**을 흐리고 체크를 붙인다(진열에 없는 재료면 아무 일도 없다). */
  private markTrayPicked(id: IngredientId): void {
    const obj = this.tray?.artOf(id);
    if (obj) this.scene.tweens.add({ targets: obj, alpha: TRAY_DIM_ALPHA, duration: 180 });
    const slot = this.tray?.slotOf(id) ?? -1;
    if (slot >= 0) this.slotChecks[slot]?.show();
  }

  /** 이미 고른 재료를 또 누른 경우 — 흔들어 알린다(선택 취소는 없다). */
  private rejectIngredient(id: IngredientId): void {
    const obj0 = this.tray?.artOf(id);
    const t0 = this.baseOf(obj0);
    const found = obj0 && t0 ? { obj: obj0, t: t0 } : undefined;
    if (found) {
      const { obj, t } = found;
      // ⚠️ 방금 눌림 피드백이 시작한 축소 트윈까지 끊기므로, 크기도 함께 되돌려 놓는다
      //    (안 그러면 0.92배로 줄어든 채 굳는다). 흐려진 상태(알파)는 유지한다.
      const alpha = obj.alpha;
      this.scene.tweens.killTweensOf(obj);
      restore(obj, t);
      obj.setAlpha(alpha);
      this.scene.tweens.add({
        targets: obj,
        x: t.x - 14,
        duration: 60,
        yoyo: true,
        repeat: 2,
        onComplete: () => obj.setX(t.x),
      });
    }
  }

  /**
   * 말기 — 에디터의 말기1·말기2 화면을 키프레임 삼아 크로스페이드로 넘어간다.
   * 손을 위로 올리며 김·밥이 줄고, 재료는 아래쪽부터 말려 들어간다.
   */
  private playRoll(): void {
    this.busy = true;
    this.clockHold = true;
    // 손이 먼저 훅 올라가고, 조여 드는 소리는 조금 늦게 들어와야 두 동작이 겹치지 않는다.
    sfx('roll_swipe', { volume: 0.7 });
    this.scene.time.delayedCall(150, () => sfx('roll_press'));

    // 재료 스트립은 **아래쪽부터** 말려 들어간다(y 가 큰 것이 아래).
    const strips = this.strips?.objects.filter((o) => o.visible) ?? [];

    const hands = [NODE.handLeft, NODE.handRight]
      .map((id) => this.nodeOf(id))
      .filter((h): h is { obj: Phaser.GameObjects.Image; t: Transform } => !!h);
    for (const { obj, t } of hands) {
      obj.setVisible(true).setAlpha(0).setPosition(t.x, t.y).setScale(t.scaleX, t.scaleY);
      this.scene.tweens.add({ targets: obj, alpha: t.alpha, duration: 150 });
    }

    const step1 = this.rollStep1;
    const step2 = this.rollStep2;
    if (!step1 || !step2) {
      // 말기 화면이 없으면 그냥 완성 김밥만 띄운다(저작 전 방어).
      this.finishRoll(hands.map((h) => h.obj), strips);
      return;
    }

    playRollSequence(
      { scene: this.scene, baseOf: (o) => this.baseOf(o) },
      {
        flatNori: image(this.layout, NODE.nori),
        flatRice: image(this.layout, NODE.rice),
        strips,
        hands: hands.map((h) => h.obj),
        finalRoll: this.roll,
      },
      step1,
      step2,
      () => {
        this.busy = false;
        this.clockHold = false;
        this.readyToFinish();
      },
    );
  }

  /** 말기 화면이 없을 때의 폴백 — 완성 김밥만 띄운다. */
  private finishRoll(
    hands: readonly Phaser.GameObjects.Image[],
    strips: readonly Phaser.GameObjects.Image[],
  ): void {
    for (const hand of hands) {
      this.scene.tweens.add({ targets: hand, alpha: 0, duration: 200, onComplete: () => hand.setVisible(false) });
    }
    for (const id of [NODE.nori, NODE.rice]) image(this.layout, id)?.setVisible(false);
    for (const strip of strips) strip.setVisible(false);

    const roll = this.roll;
    const t = this.baseOf(roll);
    if (!roll || !t) {
      this.busy = false;
      this.clockHold = false;
      return;
    }
    roll.setVisible(true).setAlpha(0).setPosition(t.x, t.y).setScale(t.scaleX * 0.7, t.scaleY * 0.7);
    this.scene.tweens.add({
      targets: roll,
      alpha: t.alpha,
      scaleX: t.scaleX,
      scaleY: t.scaleY,
      duration: 320,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.busy = false;
        this.clockHold = false;
        this.readyToFinish();
      },
    });
  }

  /**
   * 다 말았다 — 마무리에 쓰는 것들을 **한꺼번에 켠다.**
   * 김밥 위에 반투명 칼이 뜨고, **종도 이때부터 깨어 있다.**
   *
   * ⚠️ 종은 아직 차례가 아니지만(접시에 담아야 울린다) **눌러 둘 수는 있다** —
   *    누르면 `pending` 에 쌓였다가 담기가 끝나는 즉시 울린다(`dispatch` 참조).
   *    그래서 「썰기 전에는 잠들어 있다」로 두면 오히려 못 누르는 것처럼 보인다.
   */
  private readyToFinish(): void {
    this.showGhostKnife();
    this.wakeBell();
    // 말리는 1초 동안 깨소금·종을 미리 눌러 뒀을 수 있다 — 여기서 이어 준다
    // (그대로 두면 「참기름 건너뛰기」가 칼을 누를 때까지 잠들어 있다).
    this.flushPending();
  }

  /** 참기름은 한 번 스쳐 지나가고, 깨소금은 한 번 왕복하며 알갱이를 뿌린다. */
  private playSeasoning(id: SeasoningId): void {
    sfx(id === 'oil' ? 'oil_brush' : 'sesame_sprinkle');
    // 참기름은 **말아 놓은 김밥 위**를, 깨소금은 **접시에 담긴 조각 위**를 훑는다 — 치는 때가 다르다.
    const target =
      id === 'oil' ? designRect(this.stateLayers.cut ?? this.layout, CUT_NODE.roll) : this.plateRect;
    const sweep = {
      centerX: target?.cx ?? this.matRect.cx,
      width: target?.w ?? this.matRect.w,
      surfaceY: (target?.cy ?? this.matRect.cy) - (target?.h ?? 0) * 0.18,
    };
    const hand = id === 'oil' ? this.oilHand : this.sesameHand;
    const base = this.baseOf(hand);
    if (!hand || !base) {
      this.showToast(id === 'oil' ? '참기름!' : '깨소금!');
      return;
    }
    if (id === 'oil') playOilSweep(this.scene, hand, base, sweep);
    else playSesameSweep(this.scene, hand, base, sweep, this.grains);

    // **마무리를 치면 다음 단계로 저절로 넘어간다.**
    // 참기름 → 칼질 · 깨소금 → 종. 건너뛰고 싶으면 칼이나 종을 직접 누르면 된다.
    // 손이 다 지나간 뒤에 넘겨야 두 연출이 겹치지 않는다.
    const next: CookAction = id === 'oil' ? { type: 'slice' } : { type: 'ringBell' };
    this.scene.time.delayedCall(Math.round(SEASON_SWEEP_MS[id] * SEASON_HANDOFF), () => this.dispatch(next));
  }

  /** 종을 치면 대나무발을 걷고, 손에 쥔 칼이 첫 칼집 자리에 나타난다. */
  /**
   * 다 말면 김밥 위에 **반투명 칼**이 떠서 "여기를 누르면 썰린다"를 알린다.
   * 40% 로 흐리게 두고 살짝 오르내리게 해서, 다 썬 뒤의 **진짜 칼**(알파 1)과 구분되게 한다.
   */
  private showGhostKnife(): void {
    // ⚠️ 말기 완료 콜백은 늦게 도착할 수 있다 — 그새 벌써 썰기 시작했으면 다시 띄우지 않는다
    //    (안 그러면 썰고 있는 칼이 반투명으로 되돌아간다).
    if (this.state.stage !== 'rolled') return;
    const knife = this.cutKnife;
    const t = this.baseOf(knife);
    if (!knife || !t) return;
    const pos = this.knifePositionFor(0);
    this.scene.tweens.killTweensOf(knife);
    knife.setVisible(true).setAlpha(0).setPosition(pos.x, pos.y).setScale(t.scaleX, t.scaleY);
    this.scene.tweens.add({ targets: knife, alpha: GHOST_KNIFE_ALPHA, duration: 220 });
    // 맥동은 "눌러 달라"는 신호다 — 종이 깨어날 때와 같은 몸짓.
    this.ghostTween?.stop();
    this.ghostTween = this.scene.tweens.add({
      targets: knife,
      y: pos.y - 14,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** 반투명 칼을 거두고 진짜 칼로 넘긴다. */
  private hideGhostKnife(): void {
    this.ghostTween?.stop();
    this.ghostTween = undefined;
  }

  private takeKnife(): void {
    this.hideGhostKnife();
    // 썰 때는 대나무발을 걷어 낸다(썰기 화면에도 발이 없다).
    const mat = this.nodeOf(NODE.mat);
    if (mat?.obj.visible) {
      this.scene.tweens.add({
        targets: mat.obj,
        alpha: 0,
        duration: 260,
        onComplete: () => mat.obj.setVisible(false),
      });
    }

    const knife = this.cutKnife;
    const t = this.baseOf(knife);
    if (!knife || !t) return;
    const pos = this.knifePositionFor(0);
    // 반투명으로 떠 있던 칼이 **그 자리에서 또렷해지며** 썰기 시작한다.
    this.scene.tweens.killTweensOf(knife);
    knife.setVisible(true).setPosition(pos.x, pos.y).setScale(t.scaleX, t.scaleY);
    this.scene.tweens.add({ targets: knife, x: pos.x, y: pos.y, alpha: t.alpha, duration: 180, ease: 'Quad.easeOut' });
  }

  /**
   * 칼집 index 를 썰 때의 칼 위치.
   * 저작된 칼 자리를 **첫 칼집(가장 오른쪽) 기준**으로 보고, 칼집이 옮겨 간 만큼 그대로 따라간다.
   * (칼날과 칼집의 상대 위치를 디자이너가 맞춰 둔 것을 그대로 보존하는 방식)
   */
  private knifePositionFor(index: number): { readonly x: number; readonly y: number } {
    const knifeBase = this.baseOf(this.cutKnife);
    const first = this.baseOf(this.cutMarks[0]);
    const target = this.baseOf(this.cutMarks[index]);
    if (!knifeBase) return { x: 0, y: 0 };
    if (!first || !target) return { x: knifeBase.x, y: knifeBase.y };
    return { x: knifeBase.x + (target.x - first.x), y: knifeBase.y + (target.y - first.y) };
  }

  /** 한 번 썰 때마다 저작된 칼집을 오른쪽부터 하나씩 드러낸다. */
  private playChop(count: number): void {
    const mark = this.cutMarks[count - 1];
    const markBase = this.baseOf(mark);
    if (mark && markBase) {
      mark
        .setVisible(true)
        .setAlpha(0)
        .setPosition(markBase.x, markBase.y)
        .setScale(markBase.scaleX, markBase.scaleY * 0.55);
      this.scene.tweens.add({
        targets: mark,
        alpha: markBase.alpha,
        scaleY: markBase.scaleY,
        duration: 98,
        ease: 'Back.easeOut',
      });
    }
    this.swingKnife(count);
    this.shakeRoll();
    sfxChop();
    this.showToast(`${count} / ${CHOP_TOTAL}`);
  }

  /** 칼이 내리쳤다가 다음 칼집 자리로 옮겨 간다. */
  private swingKnife(count: number): void {
    const knife = this.cutKnife;
    if (!knife || !knife.visible) return;
    const here = this.knifePositionFor(count - 1);
    const next = this.knifePositionFor(Math.min(count, this.cutMarks.length - 1));

    this.scene.tweens.killTweensOf(knife);
    knife.setPosition(here.x, here.y);
    this.scene.tweens.chain({
      targets: knife,
      tweens: [
        // 위아래로 짧게 세 번 썰고(톱질), 그다음 칸으로 옮겨 간다.
        // 시간값은 전부 `CHOP_STEP_MS` 와 같은 비율로 줄여 둔다 — 한쪽만 만지면 칼이 튄다.
        { y: here.y + 24, duration: 35, yoyo: true, repeat: 2, ease: 'Sine.easeInOut' },
        { x: next.x, y: next.y, duration: 90, ease: 'Sine.easeInOut' },
      ],
    });
  }

  /**
   * 칼질 반동 — 김밥과 이미 난 칼집은 **한 덩어리로** 같이 튄다.
   * (김밥만 움직이면 칼집이 제자리에 남아 따로 노는 것처럼 보인다.)
   */
  private shakeRoll(): void {
    const roll = this.roll;
    if (!roll) return;
    const group = [roll, ...this.cutMarks.filter((m) => m.visible)];

    // ⚠️ killTweensOf 를 쓰면 방금 시작한 칼집 등장(알파) 트윈까지 죽어서 투명한 채로 남는다.
    //    반동 트윈만 붙잡아 두었다가 그것만 끊는다.
    this.shakeTween?.stop();
    for (const obj of group) {
      const rest = this.baseOf(obj);
      if (rest) obj.setY(rest.y);
    }
    // 상대 이동이라 시작 y 가 서로 달라도 같은 폭으로 함께 움직인다.
    this.shakeTween = this.scene.tweens.add({
      targets: group,
      y: '-=10',
      duration: 70,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        for (const obj of group) {
          const rest = this.baseOf(obj);
          if (rest) obj.setY(rest.y);
        }
        this.shakeTween = undefined;
      },
    });
  }

  /** 다 썰면 종이 깨어난다 — 종을 쳐야 서빙된다. */
  private wakeBell(): void {
    const found = this.nodeOf(NODE.bell);
    if (!found) return;
    const { obj, t } = found;
    obj.clearTint();
    this.bellPulse?.stop();
    this.scene.tweens.add({ targets: obj, alpha: t.alpha, duration: 200 });
    this.bellPulse = this.scene.tweens.add({
      targets: obj,
      scaleX: t.scaleX * 1.09,
      scaleY: t.scaleY * 1.09,
      duration: 460,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** 종을 잠재운다(썰기 전 · 다음 주문). */
  private sleepBell(): void {
    const found = this.nodeOf(NODE.bell);
    if (!found) return;
    const { obj, t } = found;
    this.bellPulse?.stop();
    this.bellPulse = undefined;
    this.scene.tweens.killTweensOf(obj);
    restore(obj, t);
    obj.setAlpha(0.4).setTint(0x8c8c8c);
  }

  /** 종을 치면 접시가 올라오고 조각이 담긴 뒤, 별 판정이 나타난다. */
  /**
   * 다 썰었다 — 조리대를 치우고 **접시를 올려 조각을 담는다.**
   * 여기서 끝이 아니다. 담고 나면 **깨소금(선택) → 종**이 남아 있으므로 접시는 화면에 그대로 둔다.
   *
   * ⚠️ 담는 동안 입력은 잠그되 **시계는 멈추지 않는다** — 칼질과 같은 이유다(멈추면 그만큼 공짜다).
   */
  private playPlating(): void {
    this.busy = true;
    // 접시는 저작 노드 한 벌뿐이다 — 앞 주문 것이 아직 날아가는 중이면 먼저 치우고 새로 올린다.
    this.landServeFlight();
    this.clearChopEvents();
    this.shakeTween?.stop();
    this.shakeTween = undefined;
    this.hideGhostKnife();

    // 썰어 놓은 김밥·칼집·칼은 접시에 담기며 사라진다.
    const cleared = [this.roll, ...this.cutMarks, this.cutKnife].filter(
      (o): o is Phaser.GameObjects.Image => !!o && o.visible,
    );
    for (const obj of cleared) {
      this.scene.tweens.add({ targets: obj, alpha: 0, duration: 220, onComplete: () => obj.setVisible(false) });
    }
    // 접시가 안내 문구 자리를 덮으므로 잠시 비켜 준다.
    this.hideOrderInfo();

    const plate = this.plate;
    const plateBase = this.baseOf(plate);
    const done = (): void => {
      this.busy = false;
      this.dispatch({ type: 'platedDone' });
    };
    if (!plate || !plateBase) {
      this.scene.time.delayedCall(200, done);
      return;
    }

    // 접시는 **조리대 한가운데로** 내려온다(저작 자리는 손님 쪽이라 서빙 때 쓴다).
    const plateX = plateBase.x + this.plateShift.x;
    const plateY = plateBase.y + this.plateShift.y;
    plate
      .setVisible(true)
      .setAlpha(0)
      .setPosition(plateX, plateY - 40)
      .setScale(plateBase.scaleX * 0.9, plateBase.scaleY * 0.9);
    this.scene.tweens.add({
      targets: plate,
      alpha: plateBase.alpha,
      y: plateY,
      scaleX: plateBase.scaleX,
      scaleY: plateBase.scaleY,
      duration: PLATE.rise,
      ease: 'Back.easeOut',
      onStart: () => sfx('plate_up'),
    });

    // 조각은 저작 순서(뒤→앞)대로 하나씩 얹힌다. 그림은 주문한 김밥 종류의 단면.
    const order = currentOrder(this.state);
    const pieceTex = order ? MENU_PIECE_TEX[order.menu] : undefined;
    this.platePieces.forEach((piece, i) => {
      const t = this.baseOf(piece);
      if (!t) return;
      if (pieceTex && this.scene.textures.exists(pieceTex)) {
        piece.setTexture(pieceTex);
        // 종류마다 원본 크기가 달라, 저작 높이에 맞춰 비율 그대로 다시 잡는다.
        if (piece.height > 0) piece.setScale(this.pieceHeight / piece.height);
      }
      const scaleX = piece.scaleX;
      const scaleY = piece.scaleY;
      const px = t.x + this.plateShift.x;
      const py = t.y + this.plateShift.y;
      piece.setVisible(true).setAlpha(0).setPosition(px, py - 26).setScale(scaleX * 0.7, scaleY * 0.7);
      this.scene.tweens.add({
        targets: piece,
        alpha: t.alpha,
        y: py,
        scaleX,
        scaleY,
        duration: PLATE.pieceIn,
        delay: PLATE.firstPieceAt + i * PLATE.stagger,
        ease: 'Back.easeOut',
        onStart: () => sfxPlatePiece(i),
      });
    });

    const platedAt = PLATE.firstPieceAt + this.platePieces.length * PLATE.stagger + PLATE.pieceIn;
    this.scene.time.delayedCall(platedAt, done);
  }

  /** 주문 조건·카운터를 잠시 비켜 준다(접시·별이 그 자리를 쓴다). */
  /**
   * 마무리에 들어가면 **레시피 판만** 비운다 — 다 담은 뒤에는 읽을 것이 없다.
   *
   * ⚠️⚠️ **한 줄(카운터)은 끄지 않는다.** 예전에는 「접시가 안내 자리를 덮는다」며 같이 껐는데,
   * 실측해 보면 한 줄은 y 997~1081 · 조리대에 올라온 접시는 y 1200~1498 로 **겹치지 않는다.**
   * 그리고 그 한 줄이 지금은 **남은 시간과 정산 결과를 말하는 자리**다 — 여기서 꺼 버리면
   * 손이 묶인 채 시계만 흐르는 구간에 화면에서 시간이 사라져 「왜 실패했는지」를 알 수 없게 된다.
   */
  private hideOrderInfo(): void {
    this.recipe?.setOrder(null);
  }

  /**
   * 종을 쳤다(또는 실패로 끝났다) — **접시를 손님에게 내보내고 별을 띄운다.**
   * 접시에 담기까지 갔으면 그 접시가 위로 빠지고, 못 갔으면(시간 초과·순서 위반) 결과만 띄운다.
   */
  /**
   * **한 줄을 내보내고 곧바로 다음 줄을 시작한다** — ×2·×3 으로 받은 주문의 줄과 줄 사이.
   *
   * 접시만 손님 쪽으로 내밀고 **카드·손님·시계는 그대로** 둔 채 조리대만 비운다(`clearBoard`).
   * ⚠️ 여기서는 **별도 잔고도 띄우지 않는다** — 성적은 주문한 줄을 다 낸 뒤 한 번에 나온다.
   *    줄마다 결과창이 끼어들면 「한 주문을 여러 줄」이 아니라 「짧은 주문 여러 건」이 되어 버린다.
   */
  private playNextRoll(index: number, total: number): void {
    this.busy = true;
    this.clockHold = true;
    this.clearChopEvents();
    this.shakeTween?.stop();
    this.shakeTween = undefined;
    this.hideGhostKnife();
    this.sleepBell();
    stopSpreadLoop();
    sfx('bell_ring', { volume: 0.95 });
    haptics.tap();

    for (const obj of [this.roll, ...this.cutMarks, this.cutKnife]) {
      if (!obj || !obj.visible) continue;
      this.scene.tweens.add({ targets: obj, alpha: 0, duration: 200, onComplete: () => obj.setVisible(false) });
    }
    const served = [this.plate, ...this.platePieces].filter(
      (o): o is Phaser.GameObjects.Image => !!o && o.visible,
    );
    for (const obj of served) {
      const t = this.baseOf(obj);
      this.scene.tweens.add({
        targets: obj,
        x: t ? t.x : obj.x - this.plateShift.x,
        y: t ? t.y : obj.y - this.plateShift.y,
        scaleX: obj.scaleX * SERVE_SHRINK,
        scaleY: obj.scaleY * SERVE_SHRINK,
        duration: SERVE_MS,
        ease: 'Quad.easeInOut',
      });
      this.scene.tweens.add({ targets: obj, alpha: 0, duration: 240, delay: SERVE_MS - 200 });
    }

    this.scene.time.delayedCall(served.length > 0 ? SERVE_MS : 240, () => {
      this.clearBoard();
      // ⚠️ 발·김은 **비운 다음에** 깐다. 상태머신은 이미 `nori` 단계지만 여기서 깔지 않으면
      //    조리대가 텅 빈 채로 남는다(`finishRoll` 이 `mat`·`nori` 효과를 내지 않는 이유).
      this.popIn(NODE.mat);
      this.popIn(NODE.nori, 90);
      // ⚠️ **밥까지 여기서 올린다.** 밥통 단계를 없앴으므로 다음 줄도 밥이 저절로 깔려야 한다 —
      //    안 그러면 둘째 줄부터 문지를 밥이 없어 조리가 멎는다.
      this.scene.time.delayedCall(180, () => this.scoopRice());
      sfx('mat_place', { volume: 0.7 });
      // 줄이 바뀌면 **필수 재료도 하나 바뀐다** — 레시피 판을 다시 보라는 신호를 겸한다.
      this.showToast(`${index + 1} / ${total}줄 — 다음 줄!`);
      this.busy = false;
      this.clockHold = false;
    });
  }

  private playServe(result: ScoreResult, revenue: number, perfectCombo = 0): void {
    this.busy = true;
    this.clockHold = true;
    // 앞 주문의 접시가 아직 날아가는 중이면 여기서 마저 치운다(연출이 겹치는 일은 없지만 물건은 하나다).
    this.landServeFlight();
    this.clearChopEvents();
    this.shakeTween?.stop();
    this.shakeTween = undefined;
    this.hideGhostKnife();
    this.sleepBell();
    stopSpreadLoop();
    // 접시까지 갔다 = 종을 쳐서 끝낸 것. 시간 초과·순서 위반은 종이 울리지 않는다.
    if (!result.failed) sfx('bell_ring', { volume: 0.95 });

    // ⚠️⚠️ **주문표에 도장을 찍고 손님이 인사한다 — 둘 다 사람이 갈리기 전에.**
    //    이걸 `reset`(다음 주문) 뒤로 미루면 **새 손님이 남의 주문에 인사하는** 꼴이 된다.
    //    주문표가 같은 자리에서 내용만 조용히 갈리던 때는 한 건을 끝냈다는 표시가 조리대(별)에만 있어서,
    //    주문이 「처리된」 게 아니라 「사라진」 것으로 보였다.
    const servedSlot = this.state.chosen;
    if (servedSlot !== null) {
      const grade = result.failed ? 0 : result.stars;
      this.cards?.stamp(servedSlot, grade);
      this.customers?.thank(servedSlot, grade);
    }

    const stillOnBoard = [this.roll, ...this.cutMarks, this.cutKnife].filter(
      (o): o is Phaser.GameObjects.Image => !!o && o.visible,
    );
    for (const obj of stillOnBoard) {
      this.scene.tweens.add({ targets: obj, alpha: 0, duration: 220, onComplete: () => obj.setVisible(false) });
    }
    this.hideOrderInfo();

    // 결과는 띄워 둔 채로 **다음 주문을 바로 걸어 준다** — 별이 사라지기를 기다리게 하지 않는다.
    // 별은 제 시간이 되면 스스로 사라지고, 그 전에 메뉴를 고르면 그 자리에서 치운다.
    // ⚠️ 여기서 `busy` 를 푸는 것이 곧 **「서빙이 끝나지 않아도 다음 메뉴를 고를 수 있다」**는 뜻이다 —
    //    접시는 아직 손님 쪽으로 날아가는 중이고 별도 떠 있지만, 카드는 이미 눌린다.
    const finish = (): void => {
      this.stars?.show(
        result.stars,
        this.resultMessage(result, revenue),
        () => this.stars?.hide(),
        (step) => sfxStar(step),
      );
      // 완벽한 김밥을 연달아 냈으면 별이 다 찬 뒤에 축하가 터진다(별 채우는 소리와 겹치지 않게).
      if (perfectCombo >= PERFECT_COMBO_MIN) {
        this.scene.time.delayedCall(140 + result.stars * 200 + 200, () => {
          this.stars?.celebrate(perfectCombo);
          // 콤보 전용 소리는 없다 — 가장 밝은 별 소리를 겹쳐 울려 축포처럼 쓴다.
          sfxStar(3);
          this.scene.time.delayedCall(120, () => sfxStar(3));
        });
      }
      // 결과음은 별이 다 찬 뒤에 온다 — 별 소리와 겹치면 둘 다 안 들린다.
      this.scene.time.delayedCall(140 + Math.max(1, result.stars) * 200, () => {
        sfxResult(result.failed ? 0 : result.stars);
        if (revenue !== 0) sfx(revenue > 0 ? 'money_up' : 'money_down', { volume: 0.8 });
      });
      this.busy = false;
      this.clockHold = false;
      this.dispatch({ type: 'nextOrder' });
    };

    // 접시에 담기 전에 끝난 주문(시간 초과·순서 위반)은 내보낼 것이 없다 — 결과만 띄운다.
    if (!this.plate?.visible) {
      this.scene.time.delayedCall(300, finish);
      return;
    }

    // ⚠️ **빛은 접시가 떠나기 전에 터진다.** 나가면서 빛나면 「빛나는 접시가 간다」로 읽히는데,
    //    보여 주고 싶은 건 「완성됐다 → 그래서 내보낸다」는 순서다. 접시 출발은 140ms 뒤다.
    this.serveGlow?.burst(this.plate.x, this.plate.y, result.failed ? 0 : result.stars);

    // 손님 쪽으로 **내민다** — 저작된 접시 자리가 곧 그 자리다. 멀어지는 만큼 작아지고 흐려진다.
    const served: Phaser.GameObjects.Image[] = [this.plate, ...this.platePieces].filter(
      (o): o is Phaser.GameObjects.Image => !!o && o.visible,
    );
    // ⚠️ 다음 주문이 **날아가는 도중에** 걸리므로, 이것들은 조리대를 비울 때 건드리면 안 된다.
    //    사라져 가는 김밥·칼집도 같이 맡긴다 — 조리대에 남은 것이 있으면 새 주문과 겹쳐 보인다.
    this.servingAway = [...served, ...stillOnBoard];
    for (const obj of served) {
      const t = this.baseOf(obj);
      this.scene.tweens.add({
        targets: obj,
        x: t ? t.x : obj.x - this.plateShift.x,
        y: t ? t.y : obj.y - this.plateShift.y,
        scaleX: obj.scaleX * SERVE_SHRINK,
        scaleY: obj.scaleY * SERVE_SHRINK,
        duration: SERVE_MS,
        delay: 140,
        ease: 'Quad.easeInOut',
      });
      this.scene.tweens.add({ targets: obj, alpha: 0, duration: 260, delay: 140 + SERVE_MS - 200 });
    }
    // 접시는 날려 둔 채 **곧바로** 다음 주문을 건다 — 0.7초를 손 놓고 보게 하지 않는다.
    finish();
    // ⚠️ 값은 **접시가 손님에게 닿을 때** 치러진다 — 종을 치는 순간 코인이 튀면
    //    아직 내밀지도 않은 김밥값을 미리 받는 꼴이라 순서가 뒤집힌다.
    const paySpot = this.baseOf(this.plate);
    if (paySpot) {
      this.scene.time.delayedCall(140 + SERVE_MS, () => this.payCoins(paySpot.x, paySpot.y, revenue));
    }
    this.scene.time.delayedCall(140 + SERVE_MS + 80, () => this.landServeFlight());
  }

  /**
   * **손님이 값을 치른다** — 접시가 닿은 자리에서 코인이 튀어올랐다 떨어지고 `+$N` 이 떠오른다.
   * 연출은 솔리테어의 손님 코인 드랍을 그대로 가져온 것이다(`coinBurst.ts`).
   *
   * ⚠️ **손해(실패·이탈)에는 부르지 않는다** — 코인이 떨어지는 그림은 어떻게 그려도 「벌었다」로 읽힌다.
   *    잃은 돈은 결과 화면의 붉은 숫자가 말한다.
   */
  private payCoins(x: number, y: number, revenue: number): void {
    if (revenue <= 0) return;
    // 접시(130) 위, 결과 별(220) 아래 — 별을 가리지 않으면서 조리대 위로는 확실히 올라온다.
    burstCoins(this.scene, { x, y, amount: revenue, depth: STAR_DEPTH - 20 });
  }

  /**
   * 손님에게 내민 접시가 다 날아갔다 — 저작 자리로 되돌려 감춘다.
   * 이 물건들은 다음 주문에서 **그대로 다시 쓰이므로**(접시·조각은 저작 노드 한 벌뿐이다)
   * 반드시 저작 상태로 복구해 두어야 한다.
   */
  private landServeFlight(): void {
    if (this.servingAway.length === 0) return;
    for (const obj of this.servingAway) {
      const base = this.baseOf(obj);
      this.scene.tweens.killTweensOf(obj);
      if (base) restore(obj, base);
      obj.setVisible(false);
    }
    this.servingAway = [];
  }

  /** 결과 한 줄 — 실패면 왜 실패했는지 짚어 준다. */
  private resultMessage(result: ScoreResult, revenue: number): string {
    const order = currentOrder(this.state);
    if (!result.failed) {
      const combo = this.state.perfectCombo;
      const praise =
        result.stars >= 3
          ? combo >= PERFECT_COMBO_MIN
            ? `완벽한 김밥 ${combo}연속!`
            : '완벽한 김밥!'
          : result.stars === 2
            ? '맛있어요!'
            : '그럭저럭…';
      const bonus = result.balanced ? ` 균형 +${BALANCE_BONUS}` : '';
      const penalty = result.forbiddenUsed ? ` 금지 −1★ −$${FORBIDDEN_PENALTY}` : '';
      const over = order ? extraCost(order, this.state.picked) : 0;
      const cost = over > 0 ? ` (더 넣은 재료 −$${over})` : '';
      return `${praise} ${result.total}점${bonus}${penalty}
${formatMoney(revenue, true)}${cost}`;
    }
    switch (result.failReason) {
      case 'timeout':
        return '시간 초과 — 주문 실패';
      case 'required':
        return order ? `필수 재료 「${INGREDIENT_LABEL[order.required]}」이(가) 빠졌어요` : '필수 재료가 빠졌어요';
      case 'core':
        return order ? `${MENU_LABEL[order.menu]}인데 핵심 재료가 없어요` : '핵심 재료가 없어요';
      case 'sequence':
        return '조리 순서가 틀렸어요';
      default:
        return '주문 실패';
    }
  }

  // ── 리셋 · 안내 ───────────────────────────────────────────────────────────

  /**
   * **조리대만 비운다** — 카드·손님·시계는 그대로다.
   * 한 주문을 여러 줄로 받았을 때 줄과 줄 사이에 쓴다(같은 손님의 같은 주문이 이어지는 중이다).
   */
  private clearBoard(): void {
    // ⚠️⚠️ **눌러 둔 입력은 여기서 지우지 않는다.** 여러 줄 주문은 줄과 줄 사이에도 이 함수를 거치는데
    //    (`playNextRoll`), 거기서 지우면 **다음 줄의 밥통을 미리 눌러 둔 것이 사라진다.**
    //    주문이 통째로 바뀔 때만 골라 낸다(`resetBoard` — 밥통만 남긴다).
    this.serveGlow?.clear();
    this.clearChopEvents();
    this.shakeTween?.stop();
    this.shakeTween = undefined;
    this.hideGhostKnife();
    // 주걱은 저작된 자리로, 문지르던 손은 치운다(연출 도중에 주문이 끝났을 수 있다).
    this.scoop?.reset();
    this.spreadHand?.hide();
    const cooked = COOKED_NODES.map((id) => image(this.layout, id));
    // 썰기·서빙 노드(김밥·칼집·썰기용 칼·접시·조각)도 저작 상태로 되돌린 뒤 감춘다.
    for (const obj of [...cooked, this.roll, ...this.cutMarks, this.cutKnife, this.plate, ...this.platePieces]) {
      const t = this.baseOf(obj);
      if (!obj || !t) continue;
      // ⚠️ 손님 쪽으로 날아가는 중인 접시는 건너뛴다 — 여기서 트윈을 끊고 되돌리면
      //    다음 주문이 걸리는 순간 접시가 **날아가다 말고 사라진다**(`landServeFlight` 가 끝나고 치운다).
      if (this.servingAway.includes(obj)) continue;
      this.scene.tweens.killTweensOf(obj);
      restore(obj, t);
      obj.setVisible(false);
    }
    // 진열 재료를 도로 밝게(흔들림으로 밀린 자리·크기까지 저작 상태로) + 체크 제거.
    for (const nodeId of TRAY_SLOT_HIT) {
      const obj = image(this.layout, nodeId);
      const t = this.baseOf(obj ?? undefined);
      if (!obj || !t) continue;
      this.scene.tweens.killTweensOf(obj);
      restore(obj, t);
    }
    for (const badge of this.slotChecks) {
      badge.hide();
      badge.setTone('light');
    }
    this.lastCheckTone = 'light';
    this.lastCountSec = 0;
    stopSpreadLoop();
    this.strips?.clear();
    // ⚠️ 별은 여기서 치우지 않는다 — 다음 주문 카드가 걸린 뒤에도 결과를 계속 볼 수 있어야 한다.
    this.sleepBell();
    this.riceRT?.clear();
    this.lastStamp = undefined;
    this.swipeStart = undefined;
    this.lumpFading = false;
    this.lump?.setVisible(false).setAlpha(1).setScale(this.lumpScale);
    this.lastGuide = '';
    this.refreshCounter();
    this.refreshRecipe();
  }

  /** 주문이 통째로 바뀐다 — 조리대를 비우고 카드·손님까지 새로 건다. */
  private resetBoard(replaced?: readonly number[]): void {
    // 주문이 갈렸다 — **앞 주문의 레시피에 매인 입력**(재료·마무리)은 여기서 버린다.
    this.pending.length = 0;
    this.clearBoard();
    // ⚠️ **카드보다 먼저** 진열을 갈아 끼운다 — 판이 바뀌었으면 새 카드의 재료가 여기 있어야 한다.
    this.refillTray();
    this.cards?.setCards(this.state.cards, replaced);
    // 카드가 걸리면 그 뒤에 설 사람도 카드의 주문 경로를 따라간다(현장=손님 · 전화/앱=배달원).
    this.customers?.setCards(this.state.cards);
    this.lastClock = '';
    this.refreshMoney();
    this.refreshClock();
    // 판이 어떤 길로 넘어갔든(정상 종료·개발용 넘기기) 단추의 판 번호는 여기서 따라온다.
    // ⚠️ **맨 마지막이다.** 눌러 둔 주문이 있으면 여기서 곧바로 조리가 시작되므로,
    //    카드·손님·시계가 다 자리를 잡은 뒤라야 한다.
    this.applyReserved();
  }

  /** 카드 시계 — 카드마다 따로 흐른다. 초 단위가 바뀔 때만 다시 그린다(Text 갱신은 비싸다). */
  private refreshClock(): void {
    // ⚠️ **판 번호를 먼저 알린다** — 목표 건수와 판 시간이 판마다 다르다(`logic/stage.ts`).
    this.stageTimer?.setStage(this.state.stageIndex);
    this.stageTimer?.setProgress(stageProgress(this.state.stageMs, this.state.stageIndex));
    // ⚠️ 명판은 **미션을 다 채우기까지 남은 시간**이다(처리량이 아니다) — 판을 끝내는 조건이 미션이다.
    this.stageTimer?.setRemaining(stageRemainingMs(this.state.stageMs, this.state.stageIndex));
    // 기다리는 손님의 인내심 — 카드 시계와 달리 **매 tick 그린다**(막대라 초 단위로 끊기지 않는다).
    this.cards?.setWaits(this.state.cards.map((_, i) => waitRatioOf(this.state, i)));
    const left = this.state.cards.map((_, i) => remainingMsOf(this.state, i));
    const labels = left.map(formatClock);
    const key = labels.join('|');
    if (key === this.lastClock) return;
    this.lastClock = key;
    const urgent = left.map((ms) => ms <= CLOCK_URGENT_MS);
    this.cards?.setClocks(labels, urgent);
    this.refreshCountdown(left);
  }

  /**
   * 마지막 10초 — **매초 재촉 소리만** 낸다(숫자는 띄우지 않는다. 화면을 가리기만 한다).
   * 조리 중인 카드만 센다 — 대기 카드는 시계가 멈춰 있다.
   */
  private refreshCountdown(left: readonly number[]): void {
    const chosen = this.state.chosen;
    const ms = chosen === null ? Number.POSITIVE_INFINITY : (left[chosen] ?? Number.POSITIVE_INFINITY);
    const sec = Math.ceil(ms / 1000);
    const counting = this.state.stage !== 'served' && chosen !== null && sec >= 1 && sec <= COUNTDOWN_FROM;
    if (!counting) {
      this.lastCountSec = 0;
      return;
    }
    if (sec === this.lastCountSec) return;
    this.lastCountSec = sec;
    sfx('clock_warn', { volume: 0.75 });
  }

  /** 필요한 재료를 다 채웠으면 체크를 짙은 녹색으로 바꾼다. */
  private refreshCheckTone(): void {
    const { count, need } = pickProgress(this.state);
    const tone: CheckTone = need > 0 && count >= need ? 'strong' : 'light';
    for (const badge of this.slotChecks) badge.setTone(tone);
    // 다 채운 그 순간에만 「말아도 된다」는 신호를 낸다(더 담아도 다시 울리지 않는다).
    if (tone === 'strong' && this.lastCheckTone !== 'strong') sfx('ingredient_full');
    this.lastCheckTone = tone;
  }

  /**
   * 서빙 빛의 기준 크기 — 접시 지름 언저리.
   * ⚠️ 접시 노드에서 재지 않는다. 이 빛은 **생성자에서** 만드는데 그때는 썰기·서빙 층을 아직 안 들여왔을 수 있다.
   *    조리대 폭은 처음부터 확정이므로 여기서 잡는다(빛 크기는 어차피 상대값이다).
   */
  private plateSize(): number {
    return this.matRect.w * 0.55;
  }

  /** 잔고 갱신. */
  /**
   * 화면 맨 위 가운데 달러 — **미션을 깨서 받은 보상의 누적**이다.
   *
   * ⚠️⚠️ **주문 수익(매출)이 아니다.** 매출은 미션이 재는 것이고(`매출 $11 / $104`),
   * 여기 뜨는 것은 그 미션을 깨서 받은 재화다. 둘을 한 숫자에 섞으면
   * 「미션을 깨서 번 것」이 매출에 묻혀 **미션을 깰 이유가 흐려진다.**
   */
  private refreshMoney(): void {
    this.money?.setText(formatMoney(this.state.missionEarned));
  }

  /** 아직 안내를 띄울 때인가 — 처음 다섯 주문. */
  private get guiding(): boolean {
    return this.state.servedCount < GUIDE_ORDERS;
  }

  /**
   * 조리대 위 한 줄에 무엇을 쓸지 정한다.
   * 재료 단계에서는 안내와 카운터를 **한 줄로 합쳐** 보여 준다(자리 다툼 없이 둘 다 전달).
   */
  private guideLabel(): string {
    const { count, need } = pickProgress(this.state);
    const stage = this.state.stage;
    if (stage === 'riceSpread' && need > 0) {
      return this.guiding ? `④ 재료를 고르세요  ${count} / ${need}` : `재료 ${count} / ${need}`;
    }
    // ⚠️ **마무리 구간에서는 남은 시간이 안내보다 급하다.** 손이 묶인 채 시계만 흐르는 구간이라,
    //    「몇 초 남았나」가 안 보이면 실패가 갑자기 닥친 것으로만 느껴진다.
    if (FINISH_COUNT_STAGES.has(stage)) {
      const sec = Math.max(0, Math.ceil(this.remainingSec()));
      const guide = this.guiding ? STAGE_GUIDE[stage] : undefined;
      return guide ? `${guide} · ${sec}초` : `남은 ${sec}초`;
    }
    if (this.guiding) return STAGE_GUIDE[stage] ?? '';
    return COUNTER_STAGES.has(stage) && need > 0 ? `재료 ${count} / ${need}` : '';
  }

  /** 고른 주문에 남은 시간(초). 고르기 전이면 0. */
  private remainingSec(): number {
    const chosen = this.state.chosen;
    return chosen === null ? 0 : remainingMsOf(this.state, chosen) / 1000;
  }

  /** 지금 한 줄에 쓸 글자색 — 마무리 구간에서 10초를 끊으면 붉어진다. */
  private pillColor(): string {
    if (!FINISH_COUNT_STAGES.has(this.state.stage)) return PILL_INK.normal;
    return this.remainingSec() * 1000 <= CLOCK_URGENT_MS ? PILL_INK.urgent : PILL_INK.normal;
  }

  /** 안내·카운터 갱신. 글자가 바뀌면 알약 배경도 길이에 맞춰 다시 그린다. */
  private refreshCounter(): void {
    const counter = this.counter;
    if (!counter) return;
    // ⚠️ **정산 도장이 떠 있는 동안은 건드리지 않는다.** 이 함수는 입력·tick 마다 불리는데,
    //    그때마다 다시 쓰면 「완성!」이 한 프레임 만에 지워진다(다음 주문이 곧바로 걸리기 때문이다).
    const stamp = this.pillStamp;
    if (stamp && this.scene.time.now < stamp.until) {
      this.drawPill(stamp.text, stamp.color);
      return;
    }
    this.pillStamp = undefined;
    this.drawPill(this.guideLabel(), this.pillColor());
  }

  /**
   * **정산 결과를 한 줄에 찍는다** — 해냈으면 「성공!  n초 남김」, 아니면 왜 실패했는지.
   * ⚠️ 글자는 **「성공」**이다(PO 지시) — 「완성」은 김밥이 다 만들어졌다는 뜻으로도 읽혀서
   *    제 시간에 내보냈는지가 흐려진다.
   *
   * ⚠️⚠️ 이게 필요한 이유는 **다음 주문이 곧바로 걸리기 때문**이다. 종을 치는 순간 카드가 갈리므로
   * 방금 만들던 주문의 시계도 함께 사라진다 — 그러면 「제 시간에 해낸 건가」를 확인할 길이 없다.
   * 남긴 시간을 여기 함께 적어 두면 접시가 날아가는 동안에도 그게 보인다.
   */
  private stampResult(result: ScoreResult): void {
    const leftSec = Math.max(0, Math.floor(this.remainingSec()));
    const text = result.failed
      ? `실패 — ${FAIL_SHORT[result.failReason ?? 'sequence'] ?? '주문 실패'}`
      : `성공!  ${leftSec}초 남김`;
    this.pillStamp = {
      text,
      color: result.failed ? PILL_INK.fail : PILL_INK.done,
      until: this.scene.time.now + STAMP_HOLD_MS,
    };
    this.lastGuide = '';
    this.refreshCounter();
  }

  /** 한 줄을 실제로 그린다(알약 배경은 글자 길이에 맞춰 다시 그린다). */
  private drawPill(label: string, color: string): void {
    const counter = this.counter;
    if (!counter) return;
    const showing = label.length > 0;
    counter.setVisible(showing);
    this.counterPad?.setVisible(showing);
    if (!showing) return;
    if (label === this.lastGuide && counter.style.color === color) return;
    this.lastGuide = label;
    counter.setText(label).setColor(color);

    const pad = this.counterPad;
    if (!pad) return;
    const { h, padX, minW, maxW } = GUIDE_PILL;
    const w = Math.min(maxW, Math.max(minW, counter.width + padX * 2));
    const x = counter.x - w / 2;
    const y = counter.y - h / 2;
    pad.clear();
    pad.fillStyle(0x2a1608, 0.86);
    pad.fillRoundedRect(x, y, w, h, h / 2);
    pad.lineStyle(4, 0xffd9a0, 0.9);
    pad.strokeRoundedRect(x, y, w, h, h / 2);
  }

  private showToast(message: string, at?: { readonly x: number; readonly y: number }): void {
    const toast = this.toast;
    if (!toast) return;
    this.scene.tweens.killTweensOf(toast);
    // 자리를 주면 거기에, 안 주면 늘 쓰던 조리대 위에.
    const home = { x: this.matRect.cx, y: this.matRect.cy - this.matRect.h * 0.42 };
    const spot = at ?? home;
    toast.setPosition(spot.x, spot.y);
    toast.setText(message).setVisible(true).setAlpha(1).setScale(0.8);
    this.scene.tweens.add({ targets: toast, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: toast,
      alpha: 0,
      delay: TOAST_HOLD_MS,
      duration: 300,
      onComplete: () => toast.setVisible(false),
    });
  }

  /**
   * 눌림 피드백. 원래 크기는 **처음 눌렀을 때 한 번만** 기록한다 —
   * 매번 현재 스케일을 기준으로 잡으면 연타 시 트윈이 겹쳐 아이콘이 계속 작아진다.
   * ⚠️ 기준은 현재 크기가 아니라 **저작 크기**다. 종처럼 맥동 트윈이 도는 것을
   *    한창 커진 순간에 누르면 그 크기가 기준으로 굳어 버린다.
   */
  private pressFeedback(obj: Phaser.GameObjects.Image): void {
    let rest = this.restScale.get(obj);
    if (!rest) {
      const design = this.baseOf(obj);
      rest = { sx: design?.scaleX ?? obj.scaleX, sy: design?.scaleY ?? obj.scaleY };
      this.restScale.set(obj, rest);
    }
    this.scene.tweens.killTweensOf(obj);
    obj.setScale(rest.sx, rest.sy);
    this.scene.tweens.add({
      targets: obj,
      scaleX: rest.sx * 0.92,
      scaleY: rest.sy * 0.92,
      duration: 80,
      yoyo: true,
      onComplete: () => obj.setScale(rest.sx, rest.sy),
    });
  }
}
