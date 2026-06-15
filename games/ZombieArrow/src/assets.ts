/**
 * 에셋 매니페스트 — 에디터(phaser-ui-editor) 산출물 등록처.
 *   · 레이아웃 JSON(main.json) + 업로드 이미지(ui-assets.json) → 배경/HUD/활(SSOT)
 *   · 좀비 스프라이트 시트 + 슬라이싱 문서(spriteDoc) → 런타임 좀비 애니메이션(여러 종류)
 *   · 화살/혈흔 파티클은 별도 아트 없이 런타임 Graphics 로 생성한다.
 */
import type Phaser from 'phaser';

/** 에디터 산출물 — 레이아웃 JSON 캐시 키 + 업로드 매니페스트. */
export const UI_LAYOUT_KEY = 'ui_layout';
export const UI_LAYOUT_PATH = 'ui/layouts/main.json';
export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';

/** 런타임 생성 텍스처 키. */
export const ARROW_KEY = 'arrow';
export const ARROW_STUCK_KEY = 'arrow_stuck'; // 좀비에 박힌 화살(촉 없음 — 샤프트+깃만, 촉은 몸 안)
export const SPARK_KEY = 'spark';
export const SHADOW_KEY = 'zshadow'; // 원형 그라디언트 그림자(좀비 발밑)

/** 좀비 종류 — 에디터가 비디오에서 슬라이싱한 워크 시트 한 벌씩. */
export interface ZombieType {
  /** 텍스처 키(시트). */
  readonly key: string;
  /** 시트 PNG 경로. */
  readonly sheetPath: string;
  /** spriteDoc JSON 캐시 키. */
  readonly docKey: string;
  /** spriteDoc JSON 경로. */
  readonly docPath: string;
  /** 애니메이션 키. */
  readonly anim: string;
  /** 네이티브 프레임 높이(개체 크기 정규화용). */
  readonly frameH: number;
  /** 프레임 수. */
  readonly frameCount: number;
}

export const ZOMBIE_TYPES: readonly ZombieType[] = [
  {
    key: 'zombie1_sheet',
    sheetPath: 'ui/sprites/sheets/cartoon_zombie_walking_forward_a__202606_s75_mqeta0ywm8vb.png',
    docKey: 'zombie1_doc',
    docPath: 'ui/sprites/1_mqeta0rf7l00/1_mqeta0rf7l00_cartoon_zombie_walking_forward_1_mqeta13uah2l.json',
    anim: 'zombie1_walk',
    frameH: 464,
    frameCount: 12,
  },
  {
    key: 'zombie2_sheet',
    sheetPath: 'ui/sprites/sheets/cartoon_zombie_construction_work__202606_s75_mqetuaenossu.png',
    docKey: 'zombie2_doc',
    docPath: 'ui/sprites/2_mqetu9m1ps6u/2_mqetu9m1ps6u_cartoon_zombie_construction_work_2_mqetualrsspp.json',
    anim: 'zombie2_walk',
    frameH: 614,
    frameCount: 17,
  },
];

/** 첫 프레임 이름(스폰 시 초기 표시 프레임). */
export const ZOMBIE_FRAME0 = 'f0';

