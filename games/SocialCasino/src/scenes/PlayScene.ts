/**
 * PlayScene — 슬롯매치 본편.
 *
 * 점수 구조(요청):
 *   - 퍼즐 점수 P = 제거한 타일 수 × 콤보 배수(4매치 ×2 · 5매치 ×4 · 6+매치 ×8). (boardView)
 *   - 슬롯 점수 S = 당첨 페이라인 값 합(없으면 ×1로 취급해 퍼즐 점수가 0이 되지 않게).
 *   - 최종 획득 코인 = round(P × S × 베팅배수)  → 가운데 패널에 P × S = 최종 으로 **굴려서(롤링)** 표시.
 *
 * 두 가지 플레이 방식:
 *   ① 퍼즐-우선(기본): 타일을 스왑해 매치 → 슬롯 1회 회전 → 합산.
 *   ② 슬롯-우선(역방향): SPIN/레버 → 슬롯 먼저 회전 → 보드가 AI 자동매치 → 합산.
 *
 * 화면은 에디터 main.json 을 SSOT 로 렌더하되, 슬롯 심볼/퍼즐 타일 노드는 동적 제어 대상이라 제외.
 */
import Phaser from 'phaser';
import { loadGameAssets, UI_LAYOUT_KEY, LEVER_SHEET_KEY, LEVER_FRAMES, COLLECT_GEM_TYPE, PUZZLE_TILE_KEYS, COIN_SHEET_KEY } from '../assets.js';
import { buildLayout, type LayoutDoc, type LayoutNode } from '../ui/layoutLoader.js';
import { RewardGaugeView, type GaugeNodeRefs } from '../ui/rewardGaugeView.js';
import {
  type RewardGaugeConfig,
  type RewardGaugeState,
  type GaugeReward,
  createGaugeState,
  addProgress,
  dueRewards,
  rewardAt,
  claim,
  fillRatio,
  remainingMs,
  isExpired,
  serializeGauge,
  deserializeGauge,
} from '@casual/core';
import { computeGeom, isDynamicNode, type LayoutGeom } from '../ui/layoutGeom.js';
import { SlotView } from '../ui/slotView.js';
import { BoardView, type ResolvedInfo } from '../ui/boardView.js';
import { FancyNumber } from '../ui/fancyNumber.js';
import { showToast, showDialog, isDialogOpen } from '../ui/dialogBox.js';
import { BigNumber } from '../ui/bigNumber.js';
import { Confetti } from '../ui/confetti.js';
import { CoinBurst } from '../ui/coinBurst.js';
import type { SpinOutcome } from '../logic/slot3.js';
import { SPECIAL_SPIN, tierForStage } from '../logic/board.js';
import { deserializeHotel, totalLevel, cityLevel, currentStage, createHotelState, HOTEL_SAVE_KEY, formatCompact, type HotelState } from '../logic/hotelUpgrade.js';
import { incomeMultiplier, missionTarget, cityCost } from '../logic/progression.js';
import {
  luckMultiplier,
  weightsFor,
  nextFortune,
  jackpotContribution,
  rollJackpot,
  JACKPOT_SEED,
  FORTUNE_START,
  type Fortune,
} from '../logic/economy.js';
import { Sfx, startBgm, type SfxKey } from '../audio.js';
import type { Rng } from '../logic/rng.js';
import { buildAttackBanner } from '../ui/attackBanner.js';
import { HAMMER_IMAGE_KEY, CURTAIN_LEFT_KEY, CURTAIN_RIGHT_KEY } from './HammerFxScene.js';
import { loadCoins, saveCoins } from '../logic/wallet.js';
import { loadPlayerState, savePlayerState, loadSpins } from '../logic/playerState.js';
import { SHOP_CATALOG, applyPurchase, type ShopItem } from '../logic/shop.js';
import { recordSnapshot } from '../econ/telemetry.js';
import {
  START_COINS, START_SPINS, BET_LADDER, BET_START, COIN_DENOM,
  spinRefundMult, BIGWIN_SPIN_BIG_X, BIGWIN_SPIN_BIG, BIGWIN_SPIN_MEGA_X, BIGWIN_SPIN_MEGA,
  DAILY_SPINS,
} from '../logic/playParams.js';
import { slotRtpScaleNow, luckTableNow, raidStakeScaleNow, attackSpinStakeScaleNow, missionsNow } from '../logic/econOverrides.js';
import { openSettingsMenu } from '../ui/settingsMenu.js';
import {
  createPace, recordMatch, paceIntensity, paceTiming,
  ROUND_GAP_SLOW_MS, PUZZLE_TO_SLOT_SLOW_MS, type PaceState,
} from '../logic/pace.js';

export const DESIGN_W = 1080;
export const DESIGN_H = 2400;

// ⭐경제 파라미터는 순수 SSOT 모듈(playParams.ts)에서 import — 경제 콘솔(econ)이 같은 모듈을 읽어 값 추적(드리프트 없음).
const DAILY_SPIN_KEY = 'socialcasino_daily_v2'; // 마지막 일일 지급 날짜(YYYY-MM-DD). ⚠️v2=1레벨 재설정 → 첫 실행 정확히 200스핀(일일보너스 미지급). 구 v1 폐기.
/** 하단 "현재/레벨기본" 표기의 **레벨기본**(재생상한) 임시값 — 추후 코인마스터식 재생(playParams.spinRegenCap)으로 대체. */
const SPIN_LEVEL_BASE = 50;
/** 망치 등장 후 — **닫힌 커튼 뒤에서** Stage1 을 띄우기까지(ms). HammerFxScene 의 [CURTAIN_CLOSE_MS(300), CURTAIN_OPEN_AT(1300)] 사이여야 커튼이 가린다(열림이 곧 등장). */
const STAGE_BEHIND_CURTAIN_MS = 280; // 스피드업: 380→280(여전히 닫힌 커튼 구간 내)
// ⭐라운드 페이싱은 pace.ts(SSOT)로 이관 — 퍼즐 매치 속도에 따라 슬롯/라운드 텀이 적응(따라잡기).
//   여유(slow) 끝값은 ROUND_GAP_SLOW_MS(220) / PUZZLE_TO_SLOT_SLOW_MS(50). 오토·단발은 이 여유값 사용.

// ⭐단계별 보상 게이지(EARN SPINS) — 미션 플랜(MISSION_PLAN)은 playParams.ts(SSOT)에서 import. missionConfig 가 게이지 설정으로 변환.
/** 미션 i(루프) → 게이지 설정(목표=젬수×베팅 · 제한시간=분 · 보상=플랜). 중간 보상 없음. */
function missionConfig(missionIndex: number): RewardGaugeConfig {
  const plan = missionsNow(); // 오버라이드(데이터 편집) 반영 — 없으면 SSOT(MISSION_PLAN)
  const m = plan[((missionIndex % plan.length) + plan.length) % plan.length];
  return { target: m.target, durationMs: m.minutes * 60_000, milestones: [], finalReward: m.reward };
}
const GAUGE_CONFIG: RewardGaugeConfig = missionConfig(0); // 첫 미션(12·2분·스핀40)
const GAUGE_SAVE_KEY = 'socialcasino_reward_gauge_v20'; // localStorage 영속 키. ⚠️v20=배수제거·베이스값 고정(130~330) → 게이지 초기화. 구 v19 폐기
const GAUGE_MISSION_KEY = `${GAUGE_SAVE_KEY}_mi`; // 미션 인덱스(별도 영속) — 플랜/젬 파생
/** ⭐미션 완료 → 다음 미션까지 **간격 15초**(요청 — 목표 시간/아이템 지운 상태로 15초 유지 후 재시작). 성공 음악(~4.65s) 여운 + 휴식. */
const MISSION_GAP_MS = 15_000;
/** ⭐보상 미션의 수집 젬 순환 — 미션 완료 시 다음 젬으로(요청). 보드 타입 0..4. */
const GAUGE_GEM_CYCLE = [0, 1, 2, 3, 4];
/** 보상 배지 아이콘 — 스핀=번개 아이콘(기본) · 코인=기존 코인 회전시트 frame0(전용 아이콘 추후 제공). */
const REWARD_SPIN_ICON = 'up_SC_UI_54_v2';
const REWARD_COIN_ICON = COIN_SHEET_KEY;
// 승률(RTP)·포춘(운)·퍼즐 보너스·잭팟은 economy.ts(단일 출처)가 관리.
//   운 기반 유동형: 결합 RTP≈96%(엣지 4%), 포춘 Hot/Cold 스트릭(평균중립)이 따고/잃고를 유동시킨다.

export class PlayScene extends Phaser.Scene {
  private rng: Rng = () => Math.random();
  private geom!: LayoutGeom;
  private slot!: SlotView;
  private board!: BoardView;
  private lever?: Phaser.GameObjects.Sprite; // 애니메이션 레버(스프라이트 시트)
  // GO 버튼(신 GO 패널) — 패널(up_SC_GO_01_v2)에 눌린 GO 가 베이크돼 있고, 그 위에 안 눌린 GO(up_SC_GO_02)를
  //   덮는다. **누르면 상부 GO(cap)만 숨겨** 패널의 눌린 GO 가 드러난다(기존 2겹 패턴 계승).
  private spinBtnBase?: Phaser.GameObjects.Image; // 하부 = 패널(항상 표시)
  private spinBtnCap?: Phaser.GameObjects.Image; // 상부 = 안 눌린 GO(평상시 표시, 누르면 숨김)
  private autoOffOverlay?: Phaser.GameObjects.Image; // AUTO OFF 오버레이(오토 꺼짐 표시). 오토 작동 시 숨김 → 패널 AUTO ON 노출
  private coinBurst!: CoinBurst; // 코인 드랍/버스트 연출(슬롯 당첨 시 한 줄 터짐)
  private sfx!: Sfx;
  private spinLoop: Phaser.Sound.BaseSound | null = null; // 현재 회전음 — 마지막 릴 정지(뒷부분) 시 페이드

  // 상태
  private coins = START_COINS;
  private bet = BET_START * COIN_DENOM; // 슬롯 코인 베팅 = spinBet × COIN_DENOM(에너지와 분리, 골드만 큰 단위). 슬롯 보상이 여기 비례
  private jackpotPool = JACKPOT_SEED; // 누적 잭팟 풀(레이크 적립 → 희귀확률로 전액 지급)
  private spins = START_SPINS; // 보유 스핀 = 플레이 화폐(슬롯/매치에 소모, 스핀 젬·시간충전으로 적립)
  private betIndex = Math.max(0, BET_LADDER.indexOf(BET_START)); // 현재 베팅 사다리 인덱스
  private spinBet = BET_START; // 스핀 베팅 숫자(하단 "10" ×N) = 사다리 값 — 1회 플레이 소모 스핀 + 스핀젬/공격·약탈 보상 배수
  private rechargeText?: Phaser.GameObjects.Text; // 일일 지급 안내 텍스트
  private spinBarX = 533; // 보유 스핀 표시 위치 — up_SC_UI_btn_off-1(GO 하단 바) 노드에서 갱신
  private spinBarY = 2315;
  private fortune: Fortune = FORTUNE_START; // 운 상태(Cold/Neutral/Hot) — 스핀마다 확률적 유동. ⚠️숨김(절대 화면 표시 안 함)
  private busyRound = false;
  private stageActive = false; // 공격/약탈 스테이지(blank_3) 표시 중 — 중복 발동/재진입 방지

  // ⭐보상 게이지(EARN SPINS) — 뷰 + 상태(코어 rewardGauge) + 1초 타이머.
  private gaugeView?: RewardGaugeView;
  private gaugeState: RewardGaugeState = createGaugeState(0);
  private gaugeCfg: RewardGaugeConfig = GAUGE_CONFIG; // ⭐현 미션 설정(목표는 미션마다 증가 — 점진 난이도)
  private missionIndex = 0; // 완료한 미션 수(젬·목표 파생)
  private gaugeStageStartedMs?: number; // ⭐어텍/레이드 진입 시각 — 복귀 시 경과분만큼 미션 마감을 뒤로 밀어 **타임어택 시간에서 제외**(요청 2026-06-30)
  private lastGaugeWarnSec?: number; // ⭐직전 틱의 남은 초 — 30/20초 경고·10초 카운트다운 사운드 중복/누락 방지(경계 통과 판정)
  private currentGemType = COLLECT_GEM_TYPE; // = GAUGE_GEM_CYCLE[missionIndex%len]
  private collectGemImg?: Phaser.GameObjects.Image; // 게이지 수집 아이콘(미션 진행 시 텍스처 갱신)
  private gaugeTargetPt?: { x: number; y: number }; // 수집 코인 비행 목표(게이지 아이콘 위치)
  private milestoneBadgeImg?: Phaser.GameObjects.Image; // 중간 보상 배지(보상 연출 시작점)
  private finalBadgeImg?: Phaser.GameObjects.Image; // 최종 보상 배지(보상 연출 시작점)
  private pendingStage?: { type: 'attack' | 'raid'; power: number; auto: boolean }; // 슬롯결정 후 전환할 예약 스테이지(auto=예약 시점의 오토스핀 여부 고정)
  // ⭐발동 정보 **보류**(banner 는 젬과 동시에 일찍 띄우되, pendingStage 예약은 **슬롯 회전·결과 표시 후**(finalizeWin)에
  //   해야 슬롯이 확실히 돌고 결과가 보인 뒤 스테이지로 넘어간다 — 요청 2026-06-28: "텍스트 연출 시 슬롯이 돌지 않음" 수정).
  private stageHold?: { type: 'attack' | 'raid'; power: number };
  private activationBanner?: Phaser.GameObjects.Container; // 공격/약탈 발동 배너(자동소멸 없이 전환까지 유지)
  private noSpinsToastAt = 0; // '스핀 부족' 토스트 쓰로틀(연타 스팸 방지)
  private noSpinsDialogAt = 0; // '스핀 부족' 결정 다이얼로그 쓰로틀(더 길게 — 자주 안 뜨게)
  private scoreQueue: number[] = []; // 대기 중인 퍼즐 멀티플라이어(퍼즐-우선 모드, 연속 조작 버퍼)
  private pace: PaceState = createPace(); // ⭐퍼즐 매치 페이스 추적 → 슬롯 가속(빠르게 맞추면 슬롯도 따라옴)
  private holdSpin = false; // 스핀 지속 여부(홀드 중 또는 오토락)
  private spinLooping = false; // 자동 스핀 루프 가동 중(중복 방지)
  private autoLock = false; // 2초 이상 눌러 잠긴 자동 스핀(떼도 지속)
  private pointerDown = false; // SPIN 물리적으로 눌린 상태
  private holdTimer?: Phaser.Time.TimerEvent; // 2초 잠금 타이머
  // 연출 검증 토글 — ON 이면 슬롯 당첨을 항상 높은 배수(5/10/20/40배 순환)로 강제해 멀티 웨이브 코인 연출 확인. ⚠️출시 전 제거
  private forceBigWin = false;
  private readonly forcedMults = [5, 10, 20, 40];
  private forcedIdx = 0;

