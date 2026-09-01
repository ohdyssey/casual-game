/**
 * @casual/core — 공용 캐쥬얼게임 엔진 (배럴 export).
 * 게임은 여기서 import: `import { createCasualGame, placeCover, COLORS } from '@casual/core';`
 */

export * from './tokens.js';
export * from './scale.js';
export * from './responsive.js';
// 세이프존(저작 프레임) 중앙정렬 — 양축 가변 캔버스의 좌표 계약(전 게임 공통).
export * from './safeZone.js';
export * from './layout.js';
export * from './ui.js';
export * from './systems/textScript.js';
export * from './systems/haptics.js';
export * from './systems/pwa.js';
export * from './systems/backGuard.js';
export * from './systems/immersive.js';
// 프로덕션 헬스 모니터(블랭크 화면·런타임 오류·청크 로드 실패 감지 + 스테일 SW 자동복구). Phaser-free.
export * from './systems/healthMonitor.js';
export * from './systems/errorLog.js';
// `apps/api`(서버 권위 지갑) 얇은 클라이언트 — Phaser-free, 실패는 항상 null(게임플레이 비차단).
export * from './net/apiClient.js';
// 단계별 보상 게이지(EARN SPINS류 타임드 이벤트) — 프레임워크 무관 기본 시스템.
export * from './systems/rewardGauge.js';
// 타임어택 게임 공용 '3·2·1 → START!' 시작 카운트다운 오버레이.
export * from './systems/startCountdown.js';
export * from './game-shell.js';
export type { GameModule } from './game-shell.js';
// 에디터(phaser-ui-editor) 런타임 — 노드 anim 재생 + spriteDocClip/도형 로더 함수(단일 공용 사본).
export * from './layoutAnim.js';
export * from './liveops/index.js';
// 플랫폼 계약(Phaser-free) — 게임이 ctx 로만 플랫폼 접근. 기본 어댑터=Local(현 동작 보존).
//   서버/허브는 Phaser 없는 '@casual/core/platform' 서브패스를 직접 import 한다.
export * from './platform/index.js';
// 허브 핸드오프(포털). protocol 은 Phaser-free라 허브는 '@casual/core/portal/protocol'
// 서브패스를 직접 import 한다(배럴은 Phaser 를 포함하므로 허브에서 쓰지 않음).
export * from './portal/protocol.js';
export * from './portal/bridge.js';
export * from './portal/loadingScene.js';
