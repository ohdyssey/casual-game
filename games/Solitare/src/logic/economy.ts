/**
 * economy.ts — 재화 경제 모델(순수, 파라미터 주입형). docs/ECONOMY_DESIGN.md v0.3 의 SSOT.
 *
 * 시뮬레이션 도구(design/econ-board.html)가 이 모듈의 공식으로 곡선·수지·여정을 계산한다.
 * 원칙(§1·§8): **코인 수치는 게임비 배수, 다이아 수치는 판수 기준**으로만 정의 — 절대값 금지.
 *
 * ⚠️ 게임 런타임(save.ts)은 아직 자체 상수(GAME_FEE=2000 고정)를 쓴다 — P3 에서 이 모듈
 *    (public/econ/economy.json)을 SSOT 로 소비하도록 재배선 예정. 그 전까지 DEFAULT_ECON 의
 *    5층 시점 값이 현행 게임 값과 일치하도록 유지한다(economy.test.ts 가 정합을 검증).
 *
 * 다이아 소스 중 미션리워드·데일리챌린지는 missionReward.ts·dailyChallenge.ts 의 **실제 설계된 티어
 * 테이블**을 그대로 참조한다(2026-07-19) — 숫자를 이 파일에 중복 하드코딩하지 않는다. 조정 가능한 것은
 * "그 테이블을 얼마나 자주/얼마나 잘 달성하는가"라는 행동 가정치뿐이다(assumedLevelsPerMissionTier 등).
 */
import { averageMissionReward } from './missionReward.js';
import { expectedDailyReward } from './dailyChallenge.js';

/** 경제 파라미터 전체 — 시뮬 도구의 조정 대상. 코인 항목은 전부 "게임비 배수". */
export interface EconParams {
  // ── 게임비(코어 스파인: **레벨 단위 계단**, PO 2026-07-16) ───────────
  //   층별 상승은 곡선이 너무 컸음(폐기) → 레벨 N개(feeLevelStep)마다 한 단계씩 완만히 상승.
  //   보상·부스터·미션·수익은 전부 게임비 배수라 자동으로 동일 비율 조정된다.
  /** Lv1 기준 게임비(코인 절대값의 유일한 기저). */
  readonly feeBase: number;
  /** 몇 레벨마다 게임비가 한 단계 오르는가(예: 50 → Lv51·101·151…에서 상승). */
  readonly feeLevelStep: number;
  /** 단계당 배율(완만하게 — 예: 1.10 = 단계마다 +10%). */
  readonly feeStepMult: number;
  /**
   * **골드 가격 단위**(PO 2026-07-16: 100 단위로 확정) — 게임비·부스터 등 골드 가격은 이 단위의
   *   배수로만. 단위에 못 미치는 값은 **내림**(상향하지 않음): 1,129 → 1,100.
   */
  readonly feeRound: number;
  /**
   * **도전 배수**(PO 2026-07-16 — '베팅' 명칭 금지, 소셜카지노성 판정 회피 프레임) —
   *   입장 시 유저가 선택하는 게임 배수. 게임비·보상이 함께 배수 — "더 어려운 도전, 더 큰 보상"
   *   이라는 스킬 게임 문법으로 표기(판돈/베팅/배당 등 도박 용어는 UI·코드 전면 금지).
   */
  readonly challengeMults: readonly number[];
  /** 각 배수의 해금 레벨(challengeMults 와 짝) — 성장 보상으로 상위 배수 개방. */
  readonly challengeUnlockLevels: readonly number[];

  // ── 승리 보상(게임비 배수) ─────────────────────────────────────────
  /** 별 1/2/3개 보상 배수. */
  readonly starMult: readonly [number, number, number, number, number];
  /** 남은카드 보너스(장당) 배수. */
  readonly stockBonusRate: number;

