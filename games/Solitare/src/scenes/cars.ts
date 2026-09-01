/**
 * cars.ts — 홈 화면 **하단 도로에 자동차가 한 대씩 지나가는** 연출.
 *
 * 요구사항: 도로 위를 **한 대씩(한 대가 지나가야 다음 대)** · **천천히** · **흰 배기 연기를 조금씩** 뿜으며 ·
 *   **앞으로** 지나간다. 진행은 **너무 매끄럽지 않게 약간씩 진동**(엔진/노면 떨림)한다.
 *
 * ⚠️ 2-카메라 씬: 자동차·연기는 setupCameras 이후 시간차로 생성되므로 **반드시 pinToWorld**(UI 카메라 누락 방지).
 */
import Phaser from 'phaser';
import { bakeShadowTexture } from './shadows.js';
import { SAFE_W as W } from '../logic/responsiveFrame.js';

// 저작(=세이프존) 프레임 — 단일 출처는 logic/responsiveFrame.ts (캔버스 크기 아님).
const CAR_KEYS = ['up_Car_01', 'up_Car_02', 'up_Car_03', 'up_Car_04', 'up_Car_05', 'up_Car_06', 'up_Car_07', 'up_Car_08', 'up_Car_09', 'up_Car_10']; // 10종 랜덤.
const CAR_WIDTH = 230; // 표시 폭(px). 원본 ~440 → scale ~0.52.
// 대형 차량 크기 배율(일반차=1.0) — 소방차·구급차·경찰차는 실제로 크므로 더 크게 표시.
const CAR_SCALE: Record<string, number> = {
  up_Car_08: 1.5, // 소방차
  up_Car_09: 1.28, // 경찰차
  up_Car_10: 1.45, // 구급차
};
const SPEED_MIN = 260; // px/s — 2배 빠르게(130→260).
const SPEED_MAX = 370; // px/s — 2배 빠르게(185→370).
const GAP_MIN = 3500; // 다음 차까지 공백(ms) — 한 대씩(겹치지 않게).
const GAP_MAX = 8500;
const SMOKE_EVERY = 430; // 배기 연기 주기(ms) — 조금씩.

/** 2-카메라 씬: 월드 전용(줌·스크롤 대상, UI 카메라서 제외). */
function pinWorld(scene: Phaser.Scene, o: Phaser.GameObjects.GameObject): void {
  (scene as { pinToWorld?: (x: Phaser.GameObjects.GameObject) => void }).pinToWorld?.(o);
}

export interface CarTrafficOpts {
  /** 도로면(자동차 바퀴가 닿는 y, 월드 좌표). */
  roadY: number;
  /** 자동차 depth(도로 위·건물 앞). */
  depth: number;
  /** 표시 폭(px). 미지정 시 기본값. */
  width?: number;
  /** **전체 주행 폭(월드 x)** — 부지 확장 시 전 부지 전체를 지나가게. 미지정=한 화면(W). */
  worldW?: number;
  /** **주행 시작 월드 x**(왼쪽 끝) — worldMinX ~ worldMinX+worldW 를 완주. 미지정=0. */
  worldMinX?: number;
  /**
   * **패럴랙스 스크롤 팩터**(가로/세로) — 중경 등 배경 도로에 통행을 얹을 때, 그 레이어와 같은 계수를 줘
   *   스크롤·부지 팬 시 차가 도로에서 벗어나지 않게 한다. 미지정=1(카메라와 완전히 함께=근경).
   */
  scrollFactorX?: number;
  scrollFactorY?: number;
}

/**
 * 여러 도로 자동차 통행 — **한 번에 한 대만**(전체 도로 통틀어). 매 대마다 도로를 **랜덤 선택**하고 방향을
 *   번갈아 무한 순환한다. 한 대가 끝나야 다음 대가 나오므로 **앞/뒤 도로에 동시에 등장하지 않는다**.
 *   (씬 종료 시 트윈·타이머 자동 정리.)
 */
export function startRoadsTraffic(scene: Phaser.Scene, roads: readonly CarTrafficOpts[]): void {
  const keys = CAR_KEYS.filter((k) => scene.textures.exists(k));
  if (keys.length === 0 || roads.length === 0) return;
  let dir: 1 | -1 = 1; // 진행 방향(1=오른쪽, -1=왼쪽). 번갈아.
  const loop = (): void => {
    const opts = roads[Phaser.Math.Between(0, roads.length - 1)]; // **랜덤 도로**(앞/뒤 중 하나).
    spawnCar(scene, opts, keys, dir, () => {
      dir = dir === 1 ? -1 : 1; // 다음 차는 반대 방향(양방향 도로).
      scene.time.delayedCall(Phaser.Math.Between(GAP_MIN, GAP_MAX), loop);
    });
  };
  scene.time.delayedCall(1000, loop); // 첫 차는 약간 뒤에.
}

