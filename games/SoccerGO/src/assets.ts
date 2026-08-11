/**
 * 에셋 매니페스트 — SoccerGO 는 아직 디자인 착수 전이라 필드/공/수비벽/골키퍼를 전부
 * Graphics 로 생성한 플레이스홀더 텍스처로 대체한다(P0). 디자이너가 UI 에디터(main.json)에
 * 배경·HUD·캐릭터를 채우면 assets.ts 는 그대로 두고 layoutLoader 가 SSOT 를 렌더한다
 * (형제 게임 Homerun/PawLink 패턴과 동일 — 코드는 레이아웃 유무에 따라 자동 전환).
 */
import type Phaser from 'phaser';

/** 에디터(phaser-ui-editor) 산출물 — 레이아웃 JSON 캐시 키 + 업로드 매니페스트. */
export const UI_LAYOUT_KEY = 'ui_layout';
export const UI_LAYOUT_PATH = 'ui/layouts/main.json';
export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';

export const BALL_KEY = 'sg_ball';
export const DEFENDER_KEY = 'sg_defender';
export const KEEPER_KEY = 'sg_keeper';
export const SPARK_KEY = 'sg_spark';
/** 골프클래시 스타일 정확도 팬의 화살표 — 위를 향한 삼각 바늘(회전으로 좌우 기울임 표현). */
export const ACC_ARROW_KEY = 'sg_acc_arrow';

/** 공 회전 스프라이트 애니메이션 — 6장 연속 프레임(디자인팀 제공, ball_1..6). 비행 중에만 재생. */
export const BALL_SPIN_KEYS = ['sg_ball_spin_1', 'sg_ball_spin_2', 'sg_ball_spin_3', 'sg_ball_spin_4', 'sg_ball_spin_5', 'sg_ball_spin_6'];
export const BALL_SPIN_ANIM_KEY = 'sg_ball_spin';

/** LoadScene(또는 PlayScene.preload) — 에디터 레이아웃 + 매니페스트 + 업로드 이미지 + 공 회전 프레임 일괄 로드. */
export function loadGameAssets(scene: Phaser.Scene): void {
  scene.load.json(UI_LAYOUT_KEY, UI_LAYOUT_PATH);
  scene.load.json(UI_MANIFEST_KEY, UI_MANIFEST_PATH);
  scene.load.on(`filecomplete-json-${UI_MANIFEST_KEY}`, () => {
    const manifest = (scene.cache.json.get(UI_MANIFEST_KEY) ?? {}) as Record<string, string>;
    for (const [key, path] of Object.entries(manifest)) {
      if (key && path && !scene.textures.exists(key)) scene.load.image(key, path);
    }
  });
  BALL_SPIN_KEYS.forEach((key, i) => {
    if (!scene.textures.exists(key)) scene.load.image(key, `assets/ball_spin/ball_${i + 1}.png`);
  });
}

/** 공 회전 애니메이션 등록(멱등) — 서로 다른 텍스처 키 6장을 프레임으로 잇는다. */
export function ensureBallSpinAnim(scene: Phaser.Scene): void {
  if (scene.anims.exists(BALL_SPIN_ANIM_KEY)) return;
  scene.anims.create({
    key: BALL_SPIN_ANIM_KEY,
    frames: BALL_SPIN_KEYS.map((key) => ({ key })),
    frameRate: 22,
    repeat: -1,
  });
}

/** 공/수비수/골키퍼/스파크 텍스처를 Graphics 로 생성(아트 미지급 대체, 멱등). */
export function ensureGeneratedTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(BALL_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(24, 24, 22);
    g.lineStyle(2, 0xc9c9d4, 1);
    g.strokeCircle(24, 24, 21);
    g.fillStyle(0x2b2b2b, 1);
    g.fillCircle(24, 24, 7);
    g.fillCircle(11, 15, 5);
    g.fillCircle(37, 15, 5);
    g.fillCircle(11, 33, 5);
    g.fillCircle(37, 33, 5);
    g.generateTexture(BALL_KEY, 48, 48);
    g.destroy();
  }
  if (!scene.textures.exists(DEFENDER_KEY)) {
    scene.make.graphics({ x: 0, y: 0 }, false)
      .fillStyle(0x1e3a5f, 1).fillRoundedRect(6, 34, 40, 78, 14)
      .fillStyle(0xffd9a0, 1).fillCircle(26, 20, 18)
      .fillStyle(0x14274a, 1).fillRoundedRect(0, 40, 12, 60, 6).fillRoundedRect(40, 40, 12, 60, 6)
      .generateTexture(DEFENDER_KEY, 52, 114)
      .destroy();
  }
  if (!scene.textures.exists(KEEPER_KEY)) {
    scene.make.graphics({ x: 0, y: 0 }, false)
      .fillStyle(0xd4a017, 1).fillRoundedRect(6, 34, 40, 78, 14)
      .fillStyle(0xffd9a0, 1).fillCircle(26, 20, 18)
      .fillStyle(0x8a6b0f, 1).fillRoundedRect(0, 40, 12, 60, 6).fillRoundedRect(40, 40, 12, 60, 6)
      .generateTexture(KEEPER_KEY, 52, 114)
      .destroy();
  }
  if (!scene.textures.exists(SPARK_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xfff3b0, 1);
    g.fillCircle(6, 6, 5);
    g.generateTexture(SPARK_KEY, 12, 12);
    g.destroy();
  }
  if (!scene.textures.exists(ACC_ARROW_KEY)) {
    // 원점(회전축)이 텍스처 하단 중앙에 오도록(원점=0.5,1) 그린다 — setOrigin(0.5,1)+setAngle 로 좌우 기울임.
    const w = 28;
    const h = 220;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(w / 2, 0, w / 2 - 14, 34, w / 2 + 14, 34);
    g.fillRect(w / 2 - 5, 30, 10, h - 30);
    g.lineStyle(2, 0x3a1c00, 0.6);
    g.strokeTriangle(w / 2, 0, w / 2 - 14, 34, w / 2 + 14, 34);
    g.strokeRect(w / 2 - 5, 30, 10, h - 30);
    g.generateTexture(ACC_ARROW_KEY, w, h);
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
      fonts.load('400 24px "Do Hyeon"', '가나다 0123 X/:%,'),
      fonts.load('400 24px "Jua"', '가나다 0123'),
    ]);
    await fonts.ready;
  } catch {
    /* 폰트 실패 시 시스템 폴백 */
  }
}
