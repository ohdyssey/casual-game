/**
 * install — PWA 설치 버튼 + iOS/인앱 브라우저 안내.
 *
 * 플랫폼별 설치 경로가 달라 분기한다(우선순위: 설치됨 → 인앱 → iOS Safari → 설치 프롬프트):
 *   · 이미 설치(standalone/fullscreen) → 버튼 숨김.
 *   · 인앱 브라우저(카카오톡·라인·인스타·페북 WebView 등) — **2026-09-01 재설계**(PO: "홈화면이 열리면
 *     외부 브라우저로 바로 열려야 한다" — 버튼 눌러 모달 열고 또 눌러 탈출하는 4단계 구조 반려):
 *     · 안드로이드 — **버튼 없이 즉시** 크롬으로 자동 탈출(안드로이드 인텐트, 앱 종류 무관 범용).
 *       카카오톡/라인 전용 딥링크는 특정 앱에서만 먹혀 범용성이 떨어져 폐기.
 *     · iOS — 애플 정책상 자동 탈출이 원천 불가능(플랫폼 한계, 소프트웨어로 못 없앤다) → **모달이
 *       아니라 하단 배너**로 안내(PO: "버튼아이콘으로만 표시하지 말고 배너로 표시").
 *   · iOS Safari(인앱 아님) → `beforeinstallprompt` 미지원 → 하단 배너에 '공유 → 홈 화면에 추가' 안내.
 *   · Android/데스크톱 Chromium → `beforeinstallprompt` 가로채 저장 → 배너/버튼 클릭 시 네이티브 설치 프롬프트.
 *
 * ⚠️ **배너는 하나만, 중복 없이**(PO 2026-09-01: "중복되지 않으면서도 강력어필") — 상단 아이콘
 *   버튼(`btn`)은 보조 진입점으로(설치 후엔 자동 숨김) 독립적으로 남기고, 실제 안내·설치 유도는
 *   전부 하단 배너 하나로 통일한다. 상황별로 모달을 따로 띄우던 것(구 `showInAppGuide`)은 폐기 —
 *   배너 하나가 그 내용을 전부 담는다.
 *
 * ⚠️ **배너는 게임(솔리테어 등)과 완전히 같은 컴포넌트**를 쓴다(PO 2026-09-02: "솔리테어에 배너가
 *   배치된 방식으로 배치") — 허브가 자체 `.a2hs` 스타일로 따로 그리던 걸 폐기하고 `@casual/core`
 *   `appLaunch.ts` 의 `showBanner()` 를 그대로 가져다 쓴다. 배치·스타일이 게임과 100% 동일해지고,
 *   구현이 하나로 합쳐져 "허브에서만 안 뜬다" 류의 별개 버그가 생길 여지도 없앤다.
 *
 * ⚠️ 하단 배너는 **설치 전까지 매 방문 다시 뜬다**(PO 2026-09-01: "설치되어 있지 않을 경우 계속 이
 *   배너를 배치하라"). 닫기는 이번 노출만 없앨 뿐 localStorage 로 기억하지 않는다 — 유일하게 사라지는
 *   조건은 실제 설치 관측(`markPlayPopInstalled`)이다. 이 기록은 게임 쪽(`@casual/core` appLaunch.ts)과
 *   **같은 키를 공유**해, 게임에서 먼저 설치를 관측했으면 허브도 다시 권유하지 않는다(반대도 마찬가지).
 */
import { markPlayPopInstalled, isPlayPopInstalled, showBanner, dismissBanner } from '@casual/core/systems/appLaunch';

/** beforeinstallprompt 이벤트(표준 DOM 타입에 없어 직접 정의). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** 감지된 인앱 브라우저 종류. */
type InApp = 'kakao' | 'line' | 'naver' | 'instagram' | 'facebook' | 'other';

/**
 * 홈 화면 설치형(주소창 없는 standalone)으로 실행 중인지 = 이미 설치됨.
 *
 * ⚠️ `display-mode: fullscreen` 은 게임(각 game-shell.ts)이 뒤로가기 방어용으로 첫 탭에 켜는 진짜
 *   Fullscreen API 와도 겹쳐 보인다(크로미움 특성) — 허브 자신은 그 API 를 쓰지 않지만, 판정 함수를
 *   appLaunch.ts 와 같은 기준으로 맞춰 둔다(`document.fullscreenElement` 가 있으면 설치가 아니라
 *   인페이지 Fullscreen API 로 판단).
 */
