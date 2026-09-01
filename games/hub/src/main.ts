/**
 * 허브 엔트리 — 게임 포털 크롬 조립.
 *   상단 지갑 + 브랜드 · 좌우 레일(쇼핑/랭크) · 중앙 폰 프레임(대표 게임) ·
 *   히어로 푸터 · 하단 탭바 · 게임 카탈로그 그리드.
 */
import { mountGrid } from './grid.js';
import { mountAccountHub, toast, type AccountHubHandle } from './account.js';
import { mountFeatured, type FeaturedHandle } from './featured.js';
import { mountRails } from './rails.js';
import { mountInstall } from './install.js';
import { openMenu } from './modals.js';
import { bootstrapDeferredLink } from './deferredLink/bootstrap.js';

// 디퍼드 딥링크 — 최초 실행이면 설치 유입 광고의 game_id 를 조회해 그 게임으로 바로 보낸다.
// 1단계는 목 구현(항상 없음)이라 실동작 변화가 없다. 허브 크롬 마운트를 기다리지 않는다 —
// 딥링크 진입이면 어차피 게임으로 이동하고, 아니면 아래 크롬이 평소대로 뜬다.
void bootstrapDeferredLink();

const walletEl = document.getElementById('wallet');
const actionsEl = document.getElementById('acc-actions');
const account: AccountHubHandle | null =
  walletEl && actionsEl ? mountAccountHub(walletEl, actionsEl) : null;

// 게임 창이 닫히면 지갑 + 대표 게임 프레임을 갱신.
let featured: FeaturedHandle | null = null;
const onGameClose = (): void => {
  account?.reload();
  featured?.refresh();
};

// 중앙 상위앱 카드(대표 게임 = 아트 + 통합 푸터/플레이).
const phoneEl = document.getElementById('phone');
featured = phoneEl ? mountFeatured(phoneEl, onGameClose) : null;

// 좌우 캔디 아이콘 레일(포털 모달 진입) — 계정 컨트롤러로 지갑/경제를 읽고 갱신.
// ⚠️ 임시 제거(요청) — 복구하려면 SHOW_RAILS 를 true 로.
//   ⚠️ display:none 으로 없애면 .stage(space-between)에서 폰 프레임이 왼쪽으로 쏠린다 →
//      **마운트만 생략**(빈 레일=0폭 유지)해 space-between 이 대표게임 폰을 중앙에 유지하게 한다.
const SHOW_RAILS = false;
const leftEl = document.getElementById('rail-left');
const rightEl = document.getElementById('rail-right');
if (SHOW_RAILS && account && leftEl && rightEl) mountRails(leftEl, rightEl, account.ctrl);

// 우상단 메뉴 아이콘 → 포털 메뉴(모든 기능 진입).
const menuBtn = document.getElementById('menu-btn');
if (account && menuBtn) menuBtn.addEventListener('click', () => openMenu(account.ctrl));

// PWA 설치 버튼 — 설치 가능(Android/데스크톱) 시 노출, iOS 는 수동 안내, 설치됨이면 숨김.
// ⚠️ 2026-09-01 재활성화 — 게임 쪽(솔리테어 등) "홈 화면에 추가"가 이제 게임 자신이 아니라
//   이 허브(PlayPOP)로 리다이렉트하도록 바뀌었다(appLaunch.ts triggerInstallFlow → goHub).
//   여기가 꺼져 있으면(SHOW_INSTALL=false) 리다이렉트만 되고 실제 설치 진입점이 없어서
//   "설치하러 가기를 눌러도 아무 일도 안 일어난다"가 된다 — 반드시 true 로 유지할 것.
const SHOW_INSTALL = true;
const installBtn = document.getElementById('install-btn');
// 게임의 "설치하러 가기"가 `?install=1` 을 붙여 보낸다 — 도착하자마자(지연 없이) 배너를 띄운다.
const installIntent = new URLSearchParams(location.search).get('install') === '1';
if (installIntent) history.replaceState(null, '', location.pathname); // 이후 내비게이션에 안 남게.
if (SHOW_INSTALL && installBtn) mountInstall(installBtn, toast, { immediate: installIntent });

const grid = document.getElementById('grid');
const foot = document.getElementById('foot');
if (grid && foot) mountGrid(grid, foot, onGameClose);

// 게임에서 허브로 돌아올 때(팝업 닫힘으로 opener 포커스 복귀 · 탭 전환 · 뒤로가기 bfcache 복귀)
// 새로고침 없이 대표 게임 프레임 + 지갑을 즉시 갱신한다.
window.addEventListener('focus', onGameClose);
window.addEventListener('pageshow', onGameClose);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') onGameClose();
});