  // ── 인게임 미션 보상(5매치=세트마다 지급, PlayScene MISSION_REWARD_TABLE 반영, PO 2026-07-17) ──
  //   판당 세트 수(avgSets, 판 시뮬 실측)만큼 발생. 코인은 즉시·다이아는 완성 보상풀(승리 시 지급).
  /** 세트당 코인 보상 확률(테이블 가중 40/100). */
  readonly missionCoinChance: number;
  /** 코인 보상 = 게임비 × 이 값(현행 0.15). */
  readonly missionCoinMult: number;
  /** 세트당 다이아 보상 확률(가중 10/100) — 완성 보상풀(승리 시 지급). */
  readonly missionDiamondChance: number;
  /** 다이아 보상 수량(1). */
  readonly missionDiamondAmt: number;
  /** 2★/3★ 필요 완성 세트 수(별 판정 컷). */
  readonly setsFor2Star: number;
  readonly setsFor3Star: number;

  // ── 부스터(게임비 배수) ────────────────────────────────────────────
  readonly plus5BaseMult: number;
  readonly wildBaseMult: number;
  /** 한 판 내 사용 회당 가산 배수. */
  readonly boosterStepMult: number;
  /**
   * **부스터 레벨 램프**(PO 2026-07-16: "성장했으니 더 내도 된다") — 부스터 가격이 게임비 연동에
   *   더해 레벨 진행에 비례해 추가 상승. 캡 레벨에서 ×(1+이 값). 1.0 = 캡에서 기저의 2배.
   *   게임비는 ×10, 부스터는 ×20 — 성장할수록 부스터가 지갑에서 차지하는 비중이 커진다.
   */
  readonly boosterLevelRamp: number;
  /** 되돌리기 배수(제안 0.1 — 현행 게임은 100 고정). */
  readonly undoFeeMult: number;

  // ── 함정 레벨(PO 2026-07-16: 승리 보장은 유지하되 중간에 부스터를 크게 태우는 스파이크 싱크) ──
  /** 함정 시작 레벨 — 온보딩 보호(이전 구간엔 함정 없음). */
  readonly trapStartLevel: number;
  /** 함정 주기(레벨) — 이 배수 레벨이 함정(층 경계와 동조). */
  readonly trapCycleLevels: number;
  /** 함정 레벨 기대 추가 지출(게임비 배수) — 부스터 2~3회 분량(가격 인상 후 ≈ ×4.0+×5.0). */
  readonly trapSpendMult: number;

  // ── 층/레벨(성장 스파인) ───────────────────────────────────────────
  /** 층 해금 요구 레벨 — index=층 번호(2~5층 저작값), 이후 floorReqStep 씩 가산. */
  readonly floorReqBase: readonly number[];
  /** floorReqBase 범위 밖(6층+) 층당 가산 레벨. 100층×레벨캡 1000 기준 평균 10. */
  readonly floorReqStep: number;
  /** 최대 층(PO 지시 2026-07-18: 3,000레벨 구조에서 약 100층). */
  readonly maxFloors: number;
  /** 레벨(=승리 판수) 상한(PO 지시 2026-07-18: 1,000→**3,000** 확장). 여정 시뮬·표시용 — 초과 레벨업 없음. */
  readonly levelCap: number;
  /**
   * **층 건설 다이아 = 구간 수입 연동**(PO 2026-07-16: 다이아 누적 누진 방지) —
   *   비용(f) = (그 층 해금 구간 판수 × 판당 다이아) × 이 비율. 1.0 = 완전 평탄(잉여는 위클리만),
   *   0.9 = 층당 +10% 잉여. 레벨 곡선·판당 다이아를 바꿔도 수지가 자동 추종한다(구 고정 곡선 폐기).
   */
  readonly diamondCostIncomeRatio: number;

