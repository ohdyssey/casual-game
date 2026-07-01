/**
 * LobbyScene — 로비(홈) 화면.
 *
 * 디자이너가 에디터(phaser-ui-editor)에서 재디자인한 로비 레이아웃(ui/layouts/blank_2.json,
 * screen "로비")을 SSOT 로 렌더한다 — 헤더(프로필·레벨·코인·메뉴)·사이드 아이콘(상점·할인·리그·
 * 미션)·하단 4메뉴·중앙 PLAY 버튼이 전부 에디터 디자인 그대로.
 *
 * ⚠️ 현재는 **PLAY 버튼 → play, 이벤트 버튼 → 팝업**만 기능 연결. 나머지 버튼(상점/미션/프로필 등)의
 *    기능 배선은 추후 — 지금은 화면만 렌더하고 그 둘만 살린다.
 */
import Phaser from 'phaser';
import { DESIGN_W, DESIGN_H } from './PlayScene.js';
import { buildLayout, type LayoutDoc } from '../ui/layoutLoader.js';
import { buildNewHeader, NEW_HEADER_KEYS } from '../ui/newHeader.js';
import { uploadPath, ensureFonts, collectLayoutFonts } from '../assets.js';
import { loadCoins } from '../logic/wallet.js';
import { loadSpins } from '../logic/playerState.js';
import { SHOP_CATALOG, applyPurchase, type ShopKind, type ShopItem } from '../logic/shop.js';
import { formatCompact } from '../logic/hotelUpgrade.js';
import { openSettingsMenu } from '../ui/settingsMenu.js';
import { startBgm } from '../audio.js';
import { FountainSpray } from '../ui/fountainSpray.js';

/**
 * ⛲ 진입화면 분수대 물줄기 위치 — 배경(up_SC_BG_02-1, depth 6)에 베이크된 분수의 분출구 위치(캔버스 1080×2400 기준,
 *   화면 비율로 산출). depth 8 = 분수 배경 위·PLAY 버튼(depth 9) 아래. 분수 아트가 옮겨지면 이 좌표만 조정한다.
 */
const FOUNTAIN = { x: 830, y: 1455, depth: 8 } as const; // 분출구 — 조금 위쪽으로(요청 2026-06-30, 1515→1455)

/** 로비 레이아웃(에디터 "로비" 화면) 캐시 키 + 경로 — LoadScene 이 미리 받아두면 전환이 즉각적. */
export const LOBBY_LAYOUT_KEY = 'lobby_layout';
export const LOBBY_LAYOUT_PATH = 'ui/layouts/blank_2.json';

/** 이벤트 팝업(에디터 "팝업화면" — blank_copy.json) 캐시 키 + 경로. */
export const POPUP_LAYOUT_KEY = 'popup_layout';
export const POPUP_LAYOUT_PATH = 'ui/layouts/blank_copy.json';

/** ⭐상점 화면(에디터 "빈 화면" — blank_4.json, 720×1600). 로비 Shop 아이콘 → 팝업 오버레이로 1.5× 스케일 렌더. */
export const SHOP_LAYOUT_KEY = 'shop_layout';
export const SHOP_LAYOUT_PATH = 'ui/layouts/blank_4.json';
/** 로비 상점 아이콘(좌상단). 키 버전업 견디게 위치 폴백(x<270·200<y<420). */
const SHOP_ICON_KEY = 'up_SC_UI_30-1';

/** ⭐구매 결정(구매/취소) 팝업 — 디자이너 에디터 "구매결정"(blank_5_copy.json, 720×1600). 상점 구매 버튼 탭 시 확인 팝업. */
export const CONFIRM_LAYOUT_KEY = 'confirm_layout';
export const CONFIRM_LAYOUT_PATH = 'ui/layouts/blank_5_copy.json';
/** 구매 팝업 노드 id(blank_5_copy.json 매핑). `#숫자`는 자리표시자 — 실제 수량/가격으로 치환(# 미표시). */
const CP = {
  bg: 'layer_1', // 팝업 아트(프레임·PURCHASE 배너·닫기 X 베이크인)
  titleQty: 'layer_2_copy2', // "#100 SPINS" → "{수량} {종류}"
  question: 'layer_2_copy5', // "Would you like to purchase this for $1.99?"
  priceBig: 'layer_2_copy4', // "$#1.99" → 가격
  icon: 'layer_3_copy', // 아이템 아이콘(종류별 스왑)
  selQty: 'layer_2_copy8', // "#100" → 수량
  buyBtn: 'layer_4', // BUY 버튼 배경(up_SC_UI_45_v3)
  cancelBtn: 'layer_4_copy', // CANCEL 버튼 배경(up_SC_UI_46_v3)
} as const;
/** 종류별 표시 라벨 + 아이콘 키. */
const KIND_LABEL: Record<ShopKind, string> = { coins: 'GOLD', spins: 'SPINS', gems: 'GEMS' };
const KIND_ICON: Record<ShopKind, string> = { coins: 'up_CoinItem_01_v2', spins: 'up_SpinItem_02_v2', gems: 'up_GemItem_01_v2' };

/** PLAY 버튼 텍스처 키(에디터 노드 "플레이 아이콘"). ⭐2026-06-29 에디터 재변경(up_SC_UI_34→up_SC_UI_34-1). */
const PLAY_KEY = 'up_SC_UI_34-1';

