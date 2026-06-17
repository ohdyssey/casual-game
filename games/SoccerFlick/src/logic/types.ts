/** 사커플릭 공용 타입 (순수 로직 — Phaser 비의존). */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** 레드 = 플레이어(하단, 상단골 공격) / 블루 = AI(상단, 하단골 공격). */
export type Team = 'red' | 'blue';

export const other = (t: Team): Team => (t === 'red' ? 'blue' : 'red');
