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

/**
 * 없는 동작을 "같은 클립의 일부 구간 반복"으로 대체하는 지정(사용자 요청: "준비동작과 타격후
 * 동작이 없으면 앞부분을 반복하거나 뒷부분을 반복하는 식으로 없는 동영상을 대체하세요").
 * 별도 문서를 쓰지 않고 원본 클립의 프레임 구간만 잘라 쓰므로 시트·앵커가 완전히 같아 동작이
 * 바뀔 때 캐릭터가 튀지 않는다(별도 아이들 문서를 준비동작으로 쓰면 발 위치가 어긋난다 — 실측).
 */
export interface DerivedMotion {
  /** 원본 스프라이트 문서 파일 경로(액션으로 쓰는 그 문서). */
  readonly from: string;
  /** head=앞부분(준비 자세) · tail=뒷부분(타격 후 마무리). */
  readonly part: 'head' | 'tail';
  /** 잘라 쓸 프레임 수. 원본 프레임 수보다 크면 전체를 쓴다. */
  readonly frames: number;
  /**
   * 반복 재생 감속 배수(1=원본 속도, 3=원본의 1/3 속도). 대기·마무리 루프는 원본 fps(12) 그대로면
   * 짧은 구간이 빠르게 되풀이돼 안절부절 못하는 느낌이 난다(사용자 요청: "느리게 반복재생").
   */
  readonly slow?: number;
}

/** 동작 1개 지정 — 문서 파일 경로이거나, 다른 클립 구간에서 파생. */
export type MotionSpec = string | DerivedMotion;

/** 캐릭터 3동작(없으면 undefined). */
export interface CharacterMotionFiles {
  readonly ready?: MotionSpec;
  readonly action?: MotionSpec;
  readonly after?: MotionSpec;
}

/** MotionSpec 이 파생 지정인지 판별(문자열 경로와 구분). */
export function isDerivedMotion(spec: MotionSpec | undefined): spec is DerivedMotion {
  return typeof spec === 'object' && spec !== null && 'from' in spec;
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
  const byKeyword = mine.find(
    (d) => hasAny(d.name ?? '', ROLE_KEYWORDS.action) && d.file !== after && d.file !== ready,
  )?.file;

  /**
   * 역할 키워드가 하나도 안 걸리는 캐릭터(로비 아이들 — "여성타자 1", "남성 아이들동작1" 등)는
   * 그룹에 문서가 하나뿐이다. 그럴 땐 **레지스트리의 그 문서**를 쓴다.
   *
   * ⚠️ 노드의 spriteDocFile 을 그대로 믿으면 안 된다 — 그 값은 에디터에서 **처음 배치할 때** 박힌
   * 문서 경로라, 나중에 같은 캐릭터를 다시 내보내면(해상도 축소 등) 새 문서가 레지스트리에 등록돼도
   * 노드는 옛 문서를 계속 가리킨다. 실제로 2026-08-05 캐릭터 시트를 절반 해상도로 다시 저장했는데
   * 게임은 옛 대형 시트를 계속 읽어, 노드를 다시 배치하기 전까지 아무 효과가 없었다.
   * 레지스트리를 우선하면 에디터에서 다시 저장하는 것만으로 반영된다.
   */
  const soleDoc = mine.length === 1 && !after && !ready ? mine[0].file : undefined;
  const action = byKeyword ?? soleDoc;

  return { ready, action: action ?? fallbackAction, after };
}

// ── 타자 캐릭터 프리셋 ────────────────────────────────────────────────────

/**
 * 2번 캐릭터(여성) 파생 루프 감속 배수 — 속도를 조절하는 **유일한 지점**(둘 다 원본 12fps 기준).
 *  · 준비(타격 전) 6배 = 원본의 1/6 속도(2fps 체감). 1/3 로 갔다가 한 번 더 절반으로 낮춘 값이다
 *    (사용자 요청: "타격전 동작도 지금 동작의 절반정도로 속도를 낮춰주기 바람").
 *  · 타격 후 3배 = 원본의 1/3 속도(4fps 체감).
 * 준비는 투구를 기다리는 긴 구간이라 더 느려도 되지만, 타격 후는 다음 투구 전까지 잠깐만 보이므로
 * 같이 낮추면 굳어 보인다 — 그래서 두 값을 나눠 둔다.
 */
