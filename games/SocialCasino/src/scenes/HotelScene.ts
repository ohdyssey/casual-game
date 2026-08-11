/**
 * HotelScene — **호텔(시크릿 그랜드 호텔) 빌드 화면**. 로비 하단 'My Hotel' 아이콘으로 진입.
 *
 * ⭐배치 구조 = **스테이지 레이아웃(blank_3.json)** — 어텍/레이드(Stage1Scene)와 **동일 SSOT**(요청 2026-06-29:
 *   빌드 화면도 스테이지 화면 구조를 적용). 배경 + 타이틀 리본 + 가구(슬롯별 **레벨1~5 노드 토글**) + 업그레이드 화살표.
 *   하단의 레이드 결과 다이얼로그(메시지/OK)는 스킵.
 * ⭐하단 버튼 구조 = **blank_3_copy2.json 의 네비게이션 버튼만** 참조(요청: 하단 버튼 구조만 가져옴).
 *   Main(구 Home) → 게임 로비(lobby) 복귀, Lobby → 현재 안내, 나머지 영역 → 준비 중 토스트.
 *
 * 업그레이드: hotelUpgrade 경제(개별 비용·레벨·스핀 환급). 화살표 **반투명 50%**. 레벨업 시 **현재 레벨 노드 토글**로
 *   가구 이미지가 바뀐다(blank_3.json 에 레벨1~5 노드가 모두 있음) + 빛 이펙트.
 */
import Phaser from 'phaser';
import { DESIGN_W, DESIGN_H } from './PlayScene.js';
import { buildLayout, type LayoutDoc, type LayoutEntry } from '../ui/layoutLoader.js';
import { uploadPath, ensureFonts } from '../assets.js';
import { loadCoins, saveCoins } from '../logic/wallet.js';
import { buildHudHeader, type HudHeader } from '../ui/hudHeader.js';
import { openSettingsMenu } from '../ui/settingsMenu.js';
import { showToast } from '../ui/dialogBox.js';
import { playUpgradeBurst } from '../ui/upgradeFx.js';
import { cameraEnterZoom } from '../ui/cameraEnter.js';
import { startBgm } from '../audio.js';
import {
  HOTEL_OBJECTS,
  type HotelState,
  createHotelState,
  deserializeHotel,
  serializeHotel,
  objectLevel,
  nextCostFor,
  canUpgrade,
  upgradeObject,
  upgradeSpinGrant,
  upgradeUnlocks,
  parseHotelLayout,
  formatCompact,
  HOTEL_SAVE_KEY,
  stageDef,
  currentStage,
  isStageComplete,
  isLastStage,
  advanceStage,
  stageReward,
  facilityInstallCost,
  nextFacilityName,
  cityLevel,
  type StageReward,
} from '../logic/hotelUpgrade.js';
import { addSpins, loadSpins } from '../logic/playerState.js';
import { addGems } from '../logic/gems.js';
import { facilityMilestoneSpins } from '../logic/progression.js';
import { recordEvent, clearLedger } from '../econ/telemetry.js';
import { resetSimulationData, SIM_RESET_SUMMARY } from '../logic/resetSim.js';
import { createAttackEnvelope, type AttackEnvelope } from '../ui/attackEnvelope.js';

// ⭐스테이지 배치 레이아웃은 **현재 스테이지에 따라** HOTEL_STAGES(hotelUpgrade) 에서 결정한다(Stage1=blank_3, Stage2=blank_3_copy3).
//   preload 에서 호텔 상태를 읽어 그 스테이지 레이아웃을 적재 → create 에서 this.stageLayoutKey 로 참조.
/** 하단 버튼 구조만 참조하는 네비게이션 레이아웃(blank_3_copy2.json). */
const NAV_LAYOUT_KEY = 'hotel_nav_layout';
const NAV_LAYOUT_PATH = 'ui/layouts/blank_3_copy2.json';
/** ⭐스테이지 완성 **보상 팝업**(디자이너 에디터 "보상 팝업" = blank_5.json) — 모든 업그레이드(스테이지) 보상 팝업 공용 템플릿.
 *  텍스트의 `#숫자`(STAGE #1 · Hotel Level #1 · #1M · #100 …)는 런타임에 실제 보상/스테이지 값으로 치환. */
const REWARD_POPUP_KEY = 'reward_popup_layout';
const REWARD_POPUP_PATH = 'ui/layouts/blank_5.json';
/** 보상 팝업 노드 id(blank_5.json 매핑). */
const RP = {
  bg: 'layer_1', // 전체 팝업 아트(프레임·배너·NEXT 버튼·닫기 X 베이크인)
  nextLabel: 'layer_2_copy', // NEXT 버튼 텍스트
  stageLine: 'layer_2_copy2', // "STAGE #1 "
  unlockLine: 'layer_2_copy4', // "The next stage is now unlocked."
  levelLine: 'layer_2_copy5', // "You've completed Hotel Level #1"
  coinVal: 'layer_2_copy7', // "#1M"
  spinVal: 'layer_2_copy8', // "#100"
  gemVal: 'layer_2_copy9', // "#100"
} as const;
/** ⭐시설 설치 확인 팝업(디자이너 에디터 "NEW FACILITY" = blank_5_copy_copy.json).
 *  스테이지 완성 시 다음 시설 이름·설치 비용을 보여주고 OK/CANCEL 로 진행 여부를 결정. */
const INSTALL_POPUP_KEY = 'facility_install_popup';
const INSTALL_POPUP_PATH = 'ui/layouts/blank_5_copy_copy.json';
/** 설치 팝업 노드 id(blank_5_copy_copy.json 매핑). */
const FP = {
  facilityName: 'layer_2_copy3', // "Restaurant?" → 다음 시설명
  costVal: 'layer_2_copy8',      // "$#2M" → 실제 설치 비용
  cancelBtn: 'layer_4',          // CANCEL 버튼 배경
  okBtn: 'layer_4_copy',         // OK 버튼 배경
} as const;
/** 배경 노드 id(blank_3). */
const BG_NODE_ID = 'layer_1';
/** 네비게이션 버튼 텍스처(blank_3_copy2). */
const NAV_BTN_KEY = 'up_SC_UI_35_v5';
/** 업그레이드 화살표 반투명도(약간 반투명). */
const ARROW_ALPHA = 0.75;
/** 내비 버튼 텍스트 색 — **현재 스테이지 구역만 노랑 강조**, 기타 구역은 기본 주황(blank_3_copy2 디자이너 팔레트). Main 은 원색 유지. */
const NAV_SELECTED_COLOR = '#ffc800';
const NAV_DEFAULT_COLOR = '#ab4317';
/** 스테이지(1-based) → 구역 라벨. 디자이너 순서: 로비→레스토랑→게스트룸→…(Main 제외, 내비 읽기 순서). */
const STAGE_AREA_LABELS = ['Lobby', 'Restaurant', 'Guest Rooms', 'Casino Hall', 'VIP Lounge', 'Cocktail Bar', 'Poolside', 'Spa Center', 'Arcade'] as const;
const HEADER_FONT = '"Russo One", "Jua", sans-serif';
const COST_FONT = '"Bungee", "Russo One", sans-serif';

