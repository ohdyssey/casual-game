/**
 * hubButton — 모든 게임 공통 상단 메뉴바(코어 셸이 1회 설치).
 *
 * 제공된 디자인(최상단 `···` 메뉴 + `✕` 닫기) 기준. 게임 캔버스 위 DOM 오버레이(씬 독립) →
 *   **모든 화면(홈/플레이/종료)** 에서 항상 보인다. **화면 최상단 우측**에 배치(게임 UI 와 겹쳐도 우선 노출 —
 *   앞으로 각 게임이 상단 패딩을 확보할 예정).
 *
 *   · ✕ (닫기)   → 메인(허브) 화면으로 복귀. 팝업이면 창 닫기, 같은 오리진(운영 형제 배포)이면 ../hub/,
 *                  다른 오리진(dev: 게임 각자 포트)이면 ?portal= 의 허브 origin 으로.
 *   · ··· (메뉴) → 드롭다운: 공유하기 / 문의하기 / 내 게임 관리.
 *
 * ⚠️ 게임 실행/전환 로직은 건드리지 않는다 — 순수 DOM 오버레이.
 */

import { parseHubOrigin } from '../portal/protocol.js';

export interface HubButtonOptions {
  /** 같은 오리진(운영 형제 배포)일 때 허브 경로. 기본 '../hub/'. */
  hubPath?: string;
}

let installed = false;

/** 허브 dev 서버 포트(games/hub/vite.config: 5180). 게임 dev 서버를 단독으로 열었을 때 X 복귀 대상. */
const HUB_DEV_PORT = '5180';

/** 메인(허브)으로 복귀 — 게임 내 자체 '뒤로가기' 버튼도 재사용할 수 있게 export. */
export function goHub(hubPath = '../hub/'): void {
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
    window.location.href = `${hubOrigin}/`;
    return;
  }
  // dev 단독 실행: 게임은 각자 포트(예: 6209)라 형제 `../hub/` 경로가 없음(404) → 허브 dev 서버(5180)로 복귀.
  //   (운영/빌드에선 DEV=false → 같은 오리진 형제 배포 경로 hubPath(`../hub/`) 사용 — 기존 동작 불변.)
  if (import.meta.env?.DEV && typeof location !== 'undefined' && location.port && location.port !== HUB_DEV_PORT) {
    window.location.href = `${location.protocol}//${location.hostname}:${HUB_DEV_PORT}/`;
    return;
  }
  window.location.href = hubPath;
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
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
  '<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
const X_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">' +
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
    // 화면 최상단 가운데 배치(사용자 지시). 겹침 허용 — 앞으로 각 게임이 상단 패딩 확보 예정.
    wrap.style.cssText =
      'position:fixed;top:calc(env(safe-area-inset-top,0px) + 1px);left:50%;transform:translateX(-50%);' +
      "z-index:2147483000;display:flex;align-items:flex-start;gap:7px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif";

    const circle = (svg: string, label: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.style.cssText =
        'width:26px;height:26px;border-radius:50%;border:0;padding:0;cursor:pointer;' +
        'display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.72);background:rgba(70,74,84,0.3);' +
        'box-shadow:0 3px 10px rgba(0,0,0,0.14);-webkit-tap-highlight-color:transparent';
      b.innerHTML = svg;
      return b;
    };

    const menuBtn = circle(DOTS_SVG, '메뉴');
    const closeBtn = circle(X_SVG, '메인화면으로');

    // 드롭다운 메뉴(공유/문의/내 게임 관리).
    const menu = document.createElement('div');
    // ··· 버튼(좌측) 아래에 드롭다운. 가운데 배치라 좌측 정렬로 아래로 펼친다.
    menu.style.cssText =
      'position:absolute;top:32px;left:0;min-width:150px;background:#fff;border-radius:14px;' +
      'box-shadow:0 12px 30px rgba(0,0,0,0.28);overflow:hidden;display:none';

    let open = false;
    const hide = (): void => {
      open = false;
      menu.style.display = 'none';
    };
    const toggle = (): void => {
      open = !open;
      menu.style.display = open ? 'block' : 'none';
    };

    const items: Array<[string, () => void]> = [
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
  };

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
}