  // ── 다이아 소스 분해(PO 2026-07-18/19: 미션 리워드·데일리챌린지 신설로 판당 확정 지급을 줄이고
  //     소스를 다변화) — 구 diamondsPerWin(판당 고정 2개)을 폐기하고 3원으로 분해:
  //     보드기본+가끔보너스 / 미션리워드(missionReward.ts 6티어 실제 설계) / 데일리챌린지
  //     (dailyChallenge.ts 퍼포먼스+랭킹 실제 설계). **티어 숫자 자체는 두 모듈에 설계돼 있고,
  //     여기 있는 건 "그 설계를 얼마나 자주/잘 달성하는가"라는 행동 가정치뿐**(대시보드 조정 대상).
  //   합계는 totalDiamondsPerLevelExpected() 로 계산 — diamondCostForFloor 가 이 합계를 기준으로 건설비를 추종한다.
  /** 보드 기본 다이아(판당, PlayScene 카드 배치 개수) — PO: 2→**1**로 하향. */
  readonly boardDiamondBase: number;
  /** 보드에 다이아가 **2개**(기본+보너스 1) 나올 확률 — PO: "가끔 두개 정도". */
  readonly boardDiamondBonusRate: number;
  /** **미션 리워드** 1회 완료에 걸리는 평균 레벨 수(가정) — missionReward.ts 6티어 평균 다이아를
   *   레벨당으로 환산할 때 나누는 값. ⚠️PO 조정 필요: 실제 플레이테스트로 완료 빈도가 나오면 갱신. */
  readonly assumedLevelsPerMissionTier: number;
  /** **데일리 챌린지** 가정 평균 달성 스코어(dailyChallenge.ts 퍼포먼스 스테이지 판정용) —
   *   ⚠️PO 조정 필요: 실제 스코어 산식·플레이 데이터 확정 후 갱신. */
  readonly assumedDailyChallengeScore: number;
  /** **데일리 챌린지** 가정 평균 순위(1=1등, dailyChallenge.ts 그룹랭킹 보상 판정용) —
   *   ⚠️PO 조정 필요: 매칭 그룹 규모·실제 유저 분포 확정 후 갱신. */
  readonly assumedDailyChallengeRank: number;
  /** 데일리 챌린지(일 단위)를 판당 환산할 때 쓰는 가정 접속 판수 — journey.ts DEFAULT_BEHAVIOR.gamesPerDay 와
   *   별개(economy.ts 는 behavior 에 의존하지 않는 순수 모듈이라 자체 가정치를 둔다). */
  readonly assumedGamesPerDay: number;
  /**
   * **복합 건설비**(PO 2026-07-19: "처음부터 다이아+코인으로 설계") — 이 층부터 층 건설에 다이아+**코인**을
   *   함께 청구. 기본값 2 = 첫 유상 건설층(1층은 무료 시작층)부터 곧바로 복합. 코인 병행은 코인 싱크
   *   역할도 겸한다(인플레 완화).
   */
  readonly floorCoinCostFromFloor: number;
  /** 층 건설 코인 비용 = 그 층 게임비 × 이 값. */
  readonly floorCoinCostMult: number;

  // ── 점포 수익(게임비 배수) ─────────────────────────────────────────
  /** 층 은행 수령 단위 = 게임비 × 이 값 × 층가중. (현행 2,000×0.05=100 정합) */
  readonly claimUnitMult: number;
  /** 층가중 = 1 + claimFloorWeight × (층-1). */
  readonly claimFloorWeight: number;
  /** 오프라인 적립: 시간당 게임비 × 이 값(신설 예정 시스템 — 시뮬 선행). */
  readonly offlineRatePerHour: number;
  readonly offlineCapHours: number;
  /** 일일 방치수익 총량 상한(게임비 배수) — 무플레이 무한 회복 방지. */
  readonly idleDailyCapMult: number;

  // ── 미션(신설 예정 — 시뮬 선행) ────────────────────────────────────
  /** 데일리 미션 합계 보상(게임비 배수). */
  readonly missionDailyMult: number;
  /** 위클리 다이아. */
  readonly weeklyDiamonds: number;

  // ── 경쟁부지(미구현 — 시뮬 전용 파라미터, PO: 고비용 청구) ──────────
  /** 경매 낙찰가(게임비 배수). */
  readonly compAuctionMult: number;
  /** 층당 증축비 배율(낙찰가 기준 누진). */
  readonly compFloorCostMult: number;
  /** 뱅크 층 수. */
  readonly compFloors: number;
  /** 총투자 회수 목표 일수(일 수익 = 누적투자 ÷ 이 값). */
  readonly compRoiDays: number;
  /** **경쟁부지 다이아 소모**(PO 2026-07-16: 다이아 대량 소모처) — 경매 낙찰 시 다이아. */
  readonly compAuctionDiamonds: number;
  /** 증축 1층당 다이아. */
  readonly compFloorDiamonds: number;

