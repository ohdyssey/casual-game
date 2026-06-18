/**
 * Story Catalog — FishGO 배경 서사 / 스토리텔링 매칭시트 v2 (5막 50 스테이지).
 *
 * 출처: 사용자 제공 PDF "FishGO_스토리텔링_매칭시트_v2"
 *   원본 Google Sheets:
 *   https://docs.google.com/spreadsheets/d/e/2PACX-1vSqq18MJYNYla6mTHs3GCngp9a5xVShZ2IaBaLr5dkymq7RRp8EEFTGHgDBRfcP5A/pubhtml
 *
 * ⚠️ 현재 게임 로직과는 별개의 "예정" 서사 마스터 데이터.
 *    아직 스테이지 진행 / 컷신 / 도감 시스템에 연결되지 않음 — 추후 편입 예정.
 *    - STORY_STAGES[].order(1~50) ↔ fish-catalog.js 의 unlockStage(1~50) 와 1:1 정렬 가능.
 *    - storyName / realRegion ↔ locations.config.js 의 낚시터 확장 시 매핑 대상.
 *    - representativeFish 는 서사/일러스트용 "대표 어종"(한글 통칭)으로, fish.config.js 의
 *      실제 spawn 어종(영문 id)과는 별개. 추후 매핑 테이블로 연결.
 *
 * 핵심 전제(STORY_PREMISE):
 *   주인공 Finny 가 산호초 위로 흐르는 "파란 두루마리 실"을 발견한다. 그것은 보물지도가
 *   아니라 바다의 흐름(세계해류)을 기록한 고대 문자이며, 동료 Polly 가 "바다의 기억"임을
 *   해석한다. 팀은 세계 각지의 바다를 항해하며 고대 해류 봉인의 부품을 모으고, 산호를
 *   잠재우는 "먹빛 조류"(오염/위협)를 막으며, 최종적으로 "세계해류의 심장"에 도달해
 *   먹빛 조류를 정화 가능한 흐름으로 바꾼다.
 *
 * 구성: 5막 × 50 스테이지.
 *   1막 열대 산호의 각성        : 1~16  (16)
 *   2막 동아시아·인도양 항로     : 17~25 (9)
 *   3막 남반구·지중해 유적 항로  : 26~33 (8)
 *   4막 북대서양·냉수 항로       : 34~42 (9)
 *   5막 미주·극지 최종 항로      : 43~50 (8)
 *
 * 필드(STORY_STAGES):
 *   order          : 새 순서 / 진행 스테이지 번호 (1~50) — fish-catalog unlockStage 와 정렬
 *   originalNo     : 원문(시트) 번호 — 기획 추적용
 *   actId          : 소속 막 id (STORY_ACTS[].id)
 *   realRegion     : 원문 지역설정 (실제 지구 상의 지역)
 *   storyName      : 스토리 지역명 (게임 내 표기)
 *   role           : 스토리 역할 (해당 스테이지의 서사적 기능)
 *   keyEvent       : 핵심 사건 (전개 본문)
 *   item           : 획득 아이템 (장비/장치)
 *   representativeFish : 대표 어종 (한글 통칭 배열) — 일러스트/연출 기준
 *   characters     : 등장 캐릭터 id 배열 (STORY_CHARACTERS[].id)
 *   imageDirection : 이미지(배경) 제작 방향 — 전부 세로 3:4, 텍스트 없음
 */

/** 원본 시트 공통 Source URL (모든 행 동일). */
export const STORY_SOURCE_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSqq18MJYNYla6mTHs3GCngp9a5xVShZ2IaBaLr5dkymq7RRp8EEFTGHgDBRfcP5A/pubhtml';

/** 한 줄 핵심 전제. */
export const STORY_PREMISE =
  'Finny 가 발견한 "파란 두루마리 실"은 세계해류를 기록한 바다의 기억이다. 팀은 ' +
  '세계 각지를 항해하며 고대 해류 봉인의 부품을 모으고, 산호를 잠재우는 "먹빛 조류"를 ' +
  '막으며 "세계해류의 심장"에 도달해 바다를 정화한다.';

/**
 * @typedef {Object} StoryAct
 * @property {number} id        막 번호 (1~5)
 * @property {string} title     막 제목
 * @property {[number, number]} stageRange  포함 스테이지 order 범위 [from, to]
 * @property {string} summary   막 요약 (분위기/전환)
 */

/** @type {StoryAct[]} */
export const STORY_ACTS = [
  {
    id: 1,
    title: '열대 산호의 각성',
    stageRange: [1, 16],
    summary:
      '두루마리 실과 세계해류의 발견 → 먹빛 조류의 첫 흔적 → 심장 문양 공개 → 첫 방어전. ' +
      '따뜻한 열대 산호초를 무대로 세계관과 핵심 장치(두루마리·봉인·심장)를 도입한다.',
  },
  {
    id: 2,
    title: '동아시아·인도양 항로',
    stageRange: [17, 25],
    summary:
      '환상 항로를 현실 바다와 연결하는 재출발. Oliver 합류로 항해 장비 해석이 가능해지고, ' +
      'Finny 가 거친 바다를 통과하며 리더십을 얻는다. 장거리 항해 장비 완성으로 마무리.',
  },
  {
    id: 3,
    title: '남반구·지중해 유적 항로',
    stageRange: [26, 33],
    summary:
      '차갑고 어두운 남반구로 분위기 전환. 옛 탐험대의 흔적과 고대 신전 장치, "바다의 선택" ' +
      '문장을 공개. 심해 장비를 조립하고 대형 어종·심해 보스 지역을 연다.',
  },
  {
    id: 4,
    title: '북대서양·냉수 항로',
    stageRange: [34, 42],
    summary:
      'Max 합류로 생존형 항해 전환. 힘보다 인내·감각이 필요한 냉수 항로. 북쪽 봉인이 여러 ' +
      '바다에 분산되어 있음을 확인하고, 모든 물길이 하나의 순환임을 결론짓는다.',
  },
  {
    id: 5,
    title: '미주·극지 최종 항로',
    stageRange: [43, 50],
    summary:
      '대륙성 강·습지를 거쳐 최종 항로 진입. 세계해류가 생태계의 기억임을 확정하고 해류 ' +
      '나침반을 완성. 다섯 동료가 모두 모여 북극에서 세계해류의 심장을 다시 깨우는 피날레.',
  },
];

/**
 * @typedef {Object} StoryCharacter
 * @property {string} id          캐릭터 식별자
 * @property {string} name        표기명
 * @property {string} role        역할/성격
 * @property {number|null} joinStage  합류(첫 핵심 등장) 스테이지 order — 상시 동행은 1
 * @property {string} note        합류/이탈/재합류 등 등장 흐름
 */

/** @type {StoryCharacter[]} */
export const STORY_CHARACTERS = [
  {
    id: 'finny',
    name: 'Finny',
    role: '주인공. 두루마리 실의 첫 발견자. 항해를 이끌며 리더로 성장한다.',
    joinStage: 1,
    note: '전(全) 스테이지 등장(1~50).',
  },
  {
    id: 'polly',
    name: 'Polly',
    role: '초기 동료. 두루마리(고대 문자) 해석 전문가. 세계관의 설명자.',
    joinStage: 1,
    note:
      '1막(1~16) 내내 동행. 16~17 전후 Finny 와 잠시 떨어짐. 37(노르웨이)에서 재합류 ' +
      '징후, 50(북극)에서 최종 재합류.',
  },
  {
    id: 'mango',
    name: 'Mango',
    role: '야생적이고 장난스러운 캐릭터. 오래된 바다 전설을 알고 야생의 감각을 지님.',
    joinStage: 16,
    note: '16(마다가스카르)에서 연결. 23·24·46·47·50 등에서 핵심 역할로 재등장.',
  },
  {
    id: 'oliver',
    name: 'Oliver',
    role: '항해 장비·항해 기호 해석 전문가. 밑바닥 구조와 좌표를 읽는다.',
    joinStage: 19,
    note: '19(저우산)에서 합류. 2~3막 주요 동행, 49(케이프타운)에서 역할 결합.',
  },
  {
    id: 'max',
    name: 'Max',
    role: '냉수·거친 바다 생존 전문가. 힘보다 기다림의 감각을 강조한다.',
    joinStage: 34,
    note: '34(아일랜드)에서 합류. 4막~5막 주요 동행.',
  },
];

