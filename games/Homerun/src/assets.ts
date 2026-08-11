/**
 * 에셋 매니페스트 — HomerunPOP 디자인 데이터(public/assets/)의 단일 등록처.
 * 공/파티클은 별도 아트 없이 런타임 Graphics 로 생성한다(P0).
 */
import type Phaser from 'phaser';
import { loadSpriteClip } from '@casual/core';
import {
  batterMotionFilesFor,
  bootBatterPresetKeys,
  getBatterPreset,
  isDerivedMotion,
  isPitcherNode,
  resolveCharacterMotions,
  resolvePlayNodeMotions,
  type BatterPresetKey,
  type SpriteIndex,
} from './ui/spriteRegistry.js';

export const BG_KEY = 'bg_field';
export const LOGO_KEY = 'logo';
/** 에디터(phaser-ui-editor) 산출물 — 레이아웃 JSON 캐시 키 + 업로드 매니페스트. */
export const UI_LAYOUT_KEY = 'ui_layout';
/** 로비 화면(blank.json) 레이아웃 — main.json 과 별도 캐시 키. 이미지는 UI_MANIFEST_KEY 로 공용 로드. */
export const UI_LOBBY_LAYOUT_KEY = 'ui_lobby_layout';
/** 결과화면(blank_2.json) 레이아웃 — PlayScene.showGameOver() 가 소비. 이미지는 UI_MANIFEST_KEY 로 공용 로드. */
export const UI_RESULT_LAYOUT_KEY = 'ui_result_layout';
export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';
/** 스프라이트 문서 레지스트리(에디터) — 캐릭터별 등록 애니(타자 준비/스윙/후 등) 조회용. */
export const UI_SPRITE_INDEX_KEY = 'ui_sprite_index';
export const UI_SPRITE_INDEX_PATH = 'ui/sprites/_index.json';
export const BALL_KEY = 'ball';
/**
 * 회전하는 공 6프레임(디자이너 원본 `Homerun_UI_12-1..6.png`, 132×133) — 홈런 슬로우모션에서
 * 정지 공(BALL_KEY) 대신 돌려 쓴다. 에디터에 등록된 UI 에셋이 아니라 게임이 직접 소유하는
 * 플레이 에셋이라(공은 코드가 그린다) `assets/` 로 반입해 코드에서 로드한다.
 * ⚠️ 프레임이 기본 공(96×96)보다 커서 그대로 바꿔 끼우면 공이 커 보인다 — PlayScene 이
 *    BALL_SPIN_SCALE_COMP 로 겉보기 크기를 맞춘다.
 */
export const BALL_SPIN_KEYS: ReadonlyArray<string> = [1, 2, 3, 4, 5, 6].map((i) => `ball_spin_${i}`);
/** 회전 프레임 → 기본 공 겉보기 크기 보정 배율(96/132). */
export const BALL_SPIN_SCALE_COMP = 96 / 132;
/**
 * 리그 엠블럼 5종(디자이너 원본 `Card_01-1..5.png`) — 로비 리그 카드 위 방패 문양을 리그 단계에
 * 따라 갈아 끼운다. 인덱스 0 = 1티어(신인리그).
 *
 * ⚠️ 에디터에는 `up_Card_01-1`(1티어) 하나만 업로드돼 있어 나머지 4종은 게임이 직접 소유한다
 *    (ui-assets.json 은 에디터 생성물이라 손대지 않는다). 디자이너가 5종을 모두 업로드하면
 *    그때 에디터 키로 갈아타는 편이 낫다.
 * ⚠️ 4·5티어 이미지는 별·월계관이 붙어 세로가 더 길다(187×143/155 vs 187×132). 노드 크기를 그대로
 *    쓰면 찌그러지므로 **가로 기준 균일 스케일**로 붙인다(LobbyScene 참조).
 */
export const LEAGUE_EMBLEM_KEYS: ReadonlyArray<string> = [1, 2, 3, 4, 5].map((i) => `league_emblem_${i}`);
export const MITT_KEY = 'mitt';
/**
 * 결과화면 승/패/무 배지(디자이너 원본 `Homerun_UI_14-1..3.png`) — PlayScene.buildResultScreen()
 * 이 경기 결과에 따라 blank_2.json layer_2(승리버튼) 텍스처를 갈아 끼운다(사용자 요청: "승리 패배
 * 무승부의 아이콘 표시").
 * ⚠️ 승리(14-1)만 에디터에 업로드돼 있어(up_Homerun_UI_14-1, UI_MANIFEST_KEY 로 자동 로드) 나머지
 *    2종은 리그 엠블럼과 같은 패턴으로 게임이 직접 소유한다.
 */
