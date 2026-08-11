/**
 * Supabase 클라이언트 + 익명 로그인.
 *
 * 계정 UI 없이 안정적인 유저 식별자를 얻기 위해 익명 로그인(`signInAnonymously`)을 쓴다.
 * 세션은 이 레포의 스토리지 파사드(`@casual/core/store`)에 저장한다 — 타겟별 저장소가
 * localStorage 가 아닐 수 있고, 부팅 시 hydrate 되는 키 목록(saveKeys.ts)에 얹혀야
 * 매번 새 계정이 만들어지지 않는다.
 *
 * ⚠️ 로그인 실패는 예외가 아니다. 대전 모드는 봇 폴백으로 계속 굴러가야 하므로
 *    이 모듈은 실패를 null 로 돌려주고 호출부가 조용히 오프라인으로 내려간다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { readItem, removeItem, writeItem } from '@casual/core/store/index.js';
import { SUPABASE_AUTH_KEY } from '../saveKeys.js';
import { isOnlineEnabled, supabaseAnonKey, supabaseUrl } from './config.js';

/** supabase-js 가 기대하는 저장소 인터페이스를 코어 파사드에 연결한다. */
const storage = {
  getItem: (key: string): string | null => readItem(key),
  setItem: (key: string, value: string): void => writeItem(key, value),
  removeItem: (key: string): void => removeItem(key),
};

let client: SupabaseClient | null = null;

/**
 * SDK 를 **동적으로** 불러온다 — 대전에 들어가지 않는 유저(싱글·스터디)는 이 40KB 를
 * 내려받지 않는다. 정적 import 로 두면 청크를 나눠도 첫 화면에서 함께 받는다.
 */
async function supabase(): Promise<SupabaseClient> {
  if (client) return client;
  const { createClient } = await import('@supabase/supabase-js');
  client = createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: {
      storage,
      // 키를 고정해야 saveKeys.ts 에 등록할 수 있다(기본값은 프로젝트 ref 가 섞인 이름).
      storageKey: SUPABASE_AUTH_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    realtime: {
      // 20초 턴제라 초당 수십 이벤트가 필요 없다. 재연결 폭주를 막는 쪽이 이득이다.
      params: { eventsPerSecond: 5 },
    },
  });
  return client;
}

export interface Session {
  readonly userId: string;
  readonly accessToken: string;
  readonly supabase: SupabaseClient;
}

let signingIn: Promise<Session | null> | null = null;

/**
 * 로그인된 세션을 얻는다(없으면 익명 계정을 만든다).
 * 실패하면 null — 호출부는 봇 폴백으로 내려간다.
 *
 * 동시 호출은 하나의 프라미스를 공유한다(메뉴 진입과 매칭 버튼이 겹쳐 두 계정이 생기는 걸 막는다).
 */
export function getSession(): Promise<Session | null> {
  if (!isOnlineEnabled()) return Promise.resolve(null);
  if (signingIn) return signingIn;

  signingIn = (async (): Promise<Session | null> => {
    try {
      const db = await supabase();
      const existing = await db.auth.getSession();
      let session = existing.data.session;

      if (!session) {
        const created = await db.auth.signInAnonymously();
        if (created.error) throw created.error;
        session = created.data.session;
      }

      if (!session) return null;
      return { userId: session.user.id, accessToken: session.access_token, supabase: db };
    } catch (error) {
      console.warn('[net] 익명 로그인 실패 — 이번 세션은 봇 대전으로 진행합니다', error);
      return null;
    } finally {
      // 다음 호출이 만료된 토큰을 재발급받을 수 있게 캐시를 놓아준다.
      signingIn = null;
    }
  })();

  return signingIn;
}
