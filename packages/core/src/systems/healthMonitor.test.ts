import { describe, it, expect } from 'vitest';
import { isChunkLoadError } from './healthMonitor.js';

describe('healthMonitor — isChunkLoadError (브라우저별 청크 로드 실패 문구 식별)', () => {
  it('Vite/Chrome/Firefox/Safari 의 동적 import 실패 문구를 인식', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module: https://x/assets/a.js')).toBe(true);
    expect(isChunkLoadError('error loading dynamically imported module')).toBe(true);
    expect(isChunkLoadError('Importing a module script failed.')).toBe(true); // Safari
    expect(isChunkLoadError('Loading chunk 5 failed.')).toBe(true);
    expect(isChunkLoadError('Loading CSS chunk 3 failed')).toBe(true);
  });

  it('name=ChunkLoadError 면 메시지와 무관하게 true', () => {
    expect(isChunkLoadError('', 'ChunkLoadError')).toBe(true);
  });

  it('일반 런타임 오류는 false (오탐 방지)', () => {
    expect(isChunkLoadError('Cannot read properties of undefined')).toBe(false);
    expect(isChunkLoadError('NetworkError when attempting to fetch resource')).toBe(false);
    expect(isChunkLoadError('')).toBe(false);
  });
});
