/**
 * PlayScene — 틱택토 네온 본편(싱글 vs 컴퓨터 · AI 스터디 · 대전).
 *
 *  · **대전 모드**(`mode: 'versus'`) — MatchScene 이 붙여 준 가상 유저(봇)와의 한 판.
 *    싱글과 규칙이 다르다: 버티기·스터디 안내·실수 경고가 전부 꺼지고, 선공은 무작위,
 *    보상은 포인트 대신 **레이팅**이며, 무한 셔플을 막는 무승부 상한이 붙는다.
 *    전적도 싱글(`tictactoe_v3`)과 분리 저장한다 — 두 모드의 난이도 곡선을 섞지 않기 위해서다.
 *
 *  · 배경 아트(841×1870)에 3×3 보드가 그려져 있다 → 셀 좌표는 배경 원본 좌표계로 정의하고
 *    cover 스케일로 캔버스(1080×2400)에 투영한다.
 *  · 말 나이 = 투명도(최신 100% → 15%씩 감소). 가장 오래된 말(70%)이 다음 이동 대상.
 *  · 턴 제한시간 — 기본 20초. **싱글 Lv.21 부터 등급당 1초씩 줄어 Lv.30 은 10초**(압박 축).
 *    하단 네온 무대 위 링 게이지 + 초수 역카운트. 초과 시 즉시 패배.
 *  · 선공 — 싱글 Lv.10 까지는 항상 사람, **Lv.11 부터 한 판씩 교차**(압박 축).
 *  · 승리조건(플레이어 유리): 3목 즉시 승리(+200P) 외에, 내 턴을 **목표 횟수**만큼 버텨내면
 *    승리를 확정(+100P)하거나 "최후승리 도전"(연장전, 3목 승리 +300P / 패배 0P)을 택할 수 있다.
 *    목표 턴은 **AI 등급에서 나온다** — Lv.1 = 10턴, 등급이 1 오를 때마다 +1턴(Lv.10 = 19턴).
 *  · **AI 스터디** — 승리 솔루션 20개(`logic/studySolutions.ts`)를 하나씩 푸는 학습 모드.
 *    매 턴 파란 박스+이유 말풍선으로 놓기·옮기기·막기를 10단계 이상 가르친 뒤 이긴다.
 *    상대는 **봐주지 않는다**(즉승은 두고 3목은 막는 정상 AI, 얕은 탐색). 안내수가 그
 *    상대의 응수를 시뮬레이션해 "지지 않으면서 10단계를 채우고 이기는 길"을 고르는 구조라,
 *    승리는 연출이 아니라 진짜 수읽기의 결과다.
 *    솔루션 1·2번은 첫 실행 때 자동으로 열리고, 나머지는 메뉴 화면에서 골라 이어서 푼다.
 *    ⚠️설명(말풍선·코칭 토스트·실수 경고)은 **1·2번에만** 붙는다 — 3번부터는 파란 박스만
 *    남기고 안내 메시지를 출력하지 않는다(`STUDY_GUIDED_ROUNDS`).
 *    (버티기 규칙은 스터디 동안 쉰다 — 목표가 둘로 갈리지 않게)
 *  · 승리 시 3목 라인 네온 하이라이트 → 결과 오버레이(전적 + 다시 하기).
 */
import Phaser from 'phaser';
import { startCountdown } from '@casual/core';
import { isStorageAvailable, readJson, writeJson } from '@casual/core/store/index.js';
import { LOSSBOOK_KEY, OPENBOOK_KEY, SAVE_KEY, STUDY_KEY } from '../saveKeys.js';
import {
  BTN_ICON,
  PLAY_LAYOUT_DOC_KEY,
  O_KEY,
  X_KEY,
  type LayoutDoc,
} from '../assets.js';
import { playGateAd, playRewardedAd } from '../rewardedAd.js';
import store from '@store';
import { isAdGateTurn } from '../logic/adGate.js';
import {
  applyAction,
  cellOwner,
  createGame,
  phaseOf,
  pieceAlpha,
  type GameState,
  type Player,
} from '../logic/board.js';
import { type OpponentModel, chooseMove, makeStudyOpponent } from '../logic/ai.js';
import { STUDY_WIN_TURN, studyAdvice, threatCells, winningCells } from '../logic/hints.js';
import {
  AI_LEVEL_MAX,
  AI_LEVEL_MIN,
  aiLevelAt,
  aiLevelLabel,
  TURN_SECONDS_BASE,
  alternatesFirst,
  showsHints,
  turnMsFor,
} from '../logic/aiLevels.js';
import {
  INITIAL_PROGRESS,
  WIN_STREAK_TO_ADVANCE,
  type LevelProgress,
  applySingleResult,
  isPromotionMatch,
  isPromotionStage,
  normalizeProgress,
  progressText,
} from '../logic/levelProgress.js';
import { STUDY_SOLUTIONS, STUDY_TOTAL, type StudySolution } from '../logic/studySolutions.js';
import {
  applyRatingDelta,
  botMove,
  isDrawByCap,
  ratingDelta,
  skillOf,
  type BotSkill,
  type VirtualUser,
} from '../logic/versus.js';
import { VERSUS_TURN_MS } from '@casual/ttt-rules';
import type { MatchSnapshot } from '@casual/ttt-rules/protocol.js';
import { OnlineMatch, type OnlineEvent } from '../net/onlineMatch.js';
import { applyResult, loadVersusRecord, saveVersusRecord, type VersusRecord } from '../versusStore.js';
import {
  BGM,
  isMuted,
  playCountdown,
  playSfx,
  startBgm,
  stopBgm,
  toggleMuted,
  type SfxName,
} from '../audio.js';
import {
  type AiMoveLog,
  type LossBook,
  bannedAt,
  posKey,
  rememberLoss,
  shouldRemember,
} from '../logic/lossBook.js';
import { type OpeningBook, recentReplies, rememberReply } from '../logic/openingBook.js';
import { liftAboveBanner } from '../ui/adBanner.js';
import { FIGHTER_SKIN, NeonFighter, fighterAssetsReady } from '../ui/fighter.js';
import {
  HUD_NODE,
  type StageGeometry,
  type StageLight,
  buildStage,
  fallbackGeometry,
  makeAuthoredText,
} from '../ui/stage.js';

// ── 상수 ──
const W = 1080;
const H = 2400;

/** 플레이어/컴퓨터 배역 — 파란 O 링이 플레이어, 핑크 X 가 컴퓨터. */
const HUMAN: Player = 'O';
const AI: Player = 'X';

/** 턴 제한시간(ms). */
const TURN_MS = TURN_SECONDS_BASE * 1000;
/** 초읽기 경고 구간(ms) — 이 이하면 붉게 + 틱 사운드. */
const WARN_MS = 2000;

/**
 * 버티기 승리 — 내 턴을 목표 횟수만큼 버텨내면 승리(플레이어 유리 승리조건).
 * 목표 턴은 따로 저장하지 않고 **AI 등급에서 파생**한다(`survivalTurnsFor`):
 * Lv.1 = 10턴, 등급 1당 +1턴 → Lv.10 = 19턴. 강한 상대일수록 더 오래 버텨야 한다.
 */
/**
 * 포인트 보상 — 3목 승리 / 컴퓨터 시간초과.
 * ⚠️ **버티기 승리(N턴 버티면 승리)는 폐지**(2026-08-05 유저 확정). 승패는 3목과
 * 시간초과로만 갈린다 — 목표가 둘로 갈리지 않아 규칙이 단순해진다.
 */
const POINTS = { line: 200, timeout: 100 } as const;
/** 포인트가 붙는 승리 원인(싱글 전용). */
type ScoredCause = keyof typeof POINTS;
/**
 * 판이 끝난 이유 전체. 온라인 대전에는 포인트가 없는 종료가 더 있다 —
 * `draw`(수 상한) · `resign`(포기) · `disconnect`(이탈/유령 매치 정리).
 */
type WinCause = ScoredCause | 'draw' | 'resign' | 'disconnect';

/** 이 원인에 포인트가 붙는가 — POINTS 조회를 안전하게 좁히는 가드. */
function isScoredCause(cause: WinCause): cause is ScoredCause {
  return cause === 'line' || cause === 'timeout';
}
/** 판 결과 — 대전은 무승부가 존재한다(싱글엔 없다). */
type Outcome = 'win' | 'loss' | 'draw';

/**
 * HUD 좌표(캔버스 1080×2400 기준).
 * ⚠️ 셀 좌표는 여기 없다 — **에디터 보드 노드**에서 나온다(`ui/stage.ts`).
 */
// 보드 아래는 캐릭터(1430~1688)와 무대(타이머)가 차지한다 → 문구는 **무대 아래 바닥**에.
const TOAST_Y = 957; // 토스트(보드 중앙 근처)
const TIMER_X = 540; // 타이머 링 — 하단 무대 중앙
const TIMER_Y = 1795;

/**
 * 판이 끝나고 결과 팝업이 뜰 때까지의 뜸(ms).
 * 승리 라인 연출과 패배 포즈를 눈으로 확인할 시간을 준다 — 기존 1.2초에서 0.5초를 더 얹었다
 * (사용자 요청: "결과 보여주기를 0.5초 정도 추가").
 */
const RESULT_OVERLAY_DELAY_MS = 1700;
/** 결과 오버레이가 뜨고 성과음(승급·포인트·레이팅)이 울리기까지의 뜸(ms). */
const REWARD_SFX_DELAY_MS = 420;

/** 결과 화면 버튼 — 첫 버튼 중심 y, 버튼 사이 간격, 아이콘 표시 높이·아이콘↔글자 간격. */
const BTN_FIRST_Y = 1430;
const BTN_STEP_Y = 170;
const BTN_ICON_SIZE = 76;
const BTN_ICON_GAP = 18;
/** 버튼 좌우 안쪽 여백 — 이 안에 아이콘+글자가 들어가야 한다. */
const BTN_INNER_PAD = 26;

/**
 * 진 판 몇 번에 한 번을 "광고 보고 다시하기" 로 만드는가(유저 확정 2026-08-05: 3판에 한 판).
 * 광고를 봐도 추가 보상은 없다 — 다시하기 자체를 가끔 광고로 받는 구조다.
 */
const AD_RETRY_EVERY = 3;

/** 하단 HUD(전적·규칙 두 줄) 밑변과 배너 광고 윗변 사이 간격(게임 px). */
const BOTTOM_HUD_AD_GAP = 18;
/** 배너 위치 재확인 주기(ms) — 광고는 부팅 후 비동기로 붙고, 제거 구매·회전으로도 바뀐다. */
const BOTTOM_HUD_RECHECK_MS = 500;

/**
 * 대전 캐릭터 — 홈(메뉴) 화면에 저작된 노드를 그대로 게임 화면에도 세운다.
 * 좌표·에셋은 에디터 문서(`ui/layouts/main.json`)가 SSOT — 홈에서 옮기면 여기도 따라온다.
 *   layer_3      = 파란 소년(광선검 오른쪽 향함) → 플레이어(파란 O)
 *   layer_3_copy = 핑크 소녀(광선검 왼쪽 향함)   → 컴퓨터(핑크 X)
 */
const FIGHTER_NODE: Record<Player, string> = { O: 'layer_3', X: 'layer_3_copy' };
/** 에디터 문서를 못 읽었을 때의 기본 배치(홈 화면 저작값과 동일). */
const FIGHTER_FALLBACK: Record<Player, { x: number; y: number; h: number }> = {
  O: { x: 251, y: 1559, h: 258 },
  X: { x: 799, y: 1556, h: 253 },
};
/** 공격 시 상대 앞에서 멈추는 거리(px) — 겹쳐 서지 않게. */
const ATTACK_GAP = 210;

const COLOR_HUMAN = 0x27c4ff; // 네온 블루(O)
const COLOR_AI = 0xff2e7e; // 네온 핑크(X)
const COLOR_WARN = 0xff4444;

/**
 * 세이브 키는 `src/saveKeys.ts` 가 단일 목록으로 갖는다 — 부팅 시 그 목록을 통째로
 * 하이드레이트하기 때문이다(네이티브 저장소엔 키 열거 API 가 없다).
 *  · SAVE_KEY     — 전적·포인트·등급 진행(v3: 2026-08-04 학습 모드 개편 때 리셋)
 *  · LOSSBOOK_KEY — 3목 패배 국면 → AI 응수(v2: 정상 차단까지 기억해 AI 를 망가뜨린 데이터 폐기)
 *  · STUDY_KEY    — AI 스터디 진행 `{solved, introShown}`(v5: 튜토리얼 2판 → 20솔루션 개편)
 *  · OPENBOOK_KEY — 국면별 "최근에 쓴 AI 첫 응수"
 */
/** 실전이 열리기 전에 반드시 풀어야 하는 스터디 수(나머지 18개는 메뉴에서 이어서). */
const STUDY_INTRO_ROUNDS = 2;
/**
 * 말로 설명해 주는 스터디 수 — 1·2번만 이유 말풍선·코칭 토스트를 붙인다.
 * 3번부터는 **안내 메시지를 일절 출력하지 않는다**(유저 지시 2026-08-04): 파란 박스만
 * 남겨 스스로 풀게 한다. 잔소리 반복을 없애고 학습 → 연습으로 넘어가는 구간.
 */