  // ── 초기값 ─────────────────────────────────────────────────────────
  readonly startCoins: number;
  /**
   * **라이브옵스 튜닝 노브**(PO 2026-08-25) — 투데이 리그·위클리 이벤트의 수익/비용을
   * economy.json 수치 조정만으로(코드 배포 없이 JSON 재배포로) 조절한다.
   *   배율 1 = 설계 기본표 그대로. econRuntime.setEconFromJson 이 각 모듈에 주입한다.
   */
  readonly leagueGoalMult: number;   // 리그 칸 목표 배율(↑=허들 상승)
  readonly leagueCoinPerStar: number; // 리그 별당 코인(절대값 — 일수입 조절 주 노브)
  readonly leagueGrandMult: number;  // 리그 완주 보상 배율
  readonly eventGoalMult: number;    // 위클리 칸 목표 배율
  readonly eventCoinMult: number;    // 위클리 칸 보상 배율
  readonly eventGrandMult: number;   // 위클리 완주 보상 배율
  readonly startDiamonds: number;
}

/**
 * 기본값 — v0.3 설계 + PO 지시(2026-07-16, **2026-07-18 3,000레벨/다이아소스 분해로 개정**).
 *   · **레벨캡 1,000→3,000, 100층 유지**(PO 2026-07-18) — floorReqBase·floorReqStep 을 3배로
 *     늘려 같은 상대적 페이싱(온보딩 5개 층 빠르게 → 6층부터 등차)을 3,000레벨 스케일로 재현.
 *     층당 평균 판수 = 3000 ÷ 100 = 30판(구 10판의 3배).
 *   · **게임비 = 레벨 단위 계단**(PO 2026-07-16 확정): 기저 **2,000**, 50레벨마다 ×1.129.
 *   · **다이아 소스 3원 분해**(PO 2026-07-18: 미션 리워드 신설로 판당 확정 지급 축소):
 *     보드(기본1+가끔보너스) + 미션리워드(레벨당) + 데일리챌린지(일→판 환산). 건설비는 이 합계를
 *     구간 판수에 곱해 추종(diamondCostForFloor) — 소스 값을 바꾸면 건설비도 자동 재조정된다.
 *     ⚠️미션리워드·데일리챌린지 값은 실제 보상 테이블 확정 전 **추정 플레이스홀더** — econ-board.html
 *     맨 위 "다이아 구조" 대시보드에서 조정하며 검토할 것.
 */
