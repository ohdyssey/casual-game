/**
 * 세이브 파사드 — 비동기 백엔드를 동기 API 로 감쌌을 때 깨지기 쉬운 지점을 잠근다.
 *  · hydrate 전 읽기 = null (부팅 순서 사고를 조용히 넘기지 않는다)
 *  · 쓰기 직후 읽기 = 방금 쓴 값 (백엔드가 느려도 캐시가 일관되어야 한다)
 *  · 백엔드 실패가 게임을 죽이지 않는다
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { StoragePort } from './contract.js';
import {
  hydrateStorage,
  isStorageAvailable,
  isStorageHydrated,
  readItem,
  readJson,
  removeItem,
  writeItem,
  writeJson,
} from './gameStorage.js';

/** 지연 응답·호출 기록이 가능한 가짜 백엔드. */
function fakePort(seed: Record<string, string> = {}, available = true) {
  const data = new Map(Object.entries(seed));
  const writes: Array<[string, string]> = [];
  const removes: string[] = [];
  const port: StoragePort = {
    available,
    load: (keys) => {
      const out: Record<string, string> = {};
      for (const k of keys) {
        const v = data.get(k);
        if (v !== undefined) out[k] = v;
      }
      return Promise.resolve(out);
    },
    set: (k, v) => {
      writes.push([k, v]);
      data.set(k, v);
    },
    remove: (k) => {
      removes.push(k);
      data.delete(k);
    },
  };
  return { port, data, writes, removes };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('hydrate', () => {
  it('선언한 키만 캐시에 올린다', async () => {
    const { port } = fakePort({ a: '1', b: '2', c: '3' });
    await hydrateStorage(port, ['a', 'c']);
    expect(readItem('a')).toBe('1');
    expect(readItem('c')).toBe('3');
    expect(readItem('b')).toBeNull(); // 목록에 없으면 안 읽힌다
    expect(isStorageHydrated()).toBe(true);
  });

  it('백엔드 load 가 실패해도 빈 저장소로 부팅한다', async () => {
    const port: StoragePort = {
      available: true,
      load: () => Promise.reject(new Error('boom')),
      set: () => {},
      remove: () => {},
    };
    await expect(hydrateStorage(port, ['a'])).resolves.toBeUndefined();
    expect(readItem('a')).toBeNull();
  });

  it('available 을 그대로 노출한다', async () => {
    const { port } = fakePort({}, false);
    await hydrateStorage(port, []);
    expect(isStorageAvailable()).toBe(false);
  });
});

describe('읽기/쓰기', () => {
  it('쓰기 직후 읽으면 방금 쓴 값이 나온다(백엔드를 기다리지 않는다)', async () => {
    const { port, writes } = fakePort();
    await hydrateStorage(port, []);
    writeItem('k', 'v');
    expect(readItem('k')).toBe('v');
    expect(writes).toEqual([['k', 'v']]); // 백엔드에도 흘러갔다
  });

  it('remove 는 캐시와 백엔드 양쪽에서 지운다', async () => {
    const { port, removes } = fakePort({ k: 'v' });
    await hydrateStorage(port, ['k']);
    expect(readItem('k')).toBe('v');
    removeItem('k');
    expect(readItem('k')).toBeNull();
    expect(removes).toEqual(['k']);
  });

  it('다시 hydrate 하면 캐시가 새 백엔드 내용으로 교체된다', async () => {
    const first = fakePort({ k: 'old' });
    await hydrateStorage(first.port, ['k']);
    const second = fakePort({ k: 'new' });
    await hydrateStorage(second.port, ['k']);
    expect(readItem('k')).toBe('new');
  });
});

describe('JSON 헬퍼', () => {
  it('왕복한다', async () => {
    const { port } = fakePort();
    await hydrateStorage(port, []);
    writeJson('rec', { wins: 3, tags: ['a'] });
    expect(readJson('rec', null)).toEqual({ wins: 3, tags: ['a'] });
  });

  it('값이 없으면 fallback', async () => {
    const { port } = fakePort();
    await hydrateStorage(port, []);
    expect(readJson('none', { d: 1 })).toEqual({ d: 1 });
  });

  it('깨진 JSON 이면 예외 대신 fallback — 세이브는 손상될 수 있다', async () => {
    const { port } = fakePort({ bad: '{not json' });
    await hydrateStorage(port, ['bad']);
    expect(readJson('bad', { d: 1 })).toEqual({ d: 1 });
  });

  it('저장된 null 도 fallback 으로 본다', async () => {
    const { port } = fakePort({ n: 'null' });
    await hydrateStorage(port, ['n']);
    expect(readJson('n', { d: 1 })).toEqual({ d: 1 });
  });

  it('직렬화 불가(순환 참조)면 저장만 건너뛰고 예외를 던지지 않는다', async () => {
    const { port, writes } = fakePort();
    await hydrateStorage(port, []);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => writeJson('c', cyclic)).not.toThrow();
    expect(writes).toEqual([]);
  });
});