const STUDY_GUIDED_ROUNDS = 2;

interface StudyProgress {
  solved: number;
  introShown: boolean;
}

/**
 * 등급 사다리 버전 — 사다리가 바뀌면(10→20→30단계 등) 저장된 등급 진행을 초기화한다.
 * 전적·포인트는 그대로 두고 **등급/승수/연승만** 리셋한다.
 */
const LADDER_VERSION = 30;

interface Record_ {
  wins: number;
  losses: number;
  points: number;
  /** 이 기록이 만들어진 사다리 버전. 다르면 등급 진행을 새로 시작한다. */
  ladder: number;
  /** 싱글플레이 AI 등급(1..10). 판수 + 마지막 3연승을 채우면 한 단계 올라간다. */
  aiLevel: number;
  /** 현재 등급에서 쌓은 누적 승수(승급하면 0, 패배해도 깎이지 않는다). */
  levelWins: number;
  /** 현재 연승(패배하면 0) — 승급의 마지막 조건. */
  levelStreak: number;
  /** 다음 싱글 판에서 AI 가 선공인가(Lv.11+ 선공 교차용). */
  aiStartsNext: boolean;
}

const EMPTY_RECORD: Record_ = {
  wins: 0,
  losses: 0,
  points: 0,
  ladder: LADDER_VERSION,
  aiLevel: AI_LEVEL_MIN,
  levelWins: 0,
  levelStreak: 0,
  aiStartsNext: false,
};

function loadRecord(): Record_ {
  const parsed = readJson<Partial<Record_>>(SAVE_KEY, {});
  // 사다리가 바뀌었으면 등급 진행만 초기화한다(전적·포인트는 보존).
  const fresh = parsed.ladder !== LADDER_VERSION;
  const progress = fresh
    ? INITIAL_PROGRESS
    : normalizeProgress({
        level: parsed.aiLevel,
        wins: parsed.levelWins,
        streak: parsed.levelStreak,
      });
  return {
    wins: typeof parsed.wins === 'number' ? parsed.wins : 0,
    losses: typeof parsed.losses === 'number' ? parsed.losses : 0,
    points: typeof parsed.points === 'number' ? parsed.points : 0,
    ladder: LADDER_VERSION,
    aiLevel: progress.level,
    levelWins: progress.wins,
    levelStreak: progress.streak,
    aiStartsNext: fresh ? false : parsed.aiStartsNext === true,
  };
}

/**
 * 저장된 싱글 등급 — 메뉴·매칭 화면이 **BGM 곡을 고를 때** 쓴다.
 * 두 곡을 등급마다 번갈아 틀기 때문에, 화면이 바뀌어도 같은 등급이면 같은 곡이 이어진다.
 */
export function savedAiLevel(): number {
  return loadRecord().aiLevel;
}

/**
 * 저장된 등급 배지 한 줄 — 홈 화면 상단(`layer_7`)이 그대로 쓴다.
 * 플레이 화면 배지와 **같은 문구**여야 두 화면이 따로 노는 느낌이 안 난다.
 */
export function savedLevelBadgeText(): string {
  const r = loadRecord();
  const p = { level: r.aiLevel, wins: r.levelWins, streak: r.levelStreak };
  return `🤖 ${aiLevelLabel(p.level)} · ${progressText(p)}`;
}

function saveRecord(r: Record_): void {
  writeJson(SAVE_KEY, r);
}

function loadStudyProgress(): StudyProgress {
  // 저장 자체가 안 되는 환경이면 스터디를 매번 처음부터 시키지 않는다(다 푼 것으로 본다).
  if (!isStorageAvailable()) return { solved: STUDY_TOTAL, introShown: true };
  const parsed = readJson<Partial<StudyProgress>>(STUDY_KEY, {});
  const solved = typeof parsed.solved === 'number' ? parsed.solved : 0;
  return {
    solved: Math.max(0, Math.min(STUDY_TOTAL, Math.floor(solved))),
    introShown: parsed.introShown === true,
  };
}

function saveStudyProgress(p: StudyProgress): void {
  writeJson(STUDY_KEY, p);
}

function loadLossBook(): LossBook {
  const parsed = readJson<unknown>(LOSSBOOK_KEY, {});
  return parsed && typeof parsed === 'object' ? (parsed as LossBook) : {};
}

function loadOpeningBook(): OpeningBook {
  const parsed = readJson<unknown>(OPENBOOK_KEY, {});
  return parsed && typeof parsed === 'object' ? (parsed as OpeningBook) : {};
}

function saveOpeningBook(book: OpeningBook): void {
  writeJson(OPENBOOK_KEY, book);
}

function saveLossBook(book: LossBook): void {
  writeJson(LOSSBOOK_KEY, book);
}

export class PlayScene extends Phaser.Scene {
  private state!: GameState;
  /** state.pieces 배열과 인덱스가 1:1 정렬된 말 스프라이트(앞이 가장 오래된 말). */
  private sprites!: Record<Player, Phaser.GameObjects.Image[]>;
  private record: Record_ = EMPTY_RECORD;

  /** 무대 기하(셀 좌표·보드 사각형) — 에디터 보드 노드에서 나온다. */
  private geometry: StageGeometry = fallbackGeometry();
  /** 공격 때 터지는 무대 조명(파랑/빨강). ⚠️Phaser.Scene.lights 와 이름이 겹치지 않게. */
  private stageLights?: { blue: StageLight; red: StageLight };

  private accepting = false; // 플레이어 입력 허용 여부
  private gameOver = false;

  // 타이머
  private turnRemainMs = TURN_MS;
  /** 화면을 벗어날 때 얼려 둔 남은 시간(ms). null 이면 그때 도는 턴 타이머가 없었다. */
  private pausedRemainMs: number | null = null;
  /** 이번 판의 턴 제한시간(ms) — AI 등급에서 나온다(Lv.21+ 는 등급당 1초씩 짧아진다). */
  private turnMs = TURN_MS;
  private timerEvent: Phaser.Time.TimerEvent | null = null;
  private lastTickSecond = -1;

  // UI 참조
  private timerRing!: Phaser.GameObjects.Graphics;
  private timerText!: Phaser.GameObjects.Text;
  private recordText!: Phaser.GameObjects.Text;
  /**
   * 다음 이동 예정 말 외곽원(플레이어별) — 말 3개가 되면 상시 표시.
   * 자기 차례엔 선명, 상대 차례엔 반투명. 2개 이하 초반엔 표시하지 않는다.
   */
  private nextRings!: Record<Player, Phaser.GameObjects.Arc>;
  private toastText!: Phaser.GameObjects.Text;
  private overlay: Phaser.GameObjects.Container | null = null;
  /** 직전에 실수 경고로 되돌린 셀 — 같은 셀을 다시 탭하면 강행(의사 존중 + 갇힘 방지). */
  private warnedCell: number | null = null;
  /** 칸 안내 FX(붉은=막을 자리, 파란=추천 자리, 이유 말풍선) — 깜박임 표시 묶음. */
  private threatFx: Phaser.GameObjects.GameObject[] = [];
  /** AI 스터디 진행(클리어 수 + 실전 안내 노출 여부) — 세이브 파사드에 저장. */
  private study: StudyProgress = { solved: STUDY_TOTAL, introShown: true };
  /** 이번 판이 AI 스터디 판인가(= 파란 박스 안내가 붙는 판). */
  private studyMode = false;
  /**
   * 모드 선택 — 메뉴 화면에서 넘겨준다('study' = 스터디, 'real' = 실전).
   * 'auto'(데이터 없이 직접 실행)면 진행도에 맡긴다 — 도입부 2개는 자동 오픈.
   */
  private studyChoice: 'auto' | 'study' | 'real' = 'auto';
  /** 지금 풀고 있는 솔루션 번호(0-based). */
  private studyCursor = 0;

  /** 스터디에서 시간 촉박 안내를 이미 했는지(판당 1회만 — 잔소리 방지). */
  private studyTimeWarned = false;
  /** 내가 끝낸 턴 수 — 스터디 단계(=단계 N/10) 기준. */
  private myTurns = 0;
  /** 차단당했을 때 격려 토스트를 띄운 횟수 — 10턴 내내 반복하지 않게 제한. */
  private studyBlockToasts = 0;
  /**
   * 이번 판의 스터디 상대 모델 — 국면이 정해지면 응수도 정해진다(솔루션 시드로 재현).
   * 안내수 탐색이 이 함수로 상대 응수를 시뮬레이션해 "10단계를 채우고 이기는 길"을 찾는다.
   */
  private studyOpponent: OpponentModel = makeStudyOpponent(0);
  /** 패배 기억(국면 키 → 진 판에서 뒀던 응수들) — 같은 패배 패턴 반복 방지. */
  private lossBook: LossBook = {};
  /** 오프닝 변주 기억(국면 키 → 최근에 쓴 첫 응수들) — 첫 수가 매판 같지 않게. */
  private openingBook: OpeningBook = {};
  /** 이번 판 실전 AI 의 착수 기록 — 3목으로 지면 lossBook 에 반영. */
  private aiMoveLog: AiMoveLog[] = [];
  /** 직전에 컴퓨터가 내 승리 칸을 막았는지(다음 내 턴에 격려 토스트). */
  private studyJustBlocked = false;


  /** 이번 판 승리로 등급이 올라갔는지 — 결과 화면 문구 분기. */
  private promotedNow = false;
  /**
   * 이번 패배가 **승급전(3연승 도전) 중 실제로 쌓아 둔 연승**을 끊었으면 그 직전 연승 수를
   * 담아 둔다(0판째 손실은 잃을 게 없어 제외) — 결과 화면에서 "광고 보고 승급전 이어가기"
   * 로 제안하고, 시청 성공 시 이 값으로 되돌린다(PO 2026-09-02: "승급전 패배 무효화").
   */
  private promotionStreakToRestore: number | null = null;
  /**
   * 이번 판으로 스터디가 어디까지 갔는지 — 결과 화면에서 성취음을 고르는 데 쓴다.
   * 클리어 토스트가 뜨는 시점에 바로 울리면 승리 징글과 겹쳐 탁해진다.
   */
  private studyProgressNow: 'clear' | 'complete' | null = null;
  /** 상단 규칙 안내줄(3목 승리 · 제한시간) — 옛 버티기 카운터 자리. */
  private ruleText!: Phaser.GameObjects.Text;
  /** 스터디 진행 중 배지(N/20 + 현재 단계) — 실전에선 숨김. */
  private studyBadge!: Phaser.GameObjects.Text;
  /** 하단 두 줄(전적·규칙)의 저작 y — 배너 광고 위로 밀어올릴 때의 기준선. */
  private bottomHudBaseY: { readonly record: number; readonly rule: number } | null = null;
  private winFx: Phaser.GameObjects.GameObject[] = [];
  private aiMoveTimer: Phaser.Time.TimerEvent | null = null;

  // ── 대전 모드 ──
  /** 이번 판의 대전 상대(가상 유저). null 이면 대전 모드가 아니다. */
  private versusFoe: VirtualUser | null = null;
  /** 상대 레이팅에서 파생한 봇 강도. */
  private versusSkill: BotSkill = { depth: 6, mistakeRate: 0 };
  private versusRecord: VersusRecord = { rating: 1200, wins: 0, losses: 0, draws: 0 };
  /** 이번 판의 총 착수 수 — 무승부 상한 판정용(대전에만 적용). */
  private moveCount = 0;
  /** 이번 판의 레이팅 변동 — 결과 오버레이에 표시한다. */
  private versusDelta = 0;
  /**
   * 실유저 대전 컨트롤러. null 이면 봇 대전(또는 대전이 아님).
   * 상태의 진실은 서버에 있고, 이 객체가 그 거울을 들고 화면 이벤트로 번역한다.
   */
  private online: OnlineMatch | null = null;
  /** 온라인 대전에서 서버로 보낸 시간초과 주장이 응답을 기다리는 중인지(중복 주장 방지). */
  private timeoutClaimed = false;

  /** 대전 캐릭터(양측) — 턴마다 공격 연출을 재생한다. 에셋이 없으면 null. */
  private fighters: Record<Player, NeonFighter | null> = { O: null, X: null };
  /** 캐릭터 제자리(발밑 기준 복귀 좌표). */
  private fighterHome: Record<Player, { x: number; y: number }> = {
    O: { x: FIGHTER_FALLBACK.O.x, y: FIGHTER_FALLBACK.O.y },
    X: { x: FIGHTER_FALLBACK.X.x, y: FIGHTER_FALLBACK.X.y },
  };
  /** 공격 연출로 생긴 임시 FX(불꽃) — 판 정리 때 함께 파괴한다. */
  private attackFx: Phaser.GameObjects.GameObject[] = [];
  /**
   * 진행 중인 공격 체인 — 판 재시작 시 반드시 stop 해야 한다.
   * (killTweensOf 는 TweenChain 을 잡지 못해, 남은 체인이 복귀 좌표를 덮어쓴다)
   */
  private attackChain: Record<Player, Phaser.Tweens.TweenChain | null> = { O: null, X: null };

  constructor() {
    super('play');
  }