type GO = Phaser.GameObjects.GameObject & { setVisible: (v: boolean) => GO };

export class HotelScene extends Phaser.Scene {
  private coins = 0;
  private hotel: HotelState = createHotelState();
  private header?: HudHeader;
  private leaving = false;
  private stageLayoutKey = 'hotel_stage1'; // ⭐현재 스테이지 레이아웃 캐시 키(preload 에서 호텔 상태로 결정)
  /** 슬롯별 뷰 — 레벨1~5 노드 + 화살표 + 별 이미지 배열(SC_UI_59, 레벨 수만큼). */
  private views: Array<{
    index: number;
    levelObjs: Array<Phaser.GameObjects.GameObject | undefined>;
    arrow?: Phaser.GameObjects.Image;
    stars?: Phaser.GameObjects.Image[];  // ⭐SC_UI_59 별 이미지, 최대 5개, 레벨만큼만 표시
    envelope?: AttackEnvelope; // ⭐공격받음 봉투 라벨(있으면 업그레이드 버튼 대신 표시)
  }> = [];
  /** ⭐공격받은 슬롯 상태(목업) — index → 공격자 이름. **미확인**(봉투 표시)이면 화살표 숨김. 확인(봉투 클릭) 시 revealed 로.
   *  업그레이드하면 제거. 미업그레이드면 유지(재진입 때 봉투 재표시). ⚠️영속은 나중(실제 공격 연동 시) — 지금은 세션 메모리. */
  private attacks = new Map<number, { attacker: string; revealed: boolean }>();

  constructor() {
    super('hotel');
  }

  preload(): void {
    // ⭐현재 스테이지를 호텔 상태에서 읽어 그 스테이지 레이아웃을 적재(Stage1=blank_3 / Stage2=blank_3_copy3).
    const hotel = deserializeHotel(this.loadHotelRaw()) ?? createHotelState();
    const def = stageDef(hotel);
    this.stageLayoutKey = def.layoutKey;
    if (!this.cache.json.exists(def.layoutKey)) this.load.json(def.layoutKey, def.layoutPath);
    if (!this.cache.json.exists(NAV_LAYOUT_KEY)) this.load.json(NAV_LAYOUT_KEY, NAV_LAYOUT_PATH);
    if (!this.cache.json.exists(REWARD_POPUP_KEY)) this.load.json(REWARD_POPUP_KEY, REWARD_POPUP_PATH); // 보상 팝업(공용)
    if (!this.cache.json.exists(INSTALL_POPUP_KEY)) this.load.json(INSTALL_POPUP_KEY, INSTALL_POPUP_PATH); // 시설 설치 확인 팝업
  }

  create(): void {
    this.views = [];
    this.leaving = false;
    startBgm(this);
    this.cameras.main.fadeIn(220, 26, 16, 48);
    this.coins = loadCoins();
    this.hotel = deserializeHotel(this.loadHotelRaw()) ?? createHotelState();

    const stage = this.cache.json.get(this.stageLayoutKey) as LayoutDoc | undefined;
    const nav = this.cache.json.get(NAV_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!stage || !Array.isArray(stage.nodes) || stage.nodes.length === 0) {
      this.mountFallback();
      return;
    }
    // 레이아웃 이미지 적재(누락분만) — 스테이지 + 네비 + 보상 팝업 아트/아이콘.
    const reward = this.cache.json.get(REWARD_POPUP_KEY) as LayoutDoc | undefined;
    const installDoc = this.cache.json.get(INSTALL_POPUP_KEY) as LayoutDoc | undefined;
    const need = new Set<string>();
    for (const n of stage.nodes) if (n.type === 'image' && n.key) need.add(n.key);
    if (nav) for (const n of nav.nodes) if (n.type === 'image' && n.key) need.add(n.key);
    if (reward) for (const n of reward.nodes) if (n.type === 'image' && n.key) need.add(n.key);
    if (installDoc) for (const n of installDoc.nodes) if (n.type === 'image' && n.key) need.add(n.key);
    need.add('up_SC_UI_59'); // ⭐별 이미지(SC_UI_59)
    let queued = 0;
    for (const key of need) {
      if (!this.textures.exists(key)) {
        this.load.image(key, uploadPath(key));
        queued++;
      }
    }
    const start = (): void => void this.ensureFontsThenMount(stage, nav ?? null);
    if (queued > 0) {
      this.load.once(Phaser.Loader.Events.COMPLETE, start);
      this.load.start();
    } else {
      start();
    }
  }

  private async ensureFontsThenMount(stage: LayoutDoc, nav: LayoutDoc | null): Promise<void> {
    try {
      await ensureFonts(['Russo One', 'Fredoka', 'Jua', 'Bungee', 'Luckiest Guy']); // 'Luckiest Guy' = 보상 팝업 타이틀 폰트
    } catch {
      /* 폴백 진행 */
    }
    if (this.scene.isActive()) this.mount(stage, nav);
  }

  /** 디자인 프레임(720×1600) → 캔버스(1080×2400) 좌표/스케일 보정. */
  private scaleEntries(entries: LayoutEntry[], doc: LayoutDoc): void {
    const sx = DESIGN_W / (doc.frame?.designW ?? 720);
    const sy = DESIGN_H / (doc.frame?.designH ?? 1600);
    for (const e of entries) {
      const t = e.obj as unknown as {
        x: number;
        y: number;
        scaleX: number;
        scaleY: number;
        setPosition: (x: number, y: number) => void;
        setScale: (x: number, y: number) => void;
      };
      t.setPosition(t.x * sx, t.y * sy);
      t.setScale(t.scaleX * sx, t.scaleY * sy);
    }
  }

