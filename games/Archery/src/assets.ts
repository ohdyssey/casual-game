/**
 * 에셋 매니페스트 — 에디터(phaser-ui-editor) 산출물(레이아웃 JSON + 업로드 이미지) 등록처.
 * 화살/조준 레티클/파티클은 별도 아트 없이 런타임 Graphics 로 생성한다(P0).
 */
import type Phaser from 'phaser';

/** 에디터 산출물 — 레이아웃 JSON 캐시 키 + 업로드 매니페스트. */
export const UI_LAYOUT_KEY = 'ui_layout';
export const UI_LAYOUT_PATH = 'ui/layouts/main.json';
export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';

/** 런타임 생성 텍스처 키. */
export const ARROW_KEY = 'arrow';
export const ARROW_REAR_KEY = 'arrow_rear'; // 정면에서 본 꽂힌 화살(깃이 이쪽을 향함)
export const RETICLE_KEY = 'reticle';
export const SPARK_KEY = 'spark';
export const HOLE_KEY = 'arrow_hole';
/** 업로드 폴더에 이 파일이 있으면 절차적 구멍 대신 사용(사용자 제공 이미지). */
export const HOLE_IMAGE_PATH = 'ui/uploads/arrow_hole.png';

/** LoadScene.preload 에서 호출 — 에디터 레이아웃 + 업로드 이미지 일괄 로드. */
export function loadGameAssets(scene: Phaser.Scene): void {
  scene.load.json(UI_LAYOUT_KEY, UI_LAYOUT_PATH);
  scene.load.json(UI_MANIFEST_KEY, UI_MANIFEST_PATH);
  // 매니페스트 도착 즉시 거기 적힌 업로드 이미지를 같은 로더 사이클에 추가 로드.
  scene.load.on(`filecomplete-json-${UI_MANIFEST_KEY}`, () => {
    const manifest = (scene.cache.json.get(UI_MANIFEST_KEY) ?? {}) as Record<string, string>;
    for (const [key, path] of Object.entries(manifest)) {
      if (key && path && !scene.textures.exists(key)) scene.load.image(key, path);
    }
  });
}

/** 화살·레티클·파티클 텍스처를 Graphics 로 생성 (아트 미지급분 대체, 멱등). */
export function ensureGeneratedTextures(scene: Phaser.Scene): void {
  // ── 화살 (촉이 위를 향함, 24×176 — 길게) ──
  if (!scene.textures.exists(ARROW_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    // 샤프트(나무) — 길게.
    g.fillStyle(0x8a5a2b, 1);
    g.fillRect(10, 18, 4, 138);
    g.fillStyle(0x6f441e, 1);
    g.fillRect(13, 18, 1, 138); // 음영
    // 화살촉(위 삼각, 회색 메탈)
    g.fillStyle(0xe6e9f2, 1);
    g.beginPath();
    g.moveTo(12, 2);
    g.lineTo(20, 22);
    g.lineTo(4, 22);
    g.closePath();
    g.fillPath();
    // 깃(아래, 좌 레드 / 우 블루)
    g.fillStyle(0xff5252, 1);
    g.beginPath();
    g.moveTo(12, 150);
    g.lineTo(2, 174);
    g.lineTo(12, 162);
    g.closePath();
    g.fillPath();
    g.fillStyle(0x35a7ff, 1);
    g.beginPath();
    g.moveTo(12, 150);
    g.lineTo(22, 174);
    g.lineTo(12, 162);
    g.closePath();
    g.fillPath();
    g.generateTexture(ARROW_KEY, 24, 176);
    g.destroy();
  }
  // ── 정면에서 본 꽂힌 화살 (깃 3장 + 노크, 44×44) ──
  // 1인칭에서 과녁에 박힌 화살은 깃(뒤)이 이쪽을 향한 단축(foreshortened) 모습.
  if (!scene.textures.exists(ARROW_REAR_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const c = 22;
    const vane = (ang: number, color: number): void => {
      const len = 18;
      const wid = 7.5;
      const ax = Math.cos(ang);
      const ay = Math.sin(ang);
      const px = -ay;
      const py = ax;
      g.fillStyle(color, 1);
      g.beginPath();
      g.moveTo(c + ax * 3, c + ay * 3);
      g.lineTo(c + ax * len + px * wid, c + ay * len + py * wid);
      g.lineTo(c + ax * len - px * wid, c + ay * len - py * wid);
      g.closePath();
      g.fillPath();
    };
    vane(-Math.PI / 2, 0xff5252); // 위 — 빨강
    vane(-Math.PI / 2 + 2.0944, 0x35a7ff); // 120° — 파랑
    vane(-Math.PI / 2 + 4.1888, 0xf2f2f2); // 240° — 흰색
    g.fillStyle(0x6f441e, 1);
    g.fillCircle(c, c, 4.5); // 샤프트 끝
    g.fillStyle(0x222222, 1);
    g.fillCircle(c, c, 2.4); // 노크
    g.generateTexture(ARROW_REAR_KEY, 44, 44);
    g.destroy();
  }
  // ── 조준 레티클 (링 + 십자 + 중심점, 64×64) ──
  if (!scene.textures.exists(RETICLE_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const c = 32;
    g.lineStyle(4, 0xffffff, 0.95);
    g.strokeCircle(c, c, 24);
    g.lineStyle(3, 0xff3b3b, 0.95);
    g.beginPath();
    g.moveTo(c, 3); g.lineTo(c, 18);
    g.moveTo(c, 46); g.lineTo(c, 61);
    g.moveTo(3, c); g.lineTo(18, c);
    g.moveTo(46, c); g.lineTo(61, c);
    g.strokePath();
    g.fillStyle(0xff3b3b, 1);
    g.fillCircle(c, c, 3);
    g.generateTexture(RETICLE_KEY, 64, 64);
    g.destroy();
  }
  // ── 임팩트 스파크 (작은 원, 12×12) ──
  if (!scene.textures.exists(SPARK_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(6, 6, 5);
    g.generateTexture(SPARK_KEY, 12, 12);
    g.destroy();
  }
  // ── 화살 구멍 (찢긴 회색 테두리 + 어두운 중심, 64×64) ──
  // 사용자 제공 PNG(arrow_hole)가 로드되어 있으면 그걸 쓰고, 없을 때만 절차적 생성.
  if (!scene.textures.exists(HOLE_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const c = 32;
    // 찢긴 금속 테두리 — 스파이크 폴리곤.
    const pts: { x: number; y: number }[] = [];
    const spikes = 13;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const base = i % 2 === 0 ? 30 : 21;
      const r = base + Math.sin(i * 1.7) * 3 + Math.cos(i * 0.9) * 2;
      pts.push({ x: c + Math.cos(a) * r, y: c + Math.sin(a) * r });
    }
    g.fillStyle(0x9a9a9a, 1);
    g.fillPoints(pts, true);
    g.fillStyle(0x6f6f6f, 1);
    g.fillCircle(c, c, 19);
    g.fillStyle(0x3a3a3a, 1);
    g.fillCircle(c, c, 14);
    g.fillStyle(0x141414, 1);
    g.fillCircle(c, c, 11);
    g.generateTexture(HOLE_KEY, 64, 64);
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
