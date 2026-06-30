/**
 * anim/presets — 레거시 간단 애니메이션 프리셋(v1) + 카테고리/트리거/이징 목록.
 *   상대 트윈('*='/'-='/'+=')으로 base 값 보존 → 정지 시 재렌더로 복원.
 */
export const ANIM_PRESETS = {
  pulse:  (amp, dur) => ({ scale: '*=' + (1 + amp * 0.2), duration: dur, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }),
  bounce: (amp, dur) => ({ y: '-=' + (amp * 40), duration: dur, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }),
  fade:   (amp, dur) => ({ alpha: '*=' + (1 - amp * 0.6), duration: dur, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }),
  sway:   (amp, dur) => ({ angle: { from: -(amp * 16), to: amp * 16 }, duration: dur, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }),
  spin:   (amp, dur) => ({ angle: '+=360', duration: Math.max(400, dur * 4), repeat: -1, ease: 'Linear' }),
};

/** 레거시 종류 목록 [value, 라벨] — 기존 에디터 드롭다운 호환. */
export const ANIM_TYPES = [['none', '없음'], ['pulse', '맥동'], ['bounce', '통통'], ['sway', '흔들'], ['fade', '깜빡'], ['spin', '회전']];

/** v2 카테고리 [value, 라벨]. */
export const ANIM_CATEGORIES = [['none', '없음'], ['tween', '트윈(변형/속성)'], ['spring', '스프링'], ['particle', '파티클'], ['sprite', '스프라이트']];

/** 트리거 [value, 라벨]. */
export const TRIGGERS = [['idle', '상시(루프)'], ['enter', '등장'], ['tap', '누름'], ['exit', '퇴장'], ['dataChange', '값변경']];

/** 자주 쓰는 이징(전문 곡선). Phaser ease 문자열. */
export const EASES = [
  'Linear', 'Sine.easeInOut', 'Sine.easeOut', 'Sine.easeIn',
  'Quad.easeInOut', 'Cubic.easeOut', 'Cubic.easeInOut',
  'Quart.easeOut', 'Expo.easeOut', 'Circ.easeOut',
  'Back.easeOut', 'Back.easeInOut', 'Elastic.easeOut', 'Bounce.easeOut',
];
