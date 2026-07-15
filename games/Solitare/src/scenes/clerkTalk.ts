/**
 * clerkTalk.ts — **점원 클릭 대화**(모든 점포의 점원을 탭하면 말풍선으로 짧은 대사).
 *
 * · 공공건물 대화(officeTalk)와 같은 말풍선 스타일(Solitare_UI_11)·단문(≤2줄) 톤.
 * · **점포 테마별 대사(층별 지정 아트 1:1)**: 1 편의점 · 2 베이커리 · 3 커피숍 · 4 라멘집 · 5 디저트 바 ·
 *   6 해산물 그릴 · 7 약국 · 8 폰샵 · 9 꽃집 · 10 헤어살롱 · 0 공용(스테이지2·사이드).
 * · 같은 점원을 **다시 탭하면 다음 대사로 회전**(테마별 인덱스 localStorage 저장), 6초 후 자동 닫힘.
 * · 전역 말풍선 1개(동시 발화 금지) — 다른 점원을 탭하면 기존 풍선을 닫고 새로 연다.
 */
import Phaser from 'phaser';
import { sfx } from '../audio.js';
import { createTalkBubble, type TalkBubble } from './officeTalk.js';

/** 점포 테마 = 메인 타워 층 번호(1~10, 층별 지정 아트와 1:1). 0=공용(스테이지2) · 11=경쟁부지(사이드). */
export type ClerkTheme = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export const THEME_RIVAL_LOT: ClerkTheme = 11; // 경쟁부지(사이드 부지) 점원 — 경쟁 시스템 예고 톤.

/** 테마별 점원 대사 — **층별 실제 아트(BG_01~10 최신 버전) 확인 기준**으로 점포·점원 성격 반영. */
const DIALOGUE: Record<ClerkTheme, readonly string[]> = {
  // 1층 편의점(Convenience Store 24h) — 밝고 씩씩한 알바.
  1: [
    '어서오세요~ 24시간\n불이 꺼지지 않아요!',
    '신상 스낵 들어왔어요.\n계산대 옆 주목!',
    '심야에도 문 열어요.\n야식은 저희 담당!',
    '출근길엔 커피 투 고!\n한 잔 어떠세요?',
    '재고 정리 중인데도\n손님이 제일 반가워요!',
  ],
  // 2층 베이커리(Golden Crust) — 자부심 있는 제빵사.
  2: [
    '방금 구운 빵이에요.\n냄새 좋죠?',
    '크루아상은 오전에\n다 나가요. 서두르세요!',
    '반죽은 새벽 4시부터\n시작한답니다.',
    '오늘의 추천은\n갓 나온 머핀!',
    '비법이요? 사랑을\n조금 더 넣는 거예요.',
  ],
  // 3층 커피숍(Bean & Bloom) — 차분한 바리스타.
  3: [
    '오늘의 원두는\n산미가 좋아요.',
    '라떼 아트는 서비스!\n하트 어떠세요?',
    '콜드브루는 12시간\n정성으로 내려요.',
    '단골손님 취향은\n다 외우고 있죠.',
    '한 잔의 여유,\n천천히 즐기세요~',
  ],
  // 4층 라멘집(Ramen Yokocho) — 활기찬 주방장.
  4: [
    '이랏샤이마세~!\n오늘 육수 끝내줍니다!',
    '돈코츠는 12시간\n푹 끓였습니다!',
    '매운맛 도전?\n각오하고 오세요!',
    '면발이 살아있을 때\n드시는 게 예의죠!',
    '마네키네코가\n복을 부르고 있어요~',
  ],
  // 5층 디저트 바(Sweet Escape) — 달콤 상냥.
  5: [
    '달콤한 하루,\n디저트로 완성하세요~',
    '마카롱 신상 컬러\n나왔어요! 예쁘죠?',
    '치즈케이크는 입에서\n녹아요, 정말로!',
    '버블티랑 마카롱,\n환상의 조합이에요.',
    '단 게 당기는 날엔\n주저하지 마세요!',
  ],
  // 6층 해산물 그릴(Ocean Flame) — 호쾌한 셰프.
  6: [
    '오늘 새벽에 들어온\n싱싱한 놈들입니다!',
    '랍스터가 물이 올랐어요.\n오늘이 기회!',
    '비린내요? 저희 가게엔\n그런 말 없습니다.',
    '바다 향 그대로\n구워 드립니다!',
    '오늘의 어획량은\n칠판을 확인하세요!',
  ],
  // 7층 약국(Wellington Pharmacy) — 다정한 약사.
  7: [
    '환절기엔 비타민\n챙겨 드세요, 사장님.',
    '피로엔 쉬는 게 약!\n그래도 안 되면 저를~',
    '처방전 없어도\n상담은 언제든 환영!',
    '건강이 최고의 재산!\n오늘도 무리 마세요.',
    '밴드부터 영양제까지\n다 준비돼 있어요.',
  ],
  // 8층 폰샵(Phone Play) — 트렌디한 직원.
  8: [
    '신상 폰 입고!\n케이스도 세트로 어때요?',
    '요즘은 폰이\n제일 바쁜 직원이죠!',
    '액정 필름 무료 부착!\n지금이 기회예요.',
    '게임이 끊기면 폰 탓?\n업그레이드하세요~',
    '스마트한 선택,\n저희가 도와드려요!',
  ],
  // 9층 꽃집(Flower & Gift) — 감성 플로리스트.
  9: [
    '오늘의 꽃은 튤립!\n향기 맡고 가세요~',
    '꽃은 시들어도\n마음은 남는답니다.',
    '기념일이세요?\n꽃다발 준비해 드릴게요.',
    '해바라기처럼\n활짝 웃는 하루 되세요!',
    '선물 고민될 땐\n꽃이 정답이에요.',
  ],
  // 10층 헤어살롱(Hair Salon & Barber) — 수다스러운 원장.
  10: [
    '어머, 사장님!\n앞머리 정리할 때 됐어요.',
    '스타일이 자신감!\n오늘도 멋지네요~',
    '요즘 유행하는 펌,\n한번 해보실래요?',
    '가르마만 바꿔도\n인상이 달라져요!',
    '단정한 머리가\n장사도 잘되게 해요~',
  ],
  // 0 공용(스테이지2 등 테마 미지정 점포).
  0: [
    '사장님 덕분에 오늘도\n장사 잘되고 있어요!',
    '손님이 끊이질 않네요.\n바빠서 행복해요~',
    '진열 새로 했는데\n어때요, 보기 좋죠?',
    '이 거리에서 저희가\n제일 붐벼요!',
    '월급날이 기다려져요.\n사장님 최고!',
  ],
  // 11 경쟁부지(사이드 부지) — 경쟁 시스템(은행·매입경매) 예고 톤.
  11: [
    '이 부지는 특별해요.\n곧 경쟁이 시작되죠!',
    '다른 도시 사장님이\n이 땅을 노린대요…',
    '은행이 들어서면\n돈이 돈을 번답니다.',
    '자리 선점이 반!\n먼저 짓는 쪽이 임자죠.',
    '소문에… 매입경매가\n열릴 거라던데요?',
  ],
};

