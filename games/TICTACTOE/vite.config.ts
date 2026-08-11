import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';
import { killSW } from '../../scripts/kill-sw.mjs';

/**
 * 빌드 타겟 — vite `--mode` 로 고른다(`vite build --mode msstore`). 타겟이 바뀌면 셋이 함께 바뀐다:
 *   ① `@store` alias → 광고·결제·셸 어댑터 (src/store/<target>.ts)
 *   ② PWA 여부       → msstore 만 매니페스트+서비스워커, 나머지는 killSW
 *   ③ base 경로      → msstore 는 루트 설치형, 나머지는 상대경로(허브 하위 배포)
 *
 * ⚠️ 어댑터를 **런타임이 아니라 빌드 시점에** 고르는 이유: 런타임 분기로 두면 토스 SDK 가
 *    MS Store 번들에 실려 들어가고, 동작하지 않는 기능이 스토어 심사에 노출된다.
 * ⚠️ 환경변수(VITE_TARGET) 대신 --mode 를 쓰는 이유: Windows 의 npm 스크립트는 cmd 로 돌아
 *    `VAR=x cmd` 접두 문법이 통하지 않는다. --mode 는 OS 를 타지 않는다.
 *    (mode 를 바꿔도 `vite build` 는 NODE_ENV=production 이라 import.meta.env.DEV 는 그대로다)
 */
const TARGETS = ['web', 'toss', 'msstore', 'android', 'ios'] as const;
type Target = (typeof TARGETS)[number];

/** mode → 빌드 타겟. development/production 같은 기본 모드는 web 으로 본다. */
function targetOf(mode: string): Target {
  return (TARGETS as readonly string[]).includes(mode) ? (mode as Target) : 'web';
}

// 코어는 빌드 단계 없이 TS 소스로 직접 소비 — alias 로 src 를 가리킨다.
const coreSrc = fileURLToPath(new URL('../../packages/core/src', import.meta.url));
// 게임 규칙(보드·Elo)도 같은 방식. 대전 서버(services/ttt-api)가 같은 소스를 import 해
// 모든 착수를 재검증하므로 규칙이 한 벌로 유지된다.
const rulesSrc = fileURLToPath(new URL('../../packages/ttt-rules/src', import.meta.url));

/** MS Store(PWA) 전용 — 매니페스트 + 오프라인 서비스워커. */
const pwaPlugin = () =>
  VitePWA({
    registerType: 'autoUpdate',
    injectRegister: 'auto',
    manifest: {
      id: '/',
      start_url: '/',
      scope: '/',
      name: '틱택토 네온',
      short_name: '틱택토 네온',
      description: '3개 말이 순환 이동하는 변형 틱택토. AI 스터디 · 싱글 · 대전 모드.',
      lang: 'ko',
      dir: 'ltr',
      categories: ['games'],
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#0A0714',
      theme_color: '#0A0714',
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        {
          src: 'icons/icon-512-maskable.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      // m4a 를 빼면 설치형 PWA 가 오프라인에서 무음이 된다(효과음·BGM 전부 캐시 대상).
      globPatterns: ['**/*.{js,css,html,png,jpg,webp,woff2,json,m4a}'],
      // Phaser 번들과 배경 아트가 커서 기본 상한(2MB)에 걸린다 — 오프라인 동작이 PWA 요건이라 올린다.
      maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
    },
  });

export default defineConfig(({ mode }) => {
  const target = targetOf(mode);
  const isMsStore = target === 'msstore';
  const storeAdapter = fileURLToPath(new URL(`./src/store/${target}.ts`, import.meta.url));

  return {
    // 설치형 PWA 는 루트에서 뜬다(상대경로면 start_url/scope 와 어긋난다).
    base: isMsStore ? '/' : './',
    resolve: {
      // RegExp 로 '@casual/core'(배럴)와 '@casual/core/...'(서브패스)를 구분.
      alias: [
        { find: new RegExp('^@casual/core$'), replacement: `${coreSrc}/index.ts` },
        { find: new RegExp('^@casual/core/'), replacement: `${coreSrc}/` },
        { find: new RegExp('^@casual/ttt-rules$'), replacement: `${rulesSrc}/index.ts` },
        { find: new RegExp('^@casual/ttt-rules/'), replacement: `${rulesSrc}/` },
        { find: new RegExp('^@store$'), replacement: storeAdapter },
      ],
    },
    server: { port: 6211, host: true, strictPort: true },
    build: {
      // ⚠️ msstore 산출물은 **다른 폴더**로 뺀다. 같은 `dist` 를 쓰면
      //    `scripts/assemble-deploy.mjs` 가 그걸 그대로 `deploy/tictactoe/` 로 복사하는데,
      //    msstore 빌드는 base 가 '/' 라 허브 하위 경로(/tictactoe/)에서 자산을 전부 놓친다.
      //    "라이브가 갑자기 흰 화면" 으로 나타나고 원인 찾기가 어렵다.
      outDir: isMsStore ? 'dist-msstore' : 'dist',
      target: 'es2020',
      sourcemap: true,
      chunkSizeWarningLimit: 1500,
      // 대전 SDK(@supabase/supabase-js)는 여기 없다 — net/client.ts 가 동적 import 로
      // 불러오므로 rollup 이 알아서 별도 청크로 떼고, 대전에 들어갈 때만 내려받는다.
      rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
    },
    // msstore 만 설치형 PWA. 나머지는 허브에서 실행되는 콘텐츠라 자체 서비스워커를 두지 않는다.
    plugins: isMsStore ? [pwaPlugin()] : [killSW()],
  };
});
