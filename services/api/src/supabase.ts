/**
 * service_role Supabase 클라이언트 — 이 서버가 DB 를 쓰는 유일한 통로.
 *
 * service_role 은 RLS 를 우회하므로, 모든 권한 검사는 이 코드가 직접 해야 한다
 * (`matchFlow.symbolOf` 로 참가자 확인 → 그다음에만 쓰기).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseServiceRoleKey, supabaseUrl } from './env.js';

let cached: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    // 서버리스 함수는 상태를 들고 있지 않는다 — 세션 저장/갱신을 시도하면 오히려 방해가 된다.
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
