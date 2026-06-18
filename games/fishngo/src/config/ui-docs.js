/**
 * ui-docs.js — UI 저작도구가 편집하는 "UI 문서" 레지스트리.
 *
 * 에디터(#uieditor)는 여기 등록된 문서 중 하나를 선택해 편집한다(하단 UI 목록).
 *   각 문서: id / name / file(저장 경로, public 기준) / sample(바인딩 미리보기 데이터) / getDefault()(시드 레이아웃).
 *   저장: POST /__ui_layout?file=<file> → public/<file>. 로드: GET 동일.
 *
 * `wired` 플래그 = 게임 씬이 이 레이아웃을 실제로 읽어 렌더/연동하는지(에디터 목록에 표시).
 *   연결됨: card(HomeScene) · upgrade/shop/album(전체화면 팝업) · bait/line/reel/rod(아이템 팝업 크롬).
 *   미연결: result(ResultScene 절차적 — 추후 연동).
 *
 * 시드 치수는 에셋 native 종횡비에 맞춤(왜곡 방지). 측정값:
 *   panel_popup 717×967 · btn_pop_close 83² · poptitle_line 139×67 · bait 132×71 · reel 109×81 · rod 152×81.
 */

import { DEFAULT_LAYOUT } from './card-layout.js';
import { UI_SCREENS, screenToDoc } from './ui-screens.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

// ── 아이템 상세 팝업(미끼/낚시줄/릴/낚시대) — panel_popup(717×967) 프레임 공유 + 제목 워드아트 + 닫기 ──
const TH = 80;   // 제목 워드아트 표시 높이(폭은 native 비율)
function itemPopupDoc(id, name, titleKey, titleAspect) {
  return {
    id, name, file: `ui/layouts/${id}.json`, sample: {}, wired: true,
    getDefault: () => ({
      frame: { designW: 717, designH: 967 },
      nodes: [
        { id: 'panel', type: 'image', name: '팝업 패널', key: 'panel_popup', x: 358, y: 483, w: 717, h: 967, depth: 0, visible: true, tintable: true },
        { id: 'title', type: 'image', name: '제목', key: titleKey, x: 358, y: 98, w: Math.round(TH * titleAspect), h: TH, depth: 5, visible: true, tintable: true },
        { id: 'close', type: 'image', name: '닫기', key: 'btn_pop_close', x: 656, y: 72, w: 62, h: 62, depth: 6, visible: true, tintable: true },
      ],
    }),
  };
}

// ── 전체화면 오버레이(강화/도감/상점) — 720×1280, 중앙 팝업 패널 + 제목 텍스트 ──
function fullScreenDoc(id, name, titleText) {
  return {
    id, name, file: `ui/layouts/${id}.json`, sample: {}, wired: true,
    getDefault: () => ({
      frame: { designW: 720, designH: 1280 },
      nodes: [
        { id: 'panel', type: 'image', name: '패널', key: 'panel_popup', x: 360, y: 650, w: 648, h: 874, depth: 0, visible: true, tintable: true },
        { id: 'title', type: 'text', name: '제목', text: titleText, x: 360, y: 280, fontSize: 46, fontFamily: 'Jua', color: '#ffffff', stroke: '#5a3210', strokeW: 7, align: 'center', depth: 5, visible: true },
      ],
    }),
  };
}

export const UI_DOCS = [
  {
    id: 'card',
    name: '낚시터 카드',
    file: 'card.layout.json',                  // 게임 연결됨
    wired: true,
    sample: {
      title: '해변 낚시터', artKey: 'card_art_01',
      fishIcons: ['sprite_clownfish', 'sprite_angelfish', 'sprite_flounder'],
      difficulty: 2, rewardMin: 150, rewardMax: 300,
    },
    getDefault: () => clone(DEFAULT_LAYOUT),
  },
  // ── 게임 화면 크롬(상단 HUD·하단 탭바 …) — 매니페스트(ui-screens.js)에서 자동 등록 ──
  ...UI_SCREENS.map(screenToDoc),
  {
    id: 'result',
    name: '결과 화면',
    file: 'ui/layouts/result.json',
    sample: {},
    getDefault: () => ({
      frame: { designW: 720, designH: 1280 },
      nodes: [
        { id: 'bg', type: 'image', name: '배경', key: 'bg_result', x: 360, y: 640, w: 720, h: 1280, depth: 0, visible: true, tintable: true },
        { id: 'title', type: 'text', name: '제목', text: 'RESULT', x: 360, y: 150, fontSize: 60, color: '#ffffff', stroke: '#15324f', strokeW: 8, align: 'center', depth: 5, visible: true },
      ],
    }),
  },
  // 전체화면 메뉴
  fullScreenDoc('upgrade', '강화', '강화'),
  fullScreenDoc('album', '도감', '도감'),
  fullScreenDoc('shop', '상점', '상점'),
  // 아이템 상세 팝업
  itemPopupDoc('bait', '미끼 팝업', 'poptitle_bait', 132 / 71),
  itemPopupDoc('line', '낚시줄 팝업', 'poptitle_line', 139 / 67),
  itemPopupDoc('reel', '릴 팝업', 'poptitle_reel', 109 / 81),
  itemPopupDoc('rod', '낚시대 팝업', 'poptitle_rod', 152 / 81),
];

/** id 로 문서 조회. */
export function getUiDoc(id) { return UI_DOCS.find((d) => d.id === id) || null; }
