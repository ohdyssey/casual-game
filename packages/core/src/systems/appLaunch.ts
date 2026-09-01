/**
 * appLaunch.ts — **인앱 브라우저 탈출 + PWA 설치 유도**(전 게임·허브 공용, 2026-09-02).
 *
 * 카카오톡 등 메신저로 공유된 링크는 그 메신저 자체 인앱 브라우저(WebView)에서 열린다 —
 * PWA 설치·결제·일부 API가 제한되는 환경이라, 가능하면 진짜 브라우저(크롬/사파리)로 보낸다.
 * 진짜 브라우저에 있으면(또는 탈출한 뒤) PWA 설치를 유도한다.
 *
 * ⚠️ **플랫폼 한계를 있는 그대로 인정한다** — 안드로이드는 자동 탈출·설치 유도가 실제로 되지만,
 *   iOS 는 애플이 "인앱 브라우저 자동 탈출"·"PWA 설치 팝업"·"설치 여부 확인" API 를 아예 안 열어놨다.
 *   그래서 iOS 는 **안내 화면**(수동 조작 유도)이 최선이고, "설치된 적 있다"도 100% 감지가 아니라
 *   과거에 이 기기에서 standalone 실행을 한 번이라도 확인했던 **최선 추정**(localStorage 기록)이다.
 *   안드로이드의 "이미 설치됨 → 앱에서 열기"도 마찬가지로 **시도**이지 보장이 아니다(진짜 보장은
 *   Digital Asset Links 로 도메인을 검증한 TWA/네이티브 앱 링크가 필요 — 지금 범위 밖).
 *
 * 사용: 게임 부팅 시(`game-shell.ts`) `mountAppLaunchGuard()` 한 번 호출. Phaser 무관(DOM 전용)이라
 *   허브에서도 그대로 쓸 수 있다.
 */
import { COLORS, FONT } from '../tokens.js';

// ─────────────────────────── 감지 ───────────────────────────

export type InAppHost = 'kakaotalk' | 'naver' | 'instagram' | 'facebook' | 'line' | null;

/** 알려진 인앱 브라우저 User-Agent 서명. */
function detectInAppHost(): InAppHost {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/KAKAOTALK/i.test(ua)) return 'kakaotalk';
  if (/NAVER\(/i.test(ua)) return 'naver';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV/i.test(ua)) return 'facebook';
  if (/\bLine\//i.test(ua)) return 'line';
  return null;
}

function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * 지금 이 창이 설치된 PWA(홈 화면 앱)로 실행 중인가.
 *
 * ⚠️ **`display-mode: fullscreen` 을 곧이곧대로 믿지 않는다**(2026-09-01) — 이 코드베이스는 뒤로가기
 *   방어 목적으로 첫 탭에 진짜 Fullscreen API 를 켠다(`pwa.ts` `enableFullscreenOnFirstTap`). 크로미움은
 *   그 순간 `display-mode: fullscreen` 미디어쿼리도 함께 true 로 바꿔버려(PWA 로 설치됐을 때와 구분이
 *   안 됨) — "설치 안 배너가 한 번 뜬 뒤 다시는 안 뜬다" 신고의 정체였다: 탭 한 번으로 이 매체쿼리가
 *   true 가 됐고, 그걸 `markPlayPopInstalled()` 가 영구 기록해 버렸다. `document.fullscreenElement` 로
 *   "지금 이 페이지가 Fullscreen API 로 들어간 것"과 "PWA 로 설치돼 그렇게 실행 중인 것"을 가른다 —
 *   전자는 페이지 자신이 요청한 인페이지 API 상태라 `fullscreenElement` 가 채워지지만, 후자(진짜 설치된
 *   PWA)는 브라우저 크롬 자체의 표시 모드일 뿐이라 `fullscreenElement` 는 비어 있다.
 */