const READY_LOOP_SLOW = 6;
const AFTER_LOOP_SLOW = 3;

/**
 * 타자 캐릭터 프리셋 — 3동작을 에디터 스프라이트 문서 **id** 로 직접 지정한다.
 *
 * 이름 기반 해석(resolveCharacterMotions)을 안 쓰는 이유: 여성 캐릭터는 문서가 "여성 타격1"
 * 하나뿐이라 ROLE_KEYWORDS('준비'/'후'/'스윙')에 아무것도 안 걸리고, 남성과 characterId 그룹도
 * 다르다. 프리셋으로 못을 박아야 어떤 캐릭터를 쓰는지가 코드에서 한눈에 보이고 교체도 한 줄이다.
 *
 *  · male — 기존 남성 타자(사용자 요청: "우선 기존 남성타격을 저장하고"). 지우지 않고 보존만
 *    한다. ACTIVE_BATTER_PRESET 을 'male' 로 되돌리면 그대로 복구된다.
 *  · female — "여성타격2"(사용자 요청: "이 여성캐릭터를 기본 캐릭터로 설정"). 문서가 액션
 *    하나뿐이라 준비/후는 같은 클립의 앞/뒤 구간 반복으로 대체한다(DerivedMotion).
 *
 * ⚠️ **여성 클립은 2026-08-03 새로 저작된 "여성타격2"(41프레임)를 품질 확인용으로 임시 적용한
 * 상태**다(사용자 요청: "품질테스트를 위해서 우선 임시적용"). 이전 클립
 * `char_msancr2rw0p1_1_msaowrauqozz`(여성타격1, 19프레임 · 준비 10 · 시작 10 · 컨택 15 ·
 * 앵커 {0.3734, 0.9294})는 레지스트리(_index.json)에서 이미 빠져 되돌리려면 에디터에서 다시
 * 등록해야 한다. 품질이 합격이면 이 주석의 "임시" 표기만 지우면 된다.
 *
 * **여성 클립 프레임 구간(2026-08-03 저작본 실측, 41프레임 @12fps)** — 프레임을 전부 눈으로
 * 확인해 정했다(알파 바운딩박스 수치만으로는 배트 끝 움직임과 대기 흔들림이 구분되지 않는다):
 *   · f0~f9   대기 자세(배트 세워 든 채 무게중심 이동) → **준비 = 앞 10프레임을 느리게 반복**
 *     (사용자 요청: "타격전 애니메이션은 1~10프레임을 느리게 반복재생")
 *   · f10~f22 완만한 와인드업(배트가 서서히 서고 뒤로 눕기 시작) — 탭한 순간부터 재생하는 구간.
 *   · f23~f28 코일(배트가 머리 뒤로 감김 — 알파 우측끝이 0.62→0.70 으로 튀는 구간)
 *   · f29     스윙 시작(배트 모션블러가 뒤쪽에 걸림)
 *   · **f30 = 배트 전방 최대 신장(컨택, 알파 우측끝 0.9749 로 최대)** → swing.contactFrame 과 일치해야 한다.
 *   · f31~f35 팔로스루(배트가 머리 위로 돌아 어깨 뒤로 넘어감)
 *   · f36~f40 마무리 자세 → **타격 후 = 뒤 5프레임 반복**
 *     (사용자 요청: "타격후 프레임은 f36~40을 느리게 반복재생 할 것")
 *     ⚠️ 이 5프레임은 프레임 간 픽셀 차이가 0~1.7 로 사실상 정지 그림이다(f36=f37 동일, 실측).
 *     움직임이 보여야 한다면 f35 를 넣어(frames: 6) f35→f36 의 차이 4.76 을 살리면 된다.
 *
 * ⚠️ 타격 후는 예전엔 클립을 만들지 않고 **마지막 프레임 정지**였다(이전 사용자 요청). 위 요청으로
 * 뒤 5프레임 반복 루프로 바뀌었다 — 정지 경로(CharacterRig.holdActionLastFrame)는 후동작 클립이
 * 없는 캐릭터를 위해 그대로 남아 있다.
 */
