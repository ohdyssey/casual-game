/**
 * Stage1Scene — 레이드/공격 성공 시 **스테이지1 화면 → 룰렛 화면** 진행(요청 2026-06-27, 디자이너가 두 화면으로 분리).
 *
 * 흐름:
 *   ① 레이드 성공 → (망치/커튼 HammerFxScene 이 열리며) **스테이지1 화면**(ui/layouts/blank_3.json) 등장
 *      = 배경 + 집사 + 타이틀바("The Secret Grand Match") + 대문. (하단 다이얼로그 박스는 결과용이라 숨김.)
 *   ② 잠깐 보여준 뒤 **상단 타이틀바를 숨기고** → **룰렛 화면**(ui/layouts/blank_3_copy.json)을 띄운다.
 *   ③ SPIN 버튼 → 휠 회전(슬롯 회전음) → 강한 감속으로 경계를 느리게 넘으며 정지.
 *      ⚠️ 룰렛 화면은 **휠 이미지 + 세그먼트 값(별도 텍스트 노드) + 아이콘**으로 구성 → 이들을 **하나의 컨테이너로 묶어
 *         같이 회전**(실제 프라이즈 휠처럼 라벨이 휠과 함께 돈다). 세그먼트 순서/값은 logic/roulette.ts(SSOT)와 1:1.
 *   ④ 당첨 → 코인 드랍(CoinBurst 재사용) + 거대 폰트 카운트업.
 *   ⑤ 룰렛 화면 사라지고 → **스테이지1 의 하단 다이얼로그 박스**(결과 메시지 + OK/FB)가 등장 → OK → PlayScene 복귀(코인 가산).
 *
 * ⭐룰렛 구조는 앞으로 바뀔 수 있음 — 값/가중치/순서는 logic/roulette.ts 배열만 고치면 되고, 휠 라벨(룰렛 화면 텍스트 노드)도
 *   같은 순서로 맞춰두면 된다.
 */
import Phaser from 'phaser';
import { DESIGN_W, DESIGN_H } from './PlayScene.js';
import { buildLayout, type LayoutDoc, type LayoutEntry } from '../ui/layoutLoader.js';
import { cameraEnterZoom } from '../ui/cameraEnter.js';
import { uploadPath, ensureFonts, collectLayoutFonts } from '../assets.js';
import { STAGE_REVEALED_EVENT, ROULETTE_INCOMING_EVENT, ATTACK_DONE_EVENT, ATTACK_SWING_EVENT, ATTACK_SWING_DONE_EVENT } from './HammerFxScene.js';
import { Sfx, type SfxKey } from '../audio.js';
import { CoinBurst } from '../ui/coinBurst.js';
import { BigNumber } from '../ui/bigNumber.js';
import { SEGMENT_DEG, pickSegment, landingAngle, rouletteWin, type RouletteSegment } from '../logic/roulette.js';
import { segmentsNow } from '../logic/econOverrides.js';
import {
  type HotelState,
  createHotelState,
  deserializeHotel,
  objectLevel,
  parseHotelLayout,
  downgradeObject,
  currentStage,
  HOTEL_OBJECTS,
  HOTEL_SAVE_KEY,
  serializeHotel,
} from '../logic/hotelUpgrade.js';

/** 레이아웃 캐시 키 + 경로 — 스테이지1(blank_3) / 스테이지2(blank_3_copy3) / 룰렛1(blank_3_copy). */
export const STAGE_LAYOUT_KEY = 'stage1_layout';
export const STAGE_LAYOUT_PATH = 'ui/layouts/blank_3.json';
export const STAGE2_LAYOUT_KEY = 'stage2_layout';
export const STAGE2_LAYOUT_PATH = 'ui/layouts/blank_3_copy3.json';
export const ROULETTE_LAYOUT_KEY = 'roulette1_layout';
export const ROULETTE_LAYOUT_PATH = 'ui/layouts/blank_3_copy.json';

/** PlayScene 이 scene.launch 로 넘기는 데이터. */
export interface StageLaunchData {
  readonly type?: 'attack' | 'raid';
  readonly power?: number; // 레이드/공격 발동값(미사용 — 당첨금은 bet 기준)
  readonly bet?: number; // ⭐룰렛 스테이크(베이스) — **통화별**(2026-07-01): 레이드=코인(betCoin×M(L)×raidScale) / 어택=스핀(spinBet×attackScale). 당첨 = bet × 룰렛배수.
  readonly resumeKey?: string;
  readonly skipReveal?: boolean; // 커튼이 등장을 가리고 열어주는 경우 — 자체 찢기 reveal 생략
  readonly auto?: boolean; // ⭐오토스핀 중 — 룰렛도 자동(자동 SPIN → 자동 OK 복귀)
}

// ── 스테이지1(blank_3) 노드 식별 ──
/** 상단 타이틀바(리본 + 타이틀 텍스트) — 룰렛 진입 전 숨긴다. */
const STAGE_TITLE_IDS = new Set(['layer_3', 'layer_4']);
/** 하단 다이얼로그 박스(결과 메시지 + OK/FB) — 룰렛 당첨 뒤 등장(초기 숨김). */
const DIALOG_IDS = new Set(['layer_6', 'layer_7', 'layer_7_copy', 'layer_8', 'layer_9', 'layer_10']);
/** 결과 메시지 텍스트 노드 id. */
const MESSAGE_ID = 'layer_9';
/** OK/닫기(페이스북) 버튼 — **노드 ID**로 식별(키는 디자이너 재익스포트로 버전/번호가 바뀌어 깨짐: 2026-06-30 OK
 *  클릭불가 버그 = up_SC_UI_46→47·43→43_v2). layer_7=OK(우)·layer_7_copy=facebook(좌). ID 는 레이아웃 구조라 안정적. */
const CLOSE_BUTTON_IDS = new Set(['layer_7', 'layer_7_copy']);

// ── 룰렛1(blank_3_copy) 노드 식별 ──
const SPIN_BTN_PREFIX = 'up_SC_Roulette_04';
/** 휠 = 02 / 02_v4…(버전 견딤). ⚠️ 02-1(포인터)은 제외(`_` 로만 이어진 버전만). */
const isWheelKey = (k: string): boolean => k === 'up_SC_Roulette_02' || k.startsWith('up_SC_Roulette_02_');
/** **휠과 함께 회전하는 조각** = 휠 이미지 + 세그먼트 값 텍스트(전부) + 세그먼트 장식 아이콘(up_SC_Roulette_05-*). */
const isSpinnerNode = (n: { key?: string; type?: string }): boolean => {
  const k = n.key ?? '';
  return isWheelKey(k) || k.startsWith('up_SC_Roulette_05') || n.type === 'text';
};
/** 룰렛 화면 전체를 스테이지 위로 올리는 depth 오프셋(룰렛이 스테이지를 덮음). */
const ROULETTE_DEPTH_BASE = 100;
/** ⭐룰렛 팝업 뒤 반투명 딤 스크린 불투명도(요청: 룰렛을 팝업으로, 뒤엔 불투명 스크린). */
const ROULETTE_DIM_ALPHA = 0.6;
/** 레이드 결과 시 등장하는 매니저 캐릭터 텍스처 키 (D:\캐쥬얼 게임\SocialCasino\Stage\001\04.Casino\Manager_01.png). */
const RAID_MANAGER_KEY = 'up_Manager_01';

