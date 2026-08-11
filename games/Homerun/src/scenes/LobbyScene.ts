/**
 * 로비 화면(에디터 SSOT blank.json) — 공용 로딩 씬 다음, PlayScene 이전에 거치는 타이틀 화면.
 * 배경·비행선·축포 이미지는 전부 에디터 레이아웃에서 오고, 이 씬은 다음 연출만 코드로 얹는다:
 *   1) 비행선 3기 둥둥 뜨기(서로 다른 진폭·주기·지연으로 따로 노는 느낌)
 *   2) 축포 6개 연달아 순서대로 터지기 — 아래에서 위로 올라가며 서서히 투명해져 사라진 뒤,
 *      몇 초 쉬었다가 다시 처음부터 반복
 *   3) 배경 뷰가 좌→우→좌로 천천히 드리프트(카메라 스크롤) — 화면 밖 요소도 자연스레 노출
 *   4) 관중석 쪽에서 색종이(컨페티) 이펙트가 여러 지점에서 번갈아 터지는 배경 연출
 *   5) 로비에 선 여성 타자 캐릭터(spriteDocClip) 애니메이션만 50% 속도로 재생
 *   6) START 버튼(화면 고정, 카메라 드리프트 영향 없음) — 탭하면 오디오 언락 통지 후 PlayScene 진입
 */
import Phaser from 'phaser';
import { FONT, portalConfirmStart } from '@casual/core';
import { anchorLayoutDoc, buildLayout, type LayoutDoc, type LayoutIndex, type LayoutNode, type PinMode } from '../ui/layoutLoader.js';
import {
  UI_LOBBY_LAYOUT_KEY,
  CONFETTI_KEY,
  ICON_PROFILE_KEY,
  ICON_SHOP_KEY,
  LEAGUE_EMBLEM_KEYS,
  ensureGeneratedTextures,
  preloadSelectedBatterClips,
} from '../assets.js';
import { setBatterPreset, type BatterPresetKey } from '../ui/spriteRegistry.js';
import { LEAGUE_TIERS, canStepLeagueTier, formatLeagueNumber, getLeagueTier, stepLeagueTier } from '../logic/league.js';
import { canAfford, ensureLaunchGrant, getCoins, spendCoins } from '../logic/economy.js';
import { trophyProgress } from '../logic/trophyStore.js';
import { openProfilePopup } from './profilePopup.js';
import { openShopPopup } from './shopPopup.js';
import { showToast } from '../toast.js';

/** blank.json 노드 id — 하네스(.pue-harness/screens/blank.md) 기준. */
const AIRSHIPS: ReadonlyArray<{ id: string; amp: number; durationMs: number; delayMs: number }> = [
  { id: 'layer_4', amp: 16, durationMs: 2200, delayMs: 0 },
  { id: 'layer_4_copy', amp: 22, durationMs: 2600, delayMs: 300 },
  { id: 'layer_4_copy2', amp: 18, durationMs: 1900, delayMs: 600 },
];
const CONFETTI_IDS = ['layer_3', 'layer_3_copy', 'layer_3_copy2', 'layer_3_copy3', 'layer_3_copy4', 'layer_3_copy5'];
/** 로비 캐릭터 애니메이션 재생 속도 — 50%(사용자 요청, 배경 연출은 원속도 유지). */
const CHARACTER_TIME_SCALE = 0.5;

/**
 * 여성 타자가 열리는 리그(티어 id) — 이 리그 이상을 고르면 선택할 수 있다(사용자 요청: "레벨을
 * 적용하지 않고 특정 리그부터 적용가능한" 방식). 5개 리그의 한가운데인 세미프로리그로 잡았다.
 * 다른 리그로 옮기려면 이 한 줄만 바꾸면 된다(카드 문구도 리그 이름을 그대로 따라간다).
 */
const FEMALE_UNLOCK_TIER_ID = 3; // 세미프로리그

/**
 * 고를 수 있는 타자 — **화면에 놓인 순서(왼쪽 → 오른쪽)** 로 적는다. 캐릭터 탭 히트영역을 이웃과의
 * 중간선으로 자를 때 이 순서를 쓰므로, 에디터에서 캐릭터 위치를 바꾸면 이 배열 순서도 맞춰야 한다.
 * preset 은 PlayScene 이 쓸 타자 프리셋 키(spriteRegistry.BATTER_PRESETS).
 */
const LOBBY_CHARACTERS: ReadonlyArray<{ nodeId: string; preset: BatterPresetKey; unlockTierId?: number }> = [
  { nodeId: 'layer_8', preset: 'male' }, // 캐릭터: 남성 아이들 동작 (좌)
  { nodeId: 'layer_7', preset: 'female', unlockTierId: FEMALE_UNLOCK_TIER_ID }, // 캐릭터: 여성캐릭터 아이들 (우)
];
/** 잠금 문구를 탭했을 때 튕기는 배율. */
const LOCK_LABEL_PULSE = 1.12;
/** 더 갈 수 없는 방향의 리그 전환 버튼 투명도. */
const ARROW_DISABLED_ALPHA = 0.35;
/**
 * 로비를 열었을 때 미리 선택돼 있는 캐릭터(사용자 요청: "남성 캐릭터를 기본 캐릭터로").
 * Play Ball 버튼도 이 캐릭터 아래에서 시작한다 — 에디터가 버튼을 어디에 두었든 이 값이 이긴다.
 */
const DEFAULT_LOBBY_CHARACTER: BatterPresetKey = 'male';
/**
 * 좌/우 버튼 노드 id — **리그 전환** 버튼(사용자 요청: "좌우 버튼은 리그 전환 버튼으로 전환").
 * 캐릭터 선택은 캐릭터를 직접 탭하는 방식만 남는다.
 */
const PREV_ARROW_ID = 'layer_9'; // 좌이동 = 이전(쉬운) 리그
const NEXT_ARROW_ID = 'layer_9_copy'; // 우이동 = 다음(어려운) 리그
/** Play Ball 버튼 — 배경판(image)과 라벨(text) 두 노드를 한 덩어리로 움직인다. */
const PLAY_BUTTON_IDS = ['layer_10', 'layer_11'];
/**
 * 선택 표시는 **Play Ball 버튼 위치로만** 한다 — 선택되지 않은 캐릭터의 투명도는 건드리지 않는다
 * (사용자 요청: "비선택 캐릭터도 투명을 적용하지 말라"). 0.45 → 0.7 → 0.85 로 올려 봤지만 배경이
 * 비치는 느낌이 남아 결국 걷어냈다. 두 캐릭터 모두 에디터가 저작한 불투명도 그대로 그린다.
 */

