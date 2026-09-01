/**
 * popupFx.ts — 팝업 오버레이 **유기체(젤리) 열림/닫힘 연출** 공용 헬퍼.
 *
 * 목표: 메뉴가 한 번에 '팍' 뜨는 대신, 전체 프레임이 살아있는 것처럼 부풀었다 눌리며
 *   자리잡는(숨쉬는) 느낌. 구성:
 *   - 배경 딤: 0 → 호출부가 지정한 알파로 짧게 페이드.
 *   - 프레임: 축소(×0.6)·반투명·살짝 아래(+36px)에서 시작 → 오버슈트(×1.05) → 눌림(×0.97) → 1.0 안착.
 *     scaleX 가 scaleY 보다 **약간 먼저**(40ms 리드) 움직여 찌그러졌다 펴지는 유기적 비대칭을 만든다.
 *
 * 사용법: 팝업 내용물(이미지·버튼·히트존)을 **중심 기준 컨테이너(frame)** 에 담아
 *   popupOrganicIn(scene, dim, frame) 호출. 닫을 때는 popupOrganicOut(scene, dim, frame, onDone)
 *   — 들숨(살짝 부풂) 후 빨려들며 사라지고, 끝나면 onDone(보통 layer.destroy()).
 *   ⚠️ 닫기 버튼은 호출부에서 **중복 클릭 가드**(closing 플래그) 필수 — 닫힘 애니 중 재클릭 방지.
 */
import Phaser from 'phaser';

// ── 열림(들숨→안착) 튜너블 ──────────────────────────────────────────────
const IN_FROM_SCALE = 0.6; // 시작 크기.
const IN_FROM_DY = 36; // 시작 시 아래로 처진 오프셋(px) — 떠오르며 안착.
const IN_OVERSHOOT = 1.05; // 1차 부풂(오버슈트).
const IN_SQUASH = 0.97; // 2차 눌림(젤리 복원).
const IN_AXIS_LEAD_MS = 40; // scaleY 가 scaleX 를 따라오는 지연 — 유기적 비대칭.
const IN_DIM_MS = 200;

/**
 * **일렁임 세기**(PO 2026-08-24: "아이템샵·콜렉션·시작 팝업이 너무 일렁입니다. 약간 줄여주고
 * 나머지에는 약간 가미해 주세요").
 *
 * 위 상수는 **세기 1.0** 기준값이다. 실제 팝업은 이 배율로 낮춰 쓴다 —
 *   · `soft`(0.55)  = 원래 젤리를 쓰던 큰 팝업(아이템샵·콜렉션·시작 팝업)
 *   · `subtle`(0.3) = 그동안 그냥 떠 있던 패널(리그·위클리·리더보드 등)에 살짝만
 * 배율은 **오버슈트·눌림·시작 크기·처짐**에 함께 걸려, 숫자 하나로 전체 인상이 바뀐다.
 */
export const POPUP_WOBBLE = { soft: 0.55, subtle: 0.3, full: 1 } as const;

// ── 닫힘(들숨→날숨) 튜너블 ──────────────────────────────────────────────
const OUT_INHALE = 1.04; // 사라지기 직전 살짝 부풂.
const OUT_TO_SCALE = 0.7; // 빨려드는 최종 크기.

/** 열림 연출 — dim 은 최종 알파가 이미 설정된 상태로 넘긴다(여기서 0→그 값으로 페이드). */
/**
 * **원점이 (0,0)인 패널에 살짝만 일렁임을 준다**(PO 2026-08-24: "나머지에는 이 일렁임을 약간
 * 가미해 주세요").
 *
 * 저작 좌표를 그대로 쓰는 패널(리그·위클리·리더보드)은 컨테이너 원점이 좌상단이라 `setScale` 만
 * 하면 **좌상단을 축으로** 커져 화면 밖으로 밀린다. 그래서 매 프레임 위치를 되밀어 **시각적 중심**을
 * 고정한 채 크기만 흔든다.
 *
 * @param center 패널의 시각적 중심(저작 좌표계).
 */
