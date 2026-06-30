/**
 * grid — 게임 카드 그리드 렌더 + 게임 실행(핸드오프 런처 호출).
 * (기존 index.html 인라인 스크립트에서 분리 — 계정/경제 UI 와 한 엔트리로 합치기 위함.)
 * 팝업 실행/오버레이/진행률 미러는 ./launcher.ts 가 담당.
 */
// games.config.js 는 JSDoc 타입의 순수 JS 레지스트리(allowJs 로 소비).
import { GAMES, gameUrl } from '../games.config.js';
import { launchGame, isPlayable } from './launcher.js';
import { toast } from './account.js';

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

/** 게임 1개 → 카드 엘리먼트. onClose 는 게임 창이 닫힐 때 호출(지갑 새로고침). */
function cardEl(game: GameEntry, onClose?: () => void): HTMLElement {
  const live = !!game.live;
  // 차단 모드(홈페이지)에선 라이브 카드도 앵커(href)로 만들지 않는다 → 새 탭/직접이동까지 봉쇄.
  //   allowlist(PLAY_OPEN_GAMES) 에 든 게임은 브라우저 탭에서도 실행 가능 → 앵커로 렌더.
  const playable = live && isPlayable(game.id);
  const el = document.createElement(playable ? 'a' : 'div');
  el.className = `card ${live ? 'live' : 'soon'}`;
  el.style.setProperty('--accent', game.accent);
  if (playable && el instanceof HTMLAnchorElement) {
    el.href = gameUrl(game) ?? '#';
    el.target = `casualgame_${game.id}`;
  }
  // 카드 이미지 = 게임 화면 키아트(game.art) 를 cover 로 꽉 채우고 + 투명 로고 상단 오버레이.
  //   (앱 아이콘 타일 방식에서 실제 게임화면 프리뷰 카드로 복원 — public/art/<*_Game.png>)
  const logoStyle = game.logoScale
    ? ` style="width:${(74 * game.logoScale).toFixed(1)}%;max-height:${(34 * game.logoScale).toFixed(1)}%"`
    : '';
  el.innerHTML =
    `<img class="art" src="${game.art}" alt="${game.title}" loading="lazy" />` +
    `<div class="scrim"></div>` +
    (game.logo ? `<img class="logo" src="${game.logo}" alt="${game.title} 로고" loading="lazy"${logoStyle} />` : '') +
    `<span class="badge"><span class="dot"></span>${live ? 'PLAY' : '준비중'}</span>` +
    `<div class="meta">` +
    `<h2 class="title">${game.title}</h2>` +
    `<p class="tag">${game.tagline || ''}</p>` +
    `<span class="pill">${playable ? '▶ 플레이' : live ? '오픈 준비중' : '🔒 준비중'}</span>` +
    `</div>`;
  if (live) {
    el.style.cursor = 'pointer';
    el.addEventListener('click', (e) => {
      const me = e as MouseEvent;
      if (e.defaultPrevented || me.button !== 0 || me.metaKey || me.ctrlKey || me.shiftKey || me.altKey) return;
      if (!isPlayable(game.id)) {
        e.preventDefault();
        toast('곧 오픈 예정입니다 🚧');
        return;
      }
      if (launchGame(game, onClose)) e.preventDefault();
    });
  }
  return el;
}

/**
 * 그리드 마운트 + 푸터 카드 수 표기. config 순서(=live 먼저 + 장르 묶음) 그대로.
 * onGameClose: 게임 창이 닫힐 때 호출 — 허브 지갑바 새로고침에 연결한다.
 */
export function mountGrid(grid: HTMLElement, foot: HTMLElement, onGameClose?: () => void): void {
  const games = GAMES as GameEntry[];
  for (const game of games) grid.appendChild(cardEl(game, onGameClose));
  const liveCount = games.filter((g) => g.live).length;
  foot.textContent = `PlayPOP Hub · v0.2.0 · 총 ${games.length}종 (플레이 ${liveCount} · 준비중 ${games.length - liveCount})`;
}