  // HUD
  private coinText!: Phaser.GameObjects.Text; // 코인(골드) 텍스트 — main_copy grp_4 헤더 노드(layer_20)에 바인딩
  private coinFontBase = 40; // 코인(골드) 기본 폰트 — 자릿수 많아지면 폭에 맞춰 축소
  private userNameText?: Phaser.GameObjects.Text; // 슬롯 상단 유저명(DAKA) — 라운드 당첨 시 숨김(task 2)
  private userCoinText?: Phaser.GameObjects.Text; // 슬롯 상단 보유코인(5,000,000) — 라운드 당첨 시 숨김(task 2)
  private betText?: Phaser.GameObjects.Text; // 하단 베팅 "10" 텍스트 — +/- 로 조절(task 4)
  private spinText?: Phaser.GameObjects.Text; // 보유 스핀 표시(GO 하단 바)
  private matchImg?: Phaser.GameObjects.Image; // 타이틀 배너의 "MATCH = 1 SPIN" 텍스트(첫 당첨 전 idle 표시)
  private missionBannerText?: Phaser.GameObjects.Text; // ⭐미션 시작/종료 메시지를 상단 타이틀 배너(419 자리)에 표시(요청)
  private missionBannerMaxW = 0; // 배너 폭(긴 문구 자동 축소용)
  private missionBannerTween?: Phaser.Tweens.Tween;
  private missionBannerActive = false; // ⭐타이틀 배너 점유 중(미션 메시지 표시) — 이때 슬롯 당첨 배너는 **중첩 금지로 스킵**(요청: 중요정보 우선)
  private missionBannerQueue: Array<{ msg: string; color: string }> = []; // ⭐배너 메시지 **순차 표시 큐**(요청: 완료→보상 등 줄세워 표시)
  private gaugeTimerArmed = false; // ⭐미션 타이머 시작됨? false=새 미션 시작 후 **첫 퍼즐 조작 대기 중**(그 전엔 카운트다운 정지, 요청)
  private bannerShowedWin = false; // ⭐슬롯 당첨을 한 번이라도 배너에 표시? true 면 메시지 후 **MATCH=1SPIN 대신 직전 당첨**으로 복원(요청: MATCH=1SPIN 자꾸 안 보이게)
  // 정보패널 아이콘(텍스트 라벨 대신) — 퍼즐/슬롯은 실행 순서대로 좌·중 칸을 오가며 값과 함께 자리 교체, 코인=우(고정).
  private iconPuzzle?: Phaser.GameObjects.Image;
  private iconSlot?: Phaser.GameObjects.Image;
  private iconWin?: Phaser.GameObjects.Image;
  // 중간 정보 패널(up_SC_UI_10_v3) — 점수 표시(굵은 이텔릭 폰트): 퍼즐 × 슬롯 = 최종
  // 정보패널 좌/중 칸 — 실행 순서대로 채운다(스핀 먼저=슬롯이 좌·퍼즐이 중, 퍼즐 먼저=퍼즐이 좌·슬롯이 중).
  private infoLeft!: FancyNumber;
  private finalScoreText!: FancyNumber;
  private bigWinNum!: BigNumber; // 대박(10배+) 코인 드랍 카운트업 숫자(차르르 → 떨어지며 사라짐)
  private bigWinTween?: Phaser.Tweens.Tween; // 카운트업 카운터 트윈(연속 대박 시 이전 것 정리)
  private confetti!: Confetti; // 대박(10배+) 축포(색종이) — 배경 위·UI 아래 레이어
  private playingText!: Phaser.GameObjects.Text; // 라운드 진행 중 "스핀 중..." 표시

  constructor() {
    super('play');
  }

  preload(): void {
    loadGameAssets(this);
  }

  create(): void {
    // ⭐씬 재진입(홈→복귀) 초기화(2026-06-30 버그수정) — Phaser 는 씬 인스턴스를 **재사용**하므로 클래스 필드가 보존된다.
    //   오토스핀 중 홈으로 나가면 autoSpinLoop 의 await 가 영영 안 풀려 spinLooping(또는 busyRound/stageActive/holdSpin
    //   /autoLock)이 true 로 굳고 → 다음 진입에서 autoSpinLoop/autoRound 가 즉시 return(=스핀 먹통, 새로고침해야 복구).
    //   진입마다 진행/오토 플래그를 명시 초기화해 항상 깨끗한 상태로 시작한다.
    this.spinLooping = false;
    this.busyRound = false;
    this.stageActive = false;
    this.holdSpin = false;
    this.autoLock = false;
    this.pointerDown = false;
    this.holdTimer?.remove();
    this.holdTimer = undefined;
    this.pendingStage = undefined;
    this.stageHold = undefined;
    this.gaugeStageStartedMs = undefined; // ⭐재진입 시 정지 플래그 초기화(어텍 도중 이탈→복귀해도 타이머가 멈춘 채 굳지 않게)
    this.missionBannerActive = false; // ⭐재진입 시 배너 점유 플래그 초기화(스킵 상태로 굳지 않게)
    this.missionBannerQueue.length = 0;
    this.gaugeTimerArmed = false; // ⭐재진입 시 미션 타이머는 첫 조작 대기로(시작 전 정지)
    this.bannerShowedWin = false;
    this.scoreQueue.length = 0;
    this.coins = loadCoins(); // ⭐공유 지갑에서 코인 로드(영속 — 호텔 업그레이드 차감분 반영, 세션 간 유지)
    // ⭐재시작 시 리셋되던 진행 상태(스핀·베팅·잭팟) 복원(요청) — 없으면 위의 기본값 유지.
    const saved = loadPlayerState();
    if (saved.spins !== undefined) this.spins = saved.spins;
    if (saved.betIndex !== undefined) {
      this.betIndex = Math.min(BET_LADDER.length - 1, Math.max(0, saved.betIndex));
      this.spinBet = BET_LADDER[this.betIndex];
      this.bet = this.spinBet * COIN_DENOM;
    }
    if (saved.jackpotPool !== undefined) this.jackpotPool = saved.jackpotPool;
    startBgm(this); // ⭐배경음 — 직접 진입(딥링크) 방어용으로도 호출(단일 인스턴스 가드)
    const doc = (this.cache.json.get(UI_LAYOUT_KEY) ?? null) as LayoutDoc | null;
    const safeDoc: LayoutDoc = doc && Array.isArray(doc.nodes) ? doc : { frame: { designW: DESIGN_W, designH: DESIGN_H }, nodes: [] };

    const hasLever = this.textures.exists(LEVER_SHEET_KEY);
    if (!doc || doc.nodes.length === 0) {
      this.add.rectangle(0, 0, DESIGN_W, DESIGN_H, 0x1a1030).setOrigin(0, 0);
      this.coinText = this.text(493, 70, this.fmt(this.coins), 40, '#ffe27a');
      this.coinText.setOrigin(1, 0.5); // 레이아웃 없음(폴백) — 코인 텍스트 최소 보장
    } else {
      // 정적 레버(up_SC_UI_16)는 애니 스프라이트로 대체, "MATCH=1SPIN" 텍스트(up_SC_UI_07-1)는
      //   잭팟정보와 토글하도록 PlayScene 이 직접 관리(스킵).
      const layout = buildLayout(this, doc, {
        // 정적 렌더 제외: 동적 노드 + 애니 레버 + 토글 텍스트 + **망치 이미지 + 커튼 2장**(공격/약탈 발동 시
        //   HammerFxScene 이 제어하는 연출용 — 평상시 화면에 상시 떠 있는 장식이 되지 않게 스킵).
        skip: (n) =>
          // 동적 노드(보드 타일 up_T01_*/심볼/퍼즐)는 보드가 그리므로 정적 제외. 단 **보상 게이지 그룹(grp_2)의
          //   수집목표 젬(up_T01_05)은 정적 UI** 라 제외하지 않는다(요청: "모을 퍼즐" 표시).
          (isDynamicNode(n) && n.group !== 'grp_2') ||
          (hasLever && n.key === 'up_SC_UI_16') ||
          n.key === 'up_SC_UI_07-1' ||
          n.key === HAMMER_IMAGE_KEY ||
          n.key === CURTAIN_LEFT_KEY ||
          n.key === CURTAIN_RIGHT_KEY,
      });
      // 정보패널 아이콘 핸들(퍼즐 10-1·슬롯 10-2·코인 10-3) — 키 접미 버전(_v2 등) 견디게 **접두 매칭**.
      const iconOf = (keyPrefix: string): Phaser.GameObjects.Image | undefined =>
        layout.entries().find((e) => (e.node.key ?? '').startsWith(keyPrefix))?.obj as Phaser.GameObjects.Image | undefined;
      this.iconPuzzle = iconOf('up_SC_UI_10-1');
      this.iconSlot = iconOf('up_SC_UI_10-2');
      this.iconWin = iconOf('up_SC_UI_10-3');
      // 신 GO 패널: 하부 base=패널(up_SC_GO_01_v*, 항상 표시, 눌린 GO 베이크) + 상부 cap=안 눌린 GO(up_SC_GO_02).
      //   평상시 둘 다 표시(cap 이 위). 누르면 cap 만 숨겨 패널의 눌린 GO 노출. (버전 견디게 접두 매칭)
      this.spinBtnBase = layout.entries().find((e) => (e.node.key ?? '').startsWith('up_SC_GO_01'))?.obj as
        | Phaser.GameObjects.Image
        | undefined;
      this.spinBtnCap = layout.entries().find((e) => e.node.key === 'up_SC_GO_02')?.obj as
        | Phaser.GameObjects.Image
        | undefined;
      // AUTO OFF 오버레이(up_SC_GO_06) — 평상시 표시(오토 꺼짐), 오토 작동 시 숨겨 패널의 AUTO ON(초록) 노출.
      this.autoOffOverlay = layout.entries().find((e) => e.node.key === 'up_SC_GO_06')?.obj as
        | Phaser.GameObjects.Image
        | undefined;
      // 좌측 홈 버튼(up_SC_GO_07) → 로비(홈)로. 시티 버튼(up_SC_GO_08) → 시티(미디자인) 안내.
      const homeBtn = layout.entries().find((e) => e.node.key === 'up_SC_GO_07')?.obj as Phaser.GameObjects.Image | undefined;
      if (homeBtn) this.setupMenuButton(homeBtn);
      const cityBtn = layout.entries().find((e) => e.node.key === 'up_SC_GO_08')?.obj as Phaser.GameObjects.Image | undefined;
      if (cityBtn) this.setupCityButton(cityBtn);
      this.setupItemButtons(layout);
      // 보유 스핀 표시 = GO 패널 좌측 SPINS 박스의 'Spin Num' 텍스트 노드. 스핀젬 회수 비행 목표도 이 위치.
      const spinNum = layout.entries().find((e) => e.node.name === 'Spin Num');
      if (spinNum) {
        this.spinText = spinNum.obj as Phaser.GameObjects.Text;
        this.spinText.setFontSize(48).setLetterSpacing(-3); // ⭐크게 + 자간 좁게(요청). 중앙정렬이라 바 위에서 대칭 확대.
        this.spinBarX = spinNum.node.x;
        this.spinBarY = spinNum.node.y;
      }
      // ⭐공용 헤더(코인/젬/라이프 알약 + 메뉴)는 setupHud 에서 buildHudHeader 로 그린다(로비/호텔과 동일).
      //   main.json 헤더 노드 의존 제거(디자이너가 헤더를 main 에서 빼고 로비 blank_2 로 통일) — 메뉴→goHome.
      // 열기구(배경 하늘) — 좌우 유동 + 아주 느린 상하 드리프트 반복.
      const balloon = layout.entries().find((e) => e.node.key === 'up_SC_UI_17')?.obj as Phaser.GameObjects.Image | undefined;
      if (balloon) this.setupBalloon(balloon);
      for (const ic of [this.iconPuzzle, this.iconSlot, this.iconWin]) {
        if (!ic) continue;
        const ratio = ic.displayHeight > 0 ? ic.displayWidth / ic.displayHeight : 0.87;
        ic.setDisplaySize(58 * ratio, 58).setDepth(95).setVisible(false);
      }
      this.gaugeView = this.buildGaugeView(layout); // ⭐보상 게이지 뷰(grp_2 노드 바인딩)

      // ⭐신 헤더(main_copy grp_4): 코인 텍스트 노드에 직접 바인딩(구 buildHudHeader 제거) + 햄버거 메뉴 배선.
      const findObj = (pred: (n: LayoutNode) => boolean): Phaser.GameObjects.GameObject | undefined =>
        layout.entries().find((e) => pred(e.node))?.obj;
      this.coinText = (findObj((n) => n.type === 'text' && n.group === 'grp_4' && /\d,\d/.test((n as { text?: string }).text ?? '')) as
        | Phaser.GameObjects.Text
        | undefined) ?? this.text(493, 70, this.fmt(this.coins), 40, '#ffe27a');
      this.coinText.setOrigin(1, 0.5).setDepth(510); // 우측 정렬(디자이너 align=right)
      const menuObj = findObj((n) => (n.key ?? '') === 'up_NewUI_04-6') as Phaser.GameObjects.Image | undefined;
      menuObj?.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.openMenu());
      // ⭐슬롯 상단 유저정보(DAKA/보유코인) — 좌측정렬(task 2). 라운드 당첨 시 숨기고 당첨금 표시.
      this.userNameText = findObj((n) => n.name === '유저명') as Phaser.GameObjects.Text | undefined;
      this.userCoinText = findObj((n) => (n as { text?: string }).text === '5,000,000') as Phaser.GameObjects.Text | undefined;
      this.userNameText?.setOrigin(0, 0.5);
      this.userCoinText?.setOrigin(0, 0.5);
      // ⭐하단 베팅 "10" 텍스트(task 4) — +/- 버튼으로 조절.
      this.betText = findObj((n) => n.name === '250/50 복사') as Phaser.GameObjects.Text | undefined;
      this.betText?.setText(String(this.spinBet));
      // ⭐하단 스핀 보유량 = 250/50 노드에 바인딩(요청: 정확 표시) + 스핀젬 회수 비행 목표.
      const spinNode = findObj((n) => n.name === '250/50') as Phaser.GameObjects.Text | undefined;
      if (spinNode) {
        this.spinText = spinNode;
        this.spinBarX = spinNode.x;
        this.spinBarY = spinNode.y;
      }
      // ⭐하단 내비 배선(요청: 마이호텔 작동) — 홈→로비, 마이호텔→hotel 씬, 카드/친구→준비중 토스트.
      const wireNav = (key: string, onTap: () => void): void => {
        const o = findObj((n) => (n.key ?? '') === key) as Phaser.GameObjects.Image | undefined;
        if (!o) return;
        const sx = o.scaleX;
        const sy = o.scaleY;
        o.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          this.sfx?.play('click', 0.5);
          this.tweens.add({ targets: o, scaleX: sx * 0.9, scaleY: sy * 0.9, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
          onTap();
        });
      };
      wireNav('up_NewUI_05-1', () => this.goHome()); // 홈 → 로비
      wireNav('up_NewUI_05-2', () => this.goHotel()); // 마이호텔 → hotel 씬(요청)
      wireNav('up_NewUI_05-3', () => showToast(this, 'CARDS 준비중', { y: DESIGN_H * 0.5 }));
      wireNav('up_NewUI_05-4', () => showToast(this, 'FRIENDS 준비중', { y: DESIGN_H * 0.5 }));
    }

    this.geom = computeGeom(safeDoc);
    this.sfx = new Sfx(this);
    this.slot = new SlotView(this, this.geom.reel, 50);
    this.slot.onReelStop = (last) => {
      this.sfx.play(last ? 'reelStopFinal' : 'reelStop', 0.6);
      if (last) this.fadeSpinLoop(); // 마지막 릴이 멈추는 순간 = 슬롯 정지(뒷부분 기준) → 회전음 페이드아웃
    };
    this.coinBurst = new CoinBurst(this, 250); // 슬롯 위로 솟구쳐 떨어지는 코인(슬롯 프레임보다 앞)
    this.confetti = new Confetti(this, DESIGN_W, DESIGN_H, 1.5); // 대박 축포 — 배경(depth1) 위·UI(depth2+) 아래
    this.board = new BoardView(
      this,
      this.geom.board,
      this.rng,
      (info) => this.onPuzzle(info),
      (steps, combo) => this.onCollectSpecials(steps, combo),
      this.sfx,
      60,
      { x: this.spinBarX, y: this.spinBarY }, // 스핀젬 회수 비행 목표(하단 스핀 카운터)
      () => this.spins >= this.spinBet, // ⭐스핀 부족이면 매칭 차단(스핀이 곧 플레이 자원). canSpin 은 부작용 있어 순수 비교 사용
      () => this.showNoSpins(), // 차단 시 안내
    );
    this.board.setSpinBet(this.spinBet); // 스핀 회수 갯수(+N) 표시용 베팅 전달
    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__board = this.board;
    this.board.setImpactTier(tierForStage(this.currentStageProxy())); // ⭐파워 매치(라인/십자/폭탄) 단계 — 진행도에 비례
    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__setStage = (n: number) => this.board.setImpactTier(tierForStage(n));

    this.createLever(hasLever);
    this.setupHud();
    this.setupSpinRecharge(); // 스핀 시간 충전(코인마스터식) + 카운트다운
    this.setupRewardGauge(); // ⭐단계별 보상 게이지(퍼즐젬 → 중간단계/최종 보상 + 제한시간)
    this.setupInteraction();
    this.setupVerifyToggle();
    this.setupColorGrade();

