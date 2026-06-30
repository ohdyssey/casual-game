/**
 * econ/levers.ts — **레버 레지스트리**(콘솔 슬라이더 + 익스포트 메타데이터의 단일 출처).
 *
 * 각 레버 = 작업셋(WorkingState) 의 한 스칼라 필드 ↔ 소스 상수(srcName/srcFile) 매핑 + UI 범위(min/max/step) + 설명.
 *   get/set 으로 UI 바인딩, srcName 으로 익스포트(소스 상수 diff) 생성. (미션·럭표·리그밴드 = main.ts 의 표 편집기로 별도.)
 */
import type { EconParams } from './sim.js';
import type { LeagueParams } from './league.js';

export interface WorkingState {
  params: EconParams;
  league: LeagueParams;
}

export type LeverGroup = 'spins' | 'coin' | 'progression' | 'missions' | 'league' | 'sim';

export interface LeverDef {
  id: string;
  label: string;
  group: LeverGroup;
  srcName?: string; // 소스 상수명(익스포트용)
  srcFile?: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  drives: string;
  get: (ws: WorkingState) => number;
  set: (ws: WorkingState, v: number) => void;
}

const P = 'src/logic/playParams.ts';
const E = 'src/logic/economy.ts';
const PR = 'src/logic/progression.ts';