/**
 * 리그 카드 노드 id — 카드 배경 + 텍스트 전부(리그명·접속중/입장료/보상 라벨과 값).
 * **로비에 상시 떠 있는다**(사용자 요청: "리그 팝업화면이 항시 띄워달라") — 예전처럼 Play Ball
 * 탭 순간에만 잠깐 떴다 사라지지 않는다. UI 취급 — scrollFactor(0)으로 카메라 드리프트와 분리.
 *
 * ⚠️ 에디터에서 카드에 새 텍스트 노드를 추가하면 이 목록에도 id를 더해야 한다 — 빠지면 카드가
 *    뜨기 전에도 그 글자만 화면에 남는다(사용자 보고: "클럽리그 폰트가 팝업화면이 나타나기 전에
 *    표시된다").
 * ⚠️ `layer_8` 은 여기 들어가면 안 된다 — 에디터에서 그 id 가 **남성 캐릭터**로 바뀌었다
 *    (2026-08-02). 목록에 남겨두면 캐릭터가 카드 컨테이너로 들어가 로비에서 통째로 사라진다.
 */
const LEAGUE_CARD_IDS = [
  'layer_6',
  'layer_6_copy', // 카드 위 리그 엠블럼(방패) — 리그마다 그림이 바뀐다.
  'layer_8_copy',
  'layer_8_copy2',
  'layer_8_copy3',
  'layer_8_copy4',
  'layer_8_copy5',
  'layer_8_copy6',
  'layer_8_copy7',
];
/** 카드 안에서 리그마다 바뀌는 값 노드 — 라벨(접속중/입장료/보상)은 고정이라 건드리지 않는다. */
const LEAGUE_TEXT_IDS = {
  title: 'layer_8_copy7', // 리그명
  online: 'layer_8_copy4', // 접속중 인원
  entryFee: 'layer_8_copy5', // 입장료
  reward: 'layer_8_copy', // 보상
} as const;
/** 카드 위 리그 엠블럼(방패) 노드 id — 리그 단계에 따라 텍스처를 갈아 끼운다. */
const LEAGUE_EMBLEM_ID = 'layer_6_copy';
/**
 * 가변 캔버스 높이(1920~2400)의 세로 앵커(pin) 오버라이드 — 휴리스틱(상단⅓=top·하단⅓=bottom·
 * 중간=center)만으로는 틀리는 노드를 명시한다:
 *   · 하늘·비행선(layer_2, layer_4*) = top — 짧은 화면에선 하늘 위가 아니라 지상 쪽이 잘려야 자연스럽다.
 *   · 야구장·관중석·전광판(layer_1, layer_3*, layer_5) = bottom — 필드 크롭 보존(디자인 상단만 잘림).
 *   · 리그 카드 묶음(카드판+엠블럼+텍스트+좌우 화살표) = center — 여러 y 대역에 걸쳐 있어
 *     휴리스틱이 top/center 로 찢는다. 한 단위로 화면 중앙 기준 이동.
 * 캐릭터(layer_7/8)·Play Ball(layer_10/11)은 휴리스틱이 이미 bottom — 명시 불필요.
 */
const LOBBY_PIN_OVERRIDES: Readonly<Record<string, PinMode>> = {
  layer_2: 'top',
  layer_4: 'top',
  layer_4_copy: 'top',
  layer_4_copy2: 'top',
  layer_1: 'bottom',
  layer_3: 'bottom',
  layer_3_copy: 'bottom',
  layer_3_copy2: 'bottom',
  layer_3_copy3: 'bottom',
  layer_3_copy4: 'bottom',
  layer_3_copy5: 'bottom',
  layer_5: 'bottom',
  ...Object.fromEntries(LEAGUE_CARD_IDS.map((id) => [id, 'center'])),
  [PREV_ARROW_ID]: 'center',
  [NEXT_ARROW_ID]: 'center',
};
/**
 * 카드 등장 타이밍 — 캐릭터 클립이 모두 뜬 뒤 이만큼 쉬었다가 팝인한다(사용자 요청: "캐릭터가
 * 다 띄워 진 후 약 1.5초 정도 텀을 두고"). 홈화면을 다시 열 때도 매번 같은 순서로 재생된다.
 */
const LEAGUE_CARD_DELAY_MS = 1500;
/**
 * 캐릭터 로드를 아무리 기다려도 이 시간이 지나면 카드를 띄운다 — 클립 로드가 실패해도 카드까지
 * 같이 사라지지 않도록 하는 안전망(사용자 보고: 캐릭터·팝업·전광판이 한꺼번에 안 보임).
 */
const LEAGUE_CARD_MAX_WAIT_MS = 4000;
const LEAGUE_CARD_IN_MS = 260;

const CHEER_TINTS = [0xffd147, 0xff6b6b, 0x7cd5ff, 0x8dff9e, 0xffffff, 0xff9ff3];
/** 축포 사이 발사 간격(연달아 터지는 리듬) + 한 바퀴 다 돌고 나서 쉬는 시간(마지막 축포의 유지+페이드가 끝난 뒤여야 함). */
const FIRE_STAGGER_MS = 260;
const FIRE_CYCLE_GAP_MS = 8700;
const FIRE_PARTICLE_COUNT = 20;
/** 축포 이미지가 원래 위치보다 얼마나 아래에서 출발해 위로 솟는지 + 터진 뒤 유지·페이드아웃 타이밍. */
const RISE_START_OFFSET = 100;
const RISE_TRAVEL = 60;
const RISE_MS = 850;
const HOLD_MS = 5000;
const FADE_MS = 2800; // 기존 1300 의 2배 이상 — 더 느리고 서서히 사라지도록.

/** 배경 뷰가 중심에서 좌우로 아주 소폭·천천히 흔들리는 드리프트(카메라 스크롤) — 폭은 작게, 주기는 길게. */
const DRIFT_AMPLITUDE = 45; // 사용자 요청으로 기존 90 의 절반 — 흔들림 폭만 줄이고 주기는 그대로.
const DRIFT_MS = 8000;
const DRIFT_HOLD_MS = 800;

/**
 * 관중석 배경(야구장 이미지에 그려진 관중·응원단) 위치는 별도 노드가 없어 하네스 스크린샷을
 * 눈대중으로 잡은 근사 좌표다 — 화면 상단 스탠드 밴드를 가로지르는 몇 지점에서 색종이가 번갈아 터진다.
 */
const STANDS_BURST_POINTS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 130, y: 340 },
  { x: 380, y: 300 },
  { x: 660, y: 230 },
  { x: 930, y: 300 },
];
const STANDS_FIRE_STAGGER_MS = 550;
const STANDS_CYCLE_GAP_MS = 3600;
const STANDS_PARTICLE_COUNT = 26;

