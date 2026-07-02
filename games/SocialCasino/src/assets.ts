/**
 * assets.ts — 에디터 산출물(레이아웃 JSON + 업로드 이미지) 로드 + 게임플레이 카탈로그.
 *
 * 화면 크롬(배경·슬롯기계·HUD·패널·버튼)은 ui/layouts/main.json + ui-assets.json(매니페스트)이 SSOT.
 * **게임플레이 텍스처(슬롯 심볼·매치 퍼즐 타일)는 매니페스트와 별개로 경로 직접 로드**한다 —
 * 디자이너가 에디터에서 매니페스트를 재생성해도 게임 보드/릴이 깨지지 않도록(자체 소유).
 */
import type Phaser from 'phaser';
import { loadSfx, loadBgm } from './audio.js';

/** 에디터 산출물 — 레이아웃 JSON 캐시 키 + 업로드 매니페스트.
 *  ⚠️ 2026-07-02 3릴 재설계: 메인 SSOT 를 구 main.json → **main_copy.json("메인게임화면")** 로 전환.
 *  구 main.json 은 보관용으로 디스크에 잔존(archive/matchslot-city-v1 태그). */
export const UI_LAYOUT_KEY = 'ui_layout';
export const UI_LAYOUT_PATH = 'ui/layouts/main_copy.json';
/** (보관) 구 5릴 레이아웃 — 롤백/참조용. */
export const UI_LAYOUT_LEGACY_PATH = 'ui/layouts/main.json';
export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';

/** 업로드 디렉터리(경로 직접 로드용). */
const UPLOAD_DIR = 'ui/uploads';

/**
 * 업로드 에셋 확장자 — **prod 배포본은 WebP**(assemble-deploy 의 다이어트 변환 결과),
 * dev/원본은 PNG. 매니페스트(ui-assets.json)는 배포 시 경로가 .webp 로 재작성되지만,
 * 아래 **하드코딩 직접 로드**(심볼·퍼즐·시트·로비)는 매니페스트를 거치지 않으므로 이 스위치로 분기한다.
 *   (dev 는 항상 png → 디자이너 원본/HMR 무영향.)
 */
const UPLOAD_EXT = import.meta.env?.PROD ? 'webp' : 'png';
/** 업로드 키 → 로드 경로(prod=webp / dev=png). */
export const uploadPath = (key: string): string => `${UPLOAD_DIR}/${key}.${UPLOAD_EXT}`;

/** 슬롯 레버 스프라이트 시트(SC_UI_16-1~8, 각 164×319, 가로 8프레임). */
export const LEVER_SHEET_KEY = 'up_SC_UI_16_sheet';
export const LEVER_FW = 164;
export const LEVER_FH = 319;
export const LEVER_FRAMES = 8;

/** 코인 회전 스프라이트 시트(Coin_01-1~6, 각 146×148, 가로 6프레임). 코인 드랍/버스트 연출용. */
export const COIN_SHEET_KEY = 'up_SC_Coin_01_sheet';
export const COIN_FW = 146;
export const COIN_FH = 148;
export const COIN_FRAMES = 6;

/** 슬롯 릴 심볼 8종(slot3.ts SYMBOL_COUNT=8 과 1:1). 인덱스 = 심볼 종류.
 *  ⚠️ 2026-07-02 3릴 재설계: 디자이너 신 아트 up_NewUI_SlotSymbol_01~08 로 리포인트.
 *  인덱스 3(04)=금화→RAID · 인덱스 7(08)=망치→ATTACK (slot3.GOLD_SYMBOL/HAMMER_SYMBOL 과 정합). */
export const SLOT_SYMBOL_KEYS: ReadonlyArray<string> = [
  'up_NewUI_SlotSymbol_01',
  'up_NewUI_SlotSymbol_02',
  'up_NewUI_SlotSymbol_03',
  'up_NewUI_SlotSymbol_04', // 금화(RAID)
  'up_NewUI_SlotSymbol_05',
  'up_NewUI_SlotSymbol_06',
  'up_NewUI_SlotSymbol_07',
  'up_NewUI_SlotSymbol_08', // 망치(ATTACK)
];

/** 매치-3 퍼즐 일반 젬 7종(디자이너 Gem/Type01 — T01_01~07, 소스 D:\캐쥬얼 게임\SocialCasino\Gem\Type01).
 *  ⚠️ 2026-07-02 요청: **이전 퍼즐 디자인/UI 원복** — 신 아트(up_NewUI_Puzzle_*)에서 구 Gem/Type01 로 복귀.
 *  boardView 가 앞에서 TYPES(=5) 개만 사용. 특수 젬(공격/약탈/스핀)·매치 FX 도 함께 원복(SPECIAL_TILE_KEYS/SPECIAL_FX_KEY). */
