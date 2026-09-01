/**
 * hubButton — 모든 게임 공통 상단 메뉴바(코어 셸이 1회 설치).
 *
 * 제공된 디자인(최상단 `···` 메뉴 + `✕` 닫기) 기준. 게임 캔버스 위 DOM 오버레이(씬 독립) →
 *   **모든 화면(홈/플레이/종료)** 에서 항상 보인다.
 *
 * 배치 기준 = **토스 미니앱 헤더**(사용자 지시, 2026-08-13):
 *   · 화면 **우측 상단**에 `···` → `✕` 순서로 나란히(닫기가 가장 오른쪽).
 *   · 여백은 **캔버스(게임 화면) 기준** 우측 20px / 상단 세이프에어리어 + 12px.
 *     ⚠️ 창 기준(`right:14px`)으로 두면 데스크톱 레터박스에서 캔버스 밖(창 끝)에 붙어
 *       여백이 없어 보인다(사용자 리포트) — 캔버스 사각형을 재서 그 안쪽에 놓는다.
 *   · 탭 타깃 34px 원형(기존 26px의 1.3배), 아이콘 20/17px, 반투명 회색 위 흰 아이콘.
 *
 *   · ✕ (닫기)   → 메인(허브) 화면으로 복귀. 팝업이면 창 닫기, 같은 오리진(운영 형제 배포)이면 ../hub/,
 *                  다른 오리진(dev: 게임 각자 포트)이면 ?portal= 의 허브 origin 으로.
 *   · ··· (메뉴) → 드롭다운: 홈 화면에 추가 / 공유하기 / 문의하기 / 내 게임 관리.
 *     ⚠️ **독립된 초록 아이콘 버튼으로 상단에 노출했었는데 PO 반려**(2026-09-02: "초록색 버튼으로
 *       표시하지 말고 공유하기에 표시하라") — "홈 화면에 추가"는 다시 이 드롭다운 안, 공유하기 위에만.
 *
 * ⚠️ 게임 실행/전환 로직은 건드리지 않는다 — 순수 DOM 오버레이.
 */

import { parseHubOrigin } from '../portal/protocol.js';
import { canOfferInstall, triggerInstallFlow } from './appLaunch.js';

export interface HubButtonOptions {
  /** 같은 오리진(운영 형제 배포)일 때 허브 경로. 기본 '../hub/'. */
  hubPath?: string;
}

let installed = false;

/** 허브 dev 서버 포트(games/hub/vite.config: 5180). 게임 dev 서버를 단독으로 열었을 때 X 복귀 대상. */
const HUB_DEV_PORT = '5180';

/**
 * 메인(허브)으로 복귀 — 게임 내 자체 '뒤로가기' 버튼도 재사용할 수 있게 export.
 * `installIntent` 를 주면 허브 쪽에 `?install=1` 을 붙여, 도착하자마자 설치 배너를 지연 없이
 * 띄우게 한다("설치하러 가기를 눌렀는데 허브로 이동만 하고 아무 일도 안 일어난다" 신고 대응).
 */
export function goHub(hubPath = '../hub/', installIntent = false): void {
  const suffix = installIntent ? '?install=1' : '';
  try {
    if (window.opener && !window.opener.closed) {
      window.close();
      return;
    }
  } catch {
    /* cross-origin opener 접근 차단 — 무시하고 이동 */
  }
  const hubOrigin = typeof location !== 'undefined' ? parseHubOrigin(location.search) : null;
  if (hubOrigin && hubOrigin !== location.origin) {
    window.location.href = `${hubOrigin}/${suffix}`;
    return;
  }
  // dev 단독 실행: 게임은 각자 포트(예: 6209)라 형제 `../hub/` 경로가 없음(404) → 허브 dev 서버(5180)로 복귀.
  //   (운영/빌드에선 DEV=false → 같은 오리진 형제 배포 경로 hubPath(`../hub/`) 사용 — 기존 동작 불변.)
  if (import.meta.env?.DEV && typeof location !== 'undefined' && location.port && location.port !== HUB_DEV_PORT) {
    window.location.href = `${location.protocol}//${location.hostname}:${HUB_DEV_PORT}/${suffix}`;
    return;
  }
  window.location.href = hubPath + suffix;
}

