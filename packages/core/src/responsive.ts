/**
 * responsive — 본편 플레이 씬을 창 비율로 꽉 채우기 위한 공용 헬퍼.
 *
 * 고정 designHeight(720×1280) 게임은 세로로 긴 폰에서 FIT 레터박스(상·하 검은 여백)가 생긴다.
 * 양궁(Archery)이 쓰던 패턴을 일반화: 씬 create() 맨 앞에서 `fillViewportHeight(this)` 로
 * 캔버스를 창 높이에 맞춰 늘리면(폭 720 고정, 높이만 창 비율), FIT 레터박스가 사라진다.
 * 씬은 반환된 높이(또는 scale.height)를 기준으로 배경 cover·하단 컨트롤 바닥정렬을 수행한다.
 *
 * 주의: 폭은 항상 720(디자인 폭) 고정 → 좌우 크롭/왜곡 없음. 늘어난 높이만큼 배경을 cover 로
 * 채우고, 하단 앵커 요소는 (원좌표 y + extra) 로 내려 바닥에 붙인다(extra = 적용높이 - 1280).
 */
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, MAX_DESIGN_HEIGHT } from './tokens.js';

/** 창 비율에 맞춰 캔버스 높이를 늘려 화면을 꽉 채운다(FIT 레터박스 제거). 반환=적용 높이. */
export function fillViewportHeight(scene: Phaser.Scene): number {
  const vw = (typeof window !== 'undefined' && window.innerWidth) || GAME_WIDTH;
  const vh = (typeof window !== 'undefined' && window.innerHeight) || GAME_HEIGHT;
  const h = Phaser.Math.Clamp(Math.round((GAME_WIDTH * vh) / vw), GAME_HEIGHT, MAX_DESIGN_HEIGHT);
  scene.scale.setGameSize(GAME_WIDTH, h);
  scene.scale.refresh();
  return h;
}

/** 1280 설계 기준 캔버스가 늘어난 높이(바닥정렬 오프셋). 음수면 0. */
export function viewportExtra(scene: Phaser.Scene): number {
  return Math.max(0, scene.scale.height - GAME_HEIGHT);
}

/**
 * 이미지를 캔버스(GAME_WIDTH×scene.scale.height)를 덮도록 cover 스케일·재배치.
 * origin 0.5 기준. 폭·높이 중 더 큰 배율로 키워 빈 띠가 안 생기게 한다.
 */
export function coverBackground(scene: Phaser.Scene, bg: Phaser.GameObjects.Image): void {
  const w = GAME_WIDTH;
  const h = scene.scale.height;
  const base = Math.max(w / bg.width, h / bg.height);
  bg.setScale(base);
  bg.setPosition(w / 2, h / 2);
}

/** fillCoverLayout 가 다루는 레이아웃의 구조 타입(게임별 LayoutIndex 가 공통으로 만족). */
interface LayoutLike {
  entries(): ReadonlyArray<{
    readonly node: { readonly id: string; readonly type?: string; readonly x: number; readonly y: number; readonly w?: number; readonly h?: number };
    readonly obj: Phaser.GameObjects.GameObject;
  }>;
}

/**
 * 에디터 레이아웃(buildLayout 결과)을 반응형으로 채운다 — buildLayout 직후 1회 호출.
 *   1) 캔버스를 창 높이로 채움(fillViewportHeight).
 *   2) 배경(가장 큰 image 노드)을 캔버스 cover 로 확대·재중심 → 하단 검은 여백 제거.
 *   3) 하단 컨트롤(원본 y ≥ bottomBelow)을 y += extra 로 내려 바닥 정렬.
 *   · 상단 HUD·중앙 보드는 원좌표 유지(상단 고정), 그 아래는 cover 배경이 채운다.
 * 반환=적용 높이. opts.bottomBelow 기본=1280×0.82(≈1050).
 */
export function fillCoverLayout(
  scene: Phaser.Scene,
  layout: LayoutLike,
  opts: { topAbove?: number; bottomBelow?: number; coverBg?: boolean; centerMiddle?: boolean } = {},
): number {
  const h = fillViewportHeight(scene);
  const extra = Math.max(0, h - GAME_HEIGHT);
  const above = opts.topAbove ?? GAME_HEIGHT * 0.25; // 이 위 = 상단 고정
  const below = opts.bottomBelow ?? GAME_HEIGHT * 0.82; // 이 아래 = 바닥 정렬

  // 배경 = 가장 큰 image 노드(setDisplaySize 보유) → cover.
  let bg: Phaser.GameObjects.Image | undefined;
  let bgArea = 0;
  if (opts.coverBg !== false) {
    for (const e of layout.entries()) {
      const area = (e.node.w ?? 0) * (e.node.h ?? 0);
      const isImg = (e.node.type === 'image' || e.node.type === undefined) && 'setDisplaySize' in e.obj;
      if (isImg && area > bgArea) {
        bgArea = area;
        bg = e.obj as Phaser.GameObjects.Image;
      }
    }
    if (bg) coverBackground(scene, bg);
  }

  // 존별 재배치(배경 제외):
  //   상단(y<above)=고정 · 하단(y≥below)=y+extra(바닥) · 중앙=centerMiddle 면 y+extra/2(수직 중앙).
  if (extra > 0) {
    for (const e of layout.entries()) {
      if ((e.obj as unknown) === (bg as unknown)) continue;
      const o = e.obj as Phaser.GameObjects.GameObject & { y: number };
      if (e.node.y >= below) o.y = e.node.y + extra;
      else if (opts.centerMiddle && e.node.y >= above) o.y = e.node.y + extra / 2;
    }
  }
  return h;
}

/**
 * 리사이즈/방향전환 시 다시 채움 + 콜백(재배치). SHUTDOWN 에서 자동 해제.
 * cb 에는 새 적용높이를 넘긴다.
 */
export function onViewportResize(scene: Phaser.Scene, cb: (h: number) => void): void {
  const handler = (): void => cb(fillViewportHeight(scene));
  const orient = (): void => {
    window.setTimeout(handler, 100);
  };
  window.addEventListener('resize', handler);
  window.addEventListener('orientationchange', orient);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    window.removeEventListener('resize', handler);
    window.removeEventListener('orientationchange', orient);
  });
}
