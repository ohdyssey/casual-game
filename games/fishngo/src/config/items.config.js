/**
 * Item Catalog — 낚시 장비 (낚시줄/미끼/릴/낚시대) 카탈로그.
 *
 * Phase 1 (현재): 데이터 정의만. 게임 동작 무변경.
 * Phase 2+: Spawner / Hook / 텐션 게이지에서 이 스탯들을 직접 참조.
 *
 * 4 카테고리 × T1~T6 = 24개 기본 아이템 + 미끼 다양화.
 *
 * 명명 규칙:
 *   rod_*   : 낚시대 — power(잡을 수 있는 어종 무게), action(텐션 응답성), length(수심 보너스)
 *   reel_*  : 릴     — drag(텐션 흡수), reelSpeed(끌어올림 속도), stability(스파이크 감쇠)
 *   line_*  : 낚시줄 — strength(절단 임계), depthLimit(수심 한계), visibility(어종 경계도)
 *   bait_*  : 생미끼 — targetSpecies(유인 어종), biteBonus(입질 +%), 소모성 (stock)
 *   lure_*  : 루어   — 동일하나 재사용 (durability=Infinity)
 *
 * 특수 값:
 *   targetSpecies = '__all__'   : 모든 어종에 적용
 *   targetSpecies = '__random__': 매 캐스팅 시 랜덤 1종
 *   durability    = Infinity    : 영구 사용
 */

// ─── 티어 메타 ───
/**
 * @typedef {1|2|3|4|5|6} ItemTier
 */
export const TIER_META = {
  1: { name: 'Common',    color: 0x9aa0a8, label: '일반' },
  2: { name: 'Uncommon',  color: 0x4ec56e, label: '고급' },
  3: { name: 'Rare',      color: 0x4e9aff, label: '희귀' },
  4: { name: 'Epic',      color: 0xaa6cff, label: '영웅' },
  5: { name: 'Legendary', color: 0xffae33, label: '전설' },
  6: { name: 'Mythic',    color: 0xff4eb8, label: '신화' },
};

// ─── 낚시대 (Rod) — 30종 (Lv 1~30, T1~T6 × 4~6 items) ───
/**
 * 디자인 출처: 낚시대 설계도 Google Doc (4개 doc 중 하나).
 *
 * @typedef {Object} RodSpec
 * @property {string}  id            'rod_NN' (Lv 매칭)
 * @property {string}  name
 * @property {ItemTier} tier         일반=1, 고급=2, 희귀=3, 에픽=4, 레전드=5, 신화=6
 * @property {number}  power         Rod Power (잡을 수 있는 최대 어종 weight, kg) — Hook.js 게이트
 * @property {number}  action        Control / 100 (텐션 응답성 0~1)
 * @property {number}  length        1.0 + castDistance/100 (m, 호환 필드)
 * @property {number}  rigidity      0.30 + power/600 (강성 0~1, 호환 필드)
 * @property {number}  flex          Flex / 100 (탄성 0~1, 신규)
 * @property {number}  castDistance  원본 doc Cast Distance (m, 신규)
 * @property {number}  durability    사용 횟수
 * @property {number}  price         가격 (가격은 doc 미제공 → 티어 base × 위치 보간)
 * @property {string}  icon          아이콘 키 ('rod_NN', assets.config.js 등록)
 * @property {boolean} [featured]    티어별 대표 1종 (Popup 기본 그리드용)
 * @property {string}  role          설계 역할 (문서 카피)
 */
