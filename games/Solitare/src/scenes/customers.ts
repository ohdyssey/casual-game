/**
 * customers.ts — 타워 각 점포를 방문하는 **손님 캐릭터** + **주문 말풍선** 연출.
 *
 * 손님 시트(customers/Custmer_01..10.png)는 한 손님의 **4포즈 가로 스프라이트**:
 *   프레임 0=앞모습, 1=옆모습1(좌향), 2=뒷모습, 3=옆모습2(우향).
 *
 * 연출(요구사항):
 *   · 점원 반대편에서 옆모습으로 페이드인(점원 응시) → 옆모습 그대로 가운데로 이동 → **뒷모습(주문 ~3초)** →
 *     **앞모습(결과)** → 옆모습(반대 방향)으로 걸어나가며 소멸.
 *   · **주문(뒷모습)**: 성별 말풍선(남=UI_11·여=UI_12) + 그 위에 **층별 주문 아이템**(Item_{층}-N).
 *   · **결과(앞모습)**: UI_13 말풍선 + **이모지**(Imoji_NN).
 *   · **하단 꼭지점(발밑)을 축으로 약간씩 유동**·점원과 겹치지 않게·**띄엄띄엄** 등장.
 */
import Phaser from 'phaser';
import { sfx } from '../audio.js';

/** 2-카메라 씬(HomeScene)에서 이 월드 오브젝트를 UI 카메라 렌더서 제외(UI에 섞여 고정되지 않게). 없는 씬이면 무해. */
function pinWorld(scene: Phaser.Scene, o: Phaser.GameObjects.GameObject): void {
  (scene as { pinToWorld?: (x: Phaser.GameObjects.GameObject) => void }).pinToWorld?.(o);
}

/** 손님 시트 키(10종). */
const KEYS = Array.from({ length: 10 }, (_, i) => `cust_${String(i + 1).padStart(2, '0')}`);
const FILE = (i: number): string => `customers/Custmer_${String(i + 1).padStart(2, '0')}.png`;

// 4포즈 프레임 인덱스(시트 순서 = 앞·옆1(좌향)·뒤·옆2(우향)).
//   ⚠️ 방향 옆모습이 **2장 별도**로 있으므로 flip 을 쓰지 않고 이동 방향에 맞는 프레임을 그대로 쓴다.
const FRONT = 0;
const SIDE_LEFT = 1; // 옆모습1 — 왼쪽을 바라봄(왼쪽으로 이동할 때).
const BACK = 2;
const SIDE_RIGHT = 3; // 옆모습2 — 오른쪽을 바라봄(오른쪽으로 이동할 때).

// 주문 말풍선(성별)·결과 말풍선·아이템/이모지.
const BUBBLE_M = 'ord_bubble_m'; // UI_11 남성 주문 말풍선.
const BUBBLE_F = 'ord_bubble_f'; // UI_12 여성 주문 말풍선.
const BUBBLE_DONE = 'ord_bubble_done'; // UI_13 결과(이모지) 말풍선.
/** 말풍선별 **꼬리 x 위치**(폭 대비 비율) — 이 지점을 손님 머리(cx)에 맞춘다(꼬리 끝이 머리를 가리키게). PNG 실측값. */
const BUBBLE_TAIL_X: Record<string, number> = { [BUBBLE_M]: 0.5, [BUBBLE_F]: 0.137, [BUBBLE_DONE]: 0.693 };
const MALE_IDX = new Set([1, 2, 8, 9]); // 남성 손님 시트 번호(나머지=여성).
/** **스테이지별** 층 주문 아이템 변형 수(Item_{스테이지2자리}_{층2자리}-N.png). */
const ITEM_COUNTS: Record<number, Record<number, number>> = {
  1: { 1: 4, 2: 4, 3: 4, 4: 1, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4, 10: 2 },
  2: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4, 10: 4 },
};
const itemCount = (stage: number, floor: number): number => ITEM_COUNTS[stage]?.[floor] ?? 4;
const pad2c = (n: number): string => String(n).padStart(2, '0');
const IMOJI_N = 20;
// 이모지 만족/불만 구분(불만=마지막 5개: 걱정·화남·싫어요·짜증·상심). 불만은 전체의 ~10%만.
const IMOJI_GOOD = Array.from({ length: 15 }, (_, i) => i + 1); // 1..15 만족.
const IMOJI_BAD = [16, 17, 18, 19, 20];
const BAD_RATE = 10; // 불만 표시 비율(%).
const itemKey = (stage: number, floor: number, v: number): string => `item_${stage}_${floor}_${v}`;
const imojiKey = (n: number): string => `imoji_${String(n).padStart(2, '0')}`;
/** 결과 이모지 굴림 — 약 10%만 불만, 나머지는 만족. bad=불만(코인 없음). */
function rollImoji(): { bad: boolean; key: string } {
  const bad = Phaser.Math.Between(1, 100) <= BAD_RATE;
  const pool = bad ? IMOJI_BAD : IMOJI_GOOD;
  return { bad, key: imojiKey(pool[Phaser.Math.Between(0, pool.length - 1)]) };
}

