import { describe, it, expect } from 'vitest';
import { coerceLayout, LAYOUT_SCHEMA_VERSION, KNOWN_NODE_TYPES } from '@ohdyssey/phaser-ui-editor/schema';

describe('coerceLayout', () => {
  it('passes a valid layout through and stamps the schema version', () => {
    const raw = { frame: { designW: 720, designH: 1280 }, nodes: [{ id: 'a', type: 'rect', x: 1, y: 2, w: 10, h: 10 }], groups: [] };
    const { ok, layout, warnings } = coerceLayout(raw);
    expect(ok).toBe(true);
    expect(warnings).toHaveLength(0);
    expect(layout.schemaVersion).toBe(LAYOUT_SCHEMA_VERSION);
    expect(layout.nodes).toHaveLength(1);
  });

  it('rejects non-object / missing-nodes input', () => {
    expect(coerceLayout('nope').ok).toBe(false);
    expect(coerceLayout(null).ok).toBe(false);
    expect(coerceLayout({ frame: { designW: 720, designH: 1280 } }).ok).toBe(false);
  });

  it('defaults a missing/invalid frame to 720x1280 with a warning', () => {
    const { ok, layout, warnings } = coerceLayout({ nodes: [{ id: 'a', type: 'text', x: 0, y: 0 }] });
    expect(ok).toBe(true);
    expect(layout.frame).toEqual({ designW: 720, designH: 1280 });
    expect(warnings.some((w) => /frame/.test(w))).toBe(true);
  });

  it('drops invalid nodes (no id / no type / no coords / non-object) and dedupes ids', () => {
    const raw = { frame: { designW: 720, designH: 1280 }, nodes: [
      { id: 'a', type: 'rect', x: 1, y: 2 },     // keep
      { type: 'rect', x: 1, y: 2 },               // drop: no id
      { id: 'a', type: 'rect', x: 3, y: 3 },      // drop: dup id
      null,                                        // drop: non-object
      { id: 'b', x: 1, y: 1 },                     // drop: no type
      { id: 'c', type: 'rect' },                   // drop: no coords
    ] };
    const { layout, warnings } = coerceLayout(raw);
    expect(layout.nodes.map((n) => n.id)).toEqual(['a']);
    expect(warnings.length).toBeGreaterThanOrEqual(4);
  });

  it('keeps unknown node types but warns (forward-compat)', () => {
    const raw = { frame: { designW: 720, designH: 1280 }, nodes: [{ id: 'x', type: 'futuristic', x: 0, y: 0 }] };
    const { layout, warnings } = coerceLayout(raw);
    expect(layout.nodes).toHaveLength(1);
    expect(warnings.some((w) => /futuristic/.test(w))).toBe(true);
  });

  it('preserves animEnabled:false and filters malformed groups', () => {
    const raw = { frame: { designW: 720, designH: 1280 }, animEnabled: false, nodes: [{ id: 'a', type: 'rect', x: 0, y: 0 }], groups: [{ id: 'g1' }, null, { name: 'noid' }] };
    const { layout } = coerceLayout(raw);
    expect(layout.animEnabled).toBe(false);
    expect(layout.groups.map((g) => g.id)).toEqual(['g1']);
  });

  it('exposes the known node-type set', () => {
    expect(KNOWN_NODE_TYPES.has('spriteAnim')).toBe(true);
    expect(KNOWN_NODE_TYPES.has('image')).toBe(true);
  });
});