export const ITEM_RODS = {
  rod_01: { id: 'rod_01', name: '나무 낚시대', tier: 1, power: 10, action: 0.08, length: 1.2, rigidity: 0.317, flex: 0.12, castDistance: 20, durability: 20, price: 100, icon: 'rod_01', featured: true, role: '튜토리얼 기본' },
  rod_02: { id: 'rod_02', name: '대나무 낚시대', tier: 1, power: 13, action: 0.1, length: 1.24, rigidity: 0.322, flex: 0.16, castDistance: 24, durability: 22, price: 150, icon: 'rod_02', role: '초반 소형' },
  rod_03: { id: 'rod_03', name: '초보자 낚시대', tier: 1, power: 16, action: 0.13, length: 1.28, rigidity: 0.327, flex: 0.18, castDistance: 28, durability: 24, price: 200, icon: 'rod_03', role: '기본 조작' },
  rod_04: { id: 'rod_04', name: '연안 낚시대', tier: 1, power: 20, action: 0.15, length: 1.32, rigidity: 0.333, flex: 0.2, castDistance: 32, durability: 26, price: 250, icon: 'rod_04', role: '얕은 바다' },
  rod_05: { id: 'rod_05', name: '라이트 카본 낚시대', tier: 2, power: 25, action: 0.18, length: 1.38, rigidity: 0.342, flex: 0.22, castDistance: 38, durability: 30, price: 600, icon: 'rod_05', featured: true, role: '중형 진입' },
  rod_06: { id: 'rod_06', name: '블루 코스트 로드', tier: 2, power: 31, action: 0.21, length: 1.44, rigidity: 0.352, flex: 0.24, castDistance: 44, durability: 34, price: 900, icon: 'rod_06', role: '연안 중형' },
  rod_07: { id: 'rod_07', name: '스피드 캐스팅 로드', tier: 2, power: 35, action: 0.23, length: 1.52, rigidity: 0.358, flex: 0.22, castDistance: 52, durability: 36, price: 1200, icon: 'rod_07', role: '캐스팅 특화' },
  rod_08: { id: 'rod_08', name: '밸런스 카본 로드', tier: 2, power: 42, action: 0.27, length: 1.58, rigidity: 0.37, flex: 0.28, castDistance: 58, durability: 40, price: 1500, icon: 'rod_08', role: '초중반 균형' },
  rod_09: { id: 'rod_09', name: '하드 팁 로드', tier: 3, power: 50, action: 0.25, length: 1.64, rigidity: 0.383, flex: 0.24, castDistance: 64, durability: 44, price: 3500, icon: 'rod_09', featured: true, role: '강한 입질 대응' },
  rod_10: { id: 'rod_10', name: '골든 코스트 로드', tier: 3, power: 60, action: 0.3, length: 1.72, rigidity: 0.4, flex: 0.3, castDistance: 72, durability: 50, price: 4550, icon: 'rod_10', role: '초반 희귀' },
  rod_11: { id: 'rod_11', name: '파워 카본 로드', tier: 3, power: 72, action: 0.34, length: 1.8, rigidity: 0.42, flex: 0.32, castDistance: 80, durability: 54, price: 5600, icon: 'rod_11', role: '중대형 입문' },
  rod_12: { id: 'rod_12', name: '롱 캐스트 로드', tier: 3, power: 78, action: 0.36, length: 1.92, rigidity: 0.43, flex: 0.3, castDistance: 92, durability: 56, price: 6650, icon: 'rod_12', role: '먼 거리' },
  rod_13: { id: 'rod_13', name: '실버 밸런스 로드', tier: 3, power: 88, action: 0.4, length: 2.0, rigidity: 0.447, flex: 0.36, castDistance: 100, durability: 60, price: 7700, icon: 'rod_13', role: '안정형' },
  rod_14: { id: 'rod_14', name: '터프 파워 로드', tier: 3, power: 102, action: 0.38, length: 2.08, rigidity: 0.47, flex: 0.34, castDistance: 108, durability: 64, price: 8750, icon: 'rod_14', role: '힘 중심' },
  rod_15: { id: 'rod_15', name: '딥 블루 로드', tier: 4, power: 118, action: 0.44, length: 2.2, rigidity: 0.497, flex: 0.4, castDistance: 120, durability: 70, price: 18000, icon: 'rod_15', featured: true, role: '심해 입문' },
  rod_16: { id: 'rod_16', name: '레드 스트라이크 로드', tier: 4, power: 135, action: 0.46, length: 2.3, rigidity: 0.525, flex: 0.38, castDistance: 130, durability: 74, price: 23400, icon: 'rod_16', role: '공격성 대응' },
  rod_17: { id: 'rod_17', name: '하이텐션 로드', tier: 4, power: 148, action: 0.5, length: 2.4, rigidity: 0.547, flex: 0.44, castDistance: 140, durability: 78, price: 28800, icon: 'rod_17', role: '텐션 안정' },
  rod_18: { id: 'rod_18', name: '오션 플렉스 로드', tier: 4, power: 160, action: 0.54, length: 2.5, rigidity: 0.567, flex: 0.52, castDistance: 150, durability: 82, price: 34200, icon: 'rod_18', role: '줄 끊김 방지' },
  rod_19: { id: 'rod_19', name: '블루 플래시 로드', tier: 4, power: 175, action: 0.56, length: 2.65, rigidity: 0.592, flex: 0.46, castDistance: 165, durability: 86, price: 39600, icon: 'rod_19', role: '빠른 캐스트' },
  rod_20: { id: 'rod_20', name: '골든 마스터 로드', tier: 4, power: 195, action: 0.6, length: 2.8, rigidity: 0.625, flex: 0.55, castDistance: 180, durability: 92, price: 45000, icon: 'rod_20', role: '후반 균형' },
  rod_21: { id: 'rod_21', name: '딥 다이버 로드', tier: 5, power: 220, action: 0.64, length: 3.0, rigidity: 0.667, flex: 0.58, castDistance: 200, durability: 100, price: 100000, icon: 'rod_21', featured: true, role: '심해 대형' },
  rod_22: { id: 'rod_22', name: '크리스탈 로드', tier: 5, power: 235, action: 0.7, length: 3.15, rigidity: 0.692, flex: 0.6, castDistance: 215, durability: 104, price: 137500, icon: 'rod_22', role: '희귀 조작성' },
  rod_23: { id: 'rod_23', name: '썬더 캐스트 로드', tier: 5, power: 260, action: 0.68, length: 3.35, rigidity: 0.733, flex: 0.62, castDistance: 235, durability: 108, price: 175000, icon: 'rod_23', role: '빠른 반응' },
  rod_24: { id: 'rod_24', name: '레인보우 플렉스 로드', tier: 5, power: 280, action: 0.74, length: 3.5, rigidity: 0.767, flex: 0.7, castDistance: 250, durability: 112, price: 212500, icon: 'rod_24', role: '다양한 어종' },
  rod_25: { id: 'rod_25', name: '타이탄 파워 로드', tier: 5, power: 320, action: 0.72, length: 3.7, rigidity: 0.833, flex: 0.66, castDistance: 270, durability: 120, price: 250000, icon: 'rod_25', role: '특대 어종' },
  rod_26: { id: 'rod_26', name: '어비스 로드', tier: 6, power: 360, action: 0.78, length: 4.0, rigidity: 0.9, flex: 0.74, castDistance: 300, durability: 130, price: 500000, icon: 'rod_26', featured: true, role: '심해 보스' },
  rod_27: { id: 'rod_27', name: '드래곤 본 로드', tier: 6, power: 400, action: 0.82, length: 4.2, rigidity: 0.967, flex: 0.78, castDistance: 320, durability: 138, price: 687500, icon: 'rod_27', role: '보스 저항' },
  rod_28: { id: 'rod_28', name: '오션 터미널 로드', tier: 6, power: 445, action: 0.86, length: 4.5, rigidity: 1.0, flex: 0.82, castDistance: 350, durability: 146, price: 875000, icon: 'rod_28', role: '최종 대형' },
  rod_29: { id: 'rod_29', name: '킹스 캐스팅 로드', tier: 6, power: 500, action: 0.9, length: 4.8, rigidity: 1.0, flex: 0.88, castDistance: 380, durability: 155, price: 1062500, icon: 'rod_29', role: '최고급 캐스팅' },
  rod_30: { id: 'rod_30', name: '레전더리 오션 로드', tier: 6, power: 580, action: 0.96, length: 5.2, rigidity: 1.0, flex: 0.95, castDistance: 420, durability: 170, price: 1250000, icon: 'rod_30', role: '최종 보스용' },
};

// ─── 릴 (Reel) — 30종 ───
/**
 * 디자인 출처: 릴 설계 Google Doc.
 *
 * @typedef {Object} ReelSpec
 * @property {string}  id
 * @property {string}  name
 * @property {ItemTier} tier
 * @property {number}  power       Reel Power (doc 원본, 신규)
 * @property {number}  drag        Drag/115 (0~1, 텐션 흔들림 흡수율)
 * @property {number}  reelSpeed   200 + ReelSpeed% × 10 (px/sec, hook 끌어올림 속도)
 * @property {number}  gearRatio   3.0 + Lv × 0.15 (기어비)
 * @property {number}  stability   Control/100 (0~1, 스파이크 감쇠)
 * @property {number}  lineCap     줄 수용량 (m, Lv 기반 추정)
 * @property {number}  durability  사용 횟수
 * @property {number}  price
 * @property {string}  icon
 * @property {boolean} [featured]
 * @property {string}  role
 */
