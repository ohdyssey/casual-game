/**
 * profile.ts — **플레이어 프로필**(표시 이름 + 아바타). 순수 모듈(Phaser·DOM 없음).
 *
 * 왜 필요한가: 투데이 리그·랭킹은 "내가 몇 등인지"를 보여 주는 화면인데, 나를 가리킬 **이름과 얼굴**이
 * 없었다. 펌프러시는 상수 하나(`PLAYER_NAME`)로 때웠지만, 이 게임은 사용자가 직접 정하게 한다
 * (PO 2026-08-23 "플레이어의 점수 이름을 설정하도록 합시다").
 *
 * 이름 규칙은 여기 한 곳에만 둔다 — 화면(profilePopup)과 리그 시뮬레이션이 같은 규칙을 봐야
 * "저장은 됐는데 순위표에는 다른 이름"이 되지 않는다.
 */

/** 고를 수 있는 아바타 수 — 저작 아트 `up_BR_UI_Profile_001~005`. */
export const PROFILE_COUNT = 5;

/** 이름 길이 제한 — 순위표 한 줄에 들어가는 폭 기준(한글 기준 넉넉히). */
export const NAME_MAX = 10;
export const NAME_MIN = 1;

export interface Profile {
  readonly name: string;
  /** 1..PROFILE_COUNT. */
  readonly avatar: number;
}

/**
 * 아직 이름을 정하지 않은 사용자의 **기본 이름**. 같은 기기에서 늘 같은 값이 나오도록
 * 진행 레벨이 아니라 **고정 시드**(저장 시점에 한 번 뽑은 값)를 쓴다 — 호출부가 seed 를 넘긴다.
 */
export function defaultName(seed: number): string {
  const n = Math.abs(Math.floor(seed)) % 9000 + 1000;
  return `플레이어${n}`;
}

/** 아바타 번호를 유효 범위로 접는다(저장값 손상·아트 수 변경에 견디게). */
export function clampAvatar(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 1;
  if (n < 1) return 1;
  if (n > PROFILE_COUNT) return ((n - 1) % PROFILE_COUNT) + 1;
  return n;
}

/**
 * 입력된 이름을 저장 가능한 형태로 다듬는다.
 *   · 앞뒤 공백 제거 · 연속 공백 1칸 · 길이 상한
 *   · 제어문자 제거(순위표가 깨지지 않게)
 * 비면 `null` — 호출부가 "이름을 입력해 주세요"로 되돌린다.
 */
export function normalizeName(raw: string): string | null {
  // 제어문자(줄바꿈·탭 등)를 먼저 걷어낸다 — 순위표 한 줄이 깨지지 않게.
  //   정규식에 제어문자를 직접 쓰면 소스가 이진 파일로 취급돼 도구가 다루기 어렵다 → 코드포인트로 판정한다.
  //   ⚠️ 지우지 말고 **공백으로 바꾼다** — 여러 줄을 붙여넣었을 때 그냥 지우면 단어가 들러붙는다.
  //     공백으로 바꾼 뒤 아래에서 연속 공백을 1칸으로 접는다.
  const stripped = Array.from(raw)
    .map((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      return c < 0x20 || c === 0x7f ? ' ' : ch;
    })
    .join('');
  const cleaned = stripped
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
  return cleaned.length >= NAME_MIN ? cleaned : null;
}

/** 저장값(부분·손상 가능)에서 온전한 프로필을 만든다. */
export function normalizeProfile(raw: Partial<Profile> | undefined, seed: number): Profile {
  const name = typeof raw?.name === 'string' ? normalizeName(raw.name) : null;
  return { name: name ?? defaultName(seed), avatar: clampAvatar(raw?.avatar) };
}

/** 아바타 번호 → 저작 아트 키. */
export function avatarKey(avatar: number): string {
  return `up_BR_UI_Profile_00${clampAvatar(avatar)}`;
}
