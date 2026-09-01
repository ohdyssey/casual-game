/**
 * textureUsage.ts — **표시 크기 계측**(dev 전용 · `?measureTextures=1` 일 때만 동작).
 *
 * 왜: 배포 다이어트는 "표시 크기 × 상한" 으로 텍스처를 줄이는데, 그 표시 크기를 저작 레이아웃
 *   노드에서만 얻는다. **코드가 그리는 아트**(팝업·버튼·카드처럼 `setDisplaySize` 로 크기를 정하는 것)는
 *   노드가 없어 상한이 안 걸리고 **원본 해상도 그대로** 배포됐다 — 아이폰이 텍스처 메모리 초과로
 *   프로세스째 죽은 원인의 절반이었다(2026-08-27, 218장 179MB).
 *
 *   손으로 적는 힌트 표(diet-hints.json)로 큰 것 19장은 막았지만, 사람이 유지해야 하고 표시 크기를
 *   바꾸는 수정을 하면 같이 안 고쳐진다. 그래서 **실제로 그려진 크기를 게임에서 직접 잰다**.
 *
 * 재는 법: 매 프레임 살아 있는 씬의 표시 목록을 훑어 `getBounds()`(월드 AABB)의 최대치를 키별로 남긴다.
 *   · 월드 AABB 라 **부모 컨테이너의 스케일까지 포함**된다 — 팝업 열림 젤리 연출처럼 잠깐 1보다 크게
 *     부풀는 순간도 최대치로 잡힌다(그 프레임을 놓치면 상한이 모자라 흐려진다).
 *   · 회전한 오브젝트는 AABB 가 실제보다 크게 잡히는데, **크게 잡히는 쪽이 안전**하라 그대로 둔다.
 *   · 카메라 줌은 1 이하로만 걸리므로(노치 대응) 월드 크기는 항상 화면 크기 이상 — 역시 안전측.
 *
 * ⚠️ **한 번도 안 그려진 키는 기록되지 않는다.** 계측 결과를 힌트로 쓸 땐 "본 것만" 적어야 한다 —
 *   못 본 키에 상한을 걸면 그 화면에서 흐려진다. 수집기(scripts/measure-textures.mjs)가 커버리지를 함께 찍는다.
 */
import type Phaser from 'phaser';

/** 계측 대상 = 에디터 업로드 이미지(배포 다이어트가 다루는 것)만. */
const KEY_PREFIX = 'up_';

/** 키 → 지금까지 관찰된 최대 표시 크기(월드 px). */
export type TextureUsage = Record<string, { w: number; h: number }>;

interface Boundsish {
  getBounds?: () => { width: number; height: number };
  texture?: { key?: string };
  visible?: boolean;
  list?: unknown[];
}

/** 이 프레임에 그려지는 오브젝트를 재귀로 훑어 최대치를 갱신한다. */
function scan(objs: readonly unknown[], out: Map<string, { w: number; h: number }>): void {
  for (const o of objs) {
    const g = o as Boundsish;
    if (g?.visible === false) continue;
    if (Array.isArray(g?.list)) scan(g.list, out); // 컨테이너 자식.
    const key = g?.texture?.key;
    if (typeof key !== 'string' || !key.startsWith(KEY_PREFIX) || typeof g.getBounds !== 'function') continue;
    let b;
    try {
      b = g.getBounds();
    } catch {
      continue; // 파괴 중인 오브젝트 등 — 한 장 놓치는 것이 계측 중단보다 낫다.
    }
    const w = Math.ceil(b.width);
    const h = Math.ceil(b.height);
    if (!(w > 0) || !(h > 0)) continue;
    const cur = out.get(key);
    if (!cur) out.set(key, { w, h });
    else {
      if (w > cur.w) cur.w = w;
      if (h > cur.h) cur.h = h;
    }
  }
}

/**
 * 계측 설치 — `window.__textureUsage()` 로 결과를 꺼낸다(수집 스크립트가 이걸 읽는다).
 * `?measureTextures=1` 이 없으면 아무것도 하지 않는다(운영 비용 0).
 */
export function installTextureUsage(game: Phaser.Game): boolean {
  const on = typeof location !== 'undefined' && new URLSearchParams(location.search).get('measureTextures') === '1';
  if (!on) return false;

  const seen = new Map<string, { w: number; h: number }>();
  const scenes = new Set<string>();

  game.events.on('poststep', () => {
    for (const s of game.scene.getScenes(true)) {
      scenes.add(s.scene.key);
      scan(s.children.list, seen);
    }
  });

  const w = window as unknown as {
    __textureUsage?: () => { keys: TextureUsage; scenes: string[] };
  };
  w.__textureUsage = () => ({
    keys: Object.fromEntries([...seen].sort(([a], [b]) => (a < b ? -1 : 1))) as TextureUsage,
    scenes: [...scenes].sort(),
  });
  console.info('[textureUsage] 계측 중 — window.__textureUsage() 로 확인');
  return true;
}
