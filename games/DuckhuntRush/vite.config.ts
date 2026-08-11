import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { killSW } from '../../scripts/kill-sw.mjs';

// 코어는 빌드 단계 없이 TS 소스로 직접 소비 — alias 로 src 를 가리킨다.
const coreSrc = fileURLToPath(new URL('../../packages/core/src', import.meta.url));

export default defineConfig({
  base: './',
  resolve: {
    // ⚠ Phaser 4 파일럿(이 게임 한정): DuckhuntRush 만 nested phaser@4.1, 형제 게임은 루트 phaser@3.90.
    //   @casual/core 를 소스(alias)로 소비하므로 core 의 `import Phaser` 가 루트 3.90 으로 새면 한 번들에
    //   phaser 2벌이 섞인다. dedupe 로 게임의 단일 phaser(=nested 4.1) 인스턴스로 강제한다(eco01/fishngo 동일 패턴).
    dedupe: ['phaser'],
    // RegExp 로 '@casual/core'(배럴)와 '@casual/core/...'(서브패스, 예: /liveops)를 구분.
    //   (객체형 prefix 매칭은 '@casual/core/liveops' 를 'index.ts/liveops' 로 잘못 치환함.)
    alias: [
      { find: new RegExp('^@casual/core$'), replacement: `${coreSrc}/index.ts` },
      { find: new RegExp('^@casual/core/'), replacement: `${coreSrc}/` },
    ],
  },
  server: { port: 6201, host: true, strictPort: true },
  build: {
    target: 'es2020',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
  // 게임은 허브에서 실행되는 콘텐츠 → 자체 PWA/서비스워커 없음(배포 즉시 반영 + 더블로딩 방지).
  plugins: [killSW()],
});
