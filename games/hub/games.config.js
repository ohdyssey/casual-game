/**
 * 게임 라인업 레지스트리 — 허브가 보여줄 카드의 단일 소스.
 *
 * 카드 아트: public/art/ 의 키아트(*_Game.png) + 투명 로고(*_logo_t.png, 크로마키 처리).
 * 각 게임은 독립 빌드/배포(+ 별도 네이티브 앱). 허브는 URL 로만 연결한다.
 *   live=true  → dev:devPort / prod:prodUrl 로 팝업 실행
 *   live=false → "준비중" 표시, 클릭 불가
 *
 * 리스팅 규칙: ① 플레이 가능(live) 섹션을 먼저 → ② 준비중은 장르(genre)별로 묶어 표시.
 *   index.html 이 genre 로 섹션을 자동 구성하므로, 새 게임은 genre 만 채우면 알맞은 자리에 들어간다.
 */

const DEV = import.meta.env?.DEV ?? false;

/** 장르 키 → 표시 라벨. 섹션 정렬 순서이기도 하다(위→아래). */
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
  // ───────── 플레이 가능(live) ─────────
  { id: 'store',      title: '열정편의점',   tagline: '같은 상품을 모아 진열대 정리', genre: 'puzzle',   art: 'art/store_game.png',      logo: 'art/store_logo_t.png',      accent: '#3CB54A', live: true,  devPort: 6181, prodUrl: '../store/' },
  { id: 'skewer',     title: '꼬치왕',       tagline: '같은 꼬치 3개를 모아 주문 완성', genre: 'puzzle',  art: 'art/skewer_game.png',     logo: 'art/skewer_logo_t.png',     accent: '#EB5757', live: true,  devPort: 6195, prodUrl: '../grillking/' },
  // Ocean Puzzle·낚시: 임시 아트(추후 정식 제공 시 public/art/ 의 동일 파일명만 교체하면 됨).
  //   ocean_game.png / ocean_logo.png  ← 현재 FishyMatch 임시 복제
  //   fishing_game.png ← 실행 화면 캡처 임시 / fishing_logo.png 는 제공 후 logo 필드 추가
  { id: 'eco01',      title: 'Ocean Puzzle', tagline: '수중 매치-3 퍼즐',             genre: 'puzzle',   art: 'art/ocean_game.png',   logo: 'art/ocean_logo.png', accent: '#2D9CDB', live: true,  devPort: 6190, prodUrl: '../eco01/' },
  { id: 'bubblepong', title: '버블퐁',       tagline: '같은 색 버블을 맞춰 터트리기', genre: 'puzzle',   art: 'art/BubblePong_Game.png', logo: 'art/BubblePong_logo_t.png', accent: '#4BBFE6', live: true,  devPort: 6191, prodUrl: '../bubblepong/' },
  { id: 'fishing',    title: 'Fish & Go',    tagline: '세로 낚시 — 타이밍 맞춰 낚아채기', genre: 'puzzle', art: 'art/fishing_game.png', logo: 'art/fishing_logo.png', logoScale: 0.8, accent: '#1E88C7', live: true,  devPort: 5175, prodUrl: '../fishing/' },
  { id: 'homerunpop', title: '홈런팝',       tagline: '타이밍 터치 야구 — 홈런 타격 액션', genre: 'sports', art: 'art/HomerunPOP_Game.png', logo: 'art/HomerunPOP_logo_t.png', accent: '#E23B3B', live: true,  devPort: 6197, prodUrl: '../homerun/' },
  { id: 'dragonbeat', title: '드래곤비트',   tagline: '용선 리듬 레이스',              genre: 'rhythm',   art: 'art/DragonBeat_Game.png', logo: 'art/DragonBeat_logo_t.png', accent: '#18A0C9', live: true,  devPort: 6198, prodUrl: '../dragonbeat/' },

  // ───────── 준비중 — 퍼즐·캐주얼 ─────────
  { id: 'omakase',    title: '오마카세매치', tagline: '초밥 매치 퍼즐',               genre: 'puzzle',   art: 'art/omakase_game.png',    logo: 'art/omakase_logo_t.png',    accent: '#F2994A', live: false },
  { id: 'aquaslot',   title: '아쿠아슬롯',   tagline: '수중 테마 슬롯',               genre: 'puzzle',   art: 'art/AquaSlot_Game.png',   logo: 'art/AquaSlot_logo_t.png',   accent: '#7C5CFF', live: false },
  { id: 'colorsplash',title: '컬러스플래시', tagline: '색을 채우는 캐주얼 퍼즐',       genre: 'puzzle',   art: 'art/ColorSplash_Game.png',logo: 'art/ColorSplash_logo_t.png',accent: '#FF7AB6', live: false },

  // ───────── 준비중 — 슈팅·조준 ─────────
  { id: 'archerystars',title: '아처리스타즈', tagline: '바람을 읽고 과녁 정중앙을 노려라', genre: 'shooting', art: 'art/ArcheryStars_Game.png',logo: 'art/ArcheryStars_logo_t.png',accent: '#2F6FE0', live: false },
  { id: 'duckhuntrush',title: '덕헌트러시',   tagline: '날아오르는 오리를 정조준 사격',   genre: 'shooting', art: 'art/DuckhuntRush_Game.png',logo: 'art/DuckhuntRush_logo_t.png',accent: '#5BB031', live: false },
  // ShootingArena: 로고 미제공 → logo 필드 생략(제목 텍스트만). 추후 로고 제공 시 _logo_t.png 추가하고 logo 필드 채우면 됨.
  { id: 'shootingarena',title: '슈팅아레나',  tagline: '조준·줌·부스트로 표적 명중',     genre: 'shooting', art: 'art/ShootingArena_Game.png',accent: '#3FA9C4', live: false },

  // ───────── 준비중 — 스포츠 ─────────
  { id: 'soccergo',   title: 'SoccerGO',     tagline: '프리킥 슛 대결',                genre: 'sports',   art: 'art/SoccerGO_Game.png',   logo: 'art/SoccerGO_logo_t.png',   accent: '#2EA84F', live: false },

  // ───────── 준비중 — 배틀·디펜스 ─────────
  { id: 'sumoclash',  title: '스모클래시',   tagline: '스모 부대 라인 배틀',           genre: 'battle',   art: 'art/SumoClash_Game.png',  logo: 'art/SumoClash_logo_t.png',  accent: '#E8553A', live: false },
  { id: 'zombieroad', title: '좀비로드',     tagline: '좀비 길목 디펜스',              genre: 'battle',   art: 'art/ZombieRoad_Game.png', logo: 'art/ZombieRoad_logo_t.png', accent: '#6BBF2F', live: false },

];

/** live 게임의 현재 환경 진입 URL. */
export function gameUrl(game) {
  if (!game.live) return null;
  return DEV ? `http://localhost:${game.devPort}/` : game.prodUrl;
}

export { GAMES, DEV, GENRE_LABELS, GENRE_ORDER };
