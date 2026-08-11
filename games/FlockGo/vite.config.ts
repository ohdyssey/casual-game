import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { killSW } from '../../scripts/kill-sw.mjs';

// 코어는 빌드 단계 없이 TS 소스로 직접 소비 — alias 로 src 를 가리킨다.
const coreSrc = fileURLToPath(new URL('../../packages/core/src', import.meta.url));

export default defineConfig({
  base: './',
  resolve: {
    // RegExp 로 '@casual/core'(배럴)와 '@casual/core/...'(서브패스)를 구분.
    alias: [
      { find: new RegExp('^@casual/core$'), replacement: `${coreSrc}/index.ts` },
      { find: new RegExp('^@casual/core/'), replacement: `${coreSrc}/` },
    ],
  },
  // 포트 6208 = 라이브 라인업(…pickmeup 6206·socialcasino 6207) 다음 자리.
  server: { port: 6208, host: true, strictPort: true },
  build: {
    target: 'es2020',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
  // 게임은 허브에서 실행되는 콘텐츠 → 자체 PWA/서비스워커 없음(배포 즉시 반영 + 더블로딩 방지).
  plugins: [killSW()],
});
