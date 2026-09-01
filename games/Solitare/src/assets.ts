/**
 * assets.ts — 에디터(phaser-ui-editor) 산출물(레이아웃 JSON + 업로드 이미지)을 SSOT 로 로드 +
 * 카드/배경 텍스처 키 매핑.
 *
 * 화면은 ui/layouts/{main,home}.json 이 단일 진실 공급원. 업로드 이미지는 ui-assets.json(매니페스트)에서
 * key→path 로 일괄 적재한다.
 *
 * ⚠️ 아직 에셋 디자인 착수 단계 — 카드/배경은 정식 에셋 전까지 씬에서 코드 드로우한다. 아래 텍스처 키 상수는
 *    정식 에셋(에디터 업로드) 착수 시 ui-assets.json 과 동기화할 계약이다. 런타임은 텍스처 누락을 방어한다.
 */
import type Phaser from 'phaser';
import type { Suit, Rank } from './logic/types.js';
import { GROUPED_KEYS } from './ui/generated/assetGroups.js';

/** 에디터 산출물 — 레이아웃 JSON 캐시 키 + 업로드 매니페스트. */
export const UI_MAIN_KEY = 'ui_main';
export const UI_MAIN_PATH = 'ui/layouts/main.json';
export const UI_HOME_KEY = 'ui_home';
// 에디터(GameDevTool)가 편집하는 최신 홈 레이아웃 — 근경/원경/하늘 3층 패럴랙스 배경 반영본.
export const UI_HOME_PATH = 'ui/layouts/home.json';
// **플레이 진입(레벨 엔트리) 팝업** 레이아웃 — 에디터 저작 blank.json(패널·별·보상·플레이 버튼) SSOT.
export const UI_ENTRY_KEY = 'ui_entry';
export const UI_ENTRY_PATH = 'ui/layouts/blank.json';
export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';

/**
 * **업로드 이미지 경로** — PROD(배포·diet-assets 변환 후)는 `.webp`, DEV(원본)는 `.png`.
 *   하드코딩 `this.load.image(key, uploadPath(key))` 에 사용(매니페스트 구동은 diet 가 .webp 재작성).
 */
const UPLOAD_EXT = import.meta.env?.PROD ? 'webp' : 'png';
export const uploadPath = (key: string): string => `ui/uploads/${key}.${UPLOAD_EXT}`;

/**
 * 텍스처 원본 크기 — **압축 텍스처(ASTC) 는 `getSourceImage()` 가 null** 이라(이미지 요소가 없다) 그걸로 재면
 *   `null.width` 로 죽는다(실측 2026-08-31, customers.ts). `source[0]` 은 두 경우 모두 폭·높이를 가진다.
 *   ⚠️ 캔버스에 **그려야** 하는 텍스처(cardView 뒷면·폐건물 상단 검출·간판 합성)는 ASTC 대상에서 제외돼 있어야 한다
 *     (encode-astc.py EXCLUDE_RE: CARD_·Ruin·_UI_).
 */
export function texSize(t: Phaser.Textures.Texture): { width: number; height: number } {
  const src = t.source?.[0];
  return { width: src?.width ?? 0, height: src?.height ?? 0 };
}

/**
 * **압축 텍스처(ASTC) 표** — 배포 조립본에만 있다(`scripts/encode-astc.py` 가 `ui-assets-astc.json` 을 굽는다).
 *   { key → { ktx } }. 개발(원본)에는 없어서 404 → 빈 표로 진행(경고 없음).
 *   ⚠️ 매니페스트보다 **먼저** 받아야 한다 — 매니페스트 일괄 로드가 이 표를 보고 IMG/ASTC 를 가른다.
 */