type ConfettiTarget = { img: Phaser.GameObjects.Image; node: LayoutNode };

/**
 * 이 오브젝트를 UI 로 취급 — 배경 카메라 드리프트를 따라가지 않고 화면에 고정한다(사용자 요청:
 * "이 버튼들을 UI취급하여 배경이나 캐릭터 좌우 이동시 이동시키지 마세요").
 *
 * scrollFactor(0) 이면 좌표가 곧 화면 좌표라, 에디터가 저작한 x/y 에 그대로 붙는다(드리프트가
 * 0 일 때와 같은 자리). 입력 히트 판정도 Phaser 가 scrollFactor 를 반영해 계산하므로 그대로 눌린다.
 *
 * ⚠️ 캐릭터는 배경과 함께 드리프트하므로, 고정된 Play Ball 버튼과 선택된 캐릭터 사이에는
 *    드리프트 폭(±DRIFT_AMPLITUDE)만큼의 어긋남이 생긴다. 두 캐릭터 간격(535px)에 비하면 작아
 *    "누구 아래 있는지"는 흔들리지 않는다 — 고정을 우선한 의도된 절충이다.
 */
function pinToScreen(obj: Phaser.GameObjects.Image): void {
  obj.setScrollFactor(0);
}

/** 화면에 올라온 캐릭터 하나 — 선택되면 Play Ball 버튼이 그 아래로 옮겨간다. */
interface LobbyCharacter {
  readonly preset: BatterPresetKey;
  readonly obj: Phaser.GameObjects.GameObject & { x: number };
  readonly nodeX: number;
  /** 이 리그(티어 id) 이상에서만 고를 수 있다(없으면 제한 없음). */
  readonly unlockTierId?: number;
}

export class LobbyScene extends Phaser.Scene {
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  private standsConfetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** 리그 카드(배경+텍스트+엠블럼) — 로비에 상시 표시. */
  private leagueCard?: Phaser.GameObjects.Container;
  /** 카드 위 리그 엠블럼(방패) — 리그마다 텍스처를 갈아 끼운다. */
  private leagueEmblem?: Phaser.GameObjects.Image;
  /** 엠블럼의 저작 가로 폭 — 세로가 다른 그림으로 바꿔도 이 폭에 맞춰 균일 스케일한다. */
  private emblemWidth = 0;
  /** 카드에서 리그마다 값이 바뀌는 텍스트들. */
  private leagueTexts?: {
    title?: Phaser.GameObjects.Text;
    online?: Phaser.GameObjects.Text;
    entryFee?: Phaser.GameObjects.Text;
    reward?: Phaser.GameObjects.Text;
  };
  /** 보유 코인 표시 — 입장료 텍스트 바로 위에 코드로 얹는다(에디터에 노드가 없음). */
  private coinText?: Phaser.GameObjects.Text;
  /** 이 리그의 트로피 진행도("3 / 5") — 승급 게이트라 반드시 보여야 한다. */
  private trophyText?: Phaser.GameObjects.Text;
  /** 좌→우 순서로 화면에 놓인 선택 가능 캐릭터. 레이아웃에 없는 캐릭터는 빠진다. */
  private characters: LobbyCharacter[] = [];
  private selectedIndex = 0;
  /** Play Ball 버튼(배경판+라벨)과 각자의 저작 x — 선택된 캐릭터 아래로 함께 옮겨 다닌다. */
  private playButtonParts: Array<{ obj: Phaser.GameObjects.Image; baseX: number }> = [];
  /** 에디터가 버튼을 그 아래에 놓아둔 캐릭터 = 이동량 계산의 기준(그리고 최초 선택). */
  private buttonBaseIndex = 0;
  /** 캐릭터별 잠금 안내 문구(해금됐으면 undefined) — characters 와 같은 인덱스. */
  private lockLabels: Array<Phaser.GameObjects.Text | undefined> = [];
  /** 리그 전환 버튼과 이동 방향(-1 이전 / +1 다음). */
  private leagueArrows: Array<{ obj: Phaser.GameObjects.Image; step: number }> = [];
  private starting = false;

  constructor() {
    super('lobby');
  }

  create(): void {
    ensureGeneratedTextures(this); // CONFETTI_KEY 안전망(이미 로딩화면에서 생성됨).
    // ⚠️ Phaser 는 씬 인스턴스를 재사용한다 — 클래스 필드 초기화는 최초 1회뿐이라 이전 실행에서
    //    바뀐 상태가 그대로 남는다. 실제로 게임 중 홈버튼으로 돌아오면 starting 이 true 로 남아
    //    Play Ball 이 아무 반응도 하지 않았다(사용자 보고: "플레이볼로 다음경기 진입이 않됩니다").
    //    씬을 다시 열 때마다 반드시 여기서 되돌린다.
    this.starting = false;
    // 코인 1만 지급(사용자 요청) — 기존 플레이어에게 1회, 신규는 시작 자금 자체가 1만.
    ensureLaunchGrant();
    const w = this.scale.width;
    const h = this.scale.height;

    // 가변 캔버스 높이(designHeightRange) — 디자인(2400)보다 짧으면 세로 앵커 변환을 먼저 적용.
    // 하늘 요소=top(하늘 위가 아닌 지상 쪽이 잘려야 자연스러움)·지상(야구장/관중석)=bottom·
    // 리그 카드 묶음=center(한 단위) — 캐릭터/Play Ball 은 휴리스틱(하단⅓)이 bottom 으로 처리.
    const rawDoc = (this.cache.json.get(UI_LOBBY_LAYOUT_KEY) ?? null) as LayoutDoc | null;
    // 가로도 가변(designWidthRange, 1080~1440) — 넓어진 폭은 세이프존 중앙정렬(pinX 기본 center)로
    // 흡수한다. 로비엔 가장자리 고정이 필요한 **레이아웃 노드**가 없다(프로필/상점 레일은 코드로
    // x=96 에 그려 캔버스 좌단에 자연히 붙는다 — buildCornerMenu 참조).
    const doc = rawDoc ? anchorLayoutDoc(rawDoc, h, LOBBY_PIN_OVERRIDES, { canvasW: w }) : null;
    if (doc) {
      const layout = buildLayout(this, doc);
      this.floatAirships(layout);
      this.setupCameraDrift(doc, w, h);
      this.slowCharacterAnimations(layout);
      this.buildCharacterSelect(layout);
      this.buildLeagueCard(layout); // 캐릭터 목록을 먼저 만들어야 등장 타이밍을 잴 수 있다.
      this.buildCornerMenu();

      this.confetti = this.add.particles(0, 0, CONFETTI_KEY, {
        speed: { min: 260, max: 560 },
        gravityY: 700,
        lifespan: { min: 480, max: 820 },
        scale: { start: 1.1, end: 0.3 },
        rotate: { min: 0, max: 360 },
        tint: CHEER_TINTS,
        emitting: false,
      });
      this.confetti.setDepth(50);

      const targets = this.collectConfettiTargets(layout);
      // 첫 발사 전엔 숨김 — 에디터 기본 위치·알파로 잠깐 노출되는 깜빡임 방지.
      for (const t of targets) t.img.setAlpha(0);
      if (targets.length) this.scheduleConfettiCycle(targets);

      this.standsConfetti = this.add.particles(0, 0, CONFETTI_KEY, {
        speed: { min: 140, max: 340 },
        angle: { min: 235, max: 305 }, // 관중석에서 위로 퍼지며 분출.
        gravityY: 500,
        lifespan: { min: 450, max: 850 },
        scale: { start: 1.1, end: 0.3 },
        rotate: { min: 0, max: 360 },
        tint: CHEER_TINTS,
        emitting: false,
      });
      this.standsConfetti.setDepth(40);
      this.scheduleStandsConfetti();
    }
  }

