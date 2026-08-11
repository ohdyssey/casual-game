/**
 * 보드 규칙 재노출 shim.
 *
 * 규칙 본체는 `packages/ttt-rules` 로 승격됐다 — 실유저 대전 서버(services/ttt-api)가
 * **같은 코드로** 모든 착수를 재검증하기 때문이다. 규칙이 두 벌이면 반드시 어긋난다.
 *
 * 게임 쪽 import 경로(`./board.js`)를 그대로 두기 위해 이 파일만 남긴다.
 */
export * from '@casual/ttt-rules/board.js';
