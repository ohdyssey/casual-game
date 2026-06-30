/**
 * 라이언로직 홈페이지 비공개 게이트 — 정적 배포본에 주입하는 클라이언트측 비밀번호 잠금.
 *
 * 왜 클라이언트측인가: 사이트는 Vercel 무료 정적 호스팅이라 서버측 암호보호(유료 SSO)를 쓰지 않는다
 *   (deploy/.vercel ssoProtection:null). 따라서 "소프트 게이트" — 콘텐츠 노출 전 비밀번호 1회 입력 →
 *   localStorage 토큰 발급 → 전 페이지 통과. 진짜 보안(서버 인증)이 아니라 비공개/스테이징 가림용이다.
 *   비밀번호는 번들에 평문으로 두지 않고 SHA-256 해시로만 비교한다(뷰소스 캐주얼 노출 방지).
 *
 * 구조:
 *   - 루트 index.html  = 게이트 페이지(비밀번호 폼). 통과 시 localStorage 토큰 + ?next 로 이동.
 *   - 그 외 index.html = 가드 스니펫 주입(head 최상단, 동기). 미잠금 시 루트 게이트로 바운스(딥링크 차단).
 *
 * 비밀번호 변경: GATE_TOKEN 을 새 비밀번호의 SHA-256 16진 해시로 교체하면 된다.
 *   예) node -e "console.log(require('crypto').createHash('sha256').update('새비번').digest('hex'))"
 */

/** localStorage 잠금 키 — 게이트 통과 토큰 보관. */
export const GATE_KEY = 'rl_gate_v1';

/** SHA-256("good1354") — 평문 대신 해시 비교. 비밀번호 변경 시 이 값을 재계산해 교체. */
export const GATE_TOKEN = '8f8c7b8b126826a235ce008710dc801c51393d9b7e73cc18dce8f70d69bb6581';

/** 중복 주입 방지 마커(가드 script 의 data-* 속성). */
const GUARD_MARK = 'data-rl-gate-guard';

/**
 * 진입 가드 — 비루트 index.html head 최상단에 주입할 동기 스크립트.
 * 잠금 토큰이 있으면 즉시 통과, 없으면 루트 게이트(`/?next=…`)로 바운스(콘텐츠 렌더 전).
 */
export function guardSnippet() {
  return (
    `<script ${GUARD_MARK}>(function(){try{if(localStorage.getItem('${GATE_KEY}')===` +
    `'${GATE_TOKEN}')return}catch(e){}location.replace('/?next='+` +
    `encodeURIComponent(location.pathname+location.search+location.hash))})();</script>`
  );
}

/**
 * index.html 문자열에 가드 주입(중복 방지). <head> 직후에 삽입, <head> 없으면 최상단 prepend.
 * 원본 dist 는 가드가 없으므로 배포본에만 적용된다.
 */
export function injectGuard(html) {
  if (html.includes(GUARD_MARK)) return html;
  const snippet = guardSnippet();
  const head = html.match(/<head[^>]*>/i);
  if (head) return html.replace(head[0], `${head[0]}\n    ${snippet}`);
  return `${snippet}\n${html}`;
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
        color:var(--txt); display:grid; place-items:center; min-height:100dvh; padding:24px; }
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
    <p class="sub">비공개 페이지입니다.<br>비밀번호를 입력해 주세요.</p>
    <form id="f">
      <input id="p" type="password" inputmode="text" autocomplete="current-password"
             placeholder="비밀번호" autofocus aria-label="비밀번호">
      <button type="submit">입장</button>
      <p class="err" id="e" role="alert"></p>
    </form>
  </div>
<script>
  var KEY='${GATE_KEY}', TOKEN='${GATE_TOKEN}';
  // ?next 는 같은 출처 절대경로만 허용(오픈 리다이렉트 방지). 아니면 허브로.
  function nextUrl(){
    var n=new URLSearchParams(location.search).get('next');
    return (n && n.charAt(0)==='/' && n.indexOf('//')!==0) ? n : '/hub/';
  }
  function enter(){ location.replace(nextUrl()); }
  async function sha(s){
    var b=await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,'0');}).join('');
  }
  try{ if(localStorage.getItem(KEY)===TOKEN) enter(); }catch(e){}
  var f=document.getElementById('f'), p=document.getElementById('p'), e=document.getElementById('e');
  f.addEventListener('submit', async function(ev){
    ev.preventDefault(); e.textContent='';
    var h; try{ h=await sha(p.value); }catch(err){ e.textContent='이 브라우저는 지원되지 않습니다.'; return; }
    if(h===TOKEN){ try{ localStorage.setItem(KEY,TOKEN); }catch(err){} enter(); }
    else{ e.textContent='비밀번호가 올바르지 않습니다.'; p.value=''; p.focus(); }
  });
</script>
</body>
</html>`;
}
