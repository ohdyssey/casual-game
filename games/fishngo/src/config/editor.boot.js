/**
 * editor.boot.js — 독립형 UI 저작도구가 호출하는 에셋 부트스트랩.
 *
 * 임베디드 모드(게임 안 #uieditor)에선 LoadingScene 이 이 에셋들을 캐시에 채운다.
 * 독립형 에디터(phaser-ui-editor/editor-app)에는 LoadingScene 이 없으므로,
 *   ProjectBootScene 이 preload 단계에서 bootEditorAssets(this) 를 호출해
 *   에디터가 풀충실도로 렌더하는 데 필요한 텍스처/매니페스트/애니메이션을 동일하게 적재한다.
 *
 * 미러 대상: LoadingScene.preload()(이미지·시트·card_layout·card_assets 동적 큐) +
 *           LoadingScene.create()(ANIMATIONS 등록). 단 lazy-skip 없이 에디터용 superset 로드.
 */
import { ASSETS, ASSETS_SPRITESHEETS, ANIMATIONS } from './assets.config.js';

/**
 * 에디터 렌더에 필요한 전 에셋을 scene.load 에 큐잉하고, 로드 완료 시 애니메이션을 등록한다.
 *   - 업로드 커스텀 에셋(card_assets 매니페스트)은 2단계 로딩으로 동적 큐잉(임베디드와 동일).
 *   - 오디오(BGM/효과음)는 에디터에 불필요 → 제외(부팅 속도).
 * @param {import('phaser').Scene} scene  preload 단계의 ProjectBootScene
 */
export function bootEditorAssets(scene) {
  // 정적 이미지 — 에디터는 lazy 구분 없이 전부 사용 가능해야 하므로 superset 로드.
  for (const [key, path] of Object.entries(ASSETS)) {
    if (!scene.textures.exists(key)) scene.load.image(key, path);
  }
  // 스프라이트시트(추천 어종 아이콘 등).
  for (const [key, def] of Object.entries(ASSETS_SPRITESHEETS)) {
    if (!scene.textures.exists(key)) {
      scene.load.spritesheet(key, def.path, { frameWidth: def.frameWidth, frameHeight: def.frameHeight });
    }
  }
  // 저작 레이아웃 + 업로드 에셋 매니페스트.
  scene.load.json('card_layout', 'card.layout.json');
  scene.load.json('card_assets', 'card.assets.json');
  // 매니페스트 도착 즉시 각 업로드 이미지를 동적 큐잉(2단계 로딩 — 임베디드 LoadingScene 과 동일).
  scene.load.on('filecomplete-json-card_assets', () => {
    const manifest = scene.cache.json.get('card_assets') || {};
    for (const [key, path] of Object.entries(manifest)) {
      if (key && path && !scene.textures.exists(key)) scene.load.image(key, path);
    }
  });
  // 전 로드 완료 후 애니메이션 등록(텍스처 존재 + 미등록일 때만).
  scene.load.once('complete', () => {
    for (const [animKey, def] of Object.entries(ANIMATIONS)) {
      if (scene.anims.exists(animKey)) continue;
      if (!scene.textures.exists(def.spriteKey)) continue;
      scene.anims.create({
        key: animKey,
        frames: scene.anims.generateFrameNumbers(def.spriteKey, { frames: def.frames }),
        frameRate: def.frameRate,
        repeat: def.repeat,
      });
    }
  });
}
