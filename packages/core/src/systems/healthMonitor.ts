/**
 * Health monitor — 프로덕션에서 **게임이 실행되지 않거나(블랭크 화면) 런타임 오류가 나는 것**을 감지·기록하고,
 * 흔한 실패(스테일 서비스워커가 옛 번들을 서빙 → 청크 로드 실패)는 **자동 복구**한다.
 *
 * 정적 클라이언트 배포(현재 백엔드 파킹)라 서버 로그가 없으므로, 감시는 전부 클라이언트에서 한다.
 * 기본 싱크는 **콘솔 + sessionStorage 링버퍼 + `casual:health` CustomEvent** 다.
 *   → 외부 트래킹(Sentry)·자체 비콘은 `onEvent` 콜백 또는 `casual:health` 리스너로 **이 모듈 수정 없이** 연결한다.
 *
 * 잡는 것:
 *   ① 런타임 미처리 예외(window error)         — Phaser/게임 코드 크래시.
 *   ② 미처리 Promise rejection                 — async 실패.
 *   ③ 리소스 로드 실패(capture 단계 error)     — 이미지/스크립트/오디오 404·CORS.
 *   ④ 청크 로드 실패(Vite 동적 import)         — 재배포 후 stale SW 가 옛 번들 서빙 시 흔함 → **자동 복구**.
 *   ⑤ 부팅 타임아웃(블랭크 화면)               — N초 내 캔버스가 렌더되지 않음(조용히 죽는 가장 위험한 케이스).
 *
 * 한계(정직하게): 진입 **번들 자체**가 로드 실패하면(이 코드도 그 번들 안) 못 잡는다 — 그건 index.html 의 인라인
 *   워치독 또는 다지역 합성 모니터링(향후)으로 커버. 이 모듈은 진입 이후의 거의 모든 실패를 덮는다.
 *
 * Phaser-free(DOM 전용) → 허브·게임 양쪽에서 동일하게 import.
 */

/** 감지 이벤트 종류. */
export type HealthEventType = 'error' | 'unhandledrejection' | 'resource' | 'chunk-load' | 'boot-timeout';

/** 단일 헬스 이벤트(싱크로 전달·sessionStorage 기록). */
export interface HealthEvent {
  readonly type: HealthEventType;
  readonly message: string;
  readonly stack?: string;
  readonly source?: string; // 리소스 에러의 파일/URL
  readonly gameId?: string;
  readonly url: string; // location.href
  readonly userAgent: string;
  readonly swVersion?: string; // 활성 서비스워커 스크립트 URL(스테일 캐시 판별용)
  readonly recovered?: boolean; // 자동 복구(SW unregister+reload) 시도 여부
  readonly ts: number;
}

export interface HealthMonitorOptions {
  /** 게임 식별자(이벤트 태깅 — 어느 게임이 깨졌는지). */
  gameId?: string;
  /** 캔버스가 이 시간(ms) 내 렌더 안 되면 블랭크로 간주. 기본 12000. */
  bootTimeoutMs?: number;
  /** Phaser 캔버스가 들어가는 컨테이너 id. 기본 'game-container'. */
  containerId?: string;
  /** 청크 로드 실패 시 스테일 SW 자동 복구(unregister+caches clear+reload 1회). 기본 true. */
  autoRecoverStaleSW?: boolean;
  /** 이벤트 싱크 — 미지정 시 기본(콘솔+sessionStorage+CustomEvent). 여기에 Sentry/비콘 연결. */
  onEvent?: (e: HealthEvent) => void;
}

/** 설치 핸들 — 게임이 "준비됨"을 알리거나(블랭크 워치독 취소) 해제할 수 있다. */
export interface HealthMonitorHandle {
  /** 게임이 실제로 렌더/플레이 가능해진 시점에 호출 → 부팅 워치독 취소 + 복구 플래그 클리어. */
  markReady: () => void;
  /** 핸들러 제거(해제). */
  dispose: () => void;
}

const RECOVER_KEY = '__casual_health_sw_recovered'; // 자동복구 1회 가드(reload 루프 방지)
const LOG_KEY = '__casual_health_log'; // sessionStorage 링버퍼 키
const LOG_MAX = 20;

