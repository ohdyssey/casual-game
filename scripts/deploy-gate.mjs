/**
 * 라이언로직 사이트 전체 비공개 게이트 — 정적 배포본에 주입하는 클라이언트측 비밀번호 잠금.
 *
 * ⚠️ 2026-07-08 변경: 게이트 범위를 다시 **사이트 전체**로 확대한다(베가스호텔 전용 축소를 되돌림).
 *   루트/허브/모든 게임 index.html 이 전부 가드로 잠긴다.
 *
 * 왜 클라이언트측인가: 사이트는 Vercel 무료 정적 호스팅이라 서버측 암호보호(유료 SSO)를 쓰지 않는다
 *   (deploy/.vercel ssoProtection:null). 따라서 "소프트 게이트" — 콘텐츠 노출 전 비밀번호 1회 입력 →
 *   localStorage 토큰 발급 → 통과. 진짜 보안(서버 인증)이 아니라 비공개/스테이징 가림용이다.
 *   비밀번호는 번들에 평문으로 두지 않고 SHA-256 해시로만 비교한다(뷰소스 캐주얼 노출 방지).
 *
 * 구조:
 *   - 전용 게이트 페이지(/gate.html) = 비밀번호 폼. 통과 시 localStorage 토큰 + ?next 로 이동.
 *   - 각 index.html(허브+전 게임) = 가드 스니펫 주입(head 최상단, 동기). 미잠금 시 게이트로 바운스(딥링크 차단).
 *
 * 비밀번호 변경: GATE_TOKEN 을 새 비밀번호의 SHA-256 16진 해시로 교체하면 된다.
 *   예) node -e "console.log(require('crypto').createHash('sha256').update('새비번').digest('hex'))"
 */

/** localStorage 잠금 키 — 게이트 통과 토큰 보관(사이트 전체 공용). */
export const GATE_KEY = 'rl_site_gate_v1';

/**
 * SHA-256("3434") — 평문 대신 해시 비교. 비밀번호 변경 시 이 값을 재계산해 교체.
 * 2026-08-05 사용자 요청으로 good1354 → good3434 → **3434** 로 변경.
 * ⚠️ 토큰이 바뀌면 기존 방문자의 localStorage 값(옛 토큰)이 더 이상 일치하지 않아 **전원 재입력**
 *    해야 한다 — 비밀번호 교체의 의도된 동작이다(GATE_KEY 는 그대로 두어도 무효화된다).
 * ⚠️ 토큰 교체 직후에는 서비스워커가 캐시해 둔 **옛 셸**(옛 토큰 가드)과 충돌해 게이트 ↔ 허브
 *    무한 바운스가 생길 수 있다 — `gateScript` 의 루프 자가치유가 이 상황을 처리한다.
 */
export const GATE_TOKEN = '5f395d07369071a505ef926527de2ac53e8c29e103dc63398315bc276224b81a';

/** 중복 주입 방지 마커(가드 script 의 data-* 속성). */
const GUARD_MARK = 'data-rl-gate-guard';

/**
 * 진입 가드 — 잠글 index.html head 최상단에 주입할 동기 스크립트.
 * 잠금 토큰이 있으면 즉시 통과, 없으면 전용 게이트(`${gatePath}?next=…`)로 바운스(콘텐츠 렌더 전).
 * @param {string} gatePath 전용 게이트 페이지의 절대 경로(기본 '/gate.html').
 */
export function guardSnippet(gatePath = '/gate.html') {
  const sep = gatePath.includes('?') ? '&' : '?';
  return (
    `<script ${GUARD_MARK}>(function(){try{if(localStorage.getItem('${GATE_KEY}')===` +
    `'${GATE_TOKEN}')return}catch(e){}location.replace('${gatePath}${sep}next='+` +
    `encodeURIComponent(location.pathname+location.search+location.hash))})();</script>`
  );
}

/**
 * index.html 문자열에 가드 주입(중복 방지). <head> 직후에 삽입, <head> 없으면 최상단 prepend.
 * 원본 dist 는 가드가 없으므로 배포본에만 적용된다.
 * @param {string} html
 * @param {string} [gatePath] 전용 게이트 페이지 경로.
 */
export function injectGuard(html, gatePath = '/gate.html') {
  if (html.includes(GUARD_MARK)) return html;
  const snippet = guardSnippet(gatePath);
  const head = html.match(/<head[^>]*>/i);
  if (head) return html.replace(head[0], `${head[0]}\n    ${snippet}`);
  return `${snippet}\n${html}`;
}