  private mount(stage: LayoutDoc, nav: LayoutDoc | null): void {
    // ── 현재 스테이지 배치: 배경 + 타이틀 + 가구(레벨 토글) + 화살표. 레이드 다이얼로그(메시지/OK)는 스킵 ──
    const slots = parseHotelLayout(stage.nodes, currentStage(this.hotel));
    const keep = new Set<string>();
    for (const n of stage.nodes) {
      if (n.id === BG_NODE_ID) keep.add(n.id);
      if (n.key === 'up_Stage_Banner' || (n.key ?? '').startsWith('layer_4__ti')) keep.add(n.id); // 타이틀 리본 + 타이틀
    }
    for (const sl of slots) {
      for (const id of sl.levelNodeIds) if (id) keep.add(id);
      if (sl.arrowNodeId) keep.add(sl.arrowNodeId);
    }
    const index = buildLayout(this, stage, { skip: (n) => !keep.has(n.id) });
    const entries = index.entries();
    this.scaleEntries(entries, stage);
    const byId = new Map<string, Phaser.GameObjects.GameObject>(entries.map((e) => [e.node.id, e.obj]));

    const bg = byId.get(BG_NODE_ID) as Phaser.GameObjects.Image | undefined;
    bg?.setDepth(1).setDisplaySize(DESIGN_W, DESIGN_H).setPosition(DESIGN_W / 2, DESIGN_H / 2);

    HOTEL_OBJECTS.forEach((_o, i) => {
      const sl = slots[i];
      const levelObjs = sl.levelNodeIds.map((id) => (id ? byId.get(id) : undefined));
      const arrow = sl.arrowNodeId ? (byId.get(sl.arrowNodeId) as Phaser.GameObjects.Image | undefined) : undefined;
      let stars: Phaser.GameObjects.Image[] | undefined;
      if (arrow) {
        arrow.setAlpha(ARROW_ALPHA).setDepth(60).setInteractive({ useHandCursor: true });
        arrow.on('pointerdown', () => this.tryUpgrade(i));
        // ⭐별 이미지(SC_UI_59) 최대 5개 미리 생성 — refreshSlot 이 위치·크기·표시 수 갱신
        stars = Array.from({ length: 5 }, () =>
          this.add.image(arrow.x, arrow.y, 'up_SC_UI_59').setOrigin(0.5).setDepth(62).setVisible(false),
        );
      }
      this.views.push({ index: i, levelObjs, arrow, stars });
      this.refreshSlot(i);
    });

    // ── 하단 버튼 구조(blank_3_copy2.json)의 네비게이션 버튼만 렌더 ──
    if (nav) this.mountNavButtons(nav);

    this.buildHeader();

    // ⭐카메라 전진 진입 연출(요청 2026-06-29) — 호텔 콘텐츠(배경+가구+화살표+비용)만 화면 중심 기준 미세 줌인.
    //   헤더/하단 네비 + **리본 타이틀(up_Stage_Banner/타이틀)은 UI 로 취급해 제외(위치 고정)**. 어택 빌드와 동일 연출.
    const isTitle = (e: LayoutEntry): boolean => e.node.key === 'up_Stage_Banner' || (e.node.key ?? '').startsWith('layer_4__ti');
    const content: Array<Phaser.GameObjects.GameObject | undefined> = [
      ...entries.filter((e) => !isTitle(e)).map((e) => e.obj),
      ...this.views.flatMap((v) => v.stars ?? []),
    ];
    cameraEnterZoom(this, content, { centerX: DESIGN_W / 2, centerY: DESIGN_H / 2 });

    // ⭐이미 완성된 스테이지로 **재진입**(직전에 전 시설을 Lv5 까지 올린 뒤 완성 팝업을 보지 못하고 나갔거나
    //   페이지를 새로고침한 경우) → 완성 팝업을 다시 띄워 보상 수령 + 다음 스테이지 진행이 가능하게 한다.
    //   (이전엔 onStageComplete 가 tryUpgrade 안에서만 호출돼, 최고레벨로 재진입 시 진행이 막혀 있었다.)
    if (!isLastStage(this.hotel) && isStageComplete(this.hotel)) {
      this.time.delayedCall(500, () => {
        if (!this.leaving && this.scene.isActive()) this.onStageComplete();
      });
    }

    // ⭐공격받음 봉투 연출(목업) — 실제 공격 데이터 연동 전, 진입 시 **적당한 수(1~2 시설)** 를 공격 상태로 배치해 연출 확인.
    //   전역 __scAttack(index?, name?) / 설정 '공격 연출 시뮬' 버튼으로도 수동 트리거. 실제 규칙(상대·보상)은 추후 구현.
    this.setupAttackDemo();
  }

  /** ⭐공격 연출 데모(목업) — 전역 헬퍼 노출 + 진입 시 기본 배치. 실제 공격 시스템으로 대체 예정. */
  private setupAttackDemo(): void {
    (globalThis as Record<string, unknown>).__scAttack = (index?: number, name?: string): void => {
      const names = ['David', 'Mina', 'Leo', 'Sora', 'Max'];
      const pick = typeof index === 'number' ? index : this.firstAttackableSlot();
      if (pick < 0) return;
      this.markAttacked(pick, name ?? names[pick % names.length]);
    };
    // 진입 시 기본 연출: 업그레이드 가능한 첫 시설을 공격받은 상태로(적당한 배치). 이미 공격/최대면 스킵.
    this.time.delayedCall(650, () => {
      if (this.leaving || !this.scene.isActive()) return;
      const s0 = this.firstAttackableSlot();
      if (s0 >= 0) this.markAttacked(s0, 'David');
    });
  }

  /** 공격 표시 가능한(업그레이드 여지 있고 아직 공격 안 된) 첫 슬롯 인덱스. 없으면 -1. */
  private firstAttackableSlot(): number {
    for (let i = 0; i < HOTEL_OBJECTS.length; i++) {
      if (!this.attacks.has(i) && nextCostFor(this.hotel, i) != null) return i;
    }
    return -1;
  }

  /** 슬롯의 현재 레벨 노드만 표시 + 별 이미지·화살표 상태 갱신(최대면 더 흐림). */
  private refreshSlot(index: number): void {
    const v = this.views[index];
    if (!v) return;
    const level = objectLevel(this.hotel, index);
    v.levelObjs.forEach((obj, idx) => (obj as GO | undefined)?.setVisible(idx + 1 === level));
    const nextCost = nextCostFor(this.hotel, index);
    const maxed = nextCost == null;

    // ⭐별 이미지(SC_UI_59) — 레벨 수만큼만 표시, 적을수록 크게
    if (v.stars && v.arrow) {
      const filled = Math.min(level, 5);
      // 에디터 별 참조(39px design=58px display), 화살표(91px display)보다 작게
      // 1개=60 / 2개=54 / 3개=48 / 4개=42 / 5개=36 px
      const starPx = ([60, 54, 48, 42, 36] as const)[filled - 1] ?? 36;
      const gap = 5;
      const totalW = filled * starPx + Math.max(0, filled - 1) * gap;
      const arrowBot = v.arrow.y + v.arrow.displayHeight * 0.5;
      const startX = v.arrow.x - totalW / 2 + starPx / 2;
      const starCY = arrowBot + 12 + starPx / 2;
      for (let s = 0; s < v.stars.length; s++) {
        const img = v.stars[s];
        if (s < filled) {
          img.setVisible(true).setDisplaySize(starPx, starPx).setPosition(startX + s * (starPx + gap), starCY);
          img.setAlpha(1);
        } else {
          img.setVisible(false);
        }
      }
    }

    if (v.arrow) {
      v.arrow.setAlpha(maxed ? ARROW_ALPHA * 0.5 : ARROW_ALPHA);
      if (maxed) v.arrow.disableInteractive();
      else v.arrow.setInteractive({ useHandCursor: true });
    }
    this.applyAttackDisplay(index); // ⭐공격받음(봉투) 상태면 화살표 숨김/봉투 표시
  }