export const ITEM_REELS = {
  reel_01: { id: 'reel_01', name: '낡은 손잡이 릴', tier: 1, power: 10, drag: 0.043, reelSpeed: 250, gearRatio: 3.15, stability: 0.08, lineCap: 113, durability: 20, price: 100, icon: 'reel_01', featured: true, role: '튜토리얼 기본' },
  reel_02: { id: 'reel_02', name: '나무 손잡이 릴', tier: 1, power: 14, drag: 0.052, reelSpeed: 260, gearRatio: 3.3, stability: 0.1, lineCap: 146, durability: 22, price: 100, icon: 'reel_02', role: '초반 소형 어종' },
  reel_03: { id: 'reel_03', name: '기본 스풀 릴', tier: 1, power: 18, drag: 0.07, reelSpeed: 280, gearRatio: 3.45, stability: 0.12, lineCap: 179, durability: 24, price: 150, icon: 'reel_03', role: '기본 감기' },
  reel_04: { id: 'reel_04', name: '연안 낚시 릴', tier: 1, power: 22, drag: 0.087, reelSpeed: 290, gearRatio: 3.6, stability: 0.14, lineCap: 212, durability: 26, price: 200, icon: 'reel_04', role: '얕은 바다' },
  reel_05: { id: 'reel_05', name: '스틸 베이직 릴', tier: 2, power: 27, drag: 0.104, reelSpeed: 300, gearRatio: 3.75, stability: 0.16, lineCap: 245, durability: 28, price: 500, icon: 'reel_05', featured: true, role: '중형 진입' },
  reel_06: { id: 'reel_06', name: '라이트 스피닝 릴', tier: 2, power: 32, drag: 0.122, reelSpeed: 320, gearRatio: 3.9, stability: 0.18, lineCap: 278, durability: 30, price: 700, icon: 'reel_06', role: '빠른 감기 입문' },
  reel_07: { id: 'reel_07', name: '블루 스풀 릴', tier: 2, power: 38, drag: 0.139, reelSpeed: 330, gearRatio: 4.05, stability: 0.2, lineCap: 311, durability: 32, price: 950, icon: 'reel_07', role: '범용 초중반' },
  reel_08: { id: 'reel_08', name: '더블 핸들 릴', tier: 2, power: 44, drag: 0.157, reelSpeed: 350, gearRatio: 4.2, stability: 0.24, lineCap: 344, durability: 34, price: 1200, icon: 'reel_08', role: '조작성 강화' },
  reel_09: { id: 'reel_09', name: '코스트 라인 릴', tier: 3, power: 50, drag: 0.174, reelSpeed: 360, gearRatio: 4.35, stability: 0.26, lineCap: 377, durability: 36, price: 2800, icon: 'reel_09', featured: true, role: '연안 중형' },
  reel_10: { id: 'reel_10', name: '골드 스피닝 릴', tier: 3, power: 58, drag: 0.2, reelSpeed: 380, gearRatio: 4.5, stability: 0.28, lineCap: 410, durability: 40, price: 3650, icon: 'reel_10', role: '초반 희귀' },
  reel_11: { id: 'reel_11', name: '파워 스풀 릴', tier: 3, power: 68, drag: 0.226, reelSpeed: 380, gearRatio: 4.65, stability: 0.3, lineCap: 443, durability: 42, price: 4500, icon: 'reel_11', role: '중형 안정' },
  reel_12: { id: 'reel_12', name: '실버 드래그 릴', tier: 3, power: 78, drag: 0.261, reelSpeed: 400, gearRatio: 4.8, stability: 0.32, lineCap: 476, durability: 44, price: 5300, icon: 'reel_12', role: '드래그 강화' },
  reel_13: { id: 'reel_13', name: '블루 웨이브 릴', tier: 3, power: 88, drag: 0.278, reelSpeed: 410, gearRatio: 4.95, stability: 0.35, lineCap: 509, durability: 46, price: 6150, icon: 'reel_13', role: '바다 범용' },
  reel_14: { id: 'reel_14', name: '터보 핸들 릴', tier: 3, power: 98, drag: 0.296, reelSpeed: 430, gearRatio: 5.1, stability: 0.34, lineCap: 542, durability: 48, price: 7000, icon: 'reel_14', role: '빠른 감기' },
  reel_15: { id: 'reel_15', name: '딥 스피닝 릴', tier: 4, power: 110, drag: 0.33, reelSpeed: 440, gearRatio: 5.25, stability: 0.38, lineCap: 575, durability: 50, price: 14400, icon: 'reel_15', featured: true, role: '깊은 수심 입문' },
  reel_16: { id: 'reel_16', name: '레드 파워 릴', tier: 4, power: 124, drag: 0.348, reelSpeed: 460, gearRatio: 5.4, stability: 0.4, lineCap: 608, durability: 52, price: 18700, icon: 'reel_16', role: '대형 입문' },
  reel_17: { id: 'reel_17', name: '하이 토크 릴', tier: 4, power: 140, drag: 0.383, reelSpeed: 470, gearRatio: 5.55, stability: 0.42, lineCap: 641, durability: 54, price: 23050, icon: 'reel_17', role: '힘 중심' },
  reel_18: { id: 'reel_18', name: '스테디 컨트롤 릴', tier: 4, power: 152, drag: 0.4, reelSpeed: 480, gearRatio: 5.7, stability: 0.5, lineCap: 674, durability: 56, price: 27350, icon: 'reel_18', role: '텐션 안정' },
  reel_19: { id: 'reel_19', name: '블루 플래시 릴', tier: 4, power: 168, drag: 0.417, reelSpeed: 500, gearRatio: 5.85, stability: 0.46, lineCap: 707, durability: 58, price: 31700, icon: 'reel_19', role: '빠른 회수' },
  reel_20: { id: 'reel_20', name: '골든 드래그 릴', tier: 4, power: 185, drag: 0.478, reelSpeed: 520, gearRatio: 6.0, stability: 0.5, lineCap: 740, durability: 60, price: 36000, icon: 'reel_20', role: '고급 균형' },
  reel_21: { id: 'reel_21', name: '딥 다이버 릴', tier: 5, power: 205, drag: 0.522, reelSpeed: 520, gearRatio: 6.15, stability: 0.54, lineCap: 773, durability: 64, price: 80000, icon: 'reel_21', featured: true, role: '심해 대형' },
  reel_22: { id: 'reel_22', name: '크리스탈 스풀 릴', tier: 5, power: 225, drag: 0.557, reelSpeed: 540, gearRatio: 6.3, stability: 0.58, lineCap: 806, durability: 66, price: 110000, icon: 'reel_22', role: '희귀 안정' },
  reel_23: { id: 'reel_23', name: '썬더 토크 릴', tier: 5, power: 248, drag: 0.591, reelSpeed: 550, gearRatio: 6.45, stability: 0.6, lineCap: 839, durability: 68, price: 140000, icon: 'reel_23', role: '강한 저항' },
  reel_24: { id: 'reel_24', name: '레인보우 기어 릴', tier: 5, power: 272, drag: 0.626, reelSpeed: 560, gearRatio: 6.6, stability: 0.64, lineCap: 872, durability: 70, price: 170000, icon: 'reel_24', role: '다양한 어종' },
  reel_25: { id: 'reel_25', name: '타이탄 베어링 릴', tier: 5, power: 300, drag: 0.678, reelSpeed: 580, gearRatio: 6.75, stability: 0.68, lineCap: 905, durability: 74, price: 200000, icon: 'reel_25', role: '특대 어종' },
  reel_26: { id: 'reel_26', name: '어비스 드래그 릴', tier: 6, power: 335, drag: 0.739, reelSpeed: 590, gearRatio: 6.9, stability: 0.72, lineCap: 938, durability: 78, price: 400000, icon: 'reel_26', featured: true, role: '심해 보스' },
  reel_27: { id: 'reel_27', name: '드래곤 코어 릴', tier: 6, power: 370, drag: 0.8, reelSpeed: 600, gearRatio: 7.05, stability: 0.76, lineCap: 971, durability: 82, price: 550000, icon: 'reel_27', role: '보스 저항' },
  reel_28: { id: 'reel_28', name: '오션 터빈 릴', tier: 6, power: 410, drag: 0.852, reelSpeed: 620, gearRatio: 7.2, stability: 0.8, lineCap: 1004, durability: 86, price: 700000, icon: 'reel_28', role: '고속+강도' },
  reel_29: { id: 'reel_29', name: '킹스 토크 릴', tier: 6, power: 455, drag: 0.913, reelSpeed: 640, gearRatio: 7.35, stability: 0.84, lineCap: 1037, durability: 90, price: 850000, icon: 'reel_29', role: '최종 대형' },
  reel_30: { id: 'reel_30', name: '레전더리 크라운 릴', tier: 6, power: 500, drag: 1.0, reelSpeed: 660, gearRatio: 7.5, stability: 0.9, lineCap: 1070, durability: 100, price: 1000000, icon: 'reel_30', role: '최종 보스용' },
};