/**
 * 게이트 페이지 공용 스크립트 — 토큰 검사·통과 이동 + **바운스 루프 자가치유**.
 *
 * ⚠️ 왜 자가치유가 필요한가(2026-08-05 모바일 제보: "비번 입력 중 화면이 떨리며 계속 리로딩"):
 *   허브·일부 게임은 서비스워커가 `index.html` 을 **프리캐시**하고 모든 내비게이션에 그 셸을
 *   돌려준다(workbox NavigationRoute). 그런데 게이트 가드는 **그 셸 안에** 토큰이 박힌 채로
 *   들어간다. 비밀번호를 바꾼 뒤 방문하면:
 *     새 게이트 통과 → localStorage=새 토큰 → /hub/ → SW 가 **옛 셸**(옛 토큰)을 반환
 *     → 가드 불일치 → 게이트로 튕김 → 토큰 있으니 즉시 /hub/ → … **무한 반복**
 *   한 사이클이 1초도 안 돼 화면이 깜빡이고, SW 갱신이 끝나기 전에 계속 이동해 스스로 낫지도 않는다.
 *
 * 처리: "방금 통과했는데 또 게이트로 돌아왔다"를 루프로 보고 **SW 해제 + 캐시 전삭제** 후 한 번 더
 *   진입한다. 그래도 튕기면 자동 이동을 멈추고 사람에게 알린다(무한 새로고침 재발 방지).
 *
 * @param {string} key localStorage 잠금 키
 * @param {string} token 통과 토큰(비밀번호 SHA-256)
 * @param {string} fallback ?next 가 없을 때 갈 경로
 */
function gateScript(key, token, fallback) {
  return `
  var KEY='${key}', TOKEN='${token}';
  var STAMP=KEY+'_at', HEALED=KEY+'_healed';
  // ?next 는 같은 출처 절대경로만 허용(오픈 리다이렉트 방지).
  function nextUrl(){
    var n=new URLSearchParams(location.search).get('next');
    return (n && n.charAt(0)==='/' && n.indexOf('//')!==0) ? n : '${fallback}';
  }
  function enter(){
    try{ sessionStorage.setItem(STAMP, String(Date.now())); }catch(e){}
    location.replace(nextUrl());
  }
  /** 낡은 서비스워커·캐시 전부 제거 — 옛 셸이 옛 토큰으로 튕겨내는 것을 끊는다. */
  function heal(){
    var jobs=[];
    try{
      if(navigator.serviceWorker && navigator.serviceWorker.getRegistrations)
        jobs.push(navigator.serviceWorker.getRegistrations().then(function(rs){
          return Promise.all(rs.map(function(r){ return r.unregister(); }));
        }));
    }catch(e){}
    try{
      if(window.caches && caches.keys)
        jobs.push(caches.keys().then(function(ks){
          return Promise.all(ks.map(function(k){ return caches.delete(k); }));
        }));
    }catch(e){}
    return Promise.all(jobs).catch(function(){});
  }
  function stuckNotice(){
    var e=document.getElementById('e');
    if(e) e.textContent='캐시 문제로 진입이 반복 실패했습니다. 브라우저를 완전히 닫았다 열어 주세요.';
  }
  try{
    if(localStorage.getItem(KEY)===TOKEN){
      var last=+(sessionStorage.getItem(STAMP)||0);
      var looping = Date.now()-last < 8000; // 방금 통과했는데 또 여기 = 바운스 루프
      if(!looping) enter();
      else if(!sessionStorage.getItem(HEALED)){
        sessionStorage.setItem(HEALED,'1');
        heal().then(enter);
      } else stuckNotice(); // 치유 후에도 튕긴다 → 자동 이동 중단(무한 새로고침 방지)
    }
  }catch(e){}
  async function sha(s){
    var b=await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,'0');}).join('');
  }
  var f=document.getElementById('f'), p=document.getElementById('p'), e=document.getElementById('e');
  f.addEventListener('submit', async function(ev){
    ev.preventDefault(); e.textContent='';
    var h; try{ h=await sha(p.value); }catch(err){ e.textContent='이 브라우저는 지원되지 않습니다.'; return; }
    if(h===TOKEN){
      try{ localStorage.setItem(KEY,TOKEN); }catch(err){}
      // 비밀번호를 새로 넣은 직후엔 옛 셸이 남아 있을 수 있다 — 한 번 비우고 들어간다.
      try{ sessionStorage.removeItem(HEALED); }catch(err){}
      heal().then(enter);
    }
    else{ e.textContent='비밀번호가 올바르지 않습니다.'; p.value=''; p.focus(); }
  });`;
}

