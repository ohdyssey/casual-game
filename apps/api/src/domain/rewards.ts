/**
 * 보상 카탈로그 — **금액은 서버가 정한다.**
 *
 * 이것이 "서버 권위 지갑"의 핵심이다. 클라는 `source`(무엇을 했는지)만 말하고 **얼마인지는
 * 말하지 않는다**. 클라가 금액을 보내는 순간 지갑은 그저 클라의 주장을 받아 적는 장부가 되고,
 * localStorage 편집 치트가 그대로 서버로 승격된다(코드 분석 2026-08-15의 지적).
 *
 * ⚠️ 여기 없는 source 는 거절한다 — 화이트리스트가 곧 방어선이다.
 * 리모트 컨피그가 붙으면 이 표를 DB/컨피그에서 읽되, **클라 입력은 끝까지 source 뿐**이어야 한다.
 */
import type { Reward } from './types.js';

/** 지급 가능한 보상 출처. */
export type RewardSource =
  | 'daily_login'
  | 'daily_login_streak'
  | 'mission_clear'
  | 'league_reward'
  | 'run_settle'
  | 'signup_bonus'
  | 'solitaire_league_grand'
  | 'solitaire_clear_reward';

/**
 * 출처별 지급액.
 *
 * `run_settle`(런 정산)이 0인 이유: 런 보상은 **점수에 비례**하므로 고정표로 줄 수 없다.
 * S3(리플레이 검증)에서 서버가 입력열을 재실행해 점수를 산출한 뒤 그 점수로 계산한다.
 * 그때까지 이 출처는 열어 두되 0 으로 두어 **클라가 임의 금액을 넣을 길을 막는다**.
 *
 * `solitaire_league_grand`도 같은 이유로 0이다 — **날짜(periodId)에 따라 서버가 정하는 금액**이라
 * 고정표로 못 준다. 클라가 "얼마 받을지"를 고를 수 있으면(예: source 를 여러 개 두고 큰 값을 요청)
 * 서버 권위가 무너진다. 실제 금액은 `solitaireLeagueGrandReward()`가 **서버 시계 기준**으로 계산해
 * 라우트가 이 카탈로그값 대신 그 결과를 쓴다(라우트 쪽 분기는 `routes/wallet.ts` 참조).
 *
 * `solitaire_clear_reward`도 0 — 레벨 클리어 등급(1~5, 클라가 **신고**)에 따라 금액이 갈린다.
 * 클라는 "몇 별로 깼는지"만 말하고(별 자체를 조작해도 이득이 등급표 범위 안으로 제한된다),
 * 실제 다이아·코인 수는 `solitaireClearReward()`가 계산한다.
 * ⚠️ 지금은 이 지급이 **로컬 세이브를 덮어쓰지 않는다** — `save.ts`의 코인·다이아는 이 외에도 여러
 * 출처(컬렉션 완성·이벤트·상점·미션박스 등)가 있어 서버 지갑 값으로 통째로 교체하면 그 출처들이
 * 사라진다. 지금은 **감사용 서버 원장 미러링**(추가만, 로컬 권위 유지) — 전체 재화 출처가 서버로
 * 이전되기 전까지는 이 상태를 유지한다(`games/Solitare/docs/SERVER_INTEGRATION.md` §P1 참조).
 * ⚠️ 코인은 특히 더 근사값이다 — 게임 클라는 라이브옵스 도구(`design/econ-board.html`)가 배포하는
 * `public/econ/economy.json`을 런타임에 읽어(`econRuntime.ts`) 경제 파라미터를 코드 배포 없이
 * 바꿀 수 있는데, 서버는 그 파일을 구독하지 않고 **`DEFAULT_ECON` 고정 사본**으로만 계산한다.
 * 라이브옵스가 파라미터를 튜닝하면 이 코인 미러 값은 실제 지급액과 어긋난다 — 감사 원장 용도로만
 * 쓰고(다이아처럼 로컬을 덮어쓰지 않으므로 무해), **경제 파라미터 튜닝 시마다 이 값을 신뢰하지 말 것**.
 */
export const REWARD_CATALOG: Readonly<Record<RewardSource, Reward>> = {
  signup_bonus: { coins: 1000, gems: 5 },
  daily_login: { coins: 200 },
  daily_login_streak: { coins: 500, gems: 1 },
  mission_clear: { coins: 300 },
  league_reward: { coins: 1000 },
  run_settle: {},
  solitaire_league_grand: {},
  solitaire_clear_reward: {},
};

/**
 * **솔리테어 투데이 리그 — 그랜드 다이아 톱니바퀴**(게임 클라 `logic/dailyLeague.ts`의
 * `leagueGrandDiamonds`/`grandDiamondMultFor`와 **알고리즘을 동일하게 유지**해야 한다 — 클라가
 * 화면에 보여주는 예상 지급액과 서버가 실제로 주는 금액이 어긋나면 안 되기 때문. 둘을 한 곳에서
 * import 할 공유 패키지가 아직 없어(P1 `packages/contracts` 추출 전) 지금은 **의도적으로 중복**해
 * 둔다 — 값을 바꿀 땐 두 파일 다 고칠 것(양쪽에 서로를 가리키는 주석을 남겨 둔다).
 *
 * 6일 주기(1.3·1.0·0.7배)로 오가다, 13일째부터 9일마다(10의 배수 제외) 0.3배 계곡.
 */
