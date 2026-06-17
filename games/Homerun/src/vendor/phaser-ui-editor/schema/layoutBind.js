/**
 * layoutBind — 레이아웃 노드 역할(role) 기반 게임 연동 바인딩. (순수 — Phaser/게임 무관)
 *
 * 저자가 에디터 인스펙터에서 `node.role` 을 지정하면 씬이 이름·위치와 무관하게 찾는다.
 *   role 미지정 레이아웃은 fallback 휴리스틱을 그대로 사용 → 하위호환.
 *
 * 역할 어휘: close · gold · title · progress · action:<키> · field:<경로>.
 *
 * 주: LAYOUT_ROLE_SUGGESTIONS 는 인스펙터 datalist 기본값. 호스트가 도메인 역할을 추가하려면
 *   P1 의 EditorConfig.roleSuggestions 로 확장(현재는 예시로 낚시 역할 포함).
 */

export const LAYOUT_ROLE_SUGGESTIONS = [
  'close', 'gold', 'title', 'progress',
  'action:rod', 'action:reel', 'action:line', 'action:bait', 'action:purchase',
  'field:rod.level', 'field:rod.cost',
];

/** role 이 정확히 일치하는 첫 엔트리. */
export function byRole(entries, role) {
  if (!role) return null;
  return entries.find((e) => e.node && e.node.role === role) || null;
}

/** role 접두사로 시작하는 모든 엔트리(예: 'action:'). */
export function byRolePrefix(entries, prefix) {
  return entries.filter((e) => e.node && typeof e.node.role === 'string' && e.node.role.startsWith(prefix));
}

/** role 우선, 없으면 fallback() 결과. 인터랙션 바인딩의 안정적 진입점. */
export function resolveBind(entries, role, fallback) {
  return byRole(entries, role) || (typeof fallback === 'function' ? fallback() : (fallback || null));
}

/** 레이아웃에 role 이 하나라도 지정되어 있는지(연동 상태 점검용). */
export function hasAnyRole(entries) {
  return entries.some((e) => e.node && e.node.role);
}