/**
 * 타자 프리셋의 형태 — **두 가지 구성**을 모두 허용한다.
 *   ① 파생형(현행 남성·여성): action 문서 하나에서 앞/뒤 구간을 잘라 준비·타격후를 만든다.
 *      시트·앵커가 완전히 같아 동작 전환 때 캐릭터가 튀지 않는다.
 *   ② 별도문서형: 준비/타격후가 각각 독립 문서. 캐릭터에 3동작이 모두 저작돼 있을 때 쓴다.
 *
 * ⚠️ `as const` 만으로 두면 두 프리셋이 같은 형태일 때 유니온이 좁아져, 쓰지 않는 쪽 필드
 *    접근이 `never` 로 막힌다(별도문서형 경로가 통째로 컴파일 에러). 형태를 명시해 두 구성이
 *    항상 유효하게 유지한다 — 다음에 3동작 캐릭터가 들어와도 코드를 되살릴 필요가 없다.
 */
export interface BatterPreset {
  /** 스윙(주동작) 문서 id — 모든 구성에서 필수. */
  readonly action: string;
  readonly swing: BatterSwingTiming;
  /** 접지 앵커. 없으면 문서 meta.anchor 를 그대로 쓴다. */
  readonly anchor?: { readonly x: number; readonly y: number };
  /** ① 파생형 — action 클립의 앞/뒤 구간에서 만든다. */
  readonly readyFromAction?: Omit<DerivedMotion, 'from'>;
  readonly afterFromAction?: Omit<DerivedMotion, 'from'>;
  /** ② 별도문서형 — 준비/타격후 문서 id. */
  readonly ready?: string;
  readonly after?: string;
  /** ②에서만 의미 있는 준비 루프 감속(파생형은 잘라낸 문서에 이미 들어 있다). */
  readonly readySlow?: number;
}

const BATTER_PRESET_DEFS = {
  male: {
    // 타자1 "타격1"(2026-08-04 저작, 31프레임·12fps). 예전엔 준비/후가 별도 문서(`char` 캐릭터)였고
    // 스윙만 다른 캐릭터(`1` 폴더)의 클립을 빌려 써, **스윙 순간에만 다른 캐릭터가 보였다**
    // (사용자 보고: "타격시 다른 캐릭터가 스윙시 보입니다"). 이제 여성과 동일하게 한 문서에서
    // 앞/뒤를 잘라 파생하므로 세 동작이 모두 같은 캐릭터다.
    action: '1_1_msee37tytdre',
    // 사용자 지정 구간: 타격전 1~7프레임 · 타격후 22~30프레임(전체 31프레임 0~30 기준).
    //   head 7  → 0~6   (=1~7번째 프레임)
    //   tail 9  → 22~30 (마지막 프레임까지)
    readyFromAction: { part: 'head', frames: 7, slow: READY_LOOP_SLOW },
    afterFromAction: { part: 'tail', frames: 9, slow: AFTER_LOOP_SLOW },
    /**
     * **시트 실측값**(2026-08-04). 프레임별 알파 바운딩박스를 재서 정했다 — 여성 프리셋과 같은
     * 기준(=배트 전방 최대 신장 프레임이 컨택).
     *   · f0~f6   대기 자세(우측끝 0.71→0.66, 폭 0.34~0.40 — 거의 정지) → 준비 루프
     *   · f7~f9   로드(다리 들고 배트 뒤로, 프레임 변화 12~14 로 급증)
     *   · **f10   배트가 우측으로 완전히 뻗음 — 알파 우측끝 0.9844 · 폭 0.6543 **둘 다 최대** = 컨택**
     *   · f11~f12 배트가 정면 안쪽으로 말려 들어가며 짧아짐(f12 폭 0.3203 = 최소, 완전 단축)
     *   · f13~f16 팔로스루(좌측으로 빠짐 — f14 좌측끝 0.0156 최소)
     *   · f17~f21 배트가 머리 위로 돌아 어깨로 복귀
     *   · f22~f30 마무리 정지 자세(프레임 변화 4 대로 수렴) → 타격 후 루프
     *
     * ⚠️ 이전엔 contactFrame=21(구간 정의에서 유도한 추측값)이었다. 실제 임팩트인 f10 보다
     *    한참 뒤라, 코드가 f7~f21 을 공 도착 시간에 맞춰 늘리면서 **눈에 보이는 임팩트가 36%
     *    지점에 와버렸다** → 스윙이 다 끝난 뒤 타격이 일어나 보였다(사용자 보고 2026-08-04).
     *    타점(batContactX)은 화면 중앙이고 타자는 그 왼쪽이라, 배트가 우측 최대로 뻗는 f10 이
     *    공을 만나는 프레임이라는 점과도 맞는다.
     */
    swing: { frames: 31, startFrame: 7, contactFrame: 10 },
    // anchor 미지정 → 문서 meta.anchor(0.45, 0.93)를 그대로 쓴다(에디터 저작값 우선).
  },
  female: {
    action: 'char_msancr2rw0p1_2_msd4ft1zy0ns', // 여성타격2(2026-08-03 저작, 41프레임) — 품질 확인용 임시 적용
    readyFromAction: { part: 'head', frames: 10, slow: READY_LOOP_SLOW },
    afterFromAction: { part: 'tail', frames: 5, slow: AFTER_LOOP_SLOW },
    swing: { frames: 41, startFrame: 10, contactFrame: 30 },
    anchor: { x: 0.5099, y: 0.9312 },
  },
} satisfies Record<string, BatterPreset>;

