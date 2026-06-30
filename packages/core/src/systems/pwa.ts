/**
 * PWA helpers — 피싱 계승. 서비스워커 등록은 vite-plugin-pwa(autoUpdate)가 처리하므로
 * 여기선 첫 탭 풀스크린 진입만 담당. SSR/구형 브라우저 안전 가드.
 */

/**
 * 첫 사용자 탭에서 Fullscreen API 진입 → 안드로이드에서 첫 뒤로가기 제스처를
 * "풀스크린 해제"로 흡수(이탈 버퍼 1회). 설치형 PWA(이미 몰입) 면 skip.
 * 터치 기기에서만 동작 — 데스크탑(파인 포인터)에선 클릭 시 화면이 통째 전체화면 되는
 * 부작용이 있어 제외(허브가 게임을 9:16 팝업으로 여는 데스크탑 흐름 보호).
 */
export function enableFullscreenOnFirstTap(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  // 터치 기기만(엣지 스와이프 뒤로가기가 있는 환경). 데스크탑 마우스는 제외.
  const isTouch =
    window.matchMedia?.('(pointer: coarse)')?.matches ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  if (!isTouch) return;

  const isStandalone =
    window.matchMedia?.('(display-mode: fullscreen)')?.matches ||
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  if (isStandalone) return;

  const onFirstTap = () => {
    const el = document.documentElement;
    el.requestFullscreen?.().catch(() => {
      /* 사용자 제스처 외 호출/미지원 — 무시 */
    });
    window.removeEventListener('pointerdown', onFirstTap);
  };
  window.addEventListener('pointerdown', onFirstTap, { once: true });
}
