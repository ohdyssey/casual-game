/**
 * PWA 부트스트랩 — 서비스워커 등록 + 풀스크린 진입.
 *
 *  - registerSW(): vite-plugin-pwa 가 생성한 SW 를 등록 (autoUpdate — 자동 갱신). 오프라인 실행/설치 지원.
 *  - enableFullscreenOnFirstTap(): 브라우저(미설치) 실행 시 첫 사용자 탭에서 Fullscreen API 호출.
 *    설치형 PWA(display:fullscreen/standalone)는 이미 풀스크린이라 건너뜀.
 *    iOS Safari 는 요소 Fullscreen API 미지원 → 홈 화면 추가(standalone)로 풀스크린 처리.
 */
import { registerSW } from 'virtual:pwa-register';

/**
 * 서비스워커 등록 (프로덕션) / 잔존 SW 제거 (개발).
 *
 *  ⚠️ 개발 모드 주의:
 *    같은 origin(예: localhost:5175)에서 한 번이라도 `vite preview`(프로덕션 빌드)를 띄우면
 *    프로덕션 서비스워커가 등록된 채 남아, 이후 dev 서버의 최신 코드를 가로채고
 *    옛 precache(구 index.html + 구 JS 번들)를 서빙한다. HTTP 캐시가 아니라 SW fetch 핸들러라
 *    새로고침/캐시 비활성화로도 풀리지 않아 "계속 구버전이 뜨는" 증상이 된다.
 *    → dev 진입 시마다 잔존 SW + 캐시를 강제 제거해 재발을 차단한다.
 */
export function setupServiceWorker() {
  if (import.meta.env.DEV) {
    purgeStaleServiceWorkers();
    return;
  }
  // 'autoUpdate' — 새 버전 감지 시 자동 적용(리로드). defer(prompt+no-reload)는 사용자 기기가
  //   업데이트를 못 받아(구버전 캐시 고착) 수정이 반영 안 되는 문제 → autoUpdate 로 복귀(안정적 갱신).
  //   리로드 구간은 부트 스플래시(index.html .loading)가 덮어 청색 노출 없음([loading-screen-structure]).
  registerSW({ immediate: true });
}

/** 개발 모드: 등록된 모든 서비스워커 해제 + 캐시 삭제. SW 가 있었으면 1회 새로고침. */
async function purgeStaleServiceWorkers() {
  try {
    if (!('serviceWorker' in navigator)) return;
    const regs = await navigator.serviceWorker.getRegistrations();
    if (regs.length === 0) return;                 // 깨끗함 — 아무것도 안 함.
    await Promise.all(regs.map((r) => r.unregister()));
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    // 현재 페이지는 아직 옛 SW 가 서빙한 코드라 새로고침해야 dev 최신 코드가 로드된다.
    console.warn('[pwa] 개발 모드: 잔존 서비스워커/캐시를 제거했습니다. 새로고침합니다.');
    window.location.reload();
  } catch (_) { /* no-op */ }
}

/** 설치형 PWA 로 실행 중인지 (브라우저 탭과 구분). */
function isStandalone() {
  return (
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

/**
 * 모바일/터치 디바이스 판정 — PC 브라우저 강제 풀스크린 방지.
 *   사용자 보고: PC 에서 게임플레이 시작하면 무조건 풀스크린 전환되는 문제.
 *
 *  - hover 없음 + coarse pointer: 모바일/터치 디바이스의 표준 특성
 *  - userAgentData.mobile: 최신 Chromium 의 client hint
 *  - userAgent fallback: legacy 브라우저
 *
 *  3 가지 신호 중 하나라도 모바일을 가리키면 mobile=true.
 */
function isMobileDevice() {
  try {
    if (navigator.userAgentData?.mobile === true) return true;
  } catch (_) {}
  try {
    if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) return true;
  } catch (_) {}
  const ua = (navigator.userAgent || '').toLowerCase();
  if (/iphone|ipad|ipod|android|blackberry|windows phone|opera mini|mobile/i.test(ua)) return true;
  return false;
}

/**
 * 브라우저 실행 시 최초 1회 사용자 제스처에서 풀스크린 진입을 시도한다.
 *   ⚠️ 모바일 디바이스만 — PC 데스크탑은 풀스크린 호출하지 않음 (사용자 보고:
 *      "PC 에서 게임 플레이 진행하면 무조건 풀화면으로 전환되는 문제").
 */
export function enableFullscreenOnFirstTap() {
  if (isStandalone()) return; // 이미 풀스크린(설치형)
  if (!isMobileDevice())  return; // PC 데스크탑 → 풀스크린 호출 안 함

  const el = document.documentElement;
  if (!el.requestFullscreen) return; // 미지원(iOS Safari 등) → 무시

  const goFullscreen = () => {
    el.requestFullscreen().catch(() => {
      /* 사용자 거부/미지원 — 무시하고 일반 화면 유지 */
    });
    window.removeEventListener('pointerdown', goFullscreen);
  };
  window.addEventListener('pointerdown', goFullscreen, { once: true });
}