/** 최소 토스트(게임 공용 토스트가 없으므로 자체). */
function miniToast(message: string): void {
  const t = document.createElement('div');
  t.textContent = message;
  t.style.cssText =
    'position:fixed;left:50%;bottom:40px;transform:translateX(-50%);z-index:2147483001;' +
    'background:rgba(10,14,26,.92);color:#fff;padding:11px 20px;border-radius:12px;font-size:14px;' +
    "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4);max-width:80vw;text-align:center";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

/** 앱(플랫폼) 링크 공유 — Web Share, 없으면 클립보드 복사. */
function shareApp(): void {
  const url = typeof location !== 'undefined' ? `${location.origin}/` : '';
  const nav = navigator as Navigator & { share?: (d: { url?: string; title?: string }) => Promise<void> };
  if (nav.share) {
    nav.share({ title: 'PlayPOP', url }).catch(() => {
      /* 사용자 취소 — 무시 */
    });
    return;
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(
      () => miniToast('링크를 복사했어요'),
      () => window.prompt('링크를 복사하세요', url),
    );
    return;
  }
  window.prompt('링크를 복사하세요', url);
}

const DOTS_SVG =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
  '<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
const X_SVG =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">' +
  '<path d="M6 6l12 12M18 6 6 18"/></svg>';

/** 상단 메뉴바(···  ✕) 1회 설치(중복 무시). */
export function installHubButton(opts: HubButtonOptions = {}): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const hubPath = opts.hubPath ?? '../hub/';

  const mount = (): void => {
    if (document.getElementById('hub-topbar')) return;

    const wrap = document.createElement('div');
    wrap.id = 'hub-topbar';
    // 우측 상단 배치(토스 기준). 실제 좌표는 place() 가 **캔버스 사각형 기준**으로 잡는다.
    wrap.style.cssText =
      // 위 여백 12 → 0(사용자 지시 2026-08-24: "닫기 버튼 위쪽 여백을 아주 없애고 붙여라") — 노치 인셋만 남긴다.
      'position:fixed;top:env(safe-area-inset-top,0px);right:20px;' +
      "z-index:2147483000;display:flex;align-items:center;gap:9px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif";

    const circle = (svg: string, label: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', label);
      // 크기 1.3배(26 → 34px) + 불투명도 상향(아이콘 0.72 → 0.9 / 배경 0.3 → 0.44) — 사용자 지시.
      b.style.cssText =
        'width:34px;height:34px;border-radius:50%;border:0;padding:0;cursor:pointer;' +
        'display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.9);background:rgba(70,74,84,0.44);' +
        'box-shadow:0 3px 10px rgba(0,0,0,0.18);-webkit-tap-highlight-color:transparent';
      b.innerHTML = svg;
      return b;
    };

    const menuBtn = circle(DOTS_SVG, '메뉴');
    const closeBtn = circle(X_SVG, '메인화면으로');

    // 드롭다운 메뉴(공유/문의/내 게임 관리).
    const menu = document.createElement('div');
    // 우측 상단 바 아래로 펼친다 — **바의 오른쪽 끝에 맞춰 왼쪽으로** 열려야 화면을 벗어나지 않는다.
    //   ⚠️ 좌측 정렬(left:0)이면 바가 우측에 있을 때 메뉴가 캔버스 밖으로 삐져나온다(사용자 리포트).
    menu.style.cssText =
      'position:absolute;top:42px;right:0;min-width:150px;background:#fff;border-radius:14px;' +
      'box-shadow:0 12px 30px rgba(0,0,0,0.28);overflow:hidden;display:none';

    let open = false;
    const hide = (): void => {
      open = false;
      menu.style.display = 'none';
    };
    const toggle = (): void => {
      open = !open;
      menu.style.display = open ? 'block' : 'none';
      if (open) clampMenu();
    };

    /** 메뉴가 캔버스(게임 화면) 안쪽에 머물도록 좌우를 보정한다. */
    const clampMenu = (): void => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      const c = canvas.getBoundingClientRect();
      menu.style.right = '0px';
      menu.style.left = 'auto';
      const m = menu.getBoundingClientRect();
      const inset = 8;
      if (m.right > c.right - inset) menu.style.right = `${Math.round(m.right - (c.right - inset))}px`;
      const m2 = menu.getBoundingClientRect();
      if (m2.left < c.left + inset) {
        menu.style.right = 'auto';
        menu.style.left = `${Math.round(c.left + inset - wrap.getBoundingClientRect().left)}px`;
      }
    };

    // "홈 화면에 추가" — 목록 맨 위(사용자 지시 2026-09-02). 이미 설치된 채로(standalone) 실행
    //   중이면 무의미하니 canOfferInstall() 로 뺀다. `···` 를 여는 것 자체가 사용자 제스처라
    //   triggerInstallFlow 내부의 안드로이드 정식 설치창 호출도 그대로 통과한다.
    const items: Array<[string, () => void]> = [
      ...(canOfferInstall() ? ([['📲 홈 화면에 추가', () => { hide(); void triggerInstallFlow(); }]] as Array<[string, () => void]>) : []),
      ['공유하기', () => { hide(); shareApp(); }],
      ['문의하기', () => { hide(); miniToast('문의는 준비 중이에요'); }],
      ['내 게임 관리', () => { hide(); goHub(hubPath); }],
    ];
    items.forEach(([label, fn], i) => {
      const it = document.createElement('button');
      it.type = 'button';
      it.textContent = label;
      it.style.cssText =
        'display:block;width:100%;text-align:center;background:none;border:0;cursor:pointer;' +
        'padding:15px 18px;font-size:16px;color:#333;font-family:inherit' +
        (i > 0 ? ';border-top:1px solid #eef0f3' : '');
      it.addEventListener('click', fn);
      menu.appendChild(it);
    });

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });
    closeBtn.addEventListener('click', () => goHub(hubPath));
    document.addEventListener('click', (e) => {
      if (open && !wrap.contains(e.target as Node)) hide();
    });

    wrap.appendChild(menuBtn);
    wrap.appendChild(closeBtn);
    wrap.appendChild(menu);
    document.body.appendChild(wrap);

    /**
     * 캔버스 기준 배치 — 게임 화면(캔버스)의 우측 상단 안쪽에 여백을 두고 놓는다.
     * 캔버스를 못 찾으면 창 기준 CSS(right/top)를 그대로 쓴다.
     */
    const place = (): void => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) return;
      const inset = 20;
      const safeTop = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0;
      wrap.style.right = 'auto';
      wrap.style.left = `${Math.round(r.right - wrap.offsetWidth - inset)}px`;
      wrap.style.top = `${Math.round(r.top + safeTop)}px`; // 위 여백 0 — 화면(캔버스) 상단에 붙인다.
    };
    place();
    // 캔버스 크기는 스케일 매니저가 리사이즈·회전 때 바꾼다 → 그때마다 다시 잡는다.
    window.addEventListener('resize', place);
    window.addEventListener('orientationchange', place);
    setTimeout(place, 0);
    setTimeout(place, 400); // 첫 레이아웃 직후 캔버스가 커지는 경우 보정
  };

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
}
