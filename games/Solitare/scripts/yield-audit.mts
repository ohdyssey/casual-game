/**
 * yield-audit.mts — **한 판당 획득량 실측**(메인 솔리테어 vs 보너스 게임) — PO 2026-08-30
 *   "프리셀에서 만든 추가 획득 아이템이나 별 등의 데이터를 점검하고 … 솔리테어 한 판당 획득 밸런스를 맞춰라".
 *
 * 두 게임을 **같은 자(리그 별·다이아·컬렉션 카드·코인·부스터)** 로 잰다. 그리디 봇 플레이아웃에
 * 각 씬의 **미션 규칙을 그대로** 얹는다:
 *   - 메인(PlayScene): 연속 5매칭마다 미션 1건, 뽑기로 끊김. 정산은 콤보가 끊길 때 — 건마다 별 = 콤보 길이(≥5).
 *     보상표 MISSION_REWARD_TABLE(레벨별 컬렉션 가중). 보드 다이아 1(+20% 2). 승리 시 코인 = starCoinsAt.
 *   - 보너스(PlayKlondikeScene): 성공한 수마다 콤보, 5수마다 미션 1건, 뽑기·재순환으로 끊김. 건마다 별 =
 *     max(5, floor(콤보/건수)). 보상표 bonusMissionTable(별·다이아·컬렉션만). 판 시작 보드 다이아(모드별 확률).
 *     승리 시 코인 = BONUS_WIN_COINS · 등급 별 = min(5, 1+미션수).
 *
 * 사용: npx tsx scripts/yield-audit.mts [--levels 1-300] [--step 10] [--tries 30]
 */
import fs from 'node:fs';
import { seededRng } from '../src/logic/deck.js';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { dealDynamic } from '../src/logic/solvable.js';
import { authoredFromRuntime, runtimeFromAuthored, gradeForLevel } from './level-curve.mts';
import { RESCUE_MAX_LEVEL, clearRewardsForGrade, MISSION_REWARD_TABLE, MISSION_SET_SIZE, collectionWeightForLevel, bonusMissionTable, rollBonusMissionRewardAvoiding, type MissionRewardKind } from '../src/logic/economyRules.js';
import { playout } from './play-sim.mts';
import { starCoinsAt } from '../src/econRuntime.js';
import { dealKlondikeForLevel, usefulMovesForAudit } from '../src/logic/klondikeDifficulty.js';
import { applyMove, drawFromStock, recycleWaste, isWon, type KlondikeState } from '../src/logic/klondike.js';
import { BONUS_WIN_COINS, BONUS_BOARD_DIAMOND_RATE, BONUS_DRAW_COUNT, type BonusMode } from '../src/logic/bonusGame.js';
import { bonusRoundStars } from '../src/logic/bonusStars.js';

