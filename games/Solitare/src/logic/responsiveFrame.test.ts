import { describe, it, expect } from 'vitest';
import {
  SAFE_W,
  SAFE_H,
  MAX_W,
  MAX_H,
  POPUP_DESIGN_W,
  popupScale,
  frameDelta,
  resolvePinY,
  resolvePinX,
  pinShift,
  anchorNodes,
  coverScale,
  canvasSizeFor,
} from './responsiveFrame.js';

/** 실기기 화면비(h/w) — 저작비 2.222 보다 **작으면**(덜 길쭉) 폭이 늘어난다. */
const DEVICES: ReadonlyArray<{ name: string; ratio: number }> = [
  { name: 'iPhone 15 (2556×1179)', ratio: 2556 / 1179 },
  { name: 'iPhone SE (1334×750)', ratio: 1334 / 750 },
  { name: '19.5:9', ratio: 19.5 / 9 },
  { name: '20:9 (=저작비)', ratio: 20 / 9 },
  { name: '21:9', ratio: 21 / 9 },
  { name: '16:9', ratio: 16 / 9 },
];

describe('프레임 상수', () => {
  it('세이프존은 저작 프레임과 같고, 상한은 그보다 크다(늘리는 쪽으로만 가변)', () => {
    expect([SAFE_W, SAFE_H]).toEqual([1080, 2400]);
    expect(MAX_W).toBeGreaterThan(SAFE_W);
    expect(MAX_H).toBeGreaterThan(SAFE_H);
  });
});

describe('frameDelta', () => {
  it('저작 크기와 같으면 여분 0 — 현재(고정 1080×2400) 동작과 동일', () => {
    expect(frameDelta(SAFE_W, SAFE_H)).toEqual({ dW: 0, dH: 0 });
  });

  it('여분은 음수가 되지 않는다(세이프존을 잘라내지 않는다)', () => {
    expect(frameDelta(720, 1600)).toEqual({ dW: 0, dH: 0 });
  });

  it('늘어난 만큼만 여분으로 잡는다', () => {
    expect(frameDelta(MAX_W, MAX_H)).toEqual({ dW: MAX_W - SAFE_W, dH: MAX_H - SAFE_H });
  });
});

describe('canvasSizeFor — 어느 축이 늘어나는가', () => {
  it('저작비보다 덜 길쭉한 기기(주류 폰)는 **폭**이 늘어난다', () => {
    for (const d of DEVICES.filter((x) => x.ratio < SAFE_H / SAFE_W)) {
      const c = canvasSizeFor(d.ratio);
      expect(c.h, d.name).toBe(SAFE_H);
      expect(c.w, d.name).toBeGreaterThan(SAFE_W);
    }
  });

  it('저작비보다 더 길쭉한 기기(21:9)는 **높이**가 늘어난다', () => {
    const c = canvasSizeFor(21 / 9);
    expect(c.w).toBe(SAFE_W);
    expect(c.h).toBeGreaterThan(SAFE_H);
  });

  it('20:9 = 저작비 → 여분 0(회귀 없음)', () => {
    const c = canvasSizeFor(20 / 9);
    expect(frameDelta(c.w, c.h)).toEqual({ dW: 0, dH: 0 });
  });

  it('상한을 넘지 않는다', () => {
    for (const d of DEVICES) {
      const c = canvasSizeFor(d.ratio);
      expect(c.w, d.name).toBeLessThanOrEqual(MAX_W);
      expect(c.h, d.name).toBeLessThanOrEqual(MAX_H);
    }
  });

  it('주류 폰(16:9~21:9)은 상한 안에서 여백 0 — 4:3 태블릿만 레터박스', () => {
    for (const d of DEVICES) {
      const c = canvasSizeFor(d.ratio);
      expect(Math.abs(c.h / c.w - d.ratio), d.name).toBeLessThan(0.01);
    }
    // 4:3(1.333)은 필요 폭 1800 > MAX_W → 상한에 걸려 레터박스가 남는다(의도).
    expect(canvasSizeFor(4 / 3).w).toBe(MAX_W);
  });
});

describe('popupScale — 720×1600 팝업', () => {
  it('세이프존 기준 고정 배율 1.5(캔버스 폭과 무관)', () => {
    expect(popupScale(POPUP_DESIGN_W)).toBe(1.5);
  });

  it('폭이 상한까지 늘어나도 팝업은 커지지 않는다(예전 식이면 배율이 함께 튄다)', () => {
    const old = MAX_W / POPUP_DESIGN_W;
    expect(old).toBeGreaterThan(popupScale(POPUP_DESIGN_W));
    expect(popupScale(POPUP_DESIGN_W)).toBe(1.5);
    // 저작 1600 높이 × 1.5 = 2400 → 세이프존에 정확히 들어맞는다.
    expect(1600 * popupScale(POPUP_DESIGN_W)).toBe(SAFE_H);
  });
});