export const DEFAULT_ECON: EconParams = {
  //   ⚠️ 게임비는 **전 경제의 기준 단위**다 — 별 보상·＋5·와일드·되돌리기·건설비가 모두 이 값의 배수라
  //   여기를 내리면 지출과 수입이 **같은 비율로** 함께 내려간다(회수율은 그대로). 실제로 바뀌는 것은
  //   ① 적자의 절대액과 ② 리그·이벤트처럼 **고정 코인**으로 주는 보상의 상대적 크기다.
  feeBase: 1500, // PO 2026-08-23: 2,000 → 1,500 하향(판당 적자 -5,158 → -3,868, 1,500판 실측 기준).
  feeStepMult: 1.129, // 19단계(캡) 총 ×10 → Lv3000 = 20,000 정확히(시작값 비례).
  feeLevelStep: 150, // ⚠️2026-07-18: 레벨캡 3배(1000→3000) 확장에 맞춰 50→150(구 19단계·×10 배율을 그대로 유지).
  feeRound: 100, // PO: 골드 가격은 100 단위 — 미달 시 내림(상향 없음).
  challengeMults: [1, 2, 3, 5], // 도전 배수(비도박 프레임) — 게임비·보상 동시 배수.
  challengeUnlockLevels: [1, 300, 900, 1800], // x2=Lv300·x3=Lv900·x5=Lv1800(구 101/301/601×3, 레벨캡 확장 비례).
  /**
   * **별 1~5 보상 곡선**(게임비 배수) — PO 2026-07-29 "별 3개를 획득했을 때 게임 비용 이상을 수익이
   *   가능하도록". 배수 1.0 = 본전, 그 위가 흑자다. **3★ = 1.3 → 게임비의 30% 흑자**가 이 표의 앵커다.
   *
   * ⚠️ 예전엔 3칸짜리([0.55, 1.0, 2.2])라 **4★·5★ 가 3★ 와 똑같은 보상**을 받았다(인덱스 클램프).
   *    별 등급이 1~3에서 1~5로 확장(starRating.ts)됐는데 보상표가 따라오지 않은 구멍이었다.
   *    동시에 3★ 가 "상위 플레이"에서 "＋5 없이 클리어한 기본값"(전체의 44%)으로 의미가 바뀌어,
   *    2.2 배를 그대로 두면 판당 기대 보상이 게임비의 2.13배까지 부풀었다.
   *
   * 실측 분포(클린 1★1% · 2★4.9% · 3★44.3% · 4★32.1% · 5★17.8%) 기준 **판당 기대 ≈ 게임비 ×1.59**
   *   (구 3칸 표는 ×2.13 — 26% 과지급. 세트 기반 구 별규칙 시절의 설계 의도는 ×1.44 였다.)
   */
  starMult: [0.3, 0.65, 1.0, 1.35, 1.75], // PO 2026-08-23: 3★ = 손익분기(결제 모델 성립 조건 — save.ts 주석 참고).
  stockBonusRate: 0, // 남은카드 코인 보너스 **폐지**(PO 2026-07-17) — 남은 카드는 스타포인트(별 등급)로 전환.
  // 인게임 미션 보상(PlayScene 테이블 정합, PO 2026-07-17 하향): 코인 40%·게임비×**0.08**(구 0.15), 다이아 **6%**(구 10%)·1개.
  missionCoinChance: 0.4,
  missionCoinMult: 0.08,
  missionDiamondChance: 0.06,
  missionDiamondAmt: 1,
  setsFor2Star: 1,
  setsFor3Star: 3,
  // 부스터(PO 2026-07-16 확정, **게임 미적용 — 모델 선행 검토**): Lv1 시작 +5=2,000·와일드=3,000
  //   (기저 게임비 1,000 × 2.0/3.0), 캡에서도 과도하지 않게 램프 0.5(캡 ×1.5).
  //   → Lv1000(게임비 10,050): +5 ≈ 30,150 · 와일드 ≈ 45,200.
  plus5BaseMult: 2.0,
  wildBaseMult: 3.0,
  boosterStepMult: 1.0,
  boosterLevelRamp: 0.5,
  undoFeeMult: 0.1,
  trapStartLevel: 21, // 첫 20레벨 = 온보딩 무결(함정 없음).
  trapCycleLevels: 30, // ⚠️2026-07-18: floorReqStep 과 동일하게 10→30(층 경계 동조 유지).
  trapSpendMult: 8, // 함정 통과 기대 지출 ≈ 게임비×8(부스터 ~2회) — 스파이크 싱크의 크기.
  floorReqBase: [0, 0, 3, 9, 18, 30], // index=층(구 [0,0,1,3,6,10]×3) — 2층=Lv3·3층=9·4층=18·5층=30.
  floorReqStep: 30, // 6층부터 층당 +30(구 10×3) → 100층 = Lv 2,880 ≈ 레벨캡 3,000(4% 여유, 구 비율 유지).
  maxFloors: 100,
  levelCap: 3000,
  diamondCostIncomeRatio: 1.0, // 비용=구간 수입 100% → 누적 평탄(잉여는 위클리·미션만). PO: 누진 방지.
  // 다이아 소스 분해(PO 2026-07-18) — 합계는 totalDiamondsPerLevelExpected() 참고.
  boardDiamondBase: 1, // 구 2 → 1(미션 리워드 신설로 보드 고정 지급은 낮춤).
  boardDiamondBonusRate: 0.2, // "가끔 두개" ≈ 5판에 1번 정도.
  assumedLevelsPerMissionTier: 15, // ⚠️추정(대시보드에서 조정) — 티어 타이머(15~25분)와 대략 정합.
  assumedDailyChallengeScore: 5000, // ⚠️추정 — 참고 이미지 앵커(스테이지2) 그대로.
  assumedDailyChallengeRank: 10, // ⚠️추정 — 그룹 30명 중 중상위(7~15위 밴드).
  assumedGamesPerDay: 7, // journey.ts DEFAULT_BEHAVIOR.gamesPerDay 와 동일값(참고용 가정).
  floorCoinCostFromFloor: 2, // PO 2026-07-19: "처음부터 다이아+코인으로 건설비 설계" — 2층(첫 유상 건설층)부터 복합.
  floorCoinCostMult: 5.0, // 층 건설 코인 = 게임비×5(구간 10판 수익의 일부를 회수하는 싱크).
  claimUnitMult: 0.05,
  claimFloorWeight: 0.15,
  offlineRatePerHour: 0.05,
  offlineCapHours: 8,
  idleDailyCapMult: 5,
  missionDailyMult: 3,
  weeklyDiamonds: 7,
  compAuctionMult: 15,
  compFloorCostMult: 1.8,
  compFloors: 4,
  compRoiDays: 4,
  compAuctionDiamonds: 60, // 낙찰 다이아 = 구간 수입(20개) 3구간 분량 — "많은 소모"(PO).
  compFloorDiamonds: 40, // 증축당 — 완공까지 총 60+40×3=180개.
  startCoins: 20_000, // PO 2026-08-25: 결제 유도 핀치 설계 — 40,000 → 20,000.
  leagueGoalMult: 1,
  leagueCoinPerStar: 53, // = dailyLeague COIN_PER_STAR 기본(320 ÷ STAR_SCALE 6 — 클리어 정산으로 별이 6배가 되며 함께 조정, 2026-08-30).
  leagueGrandMult: 1,
  eventGoalMult: 1,
  eventCoinMult: 1,
  eventGrandMult: 1,
  startDiamonds: 30,
};

