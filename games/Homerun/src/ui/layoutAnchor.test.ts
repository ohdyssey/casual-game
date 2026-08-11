/**
 * 양축 앵커 변환(anchorLayoutDoc) 검증 — 캔버스가 저작 프레임(1080×2400)과 다를 때
 * 노드가 어느 가장자리를 따라가는지 고정한다.
 *
 * 표준:
 *   세로 pin  — top=그대로 · bottom=y+dH · center=y+dH/2 (기본은 위치 휴리스틱)
 *   가로 pinX — left=그대로 · right=x+dW · center=x+dW/2 (기본 center = 세이프존 중앙정렬)
 */
import { describe, expect, it } from 'vitest';
import { anchorLayoutDoc, resolvePinX, type LayoutDoc, type LayoutNode } from './layoutAnchor.js';

const DESIGN_W = 1080;
const DESIGN_H = 2400;

function node(id: string, x: number, y: number, extra: Partial<LayoutNode> = {}): LayoutNode {
  return { id, type: 'image', key: id, x, y, w: 100, h: 100, ...extra };
}

function doc(nodes: LayoutNode[]): LayoutDoc {
  return { frame: { designW: DESIGN_W, designH: DESIGN_H }, nodes };
}

/** id → 변환된 노드. */
function byId(d: LayoutDoc): Map<string, LayoutNode> {
  return new Map(d.nodes.map((n) => [n.id, n]));
}

describe('anchorLayoutDoc — 불변성·무변화 보장', () => {
  it('캔버스가 저작 프레임과 같으면 원본 객체를 그대로 반환한다(회귀 0)', () => {
    const d = doc([node('a', 540, 1200)]);
    expect(anchorLayoutDoc(d, DESIGN_H, undefined, { canvasW: DESIGN_W })).toBe(d);
  });

  it('원본 문서를 변형하지 않는다', () => {
    const original = node('a', 540, 2200);
    const d = doc([original]);
    anchorLayoutDoc(d, 1920, undefined, { canvasW: 1261 });
    expect(original).toEqual({ id: 'a', type: 'image', key: 'a', x: 540, y: 2200, w: 100, h: 100 });
    expect(d.frame).toEqual({ designW: DESIGN_W, designH: DESIGN_H });
  });

  it('canvasW 미지정이면 가로는 손대지 않는다(세로 전용 호출 하위호환)', () => {
    const d = anchorLayoutDoc(doc([node('a', 200, 2200)]), 1920);
    expect(byId(d).get('a')?.x).toBe(200);
    expect(byId(d).get('a')?.y).toBe(2200 + (1920 - DESIGN_H));
  });
});