/**
 * 게이트 페이지 공용 스타일 — 모바일 키보드가 올라와도 카드가 튀지 않게 한다.
 * ⚠️ `100dvh` 는 키보드 개폐마다 값이 변해 가운데 정렬된 카드가 위아래로 떨린다(모바일 제보).
 *    `100svh`(작은 뷰포트 기준)는 고정이라 흔들리지 않는다 — 미지원 브라우저는 vh 로 폴백.
 */
const GATE_VIEWPORT_CSS = 'min-height:100vh; min-height:100svh;';

/* ────────────────────────────────────────────────────────────────────────────
 * 솔리테어 하이츠 **전용 추가 게이트** (2026-07-12 요청)
 *   사이트 전체 게이트(good1354)를 통과한 뒤, /solitaire/ 접근 시 **추가 비밀번호**를 한 번 더 요구한다.
 *   솔리테어 index.html 에만 별도 가드를 얹고(전용 마커·전용 게이트 페이지), 다른 게임엔 영향 없음.
 *   비밀번호 = good13541354 (SHA-256 해시로만 비교).
 * ──────────────────────────────────────────────────────────────────────────── */

/** 솔리테어 전용 잠금 키(사이트 키와 분리). */
export const SOLITAIRE_GATE_KEY = 'rl_solitaire_gate_v1';
/** SHA-256("good13541354"). */
export const SOLITAIRE_GATE_TOKEN = '3ffa76969b87acfd6f1a942a2c6b9259d343d5e99de35e6508102c1b2387af94';
const SOLITAIRE_GUARD_MARK = 'data-rl-solitaire-guard';

/**
 * 솔리테어 index.html 에 **추가 가드**를 주입한다. 사이트 가드보다 **뒤(</head> 직전)** 에 넣어
 * 사이트 게이트를 먼저 통과한 뒤 이 게이트가 동작하게 한다. 솔리테어 토큰 없으면 전용 게이트로 바운스.
 */
export function injectSolitaireGuard(html, gatePath = '/solitaire-gate.html') {
  if (html.includes(SOLITAIRE_GUARD_MARK)) return html;
  const sep = gatePath.includes('?') ? '&' : '?';
  const snippet =
    `<script ${SOLITAIRE_GUARD_MARK}>(function(){try{if(localStorage.getItem('${SOLITAIRE_GATE_KEY}')===` +
    `'${SOLITAIRE_GATE_TOKEN}')return}catch(e){}location.replace('${gatePath}${sep}next='+` +
    `encodeURIComponent(location.pathname+location.search+location.hash))})();</script>`;
  const closeHead = html.match(/<\/head>/i);
  if (closeHead) return html.replace(closeHead[0], `    ${snippet}\n${closeHead[0]}`);
  const head = html.match(/<head[^>]*>/i);
  if (head) return html.replace(head[0], `${head[0]}\n    ${snippet}`);
  return `${snippet}\n${html}`;
}

