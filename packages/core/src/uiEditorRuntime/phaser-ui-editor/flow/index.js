/**
 * @ohdyssey/phaser-ui-editor/flow — 게임 로직 플로우 배럴.
 *   flowSchema = 순수 검증·정규화, flowRuntime = 실행 엔진(호스트 콜백 주입).
 */
export { coerceFlow, loadFlowSafe, emptyFlow, FLOW_SCHEMA_VERSION, FLOW_NODE_TYPES, FLOW_EDGE_KINDS, FLOW_KINDS } from './flowSchema.js';
export { createFlowRuntime, parseVal, compareVals } from './flowRuntime.js';
export { createServerFlowRuntime } from './serverFlowRuntime.js';
export { mountFlow } from './flowHost.js';
