/**
 * 틱택토 네온 공유 규칙 — 게임 클라이언트와 대전 서버(services/ttt-api)가 함께 쓴다.
 *
 * ⚠️ Phaser·DOM·Node 어느 쪽에도 의존하지 않는다. 규칙을 한 벌로 유지하기 위한 패키지이므로
 *    "화면에 어떻게 보이는가" 는 절대 들어오지 않는다.
 */
export * from './board.js';
export * from './rating.js';
export * from './turn.js';

// protocol.js 는 일부러 배럴에 넣지 않는다 — 규칙만 필요한 소비자(AI 탐색 등)까지
// zod 를 끌고 들어가지 않게 하기 위해서다. 필요한 쪽이 서브패스로 직접 import 한다.