/**
 * @typedef {Object} StoryStage
 * @property {number}   order
 * @property {number}   originalNo
 * @property {number}   actId
 * @property {string}   realRegion
 * @property {string}   storyName
 * @property {string}   role
 * @property {string}   keyEvent
 * @property {string}   item
 * @property {string[]} representativeFish
 * @property {string[]} characters
 * @property {string}   imageDirection
 */

/** @type {StoryStage[]} */
export const STORY_STAGES = [
  // ─────────────────────────── 1막 열대 산호의 각성 (1~16) ───────────────────────────
  {
    order: 1, originalNo: 4, actId: 1,
    realRegion: '일본 오키나와', storyName: '두루마리 산호만',
    role: '두루마리와 세계해류의 존재를 처음 발견하는 도입부',
    keyEvent:
      'Finny 가 산호초 위로 흐르는 파란 두루마리 실을 발견하고, Polly 가 그것이 보물지도가 ' +
      '아니라 바다의 흐름을 기록한 고대 문자임을 알아차린다.',
    item: '파란 두루마리 실',
    representativeFish: ['클라운피시', '블루탱'],
    characters: ['finny', 'polly'],
    imageDirection:
      '세로 3:4. 캐주얼 카툰 수중 탑뷰. 밝은 청록색 물, 산호초, 파란 두루마리 실, 작은 ' +
      '열대어. 텍스트 없음. 움직이는 생물체는 작게 보조 요소로만 배치.',
  },
  {
    order: 2, originalNo: 9, actId: 1,
    realRegion: '태국 푸켓 / 안다만해', storyName: '안다만 햇살 라군',
    role: '두루마리의 첫 문장을 해석하고 항해의 목적을 제시한다',
    keyEvent:
      '태양 산호 미끼가 햇빛을 모아 두루마리 위에 숨겨진 첫 문장을 띄운다. Polly 는 ' +
      '"바다는 하나의 길로 이어진다"는 문장을 해석한다.',
    item: '태양 산호 미끼',
    representativeFish: ['나비고기', '트리거피시'],
    characters: ['finny', 'polly'],
    imageDirection:
      '세로 3:4. 햇살이 비치는 열대 라군, 노란빛 산호, 투명한 모래 바닥, 작은 미끼 아이템 ' +
      '중심. 텍스트 없음.',
  },
  {
    order: 3, originalNo: 10, actId: 1,
    realRegion: '필리핀 팔라완', storyName: '팔라완 동굴 산호문',
    role: '첫 번째 위험과 먹빛 조류의 흔적을 보여준다',
    keyEvent:
      '동굴 조개열쇠가 닫힌 산호문을 열자, 안쪽에는 먹빛 조류가 산호를 잠재운 검은 흔적이 ' +
      '남아 있다. Finny 는 이 모험이 보물찾기만은 아니라고 느낀다.',
    item: '동굴 조개열쇠',
    representativeFish: ['클라운피시', '곰치'],
    characters: ['finny', 'polly'],
    imageDirection:
      '세로 3:4. 맑은 옥색 물, 동굴형 암반, 산호문, 작은 조개열쇠. 어종은 너무 크게 그리지 ' +
      '않음. 텍스트 없음.',
  },
  {
    order: 4, originalNo: 11, actId: 1,
    realRegion: '인도네시아 발리 / 롬복', storyName: '발리 화산 라군',
    role: '해저 열류와 장비 강화 개념을 처음 도입한다',
    keyEvent:
      '화산암 릴기어가 뜨거운 해저 조류를 견디며 두루마리의 불안정한 문자를 고정한다. ' +
      'Polly 는 해류 장치가 온도와 조류의 균형으로 작동한다는 것을 알아낸다.',
    item: '화산암 릴기어',
    representativeFish: ['만다린피시', '그루퍼'],
    characters: ['finny', 'polly'],
    imageDirection:
      '세로 3:4. 깊은 청록과 블루 혼합, 검은 화산암, 따뜻한 빛의 열류, 작은 릴기어. ' +
      '텍스트 없음.',
  },
  {
    order: 5, originalNo: 12, actId: 1,
    realRegion: '말레이시아 보르네오 사바', storyName: '보르네오 해초정원',
    role: '복잡한 해류를 풀어내는 퍼즐형 진행을 만든다',
    keyEvent:
      '해초 매듭추가 뒤엉킨 해초와 조류를 풀어내자 산호들이 서로 신호를 주고받는 장면이 ' +
      '나타난다. Finny 는 바다가 하나의 리듬으로 움직인다는 것을 배운다.',
    item: '해초 매듭추',
    representativeFish: ['파로트피시', '엔젤피시'],
    characters: ['finny', 'polly'],
    imageDirection:
      '세로 3:4. 밝은 열대 해초정원, 산호와 수초, 작은 매듭추, 선명한 청록 수채화 톤. ' +
      '텍스트 없음.',
  },
  {
    order: 6, originalNo: 13, actId: 1,
    realRegion: '몰디브 아톨', storyName: '몰디브 별빛 아톨',
    role: '세계해류의 심장 문양을 처음 공개한다',
    keyEvent:
      '별빛 조개부표가 밤바다의 빛을 받아 바다 속 항로를 표시한다. 두루마리에는 처음으로 ' +
      '세계해류의 심장 문양이 떠오른다.',
    item: '별빛 조개부표',
    representativeFish: ['쥐가오리', '고래상어'],
    characters: ['finny', 'polly'],
    imageDirection:
      '세로 3:4. 밝은 얕은 바다, 흰 모래, 원형 산호, 별빛 반사, 조개부표. 대형 어종은 작게 ' +
      '보조 배치. 텍스트 없음.',
  },
  {
    order: 7, originalNo: 17, actId: 1,
    realRegion: '호주 그레이트 배리어 리프', storyName: '대산호 생명의 장벽',
    role: '첫 번째 방어전과 산호 장치의 존재를 확정한다',
    keyEvent:
      '대산호 방패가 먹빛 조류의 첫 공격을 막아내며, 거대한 산호 장벽이 고대 해류 장치를 ' +
      '지키던 방어막이었다는 사실이 드러난다.',
    item: '대산호 방패',
    representativeFish: ['나폴레옹피시', '만새기'],
    characters: ['finny', 'polly'],
    imageDirection:
      '세로 3:4. 대형 산호초, 화려한 색상, 방패 모양 산호 장치, 청록 물빛. 물고기는 작은 ' +
      '크기 유지. 텍스트 없음.',
  },
  {
    order: 8, originalNo: 20, actId: 1,
    realRegion: '피지 라군', storyName: '피지 둥근 산호만',
    role: '산호 장치들이 서로 통신한다는 설정을 확장한다',
    keyEvent:
      '둥근 산호찌가 원형 파동을 만들자 사라졌던 두루마리 문자 일부가 다시 떠오른다. ' +
      'Finny 와 Polly 는 산호들이 서로 신호를 주고받고 있었다는 것을 확인한다.',
    item: '둥근 산호찌',
    representativeFish: ['돛새치', '트레발리'],
    characters: ['finny', 'polly'],
    imageDirection:
      '세로 3:4. 밝은 청록 물, 둥근 산호, 원형 파동, 휴양지 느낌. 텍스트 없음.',
  },
  {
    order: 9, originalNo: 21, actId: 1,
    realRegion: '파푸아뉴기니 산호해', storyName: '파푸아 원시 산호해',
    role: '고대 해류 봉인의 첫 부품을 끌어올린다',
    keyEvent:
      '원시 암초 갈고리가 암초 깊은 곳에 걸린 오래된 해류 사슬을 끌어올린다. Polly 는 이 ' +
      '사슬이 세계해류의 첫 번째 봉인을 고정하던 부품임을 알아낸다.',
    item: '원시 암초 갈고리',
    representativeFish: ['라이언피시', '바라쿠다'],
    characters: ['finny', 'polly'],
    imageDirection:
      '세로 3:4. 원시적 산호초, 강한 색 대비, 복잡한 암초, 갈고리 아이템 중심. 텍스트 없음.',
  },
  {
    order: 10, originalNo: 22, actId: 1,
    realRegion: '타히티 / 보라보라', storyName: '보라보라 몽환 라군',
    role: 'Finny 의 선택과 리더십을 처음 시험한다',
    keyEvent:
      '파스텔 산호나침반은 정확한 방향을 가리키지 않고 Finny 의 선택에 따라 색이 변한다. ' +
      'Polly 는 이 나침반이 길보다 항해자의 마음을 읽는 장치라고 말한다.',
    item: '파스텔 산호나침반',
    representativeFish: ['블루탱', '무어리시 아이돌'],
    characters: ['finny', 'polly'],
    imageDirection:
      '세로 3:4. 라군형 바다, 파스텔 산호, 몽환적 수채화, 작은 나침반. 텍스트 없음.',
  },
  {
    order: 11, originalNo: 37, actId: 1,
    realRegion: '미국 플로리다 키스', storyName: '플로리다 키스 얕은 산호길',
    role: 'Finny 가 직접 두루마리를 읽는 성장 지점',
    keyEvent:
      '얕은 바다 투명줄이 맑은 물속에서만 보이는 길을 연결한다. Finny 는 처음으로 두루마리 ' +
      '일부를 직접 읽어내며 Polly 에게만 의존하던 상태에서 성장한다.',
    item: '얕은 바다 투명줄',
    representativeFish: ['본피시', '타폰'],
    characters: ['finny', 'polly'],
    imageDirection:
      '세로 3:4. 얕은 열대 바다, 산호길, 밝은 햇빛, 투명줄의 흐름. 텍스트 없음.',
  },
  {
    order: 12, originalNo: 39, actId: 1,
    realRegion: '바하마', storyName: '바하마 빛모래 항로',
    role: '아름다운 바다 아래 숨은 오염의 흔적을 보여준다',
    keyEvent:
      '빛모래 루어가 모래 속에 숨어 있던 작은 해류 문장을 끌어올린다. 아름다운 모래 밑에는 ' +
      '먹빛 조류가 지나간 검은 자국이 남아 있다.',
    item: '빛모래 루어',
    representativeFish: ['플라잉피시', '레드스내퍼'],
    characters: ['finny', 'polly'],
    imageDirection:
      '세로 3:4. 투명한 라이트블루, 흰 모래, 빛모래 루어, 아주 옅은 검은 조류 흔적. ' +
      '텍스트 없음.',
  },
  {
    order: 13, originalNo: 45, actId: 1,
    realRegion: '하와이', storyName: '하와이 무지개 화산해안',
    role: '서로 다른 해류를 하나로 섞는 통합 장치를 획득한다',
    keyEvent:
      '무지개 화산석이 열대 해류, 화산 해류, 산호 해류의 색을 하나로 섞어준다. 팀은 서로 ' +
      '다른 물길이 같은 중심으로 향한다는 사실을 확인한다.',
    item: '무지개 화산석',
    representativeFish: ['옐로탱', '참다랑어'],
    characters: ['finny', 'polly'],
    imageDirection:
      '세로 3:4. 화산암과 밝은 산호 대비, 무지개빛 조류, 선명한 청록 물. 텍스트 없음.',
  },
  {
    order: 14, originalNo: 46, actId: 1,
    realRegion: '이집트 홍해', storyName: '홍해 붉은 산호협곡',
    role: '세계해류의 심장 박동을 느끼게 한다',
    keyEvent:
      '붉은 산호봉이 협곡 속에서 맥박처럼 빛난다. Polly 는 이 빛이 세계해류의 심장 박동과 ' +
      '연결된 신호라고 해석한다.',
    item: '붉은 산호봉',
    representativeFish: ['독가시치', '복어'],
    characters: ['finny', 'polly'],
    imageDirection:
      '세로 3:4. 선명한 블루, 붉은 산호협곡, 박동하는 봉 형태의 아이템, 강한 색 대비. ' +
      '텍스트 없음.',
  },
  {
    order: 15, originalNo: 47, actId: 1,
    realRegion: '세이셸', storyName: '세이셸 수정 화강암만',
    role: '동료를 부르는 항로라는 의미를 처음 암시한다',
    keyEvent:
      '수정 화강암 핀이 빛을 굴절시켜 숨겨진 해저 문양을 드러낸다. 그 문양은 다음 대륙 ' +
      '항로가 단순 지도가 아니라 동료를 불러 모으는 길임을 암시한다.',
    item: '수정 화강암 핀',
    representativeFish: ['자이언트 트레발리', '돛새치'],
    characters: ['finny', 'polly'],
    imageDirection:
      '세로 3:4. 화강암 바위, 투명한 바다, 수정빛 반사, 고급 휴양지 느낌. 텍스트 없음.',
  },
  {
    order: 16, originalNo: 48, actId: 1,
    realRegion: '마다가스카르', storyName: '마다가스카르 야생 산호절벽',
    role: 'Mango 의 세계와 연결되며 1막을 마무리한다',
    keyEvent:
      '야생 산호표식이 Mango 의 영역과 연결된다. Mango 는 장난스럽지만 오래된 바다 전설을 ' +
      '알고 있으며, 두루마리는 지도가 아니라 바다의 기억이라고 알려준다.',
    item: '야생 산호표식',
    representativeFish: ['코랄트라우트', '야생 그루퍼'],
    characters: ['finny', 'polly', 'mango'],
    imageDirection:
      '세로 3:4. 원시적 열대 해안, 야생 산호, 깊은 녹청색 물, 표식 장치. 텍스트 없음.',
  },

  // ─────────────────────── 2막 동아시아·인도양 항로 (17~25) ───────────────────────
  {
    order: 17, originalNo: 1, actId: 2,
    realRegion: '한국 남해 앞바다', storyName: '귀환 전초 남해포구',
    role: '환상 항로를 현실 바다와 연결하는 재출발 지점',
    keyEvent:
      'Finny 는 잠시 Polly 와 떨어져 한국 남해에서 혼자 항로를 다시 확인한다. 남해 ' +
      '조개바늘은 현실 세계의 바다와 두루마리 속 바다를 꿰매는 첫 바늘이 된다.',
    item: '남해 조개바늘',
    representativeFish: ['참돔', '전갱이'],
    characters: ['finny'],
    imageDirection:
      '세로 3:4. 청록색 남해 수중, 암반, 해초, 조개, 성게. 수중 탑뷰, 텍스트 없음.',
  },
  {
    order: 18, originalNo: 2, actId: 2,
    realRegion: '제주도 화산 해안', storyName: '제주 현무암 조류문',
    role: '현실 지형과 두루마리 항로가 겹친다는 사실을 확인한다',
    keyEvent:
      '현무암 싱커가 거친 조류 속에서도 낚싯줄을 가라앉혀 해저 문을 고정한다. Finny 는 ' +
      '환상 항로가 실제 지형과 겹쳐진다는 것을 확인한다.',
    item: '현무암 싱커',
    representativeFish: ['돌돔', '자리돔'],
    characters: ['finny'],
    imageDirection:
      '세로 3:4. 검은 현무암 바닥, 맑은 물, 해초 숲, 바위 그림자. 텍스트 없음.',
  },
  {
    order: 19, originalNo: 5, actId: 2,
    realRegion: '중국 저우산 군도', storyName: '저우산 어촌 암초',
    role: 'Oliver 가 합류하며 항해 장비 해석이 가능해진다',
    keyEvent:
      '어촌 닻조각은 오래된 배의 잔해에서 발견된다. Oliver 가 합류해 닻조각의 항해 기호를 ' +
      '해석하고, 이 모험이 고대 항해자의 미완성 항로를 따라가는 것임을 설명한다.',
    item: '어촌 닻조각',
    representativeFish: ['민어', '숭어'],
    characters: ['finny', 'oliver'],
    imageDirection:
      '세로 3:4. 녹청색 연안, 어촌 암초, 해조류, 닻조각. 도시 구조물은 배제하고 수중 중심. ' +
      '텍스트 없음.',
  },
  {
    order: 20, originalNo: 6, actId: 2,
    realRegion: '홍콩 남중국해 연안', storyName: '홍콩 청록 암반만',
    role: '도시 근해 아래 숨은 조용한 해류를 읽는다',
    keyEvent:
      '청록 암반찌가 도시 가까운 바다의 소란 속에서도 조용한 해저 흐름을 잡아낸다. ' +
      'Oliver 는 겉으로 보이는 바다가 아니라 밑바닥 암반 구조를 읽어야 한다고 조언한다.',
    item: '청록 암반찌',
    representativeFish: ['우럭', '감성돔'],
    characters: ['finny', 'oliver'],
    imageDirection:
      '세로 3:4. 청록 바다, 암반, 열대성 수중 식생. 도시 스카이라인 없음. 텍스트 없음.',
  },
  {
    order: 21, originalNo: 7, actId: 2,
    realRegion: '대만 펑후 제도', storyName: '펑후 얕은 현무암 해역',
    role: '팀 항해의 기본 리듬을 형성한다',
    keyEvent:
      '펑후 해초핀이 얕은 현무암 지형에 흩어진 해초 신호를 한 방향으로 정렬한다. Finny 는 ' +
      'Oliver 의 도움으로 장비 조합과 조류 읽기를 배운다.',
    item: '펑후 해초핀',
    representativeFish: ['바라문디', '본피시'],
    characters: ['finny', 'oliver'],
    imageDirection:
      '세로 3:4. 얕은 바다, 현무암 암초, 밝은 해초, 투명한 바닥. 텍스트 없음.',
  },
  {
    order: 22, originalNo: 8, actId: 2,
    realRegion: '베트남 하롱베이', storyName: '하롱베이 석회암 미궁',
    role: '입체 지형을 해석하는 퍼즐형 항로',
    keyEvent:
      '석회암 지도조각은 미궁처럼 갈라진 암반 사이에서 발견된다. 이 조각은 물의 높이와 ' +
      '조류 방향에 따라 모양이 바뀌는 입체 지도다.',
    item: '석회암 지도조각',
    representativeFish: ['그루퍼', '만새기'],
    characters: ['finny', 'oliver'],
    imageDirection:
      '세로 3:4. 에메랄드 물, 석회암 그림자, 신비로운 암반 미궁. 텍스트 없음.',
  },
  {
    order: 23, originalNo: 14, actId: 2,
    realRegion: '인도 케랄라 백워터', storyName: '케랄라 녹색 합수로',
    role: '서로 다른 물과 성격이 섞이는 팀 확장 지점',
    keyEvent:
      '녹색 합수병은 민물과 바닷물이 만나는 지점의 물을 담아야 작동한다. Mango 는 서로 ' +
      '다른 물이 섞일 때 새 길이 열린다고 말하며 팀의 다양성을 강조한다.',
    item: '녹색 합수병',
    representativeFish: ['스누크', '바라문디'],
    characters: ['finny', 'mango'],
    imageDirection:
      '세로 3:4. 녹색 수역, 수초, 진흙 바닥, 민물·바닷물 혼합 표현. 텍스트 없음.',
  },
  {
    order: 24, originalNo: 15, actId: 2,
    realRegion: '스리랑카 남해안', storyName: '스리랑카 청록 해류절벽',
    role: 'Finny 가 거친 바다를 통과하며 리더십을 얻는다',
    keyEvent:
      '청록 해류석은 절벽 아래 거친 조류 속에서만 빛난다. Finny 는 안정된 라군을 벗어나 ' +
      '거친 바다를 직접 통과하며 리더로 성장하기 시작한다.',
    item: '청록 해류석',
    representativeFish: ['황다랑어', '가다랑어'],
    characters: ['finny', 'mango'],
    imageDirection:
      '세로 3:4. 깊은 청록 바다, 바위 틈, 거친 조류, 절벽 그림자. 텍스트 없음.',
  },
  {
    order: 25, originalNo: 16, actId: 2,
    realRegion: '오만 / 아라비아해', storyName: '아라비아 사막해안',
    role: '장거리 항해 장비를 완성하고 2막을 닫는다',
    keyEvent:
      '사막 바다모래추는 건조한 바람과 깊은 바다의 압력을 동시에 견디는 균형추다. 이 ' +
      '장비가 완성되며 팀은 남반구와 지중해 유적 항로로 나아갈 수 있게 된다.',
    item: '사막 바다모래추',
    representativeFish: ['황새치', '돛새치'],
    characters: ['finny', 'oliver'],
    imageDirection:
      '세로 3:4. 모래빛 바닥, 짙은 청색 물, 건조한 색감, 균형추 아이템. 텍스트 없음.',
  },

  // ──────────────────── 3막 남반구·지중해 유적 항로 (26~33) ────────────────────
  {
    order: 26, originalNo: 18, actId: 3,
    realRegion: '호주 태즈메이니아', storyName: '태즈메이니아 차가운 해초숲',
    role: '따뜻한 열대권에서 차가운 남반구로 분위기를 전환한다',
    keyEvent:
      '남반구 해초릴이 차가운 해초숲 속에서 엉킨 줄을 풀어낸다. Finny 는 처음으로 차갑고 ' +
      '어두운 바다의 공포와 마주한다.',
    item: '남반구 해초릴',
    representativeFish: ['태즈메이니아 대구', '해초어'],
    characters: ['finny', 'oliver'],
    imageDirection:
      '세로 3:4. 차가운 남반구 바다, 해초 숲, 어두운 암반, 청록·남색 톤. 텍스트 없음.',
  },
  {
    order: 27, originalNo: 19, actId: 3,
    realRegion: '뉴질랜드 밀포드 사운드', storyName: '밀포드 빛줄기 협만',
    role: '깊은 협만에서 고대 좌표를 해석한다',
    keyEvent:
      '협만 빛줄기 랜턴이 깊은 협곡 아래까지 햇빛을 끌어내린다. Oliver 는 빛줄기의 각도를 ' +
      '읽어 고대 항해자들이 남긴 남반구 좌표를 해석한다.',
    item: '협만 빛줄기 랜턴',
    representativeFish: ['메로', '심해어'],
    characters: ['finny', 'oliver'],
    imageDirection:
      '세로 3:4. 피오르드형 깊은 물, 어두운 바위, 수중 빛줄기, 신비로운 협곡. 텍스트 없음.',
  },
  {
    order: 28, originalNo: 27, actId: 3,
    realRegion: '프랑스 리비에라', storyName: '리비에라 유리빛 해저',
    role: '지나온 해류의 기억을 되돌아보는 감정 장면',
    keyEvent:
      '유리빛 바다핀이 지나온 해류의 기억을 거울처럼 비춘다. Finny 는 자신들이 앞으로 ' +
      '나아가는 동시에 사라진 바다의 기억을 복원하고 있음을 깨닫는다.',
    item: '유리빛 바다핀',
    representativeFish: ['농어', '감성돔'],
    characters: ['finny', 'oliver'],
    imageDirection:
      '세로 3:4. 지중해식 맑은 블루, 밝은 바위, 유리빛 반사, 깨끗한 해저. 텍스트 없음.',
  },
  {
    order: 29, originalNo: 28, actId: 3,
    realRegion: '이탈리아 아말피 / 카프리', storyName: '아말피 푸른 동굴',
    role: '옛 탐험대의 흔적을 공개한다',
    keyEvent:
      '푸른 동굴 렌즈가 동굴 벽에 숨겨진 그림을 확대한다. 그림 속에는 세계해류의 심장을 ' +
      '향해 항해했던 옛 탐험대가 남아 있다.',
    item: '푸른 동굴 렌즈',
    representativeFish: ['붕장어', '금눈돔'],
    characters: ['finny', 'oliver'],
    imageDirection:
      '세로 3:4. 절벽 아래 맑은 바다, 푸른 동굴, 밝은 암반, 렌즈 아이템. 텍스트 없음.',
  },
  {
    order: 30, originalNo: 29, actId: 3,
    realRegion: '그리스 산토리니 / 에게해', storyName: '산토리니 코발트 신전',
    role: '고대 신전 장치와 바다의 선택 문장을 공개한다',
    keyEvent:
      '코발트 신전석을 물속 신전의 중심 장치에 끼워 넣자 두루마리가 "심장에 닿는 자는 ' +
      '바다의 선택을 받아야 한다"는 문장을 보여준다.',
    item: '코발트 신전석',
    representativeFish: ['라브락', '도미'],
    characters: ['finny', 'oliver'],
    imageDirection:
      '세로 3:4. 코발트 블루, 흰 바위 반사광, 단순한 해저 신전 흔적, 신전석. 텍스트 없음.',
  },
  {
    order: 31, originalNo: 30, actId: 3,
    realRegion: '크로아티아 달마티아 해안', storyName: '달마티아 자갈 해안',
    role: '작은 지형 변화도 항로의 일부임을 보여준다',
    keyEvent:
      '자갈 해안추가 작은 자갈 틈에 숨어 있는 미세한 조류를 감지한다. 팀은 거대한 유적뿐 ' +
      '아니라 작은 바닥의 변화도 항로의 일부라는 것을 배운다.',
    item: '자갈 해안추',
    representativeFish: ['서대', '농어'],
    characters: ['finny', 'oliver'],
    imageDirection:
      '세로 3:4. 투명한 아드리아해, 자갈 바닥, 바위 틈, 차분한 푸른 톤. 텍스트 없음.',
  },
  {
    order: 32, originalNo: 32, actId: 3,
    realRegion: '스페인 카나리아 제도', storyName: '카나리아 화산암 해저',
    role: '심해 장비 조립을 시작한다',
    keyEvent:
      '화산암 부품은 뜨거운 심해와 차가운 표층수를 연결하는 조립 부품이다. Oliver 는 이 ' +
      '부품들이 모이면 심해로 내려갈 수 있는 대형 장비가 된다고 판단한다.',
    item: '화산암 부품',
    representativeFish: ['아귀', '그루퍼'],
    characters: ['finny', 'oliver'],
    imageDirection:
      '세로 3:4. 화산암 해저, 검은 바위와 청록 물 대비, 조립 부품 중심. 텍스트 없음.',
  },
  {
    order: 33, originalNo: 31, actId: 3,
    realRegion: '포르투갈 아조레스', storyName: '아조레스 대서양 화산섬',
    role: '대형 어종 항로와 심해 보스 지역을 연다',
    keyEvent:
      '대서양 대형훅이 완성되면서 대형 어종 항로가 열린다. 동시에 심해 보스 지역의 신호가 ' +
      '나타나고 모험은 본격적인 대결 구도로 전환된다.',
    item: '대서양 대형훅',
    representativeFish: ['참다랑어', '청새치'],
    characters: ['finny', 'oliver'],
    imageDirection:
      '세로 3:4. 대서양 화산섬, 깊은 바다, 거친 암초, 대형훅. 어종은 과대하게 배치하지 않음. ' +
      '텍스트 없음.',
  },

  // ───────────────────── 4막 북대서양·냉수 항로 (34~42) ─────────────────────
  {
    order: 34, originalNo: 26, actId: 4,
    realRegion: '아일랜드 대서양 절벽 해안', storyName: '아일랜드 절벽 파도길',
    role: 'Max 가 합류하며 생존형 항해로 전환한다',
    keyEvent:
      '절벽 파도깃이 거친 파도 속에서도 바람과 물결의 방향을 읽게 해준다. Max 가 합류하며 ' +
      '차가운 바다에서 살아남는 법을 알려준다.',
    item: '절벽 파도깃',
    representativeFish: ['대서양대구', '청어'],
    characters: ['finny', 'max'],
    imageDirection:
      '세로 3:4. 거친 바위, 깊은 물, 파도 그림자, 절벽 파도깃. 텍스트 없음.',
  },
  {
    order: 35, originalNo: 25, actId: 4,
    realRegion: '스코틀랜드 로크', storyName: '스코틀랜드 안개 로크',
    role: '힘보다 인내와 감각이 필요하다는 테마를 제시한다',
    keyEvent:
      '안개 로크렌즈는 안개를 없애는 것이 아니라 안개 속에서만 보이는 흐름을 읽게 해준다. ' +
      'Max 는 무작정 밀어붙이는 힘보다 기다리는 감각이 중요하다고 말한다.',
    item: '안개 로크렌즈',
    representativeFish: ['파이크', '송어'],
    characters: ['finny', 'max'],
    imageDirection:
      '세로 3:4. 어두운 녹청색 물, 수초, 안개 낀 호수형 수중 분위기. 텍스트 없음.',
  },
  {
    order: 36, originalNo: 33, actId: 4,
    realRegion: '네덜란드 운하 낚시', storyName: '네덜란드 운하 수문',
    role: '인간이 만든 수로도 세계해류와 연결됨을 보여준다',
    keyEvent:
      '운하 수문열쇠가 막힌 물길을 연다. 팀은 바다뿐 아니라 인간이 만든 수로까지 세계해류와 ' +
      '연결되어 있다는 사실을 알게 된다.',
    item: '운하 수문열쇠',
    representativeFish: ['잉어', '농어'],
    characters: ['finny', 'max'],
    imageDirection:
      '세로 3:4. 운하형 수중, 녹색 수초, 벽돌·자갈 바닥 느낌, 수문열쇠. 텍스트 없음.',
  },
  {
    order: 37, originalNo: 23, actId: 4,
    realRegion: '노르웨이 피오르드', storyName: '노르웨이 피오르드 심해문',
    role: '북쪽 봉인의 고대 문자를 깨운다',
    keyEvent:
      '피오르드 룬스톤이 심해문에 새겨진 고대 문자를 깨운다. Polly 가 다시 합류할 징후가 ' +
      '나타나며 두루마리의 북쪽 문장이 완성되기 시작한다.',
    item: '피오르드 룬스톤',
    representativeFish: ['연어', '대구'],
    characters: ['finny', 'max'],
    imageDirection:
      '세로 3:4. 깊고 차가운 청색, 절벽 그림자, 바위 바닥, 룬스톤. 텍스트 없음.',
  },
  {
    order: 38, originalNo: 24, actId: 4,
    realRegion: '아이슬란드 화산 해안', storyName: '아이슬란드 검은 화산해안',
    role: '먹빛 조류와 닮은 검은 물질의 다른 의미를 보여준다',
    keyEvent:
      '검은 화산유리는 먹빛 조류와 닮았지만 오히려 그것을 반사해 약점을 보여준다. Finny 는 ' +
      '적처럼 보이는 검은 바다에도 필요한 기억이 있음을 이해한다.',
    item: '검은 화산유리',
    representativeFish: ['아귀', '대구'],
    characters: ['finny', 'max'],
    imageDirection:
      '세로 3:4. 검은 화산암, 차가운 바닷물, 어두운 푸른 톤, 검은 화산유리. 텍스트 없음.',
  },
  {
    order: 39, originalNo: 3, actId: 4,
    realRegion: '일본 홋카이도 냉수 해역', storyName: '홋카이도 냉수 다시마숲',
    role: '팀워크로 차가운 해류 매듭을 묶는다',
    keyEvent:
      '냉수 다시마매듭이 차가운 해류의 끊어진 부분을 묶어준다. Max 와 Finny 는 다시마숲에서 ' +
      '길을 잃지만 팀워크로 조류의 박자를 맞추며 빠져나온다.',
    item: '냉수 다시마매듭',
    representativeFish: ['청어', '연어'],
    characters: ['finny', 'max'],
    imageDirection:
      '세로 3:4. 차가운 푸른 물, 어두운 암초, 다시마 숲, 은은한 빙냉 분위기. 텍스트 없음.',
  },
  {
    order: 40, originalNo: 35, actId: 4,
    realRegion: '캐나다 밴쿠버섬', storyName: '밴쿠버 켈프숲 항로',
    role: '북쪽 봉인이 여러 바다에 분산되어 있음을 확인한다',
    keyEvent:
      '켈프숲 탐지추가 거대한 켈프숲 아래 숨은 북태평양 항로를 찾아낸다. 팀은 북쪽 봉인이 ' +
      '여러 차가운 바다에 나뉘어 있다는 것을 확인한다.',
    item: '켈프숲 탐지추',
    representativeFish: ['할리벗', '연어'],
    characters: ['finny', 'max'],
    imageDirection:
      '세로 3:4. 켈프 숲, 차가운 태평양, 암반 지형, 짙은 블루그린. 텍스트 없음.',
  },
  {
    order: 41, originalNo: 34, actId: 4,
    realRegion: '알래스카 빙하만', storyName: '알래스카 빙하만',
    role: '빙하 아래까지 번진 먹빛 조류를 보여준다',
    keyEvent:
      '빙하 반사석이 얼음빛을 반사해 바다 아래 봉인의 위치를 드러낸다. 먹빛 조류가 빙하 ' +
      '아래까지 번지고 있음이 드러난다.',
    item: '빙하 반사석',
    representativeFish: ['연어', '할리벗'],
    characters: ['finny', 'max'],
    imageDirection:
      '세로 3:4. 차가운 푸른 물, 빙하빛 반사, 어두운 암반, 반사석. 텍스트 없음.',
  },
  {
    order: 42, originalNo: 36, actId: 4,
    realRegion: '미국 오대호', storyName: '오대호 잔잔한 담수권',
    role: '모든 물길이 하나의 순환이라는 결론을 얻는다',
    keyEvent:
      '담수 자갈찌가 바다가 아닌 담수에서도 세계해류의 미세한 흔적을 찾아낸다. 팀은 모든 ' +
      '물길이 결국 하나의 순환으로 이어진다는 결론에 도달한다.',
    item: '담수 자갈찌',
    representativeFish: ['배스', '송어'],
    characters: ['finny', 'max'],
    imageDirection:
      '세로 3:4. 거대한 담수호, 모래·자갈 바닥, 맑은 민물, 차분한 색감. 텍스트 없음.',
  },

  // ──────────────────── 5막 미주·극지 최종 항로 (43~50) ────────────────────
  {
    order: 43, originalNo: 38, actId: 5,
    realRegion: '미국 루이지애나 습지', storyName: '루이지애나 늪지 수중길',
    role: '대륙성 강과 습지를 통해 최종 항로에 진입한다',
    keyEvent:
      '습지 뿌리 루어가 진흙과 뿌리 사이에 숨어 있는 오래된 물길을 끌어낸다. Max 는 힘으로, ' +
      'Finny 는 섬세한 조작으로 늪지의 숨은 길을 통과한다.',
    item: '습지 뿌리 루어',
    representativeFish: ['메기', '가아'],
    characters: ['finny', 'max'],
    imageDirection:
      '세로 3:4. 늪지형 수중, 수초, 진흙 바닥, 어두운 녹색 분위기, 뿌리 루어. 텍스트 없음.',
  },
  {
    order: 44, originalNo: 40, actId: 5,
    realRegion: '멕시코 바하 캘리포니아', storyName: '바하 캘리포니아 사막심해',
    role: '얕은 해안과 갑자기 깊어지는 심해의 낙차를 넘는다',
    keyEvent:
      '사막심해 훅이 얕은 사막 해안에서 갑자기 깊어지는 심해를 붙잡는다. 팀은 세계해류의 ' +
      '심장으로 가는 길이 안전한 항로가 아니라 위험한 낙차를 따라간다는 것을 알게 된다.',
    item: '사막심해 훅',
    representativeFish: ['청상아리', '청새치'],
    characters: ['finny', 'max'],
    imageDirection:
      '세로 3:4. 사막 해안 느낌의 수중 바닥, 깊은 바다 낙차, 암초, 훅 아이템. 텍스트 없음.',
  },
  {
    order: 45, originalNo: 41, actId: 5,
    realRegion: '페루 훔볼트 해류', storyName: '페루 훔볼트 냉류',
    role: '강력한 냉류를 견디며 남미 해류를 고정한다',
    keyEvent:
      '훔볼트 해류석이 강력한 냉류를 견디며 남미 해류의 방향을 고정한다. Finny 는 차가운 ' +
      '물살에 밀려나지만 Max 의 도움으로 중심을 잡는다.',
    item: '훔볼트 해류석',
    representativeFish: ['남방참다랑어', '멸치떼'],
    characters: ['finny', 'max'],
    imageDirection:
      '세로 3:4. 차가운 남미 해류, 짙은 청색 물, 해조류, 해류석 중심. 텍스트 없음.',
  },
  {
    order: 46, originalNo: 42, actId: 5,
    realRegion: '브라질 아마존강', storyName: '아마존 수몰나무 강',
    role: '강과 바다, 숲과 물의 기억을 연결한다',
    keyEvent:
      '수몰나무 토템이 강과 바다, 숲과 물의 기억을 연결한다. Mango 가 야생의 감각으로 ' +
      '토템의 진짜 위치를 찾아내며 다시 핵심 역할을 한다.',
    item: '수몰나무 토템',
    representativeFish: ['피라냐', '아라파이마'],
    characters: ['finny', 'mango', 'max'],
    imageDirection:
      '세로 3:4. 열대 민물, 탁한 녹갈색 물, 수몰 나무뿌리, 토템. 텍스트 없음.',
  },
  {
    order: 47, originalNo: 44, actId: 5,
    realRegion: '갈라파고스 제도', storyName: '갈라파고스 원시 암초',
    role: '세계해류가 생태계의 기억이라는 사실을 확정한다',
    keyEvent:
      '원시 진화석은 오래된 생명의 흐름을 담고 있다. 팀은 세계해류의 심장이 기계가 아니라 ' +
      '바다 생태계 전체의 기억을 품은 존재임을 깨닫는다.',
    item: '원시 진화석',
    representativeFish: ['귀상어', '만타'],
    characters: ['finny', 'mango', 'max'],
    imageDirection:
      '세로 3:4. 화산암, 원시적인 바다, 어두운 암초, 진화석. 대표 어종은 작게 보조. ' +
      '텍스트 없음.',
  },
  {
    order: 48, originalNo: 43, actId: 5,
    realRegion: '파타고니아 강 / 호수', storyName: '파타고니아 투명 계곡호',
    role: '해류 나침반을 완성하기 직전의 정화 장면',
    keyEvent:
      '계곡 수정미끼는 가장 맑은 물속에서만 완전한 형태로 보인다. Finny 는 지금까지 얻은 ' +
      '장치들을 하나로 맞추며 해류 나침반의 형태를 완성하기 시작한다.',
    item: '계곡 수정미끼',
    representativeFish: ['송어', '연어'],
    characters: ['finny', 'max'],
    imageDirection:
      '세로 3:4. 차가운 담수, 투명한 물, 돌 바닥, 계곡 수정미끼. 텍스트 없음.',
  },
  {
    order: 49, originalNo: 49, actId: 5,
    realRegion: '남아공 케이프타운', storyName: '케이프타운 켈프절벽',
    role: '마지막 해류 실을 꿰매고 북극 루트를 연다',
    keyEvent:
      '켈프 절벽바늘이 마지막으로 끊어진 해류의 실을 꿰맨다. Oliver, Max, Mango 의 역할이 ' +
      '결합되고 북극으로 향하는 최종 루트가 열린다.',
    item: '켈프 절벽바늘',
    representativeFish: ['백상아리', '참치'],
    characters: ['finny', 'oliver', 'max'],
    imageDirection:
      '세로 3:4. 차가운 대서양, 거친 암반, 켈프 숲, 절벽바늘. 텍스트 없음.',
  },
  {
    order: 50, originalNo: 50, actId: 5,
    realRegion: '북극 아이스 피싱', storyName: '북극 아이스 피싱',
    role: '세계해류의 심장을 다시 깨우는 시즌 피날레',
    keyEvent:
      '북극 얼음릴이 모든 장치를 하나로 감아 세계해류의 심장과 연결한다. Finny, Polly, ' +
      'Mango, Oliver, Max 가 마지막 봉인을 열고 먹빛 조류를 정화 가능한 흐름으로 바꾼다.',
    item: '북극 얼음릴',
    representativeFish: ['북극대구', '그린란드상어'],
    characters: ['finny', 'polly', 'mango', 'oliver', 'max'],
    imageDirection:
      '세로 3:4. 얼음 아래 수중 장면, 푸른 빙하광, 차가운 물, 최종 릴 장치. 어종은 작게 ' +
      '보조. 텍스트 없음.',
  },
];

