/**
 * boardView.ts — 하단 매치-3 보드의 뷰(Phaser). 형제 eco01/Logistics 의 매치-3 "손맛"을 계승.
 *
 * 입력: **드래그-스왑 주 + 탭-탭 보조**(씬 레벨 pointermove/up). 잘못된 스왑은 되돌리고 흔든다.
 * 연쇄: 순수 로직(logic/board.resolveSwap)이 step 단위로 결과를 주면 뷰가 단계별로 연출한다 —
 *   2단 팝(오버슈트→소멸+회전) · 파티클 버스트 · 거리정확 중력낙하/리필 · 콤보 배너 · 카메라 흔들/플래시.
 * 매치가 끝나면 onResolved({spins,multiplier,cleared}) 로 상단 슬롯에 스핀을 적립한다.
 * 교착(이동 불가) 시 자동 셔플.
 */
import Phaser from 'phaser';
import { haptics } from '@casual/core';
import type { BoardGeom } from './layoutGeom.js';
import { PUZZLE_TILE_KEYS, SPECIAL_TILE_KEYS, SPECIAL_FX_KEY, COLLECT_GEM_TYPE, POWER_OVERLAY_KEYS } from '../assets.js';
import {
  createGrid,
  resolveSwap,
  isAdjacent,
  countAvailableMoves,
  findRuns,
  isSpecial,
  specialKind,
  isPower,
  powerKind,
  powerColor,
  POWER_LINE_H,
  POWER_LINE_V,
  POWER_COLOR,
  SPECIAL_BASE,
  SPECIAL_KINDS,
  SPECIAL_SPIN,
  SPECIAL_ATTACK,
  SPECIAL_RAID,
  type Grid,
  type Coord,
  type ResolveStep,
  type SpecialSpawn,
} from '../logic/board.js';
import type { Rng } from '../logic/rng.js';
import { puzzleMultiplierFromRuns } from '../logic/economy.js';
import { spinRefundMult } from '../logic/playParams.js';
import type { Sfx } from '../audio.js';
import { FancyNumber } from './fancyNumber.js';

/** 한 매치 결과 — 퍼즐 멀티(매치 구조 기반: 각 run 배수의 곱 + 제거수×0.1)와 제거 타일수. */
export interface ResolvedInfo {
  readonly puzzleMult: number;
  readonly cleared: number;
}

/** 사용할 **일반 젬 종류 수**(PUZZLE_TILE_KEYS 앞에서 TYPES 개). ⭐2026-07-02 요청: 미션 난이도↓ + 08/09 포함 + 상자/코인 제외 +
 *  **모든 색 상이**(같은 색 금지) → 색이 전부 다른 **5종**으로 확정(별·다이아·방패·번개·배터리). 종류↓ = 매칭 쉬움 = 미션 진행↑. */
const TYPES = 5;
const SPARK_TEX = 'sc_spark';

/**
 * ⭐배열 파동 착지(요청 2026-06-29) — 젬이 배열될 때(낙하 → 안착) **한번에 멈추지 않고** 감쇠 다중 바운스로
 *   출렁이며 정착한다. 핵심 두 가지:
 *     ① **중심 크게 → 외곽 작게** — 흔들림 진폭이 '움직임의 중심'(매치 칸들의 중심)에 가까운 젬일수록 크고,
 *        멀어질수록 작다(LAND_AMP_MAX→MIN, 진앙 거리 LAND_PROX_CELLS 로 감쇠).
 *     ② **큰 흔들림 → 작은 흔들림 정리** — 각 젬의 바운스가 흡수→반동→여진→정착으로 **점점 작아지며** 가라앉는다.
 *   자연 낙하 시차(열·거리)가 더해져 보드가 중심부터 바깥으로 파동치듯 배열된다. 쉴 때는 전혀 안 움직임(상시 흔들림 없음).
 */
const LAND_AMP_MAX = 0.16; // 진앙 중심 젬 흔들림 진폭(±16%, 큰 출렁)
const LAND_AMP_MIN = 0.035; // 외곽 젬 최소 진폭(±3.5%, 작게)
const LAND_PROX_CELLS = 2.6; // 진앙 거리 감쇠 길이(셀) — 이 거리에서 중심/외곽 진폭이 1/e 로 보간
/** ⭐연쇄(캐스케이드) 단계 사이 **아주 미세한 텀**(ms) — 각 매치가 "터졌다"는 인지를 한 박자 주고 다음 매치로
 *  이어지게 한다(요청 2026-06-29). 너무 길면 연쇄가 늘어지고 0 이면 단계가 뭉개진다. */
const CASCADE_STEP_GAP_MS = 90;
const LAND_ABSORB_MS = 60; // ① 흡수(납작) 시간
const LAND_REBOUND_MS = 92; // ② 반동(길쭉, 1차 큰 흔들림) 시간
const LAND_JIGGLE_MS = 78; // ③ 여진(반대로 작게, 작은 흔들림) 시간
const LAND_REST_MS = 86; // ④ 정착(원복) 시간

/** ⭐매칭 발견성(요청) — **아이들 힌트**: 무입력이 HINT_IDLE_MS 넘으면 최적수를 펄스로 알려준다.
 *  읽기 전용(grid/경제 미변경). 폴링 간격 HINT_POLL_MS 로 유휴를 감시. */
const HINT_IDLE_MS = 3500;
const HINT_POLL_MS = 500;
/** ⭐**무브 풍부성 보장** — 생성/셔플 시 최소 가용 매치 수(MIN_MOVES_START) 이상이 되도록 재생성한다.
 *  ⚠️라운드 끝 셔플은 **완전 교착(0개)** 일 때만(MIN_MOVES_PLAY=1) — 이전 선제 셔플(<2)이 **매칭 가능한 단일 매치(특수 포함)를
 *  셔플로 없애던 버그**(요청)를 막는다. 매치가 하나라도 있으면(특수든 일반이든) 셔플하지 않는다. */
const MIN_MOVES_START = 5;
const MIN_MOVES_PLAY = 1;
const BOARD_GEN_TRIES = 12;

/**
 * 특수 젬 등장 — ⭐밀도 조정(2026-06-28): 발견성 위해 ½로 줄였다가(캡6) **약간 상향(요청)** → 캡 **8**·리필 **13%**
 *   (원본 12/18% 의 ~⅔ 수준 — 발견성과 특수 빈도의 절충). 특수 젬은 board.matchable() 상 **종류 무관**
 *   (어떤 특수든 인접 3개면 매치)이라 8개로 충분. 36칸 중 특수 ~8칸 → 일반 5색 가독성 유지.
 *   ⚠️특수 빈도가 원본의 ~⅔ 이므로 **PlayScene.specialMatchMult 를 ~1.5배로 보정**(3→8·4→15·5→30·6+→150)해
 *     스핀/공격/약탈 경제 throughput 평탄 유지(슬롯/퍼즐 RTP 는 특수 수와 무관 — 불변). */
// ⭐2026-07-02 요청: **특수젬 제거**(어택/레이드는 슬롯 3매치로 이전됨). chance/cap/seed = 0 → 보드는 일반 신규젬만.
const SPECIAL_SPAWN: SpecialSpawn = { chance: 0, cap: 0 };
/** 시작/셔플 시 즉시 심는 특수 젬 수 — 0(특수젬 폐지). */
const SPECIAL_SEED = 0;

/**
 * AI 자동매치 우선순위 가중치(요청) — **특수젬 먼저, 그 중 스핀젬 최우선**(유저에게 가장 유리).
 * 스핀 ≫ 기타 특수(공격/약탈) ≫ 일반 퍼즐 점수. 일반 점수는 최대 ~수백이라 가중치를 그보다 크게 둔다.
 */
const AI_SPIN_PRIORITY = 100000;
const AI_SPECIAL_PRIORITY = 1000;
/** 연쇄(2·3차) 깊이 1단계당 보너스 — 캐스케이드를 유발하는 수를 선호(특수 우선은 유지). */
const AI_CASCADE_BONUS = 150;

/** 매치 칸을 비우고 **중력만**(리필 없이) 적용 — 빈 칸은 -1. 결정론적 캐스케이드 미리보기(AI 룩어헤드)용. */
function collapseNoRefill(g: Grid, matched: Coord[]): Grid {
  const rows = g.length;
  const cols = g[0]?.length ?? 0;
  const next = g.map((row) => row.slice());
  for (const { r, c } of matched) next[r][c] = -1;
  for (let c = 0; c < cols; c++) {
    const col: number[] = [];
    for (let r = rows - 1; r >= 0; r--) if (next[r][c] !== -1) col.push(next[r][c]);
    for (let r = rows - 1, i = 0; r >= 0; r--, i++) next[r][c] = i < col.length ? col[i] : -1;
  }
  return next;
}