/** 현재 레벨에서 해금된 **최대 도전 배수**. */
export function maxChallengeMult(p: EconParams, level: number): number {
  let best = 1;
  for (let i = 0; i < p.challengeMults.length; i++) {
    if ((p.challengeUnlockLevels[i] ?? 1) <= level) best = Math.max(best, p.challengeMults[i]);
  }
  return best;
}

/** 골드 가격 단위 스냅 — 단위(feeRound) 배수로 **내림**(미달 시 상향 없음, PO). 최소 1단위. */
export function snapGold(p: EconParams, value: number): number {
  const unit = Math.max(1, p.feeRound);
  return Math.max(unit, Math.floor(value / unit) * unit);
}

/** 게임비 — **레벨 단위 계단**(feeLevelStep 레벨마다 ×feeStepMult, 레벨캡에서 고정). 500 단위 내림. */
export function feeForLevel(p: EconParams, level: number): number {
  const lv = Math.min(p.levelCap, Math.max(1, Math.floor(level)));
  const steps = Math.floor((lv - 1) / Math.max(1, p.feeLevelStep));
  return snapGold(p, p.feeBase * Math.pow(p.feeStepMult, steps));
}

/** **게임비 이상 수익이 시작되는 별 수**(PO 2026-07-29) — 이 등급부터 배수가 1.0 을 넘어야 한다. */
export const BREAKEVEN_STARS = 3;

/** 별 보상(코인) — stars 1~5. 0 이하는 0, 표 길이를 넘으면 마지막 칸. */
export function starCoinsFor(p: EconParams, fee: number, stars: number): number {
  const s = Math.floor(stars);
  if (s < 1) return 0;
  return Math.round(fee * p.starMult[Math.min(p.starMult.length - 1, s - 1)]);
}

/** 그 별 등급의 **순손익**(코인) — 양수면 게임비를 넘겨 번 것. 대시보드·검증용. */
export function starProfitFor(p: EconParams, fee: number, stars: number): number {
  return starCoinsFor(p, fee, stars) - fee;
}

/** 남은카드 보너스(코인). */
export function stockBonusFor(p: EconParams, fee: number, leftover: number): number {
  return Math.max(0, Math.round(fee * p.stockBonusRate * Math.max(0, leftover)));
}

/** **미션 보상 코인 기대값(세트 1개당)** — 확률 × (게임비 × 배수). 판당 = avgSets × 이 값. */
export function missionCoinPerSet(p: EconParams, fee: number): number {
  return p.missionCoinChance * Math.round(fee * p.missionCoinMult);
}

/** **미션 보상 다이아 기대값(세트 1개당)** — 확률 × 수량(완성 보상풀 → 승리 시 지급). */
export function missionDiamondPerSet(p: EconParams): number {
  return p.missionDiamondChance * p.missionDiamondAmt;
}