/** ⭐카지노 배경 이미지 키(스테이지 1-based 인덱스). 레이드 전용.
 *  파일 출처: D:\캐쥬얼 게임\SocialCasino\Stage\00N\04.Casino\Stage004_BG.png → public/ui/uploads/ 복사. */
const CASINO_BG_STAGE_KEYS: readonly string[] = [
  'up_Stage004_BG', // 스테이지 1 (Lobby)
  'up_Stage004_BG', // 스테이지 2 (Restaurant) — 새 이미지 추가 시 교체
];
/** 스테이지 번호(1-based) → 카지노 배경 텍스처 키. */
function casinoBgKey(stage: number): string {
  const idx = Math.max(0, Math.min(stage - 1, CASINO_BG_STAGE_KEYS.length - 1));
  return CASINO_BG_STAGE_KEYS[idx] ?? 'up_Stage004_BG';
}
/** 배경 노드 id(blank_3.json layer_1 = 인테리어 BG, 카지노 이미지로 교체). */
const STAGE_BG_NODE_ID = 'layer_1';
/** 레이드 화면에서 유지할 노드 id 집합 = 카지노 배경 + 타이틀바 + 결과 다이얼로그. 호텔 오브젝트·화살표는 스킵. */
const STAGE_RAID_KEEP = new Set([STAGE_BG_NODE_ID, ...STAGE_TITLE_IDS, ...DIALOG_IDS]);

// 타이밍/스핀.
const STAGE_INTRO_MS = 800; // 스테이지1 화면을 먼저 보여주는 시간(요청: 스테이지 먼저)
const ROULETTE_APPEAR_MS = 360; // 타이틀바 숨김 뒤 룰렛 등장까지
const STAGE_REVEAL_FALLBACK_MS = 1800; // 커튼 이벤트 미수신 방어(이벤트 없으면 그냥 시작)
const SPIN_MS = 2800; // 회전 시간(Quint.easeOut 경계 넘는 긴장 구간 유지)
const SPIN_EASE = 'Quint.easeOut';
const SPINS = 5; // 추가 회전 바퀴 수
const COUNT_MS = 800; // 당첨금 카운트업
// ⭐**대기 상태에서만** 회전중심 기준 아주 미세한 각도 wobble("회전할까 말까").
const WHEEL_WOBBLE_DEG = 0.7;
const WHEEL_WOBBLE_MS = 470;

export class Stage1Scene extends Phaser.Scene {
  private resumeKey = 'play';
  private done = false;
  private started = false; // 흐름 시작 중복 방지
  private spun = false; // 스핀 중복 방지
  private landed = false; // 착지(onLand) 중복 방지
  private auto = false; // ⭐오토스핀 — 룰렛 자동(자동 SPIN + 자동 OK)

  private type: 'attack' | 'raid' = 'attack';
  private power = 0;
  private lastWin = 0;
  private lastSeg?: RouletteSegment; // 착지 조각(메시지/연출 분기 — SUPER 강조)

  // 호텔 업그레이드 — 오브젝트를 현재 레벨로 표시(레이드/공격은 결과만, 버튼 없음).
  private hotelState: HotelState = createHotelState();

  // 스테이지1 화면.
  private stageContentObjs: Phaser.GameObjects.GameObject[] = []; // ⭐카메라 전진 진입 줌 대상(배경+집사+타이틀+대문, 다이얼로그/룰렛 제외)
  private titleBarObjs: Phaser.GameObjects.GameObject[] = [];
  private dialogEntries: LayoutEntry[] = [];
  private messageText?: Phaser.GameObjects.Text;
  private okButtons: Phaser.GameObjects.Image[] = [];

  // 룰렛1 화면.
  private rouletteFadeTargets: Phaser.GameObjects.GameObject[] = []; // 페이드 인/아웃 대상(컨테이너 + 정적 룰렛 노드)
  private wheelGroup?: Phaser.GameObjects.Container; // 휠 + 라벨 + 아이콘(함께 회전)
  private spinBtn?: Phaser.GameObjects.Image;
  private spinBtnBase = { sx: 1, sy: 1 };
  private dimScreen?: Phaser.GameObjects.Rectangle; // 룰렛 팝업 뒤 반투명 딤(스테이지 위·룰렛 아래)
  private raidManagerImg?: Phaser.GameObjects.Image; // 레이드 결과 등장 매니저 캐릭터

  // 공격 모드 전용: 슬롯별 레벨 오브젝트 + 배치 위치 + 타겟/별 오버레이.
  private attackLevelObjs: (Phaser.GameObjects.Image | undefined)[][] = [];
  private attackSlotCenters: { x: number; y: number }[] = []; // 오브젝트 중심(망치 타격 목표)
  private attackArrowObjs: (Phaser.GameObjects.Image | undefined)[] = []; // 업그레이드 화살표 Image(위치+displayHeight SSOT)
  private attackTargetIcons: Phaser.GameObjects.Image[] = [];
  private attackStarRows: Phaser.GameObjects.Image[][] = [];

  private sfx!: Sfx;
  private coinBurst!: CoinBurst;
  private spinLoop: Phaser.Sound.BaseSound | null = null;
  private readonly rng = () => Math.random();

  // 어텍 모드에서 사용할 스테이지 레이아웃 키/경로(임시 상대 스테이지에 따라 동적으로 결정).
  private stageLayoutKey = STAGE_LAYOUT_KEY;
  private stageLayoutPath = STAGE_LAYOUT_PATH;

  constructor() {
    super('stage1');
  }

  preload(): void {
    if (!this.cache.json.exists(STAGE_LAYOUT_KEY)) this.load.json(STAGE_LAYOUT_KEY, STAGE_LAYOUT_PATH);
    if (!this.cache.json.exists(STAGE2_LAYOUT_KEY)) this.load.json(STAGE2_LAYOUT_KEY, STAGE2_LAYOUT_PATH);
    if (!this.cache.json.exists(ROULETTE_LAYOUT_KEY)) this.load.json(ROULETTE_LAYOUT_KEY, ROULETTE_LAYOUT_PATH);
  }

