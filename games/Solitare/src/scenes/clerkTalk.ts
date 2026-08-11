/**
 * clerkTalk.ts — **점원 클릭 대화**(모든 점포의 점원을 탭하면 말풍선으로 짧은 대사).
 *
 * · 공공건물 대화(officeTalk)와 같은 말풍선 스타일(Solitare_UI_11)·단문(≤2줄) 톤.
 * · **점포 테마(층별 실제 아트 1:1 확인)**:
 *     메인 타워 1~10 = 편의점·베이커리·커피숍·라멘집·디저트바·해산물그릴·약국·폰샵·꽃집·헤어살롱
 *     스테이지2 21~30 = 서점·문구·장난감·운동화·캐주얼의류·안경점·펫숍·홈데코·남성정장·여성패션
 *     11 = 경쟁부지(사이드) · 0 = 공용 폴백
 * · **맥락 대사(지능화 1단계)**: talkContext 조건(시간대·은행 가득·복귀·진행도) 만족 시 그 대사가 우선.
 *   말풍선을 **다시 탭하면 기본 대사 로테이션**(테마별 인덱스 localStorage 저장), 6초 후 자동 닫힘.
 * · 전역 말풍선 1개(동시 발화 금지) — 다른 점원을 탭하면 기존 풍선을 닫고 새로 연다.
 */
import Phaser from 'phaser';
import { sfx } from '../audio.js';
import { createTalkBubble, type TalkBubble } from './officeTalk.js';
import { pickCtxLine, isMorning, isNight, type CtxGroup } from './talkContext.js';

/** 점포 테마 번호 — 0 공용 · 1~10 메인 타워 층 · 11 경쟁부지 · 21~30 스테이지2 층(20+층). */
export type ClerkTheme = number;
export const THEME_GENERIC: ClerkTheme = 0;
export const THEME_RIVAL_LOT: ClerkTheme = 11;

/** 메인 타워 층 → 테마(층별 지정 아트 BG_01~10 과 1:1, 11층+ 순환). */
export function themeForFloor(floor: number): ClerkTheme {
  return ((((floor - 1) % 10) + 10) % 10) + 1;
}
/** 스테이지2 층 → 테마(BG_02_01~10 과 1:1). */
export function themeForStage2Floor(floor: number): ClerkTheme {
  return 20 + ((((floor - 1) % 10) + 10) % 10) + 1;
}

interface ThemePool {
  readonly base: readonly string[];
  readonly ctx?: readonly CtxGroup[];
}

// **모든 점원 공용 맥락**: 자기 층 은행 가득참(수령 유도) · 오랜만 복귀 환영.
const SHARED_CTX: readonly CtxGroup[] = [
  {
    when: (c, floor) => c.bankFull(floor),
    lines: ['사장님! 금고가 꽉 찼어요.\n수령 부탁드려요~', '매출이 넘쳐요!\n말풍선 눌러 수령하세요!'],
  },
  {
    when: (c) => c.daysAway >= 2,
    lines: ['오랜만이에요, 사장님!\n다들 기다렸어요~', '한동안 안 보이셔서\n걱정했잖아요!'],
  },
];

