/**
 * 어종 정의 — 깊이대 × 희귀도 × 점수 × 실제 크기.
 *
 * 정책:
 *   - 어종마다 고유 sprite 시트가 있어야 등록 (시각적 혼란 방지).
 *   - 동일 시트를 공유하는 종 ≤ 2 (예: bluetang 은 blue_tang + blue_damselfish 가 사용 →
 *     같은 외형(파랑 리프어)·이름표만 다른 두 등급 버전. 스프라이트=실제 그림과 일치).
 *   - clownfish 시트는 1 종만 사용. 과거 fallback 으로 쓰던 sardine/snapper/tuna/
 *     golden_fish 는 외형이 모두 흰동가리로 보여 혼란 → 제거.
 *
 * 사이즈 정책: realLengthCm 기반 자동 산출 (deriveSize, sqrt 압축).
 *   8cm → 40 px, 400cm → 180 px. 그 사이 sqrt 보간 (~4 배 격차 유지).
 *
 * 깊이 정책:
 *   - 모든 어종이 나무 데크 윗가장자리(y≈778) 위에서 헤엄.
 *   - depthMax ≤ 770 으로 제한.
 *   - 대형 어종 (ignoresHook=true) 은 훅 최대 깊이(690) 보다 아래에서 유유히.
 *
 * ignoresHook : true → 훅에 절대 반응하지 않음 (감상용 대형 어종).
 */

const CLOWN_SPRITE = 'sprite_clownfish';
const CLOWN_ANIM   = 'clownfish_swim';
const BLUE_SPRITE  = 'sprite_bluetang';
const BLUE_ANIM    = 'bluetang_swim';
const PORC_SPRITE  = 'sprite_porcupinefish';
const PORC_ANIM    = 'porcupinefish_swim';
const MOOR_SPRITE  = 'sprite_moorishidol';
const MOOR_ANIM    = 'moorishidol_swim';
const PARR_SPRITE  = 'sprite_parrotfish';
const PARR_ANIM    = 'parrotfish_swim';
const WSHARK_SPRITE = 'sprite_whiteshark';
const WSHARK_ANIM   = 'whiteshark_swim';
const ANGEL_SPRITE  = 'sprite_angelfish';
const ANGEL_ANIM    = 'angelfish_swim';
const YTANG_SPRITE  = 'sprite_yellowtang';
const YTANG_ANIM    = 'yellowtang_swim';
const LION_SPRITE   = 'sprite_lionfish';
const LION_ANIM     = 'lionfish_swim';
const HBEAK_SPRITE  = 'sprite_halfbeak';
const HBEAK_ANIM    = 'halfbeak_swim';
const HMACK_SPRITE  = 'sprite_horsemackerel';
const HMACK_ANIM    = 'horsemackerel_swim';
const FILE_SPRITE   = 'sprite_filefish';
const FILE_ANIM     = 'filefish_swim';
const ROCK_SPRITE   = 'sprite_rockfish';
const ROCK_ANIM     = 'rockfish_swim';
const CUTLAS_SPRITE = 'sprite_cutlasfish';
const CUTLAS_ANIM   = 'cutlasfish_swim';
const FLOUNDER_SPRITE = 'sprite_flounder';
const FLOUNDER_ANIM   = 'flounder_swim';
const MARBLED_SPRITE  = 'sprite_marbledsole';
const MARBLED_ANIM    = 'marbledsole_swim';
const MULLET_SPRITE   = 'sprite_mullet';
const MULLET_ANIM     = 'mullet_swim';
const WHITING_SPRITE  = 'sprite_whiting';
const WHITING_ANIM    = 'whiting_swim';

