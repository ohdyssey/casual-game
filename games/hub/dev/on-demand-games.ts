/**
 * dev-on-demand-games — 허브 dev 서버에서 "게임 서버 온디맨드 기동" 미들웨어.
 *
 * 목적: `npm run dev` 는 허브만 띄우고(가벼움), 사용자가 허브에서 게임 카드를 누르면
 *       그때 해당 게임의 vite dev 서버를 자동으로 켠다 → 보는 게임만 메모리를 쓴다.
 *
 * 동작:
 *   GET /__dev/start?game=<id>  → 그 게임 포트가 이미 열려있으면 즉시 ok,
 *                                 아니면 `node vite.js games/<dir>` 로 서버를 띄우고
 *                                 포트가 응답할 때까지 기다렸다가 ok 를 반환.
 *   GET /__dev/boot?game=&to=   → 팝업이 먼저 여는 "게임 준비 중…" 화면.
 *                                 /__dev/start 를 호출해 준비되면 to(실제 게임 URL)로 이동.
 *
 * 생성된 게임 서버 프로세스는 허브 dev 프로세스의 자식 → 허브를 끄면 함께 정리된다.
 * apply:'serve' 라 `vite build`(정식 배포)에는 전혀 끼어들지 않는다(운영 구조 무영향).
 *
 * 게임당 node 프로세스 1개만 띄운다(npm/npx 래퍼 체인 없이 vite.js 직접 실행).
 */
import type { Plugin, ViteDevServer } from 'vite';
import { spawn, type ChildProcess } from 'node:child_process';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GAMES } from '../games.config.js';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const viteJs = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');

/** 허브 게임 id → 워크스페이스 폴더명(games/<dir>). games.config 의 live 게임과 1:1. */
const GAME_DIR: Record<string, string> = {
  store: 'store',
  skewer: 'Grillking',
  eco01: 'eco01',
  bubblepong: 'bubblepong',
  fishing: 'fishngo',
  archerystars: 'Archery',
  homerunpop: 'Homerun',
  dragonbeat: 'DragonBeat',
  zombiearrow: 'ZombieArrow',
  duckhuntrush: 'DuckhuntRush',
  parcelpoprush: 'Logistics',
  soccerflick: 'SoccerFlick',
  pathrush: 'PathRush',
  pawlinkroom: 'PawLink',
  pickmeup: 'Pickmeup',
  flockgo: 'FlockGo',
  socialcasino: 'SocialCasino',
  solitaire: 'Solitare',
  sumoclash: 'SumoClash',
};

/** 포트는 games.config(SSOT)에서 가져온다 — 중복 정의로 인한 드리프트 방지. */
function portOf(id: string): number | undefined {
  return (GAMES as Array<{ id: string; devPort?: number }>).find((g) => g.id === id)?.devPort;
}

/** 포트가 TCP 연결을 받는지(= dev 서버가 떠 있는지) 한 번 확인. */
function isPortOpen(port: number, timeoutMs = 700): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = connect({ port, host: '127.0.0.1' });
    const done = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
  });
}

/** 포트가 열릴 때까지 폴링(부팅 대기). 타임아웃이면 false. */
async function waitForPort(port: number, totalMs = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < totalMs) {
    if (await isPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 350));
  }
  return false;
}

interface EnsureResult {
  ok: boolean;
  port?: number;
  error?: string;
}

export function devOnDemandGames(): Plugin {
  const children = new Map<string, ChildProcess>();
  const starting = new Map<string, Promise<boolean>>();

  async function ensure(id: string): Promise<EnsureResult> {
    const dir = GAME_DIR[id];
    const port = portOf(id);
    if (!dir || !port) return { ok: false, error: `unknown game: ${id}` };
    if (await isPortOpen(port)) return { ok: true, port };

    if (!starting.has(id)) {
      const args = [viteJs, path.join('games', dir)];
      if (id === 'fishing') args.push('--host'); // fishngo 는 --host 로 기동(기존 스크립트 계승)
      const child = spawn(process.execPath, args, {
        cwd: repoRoot,
        stdio: 'ignore',
        windowsHide: true, // 검은 빈 콘솔창 안 뜨게
      });
      children.set(id, child);
      child.once('exit', () => children.delete(id));
      starting.set(
        id,
        waitForPort(port).finally(() => starting.delete(id)),
      );
    }
    const ready = await starting.get(id)!;
    return ready ? { ok: true, port } : { ok: false, port, error: 'timeout' };
  }

  return {
    name: 'dev-on-demand-games',
    apply: 'serve', // 운영 빌드(vite build)에는 절대 적용되지 않음
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const u = new URL(req.url ?? '/', 'http://localhost');

        if (u.pathname === '/__dev/start') {
          const id = u.searchParams.get('game') ?? '';
          void ensure(id).then((r) => {
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.statusCode = r.ok ? 200 : 502;
            res.end(JSON.stringify(r));
          });
          return;
        }

        if (u.pathname === '/__dev/boot') {
          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.end(BOOT_HTML);
          return;
        }

        next();
      });

      // 허브를 끄면 켜둔 게임 서버들도 함께 정리.
      const killAll = () => children.forEach((c) => c.kill());
      server.httpServer?.once('close', killAll);
      process.once('exit', killAll);
    },
  };
}

/** 팝업이 먼저 여는 "게임 준비 중…" 화면. /__dev/start 로 서버를 켠 뒤 to 로 이동. */
const BOOT_HTML = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>게임 준비 중…</title>
<style>
  html,body{margin:0;height:100%}
  body{display:grid;place-items:center;background:#0B1020;color:#cfe3ff;
       font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
  .box{text-align:center;padding:24px}
  .spin{width:46px;height:46px;border:4px solid #25324f;border-top-color:#4bbfe6;
        border-radius:50%;margin:0 auto 18px;animation:r .9s linear infinite}
  @keyframes r{to{transform:rotate(360deg)}}
  .sub{opacity:.6;font-size:13px;margin-top:6px}
  .err{color:#ff8a8a}
  button{margin-top:16px;padding:8px 18px;border:0;border-radius:8px;
         background:#4bbfe6;color:#04121f;font-weight:700;cursor:pointer}
</style></head><body>
<div class="box">
  <div class="spin" id="spin"></div>
  <div id="msg">게임 서버를 켜는 중…</div>
  <div class="sub" id="sub">처음 한 번은 몇 초 걸려요</div>
</div>
<script>
  var q=new URLSearchParams(location.search), game=q.get('game'), to=q.get('to');
  function fail(m){
    document.getElementById('spin').style.display='none';
    document.getElementById('msg').innerHTML='<span class="err">게임 서버를 켜지 못했어요</span>';
    document.getElementById('sub').textContent=m||'';
    var b=document.createElement('button');b.textContent='다시 시도';
    b.onclick=function(){location.reload()};document.querySelector('.box').appendChild(b);
  }
  (async function(){
    if(!game||!to){return fail('잘못된 요청');}
    try{
      var r=await fetch('/__dev/start?game='+encodeURIComponent(game));
      var j=await r.json();
      if(j&&j.ok){ location.replace(to); } else { fail((j&&j.error)||'실패'); }
    }catch(e){ fail(String(e&&e.message||e)); }
  })();
</script>
</body></html>`;