/** 단일 도로 통행(= startRoadsTraffic 의 도로 1개 버전). */
export function startCarTraffic(scene: Phaser.Scene, opts: CarTrafficOpts): void {
  startRoadsTraffic(scene, [opts]);
}

// 차종별 **휠 중앙의 검은 허브(회전축) 좌표** — 이미지 실측(fx/fy=앞바퀴, rx/ry=뒷바퀴, 이미지 대비 비율·aspect=높이/폭).
//   스포크 오버레이의 회전 중심을 이 검은 허브에 정확히 맞춘다(옆모습, 원본은 앞이 왼쪽).
// (fx,fy)=앞바퀴·(rx,ry)=뒷바퀴 허브 중심 — 크림 휠페이스 bbox 중심 실측(허브캡에 정확히 정렬 확인).
const CAR_GEOM: Record<string, { fx: number; fy: number; rx: number; ry: number; aspect: number }> = {
  up_Car_01: { fx: 0.208, fy: 0.808, rx: 0.773, ry: 0.806, aspect: 0.440 },
  up_Car_02: { fx: 0.178, fy: 0.824, rx: 0.793, ry: 0.824, aspect: 0.457 },
  up_Car_03: { fx: 0.189, fy: 0.767, rx: 0.781, ry: 0.770, aspect: 0.428 },
  up_Car_04: { fx: 0.183, fy: 0.784, rx: 0.751, ry: 0.784, aspect: 0.375 },
  up_Car_05: { fx: 0.170, fy: 0.764, rx: 0.744, ry: 0.764, aspect: 0.446 },
  up_Car_06: { fx: 0.166, fy: 0.812, rx: 0.824, ry: 0.812, aspect: 0.400 },
  up_Car_07: { fx: 0.183, fy: 0.774, rx: 0.807, ry: 0.774, aspect: 0.351 },
  up_Car_08: { fx: 0.212, fy: 0.836, rx: 0.769, ry: 0.836, aspect: 0.379 },
  up_Car_09: { fx: 0.181, fy: 0.802, rx: 0.748, ry: 0.802, aspect: 0.330 },
  up_Car_10: { fx: 0.145, fy: 0.831, rx: 0.747, ry: 0.831, aspect: 0.382 },
};
const DEFAULT_GEOM = { fx: 0.19, fy: 0.81, rx: 0.79, ry: 0.81, aspect: 0.44 };
const SPOKE_R_RATIO = 0.045; // 스포크 반경(표시폭 대비) — **작게**(허브 주변).

/** 회전하는 바퀴 스포크 오버레이 — 원점(0,0)=휠 축 중심으로 그려 angle 로 스핀. **흰색 계열·작게**. */
function makeWheel(scene: Phaser.Scene, r: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 0.92);
  g.fillCircle(0, 0, r * 0.24); // 흰 허브
  g.lineStyle(Math.max(1.5, r * 0.18), 0xfafafa, 0.85); // 흰 스포크
  const N = 4;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * r * 0.16, Math.sin(a) * r * 0.16);
    g.lineTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92); // 스포크(허브~림)
    g.strokePath();
  }
  return g;
}

