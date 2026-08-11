/** 홈런팝 진입점 — 코어 셸에 GameModule 을 넘겨 부팅. */
// 폰트 @font-face 등록(로컬 자체 호스팅) — 엔트리 최상단에서 불러 캔버스 첫 렌더 전에 브라우저가
// 폰트를 알고 있게 한다. 파일은 scripts/fonts-build.mjs 가 레이아웃에서 자동 생성한다.
import './fonts/fonts.css';
import type Phaser from 'phaser';
import { createCasualGame } from '@casual/core';
import { HomerunGame } from './game.js';
import { resolveSwing, resolveTake } from './logic/judge.js';
import { initAdsAndBanner, removeBanner } from './ads.js';
import { isAdsRemoved, initNoAdsButton } from './iap.js';
import { SafeAreaInsets } from '@apps-in-toss/web-framework';

declare global {
  interface Window {
    __safeArea?: { top: number; bottom: number; left: number; right: number };
  }
}

/**
 * 세이프에어리어 인셋(노치·다이나믹 아일랜드·홈바) 측정 → window.__safeArea 로 노출.
 *
 * 우선순위(앱인토스 공식 문서 권장):
 *  1. **토스 SDK `SafeAreaInsets`** — 토스 웹뷰에선 CSS env() 가 0 을 반환한다(실측: 아이폰
 *     스크린샷에서 배너 흰 띠가 정확히 96pt = 홈바 인셋 미반영). 문서도 env() 대신 SDK 사용을
 *     권장한다. initSafeAreaFromSdk() 가 성공하면 이후 이 값이 단일 진실이다.
 *  2. **CSS env() 폴백** — 토스 밖(일반 브라우저·PWA)에서는 SDK 브릿지가 없어 예외가 나므로
 *     기존 방식(:root 의 --sat 등)을 그대로 쓴다.
 *
 * PlayScene 이 이 값을 게임좌표로 변환해 헤더를 노치 아래로(15pt 캡), 배너·하단 UI 를 홈바
 * 위로 배치한다.
 */
let sdkSafeAreaActive = false;

function readSafeArea(): void {
  if (sdkSafeAreaActive) return; // SDK 값이 단일 진실 — env(토스 웹뷰에선 0)로 덮어쓰지 않는다.
  try {
    const cs = getComputedStyle(document.documentElement);
    const px = (v: string): number => {
      const n = parseFloat(cs.getPropertyValue(v));
      return Number.isFinite(n) ? n : 0;
    };
    window.__safeArea = { top: px('--sat'), bottom: px('--sab'), left: px('--sal'), right: px('--sar') };
  } catch {
    window.__safeArea = { top: 0, bottom: 0, left: 0, right: 0 };
  }
}
readSafeArea();
window.addEventListener('resize', readSafeArea);

/**
 * iOS 핀치줌 차단 — 사용자 보고(아이폰): "배너가 위로 뜨고 좌우 및 하단에 여백이 많이 생기네요".
 * 페이지가 핀치로 줌아웃되면 fixed 요소(배너)가 레이아웃 뷰포트 기준에 남아 화면 중간에 뜨고,
 * 캔버스 바깥이 검은 여백으로 드러난다 — 스크린샷 증상과 일치. viewport meta 의 user-scalable=no
 * 는 iOS 가 접근성 명분으로 무시하므로, 제스처 이벤트를 직접 막아야 실제로 차단된다
 * (gesturestart/gesturechange 는 iOS 전용 이벤트 — 다른 플랫폼에선 아예 발생하지 않아 무해).
 */
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}
// 더블탭 줌도 차단(탭 연타가 핵심 조작인 게임이라 더블탭 줌은 사고만 낸다).
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 300) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false },
);

