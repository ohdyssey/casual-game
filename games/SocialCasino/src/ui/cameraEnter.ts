/**
 * cameraEnter.ts — "카메라가 살짝 앞으로 진입하는" 미세 줌인 진입 연출(요청 2026-06-29).
 *
 * 호텔 빌드(HotelScene)·어택 빌드(Stage1Scene) 진입 시 동일하게 사용한다. 주어진 **콘텐츠 오브젝트들만**
 * 화면 중심 기준으로 from→to 로 아주 미세하게 확대(전진)하고, 넘기지 않은 **UI(헤더·하단 네비·다이얼로그 등)는
 * 그대로 고정**된다.
 *
 * 구현: 카메라 줌(전체 확대) 대신 **콘텐츠의 월드 좌표/스케일을 중심 기준으로 직접 보간**한다. 컨테이너 reparent 가
 *   아니라 실제 x/y/scale 을 갱신하므로, 좌표를 쓰는 다른 코드(예: 업그레이드 빛 이펙트 위치)와 충돌하지 않는다.
 *   to>from(항상 확대)이라 배경이 화면보다 커질 뿐 가장자리 빈틈이 생기지 않는다.
 */
import type Phaser from 'phaser';

type Transformable = Phaser.GameObjects.GameObject & {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  setPosition: (x: number, y: number) => unknown;
  setScale: (x: number, y?: number) => unknown;
};

export interface CameraEnterOpts {
  /** 줌 중심(보통 디자인 캔버스 중앙). */
  centerX: number;
  centerY: number;
  /** 시작 줌(기본 1.0 = 정상). */
  from?: number;
  /** 끝 줌(기본 1.04 = 아주 미세하게 앞으로). 확대 후 그 프레이밍으로 정착("진입 완료"). */
  to?: number;
  durationMs?: number;
  ease?: string;
}

/**
 * 콘텐츠 오브젝트들을 화면 중심 기준으로 from→to 로 미세 확대(전진)한다. UI(여기 안 넘긴 것)는 고정.
 * 호출 시 즉시 from 상태를 적용하고, durationMs 동안 to 까지 보간한 뒤 그 상태로 유지된다.
 */
export function cameraEnterZoom(
  scene: Phaser.Scene,
  objects: ReadonlyArray<Phaser.GameObjects.GameObject | undefined>,
  opts: CameraEnterOpts,
): void {
  const cx = opts.centerX;
  const cy = opts.centerY;
  const from = opts.from ?? 1.0;
  const to = opts.to ?? 1.04;
  const dur = opts.durationMs ?? 650;
  // 각 오브젝트의 원본 transform 보존(매 프레임 원본 기준으로 재계산 → 누적 없음).
  const items = (objects.filter(Boolean) as Transformable[])
    .filter((o) => typeof o.x === 'number' && typeof o.setScale === 'function')
    .map((o) => ({ o, x: o.x, y: o.y, sx: o.scaleX, sy: o.scaleY }));
  if (!items.length) return;
  const apply = (z: number): void => {
    for (const it of items) {
      it.o.setPosition(cx + (it.x - cx) * z, cy + (it.y - cy) * z);
      it.o.setScale(it.sx * z, it.sy * z);
    }
  };
  apply(from);
  if (to === from || dur <= 0) return;
  const counter = { z: from };
  scene.tweens.add({ targets: counter, z: to, duration: dur, ease: opts.ease ?? 'Sine.easeOut', onUpdate: () => apply(counter.z) });
}