/** Vite 동적 import / 청크 로드 실패 메시지인가(브라우저별 문구 차이 흡수). */
export function isChunkLoadError(message: string, name?: string): boolean {
  if (name === 'ChunkLoadError') return true;
  const m = (message || '').toLowerCase();
  return (
    m.includes('failed to fetch dynamically imported module') ||
    m.includes('error loading dynamically imported module') ||
    m.includes('importing a module script failed') || // Safari
    m.includes('loading chunk') ||
    m.includes('loading css chunk')
  );
}

/** 활성 서비스워커 스크립트 URL(스테일 캐시 판별 단서). */
function activeSwUrl(): string | undefined {
  try {
    return (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller?.scriptURL) || undefined;
  } catch {
    return undefined;
  }
}

/** 기본 싱크 — 콘솔 + sessionStorage 링버퍼 + `casual:health` CustomEvent(외부 후크가 들을 수 있게). */
function defaultSink(e: HealthEvent): void {
  try {
    console.warn(`[health:${e.type}]`, e.message, e);
  } catch {
    /* noop */
  }
  try {
    const arr = JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]') as HealthEvent[];
    arr.push(e);
    while (arr.length > LOG_MAX) arr.shift();
    sessionStorage.setItem(LOG_KEY, JSON.stringify(arr));
  } catch {
    /* 저장 실패(시크릿 모드 등) 무시 */
  }
  try {
    window.dispatchEvent(new CustomEvent('casual:health', { detail: e }));
  } catch {
    /* noop */
  }
}

/** sessionStorage 에 쌓인 최근 헬스 이벤트(디버그/대시보드용). */
export function getHealthLog(): HealthEvent[] {
  try {
    return JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]') as HealthEvent[];
  } catch {
    return [];
  }
}

/**
 * 스테일 서비스워커 자동 복구 — SW 전부 해제 + 캐시 전부 삭제 → reload(1회 가드).
 * 반환: 복구를 시도했으면 true(곧 reload), 이미 시도했었으면 false(루프 방지 → 수동 주의 필요).
 */
function attemptStaleRecovery(): boolean {
  // 스테일 SW 가 실제로 페이지를 제어 중일 때만 복구(reload)한다. SW 가 없으면(개발 HMR·네트워크 원인 등)
  //   reload 해도 안 고쳐지고 루프만 도므로 복구 생략 → 리포트만(recovered:false).
  try {
    if (!(typeof navigator !== 'undefined' && navigator.serviceWorker?.controller)) return false;
  } catch {
    return false;
  }
  try {
    if (sessionStorage.getItem(RECOVER_KEY)) return false; // 이번 세션 이미 1회 시도 → 또 reload 안 함
    sessionStorage.setItem(RECOVER_KEY, String(Date.now()));
  } catch {
    return false;
  }
  const reload = (): void => {
    try {
      location.reload();
    } catch {
      /* noop */
    }
  };
  const tasks: Promise<unknown>[] = [];
  try {
    if (navigator.serviceWorker?.getRegistrations) {
      tasks.push(
        navigator.serviceWorker
          .getRegistrations()
          .then((rs) => Promise.all(rs.map((r) => r.unregister())))
          .catch(() => {}),
      );
    }
  } catch {
    /* noop */
  }
  try {
    if (typeof caches !== 'undefined' && caches.keys) {
      tasks.push(
        caches
          .keys()
          .then((ks) => Promise.all(ks.map((k) => caches.delete(k))))
          .catch(() => {}),
      );
    }
  } catch {
    /* noop */
  }
  if (tasks.length) void Promise.all(tasks).finally(reload);
  else reload();
  return true;
}

let installed: HealthMonitorHandle | null = null;

/**
 * 헬스 모니터 설치(전역 에러 핸들러 + 부팅 워치독 + 스테일 SW 자동복구). 반환 핸들로 markReady/dispose.
 * SSR/구형 환경은 no-op. 중복 설치는 기존 핸들 반환(idempotent).
 */