/** 완성 세트 수 → 별(1~3). 승리 전제(최소 1★). */
export function starsForSets(p: EconParams, sets: number): 1 | 2 | 3 {
  if (sets >= p.setsFor3Star) return 3;
  if (sets >= p.setsFor2Star) return 2;
  return 1;
}

/** 부스터 레벨 계수 — Lv1=1.0 → 캡에서 1+boosterLevelRamp (선형). */
export function boosterLevelFactor(p: EconParams, level: number): number {
  const lv = Math.min(p.levelCap, Math.max(1, Math.floor(level)));
  const progress = (lv - 1) / Math.max(1, p.levelCap - 1);
  return 1 + p.boosterLevelRamp * progress;
}

/** +5카드 부스터 비용 — uses=이번 판 이미 사용한 횟수, level=현재 레벨(성장 체감 램프). 500 단위 내림. */
export function plus5CostFor(p: EconParams, fee: number, uses: number, level = 1): number {
  return snapGold(p, fee * (p.plus5BaseMult + p.boosterStepMult * Math.max(0, Math.floor(uses))) * boosterLevelFactor(p, level));
}

/** 와일드 부스터 비용. 500 단위 내림. */
export function wildCostFor(p: EconParams, fee: number, uses: number, level = 1): number {
  return snapGold(p, fee * (p.wildBaseMult + p.boosterStepMult * Math.max(0, Math.floor(uses))) * boosterLevelFactor(p, level));
}

/** 되돌리기 비용. */
export function undoCostFor(p: EconParams, fee: number): number {
  return Math.max(1, Math.round(fee * p.undoFeeMult));
}

/** 층 해금 요구 레벨 — 저작 배열(floorReqBase) 밖은 마지막 값 + step×초과. */
export function floorReqFor(p: EconParams, floor: number): number {
  const f = Math.floor(floor);
  if (f <= 1) return 0;
  const base = p.floorReqBase;
  if (f < base.length) return base[f];
  const last = base[base.length - 1] ?? 0;
  return last + p.floorReqStep * (f - (base.length - 1));
}

/** 층 건설 **코인** 비용(복합 건설비) — floorCoinCostFromFloor 미만 층은 0(다이아만). */
export function floorCoinCost(p: EconParams, fee: number, floor: number): number {
  if (Math.floor(floor) < p.floorCoinCostFromFloor) return 0;
  return Math.round(fee * p.floorCoinCostMult);
}

/** 경쟁부지 **다이아** 비용 — floors 0(경매)=낙찰 다이아, 1층 이상=증축당 다이아. */
export function compDiamondCost(p: EconParams, currentFloors: number): number {
  return currentFloors <= 0 ? p.compAuctionDiamonds : p.compFloorDiamonds;
}

/** 보드(카드 배치) 판당 기대 다이아 = 기본 + 보너스 확률(2번째 다이아가 뜰 확률의 기대값). */
export function boardDiamondsExpected(p: EconParams): number {
  return p.boardDiamondBase + p.boardDiamondBonusRate;
}

/** 미션 리워드(missionReward.ts 6티어 설계) 레벨당 기대 다이아 — 평균 티어 보상 ÷ 가정 완료 소요 레벨수. */
export function missionRewardDiamondsPerLevel(p: EconParams): number {
  return averageMissionReward().diamonds / Math.max(1, p.assumedLevelsPerMissionTier);
}

/** 데일리 챌린지(dailyChallenge.ts 설계) 1일 기대 다이아 — 가정 스코어·순위로 퍼포먼스+랭킹 보상 조회. */
export function dailyChallengeDiamondsPerDay(p: EconParams): number {
  return expectedDailyReward(p.assumedDailyChallengeScore, p.assumedDailyChallengeRank).diamonds ?? 0;
}

/**
 * **판당 총 기대 다이아**(3원 합산) — 보드 + 미션리워드(레벨당) + 데일리챌린지(일→판 환산,
 *   assumedGamesPerDay 로 나눔). `diamondCostForFloor` 가 이 값을 기준으로 건설비를 추종한다.
 */