/**
 * 뷰포트 실측 배치(사용자 승인 A안) — 아이폰 토스 웹뷰에서 **레이아웃 뷰포트 높이가 실제 화면의
 * 약 2/3(≈620pt)로 고정**되는 문제의 안전망. 시트형으로 열린 웹뷰가 전체 화면으로 확장돼도 CSS
 * 뷰포트에 반영되지 않아, `bottom: 0`(=뷰포트 바닥)에 붙인 배너가 화면 66% 지점에 뜨고 그 아래가
 * 검게 남았다(사용자 스크린샷 실측: 배너 밑변 620/932pt, 배너 폭은 전폭 → 핀치줌 아님).
 *
 * 대응: CSS 의 fixed bottom/100dvh 를 믿지 않고, 신뢰할 수 있는 실측 후보들
 * (visualViewport.height · innerHeight · documentElement.clientHeight) 중 **최댓값**을 화면
 * 높이로 보고 게임 컨테이너·배너·NO ADS 버튼을 px 로 직접 배치한다.
 *  · 정상 환경(데스크톱·안드로이드·일반 사파리)에선 세 값이 같아 오늘과 동일하게 동작한다.
 *  · screen.height 는 쓰지 않는다 — 주소창 있는 일반 브라우저에서 과대측정돼 배너가 화면 밖으로
 *    잘린다(실제 보이는 영역 기반 값만 사용).
 *  · 웹뷰가 리사이즈 이벤트를 안 쏘는 경우까지 잡도록 짧은 주기로 재확인한다(값이 바뀔 때만
 *    DOM 을 만져 레이아웃 부담 없음).
 */
const BANNER_CONTENT_H = 96; // 토스 고정형 배너 권장 높이(CSS px) — index.html 과 동일 값.
let appliedViewportKey = ''; // "높이|배너예약" — 어느 쪽이 바뀌어도 재적용.

function measuredViewportH(): number {
  const vv = window.visualViewport;
  return Math.max(vv?.height ?? 0, window.innerHeight || 0, document.documentElement?.clientHeight ?? 0);
}

/**
 * 배너가 차지할 하단 예약 높이(CSS px) — 광고 슬롯 분리(정통 방식): 게임 캔버스 영역은
 * "뷰포트 − 배너"로 잡고 배너는 캔버스 **아래** 별도 슬롯에 둔다. 배너가 캔버스를 덮지 않으므로
 * 게임 쪽에서 UI 를 밀어올릴 필요가 구조적으로 사라진다(NO ADS 구매로 배너가 사라지면 0).
 */
function bannerReserve(sab: number): number {
  const banner = document.getElementById('ad-banner-container');
  if (!banner || window.getComputedStyle(banner).display === 'none') return 0;
  return BANNER_CONTENT_H + sab;
}