/**
 * 카드 "스테이지 설명" 표시용 — 플레이어 권유체(존대) 한 줄 소개.
 *   서사(keyEvent)를 플레이어에게 권하는 정중한 어투로 압축. order(1~50) → 문구.
 */
export const STAGE_CARD_DESC = {
  1:  '맑은 산호초 위를 흐르는 파란 두루마리 실을 Finny와 함께 따라가 보세요. 그것은 보물지도가 아니라 바다의 흐름을 기록한 고대 문자랍니다. 세계해류를 향한 첫 항로가 이곳에서 시작됩니다.',
  2:  '햇살이 부서지는 안다만 라군에서 태양 산호 미끼로 빛을 모아 보세요. 두루마리에 숨어 있던 첫 문장이 떠오르고, 바다는 하나의 길로 이어진다는 비밀이 밝혀집니다.',
  3:  '동굴 조개열쇠로 굳게 닫힌 산호문을 열어 보세요. 안쪽에는 산호를 잠재운 먹빛 조류의 검은 흔적이 남아 있어, 이 모험이 단순한 보물찾기가 아님을 느끼게 됩니다.',
  4:  '뜨거운 해저 열류가 솟는 화산 라군을 화산암 릴기어로 견뎌 보세요. 흔들리던 두루마리 문자를 고정하면, 해류 장치가 온도와 조류의 균형으로 움직인다는 사실이 드러납니다.',
  5:  '뒤엉킨 해초와 조류를 해초 매듭추로 차근차근 풀어 보세요. 매듭이 풀리는 순간 산호들이 서로 신호를 주고받으며, 바다가 하나의 리듬으로 움직인다는 것을 배웁니다.',
  6:  '별빛 조개부표로 밤바다에 잠긴 항로를 밝혀 보세요. 밤의 빛을 받은 두루마리 위로 세계해류의 심장 문양이 처음으로 떠오릅니다.',
  7:  '거대한 대산호 방패로 먹빛 조류의 첫 공격을 막아 보세요. 화려한 산호 장벽이 사실은 고대 해류 장치를 지키던 방어막이었음이 드러납니다.',
  8:  '둥근 산호찌로 잔잔한 만에 원형 파동을 일으켜 보세요. 사라졌던 두루마리 문자가 다시 떠오르고, 산호들이 서로 신호를 주고받아 왔음을 확인하게 됩니다.',
  9:  '원시 암초 깊은 곳에 걸린 오래된 해류 사슬을 갈고리로 끌어올려 보세요. 그것은 세계해류의 첫 번째 봉인을 고정하던 부품이랍니다.',
  10: '파스텔 산호나침반을 따라 마음이 이끄는 길을 골라 보세요. 이 나침반은 정해진 방향이 아니라 항해자의 선택에 따라 색이 변하는, 마음을 읽는 장치입니다.',
  11: '맑은 물속에서만 드러나는 투명줄의 길을 따라가 보세요. 이곳에서 Finny는 Polly에게 기대지 않고 처음으로 두루마리를 스스로 읽어냅니다.',
  12: '빛모래 루어로 흰 모래 속에 숨은 해류 문장을 끌어올려 보세요. 아름다운 모래 밑에도 먹빛 조류가 지나간 검은 자국이 남아 있습니다.',
  13: '무지개 화산석으로 열대 해류와 화산 해류, 산호 해류의 빛을 하나로 섞어 보세요. 서로 다른 물길이 결국 같은 중심을 향한다는 사실을 확인하게 됩니다.',
  14: '붉은 산호봉이 맥박처럼 빛나는 협곡으로 들어가 보세요. 그 빛은 세계해류의 심장 박동과 이어진 신호이며, 심장이 점점 가까워지고 있음을 알려 줍니다.',
  15: '수정 화강암 핀으로 빛을 굴절시켜 숨은 해저 문양을 드러내 보세요. 그 문양은 다음 대륙 항로가 단순한 지도가 아니라 동료를 불러 모으는 길임을 암시합니다.',
  16: '야생 산호표식을 따라 장난꾸러기 Mango의 영역으로 가보세요. 오래된 바다 전설을 아는 Mango가 두루마리는 지도가 아니라 바다의 기억임을 알려 줍니다.',
  17: '남해 조개바늘로 현실의 바다와 두루마리 속 바다를 한 땀씩 꿰매 보세요. Polly와 잠시 떨어진 Finny가 홀로 항로를 다시 확인하는 재출발의 포구입니다.',
  18: '검은 현무암 위에서 현무암 싱커로 거친 조류 속 해저 문을 고정해 보세요. 환상 속 항로가 실제 지형과 겹쳐진다는 사실을 두 눈으로 확인하게 됩니다.',
  19: '오래된 배의 잔해에서 찾은 어촌 닻조각을 Oliver와 함께 해석해 보세요. 이 모험이 고대 항해자가 남긴 미완성 항로를 따라가는 길임을 알게 됩니다.',
  20: '청록 암반찌로 도시 근해의 소란 속에서도 조용한 해저 흐름을 잡아 보세요. 겉으로 보이는 바다가 아니라 밑바닥 암반 구조를 읽는 법을 배웁니다.',
  21: '펑후 해초핀으로 얕은 현무암 지형에 흩어진 해초 신호를 한 방향으로 정렬해 보세요. Oliver의 도움으로 장비 조합과 조류 읽기의 기본을 익히는 곳입니다.',
  22: '미궁처럼 갈라진 석회암 사이에서 입체 지도조각을 찾아보세요. 이 조각은 물의 높이와 조류 방향에 따라 모양이 바뀌는 살아 있는 지도입니다.',
  23: '민물과 바닷물이 만나는 지점의 물을 녹색 합수병에 담아 보세요. 서로 다른 물이 섞일 때 비로소 새로운 길이 열린다는 것을 Mango가 일러 줍니다.',
  24: '절벽 아래 거친 조류 속에서만 빛나는 청록 해류석을 찾아보세요. 안전한 라군을 벗어나 거친 바다를 직접 통과하며 Finny가 리더로 성장하는 길입니다.',
  25: '건조한 바람과 깊은 압력을 동시에 견디는 사막 바다모래추를 완성해 보세요. 이 균형추가 있으면 팀은 남반구와 지중해 유적 항로로 나아갈 수 있습니다.',
  26: '차가운 남반구 해초숲에서 남반구 해초릴로 엉킨 줄을 풀어 보세요. 따뜻한 열대를 떠나 어둡고 차가운 바다의 첫 공포와 마주하게 됩니다.',
  27: '협만 깊은 곳까지 빛줄기 랜턴을 내려 빛을 끌어내려 보세요. Oliver가 빛의 각도를 읽어 고대 항해자들이 남긴 남반구 좌표를 해석합니다.',
  28: '유리빛 바다핀으로 지나온 해류의 기억을 거울처럼 비춰 보세요. 앞으로 나아가는 동시에 사라진 바다의 기억을 복원하고 있음을 깨닫게 됩니다.',
  29: '푸른 동굴 렌즈로 동굴 벽에 숨겨진 그림을 확대해 보세요. 그림 속에는 세계해류의 심장을 향해 항해했던 옛 탐험대의 흔적이 남아 있습니다.',
  30: '코발트 신전석을 물속 신전의 중심 장치에 끼워 보세요. 두루마리가 심장에 닿는 자는 바다의 선택을 받아야 한다는 문장을 드러냅니다.',
  31: '자갈 해안추로 작은 자갈 틈에 숨은 미세한 조류를 감지해 보세요. 거대한 유적뿐 아니라 작은 바닥의 변화도 항로의 일부임을 배우게 됩니다.',
  32: '화산암 부품으로 뜨거운 심해와 차가운 표층수를 연결해 보세요. 이 부품들이 모이면 심해로 내려갈 수 있는 대형 장비가 완성됩니다.',
  33: '대서양 대형훅을 완성해 큰 어종이 다니는 항로를 열어 보세요. 동시에 심해 보스 지역의 신호가 나타나며 본격적인 대결이 시작됩니다.',
  34: '거친 파도 속에서 절벽 파도깃으로 바람과 물결의 방향을 읽어 보세요. 새 동료 Max가 합류해 차가운 바다에서 살아남는 법을 알려 줍니다.',
  35: '안개 로크렌즈로 안개 속에서만 보이는 흐름을 읽어 보세요. 무작정 밀어붙이는 힘보다 기다리는 감각이 더 중요하다는 것을 Max가 일러 줍니다.',
  36: '운하 수문열쇠로 막힌 물길을 열어 보세요. 바다뿐 아니라 인간이 만든 수로까지 세계해류와 이어져 있다는 사실을 알게 됩니다.',
  37: '피오르드 룬스톤으로 심해문에 새겨진 고대 문자를 깨워 보세요. Polly가 다시 합류할 징후와 함께 두루마리의 북쪽 문장이 완성되기 시작합니다.',
  38: '먹빛 조류를 닮은 검은 화산유리로 오히려 그 약점을 비춰 보세요. 적처럼 보이는 검은 바다에도 꼭 필요한 기억이 담겨 있음을 이해하게 됩니다.',
  39: '차가운 다시마숲에서 냉수 다시마매듭으로 끊어진 해류를 묶어 보세요. 길을 잃어도 Max와 Finny가 팀워크로 조류의 박자를 맞춰 빠져나옵니다.',
  40: '켈프숲 탐지추로 거대한 켈프숲 아래 숨은 북태평양 항로를 찾아보세요. 북쪽 봉인이 여러 차가운 바다에 나뉘어 있다는 것을 확인하게 됩니다.',
  41: '빙하 반사석으로 얼음빛을 반사해 바다 아래 봉인의 위치를 드러내 보세요. 먹빛 조류가 빙하 아래까지 번지고 있음이 드러납니다.',
  42: '잔잔한 담수에서도 담수 자갈찌로 세계해류의 미세한 흔적을 찾아보세요. 바다와 강, 모든 물길이 결국 하나의 순환으로 이어진다는 결론에 닿습니다.',
  43: '진흙과 뿌리 사이에 숨은 오래된 물길을 늪지 뿌리 루어로 끌어내 보세요. Max의 힘과 Finny의 섬세한 손길로 늪지의 숨은 길을 통과합니다.',
  44: '얕은 사막 해안에서 갑자기 깊어지는 심해를 사막심해 훅으로 붙잡아 보세요. 심장으로 가는 길이 안전한 항로가 아니라 위험한 낙차임을 알게 됩니다.',
  45: '강력한 냉류를 훔볼트 해류석으로 견디며 남미 해류의 방향을 고정해 보세요. 차가운 물살에 밀려나도 Max의 도움으로 중심을 잡습니다.',
  46: '수몰나무 토템으로 강과 바다, 숲과 물의 기억을 하나로 이어 보세요. Mango가 야생의 감각으로 토템의 진짜 위치를 찾아내 핵심 역할을 합니다.',
  47: '원시 진화석으로 오래된 생명의 흐름을 읽어 보세요. 세계해류의 심장이 기계가 아니라 바다 생태계 전체의 기억을 품은 존재임을 깨닫게 됩니다.',
  48: '가장 맑은 물속에서만 온전히 보이는 계곡 수정미끼를 찾아보세요. 지금까지 모은 장치들을 맞추며 해류 나침반의 형태가 완성되기 시작합니다.',
  49: '켈프 절벽바늘로 마지막으로 끊어진 해류의 실을 꿰매 보세요. Oliver와 Max, Mango의 역할이 하나로 모여 북극으로 향하는 최종 루트가 열립니다.',
  50: '북극 얼음릴로 모든 장치를 하나로 감아 세계해류의 심장과 연결해 보세요. 다섯 동료가 마지막 봉인을 열어 먹빛 조류를 정화 가능한 흐름으로 바꿉니다.',
};

/** order(1~50) 로 스테이지 조회 — 없으면 null. */
export function getStoryStageByOrder(order) {
  return STORY_STAGES.find((s) => s.order === order) || null;
}

/** 원문(시트) 번호로 스테이지 조회 — 없으면 null. */
export function getStoryStageByOriginalNo(no) {
  return STORY_STAGES.find((s) => s.originalNo === no) || null;
}

/** 막 id(1~5) 의 모든 스테이지(order 오름차순). */
export function getStoryStagesByAct(actId) {
  return STORY_STAGES.filter((s) => s.actId === actId);
}

/** 막 id 로 막 메타 조회 — 없으면 null. */
export function getStoryActById(actId) {
  return STORY_ACTS.find((a) => a.id === actId) || null;
}

/** 캐릭터 id 로 메타 조회 — 없으면 null. */
export function getStoryCharacterById(id) {
  return STORY_CHARACTERS.find((c) => c.id === id) || null;
}

/** 특정 캐릭터가 등장하는 스테이지 목록(order 오름차순). */
export function getStoryStagesByCharacter(characterId) {
  return STORY_STAGES.filter((s) => s.characters.includes(characterId));
}
