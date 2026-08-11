/**
 * localStorage 기반 StoragePort — 웹·설치형 PWA·웹뷰의 기본 저장 백엔드.
 *
 * 계약은 비동기지만 localStorage 는 동기라 즉시 완료된 Promise 를 돌려준다.
 * 네이티브 저장소(Capacitor Preferences 등)로 갈아끼울 때 게임 코드는 그대로다.
 */
import type { StoragePort } from './contract.js';

/** 사용 가능한 localStorage(SSR·사생활 보호 모드면 undefined). */
function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    // 일부 브라우저는 접근 자체에서 SecurityError 를 던진다.
    return undefined;
  }
}

/** 실제로 쓰기가 되는지 1회 확인 — 읽기만 되고 쓰기가 막힌 환경이 있다. */
function probeWritable(ls: Storage | undefined): boolean {
  if (!ls) return false;
  const probe = '__casual_probe__';
  try {
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function createLocalStoragePort(): StoragePort {
  const ls = safeLocalStorage();
  const available = probeWritable(ls);

  return {
    available,

    load(keys) {
      const out: Record<string, string> = {};
      if (!ls) return Promise.resolve(out);
      for (const key of keys) {
        try {
          const value = ls.getItem(key);
          if (value !== null) out[key] = value;
        } catch {
          /* 키 하나가 실패해도 나머지는 살린다 */
        }
      }
      return Promise.resolve(out);
    },

    set(key, value) {
      try {
        ls?.setItem(key, value);
      } catch {
        // 용량 초과·쓰기 차단 — 저장 실패로 판이 멈추면 안 되므로 삼킨다.
        // (저장 가능 여부는 `available` 로 미리 알 수 있다)
      }
    },

    remove(key) {
      try {
        ls?.removeItem(key);
      } catch {
        /* 무시 */
      }
    },
  };
}