  /**
   * 메뉴/매칭 화면에서 고른 모드를 받는다(직접 실행 등 데이터가 없으면 진행도에 맡긴다).
   * 대전은 MatchScene 이 상대(가상 유저)를 함께 넘겨준다.
   */
  init(data?: {
    mode?: 'study' | 'real' | 'versus';
    opponent?: VirtualUser;
    /** 실유저 매칭이 성사된 경우의 서버 스냅샷. 없으면 봇 대전. */
    online?: MatchSnapshot | null;
  }): void {
    const versus = data?.mode === 'versus' && !!data.opponent;
    this.versusFoe = versus ? (data?.opponent ?? null) : null;
    this.online = versus && data?.online ? new OnlineMatch(data.online) : null;
    this.timeoutClaimed = false;
    // 대전은 스터디/실전 진행도와 무관하다 — 'real' 로 두어 스터디 자동 오픈을 막는다.
    // (상대 없이 'versus' 만 들어온 비정상 진입도 실전 싱글로 흘려보낸다)
    this.studyChoice = data?.mode === 'versus' ? 'real' : (data?.mode ?? 'auto');
  }

  /** 이번 판이 대전(실유저 또는 봇 상대)인가. */
  private isVersus(): boolean {
    return this.versusFoe !== null;
  }

  /** 이번 판이 **실유저** 대전인가 — 시계·정산·상태의 권위가 서버에 있는 판. */
  private isOnlineVersus(): boolean {
    return this.online !== null;
  }

  create(): void {
    this.record = loadRecord();
    this.lossBook = loadLossBook();
    this.openingBook = loadOpeningBook();
    // 대전 전적·상대 강도는 HUD 를 짓기 전에 준비한다(HUD 가 곧바로 읽는다).
    const foe = this.versusFoe;
    if (foe) {
      this.versusRecord = loadVersusRecord();
      this.versusSkill = skillOf(foe.rating);
    }
    this.buildStage();
    this.buildFighters();
    this.buildBoardInput();
    this.buildHud();

    // 대국 전용 BGM — 홈/매칭과 다른 곡이다. 화면을 뜨면 멈추고, 다음 화면이 자기 곡을 건다.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => stopBgm());
    this.installBackgroundPause();
    this.installOnlineMatch();
    startBgm(BGM.play);
    playSfx('ui_scene_in');

    // DEV 노브: 헤드리스 QA 에서 결과 오버레이/재대결을 강제 재현하기 위한 훅.
    if (import.meta.env?.DEV) {
      (window as unknown as Record<string, unknown>).__ttt = this;
    }

    this.study = loadStudyProgress();
    // 스터디로 들어왔으면 아직 못 푼 솔루션부터(진행도는 create 에서야 읽히므로 여기서 정한다).
    if (this.studyChoice === 'study') this.studyCursor = this.nextUnsolved();
    this.startNewGame();
  }

  /**
   * 화면을 벗어나 있는 동안 **턴 시계를 세운다**.
   *
   * 왜: 이 게임은 턴당 제한시간이 있고(대전은 20초 고정) 넘기면 그 즉시 패배다. 그런데 탭이
   * 백그라운드로 가면 브라우저가 rAF 를 멈춰 세웠다가 돌아올 때 밀린 타이머를 몰아서 실행한다 —
   * 잠깐 다른 화면을 보고 돌아오면 **이미 시간초과로 져 있다**(2026-08-05 유저 제보:
   * "대전 플레이에서 게임이 계속 중단됩니다"). 알림을 확인하거나 앱을 전환하는 것만으로 판을
   * 잃는 건 규칙이 아니라 버그다.
   *
   * 처리: 숨는 순간 **턴 타이머만** 멈춰 남은 시간을 얼려 두고, 돌아오면 그 값으로 다시 건다.
   * ⚠️ 씬 시계(`time.paused`)를 통째로 멈추지 않는다 — 카운트다운·AI 착수 대기까지 같이 얼어붙는데,
   *    복귀 신호를 놓치면(부팅 직후 hidden 상태 등) 판이 영영 시작되지 않는 교착이 된다.
   *    상대가 내가 없는 동안 두는 건 손해가 아니다(내 차례는 돌아온 뒤 온전한 시간으로 시작).
   */
  private installBackgroundPause(): void {
    if (typeof document === 'undefined') return;
    // 실유저 대전은 이 정책을 쓸 수 없다 — 내가 숨었다고 서버 시계가 멈추지 않는다.
    // 여기서 얼려 두면 화면만 여유롭고 실제로는 시간초과로 지는, 더 나쁜 버그가 된다.
    // 대신 복귀할 때 서버에 진짜 남은 시간을 물어본다(installOnlineMatch 참고).
    if (this.isOnlineVersus()) return;
    const onVisibility = (): void => {
      if (!this.scene.isActive()) return;
      if (document.hidden) {
        if (!this.timerEvent) return; // 돌던 턴 타이머가 없으면 얼릴 것도 없다
        this.pausedRemainMs = this.turnRemainMs;
        this.stopTimer();
        return;
      }
      const remain = this.pausedRemainMs;
      this.pausedRemainMs = null;
      if (remain === null || this.gameOver) return;
      this.resumeTimer(remain);
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      document.removeEventListener('visibilitychange', onVisibility),
    );
  }

  // ── 실유저 대전 ──

