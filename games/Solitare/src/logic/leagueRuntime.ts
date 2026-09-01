/**
 * leagueRuntime.ts — 리그 **세이브 연결부**. 순수 시뮬(`league.ts`)과 저장을 잇는 얇은 층이다.
 *
 * 여기만 세이브를 안다. 시뮬은 세이브를 모르고, 화면은 시뮬을 모른다 — 세 층이 섞이면
 * "점수는 올랐는데 순위표는 그대로" 같은 어긋남을 재현조차 못 하게 된다.
 *
 * ## 점수는 **별**이다
 * 판을 이기면 완성 세트 수만큼 별(1~5)을 받는다. 그 값을 그날 리그 점수에 더한다
 * (근거는 `config/league.ts` 주석).
 */
import { loadSave, writeSave, type SaveData } from '../save.js';
import { normalizeProfile } from './profile.js';
import { periodIdFor, periodProgress, settleLeague, standings, type LeagueSettleResult, type LeagueStanding } from './league.js';
import { advance, thiefPeriodId } from './thiefEvent.js';
import { eventGrandCoins, eventGrandDiamonds } from '../config/thiefEvent.js';

/** 세이브에서 프로필(이름·아바타)을 꺼낸다 — 리그 표시에 쓰는 단 하나의 경로. */
export function profileOf(save: SaveData): { name: string; avatar: number } {
  return normalizeProfile(save.profile, save.level * 7919 + save.coins);
}

/**
 * 기간 전환 정산 — 진입 시 한 번 부른다. 지난 기간 기록이 있으면 최종 순위로 보상을 주고
 * 점수를 새 기간으로 되돌린다. **보상 지급까지 여기서 마친다**(호출부는 결과만 보여 준다).
 */
export function settleLeagueIfNeeded(now = new Date()): LeagueSettleResult {
  const save = loadSave();
  const nowPeriodId = periodIdFor(now);
  const me = profileOf(save);
  const result = settleLeague({
    savedPeriodId: save.leaguePeriodId ?? 0,
    savedPoints: save.leaguePoints ?? 0,
    nowPeriodId,
    myName: me.name,
    myAvatar: me.avatar,
  });
  if ((save.leaguePeriodId ?? 0) !== nowPeriodId) {
    save.leaguePeriodId = nowPeriodId;
    save.leaguePoints = 0;
    if (result.settled) save.coins += result.coins;
    writeSave(save);
  }
  return result;
}

/** 판을 이겨서 받은 별을 그날 리그 점수에 더한다. 반환 = 더한 뒤 총점. */
export function addLeaguePoints(stars: number, now = new Date()): number {
  const add = Math.max(0, Math.floor(stars));
  const save = loadSave();
  const nowPeriodId = periodIdFor(now);
  // 기간이 바뀐 채로 판이 끝났을 수 있다(자정을 넘겨 플레이) — 그때는 새 기간부터 쌓는다.
  const base = (save.leaguePeriodId ?? 0) === nowPeriodId ? (save.leaguePoints ?? 0) : 0;
  save.leaguePeriodId = nowPeriodId;
  save.leaguePoints = base + add;
  writeSave(save);
  return save.leaguePoints;
}

/**
 * **Catch the Thief 사다리 진행** — 판을 클리어할 때마다 1칸 채운다. 칸을 넘기면 그 칸의
 * 코인 보상을 즉시 지급하고, 완주하면 완주 보너스(코인·다이아)까지 준다.
 * 반환값은 이번에 지급한 코인(0이면 아직 칸 안).
 */
export function creditThiefEvent(now = new Date()): { coins: number; diamonds: number; stagesCleared: number; justCleared: boolean } {
  const save = loadSave();
  const periodId = thiefPeriodId(now);
  const r = advance(save.thiefEvent, periodId, 1);
  save.thiefEvent = r.next;
  let diamonds = 0;
  let coins = r.coins;
  if (r.justCleared) {
    coins += eventGrandCoins();
    diamonds = eventGrandDiamonds();
  }
  if (coins > 0) save.coins += coins;
  if (diamonds > 0) save.diamonds = (save.diamonds ?? 0) + diamonds;
  writeSave(save);
  return { coins, diamonds, stagesCleared: r.stagesCleared, justCleared: r.justCleared };
}

/** 지금 시점의 순위표(표시용). */
export function currentStandings(now = new Date()): LeagueStanding {
  const save = loadSave();
  const me = profileOf(save);
  const periodId = periodIdFor(now);
  const points = (save.leaguePeriodId ?? 0) === periodId ? (save.leaguePoints ?? 0) : 0;
  return standings(periodId, points, periodProgress(now), me.name, me.avatar);
}