/** spriteDoc 프레임 사각형(슬라이싱 결과)의 최소 형태. */
interface FrameRect {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** LoadScene.preload 에서 호출 — 에디터 레이아웃 + 업로드 이미지 + 좀비 시트(전 종류) 일괄 로드. */
export function loadGameAssets(scene: Phaser.Scene): void {
  scene.load.json(UI_LAYOUT_KEY, UI_LAYOUT_PATH);
  scene.load.json(UI_MANIFEST_KEY, UI_MANIFEST_PATH);
  for (const t of ZOMBIE_TYPES) {
    scene.load.json(t.docKey, t.docPath);
    scene.load.image(t.key, t.sheetPath);
  }
  // 매니페스트 도착 즉시 거기 적힌 업로드 이미지를 같은 로더 사이클에 추가 로드.
  scene.load.on(`filecomplete-json-${UI_MANIFEST_KEY}`, () => {
    const manifest = (scene.cache.json.get(UI_MANIFEST_KEY) ?? {}) as Record<string, string>;
    for (const [key, path] of Object.entries(manifest)) {
      if (key && path && !scene.textures.exists(key)) scene.load.image(key, path);
    }
  });
}

/** spriteDoc 의 실측 rect 로 텍스처에 프레임을 등록하고 anim 프레임 배열을 만든다. */
function registerFrames(scene: Phaser.Scene, type: ZombieType): Phaser.Types.Animations.AnimationFrame[] {
  if (!scene.textures.exists(type.key)) return [];
  const doc = scene.cache.json.get(type.docKey) as
    | { source?: { slicing?: { rects?: FrameRect[] }; frames?: FrameRect[] } }
    | undefined;
  const rects = doc?.source?.slicing?.rects ?? doc?.source?.frames ?? [];
  const tex = scene.textures.get(type.key);
  const frames: Phaser.Types.Animations.AnimationFrame[] = [];
  for (const r of [...rects].sort((a, b) => a.index - b.index)) {
    const name = `f${r.index}`;
    if (!tex.has(name)) tex.add(name, 0, r.x, r.y, r.w, r.h);
    frames.push({ key: type.key, frame: name });
  }
  return frames;
}

/**
 * 좀비 워크 애니메이션 전 종류 생성(멱등) — preload 완료 후 create 에서 호출.
 * 시트 프레임 폭이 균일하지 않아 균등 그리드로는 어긋나므로, spriteDoc rect 로 프레임을 직접 등록한다.
 */
export function ensureZombieAnims(scene: Phaser.Scene): void {
  for (const type of ZOMBIE_TYPES) {
    if (scene.anims.exists(type.anim)) continue;
    const frames = registerFrames(scene, type);
    if (frames.length > 0) {
      scene.anims.create({ key: type.anim, frames, frameRate: 12, repeat: -1 });
    }
  }
}

/** 화살·혈흔 파티클 텍스처를 Graphics 로 생성 (멱등). */
export function ensureGeneratedTextures(scene: Phaser.Scene): void {
  // ── 화살 (촉이 위를 향함, 24×176) ──
  if (!scene.textures.exists(ARROW_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x8a5a2b, 1);
    g.fillRect(10, 18, 4, 138); // 샤프트
    g.fillStyle(0x6f441e, 1);
    g.fillRect(13, 18, 1, 138); // 음영
    g.fillStyle(0xe6e9f2, 1); // 화살촉(위 삼각) — 더 뾰족하게(길고 좁게)
    g.beginPath();
    g.moveTo(12, 0);
    g.lineTo(17, 30);
    g.lineTo(7, 30);
    g.closePath();
    g.fillPath();
    g.fillStyle(0xff5252, 1); // 깃 좌(빨강)
    g.beginPath();
    g.moveTo(12, 150);
    g.lineTo(2, 174);
    g.lineTo(12, 162);
    g.closePath();
    g.fillPath();
    g.fillStyle(0x35a7ff, 1); // 깃 우(파랑)
    g.beginPath();
    g.moveTo(12, 150);
    g.lineTo(22, 174);
    g.lineTo(12, 162);
    g.closePath();
    g.fillPath();
    g.generateTexture(ARROW_KEY, 24, 176);
    g.destroy();
  }
  // ── 좀비에 박힌 화살 (촉 없음 — 샤프트+깃만, 24×128). 촉은 몸 안에 박혀 안 보임. 위=박힌 끝, 아래=깃(밖). ──
  if (!scene.textures.exists(ARROW_STUCK_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x8a5a2b, 1);
    g.fillRect(10, 2, 4, 104); // 샤프트
    g.fillStyle(0x6f441e, 1);
    g.fillRect(13, 2, 1, 104); // 음영
    g.fillStyle(0xff5252, 1); // 깃 좌(빨강) — 아래 끝(밖으로)
    g.beginPath();
    g.moveTo(12, 94);
    g.lineTo(2, 126);
    g.lineTo(12, 110);
    g.closePath();
    g.fillPath();
    g.fillStyle(0x35a7ff, 1); // 깃 우(파랑)
    g.beginPath();
    g.moveTo(12, 94);
    g.lineTo(22, 126);
    g.lineTo(12, 110);
    g.closePath();
    g.fillPath();
    g.generateTexture(ARROW_STUCK_KEY, 24, 128);
    g.destroy();
  }
  // ── 혈흔/임팩트 파티클 (작은 원, 12×12) ──
  if (!scene.textures.exists(SPARK_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(6, 6, 5);
    g.generateTexture(SPARK_KEY, 12, 12);
    g.destroy();
  }
  // ── 좀비 발밑 그림자 (원형 그라디언트, 128×128) — 중심 어둡고 가장자리 투명. 인게임 alpha 낮게. ──
  if (!scene.textures.exists(SHADOW_KEY)) {
    const sz = 128;
    const ct = scene.textures.createCanvas(SHADOW_KEY, sz, sz);
    const ctx = ct?.getContext();
    if (ct && ctx) {
      const grd = ctx.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
      grd.addColorStop(0, 'rgba(0,0,0,0.8)');
      grd.addColorStop(0.55, 'rgba(0,0,0,0.55)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, sz, sz);
      ct.refresh();
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
      fonts.load('400 24px "Do Hyeon"', '가나다 0123 X/:%'),
      fonts.load('400 24px "Jua"', '가나다 0123'),
    ]);
    await fonts.ready;
  } catch {
    /* 폰트 실패 시 시스템 폴백 */
  }
}
