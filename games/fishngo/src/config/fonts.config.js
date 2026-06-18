/**
 * fonts.config.js — 게임/에디터 공용 폰트 목록 + 선로딩 계획 (단일 출처).
 *
 * 캔버스 렌더라 폰트는 "렌더 전 로드"가 필수다. 게다가 구글폰트 한글은 **여러 유니코드
 * 서브셋으로 분할** 서빙되므로(고정 샘플로 load 하면 샘플 밖 음절은 폴백) — 게임이 실제로
 * 표시하는 텍스트 전체(GAME_TEXT_SAMPLE)로 선로딩해야 어떤 폰트든 한글이 폴백되지 않는다.
 *
 *   1) main.js preloadFonts: 카드 레이아웃이 쓰는 폰트를 GAME_TEXT_SAMPLE 로 await 선로딩
 *   2) 에디터(@ohdyssey/phaser-ui-editor): config.fontFamilies 로 글꼴 드롭다운 노출
 *
 * ⚠ 새 폰트 추가 절차:
 *   - index.html 에 @font-face(셀프호스팅) 또는 Google Fonts <link>(display=block) 선언
 *   - 아래 UI_FONTS 에 { family, ko } 추가
 *   ko=true = 한글 글리프 보유. false = 라틴 전용(한글은 폴백되어 "안 바뀐 듯" 보임).
 */
import { STORY_STAGES, STAGE_CARD_DESC } from './story-catalog.js';
import { ITEM_RODS, ITEM_REELS, ITEM_LINES, ITEM_BAITS } from './items.config.js';

export const UI_FONTS = [
  // ── 한글 가능(둥근/고딕/손글씨) ── index.html 셀프호스팅(Jua) + Google Fonts(나머지)
  { family: 'Jua',            ko: true  },   // 둥근 고딕(셀프호스팅, 기본 UI 폰트)
  { family: 'Do Hyeon',       ko: true  },   // 고딕
  { family: 'Black Han Sans', ko: true  },   // 매우 굵은 고딕(헤드라인)
  { family: 'Gaegu',          ko: true  },   // 손글씨
  { family: 'Gamja Flower',   ko: true  },   // 귀여운 손글씨
  { family: 'Hi Melody',      ko: true  },   // 둥근 손글씨
  { family: 'Dongle',         ko: true  },   // 둥근 굵은
  { family: 'Poor Story',     ko: true  },   // 손글씨(카드 설명 본문)
  // ── 본문/가독성(가벼운·일반 무게) — 굵은 디스플레이가 아닌 설명·문단 텍스트용 ──
  { family: 'Noto Sans KR',   ko: true  },   // 표준 본문 고딕(권장)
  { family: 'Gothic A1',      ko: true  },   // 본문 고딕
  { family: 'Gowun Dodum',    ko: true  },   // 가벼운 본문 고딕(고운돋움)
  { family: 'Stylish',        ko: true  },   // 얇은 본문 고딕
  { family: 'Gowun Batang',   ko: true  },   // 본문 세리프(고운바탕)
  { family: 'Noto Serif KR',  ko: true  },   // 본문 명조
  // ── 라틴 전용(영문/숫자 장식용 — 한글엔 부적합) ──
  { family: 'Bowlby One',     ko: false },
  { family: 'Black Ops One',  ko: false },
  { family: 'Russo One',      ko: false },
  { family: 'Inter',          ko: false },   // 본문 라틴(모던 UI)
  { family: 'Roboto',         ko: false },   // 본문 라틴
  // ── OS 기본(별도 로드 불필요) ──
  { family: 'system-ui',      ko: true  },
];

/** 에디터 글꼴 드롭다운용 family 문자열 배열(config.fontFamilies 로 주입). */
export const UI_FONT_FAMILIES = UI_FONTS.map((f) => f.family);

/** 선로딩 후보 — system-ui(네이티브) 제외. */
export const PRELOAD_FONTS = UI_FONTS.filter((f) => f.family !== 'system-ui');

// ─── 게임이 표시하는 한글/라틴 문자 전체(고유 문자만) — 폰트 서브셋 선로딩 샘플 ───
//   카드가 보여줄 수 있는 모든 텍스트: 스테이지명·설명·아이템명·정적 라벨 + 라틴/숫자/기호.
//   이 문자 집합으로 폰트를 load 하면 구글폰트 한글 분할서브셋이라도 필요분이 전부 로드된다.
export const GAME_TEXT_SAMPLE = (() => {
  const parts = [];
  for (const s of STORY_STAGES) if (s.storyName) parts.push(s.storyName);
  for (const v of Object.values(STAGE_CARD_DESC)) if (v) parts.push(v);
  for (const grp of [ITEM_RODS, ITEM_REELS, ITEM_LINES, ITEM_BAITS]) {
    for (const it of Object.values(grp)) if (it.name) parts.push(it.name);
  }
  // 정적 UI 라벨 + 라틴/숫자/기호(여유분).
  parts.push('추천 아이템 획득 보상 강화 상점 도감 홈 다음 레벨 골드 잠김 스테이지 설명');
  parts.push('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ~,.!?:×x+-() ');
  return Array.from(new Set(parts.join('').split(''))).join('');   // 고유 문자만
})();

/**
 * 주어진 레이아웃 JSON(URL)에서 text 노드가 쓰는 fontFamily 집합을 수집.
 *   캔버스 폴백 방지를 위해 "실제 사용 폰트"만 풀 선로딩하려는 용도. fetch 실패 시 빈 배열.
 * @param {string} url @returns {Promise<string[]>}
 */
export async function collectLayoutFonts(url = 'card.layout.json') {
  try {
    if (typeof fetch !== 'function') return [];
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return [];
    const json = await res.json();
    const fams = new Set();
    for (const n of (json.nodes || [])) {
      if (n.type === 'text' && n.fontFamily) fams.add(n.fontFamily);
    }
    return [...fams];
  } catch {
    return [];
  }
}
