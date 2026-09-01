/**
 * googleSignIn.ts — Google Identity Services 버튼(진짜 구글 공식 버튼, iframe)을 캔버스 위에 얹는다.
 *
 * `profilePopup.ts`의 이름 `<input>`과 같은 이유·같은 방식: 캔버스는 진짜 폼 컨트롤을 그릴 수
 * 없다(구글 버튼은 브랜딩 규정상 자체 iframe이어야 한다 — 커스텀으로 흉내내면 안 된다). 그래서
 * 캔버스의 화면상 사각형을 재서 게임 좌표를 CSS 좌표로 옮긴 `<div>`를 그 위에 겹치고, 구글 SDK가
 * 그 안에 자기 버튼을 그리게 한다.
 *
 * ⚠️ 이 게임에는 로그인 화면이 따로 없다 — 지금 붙는 자리는 `profilePopup.ts`(프로필 설정) 하나뿐.
 *   나중에 저작 노드가 생기면 그쪽으로 옮기는 게 정답이다(다른 코드 그리기 UI와 같은 원칙).
 */
import Phaser from 'phaser';
import { GOOGLE_CLIENT_ID, googleLogin, linkedEmail } from '../logic/serverSync.js';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: { client_id: string; callback: (resp: { credential: string }) => void }): void;
          renderButton(el: HTMLElement, opts: { theme: string; size: string; text: string; width: number }): void;
        };
      };
    };
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let gisLoad: Promise<void> | null = null;

/** GIS SDK 스크립트를 한 번만 로드한다(여러 팝업이 열려도 중복 로드 안 함). */
function ensureGisLoaded(): Promise<void> {
  if (gisLoad) return gisLoad;
  gisLoad = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('gis load failed')));
      return;
    }
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('gis load failed'));
    document.head.appendChild(s);
  });
  return gisLoad;
}

/** 게임 좌표(중심 x,y + 폭) → 캔버스 위에 겹치는 CSS 사각형. `profilePopup.ts` 방식과 동일. */
function gameRectToCss(scene: Phaser.Scene, gameX: number, gameY: number, gameW: number, gameH: number): { left: number; top: number; w: number; h: number } | null {
  const canvas = scene.game.canvas;
  const rect = canvas?.getBoundingClientRect();
  if (!rect || !(rect.width > 0)) return null;
  const k = rect.width / scene.scale.width;
  const cam = scene.cameras.main;
  return {
    left: rect.left + (gameX - cam.scrollX - gameW / 2) * k,
    top: rect.top + (gameY - cam.scrollY - gameH / 2) * k,
    w: gameW * k,
    h: gameH * k,
  };
}

export interface GoogleSignInMountOpts {
  readonly onLinked?: (email: string | undefined) => void;
  readonly onError?: () => void;
}

/** div 내용을 "연동됨" 정적 문구로 바꾼다 — 구글 버튼(iframe)을 지워 다시 못 누르게 한다. */
function showLinked(div: HTMLElement, email: string | undefined): void {
  div.replaceChildren();
  div.textContent = email ? `✓ Google 연동됨: ${email}` : '✓ Google 연동됨';
  div.style.cssText += 'display:flex;align-items:center;justify-content:center;color:#ffe066;font-size:14px;';
}

/**
 * 구글 로그인 버튼(또는 이미 연동됐으면 "OOO로 로그인됨" 문구)을 그 위치에 얹는다.
 * 반환값을 씬 종료·팝업 닫힘 시 반드시 `remove()`할 것(DOM 이 화면에 남지 않게).
 *
 * ⚠️ 로그인에 성공하면 버튼(iframe)을 **곧바로 "연동됨" 문구로 바꾼다** — 안 바꾸면 같은 팝업을
 *   닫지 않고 버튼을 또 눌러도 매번 로그인 성공 토스트가 뜨는데, 이걸 "로그인이 유지 안 되고 계속
 *   다시 로그인된다"로 오해하기 쉽다(실제 세션은 이미 저장돼 있었다 — 그저 버튼이 안 사라졌을 뿐).
 */
export function mountGoogleSignIn(scene: Phaser.Scene, gameX: number, gameY: number, opts: GoogleSignInMountOpts = {}): { remove: () => void } {
  const already = linkedEmail();
  const div = document.createElement('div');
  div.setAttribute('aria-label', '구글 로그인');
  const applyRect = (): void => {
    const r = gameRectToCss(scene, gameX, gameY, 320, 56);
    if (!r) return;
    div.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.w}px;height:${r.h}px;z-index:2147482000;`;
  };
  applyRect();
  document.body.appendChild(div);

  if (already) {
    showLinked(div, already);
    return { remove: () => div.remove() };
  }

  void ensureGisLoaded()
    .then(() => {
      window.google?.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resp) => {
          void googleLogin(resp.credential).then((r) => {
            if (r) {
              showLinked(div, r.email); // 성공하는 즉시 버튼을 치운다 — 재클릭으로 인한 혼란 방지.
              opts.onLinked?.(r.email);
            } else {
              opts.onError?.();
            }
          });
        },
      });
      window.google?.accounts.id.renderButton(div, { theme: 'outline', size: 'large', text: 'signin_with', width: 240 });
    })
    .catch(() => opts.onError?.());

  return { remove: () => div.remove() };
}
