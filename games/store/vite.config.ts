import { defineConfig, type PluginOption } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

// 코어는 빌드 단계 없이 TS 소스로 직접 소비 (D9/H2). alias 로 src 를 가리킨다.
const coreSrc = fileURLToPath(new URL('../../packages/core/src', import.meta.url));

// ─── dev 전용: 좀비 서비스워커 자동 제거 ───
//   같은 origin(localhost:5181)에서 과거 `vite preview`(프로덕션 빌드)나 **다른 게임**(예: 낚시)
//   을 한 번 띄우면 sw.js 가 등록된 채 남아, 이후 그 origin 의 모든 네비게이션을 가로채
//   옛 precache(엉뚱한 게임!)를 계속 서빙한다. 브라우저는 SW 업데이트 체크 시 /sw.js 를
//   네트워크에서 다시 받으므로, dev 서버가 /sw.js 에 "자기 파괴" SW 를 응답하면 →
//   설치 즉시 스스로 등록 해제 + 캐시 삭제 + 클라이언트 새로고침 → 구버전/타게임 SW 가 사라진다.
const SELF_DESTROYING_SW = `// dev self-destroying service worker — auto-removes stale/foreign PWA SW.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) {}
    try { await self.registration.unregister(); } catch (e) {}
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const c of clients) { try { c.navigate(c.url); } catch (e) {} }
  })());
});
`;

function devKillServiceWorker(): PluginOption {
  return {
    name: 'dev-kill-service-worker',
    apply: 'serve', // dev 서버에서만 — preview(프로덕션 SW)에는 영향 없음
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];
        if (url === '/sw.js' || url === '/sw.js.map' || url === '/registerSW.js') {
          res.setHeader('Content-Type', 'application/javascript');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.end(url === '/sw.js' ? SELF_DESTROYING_SW : '');
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: './',
  resolve: {
    // 정규식으로 정확 매칭 — '@casual/core'(배럴)와 '@casual/core/x'(서브패스)를 구분한다.
    // (객체형 prefix 매칭은 '@casual/core/liveops' 를 '…/index.ts/liveops' 로 잘못 치환함.)
    alias: [
      { find: /^@casual\/core$/, replacement: `${coreSrc}/index.ts` },
      { find: /^@casual\/core\//, replacement: `${coreSrc}/` },
    ],
  },
  server: { port: 6181, host: true, strictPort: true },
  build: {
    target: 'es2020',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      // Phaser 는 게임 번들에 1회 포함(게임별 독립 배포라 중복 무관, H3 는 버전 단일화로 보장).
      output: { manualChunks: { phaser: ['phaser'] } },
    },
  },
  plugins: [
    devKillServiceWorker(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '열정편의점',
        short_name: '열정편의점',
        description: '진열 정렬 퍼즐 — 같은 상품을 모아 진열대를 정리하세요',
        lang: 'ko',
        display: 'standalone',
        display_override: ['standalone'],
        orientation: 'portrait',
        background_color: '#F4C6CE',
        theme_color: '#3CB54A',
        start_url: './',
        scope: './',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
});