// 코인(만족 시 떨어뜨리는 보상) — SocialCasino Ani 6프레임 스핀 스프라이트.
const COIN_KEYS = Array.from({ length: 6 }, (_, i) => `cust_coin_${i + 1}`);
const COIN_SPIN = 'custCoinSpin';

/** 손님 방문 스팟 — 점원(주인)과 반대편에서 등장→가운데→반대편 퇴장. 호출부(HomeScene)가 층 기하에서 계산. */
export interface CustomerSpot {
  /** 발밑(하단 꼭지점) y — 점원 발끝과 같은 바닥선. */
  readonly groundY: number;
  /** 등장·퇴장 지점 x = **점원 반대편**(끝자리). */
  readonly entryX: number;
  /** 이동 목표 x = 층 **가운데**. */
  readonly centerX: number;
  /** 표시 높이(px). */
  readonly height: number;
  /** 렌더 깊이(점포 아트 앞). */
  readonly depth: number;
  /** 층 번호(1-base) — 주문 아이템(Item_{스테이지}_{층}) 선택에 사용. */
  readonly floor: number;
  /** 스테이지(1=좌측 기본, 2=우측). 아이템 세트 선택. 미지정=1. */
  readonly stage?: number;
  /** **만족 방문 콜백** — 손님이 만족(코인 드랍)하면 이 층·**획득 코인**으로 호출(점포 코인 누적용). */
  readonly onSatisfied?: (floor: number, coins: number) => void;
  /**
   * **상점 수익성** — 만족 방문 1회당 획득 코인. 상점(층)마다 다르게 설정한다(고급 상점=고수익).
   *   미지정이면 기존 기본(3~4 랜덤). 코인 연출 개수·+N 표기도 이 값에 비례.
   */
  readonly coinYield?: number;
}

/** 손님 시트 10종 + 말풍선/아이템/이모지 로드(HomeScene.preload 에서 호출). */
export function preloadCustomers(scene: Phaser.Scene): void {
  KEYS.forEach((k, i) => {
    if (!scene.textures.exists(k)) scene.load.image(k, FILE(i));
  });
  // 말풍선 3종(에디터 업로드 키 그대로 재사용).
  if (!scene.textures.exists(BUBBLE_M)) scene.load.image(BUBBLE_M, 'ui/uploads/up_Solitare_UI_11.png');
  if (!scene.textures.exists(BUBBLE_F)) scene.load.image(BUBBLE_F, 'ui/uploads/up_Solitare_UI_12.png');
  if (!scene.textures.exists(BUBBLE_DONE)) scene.load.image(BUBBLE_DONE, 'ui/uploads/up_Solitare_UI_13.png');
  // **스테이지별** 층 주문 아이템(Item_{스테이지}_{층}-N).
  for (const stage of [1, 2]) {
    for (let floor = 1; floor <= 10; floor++) {
      for (let v = 1; v <= itemCount(stage, floor); v++) {
        const k = itemKey(stage, floor, v);
        if (!scene.textures.exists(k)) scene.load.image(k, `order/items/Item_${pad2c(stage)}_${pad2c(floor)}-${v}.png`);
      }
    }
  }
  // 결과 이모지.
  for (let n = 1; n <= IMOJI_N; n++) {
    const k = imojiKey(n);
    if (!scene.textures.exists(k)) scene.load.image(k, `order/imoji/Imoji_${String(n).padStart(2, '0')}.png`);
  }
  // 코인 스핀 프레임(6장).
  COIN_KEYS.forEach((k, i) => {
    if (!scene.textures.exists(k)) scene.load.image(k, `order/coin/Coin_01-${i + 1}.png`);
  });
}