const argOf = (n: string, d: string): string => { const i = process.argv.indexOf('--' + n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const [LFROM, LTO] = argOf('levels', '1-300').split('-').map(Number);
const STEP = Number(argOf('step', '10'));
const TRIES = Number(argOf('tries', '30'));

type Yield = { rounds: number; wins: number; ticks: number; stars: number; diamonds: number; collection: number; coins: number; cards: number; wild: number; undo: number };
const zero = (): Yield => ({ rounds: 0, wins: 0, ticks: 0, stars: 0, diamonds: 0, collection: 0, coins: 0, cards: 0, wild: 0, undo: 0 });
const add = (a: Yield, b: Partial<Yield>): Yield => ({ ...a, ...Object.fromEntries(Object.entries(b).map(([k, v]) => [k, (a as Record<string, number>)[k] + (v ?? 0)])) }) as Yield;

/** 메인 표에서 1건 추첨(PlayScene.rollMissionReward 와 동일). */
function rollMain(level: number, rng: () => number): MissionRewardKind {
  const table = MISSION_REWARD_TABLE.map((r) => (r.kind === 'collection' ? { ...r, weight: collectionWeightForLevel(level) } : r));
  const total = table.reduce((s, r) => s + r.weight, 0);
  let r = Math.floor(rng() * total) + 1;
  for (const row of table) { r -= row.weight; if (r <= 0) return row.kind; }
  return table[0].kind;
}

// ── 메인 ─────────────────────────────────────────────────────────────
type Doc = CardBoardDoc & { deal: { board: readonly number[]; waste: number; stock: number[] } };
const pack = JSON.parse(fs.readFileSync('public/levels/cardLevels.json', 'utf8')) as { levels: Record<string, Doc> };
const levels = Object.keys(pack.levels).map(Number).filter((l) => l >= LFROM && l <= LTO && (l - LFROM) % STEP === 0).sort((a, b) => a - b);

function auditMain(): Yield {
  let y = zero();
  for (const level of levels) {
    const doc = pack.levels[String(level)];
    const layout = cardBoardToLayout(doc, 'lv' + level);
    const grade = ((layout as { difficulty?: number }).difficulty ?? gradeForLevel(level)) as 1 | 2 | 3;
    const start = dealDynamic(layout, seededRng(level * 7919 + 104729), grade, { board: doc.deal.board, waste: doc.deal.waste, stockCount: authoredFromRuntime(runtimeFromAuthored(layout.stock ?? 0)), rescue: level <= RESCUE_MAX_LEVEL });
    for (let i = 0; i < TRIES; i++) {
      const rng = seededRng(level * 100000 + i * 7 + 1);
      const r = playout(layout, start, level, rng, false, { trackMissions: true });
      const rr = seededRng(level * 555 + i);
      const part: Partial<Yield> = { rounds: 1, wins: r.win ? 1 : 0, ticks: r.missionTicks?.length ?? 0 };
      let sets = 0;
      for (const tick of r.missionTicks ?? []) {
        sets++;
        const kind = rollMain(level, rr);
        if (kind === 'stars') part.stars = (part.stars ?? 0) + Math.max(MISSION_SET_SIZE, tick.filled);
        else if (kind === 'diamond') part.diamonds = (part.diamonds ?? 0) + 1;
        else if (kind === 'collection') part.collection = (part.collection ?? 0) + 1;
        else if (kind === 'cards' || kind === 'plus5') part.cards = (part.cards ?? 0) + 1;
        else if (kind === 'wild') part.wild = (part.wild ?? 0) + 1;
        else if (kind === 'undo') part.undo = (part.undo ?? 0) + 1;
      }
      if (r.win) {
        const boardDia = seededRng(level * 271 + 89)() < 0.2 ? 2 : 1; // PlayScene 보드 다이아 규칙.
        const grade = Math.min(5, Math.max(1, sets));
        const clear = clearRewardsForGrade(grade); // 클리어 정산(2026-08-30) + 등급 별.
        part.diamonds = (part.diamonds ?? 0) + boardDia + clear.diamonds;
        part.stars = (part.stars ?? 0) + clear.leagueStars;
        part.collection = (part.collection ?? 0) + clear.collectionCards;
        part.coins = starCoinsAt(level, grade);
      } else {
        // ⚠️ 지면 별(pendingStars)·다이아(pendingDiamonds)는 사라진다 — 컬렉션 카드·부스터만 즉시 저장이라 남는다.
        part.stars = 0;
        part.diamonds = 0;
      }
      y = add(y, part);
    }
  }
  return y;
}

// ── 보너스 ────────────────────────────────────────────────────────────
function auditBonus(mode: BonusMode, timed: boolean): Yield {
  let y = zero();
  const table = (level: number) => bonusMissionTable(level);
  for (const level of levels) {
    const draw = BONUS_DRAW_COUNT[mode];
    for (let i = 0; i < TRIES; i++) {
      const rng = seededRng(level * 31337 + i * 11 + (timed ? 7 : 0));
      let s: KlondikeState = dealKlondikeForLevel(rng, level, undefined, draw);
      let combo = 0, pending = 0, missionsDone = 0, prev: MissionRewardKind | undefined;
      const part: Partial<Yield> = { rounds: 1 };
      const grant = (starsEach: number) => {
        const kind = rollBonusMissionRewardAvoiding(level, rng, prev);
        prev = kind;
        part.ticks = (part.ticks ?? 0) + 1;
        if (kind === 'stars') part.stars = (part.stars ?? 0) + starsEach;
        else if (kind === 'diamond') part.diamonds = (part.diamonds ?? 0) + 1;
        else part.collection = (part.collection ?? 0) + 1;
      };
      const breakCombo = () => {
        if (pending > 0) { const each = Math.max(5, Math.floor(combo / pending)); for (let k = 0; k < pending; k++) grant(each); pending = 0; }
        combo = 0;
      };
      let mark = -1, stalled = 0, won = false;
      for (let g = 0; g < 4000; g++) {
        if (isWon(s)) { won = true; break; }
        const mv = usefulMovesForAudit(s, rng, 0.12);
        const next = mv ? applyMove(s, mv) : null;
        if (next) { s = next; combo++; if (combo % 5 === 0) { pending++; missionsDone++; } continue; }
        breakCombo();
        if (s.stock.length > 0) { s = drawFromStock(s); continue; }
        if (s.waste.length === 0) break;
        const now = s.foundations.S + s.foundations.H + s.foundations.D + s.foundations.C;
        if (now === mark && ++stalled >= 2) break;
        if (now !== mark) { mark = now; stalled = 0; }
        s = recycleWaste(s);
      }
      breakCombo();
      if (!won) {
        // ⚠️ 보너스는 지면 원장 전체가 사라진다(결과 화면이 곧 수집 지점).
        part.stars = 0; part.diamonds = 0; part.collection = 0;
      }
      if (won) {
        part.wins = 1;
        part.coins = BONUS_WIN_COINS[mode][timed ? 'timed' : 'normal'];
        part.stars = (part.stars ?? 0) + bonusRoundStars({ won: true, missionsCompleted: missionsDone });
        if (rng() < BONUS_BOARD_DIAMOND_RATE[mode][timed ? 'timed' : 'normal']) part.diamonds = (part.diamonds ?? 0) + 1;
      }
      void table;
      y = add(y, part);
    }
  }
  return y;
}

const fmt = (y: Yield) => {
  const per = (v: number) => (v / Math.max(1, y.rounds)).toFixed(2);
  const perWin = (v: number) => (v / Math.max(1, y.wins)).toFixed(2);
  return { rounds: y.rounds, winRate: +(y.wins / y.rounds).toFixed(3), perRound: { ticks: per(y.ticks), stars: per(y.stars), diamonds: per(y.diamonds), collection: per(y.collection), coins: per(y.coins), cards: per(y.cards), wild: per(y.wild), undo: per(y.undo) }, perWin: { stars: perWin(y.stars), diamonds: perWin(y.diamonds), collection: perWin(y.collection), coins: perWin(y.coins) } };
};
const out = {
  levels: levels.length,
  main: fmt(auditMain()),
  bonus_draw1: fmt(auditBonus('draw1', false)),
  bonus_draw1_timed: fmt(auditBonus('draw1', true)),
  bonus_draw3: fmt(auditBonus('draw3', false)),
};
console.log(JSON.stringify(out, null, 1));