// ─── 낚시줄 (Line) — 30종 ───
/**
 * 디자인 출처: 낚시줄 설계 Google Doc.
 *
 * @typedef {Object} LineSpec
 * @property {string}  id
 * @property {string}  name
 * @property {ItemTier} tier
 * @property {number}  strength    절단 임계 (kg, 텐션 한계) — Hook.js
 * @property {number}  depthLimit  최대 낚시 가능 수심 (m) — FishingScene.depthRatio
 * @property {number}  visibility  Visibility/100 (0~1, 어종 경계도)
 * @property {number}  stretch     Stretch/100 (0~1, 텐션 스파이크 완충)
 * @property {number}  durability
 * @property {number}  price
 * @property {string}  icon
 * @property {boolean} [featured]
 * @property {string}  role
 */
export const ITEM_LINES = {
  line_01: { id: 'line_01', name: '면실', tier: 1, strength: 5, depthLimit: 30, visibility: 0.90, stretch: 0.25, durability: 20, price: 50, icon: 'line_01', featured: true, role: '튜토리얼 기본' },
  line_02: { id: 'line_02', name: '꼬임 면줄', tier: 1, strength: 7, depthLimit: 35, visibility: 0.88, stretch: 0.28, durability: 24, price: 50, icon: 'line_02', role: '초반 보조' },
  line_03: { id: 'line_03', name: '얇은 나일론줄', tier: 1, strength: 9, depthLimit: 40, visibility: 0.82, stretch: 0.30, durability: 26, price: 100, icon: 'line_03', role: '초반 범용' },
  line_04: { id: 'line_04', name: '초록 코팅줄', tier: 1, strength: 11, depthLimit: 45, visibility: 0.78, stretch: 0.32, durability: 28, price: 100, icon: 'line_04', role: '초반 위장' },
  line_05: { id: 'line_05', name: '항구 낚시줄', tier: 1, strength: 14, depthLimit: 50, visibility: 0.76, stretch: 0.35, durability: 32, price: 100, icon: 'line_05', role: '항구 어종 대응' },
  line_06: { id: 'line_06', name: '나일론줄', tier: 2, strength: 18, depthLimit: 60, visibility: 0.72, stretch: 0.38, durability: 36, price: 300, icon: 'line_06', featured: true, role: '고급 입문' },
  line_07: { id: 'line_07', name: '탄성 나일론줄', tier: 2, strength: 21, depthLimit: 65, visibility: 0.74, stretch: 0.48, durability: 35, price: 400, icon: 'line_07', role: '탄성 보강' },
  line_08: { id: 'line_08', name: '클리어 라인', tier: 2, strength: 20, depthLimit: 70, visibility: 0.62, stretch: 0.36, durability: 38, price: 500, icon: 'line_08', role: '은신형' },
  line_09: { id: 'line_09', name: '블루 워터 라인', tier: 2, strength: 24, depthLimit: 75, visibility: 0.66, stretch: 0.40, durability: 42, price: 650, icon: 'line_09', role: '심해 청수' },
  line_10: { id: 'line_10', name: '더블 코팅줄', tier: 2, strength: 28, depthLimit: 80, visibility: 0.68, stretch: 0.44, durability: 48, price: 750, icon: 'line_10', role: '내구 보강' },
  line_11: { id: 'line_11', name: '카본줄', tier: 3, strength: 35, depthLimit: 90, visibility: 0.58, stretch: 0.35, durability: 50, price: 1750, icon: 'line_11', featured: true, role: '카본 입문' },
  line_12: { id: 'line_12', name: '플로로카본줄', tier: 3, strength: 38, depthLimit: 100, visibility: 0.46, stretch: 0.32, durability: 52, price: 2400, icon: 'line_12', role: '은신 카본' },
  line_13: { id: 'line_13', name: '하드 카본라인', tier: 3, strength: 45, depthLimit: 105, visibility: 0.52, stretch: 0.28, durability: 58, price: 3050, icon: 'line_13', role: '경질 카본' },
  line_14: { id: 'line_14', name: '소프트 카본라인', tier: 3, strength: 40, depthLimit: 110, visibility: 0.50, stretch: 0.45, durability: 54, price: 3700, icon: 'line_14', role: '연질 완충' },
  line_15: { id: 'line_15', name: '딥 블루 카본줄', tier: 3, strength: 50, depthLimit: 120, visibility: 0.48, stretch: 0.38, durability: 60, price: 4400, icon: 'line_15', role: '심해 카본' },
  line_16: { id: 'line_16', name: 'PE 합사', tier: 4, strength: 65, depthLimit: 130, visibility: 0.60, stretch: 0.24, durability: 64, price: 9000, icon: 'line_16', featured: true, role: '합사 입문' },
  line_17: { id: 'line_17', name: '4합사 브레이드', tier: 4, strength: 72, depthLimit: 140, visibility: 0.58, stretch: 0.26, durability: 68, price: 12400, icon: 'line_17', role: '4합 표준' },
  line_18: { id: 'line_18', name: '8합사 브레이드', tier: 4, strength: 85, depthLimit: 150, visibility: 0.54, stretch: 0.30, durability: 72, price: 15750, icon: 'line_18', role: '8합 강화' },
  line_19: { id: 'line_19', name: '스텔스 합사', tier: 4, strength: 80, depthLimit: 160, visibility: 0.42, stretch: 0.28, durability: 70, price: 19100, icon: 'line_19', role: '은신 합사' },
  line_20: { id: 'line_20', name: '파워 브레이드', tier: 4, strength: 100, depthLimit: 170, visibility: 0.56, stretch: 0.25, durability: 78, price: 22500, icon: 'line_20', role: '고강도 합사' },
  line_21: { id: 'line_21', name: '다이니마 합사', tier: 5, strength: 125, depthLimit: 190, visibility: 0.50, stretch: 0.32, durability: 84, price: 50000, icon: 'line_21', featured: true, role: '레전드 입문' },
  line_22: { id: 'line_22', name: '실버 다이니마', tier: 5, strength: 135, depthLimit: 200, visibility: 0.44, stretch: 0.34, durability: 88, price: 68750, icon: 'line_22', role: '실버 광택' },
  line_23: { id: 'line_23', name: '울트라 씬 라인', tier: 5, strength: 120, depthLimit: 210, visibility: 0.30, stretch: 0.30, durability: 76, price: 87500, icon: 'line_23', role: '초은신' },
  line_24: { id: 'line_24', name: '헤비 딥 라인', tier: 5, strength: 155, depthLimit: 240, visibility: 0.48, stretch: 0.28, durability: 92, price: 106250, icon: 'line_24', role: '심해 헤비' },
  line_25: { id: 'line_25', name: '타이탄 코어 라인', tier: 5, strength: 180, depthLimit: 260, visibility: 0.52, stretch: 0.35, durability: 100, price: 125000, icon: 'line_25', role: '타이탄 코어' },
  line_26: { id: 'line_26', name: '미스릴 라인', tier: 6, strength: 220, depthLimit: 300, visibility: 0.38, stretch: 0.42, durability: 110, price: 250000, icon: 'line_26', featured: true, role: '신화 입문' },
  line_27: { id: 'line_27', name: '크리스탈 라인', tier: 6, strength: 200, depthLimit: 320, visibility: 0.22, stretch: 0.36, durability: 105, price: 343750, icon: 'line_27', role: '극은신' },
  line_28: { id: 'line_28', name: '드래곤 텐션 라인', tier: 6, strength: 260, depthLimit: 340, visibility: 0.42, stretch: 0.60, durability: 115, price: 437500, icon: 'line_28', role: '고탄성' },
  line_29: { id: 'line_29', name: '어비스 체인 라인', tier: 6, strength: 300, depthLimit: 400, visibility: 0.46, stretch: 0.45, durability: 130, price: 531250, icon: 'line_29', role: '심해 보스용' },
  line_30: { id: 'line_30', name: '오션 킹 라인', tier: 6, strength: 360, depthLimit: 500, visibility: 0.34, stretch: 0.55, durability: 150, price: 625000, icon: 'line_30', role: '최종 보스용' },
};

