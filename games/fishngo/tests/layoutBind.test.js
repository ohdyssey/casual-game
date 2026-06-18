import { describe, it, expect } from 'vitest';
import { byRole, byRolePrefix, resolveBind, hasAnyRole, LAYOUT_ROLE_SUGGESTIONS } from '@ohdyssey/phaser-ui-editor/bind';

const E = (id, role) => ({ node: { id, role }, objects: [] });

describe('layoutBind', () => {
  const entries = [E('a', 'close'), E('b', 'gold'), E('c'), E('d', 'action:rod'), E('e', 'action:purchase')];

  it('byRole finds an exact role match, null otherwise', () => {
    expect(byRole(entries, 'close').node.id).toBe('a');
    expect(byRole(entries, 'gold').node.id).toBe('b');
    expect(byRole(entries, 'missing')).toBeNull();
    expect(byRole(entries, '')).toBeNull();
    expect(byRole(entries, undefined)).toBeNull();
  });

  it('byRolePrefix returns all entries whose role starts with prefix', () => {
    const acts = byRolePrefix(entries, 'action:');
    expect(acts.map((e) => e.node.id).sort()).toEqual(['d', 'e']);
    expect(byRolePrefix(entries, 'action:purchase').map((e) => e.node.id)).toEqual(['e']);
    expect(byRolePrefix(entries, 'none:')).toHaveLength(0);
  });

  it('resolveBind prefers role, falls back to the heuristic function', () => {
    // role present -> heuristic not consulted
    let called = false;
    const r1 = resolveBind(entries, 'close', () => { called = true; return E('fallback'); });
    expect(r1.node.id).toBe('a');
    expect(called).toBe(false);

    // role absent -> fallback used
    const r2 = resolveBind(entries, 'title', () => E('fb'));
    expect(r2.node.id).toBe('fb');

    // fallback may be a value, and may return null
    expect(resolveBind(entries, 'title', null)).toBeNull();
    expect(resolveBind(entries, 'title', () => null)).toBeNull();
  });

  it('hasAnyRole detects whether any node carries a role', () => {
    expect(hasAnyRole(entries)).toBe(true);
    expect(hasAnyRole([E('x'), E('y')])).toBe(false);
  });

  it('exposes role suggestions for the editor datalist', () => {
    expect(LAYOUT_ROLE_SUGGESTIONS).toContain('close');
    expect(LAYOUT_ROLE_SUGGESTIONS).toContain('action:rod');
  });
});
