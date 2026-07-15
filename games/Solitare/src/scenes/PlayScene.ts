/**
 * PlayScene — 솔리테어 하이츠 본편(에디터 SSOT 크롬 + 실제 플레이).
 *
 * 구성:
 *   ① 화면 크롬 = **에디터 저작 main.json 이 SSOT**(배경 layer_1 · 베이커리 storefront layer_2 ·
 *      내부 진열장 layer_3 · 검은 반투명 암막 보드 패널 layer_4). 코드 배경/타워/암막은 이제
 *      main.json 이 크롬을 저작하지 않은 경우의 **폴백**으로만 남는다.
 *   ② 암막 보드 패널(layer_4) 세로 범위 안에서 ±1 순환 솔리테어(팬 그룹) 진행.
 *
 * 규칙 = ±1 + 순환(A↔K). 팬 그룹: 앞면(노출) 탭 제거 → 뒤의 두 장이 열림. 엔진은 src/logic/*(순수).
 * ⚠️ HD(1080×2400) — 코어 720 responsive 헬퍼 미사용. 절대 좌표(순수 FIT 1:1).
 */
import Phaser from 'phaser';
import { loadGameAssets, UI_MAIN_KEY, UI_HOME_KEY, BACK_BG_KEY, CARD_BACK_KEY, floorArtKey, CHAR_SHEETS } from '../assets.js';
import { buildLayout, type LayoutDoc, type LayoutIndex } from '../ui/layoutLoader.js';
import { Pedestrian, pathToWaypoints } from './pedestrians.js';
import { CardView } from './cardView.js';
import { levelDef, editorLevelCount } from '../logic/levels.js';
import { preloadAudio, playBgm, sfx, sfxCardPlace, sfxStar, sfxWinSting, setMuted, isMuted } from '../audio.js';
import { buildTopHeader, type TopHeader } from './topHeader.js';
import { preloadCustomers, registerCustomerFrames, startCustomerVisits, type CustomerSpot } from './customers.js';
import type { CardBoardDoc } from '../logic/editorLevels.js';
import { seededRng } from '../logic/deck.js';
import { dealDynamic } from '../logic/solvable.js';
import type { Grade } from '../logic/difficulty.js';
import { loadSave, writeSave, plus5Cost, wildCost } from '../save.js';
import { SUITS, RANKS, type Card, type Suit, isRed } from '../logic/types.js';
import {
  type GameState,
  wasteTop,
  isExposed,
  isPlayable,
  availableMoves,
  playCard,
  playWild,
  bankWildToStock,
  consumeBonusCard,
  drawStock,
  refillStock,
  remaining,
  isWin,
  isStuck,
} from '../logic/tripeaks.js';
import type { LayoutSlot } from '../logic/layouts.js';

const W = 1080;
const H = 2400;

// 보너스(+N) 카드 값 → 아트 키(에디터 업로드). +5 는 08-4, 나머지는 숫자와 일치.
const BONUS_VALUES: readonly number[] = [1, 2, 3, 5, 10];
const BONUS_ART: Record<number, string> = {
  1: 'up_Solitare_UI_08-1',
  2: 'up_Solitare_UI_08-2',
  3: 'up_Solitare_UI_08-3',
  5: 'up_Solitare_UI_08-4',
  10: 'up_Solitare_UI_08-10',
};
// 보너스 값 발생 가중치 — **숫자가 클수록 낮은 빈도**(+1 흔함 … +10 희귀).
const BONUS_WEIGHT: Record<number, number> = { 1: 40, 2: 26, 3: 18, 5: 11, 10: 5 };

// 에디터 저작 레벨 팩(public/levels/cardLevels.json) 캐시 키.
const EDITOR_PACK_KEY = 'editorLevelPack';

// 부스터 코인 비용. **+5카드·와일드는 게임비 기준 상승 곡선**(save.ts plus5Cost/wildCost, 한 판 사용 횟수에 따라 상승).
const UNDO_COST = 100; // 되돌리기는 고정(추후 재설계 대상).
const ADD5_COUNT = 5; // ＋5 카드 = 소모 카드 5장을 스톡으로 되돌림.

/**
 * 되돌리기 히스토리 1스텝 — GameState + **GameState 밖 씬 래치**를 함께 스냅샷한다.
 *   (예전엔 GameState 만 저장해, undo 후 wildBanked/bonusTriggered/setsCompleted/comboColors 가 되돌지 않아
 *    특수카드 영구 무력화·미션게이지 파밍 버그가 있었다.)
 */
interface HistorySnap {
  readonly state: GameState;
  readonly wildBanked: boolean;
  readonly bonusTriggered: boolean;
  readonly setsCompleted: number;
}

// ── 미션 콤보(에디터 크롬 전용) ────────────────────────────────────────
// 콤보로 카드를 연속 매칭 → 오른쪽 상단 박스(PLAY MISSION)의 5칸이 맞춘 카드 색으로 채워진다.
// 5칸이 다 차면 한 세트 완료 → 왼쪽 게이지가 한 칸 차고 별 하나가 켜진다. 별 3개(3세트)면 미션 완료.
const SET_SIZE = 5; // 박스 한 세트 = 5매칭
const SETS_TARGET = 3; // 별 3개 = 게이지 만충
// 별 개수별 코인 보상(누적 아님, 달성 별 수 기준). 3별 = +2,000(에디터 목업과 일치).
const STAR_COINS: readonly number[] = [0, 500, 1000, 2000];

// 카드 색(무늬) → 표시 색. 박스 칸/기준 카드 색 표기에 사용.
const CARD_RED = '#e8402f';
const CARD_BLACK = '#26344a';
const suitColor = (suit: Suit): string => (isRed(suit) ? CARD_RED : CARD_BLACK);

// 동적으로 제어하는 에디터 노드(정적 크롬에서 제외 → 코드가 직접 그린다).
//   layer_7=게이지 채움 샘플 · layer_13*=박스 칸 샘플 · layer_14~16=보상 팝업 목업.
const DYNAMIC_NODE_IDS: ReadonlySet<string> = new Set([
  'layer_7',
  'layer_13',
  'layer_13_copy',
  'layer_13_copy2',
  'layer_14',
  'layer_15',
  'layer_15_copy',
  'layer_15_copy2',
  'layer_16',
]);

// 층 아트 배치(상단) — 아래 반투명 보드와 붙는다(에디터 크롬 없을 때의 폴백에서만 사용).
const FLOOR_ART_H = 500;
const DARK_TOP = 645; // 반투명 보드 상단(= 건물 하단에 붙음)

// 기준 카드 크기(scale=1). 실제 표시 크기는 레벨 배치에 맞춰 축소(geom.scale)한다.
const BASE_CARD_W = 132;
const BASE_CARD_H = 181;

/**
 * 카드 크기 조정 손잡이 — **이 값 하나만** 바꾼다(다른 상한/함수는 이 게임에서 실행 안 됨).
 *   `1.0` = 확정 기준 크기 = **에디터에서 저작한 카드 크기(card-editor.html CARD_W/H = 120×164) 그대로**(1:1).
 *   키우려면 1.1(=10%↑), 줄이려면 0.9(=10%↓). 에디터·게임·레벨데이터가 모두 이 크기로 통일됨(숨은 배율 없음).
 *   ⚠️ 카드 크기 자체를 바꿀 땐 에디터(CARD_W/H)와 함께 바꿔야 에디터==게임 일치가 유지된다.
 *      이 값(CARD_SIZE)은 게임에서만 미세조정할 때 쓰는 배수이며, 1.05 근처를 넘으면 배치가 넓은 레벨이
 *      보드 fit 에 먼저 걸려 레벨 간 크기가 갈라질 수 있다(오버플로 방지).
 */
const CARD_SIZE = 1.0;

/** 실제 적용 상한 = 저작 카드 크기 그대로(1:1) × 미세조정 배수. 보드 여유 부족 레벨만 fit 으로 축소(오버플로 방지). */
const ABS_CARD_MAX_SCALE = 1.0 * CARD_SIZE;

// 보드 영역 기본값(폴백) — 에디터 암막 패널(layer_4)이 있으면 그 세로 범위로 덮어쓴다(applyEditorChrome).
const BOARD_TOP = 680; // 건물 하단(DARK_TOP 645)에서 패딩 — 보드를 위로 조금 올림
const BOARD_BOTTOM = 1950; // 스톡을 아래로 내린 만큼 보드 세로 여유 확보(카드 확대) — 스톡(y=2140) 위 간격 유지
const BOARD_LEFT = 55; // 좌우 패딩(카드가 커지도록 영역 넓게)
const BOARD_RIGHT = 1025;

// 뽑기(스톡)·기준(웨이스트) 카드 — 화면 하단(테이블 위, 부스터보다 위)으로 더 내린다. 기준은 중앙 쪽,
// 스톡은 왼쪽으로 부채처럼 펼쳐 장수가 보이게(buildStockPile).
const STOCK = { x: 470, y: 2140 };
const WASTE = { x: 640, y: 2140 };
// 스톡 더미에 보유 수량만큼 카드를 **왼쪽으로 펼쳐** 표시(장수 파악용). 과다 방지 상한.
// 간격을 좁혀(15→9) 더 많은 장수(16→26)를 같은 폭 안에 촘촘히 펼친다.
const STOCK_STACK_CAP = 26;
const STOCK_FAN_STEP = 9; // 카드 한 장당 왼쪽 이동(px) — 좁게 겹치되 왼쪽 가장자리가 드러나 셀 수 있게.

export class PlayScene extends Phaser.Scene {
  private level = 1;
  private state!: GameState;
  private cards = new Map<string, CardView>();
  // **다이아**(게임 중 카드에서 수집 — 판당 ~2개). 건물 업그레이드 재화.
  private diamondSlots = new Set<string>(); // 다이아가 끼워진 슬롯.
  private diamondViews = new Map<string, Phaser.GameObjects.Image>(); // 슬롯별 다이아 아이콘.
  private pendingDiamonds = 0; // **보관(미확정) 다이아** — 게임 중 수집분. **승리 시에만** save 에 확정.
  private diamondHold?: { icon: Phaser.GameObjects.Image; text: Phaser.GameObjects.Text }; // 게이지 옆 보관 배지.
  private cardBacking?: Phaser.GameObjects.Graphics; // 카드 바로 뒤 반투명 막(카드 위치에만)
  private wasteView?: CardView;
  private stockContainer?: Phaser.GameObjects.Container;
  private stockCountText?: Phaser.GameObjects.Text;
  private lastStockCount = -1; // 스톡 더미 카드 수 캐시(바뀔 때만 다시 쌓기).
  private comboText?: Phaser.GameObjects.Text;
  private coinText?: Phaser.GameObjects.Text;
  private remainText?: Phaser.GameObjects.Text;
  private busy = false;
  private baseCoins = 0;
  private ended = false;
  // 초기 딜 연출 진행 중 플래그 — 카드가 날아드는 동안 뽑기/탭 입력을 잠근다.
  private dealing = false;
  // 공개 보류 플래그 — 카드를 낸 직후엔 아래 노출 카드를 바로 뒤집지 않고(뒷면 유지),
  //   낸 카드의 토스(튀어오름) 회수가 끝난 뒤 뒤집어 공개한다.
  private suppressReveal = false;
  // 에디터에 저작된 레벨 수(1부터 연속) — 승리 진행/다음 레벨 버튼을 이 범위로 클램프.
  private editorLevels = 1;
  // 부스터: 되돌리기 히스토리(**GameState 밖 래치까지 스냅샷** — undo 가 미션게이지·특수카드 상태를 정확히 되돌리도록) + 와일드 활성 + 버튼.
  private history: HistorySnap[] = [];
  // **비행 중 카드 수**(매칭 토스·스톡 플립) — >0 이면 undo/+5 를 막아 orphan 뷰가 wasteView 를 덮는 레이스를 방지(카드 탭 자체는 계속 허용=동시 플레이).
  private flyingCards = 0;
  private wildActive = false;
  private wildBtn?: Phaser.GameObjects.Text;
  private undoBtn?: Phaser.GameObjects.Text;
  private addBtn?: Phaser.GameObjects.Text;
  // **부스터 사용 횟수(이번 판)** — 사용할수록 비용 상승(plus5Cost/wildCost). 매 판 create 에서 0 리셋.
  private plus5Uses = 0;
  private wildUses = 0;
  // 에디터 부스터 이미지 옆 코인 비용 라벨(+5·와일드).
  private plus5CostLabel?: Phaser.GameObjects.Text;
  private wildCostLabel?: Phaser.GameObjects.Text;
  private readonly rng: () => number = () => Math.random();
  // 크롬 소스 = 에디터 main.json(true) or 코드 폴백(false). true 면 코드 암막(drawBoardMask) 생략.
  private chromeFromEditor = false;
  // 에디터 노드 인덱스(id 조회) — 미션 게이지/박스/부스터 배선에 사용.
  private chrome?: LayoutIndex;
  // 미션 상태: 현재 콤보 런에서 맞춘 카드 색(무늬), 완료 세트 수, 종료 플래그.
  private comboColors: Suit[] = [];
  private setsCompleted = 0;
  private finished = false;
  // 연속 매칭 멜로디(도레미파솔라시…) — 매칭마다 한 음씩 올라가고, 콤보가 끊기면 다시 도(0)부터.
  private melodyStep = 0;
  private audioCtx?: AudioContext;
  // 미션 크롬 오브젝트(에디터 노드 기반) — 게이지 채움/별/박스 칸/기준 색 표기.
  private coinBinding?: Phaser.GameObjects.Text; // 에디터 코인 텍스트(layer_5_2)
  private header?: TopHeader; // 홈과 동일한 공통 상단 헤더(코인 패널).
  private gaugeFill?: Phaser.GameObjects.Graphics;
  private gaugeGeom = { left: 0, width: 0, y: 0, h: 0 };
  private boxSlotsGfx?: Phaser.GameObjects.Graphics;
  private slotGeom: { x: number; y: number; w: number; h: number }[] = [];
  // 배경 보행 캐릭터(에디터 동선 따라 걷기, 반투명막 뒤).
  private pedestrians: Pedestrian[] = [];
  // 와일드: 기준 카드 위에 얹히는 와일드 마커(활성 동안 표시).
  private wildMarker?: Phaser.GameObjects.Image;
  // **보드 와일드 카드** — 딜 때 지정한 슬롯 id. 노출되면 자동으로 스톡 중간에 삽입(뱅킹)된다.
  private wildSlotId?: string;
  private wildBanked = false; // 뱅킹 완료 여부(1회)
  private pendingBankWild = false; // refresh 중 노출 감지 → 루프 후 뱅킹 트리거
  private wildBanking = false; // 뱅킹 비행 진행 중 — 스톡 더미에 와일드 아트를 아직 표시하지 않음(도착 후 표시)
  // **보드 보너스(+N) 카드** — 노출되면 스톡에 N장 추가(뒷면 흡입 연출) 후 사라진다.
  private bonusSlot?: { id: string; count: number };
  private bonusTriggered = false;
  private pendingBonus = false;
  // 에디터 부스터 이미지(코드 텍스트 버튼 대신 사용).
  private wildImg?: Phaser.GameObjects.Image;
  private undoImg?: Phaser.GameObjects.Image;
  private addImg?: Phaser.GameObjects.Image;
  // 보드 영역(에디터 암막 패널이 있으면 그 세로 범위로 덮어쓴다) — computeGeom 이 참조.
  private boardTop = BOARD_TOP;
  private boardBottom = BOARD_BOTTOM;

