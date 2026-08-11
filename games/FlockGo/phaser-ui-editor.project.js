/**
 * phaser-ui-editor.project.js — @ohdyssey/phaser-ui-editor 계약 (형제 게임 auto-adopt 계승).
 *   에디터가 이 폴더를 열면 public/ui/layouts/main.json 을 그대로 편집한다(런타임 SSOT).
 *   업로드 이미지는 public/ui/uploads + ui-assets.json 매니페스트(up_ 접두 키).
 */
import { makeAssetCatalog } from '@ohdyssey/phaser-ui-editor';

// 'public/' 에서 스캔한 이미지 (키 = 파일명 기반). 게임 런타임 키와 다를 수 있음.
const ASSETS = {

};

export default {
  name: "FlockGo",
  config: {
    sceneKey: 'UiEditorScene',
    docs: [
      { id: 'main', name: '메인 화면', file: 'ui/layouts/main.json', sample: {},
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
    publicDir: "public",
    defaultLayoutFile: 'ui/layouts/main.json',
    layoutFilePattern: /^ui\/layouts\/[a-z0-9_-]+\.json$/i,
    uploadDir: 'ui/uploads',
    manifestPath: 'ui-assets.json',
  },
};
