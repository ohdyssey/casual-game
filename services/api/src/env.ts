/**
 * 환경변수 — 부팅 시점이 아니라 **첫 사용 시점**에 검증한다(서버리스는 콜드스타트마다 뜬다).
 *
 * ⚠️ SUPABASE_SERVICE_ROLE_KEY 는 RLS 를 통째로 우회하는 키다. 이 파일은 서버 전용이며,
 *    클라이언트 번들(games/TICTACTOE/src/net/*)에서는 절대 import 하지 않는다.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`환경변수 ${name} 가 설정되지 않았습니다`);
  return value;
}

export function supabaseUrl(): string {
  return required('SUPABASE_URL');
}

export function supabaseServiceRoleKey(): string {
  return required('SUPABASE_SERVICE_ROLE_KEY');
}

/**
 * 네이티브 앱(Capacitor) 웹뷰의 오리진 — 항상 허용한다.
 *
 * 구글/애플에 게임을 **각각 별도 앱**으로 올리지만, Capacitor 웹뷰의 오리진은 앱마다
 * 같은 값이라 여기로 앱을 구분할 수 없다. 구분이 필요해지면 오리진이 아니라 토큰/헤더로 한다.
 *
 * ⚠️ CORS 는 보안 경계가 아니다(브라우저만 지키고, 앱·스크립트는 그냥 무시한다).
 *    실제 방어선은 JWT 검증 + RLS 다. 이 목록은 "정상 앱이 막히지 않게" 하는 용도다.
 */
const NATIVE_ORIGINS = [
  'capacitor://localhost', // iOS
  'https://localhost', // Android (Capacitor 기본 androidScheme)
  'http://localhost', // Android (구버전 설정)
] as const;

/**
 * CORS 허용 오리진 — 쉼표 구분.
 * 스토어별로 오리진이 다르다: 웹/허브(ryanlogic.kr), 토스 미니앱, MS Store 패키지 앱.
 * 미설정이면 로컬 개발용 기본값만 연다(운영에서 조용히 전면 개방되는 사고 방지).
 */
export function allowedOrigins(): readonly string[] {
  const raw = process.env.ALLOWED_ORIGINS;
  const configured = raw
    ? raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : ['http://localhost:6211', 'http://127.0.0.1:6211'];
  return [...configured, ...NATIVE_ORIGINS];
}
