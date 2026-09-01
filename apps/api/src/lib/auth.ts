/**
 * 익명 인증(S0) — **기기 키 → 안정적 userId + 서명 토큰**.
 *
 * 캐주얼 게임의 첫 인증은 "가입"이 아니다. 기기가 스스로 만든 임의 키를 들고 오면 서버가
 * 그것을 **안정적인 userId 로 사상**하고 서명 토큰을 준다. 계정 연동(구글/애플)은 나중에
 * 같은 userId 에 신원을 덧붙이는 방식으로 얹는다 — 그래서 지금 발급하는 id 가 영구 id 다.
 *
 * ## 왜 HMAC 인가
 * 설계 문서는 RS256/JWKS 를 목표로 한다(멀티 서비스 검증). 다만 지금은 **단일 API 서비스**뿐이라
 * 대칭키 HMAC 로 시작한다 — 키 배포 인프라 없이 같은 보안 성질(위조 불가·만료)을 얻는다.
 * 검증 주체가 늘어나는 순간 RS256 으로 바꾸되, 토큰 **형식(claims)** 은 그대로 두면 된다.
 *
 * ⚠️ 서명 비밀은 반드시 환경변수. 없으면 서버는 **뜨지 않는다**(개발 편의를 위한 기본값을
 *   두면 그 값이 그대로 프로덕션에 나간다 — 가장 흔한 사고).
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

/** 토큰 수명(초) — 30일. 익명 세션이라 길게 잡고, 앱이 만료 전 자동 갱신한다. */
export const TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

export interface TokenClaims {
  /** 유저 id(영구). */
  sub: string;
  /** 발급 시각(epoch 초). */
  iat: number;
  /** 만료 시각(epoch 초). */
  exp: number;
}

const b64url = (buf: Buffer): string => buf.toString('base64url');
const fromB64url = (s: string): Buffer => Buffer.from(s, 'base64url');

/** 서명 비밀 — 프로세스 시작 시 1회 읽는다. 없으면 즉시 실패시킨다. */
export function readSigningSecret(env: NodeJS.ProcessEnv = process.env): string {
  const s = env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error('AUTH_SECRET 환경변수가 필요합니다(32자 이상). 개발용 기본값은 두지 않습니다.');
  }
  return s;
}

function sign(payload: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(payload).digest());
}

/** 토큰 발급 — `<payload>.<sig>` (payload = base64url(JSON claims)). */
export function issueToken(claims: TokenClaims, secret: string): string {
  const payload = b64url(Buffer.from(JSON.stringify(claims), 'utf8'));
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * 토큰 검증 — 서명·형식·만료를 모두 본다. 실패는 **이유를 구분하지 않고** null 이다
 * (어느 단계에서 틀렸는지 알려 주면 공격자에게 힌트가 된다).
 */
export function verifyToken(token: string, secret: string, nowSec: number): TokenClaims | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expect = sign(payload, secret);
  // 길이가 다르면 timingSafeEqual 이 던진다 → 먼저 길이 비교.
  if (sig.length !== expect.length) return null;
  if (!timingSafeEqual(fromB64url(sig), fromB64url(expect))) return null;
  let claims: TokenClaims;
  try {
    claims = JSON.parse(fromB64url(payload).toString('utf8')) as TokenClaims;
  } catch {
    return null;
  }
  if (typeof claims.sub !== 'string' || !claims.sub) return null;
  if (typeof claims.exp !== 'number' || claims.exp <= nowSec) return null;
  return claims;
}

/**
 * 기기 키 → userId. **결정적**이라 같은 기기가 다시 와도 같은 id 를 받는다(세이브 연속성).
 *
 * ⚠️ 기기 키를 그대로 id 로 쓰지 않는다 — 클라가 남의 id 를 사칭할 수 있다. HMAC 로 한 겹
 *   덮어 서버 비밀을 모르면 특정 id 를 겨냥할 수 없게 만든다.
 */
export function userIdForDeviceKey(deviceKey: string, secret: string): string {
  return `u_${createHmac('sha256', secret).update(`device:${deviceKey}`).digest('base64url').slice(0, 22)}`;
}

/** 기기 키 생성(서버가 처음 발급) — 클라가 저장해 두고 다음 로그인에 그대로 보낸다. */
export function newDeviceKey(): string {
  return randomUUID().replace(/-/g, '');
}