export const RESULT_BADGE_LOSE_KEY = 'result_badge_lose';
export const RESULT_BADGE_DRAW_KEY = 'result_badge_draw';
/**
 * 로비 좌상단 메뉴 아이콘 + 팝업 부속 — 공통에셋(D:\캐쥬얼 게임\공통에셋)에서 반입.
 *  · icon_profile: 프로필 아바타(Profile/Male 001) — 프로필/저장 버튼 겸 팝업 초상.
 *  · icon_shop: 장바구니(icon_01_15) — 상점 버튼.  · icon_close: X(icon_01_18) — 팝업 닫기.
 *  · icon_coin: 코인(icon_01_1) — 상점 팩 행 장식.
 */
export const ICON_PROFILE_KEY = 'icon_profile';
export const ICON_SHOP_KEY = 'icon_shop';
export const ICON_CLOSE_KEY = 'icon_close';
export const ICON_COIN_KEY = 'icon_coin';
export const SPARK_KEY = 'spark';
export const STARBURST_KEY = 'starburst';
export const CONFETTI_KEY = 'confetti';
/**
 * 로비 START 버튼 — 공용 로딩 씬(loadingScene.ts) 내부 키와 별개로 게임이 직접 로드해 소유.
 * ⚠️ 2026-08-02 부터 로비 시작 버튼은 에디터가 저작한 "Play Ball"(blank.json layer_10/11)로
 *    바뀌어 이 텍스처를 쓰는 곳이 없다. 로딩화면과 같은 PNG 라 비용이 사실상 없고, 에디터에서
 *    버튼을 빼는 경우의 폴백으로 남겨둔다.
 */
export const LOBBY_START_ON_KEY = 'lobby_start_on';
export const LOBBY_START_OFF_KEY = 'lobby_start_off';
// 타자·투수 아틀라스(batter_atlas/pitcher_atlas)는 에디터 스프라이트 클립(3동작)으로 대체되어 제거됨.
// 수비수(fielder_01..07)도 에디터 SSOT 이미지 노드(up_Ch-3-*)로 대체되어 코드 로드 제거됨(2026-07-04).

const IMAGE_MANIFEST: ReadonlyArray<[key: string, path: string]> = [
  [BG_KEY, 'assets/bg_05.png'],
  // 야구공 디자인 에셋(96×96, 아이템/ball.png 트리밍·리사이즈) — 로드되면 Graphics 폴백 생략.
  [BALL_KEY, 'assets/ball.png'],
  // 회전 공 6프레임 — 홈런 슬로우모션 전용(BALL_SPIN_KEYS 주석 참조).
  ...BALL_SPIN_KEYS.map((k, i) => [k, `assets/ball_spin_${i + 1}.png`] as [string, string]),
  // 리그 엠블럼 5종 — 로비 리그 카드(LEAGUE_EMBLEM_KEYS 주석 참조).
  ...LEAGUE_EMBLEM_KEYS.map((k, i) => [k, `assets/league_emblem_${i + 1}.png`] as [string, string]),
  // 포수 미트(192×192, 아이템/포수미트.png) — 50% 투명으로 공 통과 시 포구 연출.
  [MITT_KEY, 'assets/mitt.png'],
  // 결과화면 패배·무승부 배지(RESULT_BADGE_* 주석 참조). 승리는 에디터 매니페스트로 자동 로드.
  [RESULT_BADGE_LOSE_KEY, 'assets/result_badge_lose.png'],
  [RESULT_BADGE_DRAW_KEY, 'assets/result_badge_draw.png'],
  // 로비 좌상단 메뉴 아이콘 + 팝업 부속(공통에셋 반입 — ICON_* 주석 참조).
  [ICON_PROFILE_KEY, 'assets/icon_profile.png'],
  [ICON_SHOP_KEY, 'assets/icon_shop.png'],
  [ICON_CLOSE_KEY, 'assets/icon_close.png'],
  [ICON_COIN_KEY, 'assets/icon_coin.png'],
  // 로비 START 버튼 — 공용 로딩화면과 같은 PNG 를 재사용(별도 키로 로드).
  [LOBBY_START_ON_KEY, 'loading/start_on.png'],
  [LOBBY_START_OFF_KEY, 'loading/start_off.png'],
];