/** 프리셋 키는 위 정의에서 추론(프리셋을 추가하면 자동으로 넓어진다). */
export type BatterPresetKey = keyof typeof BATTER_PRESET_DEFS;

/**
 * 공개 프리셋 테이블. **값 타입을 BatterPreset 으로 넓혀서** 내보낸다 —
 * 추론 타입 그대로면 두 프리셋이 같은 구성일 때 `'readySlow' in preset` 류 가드가 `never` 로
 * 좁혀져, 쓰지 않는 구성(별도문서형)을 다루는 코드가 통째로 컴파일 에러가 난다.
 */
export const BATTER_PRESETS: Record<BatterPresetKey, BatterPreset> = BATTER_PRESET_DEFS;

/**
 * 스윙 클립의 재생 구간 — **프리셋과 같은 자리에 두어야 하는 값**이다. PlayScene 이 이 값으로
 * "스윙 시작 → 배트가 공에 닿는 순간"을 계산하므로, 타자가 바뀌면 타이밍도 함께 따라온다.
 *
 *  · startFrame — 탭했을 때 클립의 **어느 프레임부터** 재생할지. 여성 클립처럼 앞부분이 대기
 *    자세(f0~f9)면 거기서부터 재생하면 안 된다. 스윙은 "지금부터 컨택까지 남은 시간"에 맞춰
 *    속도가 정해지는데, 그 시간의 대부분을 이미 화면에 떠 있던 대기 자세를 되감아 트는 데
 *    써버리고 정작 배트가 도는 구간(f13~f15)은 순식간에 지나가 **스윙이 통째로 스킵된 것처럼
 *    보인다**(2026-08-02 사용자 보고: "애니메이션이 스킵되는 느낌" · "계속 리플레이됨").
 *    준비 루프가 끝나는 바로 다음 프레임(=readyFromAction.frames)에서 이어받아야 자연스럽다.
 *  · contactFrame — 배트가 전방 최대 신장하는 프레임(공이 도착하는 순간과 맞춘다).
 *
 * ⚠️ 예전엔 이 값들이 PlayScene 상수로 따로 떨어져 있었다. 그래서 타자를 남성→여성으로 바꿀 때
 * 클립은 갈아끼웠는데 컨택 프레임은 남성 것(24프레임 중 17)이 그대로 남아, 공이 도착하는 순간
 * 타자가 아직 스윙을 시작도 안 한 상태였다(2026-08-02). 같은 실수가 반복되지 않도록 합쳤다.
 */
