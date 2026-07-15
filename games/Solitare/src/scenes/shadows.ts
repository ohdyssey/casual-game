/**
 * shadows.ts — **접지(contact) 그림자** 유틸.
 *
 * 위→아래 캐주얼 씬에선 오브젝트 발밑에 깔리는 **부드러운 납작 타원**이 가장 자연스럽고 저렴하다.
 * 방사형 검정→투명 텍스처를 부트 시 한 번만 굽고([cardView] 의 캔버스 베이크와 동일 패턴), 오브젝트마다
 * 표시 크기만 눌러서(가로 넓게·세로 얇게) 재사용한다. depth 는 대상 바로 뒤(지면 위).
 */
import Phaser from 'phaser';

const SHADOW_KEY = 'soft_shadow_ellipse';

/** 부드러운 타원 그림자 텍스처를 한 번 굽는다(방사형 검정→투명). 정사각 → 표시 시 눌러서 타원. */
export function bakeShadowTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(SHADOW_KEY)) return SHADOW_KEY;
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  // 중심을 충분히 진하게(실효 진하기 = 텍스처 alpha × 이미지 alpha 이므로 텍스처가 옅으면 안 보인다).
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.95)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.62)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  scene.textures.addCanvas(SHADOW_KEY, canvas);
  return SHADOW_KEY;
}

export interface ShadowOpts {
  /** 대상 폭 대비 그림자 폭(기본 0.9). */
  readonly widthScale?: number;
  /** 폭 대비 높이 = 타원 납작함(기본 0.26, 작을수록 얇음). */
  readonly thickness?: number;
  /** 진하기 0..1(기본 0.3). */
  readonly alpha?: number;
  /** 가로 오프셋(광원 방향, 기본 0). */
  readonly dx?: number;
  /** 발밑에서 위로 겹치는 비율(기본 0.35 — 그림자 상단이 대상 바닥에 살짝 물림). */
  readonly lift?: number;
  /** depth 직접 지정(미지정 시 대상 depth − 0.3). 지면 레이어로 통일할 때 사용. */
  readonly depth?: number;
}

/**
 * 대상 이미지의 **발밑**에 접지 타원 그림자를 깐다. 대상과 같은 패럴랙스로 함께 움직인다.
 *   반환된 그림자는 씬 2-카메라 분리 시 호출부가 pinToWorld 해야 한다(UI 카메라 누락 방지).
 */
export function addContactShadow(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Image,
  opts: ShadowOpts = {},
): Phaser.GameObjects.Image {
  const key = bakeShadowTexture(scene);
  const widthScale = opts.widthScale ?? 0.9;
  const thickness = opts.thickness ?? 0.26;
  const alpha = opts.alpha ?? 0.3;
  const lift = opts.lift ?? 0.35;
  const w = target.displayWidth * widthScale;
  const h = w * thickness;
  const b = target.getBounds();
  return scene.add
    .image(target.x + (opts.dx ?? 0), b.bottom - h * lift, key)
    .setDisplaySize(w, h)
    .setDepth(opts.depth ?? (target.depth ?? 0) - 0.3)
    .setAlpha(alpha)
    .setScrollFactor(target.scrollFactorX, target.scrollFactorY);
}
