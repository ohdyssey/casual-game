/**
 * flowSchema — 게임 로직 플로우(시각 워크플로우) JSON 검증·정규화. (순수 — Phaser/DOM 무관)
 *
 *   플로우 = 노드(블록) + 엣지(연결선). n8n 스타일.
 *     노드 타입: trigger(시작) · screen(화면) · action(동작) · condition(갈림길) · provider(부속).
 *     엣지: 메인 흐름(실선) 또는 부속 부착(점선, kind:'attach').
 *   모든 로드/저장 진입부에서 coerceFlow() 로 검증·정규화. 잘못된 노드/엣지는 경고와 함께 제거. 비파괴(새 객체).
 */

export const FLOW_SCHEMA_VERSION = 1;
// 흐름 종류: uiFlow=클라 UI 오케스트레이션, serverFlow=서버 구축(데이터/검증/엔드포인트). 같은 그래프 엔진.
export const FLOW_KINDS = new Set(['uiFlow', 'serverFlow']);
// 노드 타입: 클라 5종 + 서버 카테고리(데이터/인증/재화/랭킹/외부/응답/스케줄). flowNodeMeta 카테고리와 1:1.
export const FLOW_NODE_TYPES = new Set([
  'trigger', 'screen', 'action', 'condition', 'provider',
  'data', 'auth', 'economy', 'rank', 'external', 'response', 'schedule',
]);
export const FLOW_EDGE_KINDS = new Set(['flow', 'attach']);   // flow=메인 흐름(실선), attach=부속 부착(점선)

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const str = (v, d = '') => (typeof v === 'string' ? v : d);
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function coerceNode(n, w, i) {
  if (!isObj(n)) { w.push(`node[${i}]: 비객체 제거`); return null; }
  if (typeof n.id !== 'string' || !n.id) { w.push(`node[${i}]: id 없음 제거`); return null; }
  let type = str(n.type, 'action');
  if (!FLOW_NODE_TYPES.has(type)) { w.push(`node '${n.id}': 미지의 type '${type}' → action`); type = 'action'; }
  return {
    id: n.id,
    type,
    x: num(n.x, 0),
    y: num(n.y, 0),
    name: str(n.name, ''),
    // config 는 타입별 설정(파라미터)을 그대로 보존 — 호스트/런타임이 해석. (예: screen.screenDocId, action.kind/params/fn …)
    config: isObj(n.config) ? n.config : {},
  };
}

function coerceEdge(e, w, i, nodeIds) {
  if (!isObj(e)) { w.push(`edge[${i}]: 비객체 제거`); return null; }
  const from = isObj(e.from) ? e.from : null;
  const to = isObj(e.to) ? e.to : null;
  if (!from || !to || !nodeIds.has(str(from.node)) || !nodeIds.has(str(to.node))) {
    w.push(`edge[${i}]: 존재하지 않는 노드 참조 제거`); return null;
  }
  let kind = str(e.kind, 'flow');
  if (!FLOW_EDGE_KINDS.has(kind)) kind = 'flow';
  return {
    id: str(e.id) || `e_${from.node}_${to.node}_${i}`,
    kind,
    from: { node: str(from.node), port: str(from.port, 'out') },
    to: { node: str(to.node), port: str(to.port, 'in') },
  };
}

/**
 * 원시 플로우 → 안전한 정규화 플로우.
 * @param {any} raw
 * @param {{source?:string}} [opts]
 * @returns {{ ok:boolean, flow:object|null, warnings:string[] }}
 */
export function coerceFlow(raw, { source = 'flow' } = {}) {
  const w = [];
  if (!isObj(raw)) return { ok: false, flow: null, warnings: [`${source}: 객체가 아닙니다`] };
  const seen = new Set();
  const nodes = (Array.isArray(raw.nodes) ? raw.nodes : []).map((n, i) => coerceNode(n, w, i)).filter((n) => {
    if (!n) return false;
    if (seen.has(n.id)) { w.push(`중복 node id '${n.id}' 제거`); return false; }
    seen.add(n.id); return true;
  });
  const edges = (Array.isArray(raw.edges) ? raw.edges : []).map((e, i) => coerceEdge(e, w, i, seen)).filter(Boolean);
  const flow = {
    schemaVersion: FLOW_SCHEMA_VERSION,
    kind: FLOW_KINDS.has(str(raw.kind)) ? raw.kind : 'uiFlow',   // 흐름 종류 보존(uiFlow/serverFlow)
    id: str(raw.id, 'main'),
    name: str(raw.name, str(raw.id, 'Flow')),
    nodes,
    edges,
    vars: isObj(raw.vars) ? raw.vars : {},   // 전역 변수 초기값(score/coins/flag …)
  };
  return { ok: true, flow, warnings: w };
}

/** coerce 후 유효 플로우만 반환(실패 시 null). 경고는 DEV 콘솔. */
export function loadFlowSafe(raw, source = 'flow') {
  const { ok, flow, warnings } = coerceFlow(raw, { source });
  if (warnings.length && typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
    console.warn('[flowSchema]', warnings.join(' · '));
  }
  return ok ? flow : null;
}

/** 빈 플로우(시작 노드 1개). kind='serverFlow' 면 HTTP 엔드포인트 트리거로 시작. */
export function emptyFlow(id = 'main', name = '플로우', kind = 'uiFlow') {
  const server = kind === 'serverFlow';
  return {
    schemaVersion: FLOW_SCHEMA_VERSION, kind: server ? 'serverFlow' : 'uiFlow', id, name,
    nodes: [server
      ? { id: 'start', type: 'trigger', x: 80, y: 80, name: '엔드포인트', config: { event: 'http', method: 'POST', path: '/' } }
      : { id: 'start', type: 'trigger', x: 80, y: 80, name: '시작', config: { event: 'gameStart' } }],
    edges: [], vars: {},
  };
}