/** ⭐My Hotel 진입 = 로비 하단 메뉴 2번째 아이콘(blank_2 라벨 "My Hotel"). 베이스 키 up_SC_UI_38 의 버전 변형
 *  (`up_SC_UI_38_v3`/`_v4` …)을 **접두 매칭**으로 견딘다 — 디자이너 재익스포트로 버전이 바뀌어도 배선 유지(2026-06-30 v3→v4로 진입 불가 버그 수정). (1번 up_SC_UI_37* 는 "Today".) */
const HOTEL_MENU_PREFIX = 'up_SC_UI_38';

export class LobbyScene extends Phaser.Scene {
  /** 열려 있는 이벤트 팝업 레이어(딤 배경 + 팝업 오브젝트). 없으면 닫힌 상태. */
  private popupLayer?: Phaser.GameObjects.Container;
  /** 열려 있는 상점 레이어(딤 + 상점 + 닫기X). 없으면 닫힌 상태. */
  private shopLayer?: Phaser.GameObjects.Container;
  /** 구매 결정(확인/취소) 팝업 레이어 — 임시. 없으면 닫힌 상태. */
  private confirmLayer?: Phaser.GameObjects.Container;
  /** 헤더 코인/스핀 텍스트 — 상점 구매 후 갱신용. */
  private coinHeaderText?: Phaser.GameObjects.Text;
  private spinHeaderText?: Phaser.GameObjects.Text;
  /** ⭐바람 따라 흐르는 구름(70% 투명) — update()에서 한 방향으로 서서히 드리프트 + 화면 밖 시 반대편 재진입(루프). */
  private clouds: Array<{ obj: Phaser.GameObjects.Image; speed: number; halfW: number }> = [];
  /** ⛲ 진입화면 분수대 물줄기(파티클). 씬 종료 시 정리. */
  private fountain?: FountainSpray;

  constructor() {
    super('lobby');
  }

  preload(): void {
    // LoadScene 이 미리 받았으면 캐시에 있음 — 없을 때만(직접 부팅·씬 재시작 방어) 적재.
    if (!this.cache.json.exists(LOBBY_LAYOUT_KEY)) this.load.json(LOBBY_LAYOUT_KEY, LOBBY_LAYOUT_PATH);
    if (!this.cache.json.exists(POPUP_LAYOUT_KEY)) this.load.json(POPUP_LAYOUT_KEY, POPUP_LAYOUT_PATH);
    if (!this.cache.json.exists(SHOP_LAYOUT_KEY)) this.load.json(SHOP_LAYOUT_KEY, SHOP_LAYOUT_PATH);
    if (!this.cache.json.exists(CONFIRM_LAYOUT_KEY)) this.load.json(CONFIRM_LAYOUT_KEY, CONFIRM_LAYOUT_PATH); // 구매 결정 팝업
  }

  create(): void {
    this.popupLayer = undefined; // 씬 재진입(play→lobby) 시 이전 팝업 참조 초기화
    this.shopLayer = undefined;
    this.confirmLayer = undefined;
    startBgm(this); // ⭐배경음(Lucky Lounge) 시작 — 전 화면 공통(단일 인스턴스, 오디오 잠금 시 첫 입력에 자동)
    this.cameras.main.fadeIn(220, 26, 16, 48); // #1A1030 에서 부드럽게 진입

    const doc = this.cache.json.get(LOBBY_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!doc || !Array.isArray(doc.nodes) || doc.nodes.length === 0) {
      this.mountFallback();
      return;
    }

    // 로비 이미지는 보통 LoadScene 의 매니페스트 적재로 캐시됨 — 누락분만 직접 적재(방어적).
    let queued = 0;
    for (const n of doc.nodes) {
      if (n.type === 'image' && n.key && !this.textures.exists(n.key)) {
        this.load.image(n.key, uploadPath(n.key));
        queued++;
      }
    }
    // ⭐신 헤더(up_NewUI_04-*)는 blank_2 노드가 아니므로 별도 적재(로비 직접진입/매니페스트 레이스 대비).
    for (const key of NEW_HEADER_KEYS) {
      if (!this.textures.exists(key)) {
        this.load.image(key, uploadPath(key));
        queued++;
      }
    }
    const start = (): void => void this.ensureFontsThenMount(doc);
    if (queued > 0) {
      this.load.once(Phaser.Loader.Events.COMPLETE, start);
      this.load.start();
    } else {
      start();
    }
  }

  /** ⭐로비 레이아웃에 쓰인 폰트(에디터 지정: Bungee·Russo One 등)를 **렌더 전에 적재**한 뒤 mount — 폴백 폰트로 굳는 것 방지. */
  private async ensureFontsThenMount(doc: LayoutDoc): Promise<void> {
    try {
      await ensureFonts(collectLayoutFonts([doc]));
    } catch {
      /* 폰트 실패 시 폴백으로 진행 */
    }
    if (this.scene.isActive()) this.mountLobby(doc);
  }