export function popupSubtleIn(
  scene: Phaser.Scene,
  dim: Phaser.GameObjects.Rectangle | undefined,
  root: Phaser.GameObjects.Container,
  center: { x: number; y: number },
  wobble: number = POPUP_WOBBLE.subtle,
): void {
  const k = Math.max(0, Math.min(1, wobble));
  if (dim) {
    const a = dim.alpha;
    dim.setAlpha(0);
    scene.tweens.add({ targets: dim, alpha: a, duration: IN_DIM_MS, ease: 'Sine.easeOut' });
  }

  /*
   * ⚠️ **딤(반투명 배경)은 일렁이면 안 된다**(PO 2026-08-24). 이 패널들은 딤도 같은 컨테이너에 들어
   *   있어서 루트를 그대로 키우면 배경까지 출렁였다. 딤만 남기고 **나머지를 안쪽 컨테이너로 옮겨**
   *   그것만 흔든다(자식 순서를 유지해 딤이 계속 맨 아래에 남는다).
   */
  const inner = scene.add.container(0, 0);
  const kids = root.list.filter((o) => o !== dim);
  for (const kid of kids) root.remove(kid);
  inner.add(kids);
  root.add(inner);

  const baseX = inner.x;
  const baseY = inner.y;
  const apply = (sx: number, sy: number): void => {
    if (!inner.active) return;
    inner.scaleX = sx;
    inner.scaleY = sy;
    // 중심 고정 — 좌상단 원점 컨테이너를 축별로 되밀어 준다.
    inner.x = baseX + center.x * (1 - sx);
    inner.y = baseY + center.y * (1 - sy);
  };

  /*
   * **끊김 없는 한 줄기 곡선**(PO 2026-08-24: "툭툭 끊기면서 커지는 구조 … 아이템샵처럼 부드러운
   *   일렁임"). 예전에는 부풂→눌림→안착을 **체인 트윈 3단**으로 이어 붙여, 단계마다 이징이 바뀌며
   *   툭툭 끊겨 보였다. 이제 카운터 하나(Sine 이징)를 0→1 로 굴리고 **그 값에서 두 축을 계산**한다 —
   *   가로가 부풀 때 세로가 눌리고, 끝에서 정확히 1 로 만난다.
   */
  const from = 1 - (1 - IN_FROM_SCALE) * k; // 시작 크기.
  const over = 1 + (IN_OVERSHOOT - 1) * k; // 가로 최대 부풂.
  const squash = 1 - (1 - IN_SQUASH) * k; // 그때 세로 눌림.
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  const at = (p: number): { sx: number; sy: number } => {
    if (p < 0.55) {
      const t = p / 0.55;
      return { sx: lerp(from, over, t), sy: lerp(from, squash, t) };
    }
    const t = (p - 0.55) / 0.45;
    return { sx: lerp(over, 1, t), sy: lerp(squash, 1, t) };
  };

  const s0 = at(0);
  apply(s0.sx, s0.sy);
  inner.setAlpha(0);
  scene.tweens.add({ targets: inner, alpha: 1, duration: 160, ease: 'Sine.easeOut' });
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 460,
    ease: 'Sine.easeInOut',
    onUpdate: (tw) => {
      const v = at(tw.getValue() ?? 1);
      apply(v.sx, v.sy);
    },
    onComplete: () => apply(1, 1), // 반드시 원래 크기로 끝난다.
  });
}

/**
 * 팝업 상단 배너(타이틀)에 붙이는 이름표 — 등장 연출이 창보다 **늦게 내려앉는 2차 움직임**을
 * 줄 대상을 찾을 때 쓴다. 이식한 패널들이 이 이름으로 헤더를 표시한다.
 */
export const POPUP_HEADER_NAME = 'popupHeader';