export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches === true;
  const fullscreenMode = window.matchMedia?.('(display-mode: fullscreen)')?.matches === true;
  const viaFullscreenApi = typeof document !== 'undefined' && document.fullscreenElement != null;
  return (
    standalone ||
    (fullscreenMode && !viaFullscreenApi) ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// ─────────────────────────── 안드로이드: 인앱 탈출 + 설치 상태 ───────────────────────────

/** 인앱 브라우저에서 크롬으로 강제 이동. 안드로이드에서만 유효(호출부가 분기). */
function escapeToChromeAndroid(): void {
  const stripped = location.href.replace(/^https?:\/\//, '');
  location.href = `intent://${stripped}#Intent;scheme=https;package=com.android.chrome;end;`;
}


// ─────────────────────────── 설치 대상 = 게임이 아니라 허브(PlayPOP) ───────────────────────────
//
// 게임마다 자기 manifest 가 따로 있으면(scope="./") `beforeinstallprompt` 를 그대로 썼을 때
// "게임"이 설치돼 버린다(2026-09-01 PO 지시: "솔리테어를 설치하지 말고 플레이팝을 설치하라").
//
// ⚠️ **2026-09-01 2차 수정** — 처음엔 이 이벤트를 그냥 preventDefault 로 삼키고 실제 설치는 전부
//   허브로 이동시켜 거기서 다시 누르게 했는데(games/hub/src/install.ts), PO 가 "게임 화면에서 눌렀는데
//   허브로 이동한 뒤 또 눌러야 한다 — 게임에서 바로 설치되게 하라"고 반려했다. 브라우저 설치 API 는
//   **이벤트를 잡은 그 페이지에서만** `.prompt()` 를 부를 수 있어(다른 페이지/오리진으로 넘겨줄 방법이
//   없다), 게임 페이지에서 진짜 "PlayPOP" 를 설치하려면 게임 페이지 자신이 **PlayPOP 매니페스트를
//   가리켜야** 한다. 그래서 부팅 시 `<link rel="manifest">` 를 허브의 매니페스트로 바꿔치기한다 —
//   그러면 크롬이 "이 페이지가 설치 가능한 앱"을 PlayPOP 으로 평가하고, 여기서 잡은
//   `beforeinstallprompt` 를 그대로 `.prompt()` 하면 **이 화면을 벗어나지 않고** PlayPOP 이 설치된다.
//   (iOS 는 애플이 프로그램적 설치 자체를 막아놔 이 방법이 안 통한다 — 허브로 보내 수동 안내를 받는
//   기존 경로가 iOS 의 사실상 최선이다.)
function captureInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // 브라우저 기본 미니 설치 배너를 억제 — 우리 배너/버튼으로만 유도.
    deferredPrompt = e as BeforeInstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    markPlayPopInstalled(); // 매니페스트를 허브 것으로 바꿔뒀으므로 이 이벤트는 진짜 PlayPOP 설치다.
  });
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let deferredPrompt: BeforeInstallPromptEvent | null = null;

/** 잡아 둔 설치 프롬프트가 있으면 **이 화면에서 바로** 띄운다(성공 시 true — 페이지 이동 불필요). */
async function promptInstallInPlace(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const p = deferredPrompt;
  deferredPrompt = null;
  void p.prompt();
  const { outcome } = await p.userChoice;
  if (outcome === 'accepted') markPlayPopInstalled();
  return true; // 프롬프트 자체는 띄웠다(사용자가 거절해도 "시도"는 성공).
}

/**
 * 이 페이지의 `<link rel="manifest">` 를 허브(PlayPOP)의 매니페스트로 바꿔 건다 — 그래야 브라우저가
 * **이 게임 화면 자체**를 "PlayPOP 설치 가능" 으로 평가해 `beforeinstallprompt` 를 여기서 준다.
 * 기존에 게임 자신의 매니페스트 링크가 있었으면 제거하고 하나만 남긴다(둘 다 있으면 결과가 불명확).
 */
function retargetManifestToHub(hubPath: string): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('link[rel="manifest"]').forEach((l) => l.remove());
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = `${hubPath}manifest.webmanifest`;
  document.head.appendChild(link);
}

/** 허브로 이동시키는 콜백 — `mountAppLaunchGuard({ goToHub })` 로 주입(게임마다 hubPath 가 다를 수 있음). iOS 등 직접 설치가 안 되는 경우의 폴백. */
let goToHubImpl: (() => void) | null = null;

// ─────────────────────────── 설치 여부 최선 추정(기억, 플랫폼 공통) ───────────────────────────

