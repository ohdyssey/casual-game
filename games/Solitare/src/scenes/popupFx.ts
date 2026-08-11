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

// ── 닫힘(들숨→날숨) 튜너블 ──────────────────────────────────────────────
const OUT_INHALE = 1.04; // 사라지기 직전 살짝 부풂.
const OUT_TO_SCALE = 0.7; // 빨려드는 최종 크기.

/** 열림 연출 — dim 은 최종 알파가 이미 설정된 상태로 넘긴다(여기서 0→그 값으로 페이드). */
export function popupOrganicIn(scene: Phaser.Scene, dim: Phaser.GameObjects.Rectangle, frame: Phaser.GameObjects.Container): void {
  const dimAlpha = dim.alpha;
  dim.setAlpha(0);
  scene.tweens.add({ targets: dim, alpha: dimAlpha, duration: IN_DIM_MS, ease: 'Sine.easeOut' });

  const restY = frame.y;
  frame.setScale(IN_FROM_SCALE).setAlpha(0);
  frame.y = restY + IN_FROM_DY;
  scene.tweens.add({ targets: frame, alpha: 1, duration: 150, ease: 'Sine.easeOut' });
  scene.tweens.add({ targets: frame, y: restY, duration: 300, ease: 'Cubic.easeOut' });
  const jelly = (prop: 'scaleX' | 'scaleY', delay: number): void => {
    scene.tweens.chain({
      targets: frame,
      tweens: [
        { [prop]: IN_OVERSHOOT, duration: 200, ease: 'Quad.easeOut', delay },
        { [prop]: IN_SQUASH, duration: 110, ease: 'Sine.easeInOut' },
        { [prop]: 1, duration: 130, ease: 'Sine.easeOut' },
      ],
    });
  };
  jelly('scaleX', 0);
  jelly('scaleY', IN_AXIS_LEAD_MS);
}

/**
 * **페이지 전환(스와이프) 연출** — 현재 내용이 날숨(살짝 눌리며 퇴장 방향으로 밀려나 페이드)한 뒤,
 *   applySwap(페이지 내용 교체) 호출 → 반대편에서 젤리(오버슈트→눌림→안착)로 들어온다.
 *   wrap 은 **내용 중심에 놓인 래퍼 컨테이너**여야 스케일이 카드 중심 기준으로 먹는다.
 *   offsetX 부호 = 퇴장 방향(restX − offsetX 로 나가고 restX + offsetX 에서 들어옴).
 *   onDone 은 안착 완료 시 1회 호출(호출부의 sliding 잠금 해제용).
 */
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
    scaleX: 0.85,
    scaleY: 0.92,
    duration: 150,
    ease: 'Cubic.easeIn',
    onComplete: () => {
      applySwap();
      wrap.setPosition(restX + offsetX, wrap.y);
      wrap.setAlpha(0);
      wrap.setScale(0.7);
      scene.tweens.add({ targets: wrap, x: restX, alpha: 1, duration: 260, ease: 'Cubic.easeOut' });
      scene.tweens.chain({
        targets: wrap,
        tweens: [
          { scaleX: IN_OVERSHOOT, duration: 180, ease: 'Quad.easeOut' },
          { scaleX: IN_SQUASH, duration: 100, ease: 'Sine.easeInOut' },
          { scaleX: 1, duration: 120, ease: 'Sine.easeOut' },
        ],
      });
      scene.tweens.chain({
        targets: wrap,
        tweens: [
          { scaleY: IN_OVERSHOOT, duration: 180, ease: 'Quad.easeOut', delay: IN_AXIS_LEAD_MS },
          { scaleY: IN_SQUASH, duration: 100, ease: 'Sine.easeInOut' },
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