// ─── 표시 사이즈 자동 산출 ───
// 사용자 요청 (비례 압축): 작은 어종 → 조금 큰 쪽으로, 큰 어종 → 조금 작은 쪽으로.
//   sqrt 보간 + 선형 매핑이라 ordering(순서) 은 수학적으로 보존됨 (작은게 큰게로 바뀌지 않음).
//   범위만 좁힘으로써 시각적 균형 개선.
//
// 변경 이력:
//   초기 40~260 → ×1.3 누적(3회) → 88~572 → 압축 110~485 → 약간 확대 105~515.
//   사용자 요청: 압축 사이즈 조금 확대 (원본 88~572 와 압축 110~485 의 중간).
//   예시 (cm → px, 압축 → 확대):
//     clownfish    10cm: 117 → 113 ( -3%)  // 매우 살짝만
//     angelfish    15cm: 132 → 129 ( -2%)
//     moorishidol  20cm: 147 → 144 ( -2%)
//     rockfish     40cm: 186 → 189 ( +2%)  // 중간 거의 변화 없음
//     parrotfish   50cm: 203 → 207 ( +2%)
//     shark       380cm: 474 → 503 ( +6%)  // 큰 어종 더 크게
//   sqrt+linear 보간 → ordering(순서) 수학적 보존.
const SIZE_MIN_PX  = 105;
const SIZE_MAX_PX  = 515;
const SIZE_MIN_CM  = 8;
const SIZE_MAX_CM  = 400;
const _sMin = Math.sqrt(SIZE_MIN_CM);
const _sMax = Math.sqrt(SIZE_MAX_CM);

export function deriveSize(cm) {
  const s = Math.sqrt(Math.max(SIZE_MIN_CM, Math.min(SIZE_MAX_CM, cm)));
  const t = (s - _sMin) / (_sMax - _sMin);
  return Math.round(SIZE_MIN_PX + t * (SIZE_MAX_PX - SIZE_MIN_PX));
}

// 7 종 — 모두 어느 깊이에나 자유롭게 spawn 가능 (사용자 요청).
// depthMin/Max 는 전 화면 50-1140 으로 동일. 종별 분류 제거.
// 화면 상/중/하/데크아래 분포는 FishSpawner 의 5-band balance 가 담당.
// 레이어(z-depth)는 shark 만 6 (다른 종 뒤), 나머지 7 으로 유지.
//
// HUD-overlap (y ~ 60-180) 까지 spawn — depthMin = 50.
// 데크 아래 영역 (y ~ 740-1140) 까지 spawn — depthMax = 1140.
//   사용자 요청: 플립 / 세로 확장 모드를 위해 데크 아래도 fish 활동 공간.
//   표준 모드에서는 deck/UI 가 가려서 시각적으로는 안 보이지만 swim 영역은 할당.
const FULL_DEPTH_MIN = 50;
const FULL_DEPTH_MAX = 1140;