  /** ⭐공격 상태 표시 갱신 — **미확인 공격**이면 업그레이드 화살표를 숨기고 봉투 라벨을 띄운다.
   *  확인(봉투 클릭 후 revealed) 또는 미공격이면 화살표 정상 표시 + 봉투 제거. maxed 슬롯은 봉투 미표시. */
  private applyAttackDisplay(index: number): void {
    const v = this.views[index];
    if (!v || !v.arrow) return;
    const atk = this.attacks.get(index);
    const maxed = nextCostFor(this.hotel, index) == null;
    const showEnvelope = !!atk && !atk.revealed && !maxed;
    if (showEnvelope) {
      v.arrow.setVisible(false).disableInteractive();
      if (!v.envelope) {
        v.envelope = createAttackEnvelope(this, v.arrow.x, v.arrow.y, atk!.attacker, () => this.onEnvelopeClicked(index), 70);
      }
    } else {
      v.arrow.setVisible(true);
      if (!maxed) v.arrow.setInteractive({ useHandCursor: true });
      if (v.envelope) {
        v.envelope.destroy();
        v.envelope = undefined;
      }
    }
  }

  /** ⭐봉투 클릭(공격 확인) — 그 슬롯의 공격을 revealed 로 바꿔 업그레이드 버튼을 노출한다. */
  private onEnvelopeClicked(index: number): void {
    const atk = this.attacks.get(index);
    if (!atk) return;
    this.attacks.set(index, { ...atk, revealed: true });
    this.refreshSlot(index);
    showToast(this, `${atk.attacker} 님이 시설을 공격했습니다`, { color: '#ffd7a0' });
  }

  /** ⭐시설 공격받음 표시(목업) — 슬롯을 공격 상태로 만들고 봉투 등장 연출. 실제 공격 데이터 연동 전 연출용. */
  private markAttacked(index: number, attacker: string): void {
    const v = this.views[index];
    if (!v || !v.arrow) return;
    if (nextCostFor(this.hotel, index) == null) return; // maxed 시설은 공격 표시 안 함(업그레이드 불가)
    this.attacks.set(index, { attacker, revealed: false });
    this.refreshSlot(index); // applyAttackDisplay 가 봉투 생성
    v.envelope?.playArrival();
  }

  private refreshAll(): void {
    for (const v of this.views) this.refreshSlot(v.index);
  }

  /** 가구 업그레이드 — 코인 충분하면 차감·레벨업·스핀 환급·**레벨 노드 토글(이미지 변화)**·빛 이펙트. */
  private tryUpgrade(index: number): void {
    const v = this.views[index];
    if (!v) return;
    const cost = nextCostFor(this.hotel, index);
    if (cost == null) {
      showToast(this, 'MAX LEVEL', { color: '#ffe9b8' });
      return;
    }
    if (!canUpgrade(this.hotel, index, this.coins)) {
      showToast(this, '코인이 부족합니다', { color: '#ff9a9a' });
      if (v.arrow) this.tweens.add({ targets: v.arrow, x: v.arrow.x - 8, duration: 50, yoyo: true, repeat: 2 });
      return;
    }
    const spinGrant = upgradeSpinGrant(this.hotel);
    const unlocked = upgradeUnlocks(this.hotel);
    const prevCityLevel = cityLevel(this.hotel); // ⭐마일스톤 판정용(업그레이드 전 누적 레벨)
    // ⭐공격받았던 시설을 업그레이드하면 공격 표시(봉투) 해제(요청: 업그레이드하면 봉투 사라짐).
    if (this.attacks.has(index)) {
      this.attacks.delete(index);
      v.envelope?.destroy();
      v.envelope = undefined;
    }
    this.coins -= cost;
    this.hotel = upgradeObject(this.hotel, index);
    if (spinGrant > 0) addSpins(spinGrant);
    saveCoins(this.coins);
    this.saveHotel();
    const newCityLevel = cityLevel(this.hotel);
    // ⭐텔레메트리 v2 — 업그레이드 원장(비용·레벨). 시설 진행 속도(코인 싱크) 실측 = 지급구조 재설계 입력.
    try {
      recordEvent({ t: Date.now(), e: 'upgrade', n: cost, co: this.coins, sp: loadSpins(), L: newCityLevel });
    } catch { /* 텔레메트리 실패 무시 */ }
    // ⭐시설 마일스톤(2026-07-07 시뮬 베이스라인) — 누적 업그레이드 10 경계마다 +100스핀("시설 10레벨 = 100스핀" 관점).
    const milestoneSpins = facilityMilestoneSpins(prevCityLevel, newCityLevel);
    if (milestoneSpins > 0) {
      const total = addSpins(milestoneSpins);
      try {
        recordEvent({ t: Date.now(), e: 'spin_in', src: 'facility', n: milestoneSpins, sp: total, L: newCityLevel });
      } catch { /* 텔레메트리 실패 무시 */ }
      this.header?.setSpins(total);
      showToast(this, `🏨 시설 마일스톤!  +${milestoneSpins} 스핀`, { color: '#9bff7a' });
    }
    this.refreshSlot(index); // 새 레벨 노드 표시(가구 이미지 변화)
    this.refreshAll();
    this.header?.setCoins(this.coins);

    // 빛 이펙트(후면) + 새 레벨 노드 팝.
    const lvObj = v.levelObjs[objectLevel(this.hotel, index) - 1] as (Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Depth & GO) | undefined;
    if (lvObj && 'scaleX' in lvObj) {
      const o = lvObj as unknown as { scaleX: number; scaleY: number; x: number; y: number; depth: number };
      playUpgradeBurst(this, o.x, o.y, { depth: (o.depth ?? 8) - 1, radius: 240 });
      this.tweens.add({ targets: lvObj, scaleX: o.scaleX * 1.18, scaleY: o.scaleY * 1.18, duration: 160, yoyo: true, ease: 'Back.easeOut' });
      this.cameras.main.shake(150, 0.004);
    }
    if (v.arrow) this.tweens.add({ targets: v.arrow, scaleX: v.arrow.scaleX * 1.2, scaleY: v.arrow.scaleY * 1.2, duration: 110, yoyo: true });
    const parts = [`LV.${objectLevel(this.hotel, index)}!`];
    if (spinGrant > 0) parts.push(`+${spinGrant} 스핀`);
    if (unlocked) parts.push('★해금!');
    showToast(this, parts.join('  '), { color: '#ffe27a' });
    // ⭐스테이지 완성(전 시설 최고레벨) → 잠깐 보여준 뒤 축하 팝업 + 보상 + 다음 스테이지(요청 2026-06-30).
    if (isStageComplete(this.hotel)) this.time.delayedCall(750, () => this.onStageComplete());
  }

