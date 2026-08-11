/**
 * 코인 지갑 — 리그 입장료(entryFee)/보상(reward)의 실제 재화. 순수 로직(Phaser 무관).
 *
 * 사용자 요청("게임내 재화 설계") 응답 — 여러 재화(코인+젬+다이아) 대신 **코인 하나**로 단순화.
 * league.ts 의 entryFee/reward 는 지금까지 "카드 표시 전용"이었다(그 파일 주석 참조 — 실제로
 * 차감·지급하는 경제가 없었다). 이 모듈이 그 첫 실물 소비처다(사용자 결정: "PvP 재도전 티켓" —
 * 별도 티켓 카운터를 새로 만들지 않고, 이미 리그 카드에 있던 입장료 자체를 재도전 게이트로 쓴다.
 * 코인이 있으면 광고 없이 바로 재대결, 없으면 광고/그라인드로 채워야 한다).
 *
 * 서버가 없어 localStorage 가 단일 진실 — 다른 로컬 재화(광고제거 플래그 등)와 같은 패턴.
 * 매 호출마다 localStorage 를 그대로 읽고 쓴다(모듈 레벨 캐시 없음) — 값이 하나뿐이라 캐싱
 * 이득이 적고, 캐시가 있으면 테스트마다 모듈을 다시 임포트해야 하는 번거로움만 생긴다.
 */
const COIN_STORAGE_KEY = 'homerun_coins';
/**
 * 시작 자금 — 10,000(사용자 요청: "코인을 1만 포인트 지급하라"). 클럽리그 입장료(2,500) 기준
 * 4회 입장 여유. (이전 3,000 — 상향 시점 2026-08-03.)
 */
const STARTING_COINS = 10000;
/** 1회성 지급 기록 키 — 이미 받은 지급 id 목록(JSON 배열). */
const GRANTS_STORAGE_KEY = 'homerun_coin_grants';
/** 출시 지급 — 이 id 가 기록에 없으면 1회 지급한다. 금액을 바꾸려면 id 도 새로 발급할 것. */
const LAUNCH_GRANT_ID = 'launch_10k_v1';
const LAUNCH_GRANT_AMOUNT = 10000;

/** localStorage 자체가 없거나 막힌 경우(사생활 보호 모드 등)의 세션 한정 대체값. */
let memoryFallback = STARTING_COINS;

function readCoins(): number {
  try {
    const raw = localStorage.getItem(COIN_STORAGE_KEY);
    if (raw === null) return STARTING_COINS;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : STARTING_COINS;
  } catch {
    return memoryFallback;
  }
}

function writeCoins(n: number): void {
  memoryFallback = n;
  try {
    localStorage.setItem(COIN_STORAGE_KEY, String(n));
  } catch {
    /* localStorage 사용 불가 — memoryFallback 만으로 이번 세션 유지(새로고침하면 초기화된다) */
  }
}

export function getCoins(): number {
  return readCoins();
}

/** 코인 지급(양수만). 새 잔액을 반환. */
export function addCoins(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return getCoins();
  const next = getCoins() + Math.round(amount);
  writeCoins(next);
  return next;
}

/** 코인 차감 — 잔액이 모자라면 아무것도 안 바꾸고 false. */
export function spendCoins(amount: number): boolean {
  const cur = getCoins();
  if (!Number.isFinite(amount) || amount <= 0 || cur < amount) return false;
  writeCoins(cur - amount);
  return true;
}

export function canAfford(amount: number): boolean {
  return getCoins() >= amount;
}

/**
 * 출시 1만 코인 지급(사용자 요청) — 부팅 시 1회 호출(LobbyScene.create).
 *  · 신규(저장값 없음): 시작 자금 자체가 10,000 이므로 지급 없이 기록만 남긴다(이중 지급 방지).
 *  · 기존(저장값 있음): 잔액에 +10,000 을 1회 더한다.
 * 지급 여부는 GRANTS_STORAGE_KEY 의 id 목록으로 멱등 보장 — 새 지급 이벤트는 id 를 새로 만든다.
 * @returns 이번 호출에서 실제로 지급했으면 true.
 */
export function ensureLaunchGrant(): boolean {
  let granted: string[] = [];
  try {
    granted = JSON.parse(localStorage.getItem(GRANTS_STORAGE_KEY) ?? '[]') as string[];
    if (!Array.isArray(granted)) granted = [];
  } catch {
    return false; // 저장소를 못 쓰면 지급 기록도 못 남긴다 — 매번 주는 것보다 안 주는 쪽이 안전.
  }
  if (granted.includes(LAUNCH_GRANT_ID)) return false;
  const isExisting = (() => {
    try {
      return localStorage.getItem(COIN_STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  })();
  if (isExisting) addCoins(LAUNCH_GRANT_AMOUNT);
  try {
    localStorage.setItem(GRANTS_STORAGE_KEY, JSON.stringify([...granted, LAUNCH_GRANT_ID]));
  } catch {
    /* 기록 실패 — 다음 부팅에 재시도된다(기존 유저는 최악의 경우 중복 지급이지만 로컬 데모 재화라 허용) */
  }
  return isExisting;
}
