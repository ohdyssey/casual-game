/**
 * Preferences 어댑터 — Capacitor Preferences 와 **같은 호출 모양**의 최소 저장소.
 *
 * 왜 어댑터인가: 명세는 `@capacitor/preferences` 를 쓰라고 하지만 이 저장소(허브)는 아직
 * Capacitor 래퍼가 없는 순수 웹(Vite) 앱이다. 지금 Capacitor 패키지를 넣는 대신 **호출 모양만
 * 동일하게** 맞춘 localStorage 구현을 둔다 — 나중에 Capacitor 앱 래퍼가 생기면 이 파일의
 * 구현부만 `@capacitor/preferences` re-export 로 바꾸면 되고, 호출부(bootstrap.ts)는 그대로다.
 *
 * TODO: [Capacitor 래퍼 도입 후] 아래 구현을 `export { Preferences } from '@capacitor/preferences'`
 *       한 줄로 교체(웹 빌드에서도 Capacitor 웹 폴백이 localStorage 를 쓰므로 동작 동일).
 */

export interface PreferencesLike {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
}

/** localStorage 기반 구현 — Capacitor Preferences 웹 폴백과 같은 저장 위치·모양. */
export const Preferences: PreferencesLike = {
  async get({ key }) {
    // ⚠️ localStorage 접근은 동기지만 실패할 수 있다(사생활 보호 모드 등) — 예외는 호출부의
    //    try/catch 폴백이 처리하도록 그대로 던진다(조용히 삼키면 "왜 매번 최초 실행이지"가 된다).
    return { value: localStorage.getItem(key) };
  },
  async set({ key, value }) {
    localStorage.setItem(key, value);
  },
};