/** LoadScene.preload 에서 호출 — 디자인 이미지 + 수비수 + 에디터 UI 로드(타자·투수는 에디터 클립). */
export function loadGameAssets(scene: Phaser.Scene): void {
  for (const [key, path] of IMAGE_MANIFEST) {
    if (!scene.textures.exists(key)) scene.load.image(key, path);
  }
  // 에디터 UI — 레이아웃 JSON + 업로드 매니페스트(ui-assets.json)의 이미지 일괄 로드.
  // (수비수 up_Ch-3-* 는 이 매니페스트로 자동 로드되고, PlayScene.buildWorld 가 SSOT 좌표로 배치.)
  scene.load.json(UI_LAYOUT_KEY, 'ui/layouts/main.json');
  scene.load.json(UI_LOBBY_LAYOUT_KEY, 'ui/layouts/blank.json');
  scene.load.json(UI_RESULT_LAYOUT_KEY, 'ui/layouts/blank_2.json');
  scene.load.json(UI_MANIFEST_KEY, UI_MANIFEST_PATH);
  // 스프라이트 레지스트리 — 타자 등 캐릭터의 등록 애니(준비/스윙/후) 해석용(실패해도 진행).
  scene.load.json(UI_SPRITE_INDEX_KEY, UI_SPRITE_INDEX_PATH);
  scene.load.on(`filecomplete-json-${UI_MANIFEST_KEY}`, () => {
    const manifest = (scene.cache.json.get(UI_MANIFEST_KEY) ?? {}) as Record<string, string>;
    for (const [key, path] of Object.entries(manifest)) {
      if (key && path && !scene.textures.exists(key)) scene.load.image(key, path);
    }
  });
}

/** 공·파티클 텍스처를 Graphics 로 생성 (아트 미지급분 대체, 멱등). */
export function ensureGeneratedTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(BALL_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(22, 22, 20);
    g.lineStyle(2, 0xc9c9d4, 1);
    g.strokeCircle(22, 22, 19);
    // 실밥 — 좌우 빨간 아크
    g.lineStyle(3, 0xe05252, 1);
    g.beginPath();
    g.arc(22, 22, 11, -1.0, 1.0);
    g.strokePath();
    g.beginPath();
    g.arc(22, 22, 11, Math.PI - 1.0, Math.PI + 1.0);
    g.strokePath();
    g.generateTexture(BALL_KEY, 44, 44);
    g.destroy();
  }
  if (!scene.textures.exists(SPARK_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xfff3b0, 1);
    g.fillCircle(6, 6, 5);
    g.generateTexture(SPARK_KEY, 12, 12);
    g.destroy();
  }
  if (!scene.textures.exists(STARBURST_KEY)) {
    // 만화풍 임팩트 스타버스트 — 8각 스파이크 별 + 흰 코어.
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const cx = 64;
    const outer = 60;
    const inner = 22;
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < 16; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (Math.PI / 8) * i - Math.PI / 2;
      pts.push({ x: cx + Math.cos(a) * r, y: cx + Math.sin(a) * r });
    }
    g.fillStyle(0xffb830, 1);
    g.fillPoints(pts, true);
    const pts2 = pts.map((p) => ({ x: cx + ((p.x ?? cx) - cx) * 0.62, y: cx + ((p.y ?? cx) - cx) * 0.62 }));
    g.fillStyle(0xffe14d, 1);
    g.fillPoints(pts2, true);
    // ⚠️ 코어는 옅은 크림색 — 순백 원이면 발사 직후 공으로 오인된다(공 2개 착시).
    g.fillStyle(0xfff3b0, 1);
    g.fillCircle(cx, cx, 12);
    g.generateTexture(STARBURST_KEY, 128, 128);
    g.destroy();
  }
  if (!scene.textures.exists(CONFETTI_KEY)) {
    // 흰 사각 조각 — 파티클 tint 로 다색 컨페티(관중 환호)에 사용.
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 10, 6);
    g.generateTexture(CONFETTI_KEY, 10, 6);
    g.destroy();
  }
}

/** main.json 노드의 최소 형상 — spriteDocClip 판별·모션 해석에 필요한 필드만. */
interface SpriteClipNodeLike {
  readonly type?: string;
  readonly name?: string;
  readonly characterId?: string;
  readonly spriteDocFile?: string;
  /** 도형(polygon/rect/circle) 안을 채우는 클립 — 전광판이 이 형태다. */
  readonly fillClip?: string;
}

