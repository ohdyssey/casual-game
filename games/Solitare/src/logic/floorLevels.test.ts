import { describe, it, expect } from 'vitest';
import {
  coerceFloor,
  coercePack,
  homeBand,
  placementsForHome,
  placementsForPlay,
  stackPitch,
  HOME_LAYERS,
  PLAY_LAYERS,
  RENDER_ORDER,
  TEMPLATE_LAYERS,
  FRAME_H,
} from './floorLevels.js';

const P = (over: Record<string, unknown> = {}) => ({ id: 'a', asset: 'up_x', x: 540, y: 400, w: 200, h: 200, rot: 0, flipX: false, ...over });

describe('coercePack', () => {
  it('template 4레이어 + levels 정렬 + 방어', () => {
    const pack = coercePack({
      kind: 'floorLevelPack',
      template: { facade: [P({ id: 'f1' })], glass: [P({ id: 'g1' }), { id: 'bad' }] },
      levels: [{ index: 2, character: [P({ id: 'c2' })] }, { index: 1 }],
    });
    expect(Object.keys(pack.template).sort()).toEqual([...TEMPLATE_LAYERS].sort());
    expect(pack.template.glass).toHaveLength(1); // asset 없는 요소 제거
    expect(pack.levels.map((l) => l.index)).toEqual([1, 2]); // index 정렬
  });
});

describe('template 위치 공유 + 층별 이미지 override', () => {
  const pack = coercePack({
    template: {
      facade: [P({ id: 'f1', asset: 'facadeA', y: 300, h: 200 })],
      roof: [P({ id: 'r1', asset: 'roofA', y: 120, h: 200 })],
      glass: [P({ id: 'gl1', asset: 'glassA', y: 500, h: 100 })],
      interior: [P({ id: 'in1', asset: 'interiorA', y: 1500, h: 800 })],
    },
    levels: [
      { index: 1, character: [P({ id: 'c1', asset: 'chef' })], overrides: {} },
      { index: 2, character: [], overrides: { facade: { f1: 'facadeB' }, interior: { in1: 'interiorB' } } },
    ],
  });

  it('플레이 = 5레이어, RENDER_ORDER(하→상), 캐릭터는 유리 뒤', () => {
    const ps = placementsForPlay(pack, pack.levels[0]);
    expect(ps.map((p) => p.layer)).toEqual(['interior', 'facade', 'roof', 'character', 'glass']);
    // glass 가 character 뒤(더 앞) — 배열에서 character 다음이 glass
    expect(ps.findIndex((p) => p.layer === 'glass')).toBeGreaterThan(ps.findIndex((p) => p.layer === 'character'));
  });

  it('홈 = interior 제외(외관만)', () => {
    const ps = placementsForHome(pack, pack.levels[0]);
    expect(ps.some((p) => p.layer === 'interior')).toBe(false);
    expect(ps.map((p) => p.layer).sort()).toEqual([...HOME_LAYERS].sort());
  });

  it('template 위치는 전 층 동일, 이미지만 override 로 교체', () => {
    const f1 = placementsForPlay(pack, pack.levels[0]);
    const f2 = placementsForPlay(pack, pack.levels[1]);
    const fac1 = f1.find((p) => p.id === 'f1')!;
    const fac2 = f2.find((p) => p.id === 'f1')!;
    expect(fac2.x).toBe(fac1.x); // 위치 동일
    expect(fac2.y).toBe(fac1.y);
    expect(fac1.asset).toBe('facadeA'); // 1층 기본
    expect(fac2.asset).toBe('facadeB'); // 2층 override
    const in1 = f1.find((p) => p.id === 'in1')!;
    const in2 = f2.find((p) => p.id === 'in1')!;
    expect(in2.x).toBe(in1.x); // 내부도 위치 동일
    expect(in2.asset).toBe('interiorB');
  });

  it('홈 dy 오프셋은 y 만 평행이동(template 불변)', () => {
    const ps = placementsForHome(pack, pack.levels[0], -1000);
    expect(ps.find((p) => p.id === 'gl1')!.y).toBe(500 - 1000);
    expect(pack.template.glass[0].y).toBe(500); // 원본 immutable
  });
});

describe('homeBand / stackPitch', () => {
  it('밴드 = template facade+roof+glass bbox(interior 제외), 전 층 동일', () => {
    const pack = coercePack({
      template: {
        facade: [P({ y: 300, h: 200 })], // 200..400
        roof: [P({ y: 120, h: 200 })], // 20..220
        glass: [P({ y: 500, h: 100 })], // 450..550
        interior: [P({ y: 1500, h: 800 })], // 제외
      },
      levels: [{ index: 1 }],
    });
    expect(homeBand(pack)).toEqual({ y0: 20, y1: 550 });
    expect(stackPitch(pack)).toBe(530);
  });
  it('빈 template → band null, pitch>0', () => {
    const pack = coercePack({ template: {}, levels: [{ index: 1 }] });
    expect(homeBand(pack)).toBeNull();
    expect(stackPitch(pack)).toBeGreaterThan(0);
    expect(stackPitch(pack)).toBeLessThanOrEqual(FRAME_H);
  });
});

describe('coerceFloor', () => {
  it('overrides 는 문자열 값만, character asset 없으면 제거', () => {
    const f = coerceFloor({ index: 3, character: [P(), { id: 'x' }], overrides: { facade: { s1: 'imgB', s2: 42 } } });
    expect(f.character).toHaveLength(1);
    expect(f.overrides.facade).toEqual({ s1: 'imgB' });
    expect(f.index).toBe(3);
  });
});

describe('상수 계약', () => {
  it('HOME_LAYERS ⊂ PLAY_LAYERS, RENDER_ORDER = PLAY_LAYERS 치환', () => {
    expect(HOME_LAYERS.every((l) => PLAY_LAYERS.includes(l))).toBe(true);
    expect([...RENDER_ORDER].sort()).toEqual([...PLAY_LAYERS].sort());
  });
});