    // ⭐스테이지(공격/약탈/룰렛)에서 OK → 복귀. RESUME 이벤트가 환경에 따라 안 와 게임이 안 돌아오던 버그 →
    //   Stage1.finish 가 returnFromStage 를 **직접** 호출(멱등). RESUME 이벤트는 폴백.
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.returnFromStage());
    // ⭐로비 PLAY → 게임 진입 부드러운 페이드인(로비 fadeOut 색 26,16,48 과 동일). 재진입(RESUME)은 returnFromStage 가 별도 처리.
    this.cameras.main.fadeIn(280, 26, 16, 48);
  }

  /**
   * 카메라 컬러 그레이드 — 화면 전체를 **미세하게 밝게**(+약간의 채도). 카메라 레벨 postFX 라
   * 합성 후 1패스로 적용되어 슬롯의 per-image geometry 마스크를 깨지 않는다(WebGL 전용, Canvas 면 no-op).
   * 값은 미세 톤업 기준(brightness 1.04 = +4%, saturate 0.06) — 더 밝게/쨍하게는 수치만 키우면 됨.
   */
  private setupColorGrade(): void {
    const cm = this.cameras.main.postFX?.addColorMatrix();
    if (!cm) return; // Canvas 렌더러 등 postFX 미지원 시 건너뜀
    cm.brightness(1.04); // 미세하게 밝게(+4%)
    cm.saturate(0.06, true); // 살짝 채도(누적) — 칙칙함 완화, 과하지 않게
  }

  /**
   * 우측 상단 설정/메뉴 아이콘 → 홈(로비) 화면으로 이동. 누름 피드백 + 페이드 후 lobby 진입.
   * (게임 상태 영속화는 추후 — 현재는 홈 복귀 시 라운드가 초기화된다.)
   */
  private setupMenuButton(btn: Phaser.GameObjects.Image): void {
    btn.setInteractive({ useHandCursor: true });
    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__menuBtn = btn;
    const sx = btn.scaleX;
    const sy = btn.scaleY;
    let going = false;
    btn.on('pointerdown', () => {
      if (going) return; // 중복 진입 방지
      going = true;
      btn.disableInteractive();
      this.sfx?.play('click');
      this.fadeSpinLoop(); // 스핀 중 나가도 회전음이 로비로 새지 않게 정리
      this.tweens.add({
        targets: btn,
        scaleX: sx * 0.88,
        scaleY: sy * 0.88,
        duration: 90,
        yoyo: true,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.cameras.main.fadeOut(220, 26, 16, 48);
          this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('lobby'));
        },
      });
    });
  }

  /** 시티 버튼(up_SC_GO_08) — **다음 목표(시티 업그레이드 비용·진행률)** 안내(목표의식). 누름 바운스 + 클릭음. */
  private setupCityButton(btn: Phaser.GameObjects.Image): void {
    btn.setInteractive({ useHandCursor: true });
    const sx = btn.scaleX;
    const sy = btn.scaleY;
    btn.on('pointerdown', () => {
      this.sfx?.play('click', 0.5);
      this.tweens.add({ targets: btn, scaleX: sx * 0.9, scaleY: sy * 0.9, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
      const cost = cityCost(this.cityLevelNow());
      const ratio = cost > 0 ? this.coins / cost : 1;
      // ⭐P2 almost-there(구매 포인트) — 다음 시티까지 80~99% 면 충전 오퍼(비공격적, 탭 시에만). 그 외엔 진행률 안내.
      if (ratio >= 0.8 && ratio < 1.0 && !isDialogOpen(this)) {
        const pack = SHOP_CATALOG.coins[0]; // 10M 골드 $1.99
        showDialog(this, {
          title: 'ALMOST THERE!',
          message: `A little short on coins for the\nnext city upgrade. Top up now?`,
          buttons: [
            { label: `COINS +${formatCompact(pack.amount)} ${pack.price}`, kind: 'primary', onClick: () => this.buyQuick(pack) },
            { label: 'LATER', kind: 'default' },
          ],
        });
        return;
      }
      const pct = cost > 0 ? Math.min(100, Math.floor(ratio * 100)) : 100;
      showToast(this, `NEXT CITY UPGRADE  ${pct}%`, { color: '#ffd9a0' });
    });
  }

  /**
   * 연출 검증 토글 — 설정(메뉴) 아이콘 바로 아래. ON 이면 슬롯 당첨을 항상 높은 배수(5/10/20/40배 순환)로
   * 강제해 배수별 멀티 웨이브 코인 연출을 매 스핀 확인할 수 있다. ⚠️ 출시 전 제거(클라이언트 강제 당첨).
   */
  private setupVerifyToggle(): void {
    const w = 168;
    const h = 58;
    const x = 1080 - w / 2 - 18; // 우측 정렬(설정 아이콘 열)
    const y = 100 + 87 / 2 + 12 + h / 2; // 설정 아이콘 아래
    const bg = this.add.rectangle(0, 0, w, h, 0x241a3a, 0.92).setStrokeStyle(3, 0xffd34d).setOrigin(0.5);
    const label = this.add
      .text(0, 0, 'FX TEST OFF', { fontFamily: '"Do Hyeon", "Jua", sans-serif', fontSize: '24px', color: '#ffd34d' })
      .setOrigin(0.5);
    const btn = this.add.container(x, y, [bg, label]).setDepth(420).setSize(w, h).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => {
      this.forceBigWin = !this.forceBigWin;
      this.forcedIdx = 0;
      bg.setFillStyle(this.forceBigWin ? 0x2e7d32 : 0x241a3a, 0.92).setStrokeStyle(3, this.forceBigWin ? 0x9bffb0 : 0xffd34d);
      label.setText(this.forceBigWin ? 'FX TEST ON' : 'FX TEST OFF').setColor(this.forceBigWin ? '#d6ffd6' : '#ffd34d');
      this.sfx.play('click');
    });
  }

  /** 애니메이션 슬롯 레버 생성(스프라이트 시트). 당김→복귀(yoyo) 애니 등록. */
  private createLever(has: boolean): void {
    const lev = this.geom.anchors.lever;
    if (!has || !lev) return;
    this.lever = this.add
      .sprite(lev.x, lev.y, LEVER_SHEET_KEY, 0)
      .setDepth(2) // 원래 레버 노드(layer_4)와 동일 — 슬롯기계 본체 뒤
      .setDisplaySize(lev.w, lev.h);
    if (!this.anims.exists('lever_pull')) {
      this.anims.create({
        key: 'lever_pull',
        frames: this.anims.generateFrameNumbers(LEVER_SHEET_KEY, { start: 0, end: LEVER_FRAMES - 1 }),
        frameRate: 26,
        yoyo: true, // 1→8 당겨졌다가 8→1 역순으로 복귀
        repeat: 0,
      });
    }
  }

  /** 슬롯이 돌기 직전 레버를 당겼다 올린다(+당기는 소리 — 퍼즐/슬롯 양 모드 공통). */
  private playLever(): void {
    this.lever?.play('lever_pull');
    this.sfx?.play('lever', 0.5);
  }

  /**
   * 열기구(배경 하늘, depth2) — **아주 느린 사선 드리프트**(요청 2026-06-24).
   *   범위: 좌우=중앙기준 60%(x 20~80%), 세로=중앙기준 80%(y 10~90%).
   *   속도: 이전의 ~30% 수준(세로 ~47px/s). 사선으로 떠올랐다 사선으로 내려오는 동작 무한 반복.
   *   x·y 주기를 살짝 다르게 둬 사선 방향이 자연스럽게 변하는 유동(좌하↔우상 등).
   */
  private setupBalloon(balloon: Phaser.GameObjects.Image): void {
    const xL = DESIGN_W * 0.2; // 216 — 좌우 60% 범위의 좌측
    const xR = DESIGN_W * 0.8; // 864 — 우측
    const yT = DESIGN_H * 0.1; // 240 — 세로 80% 범위의 위
    const yB = DESIGN_H * 0.9; // 2160 — 아래
    balloon.setPosition(xL, yB); // 좌하단에서 시작 → 사선으로 떠오름
    // 세로: 떠올랐다 내려옴(아주 느림 ≈ 이전 속도의 30%).
    this.tweens.add({ targets: balloon, y: yT, duration: 41000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // 좌우: 약간 다른 주기 → 사선 방향이 자연스럽게 변하는 유동(60% 범위).
    this.tweens.add({ targets: balloon, x: xR, duration: 47000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /**
   * 회전음(루프)만 볼륨↓ 페이드아웃 — 마지막 릴이 멈추는 순간(슬롯 정지 = 뒷부분) 기준.
   * ⚠️ 윈/잭팟 팡파르 등 일회성 음은 여기서 건드리지 않는다(절대 끊기지 않게 끝까지 재생).
   */
  private fadeSpinLoop(): void {
    if (this.spinLoop) {
      this.sfx.fadeStop(this.spinLoop, 240);
      this.spinLoop = null;
    }
  }

  // ── HUD ────────────────────────────────────────────────
  private text(x: number, y: number, value: string, size: number, color: string, font = 'Do Hyeon'): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, value, { fontFamily: `"${font}", "Jua", sans-serif`, fontSize: `${size}px`, color })
      .setOrigin(0.5)
      .setDepth(200);
  }

  /** 점수용 디자인체 텍스트 — 큰 폰트 + 두꺼운 외곽선 + 그림자(가독성·게임 느낌). */
  private scoreText(x: number, y: number, value: string, size: number, color: string): Phaser.GameObjects.Text {
    const t = this.add
      .text(x, y, value, {
        fontFamily: '"Do Hyeon", "Jua", sans-serif',
        fontSize: `${size}px`,
        color,
        stroke: '#2a1640', // 진한 다크 퍼플 아웃라인 — 밝은 금/노랑/하늘색 글자가 파란 패널 위에서 또렷하게
        strokeThickness: Math.max(5, Math.round(size * 0.2)),
      })
      .setOrigin(0.5)
      .setDepth(200);
    t.setShadow(0, 4, 'rgba(0,0,0,0.6)', 7, false, true);
    return t;
  }

  private setupHud(): void {
    const a = this.geom.anchors;
    // ⭐헤더 = main_copy grp_4 노드(코인 텍스트/햄버거)에 create 에서 바인딩 완료 — 구 buildHudHeader(중복 바) 제거(task 1).

    // 베팅 "10" 초기 표시(task 4) + 좌우 +/- 버튼.
    this.updateBetText();
    this.buildBetButtons();
    // 일일 지급 안내 텍스트(현재 숨김 — 250/50 재생 UI 는 후속 P5). updateRechargeText 가 참조하므로 생성만 보장.
    this.rechargeText = this.text(this.spinBarX, this.spinBarY + 44, '', 17, '#cfe8ff').setVisible(false);

    // ⭐주요 정보창(요청) = MATCH=1SPIN 배너 위치(tt, 릴 아래). idle=matchImg("MATCH=1SPIN"),
    //   매치 시 이 메시지를 값으로 대치: 퍼즐 ×N → 슬롯 ×M(순차) → 최종 당첨금(롤링, **다음 턴 시작까지 유지**).
    const tt = a.titleText ?? a.title ?? { x: 540, y: 1056, w: 457, h: 65 };
    if (this.textures.exists('up_SC_UI_07-1')) {
      this.matchImg = this.add.image(tt.x, tt.y, 'up_SC_UI_07-1').setDisplaySize(tt.w, tt.h).setDepth(100);
    }
    this.infoLeft = new FancyNumber(this, tt.x, tt.y, 58, 221, tt.w * 1.5); // 퍼즐/슬롯 배수 순차(라벨 포함)
    this.infoLeft.setAlpha(0);
    this.finalScoreText = new FancyNumber(this, tt.x, tt.y, 74, 222, tt.w * 1.5); // 최종 당첨금(롤링)
    this.finalScoreText.setAlpha(0);
    // 미션 시작/종료 메시지(같은 배너 자리). 표시 중 MATCH=1SPIN 숨김. (게이지 미배치 시 미발동)
    this.missionBannerMaxW = tt.w * 0.92;
    this.missionBannerText = this.add
      .text(tt.x, tt.y, '', { fontFamily: '"Luckiest Guy", "Do Hyeon", sans-serif', fontSize: '46px', color: '#ffe27a', stroke: '#2a1640', strokeThickness: 8, align: 'center' })
      .setOrigin(0.5)
      .setDepth(230)
      .setVisible(false);
    this.missionBannerText.setShadow(0, 4, 'rgba(0,0,0,0.6)', 7, false, true);
    // playingText: 배너 idle 은 matchImg 가 담당 → 비가시(hidePlaying/beginRound 호환용 생성만).
    this.playingText = this.scoreText(tt.x, tt.y, '', 24, '#ffe9b8').setVisible(false);
    // 대박 카운트업 숫자(코인 드랍 영역) — 기본 숨김.
    this.bigWinNum = new BigNumber(this, 540, 700, 120, 320);
    this.bigWinNum.setAlpha(0);
    this.refreshHud();
  }

  /** 하단 베팅 "10" 텍스트를 현재 spinBet 으로 갱신(task 4). */
  private updateBetText(): void {
    this.betText?.setText(String(this.spinBet));
  }

  /** 베팅 "10" 좌우 조절(task 4) — ⭐요청: **이미지(디자이너 바 아트)의 +/- 버튼을 사용**, 새 버튼 그리지 않음.
   *   베팅 바(up_NewUI_06-3, "10" 노드) 좌우 끝에 **투명 히트존**만 얹어 아트의 +/- 를 눌러 조절한다. */
  private buildBetButtons(): void {
    const bx = this.betText?.x ?? 537;
    const by = this.betText?.y ?? 2087;
    const hit = (x: number, dir: number): void => {
      this.add
        .rectangle(x, by, 80, 92, 0x000000, 0)
        .setDepth(300)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.adjustBetLadder(dir));
    };
    hit(bx - 96, -1); // − (아트의 좌측 버튼)
    hit(bx + 96, +1); // + (아트의 우측 버튼)
  }

  private fmt(n: number): string {
    return Math.max(0, Math.round(n)).toLocaleString('en-US');
  }

  private refreshHud(): void {
    this.coinText.setText(this.fmt(this.coins));
    this.fitCoinText(); // ⭐자릿수 많아지면 코인 폰트 축소(요청)
    this.refreshSpinHolding(); // 하단 스핀 보유량(현재/레벨기본) 갱신
    saveCoins(this.coins); // ⭐공유 지갑 영속 — My Hotel(HotelScene) 업그레이드가 같은 잔액을 본다
    this.savePlayer(); // ⭐스핀·베팅·잭팟 영속(재시작 시 리셋 방지, 요청) — refreshHud 가 공통 상태변경 길목
    // (잭팟 배너 폐기 — 최종 당첨금은 finalScoreText 가 상단 배너에 표시. 코인은 헤더에 표시.)
  }

  /** 진행 상태(스핀·베팅·잭팟) 영속 — refreshHud 에서 호출(상태변경 공통 길목). coins/XP/미션은 각자 영속. */
  private savePlayer(): void {
    savePlayerState({ spins: this.spins, betIndex: this.betIndex, jackpotPool: this.jackpotPool });
  }

  /** 코인(골드) 숫자가 슬롯 폭을 넘으면 폰트를 줄여 맞춘다(요청). 기본 폰트에서 폭 비율로 축소(최소 16). */
  private fitCoinText(): void {
    if (!this.coinText) return;
    const maxW = 330; // 헤더 코인 슬롯 가용 폭(우측고정 x493 → 코인 아이콘 사이). 넘으면 폰트 축소
    this.coinText.setFontSize(this.coinFontBase);
    const w = this.coinText.width;
    if (w > maxW) {
      this.coinText.setFontSize(Math.max(16, Math.floor((this.coinFontBase * maxW) / w)));
    }
  }

  /** 헤더 메뉴(햄버거) → 설정 팝업(사운드 토글 + 데이터 편집 + 홈으로). 데이터 편집 후 in-memory 코인/스핀 재동기화. */
  private openMenu(): void {
    this.sfx?.play('click', 0.5);
    openSettingsMenu(this, {
      onHome: () => this.goHome(),
      homeLabel: 'HOME',
      onDataChanged: () => {
        // ⚠️편집은 storage 를 바꾸므로 in-memory 를 재동기화해야 이후 refreshHud(=savePlayer)가 덮어쓰지 않는다.
        this.coins = loadCoins();
        this.spins = loadSpins();
        this.refreshHud();
      },
    });
  }

  /** 홈(로비)로 복귀 — 헤더 설정 햄버거 등에서 호출. 회전음 정리 + 페이드아웃 후 전환. */
  private goHome(): void {
    this.sfx?.play('click', 0.6);
    this.fadeSpinLoop();
    this.cameras.main.fadeOut(220, 26, 16, 48);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('lobby'));
  }

  /** ⭐마이호텔(hotel 씬)로 이동(요청: 하단 마이호텔 버튼 작동) — 회전음 정리 + 페이드아웃 후 전환. */
  private goHotel(): void {
    this.fadeSpinLoop();
    this.cameras.main.fadeOut(220, 26, 16, 48);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('hotel'));
  }

  // ── 입력 ───────────────────────────────────────────────
  /** SPIN 버튼 누름 표시 — 누르면 상부 cap(안 눌린 모양) 제거 → 하부 base(눌린 모양) 노출. 떼면 cap 복귀. */
  private setSpinPressed(pressed: boolean): void {
    this.spinBtnCap?.setVisible(!pressed); // 누름=상부 제거, 뗌=다시 덮음
    this.spinBtnBase?.setVisible(true); // 하부(눌린 모양)는 항상 표시
  }

  /** 하단 아이템 버튼(아이템1~4) — 누름 피드백(축소 바운스 + 클릭음). 아이템 효과 로직은 추후. */
  private setupItemButtons(layout: ReturnType<typeof buildLayout>): void {
    for (const { obj } of layout.entries().filter((e) => (e.node.name ?? '').startsWith('아이템'))) {
      const img = obj as Phaser.GameObjects.Image;
      const sx = img.scaleX;
      const sy = img.scaleY;
      img.setInteractive({ useHandCursor: true });
      img.on('pointerdown', () => {
        this.sfx?.play('click', 0.5);
        this.tweens.add({ targets: img, scaleX: sx * 0.86, scaleY: sy * 0.86, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
      });
    }
  }

  private setupInteraction(): void {
    const a = this.geom.anchors;
    // 스핀 버튼 & 레버 = **홀드 앤 스핀**: 누르고 있으면 슬롯-우선 라운드(슬롯→AI 자동매치)가 계속 반복,
    //   떼면 멈춤. 짧게 탭하면 1회만 돈다.
    const startHold = (): void => {
      if (this.autoLock) {
        // 잠긴 자동 스핀 중 다시 누르면 정지.
        this.autoLock = false;
        this.holdSpin = false;
        this.updateAutoIndicator();
        this.setSpinPressed(false); // 정지 → 평상시 버튼
        return;
      }
      this.setSpinPressed(true); // 누른 상태 버튼(SC_UI_11-2)
      this.sfx.play('spinButton', 0.6);
      this.pointerDown = true;
      this.holdSpin = true;
      this.holdTimer?.remove();
      this.holdTimer = this.time.delayedCall(2000, () => {
        if (this.pointerDown) {
          this.autoLock = true; // 2초 이상 누르고 있으면 잠금 → 떼도 계속.
          this.updateAutoIndicator();
        }
      });
      void this.autoSpinLoop();
    };
    const stopHold = (): void => {
      this.pointerDown = false;
      // ⭐오토(autoLock) 작동 중이면 손을 떼도 버튼은 **눌린 상태 유지**, 아니면 평상시로.
      this.setSpinPressed(this.autoLock);
      if (!this.autoLock) {
        this.holdTimer?.remove();
        this.holdSpin = false; // 2초 전에 떼면 정지.
      }
      // autoLock 이면 holdSpin 유지(떼도 계속 스핀).
    };
    for (const z of [a.spin, a.lever]) {
      if (!z) continue;
      const zone = this.add.rectangle(z.x, z.y, z.w || 120, z.h || 80, 0x000000, 0).setDepth(210);
      zone.setInteractive({ useHandCursor: true });
      zone.on('pointerdown', startHold);
    }
    this.input.on('pointerup', stopHold);
    this.input.on('pointerupoutside', stopHold);
    this.input.on('gameout', stopHold);

    // 베팅 조절은 buildBetButtons(setupHud)의 하단 "10" 좌우 −/+ 버튼이 담당(task 4).
  }

  /** 베팅 사다리 단계 이동(◀=-1 / ▶=+1). 양끝에서 멈춤. 변경 시 숫자 재렌더 + 클릭음. */
  private adjustBetLadder(dir: number): void {
    const next = Math.max(0, Math.min(BET_LADDER.length - 1, this.betIndex + dir));
    if (next === this.betIndex) return;
    this.betIndex = next;
    this.spinBet = BET_LADDER[next]; // 에너지(스핀 소모·특수젬 보상)
    this.bet = this.spinBet * COIN_DENOM; // 코인 베팅(골드 큰 단위) = 에너지 × 단위스케일
    this.board?.setSpinBet(this.spinBet); // 스핀 회수 갯수(+N) 표시용 베팅 갱신
    this.sfx?.play('click', 0.5);
    this.updateBetText(); // 하단 "10" 텍스트 갱신(task 4)
    this.refreshHud(); // 베팅 변경 반영(자동충진 폐지 — 스핀<베팅이면 그 베팅으론 플레이 불가, 낮추면 됨)
  }

  // ── 라운드 흐름 ────────────────────────────────────────
  /** 퍼즐-우선: 보드 매치 → 슬롯 1회 → 합산. (boardView 가 매치 시 호출) */
  /**
   * ⭐파워 매치 티어 산출용 "진행도" 프록시 — 지금은 **호텔 총 레벨**(현재 존재하는 진행 신호)을 사용한다.
   *   (향후 500스테이지 시스템이 생기면 실제 스테이지 번호로 교체.) 저장 없으면 신규 상태(최저 진행).
   */
  private currentStageProxy(): number {
    // ⭐스테이지 누적 진행도 = totalLevel + (스테이지−1)×20 → 스테이지가 넘어가도(레벨 리셋) 임팩트 티어가 줄지 않고 계속 상승.
    const proxy = (s: HotelState): number => totalLevel(s) + (currentStage(s) - 1) * 20;
    try {
      return proxy(deserializeHotel(localStorage.getItem(HOTEL_SAVE_KEY)) ?? createHotelState());
    } catch {
      return proxy(createHotelState());
    }
  }

  /** ⭐현재 시티레벨 L(=누적 호텔 업그레이드 수, 0..20). 코인획득 배수·미션목표·다음목표 비용의 입력. */
  private cityLevelNow(): number {
    try {
      const state = deserializeHotel(localStorage.getItem(HOTEL_SAVE_KEY)) ?? createHotelState();
      return cityLevel(state);
    } catch {
      return 0;
    }
  }

  /** 시티 성장 코인획득 배수 M(L) — 코인 엔진(슬롯×퍼즐 당첨)에 곱(L0=×1, 성장할수록↑·캡). */
  private incomeMultNow(): number {
    return incomeMultiplier(this.cityLevelNow());
  }

  private onPuzzle(info: ResolvedInfo): void {
    this.pace = recordMatch(this.pace, this.time.now); // ⭐매치 페이스 기록(연속 매치가 빠를수록 슬롯 가속)
    // ⭐매치 = 스핀 연료 생산(요청: 특수젬 제거 → 스핀은 매치가 생산). 라운드가 spinBet 를 소모하므로 그 이상 지급 = 순증(연료 축적).
    this.grantSpins(this.spinBet + Math.max(1, Math.ceil(info.cleared / 4)));
    this.scoreQueue.push(info.puzzleMult);
    void this.playRounds();
  }

  /**
   * ⭐공격/약탈 발동 **조기 통지**(boardView 가 연쇄 애니 **직전** = 젬이 커지기 시작하는 순간 호출) — [공격, 약탈, 스핀].
   *   발동 배너("ATTACK!/RAID!")를 **젬 확대와 동시에** 띄우고 pendingStage 를 예약한다. 배너는 자동소멸 없이
   *   슬롯 회전 완결까지 떠 있다가 → maybeEnterStage(망치 등장)에서 정리(망치 연출이 텍스트를 이어받음).
   *   조건: 해당 종류 **2개 이상** 매칭(동률이면 공격). 위력 = 베팅 × 매치크기 배수 × 콤보.
   */
  private onStageTrigger(_steps: number[][], _combo: number): void {
    // ⭐2026-07-02 재설계: 어택(망치)/레이드(금화)는 **슬롯 3매치**로 이전(showSlotResult). 보드 스페셜 젬 트리거 폐지.
    //   (퍼즐 매치는 스핀 연료만 생산 — 스핀 젬 회수는 onCollectSpecials 가 계속 담당.)
    //   TODO(P5): boardView 의 어택/레이드 스페셜 젬 스폰 자체를 비활성(스핀 젬만 유지)해 죽은 젬 제거.
  }

  /**
   * 스핀 젬 보상 처리(boardView 가 연쇄 **종료 후** 호출 — 스핀젬 GO 회수 비행 도착에 맞춤).
   *   ⭐스핀 환급 = spinBet × spinRefundMult(매칭수): 1~2 = ×1(베팅숫자), 3+ = 배수. 콤보 미적용 — 소모<지급 = 순감소.
   *   (공격/약탈 발동·배너는 onStageTrigger 가 연쇄 직전에 이미 처리.)
   */
  private onCollectSpecials(steps: number[][], _combo: number): void {
    let spinReward = 0;
    for (const step of steps) {
      const s = step[SPECIAL_SPIN] ?? 0;
      // ⭐회수 = spinBet(N) × spinRefundMult(s) = N×s×max(1,s-1). 1→N·2→2N·3→6N·4→12N·5→20N(6+ 상한).
      if (s > 0) spinReward += this.spinBet * spinRefundMult(s);
    }
    if (spinReward > 0) {
      this.grantSpins(spinReward);
      this.sfx?.play('coin', 0.5);
      // 베팅·매치 반영 보상액(+N)을 스핀젬 비행 도착 즈음 카운터 위에 팝.
      this.time.delayedCall(300, () => this.spinGainPopup(spinReward));
    }
  }

  /**
   * ⭐예약된 공격/약탈로 전환(요청) — **슬롯결정이 난 뒤** 호출. 커튼 전환 순서(요청 2026-06-26):
   *   ① 망치 임팩트 연출(HammerFxScene, **최상위 오버레이**)을 띄운다 — 망치 등장 + **커튼이 좌우에서 닫혀** 보드를 덮음.
   *   ② 닫힌 커튼 뒤에서 Stage1 을 띄운다(`skipReveal` — 자체 찢기 생략, 커튼이 가림).
   *   ③ 커튼이 **좌우로 열리며** Stage1(공격 스테이지)을 드러낸다 = "스테이지로 이동". hammerfx 는 update 마다 bringToTop 으로
   *      스테이지 위까지 떠 있고, 망치는 스테이지 위에서 **아래로 약간 축소되며 스스로 소멸**(self-exit).
   */
  private maybeEnterStage(): void {
    if (!this.pendingStage || this.stageActive) return;
    // ⭐슬롯 회전이 끝나기 전에는 스테이지(망치/커튼) 진입 금지(요청 2026-06-26) — 아직 릴이 돌고 있으면 멈출 때까지 대기 후 재시도.
    if (this.slot.isBusy) {
      this.time.delayedCall(60, () => this.maybeEnterStage());
      return;
    }
    const stage = this.pendingStage;
    this.pendingStage = undefined;
    this.stageActive = true;
    if (this.gaugeStageStartedMs == null) this.gaugeStageStartedMs = Date.now(); // ⭐폴백 — 보통 onStageTrigger(발동 시점)에서 이미 설정됨(여기서 덮어쓰면 배너+슬롯 시간이 누락되니 null 일 때만)
    this.fadeSpinLoop(); // 릴 루프음 정리
    // 떠 있던 텍스트 배너는 hammerfx 가 망치 앞에 동일하게 다시 그리므로 페이드아웃해 정리(중복 방지).
    const banner = this.activationBanner;
    this.activationBanner = undefined;
    if (banner) this.tweens.add({ targets: banner, alpha: 0, duration: 240, ease: 'Quad.easeIn', onComplete: () => banner.destroy() });
    // ① 망치 + 커튼 등장(최상위 오버레이 — hammerfx.update 가 bringToTop).
    const c = this.bannerCenter();
    this.scene.launch('hammerfx', { type: stage.type, mult: stage.power, x: c.x, y: c.y });
    // ② 커튼이 닫힌 사이 Stage1 을 띄운다(skipReveal=자체 reveal 생략 → 커튼 열림이 곧 등장).
    this.time.delayedCall(STAGE_BEHIND_CURTAIN_MS, () => {
      if (!this.stageActive) return; // 방어(이미 빠져나옴)
      // ⭐룰렛 스테이크(베이스) = **통화별 분기**(요청 2026-07-01: 어택=스핀 / 레이드=코인). 같은 휠 배수가 곱해지고, 통화만 다르다.
      //   • 레이드(코인): betCoin × M(L) × raidScale — 인플레이 코인과 동일하게 진행도(시티레벨)에 비례(데이터 승급구조 추종).
      //   • 어택(스핀): spinBet × attackScale — **소단위 화폐**라 COIN_DENOM·레벨 미적용, 베팅에만 비례(인플레 안전).
      //   auto=오토스핀 중 자동.
      const stake =
        stage.type === 'attack'
          ? Math.round(this.spinBet * attackSpinStakeScaleNow())
          : Math.round(this.bet * this.incomeMultNow() * raidStakeScaleNow());
      this.scene.launch('stage1', { type: stage.type, power: stage.power, bet: stake, resumeKey: this.scene.key, skipReveal: true, auto: stage.auto }); // ⭐예약 시 고정한 auto 사용(중간 정지에도 자동 복귀 보장)
      // 커튼이 열리는 동안 보드는 가려져 있으니 잠시 뒤 일시정지(망치는 스테이지 위에서 스스로 소멸 → 여기서 stop 안 함).
      this.time.delayedCall(260, () => {
        if (!this.stageActive) return;
        this.scene.pause();
      });
    });
  }

  /** ⭐일일 스핀 지급(요청 2026-06-28) — **연속 자동충전 폐지**. 하루 1회 로그인 시 DAILY_SPINS 지급. 그 외엔 순소모(리그 보상은 추후 결합). */
  private setupSpinRecharge(): void {
    let last = '';
    let today = '';
    try {
      today = new Date().toISOString().slice(0, 10);
      last = localStorage.getItem(DAILY_SPIN_KEY) ?? '';
    } catch {
      today = ''; // localStorage 불가 환경 — 지급 생략(안전)
    }
    if (today && last !== today) {
      // ⭐첫 실행(기록 없음)은 **초기 스핀(START_SPINS=200)이 곧 시작 지급분** → 일일 보너스 중복 지급 금지(요청: 초기 200 유지).
      //   날짜만 기록해 **다음날부터** 일일 보너스가 들어오게 한다. 복귀 플레이어(이전 날짜 기록 있음)는 새 날에 정상 지급.
      if (last !== '') {
        this.grantSpins(DAILY_SPINS);
        showToast(this, `DAILY BONUS!  +${DAILY_SPINS} SPINS`, { color: '#9bff7a', y: DESIGN_H * 0.26 });
      }
      try {
        localStorage.setItem(DAILY_SPIN_KEY, today);
      } catch {
        /* ignore */
      }
    }
    this.updateRechargeText();
  }

  private updateRechargeText(): void {
    if (!this.rechargeText) return;
    this.rechargeText.setText(`일일 +${DAILY_SPINS}`); // 연속 카운트다운 폐지 → 일일 지급 안내
  }

  // ── 보상 미션 게이지(DAKA 아래 가로 바) ──────────────────────────────
  /** ⭐2026-07-02 요청: 미션보상 게이지를 main_copy **슬롯게이지 영역(DAKA 아래)** 에 정밀 배치.
   *   구성: 타겟 아이콘(03-2, 수집 대상) · 진행 바(03-3, 좌→우 채움) · "현재/목표"(신설 텍스트) · 제한시간(00:02:15 노드) · 보상 배지(03-8, 스핀).
   *   진행 바 노드 없으면 미배치(구 화면 호환). RewardGaugeView 는 **가로형(horizontal)** 으로 생성. */
  private buildGaugeView(layout: ReturnType<typeof buildLayout>): RewardGaugeView | undefined {
    const entries = layout.entries();
    const byKey = (k: string): Phaser.GameObjects.GameObject | undefined => entries.find((e) => e.node.key === k)?.obj;
    const byId = (id: string): Phaser.GameObjects.GameObject | undefined => entries.find((e) => e.node.id === id)?.obj;
    const fillBar = byKey('up_NewUI_03-3') as Phaser.GameObjects.Image | undefined; // 진행 바(핑크)
    if (!fillBar) return undefined; // 게이지 노드 없음 → 미배치(구 main.json 호환)
    const collectGem = byKey('up_NewUI_03-2') as Phaser.GameObjects.Image | undefined; // 타겟 아이콘(수집 대상 — 미션마다 교체)
    const finalBadge = byKey('up_NewUI_03-8') as Phaser.GameObjects.Image | undefined; // 보상 배지(스핀)
    // ⭐게이지 텍스트는 **디자이너 노드**(에디터 폰트/색/크기)에 바인딩 — 코드가 새로 만들지 않음(중복 텍스트 방지, 요청).
    const timerText = byId('layer_12_copy8') as Phaser.GameObjects.Text | undefined; // "02:15"(Fredoka, 제한시간)
    const currentText = byId('layer_15') as Phaser.GameObjects.Text | undefined; // "50/300"(Luckiest Guy, 현재/목표)
    const finalText = byId('layer_15_copy') as Phaser.GameObjects.Text | undefined; // "120"(보상 스핀량)
    // ⭐게이지 바는 **디자이너 배치 크기 그대로**(요청: 좌우로 임의 늘리기 금지). 채움은 네이티브 폭 안에서 진행.
    //   (바를 보상 위치까지 늘리려면 에디터에서 03-3 노드 크기를 조정하면 코드가 그 크기를 그대로 읽는다.)
    const nodes: GaugeNodeRefs = { fillBar, currentText, timerText, collectGem, finalBadge, finalText };
    this.collectGemImg = collectGem; // 미션마다 타겟 아이콘 텍스처 교체(applyGaugeGem)
    if (collectGem) this.gaugeTargetPt = { x: collectGem.x, y: collectGem.y }; // 수집 코인 비행 목표
    this.milestoneBadgeImg = undefined; // 중간 보상 미사용
    this.finalBadgeImg = finalBadge; // 최종 보상 비행 시작점
    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__resetGauge = () => this.resetGauge();
    return new RewardGaugeView(this, nodes, GAUGE_CONFIG, true); // horizontal=true
  }

  /** 보상 게이지 **완전 리셋**(테스트용 — DEV 헤더 탭). 진행 0 + 첫 젬으로 + 표시/영속 갱신. */
  private resetGauge(): void {
    if (!this.gaugeView) return;
    this.missionIndex = 0; // 첫(쉬운) 미션으로
    this.rebuildGaugeConfig(); // 젬0 + 첫 목표
    this.gaugeState = createGaugeState(Date.now());
    this.applyGaugeGem(); // 보드 수집타입 + 아이콘 갱신
    this.saveGauge();
    this.renderGauge(Date.now(), false);
    this.floatLabel('🔄 GAUGE RESET', '#9bff7a');
  }

  /** 게이지 로직 연결 — 상태/미션젬 로드 + 보드 수집 싱크 + 초기 표시 + 1초 타이머. */
  private setupRewardGauge(): void {
    if (!this.gaugeView) return;
    const now = Date.now();
    this.missionIndex = Math.max(0, this.loadMissionIndex());
    this.rebuildGaugeConfig();
    const saved = deserializeGauge(this.loadGaugeRaw());
    if (saved && saved.claimed.includes(this.gaugeCfg.milestones.length)) {
      // ⭐**완료(최종 보상 수령)된 채 저장된 상태로 재진입** = 완료 후 15초 간격 도중 씬 재시작(홈/시티/레이드/탭닫힘/HMR)으로
      //   advanceGaugeMission 을 놓친 경우. 그대로 두면 tickGauge 가 claimed 때문에 멈춰 **완료 화면에서 영구 정지**(다음 미션 안 옴)되거나
      //   만료 시 같은 미션을 반복한다(= "미션 진행이 가끔 고장"). → 여기서 **즉시 다음 미션으로 진행**시켜 복구한다.
      this.missionIndex += 1;
      this.rebuildGaugeConfig();
      this.gaugeState = createGaugeState(now);
      this.saveGauge(); // 복구를 영속(중복 advance 방지 — 다음 로드 땐 claimed 비어 해당 안 됨)
    } else {
      const alive = !!saved && !isExpired(this.gaugeCfg, saved, now);
      // ⭐만료/없음 → 보상 소멸 + **같은 미션** 재도전(요청: 미달성 시 보상만 사라지고 미션단계는 유지). alive 면 진행 이어감.
      this.gaugeState = alive ? (saved as RewardGaugeState) : createGaugeState(now);
    }
    this.applyGaugeGem(); // 보드 수집타입 + 게이지 아이콘 + 코인 비행 목표
    this.saveGauge();
    // ⭐보상미션 = **젬 수집 미션**(요청 2026-06-28): 진행 = **수집 젬 수 × 베팅**(요청 "10베팅·3젬=30수집").
    //   ⭐베팅을 곱하면 300스핀 예산당 진행량이 **베팅과 무관하게 ≈278로 일정**(베팅↑=라운드당 진행↑·300스핀이 사는 라운드↓ 상쇄)
    //   → "300스핀 기준" 목표 calibrate 가 모든 베팅에서 성립. 목표치(MISSION_PLAN.target)도 이 단위(젬×베팅).
    this.board.setGemSink((collected) => this.addGaugeProgress(collected * Math.max(1, this.spinBet)));
    // ⭐공격/약탈 발동 배너를 **젬 확대와 동시에** 띄우는 조기 통지(연쇄 애니 직전). 보상(스핀)은 onCollect 가 별도 처리.
    this.board.setStageTrigger((steps, combo) => this.onStageTrigger(steps, combo));
    this.board.setOnPlayerMove(() => this.armGaugeTimer()); // ⭐첫 퍼즐 조작 때 미션 타이머 시작(요청: 조작 전엔 정지)
    this.gaugeTimerArmed = false; // 첫 미션도 첫 조작 대기로 시작
    this.renderGauge(now, false);
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickGauge() }); // 1초 카운트다운(씬 종료 시 자동 정리)
  }

  /** ⭐현 미션 설정 재계산 — 미션 플랜(루프) + **시티레벨로 목표 스케일**(progression.missionTarget). 진행할수록 미션도 무거워짐. */
  private rebuildGaugeConfig(): void {
    this.currentGemType = GAUGE_GEM_CYCLE[this.missionIndex % GAUGE_GEM_CYCLE.length];
    const base = missionConfig(this.missionIndex); // 기준(시간 10→60분 루프 + 스핀↔코인 보상)
    this.gaugeCfg = { ...base, target: missionTarget(base.target, this.cityLevelNow()) }; // 목표 = 기준 × (1 + δ·L)
  }

  /** 보상 금액 표시 문자열 — 코인은 축약(500K·3M), 스핀은 풀숫자. */
  private rewardText(reward: GaugeReward): string {
    return reward.kind === 'coins' ? formatCompact(reward.amount) : String(reward.amount);
  }

  /** 게이지 표시 갱신(비율/현재/타이머 + 최종보상 금액·아이콘). animate=false 면 즉시.
   *  ⭐미션 완료(최종 보상 수령 후 claimed) 상태에서는 ratio=0 강제(returnFromStage 가 renderGauge 를 호출해
   *  fillRatio=1.0 으로 재충전하던 버그 수정 — onAllArrived 가 이미 비운 뒤 1.0 으로 덮어쓰면 15초 내내 꽉 찬 상태 유지). */
  private renderGauge(now: number, animate = true): void {
    if (!this.gaugeView) return;
    const finalClaimed = this.gaugeState.claimed.includes(this.gaugeCfg.milestones.length);
    this.gaugeView.setRatio(finalClaimed ? 0 : fillRatio(this.gaugeCfg, this.gaugeState), animate);
    this.gaugeView.setCounts(this.gaugeState.progress, this.gaugeCfg.target);
    this.gaugeView.setTimer(remainingMs(this.gaugeCfg, this.gaugeState, now));
    const rw = this.gaugeCfg.finalReward; // 미션마다 보상·종류(스핀/코인) 반영 — 금액 + 배지 아이콘 전환
    this.gaugeView.setFinalReward(this.rewardText(rw), rw.kind === 'coins' ? REWARD_COIN_ICON : REWARD_SPIN_ICON);
  }

  /** 매 매치 → 수집 코인 가산 → 도달 보상 지급(중간단계/최종) → 표시/영속. **최종 도달 = 미션 완료 → 다음 젬**. */
  private addGaugeProgress(delta: number): void {
    if (!this.gaugeView) return;
    // ⭐마감 직후~다음 1초 틱 사이에 들어온 매치는 **이미 만료된 사이클** → 보상 지급 X(요청: 시간 내 미달성 = 보상 소멸).
    //   단, 마감 직전 완료(최종 보상 이미 수령)였다면 몰수하지 않는다(완료는 시각과 무관하게 유효).
    const now = Date.now();
    const finalClaimed = this.gaugeState.claimed.includes(this.gaugeCfg.milestones.length);
    if (!finalClaimed && isExpired(this.gaugeCfg, this.gaugeState, now)) {
      this.forfeitGauge(now);
      return;
    }
    this.gaugeState = addProgress(this.gaugeState, delta);
    const due = dueRewards(this.gaugeCfg, this.gaugeState);
    let completed = false;
    for (const i of due) {
      this.grantGaugeReward(rewardAt(this.gaugeCfg, i), i);
      this.gaugeView.popReward(i);
      if (i === this.gaugeCfg.milestones.length) completed = true; // 최종 보상 = 미션 완료
    }
    if (due.length) this.gaugeState = claim(this.gaugeState, due);
    this.gaugeView.setRatio(fillRatio(this.gaugeCfg, this.gaugeState));
    this.gaugeView.setCounts(this.gaugeState.progress, this.gaugeCfg.target);
    this.saveGauge();
    if (completed) {
      this.sfx?.play('missionSuccess', 0.95); // ⭐미션 성공 음악(요청 — 폭탄 실패와 대비되는 밝은 상승 멜로디). 카운트다운 비프는 최종 수령 후 tickGauge 가 멈춤.
      // ⭐배너에 **순차 표시**(요청): ① 미션 완료 → ② 받은 보상. 별도 토스트 없음(grantGaugeReward 의 토스트 제거).
      const rw = this.gaugeCfg.finalReward;
      this.showMissionBanner('MISSION COMPLETE!', '#ffe27a');
      this.showMissionBanner(`+${this.fmt(rw.amount)} ${rw.kind === 'coins' ? 'COINS' : 'SPINS'}`, '#9bff7a');
      this.gaugeView.setTargetCleared(true); // ⭐목표 시간·카운트·타겟 퍼즐 아이콘 지움(요청) — 휴면 간격 동안 유지
      this.board.setCollectGem(-1); // ⭐휴면 중 보드 수집 타겟 해제 — 활성 미션 없으니 어떤 타일도 타겟 아님(코인 비행/적립 정지). advanceGaugeMission 가 복원.
      this.time.delayedCall(MISSION_GAP_MS, () => this.advanceGaugeMission()); // ⭐완료 후 **15초 간격**(요청 — 바로 이어가지 않음) 뒤 다음(더 어려운) 미션
    }
  }

  /** ⭐미션 완료 → **다음 젬 + 더 높은 목표**(점진 난이도, 요청). */
  private advanceGaugeMission(): void {
    if (!this.gaugeView) return;
    this.missionIndex += 1;
    this.rebuildGaugeConfig(); // 젬 다음으로 + 목표 +스텝
    this.gaugeState = createGaugeState(Date.now());
    this.gaugeTimerArmed = false; // ⭐새 미션 — 첫 퍼즐 조작 전엔 타이머 정지(요청)
    this.applyGaugeGem(); // 보드 수집타입 + 게이지 아이콘 갱신
    this.gaugeView.setTargetCleared(false); // ⭐지웠던 목표 시간/아이템 복원(새 미션 시작)
    this.saveGauge();
    this.renderGauge(Date.now(), false);
    // ⭐미션 시작 메시지(요청) — 상단 419 배너에 영문 표시. 15초 간격 뒤 새 미션 시작 알림.
    this.showMissionBanner('MISSION START!', '#9bff7a');
  }

  /** ⭐타이틀 배너(419 자리)에 메시지를 **순차 표시**(요청: 별도 정보창 없이 이 창에 줄세워 표시 — 미션 완료→보상 등). 큐에 넣고 순서대로. */
  private showMissionBanner(msg: string, color = '#ffe27a'): void {
    if (!this.missionBannerText) {
      showToast(this, msg, { color, durationMs: 2200, y: DESIGN_H * 0.21 }); // 폴백(배너 미생성 시)
      return;
    }
    this.missionBannerQueue.push({ msg, color });
    if (!this.missionBannerActive) this.processBannerQueue();
  }

  /** 배너 큐 1건 표시 → 끝나면 다음(없으면 배너 원복). active 동안 슬롯 당첨 배너는 스킵(중첩 금지). 긴 문구는 폭에 맞춰 축소. */
  private processBannerQueue(): void {
    const t = this.missionBannerText;
    const next = this.missionBannerQueue.shift();
    if (!t || !next) {
      this.missionBannerActive = false; // 큐 비움 → 점유 해제(이후 슬롯 당첨 배너 정상)
      t?.setVisible(false);
      // ⭐MATCH=1SPIN 으로 되돌리지 않음(요청) — 당첨을 본 적 있으면 **직전 당첨금**을 복원, 첫 스핀 전에만 MATCH 표시.
      if (this.bannerShowedWin) {
        this.finalScoreText?.setAlpha(1);
        this.matchImg?.setVisible(false);
      } else {
        this.matchImg?.setVisible(true);
      }
      return;
    }
    this.missionBannerActive = true; // 점유 — 슬롯 당첨 배너 스킵
    this.matchImg?.setVisible(false);
    this.finalScoreText?.setAlpha(0);
    t.setText(next.msg).setColor(next.color).setScale(1).setAlpha(0).setVisible(true);
    if (this.missionBannerMaxW > 0 && t.width > this.missionBannerMaxW) t.setScale(this.missionBannerMaxW / t.width);
    this.missionBannerTween?.remove();
    this.missionBannerTween = this.tweens.add({
      targets: t,
      alpha: { from: 0, to: 1 },
      duration: 200,
      yoyo: true,
      hold: 1900, // ⭐약간 더 길게(요청) ≈2.3s/건 → 완료+보상 2건 ≈ 4.6s(15초 간격 내)
      onComplete: () => this.processBannerQueue(), // 다음 메시지(없으면 원복)
    });
  }

  /** ⭐슬롯 당첨금을 타이틀 배너에 롤링 표시 — 단, **미션 메시지 표시 중이면 중첩 금지로 스킵**(요청: 중요정보 우선·슬롯보상은 충돌 시 패스).
   *  스킵해도 라운드 타이밍 유지를 위해 동일 시간 대기(코인 가산은 호출부에서 별도 진행). */
  private async showSlotWinBanner(win: number, dur: number): Promise<void> {
    // ⭐당첨금은 슬롯 상단 유저정보(DAKA/보유코인) 자리에 표시(task 2). 꽝(0)/미션표시 중엔 DAKA 유지하고 타이밍만 맞춤.
    if (this.missionBannerActive || win <= 0) {
      await this.wait(dur);
      return;
    }
    // ⭐순차 마무리(요청): 슬롯 배수 표시를 비우고 → 같은 배너 자리에 **합산 최종 당첨금** 롤링(다음 턴까지 유지).
    this.infoLeft.setAlpha(0);
    this.matchImg?.setVisible(false);
    this.bannerShowedWin = true;
    await this.rollNumber(this.finalScoreText, '', win, dur);
  }

  /** 현재 미션 젬을 **보드 수집타입 + 게이지 아이콘 + 코인 비행 목표**에 반영. */
  private applyGaugeGem(): void {
    this.board.setCollectGem(this.currentGemType);
    if (this.gaugeTargetPt) this.board.setGaugeTarget(this.gaugeTargetPt);
    const key = PUZZLE_TILE_KEYS[this.currentGemType] ?? PUZZLE_TILE_KEYS[0];
    const gem = this.collectGemImg;
    if (gem && this.textures.exists(key)) {
      const dw = gem.displayWidth;
      const dh = gem.displayHeight;
      gem.setTexture(key).setDisplaySize(dw, dh);
    }
  }

  /** ⭐보상 지급 — 보상 배지에서 아이콘이 카운터로 날아가 확보(요청). **스핀=스핀카운터·코인=헤더 코인**(번갈아 보상). */
  private grantGaugeReward(reward: GaugeReward, index: number): void {
    const badge = index < this.gaugeCfg.milestones.length ? this.milestoneBadgeImg : this.finalBadgeImg;
    const fx = badge?.x ?? 120;
    const fy = badge?.y ?? 620;
    const isFinal = index === this.gaugeCfg.milestones.length; // 최종(미션 완료) 보상
    // ⭐보상 = **스핀 저장고(우측하단 카운터)로 회수되는 비행 연출**(요청). 코인은 헤더로. 보상 금액 텍스트는 별도 토스트 없이
    //   **타이틀 배너에 순차 표시**(완료 블록에서 큐잉) — 이 정보창 외 별도 창 안 띄움(요청).
    //   ⭐스핀이 모두 회수되고 나면(마지막 아이콘 도착) **게이지바도 비운다**(요청 — 회수 후 바로 지움).
    if (reward.kind === 'coins') this.flyCoinReward(fx, fy, reward.amount);
    else this.flySpinReward(fx, fy, reward.amount, isFinal ? () => this.gaugeView?.setRatio(0, true) : undefined);
  }

  /** ⭐스핀 보상 회수 연출(요청) — 상단 EARN SPINS 위치에서 **스핀이 크게 확대**되었다가, **10스핀=1개**(130→13개)로
   *  아래쪽 스핀 저장고(우측하단 카운터)로 **주루룩 빨려 들어간다**. 큰 아이콘·최상단 depth(900)로 또렷이.
   *  보상은 **즉시 확정**(비행 중 이탈해도 유실 없음). 금액 텍스트는 별도 토스트 없이 타이틀 배너에 "+N SPINS"(요청). */
  private flySpinReward(fromX: number, fromY: number, amount: number, onAllArrived?: () => void): void {
    this.grantSpins(amount); // 보상 즉시 확정(연출과 무관)
    const key = 'up_SC_UI_54_v3'; // 스핀(번개) 아이콘
    if (!this.textures.exists(key)) {
      onAllArrived?.();
      return;
    }
    this.sfx.play('coin', 0.5);
    const tx = this.spinBarX; // ⭐오른쪽 회수처(스핀 카운터) — 여기로 **정확히** 도달(요청)
    const ty = this.spinBarY;
    // ① 상단 EARN SPINS 위치에서 **크게 확대**되는 히어로 스핀(좀 더 크게, 요청). 펑 → 살짝 머문 뒤 사라짐.
    const hero = this.add.image(fromX, fromY, key).setDepth(900).setDisplaySize(90, 90).setAlpha(0);
    this.tweens.add({
      targets: hero,
      alpha: 1,
      displayWidth: 210,
      displayHeight: 210,
      duration: 340,
      ease: 'Back.easeOut',
      onComplete: () => this.tweens.add({ targets: hero, alpha: 0, displayWidth: 150, displayHeight: 150, duration: 200, delay: 100, onComplete: () => hero.destroy() }),
    });
    // ② **20스핀=1개**(요청: 너무 많아 보임 → 10→20단위, 예: 140→7개) 스트림이 줄지어 오른쪽 카운터로 회수. **좀 더 크게 + 약간 느리게 + 정확히 도달**(요청).
    const N = Math.max(1, Math.min(20, Math.round(amount / 20)));
    for (let i = 0; i < N; i++) {
      const icon = this.add.image(fromX, fromY, key).setDepth(900).setDisplaySize(82, 82).setAlpha(0);
      this.tweens.add({
        targets: icon,
        alpha: 1,
        x: fromX + (i % 2 ? 42 : -34),
        y: fromY - 22,
        displayWidth: 108, // 좀 더 크게
        displayHeight: 108,
        duration: 220,
        delay: 320 + i * 70, // 히어로 확대 뒤 → 줄지어(주루룩), 간격 약간 넓혀 또렷
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: icon,
            x: tx, // ⭐오른쪽 회수처 좌표로 **정확히** 도달
            y: ty,
            displayWidth: 54,
            displayHeight: 54,
            duration: 720, // ⭐약간 더 느린 회수(요청)
            ease: 'Cubic.easeIn', // 가속 = 저장고로 빨려가는 느낌
            onComplete: () => {
              icon.destroy();
              this.sfx?.play('coin', 0.25);
              if (this.spinText) this.tweens.add({ targets: this.spinText, scaleX: 1.24, scaleY: 1.24, duration: 100, yoyo: true, ease: 'Sine.easeInOut' });
              if (i === N - 1) onAllArrived?.(); // ⭐마지막 아이콘 도착 = 회수 완료 → 게이지바 비우기 콜백
            },
          });
        },
      });
    }
  }

  /** 코인 보상 확보 연출(스핀과 동형, 도착지=헤더 코인) — 보상 위치에서 떠올랐다 **헤더 코인으로 가속 비행** → 도착 시 코인 가산. */
  private flyCoinReward(fromX: number, fromY: number, amount: number): void {
    const toX = this.coinText?.x ?? 364;
    const toY = this.coinText?.y ?? 75;
    if (!this.textures.exists(REWARD_COIN_ICON)) {
      this.coins += amount;
      this.refreshHud();
      this.floatLabel(`+${this.fmt(amount)} 🪙`, '#ffe27a');
      return;
    }
    const icon = this.add.image(fromX, fromY, REWARD_COIN_ICON).setDepth(560).setDisplaySize(80, 80);
    this.sfx.play('coin', 0.5);
    this.tweens.add({
      targets: icon,
      displayWidth: 110,
      displayHeight: 110,
      y: fromY - 56,
      duration: 240,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: icon,
          x: toX,
          y: toY,
          displayWidth: 46,
          displayHeight: 46,
          duration: 480,
          ease: 'Cubic.easeIn', // 가속 = 헤더 코인으로 빨려가는 느낌
          onComplete: () => {
            icon.destroy();
            this.coins += amount;
            this.refreshHud();
            this.floatLabel(`+${this.fmt(amount)} 🪙`, '#ffe27a');
            this.sfx.play('coin', 0.6);
            if (this.coinText) this.tweens.add({ targets: this.coinText, scaleX: 1.25, scaleY: 1.25, duration: 130, yoyo: true, ease: 'Sine.easeInOut' });
          },
        });
      },
    });
  }

  /** 1초 틱 — 만료면 사이클 리셋(새 1시간), 아니면 카운트다운 갱신. */
  /** ⭐게이지 시간 초과 = **보상 소멸 + 같은 미션 새 2분 재도전**(진행 0 리셋). 시도 흔적(progress>0) 있을 때만 실패 피드백(유휴 반복 토스트 방지).
   *  tickGauge(1초 틱)·addGaugeProgress(마감 직후 매치) 공용. */
  private forfeitGauge(now: number): void {
    const hadProgress = this.gaugeState.progress > 0;
    this.gaugeState = createGaugeState(now);
    this.lastGaugeWarnSec = undefined; // 새 사이클 — 경고 카운터 리셋
    this.saveGauge();
    this.renderGauge(now, false);
    if (hadProgress) {
      this.sfx?.play('missionFail', 0.7); // ⭐미완료 실패 사운드(요청)
      // ⭐실패 메시지 = 별도 토스트 대신 **상단 타이틀 배너(419 자리)에 순차 표시**(요청 "별도 창 말고 민트색 정보창에").
      this.showMissionBanner('⏱ TIME UP! REWARD LOST', '#ff7a7a');
    }
  }

  private tickGauge(): void {
    if (!this.gaugeView) return;
    // ⭐완료된 미션(최종 보상 이미 수령, advanceGaugeMission 1500ms 대기 중)은 만료 처리 스킵 — "미션 완료!" 직후 "시간 초과!" 모순 피드백 방지.
    if (this.gaugeState.claimed.includes(this.gaugeCfg.milestones.length)) return;
    // ⭐어텍/레이드 진행 중(발동~복귀)에는 타이머 **정지** — 카운트다운/만료 스킵(요청: 즉시 일시정지). returnFromStage 가 경과분 보정 후 해제.
    if (this.gaugeStageStartedMs != null) return;
    const now = Date.now();
    // ⭐새 미션 시작 후 **첫 퍼즐 조작 전**에는 타이머 정지(요청) — 풀타임 유지(시작점을 now 로 계속 밀어 경과 0). 첫 조작 시 armGaugeTimer 가 시작.
    if (!this.gaugeTimerArmed) {
      this.gaugeState = { ...this.gaugeState, startedAtMs: now };
      this.gaugeView.setTimer(this.gaugeCfg.durationMs);
      return;
    }
    if (isExpired(this.gaugeCfg, this.gaugeState, now)) {
      this.forfeitGauge(now);
      return;
    }
    const remMs = remainingMs(this.gaugeCfg, this.gaugeState, now);
    this.gaugeView.setTimer(remMs);
    this.warnGaugeTime(Math.floor(remMs / 1000)); // ⭐30/20초 경고 + 10초~1초 초침 카운트다운 사운드
  }

  /** ⭐첫 퍼즐 조작(유효 스왑) 시 미션 타이머 시작(요청) — 그 전까진 tickGauge 가 풀타임 정지. 시작 시점부터 풀타임 카운트다운. */
  private armGaugeTimer(): void {
    if (this.gaugeTimerArmed) return; // 이미 시작됨(이번 미션)
    if (this.gaugeState.claimed.includes(this.gaugeCfg.milestones.length)) return; // 완료/휴면 중이면 무시
    this.gaugeTimerArmed = true;
    this.gaugeState = { ...this.gaugeState, startedAtMs: Date.now() }; // 첫 조작 시점부터 풀타임
    this.lastGaugeWarnSec = undefined;
    this.saveGauge();
    if (this.gaugeView) this.renderGauge(Date.now(), false);
  }

  /** ⭐타임어택 사운드 경고(bomb_countdown_sfx_pack, 요청) — 시도 중(progress>0)일 때만:
   *  30초=부드러운 챔 → 20초=긴급 트리플 → **10~1초 초별 비프 카운트다운**(촉박). 실제 미완료 폭발음은 forfeitGauge.
   *  경계 통과(prev>th && cur<=th) 판정으로 틱 지터에도 누락/중복 없음. 카운트다운은 초별 분리 비프라 표시 타이머에 정확 동기(레이드로 멈추면 비프도 멈춤). */
  private warnGaugeTime(sec: number): void {
    const prev = this.lastGaugeWarnSec;
    if (sec === prev) return; // 같은 초 중복 방지
    if (this.gaugeState.progress > 0) {
      // 30·20초 경고(경계 1회). 두 임계는 10초 간격이라 한 틱에 동시 발생 안 함.
      if (prev != null && prev > 30 && sec <= 30) this.sfx?.play('missionWarn30', 0.7);
      else if (prev != null && prev > 20 && sec <= 20) this.sfx?.play('missionWarn20', 0.8);
      // 10초~1초: 매 초 그 초에 해당하는 비프(에스컬레이션). missionCount10 → ... → missionCount1.
      if (sec >= 1 && sec <= 10) this.sfx?.play(`missionCount${sec}` as SfxKey, 0.85);
    }
    this.lastGaugeWarnSec = sec;
  }

  private loadGaugeRaw(): string | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(GAUGE_SAVE_KEY) : null;
    } catch {
      return null;
    }
  }
  private loadMissionIndex(): number {
    try {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem(GAUGE_MISSION_KEY) : null;
      const n = v != null ? parseInt(v, 10) : NaN;
      return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch {
      return 0;
    }
  }
  private saveGauge(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(GAUGE_SAVE_KEY, serializeGauge(this.gaugeState));
        localStorage.setItem(GAUGE_MISSION_KEY, String(this.missionIndex));
      }
    } catch {
      /* 저장 실패 무시(시크릿 모드 등) */
    }
  }

  /** 발동 배너(및 망치 연출) 중심 — 보드 **상단부**(요청: ATTACK/RAID 연출을 위로). 배너·망치 오버레이가 같은 지점을 쓰도록 한 곳에서 산출.
   *  BANNER_BOARD_FRAC: 0=보드 최상단행, 0.5=정중앙. 위로 올리려 0.28(상단 ~1/4 지점). */
  private bannerCenter(): { x: number; y: number } {
    const g = this.geom.board;
    const BANNER_BOARD_FRAC = 0.28;
    return { x: DESIGN_W / 2, y: g.startY + (g.rows - 1) * g.pitchY * BANNER_BOARD_FRAC };
  }

  /**
   * 특수 젬 발동 배너 — 공격/약탈 매치 시 **큰 영문 텍스트 이펙트**("ATTACK!"/"RAID!") + **배수 "×N"**.
   * 오버슈트로 펑 등장 → 짧게 흔들림(임팩트) → 커지며 페이드아웃. 보드 정중앙, 최상단 depth.
   */
  private showActivationBanner(type: 'attack' | 'raid', mult: number): void {
    const { x: cx, y: cy } = this.bannerCenter();
    this.activationBanner?.destroy(); // 직전 배너 잔류 제거(연쇄 매치)
    // ⭐ 텍스트 룩은 attackBanner(단일 출처)에서 — 망치 연출 오버레이가 망치 앞에 그리는 텍스트와 동일.
    const c = buildAttackBanner(this, type, mult).setPosition(cx, cy).setDepth(620).setScale(0.2).setAlpha(0);
    this.activationBanner = c;
    this.sfx?.play(type === 'attack' ? 'match5' : 'match4', 0.6); // 임팩트 사운드(기존 매치 효과음 재사용)
    // ⭐약간 반투명(요청 2026-06-29) — 이미지 워드아트 이펙트를 뒤 보드/젬이 살짝 비치게 알파 0.85(슬쩍 투명).
    //   ⭐자동소멸 없음(요청) — 슬롯결정 → 스테이지 전환 시점까지 떠 있다가 maybeEnterStage 에서 페이드아웃된다.
    this.tweens.add({
      targets: c,
      scale: 1,
      alpha: 0.85,
      duration: 260,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (!c.active) return; // 연쇄로 교체돼 파괴됐으면 무시
        // ⭐유동 연출(요청 2026-06-30) — 좌우 흔들기(회전 스웨이) 제거 → **약간 커졌다 작아졌다 하는 스케일 펄스**만.
        //   1↔1.045 를 부드럽게(Sine) 무한 반복해 숨쉬듯 커졌다 작아진다(고정 느낌 제거, 과하지 않게).
        this.tweens.add({ targets: c, scaleX: 1.045, scaleY: 1.045, duration: 880, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      },
    });
  }

  /**
   * 베팅 반영 스핀 보상액을 카운터 위에 "+N" 으로 팝(스핀젬이 GO 스핀 카운터로 빨려든 시점). 펑 등장 후 떠오르며 사라짐.
   */
  private spinGainPopup(amount: number): void {
    const x = this.spinBarX;
    const y = this.spinBarY - 70;
    const t = this.add
      .text(x, y, `+${this.fmt(amount)}`, {
        fontFamily: '"Kanit", "Do Hyeon", sans-serif',
        fontStyle: 'italic 800',
        fontSize: '76px',
        color: '#9bff7a',
        stroke: '#16400a',
        strokeThickness: 9,
      })
      .setOrigin(0.5)
      .setDepth(560)
      .setScale(0.3)
      .setAlpha(0);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 180, ease: 'Back.easeOut' });
    // 표시를 0.5초 더 길게(요청) — 페이드아웃 시작 지연 360 → 860ms.
    this.tweens.add({ targets: t, y: y - 96, alpha: 0, delay: 860, duration: 560, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  /** 스핀 부족으로 매칭이 막혔을 때 안내(쓰로틀: 1.2초). 보드가 onBlocked 로 호출 — GO 부족 안내와 동일 메시지. */
  private showNoSpins(): void {
    const now = this.time.now;
    if (now - this.noSpinsToastAt < 1200) return;
    this.noSpinsToastAt = now;
    showToast(this, 'NOT ENOUGH SPINS!', { color: '#ff9a9a' });
    // ⭐P1 에너지 월(구매 포인트) — 스핀 소진 = 가장 강한 전환점. 즉시 충전(목업) 또는 상점. 자주 안 뜨게 throttle.
    if (now - this.noSpinsDialogAt > 6000 && !isDialogOpen(this)) {
      this.noSpinsDialogAt = now;
      const pack = SHOP_CATALOG.spins[0]; // 100 스핀 $1.99(최소 팩)
      showDialog(this, {
        title: 'NOT ENOUGH SPINS',
        message: 'You are out of spins.\nTop up spins or lower your bet.',
        buttons: [
          { label: `SPINS +${pack.amount} ${pack.price}`, kind: 'primary', onClick: () => this.buyQuick(pack) },
          { label: 'SHOP', kind: 'default', onClick: () => this.goHome() },
        ],
      });
    }
  }

  /** ⭐구매 포인트 공용 — 목업 결제(applyPurchase)로 재화 영속 가산 → 인메모리 동기화 → HUD 갱신 + 토스트. (실 IAP 는 별도.) */
  private buyQuick(item: ShopItem): void {
    applyPurchase(item); // 목업 — 영속 +재화
    this.coins = loadCoins();
    this.spins = loadSpins();
    this.refreshHud();
    const unit = item.kind === 'coins' ? '🪙' : item.kind === 'spins' ? '🎰' : '💎';
    const amt = item.amount.toLocaleString('en-US');
    showToast(this, `+${amt} ${unit}`, { color: item.kind === 'coins' ? '#ffe27a' : '#9bff7a' });
  }

  /** 보드 위로 떠오르며 사라지는 짧은 라벨(특수 젬 수집 피드백). */
  private floatLabel(text: string, color: string): void {
    const y = this.geom.board.startY - 60;
    const t = this.add
      .text(DESIGN_W / 2, y, text, {
        fontFamily: '"Do Hyeon", "Jua", sans-serif',
        fontSize: '60px',
        color,
        stroke: '#2a1640',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(500);
    this.tweens.add({ targets: t, y: y - 110, alpha: 0, duration: 1100, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  /**
   * 퍼즐-우선 한 판 — 퍼즐 결과 → 슬롯 회전 → 슬롯 결과 → 최종.
   *   ⭐**페이스 적응(요청 2026-06-29)**: 유저가 퍼즐을 빠르게 연속으로 맞추거나(짧은 매치 간격) 백로그가
   *   쌓이면(슬롯이 뒤처짐) pace.ts 가 산출한 강도로 **슬롯 회전·라운드 텀·최종 연출을 함께 가속**해 슬롯이
   *   빠르게 따라온다. 여유롭게 맞추면 강도 0 = 예전처럼 매 판 풀연출로 충분히 보여준다.
   */
  private async playRounds(): Promise<void> {
    if (this.busyRound || this.stageActive) return;
    this.busyRound = true;
    while (this.scoreQueue.length > 0) {
      if (this.stageActive) break; // 스테이지 전환 중엔 다음 판 중단(복귀 후 재개)
      if (!this.canSpin()) { this.showNoSpins(); break; } // ⭐소진 = 막힘(자동충진 폐지)
      const P = this.scoreQueue.shift() ?? 0;
      this.spins -= this.spinBet; // 플레이 = 스핀 소모(코인 아님). 코인은 보상으로 증가만.
      this.refreshHud();
      this.beginRound(); // 다음 판 시작 → 이전 결과 지움
      const bonus = this.showPuzzleResult(P); // ① 퍼즐 데이터(정보 바에 순차 표시)
      this.playLever();
      this.spinLoop = this.sfx.loopStart('reelLoop', 0.14);
      // ⭐현재 페이스 강도(매치 간격 + 남은 백로그) → 이 라운드 슬롯/텀 타이밍.
      const timing = paceTiming(paceIntensity(this.pace, this.time.now, this.scoreQueue.length));
      await this.wait(timing.puzzleToSlotMs); // 퍼즐→슬롯 간격(가속 시 0)
      const outcome = await this.slot.spin(this.rng, weightsFor(this.fortune), timing.slotPace); // ② 슬롯 회전(가속)
      this.fadeSpinLoop(); // 안전망 — 보통 마지막 릴 정지 콜백에서 이미 페이드됨
      const slotPayout = this.showSlotResult(outcome); // ② 슬롯 결과(코인/어택/레이드) → 중간 칸
      await this.finalizeWin(slotPayout, bonus, timing.slotPace); // ③ 최종(가속 반영 — 큰 당첨은 그대로 음미)
      await this.board.reshuffleIfNeeded(); // 결과가 모두 끝난 뒤에만 셔플
      this.maybeEnterStage(); // ⭐슬롯결정 끝 → 예약된 공격/약탈 스테이지로 전환(있으면 다음 루프에서 중단)
      // ⭐라운드 끝 → 다음 퍼즐까지 텀. 백로그가 남아 있을 때만(현재 백로그/페이스로 재산출 — 질주 중이면 거의 즉시).
      if (this.scoreQueue.length > 0 && !this.stageActive) {
        await this.wait(paceTiming(paceIntensity(this.pace, this.time.now, this.scoreQueue.length)).roundGapMs);
      }
    }
    this.busyRound = false;
  }

  /** 스핀 가능 여부 — ⭐순소모 경제(자동충진 폐지, 2026-06-28): 보유 스핀이 베팅 이상이어야 플레이. 소진 시 막힘(다음 일일 지급/리그까지). */
  private canSpin(): boolean {
    return this.spins >= this.spinBet;
  }

  /** ⭐스테이지(공격/약탈/룰렛)에서 게임으로 복귀 — 상태 복구 + 페이드인 + 라운드 재개. **멱등**(Stage1.finish 직접 + RESUME 폴백 중복 안전). */
  returnFromStage(): void {
    if (!this.stageActive) return; // 이미 복귀했으면(중복 호출) 무시
    this.stageActive = false;
    // ⭐레이드/어텍에 쓴 시간은 미션 타임어택에서 **제외**(요청) — 마감(startedAtMs)을 그 경과분만큼 뒤로 밀어 남은 시간 보존.
    if (this.gaugeStageStartedMs != null) {
      const paused = Date.now() - this.gaugeStageStartedMs;
      this.gaugeStageStartedMs = undefined;
      if (paused > 0) {
        this.gaugeState = { ...this.gaugeState, startedAtMs: this.gaugeState.startedAtMs + paused };
        this.saveGauge();
        if (this.gaugeView) this.renderGauge(Date.now(), false);
      }
    }
    this.activationBanner?.destroy();
    this.activationBanner = undefined;
    this.scene.stop('hammerfx'); // 망치 잔류 정리
    this.cameras.main.fadeIn(320, 26, 16, 48); // 복귀 페이드인
    if (this.scoreQueue.length > 0 && !this.busyRound) void this.playRounds(); // 백로그 있으면 재개
  }

  /** ⭐레이드 룰렛 당첨금을 **코인**에 가산 — Stage1.finish 가 복귀 직전 **직접 호출**(레지스트리/RESUME 이벤트 의존 제거 = 확실). */
  awardRaidWin(amount: number): void {
    if (!(amount > 0)) return;
    this.coins += amount;
    this.refreshHud();
    this.sfx?.play('coin', 0.5);
    this.floatLabel(`+${this.fmt(amount)}`, '#ffd34d'); // 복귀 시 떠오르며 사라짐(트윈은 재개 후 진행)
  }

  /** ⭐어택 룰렛 당첨을 **스핀**에 가산(요청 2026-07-01: 어택=스핀 보상) — Stage1.finish 가 복귀 직전 직접 호출.
   *   grantSpins 로 카운터 갱신 + 스핀 바 위 +N 팝업(스핀젬 회수와 동일한 초록 룩). 레이드(코인)와 동일한 직접-호출 핸드오프. */
  awardAttackSpins(amount: number): void {
    const n = Math.round(amount);
    if (!(n > 0)) return;
    this.grantSpins(n);
    this.sfx?.play('coin', 0.5);
    this.spinGainPopup(n);
  }

  /** ⭐실측 텔레메트리 — 라운드 종료 시 스냅샷 기록(경제 콘솔이 같은 origin localStorage 로 읽어 모델과 비교). 실패 무시. */
  private recordTelemetry(win: number): void {
    try {
      recordSnapshot({ t: Date.now(), spins: this.spins, coins: this.coins, cityLevel: this.cityLevelNow(), bet: this.bet, winCoins: Math.max(0, Math.round(win)) });
    } catch {
      /* 텔레메트리 실패는 게임에 영향 없음 */
    }
  }

  /** 스핀 적립(스핀 젬 보상·시간 충전 공용) — 카운터 갱신 + 표시. */
  private grantSpins(n: number): void {
    if (n <= 0) return;
    this.spins += n;
    this.refreshSpinHolding();
  }

  /** ⭐하단 스핀 보유량 표시 = **현재/레벨기본**(요청 "250/50" 포맷, 정확 반영). 레벨기본은 재생상한(추후 코인마스터 재생 연동). */
  private refreshSpinHolding(): void {
    this.spinText?.setText(`${this.fmt(this.spins)}/${SPIN_LEVEL_BASE}`);
  }

  /** ⭐대박 시 스핀 소량 환급(작은 상승니) — win/베팅 티어로 spinBet × g. 보조 레버(주 균형은 ρ_gem·마일스톤). */
  private grantBigWinSpins(win: number): void {
    if (win <= 0) return;
    const g = win >= this.bet * BIGWIN_SPIN_MEGA_X ? BIGWIN_SPIN_MEGA : win >= this.bet * BIGWIN_SPIN_BIG_X ? BIGWIN_SPIN_BIG : 0;
    if (g <= 0) return;
    const spins = this.spinBet * g;
    this.grantSpins(spins);
    this.time.delayedCall(250, () => this.spinGainPopup(spins));
  }

  /** 자동 스핀 잠금 표시 토글 — 신 GO 패널의 AUTO OFF 오버레이로 표현. */
  private updateAutoIndicator(): void {
    // ⭐오토 작동(잠금) 시 AUTO OFF 오버레이 숨김 → 패널의 AUTO ON(초록) 노출. 꺼지면 다시 AUTO OFF 표시(요청).
    this.autoOffOverlay?.setVisible(!this.autoLock);
  }

  /** 홀드 앤 스핀 루프 — 누르는 동안(또는 2초↑ 잠금 시) **퍼즐-우선** 자동 라운드를 반복. */
  private async autoSpinLoop(): Promise<void> {
    if (this.spinLooping) return;
    this.spinLooping = true;
    do {
      await this.autoRound();
      await this.wait(this.holdSpin ? ROUND_GAP_SLOW_MS : 0); // ⭐연속 라운드 간 텀(오토는 일정 여유 페이스)
    } while (this.holdSpin);
    this.spinLooping = false;
    // ⭐오토 중 사용자가 끼워넣은 **수동 퍼즐 매치**가 scoreQueue 에 쌓였는데, busyRound(오토 라운드 진행)에 막혀
    //   playRounds 가 못 돌아 **퍼즐만 되고 슬롯이 안 도는** 문제(요청 2026-06-29) → 오토 종료 시 남은 백로그를 마저 처리.
    this.drainScoreQueue();
  }

  /** 대기 중인 퍼즐 백로그(scoreQueue)를 처리 — 라운드 러너가 놀고 있고(busyRound·stageActive 아님) 백로그가 있으면 playRounds 재가동. */
  private drainScoreQueue(): void {
    if (this.scoreQueue.length > 0 && !this.busyRound && !this.stageActive) void this.playRounds();
  }

  /**
   * 홀드 GO 자동 라운드 — **수동과 동일한 퍼즐-우선** 순서로 통일(요청): AI 자동매치(퍼즐 먼저) → 퍼즐 결과(좌) →
   * 슬롯 회전 → 슬롯 결과(중) → 최종 → 셔플은 끝난 뒤. (이전의 "슬롯 먼저 → 퍼즐" 역방향 폐기.)
   */
  private async autoRound(): Promise<void> {
    if (this.busyRound || this.slot.isBusy || this.board.isBusy) return;
    if (this.stageActive) return; // 스테이지 전환 중엔 새 라운드 금지
    if (!this.canSpin()) { this.showNoSpins(); return; } // ⭐소진 = 막힘(자동충진 폐지)
    this.busyRound = true;
    this.spins -= this.spinBet; // 플레이 = 스핀 소모(코인 아님)
    this.refreshHud();
    this.beginRound();
    // ① 퍼즐 먼저 — AI 최적 자동매치 → 퍼즐 결과(좌측 칸)
    const P = await this.board.autoMatch();
    const bonus = this.showPuzzleResult(P);
    // ② 슬롯 회전 → 슬롯 결과(중간 칸)
    this.playLever();
    this.spinLoop = this.sfx.loopStart('reelLoop', 0.14);
    await this.wait(PUZZLE_TO_SLOT_SLOW_MS); // ⭐퍼즐→슬롯 거의 즉시(오토는 여유 페이스)
    const outcome = await this.slot.spin(this.rng, weightsFor(this.fortune)); // 오토 = 정상 속도(pace 0)
    this.fadeSpinLoop(); // 안전망 — 보통 마지막 릴 정지 콜백에서 이미 페이드됨
    const slotPayout = this.showSlotResult(outcome);
    await this.finalizeWin(slotPayout, bonus); // ③ 최종
    await this.board.reshuffleIfNeeded(); // 결과가 모두 끝난 뒤에만 셔플
    this.busyRound = false;
    this.maybeEnterStage(); // ⭐슬롯결정 끝 → 예약된 공격/약탈 스테이지로 전환
  }

  /** ① 퍼즐 결과 표시(정보 바에 "PUZZLE ×N" 데이터와 함께 팝) → 멀티플라이어 반환. 슬롯 결과가 이어서 이 자리를 대체(순차). */
  private showPuzzleResult(mult: number): number {
    this.hidePlaying();
    this.matchImg?.setVisible(false); // MATCH=1SPIN 메시지 → 값으로 대치(요청)
    this.finalScoreText.setAlpha(0); // 직전 턴 최종값 정리(새 시퀀스 시작)
    this.infoLeft.setAlpha(1);
    this.popScore(this.infoLeft, `PUZZLE ×${mult.toFixed(1)}`, mult >= 5 ? '#ff7a3c' : '#fff04a');
    return mult;
  }

  /**
   * ② 슬롯 결과(3릴 중앙 1줄 3매치) — 코인 지급액 반환.
   *   • 망치(HAMMER) 3매치 → **어택** 예약(stageHold) + 배너 · 코인 0(스테이지에서 지급)
   *   • 금화(GOLD) 3매치   → **레이드** 예약 + 배너 · 코인 0
   *   • 그 외 3매치        → **골드**(coinBase × 코인베팅 × 럭 × RTP스케일) · 최소 베팅액 보장
   *   • 미매치             → 0
   *   stageHold 는 finalizeWin 이 **슬롯 회전 후** pendingStage 로 승격 → maybeEnterStage(망치/커튼).
   */
  private showSlotResult(outcome: SpinOutcome): number {
    this.hidePlaying();
    this.matchImg?.setVisible(false);
    this.infoLeft.setAlpha(1);
    // 어택/레이드: 배너는 즉시(릴 정지 직후), 스테이지 예약은 stageHold 로 보류(슬롯 회전 후 승격).
    if (outcome.kind === 'attack' || outcome.kind === 'raid') {
      const power = this.spinBet; // 배너 ×N + Stage1 레거시 power(스테이크는 maybeEnterStage 가 통화별 산출)
      this.stageHold = { type: outcome.kind, power };
      this.showActivationBanner(outcome.kind, power);
      if (this.gaugeStageStartedMs == null) this.gaugeStageStartedMs = Date.now();
      this.popScore(this.infoLeft, outcome.kind === 'attack' ? 'ATTACK!' : 'RAID!', outcome.kind === 'attack' ? '#ff6a6a' : '#ffd23d');
      return 0; // 코인은 스테이지(어택=다운그레이드/레이드=룰렛)에서 지급
    }
    // 코인 3매치: coinBase × 코인베팅 × 럭 × RTP스케일(오버라이드 반영). ⚠️정확한 밸런스는 econ 콘솔 튜닝.
    let slotPayout = 0;
    if (outcome.kind === 'coin') {
      slotPayout = Math.round(outcome.coinBase * this.bet * luckMultiplier(this.rng, luckTableNow()) * slotRtpScaleNow());
      if (this.forceBigWin) slotPayout = this.bet * this.nextForcedMult(); // 연출 검증: 높은 배수 강제(순환)
      if (slotPayout > 0) slotPayout = Math.max(this.bet, slotPayout); // 최소 베팅액 보장(진짜 슬롯과 동일)
    }
    // 퍼즐 데이터가 사라지고 이 자리를 슬롯 **배수(×N)** 가 대치(요청 이미지: "SLOT ×20"). 최종 코인은 finalizeWin.
    this.popScore(this.infoLeft, outcome.coinBase > 0 ? `SLOT ×${outcome.coinBase}` : 'SLOT —', '#9be1ff');
    return slotPayout; // 최종 획득(퍼즐 멀티 반영)은 finalizeWin 에서
  }

  /** 연출 검증용 강제 배수(5→10→20→40→… 순환)로 매 스핀 다른 웨이브 수를 보여준다. */
  private nextForcedMult(): number {
    const m = this.forcedMults[this.forcedIdx % this.forcedMults.length];
    this.forcedIdx++;
    return m;
  }

  /**
   * ③ 최종: 두 결과를 잠깐 본 뒤 획득 코인을 롤링 표시 + 코인 가산 + 사운드.
   *   ⭐pace(0..1): 가속 중이면 **루틴 라운드의 확인/롤링/홀드를 단축**해 슬롯이 퍼즐 페이스를 따라온다.
   *   단 잭팟·대박(베팅 10배+)·축포 같은 **희귀 대형 연출은 가속과 무관하게 끝까지 음미**시킨다(자주 안 나오므로).
   *   스테이지(공격/약탈) 전환 분기는 별도 시네마틱이라 가속 영향 없음.
   */
  private async finalizeWin(slotPayout: number, bonus: number, pace = 0): Promise<void> {
    const k = pace < 0 ? 0 : pace > 1 ? 1 : pace; // 가속 강도
    const quick = (ms: number, floor = 0): number => Math.max(floor, Math.round(ms * (1 - 0.8 * k))); // 가속 시 최대 80% 단축
    // ⭐보류된 발동 정보(stageHold)를 **여기서** pendingStage 로 승격 — finalizeWin 은 **슬롯 회전이 끝난 뒤** 호출되므로,
    //   슬롯이 확실히 돌고(텍스트 배너는 이미 떠 있음) 결과를 보여준 다음에야 스테이지가 예약된다(요청: 텍스트 연출 시 슬롯 회전).
    if (this.stageHold && !this.pendingStage) {
      // ⭐auto(오토스핀 여부)를 **예약 시점에 고정**(요청 2026-06-30 버그수정) — 이후 슬롯결과 홀드·커튼 연출 중 사용자가
      //   오토를 끄더라도 레이드/어택이 **자동 완료·복귀**되도록(예전엔 지연된 stage1 launch 시점에 재평가돼, 도중 정지하면
      //   auto=false 로 뒤집혀 룰렛이 수동 대기 상태로 남아 "게임으로 안 돌아옴").
      this.pendingStage = { ...this.stageHold, auto: this.autoLock || this.holdSpin };
      this.stageHold = undefined;
    }
    // 최종 = 슬롯(이미 최소 베팅액 적용됨) × bonus(=퍼즐 멀티) × M(L)(시티 코인획득 배수). L0=×1 이라 초반 화면 PUZZLE×SLOT=FINAL 일치,
    //   시티 성장 시 M(L)배 더 획득(코인 엔진). ⚠️M 은 코인에만 — 스핀/RTP 캘리브 기준은 L0(M=1).
    const win = Math.round(slotPayout * bonus * this.incomeMultNow());
    // ⭐공격/약탈 전환 예약 시(요청: 퍼즐매칭>슬롯회전 후 전환): 슬롯 결과까지만 잠깐 보여주고 **대형 축하 연출은 생략**,
    //   코인만 가산한 뒤 바로 스테이지로 넘어간다. (대박 카운트업/축포/긴 홀드는 일반 라운드에서만.)
    if (this.pendingStage) {
      const stage = this.pendingStage; // 발동 정보 고정(아래 await 사이 변동 방지)
      // ⭐레이드/공격 진입 전 **슬롯 결과를 확실히 표시**한다(요청 2026-06-28): 기존 즉시표시+220ms 짧은 홀드 대신
      //   일반 라운드처럼 **롤링 카운트업 + 충분한 홀드**로 슬롯 당첨을 또렷이 보여준 뒤 → 발동 배너 → 스테이지.
      //   순서 = 퍼즐매칭 → 슬롯 회전 → **슬롯 결과 확실히 확인** → 발동 배너 → 스테이지. (대박 카운트업/축포/잭팟
      //   추첨 같은 대형 축하만 생략해 전환이 늘어지지 않게.)
      this.iconWin?.setVisible(true); // 획득(코인) 아이콘 — 일반 결과와 동일
      if (win > 0) this.sfx.play('countUp', 0.6);
      await this.showSlotWinBanner(win, 550); // ⭐당첨 롤링(미션 메시지 중이면 스킵 — 중첩 금지)
      this.coins += win;
      this.grantBigWinSpins(win); // ⭐대박이면 스핀도 소량 환급(작은 상승니)
      this.recordTelemetry(win); // 실측 스냅샷(스테이지 진입 라운드)
      if (win > 0) this.sfx.play(win >= this.bet * 8 ? 'winMedium' : 'winSmall', 0.8); // 결과 사운드 피드백
      this.jackpotPool += jackpotContribution(this.bet); // 잭팟 적립은 유지(추첨은 생략 — 스테이지 전환 우선)
      this.fortune = nextFortune(this.fortune, this.rng);
      this.refreshHud();
      // ⭐발동 배너("ATTACK!/RAID!")는 이미 **퍼즐 매칭 시점**(onCollectSpecials)에 떠 있다 — 여기서 재생성하지 않는다
      //   (재호출하면 destroy+재팝으로 끊김). 슬롯 결과만 또렷이 확인시킨 뒤 → maybeEnterStage 가 망치 연출로 이어받는다.
      void stage; // (배너는 이미 표시됨 — 슬롯 결과 홀드 후 전환)
      await this.wait(450); // 슬롯 결과 확인 홀드(롤링 550 + 450). 배너는 계속 떠 있는 상태로 슬롯 결과를 보여준다.
      await this.wait(420); // 비트 → maybeEnterStage 가 망치/커튼으로 이어받음(텍스트는 망치 연출 중 먼저 사라짐)
      return;
    }
    await this.wait(quick(140)); // 두 결과 확인 후 최종 계산(긴장감) — 가속 시 단축
    this.iconWin?.setVisible(true); // 획득(코인) 아이콘 — 우측 칸 고정
    if (win > 0) this.sfx.play('countUp', 0.6);
    await this.showSlotWinBanner(win, quick(550, 180)); // ⭐획득 롤링(미션 메시지 중이면 스킵 — 중첩 금지)
    this.coins += win;
    this.grantBigWinSpins(win); // ⭐대박이면 스핀도 소량 환급(작은 상승니 = "쌓이는 느낌")
    this.recordTelemetry(win); // 실측 스냅샷(일반 라운드)
    if (win > 0) {
      // ⭐**모든 슬롯 보상**을 대박과 동일하게 **이미지폰트 코인드랍 카운트업**으로 표시(요청 2026-06-27). 축포만 대박(10배+) 한정.
      this.playBigWinCountUp(win);
      if (win >= this.bet * 10) this.confetti.burst(); // 화면 가득 축포(색종이)는 대박만
      this.burstSlotCoins(win); // 최종 획득(퍼즐 멀티 반영) 기준 코인 분수 — 고배당이면 더 크게/길게
      // 승리 사운드(티어 = 베팅 배수 기준, 단위 무관): 소액=Cascading 골드코인, 큰 건=Epic, 메가=Modern.
      const winSound = win >= this.bet * 50 ? 'winBig' : win >= this.bet * 8 ? 'winMedium' : 'winSmall';
      this.sfx.play(winSound, 0.8);
    }
    // 잭팟: 매 베팅의 레이크를 풀에 적립 → 희귀확률로 풀 전액 지급(EV 중립).
    this.jackpotPool += jackpotContribution(this.bet);
    const jbonus = rollJackpot(this.rng, this.jackpotPool);
    if (jbonus > 0) {
      this.coins += jbonus;
      this.jackpotPool = JACKPOT_SEED;
      this.bigWin(jbonus, '🎉 JACKPOT!');
      this.sfx.play('jackpot', 0.9);
    }
    // 다음 스핀의 운 상태로 유동(Cold/Neutral/Hot 마르코프 전이).
    this.fortune = nextFortune(this.fortune, this.rng);
    this.refreshHud();
    // ⚠️ 축하 팡파레가 다음 스핀 사운드에 묻혀 '뒤가 끊긴' 느낌 방지 — 팡파레 길이만큼 머문 뒤 라운드 종료.
    //    (팡파레 자체는 일회성이라 절대 stop/페이드 안 함. 여기선 '다음 스핀 시작'만 지연시킨다.)
    // ⭐연출을 느리게(요청): 매 판 결과를 충분히 보여준 뒤 다음 판으로 — 소액/꽝도 최소 홀드를 길게(160→700).
    // 잭팟/대박(베팅 10배+)은 가속과 무관하게 끝까지 음미. 소액·꽝의 기본 홀드만 가속 시 단축(따라잡기).
    let celebrateMs = jbonus > 0 ? 2400 : win > this.bet * 50 ? 1350 : win > this.bet * 10 ? 1100 : quick(420, 90);
    // ⭐자동스핀 중 베팅 5배↑ 보상이면 보상 연출을 음미하도록 3초 멈춘 뒤 다음 라운드로(요청).
    //   자동스핀 = 연속(홀드 중 holdSpin / 2초 잠금 autoLock). 단발 탭은 다음 라운드가 없어 제외.
    const isAutoSpin = this.autoLock || this.holdSpin;
    if (isAutoSpin && this.bet > 0 && win >= this.bet * 5) celebrateMs = Math.max(celebrateMs, 1800); // 스피드업: 3000→1800
    await this.wait(celebrateMs);
    // 결과는 다음 라운드가 시작될 때(beginRound)까지 유지 — 미리 지우지 않음.
  }

  /**
   * 대박(10배+) 코인 드랍 카운트업 — 코인 드랍 영역에 큰 컬러 숫자가 **단위부터 최댓값까지 차르르** 올라간 뒤,
   * 화면에 떠 있다가 **서서히 떨어지면서(중력 가속) 페이드아웃**한다(요청). 코인 분수와 함께 연출.
   */
  private playBigWinCountUp(win: number): void {
    const n = this.bigWinNum;
    const startY = 700;
    this.tweens.killTweensOf(n.container);
    n.setValue(0);
    n.setAlpha(1);
    n.container.setPosition(540, startY).setScale(0.6);
    const o = { v: 0 };
    this.bigWinTween?.remove(); // 연속 대박 시 이전 카운트업 정리
    const countDur = 800; // 스피드업: 1300→800(대박 카운트업 가독 하한)
    // ① 차르르 카운트업(단위 → 최댓값) + 등장 스케일 팝
    this.bigWinTween = this.tweens.add({ targets: o, v: win, duration: countDur, ease: 'Cubic.easeOut', onUpdate: () => n.setValue(o.v) });
    this.tweens.add({ targets: n.container, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: n.container, scaleX: 1.16, scaleY: 1.16, duration: 150, delay: countDur, yoyo: true });
    // ② 떠 있다가 떨어지며 사라짐 — ⭐**밝기 유지**(알파 페이드 제거). 사라짐은 축소(scale→0)로 끝까지 골드 밝게.
    //   ⭐요청: 코인드랍이 하단 **MATCH 배너(최종 당첨금, y≈1056)와 겹치지 않게** 낙하폭을 슬롯 영역 안으로 제한(560→220).
    this.tweens.add({ targets: n.container, y: startY + 220, duration: 700, delay: countDur + 140, ease: 'Quad.easeIn' });
    this.tweens.add({
      targets: n.container,
      scaleX: 0,
      scaleY: 0,
      duration: 300,
      delay: countDur + 520,
      ease: 'Back.easeIn',
      onComplete: () => {
        n.setAlpha(0);
        n.setValue(0);
      },
    });
  }


  // ── 연출 ───────────────────────────────────────────────
  /** 새 라운드 시작 시점에만 호출 — 이전 게임의 결과를 비운다(미리 지우지 않음). */
  private beginRound(): void {
    // ⭐새 라운드 시작: 직전 값(퍼즐/슬롯/최종) 정리 → 이어서 showPuzzleResult 가 퍼즐 배수 표시(순차, 요청).
    //   DAKA/보유코인은 항상 표시(유저정보) — 더 이상 당첨금으로 대치하지 않음. 배너 최종값은 다음 턴 시작(=여기)에서 정리.
    this.tweens.killTweensOf(this.infoLeft.container);
    this.infoLeft.setText('');
    this.infoLeft.container.setScale(1);
    this.infoLeft.setAlpha(0);
    this.finalScoreText.setAlpha(0);
    this.hidePlaying();
    this.hideInfoIcons(); // 새 라운드 시작 — 아이콘도 비움
  }

  private hidePlaying(): void {
    this.tweens.killTweensOf(this.playingText);
    this.playingText.setAlpha(0);
  }

  /** 정보패널 아이콘 전부 숨김(스핀/대기 중·새 라운드 시작). 결과 표시 때 각 메서드가 자기 아이콘만 켠다. */
  private hideInfoIcons(): void {
    this.iconPuzzle?.setVisible(false);
    this.iconSlot?.setVisible(false);
    this.iconWin?.setVisible(false);
  }

  /** 점수 칸 갱신 + 팝(가시성). 값은 다음 라운드까지 유지. */
  private popScore(num: FancyNumber, str: string, color: string): void {
    this.tweens.killTweensOf(num.container);
    num.setText(str, color);
    num.setAlpha(1);
    num.container.setScale(0.55);
    this.tweens.add({ targets: num.container, scaleX: 1, scaleY: 1, duration: 150, ease: 'Back.easeOut' }); // 스피드업: 240→150
  }

  /** 숫자를 0→to 로 굴려 올리는 롤링 카운터. */
  private rollNumber(num: FancyNumber, prefix: string, to: number, dur: number): Promise<void> {
    return new Promise((resolve) => {
      const o = { v: 0 };
      this.tweens.killTweensOf(num.container);
      num.container.setScale(1);
      num.setAlpha(1);
      this.tweens.add({
        targets: o,
        v: to,
        duration: dur,
        ease: 'Cubic.easeOut',
        onUpdate: () => num.setText(prefix + this.fmt(o.v), '#ffe27a'),
        onComplete: () => {
          num.setText(prefix + this.fmt(to), '#ffe27a');
          this.tweens.add({ targets: num.container, scaleX: 1.2, scaleY: 1.2, duration: 130, yoyo: true });
          resolve();
        },
      });
    });
  }

  /** 큰 획득 팝업(가운데에서 떠오름). */
  private bigWin(amount: number, label = ''): void {
    const t = this.text(540, 760, `${label ? label + ' ' : '+'}${this.fmt(amount)}`, label ? 64 : 54, '#fff04a');
    t.setDepth(300).setStroke('#7a3b00', 8);
    this.tweens.add({ targets: t, y: 620, alpha: 0, duration: 750, ease: 'Quad.easeOut', onComplete: () => t.destroy() }); // 스피드업: 1200→750
  }

  /** 슬롯 릴 가운데 행을 따라 코인이 한 줄 터지듯 솟구쳐 떨어지는 연출. 베팅 대비 배수↑ → 웨이브↑(더 길게·여러 번). */
  private burstSlotCoins(amount: number): void {
    const r = this.geom.reel;
    if (!r.xs.length || !r.ys.length) return;
    const xL = r.xs[0];
    const xR = r.xs[r.xs.length - 1];
    const y = r.ys[Math.floor(r.ys.length / 2)] ?? r.ys[0];
    this.coinBurst.burstRowScaled(xL, xR, y, amount, this.bet); // 코인 비주얼(사운드는 아래서 길이 매칭으로 1회)
    // 코인 드랍 사운드(v4, 작게): 코인 스트림 애니 길이만큼 깔고, 끝나면 볼륨↓ 페이드아웃(끊김 없이).
    const { duration } = CoinBurst.streamPlan(amount, this.bet);
    const coin = this.sfx.playTracked('coin', 0.3);
    if (coin) this.time.delayedCall(duration, () => this.sfx.fadeStop(coin, 220));
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, () => resolve()));
  }
}
