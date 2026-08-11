/**
 * 익명 유저 닉네임 생성 — 순수 함수(난수는 주입).
 *
 * 익명 로그인이라 유저가 스스로 정한 이름이 없다. 상대 화면에 uuid 를 띄울 수는 없으니
 * 게임 톤에 맞는 이름을 만들어 준다. 실명·이메일 같은 개인식별정보는 어디에도 쓰지 않는다.
 */

const ADJECTIVES = [
  '네온',
  '무한',
  '침착한',
  '빛나는',
  '조용한',
  '고요한',
  '전광석화',
  '삼목',
  '심야',
  '반짝',
  '냉정한',
  '기민한',
] as const;

const NOUNS = [
  '검객',
  '전략가',
  '수집가',
  '탐험가',
  '기사',
  '술사',
  '장인',
  '사냥꾼',
  '여행자',
  '분석가',
] as const;

/** 예: `네온검객#4821`. 같은 조합이 겹쳐도 뒤 숫자로 구분된다. */
export function makeNickname(random: () => number = Math.random): string {
  const adj = ADJECTIVES[Math.min(ADJECTIVES.length - 1, Math.floor(random() * ADJECTIVES.length))];
  const noun = NOUNS[Math.min(NOUNS.length - 1, Math.floor(random() * NOUNS.length))];
  const tag = 1000 + Math.floor(random() * 9000);
  return `${adj}${noun}#${tag}`;
}