/** 자동차 한 대 = 화면 밖 → 반대편 밖까지 등속 주행 + **바퀴 회전** + 배기 연기. 도착하면 onDone. */
function spawnCar(
  scene: Phaser.Scene,
  opts: CarTrafficOpts,
  keys: readonly string[],
  dir: 1 | -1,
  onDone: () => void,
): void {
  const key = keys[Phaser.Math.Between(0, keys.length - 1)]; // 랜덤 차종.
  const baseY = opts.roadY;
  // 컨테이너로 묶어 차·바퀴를 함께 이동(바퀴는 독립 회전).
  const cont = scene.add.container(0, baseY).setDepth(opts.depth);
  pinWorld(scene, cont);
  // 배경 도로(중경 등)면 그 레이어와 같은 패럴랙스로 → 스크롤/팬 시 도로에 붙어 이동.
  if (opts.scrollFactorX != null || opts.scrollFactorY != null) {
    cont.setScrollFactor(opts.scrollFactorX ?? 1, opts.scrollFactorY ?? 1);
  }
  const car = scene.add.image(0, 0, key).setOrigin(0.5, 1);
  const carW = (opts.width ?? CAR_WIDTH) * (CAR_SCALE[key] ?? 1); // 대형 차량은 배율 적용
  car.setScale(carW / car.width);
  // 원본은 **좌향**(앞이 왼쪽). dir=1(오른쪽 진행)이면 flipX 로 앞이 오른쪽을 향하게.
  car.setFlipX(dir === 1);
  // **차 발밑 접지 그림자**(차보다 먼저 추가 → 뒤에 렌더, 이동 시 컨테이너와 함께 따라감).
  const shadow = scene.add
    .image(0, -4, bakeShadowTexture(scene))
    .setDisplaySize(carW * 0.96, carW * 0.18)
    .setAlpha(0.5);
  cont.add(shadow);
  cont.add(car);

  // **회전 바퀴 오버레이** — 앞/뒤 검은 허브(회전축) 좌표에 스포크 중심을 정확히 맞춰 얹는다.
  const geom = CAR_GEOM[key] ?? DEFAULT_GEOM;
  const displayH = carW * geom.aspect; // 표시 높이
  const wR = carW * SPOKE_R_RATIO;
  const flip = dir === 1 ? -1 : 1; // flipX(오른쪽 진행) 시 좌우 반전
  const w1 = makeWheel(scene, wR); // 앞바퀴
  w1.setPosition(flip * (geom.fx - 0.5) * carW, -(1 - geom.fy) * displayH);
  const w2 = makeWheel(scene, wR); // 뒷바퀴
  w2.setPosition(flip * (geom.rx - 0.5) * carW, -(1 - geom.ry) * displayH);
  cont.add(w1);
  cont.add(w2);

  const halfW = carW / 2;
  const wmin = opts.worldMinX ?? 0; // 주행 시작(왼쪽 끝) 월드 x.
  const wmax = wmin + (opts.worldW ?? W); // 주행 끝(오른쪽 끝).
  const startX = dir === 1 ? wmin - halfW - 12 : wmax + halfW + 12;
  const endX = dir === 1 ? wmax + halfW + 12 : wmin - halfW - 12;
  cont.x = startX;

  const speed = Phaser.Math.FloatBetween(SPEED_MIN, SPEED_MAX);
  const dur = (Math.abs(endX - startX) / speed) * 1000;

  // 바퀴 스핀 속도 = 실제 굴림(원둘레/속도) — 진행 방향으로 회전(오른쪽=시계방향).
  const revMs = Phaser.Math.Clamp(((2 * Math.PI * wR) / speed) * 1000, 300, 750);
  const spin = scene.tweens.add({ targets: [w1, w2], angle: dir === 1 ? '+=360' : '-=360', duration: revMs, repeat: -1, ease: 'Linear' });

  // **배기 연기(흰 연기 조금씩)** — 진행 반대쪽(뒤) 하단에서 주기적으로.
  const smoke = scene.time.addEvent({
    delay: SMOKE_EVERY,
    loop: true,
    callback: () => {
      if (!cont.active) return;
      const rearX = cont.x - dir * halfW * 0.84; // 뒤쪽(진행 반대).
      puff(scene, rearX, baseY - car.displayHeight * 0.1, opts.depth + 0.05, opts.scrollFactorX, opts.scrollFactorY);
    },
  });

  scene.tweens.add({
    targets: cont,
    x: endX,
    duration: dur,
    ease: 'Linear',
    onComplete: () => {
      smoke.remove();
      spin.stop();
      cont.destroy();
      onDone();
    },
  });
}

/** 흰 배기 연기 한 점 — 살짝 뒤·위로 퍼지며 옅어져 사라진다. */
function puff(scene: Phaser.Scene, x: number, y: number, depth: number, sfx?: number, sfy?: number): void {
  const c = scene.add.circle(x, y, Phaser.Math.Between(6, 11), 0xffffff, 0.5).setDepth(depth);
  pinWorld(scene, c);
  if (sfx != null || sfy != null) c.setScrollFactor(sfx ?? 1, sfy ?? 1); // 배경 도로면 차와 같은 패럴랙스.
  scene.tweens.add({
    targets: c,
    x: x - Phaser.Math.Between(8, 22),
    y: y - Phaser.Math.Between(14, 32),
    scale: Phaser.Math.FloatBetween(1.8, 2.8),
    alpha: 0,
    duration: Phaser.Math.Between(700, 1100),
    ease: 'Sine.easeOut',
    onComplete: () => c.destroy(),
  });
}