const RAW_SPECIES = [
  // 사용자 요청: 그레이드 시스템 — 120 / 150 / 200 / 300 / 450 / 650 / 900 ...
  //   크기 ↑ = score / HP 모두 ↑. HP = score + size 이므로 score 조정만으로 HP 비례.
  {
    id: 'clownfish', name: '흰동가리', color: 0xff7733,
    depthMin: FULL_DEPTH_MIN, depthMax: FULL_DEPTH_MAX,
    speed: 45, rarity: 0.10, score: 120,                 // G1 (최소), size ~74, HP ~194
    realLengthCm: 10,
    sprite: CLOWN_SPRITE, animKey: CLOWN_ANIM,
    maxConcurrent: 3,
  },
  {
    id: 'angelfish', name: '엔젤피쉬', color: 0xffd040,
    depthMin: FULL_DEPTH_MIN, depthMax: FULL_DEPTH_MAX,
    speed: 40, rarity: 0.18, score: 150,                 // G2, size ~83, HP ~233
    realLengthCm: 15,
    sprite: ANGEL_SPRITE, animKey: ANGEL_ANIM,
    maxConcurrent: 3,
  },
  {
    id: 'moorishidol', name: '무어리쉬아이돌', color: 0xf0c020,
    depthMin: FULL_DEPTH_MIN, depthMax: FULL_DEPTH_MAX,
    speed: 42, rarity: 0.15, score: 200,                 // G3, size ~93, HP ~293
    realLengthCm: 20,
    sprite: MOOR_SPRITE, animKey: MOOR_ANIM,
    maxConcurrent: 3,
  },
  {
    id: 'yellow_tang', name: '옐로우탱', color: 0xffd840,
    depthMin: FULL_DEPTH_MIN, depthMax: FULL_DEPTH_MAX,
    speed: 38, rarity: 0.17, score: 250,                 // G3.5 (moorishidol 200 ~ blue_tang 300 사이), size ~100, HP ~350
    realLengthCm: 22,
    sprite: YTANG_SPRITE, animKey: YTANG_ANIM,
    maxConcurrent: 2,
  },
  {
    id: 'lion_fish', name: '라이언피쉬', color: 0x40b099,
    depthMin: FULL_DEPTH_MIN, depthMax: FULL_DEPTH_MAX,
    speed: 30, rarity: 0.20, score: 370,                 // 사이즈↑ → score↑ (이전 280, blue_tang 300 약간 상회)
    realLengthCm: 35,                                    // 실제 사이즈 반영 (이전 24 → 35cm)
    sprite: LION_SPRITE, animKey: LION_ANIM,
    maxConcurrent: 2,
  },
  {
    id: 'half_beak', name: '학공치', color: 0x9bc0d0,
    depthMin: FULL_DEPTH_MIN, depthMax: FULL_DEPTH_MAX,
    speed: 50, rarity: 0.22, score: 330,                 // G4.1 (blue_tang 300 ~ blue_damselfish 450), size ~110, HP ~440
    realLengthCm: 28,                                    // 가는 몸 — 표면 darting
    sprite: HBEAK_SPRITE, animKey: HBEAK_ANIM,
    maxConcurrent: 2,
  },
  {
    id: 'horse_mackerel', name: '대전갱이', color: 0xe0b840,
    depthMin: FULL_DEPTH_MIN, depthMax: FULL_DEPTH_MAX,
    speed: 44, rarity: 0.28, score: 600,                 // 사이즈↑ → score↑ (이전 380, 대형 회유어)
    realLengthCm: 70,                                    // 실제 사이즈 반영 (이전 32 → 70cm, 50-100cm 평균)
    sprite: HMACK_SPRITE, animKey: HMACK_ANIM,
    maxConcurrent: 2,
  },
  {
    id: 'filefish', name: '쥐치', color: 0xb89060,
    depthMin: FULL_DEPTH_MIN, depthMax: FULL_DEPTH_MAX,
    speed: 26, rarity: 0.26, score: 260,                 // 사이즈↓ → score↓ (이전 420, 소형 reef)
    realLengthCm: 22,                                    // 실제 사이즈 반영 (이전 35 → 22cm, 15-25cm 평균)
    sprite: FILE_SPRITE, animKey: FILE_ANIM,
    maxConcurrent: 2,
  },
  {
    id: 'rockfish', name: '우럭', color: 0xd06030,
    depthMin: FULL_DEPTH_MIN, depthMax: FULL_DEPTH_MAX,
    speed: 22, rarity: 0.32, score: 500,                 // G5.0 (reef bottom dweller), size ~132, HP ~632
    realLengthCm: 40,
    sprite: ROCK_SPRITE, animKey: ROCK_ANIM,
    maxConcurrent: 2,
  },
  {
    id: 'blue_tang', name: '블루탱', color: 0x3f8fd6,
    depthMin: FULL_DEPTH_MIN, depthMax: FULL_DEPTH_MAX,
    speed: 38, rarity: 0.20, score: 300,                 // G4, size ~118, HP ~418
    realLengthCm: 35,
    sprite: BLUE_SPRITE, animKey: BLUE_ANIM,
    maxConcurrent: 2,
  },
  {
    id: 'blue_damselfish', name: '파랑돔', color: 0x2f6fe0,
    depthMin: FULL_DEPTH_MIN, depthMax: FULL_DEPTH_MAX,
    speed: 32, rarity: 0.40, score: 130,                 // 사이즈↓↓ → score↓↓ (이전 450, 매우 작은 reef)
    realLengthCm: 8,                                     // 실제 사이즈 반영 (이전 35 → 8cm, 5-10cm 평균 — 매우 작은 reef 어종)
    sprite: BLUE_SPRITE, animKey: BLUE_ANIM,
    maxConcurrent: 2,
  },
  {
    id: 'porcupinefish', name: '가시복', color: 0xc89860,
    depthMin: FULL_DEPTH_MIN, depthMax: FULL_DEPTH_MAX,
    speed: 28, rarity: 0.25, score: 650,                 // G6, size ~125, HP ~775
    realLengthCm: 40,
    sprite: PORC_SPRITE, animKey: PORC_ANIM,
    maxConcurrent: 2,
  },
  {
    id: 'parrotfish', name: '패럿피쉬', color: 0x2ea893,
    depthMin: FULL_DEPTH_MIN, depthMax: FULL_DEPTH_MAX,
    speed: 34, rarity: 0.30, score: 900,                 // G7 (최대 catchable), size ~140, HP ~1040
    realLengthCm: 50,
    sprite: PARR_SPRITE, animKey: PARR_ANIM,
    maxConcurrent: 2,
  },

  // ── 신규 5종 (실 어종 — 가늘고 길거나 저서) ──
  {
    id: 'cutlasfish', name: '갈치', color: 0xc0d0e0,
    depthMin: FULL_DEPTH_MIN, depthMax: FULL_DEPTH_MAX,
    speed: 52, rarity: 0.24, score: 800,                 // 사이즈↑↑ → score↑↑ (이전 360, 대형 회유 포식어)
    realLengthCm: 120,                                   // 실제 사이즈 반영 (이전 30 → 120cm, 1.0-1.5m 대형 회유)
    sprite: CUTLAS_SPRITE, animKey: CUTLAS_ANIM,
    maxConcurrent: 2,
  },
  {
    id: 'flounder', name: '광어', color: 0x8b6a3f,
    depthMin: FULL_DEPTH_MIN, depthMax: FULL_DEPTH_MAX,
    speed: 18, rarity: 0.35, score: 600,                 // 저서, 무거움, size ~134, HP ~734
    realLengthCm: 42,
    sprite: FLOUNDER_SPRITE, animKey: FLOUNDER_ANIM,
    maxConcurrent: 2,
  },
  {
    id: 'marbled_sole', name: '도다리', color: 0x7a6048,
    depthMin: FULL_DEPTH_MIN, depthMax: FULL_DEPTH_MAX,
    speed: 20, rarity: 0.30, score: 480,                 // 저서 flat, size ~129, HP ~609
    realLengthCm: 38,
    sprite: MARBLED_SPRITE, animKey: MARBLED_ANIM,
    maxConcurrent: 2,
  },
  {
    id: 'mullet', name: '숭어', color: 0xa0c4d8,
    depthMin: FULL_DEPTH_MIN, depthMax: FULL_DEPTH_MAX,
    speed: 42, rarity: 0.26, score: 420,                 // 표층 회유 cruiser, size ~122, HP ~542
    realLengthCm: 36,
    sprite: MULLET_SPRITE, animKey: MULLET_ANIM,
    maxConcurrent: 2,
  },
  {
    id: 'whiting', name: '보구치', color: 0xb8a070,
    depthMin: FULL_DEPTH_MIN, depthMax: FULL_DEPTH_MAX,
    speed: 36, rarity: 0.22, score: 360,                 // 중층 cruiser, size ~115, HP ~475
    realLengthCm: 30,
    sprite: WHITING_SPRITE, animKey: WHITING_ANIM,
    maxConcurrent: 2,
  },

  // ── 대형 어종 (감상용) — mid-water 를 가로지르며 유유히 헤엄 ──
  // 화면 밖에서 입장해 천천히 가로질러 다른 쪽으로 빠져나감. 동시 최대 2마리.
  {
    id: 'shark', name: '상어', color: 0x4a5560,
    depthMin: 220, depthMax: 680,
    speed: 28, rarity: 0.92, score: 1300,                // G8, size ~419
    realLengthCm: 380,
    sprite: WSHARK_SPRITE, animKey: WSHARK_ANIM,
    ignoresHook: true,           // movement: heading-based (majestic swim 유지)
    huntable:    true,           // 사용자 요청: 상어도 hook 에 반응 — 잡을 수 있음
    maxConcurrent: 1,
  },
];

