import { describe, expect, it } from 'vitest';
import { currentStore } from './currentStore.js';
import type { SaveData } from '../save.js';

const save = (over: Partial<SaveData>): SaveData => ({ builtFloors: 10, ownedFloors: 1, ...over } as SaveData);

describe('currentStore', () => {
  it('2번 부지가 없으면 1번 부지의 **소유** 최고층', () => {
    const s = currentStore(save({ ownedFloors: 4 }));
    expect(s).toMatchObject({ lot: 1, floor: 4, itemFloor: 4 });
    expect(s.artKeys[0]).toBe('up_Slitare_BG_04_v3');
    expect(s.clerkKeys[0]).toBe('up_Solirare_Chr_04');
  });

  it('건설만 되고 매입 전인 층은 쓰지 않는다(편의점 문제)', () => {
    // 초기 상태: 1~2층이 지어져 있지만 소유는 1층뿐 → 지금 점포는 **1층 편의점**.
    const s = currentStore(save({ builtFloors: 2, ownedFloors: 1 }));
    expect(s.floor).toBe(1);
    expect(s.artKeys.at(-1)).toBe('up_Slitare_BG_01');
  });

  it('2번 부지가 한 층이라도 지어졌으면 그쪽 최상층이 지금 점포', () => {
    const s = currentStore(save({ ownedFloors: 10, lot2Owned: 3 }));
    expect(s).toMatchObject({ lot: 2, floor: 3, itemFloor: 13 });
    expect(s.artKeys.at(-1)).toBe('up_Slitare_BG_02_03');
    expect(s.clerkKeys[0]).toBe('up_Solirare_Chr_02_03');
  });

  it('상품 층은 20층 표 범위를 넘지 않는다', () => {
    expect(currentStore(save({ ownedFloors: 10, lot2Owned: 10 })).itemFloor).toBe(20);
  });

  it('건설 0/이상값도 1..10 으로 잘린다', () => {
    expect(currentStore(save({ ownedFloors: 0 })).floor).toBe(1);
    expect(currentStore(save({ ownedFloors: 99 })).floor).toBe(10);
    expect(currentStore(save({ ownedFloors: 1, lot2Owned: 99 })).floor).toBe(10);
  });
});