const STORE_KEY = 'solitaire.clerkTalk.v1'; // { [theme]: rotIdx }
const HOLD_MS = 6000; // 자동 닫힘.

/** 메인 타워 층 → 점포 테마 — **층별 지정 아트(BG_01~10)와 1:1**. 11층+ 는 10테마 순환. */
export function themeForFloor(floor: number): ClerkTheme {
  return (((((floor - 1) % 10) + 10) % 10) + 1) as ClerkTheme;
}

function loadRot(): Partial<Record<ClerkTheme, number>> {
  try {
    return (JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Partial<Record<ClerkTheme, number>>) ?? {};
  } catch {
    return {};
  }
}
function nextMsg(theme: ClerkTheme): string {
  const rot = loadRot();
  const list = DIALOGUE[theme];
  const i = (rot[theme] ?? 0) % list.length;
  rot[theme] = i + 1;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(rot));
  } catch {
    /* 무시 */
  }
  return list[i];
}

// 전역 1풍선 — 현재 열린 점원 말풍선(다른 점원 탭 시 교체). 씬 재시작 시 오브젝트는 파괴되므로 active 가드.
let current: { owner: Phaser.GameObjects.Image; bubble: TalkBubble; timer?: Phaser.Time.TimerEvent } | null = null;

function clearCurrent(fade = true): void {
  current?.timer?.remove();
  current?.bubble.destroy(fade);
  current = null;
}

/**
 * 점원 이미지에 클릭 대화를 배선한다(중복 배선 방지) — 탭: 말풍선 표시, 재탭: 다음 대사 회전.
 */
export function wireClerkTalk(scene: Phaser.Scene, img: Phaser.GameObjects.Image | undefined, theme: ClerkTheme): void {
  if (!img || img.getData('clerkTalk')) return;
  img.setData('clerkTalk', true);
  if (!img.input) img.setInteractive({ useHandCursor: true });
  img.on('pointerdown', () => {
    sfx('toast', { volume: 0.3 });
    // 같은 점원 재탭 = 다음 대사로 회전(유지시간 리셋).
    if (current && current.owner === img && current.bubble.active()) {
      current.bubble.setText(nextMsg(theme));
      current.timer?.remove();
      current.timer = scene.time.delayedCall(HOLD_MS, () => clearCurrent(true));
      return;
    }
    clearCurrent(false);
    const bubble = createTalkBubble(scene, img, nextMsg(theme));
    if (!bubble) return;
    current = { owner: img, bubble, timer: scene.time.delayedCall(HOLD_MS, () => clearCurrent(true)) };
  });
  img.once('destroy', () => {
    if (current?.owner === img) clearCurrent(false);
  });
}