/** 테마별 대사 — base=로테이션, ctx=조건 우선(테마 고유 + 공용은 코드에서 병합). */
const DIALOGUE: Record<ClerkTheme, ThemePool> = {
  // ── 메인 타워 1~10 ──
  1: {
    // 편의점(24h) — 밝고 씩씩한 알바.
    base: [
      '어서오세요~ 24시간\n불이 꺼지지 않아요!',
      '신상 스낵 들어왔어요.\n계산대 옆 주목!',
      '심야에도 문 열어요.\n야식은 저희 담당!',
      '출근길엔 커피 투 고!\n한 잔 어떠세요?',
      '재고 정리 중인데도\n손님이 제일 반가워요!',
      '1+1 행사 중이에요.\n안 사면 손해!',
      '삼각김밥은 오늘도\n점심 전에 동나요.',
      '편의점 알바 3년차,\n웬만한 건 다 있어요!',
    ],
    ctx: [
      { when: (c) => isNight(c), lines: ['이 시간에 오시다니!\n역시 저희는 24시간이죠~', '심야 손님은\n라면 코너로 직행하시죠?'] },
      { when: (c) => isMorning(c), lines: ['좋은 아침이에요!\n커피랑 샌드위치 어때요?'] },
    ],
  },
  2: {
    // 베이커리 — 자부심 있는 제빵사.
    base: [
      '방금 구운 빵이에요.\n냄새 좋죠?',
      '크루아상은 오전에\n다 나가요. 서두르세요!',
      '반죽은 새벽 4시부터\n시작한답니다.',
      '오늘의 추천은\n갓 나온 머핀!',
      '비법이요? 사랑을\n조금 더 넣는 거예요.',
      '버터는 좋은 것만 써요.\n타협은 없습니다.',
      '식빵 예약은\n하루 전에 부탁드려요~',
      '오븐 앞은 뜨겁지만\n마음은 더 뜨겁죠!',
    ],
    ctx: [
      { when: (c) => isMorning(c), lines: ['갓 나온 크루아상!\n지금이 제일 맛있어요.'] },
      { when: (c) => isNight(c), lines: ['이 시간엔 빵이 별로 없어요.\n내일 아침에 꼭 오세요!'] },
    ],
  },
  3: {
    // 커피숍 — 차분한 바리스타.
    base: [
      '오늘의 원두는\n산미가 좋아요.',
      '라떼 아트는 서비스!\n하트 어떠세요?',
      '콜드브루는 12시간\n정성으로 내려요.',
      '단골손님 취향은\n다 외우고 있죠.',
      '한 잔의 여유,\n천천히 즐기세요~',
      '원두는 일주일마다\n새로 볶아요.',
      '핸드드립은 3분,\n기다림도 맛이에요.',
      '창가 자리가\n오늘따라 예쁘네요.',
    ],
    ctx: [
      { when: (c) => isMorning(c), lines: ['모닝커피 없인\n하루가 시작 안 되죠~'] },
      { when: (c) => isNight(c), lines: ['늦은 시간엔\n디카페인 어떠세요?'] },
    ],
  },
  4: {
    // 라멘집(Ramen Yokocho) — 활기찬 주방장.
    base: [
      '이랏샤이마세~!\n오늘 육수 끝내줍니다!',
      '돈코츠는 12시간\n푹 끓였습니다!',
      '매운맛 도전?\n각오하고 오세요!',
      '면발이 살아있을 때\n드시는 게 예의죠!',
      '마네키네코가\n복을 부르고 있어요~',
      '차슈는 두툼하게!\n그게 우리 스타일.',
      '츠케멘도 있습니다.\n찍어 먹는 재미!',
      '국물까지 비우면\n주방장이 웃습니다!',
    ],
    ctx: [
      { when: (c) => c.hour >= 11 && c.hour < 14, lines: ['점심 러시 시작!\n지금 줄 서세요~'] },
      { when: (c) => isNight(c), lines: ['야식엔 라멘이\n국룰이죠!'] },
    ],
  },
  5: {
    // 디저트 바(Sweet Escape) — 달콤 상냥.
    base: [
      '달콤한 하루,\n디저트로 완성하세요~',
      '마카롱 신상 컬러\n나왔어요! 예쁘죠?',
      '치즈케이크는 입에서\n녹아요, 정말로!',
      '버블티랑 마카롱,\n환상의 조합이에요.',
      '단 게 당기는 날엔\n주저하지 마세요!',
      '팬케이크는 주문 즉시\n구워 드려요~',
      '오늘의 아이스크림은\n말차맛이에요!',
      '스트레스엔 당 충전이\n제일 빠른 처방이죠.',
    ],
  },
  6: {
    // 해산물 그릴(Ocean Flame) — 호쾌한 셰프.
    base: [
      '오늘 새벽에 들어온\n싱싱한 놈들입니다!',
      '랍스터가 물이 올랐어요.\n오늘이 기회!',
      '비린내요? 저희 가게엔\n그런 말 없습니다.',
      '바다 향 그대로\n구워 드립니다!',
      '오늘의 어획량은\n칠판을 확인하세요!',
      '가리비 관자가\n두툼하니 최고예요.',
      '피쉬앤칩스는\n맥주랑 찰떡이죠!',
      '새우 꼬치는 굽는\n소리부터 맛있어요.',
    ],
  },
  7: {
    // 약국(Wellington Pharmacy) — 다정한 약사.
    base: [
      '환절기엔 비타민\n챙겨 드세요, 사장님.',
      '피로엔 쉬는 게 약!\n그래도 안 되면 저를~',
      '처방전 없어도\n상담은 언제든 환영!',
      '건강이 최고의 재산!\n오늘도 무리 마세요.',
      '밴드부터 영양제까지\n다 준비돼 있어요.',
      '손 소독 잊지 마세요.\n예방이 최고예요.',
      '물 많이 드시는 것도\n훌륭한 약이랍니다.',
      '잠이 보약이에요.\n오늘은 일찍 주무세요!',
    ],
    ctx: [{ when: (c) => isNight(c), lines: ['이 늦은 시간까지…\n사장님, 건강 챙기세요!'] }],
  },
  8: {
    // 폰샵(Phone Play) — 트렌디한 직원.
    base: [
      '신상 폰 입고!\n케이스도 세트로 어때요?',
      '요즘은 폰이\n제일 바쁜 직원이죠!',
      '액정 필름 무료 부착!\n지금이 기회예요.',
      '게임이 끊기면 폰 탓?\n업그레이드하세요~',
      '스마트한 선택,\n저희가 도와드려요!',
      '배터리 교체도 됩니다.\n10분 컷!',
      '이 케이스, 사장님\n타워 색이랑 깔맞춤!',
      '데이터 이전은\n서비스로 해 드려요~',
    ],
  },
  9: {
    // 꽃집(Flower & Gift) — 감성 플로리스트.
    base: [
      '오늘의 꽃은 튤립!\n향기 맡고 가세요~',
      '꽃은 시들어도\n마음은 남는답니다.',
      '기념일이세요?\n꽃다발 준비해 드릴게요.',
      '해바라기처럼\n활짝 웃는 하루 되세요!',
      '선물 고민될 땐\n꽃이 정답이에요.',
      '리본 색만 바꿔도\n분위기가 달라져요.',
      '아침 이슬 머금은\n꽃이 제일 예뻐요.',
      '곰인형이랑 꽃다발,\n실패 없는 조합!',
    ],
    ctx: [{ when: (c) => isMorning(c), lines: ['아침에 온 꽃들이\n제일 싱싱해요, 지금 보세요!'] }],
  },
  10: {
    // 헤어살롱(Hair Salon & Barber) — 수다스러운 원장.
    base: [
      '어머, 사장님!\n앞머리 정리할 때 됐어요.',
      '스타일이 자신감!\n오늘도 멋지네요~',
      '요즘 유행하는 펌,\n한번 해보실래요?',
      '가르마만 바꿔도\n인상이 달라져요!',
      '단정한 머리가\n장사도 잘되게 해요~',
      '두피 케어도 있어요.\n관리는 미리미리!',
      '옆 가게 사장님도\n저희 단골이에요, 후훗.',
      '거울 보세요,\n오늘 컨디션 좋으신데요?',
    ],
  },
  // ── 경쟁부지(사이드) — 경쟁 시스템(은행·매입경매) 예고 톤 ──
  11: {
    base: [
      '이 부지는 특별해요.\n곧 경쟁이 시작되죠!',
      '다른 도시 사장님이\n이 땅을 노린대요…',
      '은행이 들어서면\n돈이 돈을 번답니다.',
      '자리 선점이 반!\n먼저 짓는 쪽이 임자죠.',
      '소문에… 매입경매가\n열릴 거라던데요?',
      '전당포·경비회사…\n뭐가 들어설까요?',
      '2분 안에 결정해야\n하는 날이 온답니다.',
      '여긴 기회의 땅이에요.\n감이 좋아요!',
    ],
  },
  // ── 스테이지2 21~30 ──
  21: {
    // 서점(Page Harbor Books) — 조용한 책방지기.
    base: [
      '책 냄새 좋죠?\n천천히 둘러보세요.',
      '이번 주 베스트셀러,\n입고됐어요.',
      '좋은 책은 좋은 항구 —\n쉬어 가세요.',
      '한 페이지의 여유가\n하루를 바꿔요.',
      '추천 도서요?\n사장님껜 경영서를…',
      '비 오는 날엔\n서점이 최고죠.',
    ],
  },
  22: {
    // 문구·팬시(Paper Pop) — 아기자기 취향.
    base: [
      '신상 스티커 봤어요?\n너무 귀여워요!',
      '다이어리 꾸미기엔\n저희 집이 성지예요.',
      '펜 하나에도\n행복이 있답니다~',
      '선물 포장은\n무료로 해 드려요!',
      '메모는 손으로 써야\n기억에 남아요.',
      '문구 덕후는\n지나칠 수 없는 곳!',
    ],
  },
  23: {
    // 장난감(Toy Tango) — 동심 가득 점원.
    base: [
      '어른도 장난감이\n필요하답니다!',
      '신상 블록 세트,\n어른용이에요. 진짜로!',
      '뽑기 기계에\n행운이 들어 있어요~',
      '조립하는 시간이\n제일 행복하죠.',
      '아이 선물 고민?\n제가 전문가예요!',
      '놀이엔 나이 제한이\n없답니다~',
    ],
  },
  24: {
    // 운동화(Hop Kicks) — 스트릿 감성.
    base: [
      '신상 드롭!\n오늘 놓치면 리셀가예요.',
      '신발이 좋으면\n어디든 갈 수 있죠.',
      '사장님 사이즈,\n마침 한 켤레 남았어요!',
      '끈 묶는 법만 바꿔도\n느낌이 달라요.',
      '운동화는 관리가 반!\n클리너도 있어요.',
      '오늘의 착화감,\n보장합니다!',
    ],
  },
  25: {
    // 캐주얼 의류(Mellow Mix) — 편안한 스타일리스트.
    base: [
      '편안함이 곧 스타일!\n후드 신상 왔어요.',
      '파스텔톤이\n요즘 대세예요~',
      '데일리룩은\n저희가 책임질게요.',
      '입어만 보세요,\n후회 안 해요!',
      '색 조합 고민되면\n저를 불러 주세요.',
      '기분 좋은 옷이\n제일 좋은 옷이죠.',
    ],
  },
  26: {
    // 안경점(Blink Berry) — 꼼꼼한 안경사.
    base: [
      '세상이 흐릿하면\n시력 검사부터!',
      '선글라스는 멋보다\n눈 건강이 먼저예요.',
      '요즘 눈 피로하시죠?\n블루라이트 차단!',
      '안경테 하나로\n인상이 바뀌어요.',
      '시력 검사는 무료!\n부담 없이 오세요.',
      '잘 보여야\n잘 풀립니다, 사장님!',
    ],
  },
  27: {
    // 펫숍(Paw Pop) — 동물 애호가.
    base: [
      '오늘도 꼬리들이\n반겨 주네요~',
      '간식 신상 왔어요.\n댕댕이들 난리나요!',
      '캣타워 새 모델,\n튼튼함이 달라요.',
      '반려동물은 가족이죠.\n좋은 것만 드려요.',
      '장난감 하나로\n하루가 행복해져요!',
      '사장님네 타워에도\n마스코트 하나 어때요?',
    ],
  },
  28: {
    // 홈데코(Cozy Bloom) — 포근한 감성.
    base: [
      '집이 포근해야\n하루가 포근하죠.',
      '쿠션 하나 바꿨을 뿐인데\n방이 달라져요!',
      '조명은 은은하게,\n마음도 은은하게~',
      '향초 신상 입고!\n라벤더 향이에요.',
      '수납 바구니는\n많을수록 좋아요.',
      '사장님 사무실에\n화분 하나 놓으세요~',
    ],
  },
  29: {
    // 남성 정장(Dapper Nest) — 격식 있는 테일러.
    base: [
      '좋은 정장은\n어깨선이 다릅니다.',
      '중요한 미팅엔\n네이비가 정답이죠.',
      '넥타이 매듭,\n제대로 알려드릴까요?',
      '핏이 곧 매너입니다,\n사장님.',
      '구두까지 갖춰야\n완성이죠.',
      '수선은 이틀이면\n충분합니다.',
    ],
  },
  30: {
    // 여성 패션(Luna Ribbon) — 사랑스러운 감각.
    base: [
      '이 원피스, 사장님께\n딱일 것 같아요!',
      '리본 하나로\n분위기가 살아나요~',
      '신상 가방 입고!\n색감 미쳤어요.',
      '거울은 저쪽이에요.\n입어 보세요!',
      '오늘의 코디,\n제가 봐 드릴게요.',
      '예쁜 옷은 기분을\n두 배로 만들어요!',
    ],
  },
  // ── 공용(테마 미지정 폴백) ──
  0: {
    base: [
      '사장님 덕분에 오늘도\n장사 잘되고 있어요!',
      '손님이 끊이질 않네요.\n바빠서 행복해요~',
      '진열 새로 했는데\n어때요, 보기 좋죠?',
      '이 거리에서 저희가\n제일 붐벼요!',
      '월급날이 기다려져요.\n사장님 최고!',
      '오늘 첫 손님이\n크게 사 가셨어요!',
    ],
  },
};