// ─── 미끼 카테고리 (어종 ↔ 미끼 매칭 그룹) ───
//   어종 정의(FISH_COMBAT_BY_ID)의 baitCategory 와 1:1 대응.
export const BAIT_CATEGORIES = /** @type {const} */ ({
  small_reef:     'small_reef',      // 작은 산호초 어종 (clown, angel 등)
  reef:           'reef',            // 중간 산호초 어종 (rockfish, blue_tang 등)
  large_reef:     'large_reef',      // 큰 산호초 어종 (parrotfish)
  surface:        'surface',         // 수면 어종 (half_beak)
  pelagic:        'pelagic',         // 회유 어종 (horse_mackerel)
  bottom:         'bottom',          // 저서 어종 (rockfish, filefish)
  large_pelagic:  'large_pelagic',   // 대형 회유 (shark)
});

// ─── 미끼/루어 통합 카탈로그 (Bait & Lure) — 30종 ───
/**
 * 디자인 출처: 미끼 설계 Google Doc.
 *   Lv 1-10 = 생미끼(live), Lv 11-30 = 루어(lure, durability: Infinity).
 *
 * @typedef {Object} BaitSpec
 * @property {string}  id
 * @property {string}  name
 * @property {'live' | 'lure'} type
 * @property {ItemTier} tier
 * @property {number}  attraction         doc Attraction (10~320, 어종 유인 강도)
 * @property {string[] | '__all__'} targetSpecies
 * @property {string[]} targetCategories
 * @property {number}  biteBonus          doc Bite Speed/100 (입질 확률)
 * @property {number}  bigFishBonus       doc Rare Chance/100 (대형/희귀 어종 매칭)
 * @property {number}  duration           유효 시간 (sec, Lv 기반)
 * @property {number}  defaultStock       지급 수량 (live=많음, lure=적음)
 * @property {number | typeof Infinity} durability
 * @property {string}  targetSize         doc Target Size (소형/중형/대형/특대/보스)
 * @property {number}  price
 * @property {string}  icon
 * @property {boolean} [featured]
 * @property {string}  role
 */