export function popupOrganicIn(
  scene: Phaser.Scene,
  dim: Phaser.GameObjects.Rectangle,
  frame: Phaser.GameObjects.Container,
  wobble: number = POPUP_WOBBLE.soft,
): void {
  const k = Math.max(0, Math.min(1, wobble));
  const fromScale = 1 - (1 - IN_FROM_SCALE) * k;
  const fromDy = IN_FROM_DY * k;
  const overshoot = 1 + (IN_OVERSHOOT - 1) * k;
  const squash = 1 - (1 - IN_SQUASH) * k;

  const dimAlpha = dim.alpha;
  dim.setAlpha(0);
  scene.tweens.add({ targets: dim, alpha: dimAlpha, duration: IN_DIM_MS, ease: 'Sine.easeOut' });

  const restY = frame.y;
  frame.setScale(fromScale).setAlpha(0);
  frame.y = restY + fromDy;
  scene.tweens.add({ targets: frame, alpha: 1, duration: 150, ease: 'Sine.easeOut' });
  scene.tweens.add({ targets: frame, y: restY, duration: 300, ease: 'Cubic.easeOut' });
  const jelly = (prop: 'scaleX' | 'scaleY', delay: number): void => {
    scene.tweens.chain({
      targets: frame,
      tweens: [
        { [prop]: overshoot, duration: 200, ease: 'Quad.easeOut', delay },
        { [prop]: squash, duration: 110, ease: 'Sine.easeInOut' },
        { [prop]: 1, duration: 130, ease: 'Sine.easeOut' },
      ],
    });
  };
  jelly('scaleX', 0);
  jelly('scaleY', IN_AXIS_LEAD_MS * k);
}

/**
 * **페이지 전환(스와이프) 연출** — 현재 내용이 날숨(살짝 눌리며 퇴장 방향으로 밀려나 페이드)한 뒤,
 *   applySwap(페이지 내용 교체) 호출 → 반대편에서 젤리(오버슈트→눌림→안착)로 들어온다.
 *   wrap 은 **내용 중심에 놓인 래퍼 컨테이너**여야 스케일이 카드 중심 기준으로 먹는다.
 *   offsetX 부호 = 퇴장 방향(restX − offsetX 로 나가고 restX + offsetX 에서 들어옴).
 *   onDone 은 안착 완료 시 1회 호출(호출부의 sliding 잠금 해제용).
 */
/*
 * **컬렉션 페이지 전환 전용 완화값**(PO 2026-08-31 "너무 출렁입니다 — 살짝만") — 이 함수 밖의 팝업
 *   열림/닫힘·일렁임은 위 IN_OVERSHOOT(1.05)/IN_SQUASH(0.97) 을 그대로 쓴다. 여기만 따로 더 얕게 잡는다.
 */
const PAGE_EXIT_SCALE_X = 0.94; // 퇴장 시 눌림(가로) — 기존 0.85 는 너무 크게 찌그러졌다.
const PAGE_EXIT_SCALE_Y = 0.97; // 퇴장 시 눌림(세로).
const PAGE_ENTER_START_SCALE = 0.9; // 진입 시작 크기 — 기존 0.7 은 팝콘처럼 튀어 보였다.
const PAGE_OVERSHOOT = 1.02; // 진입 오버슈트 — 기존 1.05 보다 얕게.
const PAGE_SQUASH = 0.985; // 진입 되눌림 — 기존 0.97 보다 얕게.

export function popupOrganicPageSwap(
  scene: Phaser.Scene,
  wrap: Phaser.GameObjects.Container,
  restX: number,
  offsetX: number,
  applySwap: () => void,
  onDone: () => void,
): void {
  scene.tweens.add({
    targets: wrap,
    x: restX - offsetX,
    alpha: 0,
    scaleX: PAGE_EXIT_SCALE_X,
    scaleY: PAGE_EXIT_SCALE_Y,
    duration: 150,
    ease: 'Cubic.easeIn',
    onComplete: () => {
      applySwap();
      wrap.setPosition(restX + offsetX, wrap.y);
      wrap.setAlpha(0);
      wrap.setScale(PAGE_ENTER_START_SCALE);
      scene.tweens.add({ targets: wrap, x: restX, alpha: 1, duration: 260, ease: 'Cubic.easeOut' });
      scene.tweens.chain({
        targets: wrap,
        tweens: [
          { scaleX: PAGE_OVERSHOOT, duration: 180, ease: 'Quad.easeOut' },
          { scaleX: PAGE_SQUASH, duration: 100, ease: 'Sine.easeInOut' },
          { scaleX: 1, duration: 120, ease: 'Sine.easeOut' },
        ],
      });
      scene.tweens.chain({
        targets: wrap,
        tweens: [
          { scaleY: PAGE_OVERSHOOT, duration: 180, ease: 'Quad.easeOut', delay: IN_AXIS_LEAD_MS },
          { scaleY: PAGE_SQUASH, duration: 100, ease: 'Sine.easeInOut' },
          { scaleY: 1, duration: 120, ease: 'Sine.easeOut' },
        ],
        onComplete: onDone, // scaleY 체인이 리드 지연 포함 가장 늦게 끝난다.
      });
    },
  });
}

