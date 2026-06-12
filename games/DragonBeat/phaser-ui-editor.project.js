/**
 * phaser-ui-editor.project.js — @ohdyssey/phaser-ui-editor 계약 (Homerun 계승).
 *   게임 src 는 건드리지 않은 자체 완결형 파일입니다.
 *   필요하면 자유롭게 수정하세요(문서 추가, 커스텀 노드 등록, 키 의미화 등).
 */
import { makeAssetCatalog } from '@ohdyssey/phaser-ui-editor';

// 'public/' 에서 스캔한 이미지 (키 = 파일명 기반). 게임 런타임 키와 다를 수 있음.
const ASSETS = {
  "boat": "assets/boat.png",
  "chr_01": "assets/chr_01.png",
  "logo": "assets/logo.png",
  "rower_atlas": "assets/rower_atlas.png",
};

export default {
  name: "DragonBeat",
  config: {
    sceneKey: 'UiEditorScene',
    docs: [
      { id: 'main', name: '메인 화면', file: 'ui/layouts/main.json', sample: {},
        getDefault: () => ({ frame: { designW: 720, designH: 1280 }, nodes: [] }) },
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
