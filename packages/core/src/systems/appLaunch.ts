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

/** 지금 이 창이 설치된 PWA(홈 화면 앱)로 실행 중인가. */
export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    window.matchMedia?.('(display-mode: fullscreen)')?.matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// ─────────────────────────── 안드로이드: 인앱 탈출 + 설치 상태 ───────────────────────────

/** 인앱 브라우저에서 크롬으로 강제 이동. 안드로이드에서만 유효(호출부가 분기). */
function escapeToChromeAndroid(): void {
  const stripped = location.href.replace(/^https?:\/\//, '');
  location.href = `intent://${stripped}#Intent;scheme=https;package=com.android.chrome;end;`;
}

/** `getInstalledRelatedApps` 기반 최선 추정(신뢰도 낮음, 크롬 버전·매니페스트 설정에 따라 다름). */
async function isInstalledAndroidBestEffort(): Promise<boolean> {
  try {
    const nav = navigator as unknown as { getInstalledRelatedApps?: () => Promise<unknown[]> };
    if (!nav.getInstalledRelatedApps) return false;
    const apps = await nav.getInstalledRelatedApps();
    return apps.length > 0;
  } catch {
    return false;
  }
}

// ─────────────────────────── 설치 대상 = 게임이 아니라 허브(PlayPOP) ───────────────────────────
//
// 게임마다 자기 manifest 가 따로 있어(scope="./") `beforeinstallprompt` 를 그대로 쓰면
// "게임"이 설치돼 버린다(2026-09-01 PO 지시: "솔리테어를 설치하지 말고 플레이팝을 설치하라").
// 그래서 게임 쪽은 이 이벤트를 preventDefault 로 **삼키기만**(브라우저 기본 설치 배너 억제) 하고,
// 실제 "설치하기" 동작은 전부 허브로 이동시켜 허브 자신의 설치 플로우(games/hub/src/install.ts)에
// 맡긴다 — 허브가 PlayPOP 이라는 이름으로 설치 가능한 진짜 대상이다.

function captureInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // 게임 자체를 설치하라는 브라우저 기본 배너를 띄우지 않는다.
  });
}

/** 허브로 이동시키는 콜백 — `mountAppLaunchGuard({ goToHub })` 로 주입(게임마다 hubPath 가 다를 수 있음). */
let goToHubImpl: (() => void) | null = null;

// ─────────────────────────── 설치 여부 최선 추정(기억, 플랫폼 공통) ───────────────────────────

const LS_PLAYPOP_INSTALLED = 'casual:pwaInstalledSeen';

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
// ⚠️ 설치 안내 배너는 더 이상 "닫으면 며칠간 숨김"으로 억제하지 않는다(PO 2026-09-01: "설치되어 있지
//   않을 경우 계속 이 배너를 배치하라"). 닫기는 이번 화면 노출만 없애고, 다음 방문엔 다시 뜬다 —
//   실제로 사라지는 유일한 조건은 `isPlayPopInstalled()` 가 true 가 되는 것(허브에서 설치 완료).

interface BannerOpts {
  readonly title: string;
  readonly message: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly dismissible?: boolean; // false 면 닫기 버튼 없음(인앱 탈출처럼 꼭 봐야 하는 안내).
}

function showBanner(opts: BannerOpts): void {
  if (typeof document === 'undefined' || document.getElementById(BANNER_ID)) return;

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
  /** "설치하러 가기" 배너를 눌렀을 때 허브로 이동시키는 콜백(게임마다 hubPath 가 다를 수 있어 주입). */
  goToHub?: () => void;
}

/**
 * 게임 부팅 시 한 번 호출 — 상황 판단해서 최대 하나의 배너만 띄운다.
 * 우선순위: 인앱 브라우저 탈출(항상 안내, 닫기 없음) > 이미 설치됨 안내(가볍게, 닫기 있음) >
 *   PlayPOP(허브) 설치 유도(닫기 있음, 하지만 **설치 전까지는 매번 다시 뜬다** — PO 2026-09-01).
 */
export function mountAppLaunchGuard(opts: AppLaunchOptions = {}): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  goToHubImpl = opts.goToHub ?? null;
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

  // 인앱 브라우저가 아니다 — 이제 설치 상태를 본다. 이미 설치가 관측된 기기면 더는 권유하지 않는다.
  if (isPlayPopInstalled()) return;

  if (isAndroid()) {
    void isInstalledAndroidBestEffort().then((installed) => {
      if (installed) {
        markPlayPopInstalled();
        return;
      }
      // 설치 안 됨 — 실제 설치는 게임이 아니라 허브(PlayPOP)에서 이뤄진다.
      showBanner({
        title: 'PlayPOP 앱으로 설치하고 더 빠르게 즐기세요',
        message: '허브에서 홈 화면에 추가하면 브라우저 없이 바로 실행돼요.',
        actionLabel: '설치하러 가기',
        onAction: () => goToHubImpl?.(),
      });
    });
    return;
  }

  if (isIOS()) {
    showBanner({
      title: 'PlayPOP 앱으로 설치하고 더 빠르게 즐기세요',
      message: '허브로 이동해 공유 버튼(⬆️) → "홈 화면에 추가"를 선택해주세요.',
      actionLabel: '설치하러 가기',
      onAction: () => goToHubImpl?.(),
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
 * 설정 메뉴 등의 "홈 화면에 추가" 버튼 탭 핸들러에서 호출 — 실제 설치는 게임이 아니라
 * 허브(PlayPOP)에서 이뤄지므로, 여기서는 `mountAppLaunchGuard({ goToHub })` 로 주입된
 * 콜백을 따라 허브로 이동시킬 뿐이다.
 */
export async function triggerInstallFlow(): Promise<'redirected' | 'unavailable'> {
  if (goToHubImpl) {
    goToHubImpl();
    return 'redirected';
  }
  return 'unavailable';
}