/**
 * 캐릭터 스프라이트 클립(타자/투수 3동작, 로비 캐릭터, 전광판 이펙트 등) 아틀라스를 로딩
 * 화면에서 미리 로드.
 *
 * ⚠️ 이 아틀라스는 개당 3~5MB PNG(예: 4088×2925)라, PlayScene/LobbyScene 런타임에서
 *    loadSpriteClip 으로 lazy 로드하면 모바일 콜드 캐시에서 다운로드에 수 초가 걸린다. 그 사이
 *    씬이 진행돼 "첫 접속엔 캐릭터 애니가 안 뜨고, 두 번째 접속(브라우저 HTTP 캐시 히트)에야
 *    뜨는" 증상이 생긴다. 로딩바가 도는 동안 텍스처를 게임 TextureManager 에 미리 등록해
 *    첫 접속=두 번째 접속으로 만든다(텍스처는 씬 간 공유되므로 이후 loadSpriteClip 은 즉시
 *    캐시 히트하고, 문서 fetch 도 캐시된다).
 *
 * ⚠️ main.json(PlayScene, UI_LAYOUT_KEY)뿐 아니라 blank.json(로비, UI_LOBBY_LAYOUT_KEY)도
 *    같이 스캔한다(사용자 보고: "게임 홈화면 로딩하면서 배경이 로딩된 후 캐릭터 및 전광판 등의
 *    스프라이트 애니메이션 로딩이 늦어지는 경향" — 로비는 main.json 과 별도 캐시 키를 쓰는데
 *    이 함수가 원래 main.json 만 스캔해 로비 자체 캐릭터가 프리로드에서 빠져 있었다). 두 레이아웃
 *    문서의 spriteDocClip 노드를 합쳐 한꺼번에(중복 제거) 로드해야 "배경 먼저 → 스프라이트
 *    나중"이 아니라 로딩화면에서 다 같이 끝난 뒤 홈화면에 진입한다.
 *
 * 실패해도 진행 — 개별 클립이 안 받아지면 기존 런타임 lazy 로드로 폴백(치명적 아님).
 */
export async function preloadCharacterClips(scene: Phaser.Scene): Promise<void> {
  await loadClipsSequentially(scene, collectClipFiles(scene, 'lobby', bootBatterPresetKeys()));
}

/**
 * 플레이 화면 클립(타자·투수·전광판)을 받는다 — **PlayScene 이 직접** 부른다.
 *
 * 예전엔 이걸 부팅 로딩화면에서 로비 자산과 **함께** 받았다. 그런데 부팅 직후 화면은 로비이고
 * 로비는 이 자산을 하나도 쓰지 않는다. 그런데도 미리 올려 두는 바람에 부팅 시점 GPU 텍스처가
 * 실측 **210MB**까지 치솟았고(UI 58 + 로비 84 + 플레이 67), 이 피크에서 텍스처 업로드가 실패해
 * **로비 캐릭터만 안 뜨는** 증상이 났다(2026-08-05 iPad Pro 12.9 / iPadOS 16.6 실측 — 배경·카드·
 * 버튼 등 일반 이미지는 정상, 스프라이트 클립만 실패. 같은 빌드가 Galaxy Note8(6GB)에선 정상).
 *
 * 첫 화면에 필요한 것만 부팅에 올리면 피크가 142MB 로 내려간다. 플레이 자산은 PlayScene 이
 * 열릴 때(로비 자산이 해제된 뒤) 받으므로 두 화면 어느 쪽도 동시에 다 들고 있지 않는다.
 */
export async function preloadPlayClips(scene: Phaser.Scene): Promise<void> {
  await loadClipsSequentially(scene, collectClipFiles(scene, 'play', [getBatterPreset()]));
}

