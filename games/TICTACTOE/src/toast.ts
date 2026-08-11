/**
 * 화면 하단 토스트 — DOM 기반 간단 안내(결제 성공/실패처럼 캔버스 밖에서 벌어지는 일의 피드백).
 *
 * 캔버스가 아니라 DOM 인 이유: 결제 플로우는 Phaser 씬과 무관하게 부팅 직후에도 돌 수 있어
 * "지금 어느 씬인지" 를 몰라도 띄울 수 있어야 한다.
 * 하단 배너 광고 영역(96px)에 가리지 않도록 그 위에 띄운다.
 */
const TOAST_MS = 2600;

export function showToast(message: string): void {
  try {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText =
      'position:fixed; left:50%; bottom:130px; transform:translateX(-50%); z-index:30;' +
      'max-width:82%; text-align:center; padding:10px 16px; border-radius:10px;' +
      'background:rgba(12,8,24,0.92); color:#E8E6FF; font-family:system-ui,sans-serif; font-size:14px;' +
      'line-height:1.4; box-shadow:0 2px 12px rgba(0,0,0,0.5); pointer-events:none;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), TOAST_MS);
  } catch {
    /* DOM 접근 실패 — 안내 문구 하나 못 띄운다고 게임에 지장을 주면 안 된다 */
  }
}