export const UI_ASTC_KEY = 'ui_assets_astc';
export const UI_ASTC_PATH = 'ui-assets-astc.json';
type AstcTable = Record<string, { ktx: string }>;
/**
 * 표는 **게임을 만들기 전에 fetch 로 받아 모듈 변수에 둔다**(main.ts `preloadAstcTable`). Phaser 로더로 받으면 같은
 *   preload 안의 다른 로드보다 먼저 온다는 보장이 없고(실측: 조립본에서 KTX 0장), 개발 서버는 없는 파일에 index.html 을
 *   200 으로 돌려줘 JSON 파싱 오류로 로더가 꼬였다. fetch 는 content-type 을 보고 JSON 이 아니면 빈 표로 둔다.
 */
let ASTC: AstcTable = {};
export async function preloadAstcTable(): Promise<void> {
  try {
    const res = await fetch(UI_ASTC_PATH, { cache: 'no-cache' });
    if (!res.ok || !/json/i.test(res.headers.get('content-type') ?? '')) return;
    const j = (await res.json()) as unknown;
    if (j && typeof j === 'object' && !Array.isArray(j)) ASTC = j as AstcTable;
  } catch {
    ASTC = {}; // 없거나 깨졌으면 전부 IMG(WebP) — 예전과 동일.
  }
}
/** 표 크기(진단용). */
export const astcTableSize = (): number => Object.keys(ASTC).length;
const astcTable = (_scene: Phaser.Scene): AstcTable => ASTC;

/**
 * 업로드 이미지 1장 로드 — ASTC(KTX) 가 있으면 `load.texture({ ASTC, IMG })` 로 받는다(GPU 가 ASTC 를 지원하면
 *   KTX, 아니면 IMG 폴백 — Phaser 가 `renderer.compression.ASTC` 로 고른다). 없으면 예전처럼 `load.image`.
 *   `path` 를 안 주면 `uploadPath(key)`. 손님 시트처럼 표의 키가 다른 경우는 `astcKey` 로.
 *   ⚠️ 기기별 메모리: ASTC 6×6 는 RGBA 의 1/9, 4×4 는 1/4 — 예산 계정(assetBudget.measure)은 실제 GPU 크기를 못 보므로
 *     RGBA 기준으로 보수적으로 센다.
 */
/** 표는 게임 생성 전에 이미 받아 두므로 즉시 실행한다(호출부 호환용). */
export function whenAstcReady(_scene: Phaser.Scene, fn: () => void): void {
  fn();
}

export function loadUpload(scene: Phaser.Scene, key: string, path?: string, astcKey?: string): void {
  if (scene.textures.exists(key)) return;
  const img = path ?? uploadPath(key);
  const entry = astcTable(scene)[astcKey ?? key];
  if (entry?.ktx) {
    scene.load.texture(key, { ASTC: { type: 'KTX', textureURL: entry.ktx }, IMG: { textureURL: img } });
  } else {
    scene.load.image(key, img);
  }
}

/** 카드 앞면 텍스처 키(정식 에셋 계약). 예: up_Solitaire_CARD_H1. */
export const cardFaceKey = (suit: Suit, rank: Rank): string => `up_Solitaire_CARD_${suit}${rank}`;
/** 카드 뒷면 텍스처 키. */
export const CARD_BACK_KEY = 'up_Solitaire_CARD_back';

/** 도시 거리 배경(홈·플레이 공용, 이미지 Slitare_BG_Back01). */
export const BACK_BG_KEY = 'up_Solitaire_BG_Back01';
/** 층(상점 스토어front) 아트 키 — 레벨 1..5 = up_Solitaire_BG_01..05. */
export const floorArtKey = (level: number): string => `up_Solitaire_BG_0${((level - 1) % 5) + 1}`;

/**
 * 배경 보행 캐릭터 스프라이트 시트(8방향, 4열×2행) — D:\…\SolitareHeights\Ani → public/char.
 *   각 방향은 정지 포즈 1장뿐이라 걷기 프레임은 없다 → 런타임에서 맥동(bob)으로 걷는 느낌을 준다(pedestrians.ts).
 *   frameW/H = 시트 폭/4·높이/2(정수화). 프레임 순서(행우선 0..7)는 세 시트 공통.
 */