export interface BatterSwingTiming {
  readonly frames: number;
  readonly startFrame: number;
  readonly contactFrame: number;
}

/**
 * 로비를 거치지 않고 플레이 화면이 시작될 때 쓰는 타자.
 * **로비의 기본 선택(LobbyScene.DEFAULT_LOBBY_CHARACTER)과 같아야 한다** — 다르면 로비를 건너뛴
 * 경로(개발 중 직접 진입 등)에서만 다른 캐릭터가 나와 재현이 어려운 차이가 생긴다.
 */
export const DEFAULT_BATTER_PRESET: BatterPresetKey = 'male';

/**
 * 현재 타자 — **로비 캐릭터 선택의 결과**라 상수가 아니라 상태다(사용자 요청: "미리 선택되어
 * 있는 캐릭터 하단에 플레이볼 버튼이 표시되어 있고, 누르면 해당 캐릭터로 게임 진행").
 * LobbyScene 이 setBatterPreset 으로 정하고 PlayScene·assets 가 읽는다. 씬 사이에만 유지되면
 * 되므로(로비를 반드시 거친다) 저장은 하지 않는다 — PlayScene 을 직접 띄우면 기본값이 쓰인다.
 */
let activeBatterPreset: BatterPresetKey = DEFAULT_BATTER_PRESET;

export function getBatterPreset(): BatterPresetKey {
  return activeBatterPreset;
}

/** 알 수 없는 키는 무시한다(저장값·URL 파라미터 등 외부 입력 방어). */
export function setBatterPreset(key: string): void {
  if (Object.prototype.hasOwnProperty.call(BATTER_PRESETS, key)) activeBatterPreset = key as BatterPresetKey;
}

/** 현재 타자의 스윙 구간 — 캐릭터가 바뀌면 값도 바뀌므로 **호출 시점에** 읽어야 한다. */
export function activeBatterSwing(): BatterSwingTiming {
  return BATTER_PRESETS[activeBatterPreset].swing;
}

/**
 * 현재 타자의 정렬 앵커(프레임 안에서 노드 위치에 맞출 기준점, 0..1). 없으면 undefined 를 주고
 * 그때는 클립 문서의 `meta.anchor` 가 쓰인다(남성 타자는 문서에 저작돼 있어 여기 값이 없다).
 *
 * **여성 클립에만 여기서 앵커를 준다** — 문서에 저작된 `meta.anchor` 를 그대로 쓰면 남성과 다른
 * 자리에 선다. 여성 신작(여성타격2)의 문서 앵커는 (0.47, 0.96) 인데 이 값은 남성 문서의 값과
 * 같을 뿐 시트 안 접지점이 서로 달라서, 그대로 두면 남성보다 약 34px 오른쪽·28px 위에 서게 된다.
 * (앵커가 아예 없던 이전 클립에선 프레임 **중심**이 노드에 맞춰져 400px 가까이 내려갔었다 —
 * 2026-08-02 사용자 보고: "여성 캐릭터의 타격위치를 조절하여 타격박스에 위치하게 만드세요".)
 *
 * 값은 **남성 타자의 접지점과 정확히 겹치도록 역산**했다(남성이 기준 — 사용자가 그 위치를 직접
 * 맞춰 뒀다). 두 시트의 알파 하단(신발 접지면)을 같은 임계(alpha>32)로 실측해:
 *   · 남성 실측 접지점 (0.4342, 0.9924) · 저작 앵커 (0.47, 0.96) → 발이 노드에서 (-33.9, +27.8)px
 *     (가로 오프셋은 프레임 폭 기준: 583px 시트 × 노드높이 857/528)
 *   · 여성(여성타격2, 439×439 정사각 프레임) 실측 접지점 (0.4703, 0.9636) → 같은 오프셋이 나오도록
 *     앵커를 풀면 (0.5099, 0.9312)
 * 오프셋은 노드 높이에 비례하므로 이 앵커는 **노드 크기가 바뀌어도 그대로 유효**하다.
 *
 * ⚠️ 클립을 새로 저작해 갈아끼울 때마다 이 값도 다시 재야 한다(시트마다 프레임 안에서 캐릭터가
 *    서 있는 위치가 다르다). 노드에 `anchor` 가 있으면 언제나 그쪽이 우선한다(CharacterRig 참조).
 */