export class BoardView {
  private readonly scene: Phaser.Scene;
  private readonly geom: BoardGeom;
  private readonly rng: Rng;
  /** 퍼즐 1회 조작이 매치를 만들면 호출(퍼즐-우선 모드: 슬롯을 돌린다). */
  private readonly onPuzzle: (info: ResolvedInfo) => void;
  /** 특수 젬 수집 시 **콤보(단계) 순서대로** 종류별 수 배열 + 콤보수 통지(첫 매치=성격 결정·콤보=배수). */
  private readonly onCollect?: (steps: number[][], combo: number) => void;
  /** 스핀 젬 회수 비행 목표(하단 GO 스핀 카운터 위치) — PlayScene 이 전달. */
  private spinTarget?: { x: number; y: number };
  /** 현재 스핀 베팅 — 회수 갯수(+N) 표시용(N = spinBet × spinRefundMult). PlayScene.setSpinBet 으로 갱신. */
  private spinBet = 1;
  /** 매치 가능 여부 — 스핀이 부족하면 false(매칭 차단). PlayScene 의 canSpin 을 연결. */
  private readonly canPlay?: () => boolean;
  /** 스핀 부족으로 매칭이 막혔을 때 통지(PlayScene 가 '스핀 부족' 안내 표시). */
  private readonly onBlocked?: () => void;
  /** ⭐매 매치의 **수집 대상 코인 제거 수** 싱크 — 보상 게이지용. setGemSink 로 연결(수동+AI자동+연쇄 공통). */
  private onGems?: (collected: number) => void;
  /** ⭐공격/약탈 발동 **조기 통지** — 연쇄 애니(popCells 젬 확대) **직전**에 호출해 발동 배너가 젬 확대와 **동시**에 뜨게 한다.
   *   (보상 가산은 onCollect 가 연쇄 종료 후 별도 처리 — 스핀젬 회수 비행 도착에 맞춤.) setStageTrigger 로 연결. */
  private onStage?: (steps: number[][], combo: number) => void;
  /** ⭐플레이어가 **유효한 스왑(퍼즐 조작)** 을 했을 때 1회성 통지 — 미션 타이머를 첫 조작 때 시작시키기 위함(요청). setOnPlayerMove 로 연결. */
  private onPlayerMove?: () => void;
  /** ⭐현재 수집 대상 퍼즐 타입(미션 진행 시 PlayScene 이 setCollectGem 으로 변경). */
  private collectType = COLLECT_GEM_TYPE;
  /** ⭐수집 코인이 날아갈 목표(보상 게이지 수집 아이콘 위치) — PlayScene 이 setGaugeTarget 으로 전달. */
  private gaugeTarget?: { x: number; y: number };
  /** ⭐스테이지 임팩트 티어(0=없음). 큰 매치가 라인삭제·십자·폭탄을 발동(board.resolveSwap 에 전달). */
  private impactTier = 0;
  private readonly sfx?: Sfx;
  private readonly sprites: Phaser.GameObjects.Image[][] = []; // [r][c]
  private readonly depth: number;
  private grid!: Grid; // 생성자에서 generateRichGrid() 로 확정 할당(definite assignment)
  private combo!: FancyNumber; // 콤보 배너 — 굵은 이텔릭 폰트(정보패널 점수와 동일 톤)
  private emitter!: Phaser.GameObjects.Particles.ParticleEmitter; // 재사용 파티클(버스트마다 생성 안 함)
  private readonly powerRTs: Phaser.GameObjects.RenderTexture[] = []; // 파워 합성 텍스처 RT 참조 유지
  private readonly specialHalos: Phaser.GameObjects.Image[] = []; // ⭐특수젬 뒤 회전 후광(T01_11) 풀
  private readonly boundUpdate = (): void => this.syncSpecialHalos(); // 매 프레임 후광 위치/회전 동기화
  private readonly boundMove = (p: Phaser.Input.Pointer): void => this.onMove(p);
  private readonly boundUp = (p: Phaser.Input.Pointer): void => this.onUp(p);

  // 입력 상태
  private selected: Coord | null = null;
  private pressCell: Coord | null = null;
  private pressX = 0;
  private pressY = 0;
  private dragConsumed = false;
  private busy = false;

  // ⭐아이들 힌트 상태(읽기 전용 — grid/경제 미변경). lastActiveAt 이후 무입력이 길어지면 최적수를 펄스.
  private lastActiveAt = 0;
  private hintTimer?: Phaser.Time.TimerEvent;
  private hintArrow?: Phaser.GameObjects.Image;
  private hintCells: Coord[] | null = null;

  constructor(
    scene: Phaser.Scene,
    geom: BoardGeom,
    rng: Rng,
    onPuzzle: (info: ResolvedInfo) => void,
    onCollect?: (steps: number[][], combo: number) => void,
    sfx?: Sfx,
    depth = 60,
    spinTarget?: { x: number; y: number },
    canPlay?: () => boolean,
    onBlocked?: () => void,
  ) {
    this.scene = scene;
    this.geom = geom;
    this.rng = rng;
    this.onPuzzle = onPuzzle;
    this.onCollect = onCollect;
    this.spinTarget = spinTarget;
    this.canPlay = canPlay;
    this.onBlocked = onBlocked;
    this.sfx = sfx;
    this.depth = depth;
    this.generateRichGrid(); // ⭐최소 가용 매치 보장 보드(발견성) — createGrid + seedSpecials 를 재시도로 감쌈
    this.ensureSpark();
    this.build();
  }

  /** 보상 게이지 수집 싱크 연결 — 매 매치의 **수집 대상 코인 제거 수**가 cb 로 전달된다(수동/AI자동 공통). */
  setGemSink(cb: (collected: number) => void): void {
    this.onGems = cb;
  }

  /** ⭐플레이어 유효 스왑(퍼즐 조작) 통지 연결 — 미션 타이머를 **첫 조작 시점**에 시작시키기 위함(요청). */
  setOnPlayerMove(cb: () => void): void {
    this.onPlayerMove = cb;
  }

  /** 공격/약탈 발동 조기 통지 연결 — 젬 확대(popCells) 직전에 호출돼 발동 배너를 젬 확대와 동시에 띄운다. */
  setStageTrigger(cb: (steps: number[][], combo: number) => void): void {
    this.onStage = cb;
  }

  /** ⭐현재 스핀 베팅(spinBet) — 스핀 회수 갯수(+N) 표시용. PlayScene 이 베팅 변경 시 갱신. */
  setSpinBet(n: number): void {
    this.spinBet = Math.max(1, Math.floor(n));
  }

  /** 수집 코인이 날아갈 목표(보상 게이지 수집 아이콘) 위치. */
  setGaugeTarget(pt: { x: number; y: number }): void {
    this.gaugeTarget = pt;
  }

  /** 현재 수집 대상 퍼즐 타입(미션 진행 시 변경). */
  setCollectGem(type: number): void {
    this.collectType = type;
  }

  /** ⭐스테이지 임팩트 티어 설정(PlayScene 이 tierForStage 로 산출 → 전달). 0=임팩트 없음. */
  setImpactTier(tier: number): void {
    this.impactTier = Math.max(0, Math.floor(tier));
  }

  /** ⭐수집한 코인이 보상 게이지로 **쭈루룩 빨려 올라가는** 연출(요청). 타일 위치에서 게이지 수집 아이콘으로 가속 비행. */
  private flyCoinToGauge(x: number, y: number, delay: number): void {
    const tgt = this.gaugeTarget;
    if (!tgt) return;
    const t = this.geom.tile;
    const key = PUZZLE_TILE_KEYS[this.collectType] ?? PUZZLE_TILE_KEYS[0];
    const img = this.scene.add.image(x, y, key).setDisplaySize(t * 0.62, t * 0.62).setDepth(this.depth + 130).setAlpha(0);
    this.scene.tweens.add({ targets: img, alpha: 1, duration: 90, delay });
    this.scene.tweens.add({
      targets: img,
      x: tgt.x,
      y: tgt.y,
      displayWidth: t * 0.28,
      displayHeight: t * 0.28,
      duration: 430,
      delay,
      ease: 'Cubic.easeIn', // 가속 = 쭈루룩 빨려가는 느낌
      onComplete: () => img.destroy(),
    });
  }

  // ── 좌표/텍스처 ──
  private cx(c: number): number {
    return this.geom.startX + c * this.geom.pitchX;
  }
  private cy(r: number): number {
    return this.geom.startY + r * this.geom.pitchY;
  }
  /** 파워 타일 합성 텍스처 키(색별×종류) — buildPowerTextures 가 미리 만든 `pw_{h|v|b}_{color}`. 없으면 색 젬 폴백. */
  private powerTexKey(v: number): string {
    if (powerKind(v) === POWER_COLOR) return POWER_OVERLAY_KEYS.color; // 컬러폭탄 = 풀 스프라이트
    const ch = powerKind(v) === POWER_LINE_H ? 'h' : powerKind(v) === POWER_LINE_V ? 'v' : 'b';
    const key = `pw_${ch}_${powerColor(v) % TYPES}`;
    return this.scene.textures.exists(key) ? key : PUZZLE_TILE_KEYS[powerColor(v) % TYPES];
  }

  private texFor(type: number): string {
    if (isPower(type)) return this.powerTexKey(type);
    if (isSpecial(type)) return SPECIAL_TILE_KEYS[specialKind(type) % SPECIAL_TILE_KEYS.length];
    return PUZZLE_TILE_KEYS[type % TYPES];
  }

  /** 타일 텍스처 칠 — 파워는 합성 텍스처(젬+오버레이). 틴트는 정규화(제거). */
  private paintTile(img: Phaser.GameObjects.Image, v: number): void {
    img.setTexture(this.texFor(v));
    img.clearTint();
  }

  /**
   * ⭐파워 타일 합성 텍스처(임시) — 색 젬 + 색중립 오버레이(StripeH/V·Bomb)를 RenderTexture 로 합쳐
   *   `pw_{h|v|b}_{color}` 로 캐시(색별×3종 ≤15장). 실제 파워 아트가 색별 단일 스프라이트면 이 단계 불필요.
   */
  private buildPowerTextures(): void {
    const kinds: { ch: string; ov: string }[] = [
      { ch: 'h', ov: POWER_OVERLAY_KEYS.stripeH },
      { ch: 'v', ov: POWER_OVERLAY_KEYS.stripeV },
      { ch: 'b', ov: POWER_OVERLAY_KEYS.bomb },
    ];
    for (let color = 0; color < TYPES; color++) {
      const gemKey = PUZZLE_TILE_KEYS[color];
      if (!this.scene.textures.exists(gemKey)) continue;
      const src = this.scene.textures.get(gemKey).getSourceImage() as { width: number; height: number };
      const w = src.width || 169;
      const h = src.height || 171;
      for (const k of kinds) {
        const key = `pw_${k.ch}_${color}`;
        if (this.scene.textures.exists(key) || !this.scene.textures.exists(k.ov)) continue;
        const rt = this.scene.make.renderTexture({ width: w, height: h }, false);
        rt.draw(gemKey, 0, 0);
        rt.draw(k.ov, 0, 0);
        rt.saveTexture(key);
        this.powerRTs.push(rt); // saveTexture 후 참조 유지(텍스처 소멸 방지)
      }
    }
  }

