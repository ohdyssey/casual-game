import { defineConfig } from 'vitest/config';

// 테스트는 tests/ 전용. (src/config/card.spec.js 등은 데이터 스펙이지 테스트가 아니므로 제외)
export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
