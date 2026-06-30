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
import { STAGE_REVEALED_EVENT } from './HammerFxScene.js';
import { Sfx } from '../audio.js';
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
  HOTEL_SAVE_KEY,
} from '../logic/hotelUpgrade.js';

/** 레이아웃 캐시 키 + 경로 — 스테이지1(blank_3) / 룰렛1(blank_3_copy). */
export const STAGE_LAYOUT_KEY = 'stage1_layout';
export const STAGE_LAYOUT_PATH = 'ui/layouts/blank_3.json';
export const ROULETTE_LAYOUT_KEY = 'roulette1_layout';
export const ROULETTE_LAYOUT_PATH = 'ui/layouts/blank_3_copy.json';

/** PlayScene 이 scene.launch 로 넘기는 데이터. */
export interface StageLaunchData {
  readonly type?: 'attack' | 'raid';
  readonly power?: number; // 레이드/공격 발동값(미사용 — 당첨금은 bet 기준)
  readonly bet?: number; // ⭐코인 베팅(=spinBet×COIN_DENOM=베팅액수×천배, 2026-06-28 만배→천배). 당첨금 = bet × 룰렛배수 + 보너스.
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

  private sfx!: Sfx;
  private coinBurst!: CoinBurst;
  private spinLoop: Phaser.Sound.BaseSound | null = null;
  private readonly rng = () => Math.random();

  constructor() {
    super('stage1');
  }

  preload(): void {
    if (!this.cache.json.exists(STAGE_LAYOUT_KEY)) this.load.json(STAGE_LAYOUT_KEY, STAGE_LAYOUT_PATH);
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
    // 호텔 업그레이드 상태 로드 — 오브젝트를 현재 레벨로 표시(My Hotel 에서 올린 레벨이 레이드 화면에 반영).
    this.hotelState = deserializeHotel(this.loadHotelRaw()) ?? createHotelState();

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
    const stageDoc = this.cache.json.get(STAGE_LAYOUT_KEY) as LayoutDoc | undefined;
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
    this.cache.json.remove(STAGE_LAYOUT_KEY);
    this.cache.json.remove(ROULETTE_LAYOUT_KEY);
    const bust = `?reload=${Date.now()}`; // HTTP/엣지 캐시 우회(스테일 응답 회피)
    this.load.json(STAGE_LAYOUT_KEY, STAGE_LAYOUT_PATH + bust);
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

  /**
   * ⭐호텔 오브젝트를 **현재 업그레이드 레벨**로 표시 — 디자이너가 blank_3 에 넣은 5개 레벨 노드 중 현재 레벨만 보이고
   *   나머지 레벨 노드는 숨긴다. **업그레이드 화살표(up_SC_UI_57)는 전부 숨김**(레이드/공격 = 결과만, 버튼 없음).
   */
  private applyHotelLevels(stageEntries: LayoutEntry[]): void {
    const layouts = parseHotelLayout(stageEntries.map((e) => e.node));
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
    const stageIndex = buildLayout(this, stageDoc);
    const stageEntries = stageIndex.entries();
    this.scaleEntries(stageEntries, stageDoc);
    this.applyHotelLevels(stageEntries); // ⭐오브젝트를 현재 업그레이드 레벨 텍스처로 스왑(버튼 없음 = 결과만)
    this.titleBarObjs = stageEntries.filter((e) => STAGE_TITLE_IDS.has(e.node.id)).map((e) => e.obj);
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

    // ② 룰렛1 화면 렌더(스테이지 위 depth 오프셋, 초기 숨김).
    if (rouletteDoc && Array.isArray(rouletteDoc.nodes) && rouletteDoc.nodes.length > 0) {
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

  /** 스테이지1 화면을 먼저 보여준 뒤 → 타이틀바 숨김 → 룰렛 등장(요청: 스테이지 먼저, 타이틀바/다이얼로그 지우고 룰렛). */
  private beginStage(): void {
    if (this.started) return;
    this.started = true;
    // ⭐카메라 전진 진입 연출(요청 2026-06-29) — 스테이지가 드러나는 순간 장면을 미세 줌인(호텔 빌드와 동일).
    //   리본 타이틀·다이얼로그·룰렛은 제외되어 UI 위치 고정.
    cameraEnterZoom(this, this.stageContentObjs, { centerX: DESIGN_W / 2, centerY: DESIGN_H / 2 });
    this.afterDelay(STAGE_INTRO_MS, () => {
      this.hideTitleBar();
      this.afterDelay(ROULETTE_APPEAR_MS, () => this.showRoulette());
    });
  }

  /** 상단 타이틀바 페이드아웃(숨김) — 룰렛 진입 전. */
  private hideTitleBar(): void {
    for (const o of this.titleBarObjs) {
      this.tweens.add({ targets: o, alpha: 0, duration: 280, onComplete: () => (o as unknown as { setVisible: (v: boolean) => void }).setVisible(false) });
    }
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
    for (const t of this.rouletteFadeTargets) {
      this.tweens.add({ targets: t, alpha: 0, duration: 300, onComplete: () => (t as unknown as { setVisible: (v: boolean) => void }).setVisible(false) });
    }
    const amt = Math.round(win).toLocaleString('en-US');
    const base = this.type === 'attack' ? `You attacked for ${amt} coins!` : `You stole ${amt} coins!`;
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
      const play = this.game.scene.getScene(this.resumeKey) as unknown as { awardRaidWin?: (n: number) => void; returnFromStage?: () => void } | null;
      play?.awardRaidWin?.(Math.round(this.lastWin));
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