// ⚠️ **키 버전을 두 번 올렸다** — v1→v2(2026-09-01, Fullscreen API 가 display-mode:fullscreen 을
//   오염시켜 첫 탭만으로 "설치됨"으로 잘못 기록되던 버그), v2→v3(2026-09-02, `getInstalledRelatedApps()`
//   최선 추정이 오탐으로 마킹하던 버그 — 둘 다 아래 markPlayPopInstalled/isPlayPopInstalled 참고).
//   실제로 설치 안 한 기기에도 이미 '1'이 박혀 있으면 배너·메뉴가 영구히 사라진 채로 남는다
//   (실측: 상단 설치 아이콘은 뜨는데 하단 배너만 안 뜨는 형태로 재현 — Chrome 은 beforeinstallprompt
//   를 줬으니 "설치 안 됨"이 맞는데 우리 플래그만 어긋난 상태였다). 새 키로 갈아타 전부 초기화한다.
const LS_PLAYPOP_INSTALLED = 'casual:pwaInstalledSeen_v3';

/** PlayPOP(허브)이 설치됐다고 최선 추정으로 기록 — standalone 관측 또는 허브의 appinstalled 에서 호출. */
export function markPlayPopInstalled(): void {
  try {
    localStorage.setItem(LS_PLAYPOP_INSTALLED, '1');
  } catch {
    /* 저장 실패(프라이빗 모드 등) — 이번 세션만 반복 안내되는 정도로 넘어간다 */
  }
}

/** 이 기기에서 PlayPOP 설치가 관측된 적 있는가(최선 추정 — 보장 아님). */
export function isPlayPopInstalled(): boolean {
  try {
    return localStorage.getItem(LS_PLAYPOP_INSTALLED) === '1';
  } catch {
    return false;
  }
}

// ─────────────────────────── 배너(DOM, Phaser 무관) ───────────────────────────

const BANNER_ID = 'casual-app-launch-banner';

/** 지금 떠 있는 배너를 지운다(없으면 무시) — 예: 설치 완료 직후 정리용. */
export function dismissBanner(): void {
  if (typeof document !== 'undefined') document.getElementById(BANNER_ID)?.remove();
}
// ⚠️ 설치 안내 배너는 더 이상 "닫으면 며칠간 숨김"으로 억제하지 않는다(PO 2026-09-01: "설치되어 있지
//   않을 경우 계속 이 배너를 배치하라"). 닫기는 이번 화면 노출만 없애고, 다음 방문엔 다시 뜬다 —
//   실제로 사라지는 유일한 조건은 `isPlayPopInstalled()` 가 true 가 되는 것(허브에서 설치 완료).

export interface BannerOpts {
  readonly title: string;
  readonly message: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly dismissible?: boolean; // false 면 닫기 버튼 없음(인앱 탈출처럼 꼭 봐야 하는 안내).
}

/**
 * 화면 하단 고정 배너 — 전 게임·허브 공용(2026-09-02, 허브도 이 구현을 그대로 가져다 쓴다).
 * 이미 하나 떠 있으면 **교체**한다(예전엔 조용히 무시했는데, 인앱 탈출 안내 → 설치 유도로
 * 내용이 바뀌어야 하는 흐름에서 두 번째 호출이 무시돼 "안내가 안 뜬다"로 보일 수 있었다).
 */