//   ⚠️ char_chef·char_girl 시트는 좌우가 **반대(수평 미러, frame6이 좌향)** → flip:true 로 sprite 를 뒤집어
//      셋 다 동일 프레임 매핑을 쓴다(1·2번 캐릭터 좌우 방향 반대 문제 해결). char_man 만 정상(우향).
/**
 * **미션 리워드 티어 완료 팝업** 배경 — 공통에셋(Pannel_03) 이식(에디터에 팝업 저작은 없음).
 *   상단 고정 진행 배너 자체는 에디터 저작(up_Rewards_*·up_Item_01_01-4, ui-assets.json 매니페스트로 자동 로드)이라
 *   여기서 별도로 로드할 필요 없음 — missionRewardBanner.ts 참고.
 */
export const MISSION_BOX_PANEL_KEY = 'up_Solitare_MissionBox_Panel';
const MISSION_REWARD_KEYS = [MISSION_BOX_PANEL_KEY] as const;

export const CHAR_SHEETS: ReadonlyArray<{
  key: string;
  path: string;
  frameW: number;
  frameH: number;
  flip?: boolean;
}> = [
  { key: 'char_chef', path: 'char/Ani_01_01.png', frameW: 255, frameH: 339, flip: true },
  { key: 'char_girl', path: 'char/Ani_01_02.png', frameW: 264, frameH: 353, flip: true },
  { key: 'char_man', path: 'char/Ani_01_03.png', frameW: 238, frameH: 357 },
];

/** 지연 로딩은 폐지됐다(2026-08-31) — 호출부 호환을 위해 남긴 no-op. */
export function startDeferredLoad(_scene: Phaser.Scene, _batch = 24): void {}
export const deferredRemaining = (): number => 0;

/** 씬 preload — 레이아웃 + 매니페스트 + 업로드 이미지 일괄 로드. */
export function loadGameAssets(scene: Phaser.Scene): void {
  // ASTC 표는 main.ts 가 게임 생성 **전에** fetch 로 받아 둔다(preloadAstcTable) — 여기서는 동기적으로 참조만 한다.
  scene.load.json(UI_MAIN_KEY, UI_MAIN_PATH);
  scene.load.json(UI_HOME_KEY, UI_HOME_PATH);
  scene.load.json(UI_ENTRY_KEY, UI_ENTRY_PATH); // 플레이 진입 팝업 레이아웃.
  scene.load.json(UI_MANIFEST_KEY, UI_MANIFEST_PATH);
  // 배경 보행 캐릭터 시트(8방향).
  for (const s of CHAR_SHEETS) {
    if (!scene.textures.exists(s.key)) {
      scene.load.spritesheet(s.key, s.path, { frameWidth: s.frameW, frameHeight: s.frameH });
    }
  }
  // 미션 리워드 배너/팝업 에셋 — 에디터 매니페스트 밖(수동 이식)이라 직접 로드.
  for (const key of MISSION_REWARD_KEYS) loadUpload(scene, key);
  // **21~30F 상품 아이콘**(`up_Item_03_NN-N`, 2026-08-31) — 매니페스트 밖(PO 제공 원본 1254px → 120px 로 최적화해 이식).
  //   floorItemKey(21~30) 가 이 키를 가리킨다(이벤트 배너·리그·점포 상품). 01/02 는 에디터 매니페스트로 온다.
  for (let f = 1; f <= 10; f++) {
    for (let v = 1; v <= 4; v++) {
      loadUpload(scene, `up_Item_03_${String(f).padStart(2, '0')}-${v}`);
    }
  }
  /*
   * ⚠️ **레이아웃 json 이 온 뒤에 매니페스트를 처리한다**(2026-08-31 실측). 매니페스트가 먼저 끝나면
   *   `layoutKeys` 가 비어 "보수적으로 전부 즉시 로드"로 빠져 지연 분류가 통째로 무력해진다
   *   (라이브 실측: 7초에 진행률 3%·174장 수신). 필요한 json 3개가 모두 캐시에 들어온 뒤 한 번만 처리한다.
   */
  const NEEDED_JSON = [UI_HOME_KEY, UI_MAIN_KEY, UI_ENTRY_KEY, UI_MANIFEST_KEY];
  let manifestHandled = false;
  const tryHandleManifest = (): void => {
    if (manifestHandled) return;
    if (!NEEDED_JSON.every((k) => scene.cache.json.exists(k))) return;
    manifestHandled = true;
    handleManifest(scene);
  };
  for (const k of NEEDED_JSON) scene.load.on(`filecomplete-json-${k}`, tryHandleManifest);
  scene.load.once('complete', tryHandleManifest); // 어떤 이유로든 이벤트를 놓쳤을 때의 안전망.
}

