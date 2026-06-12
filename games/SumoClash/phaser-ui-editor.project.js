/**
 * phaser-ui-editor.project.js — @ohdyssey/phaser-ui-editor 계약 (auto-adopt 호환).
 *   독립 에디터가 이 폴더를 열 때 이 파일을 읽어 문서/에셋/경로를 구성한다.
 *   게임 src 는 건드리지 않는 자체 완결형 파일이다. 자유롭게 수정 가능(문서 추가, 키 의미화 등).
 *
 *   레인 디펜스 화면 한 장(main)에서 시작한다. 디자인 캔버스는 720×1280(세로).
 *   에디터에서 배경/헤더/유닛카드/마나게이지/특수기 버튼 등을 배치한 뒤
 *   `public/ui/layouts/main.json` 으로 저장하면 런타임 BattleScene 이 그대로 렌더한다.
 */
import { makeAssetCatalog } from '@ohdyssey/phaser-ui-editor';

// 'public/' 에서 스캔한 이미지 (키 = 파일명 기반). 게임 런타임 키와 다를 수 있음.
// 업로드 전이라 비어 있다. 에디터에서 업로드하면 ui-assets.json 매니페스트로 누적된다.
const ASSETS = {

};

export default {
  name: 'SumoClash',
  config: {
    sceneKey: 'UiEditorScene',
    docs: [
      {
        id: 'main',
        name: '전투 화면',
        file: 'ui/layouts/main.json',
        sample: {},
        getDefault: () => ({ frame: { designW: 720, designH: 1280 }, nodes: [] }),
      },
    ],
    assetCatalog: makeAssetCatalog({}),
    assetManifestKey: 'ui_assets',
    uploadKeyPrefix: 'up_',
  },
  bootAssets: (scene) => {
    for (const [key, path] of Object.entries(ASSETS)) {
      if (!scene.textures.exists(key)) scene.load.image(key, path);
    }
    scene.load.json('ui_assets', 'ui-assets.json');
    scene.load.on('filecomplete-json-ui_assets', () => {
      const m = scene.cache.json.get('ui_assets') || {};
      for (const [k, p] of Object.entries(m)) if (k && p && !scene.textures.exists(k)) scene.load.image(k, p);
    });
  },
  paths: {
    publicDir: 'public',
    defaultLayoutFile: 'ui/layouts/main.json',
    layoutFilePattern: /^ui\/layouts\/[a-z0-9_-]+\.json$/i,
    uploadDir: 'ui/uploads',
    manifestPath: 'ui-assets.json',
  },
};
