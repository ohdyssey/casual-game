/**
 * grid — 게임 카드 그리드 렌더 + 게임 실행(핸드오프 런처 호출).
 * (기존 index.html 인라인 스크립트에서 분리 — 계정/경제 UI 와 한 엔트리로 합치기 위함.)
 * 팝업 실행/오버레이/진행률 미러는 ./launcher.ts 가 담당.
 */
// games.config.js 는 JSDoc 타입의 순수 JS 레지스트리(allowJs 로 소비).
import { GAMES, gameUrl } from '../games.config.js';
import { launchGame, isPlayable } from './launcher.js';
import { toast } from './account.js';
import { openRewardShell } from './reward/shell.js';

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
  extUrl?: string;
  pinned?: boolean;
  /** 임시 숨김 — 그리드/카운트에서 제외(config 에서 켠다). */
  hidden?: boolean;
}

/**
 * 고정 1번 앱(리워드앱) 카드 — CashPOP. 위치 변동 없이 항상 맨 앞.
 *   클릭 시 자체 구현 **인앱 리워드 셸**(CashPOP)을 연다. (허브=리워드 플랫폼, 게임=종속 미니게임 방향)
 *   onClose — 셸이 닫힐 때 호출(허브 지갑 새로고침).
 */
function pinnedCardEl(game: GameEntry, onClose?: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'card live pinned';
  el.style.setProperty('--accent', game.accent);
  // 앱 위에 CashPOP 로고 오버레이 배치. 아트는 캐시카드 영역이 배경으로 오도록 크롭(.card.pinned .art)
  //   → 화면 자체 상단 로고와 겹치지 않고, 오버레이 로고가 브랜드 마크로 선명하게 보인다.
  el.innerHTML =
    `<img class="art" src="${game.art}" alt="${game.title}" loading="lazy" />` +
    `<div class="scrim"></div>` +
    (game.logo ? `<img class="logo" src="${game.logo}" alt="${game.title} 로고" loading="lazy" />` : '') +
    `<span class="badge badge-reward"><span class="dot"></span>리워드</span>` +
    `<div class="meta">` +
    `<span class="pill">▶ 열기</span>` +
    `</div>`;
  el.style.cursor = 'pointer';
  el.addEventListener('click', () => openRewardShell(onClose));
  return el;
}

/** 게임 1개 → 카드 엘리먼트. onClose 는 게임 창이 닫힐 때 호출(지갑 새로고침). */
function cardEl(game: GameEntry, onClose?: () => void): HTMLElement {
  if (game.pinned) return pinnedCardEl(game, onClose);
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
 * 그리드 마운트 + 푸터 카드 수 표기. config 순서(=장르 묶음) 유지 + pinned 맨 앞·준비중 맨 뒤로 재배치.
 * onGameClose: 게임 창이 닫힐 때 호출 — 허브 지갑바 새로고침에 연결한다.
 */
export function mountGrid(grid: HTMLElement, foot: HTMLElement, onGameClose?: () => void): void {
  // 임시 숨김(hidden) 게임은 그리드/카운트에서 제외(예: CashPOP 임시 숨김).
  const games = (GAMES as GameEntry[]).filter((g) => !g.hidden);
  // 고정 1번 앱(pinned)은 항상 맨 앞, 준비중(live=false)은 항상 맨 뒤로 — 그 외엔 config 순서 유지(안정 정렬).
  const ordered = [...games].sort(
    (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.live ? 1 : 0) - (a.live ? 1 : 0)
  );
  for (const game of ordered) grid.appendChild(cardEl(game, onGameClose));
  // 카운트/문구는 '게임'만 집계(pinned 리워드앱은 게임이 아니라 제외).
  const gameList = games.filter((g) => !g.pinned);
  const liveCount = gameList.filter((g) => g.live).length;
  foot.textContent = `PlayPOP Hub · v0.2.0 · 총 ${gameList.length}종 (플레이 ${liveCount} · 준비중 ${gameList.length - liveCount})`;
}