/** 각 시트를 4프레임(세로 전체·가로 1/4)으로 등록. 폭이 4로 안 나눠지면 나머지는 버린다(우측 여백). */
export function registerCustomerFrames(scene: Phaser.Scene): void {
  for (const k of KEYS) {
    if (!scene.textures.exists(k)) continue;
    const tex = scene.textures.get(k);
    if (tex.frameTotal > 1) continue; // 이미 등록됨(__BASE 만 있으면 1).
    const src = tex.getSourceImage() as { width: number; height: number };
    const fw = Math.floor(src.width / 4);
    for (let i = 0; i < 4; i++) tex.add(i, 0, i * fw, 0, fw, src.height);
  }
  // 코인 스핀 애니(6장 서로 다른 텍스처를 프레임으로) — 1회만 생성.
  if (!scene.anims.exists(COIN_SPIN) && COIN_KEYS.every((k) => scene.textures.exists(k))) {
    scene.anims.create({ key: COIN_SPIN, frames: COIN_KEYS.map((k) => ({ key: k })), frameRate: 14, repeat: -1 });
  }
}

/** 사용 가능한(로드된) 손님 키만. */
function availableKeys(scene: Phaser.Scene): string[] {
  return KEYS.filter((k) => scene.textures.exists(k));
}

const SPAWN_MIN = 2500; // 손님 스폰 최소 간격(ms).
const SPAWN_MAX = 7000; // 최대 간격 — **랜덤**하게 어느 층에 뜰지·언제 뜰지 결정.

/**
 * **전역 랜덤 스포너** — 랜덤 간격으로 **랜덤 층(현재 비어 있는)** 하나를 골라 손님을 보낸다(각 층 랜덤 등장).
 *   spots 는 **라이브 배열**(참조) — 동적 층 건설 시 배열에 push 하면 스포너가 자동으로 그 층도 후보에 넣는다.
 *   active = 동시에 같은 캐릭터가 여러 층에 뜨지 않게 공유하는 시트 키 셋.
 */
export function startCustomerVisits(
  scene: Phaser.Scene,
  spots: readonly CustomerSpot[],
  active: Set<string> = new Set<string>(),
): void {
  const keys = availableKeys(scene);
  if (keys.length === 0) return;
  const busy = new Set<number>(); // 현재 손님이 있는 층(중복 방지).
  const tick = (): void => {
    const free = spots.filter((s) => !busy.has(s.floor));
    if (free.length > 0) {
      const spot = free[Phaser.Math.Between(0, free.length - 1)]; // **랜덤 층** 선택.
      busy.add(spot.floor);
      visit(scene, spot, keys, active, () => busy.delete(spot.floor));
    }
    scene.time.delayedCall(Phaser.Math.Between(SPAWN_MIN, SPAWN_MAX), tick); // **랜덤 간격** 반복.
  };
  scene.time.delayedCall(Phaser.Math.Between(1500, 4000), tick);
}

/**
 * 프레임 안 **머리 중심 x**(프레임폭 대비 비율, PNG 실측 평균). 손님 아트가 머리를 프레임 중앙보다 살짝 왼쪽에
 *   그려서(0.5 미만) 말풍선 꼬리를 프레임 중앙(centerX)이 아니라 이 지점에 맞춰야 꼬리가 정확히 머리를 가리킨다.
 */
const CHAR_HEAD_RATIO: Record<number, number> = { [FRONT]: 0.464, [BACK]: 0.451 };
/** 손님 스프라이트의 실제 머리 x — 프레임 중앙(img.x) 에서 머리 오프셋(비율×표시폭)만큼 이동. */
function headCenterX(img: Phaser.GameObjects.Image, pose: number): number {
  return img.x + ((CHAR_HEAD_RATIO[pose] ?? 0.5) - 0.5) * img.displayWidth;
}

// 이동/포즈 타이밍(ms).
const FADE = 620; // 페이드 in/out.
const WALK = 1700; // 걷는 시간(등장·퇴장 각각).
const BACK_HOLD = 4500; // 가운데서 뒷모습(주문) **약 4.5초**(직전 3초의 1.5배) → 정면.