export const ITEM_BAITS = {
  bait_01: { id: 'bait_01', name: '빵가루 미끼', type: 'live', tier: 1, attraction: 10, targetSpecies: [], targetCategories: ['small_reef'], biteBonus: 0.05, bigFishBonus: 0.0, duration: 21, defaultStock: 22, durability: 20, targetSize: '소형', price: 0, icon: 'bait_01', featured: true, role: '튜토리얼 기본' },
  bait_02: { id: 'bait_02', name: '작은 새우 미끼', type: 'live', tier: 1, attraction: 14, targetSpecies: [], targetCategories: ['small_reef'], biteBonus: 0.06, bigFishBonus: 0.01, duration: 22, defaultStock: 21, durability: 22, targetSize: '소형', price: 0, icon: 'bait_02', role: '초반 소형' },
  bait_03: { id: 'bait_03', name: '지렁이 미끼', type: 'live', tier: 1, attraction: 18, targetSpecies: [], targetCategories: ['small_reef'], biteBonus: 0.08, bigFishBonus: 0.01, duration: 23, defaultStock: 21, durability: 24, targetSize: '소형', price: 0, icon: 'bait_03', role: '기본 입질' },
  bait_04: { id: 'bait_04', name: '조개살 미끼', type: 'live', tier: 1, attraction: 22, targetSpecies: [], targetCategories: ['small_reef','reef'], biteBonus: 0.09, bigFishBonus: 0.02, duration: 24, defaultStock: 20, durability: 26, targetSize: '소형~중형', price: 0, icon: 'bait_04', role: '연안 어종' },
  bait_05: { id: 'bait_05', name: '오징어 조각', type: 'live', tier: 2, attraction: 26, targetSpecies: [], targetCategories: ['reef'], biteBonus: 0.10, bigFishBonus: 0.03, duration: 25, defaultStock: 20, durability: 28, targetSize: '중형', price: 50, icon: 'bait_05', featured: true, role: '중형 진입' },
  bait_06: { id: 'bait_06', name: '크릴 미끼', type: 'live', tier: 2, attraction: 30, targetSpecies: [], targetCategories: ['reef'], biteBonus: 0.12, bigFishBonus: 0.04, duration: 26, defaultStock: 19, durability: 30, targetSize: '중형', price: 100, icon: 'bait_06', role: '범용 미끼' },
  bait_07: { id: 'bait_07', name: '반짝이 새우 미끼', type: 'live', tier: 2, attraction: 34, targetSpecies: [], targetCategories: ['reef'], biteBonus: 0.13, bigFishBonus: 0.05, duration: 27, defaultStock: 19, durability: 32, targetSize: '중형', price: 100, icon: 'bait_07', role: '희귀 소형' },
  bait_08: { id: 'bait_08', name: '향기 나는 떡밥', type: 'live', tier: 2, attraction: 38, targetSpecies: [], targetCategories: ['small_reef','reef'], biteBonus: 0.15, bigFishBonus: 0.05, duration: 28, defaultStock: 18, durability: 34, targetSize: '소형~중형', price: 150, icon: 'bait_08', role: '빠른 반복' },
  bait_09: { id: 'bait_09', name: '붉은 갯지렁이', type: 'live', tier: 3, attraction: 42, targetSpecies: [], targetCategories: ['reef','surface','pelagic'], biteBonus: 0.16, bigFishBonus: 0.06, duration: 29, defaultStock: 18, durability: 36, targetSize: '중형', price: 350, icon: 'bait_09', featured: true, role: '입질 속도' },
  bait_10: { id: 'bait_10', name: '황금 새우 미끼', type: 'live', tier: 3, attraction: 48, targetSpecies: [], targetCategories: ['reef'], biteBonus: 0.18, bigFishBonus: 0.08, duration: 30, defaultStock: 17, durability: 40, targetSize: '중형', price: 450, icon: 'bait_10', role: '초반 희귀' },
  bait_11: { id: 'bait_11', name: '작은 스푼 루어', type: 'lure', tier: 3, attraction: 54, targetSpecies: [], targetCategories: ['reef'], biteBonus: 0.18, bigFishBonus: 0.08, duration: 31, defaultStock: 17, durability: Infinity, targetSize: '중형', price: 550, icon: 'bait_11', role: '루어 입문' },
  bait_12: { id: 'bait_12', name: '은빛 미노우 루어', type: 'lure', tier: 3, attraction: 60, targetSpecies: [], targetCategories: ['reef'], biteBonus: 0.20, bigFishBonus: 0.09, duration: 32, defaultStock: 16, durability: Infinity, targetSize: '중형', price: 650, icon: 'bait_12', role: '빠른 어종' },
  bait_13: { id: 'bait_13', name: '파란 미노우 루어', type: 'lure', tier: 3, attraction: 66, targetSpecies: [], targetCategories: ['reef','large_reef','pelagic'], biteBonus: 0.21, bigFishBonus: 0.10, duration: 33, defaultStock: 16, durability: Infinity, targetSize: '중형~대형', price: 750, icon: 'bait_13', role: '푸른 바다' },
  bait_14: { id: 'bait_14', name: '진동 스피너', type: 'lure', tier: 3, attraction: 72, targetSpecies: [], targetCategories: ['reef','large_reef','pelagic'], biteBonus: 0.23, bigFishBonus: 0.10, duration: 34, defaultStock: 15, durability: Infinity, targetSize: '중형~대형', price: 900, icon: 'bait_14', role: '활동성 어종' },
  bait_15: { id: 'bait_15', name: '야광 웜 루어', type: 'lure', tier: 4, attraction: 80, targetSpecies: [], targetCategories: ['reef','large_reef','pelagic','bottom'], biteBonus: 0.24, bigFishBonus: 0.12, duration: 35, defaultStock: 15, durability: Infinity, targetSize: '중형~대형', price: 1800, icon: 'bait_15', featured: true, role: '어두운 수심' },
  bait_16: { id: 'bait_16', name: '레드 헤드 미노우', type: 'lure', tier: 4, attraction: 88, targetSpecies: [], targetCategories: ['large_reef','pelagic','bottom'], biteBonus: 0.26, bigFishBonus: 0.13, duration: 36, defaultStock: 14, durability: Infinity, targetSize: '대형', price: 2350, icon: 'bait_16', role: '공격성 어종' },
  bait_17: { id: 'bait_17', name: '글로우 스푼 루어', type: 'lure', tier: 4, attraction: 96, targetSpecies: [], targetCategories: ['large_reef','pelagic','bottom'], biteBonus: 0.27, bigFishBonus: 0.14, duration: 37, defaultStock: 14, durability: Infinity, targetSize: '대형', price: 2900, icon: 'bait_17', role: '야간/심해' },
  bait_18: { id: 'bait_18', name: '트윈 훅 루어', type: 'lure', tier: 4, attraction: 104, targetSpecies: [], targetCategories: ['large_reef','pelagic','bottom'], biteBonus: 0.28, bigFishBonus: 0.15, duration: 38, defaultStock: 13, durability: Infinity, targetSize: '대형', price: 3400, icon: 'bait_18', role: '포획 안정' },
  bait_19: { id: 'bait_19', name: '블루 플래시 루어', type: 'lure', tier: 4, attraction: 112, targetSpecies: [], targetCategories: ['large_reef','pelagic','bottom'], biteBonus: 0.30, bigFishBonus: 0.16, duration: 39, defaultStock: 13, durability: Infinity, targetSize: '대형', price: 3950, icon: 'bait_19', role: '빠른 대형' },
  bait_20: { id: 'bait_20', name: '골든 스피너', type: 'lure', tier: 4, attraction: 122, targetSpecies: [], targetCategories: ['large_reef','pelagic','bottom'], biteBonus: 0.32, bigFishBonus: 0.18, duration: 40, defaultStock: 12, durability: Infinity, targetSize: '대형', price: 4500, icon: 'bait_20', role: '희귀 대응' },
  bait_21: { id: 'bait_21', name: '딥 다이버 루어', type: 'lure', tier: 5, attraction: 135, targetSpecies: [], targetCategories: ['large_reef','large_pelagic'], biteBonus: 0.32, bigFishBonus: 0.19, duration: 41, defaultStock: 12, durability: Infinity, targetSize: '대형~특대', price: 10000, icon: 'bait_21', featured: true, role: '깊은 수심' },
  bait_22: { id: 'bait_22', name: '크리스탈 미노우', type: 'lure', tier: 5, attraction: 148, targetSpecies: [], targetCategories: ['large_reef','large_pelagic'], biteBonus: 0.34, bigFishBonus: 0.21, duration: 42, defaultStock: 11, durability: Infinity, targetSize: '대형~특대', price: 13750, icon: 'bait_22', role: '투명 희귀어' },
  bait_23: { id: 'bait_23', name: '전기 스파크 루어', type: 'lure', tier: 5, attraction: 162, targetSpecies: [], targetCategories: ['large_pelagic'], biteBonus: 0.35, bigFishBonus: 0.22, duration: 43, defaultStock: 11, durability: Infinity, targetSize: '특대', price: 17500, icon: 'bait_23', role: '반응 빠른 어종' },
  bait_24: { id: 'bait_24', name: '레인보우 웜', type: 'lure', tier: 5, attraction: 176, targetSpecies: [], targetCategories: ['large_pelagic'], biteBonus: 0.36, bigFishBonus: 0.24, duration: 44, defaultStock: 10, durability: Infinity, targetSize: '특대', price: 21250, icon: 'bait_24', role: '다양 어종' },
  bait_25: { id: 'bait_25', name: '타이탄 메탈 루어', type: 'lure', tier: 5, attraction: 192, targetSpecies: [], targetCategories: ['large_pelagic'], biteBonus: 0.38, bigFishBonus: 0.25, duration: 45, defaultStock: 10, durability: Infinity, targetSize: '특대', price: 25000, icon: 'bait_25', role: '고중량 어종' },
  bait_26: { id: 'bait_26', name: '심해 야광 루어', type: 'lure', tier: 6, attraction: 210, targetSpecies: [], targetCategories: ['large_pelagic'], biteBonus: 0.39, bigFishBonus: 0.27, duration: 46, defaultStock: 9, durability: Infinity, targetSize: '특대~보스', price: 50000, icon: 'bait_26', featured: true, role: '심해 보스' },
  bait_27: { id: 'bait_27', name: '드래곤 피시 루어', type: 'lure', tier: 6, attraction: 230, targetSpecies: '__all__', targetCategories: [], biteBonus: 0.40, bigFishBonus: 0.29, duration: 47, defaultStock: 9, durability: Infinity, targetSize: '보스', price: 68750, icon: 'bait_27', role: '공격 보스' },
  bait_28: { id: 'bait_28', name: '어비스 코어 루어', type: 'lure', tier: 6, attraction: 255, targetSpecies: '__all__', targetCategories: [], biteBonus: 0.42, bigFishBonus: 0.31, duration: 48, defaultStock: 8, durability: Infinity, targetSize: '보스', price: 87500, icon: 'bait_28', role: '심해 희귀 보스' },
  bait_29: { id: 'bait_29', name: '오션 킹 루어', type: 'lure', tier: 6, attraction: 285, targetSpecies: '__all__', targetCategories: [], biteBonus: 0.44, bigFishBonus: 0.34, duration: 49, defaultStock: 8, durability: Infinity, targetSize: '보스', price: 106250, icon: 'bait_29', role: '최종 대형' },
  bait_30: { id: 'bait_30', name: '레전더리 트레저 루어', type: 'lure', tier: 6, attraction: 320, targetSpecies: '__all__', targetCategories: [], biteBonus: 0.46, bigFishBonus: 0.38, duration: 50, defaultStock: 7, durability: Infinity, targetSize: '보스/전설', price: 125000, icon: 'bait_30', role: '전설/이벤트' },
};

