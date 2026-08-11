/**
 * phaser-ui-editor.project.js — @ohdyssey/phaser-ui-editor 계약 파일.
 *   세로 HD 1080×2400. 문서 1개: main(조리 화면). 이후 홈/결과 화면이 생기면 docs 에 추가.
 *   에디터가 이 폴더를 열면 이 계약을 그대로 사용합니다(자체 완결형, 게임 src 미접촉).
 */
import { makeAssetCatalog } from '@ohdyssey/phaser-ui-editor';

// 'public/' 에서 스캔한 이미지 (키 = 파일명 기반). 게임 런타임 키와 다를 수 있음.
const ASSETS = {

};

export default {
  name: 'KimbapRollMaster',
  config: {
    sceneKey: 'UiEditorScene',
    docs: [
      { id: 'main', name: '조리 화면', file: 'ui/layouts/main.json', sample: {},
        getDefault: () => ({ frame: { designW: 1080, designH: 2400 }, nodes: [] }) },
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