/** 스칼라 레버 레지스트리(그룹 순). */
export const LEVERS: ReadonlyArray<LeverDef> = [
  // ── 스핀(에너지) ──
  { id: 'startSpins', label: '시작 스핀', group: 'spins', srcName: 'START_SPINS', srcFile: P, min: 100, max: 800, step: 50, unit: '스핀',
    drives: '신규/일일 시작 스핀. 한 탱크 길이의 기준.', get: (w) => w.params.startSpins, set: (w, v) => (w.params.startSpins = v) },
  { id: 'dailySpins', label: '일일 지급', group: 'spins', srcName: 'DAILY_SPINS', srcFile: P, min: 0, max: 800, step: 50, unit: '스핀/일',
    drives: '하루 1회 보충. 순감소를 메우는 베이스라인(리텐션).', get: (w) => w.params.dailySpins, set: (w, v) => (w.params.dailySpins = v) },
  { id: 'bigWinBigX', label: '대박 임계(×베팅)', group: 'spins', srcName: 'BIGWIN_SPIN_BIG_X', srcFile: P, min: 5, max: 30, step: 1, unit: '×',
    drives: 'win≥베팅×이값이면 큰한방 스핀주입. 작은 상승니 빈도.', get: (w) => w.params.bigWinBigX, set: (w, v) => (w.params.bigWinBigX = v) },
  { id: 'bigWinBig', label: '대박 스핀(×베팅)', group: 'spins', srcName: 'BIGWIN_SPIN_BIG', srcFile: P, min: 0, max: 8, step: 1, unit: '×',
    drives: '큰한방 시 베팅×이값 스핀 주입.', get: (w) => w.params.bigWinBig, set: (w, v) => (w.params.bigWinBig = v) },
  { id: 'bigWinMegaX', label: '초대박 임계(×베팅)', group: 'spins', srcName: 'BIGWIN_SPIN_MEGA_X', srcFile: P, min: 20, max: 120, step: 5, unit: '×',
    drives: 'win≥베팅×이값이면 초대박 스핀주입.', get: (w) => w.params.bigWinMegaX, set: (w, v) => (w.params.bigWinMegaX = v) },
  { id: 'bigWinMega', label: '초대박 스핀(×베팅)', group: 'spins', srcName: 'BIGWIN_SPIN_MEGA', srcFile: P, min: 0, max: 15, step: 1, unit: '×',
    drives: '초대박 시 베팅×이값 스핀 주입.', get: (w) => w.params.bigWinMega, set: (w, v) => (w.params.bigWinMega = v) },

  // ── 코인 엔진 ──
  { id: 'slotRtpScale', label: '슬롯 RTP 스케일', group: 'coin', srcName: 'SLOT_RTP_SCALE', srcFile: E, min: 0.1, max: 0.4, step: 0.01, unit: '×',
    drives: '슬롯 라인배당 스케일. 낮을수록 슬롯단독 RTP↓(퍼즐멀티가 끌어올림). 결합 RTP의 주 노브.', get: (w) => w.params.slotRtpScale, set: (w, v) => (w.params.slotRtpScale = v) },
  { id: 'coinDenom', label: '코인 단위 배수', group: 'coin', srcName: 'COIN_DENOM', srcFile: P, min: 100, max: 10000, step: 100, unit: '코인/베팅',
    drives: '코인 베팅=베팅×이값. 골드 표시 절댓값 스케일(RTP 비율 무관).', get: (w) => w.params.coinDenom, set: (w, v) => (w.params.coinDenom = v) },
  { id: 'jackpotRake', label: '잭팟 레이크', group: 'coin', srcName: 'JACKPOT_RAKE', srcFile: E, min: 0, max: 0.05, step: 0.005, unit: '비율',
    drives: '매 스핀 베팅의 이 비율을 잭팟 풀에 적립(EV 중립).', get: (w) => w.params.jackpotRake, set: (w, v) => (w.params.jackpotRake = v) },
  { id: 'jackpotHitProb', label: '잭팟 당첨확률', group: 'coin', srcName: 'JACKPOT_HIT_PROB', srcFile: E, min: 0.0002, max: 0.003, step: 0.0001, unit: '확률',
    drives: '매 스핀 잭팟 당첨확률(≈1/1250). 풀 전액 지급.', get: (w) => w.params.jackpotHitProb, set: (w, v) => (w.params.jackpotHitProb = v) },
  { id: 'startCoins', label: '시작 코인', group: 'coin', srcName: 'START_COINS', srcFile: P, min: 0, max: 5_000_000, step: 100_000, unit: '코인',
    drives: '신규 시작 골드. 초반 시티 빌드 자금(초기 스핀 환급 surge 영향).', get: (w) => w.params.startCoins, set: (w, v) => (w.params.startCoins = v) },

  // ── 진행(시티) ──
  { id: 'cityCostBase', label: '시티 비용 기준(C0)', group: 'progression', srcName: 'CITY_COST_BASE', srcFile: PR, min: 50_000, max: 500_000, step: 25_000, unit: '코인',
    drives: '첫 업그레이드 비용. 코인 싱크 곡선의 시작점.', get: (w) => w.params.cityCostBase, set: (w, v) => (w.params.cityCostBase = v) },
  { id: 'cityCostGrowth', label: '시티 비용 성장(γ)', group: 'progression', srcName: 'CITY_COST_GROWTH', srcFile: PR, min: 1.2, max: 1.7, step: 0.05, unit: '×/레벨',
    drives: '레벨당 비용 ×γ. ⚠️핵심 불변식 γ>α(획득성장) 유지해야 목표 영속.', get: (w) => w.params.cityCostGrowth, set: (w, v) => (w.params.cityCostGrowth = v) },
  { id: 'incomePerLevel', label: '코인획득 배수 증가(α)', group: 'progression', srcName: 'INCOME_PER_LEVEL', srcFile: PR, min: 0, max: 0.2, step: 0.01, unit: '/레벨',
    drives: '시티레벨당 코인획득 배수 M(L)=1+α·L. ⚠️α<γ 필수.', get: (w) => w.params.incomePerLevel, set: (w, v) => (w.params.incomePerLevel = v) },
  { id: 'incomeMax', label: '코인획득 배수 상한', group: 'progression', srcName: 'INCOME_MAX', srcFile: PR, min: 2, max: 10, step: 1, unit: '×',
    drives: 'M(L) 캡. 후반 코인 인플레 방지.', get: (w) => w.params.incomeMax, set: (w, v) => (w.params.incomeMax = v) },
  { id: 'hotelSpinBase', label: '호텔 per-upgrade 스핀환급(폐지·0)', group: 'progression', srcName: 'HOTEL_SPIN_BASE', srcFile: PR, min: 0, max: 400, step: 25, unit: '스핀',
    drives: '⛔per-upgrade 스핀 환급 폐지(0=비활성·기하 폭주 제거). 스핀은 데일리+인플레이+스테이지 승급 고정보상에서만.', get: (w) => w.params.hotelSpinBase, set: (w, v) => (w.params.hotelSpinBase = v) },
  { id: 'hotelSpinGrowth', label: '호텔 스핀환급 성장(σ·참고용)', group: 'progression', srcName: 'HOTEL_SPIN_GROWTH', srcFile: PR, min: 1.0, max: 1.3, step: 0.02, unit: '×/레벨',
    drives: '(참고용 — 기준=0 이라 효과 없음. per-upgrade 환급 폐지.)', get: (w) => w.params.hotelSpinGrowth, set: (w, v) => (w.params.hotelSpinGrowth = v) },
  { id: 'maxCityLevel', label: '최대 시티레벨', group: 'progression', srcName: 'MAX_CITY_LEVEL', srcFile: PR, min: 10, max: 40, step: 1, unit: '레벨',
    drives: '시티 최대 진행(호텔 5×4=20). 코인 싱크 총량·성장 상한.', get: (w) => w.params.maxCityLevel, set: (w, v) => (w.params.maxCityLevel = v) },
  { id: 'missionGrowthPerLevel', label: '미션 목표 성장(δ)', group: 'progression', srcName: 'MISSION_GROWTH_PER_LEVEL', srcFile: PR, min: 0, max: 0.15, step: 0.01, unit: '/레벨',
    drives: '미션 목표=기준×(1+δ·L). 진행할수록 미션도 무거워짐.', get: (w) => w.params.missionGrowthPerLevel, set: (w, v) => (w.params.missionGrowthPerLevel = v) },

  // ── 시뮬 컨트롤(소스 아님 — 시뮬 입력) ──
  { id: 'bet', label: '시뮬 베팅(spinBet)', group: 'sim', min: 1, max: 1000, step: 1, unit: '스핀/라운드',
    drives: '시뮬에 쓰는 베팅. 톱니/드레인은 베팅무관(설계)이나 절대 코인은 비례.', get: (w) => w.params.bet, set: (w, v) => (w.params.bet = v) },

  // ── 리그 ──
  { id: 'leagueParticipation', label: '리그 참여율', group: 'league', min: 0, max: 1, step: 0.05, unit: '비율',
    drives: '주간 리그 점수획득 비율. 기대 주입에 선형.', get: (w) => w.league.participation, set: (w, v) => { w.league = { ...w.league, participation: v }; } },
  { id: 'leaguePeriodDays', label: '리그 주기', group: 'league', min: 1, max: 30, step: 1, unit: '일',
    drives: '정산 주기. 일평탄 주입=기대/주기.', get: (w) => w.league.periodDays, set: (w, v) => { w.league = { ...w.league, periodDays: v }; } },
];

/** 그룹 표시명. */
export const GROUP_LABELS: Record<LeverGroup, string> = {
  spins: '스핀 (에너지)',
  coin: '코인 엔진',
  progression: '진행 (시티)',
  missions: '미션',
  league: '리그 (추후)',
  sim: '시뮬 컨트롤',
};