export const PUZZLE_TILE_KEYS: ReadonlyArray<string> = [
  'up_Gem_T01_01',
  'up_Gem_T01_02',
  'up_Gem_T01_03',
  'up_Gem_T01_04',
  'up_Gem_T01_05',
  'up_Gem_T01_06',
  'up_Gem_T01_07',
];

/** ⭐**보상 게이지 수집 대상 = 노란 별 코인**(up_Gem_T01_01 = 퍼즐 타입 0). 이 코인을 매치로 제거한 수만 게이지에 누적된다.
 *   (수집 대상 변경 시 이 인덱스/키만 바꾸면 보드 카운트·게이지 아이콘이 함께 따라온다.) */
export const COLLECT_GEM_TYPE = 0;
export const COLLECT_GEM_KEY = PUZZLE_TILE_KEYS[COLLECT_GEM_TYPE];

/**
 * 특수 젬 3종(가끔 등장, 게임 핵심) — 인덱스 = 종류(board.ts SpecialKind 와 1:1).
 *   0 공격(T01_08) · 1 약탈(T01_09) · 2 스핀(T01_10). 색 매칭 안 하고 인접 매치로 수집된다.
 *   스핀 젬 수집 = 추가 스핀 확보. 공격/약탈 효과는 추후 연결.
 */
export const SPECIAL_TILE_KEYS: ReadonlyArray<string> = [
  'up_Gem_T01_08', // 공격
  'up_Gem_T01_09', // 약탈
  'up_Gem_T01_10', // 스핀
];

/**
 * 특수 젬 매치 이펙트(T01_11) — 전기 에너지 링. 특수 젬 3종(T01_08~10)은 아이콘 자체에 후광이
 * 베이크되어 있고, 이 이미지는 **매치 순간** 보드 뷰가 매치 지점에 터뜨리는 특수효과(확대·회전·발광)로 쓴다.
 */
export const SPECIAL_FX_KEY = 'up_Gem_T01_11';

/**
 * ⭐공격/약탈 발동 이미지 이펙트(디자이너 제작, 2026-06-29) — 기존 텍스트("ATTACK!/RAID!")를 워드아트 이미지로 대체.
 *   **타입 02(카지노 마퀴 프레임 워드아트)** 사용(요청). 발동 배너(attackBanner)가 약간 반투명 + 미세 유동으로 표시한다.
 */
export const ATTACK_FX_KEY = 'up_Effect_Attack_02';
export const RAID_FX_KEY = 'up_Effect_Raid_02';

/**
 * ⭐파워 타일 오버레이(Phase 2) — 색 젬 **위에 합성**하는 색 중립 오버레이 + 컬러폭탄 풀 스프라이트.
 *   stripeH/V·bomb 은 모든 색 젬 위에 공용으로 얹어 "색=젬 / 파워종류=오버레이"를 표현(색별 아트 불필요).
 *   현재는 임시 플레이스홀더(sharp 생성) — 디자이너 아트 도착 시 같은 키로 교체. boardView 가 런타임 합성.
 */
export const POWER_OVERLAY_KEYS = {
  stripeH: 'up_Power_StripeH',
  stripeV: 'up_Power_StripeV',
  bomb: 'up_Power_Bomb',
  color: 'up_Power_Color',
  halo: 'up_Power_Halo', // 특수젬 뒤 회전 후광 — T01_11 알파×0.5 반투명 버전(은은한 링)
} as const;

/** SPIN 버튼 상태: 평상시=up_SC_UI_11-1(레이아웃·매니페스트), 눌림=up_SC_UI_11-2(직접 로드). */
export const SPIN_BTN_KEY = 'up_SC_UI_11-1';
export const SPIN_BTN_PRESSED_KEY = 'up_SC_UI_11-2';

/** 베팅 숫자 이미지(Num_01 0~9) — GO 패널 BET 값을 이미지 숫자로 동적 표시. 매니페스트엔 0·1만(디자이너 샘플)이라 0~9 보강 직접 적재. */
export const NUM_DIGIT_KEYS: ReadonlyArray<string> = Array.from({ length: 10 }, (_, i) => `up_Num_01_${i}`);
/** Num_01 기호 글리프(숫자와 동일 185px 높이 캔버스): $ · , · . · ! · ?. 대박 코인 표기($·천단위 콤마)에 사용. */
export const NUM_DOLLAR_KEY = 'up_Num_01_S-1';
export const NUM_COMMA_KEY = 'up_Num_01_S-2';
const NUM_SYMBOL_KEYS: ReadonlyArray<string> = ['up_Num_01_S-1', 'up_Num_01_S-2', 'up_Num_01_S-3', 'up_Num_01_S-4', 'up_Num_01_S-5'];