// realLengthCm → size 자동 부여.
export const FISH_SPECIES = RAW_SPECIES.map((f) => ({
  ...f,
  size: deriveSize(f.realLengthCm),
}));

/**
 * 깊이대에서 출현할 어종을 가중치 기반으로 선택.
 *
 * 가중치 = (1 - rarity + 0.01) × (40 / size)^1.5
 *   - rarity 낮을수록 가중 ↑
 *   - size 작을수록 가중 ↑↑ (사용자 요청: 소형 많이/대형 소량)
 *   - 지수 1.5 로 크기 편향을 더 강하게 (기존 1.0 → 1.5)
 */
export function pickFishForDepth(depth) {
  const candidates = FISH_SPECIES.filter(
    (f) => depth >= f.depthMin && depth <= f.depthMax,
  );
  if (candidates.length === 0) return null;

  const weights = candidates.map(
    // size=0 방어 — division by zero / Infinity 방지 (코드 리뷰 9-3)
    (f) => (1 - f.rarity + 0.01) * Math.pow(40 / Math.max(1, f.size), 1.5),
  );
  const totalW = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * totalW;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

export function getFishById(id) {
  return FISH_SPECIES.find((f) => f.id === id) || null;
}

/**
 * ─── 어종별 유영 프로파일 (사용자 요청: 자연스러운 종별 유영 패턴) ───
 *
 * 곱셈 multipliers — Fish 생성자에서 기본 orbit/drift 값에 곱함.
 *   orbitRadiusMul : 궤도 반경 — 클수록 큰 곡선 헤엄
 *   orbitAngVelMul : 궤도 각속도 — 클수록 빠르게 회전 (=darting)
 *   vWaveMul       : 수직 wave 진폭 — 클수록 위/아래로 출렁
 *   driftMul       : 수평 drift 속도 — 클수록 직선 회유
 *   bodyWaveAmp    : sprite scale Y 미세 진동 진폭 (0 = 끔)
 *   bodyWaveFreq   : sprite scale Y 진동 주파수 (rad/s)
 */
/**
 * 어종별 유영 프로파일 — 자연스러운 종별 패턴.
 *
 * ⚠️ 핵심 원칙: drift > orbit tangential 이어야 fish 가 "뒤로 가는" 일 없음.
 *   orbit tangential ≈ baseRadius (80) × baseAngVel (0.65) × radiusMul × angVelMul
 *   drift ≈ baseDrift (17) × driftMul
 *   → drift / tangential ≥ 1.5 권장.
 *
 * 차별화는 주로 orbitRadius (곡선 크기) + vWaveMul (수직 출렁) + bodyWave 로.
 */
export const SWIM_PROFILES = {
  // 흰동가리 — 작은 darting, 빠른 헤엄
  clownfish:     { orbitRadiusMul: 0.5,  orbitAngVelMul: 0.5,  vWaveMul: 0.7, driftMul: 2.0, bodyWaveAmp: 0.03,  bodyWaveFreq: 7 },
  // 무어리쉬아이돌 — 우아한 곡선 + 큰 수직 wave
  moorishidol:   { orbitRadiusMul: 1.0,  orbitAngVelMul: 0.4,  vWaveMul: 1.3, driftMul: 1.5, bodyWaveAmp: 0.025, bodyWaveFreq: 3.5 },
  // 옐로우탱 — reef 어종, 중간 정도 곡선 + 적당한 vWave (블루탱과 친척)
  yellow_tang:   { orbitRadiusMul: 0.6,  orbitAngVelMul: 0.45, vWaveMul: 0.8, driftMul: 1.8, bodyWaveAmp: 0.03,  bodyWaveFreq: 6 },
  // 라이언피쉬 — hovering reef 어종, 천천히 곡선 + 큰 body wave (만다린 스타일)
  lion_fish:     { orbitRadiusMul: 0.7,  orbitAngVelMul: 0.35, vWaveMul: 0.6, driftMul: 1.2, bodyWaveAmp: 0.035, bodyWaveFreq: 4 },
  // 학공치 — 가는 몸 + 표면 darting (long slender surface skipper, 가장 빠른 darting)
  half_beak:     { orbitRadiusMul: 0.4,  orbitAngVelMul: 0.6,  vWaveMul: 0.4, driftMul: 2.5, bodyWaveAmp: 0.025, bodyWaveFreq: 10 },
  // 대전갱이 — schooling fast cruiser, 직선 회유
  horse_mackerel:{ orbitRadiusMul: 0.4,  orbitAngVelMul: 0.5,  vWaveMul: 0.3, driftMul: 2.3, bodyWaveAmp: 0.025, bodyWaveFreq: 9 },
  // 쥐치 — hovering reef 어종, 신중한 swimmer (느린 drift + 적당한 vWave)
  filefish:      { orbitRadiusMul: 0.6,  orbitAngVelMul: 0.3,  vWaveMul: 0.7, driftMul: 1.0, bodyWaveAmp: 0.03,  bodyWaveFreq: 5 },
  // 우럭 — reef bottom dweller, 거의 hovering (느린 drift + 작은 wave + 큰 body wave)
  rockfish:      { orbitRadiusMul: 0.5,  orbitAngVelMul: 0.25, vWaveMul: 0.5, driftMul: 0.9, bodyWaveAmp: 0.035, bodyWaveFreq: 4 },
  // 블루탱 — 직선 빠른 회유 (schooling)
  blue_tang:     { orbitRadiusMul: 0.3,  orbitAngVelMul: 0.4,  vWaveMul: 0.3, driftMul: 2.5, bodyWaveAmp: 0.02,  bodyWaveFreq: 11 },
  // 패럿피쉬 — 큰 반경 천천히 reef 사이
  parrotfish:    { orbitRadiusMul: 1.2,  orbitAngVelMul: 0.3,  vWaveMul: 0.9, driftMul: 1.5, bodyWaveAmp: 0.04,  bodyWaveFreq: 3 },
  // 가시복 — hovering 느낌 (small orbit, slow drift)
  porcupinefish: { orbitRadiusMul: 0.5,  orbitAngVelMul: 0.3,  vWaveMul: 0.5, driftMul: 0.7, bodyWaveAmp: 0.05,  bodyWaveFreq: 2 },
  // 파랑돔 — 직선 중속
  blue_damselfish: { orbitRadiusMul: 0.5, orbitAngVelMul: 0.4,  vWaveMul: 0.5, driftMul: 2.0, bodyWaveAmp: 0.025, bodyWaveFreq: 5 },
  // 엔젤피쉬 — 우아한 glide
  angelfish:     { orbitRadiusMul: 0.7,  orbitAngVelMul: 0.5,  vWaveMul: 1.0, driftMul: 1.6, bodyWaveAmp: 0.035, bodyWaveFreq: 6 },
  // 상어 — heading-based, 미세 호흡
  shark:         { bodyWaveAmp: 0.02,    bodyWaveFreq: 1.2 },
  // 갈치 — 가늘고 긴 은빛 darting, 빠른 직선 darting (halfbeak 유사)
  cutlasfish:    { orbitRadiusMul: 0.4,  orbitAngVelMul: 0.55, vWaveMul: 0.4, driftMul: 2.4, bodyWaveAmp: 0.025, bodyWaveFreq: 11 },
  // 광어 — 저서, 거의 hovering (느린 drift + 매우 작은 wave)
  flounder:      { orbitRadiusMul: 0.4,  orbitAngVelMul: 0.2,  vWaveMul: 0.3, driftMul: 0.8, bodyWaveAmp: 0.04,  bodyWaveFreq: 3 },
  // 도다리 — 저서 flat, flounder 유사
  marbled_sole:  { orbitRadiusMul: 0.4,  orbitAngVelMul: 0.2,  vWaveMul: 0.3, driftMul: 0.8, bodyWaveAmp: 0.04,  bodyWaveFreq: 3 },
  // 숭어 — 표층 cruiser (mullet swims in surface schools)
  mullet:        { orbitRadiusMul: 0.5,  orbitAngVelMul: 0.45, vWaveMul: 0.5, driftMul: 2.1, bodyWaveAmp: 0.025, bodyWaveFreq: 8 },
  // 보구치 — 중층 cruiser, whiting/horse_mackerel 와 유사
  whiting:       { orbitRadiusMul: 0.5,  orbitAngVelMul: 0.5,  vWaveMul: 0.4, driftMul: 2.0, bodyWaveAmp: 0.03,  bodyWaveFreq: 8 },
};

export function getSwimProfile(id) {
  return SWIM_PROFILES[id] || {};
}

// ─── 아이템 시스템 연동 (Phase 1) ─────────────────────────────────────────
//
//  어종별 전투 메타. Phase 1 에서는 데이터만 — 게임 로직 변경 없음.
//  Phase 2+ 에서 FishSpawner/Hook/텐션 게이지가 이 값들을 참조:
//
//    weight        : rod.power 와 비교 — fish.weight > rod.power 면 catch 실패.
//    tensionPeak   : 파이팅 시 도달 텐션 최대치 (0~1, 게이지 정규화).
//    dashIntensity : 텐션 스파이크 강도 (reel.stability 로 감쇠).
//    baitCategory  : bait/lure.targetCategories 와 매칭.
//    preferredBaits: bait id 가 이 목록에 있으면 입질 확률 ×2.

/**
 * realLengthCm 기반으로 어종 무게(kg) 자동 산출.
 *   근사: weight ≈ (L_cm / 100)^3 × 18 (어류 일반 부피-무게 곡선의 단순화).
 *   10cm → ~0.018 kg, 50cm → ~2.3 kg, 400cm → ~1152 kg.
 *   상한 250 kg (T6 rod 의 power 와 맞춤 — 신화 어종도 잡을 수 있도록).
 *
 * @param {number} cm
 * @returns {number} weight in kg
 */
export function deriveWeight(cm) {
  const raw = Math.pow(cm / 100, 3) * 18;
  return Math.round(Math.min(250, raw) * 10) / 10;
}

/**
 * 어종 id → 전투 프로필 매핑. 누락된 어종은 fallback (중급 reef 어종) 반환.
 */
const FISH_COMBAT_BY_ID = {
  clownfish:       { tensionPeak: 0.20, dashIntensity: 0.30, baitCategory: 'small_reef',     preferredBaits: ['bait_shrimp'] },
  angelfish:       { tensionPeak: 0.25, dashIntensity: 0.30, baitCategory: 'small_reef',     preferredBaits: ['bait_shrimp'] },
  moorishidol:     { tensionPeak: 0.30, dashIntensity: 0.35, baitCategory: 'small_reef',     preferredBaits: ['bait_shrimp'] },
  yellow_tang:     { tensionPeak: 0.30, dashIntensity: 0.40, baitCategory: 'reef',           preferredBaits: ['bait_shrimp'] },
  lion_fish:       { tensionPeak: 0.40, dashIntensity: 0.45, baitCategory: 'reef',           preferredBaits: ['bait_squid'] },
  half_beak:       { tensionPeak: 0.35, dashIntensity: 0.65, baitCategory: 'surface',        preferredBaits: ['bait_worm'] },
  horse_mackerel:  { tensionPeak: 0.50, dashIntensity: 0.60, baitCategory: 'pelagic',        preferredBaits: ['bait_worm'] },
  filefish:        { tensionPeak: 0.45, dashIntensity: 0.45, baitCategory: 'reef',           preferredBaits: ['bait_crab'] },
  rockfish:        { tensionPeak: 0.55, dashIntensity: 0.50, baitCategory: 'bottom',         preferredBaits: ['bait_crab', 'bait_squid'] },
  blue_tang:       { tensionPeak: 0.50, dashIntensity: 0.55, baitCategory: 'reef',           preferredBaits: ['bait_worm', 'bait_squid'] },
  blue_damselfish: { tensionPeak: 0.40, dashIntensity: 0.50, baitCategory: 'reef',           preferredBaits: ['bait_shrimp'] },
  porcupinefish:   { tensionPeak: 0.60, dashIntensity: 0.55, baitCategory: 'reef',           preferredBaits: ['bait_crab'] },
  parrotfish:      { tensionPeak: 0.70, dashIntensity: 0.65, baitCategory: 'large_reef',     preferredBaits: ['bait_squid', 'bait_crab'] },
  shark:           { tensionPeak: 0.90, dashIntensity: 0.80, baitCategory: 'large_pelagic',  preferredBaits: ['bait_herring'] },
  // ── 신규 5종 ──
  cutlasfish:      { tensionPeak: 0.45, dashIntensity: 0.70, baitCategory: 'pelagic',        preferredBaits: ['bait_worm', 'bait_squid'] },
  flounder:        { tensionPeak: 0.55, dashIntensity: 0.35, baitCategory: 'bottom',         preferredBaits: ['bait_crab', 'bait_worm'] },
  marbled_sole:    { tensionPeak: 0.50, dashIntensity: 0.30, baitCategory: 'bottom',         preferredBaits: ['bait_crab', 'bait_worm'] },
  mullet:          { tensionPeak: 0.40, dashIntensity: 0.55, baitCategory: 'surface',        preferredBaits: ['bait_worm', 'bait_shrimp'] },
  whiting:         { tensionPeak: 0.45, dashIntensity: 0.50, baitCategory: 'reef',           preferredBaits: ['bait_shrimp', 'bait_worm'] },
};

const FALLBACK_COMBAT = {
  tensionPeak: 0.50,
  dashIntensity: 0.50,
  baitCategory: 'reef',
  preferredBaits: [],
};

/**
 * 어종 종합 전투 프로필 — weight(파생) + 전투 메타 합본.
 *
 * @param {string} id  어종 id (FISH_SPECIES.id)
 * @returns {{
 *   weight: number,
 *   tensionPeak: number,
 *   dashIntensity: number,
 *   baitCategory: string,
 *   preferredBaits: string[],
 * }}
 */
export function getFishCombatProfile(id) {
  const fish = FISH_SPECIES.find((f) => f.id === id);
  const combat = FISH_COMBAT_BY_ID[id] || FALLBACK_COMBAT;
  return {
    weight: fish ? deriveWeight(fish.realLengthCm) : 0,
    tensionPeak: combat.tensionPeak,
    dashIntensity: combat.dashIntensity,
    baitCategory: combat.baitCategory,
    preferredBaits: combat.preferredBaits,
  };
}
