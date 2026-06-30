/**
 * @ohdyssey/phaser-ui-editor — 재사용 가능한 Phaser 3 UI 저작도구 + 레이아웃 렌더러 + 애니메이션 시스템.
 *
 * 게임-특정 부분은 EditorConfig 로 주입(docs/animations/nodeTypes/textBuilder/roleSuggestions…).
 *
 * 이 배럴(.)은 **런타임 전용**(게임 프로덕션에 포함): 렌더러·애니메이션·스키마·바인딩.
 *   에디터 저작 화면(createUiEditorScene)은 의도적으로 여기서 export 하지 않는다 →
 *   '@ohdyssey/phaser-ui-editor/editor' 서브패스로 분리(개발 전용 동적 import → 프로덕션 번들 제외).
 */

// ── 스키마 / 바인딩 (순수) ──
export {
  coerceLayout, loadLayoutSafe, LAYOUT_SCHEMA_VERSION, KNOWN_NODE_TYPES,
} from './schema/layoutSchema.js';
export {
  byRole, byRolePrefix, resolveBind, hasAnyRole, LAYOUT_ROLE_SUGGESTIONS,
} from './schema/layoutBind.js';

// ── 레이아웃 렌더러 + 노드-타입 레지스트리 (제네릭 내장 / 호스트가 커스텀 등록) ──
export {
  renderLayoutInto, registerNodeRenderer, registerNodeRenderers, getNodeRendererTypes,
  setDefaultTextBuilder, hexNum,
} from './render/renderLayoutInto.js';
// 도형 클립(전광판) — 게임에서 스프라이트/이미지를 도형 모양으로 정확히 클립(Phaser 3.90 GeometryMask 정렬).
export { clipToShape, shapeMaskGraphics, polygonWorldPoints, rectWorldPoints } from './render/shapeMask.js';

// ── 애니메이션 엔진(Tween/Spring/Particle/Sprite) + 핸들/프로파일/디스패처 ──
//   playLayoutAnims · stopLayoutAnims · pause/resumeLayoutAnims · playAnimForTargets · animActive ·
//   AnimHandle · migrateAnim · ANIM_CATEGORIES/TRIGGERS/EASES/ANIM_TYPES · PARTICLE_EFFECTS ·
//   getAnimProfile · getAnimPref/setAnimPref · pause/resumeAllHandles · teardownHandlesForScene
export * from './anim/index.js';
// ── 팝업 생명주기 컨트롤러 + 절차적 fx 텍스처 ──
export { attachPopupAnims, bindPopupAnimLifecycle } from './anim/popupAnim.js';
export { ensureFxTexture } from './anim/textures.js';

// ── 저작된 스프라이트 클립 재생(게임 런타임): ui/sprites/*.json → Phaser 파트 Sprite + ClipPlayer ──
export {
  ClipPlayer, playSpriteClip, loadSpriteClip, ensureSpriteDocTexture, buildClipParts,
  clipNativeSize, clipAlignScale, getSpriteDocNativeSize,
} from './anim/clip/index.js';
export { coerceSpriteDoc, loadSpriteDocSafe, SPRITE_DOC_SCHEMA_VERSION } from './sprite/spriteDocSchema.js';

// ── 게임 로직 플로우 실행(게임 런타임): ui/flows/*.json → 트리거 기반 흐름 실행(호스트 콜백 주입) ──
export { createFlowRuntime, parseVal, compareVals, coerceFlow, loadFlowSafe, emptyFlow, mountFlow } from './flow/index.js';

// ── 오류 보고 채널(게임 dev → 저작툴) — 저작툴 런타임 오류를 저작툴 서버로 보고 ──
//   게임이 dev 부팅 시 installToolReporter({project,endpoint}) 1회. reportIssue 로 수동 보고도 가능.
export { installToolReporter, reportToolError, reportIssue, reporterActive } from './report/reporter.js';

// ── 에셋 카탈로그(에디터 인스펙터용) — sprite 는 makeAssetCatalog(animations) 로 주입, particle 은 제네릭 ──
export {
  makeAssetCatalog, PARTICLE_TEXTURES, PARTICLE_BLENDS, particleEffectParams, particleEffectDefaults,
} from './anim/assetCatalog.js';

// ⚠ 에디터 Scene 팩토리(createUiEditorScene)는 배럴에서 제외 → '@ohdyssey/phaser-ui-editor/editor' 서브패스 전용.
//    (런타임 배럴이 ~2500줄 에디터를 끌어와 프로덕션 번들에 들어가는 것을 막는다.)
// ⚠ vite 플러그인(uiEditorVitePlugins)은 Node 전용(node:fs)이라 여기서 export 하지 않는다.
//   vite.config.js 에서 '@ohdyssey/phaser-ui-editor/vite' 서브패스로 import 할 것.
