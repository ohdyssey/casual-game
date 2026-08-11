/**
 * 게임 라인업 레지스트리 — 허브가 보여줄 카드의 단일 소스.
 *
 * 카드 아트: public/art/ 의 키아트(*_Game.webp) + 투명 로고(*_logo_t.webp, 크로마키 처리).
 * 각 게임은 독립 빌드/배포(+ 별도 네이티브 앱). 허브는 URL 로만 연결한다.
 *   live=true  → dev:devPort / prod:prodUrl 로 팝업 실행
 *   live=false → "준비중" 표시, 클릭 불가
 *
 * 리스팅 규칙: ① 플레이 오픈(allowlist=launcher.ts PLAY_OPEN_GAMES) 게임을 앞쪽에 → ② 그 외 라이브(비공개 잠금)
 *   → ③ 준비중. 배열 순서가 곧 그리드 표시 순서다(grid.ts 가 GAMES 순서대로 렌더).
 */

const DEV = import.meta.env?.DEV ?? false;

/** 장르 키 → 표시 라벨. (현재 그리드는 섹션 헤더 없이 GAMES 순서대로 렌더 — genre 는 분류 메타로만 유지.) */
const GENRE_LABELS = {
  reward:   '리워드',
  puzzle:   '퍼즐·캐주얼',
  shooting: '슈팅·조준',
  sports:   '스포츠',
  battle:   '배틀·디펜스',
  rhythm:   '리듬·레이스',
};
/** 섹션 노출 순서. */
const GENRE_ORDER = ['puzzle', 'shooting', 'sports', 'battle', 'rhythm'];

/**
 * @typedef {Object} GameEntry
 * @property {string}  id
 * @property {string}  title
 * @property {string}  tagline
 * @property {keyof typeof GENRE_LABELS} genre
 * @property {string}  art        키아트(public/art/)
 * @property {string} [heroVideo] 상위 앱(히어로) 카드 전용 루프 미리보기 영상(public/art/, mp4). 있으면 phone-art 를 이 영상으로 대체(포스터=art).
 * @property {string} [logo]      투명 로고(public/art/); 없으면 제목 텍스트만
 * @property {number} [logoScale] 로고 크기 배율(기본 1)
 * @property {string}  accent
 * @property {boolean} live
 * @property {number} [devPort]
 * @property {string} [prodUrl]
 * @property {string} [extUrl]  외부 호스팅 웹앱 절대 URL(예: 미션 리워드 앱테크). pinned 카드가 팝업으로 연다.
 * @property {boolean} [pinned] 고정 1번 앱(위치 변동 없음). 리워드앱 = 항상 그리드 맨 앞.
 */