const STORE_KEY = 'solitaire.clerkTalk.v1'; // { [theme]: rotIdx }
const HOLD_MS = 6000; // 자동 닫힘.

function loadRot(): Partial<Record<number, number>> {
  try {
    return (JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Partial<Record<number, number>>) ?? {};
  } catch {
    return {};
  }
}
function nextBaseMsg(theme: ClerkTheme): string {
  const pool = DIALOGUE[theme] ?? DIALOGUE[0];
  const rot = loadRot();
  const i = (rot[theme] ?? 0) % pool.base.length;
  rot[theme] = i + 1;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(rot));
  } catch {
    /* 무시 */
  }
  return pool.base[i];
}

/** 첫 발화 대사 — **맥락(공용+테마 조건) 우선**, 없으면 기본 로테이션. */
function openingMsg(theme: ClerkTheme, floor: number): string {
  const pool = DIALOGUE[theme] ?? DIALOGUE[0];
  const ctxLine = pickCtxLine([...SHARED_CTX, ...(pool.ctx ?? [])], floor);
  return ctxLine ?? nextBaseMsg(theme);
}

// 전역 1풍선 — 현재 열린 점원 말풍선(다른 점원 탭 시 교체). 씬 재시작 시 오브젝트는 파괴되므로 active 가드.
let current: { owner: Phaser.GameObjects.Image; bubble: TalkBubble; timer?: Phaser.Time.TimerEvent } | null = null;

