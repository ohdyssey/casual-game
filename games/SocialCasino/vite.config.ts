import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { killSW } from '../../scripts/kill-sw.mjs';

// 코어는 빌드 단계 없이 TS 소스로 직접 소비 — alias 로 src 를 가리킨다.
const coreSrc = fileURLToPath(new URL('../../packages/core/src', import.meta.url));

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
  // 포트 6207 = 라이브 라인업(…pawlink 6205·pickmeup 6206) 다음 자리.
  server: { port: 6207, host: true, strictPort: true },
  build: {
    target: 'es2020',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      // 멀티페이지: 게임(index) + 경제 콘솔(econ, 개발/디자인 툴 — Phaser-free 경량 페이지).
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        econ: fileURLToPath(new URL('./econ.html', import.meta.url)),
      },
      output: { manualChunks: { phaser: ['phaser'] } },
    },
  },
  // 게임은 허브에서 실행되는 콘텐츠 → 자체 PWA/서비스워커 없음(배포 즉시 반영 + 더블로딩 방지).
  plugins: [killSW()],
});
