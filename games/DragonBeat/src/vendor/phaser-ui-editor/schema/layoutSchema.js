/**
 * layoutSchema — 레이아웃 JSON 검증·정규화·버전 스탬프. (순수 — Phaser/게임 무관)
 *
 * 모든 로드/렌더 진입부에서 coerceLayout() 으로 검증·정규화. 잘못된 노드는 경고와 함께
 *   제거하고, frame 누락은 기본값으로 보정, 버전을 현재로 스탬프한다. 비파괴(새 객체 반환).
 *
 * 주: KNOWN_NODE_TYPES 는 게임-특정 타입(coin/iconRow…)을 포함하는 기본값. 미지의 type 도
 *   제거하지 않고 경고만 하므로(노드-타입 레지스트리가 실제 렌더 가부 결정), 호스트가 커스텀
 *   타입을 써도 안전하다. (P1에서 coerceLayout 에 knownTypes 주입 옵션 추가 예정.)
 */

export const LAYOUT_SCHEMA_VERSION = 2;

export const KNOWN_NODE_TYPES = new Set([
  'image', 'spriteAnim', 'spriteDocClip', 'art', 'text', 'rect', 'circle', 'polygon', 'coin', 'iconRow', 'starRow', 'slotRow', 'frame', 'repeater',
]);

/**
 * 원시 레이아웃 → 안전한 정규화 레이아웃.
 * @param {any} raw
 * @param {{source?: string}} opts
 * @returns {{ ok: boolean, layout: object|null, warnings: string[] }}
 */
export function coerceLayout(raw, { source = 'layout' } = {}) {
  const warnings = [];
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.nodes)) {
    return { ok: false, layout: null, warnings: [`${source}: nodes 배열이 없습니다`] };
  }

  let frame;
  if (raw.frame && raw.frame.designW > 0 && raw.frame.designH > 0) {
    frame = { designW: raw.frame.designW, designH: raw.frame.designH };
  } else {
    warnings.push(`${source}: frame 누락/이상 → 720×1280 기본값`);
    frame = { designW: 720, designH: 1280 };
  }

  const nodes = [];
  const seen = new Set();
  for (const n of raw.nodes) {
    if (!n || typeof n !== 'object') { warnings.push(`${source}: 비객체 노드 제거`); continue; }
    if (typeof n.id !== 'string' || !n.id) { warnings.push(`${source}: id 없는 노드 제거`); continue; }
    if (seen.has(n.id)) { warnings.push(`${source}: 중복 id '${n.id}' 제거`); continue; }
    if (typeof n.type !== 'string') { warnings.push(`${source}: type 없는 노드 '${n.id}' 제거`); continue; }
    if (typeof n.x !== 'number' || typeof n.y !== 'number') { warnings.push(`${source}: 좌표 없는 '${n.id}' 제거`); continue; }
    if (!KNOWN_NODE_TYPES.has(n.type)) warnings.push(`${source}: 미지의 type '${n.type}' (노드 '${n.id}') — 유지`);
    seen.add(n.id);
    nodes.push(n);
  }

  const groups = Array.isArray(raw.groups)
    ? raw.groups.filter((g) => g && typeof g.id === 'string')
    : [];

  const layout = { schemaVersion: LAYOUT_SCHEMA_VERSION, frame, nodes, groups };
  if (raw.animEnabled === false) layout.animEnabled = false;
  return { ok: true, layout, warnings };
}

/** coerce 후 유효 레이아웃만 반환(실패 시 null). 경고는 dev 콘솔에. */
export function loadLayoutSafe(raw, source = 'layout') {
  const { ok, layout, warnings } = coerceLayout(raw, { source });
  if (warnings.length && typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    console.warn('[layoutSchema]', warnings.join(' · '));
  }
  return ok ? layout : null;
}
