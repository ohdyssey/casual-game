/**
 * warpTexture.ts — 에디터에서 저작한 **테이퍼(사다리꼴)** 를 그림에 굽는다.
 *
 * 에디터의 노드에는 `warp` / `warpTaper` / `warpAxis` 가 실려 오는데, 로더가 이걸 무시하면
 * **디자이너가 화면에서 본 모양과 게임이 다르게** 나온다(사다리꼴로 저작한 판이 게임에선 직사각형).
 *
 * ⚠️ **Mesh 로 바꾸지 않고 텍스처를 미리 구워 둔다.** 사다리꼴은 Mesh 로도 그릴 수 있지만,
 * 그러면 그 노드가 `Image` 가 아니게 되어 `setDisplaySize`·스냅샷·트윈 등 이 게임이 노드에 하는 일이
 * 전부 깨진다(조리대 대나무발이 그런 노드다). 캔버스에 **줄 단위로 다시 그려** 새 텍스처를 만들면
 * 노드는 그냥 `Image` 로 남는다 — 부팅 때 한 번이면 끝이라 값도 싸다.
 *
 * ⚠️ 줄 단위로 그리므로 **가로줄마다 폭이 제대로 보간된다** — 사각형을 삼각형 두 장으로 쪼개 그리는
 * 흔한 방법에서 생기는 대각선 일그러짐이 없다.
 */
import type Phaser from 'phaser';

/** 에디터가 노드에 실어 보내는 뒤틀기 값. */
export interface WarpSpec {
  readonly warp?: boolean;
  /** 0~1. **좁아지는 쪽의 줄어드는 비율** — 0.06 이면 그쪽 끝이 6% 좁다. */
  readonly warpTaper?: number;
  /** `v` = 세로축(위쪽이 좁아진다) · `h` = 가로축(왼쪽이 좁아진다). */
  readonly warpAxis?: string;
  readonly warpSkewX?: number;
  readonly warpSkewY?: number;
}

/** 이 노드가 뒤틀려 있는가(값이 0이면 뒤틀 것이 없다). */
export const hasWarp = (n: WarpSpec): boolean => !!n.warp && Math.abs(n.warpTaper ?? 0) > 0.0001;

/**
 * 원본 텍스처를 사다리꼴로 구워 **새 텍스처 키**를 돌려준다.
 * 이미 구워 둔 것이 있으면 그대로 쓴다(같은 그림을 여러 노드가 써도 한 번만 굽는다).
 * 구울 수 없으면(캔버스 미지원 등) `null` — 부르는 쪽은 원본을 그대로 쓰면 된다.
 */
export function warpedTextureKey(scene: Phaser.Scene, srcKey: string, spec: WarpSpec): string | null {
  const taper = spec.warpTaper ?? 0;
  const axis = spec.warpAxis === 'h' ? 'h' : 'v';
  const key = `${srcKey}__warp_${axis}_${taper.toFixed(4)}`;
  if (scene.textures.exists(key)) return key;

  const src = scene.textures.get(srcKey)?.getSourceImage() as CanvasImageSource | undefined;
  const frame = scene.textures.get(srcKey)?.get();
  const w = Math.round(frame?.width ?? 0);
  const h = Math.round(frame?.height ?? 0);
  if (!src || w <= 0 || h <= 0) return null;

  const canvas = scene.textures.createCanvas(key, w, h);
  const ctx = canvas?.getContext();
  if (!canvas || !ctx) return null;

  // 좁아지는 쪽에서 1-taper, 반대쪽에서 1 로 **선형 보간**한다. 폭은 가운데를 기준으로 줄인다.
  const ratio = (t: number): number => 1 - taper * (1 - t);
  if (axis === 'v') {
    // 세로축 — 위로 갈수록 좁다. 한 줄(1px)씩 가로로 눌러 그린다.
    for (let y = 0; y < h; y++) {
      const s = ratio(h > 1 ? y / (h - 1) : 1);
      ctx.drawImage(src, 0, y, w, 1, (w * (1 - s)) / 2, y, w * s, 1);
    }
  } else {
    // 가로축 — 왼쪽으로 갈수록 좁다. 한 칸(1px)씩 세로로 눌러 그린다.
    for (let x = 0; x < w; x++) {
      const s = ratio(w > 1 ? x / (w - 1) : 1);
      ctx.drawImage(src, x, 0, 1, h, x, (h * (1 - s)) / 2, 1, h * s);
    }
  }
  canvas.refresh();
  return key;
}