export function showBanner(opts: BannerOpts): void {
  if (typeof document === 'undefined') return;
  document.getElementById(BANNER_ID)?.remove();

  const wrap = document.createElement('div');
  wrap.id = BANNER_ID;
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-label', opts.title);
  Object.assign(wrap.style, {
    position: 'fixed',
    left: '0', right: '0', bottom: '0',
    zIndex: '2147483645',
    padding: '14px 16px max(14px, env(safe-area-inset-bottom))',
    background: COLORS.hudCapsule,
    boxShadow: '0 -8px 24px rgba(10, 37, 64, 0.22)',
    fontFamily: FONT.family,
    color: COLORS.hudText,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  } as Partial<CSSStyleDeclaration>);

  const textRow = document.createElement('div');
  const title = document.createElement('div');
  title.textContent = opts.title;
  Object.assign(title.style, { fontSize: '16px', fontWeight: '700', marginBottom: '2px' } as Partial<CSSStyleDeclaration>);
  const msg = document.createElement('div');
  msg.textContent = opts.message;
  Object.assign(msg.style, { fontSize: '13px', lineHeight: '1.4', color: '#5A6B7B' } as Partial<CSSStyleDeclaration>);
  textRow.append(title, msg);

  const btnRow = document.createElement('div');
  Object.assign(btnRow.style, { display: 'flex', gap: '8px' } as Partial<CSSStyleDeclaration>);

  if (opts.actionLabel && opts.onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opts.actionLabel;
    Object.assign(btn.style, {
      flex: '1', minHeight: '44px', borderRadius: '10px', border: 'none',
      fontSize: '15px', fontWeight: '700', fontFamily: FONT.family, cursor: 'pointer',
      background: '#2C6BFF', color: '#FFFFFF',
    } as Partial<CSSStyleDeclaration>);
    btn.addEventListener('click', () => {
      opts.onAction?.();
    });
    btnRow.appendChild(btn);
  }

  if (opts.dismissible !== false) {
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '닫기';
    Object.assign(close.style, {
      minHeight: '44px', padding: '0 16px', borderRadius: '10px', border: '1px solid #D7DEE6',
      fontSize: '15px', fontWeight: '600', fontFamily: FONT.family, cursor: 'pointer',
      background: 'transparent', color: '#5A6B7B',
    } as Partial<CSSStyleDeclaration>);
    close.addEventListener('click', () => {
      wrap.remove();
    });
    btnRow.appendChild(close);
  }

  wrap.append(textRow, btnRow);
  document.body.appendChild(wrap);
}

// ─────────────────────────── 종합 진입점 ───────────────────────────

const IN_APP_LABEL: Record<Exclude<InAppHost, null>, string> = {
  kakaotalk: '카카오톡', naver: '네이버', instagram: '인스타그램', facebook: '페이스북', line: '라인',
};

export interface AppLaunchOptions {
  /** "설치하러 가기" 배너를 눌렀을 때 허브로 이동시키는 콜백(iOS 등 직접 설치가 안 될 때의 폴백). */
  goToHub?: () => void;
  /** 허브 상대 경로(기본 `../hub/`) — 이 페이지의 매니페스트를 허브 것으로 바꿔치기하는 데도 쓴다. */
  hubPath?: string;
}

/**
 * 게임 부팅 시 한 번 호출 — 상황 판단해서 최대 하나의 배너만 띄운다.
 * 우선순위: 인앱 브라우저 탈출(항상 안내, 닫기 없음) > 이미 설치됨 안내(가볍게, 닫기 있음) >
 *   PlayPOP(허브) 설치 유도(닫기 있음, 하지만 **설치 전까지는 매번 다시 뜬다** — PO 2026-09-01).
 */
export function mountAppLaunchGuard(opts: AppLaunchOptions = {}): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  goToHubImpl = opts.goToHub ?? null;
  retargetManifestToHub(opts.hubPath ?? '../hub/'); // 이 화면에서 바로 PlayPOP 를 설치할 수 있게.
  captureInstallPrompt();

  if (isRunningStandalone()) {
    markPlayPopInstalled(); // standalone 관측 = 설치 확정. 플랫폼 무관 기록.
    return;
  }

  const host = detectInAppHost();
  if (host) {
    if (isAndroid()) {
      // 안드로이드는 자동으로 크롬으로 보낸다 — 배너는 "지금 이동 중" 안내만 잠깐.
      showBanner({
        title: `${IN_APP_LABEL[host]} 브라우저에서 열림`,
        message: '더 나은 환경을 위해 크롬으로 이동합니다…',
        dismissible: false,
      });
      escapeToChromeAndroid();
      return;
    }
    if (isIOS()) {
      // iOS 는 자동 탈출이 안 된다 — 수동 안내만 가능(안 닫히게, 사용자가 직접 조작해야 하므로).
      showBanner({
        title: `${IN_APP_LABEL[host]} 브라우저에서 열림`,
        message: '우측 상단 ••• (또는 공유) 버튼을 눌러 "다른 브라우저로 열기"를 선택해주세요.',
        dismissible: true,
      });
      return;
    }
    return; // 데스크탑 등 — 인앱 탈출 개념 자체가 없음.
  }

  // 인앱 브라우저가 아니다 — 이제 설치 상태를 본다.
  showInstallNag();

  // ⚠️ 모바일 크롬은 앱 전환 후 복귀를 **bfcache 복원**으로 처리하는 경우가 흔하다 — 스크립트가
  //   다시 실행되지 않고 DOM 이 그대로 살아 돌아온다(배너를 닫았던 상태 그대로 남는다). 그래서
  //   "배너가 한 번 뜬 뒤 다시는 안 뜬다"는 신고가 실제로는 진짜 재방문이 아니라 같은 페이지
  //   인스턴스의 복원이었을 수 있다 — `pageshow` 의 `persisted` 로 이 경우를 잡아 다시 확인한다.
  window.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted && !isRunningStandalone()) showInstallNag();
  });
}

