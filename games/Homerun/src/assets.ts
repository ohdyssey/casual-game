/**
 * 에셋 매니페스트 — HomerunPOP 디자인 데이터(public/assets/)의 단일 등록처.
 * 공/파티클은 별도 아트 없이 런타임 Graphics 로 생성한다(P0).
 */
import type Phaser from 'phaser';

export const BG_KEY = 'bg_field';
export const LOGO_KEY = 'logo';
/** 에디터(phaser-ui-editor) 산출물 — 레이아웃 JSON 캐시 키 + 업로드 매니페스트. */
export const UI_LAYOUT_KEY = 'ui_layout';
export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';
/** 스프라이트 문서 레지스트리(에디터) — 캐릭터별 등록 애니(타자 준비/스윙/후 등) 조회용. */
export const UI_SPRITE_INDEX_KEY = 'ui_sprite_index';
export const UI_SPRITE_INDEX_PATH = 'ui/sprites/_index.json';
export const BALL_KEY = 'ball';
export const MITT_KEY = 'mitt';
export const SPARK_KEY = 'spark';
export const STARBURST_KEY = 'starburst';
export const CONFETTI_KEY = 'confetti';
// 타자·투수 아틀라스(batter_atlas/pitcher_atlas)는 에디터 스프라이트 클립(3동작)으로 대체되어 제거됨.

/** 수비수(Ch-3) — 7개 포지션용 정적 이미지. */
export const FIELDER_COUNT = 7;
export const fielderKey = (i: number): string => `fielder_${String(i).padStart(2, '0')}`;

const IMAGE_MANIFEST: ReadonlyArray<[key: string, path: string]> = [
  [BG_KEY, 'assets/bg_05.png'],
  // 야구공 디자인 에셋(96×96, 아이템/ball.png 트리밍·리사이즈) — 로드되면 Graphics 폴백 생략.
  [BALL_KEY, 'assets/ball.png'],
  // 포수 미트(192×192, 아이템/포수미트.png) — 50% 투명으로 공 통과 시 포구 연출.
  [MITT_KEY, 'assets/mitt.png'],
];

/** LoadScene.preload 에서 호출 — 디자인 이미지 + 수비수 + 에디터 UI 로드(타자·투수는 에디터 클립). */
export function loadGameAssets(scene: Phaser.Scene): void {
  for (const [key, path] of IMAGE_MANIFEST) {
    if (!scene.textures.exists(key)) scene.load.image(key, path);
  }
  // 수비수 7인 — 트리밍 정적 이미지 (1·2·3루수, 유격수, 좌·중·우익수).
  for (let i = 1; i <= FIELDER_COUNT; i++) {
    if (!scene.textures.exists(fielderKey(i))) {
      scene.load.image(fielderKey(i), `assets/fielders/fielder_${String(i).padStart(2, '0')}.png`);
    }
  }
  // 에디터 UI — 레이아웃 JSON + 업로드 매니페스트(ui-assets.json)의 이미지 일괄 로드.
  scene.load.json(UI_LAYOUT_KEY, 'ui/layouts/main.json');
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