export function activeBatterAnchor(): { readonly x: number; readonly y: number } | undefined {
  const preset = BATTER_PRESETS[activeBatterPreset];
  return 'anchor' in preset ? preset.anchor : undefined;
}

/**
 * 현재 타자의 **준비 동작 문서**에 걸 감속 배수(1=원본 속도). 준비 동작이 별도 문서인 캐릭터
 * (1번/남성)용 — 파생 루프(2번/여성)는 감속이 이미 잘라낸 문서에 들어 있어 여기서 주지 않는다
 * (주면 두 번 걸려 정지에 가까워진다). CharacterRig 가 로드한 클립에 적용한다.
 */
export function activeBatterReadySlow(): number | undefined {
  const preset = BATTER_PRESETS[activeBatterPreset];
  return 'readySlow' in preset ? preset.readySlow : undefined;
}

/** 레이아웃의 spriteDocClip 노드 중 투수인지(그 외 = 타자). 이름 규약은 에디터 저작값. */
export function isPitcherNode(node: { readonly name?: string }): boolean {
  return (node.name ?? '').includes('투수');
}

/**
 * 타자 노드의 **기본 배치**(에디터 저작 좌표 1080×2400 기준) — 에디터에 타자 노드가 없을 때 쓴다.
 *
 * 값은 2026-08-04 까지 실제로 적용돼 있던 타자 노드(main.json `layer_4`)의 실측치를 그대로
 * 채택했다(사용자 지시: "해당 적용상태에서 사이즈 및 위치를 채택하고 에디터에서는 삭제해도
 * 되도록 하세요").
 *
 * 타자가 **누구인지**는 로비에서 고른 프리셋(resolveBatterMotions)이 정한다 — 에디터 노드는
 * 배치만 담당했으므로, 그 배치를 여기로 옮기면 노드를 지워도 타자가 정상 표시된다.
 * 에디터에 타자 노드를 다시 두면 그쪽이 이긴다(있으면 기본값을 쓰지 않는다).
 *
 * ⚠️ 크기 조정은 **h 로만** 한다 — CharacterRig 는 `targetH / 네이티브 h` 로 균일 스케일하며
 *    w 는 스케일에 쓰지 않는다(가로세로 비율 왜곡 방지).
 */
export const DEFAULT_BATTER_PLACEMENT = { x: 243, y: 1975, w: 883, h: 857, depth: 25 } as const;

/**
 * 레이아웃에 타자 노드(spriteDocClip 중 투수가 아닌 것)가 있는지.
 * false 면 호출자가 DEFAULT_BATTER_PLACEMENT 로 노드를 세워야 한다.
 */
export function hasBatterNode(nodes: ReadonlyArray<{ readonly type?: string; readonly name?: string }>): boolean {
  return nodes.some((n) => n.type === 'spriteDocClip' && !isPitcherNode(n));
}

/** 문서 id → 파일 경로(레지스트리). 못 찾으면 undefined. */
function fileOfDoc(index: SpriteIndex | null | undefined, docId: string | undefined): string | undefined {
  if (!docId) return undefined;
  return index?.docs?.find((d) => d.id === docId)?.file;
}

/**
 * 지정한 프리셋으로 타자 3동작을 해석한다. 프리셋 문서를 레지스트리에서 못 찾으면(에디터에서
 * 삭제·교체) 기존 이름 기반 해석으로 조용히 폴백한다.
 */