function applyViewportFix(): void {
  const h = Math.round(measuredViewportH());
  const sab = window.__safeArea?.bottom ?? 0;
  const reserve = bannerReserve(sab);
  /**
   * **픽셀 강제 vs CSS 앵커** — 어느 쪽을 쓸지 결정한다. 이게 하단 여백 문제의 핵심이다.
   *
   * `position:fixed; bottom:0` 은 브라우저가 계산한 뷰포트 바닥에 **정확히** 붙는다. 정상 환경
   * (모바일 사파리·안드로이드·데스크톱)에서는 이게 언제나 옳고, JS 로 잰 픽셀로 top 을 강제하면
   * 측정이 1px 이라도 짧을 때 그만큼 배너가 위로 뜨고 아래가 빈다 — 아이폰에서 검은 띠가 남던
   * 실제 원인이다(사용자 보고 2026-08-04).
   *
   * 픽셀 강제는 **레이아웃 뷰포트가 실제보다 짧게 보고되는 웹뷰**(토스 시트: 화면 932pt 인데
   * CSS 뷰포트 620pt)에서만 필요하다. 그 상황은 `측정값 > CSS 뷰포트` 로 명확히 식별된다 —
   * 이때만 픽셀로 덮어쓰고, 그 외에는 CSS 앵커에 맡긴다.
   */
  const cssViewportH = document.documentElement?.clientHeight ?? 0;
  const forcePixels = cssViewportH > 0 && h > cssViewportH + 1;
  const key = `${h}|${reserve}|${forcePixels ? 'px' : 'css'}`;
  if (!h || key === appliedViewportKey) return; // 변화 없으면 손대지 않는다.
  appliedViewportKey = key;
  const container = document.getElementById('game-container');
  const banner = document.getElementById('ad-banner-container');
  const noAds = document.getElementById('no-ads-btn');
  /**
   * **페이지 바깥 여백의 색** — 토스 웹뷰는 레이아웃 뷰포트를 실제 화면보다 짧게 보고한다
   * (아이폰 15 Pro Max 실측 2026-08-04: 화면 932pt 인데 페이지는 885pt 에서 끝나 47pt 가 남았다).
   * 그 영역은 문서 밖이라 `position:fixed` 요소로도 덮을 수 없다 — 배너를 `bottom:0` 으로
   * 늘려도 페이지 끝까지가 한계다.
   *
   * 다만 CSS 캔버스 배경 전파 규칙상 그 영역을 칠하는 건 **루트 요소의 배경**이다. index.html 이
   * `html,body{background:#000}` 이라 검은 띠로 보였다(사용자 보고: "아직 하단에 검은 여백").
   * 배너 슬롯이 있으면 배너와 같은 흰색으로 맞춰 이어 보이게 한다. 캔버스 영역은
   * `#game-container` 가 자체 배경(#000)을 갖고 있어 레터박스 톤은 그대로다.
   */
  const outsideFill = reserve > 0 ? '#ffffff' : '#000000';
  document.documentElement.style.background = outsideFill;
  document.body.style.background = outsideFill;
  // 캔버스 영역 = 뷰포트 − 배너 슬롯. 코어 designHeightRange 가 이 박스 비율로 캔버스 높이를
  // 산출하므로(부팅 시), 좌우·하단 레터박스 없이 캔버스가 이 영역을 꽉 채운다.
  if (container) {
    if (forcePixels) {
      container.style.top = '0px';
      container.style.bottom = 'auto';
      container.style.height = `${h - reserve}px`;
    } else {
      // CSS 앵커 — 위는 0, 아래는 배너 슬롯 높이만큼 띄운다. 높이는 브라우저가 계산한다.
      container.style.top = '0px';
      container.style.bottom = `${reserve}px`;
      container.style.height = 'auto';
    }
    // 배너 슬롯이 홈바 인셋(sab)을 이미 포함 — 슬롯이 있으면 컨테이너 자체 하단 패딩은 중복이라 제거.
    container.style.paddingBottom = reserve > 0 ? '0px' : '';
  }
  if (banner) {
    /**
     * 배너는 **위·아래를 동시에 앵커**한다 — 어느 한쪽 측정이 틀려도 검은 띠가 남지 않게.
     *
     *  · top(실측) — 레이아웃 뷰포트가 실제 화면보다 **짧게** 보고되는 웹뷰(토스 시트) 대비.
     *    `bottom:0` 만 쓰면 배너가 그 짧은 뷰포트 바닥(예 620/932)에 붙어 화면 중간에 뜬다.
     *  · bottom:0 — 반대로 실측이 실제보다 **짧을** 때 대비. top 만 쓰면 배너 밑변이 정확히
     *    `h` 에 놓여, 실제 화면이 그보다 길면 그 차이만큼 body(#000)가 드러난다
     *    (사용자 보고 2026-08-04, 아이폰: "하단 여백" — 이 경로가 원인).
     *  · minHeight — 위 둘이 동시에 잡히면 CSS 는 over-constrained 로 bottom 을 무시하므로,
     *    최소 높이(배너 슬롯)를 보장해 두면 두 경우 모두 안전하다:
     *      실측이 짧으면 → 높이가 실제 바닥까지 늘어나 흰 배경이 빈틈을 메운다.
     *      뷰포트가 짧으면 → minHeight 가 이겨 오늘과 동일하게 top 기준으로 놓인다.
     */
    banner.style.bottom = '0px';
    if (forcePixels) {
      banner.style.top = `${h - reserve}px`;
      banner.style.height = 'auto';
      banner.style.minHeight = `${BANNER_CONTENT_H + sab}px`;
    } else {
      // CSS 앵커 — bottom:0 하나로 뷰포트 바닥에 정확히 붙고, 높이는 설계값 그대로 고정한다.
      // top 을 주지 않는 게 핵심: 측정 오차가 개입할 여지를 아예 없앤다.
      banner.style.top = 'auto';
      banner.style.height = `${BANNER_CONTENT_H + sab}px`;
      banner.style.minHeight = '';
    }
    // ⚠️ 하단 인셋은 **높이와 같은 출처(sab)** 로 줘야 한다. index.html 은 padding-bottom 을
    // env(safe-area-inset-bottom) 으로 두는데, 토스 웹뷰에선 env() 가 0 이고 SDK 값(sab)만 34 라
    // 높이만 늘고 패딩은 0 이 되어 광고 콘텐츠가 홈바에 겹쳤다. 여기서 같이 덮어써 어긋남을 없앤다.
    banner.style.paddingBottom = `${sab}px`;
    /**
     * **레이아웃 뷰포트 아래로 흘러넘치는 흰색** — `position:fixed` 는 레이아웃 뷰포트가 한계라
     * `bottom:0` 으로도 그 아래(토스 웹뷰 실측: 아이폰 15 Pro Max 에서 47pt)를 덮을 수 없다.
     * box-shadow 는 **박스 크기를 바꾸지 않고** 바깥만 칠하므로, 광고가 렌더링되는 영역
     * (96px + sab)은 그대로 둔 채 아래쪽만 배너와 같은 흰색으로 연장한다.
     *
     * 그 구간이 웹뷰 안이면 흰색으로 이어져 검은 띠가 사라지고, 웹뷰 밖(네이티브 영역)이면
     * 클리핑돼 아무 일도 일어나지 않는다 — 어느 쪽이든 손해가 없는 보정이다.
     * (근본 해결은 웹뷰가 뷰포트 높이를 제대로 보고하는 것이며, 그건 페이지 쪽 권한 밖이다.)
     */
    banner.style.boxShadow = '0 240px 0 0 #ffffff';
  }
  if (noAds) {
    if (forcePixels) {
      noAds.style.bottom = 'auto';
      // index.html 의 --no-ads-bottom-clearance(130px) + 버튼 높이(64px)만큼 배너 위로.
      noAds.style.top = `${h - reserve - 130 - 64}px`;
    } else {
      // CSS 앵커 — 배너 슬롯 위로 clearance 만큼. 인라인 top 이 남아 있으면 지운다.
      noAds.style.top = 'auto';
      noAds.style.bottom = `${reserve + 130}px`;
    }
  }
  // 컨테이너 크기가 바뀌었으니 Phaser 캔버스도 다시 맞춘다(게임 부팅 전이면 다음 변화 때 잡힌다).
  requestAnimationFrame(() => {
    readSafeArea();
    gameRef?.scale.refresh();
  });
}