describe('앵커 결정', () => {
  const d = frameDelta(MAX_W, MAX_H);

  it('unit 정책은 전부 center — 팝업이 찢어지지 않는다', () => {
    expect(resolvePinY('layer_1', { x: 540, y: 200 }, 'unit')).toBe('center');
    expect(resolvePinY('layer_9', { x: 540, y: 2300 }, 'unit')).toBe('center');
  });

  it('edges 정책은 상·하단을 화면 가장자리에 붙인다', () => {
    expect(resolvePinY('hdr', { x: 540, y: 744 }, 'edges')).toBe('top'); // main.json 상단 헤더
    expect(resolvePinY('icon', { x: 970, y: 2213 }, 'edges')).toBe('bottom'); // 하단 아이콘
    expect(resolvePinY('board', { x: 540, y: 1200 }, 'edges')).toBe('center');
  });

  it('override 가 정책보다 우선한다', () => {
    expect(resolvePinY('hdr', { x: 540, y: 744 }, 'edges', { hdr: 'center' })).toBe('center');
    expect(resolvePinX('hdr')).toBe('center');
    expect(resolvePinX('hdr', { hdr: 'left' })).toBe('left');
  });

  it('이동량은 **세이프존 중앙 기준 상대값** — 중앙정렬 자체는 카메라가 한다', () => {
    expect(pinShift('center', 'center', d)).toEqual({ dx: 0, dy: 0 });
    expect(pinShift('top', 'left', d)).toEqual({ dx: -d.dW / 2, dy: -d.dH / 2 });
    expect(pinShift('bottom', 'right', d)).toEqual({ dx: d.dW / 2, dy: d.dH / 2 });
  });
});

describe('anchorNodes', () => {
  const nodes = [
    { id: 'bg', x: 540, y: 1200, w: 1080, h: 2400 },
    { id: 'hdr', x: 540, y: 744, w: 1108, h: 212 },
    { id: 'icon', x: 970, y: 2213, w: 99, h: 138 },
  ] as const;

  it('여분 0 이면 **원본 배열 그대로**(참조 동일) — 현재 동작 100% 보존', () => {
    const out = anchorNodes(nodes, frameDelta(SAFE_W, SAFE_H), { policy: 'edges' });
    expect(out).toBe(nodes);
  });

  it('원본을 변형하지 않는다(불변)', () => {
    const before = JSON.stringify(nodes);
    anchorNodes(nodes, frameDelta(MAX_W, MAX_H), { policy: 'edges' });
    expect(JSON.stringify(nodes)).toBe(before);
  });

  it('edges — 상단은 위로·하단은 아래로 dH/2 씩, 가로는 이동 없음(중앙정렬은 카메라가 한다)', () => {
    const d = frameDelta(MAX_W, MAX_H);
    const out = anchorNodes(nodes, d, { policy: 'edges' });
    const by = Object.fromEntries(out.map((n) => [n.id, n]));
    expect(by.hdr.y).toBe(744 - d.dH / 2); // top — 화면 위 가장자리
    expect(by.icon.y).toBe(2213 + d.dH / 2); // bottom
    expect(by.bg.y).toBe(1200); // center — 제자리
    for (const n of out) expect(n.x).toBe(nodes.find((o) => o.id === n.id)!.x);
  });

  it('unit — 전부 같은 양만큼 이동해 상대 배치가 보존된다', () => {
    const d = frameDelta(MAX_W, MAX_H);
    const out = anchorNodes(nodes, d, { policy: 'unit' });
    const dy = out.map((n) => n.y - nodes.find((o) => o.id === n.id)!.y);
    expect(new Set(dy).size).toBe(1);
  });
});

describe('coverScale — 배경은 축소하지 않는다', () => {
  it('이미 덮고 있으면 1(확대 없음)', () => {
    expect(coverScale(1080, 2400, 1080, 2400)).toBe(1);
    expect(coverScale(4341, 1087, 1520, 2400)).toBeGreaterThanOrEqual(1);
  });

  it('폭이 모자라면 덮을 때까지만 키운다', () => {
    expect(coverScale(1080, 2400, MAX_W, 2400)).toBeCloseTo(MAX_W / 1080, 5);
  });

  it('플레이 배경(저작 1080×2400)의 세로 크롭량 — 상한을 정한 근거', () => {
    // 상한(1420)에서 상하 각 378px. 주력 기기(19.5:9=1107)에서는 각 30px 에 불과하다.
    //   상한 근거: 브라우저 툴바가 보이는 상태(화면비 1.714)까지 좌우 여백 0 — 크롬 실측.
    expect(Math.round((2400 * coverScale(1080, 2400, MAX_W, 2400) - 2400) / 2)).toBe(378);
    expect(Math.round((2400 * coverScale(1080, 2400, 1107, 2400) - 2400) / 2)).toBe(30);
  });
});