export function resolveBatterMotionsFor(
  index: SpriteIndex | null | undefined,
  node: { readonly characterId?: string; readonly spriteDocFile?: string },
  presetKey: BatterPresetKey,
): CharacterMotionFiles {
  const preset = BATTER_PRESETS[presetKey];
  const action = fileOfDoc(index, preset.action) ?? node.spriteDocFile;
  if (!action) return resolveCharacterMotions(index, node.characterId, node.spriteDocFile);

  // ① 파생형 — 액션 문서 하나뿐. 준비는 같은 클립 **앞부분**, 타격 후는 **뒷부분** 반복으로
  //    대체한다. 같은 시트·앵커를 쓰므로 동작이 바뀌어도 캐릭터가 튀지 않는다.
  //    ⚠️ `'readyFromAction' in preset` 이 아니라 값으로 판정한다 — 선택 필드라 키는 항상
  //       타입에 존재해서 `in` 으로는 undefined 가 걸러지지 않는다.
  const readyFrom = preset.readyFromAction;
  const afterFrom = preset.afterFromAction;
  if (readyFrom) {
    return {
      ready: { from: action, ...readyFrom },
      action,
      after: afterFrom ? { from: action, ...afterFrom } : undefined,
    };
  }
  // ② 별도문서형 — 준비/타격후가 각각 독립 문서.
  return { ready: fileOfDoc(index, preset.ready), action, after: fileOfDoc(index, preset.after) };
}

/** 타자 노드의 3동작 해석 — 현재 선택된 캐릭터(getBatterPreset) 기준. */
export function resolveBatterMotions(
  index: SpriteIndex | null | undefined,
  node: { readonly characterId?: string; readonly spriteDocFile?: string },
): CharacterMotionFiles {
  return resolveBatterMotionsFor(index, node, getBatterPreset());
}

/**
 * 로딩 화면에서 미리 받아둘 **타자 플레이 클립** 수.
 *
 * 변천: 전부 → 2명(로딩 시간 대응) → **1명**(GPU 메모리 대응, 2026-08-04).
 *
 * 2명으로 줄인 것은 "10초 이내 최초 화면" 요건 때문이었고 그 판단은 지금도 유효하다. 다만 그 뒤
 * 2018년 iPad 에서 스프라이트·배경이 안 뜨는 문제를 파고들어 보니, 타자 아틀라스 하나가 GPU 에서
 * **30MB 대**를 차지해(4096×2048×4B) 여러 명을 동시에 올리는 것 자체가 구형 기기 텍스처 한도를
 * 넘기는 주원인이었다(assets.preloadPlayClips 주석 참조).
 *
 * 부팅 직후 화면은 **로비**이고 로비는 타자 플레이 클립을 쓰지 않는다 — 2명분을 받아 봐야 그중
 * 하나는 그 화면에서 쓰이지도 않는다. 받아만 두고 안 쓰는 그 순간의
 * **피크 메모리**가 구형 기기를 죽이므로, 부팅에는 기본 타자 1명만 올린다.
 *
 * 다른 타자는 **로비에서 그 캐릭터를 고르는 순간** 받는다(assets.preloadSelectedBatterClips).
 * 아직 안 받아졌더라도 loadSpriteClip 런타임 lazy 로드로 폴백하므로 기능은 깨지지 않는다.
 */
export const BOOT_BATTER_PRELOAD_COUNT = 1;

/** 프리셋 정의 순서 = 로딩 우선순위. 기본 타자(male)가 맨 앞이어야 첫 게임이 지연 없이 뜬다. */
function batterPresetKeys(): BatterPresetKey[] {
  return Object.keys(BATTER_PRESETS) as BatterPresetKey[];
}

/** 부팅(로딩 화면)에서 받을 타자 프리셋 — 앞의 BOOT_BATTER_PRELOAD_COUNT 명. */
export function bootBatterPresetKeys(): BatterPresetKey[] {
  return batterPresetKeys().slice(0, BOOT_BATTER_PRELOAD_COUNT);
}

/** 로비 진입 후 백그라운드로 받을 나머지 타자 프리셋(2명 이하면 빈 배열). */
export function deferredBatterPresetKeys(): BatterPresetKey[] {
  return batterPresetKeys().slice(BOOT_BATTER_PRELOAD_COUNT);
}

