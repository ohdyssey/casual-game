import { describe, expect, it } from 'vitest';
import { UI_SCREENS, getScreen } from '../src/config/ui-screens.js';

describe('UI screen manifest', () => {
  it('uses unique ids, cache keys, and layout files', () => {
    for (const field of ['id', 'cacheKey', 'file']) {
      const values = UI_SCREENS.map((screen) => screen[field]);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('registers independent fishing HUD and tab documents', () => {
    expect(getScreen('fishing')).toMatchObject({
      file: 'ui/layouts/fishing.json',
      cacheKey: 'layout_fishing',
      captureScene: 'FishingScene',
      anchor: 'top',
    });
    expect(getScreen('fishing_tabs')).toMatchObject({
      file: 'ui/layouts/fishing_tabs.json',
      cacheKey: 'layout_fishing_tabs',
      captureScene: 'FishingScene',
      anchor: 'bottom',
    });
  });
});