  /** ⭐텔레메트리 v2 — 스테이지 완성 보상 원장(코인/스핀 stage_clear + 설치비는 upgrade 지출로). 실패 무시. */
  private recordStageClear(reward: StageReward, installCost = 0): void {
    const L = cityLevel(this.hotel);
    try {
      if (reward.coins > 0) recordEvent({ t: Date.now(), e: 'coin_in', src: 'stage_clear', n: reward.coins, co: this.coins, L });
      if (reward.spins > 0) recordEvent({ t: Date.now(), e: 'spin_in', src: 'stage_clear', n: reward.spins, sp: loadSpins(), L });
      if (installCost > 0) recordEvent({ t: Date.now(), e: 'upgrade', n: installCost, co: this.coins, L });
    } catch {
      /* 텔레메트리 실패 무시 */
    }
  }

  /** ⭐스테이지 완성 — 마지막 스테이지면 기존 보상 팝업, 아니면 NEW FACILITY 설치 확인 팝업으로 분기. */
  private onStageComplete(): void {
    if (this.leaving) return;
    const completed = currentStage(this.hotel);
    const last = isLastStage(this.hotel);
    const reward = stageReward(completed);

    if (last) {
      // 마지막 스테이지 완성 — 기존 보상 팝업(다음 단계 없음).
      this.showStageCompletePopup(completed, reward, true, () => {
        this.coins += reward.coins;
        saveCoins(this.coins);
        if (reward.spins > 0) addSpins(reward.spins);
        if (reward.gems > 0) addGems(reward.gems);
        this.recordStageClear(reward);
        this.header?.setCoins(this.coins);
        this.header?.setSpins(loadSpins());
        showToast(this, '모든 스테이지 완성! 🎉', { color: '#ffe27a' });
      });
      return;
    }

    // 다음 시설 설치 확인 팝업.
    const installCost = facilityInstallCost(completed);
    const nextName = nextFacilityName(completed) ?? 'Next Facility';
    this.showInstallFacilityPopup(nextName, installCost, () => {
      if (this.coins < installCost) {
        showToast(this, `코인이 부족합니다 (필요: ${formatCompact(installCost)})`, { color: '#ff9a9a' });
        return;
      }
      // 스테이지 완성 보상 지급 후 설치 비용 차감.
      this.coins += reward.coins;
      this.coins -= installCost;
      saveCoins(this.coins);
      if (reward.spins > 0) addSpins(reward.spins);
      if (reward.gems > 0) addGems(reward.gems);
      this.recordStageClear(reward, installCost);
      this.header?.setCoins(this.coins);
      this.header?.setSpins(loadSpins());
      // 다음 스테이지 진입.
      this.hotel = advanceStage(this.hotel);
      this.saveHotel();
      this.leaving = true;
      this.fadeOutThen(() => this.scene.restart());
    });
  }