/** 닫힘 연출 — 살짝 부풀었다(들숨) 축소·페이드(날숨) 후 onDone 호출(보통 layer.destroy()). */
export function popupOrganicOut(scene: Phaser.Scene, dim: Phaser.GameObjects.Rectangle, frame: Phaser.GameObjects.Container, onDone: () => void): void {
  scene.tweens.add({ targets: dim, alpha: 0, duration: 180, ease: 'Sine.easeIn' });
  scene.tweens.chain({
    targets: frame,
    tweens: [
      { scaleX: OUT_INHALE, scaleY: OUT_INHALE, duration: 90, ease: 'Sine.easeOut' },
      { scaleX: OUT_TO_SCALE, scaleY: OUT_TO_SCALE, alpha: 0, duration: 150, ease: 'Cubic.easeIn' },
    ],
    onComplete: onDone,
  });
}

/**
 * **컨테이너 없이** 여러 오브젝트를 한 덩어리처럼 **살짝 일렁이게** 한다
 * (PO 2026-08-24: "표시한 전체가(스토어 포함) 약간 일렁이는 느낌 … 작은 일렁임으로 동적인 연출만").
 *
 * 플레이 화면의 창은 **컨테이너가 아니라 씬에 직접** 붙어 있고 깊이가 촘촘히 정해져 있다.
 * 컨테이너로 묶으면 그리기 순서가 add 순서로 바뀌어 겹침이 무너진다. 그래서 각 오브젝트의 위치를
 * **공통 피벗 기준으로 직접 환산**해 같은 효과를 낸다.
 *
 * ⚠️ 축을 **체인 트윈 두 개**로 흔들면 안 된다 — Phaser 는 같은 target 에 새 트윈이 붙으면 앞의 것을
 *   정리해 버려, 창이 찌그러진 채 멈춘다(실측 0.991, 2026-08-24). **카운터 하나**로 두 축을 함께
 *   계산하고, 마지막에 정확히 1 로 끝난다.
 *
 * @param pivot 창의 시각적 중심(저작 좌표).
 * @param amp   진폭(기본 2%) — 가로가 부풀 때 세로가 눌려 "찌그러졌다 펴짐"이 된다.
 */
export function squashInObjects(
  scene: Phaser.Scene,
  objects: readonly Phaser.GameObjects.GameObject[],
  pivot: { x: number; y: number },
  amp = 0.02,
  durationMs = 620,
): void {
  type Movable = Phaser.GameObjects.GameObject & { x: number; y: number; scaleX: number; scaleY: number; active: boolean };
  const items = objects.filter((o): o is Movable => {
    const m = o as Partial<Movable>;
    return typeof m.x === 'number' && typeof m.scaleX === 'number';
  });
  if (!items.length) return;
  const base = items.map((o) => ({ o, x: o.x, y: o.y, sx: o.scaleX, sy: o.scaleY }));
  const apply = (sx: number, sy: number): void => {
    for (const b of base) {
      if (!b.o.active) continue;
      b.o.scaleX = b.sx * sx;
      b.o.scaleY = b.sy * sy;
      b.o.x = pivot.x + (b.x - pivot.x) * sx;
      b.o.y = pivot.y + (b.y - pivot.y) * sy;
    }
  };
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  /** 전반: 살짝 작게 → 가로 부풂/세로 눌림. 후반: 정확히 1 로 안착. */
  const at = (p: number): { sx: number; sy: number } => {
    if (p < 0.5) {
      const t = p / 0.5;
      return { sx: lerp(1 - amp * 1.5, 1 + amp, t), sy: lerp(1 - amp * 1.5, 1 - amp * 0.5, t) };
    }
    const t = (p - 0.5) / 0.5;
    return { sx: lerp(1 + amp, 1, t), sy: lerp(1 - amp * 0.5, 1, t) };
  };
  const s0 = at(0);
  apply(s0.sx, s0.sy);
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: durationMs,
    ease: 'Sine.easeInOut',
    onUpdate: (tw) => {
      const v = at(tw.getValue() ?? 1);
      apply(v.sx, v.sy);
    },
    onComplete: () => apply(1, 1), // 반드시 원래 크기로 끝난다.
  });
}