function isStandalone(): boolean {
  const fullscreenMode = window.matchMedia?.('(display-mode: fullscreen)').matches === true;
  const viaFullscreenApi = document.fullscreenElement != null;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (fullscreenMode && !viaFullscreenApi) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iOS(iPhone/iPad/iPod). iPadOS 13+ 는 Mac 으로 위장 → 터치 가능한 MacIntel 도 포함. */
function isIOS(): boolean {
  const ua = navigator.userAgent;
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** iOS 에서 Safari 인지(홈 화면 추가는 Safari 에서만 안정적). */
function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  return /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
}

/** 인앱 브라우저(외부앱 WebView) 감지 — null 이면 일반 브라우저. */
function inAppBrowser(): InApp | null {
  const ua = navigator.userAgent;
  if (/kakaotalk/i.test(ua)) return 'kakao';
  if (/\bline\//i.test(ua) || /line\/[\d.]/i.test(ua)) return 'line';
  if (/naver\(inapp|naver ?webview|whale/i.test(ua)) return 'naver';
  if (/instagram/i.test(ua)) return 'instagram';
  if (/fban|fbav|fb_iab|fbios/i.test(ua)) return 'facebook';
  // 안드로이드 일반 WebView(주소창 없는 인앱): UA 에 "; wv)" 포함. (설치형 PWA 는 위 standalone 에서 먼저 걸러짐)
  if (/;\s*wv\)/i.test(ua)) return 'other';
  return null;
}

/** iOS Safari 공유 아이콘(네모+위 화살표) — 안내에서 실제 버튼 모양을 보여준다. */
const IOS_SHARE_SVG =
  `<svg class="ios-share" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
  `<path d="M12 3v11"/><path d="M8 7l4-4 4 4"/>` +
  `<path d="M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1"/>` +
  `</svg>`;

/** iOS '홈 화면에 추가' 3스텝(모달 전용). */
const IOS_STEPS_HTML =
  `<ol class="ios-steps">` +
  `<li><span class="n">1</span><span>하단(또는 상단)의 공유 버튼 ${IOS_SHARE_SVG} 을 누르세요.</span></li>` +
  `<li><span class="n">2</span><span>메뉴에서 <b>‘홈 화면에 추가’</b> 를 선택하세요.</span></li>` +
  `<li><span class="n">3</span><span>오른쪽 위 <b>‘추가’</b> 를 누르면 설치 완료.</span></li>` +
  `</ol>`;

/** 전역 모달 오버레이 생성(모달 클래스 재사용). body 반환. */
function overlay(title: string): HTMLElement {
  document.querySelectorAll('.modal-layer').forEach((el) => el.remove());
  const layer = document.createElement('div');
  layer.className = 'modal-layer';
  layer.innerHTML =
    `<div class="modal-panel" role="dialog" aria-modal="true" aria-label="${title}">` +
    `<div class="modal-head"><h2>${title}</h2><button class="modal-close" aria-label="닫기">✕</button></div>` +
    `<div class="modal-body"></div>` +
    `</div>`;
  const close = (): void => layer.remove();
  layer.addEventListener('click', (e) => {
    if (e.target === layer) close();
  });
  layer.querySelector('.modal-close')!.addEventListener('click', close);
  document.body.appendChild(layer);
  return layer.querySelector<HTMLElement>('.modal-body')!;
}

/** iOS Safari '홈 화면에 추가' 안내 시트(설치 버튼 클릭용, 중앙 모달). */
function showIosGuide(): void {
  const safari = isIosSafari();
  const body = overlay('홈 화면에 추가');
  body.innerHTML =
    `<p class="modal-note">iOS 는 아래 순서로 직접 추가해요.</p>` +
    IOS_STEPS_HTML +
    (safari
      ? ''
      : `<p class="modal-note ios-note">⚠️ iOS 에서는 <b>Safari</b> 브라우저에서 열어야 홈 화면에 추가할 수 있어요.</p>`);
}

/** 설치 유도 배너(미설치, 인앱 아님) — CTA 는 상단 설치 버튼(`btn`)을 그대로 클릭시켜 플랫폼별
 *   분기(네이티브 설치 프롬프트 / iOS 안내)를 중복 구현하지 않고 재사용한다. */
function showInstallBanner(btn: HTMLElement): void {
  if (isPlayPopInstalled() || isStandalone()) return;
  showBanner({
    title: '📲 PlayPOP 앱으로 설치하고 더 빠르게!',
    message: '홈 화면에 추가하면 브라우저 화면 없이, 앱처럼 바로 실행돼요.',
    actionLabel: '홈 화면에 설치',
    onAction: () => btn.click(),
  });
}

/** 안드로이드(또는 안드로이드 계열 인앱 WebView)에서 기본 브라우저(크롬)로 즉시 탈출.
 *   특정 메신저 전용 딥링크가 아니라 **OS 인텐트**라 어떤 인앱 브라우저든 동일하게 통한다
 *   (게임 쪽 `@casual/core/systems/appLaunch.ts` 와 같은 방식 — 실기기 검증됨). */
function escapeToChromeAndroid(): void {
  const stripped = location.href.replace(/^https?:\/\//, '');
  location.href = `intent://${stripped}#Intent;scheme=https;package=com.android.chrome;end;`;
}

/** iOS 인앱 브라우저 — 자동 탈출이 안 되므로(애플 정책) 배너로 강하게 안내. */
function showIosInAppEscapeBanner(app: InApp, toast: (msg: string) => void): void {
  showBanner({
    title: '🚀 설치하려면 브라우저에서 열어주세요',
    message: `지금은 ${labelOf(app)} 인앱 브라우저라 앱 설치가 안 돼요. 우측 상단 ••• (또는 공유) 버튼을 눌러 "다른 브라우저로 열기"를 선택하면 PlayPOP 을 설치할 수 있어요.`,
    actionLabel: '🔗 링크 복사하기',
    onAction: () => {
      navigator.clipboard?.writeText(location.href).then(
        () => toast('링크를 복사했어요 · Safari에 붙여넣기 하세요'),
        () => window.prompt('아래 주소를 복사해 Safari 에 붙여넣으세요', location.href),
      );
    },
  });
}

function labelOf(app: InApp): string {
  return { kakao: '카카오톡', line: '라인', naver: '네이버', instagram: '인스타그램', facebook: '페이스북', other: '앱 내' }[app];
}

/**
 * 설치 버튼 마운트.
 *   btn   — 설치 버튼(기본 hidden). 설치 가능/안내 필요 시점에 노출한다.
 *   toast — 하단 안내 토스트.
 */
export function mountInstall(btn: HTMLElement, toast: (msg: string) => void, opts: { immediate?: boolean } = {}): void {
  // 이미 설치돼 standalone 으로 실행 중이면 버튼 자체가 필요 없다.
  if (isStandalone()) {
    btn.hidden = true;
    markPlayPopInstalled();
    return;
  }

  const app = inAppBrowser();
  const ios = isIOS();

  if (app) {
    if (!ios) {
      // 안드로이드 인앱 — 버튼 클릭을 기다리지 않고 **즉시** 크롬으로 탈출한다(PO 2026-09-01).
      showBanner({
        title: `${labelOf(app)} 브라우저에서 열림`,
        message: '더 나은 환경을 위해 크롬으로 이동합니다…',
        dismissible: false,
      });
      escapeToChromeAndroid();
      return; // 곧 페이지를 떠난다 — 아래 설치 플로우를 걸 필요 없음.
    }
    // iOS 인앱 — 자동 탈출이 안 되니 상단 아이콘 + 배너 둘 다로 안내(배너가 주된 안내).
    btn.hidden = false;
    showIosInAppEscapeBanner(app, toast);
    btn.addEventListener('click', () => showIosInAppEscapeBanner(app, toast));
    return;
  }

  let deferred: BeforeInstallPromptEvent | null = null;

  // iOS(인앱 아님)는 설치 이벤트가 없으므로 즉시 버튼 노출(클릭 시 안내).
  if (ios) btn.hidden = false;

  // 설치 전까지 매 방문 하단 배너로 안내(초기 렌더와 겹치지 않게 살짝 지연).
  //   ⚠️ `immediate`(게임의 "설치하러 가기" → `?install=1` 로 도착) 는 지연 없이 바로 띄운다 —
  //   그냥 두면 "허브로 이동만 하고 아무 일도 안 일어난다"로 보인다(사용자 신고 2026-09-01).
  window.setTimeout(() => showInstallBanner(btn), opts.immediate ? 0 : 1200);

  // ⚠️ 모바일 크롬은 앱 전환 후 복귀를 **bfcache 복원**으로 처리하는 경우가 흔하다 — 스크립트가
  //   다시 실행되지 않고 DOM 이 그대로 살아 돌아온다(배너를 닫았던 상태 그대로). 그래서 "닫은 뒤
  //   다시는 안 뜬다"는 신고가 실제로는 진짜 재방문이 아니라 같은 페이지 인스턴스의 복원이었을 수
  //   있다 — `pageshow` 의 `persisted` 로 이 경우를 잡아 다시 안내한다.
  window.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted && !isStandalone() && !isPlayPopInstalled()) {
      window.setTimeout(() => showInstallBanner(btn), 400);
    }
  });

  // Android/Chromium: 설치 가능 신호를 가로채 저장 + 버튼 노출.
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    btn.hidden = false;
  });

  // 설치 완료 → 버튼 숨김 + 안내 + 배너 제거 + 플랫폼 공용 플래그 기록(게임 쪽과 공유).
  window.addEventListener('appinstalled', () => {
    deferred = null;
    btn.hidden = true;
    markPlayPopInstalled();
    dismissBanner();
    toast('앱이 설치되었어요 🎉');
  });

  btn.addEventListener('click', async () => {
    if (deferred) {
      // 네이티브 설치 프롬프트(사용자 제스처 안에서 호출해야 함).
      await deferred.prompt();
      const choice = await deferred.userChoice;
      deferred = null; // 프롬프트는 1회용
      if (choice.outcome === 'accepted') btn.hidden = true;
      return;
    }
    if (ios) {
      showIosGuide();
      return;
    }
    // 그 외(설치 이벤트 미수신/미지원): 브라우저 메뉴 경로 안내.
    toast('브라우저 메뉴에서 “앱 설치”를 선택하세요.');
  });
}
