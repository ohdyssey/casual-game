import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MAIN_ANCHOR, MAIN_ART_STACK, MAIN_BOTTOM_BAR, MAIN_TOP_BANNER } from './mainPins.js';
import { MAX_H, MAX_W, SAFE_H, SAFE_W, anchorNodes, frameDelta } from '../logic/responsiveFrame.js';

/** 저작 SSOT 를 그대로 읽는다 — 표가 실제 main.json 과 어긋나면 테스트가 깨져야 한다. */
const doc = JSON.parse(readFileSync(new URL('../../public/ui/layouts/main.json', import.meta.url), 'utf-8')) as {
  frame: { designW: number; designH: number };
  nodes: Array<{ id: string; x: number; y: number; w?: number; h?: number; type: string }>;
};

const byId = new Map(doc.nodes.map((n) => [n.id, n]));
const dyOf = (out: readonly { id: string; y: number }[], id: string): number => {
  const after = out.find((n) => n.id === id);
  if (!after) throw new Error(`노드 없음: ${id}`);
  return after.y - byId.get(id)!.y;
};

describe('main.json 저작 전제', () => {
  it('저작 프레임 = 세이프존(1080×2400)', () => {
    expect([doc.frame.designW, doc.frame.designH]).toEqual([SAFE_W, SAFE_H]);
  });
});

describe('앵커 표가 저작 SSOT 와 어긋나지 않는다', () => {
  it('표에 적힌 id 는 전부 main.json 에 실재한다 — 에디터에서 지워진 노드를 방치하지 않는다', () => {
    const missing = Object.keys(MAIN_ANCHOR.pinY ?? {}).filter((id) => !byId.has(id));
    expect(missing).toEqual([]);
  });

  it('main.json 의 모든 노드가 세 그룹 중 하나에 속한다 — 분류 누락 방지', () => {
    const classified = new Set([...MAIN_ART_STACK, ...MAIN_BOTTOM_BAR, ...MAIN_TOP_BANNER]);
    const unclassified = doc.nodes.map((n) => n.id).filter((id) => !classified.has(id));
    expect(unclassified).toEqual([]);
  });

  it('그룹끼리 겹치지 않는다', () => {
    const all = [...MAIN_ART_STACK, ...MAIN_BOTTOM_BAR, ...MAIN_TOP_BANNER];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('여분 0 = 현재 캔버스 — 회귀 없음', () => {
  it('좌표가 하나도 바뀌지 않는다(원본 배열 그대로)', () => {
    const out = anchorNodes(doc.nodes, frameDelta(SAFE_W, SAFE_H), MAIN_ANCHOR);
    expect(out).toBe(doc.nodes);
  });
});

describe('찢어짐 방지 불변식', () => {
  const d = frameDelta(MAX_W, MAX_H); // 상한까지 늘어난 최악의 경우
  const out = anchorNodes(doc.nodes, d, MAIN_ANCHOR);

  it('아트 스택은 **전원 제자리** — 세이프존 중앙에 통째로 남아 이음새가 벌어지지 않는다', () => {
    const dys = new Set(MAIN_ART_STACK.map((id) => dyOf(out, id)));
    expect(dys).toEqual(new Set([0]));
  });

  it('가로는 아무도 움직이지 않는다 — 중앙정렬은 카메라가 한다', () => {
    const dxs = new Set(out.map((n) => n.x - byId.get(n.id)!.x));
    expect(dxs).toEqual(new Set([0]));
  });

  it('하단 아이콘 줄은 화면 아래로 dH/2 내려간다', () => {
    for (const id of MAIN_BOTTOM_BAR) expect(dyOf(out, id), id).toBe(d.dH / 2);
  });

  it('상단 리워드 배너는 화면 위로 dH/2 올라간다', () => {
    for (const id of MAIN_TOP_BANNER) expect(dyOf(out, id), id).toBe(-d.dH / 2);
  });

  it('앵커 후에도 노드가 캔버스 범위를 벗어나지 않는다(세이프존 중앙 기준 좌표계)', () => {
    const ox = (MAX_W - SAFE_W) / 2;
    const oy = (MAX_H - SAFE_H) / 2;
    for (const n of out) {
      expect(n.x, n.id).toBeGreaterThanOrEqual(-ox);
      expect(n.x, n.id).toBeLessThanOrEqual(SAFE_W + ox);
      expect(n.y, n.id).toBeGreaterThanOrEqual(-oy);
      expect(n.y, n.id).toBeLessThanOrEqual(SAFE_H + oy);
    }
  });
});