export function installHealthMonitor(opts: HealthMonitorOptions = {}): HealthMonitorHandle {
  if (typeof window === 'undefined') {
    return { markReady: () => {}, dispose: () => {} };
  }
  if (installed) return installed;

  const gameId = opts.gameId;
  const bootTimeoutMs = opts.bootTimeoutMs ?? 12_000;
  const containerId = opts.containerId ?? 'game-container';
  const autoRecover = opts.autoRecoverStaleSW ?? true;
  const sink = opts.onEvent ?? defaultSink;

  const emit = (e: Omit<HealthEvent, 'url' | 'userAgent' | 'ts' | 'gameId' | 'swVersion'>): void => {
    try {
      sink({
        ...e,
        gameId,
        url: location.href,
        userAgent: navigator.userAgent,
        swVersion: activeSwUrl(),
        ts: Date.now(),
      });
    } catch {
      /* 싱크 실패가 게임을 막지 않도록 격리 */
    }
  };

  // ① 런타임 예외 + ③ 리소스 로드 실패(capture 단계라야 리소스 에러를 받는다).
  const onError = (ev: Event): void => {
    const e = ev as ErrorEvent;
    const target = ev.target as (HTMLElement & { src?: string; href?: string }) | null;
    // 리소스(이미지/스크립트/오디오/CSS) 로드 실패 — target 이 엘리먼트고 error 객체가 없다.
    if (target && target !== (window as unknown as EventTarget) && (target.src || target.href)) {
      emit({ type: 'resource', message: `리소스 로드 실패: ${target.tagName}`, source: target.src || target.href });
      return;
    }
    const err = e.error as Error | undefined;
    const message = err?.message || e.message || 'unknown error';
    if (isChunkLoadError(message, err?.name)) {
      const recovered = autoRecover ? attemptStaleRecovery() : false;
      emit({ type: 'chunk-load', message, stack: err?.stack, recovered });
      return;
    }
    emit({ type: 'error', message, stack: err?.stack, source: e.filename });
  };

  // ② 미처리 Promise rejection.
  const onRejection = (ev: PromiseRejectionEvent): void => {
    const reason = ev.reason as (Error & { name?: string }) | string | undefined;
    const message = (reason instanceof Error ? reason.message : String(reason)) || 'unhandled rejection';
    const stack = reason instanceof Error ? reason.stack : undefined;
    if (isChunkLoadError(message, reason instanceof Error ? reason.name : undefined)) {
      const recovered = autoRecover ? attemptStaleRecovery() : false;
      emit({ type: 'chunk-load', message, stack, recovered });
      return;
    }
    emit({ type: 'unhandledrejection', message, stack });
  };

  window.addEventListener('error', onError, true); // capture: 리소스 에러까지
  window.addEventListener('unhandledrejection', onRejection);

  // ⑤ 부팅 워치독 — N초 내 캔버스가 렌더 안 되면 블랭크 화면으로 간주.
  let ready = false;
  const watchdog = window.setTimeout(() => {
    if (ready) return;
    let blank = true;
    try {
      const el = document.getElementById(containerId);
      const canvas = el?.querySelector('canvas') as HTMLCanvasElement | null;
      blank = !canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0;
    } catch {
      /* 측정 실패 시 보수적으로 블랭크 처리 */
    }
    if (blank) {
      emit({ type: 'boot-timeout', message: `게임이 ${bootTimeoutMs}ms 내 렌더되지 않음(블랭크 화면 의심)` });
    }
  }, bootTimeoutMs);

  const markReady = (): void => {
    if (ready) return;
    ready = true;
    window.clearTimeout(watchdog);
    // 정상 부팅 → 자동복구 플래그 클리어(다음에 진짜 스테일 SW 가 또 생기면 다시 1회 복구 허용).
    try {
      sessionStorage.removeItem(RECOVER_KEY);
    } catch {
      /* noop */
    }
  };

  const dispose = (): void => {
    window.removeEventListener('error', onError, true);
    window.removeEventListener('unhandledrejection', onRejection);
    window.clearTimeout(watchdog);
    installed = null;
  };

  installed = { markReady, dispose };
  return installed;
}

/** 전역 markReady — 셸/게임이 "준비됨"을 알린다(설치 전이면 no-op). */
export function markGameReady(): void {
  installed?.markReady();
}
