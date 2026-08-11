/**
 * 화면 하단 토스트 — DOM 기반 간단 안내(성공/실패 등 눈에 보이는 피드백이 필요한 곳에서 공용).
 * 배너 광고 영역(96px) 위에 겹치지 않도록 그 위에 띄운다.
 */
const TOAST_MS = 2600;

export function showToast(message: string): void {
  try {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText =
      'position:fixed; left:50%; bottom:130px; transform:translateX(-50%); z-index:30;' +
      'max-width:82%; text-align:center; padding:10px 16px; border-radius:10px;' +
      'background:rgba(20,20,20,0.9); color:#fff; font-family:system-ui,sans-serif; font-size:14px;' +
      'line-height:1.4; box-shadow:0 2px 10px rgba(0,0,0,0.35); pointer-events:none;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), TOAST_MS);
  } catch {
    /* DOM 접근 실패 — 안내 문구 하나 못 띄운다고 게임에 지장을 주면 안 된다 */
  }
}