describe('anchorLayoutDoc — 가로 확장(세이프존 중앙정렬)', () => {
  const CANVAS_W = 1440; // dW = 360
  const dW = CANVAS_W - DESIGN_W;

  it('기본(pinX 미지정)은 dW/2 만큼 밀어 세이프존을 중앙에 놓는다', () => {
    const d = anchorLayoutDoc(doc([node('mid', 540, 1200)]), DESIGN_H, undefined, { canvasW: CANVAS_W });
    // 저작 중앙(540)이 캔버스 중앙(720)으로 정확히 이동.
    expect(byId(d).get('mid')?.x).toBe(540 + dW / 2);
    expect(byId(d).get('mid')?.x).toBe(CANVAS_W / 2);
  });

  it('세이프존 내부 노드들의 상대 간격이 보존된다', () => {
    const d = anchorLayoutDoc(doc([node('l', 200, 1200), node('r', 880, 1200)]), DESIGN_H, undefined, {
      canvasW: CANVAS_W,
    });
    const m = byId(d);
    expect((m.get('r')?.x ?? 0) - (m.get('l')?.x ?? 0)).toBe(880 - 200);
  });

  it('pinX=left/right 는 캔버스 가장자리에 붙는다', () => {
    const d = anchorLayoutDoc(
      doc([node('L', 96, 1200, { pinX: 'left' }), node('R', 984, 1200, { pinX: 'right' })]),
      DESIGN_H,
      undefined,
      { canvasW: CANVAS_W },
    );
    const m = byId(d);
    expect(m.get('L')?.x).toBe(96); // 좌단에서 96 유지
    expect(m.get('R')?.x).toBe(984 + dW); // 우단에서 1080-984=96 유지
    expect(CANVAS_W - (m.get('R')?.x ?? 0)).toBe(DESIGN_W - 984);
  });

  it('xOverrides(게임 코드)가 기본 center 를 이긴다', () => {
    const d = anchorLayoutDoc(doc([node('a', 96, 1200)]), DESIGN_H, undefined, {
      canvasW: CANVAS_W,
      xOverrides: { a: 'left' },
    });
    expect(byId(d).get('a')?.x).toBe(96);
  });

  it('노드 저작값(pinX)이 xOverrides 보다 우선한다', () => {
    const d = anchorLayoutDoc(doc([node('a', 96, 1200, { pinX: 'right' })]), DESIGN_H, undefined, {
      canvasW: CANVAS_W,
      xOverrides: { a: 'left' },
    });
    expect(byId(d).get('a')?.x).toBe(96 + dW);
  });

  it('반환 frame 은 캔버스 크기로 갱신된다(하류 소비자 일관성)', () => {
    const d = anchorLayoutDoc(doc([node('a', 540, 1200)]), 1920, undefined, { canvasW: CANVAS_W });
    expect(d.frame).toEqual({ designW: CANVAS_W, designH: 1920 });
  });
});

describe('anchorLayoutDoc — 양축 동시 변환(iPhone SE 실측 시나리오)', () => {
  // 컨테이너 375×571 → 캔버스 1261×1920 (designSize 표준 산출값).
  const CANVAS_W = 1261;
  const CANVAS_H = 1920;
  const dW = CANVAS_W - DESIGN_W; // 181
  const dH = CANVAS_H - DESIGN_H; // -480

  it('세로는 pin, 가로는 중앙정렬이 독립적으로 적용된다', () => {
    const d = anchorLayoutDoc(
      doc([node('header', 540, 190), node('ground', 540, 2200), node('card', 540, 1200)]),
      CANVAS_H,
      undefined,
      { canvasW: CANVAS_W },
    );
    const m = byId(d);
    // 상단 ⅓ → top(세로 고정), 하단 ⅓ → bottom, 중앙 → center. 가로는 전부 dW/2.
    expect(m.get('header')).toMatchObject({ x: 540 + dW / 2, y: 190 });
    expect(m.get('ground')).toMatchObject({ x: 540 + dW / 2, y: 2200 + dH });
    expect(m.get('card')).toMatchObject({ x: 540 + dW / 2, y: 1200 + dH / 2 });
  });

  it('배경(2415px)은 중앙정렬 후에도 캔버스 좌우를 덮는다 — 빈 띠 없음', () => {
    const bg = node('layer_3', 540, 1200, { w: 2415, h: 2415 });
    const d = anchorLayoutDoc(doc([bg]), CANVAS_H, undefined, { canvasW: CANVAS_W });
    const moved = byId(d).get('layer_3');
    const halfW = (moved?.w ?? 0) / 2;
    expect((moved?.x ?? 0) - halfW).toBeLessThanOrEqual(0); // 좌단 덮음
    expect((moved?.x ?? 0) + halfW).toBeGreaterThanOrEqual(CANVAS_W); // 우단 덮음
  });
});

describe('resolvePinX', () => {
  it('기본은 center — 위치로 추측하지 않는다', () => {
    expect(resolvePinX(node('a', 10, 10))).toBe('center');
    expect(resolvePinX(node('b', 1070, 2390))).toBe('center');
  });

  it('저작값 > overrides > 기본 순서', () => {
    expect(resolvePinX(node('a', 10, 10, { pinX: 'right' }), { a: 'left' })).toBe('right');
    expect(resolvePinX(node('a', 10, 10), { a: 'left' })).toBe('left');
  });
});