  /** 레이아웃 렌더 + PLAY 버튼만 기능 연결. */
  private mountLobby(doc: LayoutDoc): void {
    const index = buildLayout(this, doc);
    this.setupClouds(index); // ⭐구름 70% 투명 + 바람 드리프트 배선

    // ⛲ 분수대 물줄기 — 배경에 그려진 분수 위로 물이 솟구쳐 떨어지는 연출(상시). 씬 종료 시 정리.
    this.fountain?.destroy();
    this.fountain = new FountainSpray(this, FOUNTAIN.x, FOUNTAIN.y, FOUNTAIN.depth);
    if (import.meta.env?.DEV) {
      (globalThis as Record<string, unknown>).__fountain = this.fountain;
      // 🔧임시 정렬 마커: 분출구(노랑)·수반(자홍). 정렬 확인 후 제거.
      if ((globalThis as Record<string, unknown>).__fountainDebug) {
        this.add.circle(FOUNTAIN.x, FOUNTAIN.y, 8, 0xffff00).setDepth(999);
        this.add.circle(FOUNTAIN.x, FOUNTAIN.y + 150, 8, 0xff00ff).setDepth(999);
      }
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.fountain?.destroy();
      this.fountain = undefined;
    });

    // ⭐헤더/메뉴 통일(요청 2026-07-02): 구 blank_2 헤더(골드바 up_SC_UI_42-1* + 코인/스핀/라이프 텍스트)를 숨기고,
    //   게임화면과 동일한 **신 헤더(up_NewUI_04-*)** 로 교체 — 원 목업 지시 "헤더 재수정 > 전체 필요화면 사용".
    index
      .entries()
      .filter((e) => (e.node.key ?? '').startsWith('up_SC_UI_42-1') || (e.node.type === 'text' && e.node.y < 200))
      .forEach((e) => (e.obj as Phaser.GameObjects.Image | undefined)?.setVisible(false));
    const newHeader = buildNewHeader(this, {
      coins: loadCoins(),
      onMenu: () =>
        openSettingsMenu(this, {
          onDataChanged: () => this.refreshHeaderCurrencies(),
          onShop: () => this.openShop(),
        }),
    });
    this.coinHeaderText = newHeader.coinText; // 코인=공유 지갑(상점 구매 후 refreshHeaderCurrencies 로 갱신)
    this.spinHeaderText = undefined; // 신 헤더엔 스핀 표기 없음(게임 내 250/50 로 이동)
    this.refreshHeaderCurrencies();

    // PLAY 노드: 키(up_SC_UI_34) 우선, 못 찾으면 이름("플레이 아이콘", '복사' 배너 제외)으로 폴백.
    const entries = index.entries();
    const playObj =
      entries.find((e) => e.node.key === PLAY_KEY)?.obj ??
      entries.find((e) => (e.node.name ?? '').startsWith('플레이') && !(e.node.name ?? '').includes('복사'))?.obj;

    if (playObj) {
      this.wirePlay(playObj as Phaser.GameObjects.Image);
    } else if (import.meta.env?.DEV) {
      console.warn(`[lobby] PLAY 노드(${PLAY_KEY})를 찾지 못함 — 레이아웃 키 확인 필요`);
    }

    // 이벤트 버튼 = 좌측 하단 사이드 아이콘(화면상 Shop 아래 선물상자). 아이콘 art/키가 버전업돼도
    //   견고하도록 **위치**로 식별(좌측 열 x<270 · 하단 행 480<y<800).
    const eventObj = entries.find(
      (e) => e.node.type === 'image' && e.node.x < 270 && e.node.y > 480 && e.node.y < 800,
    )?.obj as Phaser.GameObjects.Image | undefined;
    if (eventObj) {
      this.wireEventButton(eventObj);
    } else if (import.meta.env?.DEV) {
      console.warn('[lobby] 이벤트 버튼(좌측 하단 아이콘)을 찾지 못함 — 레이아웃 좌표 확인 필요');
    }

    // ⭐My Hotel 진입 — 하단 메뉴 아이콘(up_SC_UI_38* 접두 매칭) → hotel 씬. 버전 접미(_v3/_v4) 변경에 견딤.
    const hotelObj = entries.find((e) => (e.node.key ?? '').startsWith(HOTEL_MENU_PREFIX))?.obj as Phaser.GameObjects.Image | undefined;
    if (hotelObj) {
      this.wireHotelButton(hotelObj);
    } else if (import.meta.env?.DEV) {
      console.warn(`[lobby] My Hotel 메뉴 아이콘(${HOTEL_MENU_PREFIX}*)을 찾지 못함 — 레이아웃 키 확인 필요`);
    }

    // ⭐상점 아이콘(좌상단) → 상점 팝업. 키 우선, 위치(x<270·200<y<420) 폴백.
    const shopObj = (entries.find((e) => e.node.key === SHOP_ICON_KEY) ??
      entries.find((e) => e.node.type === 'image' && e.node.x < 270 && e.node.y > 200 && e.node.y < 420))?.obj as
      | Phaser.GameObjects.Image
      | undefined;
    if (shopObj) {
      this.wireShopButton(shopObj);
    } else if (import.meta.env?.DEV) {
      console.warn(`[lobby] 상점 아이콘(${SHOP_ICON_KEY})을 찾지 못함 — 레이아웃 키/좌표 확인 필요`);
    }

