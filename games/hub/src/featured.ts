/**
 * featured — 대표 게임(상위 앱) 폰 프레임 프리뷰 + 히어로 푸터(타이틀·플레이/카드/친구).
 *
 * 상위 앱은 항상 하나가 지정된다:
 *   ① 최근 플레이한 live 게임이 있으면 그 게임(‘최근 플레이’).
 *   ② 없으면(처음 접속) 기본 대표 게임 '꼬치왕'(skewer, ‘대표 게임’).
 *   ③ 그마저 없으면 첫 live 게임(안전망).
 *
 * 폰 프레임 = 게임 홈 화면 아트(자체 HUD/PLAY 가 아트에 포함)를 라운드 베젤에 담고, 클릭 시 실행.
 * 좌우 레일(rails.ts)·상단 지갑·하단 탭바가 이 프레임을 둘러싸 '게임 포털' 크롬을 이룬다.
 */
import { GAMES } from '../games.config.js';
import { launchGame, getLastPlayed, isPlayable } from './launcher.js';
import { toast } from './account.js';

/** 처음 접속(최근 플레이 없음) 시 기본 대표 게임 id — 솔리테어 하이츠(PO 2026-07-30). 이후는 최근 플레이 히스토리를 따른다. */
const DEFAULT_FEATURED_ID = 'solitaire';

interface GameEntry {
  id: string;
  title: string;
  tagline?: string;
  art: string;
  heroVideo?: string;
  logo?: string;
  accent: string;
  live: boolean;
  devPort?: number;
  prodUrl?: string;
  pinned?: boolean;
}

export interface FeaturedHandle {
  /** 최근 플레이 게임을 다시 읽어 프레임 갱신. */
  refresh(): void;
}

const CARDS_SVG =
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true">` +
  `<rect x="3.5" y="6" width="11.5" height="14" rx="2"/>` +
  `<path d="M8 6V5.2A2 2 0 0 1 10 3.2h8a2 2 0 0 1 2 2v10.6"/>` +
  `<path d="M9.3 14.8l1.05-2.1 1.05 2.1 2.3.25-1.7 1.5.5 2.25-1.75-1.15-1.75 1.15.5-2.25-1.7-1.5z" fill="currentColor" stroke="none"/>` +
  `</svg>`;

const FRIENDS_SVG =
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
  `<circle cx="9" cy="8" r="3"/>` +
  `<path d="M3.6 19a5.4 5.4 0 0 1 10.8 0"/>` +
  `<path d="M16 5.4a3 3 0 0 1 0 5.5"/>` +
  `<path d="M17 14.3a5.4 5.4 0 0 1 3.4 4.4"/>` +
  `</svg>`;

/**
 * 상위 앱(대표 게임) 카드 마운트 — 아트 화면 + 통합 푸터(타이틀·플레이·카드/친구)를 한 카드에.
 *   phoneEl — 상위앱 카드(무대 중앙, 좁고 긴 세로 카드).
 *   onGameClose — 카드에서 실행한 게임이 닫힐 때 호출(지갑 새로고침).
 */
export function mountFeatured(phoneEl: HTMLElement, onGameClose?: () => void): FeaturedHandle {
  const games = GAMES as GameEntry[];

  const render = (): void => {
    const lastId = getLastPlayed();
    const recent = lastId ? games.find((g) => g.id === lastId && g.live) : undefined;
    const game =
      recent ??
      games.find((g) => g.id === DEFAULT_FEATURED_ID && g.live) ??
      games.find((g) => g.live && !g.pinned); // 고정 리워드앱은 대표 게임 후보에서 제외
    if (!game) {
      phoneEl.innerHTML = `<div class="phone-empty">표시할 게임이 없습니다</div>`;
      return;
    }

    const badgeLabel = recent ? '최근 플레이' : '대표 게임';
    phoneEl.style.setProperty('--accent', game.accent);
    const artTag = game.heroVideo
      ? `<video class="phone-art" src="${game.heroVideo}" poster="${game.art}" autoplay muted loop playsinline></video>`
      : `<img class="phone-art" src="${game.art}" alt="${game.title}" />`;
    phoneEl.innerHTML =
      `<a class="phone-screen" href="#" aria-label="${game.title} 플레이">` +
      artTag +
      `</a>` +
      `<div class="phone-veil" aria-hidden="true"></div>` +
      `<div class="phone-foot">` +
      `<span class="hero-badge"><span class="dot"></span>${badgeLabel}</span>` +
      `<h2 class="hero-title">${game.title}</h2>` +
      `<button class="hero-play" id="hero-play" type="button">▶ 플레이</button>` +
      `<div class="hero-mini-row">` +
      `<button class="hero-mini" id="hero-cards" type="button">${CARDS_SVG}<span>CARDS</span></button>` +
      `<button class="hero-mini" id="hero-friends" type="button">${FRIENDS_SVG}<span>FRIENDS</span></button>` +
      `</div>` +
      `</div>`;

    const play = (): void => {
      if (!isPlayable(game.id)) {
        toast('곧 오픈 예정입니다 🚧');
        return;
      }
      launchGame(game, onGameClose);
    };
    phoneEl.querySelector<HTMLAnchorElement>('.phone-screen')!.addEventListener('click', (e) => {
      e.preventDefault();
      play();
    });
    phoneEl.querySelector<HTMLButtonElement>('#hero-play')!.addEventListener('click', play);
    phoneEl
      .querySelector<HTMLButtonElement>('#hero-cards')!
      .addEventListener('click', () => toast('카드 컬렉션은 곧 오픈됩니다 🃏'));
    phoneEl
      .querySelector<HTMLButtonElement>('#hero-friends')!
      .addEventListener('click', () => toast('친구 기능은 곧 오픈됩니다 👥'));
  };

  render();
  return { refresh: render };
}
