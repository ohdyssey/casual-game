/**
 * gameRegistry — 디퍼드 딥링크의 game_id 슬러그 체계.
 *
 * 게임 목록의 SSOT 는 기존 `games.config.js`(GAMES) 다 — 여기서 목록을 **복제하지 않고**
 * 그 위에 딥링크 관점의 얇은 층만 얹는다:
 *   · hasGame(slug)      — 진입 가능한 슬러그인가(카탈로그에 있고 live 인 게임만)
 *   · loadGameScene(slug) — 그 게임으로 진입. 허브는 웹 포털이라 "씬 로드" = **같은 창으로
 *     게임 URL 이동**(launcher.launchGame)이다. 성공 시 true.
 *
 * 슬러그 별칭(CAMPAIGN_ALIASES): 광고 캠페인/스토어 페이지에는 마케팅용 슬러그
 * (예: tictactoe_neon)를 쓸 수 있다 — 내부 id 로 정규화해 받는다. 캠페인 세팅이 내부
 * id 개편에 흔들리지 않게 하는 완충층이다.
 */
import { GAMES } from '../games.config.js';
import { launchGame } from './launcher.js';

interface CatalogEntry {
  id: string;
  title: string;
  live: boolean;
  devPort?: number;
  prodUrl?: string;
}

const catalog = GAMES as CatalogEntry[];

/**
 * 기본 히어로 게임 — 딥링크가 없거나 실패했을 때의 대표 게임.
 * ⚠️ 대표 게임 선정의 SSOT 는 featured.ts(DEFAULT_FEATURED_ID, PO 지정)다. 여기 값은
 *    레지스트리 폴백 용도로만 쓰며 그 값과 같게 유지한다.
 */
export const DEFAULT_HERO_GAME_ID = 'solitaire';

/** 마케팅 슬러그 → 내부 게임 id. 캠페인에 새 슬러그를 쓰면 여기에만 추가하면 된다. */
const CAMPAIGN_ALIASES: Record<string, string> = {
  tictactoe_neon: 'tictactoe',
  homerun_pop: 'homerunpop',
  archery_stars: 'archerystars',
  solitaire_heights: 'solitaire',
  vegas_hotel_tycoon: 'socialcasino',
};

/** 슬러그(내부 id 또는 캠페인 별칭) → 내부 게임 id. 모르면 null. */
export function resolveGameId(slug: string): string | null {
  const id = CAMPAIGN_ALIASES[slug] ?? slug;
  return catalog.some((g) => g.id === id) ? id : null;
}

/** 이 슬러그로 진입할 수 있는가 — 카탈로그에 있고 live 인 게임만. */
export function hasGame(slug: string): boolean {
  const id = resolveGameId(slug);
  return id !== null && (catalog.find((g) => g.id === id)?.live ?? false);
}

/**
 * 해당 게임으로 진입한다(같은 창 이동). 성공 시 true.
 *
 * ⚠️ 존재하지 않는 슬러그는 **이동하지 않고 false** 를 돌려준다 — 기본 허브 폴백은 호출부
 *    (bootstrap)가 결정한다. 여기서 기본 게임으로 재귀 진입하면 "딥링크가 틀렸는데 엉뚱한
 *    게임이 열리는" 혼란이 생긴다(웹 허브의 기본 진입 = 이동 없이 허브 화면 그대로).
 *
 * launchGame 이 최근 플레이(last played)를 저장하므로, 딥링크로 진입한 게임은 허브로
 * 돌아왔을 때 자동으로 **히어로 슬롯(대표 게임)** 에 표시된다(featured.ts 의 최근 플레이 우선).
 */
export function loadGameScene(slug: string): boolean {
  const id = resolveGameId(slug);
  if (id === null) return false;
  const game = catalog.find((g) => g.id === id);
  if (!game || !game.live) return false;
  return launchGame(game);
}