export function totalDiamondsPerLevelExpected(p: EconParams): number {
  return boardDiamondsExpected(p) + missionRewardDiamondsPerLevel(p) + dailyChallengeDiamondsPerDay(p) / Math.max(1, p.assumedGamesPerDay);
}

/**
 * 층 건설 다이아 비용 — **구간 수입 연동**: (해금 구간 판수 × 판당 총 기대 다이아) × 비율.
 *   수입을 정확히 추종하므로 레벨 곡선·다이아 소스 구성을 어떻게 바꿔도 다이아 누적이 누진되지 않는다(PO).
 */
export function diamondCostForFloor(p: EconParams, floor: number): number {
  const f = Math.floor(floor);
  if (f < 2) return 0;
  const games = Math.max(1, floorReqFor(p, f) - floorReqFor(p, f - 1));
  return Math.max(1, Math.round(games * totalDiamondsPerLevelExpected(p) * p.diamondCostIncomeRatio));
}

/** 점포 은행 수령 단위(층별). */
export function claimGoalFor(p: EconParams, fee: number, floor: number): number {
  const w = 1 + p.claimFloorWeight * Math.max(0, Math.floor(floor) - 1);
  return Math.max(1, Math.round(fee * p.claimUnitMult * w));
}

/** 오프라인 방치 수익(경과 시간, 캡 적용) — 건설층 수에 비례하지 않는 "기저" 값. 층 반영은 호출부에서. */
export function offlineIncomeFor(p: EconParams, fee: number, hours: number): number {
  const h = Math.min(p.offlineCapHours, Math.max(0, hours));
  return Math.round(fee * p.offlineRatePerHour * h);
}

/** 경쟁부지 — 경매 낙찰가/층당 증축비/완공 시 일 수익. */
export function compAuctionCost(p: EconParams, fee: number): number {
  return Math.round(fee * p.compAuctionMult);
}
/** 경쟁부지 증축비(2층부터) — 총투자가 층마다 compFloorCostMult 배가 되는 기하 구조(1층=낙찰에 포함). */
export function compFloorCost(p: EconParams, fee: number, floor: number): number {
  if (floor <= 1) return 0;
  const prevTotal = compAuctionCost(p, fee) * Math.pow(p.compFloorCostMult, floor - 2);
  return Math.round(prevTotal * (p.compFloorCostMult - 1));
}
/** 경쟁부지 총투자(낙찰+증축 floors 층까지) = 낙찰가 × 배율^(층-1). */
export function compTotalInvested(p: EconParams, fee: number, floors: number): number {
  if (floors < 1) return 0;
  return Math.round(compAuctionCost(p, fee) * Math.pow(p.compFloorCostMult, Math.min(floors, p.compFloors) - 1));
}
/** 경쟁부지 일 수익 = 현재 투자 총액 ÷ ROI 일수. */
export function compDailyYield(p: EconParams, fee: number, floors: number): number {
  if (floors < 1) return 0;
  return Math.round(compTotalInvested(p, fee, floors) / Math.max(1, p.compRoiDays));
}

/** JSON(부분) → 파라미터 병합 + 숫자 보정(시뮬 도구/economy.json 로더 공용). */
export function coerceEcon(raw: unknown): EconParams {
  if (!raw || typeof raw !== 'object') return DEFAULT_ECON;
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...DEFAULT_ECON };
  for (const key of Object.keys(DEFAULT_ECON) as (keyof EconParams)[]) {
    const v = src[key];
    const d = DEFAULT_ECON[key];
    if (typeof d === 'number' && typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    else if (Array.isArray(d) && Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x))) out[key] = [...v];
  }
  // **starMult 길이 보정** — 별이 1~3이던 시절 저장된 economy.json 은 3칸이다. 그대로 두면 4·5★ 가
  //   undefined → NaN 코인이 된다. 모자란 칸은 기본 곡선으로 채우고, 넘치면 잘라 5칸으로 맞춘다.
  const sm = out.starMult as number[];
  if (!Array.isArray(sm) || sm.length !== DEFAULT_ECON.starMult.length) {
    const base = Array.isArray(sm) ? sm : [];
    out.starMult = DEFAULT_ECON.starMult.map((d, i) => (typeof base[i] === 'number' ? base[i] : d));
  }
  return out as unknown as EconParams;
}
