import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { uiEditorVitePlugins } from '@ohdyssey/phaser-ui-editor/vite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// ─── dev 전용: 좀비 서비스워커 자동 제거 ───
//   같은 origin(localhost:5175)에서 `vite preview`(프로덕션 빌드)를 한 번 띄우면 sw.js 가
//   등록된 채 남아, 이후 dev 서버의 최신 코드를 가로채고 옛 precache 를 계속 서빙한다.
//   브라우저는 기존 SW 업데이트 체크 시 /sw.js 를 네트워크에서 다시 받으므로,
//   dev 서버가 /sw.js 에 "자기 파괴" SW 를 응답하면 → 설치 즉시 스스로 등록 해제 +
//   캐시 삭제 + 클라이언트 새로고침 → 사용자 조작 없이 구버전 SW 가 사라진다.
const SELF_DESTROYING_SW = `// dev self-destroying service worker — auto-removes stale PWA SW.
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

function devKillServiceWorker() {
  return {
    name: 'dev-kill-service-worker',
    apply: 'serve',                 // dev 서버에서만 — preview(프로덕션 SW)에는 영향 없음
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


// dev 서버를 LAN(0.0.0.0)에 노출할지 여부 — 기본 loopback(127.0.0.1)으로만 바인딩한다.
//   uiEditorVitePlugins 가 인증 없는 파일-쓰기 엔드포인트(__ui_layout / __ui_asset)를
//   dev 서버에 등록하므로, host: true 로 모든 인터페이스에 열면 같은 LAN 의 임의 기기가
//   개발자 작업 트리에 파일을 쓸 수 있다(SEC-02). 의도적으로 LAN 공유가 필요할 때만
//   `VITE_HOST=1`(또는 true) 로 켠다. 켜면 dev 편의(모바일 실기 테스트 등)는 그대로 유지된다.
const EXPOSE_DEV_HOST = /^(1|true)$/i.test(process.env.VITE_HOST || '');

// ─── dev 전용: 에디터 소스 직접 브리지 (배포 안전) ───
//   EDITOR_LINK=1 일 때만, 비공개 패키지 @ohdyssey/phaser-ui-editor 의 설치본(node_modules) 대신
//   형제 repo(../phaser-ui-editor)의 src 를 직접 alias 한다 → 에디터를 별도 창에서 수정하면
//   이 게임 dev 서버(HMR)에 즉시 반영(태그/npm install 불필요). "두 창" 워크플로용.
//   ⚠ env 미설정(프로덕션/Vercel)에선 alias 가 0개 → git 의존성 그대로 사용하므로 배포에 영향 0.
//   ⚠ package.json 을 건드리지 않으므로, 커밋/배포는 EDITOR_LINK 여부와 무관하게 항상 안전하다.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EDITOR_LINK = /^(1|true)$/i.test(process.env.EDITOR_LINK || '');
const EDITOR_SRC = process.env.EDITOR_SRC
  ? path.resolve(process.env.EDITOR_SRC)
  : path.resolve(__dirname, '../phaser-ui-editor/src');
const EDITOR_PKG = '@ohdyssey/phaser-ui-editor';
const editorBridgeActive = EDITOR_LINK && fs.existsSync(path.join(EDITOR_SRC, 'index.js'));
if (EDITOR_LINK && !editorBridgeActive) {
  console.warn(`[editor-bridge] EDITOR_LINK=1 이지만 에디터 src 를 못 찾음: ${EDITOR_SRC} — node_modules 설치본으로 폴백.`);
} else if (editorBridgeActive) {
  console.log(`[editor-bridge] 활성 — ${EDITOR_PKG} → ${EDITOR_SRC} (라이브 소스; 프로덕션/배포엔 미반영)`);
}
// 패키지 exports 맵과 1:1 (정확매칭 regex — bare 패키지명이 서브패스를 가로채지 않도록 $ 로 고정).
const editorAlias = editorBridgeActive ? [
  { find: new RegExp(`^${EDITOR_PKG}$`),        replacement: path.join(EDITOR_SRC, 'index.js') },
  { find: new RegExp(`^${EDITOR_PKG}/editor$`), replacement: path.join(EDITOR_SRC, 'editor/UiEditorScene.js') },
  { find: new RegExp(`^${EDITOR_PKG}/schema$`), replacement: path.join(EDITOR_SRC, 'schema/layoutSchema.js') },
  { find: new RegExp(`^${EDITOR_PKG}/bind$`),   replacement: path.join(EDITOR_SRC, 'schema/layoutBind.js') },
  { find: new RegExp(`^${EDITOR_PKG}/vite$`),   replacement: path.join(EDITOR_SRC, 'vite/plugins.js') },
] : [];

export default defineConfig({
  base: './',
  resolve: {
    dedupe: ['phaser'],            // 링크된 에디터 소스도 게임의 단일 phaser 인스턴스를 쓰도록(중복 인스턴스 방지)
    alias: editorAlias,            // EDITOR_LINK=1 일 때만 비어있지 않음 — 그 외엔 [] 라 배포 영향 0
  },
  server: {
    port: 5175,
    host: EXPOSE_DEV_HOST,         // 기본 loopback — VITE_HOST=1 일 때만 0.0.0.0(전체 LAN)
    fs: editorBridgeActive ? { allow: [__dirname, EDITOR_SRC] } : undefined,  // 브리지 시 형제 repo src 서빙 허용
  },
  build: {
    target: 'es2020',
    // 프로덕션 빌드에 source map(sourcesContent 포함)을 퍼블리시하지 않는다(SEC-01):
    //   Vercel 이 dist/ 를 그대로 배포하므로 sourcemap: true 면 원본 게임 로직·경제/밸런스
    //   공식이 공개 URL 의 .map 으로 노출된다. 별도 .map 업로드/스트립 파이프라인이 없으므로
    //   false 로 두어 .map 자체를 emit 하지 않는다('hidden' 도 dist/ 에 .map 을 남겨 그대로 배포됨).
    //   에러추적용 맵이 필요해지면 'hidden' + 배포 전 *.map 스트립 단계를 추가할 것.
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  plugins: [
    devKillServiceWorker(),
    // UI 저작도구 저장 엔드포인트(패키지) — 게임의 기존 경로 유지.
    ...uiEditorVitePlugins({
      publicDir: 'public',
      defaultLayoutFile: 'card.layout.json',
      layoutFilePattern: /^ui\/layouts\/[a-z0-9_-]+\.json$/i,
      uploadDir: 'ui/card/uploads',
      manifestPath: 'card.assets.json',
    }),
    VitePWA({
      // 'autoUpdate' — 새 버전 자동 적용(리로드). prompt+defer 는 기기가 갱신을 못 받아(구버전 SW 고착)
      //   수정이 반영 안 되는 문제 → autoUpdate 로 복귀. 리로드 구간은 부트 스플래시가 덮어 청색 노출 없음.
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.png'],
      manifest: {
        name: 'Fishing Game',
        short_name: 'Fishing',
        description: '세로형 낚시 게임 — 물고기를 낚아 도감을 채우세요',
        lang: 'ko',
        // 풀스크린: 설치 후 브라우저 UI / 상태바 없이 실행
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'portrait',
        background_color: '#062a55',
        theme_color: '#0a2540',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 앱 셸(코드·HTML)만 프리캐시 — 25MB 미디어는 런타임 캐시로 분리해 설치를 가볍게
        globPatterns: ['**/*.{js,css,html}', 'icons/*.png'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // phaser 청크(~1.5MB) 수용
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // 스프라이트·UI·사운드 등 미디어 에셋 — 최초 사용 시 캐시, 이후 오프라인 동작
            urlPattern: ({ url }) => /\/(sprites|ui|sound)\//.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              // 캐시 이름 bump (v3): 고정 파일명 미디어가 CacheFirst 로 영구 캐시되어
              //   에셋 교체(예: fishing_effect 2048→1024, 로딩화면 Loding_BG_01 교체)가
              //   기존 기기에 반영되지 않던 문제 → 이름을 바꿔 옛 캐시를 버리고 신규 에셋을
              //   다시 받게 한다. v2→v3: 사용자 보고 "구 로딩 이미지가 잠깐 떴다 사라짐".
              cacheName: 'fishing-media-v3',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // dev 모드에선 SW 비활성 (HMR 충돌 방지)
      },
    }),
  ],
});