/**
 * **지금 선택된 타자**의 플레이 클립만 받아 둔다 — 로비에서 캐릭터를 고를 때마다 호출한다.
 *
 * 예전에는 부팅 때 타자 2명분을 미리 받고(BOOT_BATTER_PRELOAD_COUNT) 나머지는 로비에서
 * 백그라운드로 마저 받았다. 로딩 시간만 보면 맞는 설계였지만, 타자 아틀라스 하나가 30MB 대라
 * **여러 명을 동시에 상주시키는 것 자체가** 구형 iPad 의 GPU 텍스처 한도를 넘기는 주원인이었다
 * (2026-08-04 사용자 보고). 어차피 한 경기에 쓰는 타자는 한 명뿐이라
 * "고른 순간 그 한 명만" 받는 쪽이 메모리·로딩 양쪽에 유리하다.
 *
 * 로비 조작을 막지 않도록 await 하지 말고 띄워 둔다 — 늦더라도 런타임 lazy 로드가 받아 준다.
 */
export async function preloadSelectedBatterClips(scene: Phaser.Scene): Promise<void> {
  const index = (scene.cache.json.get(UI_SPRITE_INDEX_KEY) ?? null) as SpriteIndex | null;
  const doc = scene.cache.json.get(UI_LAYOUT_KEY) as { nodes?: ReadonlyArray<SpriteClipNodeLike> } | undefined;
  const files = new Set<string>();
  for (const n of doc?.nodes ?? []) {
    if (n.type !== 'spriteDocClip' || isPitcherNode(n)) continue;
    for (const f of batterMotionFilesFor(index, n, [getBatterPreset()])) files.add(f);
  }
  await loadClipsSequentially(scene, files);
}

/**
 * 씬 로더가 놀고 있을 때까지 기다린다(최대 대기 있음 — 로더가 이벤트를 안 쏘는 경우 영영 안 끝나면
 * 안 되므로). 클립 로드를 시작하기 전에 한 번 거쳐 배치가 겹치지 않게 한다.
 */
function waitForLoaderIdle(scene: Phaser.Scene): Promise<void> {
  if (!scene.load.isLoading()) return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      scene.load.off('complete', done);
      resolve();
    };
    const timer = setTimeout(done, LOADER_IDLE_TIMEOUT_MS);
    scene.load.once('complete', done);
  });
}

/** 로더 대기 상한 — 넘으면 그냥 진행한다(안 뜨는 것보다 겹치더라도 시도하는 편이 낫다). */
const LOADER_IDLE_TIMEOUT_MS = 8000;

/**
 * 두 레이아웃 문서(플레이·로비)에서 미리 받아야 할 클립 파일 경로를 중복 없이 모은다.
 * 파생 동작(같은 클립 구간 반복)은 원본 파일 하나만 받아두면 되므로 from 경로로 수집한다.
 */
function collectClipFiles(
  scene: Phaser.Scene,
  forScene: 'play' | 'lobby',
  batterKeys: ReadonlyArray<BatterPresetKey>,
): Set<string> {
  // 플레이 화면(main)은 타자 프리셋을 적용해야 하고(resolvePlayNodeMotions), 로비(blank)는 그
  // 화면 자체 캐릭터라 기존 이름 기반 해석을 쓴다 — 문서별로 해석기를 달리 한다.
  // ⚠️ **한 화면 몫만** 모은다. 두 화면 것을 한꺼번에 올리면 GPU 텍스처 피크가 210MB 까지 올라가
  //    구형/저메모리 기기에서 업로드가 조용히 실패한다(preloadPlayClips 주석 참조).
  const isPlay = forScene === 'play';
  const doc = scene.cache.json.get(isPlay ? UI_LAYOUT_KEY : UI_LOBBY_LAYOUT_KEY) as
    | { nodes?: ReadonlyArray<SpriteClipNodeLike> }
    | undefined;
  const index = (scene.cache.json.get(UI_SPRITE_INDEX_KEY) ?? null) as SpriteIndex | null;
  const files = new Set<string>();
  for (const n of doc?.nodes ?? []) {
    // 전광판 — 도형(polygon) 안을 클립으로 채우는 노드는 type 이 spriteDocClip 이 아니라서
    // 이 스캔에서 통째로 빠져 있었다(주석은 "전광판 이펙트 등"을 포함한다고 했는데 코드가
    // 달랐다). 시트가 크서 lazy 로드로는 첫 접속에서 한참 안 뜬다 — 여기서 같이 받는다.
    if (n.fillClip) files.add(n.fillClip);
    if (n.type !== 'spriteDocClip') continue;
    // 플레이 화면의 타자는 **넘겨받은 프리셋만** 받는다(선택된 한 명).
    if (isPlay && !isPitcherNode(n)) {
      for (const f of batterMotionFilesFor(index, n, batterKeys)) files.add(f);
      continue;
    }
    const m = isPlay ? resolvePlayNodeMotions(index, n) : resolveCharacterMotions(index, n.characterId, n.spriteDocFile);
    for (const spec of [m.ready, m.action, m.after]) {
      if (!spec) continue;
      files.add(isDerivedMotion(spec) ? spec.from : spec);
    }
  }
  return files;
}