  /**
   * 로비 캐릭터(spriteDocClip) 애니메이션만 50% 속도로 — 클립 로드가 비동기라
   * (layoutLoader.ts 의 buildAdvancedNode 가 로드 완료 시 컨테이너에 핸들을 실어둔다) 이미
   * 로드가 끝났으면 바로, 아직이면 완료 이벤트로 적용한다. 다른 로비 연출(비행선·축포·카메라
   * 드리프트)은 건드리지 않는다(사용자 요청: "캐릭터 애니메이션만" 50%).
   */
  private slowCharacterAnimations(layout: LayoutIndex): void {
    for (const { nodeId } of LOBBY_CHARACTERS) {
      const container = layout.tryById<Phaser.GameObjects.Container>(nodeId);
      if (!container) continue;
      const apply = (h: { clip?: { timeScale?: number } } | null | undefined): void => {
        if (h?.clip) h.clip.timeScale = CHARACTER_TIME_SCALE;
      };
      const existing = container.getData('spriteClipHandle') as { clip?: { timeScale?: number } } | undefined;
      if (existing) apply(existing);
      else container.once('clipready', apply);
    }
  }

  /**
   * 캐릭터 선택 — 좌/우 이동 버튼이나 캐릭터를 직접 탭하면 선택이 바뀌고, Play Ball 버튼이 그
   * 캐릭터 아래로 옮겨간다(사용자 요청: "로비화면에서 캐릭터를 선택하면 캐릭터 플레이볼 버튼이
   * 나타남 · 미리 선택되어 있는 캐릭터 하단에 플레이볼 버튼이 표시되어 있고, 누르면 해당
   * 캐릭터로 게임 진행").
   *
   * 처음 선택된 캐릭터는 **에디터가 버튼을 놓은 위치로 판단한다** — 저작자가 버튼을 어느 캐릭터
   * 아래에 뒀는지가 곧 "미리 선택된 캐릭터"라, 코드에 따로 기본값을 박아두면 에디터에서 버튼을
   * 옮겼을 때 둘이 어긋난다.
   */
  private buildCharacterSelect(layout: LayoutIndex): void {
    this.characters = LOBBY_CHARACTERS.flatMap(({ nodeId, preset, unlockTierId }) => {
      const obj = layout.tryById<Phaser.GameObjects.Container>(nodeId);
      return obj ? [{ preset, obj, nodeX: layout.nodeById(nodeId).x, unlockTierId }] : [];
    });
    if (!this.characters.length) return;
    this.lockLabels = [];

    // ⚠️ 배경판+라벨을 Container 로 묶지 않는다 — 컨테이너 자식은 히트 판정이 잡히지 않아 버튼이
    //    눌리지 않았다(실측: plate.input 은 살아 있는데 pointerup 이 아예 안 옴). 화살표처럼
    //    루트 오브젝트로 두고 선택이 바뀔 때 각자의 x 를 같이 옮긴다.
    this.playButtonParts = PLAY_BUTTON_IDS.flatMap((id) => {
      const obj = layout.tryById<Phaser.GameObjects.Image>(id);
      if (!obj) return [];
      pinToScreen(obj);
      return [{ obj, baseX: obj.x }];
    });
    if (this.playButtonParts.length) {
      // 버튼 이동량의 기준점 = 에디터가 버튼을 그 아래 놓아둔 캐릭터(저작 좌표를 그대로 살린다).
      this.buttonBaseIndex = this.nearestCharacterIndex(layout.nodeById(PLAY_BUTTON_IDS[0]).x);
      this.attachPlayButtonInput(layout);
    }
    // 최초 선택은 기준점과 별개 — 기본 캐릭터가 기준점이 아니면 버튼이 그 아래로 옮겨진 채 시작한다.
    // 잠긴 캐릭터가 기본으로 잡히면 아무도 못 고르는 상태가 되므로 해금된 첫 캐릭터로 물러난다.
    const preselected = this.characters.findIndex((c) => c.preset === DEFAULT_LOBBY_CHARACTER && this.isUnlocked(c));
    const fallback = this.characters.findIndex((c) => this.isUnlocked(c));
    this.selectedIndex = preselected >= 0 ? preselected : Math.max(0, fallback);

    this.characters.forEach((c, i) => this.makeCharacterTappable(c, i));
    this.leagueArrows = [];
    this.bindArrow(layout, PREV_ARROW_ID, -1);
    this.bindArrow(layout, NEXT_ARROW_ID, +1);
    this.refreshArrowStates();
    this.refreshLockLabels();
    this.applySelection(false);
  }

