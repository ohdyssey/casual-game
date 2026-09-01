import { describe, expect, it } from 'vitest';
import { fitMessagePanel, GREEN_PANEL, YELLOW_PANEL } from './messagePanel.js';

describe('fitMessagePanel', () => {
  it('두 줄 문구가 안쪽 영역 안에 여백을 두고 들어간다', () => {
    const textH = 124; // 48px 두 줄.
    const fit = fitMessagePanel(GREEN_PANEL, 480, textH, { minW: 600, maxW: 1015 });
    expect(fit.ph * GREEN_PANEL.innerH).toBeGreaterThanOrEqual(textH + 96);
  });

  it('폭 상한에 걸리면 세로를 늘려서라도 안쪽을 확보한다', () => {
    const fit = fitMessagePanel(GREEN_PANEL, 900, 400, { minW: 600, maxW: 1000 });
    expect(fit.pw).toBe(1000);
    expect(fit.ph * GREEN_PANEL.innerH).toBeGreaterThanOrEqual(400 + 96);
  });

  it('꼬리가 있는 창은 글자를 안쪽 중심(=약간 위)으로 올린다', () => {
    const fit = fitMessagePanel(YELLOW_PANEL, 200, 60, { minW: 400, maxW: 900 });
    expect(fit.textY).toBeLessThan(0);
    expect(Math.abs(fit.textY)).toBeLessThan(fit.ph * 0.05);
  });
});
