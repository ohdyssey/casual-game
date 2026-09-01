import { describe, it, expect } from 'vitest';
import { BONUS_MAX_STARS, bonusRoundStars, bonusStarsPreview } from './bonusStars.js';

describe('bonusStars — 보너스 라운드 리그 별 등급', () => {
  it('지면 0이다 — 아무리 잘 이어 냈어도 완료가 전제', () => {
    expect(bonusRoundStars({ won: false, missionsCompleted: 0 })).toBe(0);
    expect(bonusRoundStars({ won: false, missionsCompleted: 99 })).toBe(0);
  });

  it('이기기만 해도 1개(완료 보상)', () => {
    expect(bonusRoundStars({ won: true, missionsCompleted: 0 })).toBe(1);
  });

  it('연속 5매칭 1회마다 +1', () => {
    expect(bonusRoundStars({ won: true, missionsCompleted: 1 })).toBe(2);
    expect(bonusRoundStars({ won: true, missionsCompleted: 3 })).toBe(4);
  });

  it('**최대 5개**를 넘지 않는다 — 예전엔 한 판에 30~40개가 나왔다', () => {
    expect(bonusRoundStars({ won: true, missionsCompleted: 4 })).toBe(BONUS_MAX_STARS);
    expect(bonusRoundStars({ won: true, missionsCompleted: 40 })).toBe(BONUS_MAX_STARS);
    expect(BONUS_MAX_STARS).toBe(5);
  });

  it('깨진 입력(음수·소수)에도 등급이 폭주하지 않는다', () => {
    expect(bonusRoundStars({ won: true, missionsCompleted: -3 })).toBe(1);
    expect(bonusRoundStars({ won: true, missionsCompleted: 2.9 })).toBe(3);
  });

  it('미리보기는 "지금 끝내면 몇 별인지" — 게이지 칸 수와 같다', () => {
    expect(bonusStarsPreview(0)).toBe(1);
    expect(bonusStarsPreview(2)).toBe(3);
    expect(bonusStarsPreview(9)).toBe(5);
  });
});