/** applyViewportFix 가 스케일 재계산에 쓸 게임 인스턴스 — 부팅 완료 후 채워진다. */
let gameRef: Phaser.Game | undefined;

applyViewportFix();
window.visualViewport?.addEventListener('resize', applyViewportFix);
window.addEventListener('resize', applyViewportFix);
window.addEventListener('orientationchange', applyViewportFix);
// 이벤트가 안 오는 웹뷰(토스 시트 확장 등) 폴백 — 값이 그대로면 위 가드가 즉시 반환해 비용 없음.
window.setInterval(applyViewportFix, 1000);

/** SDK 인셋 적용 + 배너/컨테이너 재배치(인셋이 바뀌면 배치 기준도 바뀐다). */
function applySdkInsets(v: { top: number; bottom: number; left: number; right: number }): void {
  window.__safeArea = { top: v.top, bottom: v.bottom, left: v.left, right: v.right };
  appliedViewportKey = ''; // 강제 재적용 — 같은 높이라도 인셋이 달라지면 배너 top 이 달라진다.
  applyViewportFix();
}

/**
 * 토스 SDK 세이프에어리어 초기화(공식 권장 경로). 토스 웹뷰 밖에서는 브릿지가 없어 예외가
 * 나거나 이상값이 오므로 통째로 방어한다 — 실패 시 env() 폴백이 그대로 동작한다.
 */
function initSafeAreaFromSdk(): void {
  try {
    const v = SafeAreaInsets.get();
    const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 200;
    if (!v || !ok(v.top) || !ok(v.bottom) || !ok(v.left) || !ok(v.right)) return;
    sdkSafeAreaActive = true;
    applySdkInsets(v);
    SafeAreaInsets.subscribe({ onEvent: (insets) => applySdkInsets(insets) });
  } catch {
    /* 토스 밖 — env() 폴백 유지 */
  }
}
initSafeAreaFromSdk();

/**
 * 뷰포트 진단 오버레이 — URL 에 `?vpdebug` 를 붙였을 때만 화면 좌상단에 실측값을 띄운다.
 * 아이폰 실기기에서만 재현되는 레이아웃 문제(배너가 화면 2/3 지점에 뜸)를 원격으로 확정하기
 * 위한 도구: 사용자가 사파리에서 이 화면을 캡처해 주면 어떤 API 가 잘못된 높이를 주는지 바로
 * 보인다. 파라미터가 없으면 아무 것도 하지 않는다(일반 사용자 무영향).
 */
