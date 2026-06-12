import { defineConfig } from 'vite';

// 허브는 게임을 '고르는 입구'일 뿐 — 순수 HTML/CSS 한 장. PWA/Phaser 불필요.
// 게임으로의 이동은 iframe 이 아니라 전체 페이지 내비게이션(games.config.js 의 url).
export default defineConfig({
  base: './',
  server: { port: 5180, host: true, strictPort: true },
  build: { target: 'es2020', sourcemap: true },
});
