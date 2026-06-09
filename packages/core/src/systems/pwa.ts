/**
 * PWA helpers — 피싱 계승. 서비스워커 등록은 vite-plugin-pwa(autoUpdate)가 처리하므로
 * 여기선 첫 탭 풀스크린 진입만 담당. SSR/구형 브라우저 안전 가드.
 */

/** 브라우저 실행 시 첫 사용자 탭에서 풀스크린 진입 (이미 standalone PWA면 skip). */
export function enableFullscreenOnFirstTap(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

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
