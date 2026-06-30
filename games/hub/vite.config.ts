import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { devOnDemandGames } from './dev/on-demand-games';

// 코어는 빌드 단계 없이 TS 소스로 직접 소비 — alias 로 src 를 가리킨다(게임들과 동일).
// 허브는 게임을 '고르는 입구' + 포털 계정/경제(LiveOps) 관리자(@casual/core/liveops).
// 게임으로의 이동은 iframe 이 아니라 전체 페이지 내비게이션/팝업(games.config.js 의 url).
const coreSrc = fileURLToPath(new URL('../../packages/core/src', import.meta.url));

export default defineConfig({
  base: './',
  // 빌드 상수 주입 — '게임 실행 가능한 플레이 사이트' 빌드는 `PLAY_OPEN=true` 로 띄운다.
  //   launcher.ts 의 게이트(PLAY_BLOCKED)를 완전 개방. 기본(ryanlogic.kr) 빌드는 false.
  //   Vite env 파일 대신 node process.env 를 여기서 읽어 define → 환경 비종속·견고.
  define: {
    __PLAY_OPEN__: JSON.stringify(process.env.PLAY_OPEN === 'true'),
  },
  resolve: {
    // 정규식으로 정확 매칭 — '@casual/core'(배럴)와 '@casual/core/liveops'(서브패스)를 구분한다.
    // (객체형 prefix 매칭은 '@casual/core/liveops' 를 '…/index.ts/liveops' 로 잘못 치환함.)
    alias: [
      { find: /^@casual\/core$/, replacement: `${coreSrc}/index.ts` },
      { find: /^@casual\/core\//, replacement: `${coreSrc}/` },
    ],
  },
  // open: true → `npm run dev` 실행 시 기본 브라우저가 허브 홈(localhost:5180)으로 자동 오픈.
  server: { port: 5180, host: true, strictPort: true, open: true },
  build: { target: 'es2020', sourcemap: true },
  plugins: [
    // dev 전용: 허브에서 게임 카드를 누르면 그 게임 dev 서버를 그때 자동 기동(온디맨드).
    //   허브만 띄워도 게임이 열리고, 보는 게임만 메모리를 쓴다. 운영 빌드엔 영향 없음(apply:'serve').
    devOnDemandGames(),
    // 허브를 설치형 PWA 로 — 홈 화면 추가 시 주소창 없는 standalone 실행.
    // 배포 구조: 허브=/hub/, 게임=형제 /store/ 등(한 origin). 두 스코프를 분리한다:
    //   · SW 등록 scope=/hub/  → 허브 SW 는 게임 경로(/store/ 등)를 가로채지 않음(게임은 각자 SW 보유).
    //   · manifest scope=/     → 설치 후 게임으로 이동해도 앱 창(standalone) 밖으로 안 나감(주소창 X).
    VitePWA({
      registerType: 'autoUpdate',
      scope: '/hub/',
      includeAssets: ['icons/apple-touch-icon-180.png'],
      manifest: {
        name: 'PlayPOP',
        short_name: 'PlayPOP',
        description: '여러 캐주얼 게임을 한 곳에서 — PlayPOP 게임 허브',
        lang: 'ko',
        // fullscreen: 상태바·내비영역까지 숨겨 뒤로가기 제스처 표면을 줄인다(안드로이드는
        // 첫 백을 "풀스크린 해제"로 흡수). 미지원 브라우저는 display_override 순서대로
        // fullscreen→standalone 폴백. 게임은 이 허브 scope(/) 안에서 돌아 모드를 상속한다.
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        scope: '/',
        start_url: '/hub/',
        background_color: '#0B1020',
        theme_color: '#0B1020',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 앱 셸만 프리캐시(js/css/html/manifest + 아이콘). 카드 키아트(art/*, 100MB+)는
        // 런타임 네트워크 로드 — 프리캐시하면 설치가 과도하게 무거워진다.
        globPatterns: ['**/*.{js,css,html,webmanifest}', 'icons/*.png'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
});
