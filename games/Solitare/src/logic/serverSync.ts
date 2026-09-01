/**
 * `apps/api`(서버 권위 지갑 + 클라우드 세이브 + 리그 밴드) 미러링/백업 — **P1~P3**.
 *
 * ⚠️ 로컬 세이브(`save.ts`)는 여전히 유일한 권위다. `mirror*` 계열은 "이미 로컬에 확정된 지급
 * 이벤트"를 서버 원장에도 **추가로**(fire-and-forget) 기록할 뿐 — 서버 응답으로 로컬 값을 덮어쓰지
 * 않는다. 코인·다이아는 이 두 이벤트 말고도 컬렉션 완성·이벤트·상점 등 로컬 전용 출처가 많아서,
 * 지갑 값으로 통째로 교체하면 그 출처들이 사라진다(`docs/SERVER_INTEGRATION.md` §2-1 참조).
 * 코인은 특히 **근사값**이다(라이브옵스 `economy.json` 튜닝을 서버가 구독하지 않음, 같은 문서 참조).
 *
 * `backupTowerSnapshot`은 G2(타워·컬렉션·미션 등 로컬 우선 상태)를 서버 세이브 슬롯에 **가끔**
 * 통째로 올려 두는 것 — 기기를 잃어버렸을 때 되살릴 최후 수단이지, 실시간 동기화가 아니다.
 *
 * 실패해도 게임에 아무 영향이 없다(호출부는 반환값을 기다리거나 확인하지 않는다) — 오프라인이든
 * 서버가 죽어있든 플레이는 그대로 진행된다.
 */
import {
  getLeagueRoster,
  getSave,
  grantReward,
  linkedAccountEmail,
  loginWithGoogle,
  putSave,
  reportLeagueRound,
  type ApiClientConfig,
} from '@casual/core';
import { setServerRoster } from './league.js';

const API_BASE = 'https://playpop-api-428242657453.asia-northeast3.run.app';
const CFG: ApiClientConfig = { baseUrl: API_BASE, tenant: 'game:solitaire' };
/** 세이브 라우트의 게임 id(영소문자·숫자·하이픈만 — `apps/api` `GameIdSchema`). */
const GAME_ID = 'solitaire-heights';

/** Google Cloud Console(ryanlogicgame 프로젝트) 웹 OAuth 클라이언트 — 2026-09-01 발급. */
export const GOOGLE_CLIENT_ID = '956456427529-b3t5na1tkt34k4qufefbohlck2anispp.apps.googleusercontent.com';

/**
 * 구글 로그인 — **지금 로그인된 계정에 연동**(새 계정 아님, 진행도 보존). 실패해도 `null`을
 * 돌려줄 뿐 게임에 영향이 없다 — 익명 로그인은 계속 유효하다(구글 로그인은 선택 사항).
 */
export function googleLogin(idToken: string): Promise<{ email?: string } | null> {
  return loginWithGoogle(CFG, idToken);
}

/** 지금 구글 등으로 연동돼 있으면 그 이메일, 아니면 `null` — 설정 화면 표시용. */
export function linkedEmail(): string | null {
  return linkedAccountEmail();
}

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * 레벨 클리어(등급 1~5 + 레벨 + 도전 배수) — 다이아·코인 지급을 서버 원장에 미러링.
 * 코인은 서버가 `DEFAULT_ECON` 고정 사본으로 재계산한 **근사값**(라이브옵스 튜닝 미반영).
 */
export function mirrorClearReward(grade: number, level: number, mult: number): void {
  void grantReward(CFG, 'solitaire_clear_reward', `clear-${randomId()}`, {
    grade: Math.round(grade),
    level: Math.round(level),
    mult,
  });
}

/** 투데이 리그 완주 그랜드 다이아 — 서버 원장에 미러링(금액은 서버가 자기 시계로 재계산). */
export function mirrorLeagueGrand(): void {
  void grantReward(CFG, 'solitaire_league_grand', `league-${randomId()}`);
}

/**
 * 리그 밴드 집계용 판 결과 신고(P2 인프라) — **순위표 표시는 여전히 로컬**
 * (`logic/league.ts` `buildRoster`), 이건 서버 `player_tier` 집계를 조용히 쌓을 뿐이다.
 * 승리 판만 신고한다(패배·이탈 경로는 여러 곳이라 이번 단계에서는 범위 밖 — `docs/SERVER_INTEGRATION.md` §6).
 */
export function mirrorRoundReport(level: number, stars: number): void {
  void reportLeagueRound(CFG, Math.round(level), true, Math.round(stars));
}

/**
 * **P3** — 그 기간의 밴드 보정 봇 명단을 미리 받아 `logic/league.ts`의 캐시에 채운다.
 * fire-and-forget: 응답이 늦거나 실패해도 `buildRoster`가 알아서 로컬 알고리즘으로 폴백하므로
 * 호출부는 결과를 기다릴 필요가 없다. 화면 진입 시(홈 `create()`) 한 번 부르는 정도로 충분하다 —
 * 리그 정산·순위표는 이 캐시가 채워지는 순간부터 자동으로 반영된다(다음 `buildRoster` 호출부터).
 */
export function prefetchLeagueRoster(periodId: number): void {
  void (async () => {
    const res = await getLeagueRoster(CFG, periodId);
    if (res) setServerRoster(periodId, res.bots);
  })();
}

/** 마지막 백업 이후 최소 간격(ms) — 매 판마다 부르는 호출부가 있어도 실제 왕복은 이 간격으로 줄인다. */
const BACKUP_MIN_INTERVAL_MS = 5 * 60 * 1000;
let lastBackupAttemptAt = 0;
/** 서버가 알고 있는 rev — 없으면 0(신규)부터. 충돌(409)해도 재시도하지 않고 다음 기회에 새로 읽는다. */
let knownRev: number | null = null;

/**
 * 타워/컬렉션/미션 등 로컬 우선(G2) 상태를 서버 세이브 슬롯에 **가끔** 통째로 백업한다.
 * 호출부는 원하는 만큼 자주 불러도 된다(예: 레벨 클리어마다) — 실제 네트워크 왕복은
 * `BACKUP_MIN_INTERVAL_MS`로 스로틀되고, 실패·충돌은 조용히 삼킨다(다음 기회에 재시도).
 */
export function backupTowerSnapshot(save: unknown): void {
  const now = Date.now();
  if (now - lastBackupAttemptAt < BACKUP_MIN_INTERVAL_MS) return;
  lastBackupAttemptAt = now;
  void (async () => {
    try {
      let rev = knownRev;
      if (rev === null) {
        const cur = await getSave(CFG, GAME_ID);
        rev = cur?.rev ?? 0;
      }
      const r = await putSave(CFG, GAME_ID, rev, save);
      knownRev = r?.rev ?? null; // 실패·충돌이면 null 로 되돌려 다음 시도 때 다시 GET.
    } catch {
      knownRev = null;
    }
  })();
}