/**
 * **배포 직후 첫 로딩 실패 자동 복구**(2026-09-01) — 라이브 배포 직후 첫 실행에서 카드·배경이 통째로
 * 안 보이는(텍스트만 남는) 신고가 반복됐다. Phaser 자체도 파일당 재시도를 하지만(`loader.maxRetries`,
 * 기본 2회) **지연 없이 즉시** 재요청이라, CDN 엣지가 아직 원본에서 못 받아온 "콜드" 상태처럼 몇 초간
 * 지속되는 실패에는 듣지 않는다(세 번 다 같은 이유로 실패). 그래서 로더가 **한 번 다 돈 뒤**(=complete),
 * 실패한 파일만 모아 짧은 지연을 두고 다시 큐에 얹는 걸 몇 차례 반복한다.
 *
 * ⚠️ **LoadScene 처럼 스스로 'complete' 를 기다렸다가 다음 씬으로 넘어가는 곳에서만 쓸 것.** 다른 씬들의
 *   암묵적 preload→create 전환(Phaser 가 첫 'complete' 로 자동으로 create() 를 부르는 것)에 끼워 넣으면
 *   create() 가 재시도보다 먼저 실행돼 텍스처 없는 채로 그려질 수 있다 — 그건 이 함수로 못 막는다.
 */
export function loadAssetsWithRetry(scene: Phaser.Scene, opts: { retries?: number; delayMs?: number } = {}): Promise<void> {
  const retries = opts.retries ?? 2;
  const delayMs = opts.delayMs ?? 1200;
  const failed = new Map<string, { key: string; type: string; url: string }>();
  scene.load.on('loaderror', (file: { key: string; type: string; src?: string; url?: string | object }) => {
    const url = file.src ?? (typeof file.url === 'string' ? file.url : '');
    if (url) failed.set(`${file.type}:${file.key}`, { key: file.key, type: file.type, url });
  });

  return new Promise((resolve) => {
    const attempt = (attemptsLeft: number): void => {
      if (failed.size === 0 || attemptsLeft <= 0) {
        resolve();
        return;
      }
      const batch = [...failed.values()];
      failed.clear();
      scene.time.delayedCall(delayMs, () => {
        let queued = 0;
        for (const f of batch) {
          if (scene.textures.exists(f.key) || scene.cache.json.exists(f.key)) continue; // 다른 경로로 이미 성공.
          if (f.type === 'image') { scene.load.image(f.key, f.url); queued++; }
          else if (f.type === 'json') { scene.load.json(f.key, f.url); queued++; }
          // spritesheet 등 옵션이 필요한 타입은 재시도 대상에서 뺀다(드묾 — 캐릭터 시트 3장뿐).
        }
        if (queued === 0) {
          resolve();
          return;
        }
        scene.load.once('complete', () => attempt(attemptsLeft - 1));
        scene.load.start();
      });
    };
    scene.load.once('complete', () => attempt(retries));
  });
}

