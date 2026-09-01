/**
 * 실시간 대전 접속 정보.
 *
 * ⚠️ `VITE_*` 환경변수를 쓰지 않는다. 이 레포는 타겟을 `--mode` 로 고르고(vite.config.ts 주석:
 *    Windows npm 스크립트는 cmd 라 `VAR=x cmd` 접두 문법이 통하지 않는다), 그 결과가 이미
 *    `@store` 어댑터에 빌드타임 상수로 박혀 있다. 그 값을 그대로 키로 재사용한다.
 *
 * ⚠️ 여기 있는 anon key 는 **공개 전제** 값이다(실제 방어선은 Supabase RLS + 서버 함수).
 *    service_role 키는 절대 이 파일에 오지 않는다 — 그건 Vercel 환경변수 전용이다.
 */
import storeAdapter from '@store';

/** 아직 Supabase 프로젝트를 만들지 않았을 때의 자리표시 값. */
const PLACEHOLDER = 'TODO_REPLACE';

// `: string` 을 붙여 리터럴 타입으로 좁혀지지 않게 한다 — 그러지 않으면 아래 자리표시
// 비교가 "겹칠 수 없는 비교"라며 타입 에러가 난다(값이 채워질수록 더 그렇다).
const SUPABASE_URL: string = 'https://uxgpdphgfnokmqlvrflq.supabase.co';
// 새 키 체계의 publishable key. 구 `anon` JWT 와 역할이 같고 supabase-js 가 그대로 받는다.
// Supabase 대시보드에도 "can be safely shared publicly" 라고 적혀 있는 공개 전제 값이다.
const SUPABASE_ANON_KEY: string = 'sb_publishable_HeCZ0aKPdsq-TFI9MF-9QA_-vNsd_hd';

type Target = typeof storeAdapter.target;

/**
 * 대전 API(Vercel 서버리스) 주소. 스토어별로 오리진이 달라도 API 는 하나를 본다.
 * 타겟별로 나눠 둔 이유는 나중에 스테이징을 따로 붙일 수 있게 하기 위해서다.
 *
 * ⚠️ 원래 계획은 `ttt-api.ryanlogic.kr` 이었으나 **그 서브도메인은 아직 존재하지 않는다**
 *    (2026-08-11 확인: NXDOMAIN). 게다가 `ryanlogic.kr` 은 개인 Hobby 계정에, 이 API 는
 *    팀 `Ohdyssey` 에 있어 계정이 갈려 있다 — 붙이려면 TXT 검증 + 네임서버 CNAME 추가가 필요하다.
 *    그때까지는 Vercel 이 기본으로 주는 도메인을 그대로 쓴다. 도메인이 붙으면 이 다섯 줄만 고치면 된다.
 */
const API_BASE = 'https://casual-game-api.vercel.app';

const API_BASE_BY_TARGET: Record<Target, string> = {
  web: API_BASE,
  adsense: API_BASE,
  toss: API_BASE,
  msstore: API_BASE,
  android: API_BASE,
  ios: API_BASE,
};

export function supabaseUrl(): string {
  return SUPABASE_URL;
}

export function supabaseAnonKey(): string {
  return SUPABASE_ANON_KEY;
}

export function apiBase(): string {
  // 로컬 개발은 `vercel dev`(3000). PlayScene/store 어댑터와 동일한 DEV 분기 패턴.
  if (import.meta.env?.DEV) return 'http://localhost:3000';
  return API_BASE_BY_TARGET[storeAdapter.target];
}

/**
 * 온라인 대전을 시도할 수 있는가.
 *
 * 접속 정보가 아직 자리표시면 **조용히 false** 를 돌려준다 — 서버가 준비되기 전에도
 * 게임은 봇 폴백으로 정상 동작해야 하고, 유저에게 "서버 설정 안 됨" 같은 걸 보여줄 이유가 없다.
 *
 * 부수 효과(의도한 것): 위 상수가 자리표시인 동안 롤업이 이 함수를 `false` 로 접어서
 * `@supabase/supabase-js` 동적 import 가 도달 불가가 되고, **SDK 가 번들에 아예 실리지 않는다.**
 * 실제 값을 채우면 그때부터 별도 청크로 잡힌다(빌드 산출물에 supabase 청크가 생기는지로 확인).
 */
export function isOnlineEnabled(): boolean {
  return SUPABASE_URL !== PLACEHOLDER && SUPABASE_ANON_KEY !== PLACEHOLDER;
}

/** 매칭 대기가 이만큼 지나면 봇 폴백으로 넘어간다(초기 동접이 낮을 때의 안전장치). */
export const MATCH_FALLBACK_MS = 9000;

/** 네트워크 요청 상한 — 넘기면 실패로 보고 봇 폴백/재동기화로 넘어간다. */
export const REQUEST_TIMEOUT_MS = 8000;