/** @type {GameEntry[]} */
const GAMES = [
  // ───────── ⓪ 고정 1번 앱 — 리워드앱(위치 변동 없음, 현재 '배치만') ─────────
  //   CashPOP: '광고보고 현금 캐시' 앱테크 리워드앱(플랫폼 1번 앱). 항상 그리드 맨 앞 고정(pinned).
  //   클릭 시 외부 미션 리워드 앱(extUrl)을 팝업으로 연다(테스트 연결). 화면 아트 = CashPOP 홈, 로고 = icon_02-09.
  { id: 'cashpop',      title: 'CashPOP',         tagline: '광고 보고 현금 캐시 적립',            genre: 'reward',   art: 'art/CashPOP_Game.webp',       logo: 'art/CashPOP_logo_t.webp',      accent: '#2563EB', live: true,  pinned: true, hidden: true, extUrl: 'https://missionreward-dev-8f477.netlify.app/' },

  // ───────── ① 플레이 오픈(allowlist) — 배포 지정 순서대로 앞쪽 배치 ─────────
  //   prod(브라우저·설치형 PWA 공통)에서 실제 플레이 가능한 게임. 목록·순서는 launcher.ts 의 PLAY_OPEN_GAMES 와 일치시킨다.
  //   지정 순서: 열정편의점 > 꼬치왕 > 배송대작전 > 홈런팝 > 아처리스타즈 > 양떼고 > 오션퍼즐 > 패시앤고 > 좀비애로우 > 사커플릭 > 버블퐁 > 베가스호텔
  { id: 'store',        title: '열정편의점',      tagline: '같은 상품을 모아 진열대 정리',         genre: 'puzzle',   art: 'art/store_game.webp',         logo: 'art/store_logo_t.webp',        accent: '#3CB54A', live: true,  devPort: 6181, prodUrl: '../store/' },
  { id: 'skewer',       title: '꼬치왕',          tagline: '같은 꼬치 3개를 모아 주문 완성',       genre: 'puzzle',   art: 'art/skewer_game.webp',        logo: 'art/skewer_logo_t.webp',       accent: '#EB5757', live: true,  devPort: 6195, prodUrl: '../grillking/' },
  { id: 'parcelpoprush',title: '배송대작전',      tagline: '주문한 상품을 모아 트럭에 싣고 출발',   genre: 'puzzle',   art: 'art/ParcelPopRush_Game.webp', logo: 'art/ParcelPopRush_logo_t.webp',accent: '#F2B705', live: true,  devPort: 6202, prodUrl: '../logistics/' },
  { id: 'homerunpop',   title: '홈런팝',          tagline: '타이밍 터치 야구 — 홈런 타격 액션',    genre: 'sports',   art: 'art/HomerunPOP_Game.webp',    logo: 'art/HomerunPOP_logo_t.webp',   accent: '#E23B3B', live: true,  devPort: 6197, prodUrl: '../homerun/' },
  { id: 'archerystars', title: '아처리스타즈',    tagline: '바람을 읽고 과녁 정중앙을 노려라',      genre: 'shooting', art: 'art/ArcheryStars_Game.webp',  logo: 'art/ArcheryStars_logo_t.webp', accent: '#2F6FE0', live: true,  devPort: 6199, prodUrl: '../archery/' },
  { id: 'flockgo',      title: '양떼고!',         tagline: '빽빽한 양떼를 방향 따라 탈출시키는 퍼즐', genre: 'puzzle',  art: 'art/FlockGo_Game.webp',       logo: 'art/FlockGo_logo_t.webp',  accent: '#7CC24A', live: false, devPort: 6208, prodUrl: '../flockgo/' }, // PO 2026-07-30: 준비중으로 전환.
  { id: 'eco01',        title: 'Ocean Puzzle',    tagline: '수중 매치-3 퍼즐',                    genre: 'puzzle',   art: 'art/ocean_game.webp',         logo: 'art/ocean_logo.webp',          accent: '#2D9CDB', live: true,  devPort: 6190, prodUrl: '../eco01/' },
  { id: 'fishing',      title: 'Fish & Go',       tagline: '세로 낚시 — 타이밍 맞춰 낚아채기',      genre: 'puzzle',   art: 'art/fishing_game.webp',       logo: 'art/fishing_logo.webp', logoScale: 0.8, accent: '#1E88C7', live: true,  devPort: 5175, prodUrl: '../fishing/' },
  { id: 'zombiearrow',  title: '좀비애로우러시',  tagline: '활시위를 당겨 몰려오는 좀비 웨이브를 막아라', genre: 'shooting', art: 'art/ZombieArrow_Game.webp', logo: 'art/ZombieArrow_logo_t.webp', accent: '#74C13A', live: true,  devPort: 6200, prodUrl: '../zombiearrow/' },
  { id: 'soccerflick',  title: '사커플릭',        tagline: '디스크를 튕겨 골 넣는 플릭 축구 배틀',  genre: 'sports',   art: 'art/SoccerFlick_Game.webp',   logo: 'art/SoccerFlick_logo_t.webp',  accent: '#2F80ED', live: true,  devPort: 6203, prodUrl: '../soccerflick/' },
  { id: 'bubblepong',   title: '버블퐁',          tagline: '같은 색 버블을 맞춰 터트리기',         genre: 'puzzle',   art: 'art/BubblePong_Game.webp',    logo: 'art/BubblePong_logo_t.webp',   accent: '#4BBFE6', live: false, devPort: 6191, prodUrl: '../bubblepong/' }, // PO 2026-07-30: 준비중으로 전환.
  // 베가스호텔타이쿤: 내부 id=socialcasino 유지, 표시명만 변경(이전 'MATCHSLOT CITY'). 디자이너 main.json/ui-assets.json 과 무관(허브 표시명만).
  { id: 'socialcasino', title: '베가스호텔타이쿤', tagline: '매치로 스핀을 모아 잭팟을 터뜨리는 소셜 퍼즐슬롯', genre: 'puzzle', art: 'art/VegasHotel_Game.webp', logo: 'art/VegasHotel_Logo.webp', accent: '#9B5DE5', live: true,  devPort: 6207, prodUrl: '../socialcasino/' },

  // ───────── ② 그 외 라이브(현재 비공개 잠금 — 클릭 시 '곧 오픈' 토스트, 카드=오픈 준비중) ─────────
  { id: 'dragonbeat',   title: '드래곤비트',      tagline: '용선 리듬 레이스',                    genre: 'rhythm',   art: 'art/DragonBeat_Game.webp',    logo: 'art/DragonBeat_logo_t.webp',   accent: '#18A0C9', live: false, devPort: 6198, prodUrl: '../dragonbeat/' }, // PO 2026-07-30: 준비중으로 전환.
  { id: 'duckhuntrush', title: '덕헌트러시',      tagline: '날아오르는 오리를 정조준 사격',        genre: 'shooting', art: 'art/DuckhuntRush_Game.webp',  logo: 'art/DuckhuntRush_logo_t.webp', accent: '#5BB031', live: false, devPort: 6201, prodUrl: '../duckhuntrush/' }, // PO 2026-07-30: 준비중으로 전환.
  { id: 'pathrush',     title: '패스러시',        tagline: '모든 타일을 채우며 한 붓으로 길 잇기',  genre: 'puzzle',   art: 'art/PathRush_Game.webp',      logo: 'art/PathRush_logo_t.webp',     accent: '#F2719C', live: false, devPort: 6204, prodUrl: '../pathrush/' }, // PO 2026-07-30: 준비중으로 전환.
  { id: 'pawlinkroom',  title: '포링크룸',        tagline: '같은 펫 아이템을 이어 짝 맞추는 라인 퍼즐', genre: 'puzzle', art: 'art/PawlinkRoom_Game.webp', logo: 'art/PawlinkRoom_logo_t.webp', accent: '#F2A33C', live: false, devPort: 6205, prodUrl: '../pawlink/' }, // PO 2026-07-30: 준비중으로 전환.
  // 스모클래시: 레인 디펜스 본편 구현(2026-07-23) — dev 플레이 가능. prod 는 PLAY_OPEN_GAMES 미등록이라 잠금 유지.
  { id: 'sumoclash',    title: '스모클래시',      tagline: '스모 부대 라인 배틀',                 genre: 'battle',   art: 'art/SumoClash_Game.webp',     logo: 'art/SumoClash_logo_t.webp',    accent: '#E8553A', live: true,  devPort: 6196, prodUrl: '../sumoclash/' },
  // 틱택토 네온: 3말 순환이동 변형 vs컴퓨터 구현(2026-08-04) — dev 플레이 가능. prod 는 PLAY_OPEN_GAMES 미등록이라 잠금 유지. 키아트 = 게임 배경 상단 크롭.
  { id: 'tictactoe',    title: '틱택토 네온',     tagline: '가장 오래된 말이 움직이는 3목 두뇌 대결', genre: 'puzzle', art: 'art/TicTacToe_Game.webp',    accent: '#27C4FF', live: true,  devPort: 6211, prodUrl: '../tictactoe/' },

  // 김밥 롤 마스터: 메뉴 선택→재료 조합→말기·썰기→종·채점 완결(2026-08-07). prod 는 **추가 비밀번호 5656**
  //   (scripts/deploy-gate.mjs GAME_GATES.kimbaproll) 뒤에서 열린다.
  { id: 'kimbabroll',   title: '김밥롤 마스터',   tagline: '재료를 올려 김밥을 말아 완성',         genre: 'puzzle',   art: 'art/KimbabRoll_Game.webp',    accent: '#3E9B6B', live: true,  devPort: 6212, prodUrl: '../kimbaproll/' },

  // ───────── ③ 준비중 — 퍼즐·캐주얼 ─────────
  //   솔리테어 하이츠: 허브 그리드 노출·플레이 오픈(PLAY_OPEN_GAMES 에 등록). 정식 키아트 WebP 적용(2026-07-11).
  { id: 'solitaire',    title: '솔리테어 하이츠', tagline: '카드를 위·아래로 이어 층층이 타워를 쌓는 솔리테어', genre: 'puzzle', art: 'art/Solitaire_Game.webp', heroVideo: 'art/Solitaire_Hero.mp4', logo: 'art/Solitaire_logo_t.webp', accent: '#E86FA6', live: true,  devPort: 6209, prodUrl: '../solitaire/' },
  { id: 'omakase',      title: '오마카세매치',    tagline: '초밥 매치 퍼즐',                      genre: 'puzzle',   art: 'art/omakase_game.webp',       logo: 'art/omakase_logo_t.webp',      accent: '#F2994A', live: false },
  { id: 'aquaslot',     title: '아쿠아슬롯',      tagline: '수중 테마 슬롯',                      genre: 'puzzle',   art: 'art/AquaSlot_Game.webp',      logo: 'art/AquaSlot_logo_t.webp',     accent: '#7C5CFF', live: false },
  { id: 'colorsplash',  title: '컬러스플래시',    tagline: '색을 채우는 캐주얼 퍼즐',              genre: 'puzzle',   art: 'art/ColorSplash_Game.webp',   logo: 'art/ColorSplash_logo_t.webp',  accent: '#FF7AB6', live: false },
  { id: 'samgyeop',     title: '삼겹살 마스터',   tagline: '지글지글 노릇하게 타이밍 맞춰 굽기',    genre: 'puzzle',   art: 'art/Samgyeop_Game.webp',      accent: '#C0612E', live: false },
  { id: 'tteokbokki',   title: '떡볶이 마스터',   tagline: '매콤 양념에 쫄깃한 떡을 볶아 완성',     genre: 'puzzle',   art: 'art/Tteokbokki_Game.webp',    accent: '#E2452F', live: false },
  { id: 'pickmeup',     title: '픽미업',          tagline: '승객을 색 맞춰 버스에 태우는 정렬 퍼즐', genre: 'puzzle',  art: 'art/PickmeUp_Game.webp',      logo: 'art/PickmeUp_logo_t.webp', accent: '#E5703A', live: false, devPort: 6206, prodUrl: '../pickmeup/' },

  // ───────── ③ 준비중 — 슈팅·조준 ─────────
  { id: 'shootingarena',title: '슈팅아레나',      tagline: '조준·줌·부스트로 표적 명중',           genre: 'shooting', art: 'art/ShootingArena_Game.webp', accent: '#3FA9C4', live: false },

  // ───────── ③ 준비중 — 스포츠 ─────────
  { id: 'soccergo',     title: 'SoccerGO',        tagline: '프리킥 슛 대결',                      genre: 'sports',   art: 'art/SoccerGO_Game.webp',      logo: 'art/SoccerGO_logo_t.webp',     accent: '#2EA84F', live: false, devPort: 6210, prodUrl: '../soccergo/' },

  // ───────── ③ 준비중 — 배틀·디펜스 ─────────
  { id: 'zombieroad',   title: '좀비로드',        tagline: '좀비 길목 디펜스',                    genre: 'battle',   art: 'art/ZombieRoad_Game.webp',    logo: 'art/ZombieRoad_logo_t.webp',   accent: '#6BBF2F', live: false },

];

/** live 게임의 현재 환경 진입 URL. */
export function gameUrl(game) {
  if (!game.live) return null;
  if (!DEV) return game.prodUrl;
  // dev: 게임 포트는 허브를 '연 호스트'를 그대로 따라간다.
  //   데스크탑 → localhost, 같은 네트워크 모바일/타기기 → 허브 IP(예: 192.168.x.x).
  //   localhost 하드코딩이면 모바일의 localhost = 폰 자신을 가리켜 게임이 안 열린다.
  const host = (typeof window !== 'undefined' && window.location?.hostname) || 'localhost';
  return `http://${host}:${game.devPort}/`;
}

export { GAMES, DEV, GENRE_LABELS, GENRE_ORDER };