  constructor() {
    super('play');
  }

  init(data: { level?: number }): void {
    // 명시 레벨이 없으면 저장된 진행 레벨로 이어서 플레이.
    this.level = data?.level ?? loadSave().level;
  }

  preload(): void {
    loadGameAssets(this);
    preloadCustomers(this); // 손님 스프라이트(방문·이모지) — 플레이 상단 점포에도 손님 등장.
    preloadAudio(); // 사운드팩(m4a) — 홈에서 이미 로드됐으면 캐시.
    // 카드 뒷면 정식 아트(매니페스트 타이밍과 무관하게 확실히 선로딩) → cardView 가 이 텍스처로 뒷면을 굽는다.
    if (!this.textures.exists(CARD_BACK_KEY)) {
      this.load.image(CARD_BACK_KEY, 'ui/uploads/up_Solitaire_CARD_back.png');
    }
    // 에디터 저작 레벨 팩(번들·배포용). 없거나 비어도 무해({}) — localStorage(dev 즉시적용)가 우선.
    this.load.json(EDITOR_PACK_KEY, 'levels/cardLevels.json');
    // **결과/메뉴 버튼**(UI_23: 1 다음레벨·2 홈·4 재시도·5 계속·6 확인·7 닫기) — 친절한 이미지 버튼.
    for (const n of ['1', '2', '4', '5', '6', '7']) {
      const k = `up_Solitare_UI_23_${n}`;
      if (!this.textures.exists(k)) this.load.image(k, `ui/uploads/${k}.png`);
    }
    // **다이아 아이콘**(UI_2_2) + **코인 아이콘**(UI_2_3) — 재화 표시/보상.
    if (!this.textures.exists('up_Solitare_UI_2_2')) this.load.image('up_Solitare_UI_2_2', 'ui/uploads/up_Solitare_UI_2_2.png');
    if (!this.textures.exists('up_Solitare_UI_2_3')) this.load.image('up_Solitare_UI_2_3', 'ui/uploads/up_Solitare_UI_2_3.png');
  }

  /**
   * **이미지 버튼**(UI_23 세트) — 텍스트 없이 이미지에 라벨이 박혀 있어 그대로 쓴다. 탭 시 살짝 눌리는 피드백.
   *   반환 이미지를 팝업 컨테이너에 add 한다. 폴백: 텍스처 없으면 텍스트 버튼.
   */
  private uiButton(x: number, y: number, key: string, on: () => void, targetW = 430): Phaser.GameObjects.GameObject {
    if (!this.textures.exists(key)) {
      return this.add
        .text(x, y, '버튼', { fontFamily: '"Jua", sans-serif', fontSize: '44px', color: '#2a1830', backgroundColor: '#ffd166', padding: { x: 40, y: 16 } })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', on);
    }
    const img = this.add.image(x, y, key).setInteractive({ useHandCursor: true });
    const src = img.texture.getSourceImage() as { width: number; height: number };
    img.setDisplaySize(targetW, targetW * (src.height / src.width));
    const bsx = img.scaleX;
    const bsy = img.scaleY;
    img.on('pointerover', () => img.setScale(bsx * 1.05, bsy * 1.05));
    img.on('pointerout', () => img.setScale(bsx, bsy));
    img.on('pointerdown', () => {
      this.tweens.add({ targets: img, scaleX: bsx * 0.92, scaleY: bsy * 0.92, duration: 80, yoyo: true, ease: 'Quad.easeOut', onComplete: on });
    });
    return img;
  }

  create(): void {
    playBgm('play'); // 플레이 BGM 으로 전환(첫 제스처에서 시작·홈 BGM 크로스페이드).
    this.cards.clear();
    this.busy = false;
    this.flyingCards = 0; // 씬 재사용 대비: 비행 카운터 리셋(중단된 애니의 onComplete 미발화 대비).
    this.dealing = false;
    this.ended = false;
    this.history = [];
    this.wildActive = false;
    this.plus5Uses = 0; // 부스터 비용 곡선 리셋(새 판=첫 사용부터).
    this.wildUses = 0;
    // Phaser 는 씬 인스턴스를 재사용 → 이전 세션의 (파괴된) 참조를 비워 재생성되게 한다(막/웨이스트가 사라지는 문제 방지).
    this.cardBacking = undefined;
    this.wasteView = undefined;
    this.wildBtn = undefined;
    this.undoBtn = undefined;
    this.addBtn = undefined;
    this.plus5CostLabel = undefined;
    this.wildCostLabel = undefined;
    this.chromeFromEditor = false;
    // 미션 상태 초기화(씬 재사용 대비).
    this.chrome = undefined;
    this.comboColors = [];
    this.setsCompleted = 0;
    this.finished = false;
    this.melodyStep = 0;
    this.coinBinding = undefined;
    this.header = undefined;
    this.gaugeFill = undefined;
    this.boxSlotsGfx = undefined;
    this.slotGeom = [];
    this.wildMarker = undefined;
    this.wildSlotId = undefined;
    this.wildBanked = false;
    this.pendingBankWild = false;
    this.wildBanking = false;
    this.bonusSlot = undefined;
    this.bonusTriggered = false;
    this.pendingBonus = false;
    this.wildImg = undefined;
    this.undoImg = undefined;
    // 다이아 상태 초기화(씬 재사용 대비).
    this.diamondSlots.clear();
    this.diamondViews.clear();
    this.pendingDiamonds = 0;
    this.diamondHold = undefined;
    this.addImg = undefined;
    this.lastStockCount = -1;
    for (const p of this.pedestrians) p.destroy();
    this.pedestrians = [];
    this.boardTop = BOARD_TOP;
    this.boardBottom = BOARD_BOTTOM;
    const save = loadSave();
    this.baseCoins = save.coins;

    // 에디터 저작 레벨 우선: localStorage(같은 오리진 dev 즉시적용) → 번들 팩(배포). 없으면 절차적 생성.
    //   번들 파일은 에디터 '레벨팩 내보내기' 형식({kind,levels}) 또는 bare 맵({"1":doc}) 둘 다 허용.
    const packRaw = this.cache.json.get(EDITOR_PACK_KEY) as { levels?: Record<string, CardBoardDoc> } | Record<string, CardBoardDoc> | null;
    const pack = ((packRaw && 'levels' in packRaw ? packRaw.levels : packRaw) ?? {}) as Record<string, CardBoardDoc>;
    // 저작된 레벨 수(승리 진행/다음 레벨 버튼 클램프에 사용).
    this.editorLevels = Math.max(1, editorLevelCount(pack));
    const def = levelDef(this.level, pack);

    // **미저작 레벨 방어** — 에디터에 없는 레벨(예: 아직 안 만든 상위 레벨)로 진입하면 홈으로 돌려보낸다.
    if (!def.layout) {
      this.toast('아직 만들어지지 않은 레벨이에요');
      this.time.delayedCall(900, () => this.scene.start('home'));
      return;
    }
    const layout = def.layout;

    // 화면 크롬 = 에디터 저작 main.json 이 SSOT. 저작된 이미지 크롬이 있으면 그것을 렌더하고 보드
    // 영역을 암막 패널(layer_4)에 맞춘다. 없으면(디자인 미완) 코드 배경/타워/암막으로 폴백.
    const mainDoc = (this.cache.json.get(UI_MAIN_KEY) ?? null) as LayoutDoc | null;
    if (this.hasEditorChrome(mainDoc)) {
      this.applyEditorChrome(mainDoc!);
    } else {
      this.drawBackground(def.floor.tint);
      this.drawTower(save.builtFloors);
    }

    this.drawHud();

    // **레벨별 결정적 시드** — 리로드/재플레이해도 같은 딜이 나와 **저장된 난이도(특히 연속매칭)가 유지**된다(예전 Date.now() 시드는 매번 달라져 난이도가 요동쳤음).
    const rng = seededRng(this.level * 7919 + 104729);
    // **동적(적응형) 난이도 딜** — 보드 배치는 결정적(저작 or 생성)이되 스톡은 placeholder 카운트만 두고,
    //   실제 뽑기 랭크는 drawStock 이 초기 등급 + 유저 플레이(막힘/원활)에 맞춰 뽑는 순간 결정한다(러버밴딩).
    //   등급 미설정 레벨은 보통(2)을 기본으로. 뽑기 수는 저작값(또는 등급 산출)에서 30% 감소.
    const grade: Grade = (layout.difficulty ?? 2) as Grade;
    if (layout.initialDeal) {
      // 에디터가 저작·테스트한 보드 배치는 유지(디자이너 의도), 스톡만 동적으로 전환.
      this.state = dealDynamic(layout, rng, grade, {
        board: layout.initialDeal.board,
        waste: layout.initialDeal.waste,
        stockCount: layout.initialDeal.stock.length,
      });
    } else {
      this.state = dealDynamic(layout, rng, grade, { stockCount: layout.stock ?? undefined });
    }

    this.buildBoard();
    this.buildStockAndWaste();
    this.drawBoosters();
    this.placeDiamonds(); // 카드 2장에 다이아 끼우기(수집 시 별 게이지 옆에 보관).
    this.designateWild(); // 보드 카드 하나를 와일드로 지정(노출 시 자동으로 스톡에 삽입).
    this.refresh();
    // 최초 딜 연출 — 폴드 먼저 차르륵, 오픈 카드는 좌우에서 날아와 안착(가속 리듬).
    this.dealInAnimation();
  }

  /**
   * **다이아 배치** — 보드 카드 중 2장에 다이아를 끼운다(초기 노출 팁은 피해 '중간에 낀' 느낌).
   *   위치: 카드 **오른쪽**에 자리가 있으면 옆, 없으면 왼쪽, 그것도 없으면 **위/아래**.
   */
  private placeDiamonds(): void {
    if (!this.textures.exists('up_Solitare_UI_2_2')) return;
    const exposedNow = new Set(this.state.layout.slots.filter((s) => isExposed(this.state, s.id)).map((s) => s.id));
    // 초기 비노출(가려진) 슬롯 우선 → 플레이 중반에 드러나 수집되게.
    const candidates = [...this.cards.keys()].filter((id) => !exposedNow.has(id));
    const pool = candidates.length >= 2 ? candidates : [...this.cards.keys()];
    // **다이아 2개** 배치(요청). 결정적 셔플(레벨 시드) 후 앞에서 뽑음.
    const count = Math.min(pool.length, 2);
    const rng = seededRng(this.level * 131 + 57);
    const picked = pool
      .map((id) => ({ id, r: rng() }))
      .sort((a, b) => a.r - b.r)
      .slice(0, count)
      .map((o) => o.id);
    picked.forEach((id, i) => {
      const view = this.cards.get(id);
      if (!view) return;
      this.diamondSlots.add(id);
      // **카드 뒤**(depth − 0.3)에 배치 → 카드가 사라지면(플레이) 드러나 획득. 위/아래로 살짝 삐져나오게.
      const gem = this.add.image(0, 0, 'up_Solitare_UI_2_2').setDepth((view.depth ?? 100) - 0.3);
      const src = gem.texture.getSourceImage() as { width: number; height: number };
      const gs = this.geom.cardW * 0.62; // 조금 더 크게.
      gem.setDisplaySize(gs, gs * (src.height / src.width));
      const ch = this.geom.cardH;
      const top = i % 2 === 0; // 번갈아 위/아래로 삐져나옴.
      gem.setPosition(view.x, view.y + (top ? -ch * 0.6 : ch * 0.6)); // 카드 위/아래로 **더 많이 삐져나옴**(중심이 가장자리 바깥).
      gem.setAngle(top ? -13 : 13); // 살짝 기울임.
      gem.setAlpha(0); // 딜 연출 후 페이드인(카드 안착 뒤 드러나게).
      this.tweens.add({ targets: gem, alpha: 1, delay: 900, duration: 300 });
      this.diamondViews.set(id, gem);
    });
  }

  /**
   * **보드 특수 카드 지정** — 딜 시 보드 카드에서 와일드 1장 + 보너스(+N) 1장을 지정한다.
   *   (초기 비노출·다이아 아닌 슬롯 중 결정적 선택, 서로 다른 슬롯). 플레이 진행으로 노출되면
   *   refresh 가 감지해 와일드=스톡 뱅킹, 보너스=스톡 N장 추가 연출을 자동 트리거한다.
   */
  private designateWild(): void {
    if (!this.textures.exists('up_Solitare_UI_08')) return;
    const exposedNow = new Set(
      this.state.layout.slots.filter((s) => isExposed(this.state, s.id)).map((s) => s.id),
    );
    const covered = [...this.cards.keys()].filter((id) => !exposedNow.has(id) && !this.diamondSlots.has(id));
    const pool = (covered.length ? covered : [...this.cards.keys()].filter((id) => !exposedNow.has(id))).slice();
    if (!pool.length) return;
    const rng = seededRng(this.level * 733 + 991);
    const shuffled = pool.map((id) => ({ id, r: rng() })).sort((a, b) => a.r - b.r).map((o) => o.id);
    // 첫 슬롯 = 와일드.
    this.wildSlotId = shuffled[0];
    this.wildBanked = false;
    // 둘째 슬롯(있으면) = 보너스 +N. 값은 레벨 시드로 결정적 선택.
    const values = BONUS_VALUES.filter((v) => this.textures.exists(BONUS_ART[v]));
    if (shuffled.length >= 2 && values.length) {
      // **가중 추첨** — 숫자가 클수록 낮은 빈도(BONUS_WEIGHT).
      const total = values.reduce((s, v) => s + (BONUS_WEIGHT[v] ?? 1), 0);
      let r = rng() * total;
      let count = values[0];
      for (const v of values) {
        r -= BONUS_WEIGHT[v] ?? 1;
        if (r <= 0) {
          count = v;
          break;
        }
      }
      this.bonusSlot = { id: shuffled[1], count };
      this.bonusTriggered = false;
    }
  }

