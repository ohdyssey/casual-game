import { describe, expect, it } from 'vitest';
import { COMBO_HEAVY_AT, COMBO_MEDIUM_AT, cueForCardPlace, cueForSfx, cueForStar } from './haptics.js';

describe('햅틱 문법', () => {
  it('콤보가 자랄수록 카드 놓기 충격이 굵어진다', () => {
    expect(cueForCardPlace(0)).toEqual({ kind: 'impact', style: 'light' });
    expect(cueForCardPlace(COMBO_MEDIUM_AT - 1)).toEqual({ kind: 'impact', style: 'light' });
    expect(cueForCardPlace(COMBO_MEDIUM_AT)).toEqual({ kind: 'impact', style: 'medium' });
    expect(cueForCardPlace(COMBO_HEAVY_AT)).toEqual({ kind: 'impact', style: 'heavy' });
    expect(cueForCardPlace(99)).toEqual({ kind: 'impact', style: 'heavy' });
  });

  it('별 1·2·3 은 light→medium→heavy, 범위 밖은 클램프', () => {
    expect(cueForStar(1)).toEqual({ kind: 'impact', style: 'light' });
    expect(cueForStar(2)).toEqual({ kind: 'impact', style: 'medium' });
    expect(cueForStar(3)).toEqual({ kind: 'impact', style: 'heavy' });
    expect(cueForStar(0)).toEqual(cueForStar(1));
    expect(cueForStar(7)).toEqual(cueForStar(3));
  });

  it('판정은 notify, 조작은 impact, 탐색은 selection 으로 계층이 나뉜다', () => {
    expect(cueForSfx('set_complete')).toEqual({ kind: 'notify', type: 'success' });
    expect(cueForSfx('stuck')).toEqual({ kind: 'notify', type: 'warning' });
    expect(cueForSfx('no_coin')).toEqual({ kind: 'notify', type: 'error' });
    expect(cueForSfx('wild_use').kind).toBe('impact');
    expect(cueForSfx('card_deal').kind).toBe('selection');
    expect(cueForSfx('card_invalid')).toEqual({ kind: 'selection', times: 2 });
  });

  it('UI 소리(버튼·팝업·토스트·코인 틱)는 진동하지 않는다 — 대비 유지', () => {
    for (const n of ['button', 'popup_open', 'popup_close', 'toast', 'coin_tick', 'transition'] as const) {
      expect(cueForSfx(n)).toEqual({ kind: 'none' });
    }
  });
});