/** "설치하러 가기" 클릭 — 이 화면에서 바로 설치 프롬프트를 띄울 수 있으면 그걸로, 없으면(iOS 등) 허브로. */
async function handleInstallAction(): Promise<void> {
  const prompted = await promptInstallInPlace();
  if (!prompted) goToHubImpl?.();
}

/** 설치 안 됨 안내(닫기 있는 배너) — 이미 설치가 관측된 기기면 더는 권유하지 않는다. */
function showInstallNag(): void {
  if (isPlayPopInstalled()) return;

  if (isAndroid()) {
    // 이 화면 자체가 PlayPOP 매니페스트를 가리키도록 바꿔뒀으므로(retargetManifestToHub),
    //   `beforeinstallprompt` 를 잡았다면 페이지 이동 없이 여기서 바로 설치된다.
    // ⚠️ 예전엔 여기서 `getInstalledRelatedApps()` 로 "이미 설치됨"을 먼저 추정해 걸렀는데
    //   (`isInstalledAndroidBestEffort`), 이 API 는 신뢰도가 낮아(자체 문서에도 "최선 추정 —
    //   보장 아님"이라 적혀 있었다) 실제로는 설치 안 된 기기에서도 오탐으로 `markPlayPopInstalled()`
    //   가 불려 배너가 영구히 사라지는 사고가 두 번째로 재현됐다(2026-09-02, 상단 아이콘은 뜨는데
    //   배너만 안 뜸 — Chrome 자신은 beforeinstallprompt 를 줬으니 "설치 안 됨"이 맞는데 우리
    //   플래그만 어긋난 상태). 신뢰 못 할 신호로 미리 거르지 말고, 확실한 신호(appinstalled 이벤트·
    //   standalone 실행)만 믿는다 — 완전히 제거.
    showBanner({
      title: 'PlayPOP 앱으로 설치하고 더 빠르게 즐기세요',
      message: '홈 화면에 추가하면 브라우저 없이 바로 실행돼요.',
      actionLabel: '설치하기',
      onAction: () => { void handleInstallAction(); },
    });
    return;
  }

  if (isIOS()) {
    // iOS 는 애플이 프로그램적 설치를 막아놔 이 화면에서 직접은 안 된다 — 허브에서 수동 안내를 받는다.
    showBanner({
      title: 'PlayPOP 앱으로 설치하고 더 빠르게 즐기세요',
      message: '허브로 이동해 공유 버튼(⬆️) → "홈 화면에 추가"를 선택해주세요.',
      actionLabel: '설치하러 가기',
      onAction: () => { void handleInstallAction(); },
    });
  }
}

// ─────────────────────────── 설정 메뉴용 — "홈 화면에 추가" 항목 ───────────────────────────

/**
 * 설정 메뉴 등에 "홈 화면에 추가" 항목을 넣을지 — 이미 설치된 채로 실행 중이면 무의미하니 뺀다.
 * Phaser 무관이라 각 게임이 자기 UI(팝업 버튼 목록 등)에서 이 값만 보고 항목 표시 여부를 정한다.
 */
export function canOfferInstall(): boolean {
  return typeof window !== 'undefined' && !isRunningStandalone() && !isPlayPopInstalled();
}

/**
 * 설정 메뉴 등의 "홈 화면에 추가" 버튼 탭 핸들러에서 호출 — 이 화면에서 바로 설치 프롬프트를
 * 띄울 수 있으면 그걸로(페이지 이동 없음), 없으면(iOS 등) `mountAppLaunchGuard({ goToHub })` 로
 * 주입된 콜백을 따라 허브로 이동시킨다.
 */
export async function triggerInstallFlow(): Promise<'prompted' | 'redirected' | 'unavailable'> {
  if (await promptInstallInPlace()) return 'prompted';
  if (goToHubImpl) {
    goToHubImpl();
    return 'redirected';
  }
  return 'unavailable';
}
