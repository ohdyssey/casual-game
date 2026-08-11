import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { killSW } from '../../scripts/kill-sw.mjs';

// 코어는 빌드 단계 없이 TS 소스로 직접 소비 — alias 로 src 를 가리킨다.
const coreSrc = fileURLToPath(new URL('../../packages/core/src', import.meta.url));

/**
 * 층(Floor) 디자인 에디터 저장 엔드포인트 — dev 전용.
 * `design/floor-editor.html` 의 "💾 저장" 이 POST 한 층 팩(JSON)을
 * `public/ui/floor-levels/floorLevels.json` 로 기록 → 게임/커밋에서 그대로 사용.
 */
function saveFloorLevels(): Plugin {
  const out = fileURLToPath(new URL('./public/ui/floor-levels/floorLevels.json', import.meta.url));
  return {
    name: 'save-floor-levels',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save_floors', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            JSON.parse(body); // 유효한 JSON 인지 검증(오염 파일 방지)
            fs.mkdirSync(path.dirname(out), { recursive: true });
            fs.writeFileSync(out, body);
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: 'public/ui/floor-levels/floorLevels.json', bytes: body.length }));
          } catch (e) {
            res.statusCode = 400;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
      });
    },
  };
}

/**
 * 카드 레벨 에디터 저장 엔드포인트 — dev 전용(floor-editor 의 /__save_floors 와 동일 패턴).
 * `design/card-editor.html` 의 레벨 저장/삭제가 POST 한 레벨팩(JSON)을
 * `public/levels/cardLevels.json` 로 기록 → 게임이 그대로 로드(수동 export/이동 불필요).
 *   본문 = { kind:'cardLevels', levels:{...} } 또는 bare 레벨맵({ "1":doc, ... }) 둘 다 허용.
 */
function saveCardLevels(): Plugin {
  const out = fileURLToPath(new URL('./public/levels/cardLevels.json', import.meta.url));
  return {
    name: 'save-card-levels',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save_card_levels', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body) as Record<string, unknown>;
            // bare 맵이면 {kind,levels} 로 감싸 정규화(게임 로더가 둘 다 읽지만 파일은 팩 형식으로 통일).
            const pack = parsed && typeof parsed === 'object' && 'levels' in parsed ? parsed : { kind: 'cardLevels', levels: parsed };
            const levels = (pack as { levels?: Record<string, unknown> }).levels ?? {};
            const count = Object.keys(levels).length;
            fs.mkdirSync(path.dirname(out), { recursive: true });
            fs.writeFileSync(out, JSON.stringify(pack, null, 2) + '\n');
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: 'public/levels/cardLevels.json', count }));
          } catch (e) {
            res.statusCode = 400;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
      });
    },
  };
}

/**
 * 경제 파라미터 저장 엔드포인트 — dev 전용(card/floor 에디터와 동일 패턴).
 * `design/econ-board.html`(경제 시뮬레이션 도구)의 "게임 반영" 이 POST 한 EconParams(JSON)를
 * `public/econ/economy.json` 으로 기록 → P3 에서 게임이 경제 SSOT 로 소비 예정.
 */
function saveEconParams(): Plugin {
  const out = fileURLToPath(new URL('./public/econ/economy.json', import.meta.url));
  return {
    name: 'save-econ-params',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save_econ', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            JSON.parse(body); // 유효 JSON 검증(오염 파일 방지)
            fs.mkdirSync(path.dirname(out), { recursive: true });
            fs.writeFileSync(out, body);
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: 'public/econ/economy.json', bytes: body.length }));
          } catch (e) {
            res.statusCode = 400;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
      });
    },
  };
}

/**
 * 레벨 시뮬레이션 리포트 서빙 엔드포인트 — dev 전용, **읽기 전용**(GET).
 * `scripts/reports/level-simulation-report.json`(scripts/design-levels.mts·simulate-levels.mts 가 기록)은
 *   public/ 밖이라 브라우저에서 바로 못 읽는다 — `design/econ-board.html`「🧩 레벨설계」탭이 이걸로 가져온다.
 *   배포 번들에 안 들어가게 public/ 복제 대신 미들웨어로 디스크에서 직접 읽어 응답한다.
 */
function serveLevelReport(): Plugin {
  const src = fileURLToPath(new URL('./scripts/reports/level-simulation-report.json', import.meta.url));
  return {
    name: 'serve-level-report',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__level_report', (req, res) => {
        try {
          const body = fs.readFileSync(src, 'utf8');
          res.setHeader('content-type', 'application/json');
          res.end(body);
        } catch {
          res.statusCode = 404;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: '리포트 없음 — scripts/design-levels.mts --write 를 먼저 실행하세요' }));
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  resolve: {
    // RegExp 로 '@casual/core'(배럴)와 '@casual/core/...'(서브패스, 예: /liveops)를 구분.
    //   (객체형 prefix 매칭은 '@casual/core/liveops' 를 'index.ts/liveops' 로 잘못 치환함.)
    alias: [
      { find: new RegExp('^@casual/core$'), replacement: `${coreSrc}/index.ts` },
      { find: new RegExp('^@casual/core/'), replacement: `${coreSrc}/` },
    ],
  },
  // 포트 6209 = 라이브 라인업(…flockgo 6208) 다음 자리.
  server: { port: 6209, host: true, strictPort: true },
  build: {
    target: 'es2020',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
  // 게임은 허브에서 실행되는 콘텐츠 → 자체 PWA/서비스워커 없음(배포 즉시 반영 + 더블로딩 방지).
  plugins: [killSW(), saveFloorLevels(), saveCardLevels(), saveEconParams(), serveLevelReport()],
});
