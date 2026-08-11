/**
 * 디퍼드 딥링크 부트스트랩 단위 테스트 — 1단계(목 구현) 기준.
 * 저장소·플러그인·라우팅을 전부 주입해 실제 브라우저/네이티브 없이 전체 흐름을 검증한다.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  HANDLED_FLAG_KEY,
  runDeferredLinkBootstrap,
  withTimeout,
  type BootstrapDeps,
} from './bootstrap.js';
import { type DeferredLinkResult, NO_DEFERRED_LINK } from './types.js';
import { type PreferencesLike } from './preferences.js';

/** 메모리 저장소 — Capacitor Preferences 모양 그대로. */
function memoryPrefs(initial: Record<string, string> = {}): PreferencesLike & {
  store: Map<string, string>;
} {
  const store = new Map(Object.entries(initial));
  return {
    store,
    async get({ key }) {
      return { value: store.get(key) ?? null };
    },
    async set({ key, value }) {
      store.set(key, value);
    },
  };
}

/** 주입 deps 한 벌 — 기본은 "딥링크 없음 + 모든 게임 존재 + 진입 성공". */
function makeDeps(overrides: Partial<BootstrapDeps> = {}) {
  const prefs = memoryPrefs();
  const plugin = { getTargetGameId: vi.fn(async (): Promise<DeferredLinkResult> => NO_DEFERRED_LINK) };
  const loadGameScene = vi.fn((_slug: string) => true);
  const deps: BootstrapDeps = {
    plugin,
    prefs,
    hasGame: () => true,
    loadGameScene,
    timeoutMs: 3000,
    ...overrides,
  };
  return { deps, prefs, plugin, loadGameScene };
}

describe('디퍼드 딥링크 부트스트랩', () => {
  it('최초 실행 + 딥링크 없음(목 구현) → 기본 허브 진입, 게임 이동 없음', async () => {
    const { deps, loadGameScene } = makeDeps();
    expect(await runDeferredLinkBootstrap(deps)).toBe('default');
    expect(loadGameScene).not.toHaveBeenCalled();
  });

  it('최초 실행 완료 후 deferred_link_handled 플래그가 true 로 저장된다', async () => {
    const { deps, prefs } = makeDeps();
    await runDeferredLinkBootstrap(deps);
    expect(prefs.store.get(HANDLED_FLAG_KEY)).toBe('true');
  });

  it('재실행(플래그 true) → 딥링크 조회 자체가 발생하지 않는다', async () => {
    const { deps, plugin } = makeDeps({
      prefs: memoryPrefs({ [HANDLED_FLAG_KEY]: 'true' }),
    });
    expect(await runDeferredLinkBootstrap(deps)).toBe('skipped');
    expect(plugin.getTargetGameId).not.toHaveBeenCalled();
  });

  it('유효한 gameId → 해당 게임으로 진입(deferred), 플래그도 저장', async () => {
    const { deps, prefs, loadGameScene } = makeDeps({
      plugin: { getTargetGameId: async () => ({ gameId: 'tictactoe', source: 'referrer' }) },
    });
    expect(await runDeferredLinkBootstrap(deps)).toBe('deferred');
    expect(loadGameScene).toHaveBeenCalledWith('tictactoe');
    expect(prefs.store.get(HANDLED_FLAG_KEY)).toBe('true');
  });

  it('레지스트리에 없는 gameId → 기본 허브 폴백', async () => {
    const { deps, loadGameScene } = makeDeps({
      plugin: { getTargetGameId: async () => ({ gameId: 'no_such_game', source: 'referrer' }) },
      hasGame: () => false,
    });
    expect(await runDeferredLinkBootstrap(deps)).toBe('default');
    expect(loadGameScene).not.toHaveBeenCalled();
  });

  it('게임 진입 자체가 실패(loadGameScene=false) → 기본 허브 폴백', async () => {
    const { deps } = makeDeps({
      plugin: { getTargetGameId: async () => ({ gameId: 'tictactoe', source: 'referrer' }) },
      loadGameScene: () => false,
    });
    expect(await runDeferredLinkBootstrap(deps)).toBe('default');
  });

  it('저장소 읽기/쓰기가 예외를 던져도 크래시 없이 기본 허브 폴백', async () => {
    const broken: PreferencesLike = {
      get: async () => {
        throw new Error('storage unavailable');
      },
      set: async () => {
        throw new Error('storage unavailable');
      },
    };
    const { deps } = makeDeps({ prefs: broken });
    expect(await runDeferredLinkBootstrap(deps)).toBe('default');
  });

  it('플러그인이 예외를 던져도 기본 허브 폴백', async () => {
    const { deps } = makeDeps({
      plugin: {
        getTargetGameId: async () => {
          throw new Error('native bridge missing');
        },
      },
    });
    expect(await runDeferredLinkBootstrap(deps)).toBe('default');
  });
});

describe('withTimeout', () => {
  it('제한시간 안에 응답하면 실제 값을 돌려준다', async () => {
    expect(await withTimeout(Promise.resolve('fast'), 1000, 'fallback')).toBe('fast');
  });

  it('제한시간을 넘기면 fallback 을 돌려준다', async () => {
    vi.useFakeTimers();
    try {
      // 지연 응답 mock — 실제 네이티브 조회가 느린 상황을 재현한다.
      const slow = new Promise<string>((resolve) => setTimeout(() => resolve('slow'), 10_000));
      const race = withTimeout(slow, 3000, 'fallback');
      await vi.advanceTimersByTimeAsync(3000);
      expect(await race).toBe('fallback');
    } finally {
      vi.useRealTimers();
    }
  });

  it('느린 플러그인(3초 초과)이면 부트스트랩이 "없음"으로 처리하고 기본 허브로 간다', async () => {
    vi.useFakeTimers();
    try {
      const never = new Promise<DeferredLinkResult>(() => {}); // 영원히 응답 없음
      const { deps, loadGameScene, prefs } = makeDeps({
        plugin: { getTargetGameId: () => never },
        timeoutMs: 3000,
      });
      const run = runDeferredLinkBootstrap(deps);
      await vi.advanceTimersByTimeAsync(3000);
      expect(await run).toBe('default');
      expect(loadGameScene).not.toHaveBeenCalled();
      expect(prefs.store.get(HANDLED_FLAG_KEY)).toBe('true'); // 타임아웃도 "처리됨"이다
    } finally {
      vi.useRealTimers();
    }
  });
});