const GRAND_DIA_BASE = 300;
const GRAND_DIA_CYCLE = [1.3, 1.0, 0.7, 1.0, 1.3, 0.7] as const;
const GRAND_DIA_VALLEY_FROM = 13;
const GRAND_DIA_VALLEY_EVERY = 9;
const GRAND_DIA_VALLEY_MULT = 0.3;

function grandDiamondMultFor(periodId: number): number {
  const d = Math.abs(Math.floor(periodId));
  if (d >= GRAND_DIA_VALLEY_FROM && (d - GRAND_DIA_VALLEY_FROM) % GRAND_DIA_VALLEY_EVERY === 0 && d % 10 !== 0) {
    return GRAND_DIA_VALLEY_MULT;
  }
  return GRAND_DIA_CYCLE[d % GRAND_DIA_CYCLE.length]!;
}

/** 오늘(periodId) 그랜드 다이아 지급액 — `gems`로 매핑(플랫폼 지갑은 프리미엄 재화를 gems 하나로 다룬다). */
export function solitaireLeagueGrandReward(periodId: number): Reward {
  return { gems: Math.max(1, Math.round(GRAND_DIA_BASE * grandDiamondMultFor(periodId))) };
}

/**
 * **솔리테어 레벨 클리어 다이아**(게임 클라 `logic/economyRules.ts`의 `clearRewardsForGrade`와
 * 알고리즘 동일 유지 — 등급 4 이상만 1다이아, 그 아래는 0). 리그별·컬렉션 카드는 여기 없다 —
 * 지갑(coins/gems) 밖의 별개 진행도라 이 엔드포인트 범위가 아니다.
 */
const CLEAR_DIAMOND_BONUS_FROM_GRADE = 4;

/**
 * 코인 곡선 상수 — 게임 클라 `logic/economy.ts` `DEFAULT_ECON`의 **관련 필드만** 고정 사본으로 둔다
 * (전체를 복제하지 않는다 — 이 계산에 실제로 쓰이는 4개 필드뿐). 라이브옵스 튜닝은 반영 안 됨(위 주석).
 */
const ECON_FEE_BASE = 1500;
const ECON_FEE_STEP_MULT = 1.129;
const ECON_FEE_LEVEL_STEP = 150;
const ECON_FEE_ROUND = 100;
const ECON_LEVEL_CAP = 3000;
/** 별 1~5 보상 배수(게임비 대비) — `DEFAULT_ECON.starMult`와 동일 사본. */
const ECON_STAR_MULT = [0.3, 0.65, 1.0, 1.35, 1.75] as const;
/** 도전 배수 화이트리스트 — `DEFAULT_ECON.challengeMults`와 동일. 클라가 임의 배수를 못 넣게 막는다. */
const ECON_CHALLENGE_MULTS = [1, 2, 3, 5] as const;

function feeForLevel(level: number): number {
  const lv = Math.min(ECON_LEVEL_CAP, Math.max(1, Math.floor(level)));
  const steps = Math.floor((lv - 1) / ECON_FEE_LEVEL_STEP);
  const raw = ECON_FEE_BASE * Math.pow(ECON_FEE_STEP_MULT, steps);
  return Math.max(ECON_FEE_ROUND, Math.floor(raw / ECON_FEE_ROUND) * ECON_FEE_ROUND);
}

function clampChallengeMult(mult: number): number {
  return (ECON_CHALLENGE_MULTS as readonly number[]).includes(mult) ? mult : 1;
}

/**
 * `grade`(1~5, 클라 신고) + `level`(1~3000) + `mult`(도전 배수, 화이트리스트 외 값은 1로 접힘) →
 * 다이아·코인 감사 미러 값. **로컬 세이브를 덮어쓰지 않는다** — 위 주석의 근사치 경고를 볼 것.
 */
export function solitaireClearReward(grade: number, level: number, mult: number): Reward {
  const g = Math.min(5, Math.max(1, Math.round(grade)));
  const fee = feeForLevel(level);
  const coins = Math.round(fee * ECON_STAR_MULT[g - 1] * clampChallengeMult(mult));
  return { gems: g >= CLEAR_DIAMOND_BONUS_FROM_GRADE ? 1 : 0, coins };
}

/** 알려진 출처인가 — 라우트 경계에서 먼저 확인한다. */
export function isRewardSource(v: unknown): v is RewardSource {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(REWARD_CATALOG, v);
}

/** 출처 → 지급액(불변 사본). */
export function rewardFor(source: RewardSource): Reward {
  return { ...REWARD_CATALOG[source] };
}