// ─── 레거시 ID 별칭 — 기존 코드 호환 (fish.config.js preferredBaits / recipes.config.js) ───
//   기존 ID 를 새 30종 중 의미상 가장 근접한 항목에 매핑.
ITEM_BAITS.bait_shrimp  = { ...ITEM_BAITS.bait_02, id: 'bait_shrimp',  legacy: true };
ITEM_BAITS.bait_worm    = { ...ITEM_BAITS.bait_03, id: 'bait_worm',    legacy: true };
ITEM_BAITS.bait_crab    = { ...ITEM_BAITS.bait_09, id: 'bait_crab',    legacy: true };
ITEM_BAITS.bait_squid   = { ...ITEM_BAITS.bait_05, id: 'bait_squid',   legacy: true };
ITEM_BAITS.bait_herring = { ...ITEM_BAITS.bait_25, id: 'bait_herring', legacy: true };
ITEM_BAITS.bait_pearl   = { ...ITEM_BAITS.bait_30, id: 'bait_pearl',   legacy: true };

// ─── 루어 (Artificial Lure) — 재사용 ───
/**
 * @typedef {Object} LureSpec
 * @property {string}  id
 * @property {string}  name
 * @property {'lure'}  type
 * @property {string[] | '__all__' | '__random__'} targetSpecies
 * @property {string[]} targetCategories
 * @property {number}  biteBonus
 * @property {number}  bigFishBonus
 * @property {number}  durability   Infinity (재사용)
 * @property {number}  price
 * @property {ItemTier} tier
 */
