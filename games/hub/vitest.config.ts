import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// 코어는 빌드 없이 TS 소스로 소비 — vite.config.ts 와 같은 alias 규약.
const coreSrc = fileURLToPath(new URL('../../packages/core/src', import.meta.url));

export default defineConfig({
  // launcher.ts 가 쓰는 빌드 상수(vite.config 의 define) — 테스트에서도 정의돼야 import 이 안 죽는다.
  define: { __PLAY_OPEN__: 'false' },
  resolve: {
    alias: [
      { find: /^@casual\/core$/, replacement: `${coreSrc}/index.ts` },
      { find: /^@casual\/core\//, replacement: `${coreSrc}/` },
    ],
  },
});