function initViewportDebugOverlay(): void {
  try {
    if (!new URLSearchParams(location.search).has('vpdebug')) return;
    const el = document.createElement('pre');
    el.style.cssText =
      'position:fixed;top:0;left:0;z-index:9999;margin:0;padding:6px 8px;max-width:96vw;' +
      'background:rgba(0,0,0,0.75);color:#7CFC00;font:10px/1.5 monospace;white-space:pre-wrap;pointer-events:none;';
    document.body.appendChild(el);
    // CSS 단위 프로브 — 100dvh/svh/lvh 가 실제 몇 px 로 계산되는지 measure 용 보이지 않는 막대.
    const probe = (h: string): HTMLDivElement => {
      const d = document.createElement('div');
      d.style.cssText = `position:fixed;top:0;left:0;width:1px;height:${h};visibility:hidden;pointer-events:none;`;
      document.body.appendChild(d);
      return d;
    };
    const pv = probe('100vh');
    const pd = probe('100dvh');
    const ps = probe('100svh');
    const pl = probe('100lvh');
    const tick = (): void => {
      const vv = window.visualViewport;
      const cv = document.querySelector('canvas');
      const banner = document.getElementById('ad-banner-container');
      const rect = (e: Element | null): string => {
        if (!e) return '-';
        const r = e.getBoundingClientRect();
        return `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`;
      };
      el.textContent = [
        `inner ${window.innerWidth}x${window.innerHeight}  screen ${screen.width}x${screen.height}`,
        `vv ${vv ? `${Math.round(vv.width)}x${Math.round(vv.height)} scale${vv.scale} offY${Math.round(vv.offsetTop)}` : '-'}`,
        `docEl ${document.documentElement.clientWidth}x${document.documentElement.clientHeight}`,
        `vh ${Math.round(pv.getBoundingClientRect().height)} dvh ${Math.round(pd.getBoundingClientRect().height)} svh ${Math.round(ps.getBoundingClientRect().height)} lvh ${Math.round(pl.getBoundingClientRect().height)}`,
        `safeArea ${JSON.stringify(window.__safeArea)}`,
        // applied = "측정높이|배너슬롯|모드". 모드 css=CSS 앵커(정상) · px=픽셀 강제(뷰포트 오보고 웹뷰).
        `applied ${appliedViewportKey}`,
        `canvas ${rect(cv)}`,
        `banner ${rect(banner)}`,
        /**
         * **판정 한 줄** — 배너 밑변이 각 기준의 화면 바닥에서 몇 px 떠 있는지.
         *  · inner/docEl 이 0 이 아니면 → 페이지 안에서 배너가 덜 내려간 것(코드 문제, 고칠 수 있음).
         *  · 둘 다 0 인데도 눈으로 검은 띠가 보이면 → 웹뷰가 화면보다 짧은 것(페이지 밖, CSS 로 불가).
         */
        (() => {
          const bb = banner?.getBoundingClientRect();
          if (!bb) return 'GAP -';
          const g = (base: number): string => `${Math.round(base - bb.bottom)}`;
          return `GAP inner ${g(window.innerHeight)} / docEl ${g(document.documentElement.clientHeight)}` +
            ` / lvh ${g(Math.round(pl.getBoundingClientRect().height))}  (0 이면 정상)`;
        })(),
        `ua ${navigator.userAgent.slice(0, 72)}`,
      ].join(String.fromCharCode(10));
    };
    tick();
    window.setInterval(tick, 800);
  } catch {
    /* 진단 도구 실패가 게임을 막으면 안 된다 */
  }
}
initViewportDebugOverlay();

// 하단 배너 광고 + "광고 제거" 인앱결제(2,000원, 가격은 앱인토스 콘솔의 상품 등록 화면에서 설정).
// 이미 구매했으면 배너를 아예 붙이지 않는다. onRemoved 콜백으로 ads.ts/iap.ts 가 서로 몰라도
// 되게 main.ts 가 둘을 연결한다(순환 참조 방지).
const adsRemoved = isAdsRemoved();
initAdsAndBanner(adsRemoved);
void initNoAdsButton(() => removeBanner());

const gamePromise = createCasualGame(HomerunGame);

// 게임 부팅 완료 → applyViewportFix 의 스케일 재계산 대상 연결 + 현재 실측값으로 1회 재적용.
void gamePromise.then((game) => {
  gameRef = game;
  appliedViewportKey = ''; // 강제 재적용(부팅 중 뷰포트가 바뀌었을 수 있다).
  applyViewportFix();
});

// DEV 노브: 콘솔에서 판정 로직 점검 + 헤드리스 검증(씬 강제 진입)용.
if (import.meta.env?.DEV) {
  const g = globalThis as Record<string, unknown>;
  g.__resolveSwing = resolveSwing;
  g.__resolveTake = resolveTake;
  void gamePromise.then((game) => {
    g.__game = game;
  });
}