function clearCurrent(fade = true): void {
  current?.timer?.remove();
  current?.bubble.destroy(fade);
  current = null;
}

/**
 * 점원 이미지에 클릭 대화를 배선한다(중복 배선 방지) — 탭: 말풍선(맥락 우선), 재탭: 기본 대사 로테이션.
 *   floor = 점원이 속한 층(맥락 조건 bankFull 등에 사용, 미지정=1).
 */
export function wireClerkTalk(
  scene: Phaser.Scene,
  img: Phaser.GameObjects.Image | undefined,
  theme: ClerkTheme,
  floor = 1,
): void {
  if (!img || img.getData('clerkTalk')) return;
  img.setData('clerkTalk', true);
  if (!img.input) img.setInteractive({ useHandCursor: true });
  img.on('pointerdown', () => {
    sfx('toast', { volume: 0.3 });
    // 같은 점원 재탭 = 기본 대사로 회전(유지시간 리셋).
    if (current && current.owner === img && current.bubble.active()) {
      current.bubble.setText(nextBaseMsg(theme));
      current.timer?.remove();
      current.timer = scene.time.delayedCall(HOLD_MS, () => clearCurrent(true));
      return;
    }
    clearCurrent(false);
    const bubble = createTalkBubble(scene, img, openingMsg(theme, floor));
    if (!bubble) return;
    current = { owner: img, bubble, timer: scene.time.delayedCall(HOLD_MS, () => clearCurrent(true)) };
  });
  img.once('destroy', () => {
    if (current?.owner === img) clearCurrent(false);
  });
}