/**
 * 한 번의 방문(걸어 들어와 주문하고 걸어 나감):
 *   ①점원 반대편에서 페이드인(옆모습, **점원 바라봄**) → ②가운데로 걸어 이동 →
 *   ③뒷모습+**주문 말풍선(성별)·주문 아이템** ~3초 → ④앞모습+**결과 말풍선·이모지** →
 *   ⑤점원 반대편으로 걸어 나가며 페이드아웃.
 */
function visit(
  scene: Phaser.Scene,
  spot: CustomerSpot,
  keys: readonly string[],
  active: Set<string>,
  onExit: () => void,
): void {
  // **다른 층에 동시에 뜬 캐릭터는 제외**하고 고른다(모두 사용 중이면 어쩔 수 없이 전체에서).
  const free = keys.filter((k) => !active.has(k));
  const pool = free.length ? free : keys;
  const key = pool[Phaser.Math.Between(0, pool.length - 1)];
  active.add(key); // 등장 동안 예약(퇴장 destroy 시 해제).
  const idx = Number(key.slice(5)); // 'cust_07' → 7.
  const male = MALE_IDX.has(idx);
  // 옆모습은 **이동 방향에 맞는 프레임**을 그대로 사용(flip 없음).
  //   등장→가운데: entryX→centerX 방향, 퇴장: centerX→entryX(반대) 방향.
  const entrySide = spot.centerX > spot.entryX ? SIDE_RIGHT : SIDE_LEFT; // 가운데(점원 쪽)로 이동하는 방향.
  const exitSide = spot.entryX > spot.centerX ? SIDE_RIGHT : SIDE_LEFT; // 되돌아 나가는 방향(entrySide 의 반대).
  const img = scene.add.image(spot.entryX, spot.groundY, key, entrySide);
  pinWorld(scene, img); // 2-카메라 씬: 손님은 월드(줌·스크롤 대상), UI 카메라서 제외.
  img.setOrigin(0.5, 1); // 하단 꼭지점(발밑) = 축.
  const s = spot.height / img.height; // 프레임 높이 → 목표 높이 스케일.
  img.setScale(s);
  img.setDepth(spot.depth);
  img.setAlpha(0);

  // 머리 위 말풍선(주문/결과) — 표시 중인 것을 추적해 포즈 전환·퇴장 시 정리.
  let bubble: Phaser.GameObjects.Image[] = [];
  const clearBubble = (): void => {
    bubble.forEach((o) => o.destroy());
    bubble = [];
  };

  const total = Phaser.Math.Between(11500, 14500); // 화면 체류(걷는 구간+긴 주문 포함).
  const frontHold = Math.max(1500, total - FADE - WALK * 2 - BACK_HOLD); // 정면 유지(나머지).

  // 하단축 유동 — 발밑 고정한 채 살짝 갸웃 + 숨쉬기(사는 동안 무한).
  scene.tweens.add({ targets: img, angle: { from: -1, to: 1 }, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  scene.tweens.add({ targets: img, scaleY: s * 1.03, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

  // ① 페이드인(옆모습 = 이동/점원 방향).
  scene.tweens.add({ targets: img, alpha: 1, duration: FADE, ease: 'Sine.easeOut' });
  // ② 옆모습 그대로 가운데로 걸어 이동(옆모습이 바라보는 방향으로).
  scene.tweens.add({ targets: img, x: spot.centerX, duration: WALK, delay: FADE, ease: 'Sine.easeInOut' });
  // ③ 가운데 도착 → 뒷모습 + 주문 말풍선(성별) + 층 주문 아이템(~3초).
  const tBack = FADE + WALK;
  scene.time.delayedCall(tBack, () => {
    turnTo(scene, img, BACK);
    const fl = ((spot.floor - 1) % 10) + 1; // 아이템은 층 1~10 순환.
    const stage = spot.stage ?? 1; // 스테이지별 아이템(1=기본).
    const v = Phaser.Math.Between(1, itemCount(stage, fl));
    bubble = makeBubble(scene, headCenterX(img, BACK), spot, male ? BUBBLE_M : BUBBLE_F, itemKey(stage, fl, v), spot.depth);
  });
  // ④ 앞모습(정면) + 결과 말풍선(UI_13) + 이모지.
  const tFront = tBack + BACK_HOLD;
  scene.time.delayedCall(tFront, () => {
    turnTo(scene, img, FRONT);
    clearBubble();
    const res = rollImoji();
    bubble = makeBubble(scene, headCenterX(img, FRONT), spot, BUBBLE_DONE, res.key, spot.depth);
    // 만족(불만 아님)하면 코인을 떨어뜨린다(허리 아래쯤에서 시작 — 얼굴 가리지 않게) + **상점 수익만큼 점포 누적**.
    if (!res.bad) {
      const amount = spot.coinYield ?? Phaser.Math.Between(3, 4); // 상점별 수익(미지정=기존 기본).
      const visual = Phaser.Math.Clamp(2 + Math.round(amount / 3), 3, 8); // 수익 비례 코인 연출 개수.
      dropCoins(scene, spot.centerX, spot.groundY - spot.height * 0.35, spot.depth, visual, amount);
      spot.onSatisfied?.(spot.floor, amount);
    }
  });
  // ⑤ 옆모습(퇴장 방향)으로 점원 반대편(등장 지점)으로 걸어 나가며 페이드아웃.
  const tExit = tFront + frontHold;
  scene.time.delayedCall(tExit, () => {
    clearBubble();
    turnTo(scene, img, exitSide);
    scene.tweens.add({ targets: img, x: spot.entryX, duration: WALK, ease: 'Sine.easeInOut' });
    scene.tweens.add({
      targets: img,
      alpha: 0,
      duration: WALK,
      ease: 'Sine.easeIn',
      onComplete: () => {
        active.delete(key); // 예약 해제(다른 층이 이 캐릭터를 쓸 수 있게).
        img.destroy();
        onExit(); // 이 층 점유 해제 → 랜덤 스포너가 다시 이 층을 고를 수 있게.
      },
    });
  });
}

/**
 * 머리 위 말풍선 + 내용물(아이템/이모지)을 만든다(페이드인). 말풍선 꼬리는 아래(머리쪽)를 향한다.
 *   반환 배열을 destroy 하면 정리. 손님이 가운데(cx)에 정지한 동안만 뜨므로 정적 배치.
 */
function makeBubble(
  scene: Phaser.Scene,
  cx: number,
  spot: CustomerSpot,
  bubbleKey: string,
  contentKey: string,
  baseDepth: number,
): Phaser.GameObjects.Image[] {
  const headTop = spot.groundY - spot.height; // 머리 top(origin 하단이라 발밑-키).
  const tailY = headTop - 4; // 말풍선 꼬리 끝을 머리 살짝 위에.
  const BW = 175; // 말풍선 표시 폭(직전 146의 1.2배; 아이템/이모지는 이 폭에 비례해 함께 확대).
  const tailX = BUBBLE_TAIL_X[bubbleKey] ?? 0.5;
  // 원점 = (꼬리 x, 바닥) → (cx, tailY) 에 두면 **꼬리 끝이 머리(cx) 바로 위**를 가리킨다.
  const bub = scene.add.image(cx, tailY, bubbleKey).setOrigin(tailX, 1).setDepth(baseDepth + 40).setAlpha(0);
  pinWorld(scene, bub);
  const scale = BW / bub.width;
  bub.setScale(scale);
  const bubW = bub.displayWidth;
  const bubH = bub.displayHeight;
  const bodyCx = cx + (0.5 - tailX) * bubW; // 몸통 중앙 x(원점이 꼬리라 중앙에서 벗어남 보정).
  const cy = tailY - bubH * 0.57; // 몸통 중앙 y(꼬리 위).
  const content = scene.add.image(bodyCx, cy, contentKey).setOrigin(0.5, 0.5).setDepth(baseDepth + 41).setAlpha(0);
  pinWorld(scene, content);
  const fit = Math.min((bubH * 0.5) / content.height, (BW * 0.62) / content.width);
  content.setScale(fit);
  // 팝인(꼬리(머리) 쪽에서 살짝 튀어오르며).
  bub.setScale(scale * 0.7);
  scene.tweens.add({ targets: bub, alpha: 1, scaleX: scale, scaleY: scale, duration: 240, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: content, alpha: 1, duration: 240, delay: 60, ease: 'Sine.easeOut' });
  return [bub, content];
}

/**
 * 만족 보상 — 손님 몸에서 코인이 **살짝 튀어올랐다 아래로 떨어지며** 스핀(회전 스프라이트)하고 사라진다.
 *   (x,y)=코인이 솟는 시작점(손님 상체). 여러 개를 시차(delay)로 뿌린다.
 *   count=연출 코인 개수(상점 수익 비례), amount=획득 코인(+N 플로팅 표기 — 상점별 수익성 시각화).
 */
function dropCoins(scene: Phaser.Scene, x: number, y: number, baseDepth: number, count?: number, amount?: number): void {
  if (!scene.anims.exists(COIN_SPIN)) return;
  sfx('coin_burst', { volume: 0.1 }); // 코인 보상 쏟아짐(볼륨 더 하향).
  const s = 44 / 148; // 코인 표시 높이 ~44px(프레임 높이 ~148, 약간 작게).
  const n = count ?? Phaser.Math.Between(3, 4);
  // **+N 플로팅 표기** — 이 상점의 방문 수익을 명시(층마다 다른 수익성이 눈에 보이게).
  if (amount != null && amount > 0) {
    const txt = scene.add
      .text(x, y - 26, `+${amount}`, {
        fontFamily: '"Jua", sans-serif',
        fontSize: '40px',
        color: '#ffd23f',
        stroke: '#5a3210',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(baseDepth + 52)
      .setAlpha(0);
    pinWorld(scene, txt);
    scene.tweens.add({ targets: txt, alpha: 1, y: y - 92, duration: 620, ease: 'Quad.easeOut' });
    scene.tweens.add({ targets: txt, alpha: 0, duration: 340, delay: 700, onComplete: () => txt.destroy() });
  }
  for (let i = 0; i < n; i++) {
    const c = scene.add.sprite(x, y, COIN_KEYS[0]).setDepth(baseDepth + 50).setScale(s);
    pinWorld(scene, c);
    c.play(COIN_SPIN);
    const dx = Phaser.Math.Between(-70, 70);
    const peak = y - Phaser.Math.Between(20, 60); // 살짝만 튀어오름(얼굴 위로 안 올라가게).
    const land = y + Phaser.Math.Between(150, 240);
    scene.tweens.add({
      targets: c,
      x: x + dx * 0.4,
      y: peak,
      duration: 340,
      delay: i * 80,
      ease: 'Quad.easeOut',
      onComplete: () => {
        scene.tweens.add({ targets: c, x: x + dx, y: land, duration: 560, ease: 'Quad.easeIn', onComplete: () => c.destroy() });
        scene.tweens.add({ targets: c, alpha: 0, duration: 560, ease: 'Quad.easeIn' });
      },
    });
  }
}

/**
 * 포즈 전환 = **자연스러운 이미지 교체(크로스페이드/디졸브)**. (이미지를 좁혔다 펴는 회전 느낌 없이)
 *   현재 포즈를 고스트로 복제해 위에 얹고, 본체는 새 포즈로 즉시 교체한 뒤 고스트만 서서히 사라지게 해
 *   두 포즈가 부드럽게 겹쳐 넘어간다. 방향 옆모습이 별도 프레임이라 flip 은 쓰지 않는다.
 */
function turnTo(scene: Phaser.Scene, img: Phaser.GameObjects.Image, frame: number): void {
  if (!img.active) return;
  // 옛 포즈 스냅샷(고스트) — 본체와 동일 변형으로 바로 위에 얹는다.
  const ghost = scene.add
    .image(img.x, img.y, img.texture.key, img.frame.name)
    .setOrigin(img.originX, img.originY)
    .setScale(img.scaleX, img.scaleY)
    .setAngle(img.angle)
    .setAlpha(img.alpha)
    .setDepth(img.depth + 0.1);
  pinWorld(scene, ghost); // 2-카메라 씬: 잔상도 월드 전용. (누락 시 UI 카메라에도 렌더돼 방향전환 순간 버튼 앞에 잠깐 튐)
  // 본체는 새 포즈로 교체(폭 변화 없음). 고스트가 사라지며 옛→새 포즈로 디졸브.
  img.setFrame(frame);
  scene.tweens.add({ targets: ghost, alpha: 0, duration: 340, ease: 'Sine.easeInOut', onComplete: () => ghost.destroy() });
}
