/**
 * install — PWA 설치 버튼 + iOS/인앱 브라우저 안내.
 *
 * 플랫폼별 설치 경로가 달라 분기한다(우선순위: 설치됨 → 인앱 → iOS Safari → 설치 프롬프트):
 *   · 이미 설치(standalone/fullscreen) → 버튼 숨김.
 *   · 인앱 브라우저(카카오톡·라인·인스타·페북 WebView 등) → PWA 설치 불가 → 버튼 클릭 시
 *     '외부 브라우저(Safari/Chrome)로 열기' 안내. 카카오톡/라인은 외부 열기 딥링크 실행,
 *     그 외는 수동 안내 + 링크 복사.
 *   · iOS Safari → `beforeinstallprompt` 미지원 → '공유 → 홈 화면에 추가' 안내 시트.
 *   · Android/데스크톱 Chromium → `beforeinstallprompt` 가로채 저장 → 클릭 시 네이티브 설치 프롬프트.
 *
 * 스타일은 index.html 의 전역 모달 클래스(.modal-layer/.modal-panel …)를 재사용한다.
 */

/** beforeinstallprompt 이벤트(표준 DOM 타입에 없어 직접 정의). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** 감지된 인앱 브라우저 종류. */
type InApp = 'kakao' | 'line' | 'naver' | 'instagram' | 'facebook' | 'other';

/** 홈 화면 설치형(주소창 없는 standalone)으로 실행 중인지 = 이미 설치됨. */
function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
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

/** 아래 방향 화살표(아이폰 하단 공유 버튼을 가리키는 힌트). */
const DOWN_ARROW_SVG =
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
  `<path d="M12 4v15"/><path d="M6 13l6 6 6-6"/></svg>`;

/** iOS '홈 화면에 추가' 3스텝(모달·자동 배너 공용). */
const IOS_STEPS_HTML =
  `<ol class="ios-steps">` +
  `<li><span class="n">1</span><span>하단(또는 상단)의 공유 버튼 ${IOS_SHARE_SVG} 을 누르세요.</span></li>` +
  `<li><span class="n">2</span><span>메뉴에서 <b>‘홈 화면에 추가’</b> 를 선택하세요.</span></li>` +
  `<li><span class="n">3</span><span>오른쪽 위 <b>‘추가’</b> 를 누르면 설치 완료.</span></li>` +
  `</ol>`;

/** 자동 안내 노출 기록 키(1회만). */
const A2HS_KEY = 'playpop_a2hs_v1';

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

/**
 * iOS Safari 첫 방문 자동 안내 — 하단 슬라이드업 배너(비차단, 1회).
 *   iOS 는 설치를 코드로 트리거할 수 없어(공유→홈화면추가 수동), 사용자가 버튼을 찾지 않아도 되게
 *   방법을 자동으로 안내한다. 닫거나 1회 노출하면 localStorage 로 기억해 재노출하지 않는다.
 */
function autoShowIosBanner(): void {
  // 이미 설치됐거나(이론상 여기 안 옴) 이전에 봤으면 표시 안 함.
  try {
    if (localStorage.getItem(A2HS_KEY)) return;
  } catch {
    /* 프라이빗 모드 등 — 그냥 진행 */
  }
  if (document.querySelector('.a2hs')) return;

  const iphone = /iphone|ipod/i.test(navigator.userAgent); // 아이폰만 하단 공유버튼 방향 화살표
  const el = document.createElement('div');
  el.className = 'a2hs';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', '홈 화면에 추가');
  el.innerHTML =
    `<div class="a2hs-head"><h3>홈 화면에 추가</h3><button class="a2hs-close" type="button" aria-label="닫기">✕</button></div>` +
    `<p class="sub">Safari 공유 버튼을 눌러 홈 화면에 추가하면 전체화면 앱으로 실행돼요.</p>` +
    IOS_STEPS_HTML +
    (iphone ? `<div class="a2hs-arrow" aria-hidden="true">${DOWN_ARROW_SVG}</div>` : '');

  const remember = (): void => {
    try {
      localStorage.setItem(A2HS_KEY, '1');
    } catch {
      /* 무시 */
    }
  };
  const dismiss = (): void => {
    el.classList.remove('show');
    window.setTimeout(() => el.remove(), 400);
  };
  el.querySelector('.a2hs-close')!.addEventListener('click', dismiss);
  document.body.appendChild(el);
  // 노출 즉시 기록(정확히 1회) + 슬라이드업.
  remember();
  requestAnimationFrame(() => el.classList.add('show'));
}