  create(data: StageLaunchData): void {
    this.done = false;
    this.started = false;
    this.spun = false;
    this.landed = false;
    this.auto = data?.auto ?? false;
    this.lastWin = 0;
    this.lastSeg = undefined;
    this.resumeKey = data?.resumeKey ?? 'play';
    this.type = data?.type ?? 'attack';
    this.power = data?.bet ?? data?.power ?? 0; // ⭐당첨금 기준 = 코인 베팅. 없으면 power 폴백.
    this.scene.bringToTop();
    this.cameras.main.setBackgroundColor('#000000');
    this.sfx = new Sfx(this);
    this.coinBurst = new CoinBurst(this, 500);
    if (this.type === 'attack') {
      // 임시 상대 호텔: 로비(Stage1) / 레스토랑(Stage2) 중 임의 선택 + 각 슬롯 랜덤 레벨(1~5).
      // 실제 플레이어 공격 구현 시 여기서 실제 상대 데이터를 받아 쓴다.
      const opponentStage = this.rng() < 0.5 ? 1 : 2;
      const randomLevels = HOTEL_OBJECTS.map(() => Math.max(1, Math.ceil(this.rng() * 5)));
      this.hotelState = { stage: opponentStage, levels: randomLevels };
      this.stageLayoutKey = opponentStage === 2 ? STAGE2_LAYOUT_KEY : STAGE_LAYOUT_KEY;
      this.stageLayoutPath = opponentStage === 2 ? STAGE2_LAYOUT_PATH : STAGE_LAYOUT_PATH;
    } else {
      // 레이드: 플레이어 자신의 호텔 상태 로드
      this.hotelState = deserializeHotel(this.loadHotelRaw()) ?? createHotelState();
      this.stageLayoutKey = STAGE_LAYOUT_KEY;
      this.stageLayoutPath = STAGE_LAYOUT_PATH;
    }

    this.loadImagesAndMount(data, true); // allowReload=true: 캐시에 레이아웃 없으면 1회 강제 재로드 후 재시도
  }

  /** 레이아웃 노드 유효성(존재 + 노드 ≥1). */
  private static validDoc(d?: LayoutDoc): d is LayoutDoc {
    return !!d && Array.isArray(d.nodes) && d.nodes.length > 0;
  }

  /**
   * 스테이지/룰렛 레이아웃을 캐시에서 확보 → 이미지 적재 → mount.
   * ⚠️캐시에 없으면(스테일 SW·옛 빌드·로더 레이스) **폴백 즉시 X** → `allowReload` 면 캐시버스트 1회 강제 재로드 후 재시도,
   *   그래도 없을 때만 mountFallback → "STAGE 1 / TAP TO CONTINUE" 폴백이 환경 문제로 잘못 뜨는 것 방지.
   */
  private loadImagesAndMount(data: StageLaunchData, allowReload: boolean): void {
    const stageDoc = this.cache.json.get(this.stageLayoutKey) as LayoutDoc | undefined;
    const rouletteDoc = this.cache.json.get(ROULETTE_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!Stage1Scene.validDoc(stageDoc)) {
      if (allowReload) {
        this.reloadLayoutsThenRetry(data);
        return;
      }
      this.mountFallback();
      return;
    }
    // 두 레이아웃의 이미지 에셋을 한 번에 적재.
    let queued = 0;
    for (const doc of [stageDoc, rouletteDoc]) {
      if (!doc || !Array.isArray(doc.nodes)) continue;
      for (const n of doc.nodes) {
        if (n.type === 'image' && n.key && !this.textures.exists(n.key)) {
          this.load.image(n.key, uploadPath(n.key));
          queued++;
        }
      }
    }
    // ⭐카지노 배경 + 매니저 캐릭터 로드(레이드 전용).
    if (this.type === 'raid') {
      const casinoBg = casinoBgKey(currentStage(this.hotelState));
      if (!this.textures.exists(casinoBg)) {
        this.load.image(casinoBg, uploadPath(casinoBg));
        queued++;
      }
      if (!this.textures.exists(RAID_MANAGER_KEY)) {
        this.load.image(RAID_MANAGER_KEY, uploadPath(RAID_MANAGER_KEY));
        queued++;
      }
    }
    // ⭐공격 타겟/별 이미지 로드(공격 전용).
    if (this.type === 'attack') {
      for (const key of ['up_SC_UI_61_v3', 'up_SC_UI_59'] as const) {
        if (!this.textures.exists(key)) {
          this.load.image(key, uploadPath(key));
          queued++;
        }
      }
    }
    const startMount = (): void => void this.ensureFontsThenMount(stageDoc, rouletteDoc, data);
    if (queued > 0) {
      this.load.once(Phaser.Loader.Events.COMPLETE, startMount);
      this.load.start();
    } else {
      startMount();
    }
  }