  /**
   * ⭐무브 풍부성 보장 보드 생성(요청: 매칭이 잘 보이게) — 최소 MIN_MOVES_START 개 이상의 **가용 매치**가
   *   나올 때까지 최대 BOARD_GEN_TRIES 회 재생성한다. 특수젬이 매치 수에 영향을 주므로 **시드 후** 카운트.
   *   다 못 채우면 시도 중 가장 매치가 많았던 보드로 폴백(부팅 보장). 시작/셔플 공통.
   */
  private generateRichGrid(): void {
    let best: Grid | null = null;
    let bestMoves = -1;
    for (let i = 0; i < BOARD_GEN_TRIES; i++) {
      this.grid = createGrid(this.geom.rows, this.geom.cols, TYPES, this.rng);
      this.seedSpecials(); // 특수젬 배치까지 끝낸 뒤 카운트(특수가 가용 매치 수에 영향)
      const moves = countAvailableMoves(this.grid, MIN_MOVES_START);
      if (moves >= MIN_MOVES_START) return; // 충분 → 확정
      if (moves > bestMoves) {
        bestMoves = moves;
        best = this.grid.map((row) => row.slice()); // 최선 후보 보존
      }
    }
    if (best) this.grid = best; // 폴백: 가장 매치 많던 보드
  }

  /**
   * 시작/셔플 시 특수 젬을 보드에 심어 **즉시 등장**시킨다(종류별 1개씩: 공격·약탈·스핀).
   * 특수 젬은 색 매칭을 안 하므로 매치 가능성을 막지 않는다(인접 매치로 수집). 기능 연결은 추후.
   */
  private seedSpecials(): void {
    const cells: Coord[] = [];
    for (let r = 0; r < this.geom.rows; r++) for (let c = 0; c < this.geom.cols; c++) cells.push({ r, c });
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    const target = Math.min(SPECIAL_SEED, SPECIAL_SPAWN.cap);
    let placed = 0;
    for (const { r, c } of cells) {
      if (placed >= target) break;
      if (this.wouldFormSpecialRun(r, c)) continue; // 시작부터 3매치(특수 run)로 보이지 않게 회피
      this.grid[r][c] = SPECIAL_BASE + (placed % SPECIAL_KINDS); // 종류 순환(0 공격·1 약탈·2 스핀)
      placed++;
    }
  }

  /** (r,c)를 특수 젬으로 두면 가로/세로 3+ 특수 run(즉시 매치)이 생기는가 — 현재 grid 의 인접 특수 카운트. */
  private wouldFormSpecialRun(r: number, c: number): boolean {
    const sp = (rr: number, cc: number): boolean =>
      rr >= 0 && rr < this.geom.rows && cc >= 0 && cc < this.geom.cols && isSpecial(this.grid[rr][cc]);
    let h = 1;
    for (let cc = c - 1; sp(r, cc); cc--) h++;
    for (let cc = c + 1; sp(r, cc); cc++) h++;
    let v = 1;
    for (let rr = r - 1; sp(rr, c); rr--) v++;
    for (let rr = r + 1; sp(rr, c); rr++) v++;
    return h >= 3 || v >= 3;
  }

  /**
   * 한 연쇄 단계의 특수 젬 전용 연출 — 매치된 특수 젬마다 **전기 이펙트(T01_11)** 를 터뜨려 특수효과를 낸다.
   * 추가로 스파크 파티클을 얹고, 스핀젬은 GO 카운터로 회수 비행한다. (젬 아이콘 자체에 이미 후광이 베이크됨.)
   */
  /**
   * ⭐특수젬 뒤 배경 이펙트(T01_11 전기 링) 동기화(매 프레임 UPDATE) — 특수젬마다 분리된 링을 그 젬 위치에 두고
   *   **회전 + 크기 맥동 + 밝기 글로우 플리커**로 더 강하게 연출한다(요청 2026-06-29: 뒷부분 이펙트를 효과적으로).
   *   젬보다 크게(1.5×, 맥동 ±9%)·뒤(depth-1)·ADD 발광. 젬이 팝되며 알파가 줄면 링도 함께 페이드. 셀마다 위상차로
   *   다 같이 깜빡이지 않게 한다. sprite 의 현재 x/y 를 복사 → 스왑/낙하 트윈도 자연히 따라간다. 남는 링은 숨김.
   */
  private syncSpecialHalos(): void {
    if (!this.specialHalos.length) return;
    const t = this.geom.tile;
    const now = this.scene.time.now;
    const spin = now * 0.085; // ≈85°/s 회전(에너지 스월)
    let h = 0;
    for (let r = 0; r < this.geom.rows && h < this.specialHalos.length; r++) {
      for (let c = 0; c < this.geom.cols && h < this.specialHalos.length; c++) {
        if (!isSpecial(this.grid[r]?.[c] ?? -1)) continue;
        const gem = this.sprites[r]?.[c];
        if (!gem) continue;
        const halo = this.specialHalos[h];
        const phase = h * 1.6; // 링마다 위상차(동시 깜빡임 방지)
        const sc = 1 + 0.05 * Math.sin(now * 0.0065 + phase); // 크기 맥동(±5% 은은한 숨쉬기)
        const sz = t * 1.32 * sc; // 젬을 감싸는 링(약간 축소: 1.5→1.32, 스필↓)
        halo.setPosition(gem.x, gem.y);
        halo.setDisplaySize(sz, sz);
        halo.setAngle(spin + h * 53); // 링마다 시작각도 차
        // ⭐밝기 맥동 약하게(0.5~0.74) — NORMAL 합성이라 흰색으로 날아가지 않고 하늘색 원색이 유지된다(요청).
        halo.setAlpha(gem.alpha * (0.62 + 0.12 * Math.sin(now * 0.0065 + phase + 0.9)));
        halo.setVisible(gem.visible && gem.alpha > 0.05);
        h++;
      }
    }
    for (; h < this.specialHalos.length; h++) this.specialHalos[h].setVisible(false);
  }

  private animateSpecials(st: ResolveStep): void {
    let n = 0;
    let spinCount = 0, spinSumX = 0, spinSumY = 0; // 스핀젬 수 + 중심(회수 갯수 표시 위치)
    for (const { r, c } of st.matched) {
      const v = this.grid[r][c];
      if (!isSpecial(v)) continue;
      n++;
      const x = this.cx(c);
      const y = this.cy(r);
      this.burst(x, y, true); // 스파크 파티클(지지직)
      this.playSpecialFx(x, y); // T01_11 전기 이펙트 = 매치 특수효과
      if (specialKind(v) === 2) { this.flySpinGem(x, y); spinCount++; spinSumX += x; spinSumY += y; } // 스핀젬 아이콘 회수 비행
      else this.spawnSpecialPopFx(x, y, this.texFor(v)); // ⭐공격/약탈 = 확대-유지 팝을 **별도 클론**으로 재생(퍼즐 낙하를 막지 않음)
    }
    // ⭐회수 갯수(+N) 표시·드래그 — 매칭 스핀젬 중심에서 "+회수스핀"을 카운터로 끌어당겨 회수(요청). N = spinBet × spinRefundMult(매칭수).
    if (spinCount > 0) {
      const amount = this.spinBet * spinRefundMult(spinCount);
      this.flySpinCount(spinSumX / spinCount, spinSumY / spinCount, amount);
    }
    // ⭐특수 매치는 게임 핵심 — 수에 비례한 강한 화면 흔들기로 임팩트를 준다(요청).
    if (n > 0) this.shake(Math.min(0.005 + n * 0.0013, 0.013), 190);
  }