  /**
   * 캐릭터를 직접 탭해도 선택되게 한다(화살표와 병행). 히트 영역은 노드 rect 가 아니라 **로드된
   * 클립의 실제 화면 경계**로 잡는다 — 노드 rect 는 프레임 여백까지 포함하고 앵커(발밑/중심)도
   * 문서마다 달라, 그대로 쓰면 캐릭터가 없는 허공이 눌린다. 클립 로드는 비동기라 이미 끝났으면
   * 바로, 아직이면 완료 이벤트에서 잡는다.
   *
   * ⚠️ **히트 영역은 컨테이너 로컬(스케일 적용 전) 좌표라야 한다.** getBounds() 는 스케일이 이미
   * 반영된 월드 크기를 주므로, 그 값을 그대로 넘기면 Phaser 가 컨테이너 스케일을 한 번 더 곱해
   * 영역이 스케일 배수만큼(여기선 약 3배) 부풀어 오른다. 그러면 두 캐릭터의 영역이 크게 겹치고
   * topOnly 규칙상 depth 가 높은 캐릭터가 탭을 모두 가로채, 다른 캐릭터를 눌러도 선택이 바뀌지
   * 않는다(사용자 보고: "캐릭터를 선택하여 플레이 캐릭터 전환이 잘 않된다"). 스케일로 나눠 환산한다.
   *
   * 겹침을 원천 차단하기 위해 좌우 이웃 캐릭터와의 중간 지점까지로 폭도 제한한다 — 캐릭터 그림이
   * 서로 닿을 만큼 붙어 있어도 "누구를 눌렀는지"가 항상 명확해진다.
   */
  private makeCharacterTappable(c: LobbyCharacter, index: number): void {
    const container = c.obj as unknown as Phaser.GameObjects.Container;
    const attach = (): void => {
      const b = container.getBounds();
      if (b.width <= 0 || b.height <= 0) return;
      const sx = container.scaleX || 1;
      const sy = container.scaleY || 1;
      // 월드 경계 → 컨테이너 로컬(스케일 제거) 좌표.
      let left = (b.x - container.x) / sx;
      let right = (b.right - container.x) / sx;
      // 이웃과의 중간선으로 좌우를 잘라 영역이 겹치지 않게 한다(로컬 좌표로 환산해서 비교).
      const prev = this.characters[index - 1];
      const next = this.characters[index + 1];
      if (prev) left = Math.max(left, ((prev.nodeX + c.nodeX) / 2 - container.x) / sx);
      if (next) right = Math.min(right, ((c.nodeX + next.nodeX) / 2 - container.x) / sx);
      if (right <= left) return; // 이웃과 완전히 겹치는 비정상 배치 — 탭 선택은 포기(화살표로 선택).
      const rect = new Phaser.Geom.Rectangle(left, (b.y - container.y) / sy, right - left, b.height / sy);
      container.setInteractive(rect, Phaser.Geom.Rectangle.Contains, { useHandCursor: true } as never);
      container.on('pointerup', () => this.selectCharacter(index));
    };
    if (container.getData('spriteClipHandle')) attach();
    else container.once('clipready', attach);
  }

  /** 저작된 버튼 x 에 가장 가까운 캐릭터. */
  private nearestCharacterIndex(x: number): number {
    let best = 0;
    for (let i = 1; i < this.characters.length; i += 1) {
      if (Math.abs(this.characters[i].nodeX - x) < Math.abs(this.characters[best].nodeX - x)) best = i;
    }
    return best;
  }

  /**
   * 좌/우 버튼 = **리그 전환**(사용자 요청). 양 끝에서는 더 가지 않고, 갈 수 없는 방향의 버튼은
   * 흐리게 해서 끝이라는 걸 보여 준다.
   */
  private bindArrow(layout: LayoutIndex, id: string, step: number): void {
    const arrow = layout.tryById<Phaser.GameObjects.Image>(id);
    if (!arrow) return;
    pinToScreen(arrow);
    arrow.setInteractive({ useHandCursor: true });
    arrow.on('pointerup', () => {
      if (this.starting) return;
      if (!stepLeagueTier(step)) return; // 이미 끝 — 아무 일도 일어나지 않는다.
      this.updateLeagueCard();
      this.refreshArrowStates();
      this.refreshLockLabels();
      // 리그를 내려 지금 고른 캐릭터가 잠겼다면, 고를 수 있는 캐릭터로 되돌린다.
      if (!this.isUnlocked(this.characters[this.selectedIndex])) {
        const open = this.characters.findIndex((c) => this.isUnlocked(c));
        if (open >= 0) {
          this.selectedIndex = open;
          this.applySelection(true);
        }
      }
    });
    this.leagueArrows.push({ obj: arrow, step });
  }

  /** 더 갈 수 없는 방향의 버튼을 흐리게(입력도 끔) — 끝에 도달했음을 알린다. */
  private refreshArrowStates(): void {
    for (const a of this.leagueArrows) {
      const usable = canStepLeagueTier(a.step);
      a.obj.setAlpha(usable ? 1 : ARROW_DISABLED_ALPHA);
      if (usable) a.obj.setInteractive({ useHandCursor: true });
      else a.obj.disableInteractive();
    }
  }

  /**
   * 이 캐릭터를 지금 고를 수 있는가 — **현재 선택된 리그**로 판정한다(사용자 요청: "레벨을
   * 적용하지 않고 특정 리그부터 적용가능한" 방식). 좌/우 버튼으로 리그를 올리면 그 자리에서
   * 바로 해금되고, 다시 내리면 잠긴다.
   */
  private isUnlocked(c: LobbyCharacter): boolean {
    return c.unlockTierId === undefined || getLeagueTier().id >= c.unlockTierId;
  }

  private selectCharacter(index: number): void {
    const target = this.characters[index];
    if (this.starting || index === this.selectedIndex || !target) return;
    // 잠긴 캐릭터는 선택 자체가 일어나지 않는다 — 버튼이 갔다가 되돌아오는 일이 없도록
    // applySelection 을 아예 부르지 않는다(사용자 보고: "플레이 버튼이 이동했다가 다시 복귀한다").
    // 잠금 사유는 캐릭터 아래 상시 문구로 이미 떠 있으므로, 여기서는 그 문구만 한 번 튕겨 준다.
    if (!this.isUnlocked(target)) {
      this.pulseLockLabel(index);
      return;
    }
    this.selectedIndex = index;
    this.applySelection(true);
    /**
     * 새로 고른 타자의 **플레이 클립**을 지금 받아 둔다(다른 타자 것은 이미 해제됐다 —
     * 부팅에는 기본 타자만 올린다). 한 번에 한 명만 받아 GPU 메모리를 아낀다.
     *
     * ⚠️ **여기(사용자 탭)에서만 부른다.** 로비가 만들어지는 중(applySelection(false))에 부르면
     *    로비 캐릭터 클립이 아직 로딩 중인 상태에서 같은 씬 로더에 **두 번째 배치**가 겹친다.
     *    벤더 런타임(spriteClipRuntime)이 그 동시 로드에서 실패한 이력이 있고("캐릭터·전광판
     *    스프라이트가 아예 안 뜸"), 실제로 그 증상이 재현됐다(2026-08-04 사용자 보고: 로비
     *    캐릭터 두 마리가 안 뜸). 사용자가 탭하는 시점엔 로비 클립 로드가 이미 끝나 있다.
     *
     * 기본 타자는 부팅 프리로드가 이미 받아 두므로(BOOT_BATTER_PRELOAD_COUNT) 초기에는 필요 없다.
     * await 하지 않는다 — 로비 조작을 막지 않고, 늦어도 런타임 lazy 로드로 폴백된다.
     */
    void preloadSelectedBatterClips(this);
  }

