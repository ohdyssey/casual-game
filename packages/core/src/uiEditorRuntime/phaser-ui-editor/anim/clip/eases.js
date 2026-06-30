/**
 * eases — 이징 문자열 → 순수 함수 (u∈[0,1])=>n. 클립 트랙 샘플러용.
 *
 * 런타임에 Phaser 가 있으면 정확한 Phaser.Math.Easing 을 쓰고(에디터/게임), 없으면(노드 테스트)
 *   동등한 순수 폴백을 쓴다. 불변식(스크럽=재생)은 "이징이 결정적"이기만 하면 성립하므로
 *   어느 경로든 안전하다. 어휘는 presets.js 의 EASES 와 정렬.
 */
const E = {
  'Linear': (u) => u,
  'Sine.easeIn': (u) => 1 - Math.cos((u * Math.PI) / 2),
  'Sine.easeOut': (u) => Math.sin((u * Math.PI) / 2),
  'Sine.easeInOut': (u) => -(Math.cos(Math.PI * u) - 1) / 2,
  'Quad.easeIn': (u) => u * u,
  'Quad.easeOut': (u) => 1 - (1 - u) * (1 - u),
  'Quad.easeInOut': (u) => (u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2),
  'Cubic.easeIn': (u) => u * u * u,
  'Cubic.easeOut': (u) => 1 - (1 - u) ** 3,
  'Cubic.easeInOut': (u) => (u < 0.5 ? 4 * u * u * u : 1 - ((-2 * u + 2) ** 3) / 2),
  'Back.easeIn': (u) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * u * u * u - c1 * u * u; },
  'Back.easeOut': (u) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (u - 1) ** 3 + c1 * (u - 1) ** 2; },
  'Bounce.easeOut': (u) => {
    const n1 = 7.5625, d1 = 2.75;
    if (u < 1 / d1) return n1 * u * u;
    if (u < 2 / d1) { u -= 1.5 / d1; return n1 * u * u + 0.75; }
    if (u < 2.5 / d1) { u -= 2.25 / d1; return n1 * u * u + 0.9375; }
    u -= 2.625 / d1; return n1 * u * u + 0.984375;
  },
};

const _cache = new Map();

/** Phaser.Math.Easing 에서 'Group.kind' 함수 조회(없으면 null). */
function phaserEase(name) {
  try {
    const Easing = globalThis.Phaser && globalThis.Phaser.Math && globalThis.Phaser.Math.Easing;
    if (!Easing) return null;
    const [grp, kind] = name.split('.');
    const g = Easing[grp];
    if (!g) return null;
    const fn = g[kind ? kind.replace(/^ease/i, '').replace(/^In$/, 'In').replace(/^Out$/, 'Out').replace(/^InOut$/, 'InOut') : 'InOut'];
    // Phaser 키는 In/Out/InOut. 'Sine.easeInOut' → Easing.Sine.InOut.
    const k = kind ? kind.replace(/^ease/i, '') : 'InOut';
    return typeof g[k] === 'function' ? g[k] : (typeof fn === 'function' ? fn : null);
  } catch { return null; }
}

/** 이징 함수 해석. 미지/Linear → 항등, 그 외 미지 → Sine.easeInOut. 캐시. */
export function resolveEase(name) {
  if (!name || name === 'Linear') return E.Linear;
  if (_cache.has(name)) return _cache.get(name);
  const fn = phaserEase(name) || E[name] || E['Sine.easeInOut'];
  _cache.set(name, fn);
  return fn;
}

export { E as EASE_FNS };