  /**
   * 온라인 대전 배선 — 실시간 구독 · 백그라운드 복귀 재동기화 · 이탈 시 포기.
   *
   * 봇 대전이면 아무것도 하지 않는다(이 아래 경로는 전부 `this.online` 이 있을 때만 돈다).
   */
  private installOnlineMatch(): void {
    const online = this.online;
    if (!online) return;

    void online.start((event) => this.onOnlineEvent(event));

    // 복귀 시 서버에 진짜 상태를 물어본다 — 내 시계는 멈췄어도 상대와 마감은 흘렀다.
    if (typeof document !== 'undefined') {
      const onVisibility = (): void => {
        if (document.hidden || this.gameOver || !this.scene.isActive()) return;
        void online.resync();
      };
      document.addEventListener('visibilitychange', onVisibility);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
        document.removeEventListener('visibilitychange', onVisibility),
      );
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // 판을 끝내지 않고 나가면 포기 처리한다 — 상대를 매 턴 20초씩 기다리게 두지 않는다.
      if (!this.gameOver) void online.resign();
      online.dispose();
    });
  }

  /** 서버가 알려 온 변화를 화면에 반영한다. */
  private onOnlineEvent(event: OnlineEvent): void {
    if (!this.scene.isActive()) return;

    switch (event.kind) {
      case 'deadline':
        this.syncOnlineTimer();
        return;

      case 'move':
        if (this.gameOver) return;
        // 봇 대전과 **완전히 같은 경로**로 흘린다 — 스프라이트/상태 정렬이 저절로 유지된다.
        this.stopTimer();
        this.commitAction(event.cell);
        return;

      case 'finished':
        if (this.gameOver) return;
        this.showOnlineEndToast(event.cause, event.winner);
        this.endGame(event.winner, event.cause);
        return;

      case 'sync':
        this.applyOnlineSync(event);
        return;
    }
  }

  /** 착수 없이 끝난 판의 안내 — 왜 갑자기 끝났는지 알려 준다. */
  private showOnlineEndToast(cause: WinCause, winner: Player | null): void {
    const foe = this.versusFoe?.name ?? '상대';
    if (cause === 'timeout') {
      this.showToast(winner === HUMAN ? `⏰ ${foe} 시간 초과!` : '⏰ 시간 초과! 패배했습니다', '#FF8A80');
      return;
    }
    if (cause === 'resign') {
      this.showToast(winner === HUMAN ? `🏳 ${foe} 님이 기권했어요` : '🏳 기권했습니다', '#FFD9A0');
      return;
    }
    if (cause === 'disconnect') {
      this.showToast('📴 상대의 연결이 끊겼습니다', '#FFD9A0');
    }
  }

  /**
   * 서버 상태로 화면을 통째로 맞춘다(재접속·백그라운드 복귀·경합에서 밀린 착수).
   * 트윈을 타지 않고 최종 배치로 즉시 그린다 — 진행 중인 연출과 섞이면 정렬이 깨진다.
   */
  private applyOnlineSync(event: Extract<OnlineEvent, { kind: 'sync' }>): void {
    if (this.gameOver) return;
    this.aiMoveTimer?.remove();
    this.aiMoveTimer = null;
    this.stopTimer();
    this.moveCount = event.moveCount;
    this.renderSnapshot(event.state);

    if (event.finished) {
      const cause: WinCause = event.cause ?? 'disconnect';
      this.showOnlineEndToast(cause, event.winner);
      this.endGame(event.winner, cause);
      return;
    }
    this.timeoutClaimed = false;
    this.beginTurn();
  }

  /**
   * 서버 상태를 스프라이트로 다시 그린다(연출 없음).
   * `startNewGame` 의 정리 로직과 같은 헬퍼를 쓰므로 `sprites[]` 와 `state.pieces[]` 의
   * 인덱스 1:1 정렬이 그대로 유지된다.
   */
  private renderSnapshot(state: GameState): void {
    this.destroyPieceSprites();
    this.state = state;
    for (const p of [HUMAN, AI] as const) {
      for (const cell of state.pieces[p]) {
        const { x, y } = this.cellCenter(cell);
        const spr = this.add.image(x, y, p === HUMAN ? O_KEY : X_KEY).setDepth(5);
        this.setPieceSize(spr);
        this.sprites[p].push(spr);
      }
    }
    this.refreshPieceLook();
  }

  /** 돌던 턴 타이머를 서버 마감 기준으로 다시 맞춘다. */
  private syncOnlineTimer(): void {
    const online = this.online;
    if (!online || this.gameOver || !this.timerEvent) return;
    this.resumeTimer(online.remainMs(VERSUS_TURN_MS));
  }

  // ── 대전 캐릭터 ──
  /**
   * 홈 화면에 저작된 캐릭터를 게임 화면에도 같은 자리에 세운다.
   * 배치의 원본은 에디터 문서다 — 홈에서 옮기면 게임 화면도 따라 움직인다.
   * 에셋이 아직 없으면 조용히 건너뛴다(캐릭터 없이도 게임은 정상 동작).
   */
  private buildFighters(): void {
    const doc = this.playDoc();
    for (const p of [HUMAN, AI] as const) {
      const skin = p === HUMAN ? FIGHTER_SKIN.blue : FIGHTER_SKIN.pink;
      if (!fighterAssetsReady(this, skin)) continue;
      const node = doc?.nodes?.find((n) => n.id === FIGHTER_NODE[p]);
      const fb = FIGHTER_FALLBACK[p];
      const x = node?.x ?? fb.x;
      const y = node?.y ?? fb.y;
      const h = node?.h ?? fb.h;
      const fighter = new NeonFighter(this, skin, {
        x,
        bottomY: y + h / 2, // 저작 사각형의 아래변 = 발이 닿는 자리
        height: h,
        facing: p === HUMAN ? 1 : -1, // 서로를 향해 선다
        depth: 6,
      });
      // 좌우가 서로 다른 호흡 위상을 갖도록 살짝 어긋나게 시작한다.
      fighter.startBreathing(p === HUMAN ? 0 : 380);
      this.fighters[p] = fighter;
      this.fighterHome[p] = { x, y: y + h / 2 };
    }
  }

  /**
   * 턴 공격 연출 — 공격측이 상대 앞까지 달려가 **광선검을 내리치고** 돌아온다.
   *   ① 돌진(검을 든 자세 atk1) → ② 내리치기(atk2 + 참격 호 + 후광 번쩍) → ③ 복귀(idle)
   * 착수 트윈과 **동시에** 돌아간다(턴 진행을 붙잡지 않는다 — 판 속도 유지).
   */
  private playAttack(attacker: Player): void {
    const me = this.fighters[attacker];
    const foe = this.fighters[attacker === HUMAN ? AI : HUMAN];
    if (!me || !foe) return;

    const home = this.fighterHome[attacker];
    const foeHome = this.fighterHome[attacker === HUMAN ? AI : HUMAN];
    const dir = Math.sign(foeHome.x - home.x) || 1;
    const strikeX = foeHome.x - dir * ATTACK_GAP;

    this.attackChain[attacker]?.stop();
    this.tweens.killTweensOf(me.img);
    me.img.setPosition(home.x, home.y);
    me.windUp(); // 내리치기 직전 자세로 달려간다
    // 무대 조명 — 공격하는 쪽 색이 터져 나온다(평소엔 꺼져 있다).
    (attacker === HUMAN ? this.stageLights?.blue : this.stageLights?.red)?.flash();
    playSfx('slash');

    this.attackChain[attacker] = this.tweens.chain({
      targets: me.img,
      tweens: [
        // ① 돌진 — 급가속으로 상대 앞까지
        { x: strikeX, duration: 130, ease: 'Quad.In' },
        // ② 내리치기 — 프레임 교체 + 참격 호, 짧게 밀고 되돌아온다
        {
          x: strikeX + dir * 34,
          duration: 60,
          yoyo: true,
          ease: 'Quad.Out',
          onStart: () => {
            me.strike();
            this.hitReact(foe, dir);
          },
        },
        // ③ 복귀 — 준비 자세로 돌아가며 숨쉬기 재개
        {
          x: home.x,
          duration: 190,
          ease: 'Quad.Out',
          onStart: () => me.toIdle(),
        },
      ],
    });
  }

  /** 맞은 쪽 반응 — 흰 섬광 + 뒤로 밀림 + 불꽃 파편. */
  private hitReact(foe: NeonFighter, dir: number): void {
    const img = foe.img;
    if (!img.active) return;
    playSfx('hit'); // 검이 닿는 순간(slash 직후) — 흰 섬광과 같은 프레임
    const baseX = img.x;
    img.setTintFill(0xffffff);
    this.time.delayedCall(70, () => img.active && img.clearTint());
    this.tweens.add({
      targets: img,
      x: baseX + dir * 26,
      duration: 70,
      yoyo: true,
      ease: 'Quad.Out',
      onComplete: () => img.active && img.setX(baseX),
    });
    this.cameras.main.shake(90, 0.0016);

    const color = foe === this.fighters[HUMAN] ? COLOR_HUMAN : COLOR_AI;
    const midY = img.y - img.displayHeight * 0.45;
    for (let i = 0; i < 6; i++) {
      const p = this.add
        .circle(baseX - dir * 40, midY + (Math.random() - 0.5) * 90, 3 + Math.random() * 4, color, 1)
        .setDepth(7);
      this.attackFx.push(p);
      this.tweens.add({
        targets: p,
        x: p.x - dir * (40 + Math.random() * 90),
        y: p.y + (Math.random() - 0.5) * 120,
        alpha: 0,
        scale: 0.3,
        duration: 260 + Math.random() * 200,
        ease: 'Cubic.Out',
        onComplete: () => p.destroy(),
      });
    }
  }

  /** 캐릭터·공격 FX 를 초기 상태로(판 시작·재시작 시) — 준비 자세 + 숨쉬기. */
  private resetFighters(): void {
    for (const fx of this.attackFx) {
      this.tweens.killTweensOf(fx);
      fx.destroy();
    }
    this.attackFx = [];
    this.stageLights?.blue.reset();
    this.stageLights?.red.reset();
    for (const p of [HUMAN, AI] as const) {
      this.attackChain[p]?.stop();
      this.attackChain[p] = null;
      const home = this.fighterHome[p];
      this.fighters[p]?.reset(home.x, home.y);
    }
  }

  /** 판이 끝나면 진 쪽을 패배 자세로 바꾼다(숨은 계속 쉰다). */
  private showDefeatPose(loser: Player): void {
    this.attackChain[loser]?.stop();
    const f = this.fighters[loser];
    if (!f) return;
    const home = this.fighterHome[loser];
    this.tweens.killTweensOf(f.img);
    f.img.setPosition(home.x, home.y).clearTint();
    f.toDefeat();
  }

  // ── 무대(에디터 SSOT) ──
  /** 배경·조명·보드·로고를 세우고, 셀 좌표를 보드 노드에서 받아 둔다. */
  private buildStage(): void {
    const doc = this.playDoc();
    const stage = buildStage(this, doc);
    this.geometry = stage.geometry;
    this.stageLights = stage.lights;
  }

  private cellCenter(cell: number): { x: number; y: number } {
    return this.geometry.cellCenter(cell);
  }

  /** 셀 한 변(px) — 보드 크기에서 나온다. */
  private get cellSize(): number {
    return this.geometry.cellSize;
  }

  // ── 입력 ──
  private buildBoardInput(): void {
    const size = this.cellSize;
    for (let cell = 0; cell < 9; cell++) {
      const { x, y } = this.cellCenter(cell);
      this.add
        .zone(x, y, size, size)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.onCellTap(cell));
    }
  }

  private onCellTap(cell: number): void {
    if (!this.accepting || this.gameOver) return;
    if (cellOwner(this.state, cell) !== null) {
      playSfx('ui_invalid');
      this.shakeCell(cell);
      return;
    }
    // 실수 감지 — 팝업 없이 착수를 자동으로 되돌리고 경고 토스트만 띄운다(타이머는 계속).
    // 같은 칸을 한 번 더 탭하면 경고를 무시하고 그대로 둔다(모든 수가 경고일 때 갇힘 방지).
    // ⚠️ 실유저 대전에서는 끈다 — 두 번 탭해야 두어지는 규칙은 상대가 기다리는 판에서
    //    유저가 이해할 수 없는 지연이 된다(경고는 원래 싱글 학습용이다).
    const warning = this.isOnlineVersus() ? null : this.detectMistake(cell);
    if (warning && this.warnedCell !== cell) {
      this.warnedCell = cell;
      playSfx('mistake'); // 혼내는 소리(ui_invalid)가 아니라 알려주는 소리
      this.showToast(`${warning}\n(다시 탭하면 그대로 둬요)`, '#FF8A80', 1700);
      return;
    }
    this.warnedCell = null;
    this.accepting = false;
    this.stopTimer();
    this.clearThreatBoxes();
    // 낙관적 적용 — 탭 즉시 그린다(봇 대전과 완전히 같은 연출 경로).
    // 서버가 거부하면 sync 이벤트가 화면을 되돌린다. 상대 화면은 서버가 검증한 결과만
    // 반영하므로, 내 화면이 잠깐 앞서 가도 상대의 판은 오염되지 않는다.
    this.commitAction(cell);
    void this.online?.submitMove(cell);
  }

  /** 플레이 화면 저작 문서(에디터 "플레이화면"). 없으면 undefined — 폴백 좌표가 쓰인다. */
  private playDoc(): LayoutDoc | undefined {
    return this.cache.json.get(PLAY_LAYOUT_DOC_KEY) as LayoutDoc | undefined;
  }

  /** 이번 판이 AI 스터디 판인가 — 안내·상대 모델·버티기 비활성의 기준. */
  private isStudy(): boolean {
    return this.studyMode;
  }

  /** 지금 풀고 있는 승리 솔루션. */
  private currentSolution(): StudySolution {
    return STUDY_SOLUTIONS[Math.min(this.studyCursor, STUDY_TOTAL - 1)];
  }

  /**
   * 말로 설명해 주는 스터디인가(1·2번). 3번부터는 파란 박스만 남기고 안내 메시지는 전부 끈다.
   */
  private isGuidedStudy(): boolean {
    return this.isStudy() && this.currentSolution().id <= STUDY_GUIDED_ROUNDS;
  }

  /**
   * 칸 안내 박스 갱신(내 턴) — 붉은 박스: 컴퓨터가 다음 턴에 3목을 완성할 자리(상시).
   * AI 스터디: 파란 박스 = 추천 자리. 1·2번 스터디에만 "왜 여기인지" 말풍선을 붙인다.
   */
  private updateHintBoxes(): void {
    this.clearThreatBoxes();
    // Lv.20 부터는 위험(붉은) 안내를 끊는다 — 스터디는 가르치는 판이라 예외.
    const reds = this.hintsOn() ? threatCells(this.state) : [];
    let blue: number | null = null;
    if (this.isStudy()) {
      const advice = studyAdvice(
        this.state,
        this.myTurns,
        this.studyOpponent,
        this.currentSolution().seed,
      );
      blue = advice.cell;
      if (this.isGuidedStudy()) this.drawAdviceCallout(advice.cell, advice.reason);
    }
    for (const cell of reds) {
      if (cell === blue) continue; // 같은 칸이면 파란(추천) 표시가 우선
      this.drawHintBox(cell, 0xff5577);
    }
    if (blue !== null) {
      this.drawHintBox(blue, 0x27c4ff);
      playSfx('hint_show'); // 추천 자리가 열리는 순간 = 도움을 받는 순간(스터디에서만 뜬다)
    }
  }

  /** 추천 칸 위(첫 줄이면 아래)에 "왜 여기인지" 말풍선을 붙인다. */
  private drawAdviceCallout(cell: number, reason: string): void {
    const { x, y } = this.cellCenter(cell);
    const offset = this.cellSize * 0.66;
    const labelY = cell < 3 ? y + offset : y - offset;
    const label = this.add
      .text(x, labelY, reason, {
        fontFamily: 'Jua, sans-serif',
        fontSize: '38px',
        color: '#FFD9A0',
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setStroke('#0A0714', 8);
    // 라벨이 캔버스 밖으로 나가지 않게 좌우 보정
    const half = label.width / 2;
    if (x - half < 20) label.setX(half + 20);
    else if (x + half > W - 20) label.setX(W - half - 20);
    this.threatFx.push(label);
  }

  /** 엷은 사각박스 1개를 깜박임과 함께 그린다. */
  private drawHintBox(cell: number, color: number): void {
    const size = this.cellSize * 0.86;
    const { x, y } = this.cellCenter(cell);
    const g = this.add.graphics().setDepth(3);
    g.fillStyle(color, 0.09);
    g.fillRoundedRect(x - size / 2, y - size / 2, size, size, 18);
    g.lineStyle(4, color, 0.75);
    g.strokeRoundedRect(x - size / 2, y - size / 2, size, size, 18);
    this.threatFx.push(g);
    this.tweens.add({
      targets: g,
      alpha: { from: 0.85, to: 0.2 },
      duration: 460,
      yoyo: true,
      repeat: -1,
    });
  }

  /** 위협 박스 정리 — 트윈을 먼저 죽이고 파괴한다(파괴된 대상 트윈 = 게임루프 정지 위험). */
  private clearThreatBoxes(): void {
    for (const g of this.threatFx) {
      this.tweens.killTweensOf(g);
      g.destroy();
    }
    this.threatFx = [];
  }

  /**
   * 이 착수가 실수인지 판정한다(실수면 경고 문구, 아니면 null).
   *  · AI 스터디 1·2번: 추천(파란 박스) 자리를 벗어난 수 — 상대가 봐주지 않으므로 한 번은 잡아 준다
   *  · AI 스터디 3번부터: 경고하지 않는다(안내 메시지 없음 — 스스로 풀고, 틀리면 다시 푼다)
   *  · 실전 Lv.1~19: 놓친 승리 — 바로 이길 수 있는 칸이 있는데 다른 곳에 두려 함
   *  · 실전 Lv.20+ : 경고하지 않는다(안내 차단 압박 — `HINTS_OFF_FROM`)
   * ("컴퓨터에게 승리를 내주는 수" 경고는 유저 요청으로 표시하지 않는다 — 2026-08-04)
   */
  private detectMistake(cell: number): string | null {
    const next = applyAction(this.state, cell);
    if (next.winner) return null; // 이기는 수는 실수가 아니다
    // 대전에선 훈수를 두지 않는다 — 사람 대 사람 판에 잔소리를 끼우지 않는다.
    if (this.isVersus()) return null;
    if (this.isStudy() && !this.isGuidedStudy()) return null;
    if (this.isStudy()) {
      const advice = studyAdvice(
        this.state,
        this.myTurns,
        this.studyOpponent,
        this.currentSolution().seed,
      );
      // 상대가 봐주지 않으므로, 안내를 벗어나면 실제로 질 수 있다 — 한 번은 잡아 준다.
      return cell === advice.cell ? null : '🤖 파란 박스 자리! 컴퓨터가 봐주지 않아요';
    }
    if (!this.hintsOn()) return null; // Lv.20+ — 놓아야 할 자리를 알려 주지 않는다
    if (winningCells(this.state).length > 0) return '★ 바로 이길 수 있는 칸이 있어요!';
    return null;
  }

  /**
   * 이번 판에 화면 안내(붉은 위험 박스 · 놓친 승리 경고)를 보여 주는가.
   * 실전은 **Lv.20 부터 끊긴다**(유저 확정 2026-08-05). 스터디는 가르치는 판이라 항상 켜고,
   * 대전은 등급 사다리 밖이라 기존대로 둔다.
   */
  private hintsOn(): boolean {
    if (this.isStudy() || this.isVersus()) return true;
    return showsHints(this.record.aiLevel);
  }

  private shakeCell(cell: number): void {
    const owner = cellOwner(this.state, cell);
    if (!owner) return;
    const idx = this.state.pieces[owner].indexOf(cell);
    const spr = this.sprites[owner][idx];
    if (!spr) return;
    const baseX = spr.x;
    this.tweens.add({
      targets: spr,
      x: { from: baseX - 10, to: baseX + 10 },
      duration: 50,
      yoyo: true,
      repeat: 2,
      onComplete: () => spr.setX(baseX),
    });
  }

  /**
   * 하단 두 줄(전적·규칙)을 배너 광고 윗변 위로 밀어올린다. 광고가 없으면 저작 위치 그대로.
   * 부팅 직후엔 배너가 아직 안 붙었을 수 있어 주기적으로 다시 계산한다.
   */
  private syncBottomHudToBanner(): void {
    const base = this.bottomHudBaseY;
    if (!base || !this.recordText.active || !this.ruleText.active) return;
    // 규칙 줄(두 줄 중 아래)의 밑변이 배너 윗변에 닿도록 두 줄을 같은 거리만큼 올린다.
    const ruleBottom = base.rule + this.ruleText.displayHeight / 2; // origin 0.5 기준 밑변.
    const shift = liftAboveBanner(this, ruleBottom, BOTTOM_HUD_AD_GAP);
    this.recordText.setY(base.record - shift);
    this.ruleText.setY(base.rule - shift);
  }

  // ── HUD ──
  private buildHud(): void {
    const font = { fontFamily: 'Jua, sans-serif' };

    // 플레이 화면 HUD 는 에디터 "플레이화면" 문서가 SSOT — 저작된 세 줄만 쓴다.
    //   상단 배지(등급/스터디) · 하단 전적 · 하단 규칙. 턴/안내 문구는 두지 않는다(단순 배치).
    const doc = this.playDoc();
    this.studyBadge = makeAuthoredText(this, doc, HUD_NODE.BADGE, {
      x: W / 2,
      y: 221,
      fontSize: 40,
      color: '#ffffff',
    });
    this.recordText = makeAuthoredText(this, doc, HUD_NODE.RECORD, {
      x: W / 2,
      y: 2002,
      fontSize: 40,
      color: '#86c0fe',
    });
    this.ruleText = makeAuthoredText(this, doc, HUD_NODE.RULE, {
      x: W / 2,
      y: 2059,
      fontSize: 30,
      color: '#ffffff',
    });
    this.updateRecordText();

    // 하단 두 줄의 저작 위치를 기준선으로 잡아 두고, 배너 광고가 붙으면 그 위로 밀어올린다.
    this.bottomHudBaseY = { record: this.recordText.y, rule: this.ruleText.y };
    this.syncBottomHudToBanner();
    this.time.addEvent({
      delay: BOTTOM_HUD_RECHECK_MS,
      loop: true,
      callback: () => this.syncBottomHudToBanner(),
    });

    // 뒤로가기(좌상단) — 게임 선택 화면으로(허브 복귀는 메뉴의 ◀ 가 맡는다)
    const back = this.add
      .text(90, 150, '◀', { ...font, fontSize: '58px', color: '#E6E9FF' })
      .setOrigin(0.5)
      .setDepth(10)
      .setStroke('#0A0714', 8)
      .setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => {
      playSfx('ui_tap'); // 좌상단 ◀ 는 가벼운 이동 — 결정적 후퇴(ui_btn_cancel)와 구분한다
      this.scene.start('menu');
    });

    // 타이머 — 하단 네온 무대 중앙(배너 광고 영역보다 충분히 위라 밀어올릴 필요가 없다)
    this.timerRing = this.add.graphics().setDepth(10);
    this.timerText = this.add
      .text(TIMER_X, TIMER_Y, '', { ...font, fontSize: '120px', color: '#FFFFFF' })
      .setOrigin(0.5)
      .setDepth(11)
      .setStroke('#0A0714', 10);

    // 다음 이동 예정 말 외곽원(양측) — 말 크기에 딱 붙는 작은 링.
    const makeRing = (color: number) =>
      this.add
        .circle(0, 0, this.cellSize * 0.36)
        .setStrokeStyle(4, color, 0.9)
        .setDepth(4)
        .setVisible(false);
    this.nextRings = { O: makeRing(COLOR_HUMAN), X: makeRing(COLOR_AI) };

    // 안내 토스트 — 배경 상자 없이 폰트만(가독성은 외곽선으로 확보)
    this.toastText = this.add
      .text(W / 2, TOAST_Y, '', {
        ...font,
        fontSize: '64px',
        color: '#FFD54D',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(100)
      .setStroke('#0A0714', 10)
      .setVisible(false);

    // 사운드 토글(우상단)
    const mute = this.add
      .text(W - 90, 150, isMuted() ? '🔇' : '🔊', { fontSize: '64px' })
      .setOrigin(0.5)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });
    mute.on('pointerdown', () => {
      // 끄는 순간에도 토글음이 들린다(audio.toggleMuted 가 소리를 먼저 울리고 늦게 죽인다).
      mute.setText(toggleMuted() ? '🔇' : '🔊');
    });

  }

  /**
   * 다음에 풀 솔루션 번호(0-based) — 다 풀었으면 1번부터 복습.
   * (모드 전환은 메뉴 화면에서만 한다 — 게임 화면엔 스터디/실전 토글 버튼을 두지 않는다)
   */
  private nextUnsolved(): number {
    return this.study.solved < STUDY_TOTAL ? this.study.solved : 0;
  }

  private updateRecordText(): void {
    // 대전은 포인트가 아니라 레이팅이 성적표다(싱글 전적과 섞지 않는다).
    if (this.isVersus()) {
      const r = this.versusRecord;
      this.recordText.setText(`🆚 레이팅 ${r.rating}  ·  ${r.wins}승 ${r.losses}패 ${r.draws}무`);
      return;
    }
    this.recordText.setText(
      `🏆 통산  ${this.record.wins}승 ${this.record.losses}패  ·  ⭐ ${this.record.points.toLocaleString()}P`,
    );
  }

  /**
   * 이번 판의 압박 상태 한 줄 — 선공이 누구인지, 제한시간이 줄었는지.
   * (둘 다 해당 없으면 등급 소개를 그대로 보여준다)
   */
  private pressureLine(): string {
    const lv = aiLevelAt(this.record.aiLevel);
    const parts: string[] = [];
    if (lv.alternateFirst) parts.push(this.state.turn === HUMAN ? '내가 선공' : '컴퓨터가 선공');
    if (lv.turnSeconds < TURN_SECONDS_BASE) parts.push(`턴 ${lv.turnSeconds}초`);
    return parts.length > 0 ? `⚠ ${parts.join(' · ')}` : lv.blurb;
  }

  /** 현재 등급 진행도(등급·누적 승수·연승). */
  private levelProgress(): LevelProgress {
    return {
      level: this.record.aiLevel,
      wins: this.record.levelWins,
      streak: this.record.levelStreak,
    };
  }

  /** 결과 화면용 — 다음 등급까지 **몇 경기** 남았는지 한 줄로. */
  private nextLevelText(): string {
    const p = this.levelProgress();
    if (p.level >= AI_LEVEL_MAX) return '최고 등급 달성 🏆';
    const need = aiLevelAt(p.level).winsToAdvance;
    if (p.wins < need) return `다음 등급까지 ${need - p.wins}승 + 마지막 ${WIN_STREAK_TO_ADVANCE}연승`;
    return `승급까지 ${WIN_STREAK_TO_ADVANCE - p.streak}연승!`;
  }

  /** "승급 2/5승 · 연승 1/3" — 승급까지 무엇이 남았는지. */
  private promotionText(): string {
    return progressText(this.levelProgress());
  }

  /** 상단 규칙 줄 — 이 판의 승패 조건(3목 / 제한시간). 스터디 중엔 비운다. */
  private updateRuleText(): void {
    this.ruleText.setText(
      this.isStudy()
        ? ''
        : `⚔ 3목을 만들면 승리 · ${Math.round(this.turnMs / 1000)}초를 넘기면 패배`,
    );
  }

  /** 스터디 배지 — 솔루션 번호(N/20)와 현재 학습 단계. 대전에선 상대 프로필을 대신 띄운다. */
  private updateStudyBadge(): void {
    const foe = this.versusFoe;
    if (foe) {
      this.studyBadge.setText(`🤖 ${foe.flair} ${foe.name} · 레이팅 ${foe.rating}`);
      return;
    }
    if (!this.isStudy()) {
      // 싱글플레이 — 지금 상대하는 AI 등급 + 승급까지 남은 승수.
      this.studyBadge.setText(`🤖 ${aiLevelLabel(this.record.aiLevel)} · ${this.promotionText()}`);
      return;
    }
    const sol = this.currentSolution();
    const step = this.myTurns + 1;
    const head = `🤖 AI 스터디 ${sol.id}/${STUDY_TOTAL}`;
    this.studyBadge.setText(
      step <= STUDY_WIN_TURN ? `${head} · ${step}단계` : `${head} · 마무리 공격`,
    );
  }

  private showToast(msg: string, color = '#FFD54D', ms = 1300): void {
    playSfx('ui_toast');
    this.toastText.setText(msg).setColor(color).setVisible(true).setAlpha(0).setScale(0.85);
    this.tweens.add({ targets: this.toastText, alpha: 1, scale: 1, duration: 160, ease: 'Back.Out' });
    this.time.delayedCall(ms, () => {
      if (!this.toastText.visible) return;
      this.tweens.add({
        targets: this.toastText,
        alpha: 0,
        duration: 220,
        onComplete: () => this.toastText.setVisible(false),
      });
    });
  }

  /**
   * 말 스프라이트를 전부 파괴하고 배열을 비운다(새 판 시작 · 서버 스냅샷 재렌더 공용).
   * ⚠️ 트윈을 먼저 죽인다 — 파괴된 오브젝트의 트윈 콜백 하나가 게임 루프를 영구 정지시킨다.
   */
  private destroyPieceSprites(): void {
    if (this.sprites) {
      for (const p of [HUMAN, AI] as const) {
        for (const s of this.sprites[p]) {
          this.tweens.killTweensOf(s);
          s.destroy();
        }
      }
    }
    this.sprites = { O: [], X: [] };
  }

  // ── 게임 시작/재시작 ──
  private startNewGame(): void {
    // 이전 판 정리 — 진행 중이던 턴 타이머부터 멈춘다. (판 도중 AI 스터디 버튼을 누르면
    // 옛 타이머가 카운트다운 동안 계속 흘러 새 판이 시작하자마자 시간초과로 끝날 수 있다)
    this.stopTimer();
    this.overlay?.destroy();
    this.overlay = null;
    this.warnedCell = null;
    this.studyTimeWarned = false;
    this.myTurns = 0;
    this.moveCount = 0;
    this.versusDelta = 0;
    this.studyBlockToasts = 0;
    this.studyJustBlocked = false;

    // 이번 판이 스터디 판인가 — 버튼 선택이 우선, 없으면 도입부 2개까지 자동 오픈.
    // (대전은 스터디 진행도와 무관하다)
    this.studyMode =
      !this.isVersus() &&
      (this.studyChoice === 'study' ||
        (this.studyChoice === 'auto' && this.study.solved < STUDY_INTRO_ROUNDS));
    if (this.studyMode && this.studyChoice !== 'study') this.studyCursor = this.nextUnsolved();
    this.studyCursor = Math.min(this.studyCursor, STUDY_TOTAL - 1);
    // 스터디 상대는 솔루션 시드로 재현한다 — 안내가 그 응수를 시뮬레이션해 승리를 설계한다.
    this.studyOpponent = makeStudyOpponent(this.currentSolution().seed);
    this.aiMoveLog = [];
    this.clearThreatBoxes();
    this.resetFighters();
    this.updateRuleText();
    this.updateStudyBadge();
    for (const fx of this.winFx) {
      this.tweens.killTweensOf(fx); // 잔광 펄스가 남아있을 수 있음 — 파괴 전 반드시 해제
      fx.destroy();
    }
    this.winFx = [];
    this.destroyPieceSprites();
    this.aiMoveTimer?.remove();
    this.aiMoveTimer = null;

    // 이번 판의 제한시간 — 싱글은 등급에서, 스터디는 기본 20초.
    // 대전은 서버와 공유하는 상수를 쓴다(여기서만 바꾸면 서버 마감과 어긋난다).
    this.turnMs = this.isVersus()
      ? VERSUS_TURN_MS
      : this.isStudy()
        ? TURN_MS
        : turnMsFor(this.record.aiLevel);
    // 선공 — 싱글 Lv.10 까지는 항상 사람(선공이 구조적으로 유리한 룰이라 플레이어 유리 방침).
    // **Lv.11 부터는 한 판씩 번갈아** 잡는다(압박 축). 스터디는 안내가 사람 선공을 전제하므로 고정.
    // 대전은 선공 이점이 곧 승패라 매판 무작위.
    const alternate = !this.isStudy() && !this.isVersus() && alternatesFirst(this.record.aiLevel);
    const aiStarts = alternate && this.record.aiStartsNext;
    if (alternate) {
      this.record = { ...this.record, aiStartsNext: !this.record.aiStartsNext };
      saveRecord(this.record);
    }
    // 실유저 대전은 선공도 서버가 정한다(이미 "나 = O" 관점으로 뒤집혀 온다).
    this.state = this.online
      ? this.online.initialState()
      : createGame(this.isVersus() ? (Math.random() < 0.5 ? HUMAN : AI) : aiStarts ? AI : HUMAN);
    this.updateRuleText(); // 이번 판의 제한시간이 정해진 뒤에 그려야 초수가 맞는다
    this.gameOver = false;
    this.accepting = false;
    this.hideNextRings();
    this.drawTimer(this.turnMs);
    this.timerText.setText('');

    // 첫 스터디 판(솔루션 1·2)은 자동으로 열린다 — 그 뒤로는 버튼으로 이어서 한다.
    const isRealIntro =
      !this.isVersus() && !this.studyMode && this.study.solved >= STUDY_INTRO_ROUNDS && !this.study.introShown;
    const sol = this.currentSolution();
    const foe = this.versusFoe;
    // 3번 스터디부터는 코스 이름표만 띄우고 설명은 붙이지 않는다(안내 메시지 없음).
    const firstMsg = foe
      ? `⚔ ${foe.name} 님과 대전!\n${this.state.turn === HUMAN ? '내가 선공이에요' : '상대가 선공이에요'}`
      : this.studyMode
        ? this.isGuidedStudy()
          ? `🤖 AI 스터디 ${sol.id}/${STUDY_TOTAL}\n${sol.title} — 안내대로 두면 이깁니다!`
          : `🤖 AI 스터디 ${sol.id}/${STUDY_TOTAL}\n${sol.title}`
        : isRealIntro
          ? '⚔ 이제 실전! 이번 컴퓨터는 거의 무적이에요 🤖'
          : isPromotionMatch(this.levelProgress())
            ? // 이기면 바로 승급하는 판 — 긴장감을 준다
              `🎖 승급전!
이기면 ${aiLevelLabel(this.record.aiLevel + 1)} 으로`
            : `🤖 ${aiLevelLabel(this.record.aiLevel)}
${this.pressureLine()}`;
    void startCountdown(this, { go: 'START!', onStep: (n) => playCountdown(n) }).then(() => {
      playSfx('go');
      this.showToast(firstMsg, '#8FE8FF', 1700);
      if (this.isGuidedStudy()) {
        // 1·2번 스터디만: 제한시간과 코스 구성을 차례로 안내(첫 토스트가 사라진 뒤)
        this.time.delayedCall(2100, () => {
          if (!this.gameOver) {
            this.showToast(
              `⏱ 턴마다 ${Math.round(this.turnMs / 1000)}초! 아래 링 게이지를 봐 주세요`,
              '#8FE8FF',
              1800,
            );
          }
        });
        this.time.delayedCall(4100, () => {
          if (!this.gameOver) {
            this.showToast(
              `놓기 → 옮기기 → 막기 → 3목!\n${STUDY_WIN_TURN}단계까지 배우고 이깁니다 👍`,
              '#8FE8FF',
              2000,
            );
          }
        });
      } else if (isRealIntro) {
        // 실전 첫 판: 이길 욕심 없이 버텨도 승리할 수 있음을 안심시킨다
        this.time.delayedCall(2200, () => {
          if (!this.gameOver) {
            this.showToast(
              '⚔ 3목을 먼저 만들면 승리! 시간을 넘기면 패배예요',
              '#A8E6C8',
              2000,
            );
          }
        });
        this.study = { ...this.study, introShown: true };
        saveStudyProgress(this.study);
      }
      this.beginTurn();
    });
  }

  // ── 턴 진행 ──
  private beginTurn(): void {
    if (this.gameOver) return;
    this.warnedCell = null; // 실수 경고 강행 여부는 턴 단위로 리셋
    const me = this.state.turn;
    const isHuman = me === HUMAN;

    if (isHuman) {
      if (this.studyJustBlocked) {
        this.studyJustBlocked = false;
        // 1·2번 스터디에서만, 그것도 앞쪽 2회만 격려한다(잔소리 방지).
        if (this.isGuidedStudy() && this.studyBlockToasts < 2) {
          this.studyBlockToasts++;
          this.showToast('앗, 막혔어요! 다른 줄을 이어 봐요 💪', '#FFD9A0', 1500);
        }
      }
      this.updateHintBoxes();
    } else {
      this.clearThreatBoxes();
    }
    // 누구 차례인지는 **타이머 링 색**(파랑/핑크)과 캐릭터 공격으로 읽힌다 — 문구를 두지 않는다.

    this.refreshPieceLook();
    // 실유저 대전의 시계는 서버 마감이 진실이다 — 내 시계로 새로 20초를 세지 않는다.
    if (this.online) this.resumeTimer(this.online.remainMs(this.turnMs));
    else this.startTimer();
    this.timeoutClaimed = false;

    if (isHuman) {
      // 내 차례 신호 — 화면을 안 보고 있어도 알아채는 정도로만.
      // 스터디는 방금 hint_show 가 울렸으므로 겹쳐 울리지 않는다.
      if (!this.isStudy()) playSfx('turn_mine');
      this.accepting = true;
    } else {
      this.accepting = false;
      // 실유저 대전이면 상대의 수는 서버가 밀어 준다 — 여기서 둘 수 있는 게 없다.
      // (타이머는 계속 돈다: 상대가 시간을 넘기면 내가 그걸 서버에 알린다)
      if (this.online) return;
      // AI 는 잠깐 "고민" 후 착수(0.7~1.6초) — 턴 제한시간 안에서 항상 여유.
      // 봇 대전 상대는 사람처럼 보이도록 생각하는 시간을 더 넓게 흔든다(0.8~2.6초).
      const delay = this.isVersus() ? 800 + Math.random() * 1800 : 700 + Math.random() * 900;
      this.aiMoveTimer = this.time.delayedCall(delay, () => {
        if (this.gameOver) return;
        this.stopTimer();
        let cell: number;
        if (this.isVersus()) {
          // 대전: 상대 레이팅에서 파생한 강도로 둔다(약한 상대는 얕게 읽고 가끔 실수한다).
          cell = botMove(this.state, this.versusSkill);
        } else if (this.isStudy()) {
          // 스터디 상대도 성실하게 둔다 — 자기 즉승은 반드시 두고 내 3목은 반드시 막는다.
          // 안내수가 더 깊이 읽어서 이기는 구조라, 져 주는 연출은 쓰지 않는다.
          const playerWins = threatCells(this.state);
          cell = this.studyOpponent(this.state);
          if (playerWins.includes(cell)) this.studyJustBlocked = true;
        } else {
          // 싱글: 현재 AI 등급의 강도로 두되, 패배 기억에 있는 응수는 피한다
          // (같은 승리 패턴에 반복해서 당하지 않게)
          const key = posKey(this.state);
          const lv = aiLevelAt(this.record.aiLevel);
          // 이번 판 AI 의 첫 응수라면, 최근에 썼던 첫 응수는 **무조건** 피한다.
          // (같은 오프닝에 늘 같은 수로 받으면 외운 승리 수순이 그대로 재현된다)
          const isFirstReply = this.aiMoveLog.length === 0;
          cell = chooseMove(this.state, {
            depth: lv.depth,
            tolerance: lv.tolerance,
            banned: bannedAt(this.lossBook, this.state),
            avoid: isFirstReply ? recentReplies(this.openingBook, this.state) : [],
          });
          if (isFirstReply) {
            this.openingBook = rememberReply(this.openingBook, this.state, cell);
            saveOpeningBook(this.openingBook);
          }
          this.aiMoveLog.push({ key, cell });
        }
        this.commitAction(cell);
      });
    }
  }

  /** 현재 턴의 착수(배치/이동)를 상태에 적용하고 연출한다. */
  private commitAction(cell: number): void {
    const me = this.state.turn;
    const phase = phaseOf(this.state);
    const next = applyAction(this.state, cell);
    this.state = next;
    const { x, y } = this.cellCenter(cell);

    // 이번 턴의 주인이 상대를 치고 돌아온다(착수 연출과 동시 진행).
    this.playAttack(me);

    if (phase === 'place') {
      playSfx('place');
      const spr = this.add
        .image(x, y, me === HUMAN ? O_KEY : X_KEY)
        .setDepth(5)
        .setScale(0.1)
        .setAlpha(0);
      this.setPieceSize(spr);
      const targetScale = spr.scale;
      spr.setScale(targetScale * 1.6);
      this.sprites[me].push(spr);
      this.tweens.add({
        targets: spr,
        scale: targetScale,
        alpha: 1,
        duration: 200,
        ease: 'Back.Out',
        onComplete: () => this.afterAction(me),
      });
    } else {
      // 이동: 가장 오래된 말 스프라이트를 빼서 목적지로 트윈 후 최신(배열 끝)으로.
      playSfx('move');
      const spr = this.sprites[me].shift();
      if (!spr) throw new Error('sprite/state desync');
      this.sprites[me].push(spr);
      this.tweens.add({
        targets: spr,
        x,
        y,
        scale: { from: spr.scale, to: spr.scale * 1.12 },
        duration: 260,
        ease: 'Cubic.InOut',
        onComplete: () => {
          this.setPieceSize(spr);
          this.afterAction(me);
        },
      });
    }
  }

  private afterAction(mover: Player): void {
    if (mover === HUMAN) this.myTurns++;
    this.moveCount++;
    if (this.state.winner) {
      const cause: WinCause = 'line';
      this.endGame(this.state.winner, cause);
      return;
    }
    // 대전 무한 셔플 방지 — 이 룰은 보드가 차지 않아 스스로 끝나지 않는다(versus.ts 참고).
    if (this.isVersus() && isDrawByCap(this.moveCount)) {
      this.endGame(null, 'draw');
      return;
    }
    if (mover === HUMAN) {
      this.updateStudyBadge();
    }
    this.beginTurn();
  }

  /** 말 표시 크기 — 셀의 72%. */
  private setPieceSize(spr: Phaser.GameObjects.Image): void {
    const target = this.cellSize * 0.72;
    spr.setScale(target / spr.width);
  }

  /** 나이별 알파 + 컴퓨터 이동 글로우 + 내 다음 이동 말 외곽원 갱신(현재 턴 기준). */
  private refreshPieceLook(): void {
    for (const p of [HUMAN, AI] as const) {
      const cells = this.state.pieces[p];
      this.sprites[p].forEach((spr, i) => spr.setAlpha(pieceAlpha(i, cells.length)));
    }
    this.refreshNextRings();
  }

  /**
   * 다음 이동 예정 말 외곽원 갱신(양측) — 각자 말이 3개가 되면 가장 오래된 말에 표시.
   * 자기 차례(=이번에 실제로 움직일 말)면 선명, 상대 차례의 사전 예고면 반투명.
   * 2개 이하 초반에는 아직 이동 국면이 아니므로 표시하지 않는다.
   */
  private refreshNextRings(): void {
    for (const p of [HUMAN, AI] as const) {
      const ring = this.nextRings[p];
      const cells = this.state.pieces[p];
      if (cells.length < 3 || this.gameOver) {
        ring.setVisible(false);
        continue;
      }
      const { x, y } = this.cellCenter(cells[0]);
      const active = this.state.turn === p;
      const color = p === HUMAN ? COLOR_HUMAN : COLOR_AI;
      ring
        .setStrokeStyle(active ? 5 : 4, color, active ? 1 : 0.45)
        .setPosition(x, y)
        .setVisible(true);
    }
  }

  private hideNextRings(): void {
    this.nextRings.O.setVisible(false);
    this.nextRings.X.setVisible(false);
  }

  // ── 턴 타이머 ──
  /** 이번 턴의 제한시간을 처음부터 건다. */
  private startTimer(): void {
    this.resumeTimer(this.turnMs);
  }

  /** 남은 시간 `remainMs` 부터 다시 건다(백그라운드 복귀 시 이 경로로 들어온다). */
  private resumeTimer(remainMs: number): void {
    this.stopTimer();
    this.turnRemainMs = remainMs;
    this.lastTickSecond = -1;
    this.drawTimer(this.turnRemainMs);
    // 화면 밖에서 시작된 턴은 시계를 걸지 않고 얼려 둔다 — 돌아왔을 때 온전한 시간으로 시작한다
    // (내가 없는 동안 상대가 두고 내 차례가 되는 경우).
    if (typeof document !== 'undefined' && document.hidden) {
      this.pausedRemainMs = remainMs;
      return;
    }
    this.timerEvent = this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        this.turnRemainMs -= 100;
        if (this.turnRemainMs <= 0) {
          this.drawTimer(0);
          this.onTimeout();
          return;
        }
        this.drawTimer(this.turnRemainMs);
        // 경고 구간 초읽기 틱(정수 초 경계마다 1회)
        if (this.turnRemainMs <= WARN_MS) {
          const sec = Math.ceil(this.turnRemainMs / 1000);
          if (sec !== this.lastTickSecond) {
            this.lastTickSecond = sec;
            playSfx('tick');
          }
          // 1·2번 스터디: 처음 시간이 촉박해지면 부드럽게 리마인드(판당 1회)
          if (this.isGuidedStudy() && !this.studyTimeWarned && this.state.turn === HUMAN) {
            this.studyTimeWarned = true;
            this.showToast('⏰ 시간이 얼마 없어요 — 파란 박스에 두면 돼요!', '#FFD9A0', 1500);
          }
        }
      },
    });
  }

  private stopTimer(): void {
    this.timerEvent?.remove();
    this.timerEvent = null;
  }

  private drawTimer(remainMs: number): void {
    const cx = TIMER_X;
    const cy = TIMER_Y;
    const radius = 128;
    const frac = Phaser.Math.Clamp(remainMs / this.turnMs, 0, 1);
    const warn = remainMs <= WARN_MS;
    const color = warn ? COLOR_WARN : this.state.turn === HUMAN ? COLOR_HUMAN : COLOR_AI;

    this.timerRing.clear();
    // 바닥 트랙
    this.timerRing.lineStyle(18, 0x2a2545, 0.8);
    this.timerRing.beginPath();
    this.timerRing.arc(cx, cy, radius, 0, Math.PI * 2);
    this.timerRing.strokePath();
    // 남은 시간 아크(12시 방향부터 시계방향으로 줄어든다)
    if (frac > 0) {
      this.timerRing.lineStyle(18, color, 1);
      this.timerRing.beginPath();
      this.timerRing.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      this.timerRing.strokePath();
    }
    this.timerText.setText((remainMs / 1000).toFixed(1)).setColor(warn ? '#FF6B6B' : '#FFFFFF');
  }

  private onTimeout(): void {
    this.stopTimer();
    const wasHuman = this.state.turn === HUMAN;
    this.accepting = false;
    this.aiMoveTimer?.remove();
    this.aiMoveTimer = null;
    this.clearThreatBoxes();

    // 실유저 대전은 여기서 결과를 정하지 않는다 — 시간의 권위는 서버에 있다.
    // 내 시계가 빨랐을 수도 있으므로 "넘긴 것 같다"고 알리기만 하고 판정을 기다린다.
    // (양쪽 다 사라진 판은 서버의 스윕 작업이 정리한다)
    if (this.online) {
      if (this.timeoutClaimed) return;
      this.timeoutClaimed = true;
      this.showToast('⏳ 시간 초과 확인 중…', '#FFD9A0', 1200);
      void this.online.claimTimeout();
      return;
    }

    playSfx('timeout');
    this.cameras.main.shake(180, 0.004);
    // 룰: 제한시간 내에 턴을 마치지 못하면 그 즉시 패배한다(이전 '턴 상실'에서 강화).
    const foeLabel = this.versusFoe ? `${this.versusFoe.name} 님` : '컴퓨터';
    this.showToast(wasHuman ? '⏰ 시간 초과! 패배했습니다' : `⏰ ${foeLabel} 시간 초과!`, '#FF8A80');
    this.time.delayedCall(700, () => this.endGame(wasHuman ? AI : HUMAN, 'timeout'));
  }

  // ── 종료/재시작 ──
  /** 판 종료. `winner === null` 이면 무승부(대전 전용). */
  private endGame(winner: Player | null, cause: WinCause = 'line'): void {
    if (this.gameOver) return; // 두 번 불리면 전적·목표치가 두 번 오른다
    this.gameOver = true;
    this.accepting = false;
    this.stopTimer();
    this.hideNextRings();
    this.clearThreatBoxes();

    const outcome: Outcome = winner === null ? 'draw' : winner === HUMAN ? 'win' : 'loss';
    if (winner) this.showDefeatPose(winner === HUMAN ? AI : HUMAN); // 진 쪽은 주저앉는다

    // 포인트는 싱글 전용 보상이다 — 대전은 레이팅으로만 정산한다.
    const earned = !this.isVersus() && outcome === 'win' && isScoredCause(cause) ? POINTS[cause] : 0;
    if (this.isVersus()) this.settleVersus(outcome);
    else if (isScoredCause(cause)) this.settleSingle(outcome === 'win', cause);
    this.updateRecordText();

    const title = this.resultTitle(outcome);
    playSfx(outcome === 'win' ? 'win' : outcome === 'draw' ? 'draw' : 'lose');

    if (winner) this.highlightWinLine(winner);
    this.time.delayedCall(RESULT_OVERLAY_DELAY_MS, () => this.showResultOverlay(outcome, title, earned));
  }

  /** 결과 제목 — 상단 배너와 오버레이가 같은 문구를 쓴다. */
  private resultTitle(outcome: Outcome): string {
    if (outcome === 'draw') return '🤝 무승부';
    if (outcome === 'loss') return '😢 패배';
    return '🎉 승리!';
  }

  /**
   * 대전 정산 — 레이팅과 대전 전적만 움직인다.
   * 싱글 전적·포인트·버티기 목표·패배 기억은 **일부러 건드리지 않는다**(모드 분리).
   */
  private settleVersus(outcome: Outcome): void {
    const foe = this.versusFoe;
    if (!foe) return;
    const online = this.online;

    if (online) {
      // 실유저 대전 — 서버가 DB 에 쓴 것과 **같은 입력·같은 함수**로 계산한다
      // (판 시작 시점 레이팅 두 개 + 공유 Elo). 그래서 값을 따로 받아올 필요가 없다.
      this.versusDelta = ratingDelta(online.myRatingAt, online.foeRatingAt, outcome);
      const rating = applyRatingDelta(online.myRatingAt, this.versusDelta);
      this.versusRecord = {
        ...applyResult(this.versusRecord, outcome, 0),
        rating, // 누적이 아니라 서버 기준 절대값으로 덮는다(로컬 캐시 드리프트 제거)
      };
    } else {
      this.versusDelta = ratingDelta(this.versusRecord.rating, foe.rating, outcome);
      this.versusRecord = applyResult(this.versusRecord, outcome, this.versusDelta);
    }

    saveVersusRecord(this.versusRecord);
    this.aiMoveLog = [];
  }

  /**
   * 이번 결과 화면의 "다시 하기" 가 **광고 관문**으로 바뀌는가 — 진 판 `AD_RETRY_EVERY` 번에
   * 한 번(유저 확정 2026-08-05).
   *
   * ⚠️ 광고를 봐도 따로 주는 보상은 없다 — 다시하기 자체가 무료였다가 **N번에 한 번만** 광고를
   *    거치는 구조다. 그래서 보상형이 아니라 관문(전면) 광고를 쓴다(`playGateAd`).
   *
   * 판정은 `logic/adGate` 가 한다(테스트로 잠가 두려고 씬 밖으로 뺐다). 광고를 띄울 수 없는
   * 타겟(msstore/android/ios)에서는 관문이 통째로 사라진다 — 라벨만 "광고 보고 다시하기" 이고
   * 실제로는 아무 일도 안 일어나면 스토어 심사에서 미동작 기능이다.
   */
  private isAdRetryTurn(): boolean {
    const { ads } = store;
    return isAdGateTurn({
      losses: this.record.losses,
      studyMode: this.studyMode,
      versus: this.isVersus(),
      adsUsable: ads.fullscreenSupported || ads.allowPlaceholders,
      every: AD_RETRY_EVERY,
    });
  }

  /** 광고 보고 다시하기 — 광고가 **닫힌 뒤에** 새 판을 연다(가려진 채 제한시간이 흐르면 안 된다). */
  private adRetry(): void {
    playSfx('ad_open'); // 광고로 넘어가는 전환의 이질감을 덮는다
    playGateAd(this, () => this.startNewGame());
  }

  /**
   * 광고 보고 승급전 패배 무효화 — 끝까지 시청해야만(리워드형) 되돌린다. 이번 판 승부·전적은
   * 그대로 두고 **승급전 연승만** 패배 직전 값으로 복구한다(공정성엔 손대지 않는다).
   * 광고를 못 봤거나 중간에 닫으면 그냥 평범한 재도전 — 패배는 취소되지 않는다.
   */
  private undoPromotionLoss(): void {
    const restoreStreak = this.promotionStreakToRestore;
    if (restoreStreak == null) {
      this.startNewGame();
      return;
    }
    playSfx('ad_open');
    playRewardedAd(this, {
      onReward: () => {
        this.record = { ...this.record, levelStreak: restoreStreak };
        saveRecord(this.record);
        this.promotionStreakToRestore = null;
        this.showToast('🎖 패배가 취소됐어요! 승급전 계속!', '#FFD54D', 1800);
        this.startNewGame();
      },
      onUnavailable: () => this.startNewGame(), // 광고 실패로 사용자를 가두지 않는다.
    });
  }

  /**
   * 싱글/스터디 정산 — 전적·포인트·버티기 목표·패배 기억·스터디 진행.
   * 포기·이탈·무승부는 싱글에 없다(전부 대전 전용 종료 원인) → `ScoredCause` 만 받는다.
   */
  private settleSingle(humanWon: boolean, cause: ScoredCause): void {
    const earned = humanWon ? POINTS[cause] : 0;
    this.studyProgressNow = null; // 이번 판의 스터티 성취는 아래 advanceStudy 가 다시 채운다

    // 승급 = 그 등급의 판수를 채운 **뒤에** 3연승(logic/levelProgress).
    // 스터디 판은 등급 진행 대상이 아니다(상대가 다른 규칙으로 둔다) — 대전은 여기까지 오지 않는다.
    const before = this.levelProgress();
    const after = this.studyMode ? before : applySingleResult(before, humanWon);
    const promoted = after.level > before.level;
    this.promotedNow = promoted;
    // 승급전 중 실제로 쌓은 연승(1승 이상)을 이번 패배로 잃었을 때만 되돌릴 게 있다.
    this.promotionStreakToRestore =
      !humanWon && !this.studyMode && isPromotionStage(before) && before.streak > 0 ? before.streak : null;
    this.record = {
      ...this.record,
      wins: humanWon ? this.record.wins + 1 : this.record.wins,
      losses: humanWon ? this.record.losses : this.record.losses + 1,
      points: humanWon ? this.record.points + earned : this.record.points,
      aiLevel: after.level,
      levelWins: after.wins,
      levelStreak: after.streak,
    };
    saveRecord(this.record);

    // 패배 학습 — 싱글에서 진 판은 **승리 방식과 무관하게**(3목·버티기·시간초과 모두)
    //   그 판의 응수를 전부 기억한다. 같은 승리 루틴을 다시 쓰면 처음 갈림길부터 다른 응수가 나온다.
    //   (필수 차단은 chooseMove 가 "대안이 전부 강제 패배면 금지 무시"로 지켜 준다)
    if (shouldRemember({ humanWon, isStudy: this.studyMode, log: this.aiMoveLog })) {
      this.lossBook = rememberLoss(this.lossBook, this.aiMoveLog);
      saveLossBook(this.lossBook);
    }
    this.aiMoveLog = [];

    // AI 스터디 진행 — **승리해야만** 다음 솔루션으로 전진(못 이기면 같은 솔루션 반복)
    if (this.studyMode && humanWon) this.advanceStudy();
  }

  /**
   * 스터디 1개 클리어 — 진행을 저장하고 다음 솔루션으로 커서를 옮긴다.
   * 자동으로 열린 도입부(솔루션 1·2)를 끝내면 스터디를 닫고 실전으로 보낸다.
   */
  private advanceStudy(): void {
    const cleared = this.currentSolution();
    const solved = Math.max(this.study.solved, this.studyCursor + 1);
    this.study = { ...this.study, solved };
    saveStudyProgress(this.study);
    this.studyCursor = (this.studyCursor + 1) % STUDY_TOTAL;

    if (solved >= STUDY_TOTAL) {
      this.studyChoice = 'real'; // 20개를 다 풀었으면 실전으로 돌려보낸다
      this.studyProgressNow = 'complete';
      this.showToast(`🏅 승리 솔루션 ${STUDY_TOTAL}개 완주!`, '#FFD54D', 1800);
      return;
    }
    this.studyProgressNow = 'clear';
    if (this.studyChoice !== 'study' && solved >= STUDY_INTRO_ROUNDS) {
      this.showToast('🤖 기본 스터디 완료! 이제 실전', '#A8E6C8', 1600);
      return;
    }
    this.showToast(`✅ ${cleared.id}번 클리어!`, '#A8E6C8', 1400);
  }

  /**
   * 3목 라인 광선검 참격 연출 — "베이는" 3단 연출 후 연결선이 남는다.
   *  ① 참격: 승자 색 검광이 급가속으로 그어짐 ② 임팩트: 섬광 + 불꽃 파편 + 말이 베인 듯
   *  튕기는 반응 + 화면 흔들림 ③ 세 칸을 잇는 광선이 상시 유지(은은한 맥동).
   */
  private highlightWinLine(winner: Player): void {
    const line = this.state.winLine;
    if (!line) return;
    const color = winner === HUMAN ? COLOR_HUMAN : COLOR_AI;
    const a = this.cellCenter(line[0]);
    const c = this.cellCenter(line[2]);
    // 셀 밖으로 크게 뻗는 오버슈트 — 검을 휘둘러 베는 느낌
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const sx = a.x - ux * 85;
    const sy = a.y - uy * 85;
    const ex = c.x + ux * 85;
    const ey = c.y + uy * 85;

    const beam = this.add.graphics().setDepth(6);
    this.winFx.push(beam);
    playSfx('saber');

    /** 완성형 연결선 — 세 칸을 잇는 광선(임팩트 후 상시 유지). */
    const drawFinal = () => {
      if (!beam.active) return;
      beam.clear();
      beam.lineStyle(42, color, 0.26);
      beam.lineBetween(sx, sy, ex, ey);
      beam.lineStyle(22, color, 0.6);
      beam.lineBetween(sx, sy, ex, ey);
      beam.lineStyle(8, 0xffffff, 0.95);
      beam.lineBetween(sx, sy, ex, ey);
      beam.fillStyle(0xffffff, 0.95);
      beam.fillCircle(sx, sy, 9);
      beam.fillCircle(ex, ey, 9);
    };

    // ① 참격 — 급가속 스트로크(칼끝 발광이 라인을 그으며 지나간다)
    const sweep = { t: 0 };
    const drawBlade = () => {
      if (!beam.active) return; // 재시작 등으로 파괴된 뒤의 콜백 가드(게임루프 보호)
      const tx = sx + (ex - sx) * sweep.t;
      const ty = sy + (ey - sy) * sweep.t;
      beam.clear();
      beam.lineStyle(30, color, 0.4);
      beam.lineBetween(sx, sy, tx, ty);
      beam.lineStyle(10, 0xffffff, 1);
      beam.lineBetween(sx, sy, tx, ty);
      beam.fillStyle(color, 0.6);
      beam.fillCircle(tx, ty, 30);
      beam.fillStyle(0xffffff, 1);
      beam.fillCircle(tx, ty, 12);
    };
    this.tweens.add({
      targets: sweep,
      t: 1,
      duration: 190,
      ease: 'Expo.In', // 검격: 마지막에 확 베어내는 급가속
      onUpdate: drawBlade,
      onComplete: () => {
        if (!beam.active) return;
        // ② 임팩트 — 섬광 + 불꽃 파편 + 화면 흔들림
        this.cameras.main.shake(160, 0.0045);
        const flash = this.add.graphics().setDepth(7);
        flash.lineStyle(64, 0xffffff, 0.85);
        flash.lineBetween(sx, sy, ex, ey);
        this.winFx.push(flash);
        this.tweens.add({ targets: flash, alpha: 0, duration: 170, ease: 'Cubic.Out' });
        for (let i = 0; i < 14; i++) {
          const t = Math.random();
          const px = sx + (ex - sx) * t;
          const py = sy + (ey - sy) * t;
          const side = Math.random() < 0.5 ? -1 : 1;
          const speed = 70 + Math.random() * 130;
          const p = this.add
            .circle(px, py, 3 + Math.random() * 4, i % 3 === 0 ? 0xffffff : color, 1)
            .setDepth(7);
          this.winFx.push(p);
          this.tweens.add({
            targets: p,
            x: px + -uy * side * speed + (Math.random() - 0.5) * 50,
            y: py + ux * side * speed + (Math.random() - 0.5) * 50,
            alpha: 0,
            scale: 0.3,
            duration: 320 + Math.random() * 280,
            ease: 'Cubic.Out',
          });
        }
        // ③ 연결선 확정 + 은은한 맥동(다음 판 시작까지 유지)
        drawFinal();
        this.tweens.add({ targets: beam, alpha: { from: 1, to: 0.82 }, duration: 620, yoyo: true, repeat: -1 });
      },
    });

    // 라인 위의 승리 말 — 베인 듯 튕기는 반응(검이 지나간 직후)
    const cells = this.state.pieces[winner];
    this.sprites[winner].forEach((spr, i) => {
      if (!line.includes(cells[i])) return;
      this.tweens.add({
        targets: spr,
        scale: { from: spr.scale * 0.86, to: spr.scale * 1.16 },
        delay: 170,
        duration: 110,
        yoyo: true,
        repeat: 1,
        ease: 'Quad.Out',
        onComplete: () => spr.active && spr.setScale((this.cellSize * 0.72) / spr.width),
      });
      this.tweens.add({
        targets: spr,
        angle: { from: -7, to: 7 },
        delay: 170,
        duration: 55,
        yoyo: true,
        repeat: 3,
        onComplete: () => spr.active && spr.setAngle(0),
      });
    });
  }

  /**
   * 결과 화면의 성과음 — 오버레이가 떠오른 **뒤에** 한 박자 늦게 울린다.
   * (팝업 등장음과 겹치면 둘 다 뭉개진다. 성과가 여럿이면 가장 큰 것 하나만 울린다:
   *  승급 > 스터디 완주 > 스터디 클리어 > 포인트/레이팅)
   */
  private playRewardSfx(win: boolean): void {
    const delayed = (name: SfxName, ms = REWARD_SFX_DELAY_MS): void => {
      this.time.delayedCall(ms, () => playSfx(name));
    };
    if (this.isVersus()) {
      delayed(this.versusDelta >= 0 ? 'rating_up' : 'rating_down');
      return;
    }
    if (this.promotedNow) {
      delayed('promote');
      return;
    }
    if (this.studyProgressNow) {
      delayed(this.studyProgressNow === 'complete' ? 'study_complete' : 'study_clear');
      return;
    }
    if (win) delayed('point_gain');
  }

  private showResultOverlay(outcome: Outcome, title: string, earned: number): void {
    const c = this.add.container(0, 0).setDepth(1000);
    this.overlay = c;

    const win = outcome === 'win';
    const draw = outcome === 'draw';
    const versus = this.isVersus();
    const delta = this.versusDelta;

    playSfx('ui_popup_open');
    this.playRewardSfx(win);

    const dim = this.add
      .rectangle(W / 2, H / 2, W, H, 0x05030c, 0.72)
      .setInteractive(); // 뒤쪽 보드 입력 흡수
    c.add(dim);

    const titleText = this.add
      .text(W / 2, 940, title, {
        fontFamily: 'Jua, sans-serif',
        fontSize: '130px',
        color: win ? '#8FE8FF' : draw ? '#D9DEF8' : '#FF9EC2',
      })
      .setOrigin(0.5)
      .setStroke(win ? '#0E5A8A' : draw ? '#2A2545' : '#8A0E42', 14);
    c.add(titleText);

    // 대전은 포인트 대신 레이팅 변동이 성적표다.
    const sub = this.add
      .text(
        W / 2,
        1090,
        versus
          ? `레이팅 ${delta >= 0 ? '+' : ''}${delta}  →  ${this.versusRecord.rating}`
          : win
            ? `⭐ +${earned}P 획득!`
            : '다음 판엔 이길 수 있어요!',
        {
          fontFamily: 'Jua, sans-serif',
          fontSize: '56px',
          color: versus ? (delta >= 0 ? '#A8E6C8' : '#FF9EC2') : win ? '#FFD54D' : '#D9DEF8',
        },
      )
      .setOrigin(0.5);
    c.add(sub);

    // 대전은 레이팅·상대만, 싱글은 **등급 + 다음 등급까지 남은 경기**만 보여준다.
    //   ⚠️ 결과 화면에 정보를 많이 쌓지 않는다(유저 확정 2026-08-05):
    //      획득 포인트 / 현재 등급 / 다음 등급까지 필요한 경기 — 이 셋이면 충분하다.
    if (versus) {
      const rec = this.add
        .text(
          W / 2,
          1190,
          `🆚 ${this.versusRecord.wins}승 ${this.versusRecord.losses}패 ${this.versusRecord.draws}무`,
          { fontFamily: 'Jua, sans-serif', fontSize: '44px', color: '#9FA8D8' },
        )
        .setOrigin(0.5);
      c.add(rec);
      if (this.versusFoe) {
        const foe = this.versusFoe;
        const foeLine = this.add
          .text(W / 2, 1258, `상대  ${foe.flair} ${foe.name} · ${foe.rating}`, {
            fontFamily: 'Jua, sans-serif',
            fontSize: '40px',
            color: '#7A82AC',
          })
          .setOrigin(0.5);
        c.add(foeLine);
      }
    } else if (!this.studyMode) {
      const lv = aiLevelAt(this.record.aiLevel);
      const levelLine = this.add
        .text(
          W / 2,
          1200,
          this.promotedNow ? `🎖 승급!  ${aiLevelLabel(lv.level)}` : `🤖 ${aiLevelLabel(lv.level)}`,
          {
            fontFamily: 'Jua, sans-serif',
            fontSize: '48px',
            color: this.promotedNow ? '#FFD54D' : '#A8E6C8',
          },
        )
        .setOrigin(0.5);
      c.add(levelLine);

      const nextLine = this.add
        .text(W / 2, 1276, this.nextLevelText(), {
          fontFamily: 'Jua, sans-serif',
          fontSize: '40px',
          color: '#9FA8D8',
        })
        .setOrigin(0.5);
      c.add(nextLine);
    }

    // 버튼 — 다음(결과별) / (패배 시) 광고 보고 다시하기 / 홈으로. 세로로 쌓아 둔다.
    // 모두 **같은 가로폭**으로 맞춘다(유저 확정) — 세로로 쌓았을 때 줄이 맞아야 깔끔하다.
    // "광고 보고 다시하기" 처럼 긴 라벨도 들어가야 해서 폭을 넉넉히 잡았다(모든 버튼 동일 폭).
    const BTN_W = 660;
    const BTN_H = 140;

    /**
     * 오버레이 버튼 — 아이콘과 글자를 **따로 그려 한 덩어리로 중앙정렬**한다.
     * (아이콘과 글자를 한 Text 에 합치면 폭 계산이 어긋나 가운데가 밀린다)
     *
     * `icon` 이 로드된 텍스처 키면 네온 아이콘 이미지로, 아니면 그 문자열을 그대로 그린다
     * (홈 버튼처럼 전용 아이콘이 없는 자리는 이모지를 쓴다).
     */
    const makeOverlayButton = (
      y: number,
      icon: string,
      label: string,
      fill: number,
      sfx: SfxName,
      onTap: () => void,
    ) => {
      const g = this.add.graphics();
      g.fillStyle(fill, 1);
      g.fillRoundedRect(W / 2 - BTN_W / 2, y - BTN_H / 2, BTN_W, BTN_H, 34);
      g.lineStyle(6, 0xffffff, 0.85);
      g.strokeRoundedRect(W / 2 - BTN_W / 2, y - BTN_H / 2, BTN_W, BTN_H, 34);
      c.add(g);

      let iconObj: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
      if (this.textures.exists(icon)) {
        // 아이콘 원본은 정사각에 가깝지만 크기가 제각각이라 **표시 높이**로 통일한다.
        const img = this.add.image(0, y, icon).setOrigin(0.5);
        img.setScale(BTN_ICON_SIZE / Math.max(1, img.height));
        iconObj = img;
      } else {
        iconObj = this.add.text(0, y, icon, { fontSize: '52px' }).setOrigin(0.5);
      }
      const labelText = this.add
        .text(0, y, label, { fontFamily: 'Jua, sans-serif', fontSize: '58px', color: '#FFFFFF' })
        .setOrigin(0.5);
      // 긴 라벨("광고 보고 다시하기")이 버튼 밖으로 삐져나오지 않게 글자만 줄인다 —
      // 버튼 폭은 모두 같아야 하므로(유저 확정) 상자를 늘리는 대신 글자를 맞춘다.
      const room = BTN_W - BTN_INNER_PAD * 2 - iconObj.displayWidth - BTN_ICON_GAP;
      if (labelText.width > room) labelText.setScale(room / labelText.width);

      const iconW = iconObj.displayWidth;
      const left = W / 2 - (iconW + BTN_ICON_GAP + labelText.displayWidth) / 2;
      iconObj.setX(left + iconW / 2);
      labelText.setX(left + iconW + BTN_ICON_GAP + labelText.displayWidth / 2);
      c.add(iconObj);
      c.add(labelText);

      // 눌림 팝 — 아이콘은 표시 크기를 맞추느라 배율이 1이 아니다. 각자의 **기준 배율**을 축으로
      // 눌렀다 놓아야 한다(공통 scale 로 묶으면 아이콘이 원본 크기로 튀어 오른다).
      const pop = (obj: Phaser.GameObjects.Image | Phaser.GameObjects.Text) => {
        const base = obj.scaleX;
        this.tweens.add({
          targets: obj,
          scaleX: { from: base * 0.92, to: base },
          scaleY: { from: base * 0.92, to: base },
          duration: 120,
          ease: 'Back.Out',
        });
      };

      const z = this.add.zone(W / 2, y, BTN_W, BTN_H).setOrigin(0.5).setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => {
        playSfx(sfx);
        pop(iconObj);
        pop(labelText);
        onTap();
      });
      c.add(z);
    };

    // 라벨은 결과에 따라 달라진다 — 이겼으면 "다시" 하는 게 아니라 **다음으로 나아가는** 것이다.
    //   승급 → 다음 등급 / 승리 → 다음 판 / 패배 → 다시 하기(3판에 한 번은 광고, 단 승급전
    //   연승을 실제로 잃었으면 그 구제가 우선) / 대전 → 새 상대
    // 버튼을 하나 더 두지 않는다(같은 자리에서 겹치면 뭘 눌러야 할지 헷갈린다) — 이번 패배가
    // 승급전 연승을 끊었으면 관문 광고보다 "승급전 이어가기" 제안을 우선한다(PO 2026-09-02).
    const promotionUndo = !win && !versus && this.promotionStreakToRestore != null;
    const adGate = !win && !promotionUndo && this.isAdRetryTurn();
    const [nextIcon, nextLabel] = versus
      ? [BTN_ICON.findFoe, '새 상대 찾기']
      : this.promotedNow
        ? [BTN_ICON.nextLevel, '다음 등급으로']
        : win
          ? [BTN_ICON.nextGame, '다음 판']
          : promotionUndo
            ? [BTN_ICON.adRetry, '광고 보고 승급전 이어가기']
            : adGate
              ? [BTN_ICON.adRetry, '광고 보고 다시하기']
              : [BTN_ICON.retry, '다시 하기'];
    makeOverlayButton(
      BTN_FIRST_Y,
      nextIcon,
      nextLabel,
      win ? 0x1587c8 : draw ? 0x4a4470 : promotionUndo || adGate ? 0x246b45 : 0xc4256e,
      'ui_btn_confirm', // 앞으로 나아가는 버튼 — 상승음
      () => {
        if (versus) this.scene.start('match');
        else if (promotionUndo) this.undoPromotionLoss();
        else if (adGate) this.adRetry();
        else this.startNewGame();
      },
    );

    // 홈(게임 선택) 화면으로 — 바로 아래, 같은 가로폭. 전용 아이콘이 없어 이모지를 쓴다.
    makeOverlayButton(BTN_FIRST_Y + BTN_STEP_Y, '🏠', '홈으로', 0x2a2150, 'ui_btn_cancel', () =>
      this.scene.start('menu'),
    );

    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 260 });
  }
}