  /**
   * 스핀젬 회수 — **① 살짝 떠올랐다가(커지며 위로 둥실) → ② GO 하단 스핀 카운터로 끌려가듯 빨려 들어간다**(매치 갯수만큼).
   * 2단계는 Back.easeIn 으로 잠깐 머물다 확 빨려가는 "끌려오는" 느낌을 준다.
   */
  private flySpinGem(x: number, y: number): void {
    const t = this.geom.tile;
    const img = this.scene.add.image(x, y, SPECIAL_TILE_KEYS[2]).setDisplaySize(t, t).setDepth(this.depth + 120);
    const tx = this.spinTarget?.x ?? x;
    const ty = this.spinTarget?.y ?? y + 500;
    const apexY = y - t * 0.55;
    // ① 부양 — 커지며 위로 살짝 떠오른다.
    this.scene.tweens.add({
      targets: img,
      y: apexY,
      displayWidth: t * 1.45,
      displayHeight: t * 1.45,
      duration: 140,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.burst(x, apexY, true); // 공중에서 펑 터뜨린 뒤 끌려간다(요청)
        // ② 흡입 — 카운터로 작아지며 끌려간다(살짝 머물다 가속).
        this.scene.tweens.add({
          targets: img,
          x: tx,
          y: ty,
          displayWidth: t * 0.3,
          displayHeight: t * 0.3,
          duration: 250,
          ease: 'Back.easeIn',
          onComplete: () => img.destroy(),
        });
      },
    });
  }

  /**
   * ⭐스핀 회수 **갯수(+N)** 표시·드래그 — 매칭 시점 스핀젬 중심에서 "+회수스핀" 숫자를 띄워
   *   하단 스핀 카운터로 **끌어당겨** 빨려들어간다(요청 2026-06-30). N = spinBet × spinRefundMult(매칭수).
   */
  private flySpinCount(x: number, y: number, amount: number): void {
    if (amount <= 0) return;
    const t = this.geom.tile;
    const tx = this.spinTarget?.x ?? x;
    const ty = this.spinTarget?.y ?? y + 500;
    const label = this.scene.add
      .text(x, y, `+${amount}`, {
        fontFamily: '"Russo One", "Jua", sans-serif',
        fontSize: `${Math.round(t * 0.62)}px`,
        color: '#9bff7a',
        stroke: '#10402a',
        strokeThickness: Math.max(4, Math.round(t * 0.07)),
      })
      .setOrigin(0.5)
      .setDepth(this.depth + 140);
    // ① 매칭 지점에서 살짝 떠오르며 강조.
    this.scene.tweens.add({
      targets: label,
      y: y - t * 0.7,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 170,
      ease: 'Back.easeOut',
      onComplete: () => {
        // ② 스핀 카운터로 끌려가며 작아진다(= 드래그 회수).
        this.scene.tweens.add({
          targets: label,
          x: tx,
          y: ty,
          scaleX: 0.5,
          scaleY: 0.5,
          alpha: 0.85,
          duration: 300,
          ease: 'Cubic.easeIn',
          onComplete: () => label.destroy(),
        });
      },
    });
  }

  /**
   * 특수 젬 매치 특수효과 — 디자이너 이펙트 이미지(T01_11)가 매치 지점에서 **확 커지며 회전·발광**하다
   * 사라진다. ADD 블렌드로 전기 섬광처럼 번쩍인다(공격/약탈/스핀 공통 — 특수 매치 임팩트).
   */
  private playSpecialFx(x: number, y: number): void {
    const t = this.geom.tile;
    const fx = this.scene.add
      .image(x, y, SPECIAL_FX_KEY)
      .setDisplaySize(t * 0.85, t * 0.85)
      .setDepth(this.depth + 115)
      .setAlpha(0.95)
      .setBlendMode(Phaser.BlendModes.ADD); // 전기 발광 합성
    this.scene.tweens.add({
      targets: fx,
      displayWidth: t * 2.3,
      displayHeight: t * 2.3,
      angle: 160,
      alpha: 0,
      duration: 270,
      ease: 'Cubic.easeOut',
      onComplete: () => fx.destroy(),
    });
  }

  private ensureSpark(): void {
    if (this.scene.textures.exists(SPARK_TEX)) return;
    const g = this.scene.make.graphics({}, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 7);
    g.generateTexture(SPARK_TEX, 16, 16);
    g.destroy();
  }

  private build(): void {
    this.buildPowerTextures(); // ⭐파워 합성 텍스처(젬+오버레이) 미리 생성 — texFor 가 사용
    // 보드 프레임 마스크 — 셔플/리필 시 타일이 보드(그리드) 밖으로 안 보이게(프레임 안에서만 이동).
    const g = this.geom;
    const padX = g.pitchX * 0.22;
    const padY = g.pitchY * 0.22;
    const maskG = this.scene.make.graphics({}, false);
    maskG.fillStyle(0xffffff);
    maskG.fillRect(
      g.startX - g.pitchX / 2 - padX,
      g.startY - g.pitchY / 2 - padY,
      g.cols * g.pitchX + padX * 2,
      g.rows * g.pitchY + padY * 2,
    );
    const mask = maskG.createGeometryMask(); // maskG 는 마스크가 매 프레임 참조 → destroy 안 함

    for (let r = 0; r < this.geom.rows; r++) {
      this.sprites[r] = [];
      for (let c = 0; c < this.geom.cols; c++) {
        const img = this.scene.add.image(this.cx(c), this.cy(r), this.texFor(this.grid[r][c]));
        img.setDisplaySize(this.geom.tile, this.geom.tile).setDepth(this.depth);
        img.setMask(mask); // 프레임 클립
        img.setInteractive({ useHandCursor: true });
        img.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown({ r, c }, p));
        this.sprites[r][c] = img;
      }
    }
    // ⭐특수젬 뒤 배경 이펙트 링(T01_11) 풀 — 보드 최대 특수 수만큼. 젬 뒤(depth-1)·ADD·마스크. 매 프레임 회전+맥동 동기.
    //   디자이너가 **뒷부분 이펙트(T01_11)와 특수젬을 분리**(2026-06-29) → 분리된 진짜 링을 직접 써서 더 강하게 연출.
    for (let i = 0; i < SPECIAL_SPAWN.cap; i++) {
      const halo = this.scene.add
        .image(0, 0, SPECIAL_FX_KEY)
        .setDepth(this.depth - 1)
        .setBlendMode(Phaser.BlendModes.NORMAL) // ⭐NORMAL — 밝은 보드 위 ADD 가 흰색으로 날아가 하늘색 원색을 잃던 문제 해결(원색 보존, 요청)
        .setAlpha(0)
        .setVisible(false);
      halo.setMask(mask); // 보드 프레임 클립
      this.specialHalos.push(halo);
    }
    this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.boundUpdate);

    // 씬 레벨 드래그/탭 처리(스프라이트 단위 아님). 씬 종료 시 정리(재시작 대비 방어).
    this.scene.input.on('pointermove', this.boundMove);
    this.scene.input.on('pointerup', this.boundUp);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.input.off('pointermove', this.boundMove);
      this.scene.input.off('pointerup', this.boundUp);
      this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.boundUpdate);
      this.hintTimer?.remove(false); // 아이들 힌트 폴링 정리
      this.hintTimer = undefined;
      this.clearHint();
    });

    // 재사용 파티클 이미터 1개(버스트마다 새로 만들지 않음 = GC/GPU churn 감소).
    this.emitter = this.scene.add
      .particles(0, 0, SPARK_TEX, {
        blendMode: 'ADD',
        lifespan: { min: 360, max: 640 },
        speed: { min: 40, max: 130 },
        angle: { min: 200, max: 340 },
        gravityY: -90,
        scale: { start: 0.9, end: 0.12 },
        alpha: { start: 0.95, end: 0 },
        rotate: { min: 0, max: 360 },
        emitting: false,
      })
      .setDepth(this.depth + 8);

    // 콤보 배너 — 퍼즐 패널 정중앙에 ~2배 크게(요청). 굵은 이텔릭 폰트(정보패널 점수와 동일 톤).
    this.combo = new FancyNumber(
      this.scene,
      this.cx((this.geom.cols - 1) / 2),
      this.cy((this.geom.rows - 1) / 2),
      120,
      this.depth + 40,
    );
    this.combo.setAlpha(0);

    // ⭐아이들 힌트 폴링 시작(발견성) — 무입력이 길어지면 tickHint 가 최적수를 펄스로 표시.
    this.lastActiveAt = this.scene.time.now;
    this.hintTimer = this.scene.time.addEvent({ delay: HINT_POLL_MS, loop: true, callback: () => this.tickHint() });
  }

  get isBusy(): boolean {
    return this.busy;
  }

  /** 매치가 성립하는 첫 인접 스왑을 찾는다(없으면 null). */
  private findValidMove(): { a: Coord; b: Coord } | null {
    const test = (a: Coord, b: Coord): boolean => findRuns(this.swapGrid(this.grid, a, b)).matched.length > 0;
    for (let r = 0; r < this.geom.rows; r++) {
      for (let c = 0; c < this.geom.cols; c++) {
        if (c + 1 < this.geom.cols && test({ r, c }, { r, c: c + 1 })) return { a: { r, c }, b: { r, c: c + 1 } };
        if (r + 1 < this.geom.rows && test({ r, c }, { r: r + 1, c })) return { a: { r, c }, b: { r: r + 1, c } };
      }
    }
    return null;
  }

  /**
   * 결정론적 캐스케이드 미리보기 — 스왑 후 매치 제거 + **중력만(리필 없이)** 으로 **2·3차 매치까지** 따라가
   * 보이는 퍼즐 구조를 파악한다(요청: 지능적 퍼즐매칭). 연쇄 전체의 종류별 특수 수집·일반 제거·연쇄 깊이를 합산.
   */
  private previewCascades(a: Coord, b: Coord): { spin: number; attack: number; raid: number; cleared: number; depth: number } {
    let g = this.swapGrid(this.grid, a, b);
    let spin = 0;
    let attack = 0;
    let raid = 0;
    let cleared = 0;
    let depth = 0;
    for (let guard = 0; guard < 16; guard++) {
      const { matched } = findRuns(g);
      if (matched.length === 0) break;
      depth++;
      for (const m of matched) {
        const v = g[m.r][m.c];
        if (!isSpecial(v)) {
          cleared++;
          continue;
        }
        const k = specialKind(v);
        if (k === SPECIAL_SPIN) spin++;
        else if (k === SPECIAL_ATTACK) attack++;
        else if (k === SPECIAL_RAID) raid++;
      }
      g = collapseNoRefill(g, matched);
    }
    return { spin, attack, raid, cleared, depth };
  }

  /**
   * AI 최적수 — 모든 인접 스왑을 **2·3차 연쇄까지 미리 보고**(previewCascades) 가장 점수 높은 매치를 고른다(요청).
   * **우선순위: ① 스핀젬 최우선 → ② 같은 종류 특수(3개 동일 문양) → ③ 일반 + 연쇄 보너스.** 동점이면 첫 발견.
   */
  private findBestMove(): { a: Coord; b: Coord } | null {
    let best: { a: Coord; b: Coord } | null = null;
    let bestScore = 0;
    const evalPair = (a: Coord, b: Coord): void => {
      const pv = this.previewCascades(a, b);
      if (pv.depth === 0) return; // 매치 없음
      // ⭐3개 동일 문양 우선: 비스핀 특수는 **같은 종류 묶음(큰 쪽)** 만 가중. 연쇄(2·3차)는 수집 합산 + 깊이 보너스로 반영.
      const sameTypeSpecial = Math.max(pv.attack, pv.raid);
      const score =
        pv.spin * AI_SPIN_PRIORITY + sameTypeSpecial * AI_SPECIAL_PRIORITY + pv.cleared + (pv.depth - 1) * AI_CASCADE_BONUS;
      if (score > bestScore) {
        bestScore = score;
        best = { a, b };
      }
    };
    for (let r = 0; r < this.geom.rows; r++) {
      for (let c = 0; c < this.geom.cols; c++) {
        if (c + 1 < this.geom.cols) evalPair({ r, c }, { r, c: c + 1 });
        if (r + 1 < this.geom.rows) evalPair({ r, c }, { r: r + 1, c });
      }
    }
    return best;
  }

  /**
   * AI 자동 매치(역방향 모드: 슬롯 먼저 돌린 뒤 호출). 유효한 스왑을 찾아 자동 실행하고
   * 퍼즐 점수를 반환한다. 이동이 없으면 셔플 후 재시도. onPuzzle 은 호출하지 않는다(PlayScene 가 합산 주도).
   */
  async autoMatch(): Promise<number> {
    this.noteActivity(); // 오토 라운드 시작 = 활동(힌트 즉시 dismiss)
    if (this.busy) return 0;
    const mv = this.findBestMove(); // AI: 가장 효율적인 매치
    if (!mv) return 0; // 이동 없음 → 셔플은 라운드 종료 후(reshuffleIfNeeded)에서 처리
    // 선택 강조를 또렷이 보여준 뒤(절차적) 스왑 — 수동 플레이와 동일 임팩트·약간 느린 진행.
    await this.flashPick(mv.a, mv.b);
    return this.trySwap(mv.a, mv.b, false);
  }

  /** 라운드(결과 표시)가 모두 끝난 뒤 호출 — 이동 불가면 그때 셔플(중간에 안 함). */
  async reshuffleIfNeeded(): Promise<void> {
    if (this.busy) return;
    // ⭐**완전 교착(0개)** 일 때만 셔플 — 매치가 하나라도 있으면(특수/일반 무관) 셔플하지 않는다(요청: 매칭 가능 퍼즐을 셔플로 없애지 말 것).
    //   countAvailableMoves 는 findRuns(특수끼리 매치 포함) 기반이라 특수 매치도 정확히 계수 → 특수 매치 가능 시 셔플 안 함.
    if (countAvailableMoves(this.grid, MIN_MOVES_PLAY) >= MIN_MOVES_PLAY) return;
    this.busy = true;
    await this.reshuffle();
    this.busy = false;
  }

  /** AI가 고른 두 칸을 또렷이 강조(자동 매치 가시화 — 수동 '선택'과 동일 임팩트). 끝날 때까지 await 가능. */
  private flashPick(a: Coord, b: Coord): Promise<void> {
    const base = this.geom.tile;
    this.sfx?.play('select', 0.4);
    haptics.tap();
    const tw = [a, b].map((cd) => {
      const img = this.sprites[cd.r][cd.c];
      img.setDepth(this.depth + 4); // 강조 중 앞으로
      return this.tween({ targets: img, displayWidth: base * 1.22, displayHeight: base * 1.22, duration: 100, ease: 'Back.easeOut', yoyo: true });
    });
    return Promise.all(tw).then(() => {
      for (const cd of [a, b]) this.sprites[cd.r][cd.c].setDepth(this.depth);
    });
  }

  /** DEV 전용 — 유효 스왑 1회 실행(헤드리스 검증용, 퍼즐-우선 알림 포함). */
  devTriggerMove(): boolean {
    const mv = this.findValidMove();
    if (!mv) return false;
    void this.trySwap(mv.a, mv.b, true);
    return true;
  }

  // ── 입력 ──
  private onDown(coord: Coord, p: Phaser.Input.Pointer): void {
    this.noteActivity(); // 유휴 리셋 + 힌트 dismiss(어떤 입력이든)
    if (this.busy) return;
    // ⭐스핀이 부족하면 젬 매칭 불가(요청) — 선택/스왑 차단 + 거절 피드백.
    //   (한 판 진행 중이어도 매칭은 허용 — 결과 연출만 느리게 순차 처리. PlayScene scoreQueue 가 버퍼링.)
    if (this.canPlay && !this.canPlay()) {
      this.blockedFeedback(coord);
      return;
    }
    this.pressCell = coord;
    this.pressX = p.x;
    this.pressY = p.y;
    this.dragConsumed = false;
  }

  /** 스핀 부족으로 매칭이 막힘 — 누른 젬을 붉게 흔들고 경고음/햅틱 + PlayScene 안내 통지. */
  private blockedFeedback(coord: Coord): void {
    this.clearSelection();
    haptics.warn();
    this.sfx?.play('error', 0.6);
    void this.rejectShake([this.sprites[coord.r][coord.c]]);
    this.onBlocked?.();
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.pressCell || this.dragConsumed || this.busy) return;
    const dx = p.x - this.pressX;
    const dy = p.y - this.pressY;
    const thr = Math.min(this.geom.pitchX, this.geom.pitchY) * 0.3;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < thr) return;
    this.dragConsumed = true;
    this.noteActivity(); // 드래그 확정 = 활동(힌트 dismiss)
    const a = this.pressCell;
    this.pressCell = null;
    this.clearSelection();
    const b =
      Math.abs(dx) >= Math.abs(dy)
        ? { r: a.r, c: a.c + (dx > 0 ? 1 : -1) }
        : { r: a.r + (dy > 0 ? 1 : -1), c: a.c };
    if (this.inBounds(b)) void this.trySwap(a, b);
  }

  private onUp(_p: Phaser.Input.Pointer): void {
    if (this.dragConsumed) {
      this.pressCell = null;
      return;
    }
    const tapped = this.pressCell;
    this.pressCell = null;
    if (tapped) this.handleTap(tapped);
  }

  private handleTap(coord: Coord): void {
    if (this.busy) return;
    if (!this.selected) {
      this.select(coord);
      return;
    }
    const prev = this.selected;
    if (prev.r === coord.r && prev.c === coord.c) {
      this.clearSelection();
      return;
    }
    if (isAdjacent(prev, coord)) {
      this.clearSelection();
      void this.trySwap(prev, coord);
    } else {
      this.clearSelection();
      this.select(coord);
    }
  }

  private inBounds(c: Coord): boolean {
    return c.r >= 0 && c.r < this.geom.rows && c.c >= 0 && c.c < this.geom.cols;
  }

  // ── 선택 연출(들어올리기 + 숨쉬기) ──
  private select(coord: Coord): void {
    this.selected = coord;
    haptics.tap();
    this.sfx?.play('select', 0.45);
    const img = this.sprites[coord.r][coord.c];
    const base = this.geom.tile;
    // 즉각적인 가벼운 펄스(딱딱함 제거 — 2단 스퀴즈 없이 바로 반응).
    this.scene.tweens.add({
      targets: img,
      displayWidth: base * 1.16,
      displayHeight: base * 1.16,
      duration: 130,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  private clearSelection(): void {
    if (!this.selected) return;
    const img = this.sprites[this.selected.r][this.selected.c];
    this.scene.tweens.killTweensOf(img);
    img.setDisplaySize(this.geom.tile, this.geom.tile);
    this.selected = null;
  }

  // ── 아이들 힌트(발견성, 읽기 전용) ─────────────────────────────
  /** 입력/스왑/오토가 일어날 때마다 호출 — 유휴 타이머 리셋 + 표시 중 힌트 제거(플레이어가 움직이면 즉시 사라짐). */
  private noteActivity(): void {
    this.lastActiveAt = this.scene.time.now;
    if (this.hintCells) this.clearHint();
  }

  /** 폴링(HINT_POLL_MS) — 못 두는 동안엔 유휴로 치지 않고, 무입력이 HINT_IDLE_MS 넘으면 최적수를 펄스로 표시. */
  private tickHint(): void {
    if (this.busy || (this.canPlay && !this.canPlay())) {
      this.lastActiveAt = this.scene.time.now; // 진행 중/스핀부족 = 유휴 시계 멈춤
      return;
    }
    if (this.hintCells) return; // 이미 표시 중
    if (this.scene.time.now - this.lastActiveAt < HINT_IDLE_MS) return;
    const mv = this.findBestMove() ?? this.findValidMove(); // 읽기 전용(미리보기) — grid/경제 미변경
    if (mv) this.showHint(mv.a, mv.b);
  }

  /** 최적수 두 칸을 부드럽게 펄스 + a 칸 위에 까딱이는 발광 마커(스파크 텍스처 재사용 — 신규 에셋 없이 "여기"를 안내). */
  private showHint(a: Coord, b: Coord): void {
    this.hintCells = [a, b];
    const base = this.geom.tile;
    for (const cd of [a, b]) {
      const img = this.sprites[cd.r]?.[cd.c];
      if (!img) continue;
      this.scene.tweens.add({
        targets: img,
        displayWidth: base * 1.14,
        displayHeight: base * 1.14,
        duration: 460,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    }
    const ax = this.cx(a.c);
    const ay = this.cy(a.r) - base * 0.62;
    const arrow = this.scene.add
      .image(ax, ay, SPARK_TEX)
      .setDisplaySize(base * 0.5, base * 0.5)
      .setTint(0xffe27a)
      .setAlpha(0.95)
      .setDepth(this.depth + 45)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: arrow, y: ay - base * 0.18, duration: 520, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
    this.hintArrow = arrow;
  }

  /** 힌트 제거 — 펄스 트윈 정리 + 타일 크기 원복(select/swap 트윈과 충돌 방지) + 마커 파괴. */
  private clearHint(): void {
    if (this.hintCells) {
      const base = this.geom.tile;
      for (const cd of this.hintCells) {
        const img = this.sprites[cd.r]?.[cd.c];
        if (!img) continue;
        this.scene.tweens.killTweensOf(img);
        img.setDisplaySize(base, base);
      }
      this.hintCells = null;
    }
    this.hintArrow?.destroy();
    this.hintArrow = undefined;
  }

  // ── 트윈 유틸 ──
  private tween(cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => this.scene.tweens.add({ ...cfg, onComplete: () => resolve() }));
  }

  /** 짧은 지연(ms) — 씬 타이머 기반 Promise. 연쇄 단계 사이 미세 텀 등(씬 종료 시 타이머 자동 정리). */
  private waitMs(ms: number): Promise<void> {
    return new Promise((resolve) => this.scene.time.delayedCall(ms, () => resolve()));
  }

  // ── 스왑 + 연쇄 ──
  /**
   * 스왑 시도. 매치가 없으면 되돌리고 0 반환. 매치면 연쇄를 재생하고 **퍼즐 점수**(제거 타일 수 ×
   * 콤보 배수)를 반환한다. notify=true(퍼즐-우선 입력)면 즉시 onPuzzle 로 알려 슬롯을 돌린다.
   * notify=false(역방향 AI 자동매치)면 알리지 않고 점수만 반환(PlayScene 가 슬롯 결과와 합산).
   */
  private async trySwap(a: Coord, b: Coord, notify = true): Promise<number> {
    this.noteActivity(); // 수동/탭/오토 스왑 공통 진입점 — 유휴 리셋 + 힌트 제거
    this.busy = true;
    // ⚠️임시: Phase 2 지속형 파워타일(오버레이 생성)을 끔 → 4매치가 **즉시 가로/세로 한 줄 삭제**(Phase 1)로 복원.
    //   재활성화하려면 `false` 를 `this.impactTier >= 3` 로 되돌리면 됨.
    const persistent = false;
    const res = resolveSwap(this.grid, a, b, TYPES, this.rng, SPECIAL_SPAWN, this.impactTier, persistent);
    const sa = this.sprites[a.r][a.c];
    const sb = this.sprites[b.r][b.c];

    // ⭐스왑 글라이드 — 두 타일이 **빠르게** 자리를 교차(시각적 스왑). 실제 스왑은 아래 syncTextures(텍스처 교체)로
    //   처리되므로 이 글라이드는 순수 연출. 기존 2단(팝 145 + 안착 75 = 220ms)이 "스왑→매치 클리어" 사이 간극으로
    //   느껴져, **단일 짧은 슬라이드(80ms)** 로 단축한다(요청 2026-06-29: 매칭이 바로 반응하도록).
    const SWAP_MS = 80;
    sa.setDepth(this.depth + 6);
    sb.setDepth(this.depth + 6); // 스왑 중 앞으로
    haptics.tap();
    await Promise.all([
      this.tween({ targets: sa, x: this.cx(b.c), y: this.cy(b.r), duration: SWAP_MS, ease: 'Quad.easeOut' }),
      this.tween({ targets: sb, x: this.cx(a.c), y: this.cy(a.r), duration: SWAP_MS, ease: 'Quad.easeOut' }),
    ]);
    sa.setDepth(this.depth);
    sb.setDepth(this.depth);
    sa.setPosition(this.cx(a.c), this.cy(a.r));
    sb.setPosition(this.cx(b.c), this.cy(b.r));

    if (!res.valid) {
      haptics.warn();
      this.sfx?.play('error', 0.6);
      await this.rejectShake([sa, sb]);
      this.busy = false;
      return 0;
    }

    haptics.tap();
    this.sfx?.play('swap', 0.55);
    this.onPlayerMove?.(); // ⭐유효 스왑 = 퍼즐 조작 → 미션 타이머 시작 신호(요청: 첫 조작 전엔 타임어택 정지)
    this.grid = this.swapGrid(this.grid, a, b);
    this.syncTextures(this.grid);

    // 퍼즐 멀티 = (각 매치 배수(L−2)의 곱) + 전체 제거수×0.1. (economy.ts SSOT, 결정론)
    //   ⭐**콤보(연쇄 단계 수)를 추가로 곱한다**(요청) → 코인 획득이 콤보 배수만큼 커진다. (스핀/공격/약탈도 동일 — PlayScene)
    const combo = Math.max(1, res.steps.length);
    const allRuns: number[] = [];
    for (const st of res.steps) for (const len of st.runs) allRuns.push(len);
    const puzzleMult = puzzleMultiplierFromRuns(allRuns, res.cleared) * combo;
    if (notify) this.onPuzzle({ puzzleMult, cleared: res.cleared });
    const coinsCleared = res.clearedByType[this.collectType] ?? 0; // ⭐**현재 수집 대상 코인만** 게이지에 적립(미션별 타입)
    if (coinsCleared > 0) this.onGems?.(coinsCleared);

    // 특수 젬 수집 데이터(종류별 수) — 콤보 깊이(res.steps.length)와 함께 통지에 쓴다.
    const stepCollected = res.steps.map((s) => s.collected).filter((c) => c.some((n) => n > 0));
    // ⭐공격/약탈 발동 배너는 **젬이 커지는 순간(아래 popCells 의 stageSpecial 확대)과 동시**에 떠야 한다(요청 2026-06-28)
    //   → 연쇄 애니 루프 **직전**에 onStage 로 조기 통지(배너 등장 + pendingStage 예약). 망치 등장까지 떠 있는다.
    if (stepCollected.length > 0) this.onStage?.(stepCollected, res.steps.length);

    // 연쇄 애니메이션.
    let step = 0;
    for (const st of res.steps) {
      step++;
      this.stepJuice(st, step);
      this.animateSpecials(st); // 특수 젬 전용 연출(스핀=GO 회수 비행, 공격/약탈=스파크) — this.grid 갱신 전 호출
      this.animateImpacts(st); // ⭐파워 매치(라인/십자/폭탄) 연출 — 추가 제거 칸은 popCells 가 함께 팝
      // ⭐매칭 즉시 낙하(요청 2026-06-29) — **모든 매치(일반·라인·공격·약탈 특수 포함)**가 팝을 기다리지 않고
      //   곧장 떨어진다. 효과(버스트·팝업·코인)만 즉시 내고 매치 타일은 settle 이 재활용 → 텀 0. 특수젬의
      //   확대-유지 연출은 animateSpecials 의 **별도 클론**(spawnSpecialPopFx)으로 동시 재생돼 퍼즐 흐름을 막지 않는다.
      this.popEffects(st, step);
      this.grid = st.gridAfter as Grid;
      await this.settle(st, step);
      // ⭐연쇄 단계 사이 아주 미세한 텀(요청) — 착지 직후 한 박자 쉬어 "매치됐다"는 인지를 준 뒤 다음 매치로.
      //   마지막 단계 뒤엔 불필요(라운드 종료). landSettle 바운스는 이 텀 동안 살짝 보이고 다음 단계가 이어받는다.
      if (step < res.steps.length) await this.waitMs(CASCADE_STEP_GAP_MS);
    }

    // 스핀 보상 통지(연쇄 종료 후 — 스핀젬 회수 비행 도착에 맞춤). 발동 배너는 위 onStage 가 이미 처리.
    if (stepCollected.length > 0) this.onCollect?.(stepCollected, res.steps.length);

    // 셔플은 여기서 하지 않는다 — 라운드(결과 표시)가 끝난 뒤 reshuffleIfNeeded 에서.
    this.busy = false;
    return puzzleMult;
  }

  private swapGrid(g: Grid, a: Coord, b: Coord): Grid {
    const n = g.map((row) => row.slice());
    const t = n[a.r][a.c];
    n[a.r][a.c] = n[b.r][b.c];
    n[b.r][b.c] = t;
    return n;
  }

  /** 모든 타일 텍스처/위치/스케일 정상화. */
  private syncTextures(g: Grid): void {
    for (let r = 0; r < this.geom.rows; r++) {
      for (let c = 0; c < this.geom.cols; c++) {
        const img = this.sprites[r][c];
        this.paintTile(img, g[r][c]);
        img.setPosition(this.cx(c), this.cy(r));
        img.setDisplaySize(this.geom.tile, this.geom.tile);
        img.setAlpha(1).setAngle(0);
      }
    }
  }

  // ── 연출 ──
  private stepJuice(st: ResolveStep, step: number): void {
    // ⭐임팩트 강화(요청 2026-06-28): 큰 매치·연쇄에 **화면 흔들기**를 (다시) 넣되 크기에 비례시킨다.
    //   평이함을 깨되 산만하지 않게 — 작은 3매치는 흔들지 않고 4+매치·연쇄(2단+)부터 점점 세게.
    const maxRun = st.runs.length ? Math.max(...st.runs) : 0;
    if (maxRun >= 4) haptics.success();
    this.sfx?.play(maxRun >= 5 ? 'match5' : maxRun >= 4 ? 'match4' : 'match3', 0.55);
    const power = Math.max(maxRun - 3, 0) + Math.max(step - 1, 0); // 4매치=1·5매치=2·6+매치=3, +연쇄단계마다 +1
    if (power > 0) this.shake(Math.min(0.003 + power * 0.0018, 0.011), Math.min(140 + power * 45, 340));
    if (step >= 2) {
      this.showCombo(step);
      this.sfx?.play('combo', 0.5);
    }
  }

  /**
   * ⭐카메라(전체 화면) 흔들기 — 큰 매치·깊은 연쇄·라인 슬램의 임팩트(요청). intensity 는 화면 폭 대비 비율
   *   (0.006 ≈ ±6px), duration 은 ms. 작은 매치엔 호출하지 않아 산만함을 막는다(호출부에서 게이팅).
   */
  private shake(intensity: number, duration: number): void {
    this.scene.cameras.main.shake(duration, intensity, false);
  }

  /**
   * ⭐매치 효과(타일 애니 제외) — 버스트 파티클 + 스핀 팝업 + 수집 코인 비행. **즉시(동기)** 실행되며 타일은
   *   건드리지 않는다. 즉시낙하 경로(일반/라인 제거)에서 이것만 호출하고 매치 타일은 settle 이 곧장 재활용한다
   *   → 팝 축소를 기다리는 텀 없이 바로 떨어진다.
   */
  private popEffects(st: ResolveStep, step: number): void {
    const big = step >= 3 || (st.runs.length ? Math.max(...st.runs) : 0) >= 5 || st.matched.length >= 8;
    st.matched.forEach((m) => this.burst(this.cx(m.c), this.cy(m.r), big));
    this.spinPopup(st);
    // ⭐수집 대상 코인(this.collectType) 매치 → 보상 게이지로 쭈루룩 날아간다(요청). 여러 개면 살짝 스태거.
    let fly = 0;
    for (const m of st.matched) {
      if (this.grid[m.r]?.[m.c] === this.collectType) this.flyCoinToGauge(this.cx(m.c), this.cy(m.r), fly++ * 70);
    }
  }

  /**
   * ⭐공격/약탈 특수젬 "확대-유지 팝"(요청 2026-06-28) — 매치 위치에 **별도 클론 스프라이트**를 띄워 확대→유지→
   *   소멸시킨다. 실제 젬은 곧장 settle 이 재활용(낙하)하므로 **퍼즐 흐름이 멈추지 않는다**(요청 2026-06-29:
   *   "어택/레이드 매칭 시 퍼즐 연출이 멈추지 않게"). 클론이라 fire-and-forget — 낙하/연쇄를 절대 막지 않는다.
   */
  private spawnSpecialPopFx(x: number, y: number, texKey: string): void {
    if (!this.scene.textures.exists(texKey)) return;
    const t = this.geom.tile;
    const fx = this.scene.add.image(x, y, texKey).setDisplaySize(t, t).setDepth(this.depth + 12);
    // 확대(140) → 유지(240) → 소멸(220). 전기 FX(playSpecialFx)가 이 위에서 함께 번쩍인다.
    this.scene.tweens.add({
      targets: fx, displayWidth: t * 2.25, displayHeight: t * 2.25, duration: 140, ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({ targets: fx, scaleX: 0, scaleY: 0, alpha: 0, angle: 120, duration: 220, delay: 240, ease: 'Quad.easeIn', onComplete: () => fx.destroy() });
      },
    });
    this.scene.time.delayedCall(950, () => { if (fx.active) fx.destroy(); }); // 안전 정리(트윈 미완 대비 — 누수 방지)
  }

  /**
   * 거리정확 중력낙하 + 리필 — step.matched(생존자)와 grid 로 열별 재구성.
   *   ⭐연출 강화(요청 2026-06-28):
   *     ① **순차 낙하** — 열을 좌→우로 시차를 두고(colStagger), 타일은 낙하 거리에 비례한 가속 시간으로 떨어진다
   *        (멀리서 떨어진 건 더 오래·빠르게) → 보드가 계단식으로 차오르는 느낌.
   *     ② **라인 꽝꽝**(heavy: 큰 매치/연쇄/대량 제거) — 열 시차를 크게 벌려 좌→우로 라인이 슬램.
   *        각 열의 **가장 아래로 떨어진 타일이 바닥에 닿는 순간**마다 충격파(슬램 라인) + 먼지 + 화면 흔들기 +
   *        착지 스쿼시를 줘 "꽝 … 꽝 … 꽝" 으로 읽힌다.
   */
  private async settle(st: ResolveStep, step: number): Promise<void> {
    const maxRun = st.runs.length ? Math.max(...st.runs) : 0;
    // ⭐"꽝꽝" 중낙하 판정 — 4+매치·연쇄(2단+)·대량 제거(6+)면 라인이 묵직하게 슬램(특정한 경우만, 요청).
    const heavy = step >= 2 || maxRun >= 4 || st.matched.length >= 6;
    this.sfx?.play('drop', heavy ? 0.5 : 0.3);
    const matched = new Set(st.matched.map((m) => `${m.r},${m.c}`));
    const rows = this.geom.rows;
    const pitch = this.geom.pitchY;
    const base = this.geom.tile;
    const colStagger = heavy ? 46 : 9; // 순차 낙하 시차(열당) — heavy 는 좌→우 슬램이 또렷이 보이게 크게
    const baseDur = heavy ? 100 : 84;
    const maxDur = heavy ? 210 : 150;
    const ease = heavy ? 'Quart.easeIn' : 'Quad.easeIn'; // heavy 는 더 센 가속 = 슬램
    const intensity = Math.min(0.004 + maxRun * 0.0009 + step * 0.001, 0.01);
    const durFor = (dist: number): number => Math.min(maxDur, baseDur * Math.sqrt(Math.max(0.5, dist / pitch)));
    // ⭐'움직임의 중심'(매치 칸들의 중심) — 착지 흔들림 진폭을 이 중심에서의 거리로 가중한다(중심 크게 → 외곽 작게).
    let ex = 0;
    let ey = 0;
    for (const m of st.matched) { ex += this.cx(m.c); ey += this.cy(m.r); }
    const nMatched = st.matched.length || 1;
    ex /= nMatched;
    ey /= nMatched;
    const proxLen = ((this.geom.pitchX + this.geom.pitchY) / 2) * LAND_PROX_CELLS;
    const drops: Promise<void>[] = [];
    for (let c = 0; c < this.geom.cols; c++) {
      // before 에서 이 열의 생존자 행(아래→위) = collapse 순서.
      const survivors: number[] = [];
      for (let r = rows - 1; r >= 0; r--) if (!matched.has(`${r},${c}`)) survivors.push(r);
      let si = 0;
      let spawn = 0;
      const colDelay = c * colStagger;
      let slammed = false; // 이 열의 바닥 슬램(가장 아래 떨어진 타일)은 한 번만
      for (let r = rows - 1; r >= 0; r--) {
        const img = this.sprites[r][c];
        this.scene.tweens.killTweensOf(img); // ⭐재사용 전 직전 단계의 바운스(landSettle) 등 잔여 트윈 취소(연쇄 충돌 방지)
        this.paintTile(img, this.grid[r][c]);
        img.setDisplaySize(base, base);
        img.setAlpha(1).setAngle(0);
        let fromY: number;
        if (si < survivors.length) {
          fromY = this.cy(survivors[si++]); // 떨어진 거리만큼 위에서 시작
        } else {
          spawn++;
          fromY = this.cy(0) - spawn * pitch; // 보드 위에서 생성
        }
        img.setPosition(this.cx(c), fromY);
        const toY = this.cy(r);
        const dist = toY - fromY;
        const dur = durFor(dist);
        let p = this.tween({ targets: img, y: toY, duration: dur, delay: colDelay, ease });
        // ⭐바닥 슬램(heavy) — 열에서 가장 아래로 떨어진 타일이 닿는 순간 충격파 + 화면 흔들기(무게감).
        if (heavy && dist > 1 && !slammed) {
          slammed = true;
          const land = colDelay + dur;
          const sx = this.cx(c);
          this.scene.time.delayedCall(land, () => {
            this.slamImpact(sx, toY); // 수평 충격파 + 먼지
            this.shake(intensity, 130); // 좌→우 시차로 호출돼 "꽝 꽝 꽝" 처럼 연속 흔들림
          });
        }
        // ⭐착지 배열 파동(요청) — 실제로 떨어진 젬만(무이동 생존자 제외) 감쇠 다중 바운스로 출렁이며 안착. 진폭은
        //   '움직임의 중심' 거리로 가중(중심 크게 → 외곽 작게) + 자연 낙하 시차 → 중심부터 바깥으로 파동치듯 배열.
        //   ⭐**논블로킹(fire-and-forget)**: settle 은 '착지'까지만 await 하고 바운스 종료는 기다리지 않는다 →
        //   연쇄 2·3차가 파동이 끝날 때까지 멈추지 않고 곧장 이어진다(요청 2026-06-29). 바운스는 따로 재생되며,
        //   다음 단계가 그 타일을 재사용하면 위 killTweensOf 가 깔끔히 취소한다.
        if (dist > pitch * 0.25) {
          const prox = Math.exp(-Math.hypot(this.cx(c) - ex, toY - ey) / proxLen); // 1(중심)~0(외곽)
          const amp = LAND_AMP_MIN + (LAND_AMP_MAX - LAND_AMP_MIN) * prox;
          p = p.then(() => { void this.landSettle(img, base, amp); }); // 착지 직후 바운스 발사(논블로킹)
        }
        drops.push(p);
      }
    }
    await Promise.all(drops);
  }

  /**
   * ⭐착지 배열 파동(soft landing) — 떨어진 젬이 닿는 순간 **한번에 멈추지 않고** 감쇠 다중 바운스로 출렁이며
   *   정착한다. amp=흔들림 진폭(진앙 가까울수록 큼). 단계가 **점점 작아지며** "큰 흔들림 → 작은 흔들림" 으로 정리:
   *     ① 흡수(납작, 가장 큼) → ② 반동(길쭉) → ③ 여진(반대로 작게) → ④ 정착(정확히 base 로 종료).
   *   크기(스쿼시)만 바꾸고 위치는 안 건드려 잔여 오프셋이 없다(다음 단계 popCells/syncTextures 와 어긋나지 않음).
   */
  private landSettle(img: Phaser.GameObjects.Image, base: number, amp: number): Promise<void> {
    const a1 = amp; // 1차(가장 큰 흔들림)
    const a2 = amp * 0.5; // 2차(반동, 작아짐)
    const a3 = amp * 0.22; // 3차(여진, 더 작음)
    return this.tween({ targets: img, displayWidth: base * (1 + a1), displayHeight: base * (1 - a1), duration: LAND_ABSORB_MS, ease: 'Quad.easeOut' })
      .then(() => this.tween({ targets: img, displayWidth: base * (1 - a2), displayHeight: base * (1 + a2), duration: LAND_REBOUND_MS, ease: 'Sine.easeInOut' }))
      .then(() => this.tween({ targets: img, displayWidth: base * (1 + a3), displayHeight: base * (1 - a3), duration: LAND_JIGGLE_MS, ease: 'Sine.easeInOut' }))
      .then(() => this.tween({ targets: img, displayWidth: base, displayHeight: base, duration: LAND_REST_MS, ease: 'Sine.easeOut' }));
  }

  /** 파티클 버스트(재사용 이미터에서 explode). */
  private burst(x: number, y: number, big: boolean): void {
    this.emitter.explode(big ? 18 : 11, x, y);
  }

  /**
   * ⭐라인 슬램 "꽝" 임팩트 — 타일이 바닥에 닿는 지점에 **수평 충격파(밝은 가로 스트릭)** 가 번쩍 퍼지고
   *   먼지 스파크가 튄다(ADD 블렌드). 화면 흔들기는 호출부에서 함께 친다.
   */
  private slamImpact(x: number, y: number): void {
    const t = this.geom.tile;
    const streak = this.scene.add
      .image(x, y + t * 0.42, SPARK_TEX)
      .setDisplaySize(t * 0.95, t * 0.3)
      .setTint(0xfff2c2)
      .setAlpha(0.9)
      .setDepth(this.depth + 10)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: streak,
      displayWidth: t * 2.1,
      displayHeight: t * 0.06,
      alpha: 0,
      duration: 210,
      ease: 'Quad.easeOut',
      onComplete: () => streak.destroy(),
    });
    this.emitter.explode(7, x, y + t * 0.38); // 바닥 먼지 스파크
  }

  /**
   * ⭐파워 매치(임팩트) 연출 — board 가 준 st.impacts(라인/십자/폭탄)를 빔·폭발로 그린다.
   *   제거 칸 자체는 popCells 가 팝하므로 여기선 **오버레이 연출**(가로/세로 빔, 폭발 링)만 + 화면 흔들기.
   *   모든 수치는 SPARK_TEX·재사용 이미터로 GPU 저비용, 파티클 수 상한(캡) 유지. 블러 FX 없음.
   */
  private animateImpacts(st: ResolveStep): void {
    if (!st.impacts.length) return;
    const t = this.geom.tile;
    const cols = this.geom.cols;
    const rows = this.geom.rows;
    const boardW = this.cx(cols - 1) - this.cx(0) + t;
    const boardH = this.cy(rows - 1) - this.cy(0) + t;
    const midX = (this.cx(0) + this.cx(cols - 1)) / 2;
    const midY = (this.cy(0) + this.cy(rows - 1)) / 2;
    const tier = Math.max(1, this.impactTier);
    let shook = false;
    for (const imp of st.impacts) {
      const ox = this.cx(imp.origin.c);
      const oy = this.cy(imp.origin.r);
      if (imp.kind === 'line-row') {
        for (let i = 0; i < (imp.cells.length > cols ? 2 : 1); i++) this.beam(midX, this.cy(imp.origin.r + i), boardW, t * 0.55, true);
      } else if (imp.kind === 'line-col') {
        for (let i = 0; i < (imp.cells.length > rows ? 2 : 1); i++) this.beam(this.cx(imp.origin.c + i), midY, boardH, t * 0.55, false);
      } else if (imp.kind === 'cross') {
        this.beam(midX, oy, boardW, t * 0.55, true);
        this.beam(ox, midY, boardH, t * 0.55, false);
      } else {
        // bomb / colorbomb — 확장 폭발 링 + 버스트.
        this.explosion(ox, oy, imp.kind === 'colorbomb');
        if (imp.kind === 'colorbomb') {
          this.scene.cameras.main.flash(150, 255, 240, 200, false); // ⭐Phase3: 컬러폭탄 화면 번쩍(아트 무관)
          let n = 0;
          for (const cc of imp.cells) {
            if (n % 4 === 0) this.burst(this.cx(cc.c), this.cy(cc.r), false); // 캡: 일부 칸만 버스트
            if (++n > 48) break;
          }
        } else if (tier >= 5) {
          this.scene.cameras.main.flash(90, 255, 220, 170, false); // 고티어 대형 폭탄도 약한 번쩍
        }
      }
      this.sfx?.play(imp.kind === 'bomb' || imp.kind === 'colorbomb' ? 'match5' : 'match4', 0.6);
      if (!shook) {
        this.shake(Math.min(0.006 + tier * 0.0015, 0.014), 200); // 티어 비례, 상한 캡
        shook = true;
      }
    }
  }

  /** 빔(가로/세로) — 원점에서 가늘게 시작해 전체 길이로 확장하며 페이드(ADD). 라인/십자 연출용. */
  private beam(cx: number, cy: number, length: number, thick: number, horizontal: boolean): void {
    const img = this.scene.add
      .image(cx, cy, SPARK_TEX)
      .setDisplaySize(thick, thick)
      .setTint(0xfff2c2)
      .setAlpha(0.95)
      .setDepth(this.depth + 12)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: img,
      displayWidth: horizontal ? length : thick * 0.3,
      displayHeight: horizontal ? thick * 0.3 : length,
      alpha: 0,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => img.destroy(),
    });
    this.emitter.explode(10, cx, cy);
  }

  /** 폭발 링 — 원점에서 커지며 회전·발광 후 소멸(ADD) + 큰 버스트. bomb/colorbomb 연출용. */
  private explosion(x: number, y: number, mega: boolean): void {
    const t = this.geom.tile;
    const ring = this.scene.add
      .image(x, y, SPARK_TEX)
      .setDisplaySize(t * 0.6, t * 0.6)
      .setTint(mega ? 0xff7a3c : 0xffd34d)
      .setAlpha(0.95)
      .setDepth(this.depth + 14)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: ring,
      displayWidth: t * (mega ? 6 : 4),
      displayHeight: t * (mega ? 6 : 4),
      alpha: 0,
      angle: 90,
      duration: mega ? 420 : 320,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
    this.burst(x, y, true);
  }

  /** 적립 스핀 팝업(매치 중심에서 떠오름). */
  private spinPopup(st: ResolveStep): void {
    const n = st.matched.length;
    let cx = 0;
    let cy = 0;
    for (const m of st.matched) {
      cx += this.cx(m.c);
      cy += this.cy(m.r);
    }
    cx /= n;
    cy /= n;
    const tier = n >= 10 ? 0 : n >= 7 ? 1 : n >= 4 ? 2 : 3;
    const sizes = [60, 50, 42, 34];
    const colors = ['#ffd34d', '#ffe27a', '#8fe3ff', '#ffffff'];
    const t = this.scene.add
      .text(cx, cy, `+${st.runs.length} 스핀`, {
        fontFamily: '"Jua", sans-serif',
        fontSize: `${sizes[tier]}px`,
        color: colors[tier],
        stroke: '#5a2b00',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(this.depth + 50)
      .setScale(0.4);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 90, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: t,
      y: cy - (90 + tier * -8),
      alpha: 0,
      delay: 100,
      duration: 440,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private showCombo(step: number): void {
    // 숫자=컬러 이미지 폰트(골드/레드), "COMBO!"=숫자와 어울리는 골드 텍스트. 단계별 살짝 확대.
    this.combo.setText(`${step} COMBO!`, '#ffe27a');
    const c = this.combo.container;
    const scale = Math.min(1 + (step - 2) * 0.08, 1.3);
    this.scene.tweens.killTweensOf(c);
    this.combo.setAlpha(0.75); // 반투명(요청) — 뒤 타일이 비치도록
    c.setScale(0.2);
    this.scene.tweens.add({ targets: c, scaleX: scale, scaleY: scale, duration: 140, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: c, scaleX: scale * 1.12, scaleY: scale * 1.12, duration: 60, delay: 140, yoyo: true });
    this.scene.tweens.add({ targets: c, alpha: 0, delay: 430, duration: 125 });
  }

  private async rejectShake(imgs: Phaser.GameObjects.Image[]): Promise<void> {
    imgs.forEach((img) => img.setTintFill(0xff5a5a));
    const homeX = imgs.map((img) => img.x);
    await this.tween({
      targets: imgs,
      x: `+=8`,
      duration: 28,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: 2,
    });
    imgs.forEach((img, i) => {
      img.clearTint();
      img.x = homeX[i];
    });
  }

  /** 교착 시 보드 재생성 + 떨어뜨리기. */
  private async reshuffle(): Promise<void> {
    const banner = this.scene.add
      .text(this.cx((this.geom.cols - 1) / 2), this.cy((this.geom.rows - 1) / 2), '셔플!', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '72px',
        color: '#ffffff',
        stroke: '#5a2b00',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(this.depth + 60);
    haptics.warn();
    this.sfx?.play('shuffle', 0.6);
    this.generateRichGrid(); // ⭐셔플도 최소 가용 매치 보장 보드로(발견성)
    const drops: Promise<void>[] = [];
    for (let r = 0; r < this.geom.rows; r++) {
      for (let c = 0; c < this.geom.cols; c++) {
        const img = this.sprites[r][c];
        this.paintTile(img, this.grid[r][c]);
        img.setDisplaySize(this.geom.tile, this.geom.tile);
        img.setAlpha(1).setAngle(0);
        img.setPosition(this.cx(c), this.cy(r) - this.geom.pitchY * (this.geom.rows + 1));
        drops.push(
          this.tween({ targets: img, y: this.cy(r), duration: 270, delay: c * 40, ease: 'Bounce.easeOut' }),
        );
      }
    }
    this.shake(0.006, 240); // 셔플 = 보드 전체가 쏟아지는 임팩트(요청)
    await Promise.all(drops);
    banner.destroy();
  }
}
