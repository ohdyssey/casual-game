/**
 * 이 게임이 소유한 세이브 키 **전부**.
 *
 * 부팅 시 `hydrateStorage(port, SAVE_KEYS)` 가 이 목록을 한 번에 읽어 캐시에 올린다.
 * 네이티브 저장소에는 키를 열거하는 API 가 없어서(앱인토스 `Storage` 는 아예 없다),
 * "무엇을 읽어야 하는지"를 앱이 알려 줘야 한다.
 *
 * ⚠️ **새 세이브 키를 만들면 반드시 여기에 추가할 것.** 빠뜨리면 그 값만 조용히 안 읽혀서
 *    "가끔 진행도가 초기화된다"는 재현 어려운 버그가 된다.
 */
export const SAVE_KEY = 'tictactoe_v3';
/** 3목 패배 기록(국면 → 응수) — 같은 패배 패턴 반복 방지. */
export const LOSSBOOK_KEY = 'tictactoe_v3_lossbook2';
/** AI 첫 응수 최근 이력 — 매판 같은 오프닝이 나오지 않게. */
export const OPENBOOK_KEY = 'tictactoe_v3_openbook';
/** AI 스터디 진행(클리어 수 + 실전 안내 노출 여부). */
export const STUDY_KEY = 'tictactoe_v5_study';
/** 대전 레이팅·전적(싱글과 분리). */
export const VERSUS_KEY = 'tictactoe_v3_versus';
/** 광고 제거(NO ADS) 구매 여부. */
export const ADS_REMOVED_KEY = 'tictactoe_ads_removed';
/**
 * 실시간 대전용 Supabase 익명 세션(supabase-js 가 직접 읽고 쓴다).
 * 여기 등록하지 않으면 부팅 때 hydrate 되지 않아 **매번 새 익명 계정**이 생기고
 * 레이팅이 초기화된 것처럼 보인다.
 */
export const SUPABASE_AUTH_KEY = 'tictactoe_supabase_auth';

export const SAVE_KEYS: readonly string[] = [
  SAVE_KEY,
  LOSSBOOK_KEY,
  OPENBOOK_KEY,
  STUDY_KEY,
  VERSUS_KEY,
  ADS_REMOVED_KEY,
  SUPABASE_AUTH_KEY,
];
