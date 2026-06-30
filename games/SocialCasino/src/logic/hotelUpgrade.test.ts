import { describe, it, expect } from 'vitest';
import {
  HOTEL_OBJECTS,
  MAX_LEVEL,
  ARROW_KEY,
  createHotelState,
  objectLevel,
  cityLevel,
  nextCostFor,
  canUpgrade,
  upgradeObject,
  upgradeSpinGrant,
  incomeMultiplierFor,
  totalLevel,
  formatCompact,
  serializeHotel,
  deserializeHotel,
  parseHotelLayout,
  currentStage,
  isStageComplete,
  isLastStage,
  advanceStage,
  stageReward,
  type LayoutNodeLike,
} from './hotelUpgrade.js';
import { cityCost, hotelSpinGrant, incomeMultiplier } from './progression.js';

describe('hotelUpgrade — 호텔 업그레이드 로직', () => {
  it('초기 상태 = 5종 전부 레벨1', () => {
    const s = createHotelState();
    expect(s.levels).toHaveLength(5);
    expect(s.levels.every((l) => l === 1)).toBe(true);
    expect(totalLevel(s)).toBe(5);
  });

  it('레벨업 비용 = **각 오브젝트 개별**(자기 레벨 기준) — 하나 올려도 다른 오브젝트 가격 불변(요청 2026-06-29)', () => {
    let s = createHotelState();
    expect(cityLevel(s)).toBe(0);
    expect(nextCostFor(s, 0)).toBe(cityCost(0)); // 오브젝트0 Lv1→2 = 100K
    const obj1Before = nextCostFor(s, 1); // 오브젝트1 비용(오브젝트0 올리기 전)
    s = upgradeObject(s, 0); // 오브젝트0만 1칸 업
    expect(nextCostFor(s, 1)).toBe(obj1Before); // ⭐다른 오브젝트(1) 가격 불변 = 개별 가격
    expect(nextCostFor(s, 0)).toBe(cityCost(1)); // 올린 오브젝트(0) 자신만 상승(Lv2→3)
    expect(nextCostFor(s, 0)).toBeGreaterThan(cityCost(0)); // 단조 상승
  });

  it('레벨업 환급 = 스핀 뭉치(hotelSpinGrant) + 코인획득 배수(incomeMultiplier), 시티레벨 함수', () => {
    let s = createHotelState();
    expect(upgradeSpinGrant(s)).toBe(hotelSpinGrant(0));
    expect(incomeMultiplierFor(s)).toBe(incomeMultiplier(0));
    s = upgradeObject(s, 0);
    expect(upgradeSpinGrant(s)).toBe(hotelSpinGrant(1));
    expect(incomeMultiplierFor(s)).toBeGreaterThan(incomeMultiplier(0));
  });

  it('업그레이드 = 레벨 1씩 상승, 최대(5)에서 정지', () => {
    let s = createHotelState();
    for (let i = 0; i < 4; i++) s = upgradeObject(s, 0);
    expect(objectLevel(s, 0)).toBe(MAX_LEVEL);
    const before = s.levels.slice();
    s = upgradeObject(s, 0); // 최대 → 변화 없음
    expect(s.levels).toEqual(before);
  });

  it('canUpgrade = 코인 충분 + 최대 미만일 때만', () => {
    const s = createHotelState();
    expect(canUpgrade(s, 0, 10_000)).toBe(true); // 1→2 = 10K (÷10 리데노미네이션)
    expect(canUpgrade(s, 0, 9_999)).toBe(false); // 코인 부족
    let maxed = s;
    for (let i = 0; i < 4; i++) maxed = upgradeObject(maxed, 0);
    expect(nextCostFor(maxed, 0)).toBeNull();
    expect(canUpgrade(maxed, 0, 999_999_999)).toBe(false); // 최대레벨
  });

  it('불변성 — upgradeObject 가 원본을 바꾸지 않음', () => {
    const s = createHotelState();
    const s2 = upgradeObject(s, 1);
    expect(s.levels[1]).toBe(1);
    expect(s2.levels[1]).toBe(2);
    expect(s2).not.toBe(s);
  });

  it('formatCompact — K/M 축약', () => {
    expect(formatCompact(100_000)).toBe('100K');
    expect(formatCompact(200_000)).toBe('200K');
    expect(formatCompact(1_000_000)).toBe('1M');
    expect(formatCompact(1_500_000)).toBe('1.5M');
    expect(formatCompact(5_000_000)).toBe('5M');
    expect(formatCompact(500)).toBe('500');
  });

  it('직렬화 라운드트립 + 손상 복구', () => {
    let s = createHotelState();
    s = upgradeObject(s, 2);
    s = upgradeObject(s, 2);
    const round = deserializeHotel(serializeHotel(s));
    expect(round?.levels).toEqual(s.levels);
    expect(deserializeHotel('garbage')).toBeNull();
    expect(deserializeHotel(null)).toBeNull();
    const fixed = deserializeHotel(JSON.stringify({ levels: [9, -3, 1, 1, 1] }));
    expect(fixed?.levels[0]).toBe(MAX_LEVEL);
    expect(fixed?.levels[1]).toBe(1);
  });

  it('스테이지 진행 — 완성 판정·다음 스테이지·마지막 스테이지·보상', () => {
    let s = createHotelState();
    expect(currentStage(s)).toBe(1);
    expect(isStageComplete(s)).toBe(false);
    expect(isLastStage(s)).toBe(false);
    // 전 시설 Lv5 → 스테이지 완성
    s = { stage: 1, levels: HOTEL_OBJECTS.map(() => MAX_LEVEL) };
    expect(isStageComplete(s)).toBe(true);
    // 다음 스테이지 = 레벨 전부 1 리셋 + 스테이지 +1
    const s2 = advanceStage(s);
    expect(currentStage(s2)).toBe(2);
    expect(s2.levels.every((l) => l === 1)).toBe(true);
    expect(isStageComplete(s2)).toBe(false);
    // 마지막 스테이지(=2)에서 전부 Lv5 면 완성이지만 더 못 넘어감
    const s2done = { stage: 2, levels: HOTEL_OBJECTS.map(() => MAX_LEVEL) };
    expect(isLastStage(s2done)).toBe(true);
    expect(isStageComplete(s2done)).toBe(true);
    expect(advanceStage(s2done)).toBe(s2done); // 그대로 반환(넘어갈 곳 없음)
    // 보상 = 완성 스테이지 비례
    expect(stageReward(1).coins).toBeGreaterThan(0);
    expect(stageReward(2).coins).toBeGreaterThan(stageReward(1).coins);
  });

  it('parseHotelLayout — 레벨 노드 그룹화 + 화살표 근접 배정', () => {
    // 슬롯1·2 의 레벨1..5 노드(버전 접미 섞임) + 슬롯별 화살표(오브젝트 근처).
    const nodes: LayoutNodeLike[] = [
      { id: 's1L1', key: 'up_Stage001_BG_01_1-1_v10', x: 235, y: 524 },
      { id: 's1L2', key: 'up_Stage001_BG_01_2-1_v4', x: 237, y: 524 },
      { id: 's1L3', key: 'up_Stage001_BG_01_3-1', x: 238, y: 524 },
      { id: 's1L4', key: 'up_Stage001_BG_01_4-1_v3', x: 237, y: 524 },
      { id: 's1L5', key: 'up_Stage001_BG_01_5-1', x: 239, y: 523 },
      { id: 's2L1', key: 'up_Stage001_BG_01_1-2_v7', x: 474, y: 458 },
      { id: 's2L3', key: 'up_Stage001_BG_01_3-2', x: 474, y: 457 }, // 레벨2 누락 케이스
      { id: 'arrow1', key: ARROW_KEY, x: 196, y: 606 }, // 슬롯1 근처
      { id: 'arrow2', key: ARROW_KEY, x: 478, y: 523 }, // 슬롯2 근처
      { id: 'bg', key: 'up_Stage001_BG_01_v3', x: 360, y: 800 }, // 배경(매칭 안 됨)
    ];
    const layouts = parseHotelLayout(nodes);
    expect(layouts).toHaveLength(HOTEL_OBJECTS.length);
    const s1 = layouts.find((l) => l.slot === 1)!;
    expect(s1.levelNodeIds).toEqual(['s1L1', 's1L2', 's1L3', 's1L4', 's1L5']);
    expect(s1.arrowNodeId).toBe('arrow1'); // 가장 가까운 화살표
    const s2 = layouts.find((l) => l.slot === 2)!;
    expect(s2.levelNodeIds[0]).toBe('s2L1');
    expect(s2.levelNodeIds[1]).toBeNull(); // 레벨2 노드 없음
    expect(s2.levelNodeIds[2]).toBe('s2L3');
    expect(s2.arrowNodeId).toBe('arrow2');
    // 화살표는 1:1 배정(중복 없음)
    const s3 = layouts.find((l) => l.slot === 3)!;
    expect(s3.arrowNodeId).toBeNull(); // 슬롯3 노드 없음 → 앵커 없음 → 화살표 미배정
  });
});
