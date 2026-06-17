/**
 * grid — 게임 카드 그리드 렌더 + 게임 팝업 실행.
 * (기존 index.html 인라인 스크립트에서 분리 — 계정/경제 UI 와 한 엔트리로 합치기 위함.)
 */
// games.config.js 는 JSDoc 타입의 순수 JS 레지스트리(allowJs 로 소비).
import { GAMES, gameUrl } from '../games.config.js';

interface GameEntry {
  id: string;
  title: string;
  tagline?: string;
  art: string;
  logo?: string;
  logoScale?: number;
  accent: string;
  live: boolean;
  devPort?: number;
  prodUrl?: string;
}

// 게임 설계 해상도 720×1280 = 9:16. window.open 의 width/height 는 '바깥 창' 크기라
// 브라우저 툴바(타이틀+주소창)가 높이를 먹어 '내부 영역'이 더 넓은 비율이 된다.
// → 내부를 9:16 으로 맞추려면 외부 높이에 툴바 높이(CHROME)를 더해 보정한다.
const GAME_ASPECT = 720 / 1280; // 폭/높이 = 0.5625
const CHROME_H = 92; // 타이틀바+주소창 대략치(브라우저별 ±). 내부 9:16 근사 보정.

/** 홈 화면에 설치된 PWA(주소창 없는 standalone)에서 실행 중인지. */
function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    // iOS Safari 는 display-mode 대신 navigator.standalone 로 노출.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function openGame(game: GameEntry): boolean {
  const url = gameUrl(game);
  if (!url) return false;
  // 설치형 PWA: window.open 팝업은 주소창 있는 외부 브라우저 창으로 새로 뜬다.
  // → 같은 창에서 이동해 standalone 셸을 유지(manifest scope '/' 로 게임도 주소창 X).
  //   허브로 복귀는 기기 뒤로가기(Android)·가장자리 스와이프(iOS)로.
  if (isStandalone()) {
    window.location.assign(url);
    return true;
  }
  let innerH = Math.min(900, Math.round(window.screen.availHeight * 0.86));
  // 폭을 9:16 보다 3% 좁게 → 내부 영역이 항상 9:16 '또는 더 길쭉'(게임의 안전 범위)으로 유지.
  let w = Math.round(innerH * GAME_ASPECT * 0.97);
  const maxW = Math.round(window.screen.availWidth * 0.96);
  if (w > maxW) {
    w = maxW;
    innerH = Math.round(w / GAME_ASPECT);
  }
  const h = innerH + CHROME_H; // 외부 높이 = 내부(9:16) + 툴바
  const left = Math.max(0, Math.round((window.screen.availWidth - w) / 2));
  const top = Math.max(0, Math.round((window.screen.availHeight - h) / 2));
  const win = window.open(
    url,
    `casualgame_${game.id}`,
    `popup=yes,width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=no`,
  );
  if (win) {
    win.focus();
    return true;
  }
  return false;
}

/** 게임 1개 → 카드 엘리먼트. */
function cardEl(game: GameEntry): HTMLElement {
  const live = !!game.live;
  const el = document.createElement(live ? 'a' : 'div');
  el.className = `card ${live ? 'live' : 'soon'}`;
  el.style.setProperty('--accent', game.accent);
  if (live && el instanceof HTMLAnchorElement) {
    el.href = gameUrl(game) ?? '#';
    el.target = `casualgame_${game.id}`;
  }
  el.innerHTML =
    `<img class="art" src="${game.art}" alt="${game.title}" loading="lazy" />` +
    `<div class="scrim"></div>` +
    (game.logo
      ? `<img class="logo" src="${game.logo}" alt="${game.title} 로고" loading="lazy"${game.logoScale ? ` style="width:${(74 * game.logoScale).toFixed(1)}%;max-height:${(34 * game.logoScale).toFixed(1)}%"` : ''} />`
      : '') +
    `<span class="badge"><span class="dot"></span>${live ? 'PLAY' : '준비중'}</span>` +
    `<div class="meta">` +
    `<h2 class="title">${game.title}</h2>` +
    `<p class="tag">${game.tagline || ''}</p>` +
    `<span class="pill">${live ? '▶ 플레이' : '🔒 준비중'}</span>` +
    `</div>`;
  if (live) {
    el.addEventListener('click', (e) => {
      const me = e as MouseEvent;
      if (e.defaultPrevented || me.button !== 0 || me.metaKey || me.ctrlKey || me.shiftKey || me.altKey) return;
      if (openGame(game)) e.preventDefault();
    });
  }
  return el;
}

/** 그리드 마운트 + 푸터 카드 수 표기. config 순서(=live 먼저 + 장르 묶음) 그대로. */
export function mountGrid(grid: HTMLElement, foot: HTMLElement): void {
  const games = GAMES as GameEntry[];
  for (const game of games) grid.appendChild(cardEl(game));
  const liveCount = games.filter((g) => g.live).length;
  foot.textContent = `PlayPOP Hub · v0.2.0 · 총 ${games.length}종 (플레이 ${liveCount} · 준비중 ${games.length - liveCount})`;
}