/**
 * 신 GO 패널 크롬(up_SC_GO_*) — buildLayout(main.json)이 그리는 정적 노드지만, 디자이너가 최근 추가해
 * 매니페스트 비동기 로드가 create() 시점을 놓치면(레이스) 패널이 통째로 누락된다. **직접 적재로 적재 시점 보장**.
 */
export const GO_PANEL_KEYS: ReadonlyArray<string> = [
  'up_SC_GO_01_v4', // 패널(재디자인: AUTO ON 상단 + 좌측 홈/시티 박스 + 우측 BET/SPINS)
  'up_SC_GO_02', // GO 버튼(안 눌린 cap)
  'up_SC_GO_04', // × 기호(베팅)
  'up_SC_GO_06', // AUTO OFF 오버레이(평상시 표시, 오토 작동 시 숨김 → 패널의 AUTO ON 노출)
  'up_SC_GO_07', // 홈 버튼
  'up_SC_GO_08', // 시티 버튼(시티 화면 미디자인)
  'up_SC_UI_42_v2', // (구) 재디자인 헤더 바 — 폐기 예정이나 잔존 호환 위해 유지.
];

/** ⭐신 **공용 헤더** 텍스처 — buildHudHeader(hudHeader.ts)가 직접 그린다(레이아웃 노드 아님).
 *  디자이너 로비(blank_2.json) 헤더와 동일 텍스처. 2026-06-28 재디자인 = **단일 바**(아이콘/+/햄버거 베이크).
 *  매니페스트 비동기 레이스로 create() 누락 방지 위해 직접 적재. */
export const HEADER_KEYS: ReadonlyArray<string> = [
  'up_SC_UI_42-1_v5', // 헤더 바(코인/젬/라이프 + 메뉴 베이크) — 2026-06-29 디자이너 에디터 재변경(v4→v5)
];

/** LoadScene/PlayScene.preload — 레이아웃 + 매니페스트(크롬) + 게임플레이 텍스처(직접) 일괄 로드. */
export function loadGameAssets(scene: Phaser.Scene): void {
  scene.load.json(UI_LAYOUT_KEY, UI_LAYOUT_PATH);
  scene.load.json(UI_MANIFEST_KEY, UI_MANIFEST_PATH);
  scene.load.on(`filecomplete-json-${UI_MANIFEST_KEY}`, () => {
    const manifest = (scene.cache.json.get(UI_MANIFEST_KEY) ?? {}) as Record<string, string>;
    for (const [key, path] of Object.entries(manifest)) {
      if (key && path && !scene.textures.exists(key)) scene.load.image(key, path);
    }
  });
  // 게임플레이 텍스처(슬롯 심볼·퍼즐 일반젬·특수젬·특수 매치 이펙트) + 베팅/대박 숫자(Num_01) + SPIN 눌림상태는 매니페스트와 무관하게 직접 적재.
  for (const key of [...SLOT_SYMBOL_KEYS, ...PUZZLE_TILE_KEYS, ...SPECIAL_TILE_KEYS, SPECIAL_FX_KEY, ATTACK_FX_KEY, RAID_FX_KEY, ...Object.values(POWER_OVERLAY_KEYS), ...NUM_DIGIT_KEYS, ...NUM_SYMBOL_KEYS, ...GO_PANEL_KEYS, SPIN_BTN_PRESSED_KEY]) {
    if (!scene.textures.exists(key)) scene.load.image(key, uploadPath(key));
  }
  // 슬롯 레버 애니메이션 스프라이트 시트(당김→복귀). 시트는 다이어트에서 리사이즈 제외(프레임 크기 불변).
  if (!scene.textures.exists(LEVER_SHEET_KEY)) {
    scene.load.spritesheet(LEVER_SHEET_KEY, uploadPath(LEVER_SHEET_KEY), {
      frameWidth: LEVER_FW,
      frameHeight: LEVER_FH,
    });
  }
  // 코인 회전 스프라이트 시트(드랍/버스트 연출).
  if (!scene.textures.exists(COIN_SHEET_KEY)) {
    scene.load.spritesheet(COIN_SHEET_KEY, uploadPath(COIN_SHEET_KEY), {
      frameWidth: COIN_FW,
      frameHeight: COIN_FH,
    });
  }
  // 사운드(SFX) 일괄 로드 + 배경음(BGM).
  loadSfx(scene);
  loadBgm(scene);
}

/**
 * ⭐**에디터/코드가 쓰는 구글 폰트 전체**(에디터에서 적용한 폰트가 게임에 그대로 나오게 하려면 **이미지화가 아니라**
 *   이 폰트들을 런타임에 웹폰트로 로드하면 된다). 디자이너가 에디터에서 **새 폰트**를 쓰면 여기에 추가하거나,
 *   `collectLayoutFonts()` 로 레이아웃에서 자동 수집해 `ensureFonts()` 로 로드한다(폰트는 이미지화하지 말 것 — 편집성 유지).
 */
