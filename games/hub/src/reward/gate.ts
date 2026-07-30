/**
 * reward/gate — CashPOP 접속 비밀번호 게이트(런타임 소프트 게이트).
 *
 * CashPOP 은 별도 배포 페이지가 아니라 허브 SPA 안에서 오버레이(openRewardShell)로 열린다.
 * 따라서 베가스호텔 게이트(빌드 시 게임 index.html 에 가드 주입, scripts/deploy-gate.mjs)와 달리,
 * 셸을 여는 런타임 진입점에서 비밀번호를 1회 확인한다.
 *
 * 성격: 진짜 서버 인증이 아니라 "소프트 게이트" — 비공개 노출 가림용. 통과 토큰은 localStorage 에 보관하고,
 *   비밀번호는 번들에 평문으로 두지 않고 SHA-256 해시로만 비교한다(뷰소스 캐주얼 노출 방지).
 *
 * 비밀번호: 베가스호텔 게이트와 동일(good1354). 단, localStorage 키(GATE_KEY)는 CashPOP 전용으로 분리해
 *   두 게이트가 독립적으로 동작한다(한쪽을 풀어도 다른 쪽은 잠긴 채 유지).
 *
 * 비밀번호 변경: GATE_TOKEN 을 새 비밀번호의 SHA-256 16진 해시로 교체.
 *   예) node -e "console.log(require('crypto').createHash('sha256').update('새비번').digest('hex'))"
 */

/** localStorage 잠금 키 — CashPOP 전용(베가스 게이트 rl_vegas_gate_v1 과 독립). */
export const GATE_KEY = 'rl_cashpop_gate_v1';

/** SHA-256("good1354") — 평문 대신 해시 비교. 비밀번호 변경 시 이 값을 재계산해 교체(베가스와 동일 값). */
export const GATE_TOKEN =
  '8f8c7b8b126826a235ce008710dc801c51393d9b7e73cc18dce8f70d69bb6581';

/** 이미 게이트를 통과했는지(토큰 보유) — 동기 확인. */
export function isCashpopUnlocked(): boolean {
  try {
    return localStorage.getItem(GATE_KEY) === GATE_TOKEN;
  } catch {
    return false;
  }
}

/** 문자열 SHA-256 → 16진(subtle crypto). */
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const s = document.createElement('style');
  s.textContent = `
    .rwg-layer{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:24px;
      background:radial-gradient(900px 700px at 50% -10%,#EAF1FF,#DCE6FA);
      font-family:system-ui,-apple-system,'Segoe UI',sans-serif;-webkit-tap-highlight-color:transparent}
    .rwg-card{width:100%;max-width:360px;background:#fff;border:1px solid #E6EBF3;border-radius:20px;
      padding:34px 26px;text-align:center;box-shadow:0 24px 60px rgba(20,30,60,.18)}
    .rwg-logo{font-size:26px;font-weight:800;letter-spacing:.3px;margin:0 0 6px;color:#1B2438}
    .rwg-logo b{color:#2E6BFF}
    .rwg-sub{color:#8A94A6;font-size:13px;line-height:1.55;margin:0 0 22px}
    .rwg-card form{display:flex;flex-direction:column;gap:12px}
    .rwg-card input{width:100%;box-sizing:border-box;padding:14px 16px;border-radius:12px;border:1px solid #E6EBF3;
      background:#F5F8FF;color:#1B2438;font-size:16px;outline:none;text-align:center;letter-spacing:2px}
    .rwg-card input:focus{border-color:#2E6BFF;background:#fff}
    .rwg-card button{padding:14px 16px;border:0;border-radius:12px;cursor:pointer;font-family:inherit;
      background:linear-gradient(135deg,#3B82F6,#2563EB);color:#fff;font-size:16px;font-weight:800;
      box-shadow:0 10px 22px rgba(37,99,235,.28)}
    .rwg-card button:active{transform:translateY(1px)}
    .rwg-back{background:none!important;box-shadow:none!important;color:#8A94A6!important;font-weight:600!important;font-size:13px!important}
    .rwg-err{color:#E5484D;font-size:13px;min-height:18px;margin:2px 0 0}
  `;
  document.head.appendChild(s);
}

/**
 * CashPOP 게이트 표시 — 비밀번호 폼 오버레이.
 *   통과: SHA-256 검증 → localStorage 토큰 저장 → onPass() 호출(셸 열기).
 *   취소('허브로 돌아가기'): 오버레이만 제거 → 허브 화면 유지.
 * @param onPass 비밀번호 통과 시 실행할 콜백(보통 openRewardShell 재호출).
 */
export function showCashpopGate(onPass: () => void): void {
  injectStyles();
  document.querySelectorAll('.rwg-layer').forEach((el) => el.remove());

  const layer = document.createElement('div');
  layer.className = 'rwg-layer';
  layer.innerHTML =
    `<div class="rwg-card">` +
    `<h1 class="rwg-logo">Cash<b>POP</b></h1>` +
    `<p class="rwg-sub">CashPOP 은 비공개 서비스입니다.<br>비밀번호를 입력해 주세요.</p>` +
    `<form id="rwg-f">` +
    `<input id="rwg-p" type="password" inputmode="text" autocomplete="current-password" ` +
    `placeholder="비밀번호" autofocus aria-label="비밀번호">` +
    `<button type="submit">입장</button>` +
    `<button type="button" class="rwg-back" id="rwg-back">허브로 돌아가기</button>` +
    `<p class="rwg-err" id="rwg-e" role="alert"></p>` +
    `</form>` +
    `</div>`;
  document.body.appendChild(layer);

  const form = layer.querySelector<HTMLFormElement>('#rwg-f')!;
  const input = layer.querySelector<HTMLInputElement>('#rwg-p')!;
  const err = layer.querySelector<HTMLElement>('#rwg-e')!;

  layer.querySelector('#rwg-back')!.addEventListener('click', () => layer.remove());

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    err.textContent = '';
    void (async () => {
      let hash: string;
      try {
        hash = await sha256Hex(input.value);
      } catch {
        err.textContent = '이 브라우저는 지원되지 않습니다.';
        return;
      }
      if (hash === GATE_TOKEN) {
        try {
          localStorage.setItem(GATE_KEY, GATE_TOKEN);
        } catch {
          /* localStorage 불가 시에도 세션 통과는 허용(토큰만 미보관) */
        }
        layer.remove();
        onPass();
      } else {
        err.textContent = '비밀번호가 올바르지 않습니다.';
        input.value = '';
        input.focus();
      }
    })();
  });
}

/**
 * 게이트 통과 보장 — 이미 통과했으면 true(호출자가 인라인으로 진행), 아니면 폼을 띄우고 false.
 *   ⚠️ 잠금 해제 상태에서는 onPass 를 호출하지 않는다(호출자가 이미 인라인 경로를 가짐).
 *   여기서 onPass 를 부르면, onPass 가 다시 이 함수를 호출하는 호출자에서 무한 재귀가 된다.
 * @param onPass 잠긴 경우, 비밀번호 통과 시 호출할 콜백(보통 진입 함수 재호출).
 * @returns 이미 통과했는지 여부. false 면 폼을 띄웠고 onPass 는 통과 후 호출된다.
 */
export function ensureCashpopGate(onPass: () => void): boolean {
  if (isCashpopUnlocked()) return true;
  showCashpopGate(onPass);
  return false;
}
