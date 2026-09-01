/**
 * safeZone — 세이프존 중앙정렬. **구현은 `@casual/core` 로 승격**됐다(전 게임 공통).
 *
 * 이 파일은 기존 import 경로를 유지하기 위한 재수출이다. 새 코드는 `@casual/core` 에서 직접
 * 가져다 써도 된다. 저작 크기는 game-shell 이 registry 에 기록한 값을 코어가 읽는다.
 */
export { centerSafeZone, safeOffset, safeSize, fullscreenScrim, coverScale as coverScaleFor } from '@casual/core';
