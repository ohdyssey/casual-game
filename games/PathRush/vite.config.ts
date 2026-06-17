import { defineConfig, type PluginOption } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

// 코어는 빌드 단계 없이 TS 소스로 직접 소비 — alias 로 src 를 가리킨다(형제 게임 계승).
const coreSrc = fileURLToPath(new URL('../../packages/core/src', import.meta.url));

// ─── dev 전용: 좀비 서비스워커 자동 제거 ───
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
    apply: 'serve',
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
    alias: {
      '@casual/core': `${coreSrc}/index.ts`,
      '@casual/core/': `${coreSrc}/`,
    },
  },
  server: { port: 6204, host: true, strictPort: true },
  build: {
    target: 'es2020',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: { manualChunks: { phaser: ['phaser'] } },
    },
  },
  plugins: [
    devKillServiceWorker(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '패스러시',
        short_name: '패스러시',
        description: '시작점에서 인접 칸으로 한 붓에 모든 타일을 이어 도착점에 닿는 타임어택 경로 퍼즐',
        lang: 'ko',
        display: 'standalone',
        display_override: ['standalone'],
        orientation: 'portrait',
        background_color: '#2a1430',
        theme_color: '#F2719C',
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