  /**
   * 잠긴 캐릭터 아래에 "OO리그부터 선택 가능" 문구를 **상시** 띄운다(사용자 요청: "여성캐릭터
   * 하단에 특정리그 부터 선택 가능하다는 문구"). 해금되면 사라진다.
   *
   * 위치는 Play Ball 버튼과 같은 높이 + 캐릭터의 x — 캐릭터 발밑은 이미 화면 맨 아래라 그보다
   * 아래에 글자를 놓을 자리가 없다. 버튼과 같은 줄에 서면 "이쪽은 버튼, 저쪽은 잠김"이 한눈에 읽힌다.
   * 버튼과 같은 UI 취급(scrollFactor 0)이라 배경 드리프트를 따라가지 않는다.
   */
  private refreshLockLabels(): void {
    const plate = this.playButtonParts[0]?.obj;
    const y = plate?.y ?? this.scale.height * 0.85;
    this.characters.forEach((c, i) => {
      const locked = !this.isUnlocked(c);
      let label = this.lockLabels[i];
      if (!locked) {
        label?.destroy();
        this.lockLabels[i] = undefined;
        return;
      }
      const tier = LEAGUE_TIERS.find((t) => t.id === c.unlockTierId);
      const msg = `${tier?.label ?? '상위 리그'}부터 선택 가능`;
      if (label) {
        label.setText(msg).setPosition(c.nodeX, y);
        return;
      }
      label = this.add
        .text(c.nodeX, y, msg, {
          fontFamily: FONT.family,
          fontSize: '32px',
          color: '#ffffff',
          backgroundColor: '#0a2540cc',
          padding: { x: 18, y: 10 },
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(90);
      this.lockLabels[i] = label;
    });
  }

  /** 잠긴 캐릭터를 탭했을 때 — 이미 떠 있는 문구를 한 번 크게 튕겨 시선을 끈다. */
  private pulseLockLabel(index: number): void {
    const label = this.lockLabels[index];
    if (!label) return;
    this.tweens.killTweensOf(label);
    label.setScale(1);
    this.tweens.add({ targets: label, scale: LOCK_LABEL_PULSE, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
  }

  /** 선택 상태를 화면에 반영 — 버튼을 선택된 캐릭터 아래로 옮기고, 나머지는 흐리게. */
  private applySelection(animate: boolean): void {
    const selected = this.characters[this.selectedIndex];
    if (!selected) return;
    setBatterPreset(selected.preset); // PlayScene 이 읽는 곳(게임 진입 전에 확정돼 있어야 한다).

    // 버튼(배경판+라벨)은 저작 당시 좌표를 갖고 있으므로 기준 캐릭터와의 x 차이만큼 함께 옮긴다.
    const shiftX = selected.nodeX - this.characters[this.buttonBaseIndex].nodeX;
    for (const p of this.playButtonParts) {
      this.tweens.killTweensOf(p.obj);
      if (animate) this.tweens.add({ targets: p.obj, x: p.baseX + shiftX, duration: 180, ease: 'Cubic.easeOut' });
      else p.obj.x = p.baseX + shiftX;
    }
  }

  /** 버튼 배경판(layer_10)에 입력을 건다 — 라벨(text)은 그 위에 얹힌 장식이라 판정에서 제외. */
  private attachPlayButtonInput(layout: LayoutIndex): void {
    const plate = layout.tryById<Phaser.GameObjects.Image>(PLAY_BUTTON_IDS[0]);
    if (!plate) return;
    const press = (scale: number): void => {
      for (const p of this.playButtonParts) p.obj.setScale(scale);
    };
    plate.setInteractive({ useHandCursor: true });
    plate.on('pointerdown', () => press(0.96));
    plate.on('pointerout', () => press(1));
    plate.on('pointerup', () => {
      press(1);
      if (this.starting) return;
      this.starting = true;
      this.startGame();
    });
  }

  /**
   * 리그 카드(배경+텍스트)를 컨테이너 하나로 묶는다 — 원래 좌표 그대로 컨테이너에 재배치
   * (컨테이너가 (0,0)이라 자식들의 절대 좌표가 그대로 유지된다)하고, scrollFactor(0)으로 배경
   * 카메라 드리프트와 무관하게 화면에 고정한다(사용자 요청: "배경화면과 같이 움직이면 안된다",
   * "UI 처럼 취급").
   *
   * 카드는 **캐릭터가 다 뜬 뒤 1.5초** 지나서 팝인하고, 그 뒤로는 계속 떠 있는다. 홈화면에 올
   * 때마다 같은 순서로 재생된다(사용자 요청).
   */
  private buildLeagueCard(layout: LayoutIndex): void {
    const objs = LEAGUE_CARD_IDS.map((id) => layout.tryById(id)).filter(
      (o): o is Phaser.GameObjects.Image | Phaser.GameObjects.Text => !!o,
    );
    if (!objs.length) return;
    this.leagueEmblem = layout.tryById<Phaser.GameObjects.Image>(LEAGUE_EMBLEM_ID);
    // 엠블럼은 리그마다 세로 길이가 달라(별·월계관) 노드 크기를 그대로 쓰면 찌그러진다 —
    // 저작된 가로 폭만 기억해 두고 이후엔 가로 기준 균일 스케일로 붙인다.
    this.emblemWidth = this.leagueEmblem?.displayWidth ?? 0;
    this.leagueTexts = {
      title: layout.tryById<Phaser.GameObjects.Text>(LEAGUE_TEXT_IDS.title),
      online: layout.tryById<Phaser.GameObjects.Text>(LEAGUE_TEXT_IDS.online),
      entryFee: layout.tryById<Phaser.GameObjects.Text>(LEAGUE_TEXT_IDS.entryFee),
      reward: layout.tryById<Phaser.GameObjects.Text>(LEAGUE_TEXT_IDS.reward),
    };
    // 보유 코인 — 에디터엔 이 노드가 없어 코드로 얹는다. 입장료 텍스트 바로 위(같은 x, 살짝 위)에
    // 두면 "얼마 있고 얼마 필요한지"를 한눈에 비교할 수 있다(사용자 요청: "게임내 재화 설계").
    const entryFeeObj = this.leagueTexts.entryFee;
    if (entryFeeObj) {
      this.coinText = this.add
        .text(entryFeeObj.x, entryFeeObj.y - 34, '', {
          fontFamily: FONT.family,
          fontSize: '22px',
          color: '#ffe14d',
        })
        .setOrigin(entryFeeObj.originX, 1);
      objs.push(this.coinText);
    }
    // 트로피 진행도 — 이 리그의 승급 조건(5개)까지 얼마나 왔는지. 리그 이동이 트로피로 막히므로
    // 이 숫자가 보이지 않으면 "왜 오른쪽 버튼이 안 눌리지?"가 된다.
    // ⚠️ 임시 배치다(사용자: "UI는 나중에 정리하겠습니다") — 에디터에 트로피 노드가 생기면 옮긴다.
    const titleObj = this.leagueTexts.title;
    if (titleObj) {
      this.trophyText = this.add
        .text(titleObj.x, titleObj.y + 44, '', { fontFamily: FONT.family, fontSize: '24px', color: '#ffd147' })
        .setOrigin(titleObj.originX, 0);
      objs.push(this.trophyText);
    }
    const container = this.add.container(0, 0, objs);
    container.setScrollFactor(0);
    container.setDepth(15);
    container.setAlpha(0); // 등장 전엔 숨김 — 캐릭터보다 먼저 튀어나오지 않게.
    this.leagueCard = container;
    this.updateLeagueCard();
    this.scheduleLeagueCardReveal();
  }

  /**
   * 좌상단 세로 메뉴(사용자 요청) — 프로필/저장 아이콘, 그 아래 상점 아이콘.
   * UI 취급(scrollFactor 0)이라 배경 드리프트를 따라가지 않고, 리그 카드(depth 15)보다 위·
   * 팝업(4500)보다 아래에 둔다. 탭하면 각각 프로필/상점 팝업이 열린다.
   */
  private buildCornerMenu(): void {
    const items: Array<{ key: string; label: string; y: number; open: () => void }> = [
      { key: ICON_PROFILE_KEY, label: '프로필', y: 190, open: () => openProfilePopup(this) },
      {
        key: ICON_SHOP_KEY,
        label: '상점',
        y: 366,
        open: () => openShopPopup(this, { onCoins: () => this.updateLeagueCard() }),
      },
    ];
    for (const it of items) {
      if (!this.textures.exists(it.key)) continue; // 아이콘 로드 실패 — 메뉴 하나 없다고 로비를 막지 않는다.
      const btn = this.add.image(96, it.y, it.key).setDisplaySize(118, 118).setScrollFactor(0).setDepth(40);
      // 프로필 아바타는 사각 초상이라 살짝 둥근 흰 테두리 판 위에 얹어 버튼처럼 보이게 한다.
      if (it.key === ICON_PROFILE_KEY) {
        const plate = this.add.graphics().setScrollFactor(0).setDepth(39);
        plate.fillStyle(0xffffff, 0.92);
        plate.fillRoundedRect(96 - 63, it.y - 63, 126, 126, 26);
        plate.lineStyle(5, 0x1e88e5, 1);
        plate.strokeRoundedRect(96 - 63, it.y - 63, 126, 126, 26);
      }
      const label = this.add
        .text(96, it.y + 74, it.label, { fontFamily: FONT.family, fontSize: '24px', color: '#ffffff' })
        .setStroke('#0a2540', 6)
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(40);
      btn.setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => btn.setScale(btn.scaleX * 0.94));
      btn.on('pointerout', () => btn.setDisplaySize(118, 118));
      btn.on('pointerup', () => {
        btn.setDisplaySize(118, 118);
        if (!this.starting) it.open();
      });
      void label;
    }
  }

  /**
   * 캐릭터 클립이 전부 로드된 뒤 1.5초 지나 카드를 띄운다. 클립 로드는 비동기라 "다 떴다"는
   * 시점을 clipready 로 센다 — 이미 캐시된 경우(두 번째 입장)엔 즉시 카운트되므로, 결과적으로
   * 매번 같은 리듬(캐릭터 등장 → 1.5초 → 카드)이 된다.
   */
  private scheduleLeagueCardReveal(): void {
    const containers = this.characters.map((c) => c.obj as unknown as Phaser.GameObjects.Container);
    let started = false;
    const start = (): void => {
      if (started) return;
      started = true;
      this.time.delayedCall(LEAGUE_CARD_DELAY_MS, () => this.revealLeagueCard());
    };
    // ⚠️ 클립 로드가 실패하면 'clipready' 가 영영 안 온다(layoutLoader 가 조용히 삼킨다). 그때
    //    카드까지 같이 안 뜨면 "캐릭터도 없고 팝업도 없는" 화면이 된다(사용자 보고: 캐릭터·팝업·
    //    전광판이 한꺼번에 안 보임 — 무거운 시트가 못 받아진 경우였다). 카드 등장은 캐릭터 로드
    //    성공에 걸지 않는다 — 아무리 늦어도 이 시간 안에는 반드시 뜬다.
    this.time.delayedCall(LEAGUE_CARD_MAX_WAIT_MS, start);

    let pending = containers.length;
    if (!pending) {
      start();
      return;
    }
    const done = (): void => {
      pending -= 1;
      if (pending === 0) start();
    };
    for (const c of containers) {
      if (c.getData('spriteClipHandle')) done();
      else c.once('clipready', done);
    }
  }

  private revealLeagueCard(): void {
    const card = this.leagueCard;
    if (!card) return;
    card.setScale(0.85).setAlpha(0);
    this.tweens.add({ targets: card, alpha: 1, scale: 1, duration: LEAGUE_CARD_IN_MS, ease: 'Back.easeOut' });
  }

  /** 카드의 리그별 값(리그명·접속중·입장료·보상·엠블럼)을 현재 티어로 맞춘다. */
  private updateLeagueCard(): void {
    const tier = getLeagueTier();
    this.leagueTexts?.title?.setText(tier.label);
    this.leagueTexts?.online?.setText(formatLeagueNumber(tier.online));
    this.leagueTexts?.entryFee?.setText(formatLeagueNumber(tier.entryFee));
    this.leagueTexts?.reward?.setText(formatLeagueNumber(tier.reward));
    this.coinText?.setText(`보유 코인 ${formatLeagueNumber(getCoins())}`);
    const p = trophyProgress(tier.id);
    this.trophyText?.setText(`트로피 ${p.earned} / ${p.total}`);
    this.updateLeagueEmblem(tier.id);
  }

  /**
   * 리그 엠블럼(방패) 교체 — 티어 id(1-base)에 대응하는 그림으로 바꾼다.
   * 4·5티어는 별·월계관이 붙어 세로가 더 길다. 노드 크기(가로×세로)를 그대로 쓰면 눌려 보이므로
   * **가로 폭만 저작값에 맞추고 세로는 비율대로** 늘린다 — 중심이 노드 위치라 위아래로 고르게 커진다.
   */
  private updateLeagueEmblem(tierId: number): void {
    const emblem = this.leagueEmblem;
    const key = LEAGUE_EMBLEM_KEYS[tierId - 1];
    if (!emblem || !key || !this.textures.exists(key)) return;
    emblem.setTexture(key);
    if (this.emblemWidth > 0) emblem.setScale(this.emblemWidth / emblem.width);
  }

  /**
   * 게임 진입 — 카드는 이미 떠 있으므로 곧장 넘어간다. 리그 입장료(코인)를 실제로 차감하는
   * 첫 진입점(사용자 요청: "게임내 재화 설계" → "PvP 재도전 티켓" — 별도 티켓 카운터 대신
   * 이미 카드에 있던 입장료 자체가 재도전 게이트다. 코인이 있으면 광고 없이 바로 재대결).
   */
  private startGame(): void {
    const tier = getLeagueTier();
    if (!canAfford(tier.entryFee)) {
      this.starting = false; // 되돌리지 않으면 다음 탭부터 Play Ball 이 영영 반응하지 않는다.
      showToast(`코인이 부족합니다 (필요 ${formatLeagueNumber(tier.entryFee)} / 보유 ${formatLeagueNumber(getCoins())})`);
      return;
    }
    spendCoins(tier.entryFee);
    this.updateLeagueCard(); // 차감된 잔액을 카드에 바로 반영.
    portalConfirmStart(this);
    this.scene.start('play');
  }

  /** 비행선 각각을 서로 다른 진폭/주기/시작지연으로 상하 반복 이동 — 따로 노는 부양감. */
  private floatAirships(layout: LayoutIndex): void {
    for (const cfg of AIRSHIPS) {
      const img = layout.tryById<Phaser.GameObjects.Image>(cfg.id);
      if (!img) continue;
      const baseY = img.y;
      this.tweens.add({
        targets: img,
        y: baseY - cfg.amp,
        duration: cfg.durationMs,
        delay: cfg.delayMs,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private collectConfettiTargets(layout: LayoutIndex): ConfettiTarget[] {
    const targets: ConfettiTarget[] = [];
    for (const id of CONFETTI_IDS) {
      const img = layout.tryById<Phaser.GameObjects.Image>(id);
      if (!img) continue;
      targets.push({ img, node: layout.nodeById(id) });
    }
    return targets;
  }

  /** 축포를 순서대로 하나씩 터뜨리고, 한 바퀴 끝나면 쉬었다가 다시 처음부터(무한 반복). */
  private scheduleConfettiCycle(targets: ConfettiTarget[]): void {
    const runCycle = (): void => {
      targets.forEach((t, i) => {
        this.time.delayedCall(i * FIRE_STAGGER_MS, () => this.popConfetti(t));
      });
      this.time.delayedCall(targets.length * FIRE_STAGGER_MS + FIRE_CYCLE_GAP_MS, runCycle);
    };
    runCycle();
  }

  /**
   * 축포 1개 발사 — 이미지가 원래 위치보다 아래(RISE_START_OFFSET)에서 나타나 위로 솟구친 뒤
   * (RISE_TRAVEL 만큼 더 올라간 자리에서) HOLD_MS 동안 그대로 유지되다가 서서히 투명해져 사라진다.
   * 같은 지점에서 입자도 함께 분출.
   */
  private popConfetti(t: ConfettiTarget): void {
    const { img, node } = t;
    this.tweens.killTweensOf(img);
    const baseX = node.x;
    const baseY = node.y;
    const startY = baseY + RISE_START_OFFSET;
    img.setPosition(baseX, startY);
    img.setAlpha(1);
    this.tweens.add({
      targets: img,
      y: { value: baseY - RISE_TRAVEL, duration: RISE_MS, ease: 'Cubic.easeOut' },
      alpha: { value: 0, duration: FADE_MS, delay: RISE_MS + HOLD_MS, ease: 'Sine.easeInOut' },
    });

    // 발사 방향 — 이미지가 기본적으로 위쪽(270°)을 향한다고 보고, 노드 angle 만큼 같이 회전.
    const angleDeg = node.angle ?? 0;
    this.confetti.setEmitterAngle({ min: 270 + angleDeg - 22, max: 270 + angleDeg + 22 });
    this.confetti.explode(FIRE_PARTICLE_COUNT, baseX, startY);
  }

  /** 관중석 여러 지점에서 색종이를 번갈아 터뜨리고, 한 바퀴 끝나면 쉬었다가 반복(무한). */
  private scheduleStandsConfetti(): void {
    const runCycle = (): void => {
      STANDS_BURST_POINTS.forEach((p, i) => {
        this.time.delayedCall(i * STANDS_FIRE_STAGGER_MS, () => {
          this.standsConfetti.explode(STANDS_PARTICLE_COUNT, p.x, p.y);
        });
      });
      this.time.delayedCall(STANDS_BURST_POINTS.length * STANDS_FIRE_STAGGER_MS + STANDS_CYCLE_GAP_MS, runCycle);
    };
    runCycle();
  }

  /**
   * 배경(야구장) 폭이 캔버스보다 넓어(2411 vs 1080) 카메라가 좌우로 움직일 여지는 있지만,
   * 여긴 그 전체 폭을 다 쓰지 않는다 — 기본(중심) 뷰를 기준으로 ±DRIFT_AMPLITUDE 만큼만
   * 아주 천천히 좌우로 흔들어(중심→좌→중심→우→중심…) 은은한 생동감만 준다.
   */
  private setupCameraDrift(doc: LayoutDoc, w: number, h: number): void {
    const bgNode = doc.nodes.find((n) => n.id === 'layer_1');
    const bgW = bgNode?.w ?? w;
    const bgX = bgNode?.x ?? w / 2;
    const left = Math.floor(bgX - bgW / 2);
    const boundsW = Math.ceil(bgW);
    const cam = this.cameras.main;
    cam.setBounds(left, 0, Math.max(boundsW, w), h);
    const center = 0; // 기본(에디터) 뷰 — 다른 노드 좌표가 이 기준으로 배치돼 있다.
    cam.setScroll(center - DRIFT_AMPLITUDE, 0);
    this.tweens.add({
      targets: cam,
      scrollX: center + DRIFT_AMPLITUDE,
      duration: DRIFT_MS,
      hold: DRIFT_HOLD_MS,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

}