function handleManifest(scene: Phaser.Scene): void {
  {
    const manifest = (scene.cache.json.get(UI_MANIFEST_KEY) ?? {}) as Record<string, string>;
    /*
     * ⚠️ **매니페스트는 전부 부팅에 받는다**(2026-08-31 최종). 한때 "부팅 필수만 기다리고 나머지는 진입 후
     *   지속 로딩"으로 나눴는데, 그 뒤 **위클리 보상·투데이 리그·컬렉션 아트가 제때 없어** 화면이 비거나
     *   깨진다는 신고가 반복됐다(PO). 로딩이 조금 길어도 **화면이 항상 완전한 쪽**을 택한다.
     *   ⚠️ 이 분류를 되살리려면 "그 화면이 열리기 전에 반드시 도착한다"를 보장할 방법부터 만들 것.
     */
    for (const [key, path] of Object.entries(manifest)) {
      if (!key || !path || scene.textures.exists(key)) continue;
      // ⭐**화면 단위 그룹은 부팅에 올리지 않는다** — `ui/assetBudget.ts` 가 미리 받아 두고
      //   예산을 넘으면 내린다. 이 일괄 로드가 텍스처 메모리를 **카탈로그 크기에 비례**하게 만들어
      //   iOS 웹콘텐츠 프로세스가 한도 초과로 죽었다(2026-08-27). 그림이 늘수록 반드시 재발한다.
      if (GROUPED_KEYS.has(key)) continue;
      /*
       * ⚠️ **`up_ChatGPT_Image_*` 를 통째로 거르지 말 것**(2026-08-31 사고) — 이름만 보고 "에디터 임시 견본"으로
       *   판단해 부팅에서 뺐더니 **주간 이벤트 패널의 타이틀·테마 이미지**(portedLayout LAYER_2·LAYER_3)가
       *   사라져 배너가 검게 나왔다. 이 접두는 업로드 원본 파일명일 뿐 용도를 뜻하지 않는다.
       *   진짜 안 쓰는 키는 `npm run gen:unused-assets` 가 판정한다(레이아웃·조립 템플릿까지 본다).
       */
      loadUpload(scene, key, path); // ASTC 표에 있으면 KTX+IMG, 아니면 IMG.
    }
  }
}

/** 캔버스 렌더 전 한글 폰트 선로딩(미로드 폰트는 폴백으로 굳음). 실패해도 진행. */
export async function preloadKoreanFonts(): Promise<void> {
  const fonts = (typeof document !== 'undefined' ? document.fonts : undefined) as
    | (FontFaceSet & { load?: (f: string, t?: string) => Promise<unknown> })
    | undefined;
  if (!fonts?.load) return;
  try {
    await Promise.all([
      fonts.load('700 24px "Pretendard Variable"', '가나다 0123'),
      fonts.load('700 24px "Baloo 2"', 'ABCabc0123'),
      fonts.load('700 24px "Pretendard Variable"', '가나다라마바사'),
    ]);
    await fonts.ready;
  } catch {
    /* 폰트 실패 시 시스템 폴백 */
  }
}

// ─── 국기(ISO3) — 리더보드 표시용(펌프러시에서 이식, PO 2026-08-23) ───

/** ISO3 코드 → 텍스처 키. 파일은 `public/flags/flag_{ISO3}.svg`. */
export const flagKey = (iso3: string): string => `flag_${iso3}`;

/**
 * 국기 텍스처 로드(멱등) — **SVG 를 작게 래스터라이즈**해서 올린다.
 *
 * ⚠️ `load.image` 가 아니라 `load.svg` 를 쓰고, **크기를 반드시 줄여서** 굽는다:
 *   원본 viewBox 가 640×480 이라 그대로 올리면 장당 1.2MB(RGBA)다. 리더보드 한 줄에서
 *   국기는 40px 남짓이므로 scale 0.15(96×72)면 2배 해상도로 충분하다.
 * ⚠️ 로더가 이미 돌고 있으면 끝난 뒤에 시작한다.
 */
export function ensureFlagTextures(scene: Phaser.Scene, codes: readonly string[]): Promise<void> {
  const pending = [...new Set(codes)].filter((c) => !scene.textures.exists(flagKey(c)));
  if (pending.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const run = (): void => {
      for (const c of pending) scene.load.svg(flagKey(c), `flags/flag_${c}.svg`, { scale: 0.15 });
      scene.load.once('complete', () => resolve());
      scene.load.start();
    };
    if (scene.load.isLoading()) scene.load.once('complete', run);
    else run();
  });
}