/** 주어진 프리셋들의 클립 파일 경로(중복 제거) — 프리로드 대상 계산용. */
export function batterMotionFilesFor(
  index: SpriteIndex | null | undefined,
  node: { readonly characterId?: string; readonly spriteDocFile?: string },
  presetKeys: ReadonlyArray<BatterPresetKey>,
): string[] {
  const files = new Set<string>();
  for (const key of presetKeys) {
    const m = resolveBatterMotionsFor(index, node, key);
    for (const spec of [m.ready, m.action, m.after]) {
      if (spec) files.add(isDerivedMotion(spec) ? spec.from : spec);
    }
  }
  return [...files];
}

/** 노드 하나(플레이 화면)의 3동작 해석 — 투수는 기존 이름 기반, 타자는 프리셋. */
export function resolvePlayNodeMotions(
  index: SpriteIndex | null | undefined,
  node: { readonly name?: string; readonly characterId?: string; readonly spriteDocFile?: string },
): CharacterMotionFiles {
  return isPitcherNode(node)
    ? resolveCharacterMotions(index, node.characterId, node.spriteDocFile)
    : resolveBatterMotions(index, node);
}

// ── 클립 구간 자르기 ──────────────────────────────────────────────────────

/** 스프라이트 문서에서 이 함수가 건드리는 부분만 최소로 기술한 형상(벤더 JSON 은 무타입). */
interface SpriteDocLike {
  readonly clips?: ReadonlyArray<{
    readonly length?: number;
    readonly loop?: string;
    readonly timeScale?: number;
    readonly frameTracks?: ReadonlyArray<{ readonly frames?: ReadonlyArray<number>; readonly loop?: string }>;
  }>;
}

/**
 * 문서의 각 클립을 앞/뒤 n프레임 구간만 남긴 **새 문서**로 복제한다(원본 불변). 시트·앵커·파트는
 * 그대로라 잘라낸 클립도 원본과 픽셀 단위로 정렬된다 — 동작 전환 시 캐릭터가 튀지 않는 이유.
 * length 는 남은 프레임 비율로 줄이고, 반복 재생(loop)으로 바꾼다(준비·후는 대기 동작이므로).
 *
 * @param slow 반복 재생 감속 배수(1=원본, 2=2배 느리게). 클립의 `timeScale` 로 넣는다 — 벤더
 *   ClipPlayer 가 매 틱 `elapsed += dt × timeScale` 로 누적하므로 **클립 길이와 프레임 트랙이
 *   같은 비율로** 함께 느려진다(fps 만 낮추면 트랙 총길이와 clip.length 가 어긋나 루프가 튄다).
 */
export function sliceSpriteDoc<T extends SpriteDocLike>(doc: T, part: 'head' | 'tail', frames: number, slow = 1): T {
  const clips = doc.clips;
  if (!Array.isArray(clips) || clips.length === 0 || frames <= 0) return doc;
  const scaled = (clip: { readonly timeScale?: number }): number => (clip.timeScale ?? 1) / (slow > 0 ? slow : 1);
  return {
    ...doc,
    clips: clips.map((clip) => {
      const tracks = clip.frameTracks;
      if (!Array.isArray(tracks) || tracks.length === 0) return clip;
      const total = tracks[0]?.frames?.length ?? 0;
      const take = Math.min(frames, total);
      if (take <= 0 || take >= total) return { ...clip, loop: 'loop', timeScale: scaled(clip) };
      return {
        ...clip,
        timeScale: scaled(clip),
        // 원본 길이를 프레임 비율로 축소 — fps 가 유지돼 재생 속도가 원본과 같다.
        length: Math.max(1, Math.round(((clip.length ?? 0) * take) / total)),
        loop: 'loop',
        frameTracks: tracks.map((t) => {
          const f = t.frames ?? [];
          return { ...t, frames: part === 'head' ? f.slice(0, take) : f.slice(Math.max(0, f.length - take)), loop: 'loop' };
        }),
      };
    }),
  } as T;
}
