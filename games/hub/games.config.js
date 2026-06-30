/**
 * 게임 라인업 레지스트리 — 허브가 보여줄 카드의 단일 소스.
 *
 * 카드 아트: public/art/ 의 키아트(*_Game.png) + 투명 로고(*_logo_t.png, 크로마키 처리).
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
 * @property {string} [logo]      투명 로고(public/art/); 없으면 제목 텍스트만
 * @property {number} [logoScale] 로고 크기 배율(기본 1)
 * @property {string}  accent
 * @property {boolean} live
 * @property {number} [devPort]
 * @property {string} [prodUrl]
 */

/** @type {GameEntry[]} */
const GAMES = [
  // ───────── ① 플레이 오픈(allowlist) — 앞쪽 배치 ─────────
  //   prod(브라우저·설치형 PWA 공통)에서 실제 플레이 가능한 게임. 목록은 launcher.ts 의 PLAY_OPEN_GAMES 와 일치시킨다.
  { id: 'store',        title: '열정편의점',      tagline: '같은 상품을 모아 진열대 정리',         genre: 'puzzle',   art: 'art/store_game.png',         logo: 'art/store_logo_t.png',        accent: '#3CB54A', live: true,  devPort: 6181, prodUrl: '../store/' },
  { id: 'archerystars', title: '아처리스타즈',    tagline: '바람을 읽고 과녁 정중앙을 노려라',      genre: 'shooting', art: 'art/ArcheryStars_Game.png',  logo: 'art/ArcheryStars_logo_t.png', accent: '#2F6FE0', live: true,  devPort: 6199, prodUrl: '../archery/' },
  { id: 'eco01',        title: 'Ocean Puzzle',    tagline: '수중 매치-3 퍼즐',                    genre: 'puzzle',   art: 'art/ocean_game.png',         logo: 'art/ocean_logo.png',          accent: '#2D9CDB', live: true,  devPort: 6190, prodUrl: '../eco01/' },
  { id: 'parcelpoprush',title: '배송대작전',      tagline: '주문한 상품을 모아 트럭에 싣고 출발',   genre: 'puzzle',   art: 'art/ParcelPopRush_Game.png', logo: 'art/ParcelPopRush_logo_t.png',accent: '#F2B705', live: true,  devPort: 6202, prodUrl: '../logistics/' },
  // 베가스호텔타이쿤: 내부 id=socialcasino 유지, 표시명만 변경(이전 'MATCHSLOT CITY'). 디자이너 main.json/ui-assets.json 과 무관(허브 표시명만).
  { id: 'socialcasino', title: '베가스호텔타이쿤', tagline: '매치로 스핀을 모아 잭팟을 터뜨리는 소셜 퍼즐슬롯', genre: 'puzzle', art: 'art/VegasHotel_Game.png', logo: 'art/VegasHotel_Logo.png', accent: '#9B5DE5', live: true,  devPort: 6207, prodUrl: '../socialcasino/' },
  { id: 'fishing',      title: 'Fish & Go',       tagline: '세로 낚시 — 타이밍 맞춰 낚아채기',      genre: 'puzzle',   art: 'art/fishing_game.png',       logo: 'art/fishing_logo.png', logoScale: 0.8, accent: '#1E88C7', live: true,  devPort: 5175, prodUrl: '../fishing/' },
  { id: 'skewer',       title: '꼬치왕',          tagline: '같은 꼬치 3개를 모아 주문 완성',       genre: 'puzzle',   art: 'art/skewer_game.png',        logo: 'art/skewer_logo_t.png',       accent: '#EB5757', live: true,  devPort: 6195, prodUrl: '../grillking/' },

  // ───────── ② 그 외 라이브(현재 비공개 잠금 — 클릭 시 '곧 오픈' 토스트) ─────────
  { id: 'bubblepong',   title: '버블퐁',          tagline: '같은 색 버블을 맞춰 터트리기',         genre: 'puzzle',   art: 'art/BubblePong_Game.png',    logo: 'art/BubblePong_logo_t.png',   accent: '#4BBFE6', live: true,  devPort: 6191, prodUrl: '../bubblepong/' },
  { id: 'homerunpop',   title: '홈런팝',          tagline: '타이밍 터치 야구 — 홈런 타격 액션',    genre: 'sports',   art: 'art/HomerunPOP_Game.png',    logo: 'art/HomerunPOP_logo_t.png',   accent: '#E23B3B', live: true,  devPort: 6197, prodUrl: '../homerun/' },
  { id: 'dragonbeat',   title: '드래곤비트',      tagline: '용선 리듬 레이스',                    genre: 'rhythm',   art: 'art/DragonBeat_Game.png',    logo: 'art/DragonBeat_logo_t.png',   accent: '#18A0C9', live: true,  devPort: 6198, prodUrl: '../dragonbeat/' },
  { id: 'zombiearrow',  title: '좀비애로우러시',  tagline: '활시위를 당겨 몰려오는 좀비 웨이브를 막아라', genre: 'shooting', art: 'art/ZombieArrow_Game.png', logo: 'art/ZombieArrow_logo_t.png', accent: '#74C13A', live: true,  devPort: 6200, prodUrl: '../zombiearrow/' },
  { id: 'duckhuntrush', title: '덕헌트러시',      tagline: '날아오르는 오리를 정조준 사격',        genre: 'shooting', art: 'art/DuckhuntRush_Game.png',  logo: 'art/DuckhuntRush_logo_t.png', accent: '#5BB031', live: true,  devPort: 6201, prodUrl: '../duckhuntrush/' },
  { id: 'soccerflick',  title: '사커플릭',        tagline: '디스크를 튕겨 골 넣는 플릭 축구 배틀',  genre: 'sports',   art: 'art/SoccerFlick_Game.png',   logo: 'art/SoccerFlick_logo_t.png',  accent: '#2F80ED', live: true,  devPort: 6203, prodUrl: '../soccerflick/' },
  { id: 'pathrush',     title: '패스러시',        tagline: '모든 타일을 채우며 한 붓으로 길 잇기',  genre: 'puzzle',   art: 'art/PathRush_Game.png',      logo: 'art/PathRush_logo_t.png',     accent: '#F2719C', live: true,  devPort: 6204, prodUrl: '../pathrush/' },
  { id: 'pawlinkroom',  title: '포링크룸',        tagline: '같은 펫 아이템을 이어 짝 맞추는 라인 퍼즐', genre: 'puzzle', art: 'art/PawlinkRoom_Game.png', logo: 'art/PawlinkRoom_logo_t.png', accent: '#F2A33C', live: true,  devPort: 6205, prodUrl: '../pawlink/' },

  // ───────── ③ 준비중 — 퍼즐·캐주얼 ─────────
  { id: 'omakase',      title: '오마카세매치',    tagline: '초밥 매치 퍼즐',                      genre: 'puzzle',   art: 'art/omakase_game.png',       logo: 'art/omakase_logo_t.png',      accent: '#F2994A', live: false },
  { id: 'aquaslot',     title: '아쿠아슬롯',      tagline: '수중 테마 슬롯',                      genre: 'puzzle',   art: 'art/AquaSlot_Game.png',      logo: 'art/AquaSlot_logo_t.png',     accent: '#7C5CFF', live: false },
  { id: 'colorsplash',  title: '컬러스플래시',    tagline: '색을 채우는 캐주얼 퍼즐',              genre: 'puzzle',   art: 'art/ColorSplash_Game.png',   logo: 'art/ColorSplash_logo_t.png',  accent: '#FF7AB6', live: false },
  { id: 'kimbabroll',   title: '김밥롤 마스터',   tagline: '재료를 올려 김밥을 말아 완성',         genre: 'puzzle',   art: 'art/KimbabRoll_Game.png',    accent: '#3E9B6B', live: false },
  { id: 'samgyeop',     title: '삼겹살 마스터',   tagline: '지글지글 노릇하게 타이밍 맞춰 굽기',    genre: 'puzzle',   art: 'art/Samgyeop_Game.png',      accent: '#C0612E', live: false },
  { id: 'tteokbokki',   title: '떡볶이 마스터',   tagline: '매콤 양념에 쫄깃한 떡을 볶아 완성',     genre: 'puzzle',   art: 'art/Tteokbokki_Game.png',    accent: '#E2452F', live: false },
  { id: 'pickmeup',     title: '픽미업',          tagline: '승객을 색 맞춰 버스에 태우는 정렬 퍼즐', genre: 'puzzle',  art: 'art/PickmeUp_Game.png',      logo: 'art/PickmeUp_logo_t.png', accent: '#E5703A', live: false, devPort: 6206, prodUrl: '../pickmeup/' },

  // ───────── ③ 준비중 — 슈팅·조준 ─────────
  { id: 'shootingarena',title: '슈팅아레나',      tagline: '조준·줌·부스트로 표적 명중',           genre: 'shooting', art: 'art/ShootingArena_Game.png', accent: '#3FA9C4', live: false },

  // ───────── ③ 준비중 — 스포츠 ─────────
  { id: 'soccergo',     title: 'SoccerGO',        tagline: '프리킥 슛 대결',                      genre: 'sports',   art: 'art/SoccerGO_Game.png',      logo: 'art/SoccerGO_logo_t.png',     accent: '#2EA84F', live: false },

  // ───────── ③ 준비중 — 배틀·디펜스 ─────────
  { id: 'sumoclash',    title: '스모클래시',      tagline: '스모 부대 라인 배틀',                 genre: 'battle',   art: 'art/SumoClash_Game.png',     logo: 'art/SumoClash_logo_t.png',    accent: '#E8553A', live: false },
  { id: 'zombieroad',   title: '좀비로드',        tagline: '좀비 길목 디펜스',                    genre: 'battle',   art: 'art/ZombieRoad_Game.png',    logo: 'art/ZombieRoad_logo_t.png',   accent: '#6BBF2F', live: false },

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
