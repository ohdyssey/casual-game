/**
 * UserProfile — 플레이어 영구 데이터 (localStorage 백업).
 *
 * 필드:
 *  - username : 닉네임
 *  - level    : 현재 레벨 (잡은 물고기 수 기반)
 *  - gold     : 현재 골드 (잡은 물고기 점수로 누적)
 *  - gems     : 프리미엄 재화
 *  - bestScore: 한 매치 최고 점수
 *  - totalCatches : 누적 잡은 물고기 수
 */

const KEY = 'fishing_game_profile_v1';

const DEFAULT_PROFILE = {
  username: 'Angler',
  level: 1,
  gold: 10000,                 // 신규 시작 골드
  gems: 5,
  bestScore: 0,
  totalCatches: 0,
  tutorialDone: false,         // 첫 플레이 튜토리얼 1회 노출 여부
};

// 경계 검증(SEC-06 / STATE-04): 손상/구버전 localStorage 값이 gold/score/level 연산을
//   오염시키지 못하도록, 로드 직후 알려진 필드만 골라 타입을 강제(coerce)한다.
const NUMERIC_FIELDS = ['level', 'gold', 'gems', 'bestScore', 'totalCatches'];

/** 유한한 숫자만 통과 — 그 외(문자열·NaN·Infinity·null)는 기본값으로 강등. */
function coerceNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 파싱된 raw 값을 안전한 프로필 형태로 정규화한다.
 *   - 객체가 아니면(배열/스칼라/null) 전부 기본값.
 *   - 숫자 필드는 Number() + 유한성 검사로 강제, 음수 gold/gems 등은 0 이상으로 클램프.
 *   - username 은 문자열만, tutorialDone/_testBonus_2k 는 boolean 으로 강제.
 *   - 알려지지 않은 키는 버려서 다운스트림 연산 오염을 차단한다.
 */
function sanitizeProfile(parsed) {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ...DEFAULT_PROFILE };
  }
  const safe = { ...DEFAULT_PROFILE };
  for (const f of NUMERIC_FIELDS) {
    safe[f] = coerceNumber(parsed[f], DEFAULT_PROFILE[f]);
  }
  // 음수 방어 — gold/gems/score/마릿수는 0 미만일 수 없음, 레벨은 1 이상.
  safe.gold        = Math.max(0, safe.gold);
  safe.gems        = Math.max(0, safe.gems);
  safe.bestScore   = Math.max(0, safe.bestScore);
  safe.totalCatches = Math.max(0, safe.totalCatches);
  safe.level       = Math.max(1, safe.level);
  safe.username    = (typeof parsed.username === 'string' && parsed.username) ? parsed.username : DEFAULT_PROFILE.username;
  safe.tutorialDone = parsed.tutorialDone === true;
  // 내부 1회성 보너스 플래그 — 알려진 키이므로 보존(boolean 강제).
  if (parsed._testBonus_2k === true) safe._testBonus_2k = true;
  return safe;
}

