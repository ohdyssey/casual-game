import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { killSW } from '../../scripts/kill-sw.mjs';

/**
 * 빌드 타겟 — vite `--mode` 로 고른다(`vite build --mode adsense`). 기본(모드 미지정/development/
 * production)은 `web`. 타겟이 바뀌면 `@store` alias 가 `src/store/<target>.ts` 로 스왑된다
 * (2026-09-02, 틱택토와 같은 패턴으로 리팩터링 — 기존 `build`/`build:toss` 는 둘 다 `web` 타겟
 * 그대로라 동작 불변, `build:toss` 는 후처리 스크립트만 추가로 돈다).
 */
const TARGETS = ['web', 'adsense', 'toss'] as const;
type Target = (typeof TARGETS)[number];
function targetOf(mode: string): Target {
  return (TARGETS as readonly string[]).includes(mode) ? (mode as Target) : 'web';
}

// 코어는 빌드 단계 없이 TS 소스로 직접 소비 — alias 로 src 를 가리킨다.
const coreSrc = fileURLToPath(new URL('../../packages/core/src', import.meta.url));

export default defineConfig(({ mode }) => {
  const target = targetOf(mode);
  const storeAdapter = fileURLToPath(new URL(`./src/store/${target}.ts`, import.meta.url));

  return {
    base: './',
    resolve: {
      // RegExp 로 '@casual/core'(배럴)와 '@casual/core/...'(서브패스, 예: /liveops)를 구분.
      //   (객체형 prefix 매칭은 '@casual/core/liveops' 를 'index.ts/liveops' 로 잘못 치환함.)
      alias: [
        { find: new RegExp('^@casual/core$'), replacement: `${coreSrc}/index.ts` },
        { find: new RegExp('^@casual/core/'), replacement: `${coreSrc}/` },
        { find: new RegExp('^@store$'), replacement: storeAdapter },
      ],
    },
    server: { port: 6197, host: true, strictPort: true },
    build: {
      target: 'es2020',
      sourcemap: true,
      chunkSizeWarningLimit: 1500,
      rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
    },
    // 게임은 허브에서 실행되는 콘텐츠 → 자체 PWA/서비스워커 없음(배포 즉시 반영 + 더블로딩 방지).
    plugins: [killSW()],
  };
});
