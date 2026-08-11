/**
 * 에셋 매니페스트 — 네온 무대 배경(보드 내장) + O/X 말 이미지 + 메뉴 화면(에디터 SSOT)
 * + 광선검 캐릭터 프레임(준비/내리치기전/내려친후/패배 × 2인).
 */
import type Phaser from 'phaser';
import { loadFighterAssets } from './ui/fighter.js';

export const BG_KEY = 'bg';
export const O_KEY = 'piece_o';
export const X_KEY = 'piece_x';

/**
 * 결과 화면 버튼 아이콘 — 이모지를 대신하는 네온 아이콘 5종(원본 `TTT_Btn_04-1~5`, 순서 동일).
 * 키는 `public/img/btn/<key>.png` 파일명과 같다.
 */
export const BTN_ICON = {
  /** 04-1 상승 화살표 — 다음 등급으로 */
  nextLevel: 'btn_next_level',
  /** 04-2 재생 삼각형 — 다음 판 */
  nextGame: 'btn_next_game',
  /** 04-3 회전 화살표 — 다시 하기 */
  retry: 'btn_retry',
  /** 04-4 돋보기+사람 — 새 상대 찾기 */
  findFoe: 'btn_find_foe',
  /** 04-5 영상 재생 — 광고 보고 다시하기 */
  adRetry: 'btn_ad_retry',
} as const;

/** 배경 원본 크기(px) — 보드 셀 좌표는 이 좌표계 기준으로 정의한다. */
export const BG_NATIVE_W = 841;
export const BG_NATIVE_H = 1870;

/** 에디터 레이아웃 문서 캐시 키(메뉴 화면 배치의 SSOT). */
export const LAYOUT_DOC_KEY = 'ui_layout_main';
/** 플레이 화면 배치의 SSOT — 에디터의 "플레이화면"(main_copy) 문서. */
export const PLAY_LAYOUT_DOC_KEY = 'ui_layout_play';
/** 업로드 에셋 매니페스트 캐시 키(에디터가 `ui-assets.json` 에 키→경로를 적어 둔다). */
const UI_ASSETS_KEY = 'ui_assets';

/**
 * 에디터가 public/ 을 스캔해 만든 키 ↔ 경로(= `phaser-ui-editor.project.js` 의 ASSETS).
 * 업로드 에셋은 `ui-assets.json` 에서 읽으므로, 여기엔 레이아웃이 참조하는 기존 파일만 둔다.
 */
const EDITOR_SCAN_ASSETS: Record<string, string> = {
  bg_2: 'loading/bg.png', // 메뉴 배경(로딩 화면과 같은 네온 무대 아트)
};

/** 에디터 레이아웃(중심 기준 좌표)의 노드 1개. */
export interface LayoutNode {
  readonly id: string;
  readonly type: string;
  readonly key?: string;
  readonly x: number;
  readonly y: number;
  readonly w?: number;
  readonly h?: number;
  readonly depth?: number;
  readonly visible?: boolean;
  /** 저작된 회전(도, 시계방향). 조명 연기처럼 각도가 연출의 일부인 노드가 있다. */
  readonly angle?: number;
  /** 저작된 불투명도(0~1). */
  readonly alpha?: number;
  // ── 텍스트 노드 ──
  readonly text?: string;
  readonly fontSize?: number;
  readonly color?: string;
  /** 저작 글꼴 이름(예: 'Jua', 'Noto Sans KR'). 없으면 게임 공통 글꼴. */
  readonly fontFamily?: string;
  /** 저작 외곽선 색. */
  readonly stroke?: string;
  readonly align?: string;
}

export interface LayoutDoc {
  readonly frame: { readonly designW: number; readonly designH: number };
  readonly nodes: readonly LayoutNode[];
}

/** LoadScene.preload 에서 호출 — 본편 에셋 일괄 로드. */
export function loadGameAssets(scene: Phaser.Scene): void {
  scene.load.image(BG_KEY, 'img/bg.png');
  scene.load.image(O_KEY, 'img/o.png');
  scene.load.image(X_KEY, 'img/x.png');
  loadFighterAssets(scene); // 캐릭터 4포즈 × 2인
  for (const key of Object.values(BTN_ICON)) scene.load.image(key, `img/btn/${key}.png`);

  // 메뉴 화면 — 에디터 문서 + 그 문서가 참조하는 이미지들.
  scene.load.json(LAYOUT_DOC_KEY, 'ui/layouts/main.json');
  scene.load.json(PLAY_LAYOUT_DOC_KEY, 'ui/layouts/main_copy.json');
  for (const [key, path] of Object.entries(EDITOR_SCAN_ASSETS)) scene.load.image(key, path);
  // 업로드 에셋은 매니페스트를 먼저 읽어야 경로를 안다 → 로드 큐에 이어서 넣는다.
  scene.load.json(UI_ASSETS_KEY, 'ui-assets.json');
  scene.load.once(`filecomplete-json-${UI_ASSETS_KEY}`, () => {
    const manifest = (scene.cache.json.get(UI_ASSETS_KEY) ?? {}) as Record<string, string>;
    for (const [key, path] of Object.entries(manifest)) {
      if (key && path && !scene.textures.exists(key)) scene.load.image(key, path);
    }
  });
}

/** 캔버스 렌더 전 한글 폰트 선로딩(미로드 폰트는 폴백으로 굳어버림). */
export async function preloadKoreanFonts(): Promise<void> {
  const fonts = (typeof document !== 'undefined' ? document.fonts : undefined) as
    | (FontFaceSet & { load?: (f: string, t?: string) => Promise<unknown> })
    | undefined;
  if (!fonts?.load) return;
  try {
    await Promise.all([
      fonts.load('400 24px "Jua"', '가나다 0123'),
      fonts.load('400 24px "Do Hyeon"', '가나다 0123 X/:%'),
    ]);
    await fonts.ready;
  } catch {
    /* 폰트 실패 시 시스템 폴백 */
  }
}