/** localStorage 에서 프로필 로드. 없으면 기본값 + 저장. */
export function loadProfile() {
  try {
    const raw = window.localStorage?.getItem(KEY);
    if (!raw) {
      saveProfile(DEFAULT_PROFILE);
      return { ...DEFAULT_PROFILE };
    }
    const parsed = JSON.parse(raw);
    // 경계 검증 — 손상/구버전 값을 안전 기본값으로 정규화 (SEC-06 / STATE-04).
    const profile = sanitizeProfile(parsed);
    // 사용자 요청: 테스트 시작 2000 골드 지급 (1회 한정).
    //   _testBonus_2k flag 가 false 면 gold = 2000 으로 set 후 flag = true.
    if (!profile._testBonus_2k) {
      const next = { ...profile, gold: 2000, _testBonus_2k: true };
      saveProfile(next);
      return next;
    }
    return profile;
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

/**
 * 프로필 저장. (STATE-07)
 *   QuotaExceeded / SecurityError(사파리 프라이빗·iOS) 로 저장이 실패하면
 *   false 를 반환하고 경고를 남긴다 — 호출부가 저장 성공 여부를 분기할 수 있도록.
 *   @returns {boolean} 저장 성공 여부 (실패 시 false). 기존 호출부는 반환값을 무시해도 무방.
 */
export function saveProfile(p) {
  try {
    if (!window.localStorage) return false;
    window.localStorage.setItem(KEY, JSON.stringify(p));
    return true;
  } catch (err) {
    // QuotaExceeded / SecurityError 등 — 조용히 삼키지 않고 경고로 표면화.
    console.warn('[UserProfile] saveProfile failed (저장되지 않음):', err);
    return false;
  }
}

/**
 * gold 누적. (ARCH-05: 불변 갱신)
 *   - profile 객체가 인자로 주어지면 그 캐시 인스턴스를 통해 새 값을 계산한다.
 *   - profile 미지정 시 localStorage 에서 로드 (구 동작 호환).
 *   호환성: 호출부(FishingScene HUD 등)가 캐시된 this.profile.gold 를 직접 읽으므로,
 *   스프레드로 계산한 새 값을 같은 인스턴스에 반영한 뒤 반환한다(반환값/in-place 동시 호환).
 *
 *   @param {object|number} amountOrProfile
 *   @param {number} [maybeAmount]
 *   @returns {object} 갱신된 프로필
 */
export function addGold(amountOrProfile, maybeAmount) {
  // overload: addGold(amount) | addGold(profile, amount)
  if (typeof amountOrProfile === 'object' && amountOrProfile !== null) {
    const p = amountOrProfile;
    const next = { ...p, gold: Math.max(0, coerceNumber(p.gold, 0) + (maybeAmount ?? 0)) };
    Object.assign(p, next);   // 캐시 인스턴스에 새 상태 반영(HUD in-place 계약 유지)
    saveProfile(p);
    return p;
  }
  const p = loadProfile();
  const next = { ...p, gold: Math.max(0, coerceNumber(p.gold, 0) + amountOrProfile) };
  saveProfile(next);
  return next;
}

export function addGems(amountOrProfile, maybeAmount) {
  if (typeof amountOrProfile === 'object' && amountOrProfile !== null) {
    const p = amountOrProfile;
    const next = { ...p, gems: Math.max(0, coerceNumber(p.gems, 0) + (maybeAmount ?? 0)) };
    Object.assign(p, next);
    saveProfile(p);
    return p;
  }
  const p = loadProfile();
  const next = { ...p, gems: Math.max(0, coerceNumber(p.gems, 0) + amountOrProfile) };
  saveProfile(next);
  return next;
}

/** 매치 종료 시 호출 — 점수·잡은 마릿수 누적. (ARCH-05: 불변 갱신 + 숫자 강제) */
export function recordMatchEnd({ score = 0, catches = 0 } = {}) {
  const p = loadProfile();
  const totalCatches = coerceNumber(p.totalCatches, 0) + coerceNumber(catches, 0);
  const next = {
    ...p,
    bestScore: Math.max(coerceNumber(p.bestScore, 0), coerceNumber(score, 0)),
    totalCatches,
    // 간단한 레벨업 — 누적 마릿수 / 10
    level: Math.max(1, 1 + Math.floor(totalCatches / 10)),
  };
  saveProfile(next);
  return next;
}

/** 튜토리얼 완료 표시 — 첫 플레이 안내를 1회만 노출하기 위함. (ARCH-05: 불변 갱신) */
export function markTutorialDone(profile) {
  if (typeof profile === 'object' && profile !== null) {
    const next = { ...profile, tutorialDone: true };
    Object.assign(profile, next);  // 캐시 인스턴스 반영(같은 세션 재노출 방지 계약 유지)
    saveProfile(profile);
    return profile;
  }
  const p = loadProfile();
  const next = { ...p, tutorialDone: true };
  saveProfile(next);
  return next;
}

export function resetProfile() {
  saveProfile({ ...DEFAULT_PROFILE });
  return loadProfile();
}