export const ITEM_LURES = {
  lure_spoon_mini: {
    id: 'lure_spoon_mini', name: '미니 스푼', type: 'lure', tier: 2,
    targetSpecies: ['clownfish', 'angelfish', 'moorishidol', 'yellow_tang', 'lion_fish'],
    targetCategories: ['small_reef', 'reef'],
    biteBonus: 0.15, bigFishBonus: 0,
    durability: Infinity, price: 2000,
  },
  lure_jig_metal: {
    id: 'lure_jig_metal', name: '메탈 지그', type: 'lure', tier: 3,
    targetSpecies: ['horse_mackerel', 'half_beak', 'blue_damselfish', 'blue_tang'],
    targetCategories: ['pelagic', 'surface'],
    biteBonus: 0.25, bigFishBonus: 0.10,
    durability: Infinity, price: 8000,
  },
  lure_popper: {
    id: 'lure_popper', name: '슈퍼 포퍼', type: 'lure', tier: 4,
    targetSpecies: ['parrotfish', 'porcupinefish', 'rockfish', 'filefish'],
    targetCategories: ['reef', 'large_reef'],
    biteBonus: 0.30, bigFishBonus: 0.20,
    durability: Infinity, price: 30000,
  },
  lure_live_mimic: {
    id: 'lure_live_mimic', name: '라이브 베이트 모방', type: 'lure', tier: 5,
    targetSpecies: '__random__',
    targetCategories: [],
    biteBonus: 0.50, bigFishBonus: 0.30,
    durability: Infinity, price: 100000,
  },
  lure_golden: {
    id: 'lure_golden', name: '골든 루어', type: 'lure', tier: 6,
    targetSpecies: '__all__',
    targetCategories: [],
    biteBonus: 0.35, bigFishBonus: 0.40,
    durability: Infinity, price: 500000,
  },
};

// ─── 기본 시작 장비 ID ───
//   신규 유저 / 데이터 누락 시 폴백 — 30종 카탈로그의 Lv 1 (튜토리얼) 장비.
export const DEFAULT_ITEM_IDS = {
  rod:  'rod_01',
  reel: 'reel_01',
  line: 'line_01',
  bait: 'bait_01',
  lure: null,                 // 시작 시 루어 미보유 (bait 만)
};

// ─── 조회 헬퍼 ───

/** @param {string} id @returns {RodSpec | undefined} */
export function getRodSpec(id) {
  return ITEM_RODS[id];
}
/** @param {string} id @returns {ReelSpec | undefined} */
export function getReelSpec(id) {
  return ITEM_REELS[id];
}
/** @param {string} id @returns {LineSpec | undefined} */
export function getLineSpec(id) {
  return ITEM_LINES[id];
}
/** @param {string} id @returns {BaitSpec | undefined} */
export function getBaitSpec(id) {
  return ITEM_BAITS[id];
}
/** @param {string} id @returns {LureSpec | undefined} */
export function getLureSpec(id) {
  return ITEM_LURES[id];
}

/**
 * 미끼 또는 루어가 특정 어종을 잡을 수 있는지 판정.
 *   targetSpecies 직접 매칭 or targetCategories(어종 baitCategory) 매칭.
 *   '__all__' 면 무조건 true. '__random__' 은 호출 측에서 별도 처리.
 *
 * @param {BaitSpec | LureSpec | undefined | null} bait
 * @param {string} fishId
 * @param {string} [fishBaitCategory]
 * @returns {boolean}
 */
export function baitAttractsFish(bait, fishId, fishBaitCategory) {
  if (!bait) return false;
  const ts = bait.targetSpecies;
  if (ts === '__all__') return true;
  if (ts === '__random__') return true;   // 호출 측이 random 선택 처리
  if (Array.isArray(ts) && ts.includes(fishId)) return true;
  if (fishBaitCategory && Array.isArray(bait.targetCategories)
      && bait.targetCategories.includes(fishBaitCategory)) {
    return true;
  }
  return false;
}

/**
 * 시너지 — 같은 티어 풀세트면 catch 점수 보너스.
 *   rod/reel/line 모두 동일 티어 → +20% (T6 풀세트는 +50%).
 *
 * @param {RodSpec | undefined | null} rod
 * @param {ReelSpec | undefined | null} reel
 * @param {LineSpec | undefined | null} line
 * @returns {number} 점수 곱연산 (1.0 = 보너스 없음)
 */
export function getSetBonusMultiplier(rod, reel, line) {
  if (!rod || !reel || !line) return 1.0;
  if (rod.tier !== reel.tier || reel.tier !== line.tier) return 1.0;
  if (rod.tier === 6) return 1.5;
  return 1.2;
}

/**
 * 매칭 안전성 검사 — line.strength 가 rod.power × 1.5 이상이면 안전.
 *   미스매치 시 텐션 위험 ↑.
 *
 * @returns {'safe' | 'risky' | 'mismatch'}
 */
export function checkLineRodMatch(rod, line) {
  if (!rod || !line) return 'mismatch';
  if (line.strength >= rod.power * 1.5) return 'safe';
  if (line.strength >= rod.power) return 'risky';
  return 'mismatch';
}