  /**
   * **보너스 +N 연출** — 보드 +N 카드가 노출되면: ①확대·부양 → ②N장 뒷면이 순차적으로 스톡으로 빨려들어감
   *   → ③확대된 +N 카드 소멸. 상태는 즉시 갱신(스톡 N 증가 + 슬롯 클리어).
   */
  private triggerBonus(): void {
    const sp = this.bonusSlot;
    if (!sp || this.bonusTriggered) return;
    this.bonusTriggered = true;
    const { id: slot, count } = sp;
    const view = this.cards.get(slot);
    this.cards.delete(slot);
    this.state = consumeBonusCard(this.state, slot, count); // 스톡 N 추가 + 슬롯 클리어
    sfx('card_deal');
    this.toast(`🎁 +${count} 카드! 뽑기 더미가 늘어났어요`);
    if (!view) {
      this.refresh();
      return;
    }
    view.disableInteractive();
    if (view.input) view.input.enabled = false;
    view.showArt(BONUS_ART[count]);
    view.setDepth(1300);
    const bsx = view.scaleX;
    const bsy = view.scaleY;
    // ① 확대·부양(잠시 보드에 보이게).
    this.tweens.add({
      targets: view,
      scaleX: bsx * 1.35,
      scaleY: bsy * 1.35,
      y: view.y - 40,
      duration: 300,
      ease: 'Back.easeOut',
      onComplete: () => {
        // ② N장 뒷면이 순차적으로 스톡으로 흡입.
        let arrived = 0;
        const emitEnd = (): void => {
          if (++arrived < count) return;
          // ③ +N 카드 소멸(팝 + 페이드).
          this.tweens.add({
            targets: view,
            scaleX: bsx * 1.55,
            scaleY: bsy * 1.55,
            alpha: 0,
            duration: 240,
            ease: 'Quad.easeIn',
            onComplete: () => {
              view.destroy();
              this.refresh();
            },
          });
        };
        // 뒷면 카드 크기: **확대된 +N 카드 크기(1.35)에서 → 뽑기 카드 크기(1.0)까지만 미소 축소**.
        const START = 1.35;
        const END = 1.0;
        // **뽑기 더미 중간으로 회수** — 부채(왼쪽 펼침)의 중앙 지점을 타깃(위/top 이 아님).
        const target = this.stockMidPoint();
        for (let i = 0; i < count; i++) {
          const back = new CardView(this, view.x, view.y, this.geom.cardW, this.geom.cardH, false);
          back.showBack();
          back.setDepth(1290 + i);
          back.setScale(bsx * START, bsy * START);
          const fx = view.x;
          const fy = view.y;
          const ctrlX = (fx + target.x) / 2;
          const ctrlY = Math.min(fy, target.y) - 150;
          this.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 460, // 너무 빠르지 않은 회수 속도
            delay: i * 210, // 순차 '타라락'(3장이면 차례로)
            ease: 'Sine.easeInOut',
            onUpdate: (tw) => {
              const t = tw.getValue() ?? 0;
              const u = 1 - t;
              back.x = u * u * fx + 2 * u * t * ctrlX + t * t * target.x;
              back.y = u * u * fy + 2 * u * t * ctrlY + t * t * target.y;
              const s = Phaser.Math.Linear(START, END, t); // 미소 축소
              back.setScale(bsx * s, bsy * s);
              back.setAngle(60 * t); // 은은한 회전
            },
            onComplete: () => {
              back.destroy();
              emitEnd();
            },
          });
        }
      },
    });
  }

  /**
   * **와일드 뱅킹 연출** — 보드 와일드가 노출되면 보드에서 제거(cleared)하고 스톡 중간에 와일드 카드를 삽입한다.
   *   시각적으로는 와일드 앞면을 드러낸 뒤 **팝 → 스톡 더미로 회전·축소하며 포물선 비행**한다(1회).
   */
  private bankWild(): void {
    const slot = this.wildSlotId;
    if (!slot || this.wildBanked) return;
    this.wildBanked = true;
    this.wildBanking = true; // 비행 도착 전까지 더미에 와일드 아트를 표시하지 않음
    const view = this.cards.get(slot);
    this.cards.delete(slot);
    this.state = bankWildToStock(this.state, slot, this.rng); // 스톡 중간(임의 순서) 삽입 + 슬롯 클리어
    sfx('card_deal');
    this.toast('🃏 와일드 카드 발견! 뽑기 더미 속으로 들어갔어요');
    if (!view) {
      this.wildBanking = false;
      this.refresh();
      return;
    }
    view.disableInteractive();
    if (view.input) view.input.enabled = false;
    view.showWild();
    view.setDepth(1300);
    const bsx = view.scaleX;
    const bsy = view.scaleY;
    // ① 잠시 보드에 와일드로 보인 뒤 → 팝(확대, 살짝 뜸).
    this.tweens.add({
      targets: view,
      scaleX: bsx * 1.22,
      scaleY: bsy * 1.22,
      y: view.y - 26,
      delay: 320,
      duration: 200,
      ease: 'Back.easeOut',
      onComplete: () => {
        // ② 스톡 더미로 포물선 비행 → 더미 속으로. **최종 크기는 뽑기 카드 크기(×1.0)로 유지**(미소 축소만).
        const fx = view.x;
        const fy = view.y;
        const ctrlX = (fx + STOCK.x) / 2;
        const ctrlY = Math.min(fy, STOCK.y) - 300;
        // 잔상(트레일) 미사용 — 회수 시 카드 흰 외곽이 경로에 반복 표시되지 않게.
        this.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 560,
          ease: 'Sine.easeIn',
          onUpdate: (tw) => {
            const t = tw.getValue() ?? 0;
            const u = 1 - t;
            view.x = u * u * fx + 2 * u * t * ctrlX + t * t * STOCK.x;
            view.y = u * u * fy + 2 * u * t * ctrlY + t * t * STOCK.y;
            view.setAngle(720 * t);
            view.setScale(Phaser.Math.Linear(bsx * 1.22, bsx, t), Phaser.Math.Linear(bsy * 1.22, bsy, t));
          },
          onComplete: () => {
            view.destroy();
            this.wildBanking = false; // 도착 후에야 더미에 와일드 아트 표시
            this.buildStockPile(); // 수량 불변이라 refresh 만으론 재구성 안 됨 → 직접 재빌드(와일드 아트 노출)
            this.refresh(); // 하이라이트·라벨 갱신
          },
        });
      },
    });
  }

  /**
   * **다이아 회수 애니메이션**(요구) — 다이아가 **크게 떴다가** 상단 보유 표시 공간으로 **위로 회수**된다.
   */
  private collectDiamond(gem: Phaser.GameObjects.Image): void {
    sfx('coin_burst', { volume: 0.3 }); // 수집음(대용).
    const s0 = gem.scaleX;
    gem.setDepth(1500).setAlpha(1);
    // ① 크게 팝업(위로 살짝).
    this.tweens.add({
      targets: gem,
      scaleX: s0 * 2.6,
      scaleY: s0 * 2.6,
      y: gem.y - 70,
      duration: 280,
      ease: 'Back.easeOut',
      onComplete: () => {
        // ② **별 게이지(선수집 장소)** 로 회수(위로, 작아지며). — 헤더가 아니라 게이지 옆에 보관된다.
        const t = this.diamondHoldTarget();
        this.tweens.add({
          targets: gem,
          x: t.x,
          y: t.y,
          scaleX: s0 * 0.4,
          scaleY: s0 * 0.4,
          duration: 480,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            gem.destroy();
            this.holdDiamond(1);
          },
        });
      },
    });
  }

  /** 다이아 **선수집 위치** — 별 게이지 옆(요구). 게이지 미설정 시 좌상단 폴백. */
  private diamondHoldTarget(): { x: number; y: number } {
    if (this.gaugeGeom.width > 0) return { x: this.gaugeGeom.left + this.gaugeGeom.width + 30, y: this.gaugeGeom.y + 4 };
    return { x: 250, y: 360 };
  }

  /**
   * **다이아 보관**(미확정) — 수집분을 pendingDiamonds 에 쌓고, **별 게이지 옆 보관 배지**에 개수 표시.
   *   **승리 시에만** finishMission 에서 save 에 확정된다(패배/이탈 시 보관분은 사라짐). 헤더는 건드리지 않는다.
   */
  private holdDiamond(n: number): void {
    this.pendingDiamonds += n;
    const t = this.diamondHoldTarget();
    if (!this.diamondHold) {
      const icon = this.add.image(t.x, t.y, 'up_Solitare_UI_2_2').setDepth(75);
      if (this.textures.exists('up_Solitare_UI_2_2')) {
        const src = icon.texture.getSourceImage() as { width: number; height: number };
        icon.setDisplaySize(46, 46 * (src.height / src.width));
      }
      const text = this.add
        .text(t.x + 26, t.y, '', { fontFamily: '"Jua", sans-serif', fontSize: '34px', color: '#ffffff', stroke: '#5a1a6a', strokeThickness: 6 })
        .setOrigin(0, 0.5)
        .setDepth(75);
      this.diamondHold = { icon, text };
    }
    this.diamondHold.text.setText(`${this.pendingDiamonds}`);
    this.tweens.add({ targets: [this.diamondHold.icon, this.diamondHold.text], scaleX: '*=1.3', scaleY: '*=1.3', duration: 120, yoyo: true, ease: 'Quad.easeOut' });
  }

  // ── 에디터 SSOT 크롬 ────────────────────────────────────────────────
  /** main.json 이 화면 크롬(배경/storefront 등 이미지 노드)을 저작했는지 — 텍스처 로드까지 확인. */
  private hasEditorChrome(doc: LayoutDoc | null): boolean {
    return !!doc?.nodes?.some((n) => n.type === 'image' && this.textures.exists(n.key ?? ''));
  }

  /**
   * 에디터 크롬 렌더 + 보드 영역을 암막 패널에 맞춤.
   *   layer_4 처럼 화면 대부분을 덮는 rect(암막 보드 패널)을 찾아 그 세로 범위를 보드 상단으로 채택 →
   *   코드 암막(drawBoardMask)은 생략(중복 방지). 하단은 스톡(STOCK.y) 위 여백을 유지.
   */
  private applyEditorChrome(doc: LayoutDoc): void {
    // 동적 노드(게이지 채움·박스 칸·보상 팝업 목업)는 코드가 직접 제어하므로 정적 렌더에서 제외.
    const staticDoc: LayoutDoc = { ...doc, nodes: doc.nodes.filter((n) => !DYNAMIC_NODE_IDS.has(n.id)) };
    this.chrome = buildLayout(this, staticDoc);
    this.chromeFromEditor = true;
    const panel = doc.nodes
      .filter((n) => n.type === 'rect' && (n.h ?? 0) >= 800)
      .sort((a, b) => (b.h ?? 0) - (a.h ?? 0))[0];
    if (panel?.h) {
      const panelTop = panel.y - panel.h / 2;
      this.boardTop = Math.round(panelTop + 48); // 패널 상단(=storefront 하단) 안쪽 패딩
      this.boardBottom = Math.min(BOARD_BOTTOM, STOCK.y - 60); // 스톡과 분리 간격
    }
    this.setupMissionChrome();
    this.setupEditorBoosters();
    this.spawnPedestrians(doc);
    this.setupStorefrontLife(); // **상단 점포에 점원 애니 + 손님 방문(이모지)** — 홈처럼 살아있게.
    // **홈과 동일한 상단 헤더**(코인 패널 UI_14_v2) 를 얹는다 — 기존 작은 코인 패널(layer_4_2·layer_5_2)은 숨김.
    this.chrome?.tryById('layer_4_2')?.setVisible(false);
    this.chrome?.tryById('layer_5_2')?.setVisible(false);
    this.coinBinding = undefined; // 헤더가 코인 표시를 대신한다.
    // ⚠️ 이 시점엔 아직 딜(this.state) 전이라 baseCoins 만 사용(점수 반영은 refresh 가 갱신).
    this.header = buildTopHeader(this, this.baseCoins, loadSave().diamonds ?? 0, this.level, () => this.openPlayMenu());
  }

  /** 플레이 상단 헤더의 메뉴(☰) — 사운드 토글 + 홈으로. */
  private openPlayMenu(): void {
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
    const sndLabel = (): string => `${isMuted() ? '🔇' : '🔊'} 사운드: ${isMuted() ? '꺼짐' : '켜짐'}`;
    const snd = mk(880, sndLabel(), '#4a3a5a', () => {
      setMuted(!isMuted());
      snd.setText(sndLabel());
      if (!isMuted()) sfx('button');
    });
    // **친절한 이미지 버튼**(UI_23) — 홈(주황)·계속(핑크). 사운드 토글만 텍스트(온/오프 상태 표시).
    layer.add(
      this.uiButton(W / 2, 1090, 'up_Solitare_UI_23_2', () => {
        sfx('button');
        this.scene.start('home');
      }, 440),
    );
    layer.add(
      this.uiButton(W / 2, 1250, 'up_Solitare_UI_23_5', () => {
        sfx('level_close');
        layer.destroy();
      }, 440),
    );
  }

  /**
   * 배경 보행 캐릭터 — 에디터 **동선(path 노드)** 을 따라 3명(셰프·소녀·청년)이 걷는다.
   *   반투명막(layer_4) 바로 뒤 깊이에 두어 은은히 비친다. 동선이 없으면 하단 플로어 왕복(폴백).
   */
  private spawnPedestrians(doc: LayoutDoc): void {
    const pathNode = doc.nodes.find((n) => n.type === 'path' && (n.points?.length ?? 0) >= 2);
    const waypoints = pathNode
      ? pathToWaypoints(pathNode)
      : [
          { x: 200, y: 1700 },
          { x: 880, y: 1700 },
        ]; // 폴백: 하단 플로어 가로 왕복
    // **반투명막 바로 뒤**(막 depth − 1) — 암막 뒤에서 은은히 비치는 배경 보행.
    //   path 노드 자체의 depth(에디터 선 표시용, 막 앞일 수 있음)는 무시하고 항상 막 뒤에 둔다.
    const maskDepth = doc.nodes
      .filter((n) => n.type === 'rect' && (n.h ?? 0) >= 800)
      .reduce((d, n) => Math.max(d, n.depth ?? 0), 5);
    const depth = maskDepth - 1;
    // **시계방향으로만 순환**(교차 금지) — 경로를 닫힌 루프로 강제(끝점→시작점 연결, 하단 오프스크린에서 닫힘).
    //   전원 같은 방향(forward)으로 돌아 서로 마주쳐 교차하지 않는다. 웨이포인트 1→8 순서 = 시계방향.
    const closed = true;
    const sheets = CHAR_SHEETS.filter((s) => this.textures.exists(s.key));
    // **동일 기본속도** → 서로 따라잡지 않아 루프 둘레 간격이 유지된다(개별 걸음은 gait 로 불규칙).
    const speeds = sheets.map(() => 112);
    // 시작 위치를 루프 둘레에 **고르게(1/N)** 분산 → 충분한 간격.
    const starts = sheets.map((_, i) => i / Math.max(1, sheets.length));
    sheets.forEach((s, i) => {
      this.pedestrians.push(
        new Pedestrian(this, s.key, waypoints, {
          scale: 0.72, // 이전 0.55 대비 +30%
          speed: speeds[i % speeds.length],
          depth,
          closed,
          startFrac: starts[i % starts.length],
          bobAmp: 11,
          seed: i * 2.1 + 0.7, // 걸음 불규칙 위상 시드
          flip: s.flip, // 미러 시트(char_girl) 좌우 반전
        }),
      );
    });
  }

  /** Phaser 씬 루프 — 보행 캐릭터를 매 프레임 전진(맥동·교차 회피 포함)시킨다. */
  update(_time: number, delta: number): void {
    for (const p of this.pedestrians) p.update(delta, this.pedestrians);
  }

  // ── 미션 크롬(게이지·별·박스) 배선 ──────────────────────────────────
  /**
   * 에디터가 저작한 미션 게이지(layer_6 트랙 + layer_8* 별)와 오른쪽 상단 박스(layer_9)를 런타임 상태에
   * 연결한다. 게이지 채움 막대·박스 5칸 마커·기준 카드 색 표기는 코드가 직접 그린다(동적).
   */
  private setupMissionChrome(): void {
    const idx = this.chrome;
    if (!idx) return;
    // 코인 텍스트(에디터 layer_5_2)에 실시간 코인 바인딩 + **오른쪽 정렬**(코인 패널 우측 안쪽에 맞춤).
    this.coinBinding = idx.tryById<Phaser.GameObjects.Text>('layer_5_2');
    if (this.coinBinding) {
      const panel = idx.nodeById('layer_4_2');
      const rightX = panel ? panel.x + (panel.w ?? 0) / 2 - 20 : 288;
      this.coinBinding.setOrigin(1, 0.5).setX(rightX);
    }

    // 게이지 트랙(layer_6) 기하 → 채움 막대 영역 산출.
    const track = idx.nodeById('layer_6');
    if (track?.w) {
      this.gaugeGeom = { left: track.x - track.w / 2 + 14, width: track.w - 28, y: track.y, h: 30 };
      this.gaugeFill = this.add.graphics().setDepth((track.depth ?? 8) + 0.5);
    }
    // 별 3개(layer_8*)는 buildLayout 이 이미 렌더한다 — **항상 골드로 표시**, 코드가 건드리지 않는다(진행은 게이지 채움만).

    // 오른쪽 상단 박스(layer_9) 5칸 기하 산출 — 디자이너 샘플 칸(layer_13)의 위치/간격 계승.
    const box = idx.nodeById('layer_9');
    if (box?.w) {
      const left = box.x - box.w / 2;
      const x0 = left + box.w * 0.099; // 첫 칸 중심(샘플 layer_13 x=663 기준)
      const step = box.w * 0.129; // 칸 간격(56px)
      const y = box.y + 6;
      this.slotGeom = Array.from({ length: SET_SIZE }, (_, i) => ({ x: x0 + step * i, y, w: 48, h: 53 }));
      this.boxSlotsGfx = this.add.graphics().setDepth((box.depth ?? 13) + 0.5);
    }
    this.updateGauge();
    this.updateMissionBox();
  }

  /** 에디터 부스터 이미지(+5·되돌리기·와일드)를 탭 가능하게 배선. 코드 텍스트 버튼 대신 사용. */
  private setupEditorBoosters(): void {
    const idx = this.chrome;
    if (!idx) return;
    const wire = (id: string, on: () => void): Phaser.GameObjects.Image | undefined => {
      const img = idx.tryById<Phaser.GameObjects.Image>(id);
      img?.setInteractive({ useHandCursor: true }).on('pointerdown', on);
      return img;
    };
    this.addImg = wire('layer_11', () => this.addCards()); // +5 카드
    this.undoImg = wire('layer_10_copy', () => this.undo()); // 되돌리기
    this.wildImg = wire('layer_10', () => this.useWild()); // 와일드
    // **부스터 코인 비용 라벨**(+5·와일드) — 각 이미지 하단에 얹는다(비용은 사용 횟수에 따라 상승, updateBoosters 가 갱신).
    this.plus5CostLabel = this.makeBoosterCostLabel(this.addImg);
    this.wildCostLabel = this.makeBoosterCostLabel(this.wildImg);
  }

  /** 부스터 이미지 하단에 코인 비용 라벨 생성(이미지 없으면 undefined). */
  private makeBoosterCostLabel(img?: Phaser.GameObjects.Image): Phaser.GameObjects.Text | undefined {
    if (!img) return undefined;
    const y = img.y + img.displayHeight / 2 - 6; // 이미지 하단 안쪽.
    return this.add
      .text(img.x, y, '', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '26px',
        color: '#ffe9a0',
        stroke: '#4a2a10',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 0)
      .setDepth((img.depth ?? 90) + 2);
  }

  // ── 배경/층/보드(폴백 — 에디터 크롬 미저작 시) ─────────────────────────
  private drawBackground(tint: number): void {
    if (this.textures.exists(BACK_BG_KEY)) {
      const img = this.add.image(W / 2, H / 2, BACK_BG_KEY).setDepth(-100);
      const src = img.texture.getSourceImage() as { width: number; height: number };
      const scale = Math.max(W / src.width, H / src.height);
      img.setScale(scale);
      return;
    }
    // 폴백 그라데이션.
    const g = this.add.graphics().setDepth(-100);
    const top = Phaser.Display.Color.IntegerToColor(tint);
    const bot = Phaser.Display.Color.IntegerToColor(0x2a1830);
    for (let i = 0; i < 48; i++) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(top, bot, 100, (i / 47) * 100);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(0, (H / 48) * i, W, H / 48 + 1);
    }
  }

  /**
   * 현재 층 스토어front 를 화면 상단에 배치(하단이 반투명 보드에 붙음, depth 30) + **홈처럼 살아있게**:
   *   **점원(Chr) 애니메이션 + 손님 방문(이모지)**. 점원이 아트에 박힌 up_Solitaire_BG 대신
   *   **홈과 동일한 순수 아트(up_Slitare_BG) + 별도 Chr 점원**을 써서 점원이 실제로 움직이게 한다.
   */
  private drawFloorArt(): void {
    const cy = DARK_TOP - FLOOR_ART_H / 2 + 12; // 12px 정도 패널에 겹쳐 앉음
    const idx = ((this.level - 1) % 5) + 1; // 층 테마(아트 5종 순환) 1..5
    const bareKey = [`up_Slitare_BG_0${idx}_v3`, `up_Slitare_BG_0${idx}_v2`, `up_Slitare_BG_0${idx}`].find((k) =>
      this.textures.exists(k),
    );
    if (!bareKey) {
      // 폴백: 예전 baked 아트(up_Solitaire_BG) 또는 색 사각.
      const key = floorArtKey(this.level);
      if (this.textures.exists(key)) {
        const src = this.textures.get(key).getSourceImage() as { width: number; height: number };
        this.add.image(W / 2, cy, key).setScale(FLOOR_ART_H / src.height).setDepth(30);
      } else {
        const def = levelDef(this.level);
        this.add.rectangle(W / 2, cy, 900, FLOOR_ART_H, def.floor.tint, 0.9).setDepth(30);
      }
      return;
    }
    const src = this.textures.get(bareKey).getSourceImage() as { width: number; height: number };
    const scale = FLOOR_ART_H / src.height;
    const artW = src.width * scale;
    const cx = W / 2;
    this.add.image(cx, cy, bareKey).setScale(scale).setDepth(30); // 순수 점포 아트.

    // ── 점원(Chr) — 카운터 좌측에 세우고 **idle 애니**(홈과 동일: 발밑 고정 갸웃+숨쉬기). ──
    const chrKey = `up_Solirare_Chr_0${idx}`;
    let clerkBottom = cy + FLOOR_ART_H * 0.42;
    let clerkH = FLOOR_ART_H * 0.42;
    if (this.textures.exists(chrKey)) {
      const ch = FLOOR_ART_H * 0.44;
      const chr = this.add.image(cx - artW * 0.2, cy + FLOOR_ART_H * 0.12, chrKey).setDepth(31);
      chr.setDisplaySize(chr.width * (ch / chr.height), ch);
      clerkBottom = chr.y + chr.displayHeight / 2; // 발밑(origin 0.5 기준) — animateClerk 이 origin 을 바꾸기 전에 산출.
      clerkH = chr.displayHeight;
      this.animateClerk(chr);
    }

    // ── 손님 방문(이모지) — 카운터 앞에서 등장·주문·퇴장. 점원 반대편(우측)에서 걸어 들어온다. ──
    registerCustomerFrames(this);
    const spot: CustomerSpot = {
      entryX: cx + artW * 0.3,
      centerX: cx + artW * 0.05,
      groundY: clerkBottom,
      height: clerkH * 0.9,
      depth: 32, // 점포 아트(30)·점원(31) 앞.
      floor: this.level,
    };
    startCustomerVisits(this, [spot]);
  }

  /**
   * 에디터 크롬(main.json) 상단 점포를 **홈처럼 살아있게** — 박힌 셰프 아트(up_Slitare_BG_01_v2)를 **순수 아트(BG_02_v2)로 교체**하고
   *   **별도 애니 점원(Chr_02) + 손님 방문(이모지)**을 얹는다. (점원이 실제로 움직이고 손님이 드나든다.)
   */
  private setupStorefrontLife(): void {
    // main.json 저작 storefront(layer_2, 박힌 셰프 포함)는 숨기고 → **홈과 동일한 층 아트+점원+유리**를 **홈 사이즈 그대로** 상단에 배치.
    this.chrome?.tryById('layer_2')?.setVisible(false);
    // **지붕(layer_5)을 조금 위로** — 상단을 너무 덮지 않게(사용자 요청).
    const roof = this.chrome?.tryById<Phaser.GameObjects.Image>('layer_5');
    if (roof) roof.y -= 55;
    // 홈 골든크러스트(floor2) 노드값(home.json) — **동일 절대 사이즈/오프셋**.
    const ART_W = 859;
    const ART_H = 518;
    const CLERK_W = 142;
    const CLERK_H = 238;
    const CLERK_DX = -182; // 점원 = 중심서 좌측(홈 floor2 Chr_02 x368, 중심 550).
    const CLERK_DY = 97; // 층 중심 아래.
    const GLASS_W = 690;
    const GLASS_DY = 175;
    const cx = W / 2;
    // **조금 아래로 내리고 플레이보드 뒤로**: 층을 더 내려 하단이 보드 인테리어(BG_01-1, depth 3)에 파묻히게 하고,
    //   점포 일체 depth 를 인테리어보다 **뒤(낮게)** 둔다 → 보드가 앞, 점포/점원/손님이 뒤.
    const cyFloor = DARK_TOP - ART_H / 2 + 80; // 45 → 80(점포 전체를 조금 더 아래로, 사용자 요청).
    const D_ART = 2;
    const D_CLERK = 2.3;
    const D_CUST = 2.5;
    const D_GLASS = 2.7; // 모두 인테리어(3)보다 뒤 → 보드에 하단이 가림.
    // 순수 층 아트(홈 사이즈).
    if (this.textures.exists('up_Slitare_BG_02_v2')) {
      this.add.image(cx, cyFloor, 'up_Slitare_BG_02_v2').setDisplaySize(ART_W, ART_H).setDepth(D_ART);
    }
    // 점원(베이커) — 홈 사이즈·오프셋 + idle 애니.
    let clerkBottom = cyFloor + CLERK_DY + CLERK_H / 2;
    if (this.textures.exists('up_Solirare_Chr_02')) {
      const chr = this.add.image(cx + CLERK_DX, cyFloor + CLERK_DY, 'up_Solirare_Chr_02').setDisplaySize(CLERK_W, CLERK_H).setDepth(D_CLERK);
      clerkBottom = chr.y + chr.displayHeight / 2;
      this.animateClerk(chr);
    }
    // 손님 방문(이모지) — 점원 반대편(우측)에서 등장. 크기·바닥선도 홈과 동일.
    registerCustomerFrames(this);
    const spot: CustomerSpot = {
      entryX: cx + 182,
      centerX: cx,
      groundY: clerkBottom,
      height: CLERK_H * 0.92,
      depth: D_CUST, // 점원 앞, 유리 뒤, 인테리어(3) 뒤.
      floor: this.level,
    };
    startCustomerVisits(this, [spot]);
    // **유리팬스**(홈 사이즈) — 점원·손님 하단을 가림.
    if (this.textures.exists('up_Slitare_BG_Glass')) {
      const glass = this.add.image(cx, cyFloor + GLASS_DY, 'up_Slitare_BG_Glass').setDepth(D_GLASS);
      glass.setDisplaySize(GLASS_W, glass.height * (GLASS_W / glass.width));
    }
  }

  /** 점원 idle 애니(발밑 고정 + 좌우 갸웃 + 숨쉬기) — 홈과 동일 느낌. */
  private animateClerk(img: Phaser.GameObjects.Image, phase = 0): void {
    const SWAY = 1.1;
    const baseAngle = img.angle;
    const bottom = img.y + img.displayHeight * (1 - img.originY);
    img.setOrigin(img.originX, 1);
    img.y = bottom;
    img.setAngle(baseAngle - SWAY);
    this.tweens.add({ targets: img, angle: baseAngle + SWAY, duration: 1500, delay: phase, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: img, scaleY: img.scaleY * 1.03, duration: 1950, delay: phase + 250, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** 홈 레이아웃(home.json)의 층 노드 — 레벨 순(1F..)로 {key,x,y,w,h}. */
  private floorNodes(): { key: string; x: number; y: number; w: number; h: number }[] {
    const doc = this.cache.json.get(UI_HOME_KEY) as LayoutDoc | null;
    if (!doc?.nodes) return [];
    return doc.nodes
      .filter((n) => n.type === 'image' && /_BG_0[1-5]$/.test(n.key ?? ''))
      .map((n) => ({ key: n.key ?? '', x: n.x, y: n.y, w: n.w ?? 800, h: n.h ?? 520 }))
      .sort((a, b) => b.y - a.y); // 아래(y 큰)=1F
  }

  /**
   * 타워 렌더 — 홈화면과 **동일 사이즈/위치**의 층들을, 현재 층이 화면 상단에 오도록 세로 오프셋.
   *   현재 층(하단이 보드 상단에 닿음) = 반투명창 위(depth 30). 하위 건설층 = 반투명창 뒤(depth 12).
   *   (이후 상위 층으로 갈수록 오프셋을 키워 위로 스크롤되는 구조로 확장.)
   */
  private drawTower(builtFloors: number): void {
    const floors = this.floorNodes();
    if (!floors.length) {
      this.drawFloorArt(); // 폴백: 홈 레이아웃 없으면 현재 층만
      return;
    }
    // **제일 상단층(최고 건설층)을 화면 상단에** 고정 → 1층이 위로 올라가지 않는다(타워는 아래로 이어짐).
    const topIdx = Math.max(0, Math.min(builtFloors, floors.length) - 1);
    const cur = floors[topIdx];
    const offset = DARK_TOP + 12 - (cur.y + cur.h / 2); // 최고층 하단이 보드 상단에 닿게
    floors.forEach((f, i) => {
      const level = i + 1;
      if (level > builtFloors || !this.textures.exists(f.key)) return;
      const cy = f.y + offset;
      this.add
        .image(f.x, cy, f.key)
        .setDisplaySize(f.w, f.h)
        .setDepth(cy < DARK_TOP ? 30 : 12);
    });
  }

  private drawHud(): void {
    // **에디터 크롬 모드**: 코인/다이아/레벨은 상단 헤더(buildTopHeader)가, 콤보는 미션 박스가, 홈 이동은
    //   헤더 ☰ 메뉴가 대신한다 → 코드 HUD 전부 생략. (예전엔 '남은 카드'·'⌂ 홈' 텍스트가 top-right 헤더
    //   아이콘(✉·☰) 뒤에 겹쳐 유령 텍스트로 비쳤다 → 전면 생략으로 제거.)
    if (this.chromeFromEditor) return;
    this.coinText = this.add
      .text(44, 56, '🪙 30,140', { fontFamily: '"Jua", sans-serif', fontSize: '44px', color: '#ffe9a0' })
      .setOrigin(0, 0.5)
      .setDepth(60);
    this.comboText = this.add
      .text(44, 112, '콤보 x0', { fontFamily: '"Jua", sans-serif', fontSize: '30px', color: '#ffffff' })
      .setOrigin(0, 0.5)
      .setDepth(60);
    this.remainText = this.add
      .text(W - 44, 56, '남은 카드 18', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '34px',
        color: '#ffffff',
        stroke: '#3a1030',
        strokeThickness: 6,
      })
      .setOrigin(1, 0.5)
      .setDepth(60);
    this.add
      .text(W - 44, 112, '⌂ 홈', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '32px',
        color: '#ffffff',
        stroke: '#3a1030',
        strokeThickness: 6,
      })
      .setOrigin(1, 0.5)
      .setDepth(60)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('home'));
  }

  // ── 좌표(동적 — 배치를 보드 영역에 맞춰 스케일·중앙배치) ─────────────────
  private geom = {
    scale: 1,
    cardW: BASE_CARD_W,
    cardH: BASE_CARD_H,
    cx: W / 2,
    topY: BOARD_TOP,
    colMid: 0,
    minRow: 0,
    pxUnit: BASE_CARD_W,
    pyUnit: BASE_CARD_H,
    // 에디터 절대배치 렌더용(abs 레이아웃일 때만).
    absMode: false,
    absOriginX: 0,
    absOriginY: 0,
  };

  /**
   * 에디터 절대배치(abs) 기하 — 저작 카드 바운딩(디자인 px)을 보드 영역에 배치한다.
   *   **에디터에서 설정한 카드 크기(최소/저작 크기)를 기준(1:1)으로 표시** — 에디터·게임 모두 1080×2400 이므로
   *   editor px = game px. 보드에 **넘칠 때만** 축소하고, 남으면 확대하지 않는다(레벨마다 카드 크기가 달라지지 않게).
   */
  private computeAbsGeom(abs: NonNullable<import('../logic/layouts.js').PeakLayout['abs']>): void {
    const contentW = Math.max(1, abs.maxX - abs.minX);
    const contentH = Math.max(1, abs.maxY - abs.minY);
    const boardW = BOARD_RIGHT - BOARD_LEFT;
    const boardH = this.boardBottom - this.boardTop;
    const scale = Math.min(ABS_CARD_MAX_SCALE, boardW / contentW, boardH / contentH); // 여유 있으면 카드 확대, 배치 넘치면 fit 으로 축소
    const drawW = contentW * scale;
    const drawH = contentH * scale;
    const originX = (BOARD_LEFT + BOARD_RIGHT) / 2 - drawW / 2 - abs.minX * scale; // 가로 중앙
    const originY = this.boardTop + Math.max(0, boardH - drawH) / 2 - abs.minY * scale; // 세로 중앙
    this.geom = {
      ...this.geom,
      scale,
      cardW: abs.cardW * scale,
      cardH: abs.cardH * scale,
      cx: (BOARD_LEFT + BOARD_RIGHT) / 2,
      absMode: true,
      absOriginX: originX,
      absOriginY: originY,
    };
  }

  private computeGeom(): void {
    if (this.state.layout.abs) {
      this.computeAbsGeom(this.state.layout.abs);
      return;
    }
    this.geom = { ...this.geom, absMode: false };
    const slots = this.state.layout.slots;
    const cols = slots.map((s) => s.col);
    const rows = slots.map((s) => s.row);
    const minC = Math.min(...cols);
    const maxC = Math.max(...cols);
    const minR = Math.min(...rows);
    const maxR = Math.max(...rows);
    // 세로(커버 관계)만 겹치고, **같은 행 가로 이웃은 미세 간격 유지**(겹침 금지).
    //   col 1칸 간격 = pxUnit0 > 카드폭 → 같은 행 카드 사이에 흰 프레임(±6px)까지 안 닿는 작은 틈.
    const pxUnit0 = BASE_CARD_W * 1.03; // col 1칸당 x 간격 — 가로 이웃 비겹침(헤어라인 미세 틈)
    const pyUnit0 = BASE_CARD_H * 0.58; // row 1칸당 y 간격 — 그룹 내부 세로 겹침(커버, 의도)
    const neededW = (maxC - minC) * pxUnit0 + BASE_CARD_W;
    const neededH = (maxR - minR) * pyUnit0 + BASE_CARD_H;
    const boardW = BOARD_RIGHT - BOARD_LEFT;
    const boardH = this.boardBottom - this.boardTop;
    // **카드 크기 상한(1.35)** — 종전 0.91 대비 +48%(체감 강화 피드백으로 상향). 여유가 있으면 이 크기까지만 키운다.
    // 배치가 상한으로 넘치면 그때만 fit 값으로 축소(오버플로 방지). 조밀한 레벨은 fit 우선(안 넘침).
    const scale = Math.min(1.35, boardW / neededW, boardH / neededH);
    this.geom = {
      scale,
      cardW: BASE_CARD_W * scale,
      cardH: BASE_CARD_H * scale,
      cx: (BOARD_LEFT + BOARD_RIGHT) / 2,
      topY: this.boardTop + Math.max(0, boardH - neededH * scale) / 2 + (BASE_CARD_H * scale) / 2,
      colMid: (minC + maxC) / 2,
      minRow: minR,
      pxUnit: pxUnit0 * scale,
      pyUnit: pyUnit0 * scale,
      absMode: false,
      absOriginX: 0,
      absOriginY: 0,
    };
  }

  private slotPos(slot: LayoutSlot): { x: number; y: number; depth: number } {
    const g = this.geom;
    if (g.absMode && slot.ax != null && slot.ay != null) {
      // 에디터 절대배치 — 저작 px 를 보드 영역 스케일로 매핑. 높은 레이어(row)=앞(높은 depth).
      return {
        x: g.absOriginX + slot.ax * g.scale,
        y: g.absOriginY + slot.ay * g.scale,
        depth: 100 + slot.row * 10,
      };
    }
    return {
      x: g.cx + (slot.col - g.colMid) * g.pxUnit,
      y: g.topY + (slot.row - g.minRow) * g.pyUnit,
      // 위 행(작은 row)이 앞(높은 depth) — 상단 카드가 아래 카드를 덮는다.
      depth: 100 + (this.state.layout.rowCount - slot.row) * 10,
    };
  }

  private buildBoard(): void {
    this.input.topOnly = true;
    this.computeGeom();
    // 아래 행(큰 row) 먼저 생성 → 위 행이 나중(=앞)으로 겹친다.
    const ordered = [...this.state.layout.slots].sort((a, b) => b.row - a.row);
    for (const slot of ordered) {
      if (this.state.cleared.has(slot.id)) continue; // 제거된 슬롯은 뷰 생성 안 함(되돌리기 재구성 대비).
      const p = this.slotPos(slot);
      // CardView 는 생성자에서 픽셀 기반 상호작용(pixelPerfect)을 켠다 → 카드 실제 픽셀에만 반응.
      const view = new CardView(this, p.x, p.y, this.geom.cardW, this.geom.cardH);
      view.setDepth(p.depth);
      view.setAngle(slot.rot ?? 0); // 손맛 회전(있으면). pixelPerfect 히트도 회전을 반영.
      view.setData('slotId', slot.id);
      view.on('pointerdown', () => this.onCardTap(slot.id));
      this.cards.set(slot.id, view);
    }
  }

  /**
   * 최초 딜 연출 — 보드 카드가 한 번에 '툭' 나타나지 않고, **폴드(뒷면) 카드가 먼저 차르륵 빠르게
   * 깔린 뒤, 오픈(앞면) 카드가 좌우에서 날아와** 자리에 안착한다. `refresh()` 로 얼굴/뒷면·알파가
   * 이미 최종값으로 정해진 뒤 호출되므로, 여기서는 그 최종 상태를 시작 상태로 되돌린 다음 트윈으로 복원한다.
   *   · 폴드: 위쪽에서 살짝 비껴 떨어지며 **가속하는 스태거**(뒤로 갈수록 간격이 촘촘)로 리듬을 만든다.
   *   · 오픈: 보드 중심 기준 가까운 쪽 화면 밖에서 가속-감속(easeInOut)으로 날아 들어온다.
   *   되돌리기/보드 재구성(rebuildBoard)에서는 호출하지 않아 즉시 표시된다.
   */
  private dealInAnimation(): void {
    const boardCx = this.geom.cx;
    type DealItem = {
      view: CardView;
      fx: number;
      fy: number;
      fa: number;
      fsx: number;
      fsy: number;
      fAlpha: number;
      exposed: boolean;
    };
    const items: DealItem[] = [];
    for (const [id, view] of this.cards) {
      items.push({
        view,
        fx: view.x,
        fy: view.y,
        fa: view.angle,
        fsx: view.scaleX,
        fsy: view.scaleY,
        fAlpha: view.alpha,
        exposed: isExposed(this.state, id),
      });
      if (view.input) view.input.enabled = false; // 딜 도중 입력 잠금(날아드는 카드 오탭 방지).
    }
    if (items.length === 0) return;
    this.dealing = true;

    const folds = items.filter((it) => !it.exposed);
    const opens = items.filter((it) => it.exposed);

    // ── 폴드(뒷면) — 위에서 비껴 떨어지며 가속 스태거로 차르륵 깔린다. ──
    const FOLD_SPAN = 500; // 폴드 시작딜레이 창(전체)
    const FOLD_DUR = 175; // 개별 낙하 시간
    const n = Math.max(1, folds.length);
    folds.forEach((it, i) => {
      const delay = FOLD_SPAN * (i / n) ** 1.7; // 뒤로 갈수록 촘촘 → 가속하는 리듬
      it.view
        .setPosition(it.fx - 44, it.fy - 62)
        .setAlpha(0)
        .setAngle(it.fa - 9)
        .setScale(it.fsx * 0.92, it.fsy * 0.92);
      this.tweens.add({
        targets: it.view,
        x: it.fx,
        y: it.fy,
        angle: it.fa,
        alpha: it.fAlpha,
        scaleX: it.fsx,
        scaleY: it.fsy,
        delay,
        duration: FOLD_DUR,
        ease: 'Quad.easeIn', // 낙하가 가속되며 안착
      });
    });

    // ── 오픈(앞면) — 폴드가 거의 깔린 뒤 좌우 화면 밖에서 날아와 안착. ──
    const OPEN_BASE = FOLD_SPAN * 0.8 + 40;
    const OPEN_STAGGER = 78;
    const OPEN_DUR = 300;
    let lastEnd = folds.length > 0 ? FOLD_SPAN + FOLD_DUR : 0;
    opens.forEach((it, i) => {
      const side = it.fx < boardCx ? -1 : 1;
      const startX = side < 0 ? -this.geom.cardW : W + this.geom.cardW;
      const delay = OPEN_BASE + i * OPEN_STAGGER;
      it.view.setPosition(startX, it.fy).setAlpha(it.fAlpha).setAngle(side * 14).setScale(it.fsx, it.fsy);
      this.tweens.add({
        targets: it.view,
        x: it.fx,
        y: it.fy,
        angle: it.fa,
        delay,
        duration: OPEN_DUR,
        ease: 'Cubic.easeInOut', // 날개에서 가속 → 슬롯에서 감속
      });
      lastEnd = Math.max(lastEnd, delay + OPEN_DUR);
    });

    // 딜 종료 후 입력/상태 복원.
    this.time.delayedCall(lastEnd + 20, () => {
      this.dealing = false;
      this.refresh();
    });
  }

  private buildStockAndWaste(): void {
    // 스톡·웨이스트 카드는 보드(상단) 카드와 동일 크기.
    const cw = this.geom.cardW;
    const ch = this.geom.cardH;
    this.stockContainer = this.add.container(STOCK.x, STOCK.y).setDepth(80);
    this.buildStockPile(); // 보유 수량만큼 카드를 왼쪽으로 펼친다.
    // 탭 입력 Zone — 왼쪽으로 펼쳐진 더미 전체를 덮도록 왼쪽으로 넓게 잡는다(펼친 카드 어디를 눌러도 뽑힘).
    const fanW = (STOCK_STACK_CAP - 1) * STOCK_FAN_STEP;
    this.add
      .zone(STOCK.x - fanW / 2, STOCK.y + 10, cw + fanW + 60, ch + 120)
      .setDepth(85)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.onStockTap());
    this.stockCountText = this.add
      .text(STOCK.x, STOCK.y + ch / 2 + 24, '', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '28px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(81);

    this.add
      .text(WASTE.x, WASTE.y + ch / 2 + 24, '기준 카드', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '24px',
        color: '#e9d9ff',
      })
      .setOrigin(0.5)
      .setDepth(81);

    const wv = new CardView(this, WASTE.x, WASTE.y, cw, ch, false);
    wv.setDepth(82);
    wv.showFace(wasteTop(this.state));
    this.wasteView = wv;
  }

  /**
   * 스톡 더미를 **보유 수량만큼** 카드(뒷면)를 겹쳐 다시 쌓는다 — 남은 장수가 두께로 보인다(상한 STOCK_STACK_CAP).
   *   수량이 바뀔 때만 호출(refresh 에서 캐시 비교). 위로 갈수록 살짝 왼쪽·위로 어긋나 웨이스트와 겹치지 않는다.
   */
  /** 뽑기 더미(왼쪽 펼침 부채)의 **중간 지점** 월드 좌표 — 보너스 카드가 더미 중간으로 회수되는 타깃. */
  private stockMidPoint(): { x: number; y: number } {
    const count = Math.min(this.state.stock.length, STOCK_STACK_CAP);
    const midLocalX = -((count - 1) / 2) * STOCK_FAN_STEP; // 부채 중앙(원점=top, 왼쪽으로 펼침)
    return { x: STOCK.x + midLocalX, y: STOCK.y };
  }

  private buildStockPile(): void {
    const cont = this.stockContainer;
    if (!cont) return;
    cont.removeAll(true);
    const cw = this.geom.cardW;
    const ch = this.geom.cardH;
    const len = this.state.stock.length;
    const count = Math.min(len, STOCK_STACK_CAP);
    // **스톡 내 와일드 위치** — 부채에서 대응하는 팬 인덱스에 와일드 아트를 같은 크기로 노출(중간 프리뷰).
    //   단, 뱅킹 비행 중(wildBanking)에는 아직 표시하지 않는다(도착 후 표시).
    const wildIdx = this.wildBanking ? -1 : this.state.stock.findIndex((c) => c.wild);
    const wildFanI = wildIdx >= 0 ? Math.round((wildIdx / Math.max(1, len - 1)) * (count - 1)) : -1;
    // 왼쪽으로 펼친 부채 — i=0(맨 아래)=가장 왼쪽, i=count-1(맨 위, 다음에 뽑힐 카드)=원점(뽑기 시작 위치).
    for (let i = 0; i < count; i++) {
      const isWild = i === wildFanI;
      // 와일드는 살짝 위로 띄워(y=-ch*0.16) 부채 사이로 확실히 보이게. 크기는 스톡 카드와 동일.
      const back = new CardView(this, -(count - 1 - i) * STOCK_FAN_STEP, isWild ? -ch * 0.16 : 0, cw, ch, false);
      if (isWild) back.showWild();
      else back.showBack();
      cont.add(back);
    }
    this.lastStockCount = this.state.stock.length;
  }

  // ── 부스터(와일드 · 되돌리기 · 카드5개, 코인 소모) ─────────────────────
  /** 상태 변경 전 히스토리 저장(되돌리기용). */
  private pushHistory(): void {
    // 수(move) 직전의 GameState + 씬 래치를 함께 저장(undo 가 둘 다 되돌리도록). comboColors 는 얕은 복사.
    this.history.push({
      state: this.state,
      wildBanked: this.wildBanked,
      bonusTriggered: this.bonusTriggered,
      setsCompleted: this.setsCompleted,
    });
    if (this.history.length > 40) this.history.shift();
  }

  /** 코인 차감(뱅크된 코인 기준). 부족하면 false. */
  private spend(cost: number): boolean {
    if (this.baseCoins < cost) {
      sfx('no_coin');
      this.toast('코인이 부족해요');
      return false;
    }
    this.baseCoins -= cost;
    const s = loadSave();
    s.coins = Math.max(0, s.coins - cost);
    writeSave(s);
    return true;
  }

  private drawBoosters(): void {
    // 에디터 크롬이면 하단 부스터(와일드/되돌리기/+5)는 에디터 이미지(layer_10/10_copy/11)를 쓴다 → 코드 텍스트 버튼 생략.
    if (this.chromeFromEditor) {
      this.updateBoosters();
      return;
    }
    // 하단 스톡/웨이스트(y=1880, 라벨 포함 ~1990) 아래에 배치해 카드와 겹치지 않게(스톡과 함께 위로 이동).
    const y = 2100;
    this.wildBtn = this.mkBooster(W * 0.22, y, `🃏 와일드\n🪙 ${wildCost(0)}`, () => this.useWild());
    this.undoBtn = this.mkBooster(W * 0.5, y, `↩ 되돌리기\n🪙 ${UNDO_COST}`, () => this.undo());
    this.addBtn = this.mkBooster(W * 0.78, y, `＋5 카드\n🪙 ${plus5Cost(0)}`, () => this.addCards());
    this.updateBoosters();
  }

  private mkBooster(x: number, y: number, label: string, on: () => void): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, label, {
        fontFamily: '"Jua", sans-serif',
        fontSize: '30px',
        color: '#2a1830',
        backgroundColor: '#ffd166',
        align: 'center',
        padding: { x: 20, y: 12 },
      })
      .setOrigin(0.5)
      .setDepth(90)
      .setShadow(0, 3, '#00000055', 5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', on);
  }

  /** 버튼 활성/색 갱신(코인·가용 여부·와일드 활성 반영). */
  private updateBoosters(): void {
    const set = (btn: Phaser.GameObjects.Text | undefined, enabled: boolean, active = false): void => {
      if (!btn) return;
      btn.setAlpha(enabled ? 1 : 0.4);
      btn.setBackgroundColor(active ? '#7ed957' : '#ffd166');
    };
    // 에디터 부스터 이미지: 활성=alpha 1, 비활성=흐림, 와일드 활성=초록 틴트.
    const setImg = (img: Phaser.GameObjects.Image | undefined, enabled: boolean, active = false): void => {
      if (!img) return;
      img.setAlpha(enabled ? 1 : 0.4);
      if (active) img.setTint(0x7ed957);
      else img.clearTint();
    };
    const nextWild = wildCost(this.wildUses); // 다음 사용 비용(사용할수록 상승).
    const nextPlus5 = plus5Cost(this.plus5Uses);
    const wildOn = this.wildActive || this.baseCoins >= nextWild;
    const undoOn = this.history.length > 0 && this.baseCoins >= UNDO_COST;
    // ＋5 카드 = 재활용할 소모 카드가 있고 **코인이 충분**하면 활성(무료 → 상승 비용으로 변경).
    const addOn = this.state.waste.length > 1 && this.baseCoins >= nextPlus5;
    set(this.wildBtn, wildOn, this.wildActive);
    set(this.undoBtn, undoOn);
    set(this.addBtn, addOn);
    setImg(this.wildImg, wildOn, false); // 와일드 활성 시에도 우측 하단 버튼 색상 변화는 표시하지 않음(요청)
    setImg(this.undoImg, undoOn);
    setImg(this.addImg, addOn);
    // 에디터 부스터 이미지 옆 코인 비용 라벨 갱신(다음 사용 비용).
    this.plus5CostLabel?.setText(`🪙 ${nextPlus5.toLocaleString()}`);
    this.wildCostLabel?.setText(`🪙 ${nextWild.toLocaleString()}`);
    // 폴백 텍스트 버튼(비-에디터)도 상승 비용 반영.
    if (this.wildBtn && !this.wildActive) this.wildBtn.setText(`🃏 와일드\n🪙 ${nextWild.toLocaleString()}`);
    this.addBtn?.setText(`＋5 카드\n🪙 ${nextPlus5.toLocaleString()}`);
  }

  /**
   * 와일드 — 선택하면 **와일드 카드가 기준(웨이스트) 카드 자리로 날아가** 기준이 와일드가 된다.
   *   기준이 와일드인 동안 아무 노출 카드나 탭해 ±1 무시로 제거할 수 있다(제거하면 그 카드가 새 기준).
   *   다시 누르면 취소(마커 제거, 코인 환불 없음).
   */
  private useWild(): void {
    if (this.busy || this.ended) return;
    if (this.wildActive) {
      this.cancelWild();
      return;
    }
    const cost = wildCost(this.wildUses);
    if (!this.spend(cost)) return;
    this.wildUses += 1; // 다음 사용부터 비용 상승(+5카드보다 약간 비쌈).
    sfx('wild_activate');
    this.wildActive = true;
    this.toast(`🃏 와일드  🪙 ${cost.toLocaleString()}`);
    this.updateBoosters();
    // 와일드 카드가 부스터 버튼 → 기준 카드 자리로 포물선 비행 후, 기준 위에 와일드 마커로 안착.
    const from = this.wildImg ?? this.wildBtn;
    const sx = from?.x ?? W * 0.78;
    const sy = from?.y ?? 2100;
    const cw = this.geom.cardW;
    const ch = this.geom.cardH;
    const flyer = this.textures.exists('up_Solitare_UI_08')
      ? this.add.image(sx, sy, 'up_Solitare_UI_08').setDisplaySize(cw, ch)
      : this.add.rectangle(sx, sy, cw, ch, 0xffd166);
    flyer.setDepth(1200);
    const ctrlX = (sx + WASTE.x) / 2;
    const ctrlY = Math.min(sy, WASTE.y) - 360;
    this.busy = true;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 480,
      ease: 'Sine.easeInOut',
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        const u = 1 - t;
        flyer.x = u * u * sx + 2 * u * t * ctrlX + t * t * WASTE.x;
        flyer.y = u * u * sy + 2 * u * t * ctrlY + t * t * WASTE.y;
      },
      onComplete: () => {
        flyer.destroy();
        this.busy = false;
        // 비행 도중 이미 와일드를 소비(카드 탭)했다면 마커를 얹지 않는다.
        if (this.wildActive) {
          this.showWildMarker();
          this.toast('🃏 와일드! 아무 노출 카드나 탭하세요');
        }
        this.refresh();
      },
    });
  }

  /** 와일드 활성 취소 — 마커 제거 + 하이라이트 원복. */
  private cancelWild(): void {
    this.wildActive = false;
    this.wildMarker?.destroy();
    this.wildMarker = undefined;
    this.updateBoosters();
    this.refresh();
  }

  /** 기준(웨이스트) 카드 위에 **와일드 카드를 배치**한다 — 기준이 와일드가 됐음을 카드 그대로 표시. */
  private showWildMarker(): void {
    this.wildMarker?.destroy();
    this.wildMarker = undefined;
    if (!this.textures.exists('up_Solitare_UI_08')) return;
    // 와일드 카드(프레임 크롭 아트)를 기준 카드와 같은 크기로, **기준 카드보다 위 depth**에 얹어 실제로 보이게.
    const marker = new CardView(this, WASTE.x, WASTE.y, this.geom.cardW, this.geom.cardH, false);
    marker.showWild();
    marker.setDepth(Math.max(1005, (this.wasteView?.depth ?? 1000) + 5));
    this.wildMarker = marker;
    // 살짝 맥동시켜 활성 상태를 강조.
    this.tweens.add({
      targets: marker,
      scale: marker.scale * 1.06,
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** 되돌리기 — 직전 상태로 복원(보드 재구성). */
  private undo(): void {
    if (this.busy || this.ended) return;
    if (this.flyingCards > 0) return; // 카드 비행 연출 중 되돌리기 금지(orphan 뷰가 wasteView 를 덮는 레이스 방지).
    if (this.history.length === 0) {
      this.toast('되돌릴 수 없어요');
      return;
    }
    if (!this.spend(UNDO_COST)) return;
    sfx('undo');
    const prev = this.history.pop();
    if (!prev) return;
    this.state = prev.state;
    // **GameState 밖 래치 복원** — 특수카드 트리거·완료 세트를 수 직전 상태로(보너스/와일드 영구 무력화·게이지 파밍 방지).
    this.wildBanked = prev.wildBanked;
    this.bonusTriggered = prev.bonusTriggered;
    this.setsCompleted = prev.setsCompleted;
    this.cancelWild();
    this.resetComboRun(); // 되돌리면 콤보 런은 끊긴다(원 설계 유지): comboColors=[] + 박스 갱신.
    this.updateGauge(); // 복원된 setsCompleted 로 게이지 채움 재그리기.
    this.rebuildBoard();
  }

  /**
   * ＋5 카드 — 소모 카드(웨이스트) 중 임의 5장을 스톡으로 되돌린다.
   *   **비용 = 게임비 기준 상승 곡선**(plus5Cost). 한 판에서 쓸수록 비싸진다(첫 750·1000·1250…).
   */
  private addCards(): void {
    if (this.busy || this.ended) return;
    if (this.flyingCards > 0) return; // 카드 비행 연출 중 금지(상태 갱신 레이스 방지).
    if (this.state.waste.length <= 1) {
      this.toast('되돌릴 카드가 없어요');
      return;
    }
    const cost = plus5Cost(this.plus5Uses);
    if (!this.spend(cost)) return; // 코인 부족 시 spend 가 토스트 후 중단.
    this.plus5Uses += 1; // 다음 사용부터 비용 상승.
    this.pushHistory();
    this.state = refillStock(this.state, ADD5_COUNT, this.rng);
    sfx('add5');
    this.refresh(); // 즉시 스톡 더미에 반영(바로 배치) + 부스터 비용 라벨 갱신.
    this.toast(`＋${ADD5_COUNT} 카드  🪙 ${cost.toLocaleString()}`);
  }

  /** 보드 뷰를 현재 상태로 재구성(되돌리기 후 제거됐던 카드 복원). */
  private rebuildBoard(): void {
    for (const v of this.cards.values()) v.destroy();
    this.cards.clear();
    this.buildBoard();
    this.wasteView?.showFace(wasteTop(this.state));
    this.refresh();
  }

  private toast(msg: string): void {
    const t = this.add
      .text(W / 2, H * 0.44, msg, {
        fontFamily: '"Jua", sans-serif',
        fontSize: '40px',
        color: '#ffffff',
        backgroundColor: '#2a1830cc',
        padding: { x: 34, y: 16 },
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(1600);
    this.tweens.add({ targets: t, alpha: 0, y: H * 0.4, duration: 1100, delay: 700, onComplete: () => t.destroy() });
  }

  // ── 상호작용 ────────────────────────────────────────────────────────
  private onCardTap(slotId: string): void {
    if (this.ended || this.dealing) return; // ⚠️ busy 로 막지 않는다 — 카드가 날아가는 도중에도 다음 카드를 선택할 수 있게(동시 플레이).
    const view = this.cards.get(slotId);
    if (!view) return;
    const wild = this.wildActive;
    // 와일드면 노출만 확인(±1 무시), 아니면 ±1 매칭 필요.
    if (wild ? !isExposed(this.state, slotId) : !isPlayable(this.state, slotId)) {
      sfx('card_invalid');
      this.denyFeedback(view);
      return;
    }
    this.pushHistory();
    const card = this.state.board[slotId];
    this.state = wild ? playWild(this.state, slotId) : playCard(this.state, slotId);
    if (wild) sfx('wild_use');
    else sfxCardPlace();
    if (wild) {
      this.wildActive = false;
      this.wildMarker?.destroy();
      this.wildMarker = undefined;
    }
    this.cards.delete(slotId);
    view.disableInteractive();
    view.showFace(card);
    view.setDepth(1000);
    // **다이아 수집** — 이 카드에 다이아가 끼워져 있었으면 크게 팝업 후 상단으로 회수.
    if (this.diamondSlots.has(slotId)) {
      this.diamondSlots.delete(slotId);
      const gem = this.diamondViews.get(slotId);
      this.diamondViews.delete(slotId);
      if (gem) this.collectDiamond(gem);
    }
    // (요청) 와일드로 낸 보드 카드에는 와일드 이미지를 얹지 않는다 — 선택 카드가 그대로 회수된다.
    // 상태는 이미 갱신됨 → **즉시 refresh** 로 새 기준(웨이스트 top) 하이라이트/미션 반영.
    //   단, 아래 노출 카드 공개는 **보류**(suppressReveal) — 낸 카드의 토스 회수가 끝날 때 뒤집어 공개.
    this.pushMatch(card.suit);
    this.suppressReveal = true;
    this.refresh();
    this.suppressReveal = false;
    // **역동적 회수 연출** — ①눌림(축소) → ②팝(확대+살짝 뜸) → ③위로 크게 토스하며 1.5바퀴 회전 + 잔상 → ④웨이스트 회수.
    const startAngle = view.angle;
    const baseSX = view.scaleX;
    const baseSY = view.scaleY;
    const startFly = (): void => {
      const sx = view.x;
      const sy = view.y;
      const flySX = view.scaleX; // 팝 직후 확대 배율 → 비행 중 기본 배율로 수렴
      const flySY = view.scaleY;
      const ctrlX = (sx + WASTE.x) / 2;
      const ctrlY = Math.min(sy, WASTE.y) - 360; // 위로 크게 토스(정점)
      const emitTrail = this.makeTrailEmitter(1000);
      let revealed = false;
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 520,
        ease: 'Sine.easeInOut',
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          const u = 1 - t;
          view.x = u * u * sx + 2 * u * t * ctrlX + t * t * WASTE.x;
          view.y = u * u * sy + 2 * u * t * ctrlY + t * t * WASTE.y;
          view.setAngle(startAngle + 540 * t); // 1.5바퀴 스핀
          view.setScale(Phaser.Math.Linear(flySX, baseSX, t), Phaser.Math.Linear(flySY, baseSY, t));
          emitTrail(view);
          // **튀어오름 정점(~40%)에서 아래 노출 카드 공개** — 회수 끝까지 기다리지 않고 약간 빠르게 뒤집는다.
          if (!revealed && t >= 0.4) {
            revealed = true;
            this.refresh();
          }
        },
        onComplete: () => {
          this.flyingCards = Math.max(0, this.flyingCards - 1); // 비행 종료(undo/+5 재허용).
          view.setPosition(WASTE.x, WASTE.y);
          view.setAngle(0);
          view.setScale(baseSX, baseSY);
          // 도착한 카드가 새 기준. 이전 기준 뷰는 파기(동시 여러 장이 날아와도 마지막 도착이 기준으로 남음).
          if (this.wasteView && this.wasteView !== view) this.wasteView.destroy();
          this.wasteView = view;
          // **회수(튀어오름) 완료 시점** — 이제 아래 노출 카드를 뒤집어 공개(보류 해제).
          this.refresh();
          this.checkEnd();
        },
      });
    };
    // ①눌림(양방향 축소) → ②팝(확대 + 살짝 위로 뜸, Back 오버슛) → 토스 회수.
    this.flyingCards += 1; // 비행 시작(undo/+5 잠금) — startFly 의 onComplete 에서 감소.
    this.tweens.add({
      targets: view,
      scaleX: baseSX * 0.84,
      scaleY: baseSY * 0.84,
      duration: 75,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.tweens.add({
          targets: view,
          scaleX: baseSX * 1.2,
          scaleY: baseSY * 1.2,
          y: view.y - 28,
          duration: 150,
          ease: 'Back.easeOut',
          onComplete: () => startFly(),
        });
      },
    });
  }

  private onStockTap(): void {
    if (this.ended || this.dealing) return; // busy 로 막지 않음(동시 플레이). 딜 연출 중엔 잠금.
    if (this.state.stock.length === 0) return;
    this.pushHistory();
    // **동적 드로우**: 뽑는 카드의 랭크는 drawStock 이 결정하므로 뽑은 뒤 웨이스트 top 을 읽어 애니메이션.
    this.state = drawStock(this.state, this.rng);
    const card = wasteTop(this.state);
    const drewWild = card.wild === true; // 뽑힌 카드가 와일드면 기준이 와일드가 되어 1회 아무 카드나 낼 수 있다.
    sfx(drewWild ? 'wild_activate' : 'card_deal');
    // 뽑기 = 콤보 끊김. 기준 카드가 새로 바뀌므로 (와일드가 아니면) 와일드도 해제하고 미션 박스를 비운다.
    if (drewWild) this.wildActive = true;
    else this.cancelWild();
    this.resetComboRun();
    this.refresh(); // 스톡 수량·하이라이트 즉시 반영(더미 다시 쌓기 포함).
    const fly = new CardView(this, STOCK.x, STOCK.y, this.geom.cardW, this.geom.cardH, false);
    fly.setDepth(1000);
    // **폴드(뒷면)로 시작 → 이동하며 카드가 뒤집혀 오픈되면서 기준 자리에 배치**.
    fly.showBack();
    const baseSX = fly.scaleX; // 정지 시 표시 배율(뒤집기 중 X만 압축/복원)
    let swapped = false;
    // **옆으로 뒤집히는 플립**(scaleX 1→0→1, 중간에 뒷면→앞면 교체) + 잔상 트레일.
    const emitTrail = this.makeTrailEmitter(1000);
    this.flyingCards += 1; // 비행 시작(undo/+5 잠금) — onComplete 에서 감소.
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 360,
      ease: 'Cubic.easeOut',
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        fly.x = STOCK.x + (WASTE.x - STOCK.x) * t;
        fly.y = STOCK.y + (WASTE.y - STOCK.y) * t;
        // 중간 지점(카드가 옆으로 서는 순간)에서 뒷면→앞면 교체 → 오픈되는 플립.
        if (!swapped && t >= 0.5) {
          swapped = true;
          if (drewWild) fly.showWild();
          else fly.showFace(card);
        }
        fly.scaleX = baseSX * Math.abs(Math.cos(t * Math.PI)); // 1→0→1
        emitTrail(fly);
      },
      onComplete: () => {
        this.flyingCards = Math.max(0, this.flyingCards - 1); // 비행 종료(undo/+5 재허용).
        fly.setPosition(WASTE.x, WASTE.y);
        fly.scaleX = baseSX;
        if (this.wasteView && this.wasteView !== fly) this.wasteView.destroy();
        this.wasteView = fly;
        if (drewWild) {
          // 기준이 와일드 → 노출 카드 전부 골드 강조(아무거나 1회), 안내 + 살짝 맥동.
          this.updateBoosters();
          this.toast('🃏 와일드! 아무 노출 카드나 탭하세요');
          this.tweens.add({
            targets: fly,
            scaleX: baseSX * 1.06,
            scaleY: fly.scaleY * 1.06,
            duration: 460,
            yoyo: true,
            repeat: 2,
            ease: 'Sine.easeInOut',
          });
          this.refresh();
        }
        this.checkEnd();
      },
    });
  }

  private denyFeedback(view: CardView): void {
    const x0 = view.x;
    this.tweens.add({ targets: view, x: x0 + 6, duration: 40, yoyo: true, repeat: 2, onComplete: () => view.setX(x0) });
  }

  /**
   * 이동 중인 카드가 **잔상(고스트)을 연속으로 남기는 트레일** — 레퍼런스처럼 하나의 카드가 경로를 따라
   * 이어져 보인다. 반환한 `emit(view)` 를 트윈 onUpdate 에서 매 프레임 호출하면, 카드가 minDist(px)
   * 이상 이동할 때마다 현재 텍스처/각도/스케일을 복제한 반투명 이미지를 깔고 짧게 페이드아웃한다.
   *   · **거리 기반**이라 프레임레이트와 무관하게 잔상 간격이 일정(등속 스텝에서도 촘촘한 트레일).
   *   · view.texture.key 를 그대로 쓰므로 플립(뒷면↔앞면)·회전이 잔상에도 반영된다.
   */
  private makeTrailEmitter(depth: number, minDist = 58): (view: Phaser.GameObjects.Image) => void {
    let lx = Number.NaN;
    let ly = Number.NaN;
    return (view: Phaser.GameObjects.Image): void => {
      if (!Number.isNaN(lx)) {
        const dx = view.x - lx;
        const dy = view.y - ly;
        if (dx * dx + dy * dy < minDist * minDist) return;
      }
      lx = view.x;
      ly = view.y;
      const g = this.add.image(view.x, view.y, view.texture.key).setDepth(depth - 1);
      g.scaleX = view.scaleX;
      g.scaleY = view.scaleY;
      g.setAngle(view.angle);
      g.setAlpha(0.5);
      this.tweens.add({ targets: g, alpha: 0, duration: 300, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
    };
  }

  /** 노출/매칭 상태 반영 — 노출 앞면(입력 ON), 가려진 뒷면(입력 OFF). 플레이 가능 카드는 골드 하이라이트. */
  /**
   * 반투명 막 — **보드 영역 전체**를 덮는 반투명 다크 레이어. 건물(타워, depth 12~30)과 카드(depth 110+) **사이**(depth 50)에
   * 두어 건물이 막 뒤로 은은히 비치고 카드는 앞에서 선명하게 뜬다. HUD/스톡/웨이스트(depth 60~85)는 막 위에 남는다. 1회 생성.
   */
  private drawBoardMask(): void {
    if (this.cardBacking) return;
    const g = this.add.graphics().setDepth(50);
    g.fillStyle(0x0d1424, 0.62);
    g.fillRect(0, DARK_TOP, W, H - DARK_TOP);
    this.cardBacking = g;
  }

  private refresh(): void {
    // 에디터가 암막 패널(layer_4)을 저작했으면 코드 막 생략(중복 방지).
    if (!this.chromeFromEditor) this.drawBoardMask();
    const moves = new Set(availableMoves(this.state));
    for (const [id, view] of this.cards) {
      const exposed = isExposed(this.state, id);
      // 가려진(뒷면) 카드는 입력 비활성 → 앞면 아래 겹치는 영역을 눌러도 뒷면이 잡히지 않는다.
      if (view.input) view.input.enabled = exposed;
      // **보드 와일드 노출 감지** — 아트 유지(탭 잠금)하고 루프 후 자동 뱅킹으로 스톡에 삽입.
      if (exposed && id === this.wildSlotId && !this.wildBanked) {
        view.showWild(); // 미리보기와 동일하게 와일드 아트 유지(뒷면 플리커 방지)
        if (view.input) view.input.enabled = false;
        if (!this.dealing && !this.suppressReveal) this.pendingBankWild = true;
        continue;
      }
      // **보드 보너스(+N) 노출 감지** — 아트 유지하고 루프 후 흡입 연출 트리거.
      if (exposed && this.bonusSlot && id === this.bonusSlot.id && !this.bonusTriggered) {
        view.showArt(BONUS_ART[this.bonusSlot.count]);
        if (view.input) view.input.enabled = false;
        if (!this.dealing && !this.suppressReveal) this.pendingBonus = true;
        continue;
      }
      if (exposed) {
        // 와일드 활성 시 노출 카드 전부 골드 강조(아무거나 탭 가능), 아니면 ±1 가능 카드만.
        const hl = this.wildActive || moves.has(id);
        // 딜 중이 아니고 방금 노출된(아직 뒷면) 카드: 공개 보류 중이면 뒷면 유지(입력 잠금),
        //   아니면 **뒤집기 연출**로 공개. 이미 앞면이면 즉시 갱신.
        if (!this.dealing && !view.isFaceUp()) {
          if (this.suppressReveal) {
            view.showBack();
            if (view.input) view.input.enabled = false; // 공개 전까지 탭 불가
          } else {
            view.flipToFace(this.state.board[id], hl);
          }
        } else {
          view.showFace(this.state.board[id], hl);
        }
        view.setAlpha(1);
      } else {
        // **가려진 특수 카드는 뒷면 대신 아트를 미리 보여준다**(상단 보드에 와일드/+N 위치 프리뷰).
        if (id === this.wildSlotId && !this.wildBanked) {
          view.showWild();
        } else if (this.bonusSlot && id === this.bonusSlot.id && !this.bonusTriggered) {
          view.showArt(BONUS_ART[this.bonusSlot.count]);
        } else {
          view.showBack();
        }
        view.setAlpha(0.98);
      }
    }
    // 루프 중 보드 와일드 노출을 감지했으면 뱅킹(스톡 삽입 + 비행 연출). wildBanked 로 1회만.
    if (this.pendingBankWild) {
      this.pendingBankWild = false;
      this.bankWild();
    }
    // 보드 보너스(+N) 노출 감지 → 흡입 연출. bonusTriggered 로 1회만.
    if (this.pendingBonus) {
      this.pendingBonus = false;
      this.triggerBonus();
    }
    const stock = this.state.stock.length;
    // 스톡 수량이 바뀌면 더미를 다시 쌓는다(보유 수량만큼 겹쳐 보이게).
    if (stock !== this.lastStockCount) this.buildStockPile();
    this.stockCountText?.setText(stock > 0 ? `👆 뽑기 · ${stock}장` : '더미 없음');
    this.stockContainer?.setAlpha(stock > 0 ? 1 : 0.4);
    this.comboText?.setText(`콤보 x${this.state.combo}`);
    this.remainText?.setText(`남은 카드 ${remaining(this.state)}`);
    // **코인 = 실제 보유 잔액(baseCoins)만** 표시. (예전엔 baseCoins+state.score 를 더해, 플레이 중 점수만큼
    //   부풀려 보이다가 승리/복귀 시 실지급(STAR_COINS)만 반영돼 확 줄어 '데이터 안 맞음'으로 보였다.
    //   게임비 차감·부스터 비용·승리 보상이 전부 baseCoins 로 일관되므로, 표시도 baseCoins 로 통일.)
    const coins = this.baseCoins.toLocaleString();
    this.coinText?.setText(`🪙 ${coins}`);
    // 공통 상단 헤더(+구 에디터 코인 텍스트 폴백)에 실시간 반영.
    this.header?.setCoins(this.baseCoins);
    this.coinBinding?.setText(coins);
    this.updateBoosters();
  }

  private checkEnd(): void {
    if (this.ended) return;
    if (isWin(this.state)) {
      // **게임 종료 = 보드 전멸(모든 카드 매칭)뿐**. 게이지로 얻은 별(최소 1)로 레벨 클리어 정산.
      const stars = Math.min(SETS_TARGET, Math.max(1, this.setsCompleted));
      this.finishMission(stars);
    } else if (isStuck(this.state) && !this.wildActive) {
      // 와일드 활성 중엔 아무 노출 카드나 낼 수 있으므로 교착이 아니다.
      // 교착이어도 **실패 팝업을 띄우지 않는다** — ＋5 카드나 와일드 버튼으로 이어서 풀도록 안내만 한다.
      sfx('stuck');
      this.toast('막혔어요! ＋5 카드나 🃏 와일드를 눌러 이어가세요');
      this.updateBoosters();
    }
  }

  /** 승리 연출 — **전체 덱 52장**을 스톡 위치에서 위로 뿌린 뒤 아래로 떨어뜨린다(포물선 토스). */
  private winScatter(onDone: () => void): void {
    // 전체 덱(4 suit × 13 rank = 52장 고유 카드)을 구성해 흩뿌린다.
    const fullDeck: Card[] = [];
    for (const suit of SUITS)
      for (const rank of RANKS) fullDeck.push({ id: `${suit}${rank}`, suit, rank } as Card);
    const n = fullDeck.length; // = 52
    let done = 0;
    const finish = (): void => {
      if (++done === n) onDone();
    };
    for (let i = 0; i < n; i++) {
      const startX = STOCK.x + (Math.random() * 2 - 1) * 20;
      const startY = STOCK.y;
      const c = new CardView(this, startX, startY, this.geom.cardW, this.geom.cardH, false);
      c.showFace(fullDeck[i], false);
      c.setDepth(1500);

      const driftX = (Math.random() * 2 - 1) * W * 0.55;
      const rise = 320 + Math.random() * 420;
      const spin = (Math.random() * 2 - 1) * 720;
      const upDur = 430 + Math.random() * 240;
      // 1) 위로 솟구침(감속).
      this.tweens.add({
        targets: c,
        x: startX + driftX * 0.4,
        y: startY - rise,
        angle: spin * 0.4,
        duration: upDur,
        delay: i * 24,
        ease: 'Quad.easeOut',
        onComplete: () => {
          // 2) 아래로 낙하(가속) — 화면 밖까지.
          this.tweens.add({
            targets: c,
            x: startX + driftX,
            y: H + 320,
            angle: spin,
            duration: upDur * 1.7,
            ease: 'Quad.easeIn',
            onComplete: () => {
              c.destroy();
              finish();
            },
          });
        },
      });
    }
  }

  // ── 미션 콤보/게이지/보상 ──────────────────────────────────────────
  /** 콤보 런 초기화 — 박스 5칸 비우기(완료 세트/게이지는 유지) + 멜로디 음을 다시 도(0)부터. */
  private resetComboRun(): void {
    this.comboColors = [];
    this.melodyStep = 0;
    this.updateMissionBox();
  }

  /**
   * 연속 매칭 멜로디 — 매칭할 때마다 장조 음계를 한 음씩 올려 울린다(미부터 시작: 미파솔라시도레미…).
   *   melodyStep 이 음 인덱스(콤보가 끊기면 resetComboRun 에서 0으로). WebAudio 오실레이터 2개로 "띵-똥" 이중음 합성.
   */
  private playMatchNote(): void {
    try {
      const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const Ctx = w.AudioContext ?? w.webkitAudioContext;
      if (!Ctx) return;
      if (!this.audioCtx) this.audioCtx = new Ctx();
      const ctx = this.audioCtx;
      if (ctx.state === 'suspended') void ctx.resume();
      // 장조 음계 반음 오프셋(도레미파솔라시) — 옥타브가 올라가며 계속 상승. 과도한 고음 방지로 3옥타브 상한.
      const MAJOR = [0, 2, 4, 5, 7, 9, 11];
      // 시작 음을 도(C)가 아닌 미(E, +4반음)로 올려 전체 멜로디를 장3도 위로 이조(더 밝게 시작).
      const BASE_SEMI = 4;
      const n = Math.min(this.melodyStep, 20);
      const semis = BASE_SEMI + 12 * Math.floor(n / 7) + MAJOR[n % 7];
      const freq = 261.63 * Math.pow(2, semis / 12); // C4 기준
      // "띵-똥" 이중음 — 짧은 어택 후 여운(서스테인)을 늘려 길게 울리는 한 음(tone)을 두 번 겹친다:
      //   띵 = 멜로디 음, 똥 = 완전4도 아래 음을 살짝 늦게(도어벨 느낌). 겹침 클리핑 방지로 피크는 낮춘다.
      const tone = (f: number, delay: number): void => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = f;
        const t = ctx.currentTime + delay;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.18, t + 0.014);
        gain.gain.exponentialRampToValueAtTime(0.09, t + 0.2); // 여운 유지
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.75);
      };
      tone(freq, 0); // 띵
      tone(freq * Math.pow(2, -5 / 12), 0.16); // 똥 — 완전4도 아래, 약간 뒤늦게
    } catch {
      /* 오디오 미지원/차단 시 무시 */
    }
  }

  /**
   * 매칭 성공 1건 기록 — 맞춘 카드 색을 박스 다음 칸에 채운다. 5칸이 다 차면 한 세트 완료(게이지 진행).
   *   콤보 카운트(box)는 씬 로컬 상태라, 와일드로 제거해도 콤보가 이어진다(엔진 combo 와 독립).
   */
  private pushMatch(suit: Suit): void {
    if (!this.chromeFromEditor) return;
    if (this.finished) return;
    // 연속 매칭 멜로디 — 한 음 올려 울리고 다음 음으로.
    this.playMatchNote();
    this.melodyStep++;
    this.comboColors.push(suit);
    this.updateMissionBox();
    if (this.comboColors.length >= SET_SIZE) this.completeSet();
  }

  /** 오른쪽 상단 박스 5칸 — 채워진 칸을 **맞춘 카드 색으로만** 표시(무늬 없음). 빈 칸은 에디터 점선칸 그대로. */
  private updateMissionBox(): void {
    const g = this.boxSlotsGfx;
    if (!g || !this.slotGeom.length) return;
    g.clear();
    this.slotGeom.forEach((s, i) => {
      if (i < this.comboColors.length) {
        g.fillStyle(Phaser.Display.Color.HexStringToColor(suitColor(this.comboColors[i])).color, 1);
        g.fillRoundedRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h, 8);
      }
    });
  }

  /**
   * 왼쪽 게이지 **채움만** 갱신 — setsCompleted / SETS_TARGET 비율. 별 3개는 항상 표시(에디터 골드 그대로)이고,
   * 채움 막대가 별 위치를 지나며 진행을 나타낸다(별을 회색→금으로 켜지 않는다).
   */
  private updateGauge(): void {
    const g = this.gaugeFill;
    if (!g || !this.gaugeGeom.width) return;
    g.clear();
    const p = Math.min(1, this.setsCompleted / SETS_TARGET);
    if (p > 0) {
      g.fillStyle(Phaser.Display.Color.HexStringToColor('#009dff').color, 1);
      const geo = this.gaugeGeom;
      g.fillRoundedRect(geo.left, geo.y - geo.h / 2, geo.width * p, geo.h, geo.h / 2);
    }
  }

  /**
   * 한 세트(5매칭) 완료 — 게이지 채움을 한 칸 올린다(진행 표시는 게이지만). 게임은 여기서 끝나지 않고,
   * **보드 전멸(모든 카드 매칭)** 시에만 종료된다(checkEnd). setsCompleted 는 레벨 클리어 시 별 등급이 된다.
   */
  private completeSet(): void {
    this.setsCompleted = Math.min(SETS_TARGET, this.setsCompleted + 1);
    this.updateGauge();
    sfx('set_complete'); // 5매칭 세트 완성 벨.
    if (this.setsCompleted >= SETS_TARGET) sfx('gauge_full'); // 게이지 만충.
    // 박스는 잠깐 가득 찬 상태를 보여준 뒤 비운다(다음 세트 준비).
    this.time.delayedCall(450, () => {
      this.comboColors = [];
      this.updateMissionBox();
    });
  }

  /**
   * 레벨 클리어 정산 — 게이지로 얻은 별 수(1~3)만큼 코인 지급 + 진행 레벨 +1, 승리 연출 후 보상 팝업.
   *   (게임 종료 = 보드 전멸뿐. 이 함수는 checkEnd 승리 분기에서만 호출된다.)
   */
  private finishMission(stars: number): void {
    if (this.finished) return;
    this.finished = true;
    this.ended = true;
    this.cancelWild();
    const s = Math.min(SETS_TARGET, Math.max(1, stars));
    const coins = STAR_COINS[s] ?? 0;
    const gotDiamonds = this.pendingDiamonds; // **승리 시에만** 보관 다이아 확정.
    const save = loadSave();
    save.coins += coins;
    save.diamonds = (save.diamonds ?? 0) + gotDiamonds; // 코인과 함께 다이아 확정.
    // 다음 레벨은 **저작된 마지막 레벨까지만** 해금(그 이상은 아직 없음).
    save.level = Math.min(this.editorLevels, Math.max(save.level, this.level + 1));
    writeSave(save);
    this.baseCoins += coins;
    this.pendingDiamonds = 0; // 확정 후 보관분 비움(중복 지급 방지).
    sfx('win_fanfare'); // 승리 카드 연출 팡파레.
    sfxWinSting(); // 정산 스팅 레이어.
    if (coins > 0) sfx('coin_burst', { volume: 0.25 }); // 코인 보상 쏟아짐(볼륨 하향).
    this.winScatter(() => this.showMissionReward(s, coins, gotDiamonds));
  }

  /**
   * 레벨 클리어 보상 팝업 — **크게 묘사**(잘했어요! · 별 3 · 큰 코인/다이아 값). 넥스트/홈을 누르면
   *   그 시점에 **코인·다이아가 상단 헤더로 빨려 들어가고**(suck) 이동한다.
   */
  private showMissionReward(stars: number, coins: number, diamonds: number): void {
    const layer = this.add.container(0, 0).setDepth(2000);
    layer.add(this.add.rectangle(0, 0, W, H, 0x0a0a1a, 0.82).setOrigin(0, 0).setInteractive());
    const cx = W / 2;
    // ── 별 3개(상단) — 획득만 골드, 나머지 흐림. 가운데가 약간 위로. ──
    for (let i = 0; i < SETS_TARGET; i++) {
      if (!this.textures.exists('up_Solitare_UI_02_v2')) break;
      const sx = cx + (i - 1) * 170;
      const sy = 470 + (i === 1 ? -46 : 0);
      const st = this.add.image(sx, sy, 'up_Solitare_UI_02_v2').setDisplaySize(150, 150);
      const got = i < stars;
      if (!got) st.setTint(0x555566).setAlpha(0.55);
      const tsx = st.scaleX;
      const tsy = st.scaleY;
      st.setScale(0);
      layer.add(st);
      this.tweens.add({ targets: st, scaleX: tsx, scaleY: tsy, duration: 340, delay: 200 + i * 200, ease: 'Back.easeOut' });
      if (got) this.time.delayedCall(200 + i * 200, () => sfxStar(i + 1));
    }
    // ── 제목 ──
    layer.add(this.add.text(cx, 760, '잘했어요!', { fontFamily: '"Jua", sans-serif', fontSize: '128px', color: '#ffd23f', stroke: '#a6510c', strokeThickness: 14 }).setOrigin(0.5).setShadow(0, 8, '#00000066', 12));

    // ── 큰 보상: 코인(좌) · 다이아(우) — 이미지1 스타일. ──
    const hasGem = diamonds > 0;
    const rewardY = 1160;
    const coinX = hasGem ? cx - 210 : cx;
    const coinIcon = this.add.image(coinX, rewardY, 'up_Solitare_UI_2_3');
    if (this.textures.exists('up_Solitare_UI_2_3')) {
      const cs = coinIcon.texture.getSourceImage() as { width: number; height: number };
      coinIcon.setDisplaySize(190, 190 * (cs.height / cs.width));
    }
    const coinNum = this.add.text(coinX, rewardY + 150, coins.toLocaleString(), { fontFamily: '"Jua", sans-serif', fontSize: '66px', color: '#ffffff', stroke: '#5a3210', strokeThickness: 9 }).setOrigin(0.5);
    layer.add(coinIcon);
    layer.add(coinNum);
    let gemIcon: Phaser.GameObjects.Image | undefined;
    if (hasGem && this.textures.exists('up_Solitare_UI_2_2')) {
      const gx = cx + 210;
      gemIcon = this.add.image(gx, rewardY, 'up_Solitare_UI_2_2');
      const gs = gemIcon.texture.getSourceImage() as { width: number; height: number };
      gemIcon.setDisplaySize(180, 180 * (gs.height / gs.width));
      layer.add(gemIcon);
      layer.add(this.add.text(gx, rewardY + 150, `${diamonds}`, { fontFamily: '"Jua", sans-serif', fontSize: '66px', color: '#ffffff', stroke: '#5a1a6a', strokeThickness: 9 }).setOrigin(0.5));
    }
    // 보상 아이콘 등장 팝.
    for (const o of [coinIcon, gemIcon].filter(Boolean) as Phaser.GameObjects.GameObject[]) {
      const g = o as Phaser.GameObjects.Image;
      const bsx = g.scaleX;
      const bsy = g.scaleY;
      g.setScale(0);
      this.tweens.add({ targets: g, scaleX: bsx, scaleY: bsy, duration: 360, delay: 700, ease: 'Back.easeOut' });
    }

    // ── 넥스트/홈 버튼 → **코인·다이아가 헤더로 빨려 들어간 뒤** 이동. ──
    const hasNext = this.level + 1 <= this.editorLevels;
    const go = (fn: () => void): void => {
      // **과장 회수** — ① 먼저 크게 부풀렸다가 ② 헤더로 빨려 들어감(작아지며 가속). 코인(좌)·다이아(우).
      const coinTarget = { x: 360, y: 90 };
      const gemTarget = this.header?.diamondAnchor ?? { x: W - 260, y: 90 };
      sfx('coin_burst', { volume: 0.35 });
      this.cameras.main.shake(160, 0.004); // 살짝 임팩트.
      // 코인: 팝(×1.7) → 빨림.
      this.tweens.add({
        targets: [coinIcon, coinNum],
        scaleX: '*=1.7',
        scaleY: '*=1.7',
        duration: 240,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.tweens.add({ targets: [coinIcon, coinNum], x: coinTarget.x, y: coinTarget.y, scaleX: '*=0.1', scaleY: '*=0.1', alpha: 0.05, duration: 520, ease: 'Cubic.easeIn' });
        },
      });
      if (gemIcon) {
        const g = gemIcon;
        this.tweens.add({
          targets: g,
          scaleX: '*=1.7',
          scaleY: '*=1.7',
          duration: 240,
          ease: 'Back.easeOut',
          onComplete: () => {
            this.tweens.add({ targets: g, x: gemTarget.x, y: gemTarget.y, scaleX: '*=0.12', scaleY: '*=0.12', alpha: 0.05, duration: 520, ease: 'Cubic.easeIn' });
          },
        });
      }
      this.time.delayedCall(840, fn); // 팝(240)+빨림(520)+여유 후 이동.
    };
    const btns: Array<{ key: string; on: () => void }> = [
      ...(hasNext ? [{ key: 'up_Solitare_UI_23_1', on: () => this.scene.start('play', { level: this.level + 1 }) }] : []),
      { key: 'up_Solitare_UI_23_2', on: () => this.scene.start('home') },
    ];
    let by = 1560;
    for (const b of btns) {
      layer.add(this.uiButton(W / 2, by, b.key, () => go(b.on), 440));
      by += 150;
    }
  }
}