export const GAME_FONTS = ['Jua', 'Do Hyeon', 'Kanit', 'Fredoka', 'Russo One', 'Luckiest Guy', 'Bowlby One', 'Bungee'];

/** 레이아웃 문서들의 text 노드에서 쓰인 fontFamily 전부 수집(자동 폰트 로딩용). */
export function collectLayoutFonts(docs: Array<{ nodes?: ReadonlyArray<{ type?: string; fontFamily?: string }> } | undefined>): string[] {
  const set = new Set<string>();
  for (const doc of docs) for (const n of doc?.nodes ?? []) if (n.type === 'text' && n.fontFamily) set.add(n.fontFamily);
  return [...set];
}

/** 구글 폰트 특수 weight 변형(코드가 쓰는 굵기/이탤릭 포함). */
function familySpec(f: string): string {
  if (f === 'Kanit') return 'Kanit:ital,wght@0,400;1,700;1,800'; // 정보패널 굵은 이탤릭 숫자
  if (f === 'Fredoka') return 'Fredoka:wght@400;500;600;700'; // 상점 라벨 등 700(볼드) 사용 → 합성 아닌 실제 weight 로드
  return encodeURIComponent(f).replace(/%20/g, '+');
}

/**
 * 주어진 구글 폰트들을 **동적으로 로드** — `<link>` 주입(@font-face 정의) 후 `document.fonts.load` 로 실제 적재 대기.
 *   ⚠️ Phaser 텍스트는 생성 시점에 캔버스로 굳으므로, **텍스트 렌더 전에** 이 await 가 끝나야 폴백 폰트로 굳지 않는다.
 *   실패해도(오프라인 등) 폴백으로 진행. index.html @import 와 중복돼도 무해(브라우저가 dedupe).
 */
export async function ensureFonts(families: string[] = GAME_FONTS): Promise<void> {
  if (typeof document === 'undefined') return;
  const list = [...new Set(families.map((f) => f.replace(/^["']|["']$/g, '').trim()).filter(Boolean))];
  if (!list.length) return;
  const href = 'https://fonts.googleapis.com/css2?' + list.map((f) => 'family=' + familySpec(f)).join('&') + '&display=block';
  // ① <link> 주입/갱신 후 로드 완료(=@font-face 정의) 대기.
  await new Promise<void>((resolve) => {
    let link = document.getElementById('game-fonts') as HTMLLinkElement | null;
    if (link && link.href === href) {
      resolve();
      return;
    }
    if (!link) {
      link = document.createElement('link');
      link.id = 'game-fonts';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.onload = () => resolve();
    link.onerror = () => resolve();
    link.href = href;
    setTimeout(resolve, 3000); // 안전 타임아웃(네트워크 지연 시 게임 진행 막지 않음)
  });
  // ② 각 폰트 실제 적재 대기.
  const fonts = document.fonts as (FontFaceSet & { load?: (f: string, t?: string) => Promise<unknown> }) | undefined;
  if (!fonts?.load) return;
  try {
    await Promise.all(list.map((f) => fonts.load!(`400 24px "${f}"`).catch(() => {})));
    await fonts.ready;
  } catch {
    /* 폴백 */
  }
}

/** 캔버스 렌더 전 폰트 선로딩(미로드 폰트는 폴백으로 굳음). 한글 글리프는 샘플로 추가 적재. 실패해도 진행. */
export async function preloadKoreanFonts(): Promise<void> {
  // 에디터/코드 폰트 전체(Latin 포함) 동적 로드.
  await ensureFonts(GAME_FONTS);
  // 한글 폰트는 한글 글리프까지 굳도록 샘플 텍스트로 추가 로드.
  const fonts = (typeof document !== 'undefined' ? document.fonts : undefined) as
    | (FontFaceSet & { load?: (f: string, t?: string) => Promise<unknown> })
    | undefined;
  if (!fonts?.load) return;
  try {
    await Promise.all([
      fonts.load('400 24px "Do Hyeon"', '가나다 0123 X/:%,'),
      fonts.load('400 24px "Jua"', '가나다 0123'),
      fonts.load('800 italic 24px "Kanit"', '0123456789$.,+×'),
      // ⭐DSEG7 Classic(디지털 시계 폰트, index.html @font-face) — 보상 타이머가 폴백으로 굳지 않게 숫자/콜론 글리프 선로딩.
      fonts.load('700 44px "DSEG7 Classic"', '0123456789:').catch(() => {}),
    ]);
    await fonts.ready;
  } catch {
    /* 폰트 실패 시 시스템 폴백 */
  }
}
