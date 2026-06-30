/**
 * @ohdyssey/phaser-ui-editor/sprite-runtime — 게임 런타임용 클립 재생 배럴(린).
 *   순수 샘플러(ClipPlayer) + 시간/트랙 유틸. 에디터-전용(OnionSkin 등)은 제외.
 *   playSpriteClip/loadSpriteClip = 저작된 SpriteDoc 을 게임/UI 에서 재생하는 공개 진입점.
 */
export { ClipPlayer } from './ClipPlayer.js';
export { sampleTrack, sampleFrame, buildCels } from './sampleTrack.js';
export { localTime, isFinished } from './clipTime.js';
export { resolveEase } from './eases.js';
export { playSpriteClip, loadSpriteClip, ensureSpriteDocTexture, buildClipParts, clipNativeSize, clipAlignScale, getSpriteDocNativeSize } from './spriteClipRuntime.js';
