import { describe, it, expect, afterEach } from 'vitest';
import { cardBoardToLayout, getEditorLevel, editorLevelNumbers, loadEditorLevelDocs, type CardBoardDoc } from './editorLevels.js';
import { levelDef } from './levels.js';
import { seededRng } from './deck.js';
import { dealWinnable, isWinnable } from './solvable.js';
import { remaining } from './tripeaks.js';

// 봉우리 3장: apex(layer1)가 base 두 장(layer0)을 덮음 → 시작 노출=apex.
const peakDoc = (withCover: boolean): CardBoardDoc => ({
  kind: 'cardBoard',
  card: { w: 120, h: 164 }, // 기준(정규화) 크기 — 이 크기로 저작하면 스케일 없이(k=1) 좌표 그대로 유지
  slots: [
    { id: 'a', x: 500, y: 650, layer: 1, ...(withCover ? { coveredBy: [] } : {}) },
    { id: 'b', x: 440, y: 730, layer: 0, ...(withCover ? { coveredBy: ['a'] } : {}) },
    { id: 'c', x: 560, y: 730, layer: 0, ...(withCover ? { coveredBy: ['a'] } : {}) },
  ],
});

describe('cardBoardToLayout — 에디터 문서 → 게임 레이아웃', () => {
  it('coveredBy(문서 값)·절대좌표(ax/ay)·bbox 보존', () => {
    const l = cardBoardToLayout(peakDoc(true), 'test');
    expect(l.slots).toHaveLength(3);
    const a = l.slots.find((s) => s.id === 'a')!;
    const b = l.slots.find((s) => s.id === 'b')!;
    expect(a.coveredBy).toEqual([]); // apex=노출
    expect(b.coveredBy).toEqual(['a']); // base=apex 가 덮음
    expect(a.ax).toBe(500);
    expect(a.ay).toBe(650);
    expect(l.abs).toBeDefined();
    expect(l.abs!.cardW).toBe(120);
    expect(l.abs!.minX).toBe(440 - 60);
    expect(l.abs!.maxX).toBe(560 + 60);
  });

  it('구 저작 크기(104×143)는 기준(120×164)으로 정규화 — 카드 커지고 커버관계는 그대로', () => {
    const old: CardBoardDoc = {
      kind: 'cardBoard',
      card: { w: 104, h: 143 },
      slots: [
        { id: 'a', x: 500, y: 650, layer: 1 },
        { id: 'b', x: 440, y: 730, layer: 0 },
        { id: 'c', x: 560, y: 730, layer: 0 },
      ],
    };
    const l = cardBoardToLayout(old, 'norm');
    expect(l.abs!.cardW).toBe(120); // 저작이 104여도 게임은 120으로 통일
    expect(l.abs!.cardH).toBe(164);
    expect(l.slots.find((s) => s.id === 'a')!.coveredBy).toEqual([]); // 커버관계 불변
    expect(l.slots.find((s) => s.id === 'b')!.coveredBy).toEqual(['a']);
  });

  it('budget.stock 이 있으면 layout.stock 으로 전달(게임이 설계 뽑기 수 존중)', () => {
    const withStock = cardBoardToLayout({ ...peakDoc(true), budget: { board: 3, stock: 5 } }, 'ts');
    expect(withStock.stock).toBe(5);
    const noStock = cardBoardToLayout(peakDoc(true), 'ts2');
    expect(noStock.stock).toBeUndefined();
  });

  it('coveredBy 없으면 겹침으로 파생 — 문서 값과 동일 결과', () => {
    const derived = cardBoardToLayout(peakDoc(false), 't2');
    const b = derived.slots.find((s) => s.id === 'b')!;
    const c = derived.slots.find((s) => s.id === 'c')!;
    expect(b.coveredBy).toEqual(['a']);
    expect(c.coveredBy).toEqual(['a']);
    expect(derived.slots.find((s) => s.id === 'a')!.coveredBy).toEqual([]);
  });

  it('변환한 레이아웃으로 승리 가능한 딜 생성', () => {
    const l = cardBoardToLayout(peakDoc(true), 't3');
    const s = dealWinnable(l, seededRng(7));
    expect(remaining(s)).toBe(3);
    expect(isWinnable(s)).toBe(true);
  });

  it('설계 뽑기 수를 고정 딜 — 상향 금지(에디터 설정 그대로)', () => {
    const l = cardBoardToLayout({ ...peakDoc(true), budget: { stock: 5 } }, 'tf');
    expect(l.stock).toBe(5);
    for (const seed of [1, 2, 3]) {
      const s = dealWinnable(l, seededRng(seed), 500, { ease: 0, startStock: l.stock });
      expect(s.stock.length).toBe(5); // 정확히 5장 — 60장 같은 과다 상향 없음
    }
  });
});

describe('getEditorLevel / levelDef 오버라이드 (extra 문서 경로)', () => {
  const pack: Record<string, CardBoardDoc> = { '2': peakDoc(true) };

  it('extra 문서가 있으면 그 레벨을 에디터 배치로', () => {
    const l = getEditorLevel(2, pack);
    expect(l).not.toBeNull();
    expect(l!.abs).toBeDefined();
    expect(l!.slots).toHaveLength(3);
  });

  it('없는 레벨은 null(절차적 폴백)', () => {
    expect(getEditorLevel(5, pack)).toBeNull();
  });

  it('editorLevelNumbers = 유효 레벨 번호', () => {
    expect(editorLevelNumbers(pack)).toEqual([2]);
  });

  it('levelDef(level, pack): 에디터 레벨은 저작 배치, 미저작은 null(절차 생성 제거)', () => {
    const d2 = levelDef(2, pack);
    expect(d2.layout).not.toBeNull();
    expect(d2.layout!.abs).toBeDefined(); // 에디터 배치
    expect(d2.layout!.slots).toHaveLength(3);
    const d1 = levelDef(1, pack);
    expect(d1.layout).toBeNull(); // 미저작 레벨(더 이상 절차적 폴백 없음)
    expect(d1.floor).toBeDefined(); // 층 테마는 항상 존재
  });
});

describe('localStorage 브리지(같은 오리진 dev 즉시적용)', () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('cardLevels.v1 에서 저장 레벨을 읽어 적용', () => {
    const store: Record<string, string> = {
      'cardLevels.v1': JSON.stringify({ '3': peakDoc(true) }),
    };
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    };
    expect(loadEditorLevelDocs()['3']).toBeDefined();
    const l = getEditorLevel(3);
    expect(l).not.toBeNull();
    expect(l!.slots).toHaveLength(3);
    expect(editorLevelNumbers()).toEqual([3]);
    // localStorage 가 번들 extra 보다 우선(같은 번호면 localStorage 값)
    const overridden = getEditorLevel(3, { '3': { kind: 'cardBoard', slots: [] } });
    expect(overridden!.slots).toHaveLength(3);
  });
});