    // (헤더 햄버거 메뉴는 신 헤더(buildNewHeader)의 up_NewUI_04-6 노드가 담당 — 구 투명 히트존 폐지.)
  }

  /**
   * ⭐구름 배선(요청 2026-06-29) — 분리 배치된 각 구름을 **70% 투명**으로 두고, **바람 따라 한 방향으로 서서히 드리프트**.
   *   화면 밖으로 나가면 반대편에서 재진입(끊김 없는 루프). 구름마다 속도를 약간 달리해 자연스럽게(크기는 디자이너 배치 유지).
   *   (이름이 "구름"으로 시작하는 이미지 노드를 구름으로 식별 — 배경/하늘은 제외.)
   */
  private setupClouds(index: ReturnType<typeof buildLayout>): void {
    this.clouds = [];
    // 구름 이미지 노드 수집(이름이 "구름"으로 시작 — 배경/하늘 제외).
    const imgs: Phaser.GameObjects.Image[] = [];
    for (const e of index.entries()) {
      if ((e.node.name ?? '').startsWith('구름') && e.obj instanceof Phaser.GameObjects.Image) imgs.push(e.obj);
    }
    if (imgs.length === 0) return;
    // ⭐왼쪽부터 **겹치지 않는 불규칙 간격의 줄**로 배치(요청: 몰려다니지 않고 서로 떨어져 보이게).
    //   구름 폭이 슬롯보다 커도 겹치지 않도록 순차 배치(재진입 recycleCloud 과 동일한 컨베이어 룩). 고도(y)는 디자이너 배치 유지.
    let cursor = -40 - Math.random() * 160; // 왼쪽에서 살짝 들어간 불규칙 시작점
    imgs.forEach((img) => {
      img.setAlpha(0.7); // 70% 투명도
      const halfW = img.displayWidth / 2;
      img.x = cursor + halfW;
      cursor = img.x + halfW + (140 + Math.random() * 280); // 다음 구름까지 불규칙 간격(겹침 방지)
      const speed = 16 + Math.random() * 10; // px/sec — 바람 속도 불규칙(고정 패턴 X)
      this.clouds.push({ obj: img, speed, halfW });
    });
  }

  /** 매 프레임 — 구름을 바람 방향(오른쪽)으로 이동, 완전히 화면 밖이면 재배치(루프). */
  update(_time: number, delta: number): void {
    if (this.clouds.length === 0) return;
    const dt = delta / 1000;
    for (const c of this.clouds) {
      c.obj.x += c.speed * dt;
      if (c.obj.x - c.halfW > DESIGN_W) this.recycleCloud(c); // 오른쪽 끝 통과 → 흩어진 채 재진입
    }
  }

  /** ⭐오른쪽 밖으로 나간 구름을 **가장 왼쪽 구름보다 더 왼쪽**에 불규칙 간격으로 되돌려 재진입 — 다시 몰리지 않고 흩어진 채 순환. */
  private recycleCloud(c: { obj: Phaser.GameObjects.Image; speed: number; halfW: number }): void {
    let leftEdge = -c.halfW; // 다른 구름이 없을 때 기본(왼쪽 밖)
    for (const o of this.clouds) {
      if (o === c) continue;
      leftEdge = Math.min(leftEdge, o.obj.x - o.halfW);
    }
    const gap = 80 + Math.random() * 320; // 불규칙 간격(겹침 방지 최소 + 랜덤)
    c.obj.x = leftEdge - gap - c.halfW;
  }

  /** 헤더 코인/스핀 텍스트를 영속 잔액으로 갱신(상점 구매 후·진입 시). */
  private refreshHeaderCurrencies(): void {
    this.coinHeaderText?.setText(loadCoins().toLocaleString('en-US'));
    this.spinHeaderText?.setText(loadSpins().toLocaleString('en-US'));
  }

  /** 상점 아이콘 → 상점 팝업 열기(누름 피드백). */
  private wireShopButton(btn: Phaser.GameObjects.Image): void {
    btn.setInteractive({ useHandCursor: true });
    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__shopBtn = btn;
    const sx = btn.scaleX;
    const sy = btn.scaleY;
    btn.on('pointerdown', () => {
      if (this.shopLayer) return; // 이미 열려 있으면 무시
      this.tweens.add({ targets: btn, scaleX: sx * 0.9, scaleY: sy * 0.9, duration: 80, yoyo: true, ease: 'Quad.easeOut' });
      this.openShop();
    });
  }

  /**
   * 상점 열기 — 에디터 상점 레이아웃(blank_4.json, 720×1600)을 **1.5× 스케일**(→1080×2400)로 팝업 오버레이에 렌더.
   *   누락 이미지 온디맨드 적재 → 폰트 선적재 → mount. 모달(딤은 입력만 차단, 닫기는 우상단 X).
   */
  private openShop(): void {
    if (this.shopLayer) return;
    const doc = this.cache.json.get(SHOP_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!doc || !Array.isArray(doc.nodes) || doc.nodes.length === 0) {
      if (import.meta.env?.DEV) console.warn('[lobby] 상점 레이아웃(blank_4.json)을 읽지 못함');
      return;
    }
    let queued = 0;
    for (const n of doc.nodes) {
      if (n.type === 'image' && n.key && !this.textures.exists(n.key)) {
        this.load.image(n.key, uploadPath(n.key));
        queued++;
      }
    }
    const proceed = async (): Promise<void> => {
      try {
        await ensureFonts(collectLayoutFonts([doc]));
      } catch {
        /* 폰트 실패 시 폴백 */
      }
      this.mountShop(doc);
    };
    if (queued > 0) {
      this.load.once(Phaser.Loader.Events.COMPLETE, () => void proceed());
      this.load.start();
    } else {
      void proceed();
    }
  }

  /** 상점 레이아웃 렌더(1.5× 스케일 컨테이너) + 구매 버튼 배선 + 닫기 X. */
  private mountShop(doc: LayoutDoc): void {
    if (this.shopLayer || !this.scene.isActive()) return;
    const layer = this.add.container(0, 0).setDepth(9500); // 이벤트 팝업(9000)보다 위
    this.shopLayer = layer;
    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__shop = layer;

    // 검은 반투명 딤(모달) — 뒤 로비 입력 차단. 상점은 전체화면이라 **탭으로 닫지 않음**(우상단 X 로만).
    const dim = this.add.rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W * 1.4, DESIGN_H * 1.2, 0x000000, 0.72).setInteractive();
    layer.add(dim);

    // 상점 내용(720×1600) → designW 비율(1.5×)로 스케일해 1080×2400 채움. 노드는 모두 컨테이너 자식.
    const scale = DESIGN_W / (doc.frame?.designW ?? 720);
    const content = this.add.container(0, 0).setScale(scale);
    const idx = buildLayout(this, doc);
    // ⚠️컨테이너 자식은 **삽입 순서**로 그려진다(자식의 setDepth 는 무시됨). 에디터 노드 배열에서
    //   골드/젬은 가격 텍스트가 버튼보다 먼저 와서, 버튼이 가격을 덮어 가렸다(스핀은 버튼이 먼저라 정상).
    //   → 노드의 depth 값(가격 depth > 버튼 depth, 디자이너가 올바로 지정)대로 정렬해 추가한다.
    const ordered = [...idx.entries()].sort((a, b) => (a.node.depth ?? 0) - (b.node.depth ?? 0));
    for (const e of ordered) content.add(e.obj);
    layer.add(content);

    this.wireShopButtons(idx); // 스핀/골드/젬 버튼 → 구매
    this.addShopClose(layer); // 우상단 닫기 X

    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 180, ease: 'Quad.easeOut' });
  }

  /** 구매 버튼(이름 스핀버튼/골드버튼/젬버튼) → x정렬로 티어 매핑 → SHOP_CATALOG 항목 배선. */
  private wireShopButtons(idx: ReturnType<typeof buildLayout>): void {
    const kindOf: Record<string, ShopKind> = { 스핀버튼: 'spins', 골드버튼: 'coins', 젬버튼: 'gems' };
    const byKind: Record<ShopKind, { x: number; obj: Phaser.GameObjects.Image }[]> = { spins: [], coins: [], gems: [] };
    for (const e of idx.entries()) {
      const kind = kindOf[e.node.name ?? ''];
      if (kind) byKind[kind].push({ x: e.node.x, obj: e.obj as Phaser.GameObjects.Image });
    }
    (['spins', 'coins', 'gems'] as ShopKind[]).forEach((kind) => {
      const items = SHOP_CATALOG[kind];
      byKind[kind]
        .sort((a, b) => a.x - b.x)
        .forEach((b, col) => {
          const item = items[col];
          if (item) this.wireBuyButton(b.obj, item);
        });
    });
  }

  /** 한 구매 버튼 → 탭 시 **구매 결정(확인/취소) 팝업**(누름 피드백). 확인해야 실제 지급. */
  private wireBuyButton(btn: Phaser.GameObjects.Image, item: ShopItem): void {
    btn.setInteractive({ useHandCursor: true });
    const sx = btn.scaleX;
    const sy = btn.scaleY;
    btn.on('pointerdown', () => {
      this.tweens.add({ targets: btn, scaleX: sx * 0.9, scaleY: sy * 0.9, duration: 80, yoyo: true, ease: 'Quad.easeOut' });
      this.confirmPurchase(item);
    });
  }

  /** ⭐구매 결정 팝업 = 디자이너 에디터 "구매결정"(blank_5_copy.json). `#숫자`(수량·가격) 자리표시자를 실제 값으로 치환,
   *  아이콘은 종류별 스왑, BUY/CANCEL/닫기X 배선. 레이아웃/이미지 로드 실패 시 코드 드로잉 폴백. */
  private confirmPurchase(item: ShopItem): void {
    if (this.confirmLayer) return; // 중복 방지
    const doc = this.cache.json.get(CONFIRM_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!doc || !Array.isArray(doc.nodes) || doc.nodes.length === 0) {
      this.confirmPurchaseFallback(item);
      return;
    }
    // 팝업 이미지(아트·버튼·아이콘 3종) 적재 후 마운트(누락분만).
    const need = new Set<string>();
    for (const n of doc.nodes) if (n.type === 'image' && n.key) need.add(n.key);
    for (const k of Object.values(KIND_ICON)) need.add(k); // 종류별 아이콘 전부(스왑용)
    let queued = 0;
    for (const key of need) if (!this.textures.exists(key)) { this.load.image(key, uploadPath(key)); queued++; }
    const proceed = async (): Promise<void> => {
      try { await ensureFonts(collectLayoutFonts([doc])); } catch { /* 폰트 폴백 */ }
      this.mountConfirm(doc, item);
    };
    if (queued > 0) {
      this.load.once(Phaser.Loader.Events.COMPLETE, () => void proceed());
      this.load.start();
    } else {
      void proceed();
    }
  }

  /** 구매 결정 팝업 렌더(blank_5_copy 1.5× 스케일) + `#숫자` 치환 + 아이콘 스왑 + BUY/CANCEL/X 배선. */
  private mountConfirm(doc: LayoutDoc, item: ShopItem): void {
    if (this.confirmLayer || !this.scene.isActive()) return;
    const layer = this.add.container(0, 0).setDepth(9700); // 상점(9500)보다 위
    this.confirmLayer = layer;
    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__shopConfirm = layer;

    const dim = this.add.rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W * 1.4, DESIGN_H * 1.2, 0x000000, 0.55).setInteractive();
    dim.on('pointerdown', () => this.closeConfirm()); // 바깥 탭 = 취소
    layer.add(dim);

    // 레이아웃(720×1600)을 1.5× 스케일 컨테이너로. ⚠️컨테이너 자식은 삽입 순서로 그려지므로 depth 오름차순으로 추가.
    const scale = DESIGN_W / (doc.frame?.designW ?? 720);
    const content = this.add.container(0, 0).setScale(scale);
    const idx = buildLayout(this, doc);
    const ordered = [...idx.entries()].sort((a, b) => (a.node.depth ?? 0) - (b.node.depth ?? 0));
    for (const e of ordered) content.add(e.obj);
    layer.add(content);

    const byId = new Map<string, Phaser.GameObjects.GameObject>(idx.entries().map((e) => [e.node.id, e.obj]));
    const txt = (id: string): Phaser.GameObjects.Text | undefined => byId.get(id) as Phaser.GameObjects.Text | undefined;
    // 수량 표기 — 코인은 축약(10M), 스핀/젬은 천단위 콤마.
    const qty = item.kind === 'coins' ? formatCompact(item.amount) : item.amount.toLocaleString('en-US');
    // `#숫자` 자리표시자 → 실제 값(# 미표시). 가격은 item.price("$1.99") 그대로.
    txt(CP.titleQty)?.setText(`${qty} ${KIND_LABEL[item.kind]}`);
    txt(CP.selQty)?.setText(qty);
    txt(CP.priceBig)?.setText(item.price);
    const q = txt(CP.question);
    if (q) q.setText((q.text ?? '').replace(/\$\s*#?\s*[\d.,]+/, item.price)); // "...for $1.99?" → 실제 가격

    // 아이콘 종류별 스왑(표시 크기 유지).
    const icon = byId.get(CP.icon) as Phaser.GameObjects.Image | undefined;
    const iconKey = KIND_ICON[item.kind];
    if (icon && icon.texture.key !== iconKey && this.textures.exists(iconKey)) {
      const dw = icon.displayWidth;
      const dh = icon.displayHeight;
      icon.setTexture(iconKey).setDisplaySize(dw, dh);
    }

    // BUY → 구매 적용 + 닫기 / CANCEL → 닫기 (둘 다 버튼 배경 이미지 탭).
    const buy = byId.get(CP.buyBtn) as Phaser.GameObjects.Image | undefined;
    const cancel = byId.get(CP.cancelBtn) as Phaser.GameObjects.Image | undefined;
    if (buy) this.wirePressable(buy, () => { this.closeConfirm(); this.purchase(item); });
    if (cancel) this.wirePressable(cancel, () => this.closeConfirm());
    // 닫기 X(팝업 아트에 베이크인) — 우상단에 투명 히트존.
    const bg = byId.get(CP.bg) as Phaser.GameObjects.Image | undefined;
    if (bg) {
      const b = bg.getBounds();
      const x = this.add.rectangle(b.right - b.width * 0.07, b.top + b.height * 0.06, 120, 120, 0x000000, 0).setInteractive({ useHandCursor: true });
      x.on('pointerdown', () => this.closeConfirm());
      layer.add(x);
    }

    layer.setScale(0.85).setAlpha(0);
    this.tweens.add({ targets: layer, scaleX: 1, scaleY: 1, alpha: 1, duration: 170, ease: 'Back.easeOut' });
  }

  /** 버튼 이미지 탭 → 누름 피드백 + 콜백(BUY/CANCEL 공용). */
  private wirePressable(btn: Phaser.GameObjects.Image, onTap: () => void): void {
    btn.setInteractive({ useHandCursor: true });
    const sx = btn.scaleX;
    const sy = btn.scaleY;
    btn.on('pointerdown', () => {
      this.tweens.add({ targets: btn, scaleX: sx * 0.92, scaleY: sy * 0.92, duration: 80, yoyo: true, ease: 'Quad.easeOut' });
      onTap();
    });
  }

  /** 코드 드로잉 폴백 — 구매 결정 팝업 레이아웃/이미지 로드 실패 시. */
  private confirmPurchaseFallback(item: ShopItem): void {
    if (this.confirmLayer) return; // 중복 방지
    const layer = this.add.container(0, 0).setDepth(9700); // 상점(9500)보다 위
    this.confirmLayer = layer;
    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__shopConfirm = layer;

    const dim = this.add.rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W * 1.4, DESIGN_H * 1.2, 0x000000, 0.55).setInteractive();
    dim.on('pointerdown', () => this.closeConfirm()); // 바깥 탭 = 취소
    layer.add(dim);

    const cx = DESIGN_W / 2;
    const cy = DESIGN_H / 2;
    const panel = this.add.rectangle(cx, cy, 780, 520, 0xfff4e0, 1).setStrokeStyle(8, 0xffd34d);
    layer.add(panel);

    const amountStr =
      item.kind === 'coins'
        ? `${item.amount.toLocaleString('en-US')} GOLD`
        : item.kind === 'spins'
          ? `${item.amount.toLocaleString('en-US')} SPINS`
          : `${item.amount} GEMS`;
    const accent = item.kind === 'coins' ? '#c98a16' : item.kind === 'spins' ? '#1f7fa8' : '#7a3fc0';
    const title = this.add
      .text(cx, cy - 150, amountStr, { fontFamily: '"Russo One", "Jua", sans-serif', fontSize: '64px', color: accent, stroke: '#2a1640', strokeThickness: 6 })
      .setOrigin(0.5);
    const sub = this.add
      .text(cx, cy - 50, `${item.price} 에 구매하시겠습니까?`, { fontFamily: '"Do Hyeon", "Jua", sans-serif', fontSize: '40px', color: '#5a3b1a' })
      .setOrigin(0.5);
    const temp = this.add
      .text(cx, cy + 18, '(임시 — 실제 결제 없음)', { fontFamily: '"Do Hyeon", "Jua", sans-serif', fontSize: '24px', color: '#a07b4a' })
      .setOrigin(0.5);
    layer.add(title);
    layer.add(sub);
    layer.add(temp);

    // 구매(초록) · 취소(빨강) 버튼.
    this.confirmButton(layer, cx - 200, cy + 150, 0x49b148, `구매 ${item.price}`, () => {
      this.closeConfirm();
      this.purchase(item);
    });
    this.confirmButton(layer, cx + 200, cy + 150, 0xc0463a, '취소', () => this.closeConfirm());

    layer.setScale(0.85).setAlpha(0);
    this.tweens.add({ targets: layer, scaleX: 1, scaleY: 1, alpha: 1, duration: 170, ease: 'Back.easeOut' });
  }

  /** 확인 팝업 버튼(둥근 사각 + 라벨 + 누름 피드백). */
  private confirmButton(layer: Phaser.GameObjects.Container, x: number, y: number, color: number, label: string, onTap: () => void): void {
    const w = 320;
    const h = 130;
    const bg = this.add.rectangle(x, y, w, h, color, 1).setStrokeStyle(5, 0xffffff, 0.85).setInteractive({ useHandCursor: true });
    const txt = this.add.text(x, y, label, { fontFamily: '"Russo One", "Jua", sans-serif', fontSize: '42px', color: '#ffffff', stroke: '#2a1640', strokeThickness: 4 }).setOrigin(0.5);
    bg.on('pointerdown', () => {
      this.tweens.add({ targets: [bg, txt], scaleX: 0.92, scaleY: 0.92, duration: 80, yoyo: true, ease: 'Quad.easeOut' });
      onTap();
    });
    layer.add(bg);
    layer.add(txt);
  }

  /** 구매 결정 팝업 닫기. */
  private closeConfirm(): void {
    const layer = this.confirmLayer;
    if (!layer) return;
    this.confirmLayer = undefined;
    this.tweens.add({ targets: layer, alpha: 0, duration: 120, ease: 'Quad.easeIn', onComplete: () => layer.destroy(true) });
  }

  /** 구매 적용(목업 — 결제 SDK 없음): 영속 가산 + 헤더 갱신 + "+N" 피드백. */
  private purchase(item: ShopItem): void {
    applyPurchase(item); // 코인/스핀/젬 영속 가산
    this.refreshHeaderCurrencies();
    const label =
      item.kind === 'coins'
        ? `+${item.amount.toLocaleString('en-US')} GOLD`
        : item.kind === 'spins'
          ? `+${item.amount.toLocaleString('en-US')} SPINS`
          : `+${item.amount} GEMS`;
    const color = item.kind === 'coins' ? '#ffe27a' : item.kind === 'spins' ? '#9be1ff' : '#c9a8ff';
    const t = this.add
      .text(DESIGN_W / 2, DESIGN_H * 0.46, label, {
        fontFamily: '"Russo One", "Jua", sans-serif',
        fontSize: '64px',
        color,
        stroke: '#2a1640',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(9600)
      .setScale(0.5);
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, y: t.y - 130, alpha: 0, delay: 500, duration: 700, ease: 'Quad.easeIn', onComplete: () => t.destroy() });
  }

  /** 상점 닫기 — blank_4 배경 아트의 **크라운 우하단에 X 가 베이크**돼 있어(이미지 닫기 버튼) 그 위에 **투명 히트존**만 얹는다(중복 그리기 없음). */
  private addShopClose(layer: Phaser.GameObjects.Container): void {
    const hit = this.add.rectangle(985, 642, 170, 170, 0xffffff, 0).setDepth(9600).setInteractive({ useHandCursor: true });
    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__shopClose = hit;
    hit.on('pointerdown', () => this.closeShop());
    layer.add(hit);
  }

  /** 상점 닫기 — 페이드아웃 후 정리 + 헤더 최신화. 열린 구매 결정 팝업도 함께 정리. */
  private closeShop(): void {
    const layer = this.shopLayer;
    if (!layer) return;
    this.shopLayer = undefined;
    this.closeConfirm();
    this.refreshHeaderCurrencies();
    this.tweens.add({ targets: layer, alpha: 0, duration: 140, ease: 'Quad.easeIn', onComplete: () => layer.destroy(true) });
  }

  /** 하단 메뉴 아이콘 → My Hotel(호텔 업그레이드) 진입. 누름 피드백 + 페이드. */
  private wireHotelButton(btn: Phaser.GameObjects.Image): void {
    btn.setInteractive({ useHandCursor: true });
    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__hotelBtn = btn;
    const sx = btn.scaleX;
    const sy = btn.scaleY;
    let started = false;
    btn.on('pointerdown', () => {
      if (started) return;
      started = true;
      btn.disableInteractive();
      this.tweens.add({
        targets: btn,
        scaleX: sx * 0.9,
        scaleY: sy * 0.9,
        duration: 90,
        yoyo: true,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.cameras.main.fadeOut(220, 26, 16, 48);
          this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('hotel'));
        },
      });
    });
  }

  /** 이벤트 버튼 → 이벤트 팝업 열기(누름 피드백 포함). */
  private wireEventButton(btn: Phaser.GameObjects.Image): void {
    btn.setInteractive({ useHandCursor: true });
    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__eventBtn = btn;
    const sx = btn.scaleX;
    const sy = btn.scaleY;
    btn.on('pointerdown', () => {
      if (this.popupLayer) return; // 이미 열려 있으면 무시
      this.tweens.add({ targets: btn, scaleX: sx * 0.9, scaleY: sy * 0.9, duration: 80, yoyo: true, ease: 'Quad.easeOut' });
      this.openEventPopup();
    });
  }

  /**
   * 이벤트 팝업 — 화면을 **검은색 반투명**으로 덮고 그 위에 에디터 "팝업화면"(blank_copy.json)을 렌더.
   * 딤(바깥) 탭 → 닫힘, 팝업 패널 탭 → 무시(클릭 삼킴). 딤+팝업을 한 컨테이너에 담아 함께 페이드/정리.
   */
  private openEventPopup(): void {
    if (this.popupLayer) return;
    const layer = this.add.container(0, 0).setDepth(9000);
    this.popupLayer = layer;
    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__popup = layer;

    // 검은색 반투명 딤 — 프레임 전체(+여백) 덮음 + 모달(뒤 로비 입력 차단). 탭하면 팝업이 닫힌다.
    //   팝업 패널이 화면을 거의 꽉 채워(1076px) 바깥 여백이 좁으므로, 딤만 인터랙티브로 두고 팝업
    //   오브젝트는 비인터랙티브로 둔다 → **아무 데나(패널 art 의 X 포함) 탭하면 닫힘**. 팝업 내부에
    //   기능 버튼이 추가되면 그 인터랙티브 자식이 자연히 딤보다 우선해 동작한다(현재는 콘텐츠 없음).
    const dim = this.add
      .rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W * 1.4, DESIGN_H * 1.2, 0x000000, 0.62)
      .setInteractive({ useHandCursor: false });
    dim.on('pointerdown', () => this.closeEventPopup());
    layer.add(dim);

    // 에디터 팝업 레이아웃 렌더 → 딤 위로 쌓기(컨테이너 삽입 순서 = 렌더 순서).
    const doc = this.cache.json.get(POPUP_LAYOUT_KEY) as LayoutDoc | undefined;
    if (doc && Array.isArray(doc.nodes) && doc.nodes.length > 0) {
      const idx = buildLayout(this, doc);
      for (const e of idx.entries()) layer.add(e.obj);
    } else if (import.meta.env?.DEV) {
      console.warn('[lobby] 팝업 레이아웃(blank_copy.json)을 읽지 못함');
    }

    // 등장: 페이드 인(딤은 0.62, 팝업은 1까지 — 컨테이너 알파가 자식에 곱해짐).
    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 160, ease: 'Quad.easeOut' });
  }

  /** 이벤트 팝업 닫기 — 페이드 아웃 후 컨테이너(딤+팝업) 파기. */
  private closeEventPopup(): void {
    const layer = this.popupLayer;
    if (!layer) return;
    this.popupLayer = undefined;
    this.tweens.add({
      targets: layer,
      alpha: 0,
      duration: 130,
      ease: 'Quad.easeIn',
      onComplete: () => layer.destroy(true),
    });
  }

  /** PLAY 버튼 → 게임(play) 진입. 누름 피드백 + 페이드 전환. */
  private wirePlay(btn: Phaser.GameObjects.Image): void {
    btn.setInteractive({ useHandCursor: true });
    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__lobbyPlay = btn;

    const sx = btn.scaleX;
    const sy = btn.scaleY;
    let started = false;
    btn.on('pointerdown', () => {
      if (started) return; // 중복 진입 방지
      started = true;
      btn.disableInteractive();
      this.tweens.add({
        targets: btn,
        scaleX: sx * 0.92,
        scaleY: sy * 0.92,
        duration: 90,
        yoyo: true,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.cameras.main.fadeOut(220, 26, 16, 48);
          this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('play'));
        },
      });
    });
  }

  /** 레이아웃을 못 읽을 때(디자인 누락) — 빈 배경 + 중앙 PLAY 히트존만. */
  private mountFallback(): void {
    this.add.rectangle(0, 0, DESIGN_W, DESIGN_H, 0x1a1030).setOrigin(0, 0);
    const zone = this.add.rectangle(540, 1824, 502, 319, 0xff0000, 0).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => {
      zone.disableInteractive();
      this.scene.start('play');
    });
  }
}