/** 카카오톡/라인 외부 브라우저 열기 딥링크 실행. 성공 시 true. */
function openExternalBrowser(app: InApp): boolean {
  const url = window.location.href;
  if (app === 'kakao') {
    // 카카오톡 인앱 → 기기 기본 브라우저로 열고 인앱 닫힘(iOS·Android 공통).
    window.location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url);
    return true;
  }
  if (app === 'line') {
    // 라인: URL 에 openExternalBrowser=1 을 붙여 다시 열면 외부 브라우저로 전환.
    const sep = url.includes('?') ? '&' : '?';
    window.location.href = url + sep + 'openExternalBrowser=1';
    return true;
  }
  return false;
}

/** 인앱 브라우저용 '외부 브라우저로 열기' 안내 시트. */
function showInAppGuide(app: InApp, toast: (msg: string) => void): void {
  const body = overlay('브라우저에서 열어주세요');
  const canDeepLink = app === 'kakao' || app === 'line';
  body.innerHTML =
    `<p class="modal-note">지금은 <b>${labelOf(app)} 인앱 브라우저</b>예요.<br>` +
    `여기서는 앱 설치가 안 돼요 — <b>Safari · Chrome</b> 같은 기본 브라우저에서 열어야 설치할 수 있어요.</p>`;

  if (canDeepLink) {
    const cta = document.createElement('button');
    cta.className = 'modal-cta';
    cta.type = 'button';
    cta.textContent = '🌐 외부 브라우저로 열기';
    cta.addEventListener('click', () => openExternalBrowser(app));
    body.appendChild(cta);
    const hint = document.createElement('p');
    hint.className = 'modal-note ios-note';
    hint.innerHTML = '열리지 않으면 우측 상단 <b>⋯ 메뉴 → ‘다른 브라우저로 열기’</b> 를 눌러주세요.';
    body.appendChild(hint);
  } else {
    const steps = document.createElement('ol');
    steps.className = 'ios-steps';
    steps.innerHTML =
      `<li><span class="n">1</span><span>우측 상단(또는 하단) <b>⋯ 메뉴</b> 를 누르세요.</span></li>` +
      `<li><span class="n">2</span><span><b>‘다른 브라우저로 열기’ / ‘Safari로 열기’ / ‘Chrome으로 열기’</b> 를 선택하세요.</span></li>`;
    body.appendChild(steps);
    const copy = document.createElement('button');
    copy.className = 'modal-cta';
    copy.type = 'button';
    copy.textContent = '🔗 링크 복사';
    copy.addEventListener('click', async () => {
      const url = window.location.href;
      try {
        await navigator.clipboard.writeText(url);
        toast('링크를 복사했어요 · 브라우저에 붙여넣기 하세요');
      } catch {
        window.prompt('아래 주소를 복사해 브라우저에 붙여넣으세요', url);
      }
    });
    body.appendChild(copy);
  }
}

function labelOf(app: InApp): string {
  return { kakao: '카카오톡', line: '라인', naver: '네이버', instagram: '인스타그램', facebook: '페이스북', other: '앱 내' }[app];
}

/**
 * 설치 버튼 마운트.
 *   btn   — 설치 버튼(기본 hidden). 설치 가능/안내 필요 시점에 노출한다.
 *   toast — 하단 안내 토스트.
 */
export function mountInstall(btn: HTMLElement, toast: (msg: string) => void): void {
  // 이미 설치돼 standalone 으로 실행 중이면 버튼 자체가 필요 없다.
  if (isStandalone()) {
    btn.hidden = true;
    return;
  }

  let deferred: BeforeInstallPromptEvent | null = null;
  const app = inAppBrowser();
  const ios = isIOS();

  // 인앱 브라우저·iOS 는 설치 이벤트가 없으므로 즉시 버튼 노출(클릭 시 각자 안내).
  if (app || ios) btn.hidden = false;

  // 자동 안내: iOS Safari(인앱 아님·미설치)에서 첫 방문 1회 하단 배너로 설치법을 띄운다.
  //   (초기 렌더와 겹치지 않게 살짝 지연.)
  if (ios && !app && isIosSafari()) {
    window.setTimeout(autoShowIosBanner, 1200);
  }

  // Android/Chromium: 설치 가능 신호를 가로채 저장 + 버튼 노출.
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    btn.hidden = false;
  });

  // 설치 완료 → 버튼 숨김 + 안내.
  window.addEventListener('appinstalled', () => {
    deferred = null;
    btn.hidden = true;
    toast('앱이 설치되었어요 🎉');
  });

  btn.addEventListener('click', async () => {
    // 인앱 브라우저 최우선 — 여기선 설치 불가라 외부 브라우저로 유도.
    if (app) {
      showInAppGuide(app, toast);
      return;
    }
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
