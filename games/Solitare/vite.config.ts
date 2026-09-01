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

/**
 * 빌드 산출물의 **레벨 팩을 minify** 한다(빌드 전용 — dev/에디터가 쓰는 원본은 그대로 둔다).
 *
 * 레벨이 3,000판이 되면서 `public/levels/cardLevels.json` 이 **25.5MB** 가 됐다. 그 대부분이
 * 들여쓰기 공백이다 — 사람이 여는 파일이 아니라 **에디터가 읽고 쓰는 데이터**라 배포본에서는
 * 의미가 없다. minify 하면 25.5MB → **10.2MB**(gzip 1.12MB)로 줄고 파싱도 그만큼 빨라진다.
 *
 * ⚠️ 원본(`public/`)은 건드리지 않는다 — 카드 레벨 에디터가 저장할 때 `JSON.stringify(pack, null, 2)`
 *   로 다시 쓰므로, 원본을 minify 해 봐야 다음 저장에 되돌아온다. 줄이는 자리는 **빌드 출력**이다.
 * ⚠️ 호스트가 gzip 을 안 걸어 줄 수도 있으므로 **압축에 기대지 않고** 원본 바이트부터 줄인다.
 */
function minifyLevelPack(): Plugin {
  return {
    name: 'minify-level-pack',
    apply: 'build',
    closeBundle() {
      const out = fileURLToPath(new URL('./dist/levels/cardLevels.json', import.meta.url));
      if (!fs.existsSync(out)) return;
      const before = fs.statSync(out).size;
      fs.writeFileSync(out, JSON.stringify(JSON.parse(fs.readFileSync(out, 'utf8'))));
      const after = fs.statSync(out).size;
      const mb = (n: number): string => (n / 1048576).toFixed(2);
      console.log(`  levels/cardLevels.json  ${mb(before)}MB → ${mb(after)}MB (minify)`);
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
  plugins: [killSW(), saveFloorLevels(), saveCardLevels(), saveEconParams(), serveLevelReport(), minifyLevelPack()],
});
