/**
 * editor.config.js — 게임이 @ohdyssey/phaser-ui-editor 에 주입하는 EditorConfig.
 *
 * 패키지의 createUiEditorScene(EDITOR_CONFIG) 가 이 설정으로 저작도구 씬을 만든다.
 *   게임-특정: 문서 레지스트리(UI_DOCS) · 애니 카탈로그(ANIMATIONS) · 낚시 역할 어휘 ·
 *   에셋 매니페스트/접두사/기본키 등.
 *
 * ⚠ '../ui/LocationCard.js' import = 게임 노드타입(art/coin/iconRow/starRow/slotRow/text) 등록
 *    부수효과 보장(에디터 프리뷰가 카드 노드를 렌더하려면 필요).
 */
import { makeAssetCatalog } from '@ohdyssey/phaser-ui-editor';
import { UI_DOCS } from './ui-docs.js';
import { ANIMATIONS } from './assets.config.js';
import { UI_FONT_FAMILIES } from './fonts.config.js';
import '../ui/LocationCard.js';   // side-effect: registerNodeRenderers(게임 커스텀 노드타입)

export const EDITOR_CONFIG = {
  sceneKey: 'UiEditorScene',
  docs: UI_DOCS,
  assetCatalog: makeAssetCatalog(ANIMATIONS),
  // 글꼴 드롭다운 목록 — 게임이 선로딩(main.js)하는 폰트와 동일 출처(fonts.config.js).
  //   한글 가능 8종 + 라틴 3종 + system-ui. (패키지가 config.fontFamilies 미지원 시 무시됨)
  fontFamilies: UI_FONT_FAMILIES,
  roleSuggestions: [
    'close', 'gold', 'title', 'progress', 'lives',
    'action:home', 'action:upgrade', 'action:album', 'action:shop',
    'action:menu', 'action:rank',
    'action:rod', 'action:reel', 'action:line', 'action:bait', 'action:purchase',
    'field:rod.level', 'field:rod.cost',
  ],
  assetManifestKey: 'card_assets',      // BootScene 이 card.assets.json 을 이 키로 캐시
  assetLabelStrip: 'card_',             // 드롭다운 표시에서 접두사 제거
  uploadKeyPrefix: 'card_up_',          // 업로드 텍스처 키 접두사
  // 새 이미지 레이어 기본 에셋: card_slot 우선, 없으면 첫 card_ 이미지.
  pickDefaultImageKey: (allKeys) => {
    const cards = allKeys.filter((k) => k.startsWith('card_') && !k.includes('art'));
    return cards.includes('card_slot') ? 'card_slot' : (cards[0] || allKeys[0]);
  },
};
