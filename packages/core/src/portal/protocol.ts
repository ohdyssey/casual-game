/**
 * Portal protocol — 허브 ↔ 게임 핸드오프 메시지 계약 (Phaser-free).
 *
 * 허브(Phaser-free)가 직접 import 한다 — 여기엔 Phaser 의존을 절대 두지 않는다.
 * 게임 측 전송/수신·START 버튼 로직은 ./bridge.ts (Phaser 의존).
 *
 * 흐름: 허브가 게임을 `?portal=<hubOrigin>` 으로 연다(팝업/이동) → 게임 브릿지가
 *   opener(허브)로 hello → loading(0..1) → ready 를 보낸다 → 사용자가 인게임 START →
 *   started. 허브는 수신 origin 을 허용 목록과 대조해 검증한다.
 */

/** 모든 포털 메시지의 네임스페이스(무관한 postMessage 와 구분). */
export const PORTAL_NS = 'playpop' as const;

/** 게임 URL 에 붙는 쿼리 파라미터 키. 값 = 허브 origin(검증·targetOrigin 용). */
export const PORTAL_PARAM = 'portal';

/** 게임 → 허브. */
export type GameToHub =
  | { ns: typeof PORTAL_NS; type: 'hello'; id?: string }
  | { ns: typeof PORTAL_NS; type: 'loading'; progress: number }
  | { ns: typeof PORTAL_NS; type: 'ready' }
  | { ns: typeof PORTAL_NS; type: 'started' }
  | { ns: typeof PORTAL_NS; type: 'exit' };

/** 허브 → 게임. */
export type HubToGame = { ns: typeof PORTAL_NS; type: 'ack' };

export type PortalMsg = GameToHub | HubToGame;
export type PortalMsgType = PortalMsg['type'];

/** 메시지 팩토리 — postMessage 페이로드 생성(항상 ns 포함). */
export const msg = {
  hello: (id?: string): GameToHub => ({ ns: PORTAL_NS, type: 'hello', id }),
  loading: (progress: number): GameToHub => ({ ns: PORTAL_NS, type: 'loading', progress }),
  ready: (): GameToHub => ({ ns: PORTAL_NS, type: 'ready' }),
  started: (): GameToHub => ({ ns: PORTAL_NS, type: 'started' }),
  exit: (): GameToHub => ({ ns: PORTAL_NS, type: 'exit' }),
  ack: (): HubToGame => ({ ns: PORTAL_NS, type: 'ack' }),
} as const;

const KNOWN_TYPES: ReadonlySet<string> = new Set([
  'hello',
  'loading',
  'ready',
  'started',
  'exit',
  'ack',
]);

/** 0..1 로 클램프(NaN/Infinity 방어). */
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * 신뢰 못 할 postMessage 데이터를 검증·정규화한다.
 * 네임스페이스/타입이 안 맞으면 null(무시 대상). loading 의 progress 는 0..1 로 클램프.
 */
export function parseMsg(data: unknown): PortalMsg | null {
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;
  if (m.ns !== PORTAL_NS) return null;
  if (typeof m.type !== 'string' || !KNOWN_TYPES.has(m.type)) return null;

  if (m.type === 'loading') {
    if (typeof m.progress !== 'number') return null;
    return { ns: PORTAL_NS, type: 'loading', progress: clamp01(m.progress) };
  }
  if (m.type === 'hello') {
    return { ns: PORTAL_NS, type: 'hello', id: typeof m.id === 'string' ? m.id : undefined };
  }
  // 페이로드 없는 단순 신호(ready/started/exit/ack).
  return { ns: PORTAL_NS, type: m.type as 'ready' | 'started' | 'exit' | 'ack' };
}

/** 수신 origin 이 허용 목록에 있는지(빈 문자열·null 은 거부). */
export function isAllowedOrigin(origin: string, allowed: readonly (string | null | undefined)[]): boolean {
  if (!origin) return false;
  return allowed.some((a) => !!a && a === origin);
}

/**
 * location.search 같은 쿼리 문자열에서 허브 origin 을 파싱한다(순수 함수).
 * `?portal=http://localhost:5180` → `http://localhost:5180`. 없거나 형식 불량이면 null.
 */
export function parseHubOrigin(search: string): string | null {
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    const v = params.get(PORTAL_PARAM);
    if (!v) return null;
    return new URL(v).origin;
  } catch {
    return null;
  }
}
