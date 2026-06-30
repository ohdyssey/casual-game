/**
 * 허브 엔트리 — 상단 HUD(지갑·로고·최근 플레이·액션) + 게임 그리드 마운트.
 */
import { mountGrid } from './grid.js';
import { mountAccountHub, type AccountHubHandle } from './account.js';
import { mountFeatured, type FeaturedHandle } from './featured.js';

const walletEl = document.getElementById('wallet');
const actionsEl = document.getElementById('acc-actions');
const account: AccountHubHandle | null =
  walletEl && actionsEl ? mountAccountHub(walletEl, actionsEl) : null;

// 게임 창이 닫히면 지갑 + 최근 플레이 배너를 갱신.
let featured: FeaturedHandle | null = null;
const onGameClose = (): void => {
  account?.reload();
  featured?.refresh();
};

const featuredEl = document.getElementById('featured');
featured = featuredEl ? mountFeatured(featuredEl, onGameClose) : null;

const grid = document.getElementById('grid');
const foot = document.getElementById('foot');
if (grid && foot) mountGrid(grid, foot, onGameClose);

// 게임에서 허브로 돌아올 때(팝업 닫힘으로 opener 포커스 복귀 · 탭 전환 · 뒤로가기 bfcache 복귀)
// 새로고침 없이 '최근 플레이' 배너 + 지갑을 즉시 갱신한다.
window.addEventListener('focus', onGameClose);
window.addEventListener('pageshow', onGameClose);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') onGameClose();
});
