/**
 * phaser-ui-editor.project.js — 독립형 UI 저작도구가 이 게임을 "열" 때의 진입 계약.
 *
 * 독립형 에디터(@ohdyssey/phaser-ui-editor/editor-app)는 게임 루트의 이 파일을 동적 import 해서:
 *   1) config       → createUiEditorScene(config) 에 주입(문서 레지스트리·에셋 카탈로그·역할 등)
 *   2) bootAssets   → ProjectBootScene.preload 에서 호출(풀충실도 렌더용 텍스처/애니 적재)
 *   3) paths        → uiEditorVitePlugins 저장 엔드포인트(레이아웃/업로드 기록 경로)
 *
 * 임베디드 모드(게임 안 #uieditor)는 이 파일을 쓰지 않는다(main.js 가 직접 EDITOR_CONFIG 주입).
 *   즉 이 계약 파일은 "독립형으로도 열 수 있게" 하는 순수 추가물 — 게임 런타임/배포엔 영향 0.
 */
import { EDITOR_CONFIG } from './src/config/editor.config.js';
import { bootEditorAssets } from './src/config/editor.boot.js';
import { ASSETS_SPRITESHEETS, ANIMATIONS } from './src/config/assets.config.js';
import { makeAssetCatalog } from '@ohdyssey/phaser-ui-editor';

export default {
  // 에디터 상단/식별 표시용 프로젝트 이름.
  name: 'fishing-game',

  // createUiEditorScene(config) 에 그대로 주입되는 에디터 설정(게임-특정).
  config: EDITOR_CONFIG,

  // createSpriteAnimEditorScene(animConfig) 에 주입 — 스프라이트 애니 저작도구(#spriteanim).
  //   spriteSheets = 게임 스프라이트시트(슬라이서 소스). bootEditorAssets 가 이미 텍스처를 적재함.
  animConfig: {
    sceneKey: 'SpriteAnimEditorScene',
    docs: [{ id: 'main', name: '스프라이트', file: 'ui/sprites/main.json' }],
    spriteSheets: ASSETS_SPRITESHEETS,
    assetCatalog: makeAssetCatalog(ANIMATIONS),
    fps: 9,
  },

  // ProjectBootScene.preload(scene) 에서 호출 — 에디터가 렌더할 에셋을 캐시에 채운다.
  bootAssets: bootEditorAssets,

  // 저장/업로드 엔드포인트 라우팅(uiEditorVitePlugins). projectRoot 는 에디터가 주입.
  paths: {
    publicDir: 'public',
    defaultLayoutFile: 'card.layout.json',
    layoutFilePattern: /^ui\/layouts\/[a-z0-9_-]+\.json$/i,
    uploadDir: 'ui/card/uploads',
    manifestPath: 'card.assets.json',
  },
};