  /** 레이아웃이 캐시에 없을 때 — 손상/빈 항목 제거 + **캐시버스트 재로드** 후 1회 재시도(allowReload=false 로 무한루프 방지). */
  private reloadLayoutsThenRetry(data: StageLaunchData): void {
    this.cache.json.remove(this.stageLayoutKey);
    this.cache.json.remove(ROULETTE_LAYOUT_KEY);
    const bust = `?reload=${Date.now()}`; // HTTP/엣지 캐시 우회(스테일 응답 회피)
    this.load.json(this.stageLayoutKey, this.stageLayoutPath + bust);
    this.load.json(ROULETTE_LAYOUT_KEY, ROULETTE_LAYOUT_PATH + bust);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (this.scene.isActive()) this.loadImagesAndMount(data, false);
    });
    this.load.start();
  }

  /** 레이아웃에 쓰인 폰트(에디터 지정)를 **렌더 전에 적재**한 뒤 mount — 폴백 폰트로 굳는 것 방지(에디터 폰트 그대로 표시). */
  private async ensureFontsThenMount(stageDoc: LayoutDoc, rouletteDoc: LayoutDoc | undefined, data: StageLaunchData): Promise<void> {
    try {
      await ensureFonts(collectLayoutFonts([stageDoc, rouletteDoc]));
    } catch {
      /* 폰트 실패 시 폴백으로 진행 */
    }
    if (this.scene.isActive()) this.mount(stageDoc, rouletteDoc, data);
  }

  /** 디자인(720×1600) → 캔버스(1080×2400) 좌표/스케일 보정. */
  private scaleEntries(entries: LayoutEntry[], doc: LayoutDoc): void {
    const sx = DESIGN_W / (doc.frame?.designW ?? 720);
    const sy = DESIGN_H / (doc.frame?.designH ?? 1600);
    for (const e of entries) {
      const o = e.obj as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;
      const t = o as unknown as { x: number; y: number; scaleX: number; scaleY: number; setPosition: (x: number, y: number) => void; setScale: (x: number, y: number) => void };
      t.setPosition(t.x * sx, t.y * sy);
      t.setScale(t.scaleX * sx, t.scaleY * sy);
    }
  }

  private applyHotelLevels(stageEntries: LayoutEntry[]): void {
    const layouts = parseHotelLayout(stageEntries.map((e) => e.node), currentStage(this.hotelState));
    const byId = new Map<string, Phaser.GameObjects.GameObject>(stageEntries.map((e) => [e.node.id, e.obj]));
    layouts.forEach((sl, i) => {
      const level = objectLevel(this.hotelState, i);
      sl.levelNodeIds.forEach((id, idx) => {
        const obj = id ? byId.get(id) : undefined;
        (obj as (Phaser.GameObjects.GameObject & { setVisible: (v: boolean) => unknown }) | undefined)?.setVisible(idx + 1 === level);
      });
      const arrow = sl.arrowNodeId ? byId.get(sl.arrowNodeId) : undefined;
      (arrow as (Phaser.GameObjects.GameObject & { setVisible: (v: boolean) => unknown }) | undefined)?.setVisible(false);
    });
  }

  /** 호텔 영속 상태 읽기(localStorage). */
  private loadHotelRaw(): string | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(HOTEL_SAVE_KEY) : null;
    } catch {
      return null;
    }
  }

  /** 스테이지1 + 룰렛1 을 모두 렌더 → 분류 → (룰렛 숨김) → 스테이지 드러나면 흐름 시작. */
  private mount(stageDoc: LayoutDoc, rouletteDoc: LayoutDoc | undefined, data: StageLaunchData): void {
    // ① 스테이지1 화면 렌더.
    let stageEntries: LayoutEntry[];
    if (this.type === 'raid') {
      // 레이드: 카지노 배경 + 결과 다이얼로그만 생성, 호텔 오브젝트·타이틀·화살표 스킵.
      const stageIndex = buildLayout(this, stageDoc, { skip: (n) => !STAGE_RAID_KEEP.has(n.id) });
      stageEntries = stageIndex.entries();
      this.scaleEntries(stageEntries, stageDoc);
      // 배경을 카지노 이미지로 교체(스테이지 레벨별).
      const bgKey = casinoBgKey(currentStage(this.hotelState));
      const bgEntry = stageEntries.find((e) => e.node.id === STAGE_BG_NODE_ID);
      const bgObj = bgEntry?.obj as Phaser.GameObjects.Image | undefined;
      if (bgObj && this.textures.exists(bgKey)) {
        bgObj.setTexture(bgKey).setDisplaySize(DESIGN_W, DESIGN_H).setOrigin(0.5, 0.5);
      }
      this.titleBarObjs = stageEntries.filter((e) => STAGE_TITLE_IDS.has(e.node.id)).map((e) => e.obj);
    } else {
      // 어텍: 호텔 오브젝트 전체 렌더, 현재 레벨 표시.
      const stageIndex = buildLayout(this, stageDoc);
      stageEntries = stageIndex.entries();
      this.scaleEntries(stageEntries, stageDoc);
      this.applyHotelLevels(stageEntries);
      this.titleBarObjs = stageEntries.filter((e) => STAGE_TITLE_IDS.has(e.node.id)).map((e) => e.obj);
      this.buildAttackSlots(stageEntries); // 공격 타겟 배치용 슬롯 데이터 수집
    }
    this.dialogEntries = stageEntries.filter((e) => DIALOG_IDS.has(e.node.id));
    const msgEntry = stageEntries.find((e) => e.node.id === MESSAGE_ID);
    this.messageText = msgEntry?.obj as Phaser.GameObjects.Text | undefined;
    // ⭐결과 메시지가 길면 **두 줄로 줄바꿈**(요청) — 디자이너 텍스트박스 폭(node.w, 디자인px) 기준 wordWrap + 가운데정렬.
    //   (텍스트는 scaleEntries 로 확대되므로 wrap 폭은 로컬=디자인 폭 그대로. 단어 경계 줄바꿈.)
    if (this.messageText) {
      const wrapW = msgEntry?.node.w && msgEntry.node.w > 0 ? msgEntry.node.w : 640;
      this.messageText.setWordWrapWidth(wrapW, false);
      this.messageText.setAlign('center');
      this.messageText.setOrigin(0.5, 0.5);
    }
    this.okButtons = stageEntries.filter((e) => CLOSE_BUTTON_IDS.has(e.node.id)).map((e) => e.obj as Phaser.GameObjects.Image);
    // ⭐카메라 전진 진입 줌 대상 = 스테이지 장면(배경+집사+대문). **리본 타이틀(STAGE_TITLE_IDS)·결과 다이얼로그·
    //   OK 버튼은 UI 로 취급해 제외(고정)**. 룰렛(별도 레이아웃)·딤 스크린도 stageEntries 에 없어 자동 제외 → 정상 스케일.
    this.stageContentObjs = stageEntries
      .filter((e) => !DIALOG_IDS.has(e.node.id) && !STAGE_TITLE_IDS.has(e.node.id)) // 다이얼로그(OK/facebook 포함)·타이틀 제외 → 장면만 줌
      .map((e) => e.obj);
    // 다이얼로그 박스는 결과용 → 초기 숨김(레이아웃은 visible:true 라 명시적으로 끈다).
    for (const e of this.dialogEntries) e.obj.setVisible(false);

    // ② 룰렛1 화면 렌더(스테이지 위 depth 오프셋, 초기 숨김). 공격 모드는 룰렛 없음.
    if (this.type !== 'attack' && rouletteDoc && Array.isArray(rouletteDoc.nodes) && rouletteDoc.nodes.length > 0) {
      const rIndex = buildLayout(this, rouletteDoc);
      const rEntries = rIndex.entries();
      this.scaleEntries(rEntries, rouletteDoc);
      for (const e of rEntries) (e.obj as unknown as { setDepth: (d: number) => void }).setDepth((e.node.depth ?? 0) + ROULETTE_DEPTH_BASE);

      const wheelEntry = rEntries.find((e) => isWheelKey(e.node.key ?? ''));
      (wheelEntry?.obj as Phaser.GameObjects.Image | undefined)?.setOrigin(0.5, 0.5);
      const spinnerEntries = rEntries.filter((e) => isSpinnerNode(e.node));
      const staticEntries = rEntries.filter((e) => !isSpinnerNode(e.node));
      this.spinBtn = rEntries.find((e) => (e.node.key ?? '').startsWith(SPIN_BTN_PREFIX))?.obj as Phaser.GameObjects.Image | undefined;

      // 휠 그룹(컨테이너)으로 묶어 함께 회전.
      if (wheelEntry) this.buildWheelGroup(wheelEntry, spinnerEntries);

      // ⭐룰렛을 **팝업**처럼 — 룰렛 노드(depth≥103)와 스테이지(depth≤17) **사이**에 반투명 딤(요청). 초기 숨김.
      //   룰렛엔 자체 전체배경이 없어(타이틀·휠·SPIN 만) 딤이 곧 "뒤배경 불투명 스크린" = 스테이지를 어둡게 깔고 룰렛만 떠 보인다.
      this.dimScreen = this.add
        .rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W * 1.2, DESIGN_H * 1.2, 0x000000, 1)
        .setDepth(ROULETTE_DEPTH_BASE - 1)
        .setAlpha(0);

      // 페이드 대상 = 휠 그룹 + 정적 룰렛 노드. 초기 알파 0(숨김).
      this.rouletteFadeTargets = [this.wheelGroup, ...staticEntries.map((e) => e.obj)].filter(Boolean) as Phaser.GameObjects.GameObject[];
      for (const t of this.rouletteFadeTargets) (t as unknown as { setAlpha: (a: number) => void }).setAlpha(0);
    }

    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__stage = this;

    // 스테이지가 드러나면(커튼 열림) 흐름 시작. 커튼 없으면(skipReveal X) 자체 reveal 후 시작.
    if (data.skipReveal) {
      const onRevealed = () => this.beginStage();
      this.game.events.once(STAGE_REVEALED_EVENT, onRevealed);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.game.events.off(STAGE_REVEALED_EVENT, onRevealed);
        this.sfx.fadeStop(this.spinLoop, 80);
      });
      this.time.delayedCall(STAGE_REVEAL_FALLBACK_MS, () => this.beginStage()); // 방어
    } else {
      this.revealSplit();
      this.time.delayedCall(380, () => this.beginStage());
    }
  }

  /** 휠 + 세그먼트 라벨 + 아이콘을 휠 중심 컨테이너로 reparent(local 좌표 보정) → 컨테이너 회전 = 디스크 전체 회전. */
  private buildWheelGroup(wheelEntry: LayoutEntry, spinnerEntries: LayoutEntry[]): void {
    const wheelObj = wheelEntry.obj as unknown as { x: number; y: number };
    const cx = wheelObj.x;
    const cy = wheelObj.y;
    const cont = this.add.container(cx, cy).setDepth((wheelEntry.node.depth ?? 4) + ROULETTE_DEPTH_BASE);
    // depth 오름차순(휠 바닥 → 라벨/아이콘 위)으로 컨테이너에 추가.
    const sorted = [...spinnerEntries].sort((a, b) => (a.node.depth ?? 0) - (b.node.depth ?? 0));
    for (const e of sorted) {
      const o = e.obj as unknown as { x: number; y: number; setPosition: (x: number, y: number) => void };
      const lx = o.x - cx;
      const ly = o.y - cy;
      cont.add(e.obj);
      o.setPosition(lx, ly);
    }
    this.wheelGroup = cont;
  }

  /** 스테이지1 화면을 먼저 보여준 뒤 → 공격 타겟 배치 OR 룰렛 등장. */
  private beginStage(): void {
    if (this.started) return;
    this.started = true;
    cameraEnterZoom(this, this.stageContentObjs, { centerX: DESIGN_W / 2, centerY: DESIGN_H / 2 });
    if (this.type === 'attack') {
      // 공격: 룰렛 없음 — 타겟 아이콘·별 표시.
      this.afterDelay(STAGE_INTRO_MS, () => this.mountAttackTargets());
      return;
    }
    this.afterDelay(STAGE_INTRO_MS, () => {
      this.hideTitleBar();
      // 레이드 전용: HammerFxScene 아이콘 페이드아웃 트리거 → 룰렛 등장 직전까지 아이콘 표시 후 소멸.
      this.game.events.emit(ROULETTE_INCOMING_EVENT);
      this.afterDelay(ROULETTE_APPEAR_MS, () => this.showRoulette());
    });
  }

  /** 상단 타이틀바 페이드아웃(숨김) — 룰렛 진입 전. */
  private hideTitleBar(): void {
    for (const o of this.titleBarObjs) {
      this.tweens.add({ targets: o, alpha: 0, duration: 280, onComplete: () => (o as unknown as { setVisible: (v: boolean) => void }).setVisible(false) });
    }
  }

  // ── 공격 모드 전용 ──

  /** 스테이지 레이아웃 엔트리에서 슬롯별 레벨 오브젝트 + 중심 + 화살표 Image 를 수집. */
  private buildAttackSlots(entries: LayoutEntry[]): void {
    const layouts = parseHotelLayout(entries.map((e) => e.node), currentStage(this.hotelState));
    const byId = new Map<string, Phaser.GameObjects.GameObject>(entries.map((e) => [e.node.id, e.obj]));
    this.attackLevelObjs = [];
    this.attackSlotCenters = [];
    this.attackArrowObjs = [];
    for (let i = 0; i < layouts.length; i++) {
      const sl = layouts[i];
      const level = objectLevel(this.hotelState, i);
      const levelObjs = sl.levelNodeIds.map((id) => (id ? byId.get(id) : undefined) as Phaser.GameObjects.Image | undefined);
      this.attackLevelObjs.push(levelObjs);
      const curObj = levelObjs[level - 1];
      const cx = curObj?.x ?? DESIGN_W / 2;
      const cy = curObj?.y ?? 300 + i * 420;
      this.attackSlotCenters.push({ x: cx, y: cy });
      const arrowImg = (sl.arrowNodeId ? byId.get(sl.arrowNodeId) : undefined) as Phaser.GameObjects.Image | undefined;
      this.attackArrowObjs.push(arrowImg);
    }
  }

  /** 각 호텔 오브젝트에 타겟 아이콘(SC_UI_61) + 별(SC_UI_59) 배치 — HotelScene refreshSlot 과 동일한 위치/크기 공식. */
  private mountAttackTargets(): void {
    this.attackTargetIcons = [];
    this.attackStarRows = [];
    const TARGET_SIZE = 96;

    for (let i = 0; i < this.attackArrowObjs.length; i++) {
      const arrow = this.attackArrowObjs[i];
      const level = objectLevel(this.hotelState, i);
      const ax = arrow?.x ?? (this.attackSlotCenters[i]?.x ?? DESIGN_W / 2);
      const ay = arrow?.y ?? (this.attackSlotCenters[i]?.y ?? DESIGN_H / 2);

      // ① 타겟 아이콘: 업그레이드 화살표 정확한 위치 — 원본 비율 유지, 화살표 높이에 맞게 비례 축소
      if (this.textures.exists('up_SC_UI_61_v3')) {
        const icon = this.add
          .image(ax, ay, 'up_SC_UI_61_v3')
          .setDepth(50)
          .setAlpha(0)
          .setInteractive({ useHandCursor: true });
        const iconTargetH = arrow?.displayHeight ?? TARGET_SIZE;
        icon.setScale(iconTargetH / Math.max(icon.height, 1));
        this.tweens.add({ targets: icon, alpha: 1, duration: 300, delay: i * 60, ease: 'Quad.easeOut' });
        icon.once('pointerdown', () => this.onTargetHit(i));
        this.attackTargetIcons.push(icon);
      }

      // ② 별 — HotelScene refreshSlot 공식(arrowBot 기준, 레벨별 크기)
      const filled = Math.min(level, 5);
      const starPx = ([60, 54, 48, 42, 36] as const)[filled - 1] ?? 36;
      const gap = 5;
      const totalW = filled * starPx + Math.max(0, filled - 1) * gap;
      const arrowDispH = arrow?.displayHeight ?? TARGET_SIZE;
      const arrowBot = ay + arrowDispH * 0.5;
      const startX = ax - totalW / 2 + starPx / 2;
      const starCY = arrowBot + 12 + starPx / 2;
      const stars: Phaser.GameObjects.Image[] = [];
      for (let k = 0; k < filled; k++) {
        const sx = startX + k * (starPx + gap);
        const star = this.add
          .image(sx, starCY, 'up_SC_UI_59')
          .setDisplaySize(starPx, starPx)
          .setDepth(51)
          .setAlpha(0);
        this.tweens.add({ targets: star, alpha: 1, duration: 280, delay: i * 60 + k * 40 });
        stars.push(star);
      }
      this.attackStarRows.push(stars);
    }
  }

  /** 타겟 탭됨 — 모든 타겟 비활성화 → ATTACK_SWING_EVENT 발행(망치 스윙) → 임팩트 콜백 → executeDowngrade. */
  private onTargetHit(slotIndex: number): void {
    for (const icon of this.attackTargetIcons) {
      icon.disableInteractive();
      this.tweens.add({ targets: icon, alpha: 0, duration: 200 });
    }
    // 망치 스윙 완료 시 다운그레이드 실행
    const { x: tx, y: ty } = this.attackSlotCenters[slotIndex];
    this.game.events.once(ATTACK_SWING_DONE_EVENT, () => this.executeDowngrade(slotIndex));
    this.game.events.emit(ATTACK_SWING_EVENT, tx, ty);
  }

  /** 오브젝트를 좌우로 흔드는 연출. */
  private shakeObj(obj: Phaser.GameObjects.Image): void {
    const ox = obj.x;
    this.tweens.add({
      targets: obj,
      x: ox + 10,
      duration: 60,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => obj.setX(ox),
    });
  }

  /** 다운그레이드 실행 — 임팩트 이펙트 → 별 사라짐 → 이미지 전환 + 흔들림 → 결과 다이얼로그. */
  private executeDowngrade(slotIndex: number): void {
    const prevLevel = objectLevel(this.hotelState, slotIndex);
    const newState = downgradeObject(this.hotelState, slotIndex);
    this.hotelState = newState;
    try {
      // 어텍 모드의 호텔 상태는 임시 상대 데이터 — 로컬에 저장하지 않는다.
      if (this.type !== 'attack' && typeof localStorage !== 'undefined') localStorage.setItem(HOTEL_SAVE_KEY, serializeHotel(newState));
    } catch { /* ignore */ }
    const newLevel = objectLevel(newState, slotIndex);

    // 오브젝트별 공격 효과음(슬롯 인덱스 0~4 → 각기 다른 사운드)
    const OBJ_SFX: SfxKey[] = ['attackObject0', 'attackObject1', 'attackObject2', 'attackObject3', 'attackObject4'];
    const hitSfx = OBJ_SFX[slotIndex];
    if (hitSfx) this.sfx.play(hitSfx, 0.85);

    const prevObj = this.attackLevelObjs[slotIndex]?.[prevLevel - 1];
    if (prevObj) {
      // 빨간 틴트 플래시
      prevObj.setTint(0xff6644);
      this.time.delayedCall(240, () => (this.attackLevelObjs[slotIndex]?.[prevLevel - 1] as Phaser.GameObjects.Image | undefined)?.clearTint());
      // 카메라 플래시(쿵 연출)
      this.cameras.main.flash(70, 255, 220, 100);
      // 임팩트 링 — 오브젝트 위치에서 확산
      const ring = this.add.graphics().setDepth(60);
      ring.lineStyle(7, 0xffcc33, 1);
      ring.strokeCircle(prevObj.x, prevObj.y, 28);
      this.tweens.add({ targets: ring, scaleX: 4, scaleY: 4, alpha: 0, duration: 400, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
      // 임팩트 스파크 6방향
      for (let s = 0; s < 6; s++) {
        const angle = (s / 6) * Math.PI * 2;
        const spark = this.add.graphics().setDepth(60);
        spark.fillStyle(0xffee44, 1);
        spark.fillCircle(0, 0, 6);
        spark.setPosition(prevObj.x, prevObj.y);
        this.tweens.add({ targets: spark, x: prevObj.x + Math.cos(angle) * 80, y: prevObj.y + Math.sin(angle) * 80, alpha: 0, scaleX: 0.2, scaleY: 0.2, duration: 400, ease: 'Quad.easeOut', onComplete: () => spark.destroy() });
      }
    }

    // 별 하나 커졌다가 사라짐 → 이미지 교체 + 다운그레이드된 오브젝트 흔들림
    this.flyStarAway(slotIndex, () => {
      if (prevObj) prevObj.setVisible(false);
      const nextObj = this.attackLevelObjs[slotIndex]?.[newLevel - 1];
      if (nextObj) {
        nextObj.setAlpha(0);
        nextObj.setVisible(true);
        this.tweens.add({ targets: nextObj, alpha: 1, duration: 280 });
        this.shakeObj(nextObj);
      }
      this.redrawStars(slotIndex, newLevel);
      this.afterDelay(500, () => this.showAttackResult(slotIndex, newLevel));
    });
  }

  /** 마지막 별이 커졌다가 사라지는 연출 → 나머지 별 제거 → 콜백. */
  private flyStarAway(slotIndex: number, onComplete: () => void): void {
    const stars = this.attackStarRows[slotIndex];
    if (!stars || stars.length === 0) { onComplete(); return; }
    this.sfx.play('attackStar', 0.8);
    const last = stars[stars.length - 1];
    this.tweens.add({
      targets: last,
      scaleX: 2.8,
      scaleY: 2.8,
      alpha: 0,
      duration: 400,
      ease: 'Quad.easeOut',
      onComplete: () => {
        for (const s of stars) { if (s.active) s.destroy(); }
        this.attackStarRows[slotIndex] = [];
        onComplete();
      },
    });
  }

  /** 슬롯의 별을 새 레벨 수로 다시 그린다 — HotelScene refreshSlot 과 동일한 공식. */
  private redrawStars(slotIndex: number, level: number): void {
    for (const s of this.attackStarRows[slotIndex] ?? []) { if (s.active) s.destroy(); }
    const arrow = this.attackArrowObjs[slotIndex];
    const ax = arrow?.x ?? (this.attackSlotCenters[slotIndex]?.x ?? DESIGN_W / 2);
    const ay = arrow?.y ?? (this.attackSlotCenters[slotIndex]?.y ?? DESIGN_H / 2);
    const arrowDispH = arrow?.displayHeight ?? 96;
    const filled = Math.min(level, 5);
    const starPx = ([60, 54, 48, 42, 36] as const)[filled - 1] ?? 36;
    const gap = 5;
    const totalW = filled * starPx + Math.max(0, filled - 1) * gap;
    const arrowBot = ay + arrowDispH * 0.5;
    const startX = ax - totalW / 2 + starPx / 2;
    const starCY = arrowBot + 12 + starPx / 2;
    const newStars: Phaser.GameObjects.Image[] = [];
    for (let k = 0; k < filled; k++) {
      const sx = startX + k * (starPx + gap);
      const s = this.add.image(sx, starCY, 'up_SC_UI_59').setDisplaySize(starPx, starPx).setDepth(51).setAlpha(0);
      this.tweens.add({ targets: s, alpha: 1, duration: 250 });
      newStars.push(s);
    }
    this.attackStarRows[slotIndex] = newStars;
  }

  /** 공격 결과 다이얼로그 표시. */
  private showAttackResult(slotIndex: number, newLevel: number): void {
    this.sfx.play('attackSuccess', 0.8);
    const objName = HOTEL_OBJECTS[slotIndex]?.name ?? 'Object';
    this.messageText?.setText(`${objName} downgraded to Level ${newLevel}!`);
    this.showTitleBar();
    this.afterDelay(220, () => {
      for (const e of this.dialogEntries) {
        const o = e.obj as unknown as { setVisible: (v: boolean) => void; setAlpha: (a: number) => void };
        o.setVisible(true);
        o.setAlpha(0);
        this.tweens.add({ targets: e.obj, alpha: 1, duration: 320, ease: 'Quad.easeOut' });
      }
      for (const btn of this.okButtons) this.wireClose(btn);
    });
  }

  /** ⭐상단 리본 타이틀바 페이드인(복귀) — 결과 다이얼로그와 함께 표시(요청: 결과 시 타이틀이 사라지지 않게). */
  private showTitleBar(): void {
    for (const o of this.titleBarObjs) {
      const t = o as unknown as { setVisible: (v: boolean) => void; setAlpha: (a: number) => void };
      t.setVisible(true);
      t.setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, duration: 320, ease: 'Quad.easeOut' });
    }
  }

  /** 트윈 카운터 기반 지연(오버레이 씬에서 time.delayedCall 보다 안정적). */
  private afterDelay(ms: number, cb: () => void): void {
    this.tweens.addCounter({ from: 0, to: 1, duration: Math.max(0, ms), onComplete: cb });
  }

  /** 룰렛 화면 페이드 등장(딤 배경 + 휠/타이틀/SPIN 팝업) + 휠 그룹 팝 + 대기 wobble + SPIN 버튼 활성. */
  private showRoulette(): void {
    // ⭐먼저 뒤 딤 스크린을 깔아 팝업 느낌(스테이지를 어둡게).
    if (this.dimScreen) this.tweens.add({ targets: this.dimScreen, alpha: ROULETTE_DIM_ALPHA, duration: 260, ease: 'Quad.easeOut' });
    for (const t of this.rouletteFadeTargets) {
      this.tweens.add({ targets: t, alpha: 1, duration: 260, ease: 'Quad.easeOut' });
    }
    if (this.wheelGroup) {
      this.wheelGroup.setScale(0.82);
      this.tweens.add({ targets: this.wheelGroup, scaleX: 1, scaleY: 1, duration: 280, ease: 'Back.easeOut' });
      // 대기 상태에서만 회전중심 미세 wobble. 스핀 시작 시 killTweensOf 로 정지 + 각도 0.
      this.tweens.add({ targets: this.wheelGroup, angle: { from: -WHEEL_WOBBLE_DEG, to: WHEEL_WOBBLE_DEG }, duration: WHEEL_WOBBLE_MS, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    const btn = this.spinBtn;
    if (btn) {
      this.spinBtnBase = { sx: btn.scaleX, sy: btn.scaleY };
      btn.setInteractive({ useHandCursor: true });
      btn.once('pointerdown', () => this.pressSpin());
      this.tweens.add({ targets: btn, scaleX: this.spinBtnBase.sx * 1.06, scaleY: this.spinBtnBase.sy * 1.06, duration: 560, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    // ⭐오토스핀 중이면 잠깐 보여준 뒤 **자동으로 SPIN** 누름(요청).
    if (this.auto) this.afterDelay(900, () => this.pressSpin());
  }

  /** ⭐SPIN 버튼 눌림 표현 — 깊게 축소 + 어둡게 → 탁 복귀(오버슈트) → 회전 시작. */
  private pressSpin(): void {
    const btn = this.spinBtn;
    if (!btn) {
      this.spinWheel();
      return;
    }
    this.tweens.killTweensOf(btn);
    const { sx, sy } = this.spinBtnBase;
    btn.setScale(sx, sy).setTint(0xb4b4b4);
    this.sfx.play('spinButton', 0.6);
    this.tweens.add({
      targets: btn,
      scaleX: sx * 0.83,
      scaleY: sy * 0.83,
      duration: 90,
      ease: 'Quad.easeOut',
      onComplete: () => {
        btn.clearTint();
        this.tweens.add({ targets: btn, scaleX: sx, scaleY: sy, duration: 120, ease: 'Back.easeOut', onComplete: () => this.spinWheel() });
      },
    });
  }

  /** SPIN → 휠 그룹 회전(슬롯 회전음) → 강한 감속 후 경계를 느리게 넘으며 정지. */
  private spinWheel(): void {
    if (this.spun || !this.wheelGroup) return;
    this.spun = true;
    // 대기 wobble 정지 + 각도 0 리셋(회전은 0 부터). killTweensOf 로 angle 충돌 방지.
    this.tweens.killTweensOf(this.wheelGroup);
    this.wheelGroup.setAngle(0);
    const btn = this.spinBtn;
    if (btn) {
      btn.disableInteractive();
      this.tweens.add({ targets: btn, alpha: 0.5, duration: 220 });
    }
    this.spinLoop = this.sfx.loopStart('reelLoop', 0.18);

    const i = pickSegment(this.rng);
    const seg = segmentsNow()[i]; // 배수 오버라이드(데이터 편집) 반영 — 라벨/순서/가중치는 SSOT
    // 경계 긴장: 중심에서 살짝 치우쳐 착지 → 강한 감속으로 마지막에 경계를 느리게 넘으며 안착.
    const finalAngle = landingAngle(i, SPINS, -(SEGMENT_DEG * 0.3));
    // 단일 트윈(시작각 0 1회만 읽음 → 2번 도는 버그 없음). 컨테이너 회전중심(휠 중심)으로 디스크 전체 회전.
    this.tweens.add({
      targets: this.wheelGroup,
      angle: finalAngle,
      duration: SPIN_MS,
      ease: SPIN_EASE,
      onComplete: () => this.onLand(seg),
    });
  }

  /** 착지 — 정지음 + 당첨금 산정 + 코인 드랍 + 거대 폰트 카운트업 → 잠시 뒤 결과 다이얼로그. */
  private onLand(seg: RouletteSegment): void {
    if (this.landed) return;
    this.landed = true;
    this.lastSeg = seg;
    const win = rouletteWin(this.power, seg);
    this.lastWin = win;
    // ⭐ 연출은 실패해도 결과/복귀를 막지 않도록 try-catch 격리.
    try {
      this.sfx.fadeStop(this.spinLoop, 200);
      this.sfx.play('reelStopFinal', 0.6);
      const wx = this.wheelGroup?.x ?? DESIGN_W / 2;
      const wy = this.wheelGroup?.y ?? DESIGN_H / 2;
      this.coinBurst.burstRowScaled(wx - 240, wx + 240, wy, win, Math.max(1, this.power), () => this.sfx.play('coin', 0.4));
      this.sfx.play(seg.isSuper || win >= this.power * 8 ? 'winBig' : 'winMedium', 0.85);
      this.countUpWin(win, wx, wy);
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[stage1] onLand visuals failed', e);
    }
    this.afterDelay(COUNT_MS + 650, () => this.showResult(win));
  }

  /** 거대 당첨금 폰트(BigNumber) 0→win 카운트업 → 떠오르며 페이드. ⭐숫자가 화면 좌우를 넘으면 자동 축소. */
  private countUpWin(win: number, x: number, y: number): void {
    const num = new BigNumber(this, x, y - 30, 150, 600);
    num.setValue(win);
    const maxW = DESIGN_W - 80;
    const w = num.container.getBounds().width;
    const fit = w > maxW ? maxW / w : 1;
    num.setValue(0);
    num.container.setDepth(ROULETTE_DEPTH_BASE + 60); // 룰렛 위로
    const counter = { v: 0 };
    this.tweens.add({ targets: counter, v: win, duration: COUNT_MS, ease: 'Cubic.easeOut', onUpdate: () => num.setValue(counter.v) });
    num.container.setScale(fit * 0.6);
    this.tweens.add({ targets: num.container, scaleX: fit, scaleY: fit, duration: 360, ease: 'Back.easeOut' });
    this.tweens.add({ targets: num.container, y: y - 110, alpha: 0, delay: COUNT_MS + 650, duration: 520, ease: 'Quad.easeIn', onComplete: () => num.container.destroy() });
  }

  /** 룰렛 팝업 페이드아웃(+ 뒤 딤 제거) → **상단 리본 타이틀 복귀** + **스테이지1 하단 다이얼로그 박스**(결과 메시지 + OK) 등장. */
  private showResult(win: number): void {
    // ⭐룰렛 팝업 닫힘 — 뒤 딤 스크린 제거(스테이지 밝아짐) + 상단 리본 타이틀 복귀(요청: 결과 다이얼로그 시 타이틀 표시).
    if (this.dimScreen) this.tweens.add({ targets: this.dimScreen, alpha: 0, duration: 300, onComplete: () => this.dimScreen?.setVisible(false) });
    this.showTitleBar();
    // ⭐레이드 결과: 매니저 캐릭터를 화면 중앙에 페이드+스케일인으로 등장.
    if (this.type === 'raid' && this.textures.exists(RAID_MANAGER_KEY)) {
      if (this.raidManagerImg) { this.raidManagerImg.destroy(); }
      const mgr = this.add
        .image(DESIGN_W / 2, DESIGN_H - 500, RAID_MANAGER_KEY)
        .setOrigin(0.5, 1.0)
        .setDepth(2)
        .setAlpha(0)
        .setScale(0.85);
      this.raidManagerImg = mgr;
      this.tweens.add({
        targets: mgr,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: 450,
        ease: 'Back.easeOut',
      });
    }
    for (const t of this.rouletteFadeTargets) {
      this.tweens.add({ targets: t, alpha: 0, duration: 300, onComplete: () => (t as unknown as { setVisible: (v: boolean) => void }).setVisible(false) });
    }
    const amt = Math.round(win).toLocaleString('en-US');
    // ⭐어택 = 스핀 보상, 레이드 = 코인 보상(요청 2026-07-01) → 결과 문구의 통화도 분기.
    const base = this.type === 'attack' ? `You attacked for ${amt} spins!` : `You stole ${amt} coins!`;
    this.messageText?.setText(this.lastSeg?.isSuper ? `🎉 SUPER BONUS! ${base}` : base);
    // 룰렛이 거의 사라진 뒤 다이얼로그 등장(겹침 최소화).
    this.afterDelay(220, () => {
      for (const e of this.dialogEntries) {
        const o = e.obj as unknown as { setVisible: (v: boolean) => void; setAlpha: (a: number) => void };
        o.setVisible(true);
        o.setAlpha(0);
        this.tweens.add({ targets: e.obj, alpha: 1, duration: 320, ease: 'Quad.easeOut' });
      }
      for (const btn of this.okButtons) this.wireClose(btn);
      // ⭐오토스핀 중이면 결과를 잠깐 보여준 뒤 **자동으로 OK**(게임 복귀, 요청).
      if (this.auto) this.afterDelay(1300, () => this.finish());
    });
  }

  /** 화면을 안쪽부터 찢어지듯 열며 등장(커튼 미사용 폴백). */
  private revealSplit(): void {
    const maskG = this.make.graphics();
    const cx = DESIGN_W / 2;
    const teeth = 20;
    const stepY = DESIGN_H / teeth;
    const draw = (p: number): void => {
      maskG.clear();
      maskG.fillStyle(0xffffff);
      const halfW = cx * p;
      const amp = Math.min(halfW * 0.7, 46 * (1 - p));
      const pts: Phaser.Types.Math.Vector2Like[] = [];
      for (let i = 0; i <= teeth; i++) pts.push({ x: cx - halfW + (i % 2 ? amp : -amp), y: i * stepY });
      for (let i = teeth; i >= 0; i--) pts.push({ x: cx + halfW + (i % 2 ? -amp : amp), y: i * stepY });
      maskG.fillPoints(pts, true);
    };
    draw(0.001);
    this.cameras.main.setMask(maskG.createGeometryMask());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => maskG.destroy());
    const prog = { v: 0.001 };
    this.tweens.add({
      targets: prog,
      v: 1,
      duration: 360,
      ease: 'Cubic.easeOut',
      onUpdate: () => draw(prog.v),
      onComplete: () => {
        this.cameras.main.clearMask();
        maskG.destroy();
      },
    });
  }

  /** 버튼(OK/페이스북) → 누름 피드백 후 닫고 게임 재개. */
  private wireClose(btn: Phaser.GameObjects.Image): void {
    btn.setInteractive({ useHandCursor: true });
    const sx = btn.scaleX;
    const sy = btn.scaleY;
    btn.on('pointerdown', () => {
      this.tweens.add({ targets: btn, scaleX: sx * 0.9, scaleY: sy * 0.9, duration: 80, yoyo: true, ease: 'Quad.easeOut' });
      this.finish();
    });
  }

  /** 스테이지 닫기 → 당첨금을 PlayScene 에 **직접 가산** → 재개 + 종료. */
  finish(): void {
    if (this.done) return;
    this.done = true;
    // ⭐핸드오프(복귀)를 가장 먼저 — 이후 사운드 정리에서 예외가 나도 복귀가 막히지 않게. RESUME/레지스트리 의존 제거.
    try {
      const play = this.game.scene.getScene(this.resumeKey) as unknown as {
        awardRaidWin?: (n: number) => void;
        awardAttackSpins?: (n: number) => void;
        returnFromStage?: () => void;
      } | null;
      // 어택: ATTACK_DONE_EVENT → HammerFxScene 망치 페이드아웃. 코인/스핀 보상 없음(다운그레이드가 효과).
      // 레이드: 룰렛 당첨 코인 가산.
      if (this.type === 'attack') {
        this.game.events.emit(ATTACK_DONE_EVENT);
        play?.awardAttackSpins?.(0);
      } else {
        play?.awardRaidWin?.(Math.round(this.lastWin));
      }
      play?.returnFromStage?.();
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[stage1] finish handoff failed', e);
    }
    this.game.scene.resume(this.resumeKey);
    try {
      this.sfx.fadeStop(this.spinLoop, 100);
    } catch {
      /* ignore */
    }
    this.spinLoop = null;
    this.game.scene.stop(this.scene.key);
  }

  /** 레이아웃 누락 시 — 검은 배경 + 안내 + 아무 데나 탭하면 복귀. */
  private mountFallback(): void {
    this.add.rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H, 0x101030).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.finish());
    this.add
      .text(DESIGN_W / 2, DESIGN_H / 2, 'STAGE 1\n\nTAP TO CONTINUE', { fontFamily: '"Do Hyeon", "Jua", sans-serif', fontSize: '56px', color: '#ffffff', align: 'center' })
      .setOrigin(0.5);
    this.cameras.main.fadeIn(220, 0, 0, 0);
  }
}
