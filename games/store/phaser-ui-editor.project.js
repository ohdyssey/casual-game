/**
 * phaser-ui-editor.project.js — @ohdyssey/phaser-ui-editor 자동 생성 계약 (auto-adopt).
 *   에디터가 이 폴더를 열 때 자동 생성했습니다. 게임 src 는 건드리지 않은 자체 완결형 파일입니다.
 *   필요하면 자유롭게 수정하세요(문서 추가, 커스텀 노드 등록, 키 의미화 등).
 */
import { makeAssetCatalog } from '@ohdyssey/phaser-ui-editor';

// 'public/' 에서 스캔한 이미지 (키 = 파일명 기반). 게임 런타임 키와 다를 수 있음.
const ASSETS = {
  "CG_ST_BG_01": "assets/store/CG_ST_BG_01.png",
  "CG_ST_BG_02_1": "assets/store/CG_ST_BG_02-1.png",
  "CG_ST_BG_02_2": "assets/store/CG_ST_BG_02-2.png",
  "CG_ST_BG_02": "assets/store/CG_ST_BG_02.png",
  "CG_ST_BG_03_1": "assets/store/CG_ST_BG_03-1.png",
  "CG_ST_BG_03": "assets/store/CG_ST_BG_03.png",
  "CG_ST_BG_Center01": "assets/store/CG_ST_BG_Center01.png",
  "CG_ST_BG_Center02": "assets/store/CG_ST_BG_Center02.png",
  "CG_ST_BG_Center03": "assets/store/CG_ST_BG_Center03.png",
  "CG_ST_BG_Left01": "assets/store/CG_ST_BG_Left01.png",
  "CG_ST_BG_Left02": "assets/store/CG_ST_BG_Left02.png",
  "CG_ST_BG_Left03": "assets/store/CG_ST_BG_Left03.png",
  "CG_ST_BG_one": "assets/store/CG_ST_BG_one.png",
  "CG_ST_BG_Right01": "assets/store/CG_ST_BG_Right01.png",
  "CG_ST_BG_Right02": "assets/store/CG_ST_BG_Right02.png",
  "CG_ST_BG_Right03": "assets/store/CG_ST_BG_Right03.png",
  "CG_ST_item_01": "assets/store/CG_ST_item_01.png",
  "CG_ST_item_02": "assets/store/CG_ST_item_02.png",
  "CG_ST_item_03": "assets/store/CG_ST_item_03.png",
  "CG_ST_item_04": "assets/store/CG_ST_item_04.png",
  "CG_ST_item_05": "assets/store/CG_ST_item_05.png",
  "CG_ST_item_06": "assets/store/CG_ST_item_06.png",
  "CG_ST_item_07": "assets/store/CG_ST_item_07.png",
  "CG_ST_item_08": "assets/store/CG_ST_item_08.png",
  "CG_ST_item_09": "assets/store/CG_ST_item_09.png",
  "CG_ST_item_10": "assets/store/CG_ST_item_10.png",
  "CG_ST_item_11": "assets/store/CG_ST_item_11.png",
  "CG_ST_item_12": "assets/store/CG_ST_item_12.png",
  "CG_ST_item_13": "assets/store/CG_ST_item_13.png",
  "CG_ST_item_14": "assets/store/CG_ST_item_14.png",
  "CG_ST_item_15": "assets/store/CG_ST_item_15.png",
  "CG_ST_item_16": "assets/store/CG_ST_item_16.png",
  "CG_ST_item_17": "assets/store/CG_ST_item_17.png",
  "CG_ST_item_18": "assets/store/CG_ST_item_18.png",
  "CG_ST_item_19": "assets/store/CG_ST_item_19.png",
  "CG_ST_item_20": "assets/store/CG_ST_item_20.png",
  "CG_ST_item_21": "assets/store/CG_ST_item_21.png",
  "CG_ST_item_22": "assets/store/CG_ST_item_22.png",
  "CG_ST_item_23": "assets/store/CG_ST_item_23.png",
  "CG_ST_item_24": "assets/store/CG_ST_item_24.png",
  "CG_ST_item_25": "assets/store/CG_ST_item_25.png",
  "CG_ST_item_26": "assets/store/CG_ST_item_26.png",
  "CG_ST_item_27": "assets/store/CG_ST_item_27.png",
  "CG_ST_Loading": "assets/store/CG_ST_Loading.png",
  "CG_ST_UI_01": "assets/store/CG_ST_UI_01.png",
  "CG_ST_UI_02": "assets/store/CG_ST_UI_02.png",
  "CG_ST_UI_03": "assets/store/CG_ST_UI_03.png",
  "CG_ST_UI_04": "assets/store/CG_ST_UI_04.png",
  "CG_ST_UI_05": "assets/store/CG_ST_UI_05.png",
  "CG_ST_UI_06": "assets/store/CG_ST_UI_06.png",
  "CG_ST_UI_07": "assets/store/CG_ST_UI_07.png",
  "CG_ST_UI_08": "assets/store/CG_ST_UI_08.png",
  "CG_ST_UI_09": "assets/store/CG_ST_UI_09.png",
  "CG_ST_UI_10": "assets/store/CG_ST_UI_10.png",
  "CG_ST_UI_11": "assets/store/CG_ST_UI_11.png",
  "CG_ST_UI_12": "assets/store/CG_ST_UI_12.png",
  "ChatGPT_Image_2026__6__2_____05_05_35__1_": "assets/store/ChatGPT Image 2026년 6월 2일 오전 05_05_35 (1).png",
  "ChatGPT_Image_2026__6__2_____05_05_35__2_": "assets/store/ChatGPT Image 2026년 6월 2일 오전 05_05_35 (2).png",
  "ChatGPT_Image_2026__6__2_____05_05_35__3_": "assets/store/ChatGPT Image 2026년 6월 2일 오전 05_05_35 (3).png",
  "ChatGPT_Image_2026__6__2_____05_05_35__4_": "assets/store/ChatGPT Image 2026년 6월 2일 오전 05_05_35 (4).png",
  "goods01": "assets/store/goods01.png",
  "goods02": "assets/store/goods02.png",
  "goods03": "assets/store/goods03.png",
  "Neko_01": "assets/store/Neko_01.png",
  "Store_Logo_01": "assets/store/Store_Logo_01.png",
  "_____": "assets/store/열정편의점.png",
};

export default {
  name: "store",
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
