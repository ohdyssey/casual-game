/**
 * featured — 상단 대표 게임 배너.
 *   · 최근 플레이한 게임이 있으면 그 게임을 '최근 플레이'로 표시(클릭 시 다시 실행).
 *   · 아직 없으면(처음 접속) 대표 게임 '배송대작전'(parcelpoprush)을 우선 표시.
 */
import { GAMES } from '../games.config.js';
import { launchGame, getLastPlayed, isPlayable } from './launcher.js';
import { toast } from './account.js';

/** 처음 접속 시(최근 플레이 없음) 우선 노출할 대표 게임 id. */
const DEFAULT_FEATURED_ID = 'parcelpoprush';

interface GameEntry {
  id: string;
  title: string;
  tagline?: string;
  art: string;
  logo?: string;
  accent: string;
  live: boolean;
  devPort?: number;
  prodUrl?: string;
}

export interface FeaturedHandle {
  /** 최근 플레이 게임을 다시 읽어 배너 갱신. */
  refresh(): void;
}

/** 상단 '최근 플레이' 배너를 마운트. onGameClose 는 배너에서 실행한 게임이 닫힐 때 호출. */
export function mountFeatured(el: HTMLElement, onGameClose?: () => void): FeaturedHandle {
  const games = GAMES as GameEntry[];

  const render = (): void => {
    // 최근 플레이 게임 우선 → 없으면 대표 게임(배송대작전) → 그래도 없으면 첫 live 게임.
    const lastId = getLastPlayed();
    const recent = lastId ? games.find((g) => g.id === lastId && g.live) : undefined;
    const game =
      recent ??
      games.find((g) => g.id === DEFAULT_FEATURED_ID && g.live) ??
      games.find((g) => g.live);
    if (!game) {
      el.innerHTML = `<div class="feat-empty">표시할 게임이 없습니다</div>`;
      return;
    }
    // 최근 플레이로 보여줄 때만 '최근 플레이' 뱃지, 처음 접속(대표 게임)이면 '대표 게임'.
    const badgeLabel = recent ? '최근 플레이' : '대표 게임';
    const ariaLabel = recent ? `${game.title} 다시 플레이` : `${game.title} 플레이`;
    el.style.setProperty('--accent', game.accent);
    el.innerHTML =
      `<a class="feat-card" href="#" aria-label="${ariaLabel}">` +
      `<img class="feat-art" src="${game.art}" alt="" />` +
      `<div class="feat-scrim"></div>` +
      (game.logo ? `<img class="feat-logo" src="${game.logo}" alt="" />` : '') +
      `<span class="feat-badge"><span class="dot"></span>${badgeLabel}</span>` +
      `<div class="feat-meta">` +
      `<h2 class="feat-title">${game.title}</h2>` +
      `<span class="feat-play">▶ 플레이</span>` +
      `</div>` +
      `</a>`;
    el.querySelector<HTMLAnchorElement>('.feat-card')!.addEventListener('click', (e) => {
      e.preventDefault();
      if (!isPlayable(game.id)) {
        toast('곧 오픈 예정입니다 🚧');
        return;
      }
      launchGame(game, onGameClose);
    });
  };

  render();
  return { refresh: render };
}