/** 솔리테어 전용 게이트 페이지 — 통과 시 전용 토큰 발급 후 ?next(기본 /solitaire/) 로 이동. */
export function solitaireGatePageHtml() {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0B1020">
<meta name="robots" content="noindex, nofollow">
<title>Solitaire Heights</title>
<style>
  :root{ --bg0:#0B1020; --bg1:#141B33; --card:#1A2238; --line:rgba(255,255,255,.1);
         --txt:#EAF0FF; --dim:#9AA7C7; --accent:#E86FA6; --err:#FF6B6B; }
  *{ box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  html,body{ margin:0; height:100%; }
  body{ font-family:system-ui,-apple-system,'Segoe UI',sans-serif;
        background:radial-gradient(1200px 800px at 50% -10%, var(--bg1), var(--bg0));
        color:var(--txt); display:grid; place-items:center; ${GATE_VIEWPORT_CSS} padding:24px; }
  .card{ width:100%; max-width:360px; background:var(--card); border:1px solid var(--line);
         border-radius:18px; padding:34px 26px; text-align:center; box-shadow:0 24px 60px rgba(0,0,0,.45); }
  .logo{ font-size:24px; font-weight:800; letter-spacing:.3px; margin:0 0 6px; }
  .logo b{ color:var(--accent); }
  .sub{ color:var(--dim); font-size:13px; line-height:1.5; margin:0 0 22px; }
  form{ display:flex; flex-direction:column; gap:12px; }
  input{ width:100%; padding:14px 16px; border-radius:12px; border:1px solid var(--line);
         background:#0F1528; color:var(--txt); font-size:16px; outline:none; text-align:center; letter-spacing:2px; }
  input:focus{ border-color:var(--accent); }
  button{ padding:14px 16px; border:0; border-radius:12px; cursor:pointer;
          background:var(--accent); color:#3a0f26; font-size:16px; font-weight:800; }
  button:active{ transform:translateY(1px); }
  .err{ color:var(--err); font-size:13px; min-height:18px; margin:2px 0 0; }
</style>
</head>
<body>
  <div class="card">
    <h1 class="logo">솔리테어 <b>하이츠</b></h1>
    <p class="sub">이 게임은 비공개 테스트 중입니다.<br>추가 비밀번호를 입력해 주세요.</p>
    <form id="f">
      <input id="p" type="password" inputmode="text" autocomplete="current-password"
             placeholder="비밀번호" autofocus aria-label="비밀번호">
      <button type="submit">입장</button>
      <p class="err" id="e" role="alert"></p>
    </form>
  </div>
<script>${gateScript(SOLITAIRE_GATE_KEY, SOLITAIRE_GATE_TOKEN, '/solitaire/')}
</script>
</body>
</html>`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 게임별 **추가 게이트** — 사이트 게이트를 통과한 뒤, 그 게임에만 비밀번호를 한 번 더 요구한다.
 *   배포 폴더명(prodUrl 기준)을 키로 등록하면 assemble-deploy 가 전용 게이트 페이지를 만들고
 *   그 게임 index.html 에만 가드를 얹는다. 다른 게임·허브에는 영향 없음.
 *   비밀번호는 평문이 아니라 SHA-256 해시로만 비교한다(사이트 게이트와 같은 방식).
 * ──────────────────────────────────────────────────────────────────────────── */

/** @type {Record<string, {key:string, token:string, page:string, title:string, accent:string, ink:string}>} */
export const GAME_GATES = {
  // 김밥 롤 마스터 — 추가 비밀번호 "5656"(2026-08-07 요청).
  kimbaproll: {
    key: 'rl_kimbaproll_gate_v1',
    token: '02023546b4039abe3b9f355c23dafd9119570f301a024e2fd2ff3186ae54060c',
    page: 'kimbaproll-gate.html',
    title: '김밥 롤 <b>마스터</b>',
    accent: '#5FBF7F',
    ink: '#0d2b16',
  },
};

const GAME_GUARD_MARK = 'data-rl-game-guard';

/**
 * 게임 index.html 에 **추가 가드**를 주입한다. 사이트 가드보다 **뒤(</head> 직전)** 에 넣어
 * 사이트 게이트를 먼저 통과한 뒤 이 게이트가 동작하게 한다.
 */
export function injectGameGuard(html, gate, gatePath) {
  if (html.includes(GAME_GUARD_MARK)) return html;
  const sep = gatePath.includes('?') ? '&' : '?';
  const snippet =
    `<script ${GAME_GUARD_MARK}>(function(){try{if(localStorage.getItem('${gate.key}')===` +
    `'${gate.token}')return}catch(e){}location.replace('${gatePath}${sep}next='+` +
    `encodeURIComponent(location.pathname+location.search+location.hash))})();</script>`;
  const closeHead = html.match(/<\/head>/i);
  if (closeHead) return html.replace(closeHead[0], `    ${snippet}\n${closeHead[0]}`);
  const head = html.match(/<head[^>]*>/i);
  if (head) return html.replace(head[0], `${head[0]}\n    ${snippet}`);
  return `${snippet}\n${html}`;
}

/** 게임 전용 게이트 페이지 — 통과 시 전용 토큰 발급 후 그 게임으로 이동. */
export function gameGatePageHtml(gate, next) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0B1020">
<meta name="robots" content="noindex, nofollow">
<title>${gate.title.replace(/<[^>]+>/g, '')}</title>
<style>
  :root{ --bg0:#0B1020; --bg1:#141B33; --card:#1A2238; --line:rgba(255,255,255,.1);
         --txt:#EAF0FF; --dim:#9AA7C7; --accent:${gate.accent}; --ink:${gate.ink}; --err:#FF6B6B; }
  *{ box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  html,body{ margin:0; height:100%; }
  body{ font-family:system-ui,-apple-system,'Segoe UI',sans-serif;
        background:radial-gradient(1200px 800px at 50% -10%, var(--bg1), var(--bg0));
        color:var(--txt); display:grid; place-items:center; ${GATE_VIEWPORT_CSS} padding:24px; }
  .card{ width:100%; max-width:360px; background:var(--card); border:1px solid var(--line);
         border-radius:18px; padding:34px 26px; text-align:center; box-shadow:0 24px 60px rgba(0,0,0,.45); }
  .logo{ font-size:24px; font-weight:800; letter-spacing:.3px; margin:0 0 6px; }
  .logo b{ color:var(--accent); }
  .sub{ color:var(--dim); font-size:13px; line-height:1.5; margin:0 0 22px; }
  form{ display:flex; flex-direction:column; gap:12px; }
  input{ width:100%; padding:14px 16px; border-radius:12px; border:1px solid var(--line);
         background:#0F1528; color:var(--txt); font-size:16px; outline:none; text-align:center; letter-spacing:2px; }
  input:focus{ border-color:var(--accent); }
  button{ padding:14px 16px; border:0; border-radius:12px; cursor:pointer;
          background:var(--accent); color:var(--ink); font-size:16px; font-weight:800; }
  button:active{ transform:translateY(1px); }
  .err{ color:var(--err); font-size:13px; min-height:18px; margin:2px 0 0; }
</style>
</head>
<body>
  <div class="card">
    <h1 class="logo">${gate.title}</h1>
    <p class="sub">이 게임은 비공개 테스트 중입니다.<br>추가 비밀번호를 입력해 주세요.</p>
    <form id="f">
      <input id="p" type="password" inputmode="text" autocomplete="current-password"
             placeholder="비밀번호" autofocus aria-label="비밀번호">
      <button type="submit">입장</button>
      <p class="err" id="e" role="alert"></p>
    </form>
  </div>
<script>${gateScript(gate.key, gate.token, next)}
</script>
</body>
</html>`;
}

/**
 * 루트 게이트 페이지 — 비밀번호 폼. 허브 다크 테마에 맞춘 단일 파일(외부 의존 없음).
 * 통과 시 SHA-256 검증 → localStorage 토큰 → ?next(같은 출처 절대경로) 또는 /hub/ 로 이동.
 */
export function gatePageHtml() {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0B1020">
<meta name="robots" content="noindex, nofollow">
<title>RyanLogic</title>
<style>
  :root{ --bg0:#0B1020; --bg1:#141B33; --card:#1A2238; --line:rgba(255,255,255,.1);
         --txt:#EAF0FF; --dim:#9AA7C7; --accent:#38E08A; --err:#FF6B6B; }
  *{ box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  html,body{ margin:0; height:100%; }
  body{ font-family:system-ui,-apple-system,'Segoe UI',sans-serif;
        background:radial-gradient(1200px 800px at 50% -10%, var(--bg1), var(--bg0));
        color:var(--txt); display:grid; place-items:center; ${GATE_VIEWPORT_CSS} padding:24px; }
  .card{ width:100%; max-width:360px; background:var(--card); border:1px solid var(--line);
         border-radius:18px; padding:34px 26px; text-align:center;
         box-shadow:0 24px 60px rgba(0,0,0,.45); }
  .logo{ font-size:27px; font-weight:800; letter-spacing:.5px; margin:0 0 6px; }
  .logo b{ color:var(--accent); }
  .sub{ color:var(--dim); font-size:13px; line-height:1.5; margin:0 0 22px; }
  form{ display:flex; flex-direction:column; gap:12px; }
  input{ width:100%; padding:14px 16px; border-radius:12px; border:1px solid var(--line);
         background:#0F1528; color:var(--txt); font-size:16px; outline:none;
         text-align:center; letter-spacing:2px; }
  input:focus{ border-color:var(--accent); }
  button{ padding:14px 16px; border:0; border-radius:12px; cursor:pointer;
          background:var(--accent); color:#08311E; font-size:16px; font-weight:800; }
  button:active{ transform:translateY(1px); }
  .err{ color:var(--err); font-size:13px; min-height:18px; margin:2px 0 0; }
</style>
</head>
<body>
  <div class="card">
    <h1 class="logo">Ryan<b>Logic</b></h1>
    <p class="sub">이 사이트는 비공개 상태입니다.<br>비밀번호를 입력해 주세요.</p>
    <form id="f">
      <input id="p" type="password" inputmode="text" autocomplete="current-password"
             placeholder="비밀번호" autofocus aria-label="비밀번호">
      <button type="submit">입장</button>
      <p class="err" id="e" role="alert"></p>
    </form>
  </div>
<script>${gateScript(GATE_KEY, GATE_TOKEN, '/hub/')}
</script>
</body>
</html>`;
}