  /**
   * ⭐스테이지 완성 **보상 팝업**(디자이너 에디터 "보상 팝업" = blank_5.json, 모든 업그레이드 보상 공용).
   *   레이아웃을 그대로 렌더하고 `#숫자` 자리표시자만 실제 값으로 치환 — 스테이지/호텔레벨 번호 + 코인/스핀/젬 보상.
   *   NEXT(초록 버튼)·닫기 X 아트는 배경 이미지에 베이크인 → 그 위에 **투명 히트존**을 올려 둘 다 onProceed(보상 수령 + 진행)로 연결.
   *   레이아웃/이미지 로드 실패 시 코드 드로잉 폴백(showStageCompletePopupFallback).
   */
  private showStageCompletePopup(stage: number, reward: StageReward, last: boolean, onProceed: () => void): void {
    const doc = this.cache.json.get(REWARD_POPUP_KEY) as LayoutDoc | undefined;
    if (!doc || !Array.isArray(doc.nodes) || doc.nodes.length === 0) {
      this.showStageCompletePopupFallback(stage, reward, last, onProceed);
      return;
    }
    const cx = DESIGN_W / 2;
    const cy = DESIGN_H / 2;
    const layer = this.add.container(0, 0).setDepth(9000);
    const dim = this.add.rectangle(cx, cy, DESIGN_W * 1.4, DESIGN_H * 1.2, 0x000000, 0.66).setInteractive();
    layer.add(dim);

    // 보상 팝업 레이아웃 렌더(720×1600 → 캔버스 스케일) → 컨테이너로 reparent(딤 위, 일괄 정리).
    const index = buildLayout(this, doc);
    const entries = index.entries();
    this.scaleEntries(entries, doc);
    for (const e of entries) layer.add(e.obj);
    const byId = new Map<string, Phaser.GameObjects.GameObject>(entries.map((e) => [e.node.id, e.obj]));
    const txtOf = (id: string): Phaser.GameObjects.Text | undefined => byId.get(id) as Phaser.GameObjects.Text | undefined;
    // `#숫자`는 자리표시자(표식) — **`#`까지 통째로 제거하고 실제 값만** 남긴다(요청 2026-06-30: # 은 표시 X, 숫자가 바뀐다는 표식).
    const swapNum = (id: string, val: string): void => {
      const t = txtOf(id);
      if (t) t.setText((t.text ?? '').replace(/#\s*[\d.,]+\s*[KMB]?/i, val));
    };
    swapNum(RP.stageLine, String(stage)); // STAGE #N
    swapNum(RP.levelLine, String(stage)); // You've completed Hotel Level #N
    swapNum(RP.coinVal, formatCompact(reward.coins)); // #10M
    swapNum(RP.spinVal, String(reward.spins)); // #300
    swapNum(RP.gemVal, String(reward.gems)); // #100
    if (last) {
      txtOf(RP.unlockLine)?.setText('All hotels complete!');
      txtOf(RP.nextLabel)?.setText('OK');
    }

    // 한 번만 진행(NEXT / 닫기 X 공통) — 보상 수령 + 다음 스테이지 이동은 onProceed.
    let pressed = false;
    const proceed = (): void => {
      if (pressed) return;
      pressed = true;
      layer.destroy(true);
      onProceed();
    };
    // 투명 히트존(버튼/닫기 아트는 배경에 베이크인). 컨테이너 내 최상단(depth↑)이라 클릭 우선.
    const addHit = (x: number, y: number, w: number, h: number, onTap: () => void): void => {
      const z = this.add.rectangle(x, y, w, h, 0x000000, 0).setInteractive({ useHandCursor: true }).setDepth(1000);
      z.on('pointerdown', () => {
        this.tweens.add({ targets: z, scaleX: 0.94, scaleY: 0.94, duration: 80, yoyo: true, ease: 'Quad.easeOut' });
        onTap();
      });
      layer.add(z);
    };
    const nextTxt = txtOf(RP.nextLabel);
    if (nextTxt) addHit(nextTxt.x, nextTxt.y, 520, 150, proceed); // NEXT 버튼
    const bg = byId.get(RP.bg) as Phaser.GameObjects.Image | undefined;
    if (bg) {
      const b = bg.getBounds();
      addHit(b.right - b.width * 0.07, b.top + b.height * 0.05, 120, 120, proceed); // 우상단 닫기 X
    }

    layer.setScale(0.85).setAlpha(0);
    this.tweens.add({ targets: layer, scaleX: 1, scaleY: 1, alpha: 1, duration: 240, ease: 'Back.easeOut' });
  }

  /** 코드 드로잉 폴백 — 보상 팝업 레이아웃/이미지 로드 실패 시. */
  private showStageCompletePopupFallback(stage: number, reward: StageReward, last: boolean, onProceed: () => void): void {
    const cx = DESIGN_W / 2;
    const cy = DESIGN_H / 2;
    const layer = this.add.container(0, 0).setDepth(9000);
    const dim = this.add.rectangle(cx, cy, DESIGN_W * 1.4, DESIGN_H * 1.2, 0x000000, 0.66).setInteractive();
    layer.add(dim);
    const panel = this.add.rectangle(cx, cy, 860, 920, 0xfff4e0, 1).setStrokeStyle(10, 0xffd34d);
    layer.add(panel);
    layer.add(
      this.add
        .text(cx, cy - 320, last ? `ALL STAGES\nCOMPLETE!` : `STAGE ${stage}\nCOMPLETE!`, {
          fontFamily: HEADER_FONT,
          fontSize: '80px',
          color: '#c98a16',
          stroke: '#2a1640',
          strokeThickness: 9,
          align: 'center',
          lineSpacing: 6,
        })
        .setOrigin(0.5),
    );
    layer.add(
      this.add
        .text(cx, cy - 110, last ? '축하합니다!\n모든 호텔을 완성했습니다.' : `호텔 ${stage}단계를 완성했습니다!\n다음 스테이지가 열립니다.`, {
          fontFamily: HEADER_FONT,
          fontSize: '40px',
          color: '#6a4a8a',
          align: 'center',
          lineSpacing: 14,
          wordWrap: { width: 760 },
        })
        .setOrigin(0.5),
    );
    layer.add(
      this.add
        .text(cx, cy + 70, `보상\n+${formatCompact(reward.coins)} 골드    +${reward.spins} 스핀`, {
          fontFamily: COST_FONT,
          fontSize: '50px',
          color: '#1f9a4a',
          stroke: '#0c3a20',
          strokeThickness: 5,
          align: 'center',
          lineSpacing: 20,
        })
        .setOrigin(0.5),
    );
    const btnBg = this.add.rectangle(cx, cy + 320, 480, 130, 0xe5872a, 1).setStrokeStyle(6, 0xffffff, 0.9).setInteractive({ useHandCursor: true });
    const btnTxt = this.add.text(cx, cy + 320, last ? '확인' : '다음 스테이지', { fontFamily: HEADER_FONT, fontSize: '50px', color: '#ffffff', stroke: '#7a3b00', strokeThickness: 5 }).setOrigin(0.5);
    layer.add(btnBg);
    layer.add(btnTxt);
    let pressed = false;
    btnBg.on('pointerdown', () => {
      if (pressed) return;
      pressed = true;
      this.tweens.add({ targets: [btnBg, btnTxt], scaleX: 0.92, scaleY: 0.92, duration: 80, yoyo: true, ease: 'Quad.easeOut' });
      layer.destroy(true);
      onProceed();
    });
    layer.setScale(0.85).setAlpha(0);
    this.tweens.add({ targets: layer, scaleX: 1, scaleY: 1, alpha: 1, duration: 240, ease: 'Back.easeOut' });
  }

  /**
   * ⭐NEW FACILITY 설치 확인 팝업(blank_5_copy_copy.json). 스테이지 완성 후 다음 시설 이름·설치 비용을 보여주고
   *   OK → onConfirm 콜백(비용 차감·진행은 호출자), CANCEL → 팝업만 닫음(스테이지 완성 상태 유지).
   *   레이아웃/이미지 로드 실패 시 코드 드로잉 폴백.
   */
  private showInstallFacilityPopup(facilityName: string, cost: number, onConfirm: () => void): void {
    const doc = this.cache.json.get(INSTALL_POPUP_KEY) as LayoutDoc | undefined;
    const cx = DESIGN_W / 2;
    const cy = DESIGN_H / 2;

    if (!doc || !Array.isArray(doc.nodes) || doc.nodes.length === 0) {
      // 코드 드로잉 폴백.
      const layer = this.add.container(0, 0).setDepth(9100);
      const dim = this.add.rectangle(cx, cy, DESIGN_W * 1.4, DESIGN_H * 1.2, 0x000000, 0.66).setInteractive();
      layer.add(dim);
      const panel = this.add.rectangle(cx, cy, 860, 760, 0xfff4e0, 1).setStrokeStyle(10, 0xffd34d);
      layer.add(panel);
      layer.add(this.add.text(cx, cy - 280, 'NEW FACILITY', { fontFamily: HEADER_FONT, fontSize: '72px', color: '#ffffff', stroke: '#5a3210', strokeThickness: 8, align: 'center' }).setOrigin(0.5));
      layer.add(this.add.text(cx, cy - 150, `INSTALL\n${facilityName}?`, { fontFamily: HEADER_FONT, fontSize: '56px', color: '#472424', align: 'center', lineSpacing: 10 }).setOrigin(0.5));
      layer.add(this.add.text(cx, cy + 20, `Installation Cost\n${formatCompact(cost)} 코인`, { fontFamily: COST_FONT, fontSize: '46px', color: '#1a1a1a', align: 'center', lineSpacing: 10 }).setOrigin(0.5));
      const cancelBg = this.add.rectangle(cx - 190, cy + 220, 300, 110, 0x5a8a2a, 1).setStrokeStyle(5, 0xffffff, 0.9).setInteractive({ useHandCursor: true });
      const cancelTxt = this.add.text(cx - 190, cy + 220, 'CANCEL', { fontFamily: HEADER_FONT, fontSize: '44px', color: '#ffffff', stroke: '#2a4a10', strokeThickness: 5 }).setOrigin(0.5);
      const okBg = this.add.rectangle(cx + 190, cy + 220, 300, 110, 0x2a6ae0, 1).setStrokeStyle(5, 0xffffff, 0.9).setInteractive({ useHandCursor: true });
      const okTxt = this.add.text(cx + 190, cy + 220, 'OK', { fontFamily: HEADER_FONT, fontSize: '44px', color: '#ffffff', stroke: '#0a2a80', strokeThickness: 5 }).setOrigin(0.5);
      layer.add(cancelBg); layer.add(cancelTxt); layer.add(okBg); layer.add(okTxt);
      let pressed = false;
      cancelBg.on('pointerdown', () => { if (!pressed) { pressed = true; layer.destroy(true); } });
      okBg.on('pointerdown', () => { if (!pressed) { pressed = true; layer.destroy(true); onConfirm(); } });
      layer.setScale(0.85).setAlpha(0);
      this.tweens.add({ targets: layer, scaleX: 1, scaleY: 1, alpha: 1, duration: 240, ease: 'Back.easeOut' });
      return;
    }

    const layer = this.add.container(0, 0).setDepth(9100);
    const dim = this.add.rectangle(cx, cy, DESIGN_W * 1.4, DESIGN_H * 1.2, 0x000000, 0.66).setInteractive();
    layer.add(dim);

    const index = buildLayout(this, doc);
    const entries = index.entries();
    this.scaleEntries(entries, doc);
    for (const e of entries) layer.add(e.obj);
    // 에디터 depth 순 정렬 — CANCEL img(depth:2) < CANCEL text(depth:4) 이어야 텍스트가 버튼 위에 렌더됨
    layer.sort('depth');
    const byId = new Map<string, Phaser.GameObjects.GameObject>(entries.map((e) => [e.node.id, e.obj]));
    const txtOf = (id: string): Phaser.GameObjects.Text | undefined => byId.get(id) as Phaser.GameObjects.Text | undefined;
    // description 2줄 wordWrap (에디터 wrapW:310 디자인 → 게임 스케일)
    const descT = txtOf('layer_2_copy5');
    if (descT) descT.setWordWrapWidth(310);

    // 다음 시설명 교체("Restaurant?" → 실제 이름).
    const nameT = txtOf(FP.facilityName);
    if (nameT) nameT.setText(`${facilityName}?`);

    // 비용 교체("$#2M" → "$실제금액").
    const costT = txtOf(FP.costVal);
    if (costT) costT.setText((costT.text ?? '').replace(/#\s*[\d.,]+\s*[KMB]?/i, formatCompact(cost)));

    let pressed = false;
    const onCancel = (): void => { if (!pressed) { pressed = true; layer.destroy(true); } };
    const onOk = (): void => {
      if (pressed) return;
      pressed = true;
      layer.destroy(true);
      onConfirm();
    };

    const addBtn = (nodeId: string, onTap: () => void): void => {
      const btn = byId.get(nodeId) as Phaser.GameObjects.Image | undefined;
      if (!btn) return;
      btn.setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => {
        this.tweens.add({ targets: btn, scaleX: btn.scaleX * 0.92, scaleY: btn.scaleY * 0.92, duration: 80, yoyo: true, ease: 'Quad.easeOut' });
        onTap();
      });
    };
    addBtn(FP.cancelBtn, onCancel);
    addBtn(FP.okBtn, onOk);

    // ⭐우상단 X 닫기 버튼 — 팝업 배경(layer_1) 기준 우상단
    const bg = byId.get(RP.bg) as Phaser.GameObjects.Image | undefined;
    if (bg) {
      const b = bg.getBounds();
      const closeHit = this.add.rectangle(b.right - b.width * 0.07, b.top + b.height * 0.05, 120, 120, 0xffffff, 0).setInteractive({ useHandCursor: true });
      closeHit.on('pointerdown', () => {
        this.tweens.add({ targets: closeHit, scaleX: 0.88, scaleY: 0.88, duration: 60, yoyo: true, ease: 'Quad.easeOut' });
        onCancel();
      });
      layer.add(closeHit);
    }

    layer.setScale(0.85).setAlpha(0);
    this.tweens.add({ targets: layer, scaleX: 1, scaleY: 1, alpha: 1, duration: 240, ease: 'Back.easeOut' });
  }

  /** ⭐시설 업그레이드 전체 초기화(설정 → 데이터 편집의 리셋 버튼) — 저장은 설정에서 비웠고, 여기선 씬 재시작해 스테이지1 로 복귀. */
  private resetHotelStages(): void {
    if (this.leaving) return;
    this.hotel = createHotelState();
    this.saveHotel();
    this.leaving = true;
    this.fadeOutThen(() => this.scene.restart(), 220);
  }

  /** 하단 네비게이션 버튼만 blank_3_copy2.json 에서 렌더(버튼배경 up_SC_UI_35_v5 + 텍스트 라벨) + 와이어. */
  private mountNavButtons(nav: LayoutDoc): void {
    // nav 텍스트 중 하단 버튼 구역(y≥1000) 만 포함 — 상단 디자인 데코(별 옆 "100K" 등)는 제외
    const idx = buildLayout(this, nav, { skip: (n) => !(n.key === NAV_BTN_KEY || (n.type === 'text' && (n.y ?? 0) >= 1000)) });
    const entries = idx.entries();
    this.scaleEntries(entries, nav);
    for (const e of entries) (e.obj as Phaser.GameObjects.Image).setDepth(70); // 가구/배경 위

    const labels = entries.filter((e) => e.node.type === 'text' && (e.node.text ?? '').trim());
    const btns = entries.filter((e) => e.node.key === NAV_BTN_KEY).map((e) => e.obj as Phaser.GameObjects.Image);
    // ⭐현재 스테이지의 구역 라벨(소문자) — 그 버튼만 노랑 강조(디자이너 하드코딩 'Lobby' 노랑 대체).
    const currentLabel = (STAGE_AREA_LABELS[currentStage(this.hotel) - 1] ?? '').toLowerCase();
    const nextStageLabel = (STAGE_AREA_LABELS[currentStage(this.hotel)] ?? '').toLowerCase();
    const stageIsDone = isStageComplete(this.hotel);
    for (const lbl of labels) {
      const text = (lbl.node.text ?? '').trim();
      const lt = lbl.obj as Phaser.GameObjects.Text;
      let best: Phaser.GameObjects.Image | undefined;
      let bd = Infinity;
      for (const b of btns) {
        const d = (b.x - lt.x) ** 2 + (b.y - lt.y) ** 2;
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
      if (!best) continue;
      const lower = text.toLowerCase();
      const isMain = lower === 'main' || lower === 'home';
      const isCurrent = !isMain && lower === currentLabel;
      // ⭐현재 스테이지 구역 = 노랑, 기타 구역 = 주황. Main 색(파랑)은 유지.
      if (!isMain) lt.setColor(isCurrent ? NAV_SELECTED_COLOR : NAV_DEFAULT_COLOR);
      // Main → 로비. 현재 구역 → 안내. 다음 스테이지(완성 상태) → 설치 팝업. 나머지 → 준비 중.
      const isNextReady = !isMain && !isCurrent && lower === nextStageLabel && stageIsDone;
      const onTap = isMain
        ? (): void => this.goLobby()
        : isCurrent
          ? (): void => showToast(this, `현재 ${text} 화면입니다`, { color: '#ffe9b8' })
          : isNextReady
            ? (): void => this.onStageComplete()
            : (): void => showToast(this, `${text} — 준비 중입니다`, { color: '#ffd9a0' });
      this.wireButton(best, lt, onTap);
    }
  }

  /** 버튼배경 탭 → 누름 피드백 + 콜백. */
  private wireButton(bg: Phaser.GameObjects.Image, label: Phaser.GameObjects.Text, onTap: () => void): void {
    label.setDepth(71);
    bg.setInteractive({ useHandCursor: true });
    const sx = bg.scaleX;
    const sy = bg.scaleY;
    bg.on('pointerdown', () => {
      this.tweens.add({ targets: [bg, label], scaleX: sx * 0.92, scaleY: sy * 0.92, duration: 80, yoyo: true, ease: 'Quad.easeOut' });
      onTap();
    });
  }

  /** 공용 헤더(로비/게임과 동일 좌표·정렬·지갑 코인) + 우상단 메뉴(→ 설정 팝업). */
  private buildHeader(): void {
    this.header = buildHudHeader(this, { coins: this.coins, onMenu: () => this.openMenu(), depth: 500 });
  }

  /** 헤더 메뉴(햄버거) → 설정 팝업(사운드 토글 + 데이터 편집 + 로비로). 데이터 편집 후 코인/버튼 재동기화. */
  private openMenu(): void {
    openSettingsMenu(this, {
      onHome: () => this.goLobby(),
      homeLabel: '로비로',
      onDataChanged: () => {
        this.coins = loadCoins();
        this.header?.setCoins(this.coins);
        this.refreshAll();
      },
      onHotelReset: () => this.resetHotelStages(), // ⭐설정 → 시설 업그레이드 리셋 → 스테이지1 로 재시작
      onSimReset: () => this.fullSimReset(), // ⭐설정 → 전체 시뮬 리셋(보상미션 포함) → 새로고침
      // ⭐테스트 버튼 — 공격받음 봉투 연출 트리거(목업). 업그레이드 가능한 첫 시설을 공격 상태로.
      devButtons: [
        {
          label: '🗡 공격 연출',
          color: 0x8a4a2a,
          onTap: () => {
            const s = this.firstAttackableSlot();
            if (s >= 0) this.markAttacked(s, 'David');
            else showToast(this, '공격 가능한 시설이 없습니다', { color: '#ff9a9a' });
          },
        },
      ],
    });
  }

  /** ⭐전체 시뮬 리셋(데이터 패널) — 모든 socialcasino_* 저장 제거(보상미션·스핀·코인·시설·텔레메트리) 후 새로고침.
   *  PlayScene.resetAllSaves 와 동일 SSOT(resetSim). 호텔 화면에서도 초기 상태부터 시뮬을 반복할 수 있게. */
  private fullSimReset(): void {
    this.leaving = true; // ⭐이후 업그레이드/스테이지 정산이 코인·호텔을 재저장하지 못하게(리셋 씹힘 방지)
    this.time.removeAllEvents();
    resetSimulationData();
    try {
      clearLedger();
    } catch {
      /* 텔레메트리 실패 무시 */
    }
    showToast(this, `초기화 — ${SIM_RESET_SUMMARY}`, { color: '#ff9a9a' });
    this.time.delayedCall(400, () => {
      try {
        window.location.reload();
      } catch {
        this.scene.start('lobby');
      }
    });
  }

  /** ⭐Main/메뉴 → 게임 로비(lobby) 복귀. */
  private goLobby(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.fadeOutThen(() => this.scene.start('lobby'), 220);
  }

  /** 페이드아웃 후 콜백 — **FADE_OUT_COMPLETE 미발화 방어 트윈 폴백** 포함(스테이지 전환/리셋/로비 공용).
   *  카메라 이벤트가 누락돼도 트윈 onComplete 가 한 번은 콜백을 보장(둘 중 먼저 도착한 것만 실행). */
  private fadeOutThen(cb: () => void, ms = 280): void {
    this.cameras.main.fadeOut(ms, 26, 16, 48);
    let done = false;
    const go = (): void => {
      if (done) return;
      done = true;
      if (this.scene.isActive()) cb();
    };
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, go);
    this.tweens.addCounter({ from: 0, to: 1, duration: ms + 120, onComplete: go });
  }

  // ── 영속 ──
  private loadHotelRaw(): string | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(HOTEL_SAVE_KEY) : null;
    } catch {
      return null;
    }
  }
  private saveHotel(): void {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(HOTEL_SAVE_KEY, serializeHotel(this.hotel));
    } catch {
      /* 무시 */
    }
  }

  /** 레이아웃 누락 시 — 배경 + 안내 + 탭하면 로비. */
  private mountFallback(): void {
    this.add
      .rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H, 0x214a7a)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.goLobby());
    this.add
      .text(DESIGN_W / 2, DESIGN_H / 2, 'MY HOTEL\n\n(레이아웃 로드 실패)\nTAP TO RETURN', { fontFamily: HEADER_FONT, fontSize: '48px', color: '#ffffff', align: 'center' })
      .setOrigin(0.5);
  }
}