/**
 * 순차 로드 — 공용 Phaser 로더에 동시에 load.start() 를 걸면 'complete' 이벤트가 얽히는 경쟁이
 * 있어 클립마다 자체 로드 배치를 순서대로 돌린다. 이미 받은 텍스처는 loadSpriteClip 이 캐시로
 * 즉시 반환하므로 중복 호출은 사실상 무료다.
 */
async function loadClipsSequentially(scene: Phaser.Scene, files: Iterable<string>): Promise<void> {
  // 이미 다른 로드가 돌고 있으면 끝날 때까지 기다린다 — 같은 씬 로더에 배치를 겹치면 벤더 런타임이
  // 파일 처리에 실패해 스프라이트가 통째로 안 뜬 이력이 있다(spriteClipRuntime 주석 + 2026-08-04
  // 로비 캐릭터 미표시 재현). 호출 위치가 어디든 여기서 한 번 막아 준다.
  await waitForLoaderIdle(scene);
  for (const file of files) {
    // 씬이 이미 종료됐으면(로비를 빠르게 떠난 경우) 남은 백그라운드 로드를 중단한다.
    if (!scene.scene.isActive() && !scene.scene.isPaused()) return;
    try {
      const c = scene.add.container(-10000, -10000).setVisible(false);
      const handle = await loadSpriteClip(scene, file, { container: c, autoPlay: false });
      handle?.stop?.();
      c.destroy();
    } catch {
      /* 개별 클립 프리로드 실패 — 런타임 lazy 로드로 폴백 */
    }
  }
}

/**
 * 선로딩할 폰트 목록 — scripts/fonts-build.mjs 가 레이아웃에서 자동 추출해 생성한다.
 * fetch 가 아니라 번들에 포함시키는 이유: 네트워크 왕복이 없어 첫 렌더 전에 확실히 손에 들어온다.
 */
import fontManifest from './fonts/fonts.json';

/**
 * 캔버스 렌더 전 폰트 선로딩 — **반드시 첫 그리기 전에 끝나야 한다.**
 * Phaser 는 텍스트를 그리는 순간 캔버스에 래스터화하므로, 그 시점에 폰트가 없으면 시스템 폴백으로
 * 그려진 글자가 그대로 굳는다(사용자 보고: "한글폰트가 정확히 동일 폰트로 유지가 안 된다" —
 * 일부 텍스트만 다른 폰트로 굳음). 늦게 도착한 폰트는 이미 그려진 글자를 되돌리지 못한다.
 *
 * 대상 목록은 fonts.json(레이아웃에서 자동 추출)에서 읽는다 — 예전엔 4종을 코드에 박아 뒀는데
 * 에디터는 7종을 쓰고 있어 20곳이 조용히 폴백됐다. 목록을 코드에서 없애야 그 불일치가 안 생긴다.
 *
 * 폰트가 로컬(public/fonts/)이라 네트워크 변수가 없어 대기는 짧고 확정적이다. 실패해도 진행한다
 * (폴백으로라도 게임은 떠야 한다).
 */
export async function preloadKoreanFonts(): Promise<void> {
  const fonts = (typeof document !== 'undefined' ? document.fonts : undefined) as
    | (FontFaceSet & { load?: (f: string, t?: string) => Promise<unknown> })
    | undefined;
  if (!fonts?.load) return;
  try {
    const korean = new Set<string>(fontManifest.korean ?? []);
    const families: ReadonlyArray<string> = fontManifest.families ?? [];
    await Promise.all(
      // 샘플 문자는 그 폰트가 실제로 그릴 글자여야 한다 — 라틴 전용 폰트에 한글을 주면
      // 글리프가 없어 로드가 성립하지 않는다.
      families.map((f) => fonts.load(`400 24px "${f}"`, korean.has(f) ? '가나다 0123 X/:%' : 'ABCXYZ 0123 x/:%')),
    );
    await fonts.ready;
  } catch {
    /* 폰트 실패 시 시스템 폴백 — 게임 부팅을 막지 않는다 */
  }
}
