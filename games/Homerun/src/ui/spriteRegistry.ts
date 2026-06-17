/**
 * 스프라이트 레지스트리 해석 — 에디터가 저장한 ui/sprites/_index.json 에서
 * 한 캐릭터에 등록된 여러 동작(준비/액션/후)을 역할별로 골라낸다.
 *   타자: 타격준비 / 스윙 / 타격 후.  투수: 투수_준비동작 / 투수_투구동작 / 투수_투구후 동작.
 *
 * 같은 캐릭터(=같은 이름)가 여러 characterId 로 흩어져 있어도(에디터 데이터 특성),
 * 노드 characterId 의 캐릭터 "이름"이 같은 모든 문서를 한 묶음으로 본다.
 */

export interface SpriteIndexDoc {
  readonly id: string;
  readonly name?: string;
  readonly file?: string;
  readonly characterId?: string;
}

export interface SpriteIndexCharacter {
  readonly id: string;
  readonly name?: string;
}

export interface SpriteIndex {
  readonly docs?: ReadonlyArray<SpriteIndexDoc>;
  readonly characters?: ReadonlyArray<SpriteIndexCharacter>;
}

/** 캐릭터 3동작 파일 경로(없으면 undefined). */
export interface CharacterMotionFiles {
  readonly ready?: string;
  readonly action?: string;
  readonly after?: string;
}

/**
 * 역할 키워드(문서 이름 기반). 에디터에서 한국어로 명명.
 *  - ready: "준비"
 *  - after: "후"
 *  - action: 주동작 — 타자 "스윙", 투수 "투구"(영문 swing/pitch/throw 도 허용).
 * 우선순위: after 를 action 보다 먼저 판정(이름에 "투구후"처럼 둘 다 들어가는 경우 "후"가 이김).
 */
const ROLE_KEYWORDS = {
  ready: ['준비'],
  after: ['후'],
  action: ['스윙', '투구', 'swing', 'pitch', 'throw'],
} as const;

function hasAny(name: string, keywords: ReadonlyArray<string>): boolean {
  const lower = name.toLowerCase();
  return keywords.some((k) => name.includes(k) || lower.includes(k.toLowerCase()));
}

/**
 * 레지스트리에서 노드 캐릭터의 3동작을 해석.
 * @param index ui/sprites/_index.json 파싱 객체
 * @param characterId 레이아웃 노드의 characterId
 * @param fallbackAction 노드가 직접 가리키는 주동작 문서 경로(레지스트리 해석 실패 시 대비)
 */
export function resolveCharacterMotions(
  index: SpriteIndex | null | undefined,
  characterId: string | undefined,
  fallbackAction: string | undefined,
): CharacterMotionFiles {
  const docs = index?.docs ?? [];
  const chars = index?.characters ?? [];
  // 노드 캐릭터와 "같은 이름"인 모든 characterId 를 한 캐릭터로 묶는다.
  const nodeChar = chars.find((c) => c.id === characterId);
  const charName = nodeChar?.name;
  const groupIds = new Set(
    charName ? chars.filter((c) => c.name === charName).map((c) => c.id) : characterId ? [characterId] : [],
  );
  const mine = docs.filter((d) => d.characterId && groupIds.has(d.characterId));

  // after 를 먼저 판정(투구"후" 등에서 action 키워드와 충돌 방지), 그 다음 ready·action.
  const after = mine.find((d) => hasAny(d.name ?? '', ROLE_KEYWORDS.after))?.file;
  const ready = mine.find((d) => hasAny(d.name ?? '', ROLE_KEYWORDS.ready) && d.file !== after)?.file;
  const action = mine.find(
    (d) => hasAny(d.name ?? '', ROLE_KEYWORDS.action) && d.file !== after && d.file !== ready,
  )?.file;

  return { ready, action: action ?? fallbackAction, after };
}
