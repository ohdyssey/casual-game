/**
 * PlayScene — 양궁 본편 (드래그-드로우 + 필드 줌 조준 + 바람).
 *
 * 화면: 에디터 main.json(SSOT) 렌더 — 러시모어 양궁장 배경 + 과녁(필드 위치) + 1인칭 활 + HUD.
 * 핵심: 배경+과녁+박힌 화살을 하나의 'world' 컨테이너에 묶고, 활시위를 당기면 그 컨테이너를
 *       과녁 중심(aim)을 축으로 통째로 줌인한다 → 과녁이 배경에 붙은 채 필드와 동일하게 확대/축소.
 *
 * 흐름:
 *   1) 과녁/활/D패드 시작 위치는 에디터 노드 그대로.
 *   2) 흰 원(드로우 핸들)을 하단 파란 원(앵커)으로 당긴다.
 *   3) 당기면 활이 들리고(완전 드로우 시 수직), 필드가 과녁 중심을 축으로 줌인된다(별도 조준선 없음).
 *   4~5) 완전 드로우에서 흰 원이 떨려 중앙 정렬이 어렵고, 이 떨림과 과녁 조준이 동기화된다.
 *   6) 파란 원 아래로 더 당기면(오버드로우) 바람 영향↓·화살 속도↑, 대신 떨림 진폭↑.
 *   7) 손을 떼면 긴 화살이 날아가 맞은 위치에 박힌다(줌 인/아웃과 무관하게 과녁에 붙어 유지).
 *   8~9) 점수 + 활은 오른쪽으로 회전하며 내려갔다 원위치. 3R×3발 후 총점/다시하기.
 */
import Phaser from 'phaser';
import { isAdGateTurn, playGateAd } from '@casual/core';
import { getStore } from '@casual/core/store/index.js';
import { FONT } from '@casual/core';
import { ARROW_KEY, HOLE_KEY, SPARK_KEY, UI_LAYOUT_KEY } from '../assets.js';
import { buildLayout, type LayoutDoc, type LayoutIndex } from '../ui/layoutLoader.js';
import { maxScore, ringTint, scoreForDistance, scoreLabel } from '../logic/score.js';
import { loadIdentity, buildNpcScores, rankBoard, type Identity, type NpcRow } from '../logic/leaderboard.js';
import { mountLiveRankPanel, type LiveRankPanel } from '../ui/liveRankPanel.js';

// ── 진행 규칙 ──
const ROUNDS = 3;
const ARROWS_PER_ROUND = 3;

// ── 에디터 노드 id (main.json) ──
const NODE = {
  bg: 'layer_1',
  target: 'layer_2',
  bow: 'layer_4',
  roundBadge: 'layer_3',
  gauge: 'layer_3_copy2',
  dpad: 'layer_3_copy4',
  windDialText: 'layer_5_copy', // 좌측 다이얼 수치 텍스트 → 바람 표시
  timeDialText: 'layer_5_copy2', // 우측 다이얼 수치 텍스트 → 타임어택 카운트다운
  resultTarget: 'layer_6', // 우측 상단 큰 과녁(BG_04) — 발사 후 명중 위치 확대 표시(평상시 숨김)
} as const;

// ── 타임어택 ──
const SHOT_TIME = 20; // 한 발 제한시간(초). 만료 시 자동 발사 or 시간초과 미스.

// ── 명중 결과 표시 과녁(에디터 layer_6, 우측에서 슬라이드 인) ──
const RESULT_SHOW_MS = 5000; // 명중 위치를 표시하는 시간(ms) 후 우측으로 사라짐
// 결과 과녁의 득점반경 분율 — 겨냥 과녁(BG_03)의 SCORE_R_FRAC 와 동일하게 두어, 겨냥 과녁의 화살
// 명중점과 결과 과녁의 타격점이 '같은 링'에 정밀하게 일치하도록 한다(두 과녁 모두 동일 표적 디자인 가정).
const RESULT_SCORE_R_FRAC = 0.424; // 겨냥 과녁 링과 시각적으로 일치(BG_03 0.42/faceR0.467 × BG_04 faceR0.471)
const RESULT_GOLD_FX = 0.498; // 결과 과녁(BG_04) 골드 중심 X 분율(링 무게중심) — 점 원점 보정
const RESULT_GOLD_FY = 0.5; // 결과 과녁 골드 중심 Y 분율(링 무게중심)
const RESULT_DOT_R_FRAC = 0.014; // 명중 점 반경 = 과녁 표시폭 × 이 값(작게)
const RESULT_DOT_COLOR = 0x8f1d1d; // 이전(히스토리) 타격점 색 — 검붉은색(crimson)
const RESULT_DOT_LAST_COLOR = 0x18ff5a; // 마지막 타격점 색 — 녹색

// ── 줌(필드 전체) ──
const ZOOM_FULL = 5.5; // 완전 드로우 시 필드 배율(과녁이 크게 줌인되도록)
// 불스아이(노란 중심)의 과녁 이미지(BG_03) 내 위치 — 파랑·빨강 링 무게중심(대형 뚜렷 영역)으로 확정:
// 골드 = (0.498, 0.379). 사용자 편향 피드백(좌상↔우하) 양쪽과 정확히 일치. aim 을 실제 골드에 맞춰
// 시각적 골드 조준=10점·결과 과녁 타격점 편향 제거.
const BULLSEYE_DX = 0.007; // 이미지 중심 대비 골드 X(피드백 수렴: 살짝 우측)
const BULLSEYE_UP = 0.113; // 이미지 중심 대비 골드가 위로 올라간 정도(골드 Y≈0.387, 피드백 수렴)
const SCORE_R_FRAC = 0.42; // 득점 반지름 = 과녁 폭 × 이 비율

// ── 드로우(활시위) — 세로 HD 1080×2400 좌표 ──
const HANDLE_R = 69;
const HANDLE_TRAVEL = 525; // 흰 원 시작점 → 파란 원까지의 세로 거리(px).
const START_ZONE_Y = 1050; // 이 아래를 누르면 드로우 시작
const DRAW_MIN = 0.9; // 발사 가능한 최소 드로우
// ── 최대 시위 당김 + 미세 2D 조준 ──
// 흰 원(드로우 핸들)을 파란 원 중심까지 당기면=최대 시위 당김. 이때 파란 원 외곽에 붉은 링 표시.
// 이 시점부터 손가락 미세 이동으로 십자선(조준점)을 상하좌우로 움직여 겨냥한다(아주 미세한 움직임에도 반응).
const MAXDRAW_LATCH = 0.985; // 이 드로우 진행도에서 흰 원이 파란 원 중심에 겹쳤다고 보고 최대 당김 확정
const FINE_GAIN = 1.4; // 최대 당김 후 손가락 이동 → 십자선 이동 배수(미세 조준)
const NUDGE_MAX = 180; // 손가락 조준 이동 한계(px)
const FINE_SMOOTH = 13; // 미세 조준 스무딩(관성) 속도 — 낮을수록 부드럽고 느긋

// ── 세로 조준(양궁 기본 방식 + 오버드로우 미세조준) ──
// 드로우를 당길수록 조준(십자선)이 과녁 '상단(위지점)'까지 떠오르고, 파란 원 아래로 더 당기면
// (오버드로우) 조준이 상단→중심→하단으로 '천천히 내려온다'. 오버드로우 깊이(curO)가 곧 세로
// 미세조준이라, 원하는 지점(중앙/상단/하단)에서 손을 떼면 그 곳에 명중. 과녁은 화면 중앙 고정,
// 이동하는 건 조준 십자선(=실제 착탄 예상점). 좌우는 미세 조준으로 바람을 보정한다.
// 세로 조준 범위 — 시위를 당길수록 조준이 과녁 상단→중심→하단으로 '서서히 내려온다'.
// aimSpan = curD + curO - 1 : -1(가벼운 당김=상단) → 0(파란 원=중심) → +1(오버드로우=하단).
const AIM_TOP = 0.85; // × 득점반경: 상단/하단 조준 최대 오프셋
const AIM_SWAY = 0.05; // × 득점반경: 기본 조준 유동 진폭(느리게 흐름)
// ── 활시위 긴장 유동 — 파란 원을 지나(오버드로우) 시위를 최대로 당길수록·오래 버틸수록 커지는 '느린 유동'. ──
// 고주파 떨림이 아니라 서서히 흐르는 조준 유동으로 조준을 어렵게 함(긴장감). 상단=거의 정지, 하단=크게 유동.
const AIM_TENSION_SHAKE = 0.05; // × 득점반경: 최대 당김 유동 최대 게인(과하지 않게)
const TENSION_FREQ = 1.1; // 조준 유동 각속도(rad/s) — 낮게=아주 서서히 흐르는 유동(빠른 떨림 아님)
const TENSION_BUILD = 2.4; // 최대 당김 유지 시 유동이 최대까지 차오르는 시간(초, 더 서서히)

// ── 바람 시스템 ──
// 매 발 좌우 바람이 조준 십자선(=착탄 예상점)을 옆으로 민다. 좌우 미세조준(STEER)으로 바람 반대쪽을
// 겨눠 상쇄 → 십자선을 과녁 중앙에 정확히 올리면 명중. (오버드로우는 세로 미세조준에 쓰이므로 바람과 분리.)
const WIND_ENABLED = true; // 바람 시스템 ON
const WIND_PX = 44; // 바람 최대 가로 편차(px, 줌 화면 기준). 좌우 조준 가동폭(STEER_X·GAIN) 안이라 보정 가능.

// ── 활/화살 ──
const BOW_ZOOM = 0.42; // 완전 드로우 시 활도 확대(필드 줌과 함께 — 활은 이미 크므로 적당히)
// 활 사이트(원형 링)의 활 텍스처 내 실측 위치(분율). 완전 드로우 시 이 점을 조준점(aim)에 정렬.
const SIGHT_FX = 0.641; // 볼트링 geometric center(외곽박스 중심) = aim. 직접 측정(녹색 십자선 대비) 정렬.
const SIGHT_FY = 0.478;
const FLIGHT_MS = 300; // 화살 비행시간(짧을수록 빠름). 오버드로우면 SPEED_BONUS 만큼 더 단축.
const ARROW_ORIGIN = { x: 507, y: 1901 }; // 세로 HD — 활 그립 부근(바닥정렬 시 +extra)
const ARROW_FLIGHT_START = 1.95; // 비행 시작 — 가까이서 큰 화살(HD ×1.5)
const ARROW_FLIGHT_END = 0.42; // 비행 끝 — 멀어지며 작은 화살(HD ×1.5)
const HOLE_STICK_SCREEN = 0.21; // 박히는 순간 명중 구멍의 화면 스케일(HD ×1.5)
const SHOW_SCORE_MS = 1050;

type Phase = 'ready' | 'draw' | 'flight' | 'scored' | 'gameover';

// ── 에너지바(파워 게이지) ──
const GAUGE_CAP = 0.82; // 채움 상한(너무 위까지 차지 않게)
const GAUGE_SMOOTH = 7; // 스무스 따라가기 속도(클수록 빠름) — 기계적이지 않게

// ── 호흡(전체 화면) — 숨 들이쉬고 내쉬는 템포로 화면 전체가 미세하게 확대↔축소. ──
// 메인 카메라 줌을 천천히 진동시킨다(렌더만 변형 → 조준 좌표계는 그대로라 게임플레이 영향 없음).
const BREATH_PERIOD = 5.2; // 한 호흡(들숨+날숨) 주기(초). 편안한 호흡 ≈ 분당 11~12회.
const BREATH_AMP = 0.018; // world 줌 진폭(1.0 → 1.018). 미세하게(과녁 뷰에만 적용).
const BREATH_AIM_AMP = 0.12; // × 득점반경: 최대 당김 시 숨쉬기로 인한 십자선 세로 유동(느린 상하)

// ── 반응형 화면(긴 화면/플립폰) ──
// 본편도 로딩처럼 캔버스를 창 전체로 확장(FIT 레터박스 제거) → 중앙배치 어긋남 해소.
// 배경은 화면을 cover(끝부분까지), 상단 메뉴는 상단 가장자리, 하단 컨트롤/활/다이얼은 바닥에 정렬.
const DESIGN_W = 1080; // 에디터 디자인 폭(세로 HD, 고정)
const DESIGN_H = 2400; // 에디터 디자인 밴드 높이(세로 HD)
const MAX_FILL_H = 2900; // 캔버스 세로 확장 상한(초장폰 수용, DESIGN_H 초과분만 하단정렬로 흡수)
// 하단 정렬 그룹 — 화면이 길면 'extra'(=canvasH-2400)만큼 아래로 내려 화면 바닥에 붙는다.
// (활 layer_4 는 별도 처리. 여기엔 D패드·바람/타이머 다이얼·그 수치 텍스트.)
const BOTTOM_NODE_IDS = ['layer_3_copy4', 'layer_3_copy5', 'layer_5_copy2', 'layer_3_copy6', 'layer_5_copy'] as const;

const lerp = Phaser.Math.Linear;
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

export class PlayScene extends Phaser.Scene {
  private layout!: LayoutIndex;

  // 반응형 화면(창 채움) — 캔버스 높이/여백/배경 cover 변환.
  private canvasH = DESIGN_H;
  private extra = 0; // 디자인 밴드(2400) 초과분 — 하단 그룹을 이만큼 내린다.
  private coverScale = 1; // world(배경+과녁) 기본 배율(배경이 캔버스를 덮도록)
  private coverPos = { x: 0, y: 0 }; // world 기본 위치(줌=0일 때)

  // 필드 줌 컨테이너(배경+과녁+박힌 화살)
  private world!: Phaser.GameObjects.Container;
  private aim = { x: 520, y: 1112 }; // 과녁 중심(불스아이) 화면 위치 = 줌 축 (세로 HD 폴백)
  private restScoreR = 45;
  private scoreR = 45;
  private stuck: Phaser.GameObjects.GameObject[] = [];
  // world 호흡(숨쉬기) — 호흡 제외 base 변환을 저장하고 breathScale 을 곱해 world 에만 적용.
  private worldBaseS = 1;
  private worldBaseX = 0;
  private worldBaseY = 0;
  private breathScale = 1;

  // 활
  private bowImg?: Phaser.GameObjects.Image;
  private bowBaseX = 0;
  private bowBaseY = 0;
  private bowBaseAngle = 0;
  private bowBaseScaleX = 1;
  private bowBaseScaleY = 1;
  private bowFullX = 0; // 완전 드로우 시 활 위치(사이트가 aim 에 오도록)
  private bowFullY = 0;

  // 드로우 컨트롤
  private handle!: Phaser.GameObjects.Arc;
  private anchorRing!: Phaser.GameObjects.Arc;
  private redRing!: Phaser.GameObjects.Arc; // 최대 시위 당김 표시 — 파란 원 외곽 붉은 링
  private anchor = { x: 540, y: 2005 };
  private handleStart = { x: 540, y: 1480 };
  // 최대 당김 후 미세 2D 조준(손가락 이동 → 십자선 이동, 가속도+스무딩)
  private maxDraw = false;
  private nudge = { x: 0, y: 0 };
  private nudgeOrigin = { x: 0, y: 0 };
  private fineAim = { x: 0, y: 0 }; // 스무딩된 미세 조준점(관성)
  private drawKnob!: Phaser.GameObjects.Rectangle;
  private aimReticle!: Phaser.GameObjects.Graphics; // 정밀 조준 십자선 — 정확히 aim(=화살 도착점) 위
  private gaugeTopY = 488;
  private gaugeBotY = 1095;
  private gaugeX = 1004;

  // HUD
  private scoreText!: Phaser.GameObjects.Text;
  private windText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private editRound?: Phaser.GameObjects.Text; // 에디터 배지 라운드 텍스트(layer_5) 구동
  private promptText!: Phaser.GameObjects.Text;
  private popupText!: Phaser.GameObjects.Text;
  private gaugeFill = 0; // 에너지바 현재 채움(스무스)
  private gaugeTarget = 0; // 에너지바 목표 채움

  // 상태
  private phase: Phase = 'ready';
  private round = 1;
  private arrowInRound = 0;
  private totalScore = 0;
  private holdX = 540;
  private holdY = 1480;
  private curD = 0;
  private wobbleT = 0;
  private tensionHold = 0; // 0~1 최대 당김 유지 축적(길게 버틸수록 긴장 유동↑)
  private breathT = 0; // 호흡 위상 누적(초) — 화면 전체 미세 줌 진동
  private wind = { x: 0, y: 0 };
  private windOffNow = { x: 0, y: 0 }; // 현재 바람 편차(px) — 녹색 십자선=aim+이것=실제 착탄점
  private curHit = { x: 0, y: 0 };
  private resetTween?: Phaser.Tweens.Tween;

  // 타임어택(우측 다이얼) + 바람 표시(좌측 다이얼)
  private shotTimeLeft = SHOT_TIME;
  private windDialText?: Phaser.GameObjects.Text;
  private timeDialText?: Phaser.GameObjects.Text;

  // 명중 결과 표시 과녁(에디터 layer_6, 우측에서 슬라이드 인 → 5초 후 우측으로 사라짐) — 평상시 숨김.
  private resultPanel?: Phaser.GameObjects.Container; // layer_6 + 명중 점을 담는 슬라이드 컨테이너
  private resultTargetW = 734; // 결과 과녁 표시 폭(px, layer_6)
  private resultDots: Phaser.GameObjects.GameObject[] = [];
  private resultHomeX = 0; // 표시 위치 X(에디터 배치)
  private resultOffX = 0; // 숨김(우측 밖) X
  private resultTween?: Phaser.Tweens.Tween;
  private resultHideCall?: Phaser.Time.TimerEvent;

  // 실시간 글로벌 랭킹(왼쪽 패널) — 식별자/NPC 사다리는 판 시작 시 1회, 내 총점으로 매 갱신.
  private identity!: Identity;
  private npcs: NpcRow[] = [];
  private liveRank?: LiveRankPanel;

  constructor() {
    super('play');
  }

  create(): void {
    const doc = this.cache.json.get(UI_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!doc || !doc.nodes) {
      this.add
        .text(this.scale.width / 2, this.scale.height / 2, '레이아웃을 불러오지 못했습니다', {
          fontFamily: FONT.family,
          fontSize: '26px',
          color: '#ffffff',
        })
        .setOrigin(0.5);
      return;
    }

    // 0) 본편도 창 전체를 채우게 캔버스 확장(로딩과 동일) — 레터박스 제거 → 중앙배치 어긋남 해소.
    this.canvasH = this.fillViewport();

    // 1) 에디터 디자인(SSOT) 렌더.
    this.layout = buildLayout(this, doc);

    const bgImg = this.layout.tryById<Phaser.GameObjects.Image>(NODE.bg);
    const targetImg = this.layout.tryById<Phaser.GameObjects.Image>(NODE.target);

    // 배경+과녁을 world 컨테이너로 묶는다(함께 줌·cover). 자식 순서: 배경→과녁.
    this.world = this.add.container(0, 0).setDepth(2);
    if (bgImg) this.world.add(bgImg);
    if (targetImg) this.world.add(targetImg);

    // 활 — 에디터가 조정한 시작 위치/각도. 완전 드로우 시 수직(0°). (Y 위치/완전드로우는 layoutResponsive 에서.)
    this.bowImg = this.layout.tryById<Phaser.GameObjects.Image>(NODE.bow);
    if (this.bowImg) {
      this.bowBaseX = this.bowImg.x;
      this.bowBaseY = this.bowImg.y;
      this.bowBaseAngle = this.bowImg.angle;
      this.bowBaseScaleX = this.bowImg.scaleX;
      this.bowBaseScaleY = this.bowImg.scaleY;
    }

    // 드로우 게이지 기하(상단 정렬 — 이동 없음).
    const gNode = this.layout.nodeById(NODE.gauge);
    if (gNode && gNode.w && gNode.h) {
      this.gaugeX = gNode.x;
      const top = gNode.y - gNode.h / 2;
      const bot = gNode.y + gNode.h / 2;
      this.gaugeTopY = top + gNode.h * 0.14;
      this.gaugeBotY = bot - gNode.h * 0.05;
    }

    // 2) 흰 원/파란 원 + 최대 당김 붉은 링 + 게이지 노브.
    this.anchorRing = this.add
      .circle(this.anchor.x, this.anchor.y, 60, 0x35a7ff, 0.26)
      .setStrokeStyle(5, 0x35a7ff, 0.85)
      .setDepth(19);
    // 최대 시위 당김 표시 — 파란 원 외곽 붉은 링(평상시 숨김).
    this.redRing = this.add
      .circle(this.anchor.x, this.anchor.y, 76, 0xff2b2b, 0)
      .setStrokeStyle(7, 0xff2b2b, 0.95)
      .setDepth(20)
      .setVisible(false);
    this.handle = this.add
      .circle(this.handleStart.x, this.handleStart.y, HANDLE_R, 0xffffff, 0.42)
      .setStrokeStyle(6, 0xffffff, 0.92)
      .setDepth(21);
    const gw = (gNode?.w ?? 96) * 0.82;
    this.drawKnob = this.add
      .rectangle(this.gaugeX, this.gaugeBotY, gw, 18, 0xffe14d, 1)
      .setStrokeStyle(3, 0x0a2540, 0.85)
      .setDepth(18)
      .setVisible(false);

    // 정밀 조준 십자선 — 정확히 aim 위. 화살은 aim 으로 가므로 "조준=명중"이 항상 일치(편차 0).
    this.aimReticle = this.add.graphics().setDepth(17);
    this.drawAimReticle();

    // 명중 결과 표시 과녁(에디터 layer_6) — 평상시 숨김, 발사 후 우측에서 슬라이드 인.
    this.setupResultPanel();

    // 3) HUD 텍스트 (세로 HD).
    this.scoreText = this.add
      .text(this.scale.width / 2, 131, '0', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '69px', color: '#ffffff' })
      .setOrigin(0.5)
      .setStroke('#0a2540', 12)
      .setDepth(22);
    this.windText = this.add
      .text(this.scale.width / 2, 218, '', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '30px', color: '#d7f5ff' })
      .setOrigin(0.5)
      .setStroke('#0a2540', 6)
      .setDepth(22);
    const badge = this.layout.nodeById(NODE.roundBadge);
    this.roundText = this.add
      .text(badge ? badge.x : 123, badge ? badge.y + 82 : 178, '', {
        fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
        fontSize: '30px',
        color: '#ffe082',
      })
      .setOrigin(0.5)
      .setStroke('#0a2540', 8)
      .setDepth(22);
    // 에디터 배지의 라운드 텍스트(layer_5)를 게임 라운드로 구동 → 내 중복 오버레이는 숨김.
    this.editRound = this.layout.tryById<Phaser.GameObjects.Text>('layer_5');
    if (this.editRound) this.roundText.setVisible(false);
    // 좌/우 다이얼 수치 텍스트 → 바람 / 타임어택 구동.
    this.windDialText = this.layout.tryById<Phaser.GameObjects.Text>(NODE.windDialText);
    this.timeDialText = this.layout.tryById<Phaser.GameObjects.Text>(NODE.timeDialText);
    this.promptText = this.add
      .text(this.scale.width / 2, 2250, '', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '39px', color: '#ffffff' })
      .setOrigin(0.5)
      .setStroke('#0a2540', 9)
      .setDepth(22);
    this.popupText = this.add
      .text(0, 0, '', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '69px', color: '#ffffff' })
      .setOrigin(0.5)
      .setStroke('#0a2540', 11)
      .setDepth(25)
      .setVisible(false);

    // 4) 입력 — 드래그.
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);

    // 5) 실시간 글로벌 랭킹(왼쪽). 판 시작마다 식별자 로드 + NPC 사다리 고정 → 내 총점으로 매 갱신.
    this.identity = loadIdentity();
    this.npcs = buildNpcScores(this.identity);
    this.liveRank = mountLiveRankPanel({
      canvas: this.game.canvas,
      designW: this.scale.width,
      designH: this.scale.height,
    });
    // 씬 종료/재시작 시 패널 정리(잔상/누수 방지).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.liveRank?.destroy());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.liveRank?.destroy());

    // 5b) 반응형 배치 — 배경 cover + aim/활/앵커/프롬프트 위치 확정(긴 화면 대응).
    this.layoutResponsive();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onOrientation);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('resize', this.onResize);
      window.removeEventListener('orientationchange', this.onOrientation);
    });

    // 6) 시작.
    this.round = 1;
    this.arrowInRound = 0;
    this.totalScore = 0;
    this.updateScoreHud();
    this.refreshRank();
    this.clearStuck();
    this.toReady();
  }

  /** 내 현재 총점을 NPC 사다리에 끼워 왼쪽 패널을 실시간 갱신. */
  private refreshRank(): void {
    if (!this.liveRank) return;
    this.liveRank.update(rankBoard(this.npcs, this.identity, this.totalScore));
  }

  // ── 준비 상태 ─────────────────────────────────────────────────

  private toReady(): void {
    this.phase = 'ready';
    this.curD = 0;
    this.tensionHold = 0;
    this.maxDraw = false;
    this.nudge = { x: 0, y: 0 };
    // 휴식 시 조준은 과녁 상단(당김 시작=상단, 당길수록 서서히 하강) — 드로우 시작 시 튀지 않게.
    this.curHit = { x: 0, y: -this.restScoreR * AIM_TOP };
    this.holdX = this.anchor.x;
    this.holdY = this.handleStart.y;
    this.rollWind();
    this.windOffNow = { x: this.wind.x * WIND_PX, y: this.wind.y * WIND_PX };
    this.drawAimReticle();
    this.setZoom(0);
    this.setBow(0);
    this.shotTimeLeft = SHOT_TIME; // 타임어택 리셋
    this.timeDialText?.setText(this.shotTimeLeft.toFixed(1));
    this.handle.setVisible(true).setPosition(this.handleStart.x, this.handleStart.y);
    this.anchorRing.setVisible(true);
    this.redRing.setVisible(false);
    this.drawKnob.setVisible(false);
    this.aimReticle.setVisible(true);
    this.promptText.setText('흰 원을 파란 원까지 당긴 뒤, 미세 조준해 발사');
    this.updateRoundHud();
  }

  private rollWind(): void {
    if (!WIND_ENABLED) {
      this.wind = { x: 0, y: 0 };
      this.windText.setText('바람 없음');
      this.windDialText?.setText('0.0');
      return;
    }
    // 가로 바람만(세로는 조준 보정 수단이 없음). 부호 랜덤, 세기 0.4~1.0.
    const mag = 0.4 + Math.random() * 0.6;
    this.wind = { x: (Math.random() < 0.5 ? -1 : 1) * mag, y: 0 };
    const arrows = Math.max(1, Math.round(mag * 3));
    const dir = this.wind.x >= 0 ? '▶'.repeat(arrows) : '◀'.repeat(arrows);
    this.windText.setText(`바람  ${dir}  ${(mag * 10).toFixed(0)}`);
    // 좌측 다이얼 — 풍속(m/s 느낌) + 방향 화살표.
    const arrow = this.wind.x >= 0 ? '▶' : '◀';
    this.windDialText?.setText(`${arrow}${(mag * 3).toFixed(1)}`);
  }

  // ── 입력 ──────────────────────────────────────────────────────

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (this.phase === 'gameover') {
      // 3경기마다 관문(전면) 광고(`@casual/core` adPolicy, 2026-09-02 광고 모델).
      //   경기 수는 localStorage 누적(앱을 껌다 켜도 주기 유지).
      const played = this.bumpPlayCount();
      const { ads } = getStore();
      const gate = isAdGateTurn({
        count: played,
        adsUsable: ads.fullscreenSupported || ads.allowPlaceholders,
        every: 3,
      });
      if (!gate) this.scene.restart();
      else playGateAd(this, ads, () => this.scene.restart());
      return;
    }
    if (this.phase !== 'ready') return;
    if (p.y < START_ZONE_Y) return;
    this.resetTween?.stop();
    this.phase = 'draw';
    this.wobbleT = 0;
    this.tensionHold = 0;
    this.maxDraw = false;
    this.nudge = { x: 0, y: 0 };
    this.fineAim = { x: 0, y: 0 };
    this.redRing.setVisible(false);
    this.updateDrawFromPointer(p);
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (this.phase !== 'draw' || !p.isDown) return;
    this.updateDrawFromPointer(p);
  }

  private onPointerUp(): void {
    if (this.phase !== 'draw') return;
    if (this.curD >= DRAW_MIN) this.fire();
    else this.cancelDraw();
  }

  private updateDrawFromPointer(p: Phaser.Input.Pointer): void {
    if (this.maxDraw) {
      // 최대 시위 당김 이후 — 손가락 미세 이동으로 십자선을 상하좌우로 겨냥(아주 미세한 움직임에도 반응).
      this.nudge = {
        x: Phaser.Math.Clamp(p.x - this.nudgeOrigin.x, -NUDGE_MAX, NUDGE_MAX),
        y: Phaser.Math.Clamp(p.y - this.nudgeOrigin.y, -NUDGE_MAX, NUDGE_MAX),
      };
      this.curD = 1;
      this.setBow(1);
      this.promptText.setText('미세 조준 — 바람을 고려해 조준하고 손을 떼세요');
      return;
    }
    // 드로우 단계 — 흰 원을 파란 원으로 당긴다(세로만). 파란 원 중심에 겹치면 최대 당김 확정.
    this.holdX = this.anchor.x;
    this.holdY = Phaser.Math.Clamp(p.y, this.handleStart.y, this.anchor.y);
    this.curD = Phaser.Math.Clamp((this.holdY - this.handleStart.y) / (this.anchor.y - this.handleStart.y), 0, 1);
    if (this.curD >= MAXDRAW_LATCH) {
      // 최대 시위 당김 — 흰 원 파란 원에 고정, 붉은 링 표시, 이후 미세 2D 조준.
      this.maxDraw = true;
      this.curD = 1;
      this.holdY = this.anchor.y;
      this.nudgeOrigin = { x: p.x, y: p.y };
      this.nudge = { x: 0, y: 0 };
      this.fineAim = { x: 0, y: 0 };
      this.tensionHold = 0;
      this.handle.setPosition(this.anchor.x, this.anchor.y);
      this.redRing.setVisible(true).setScale(1.4).setAlpha(0);
      this.tweens.add({ targets: this.redRing, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    }
    this.setBow(this.curD);
    this.promptText.setText(
      this.curD >= MAXDRAW_LATCH ? '미세 조준 — 손을 떼세요' : '흰 원을 파란 원까지 당기세요',
    );
  }

  // ── 줌(필드 전체) / 활 ────────────────────────────────────────

  /** world 컨테이너를 과녁 중심(aim)을 축으로 줌 d(0~1). 과녁은 화면 중앙(aim) 고정(드리프트 없음) —
   *  이동하는 건 조준 십자선(reticle). 기본 배율/위치는 cover(coverScale/coverPos)=줌0. */
  private setZoom(d: number): void {
    const k = lerp(1, ZOOM_FULL, easeOut(d)); // cover 기준 추가 줌 배율
    // 호흡(숨쉬기)은 world(배경+과녁)에만 적용 → base(호흡 제외) 값을 저장하고 applyWorldBreath 에서 곱한다.
    // (UI/컨트롤/활은 호흡 영향 없음 — 카메라 전체 줌이 아니라 world 컨테이너만 미세 진동.)
    this.worldBaseS = this.coverScale * k;
    this.worldBaseX = this.aim.x - k * (this.aim.x - this.coverPos.x);
    this.worldBaseY = this.aim.y - k * (this.aim.y - this.coverPos.y);
    this.applyWorldBreath();
    this.scoreR = this.restScoreR * k; // restScoreR 은 cover 반영 화면반경
    this.gaugeTarget = d * GAUGE_CAP; // 게이지 목표(스무스 따라감은 update 에서)
  }

  /** 호흡 배율(breathScale)을 world(배경+과녁)에만 적용 — 과녁 중심(aim)을 축으로 미세 확대/축소.
   *  UI·활·컨트롤은 건드리지 않으므로 '숨쉬기'가 화면 전체가 아니라 게임 뷰(과녁)에만 나타난다. */
  private applyWorldBreath(): void {
    const b = this.breathScale;
    this.world.setScale(this.worldBaseS * b);
    this.world.setPosition(
      this.aim.x + b * (this.worldBaseX - this.aim.x),
      this.aim.y + b * (this.worldBaseY - this.aim.y),
    );
  }

  /** 본편 캔버스를 창 비율로 늘려 화면을 꽉 채운다(FIT 레터박스 제거). 반환=적용 높이. */
  private fillViewport(): number {
    const vw = (typeof window !== 'undefined' && window.innerWidth) || DESIGN_W;
    const vh = (typeof window !== 'undefined' && window.innerHeight) || DESIGN_H;
    const h = Phaser.Math.Clamp(Math.round((DESIGN_W * vh) / vw), DESIGN_H, MAX_FILL_H);
    this.scale.setGameSize(DESIGN_W, h);
    this.scale.refresh();
    return h;
  }

  private onResize = (): void => {
    this.canvasH = this.fillViewport();
    // 순위표는 단계 무관 항상 캔버스에 맞춰 재배치(캔버스 리사이즈 직후 → 정확한 rect 로 추종).
    this.liveRank?.reposition();
    // 활성 드로우/비행 중 재배치는 조준을 흔드므로, 안정 단계에서만 전체 재배치.
    if (this.phase === 'ready' || this.phase === 'gameover') this.layoutResponsive();
  };

  private onOrientation = (): void => {
    setTimeout(() => this.onResize(), 100);
  };

  /** 반응형 배치(멱등) — 디자인 노드 원본좌표 기준으로 매번 다시 계산.
   *  · 배경(world)=캔버스 cover  · 상단 HUD=상단 고정  · 하단 컨트롤/활/다이얼=바닥 정렬. */
  private layoutResponsive(): void {
    this.canvasH = this.scale.height;
    this.extra = Math.max(0, this.canvasH - DESIGN_H);

    // 하단 그룹 — 디자인 Y + extra(노드 원본좌표 기준이라 여러 번 호출해도 안전).
    for (const id of BOTTOM_NODE_IDS) {
      const o = this.layout.tryById<Phaser.GameObjects.Image | Phaser.GameObjects.Text>(id);
      const n = this.layout.nodeById(id);
      if (o && n) o.setY(n.y + this.extra);
    }

    // 배경 cover — bg 가 캔버스(DESIGN_W×canvasH)를 덮도록 world 기본 배율/위치 산출.
    const bgImg = this.layout.tryById<Phaser.GameObjects.Image>(NODE.bg);
    const targetImg = this.layout.tryById<Phaser.GameObjects.Image>(NODE.target);
    if (bgImg) {
      this.coverScale = Math.max(DESIGN_W / bgImg.displayWidth, this.canvasH / bgImg.displayHeight);
      this.coverPos = {
        x: DESIGN_W / 2 - this.coverScale * bgImg.x,
        y: this.canvasH / 2 - this.coverScale * bgImg.y,
      };
    }

    // 과녁 중심(aim) + 득점반경 — cover 변환 후 화면좌표.
    if (targetImg) {
      const lx = targetImg.x + targetImg.displayWidth * BULLSEYE_DX;
      const ly = targetImg.y - targetImg.displayHeight * BULLSEYE_UP;
      this.aim = { x: this.coverPos.x + this.coverScale * lx, y: this.coverPos.y + this.coverScale * ly };
      this.restScoreR = targetImg.displayWidth * this.coverScale * SCORE_R_FRAC;
    }


    // 활 — 바닥 정렬(디자인 Y + extra) + 완전드로우 사이트→aim.
    if (this.bowImg) {
      const bowNode = this.layout.nodeById(NODE.bow);
      this.bowBaseY = (bowNode ? bowNode.y : this.bowImg.y) + this.extra;
      this.bowImg.setY(this.bowBaseY);
      const fz = 1 + BOW_ZOOM;
      this.bowFullX = this.aim.x - (SIGHT_FX - 0.5) * this.bowImg.width * this.bowBaseScaleX * fz;
      this.bowFullY = this.aim.y - (SIGHT_FY - 0.5) * this.bowImg.height * this.bowBaseScaleY * fz;
    }

    // 파란 원(앵커)=바닥 정렬 D패드 중심, 흰 원 시작점은 그 위.
    const dpadO = this.layout.tryById<Phaser.GameObjects.Image>(NODE.dpad);
    this.anchor = { x: dpadO ? dpadO.x : 540, y: dpadO ? dpadO.y : 2005 + this.extra };
    this.handleStart = { x: this.anchor.x, y: this.anchor.y - HANDLE_TRAVEL };
    this.anchorRing?.setPosition(this.anchor.x, this.anchor.y);

    // 프롬프트 — 화면 하단 가장자리.
    this.promptText?.setPosition(DESIGN_W / 2, this.canvasH - 146);

    // 안정 단계면 줌/조준/흰 원을 cover 기준 휴식 상태로 갱신.
    if (this.phase === 'ready') {
      this.setZoom(0);
      this.handle?.setPosition(this.handleStart.x, this.handleStart.y);
      this.drawAimReticle();
    }

    // 좌상단 순위표도 같은 흐름에서 캔버스에 맞춰 재배치(반응형).
    this.liveRank?.reposition();
  }

  private setBow(d: number): void {
    if (!this.bowImg) return;
    const e = easeOut(d);
    // 활(사이트=활의 과녁)이 조준 십자선과 함께 움직인다 — 활 사이트가 녹색 십자선(=aim + 조준오프셋,
    // 바람 제외)에 정확히 얹히도록 같은 오프셋을 따라간다.
    const offX = this.curHit.x;
    const offY = this.curHit.y;
    this.bowImg.setPosition(
      lerp(this.bowBaseX, this.bowFullX, e) + offX * e,
      lerp(this.bowBaseY, this.bowFullY, e) + offY * e,
    );
    this.bowImg.setAngle(lerp(this.bowBaseAngle, 0, e));
    this.bowImg.setScale(this.bowBaseScaleX * (1 + BOW_ZOOM * e), this.bowBaseScaleY * (1 + BOW_ZOOM * e));
  }

  private clearStuck(): void {
    for (const o of this.stuck) o.destroy();
    this.stuck = [];
  }

  /** 조준 십자선을 플레이어 조준점(aim + 조준오프셋) 위에 그린다. **바람은 표시하지 않는다** —
   *  화살은 바람만큼 밀리므로, 플레이어가 바람(좌측 다이얼)을 고려해 반대쪽으로 겨눠야 한다. */
  private drawAimReticle(): void {
    const a = {
      x: this.aim.x + this.curHit.x,
      y: this.aim.y + this.curHit.y,
    };
    const g = this.aimReticle;
    g.clear();
    g.lineStyle(4.5, 0x000000, 0.5);
    g.strokeCircle(a.x, a.y, 18);
    g.lineStyle(4, 0x2bff66, 0.95);
    g.strokeCircle(a.x, a.y, 18);
    g.beginPath();
    g.moveTo(a.x - 32, a.y); g.lineTo(a.x - 11, a.y);
    g.moveTo(a.x + 11, a.y); g.lineTo(a.x + 32, a.y);
    g.moveTo(a.x, a.y - 32); g.lineTo(a.x, a.y - 11);
    g.moveTo(a.x, a.y + 11); g.lineTo(a.x, a.y + 32);
    g.strokePath();
    g.fillStyle(0x2bff66, 1);
    g.fillCircle(a.x, a.y, 2.7);
  }

  // ── 발사/취소 ─────────────────────────────────────────────────

  private cancelDraw(): void {
    this.phase = 'scored';
    this.springBack(this.curD, () => this.toReady());
  }

  private fire(): void {
    this.phase = 'flight';
    this.promptText.setText('');
    this.handle.setVisible(false);
    this.anchorRing.setVisible(false);
    this.redRing.setVisible(false);
    this.gaugeTarget = 0; // 발사 = 시위 놓음 → 에너지바 비워짐(스무스)
    this.aimReticle.setVisible(false);

    const sR = this.scoreR;
    // 착탄 = 조준 십자선 위치(aim + 조준오프셋 + 바람). 십자선=착탄 예상점이므로 그대로 사용.
    const off = { x: this.curHit.x + this.windOffNow.x, y: this.curHit.y + this.windOffNow.y }; // 불스아이 대비 명중 오프셋
    const landing = { x: this.aim.x + off.x, y: this.aim.y + off.y };
    const dist = Math.hypot(off.x, off.y);
    const score = scoreForDistance(dist, sR);

    this.bowFollowThrough();

    const flightMs = FLIGHT_MS; // 오버드로우는 세로 미세조준이라 속도 보정과 분리 — 일정하게 빠른 비행
    // 화살 출발점 — 활이 바닥 정렬로 내려간 만큼(extra) 함께 내린다.
    const originX = ARROW_ORIGIN.x;
    const originY = ARROW_ORIGIN.y + this.extra;
    const arrow = this.add
      .image(originX, originY, ARROW_KEY)
      .setOrigin(0.5, 0.02) // 촉 끝이 피벗
      .setDepth(15)
      .setScale(ARROW_FLIGHT_START);
    // 부드러운 2차 포물선: 직선 보간 + 4·arcH·t·(1-t) 호. 선형 속도, 접선 방향 회전.
    const arcH = 375; // 세로 HD ×1.875
    const dx0 = landing.x - originX;
    const dy0 = landing.y - originY;
    const holder = { t: 0 };
    this.tweens.add({
      targets: holder,
      t: 1,
      duration: flightMs,
      ease: 'Linear',
      onUpdate: () => {
        const t = holder.t;
        const x = originX + dx0 * t;
        const y = originY + dy0 * t - 4 * arcH * t * (1 - t);
        // 접선(속도) 방향으로 코 정렬 — 발사 시 위, 정점 수평, 낙하 시 과녁으로.
        const vx = dx0;
        const vy = dy0 - 4 * arcH * (1 - 2 * t);
        arrow
          .setPosition(x, y)
          .setScale(lerp(ARROW_FLIGHT_START, ARROW_FLIGHT_END, t))
          .setRotation(Math.atan2(vy, vx) + Math.PI / 2);
      },
      onComplete: () => {
        this.stickArrow(arrow, landing);
        this.showResult(off, sR); // 명중 결과 과녁을 우측에서 슬라이드 인 → 정확한 위치 점 표시
        this.onHit(landing, score);
      },
    });
  }

  /** 에디터 큰 과녁(layer_6, BG_04)을 결과 표시용 컨테이너로 편입 — 평상시 숨김, 우측 화면 밖에서 대기. */
  private setupResultPanel(): void {
    const rt = this.layout.tryById<Phaser.GameObjects.Image>(NODE.resultTarget);
    if (!rt) return;
    this.resultHomeX = rt.x; // 에디터가 배치한 위치가 표시 홈
    const homeY = rt.y;
    this.resultTargetW = rt.displayWidth;
    this.resultPanel = this.add.container(rt.x, homeY).setDepth(30).setVisible(false);
    rt.setPosition(0, 0); // 컨테이너 중심에 맞춤(원점 0.5)
    this.resultPanel.add(rt);
    this.resultDots = []; // 새 게임 시작 시 히스토리 초기화
  }

  /** 명중 결과 과녁을 우측에서 슬라이드 인 → 정확한 명중 위치를 검붉은 점으로 표시(3라운드 히스토리 누적)
   *  → RESULT_SHOW_MS 후 우측으로 사라짐. 결과 과녁 타격점은 겨냥 과녁의 명중점과 같은 링에 정밀 일치. */
  private showResult(off: { x: number; y: number }, sR: number): void {
    if (!this.resultPanel) return;
    const halfW = this.resultTargetW / 2;
    this.resultOffX = this.scale.width + halfW + 80; // 우측 화면 밖
    this.resultTween?.stop();
    this.resultHideCall?.remove(false);
    // 명중 점 — 불스아이 대비 오프셋(off/sR, -1..1)을 결과 과녁의 득점반경에 매핑(겨냥 과녁과 동일 분율).
    // 결과 과녁(BG_04) 골드 중심 보정(RESULT_GOLD_FX/FY) → 점 원점을 실제 골드에 맞춤.
    // 이전 발들의 점은 지우지 않고 누적(3라운드 히스토리). 게임 시작 시에만 초기화(setupResultPanel).
    const mapR = this.resultTargetW * RESULT_SCORE_R_FRAC;
    const gx = (RESULT_GOLD_FX - 0.5) * this.resultTargetW;
    const gy = (RESULT_GOLD_FY - 0.5) * this.resultTargetW;
    const fx = Phaser.Math.Clamp(off.x / sR, -1, 1);
    const fy = Phaser.Math.Clamp(off.y / sR, -1, 1);
    const r = this.resultTargetW * RESULT_DOT_R_FRAC;
    // 이전 타격점은 검붉은색(히스토리)로 바꾸고, 이번(마지막) 타격점만 녹색.
    for (const d of this.resultDots) (d as Phaser.GameObjects.Arc).setFillStyle(RESULT_DOT_COLOR, 1);
    const dot = this.add
      .circle(gx + fx * mapR, gy + fy * mapR, r, RESULT_DOT_LAST_COLOR, 1)
      .setStrokeStyle(Math.max(1.5, r * 0.3), 0x000000, 0.65);
    this.resultPanel.add(dot);
    this.resultDots.push(dot);
    dot.setScale(0.1);
    this.tweens.add({ targets: dot, scale: 1, duration: 240, ease: 'Back.easeOut' });
    // 슬라이드 인 → 유지 → 우측으로 슬라이드 아웃.
    this.resultPanel.setVisible(true).setX(this.resultOffX);
    this.resultTween = this.tweens.add({
      targets: this.resultPanel,
      x: this.resultHomeX,
      duration: 380,
      ease: 'Back.easeOut',
    });
    this.resultHideCall = this.time.delayedCall(RESULT_SHOW_MS, () => {
      if (!this.resultPanel) return;
      this.resultTween = this.tweens.add({
        targets: this.resultPanel,
        x: this.resultOffX,
        duration: 340,
        ease: 'Cubic.easeIn',
        onComplete: () => this.resultPanel?.setVisible(false),
      });
    });
  }

  /** 명중 처리 — 비행 화살 제거 후 과녁에 '구멍'만 박는다(3색 깃 표시 없음).
   *  world 컨테이너 자식이라 줌 인/아웃과 함께 과녁 표면에 박힌 채 유지. */
  private stickArrow(arrow: Phaser.GameObjects.Image, hitSpot: { x: number; y: number }): void {
    arrow.destroy(); // 옆모습 비행 화살 제거
    const Z = this.world.scaleX;
    const lx = (hitSpot.x - this.world.x) / Z;
    const ly = (hitSpot.y - this.world.y) / Z;
    const hole = this.add.image(hitSpot.x, hitSpot.y, HOLE_KEY);
    this.world.add(hole);
    hole.setPosition(lx, ly).setScale(HOLE_STICK_SCREEN / Z);
    this.stuck.push(hole);
  }

  private onHit(landing: { x: number; y: number }, score: number): void {
    const tint = ringTint(score);
    const burst = this.add.particles(landing.x, landing.y, SPARK_KEY, {
      speed: { min: 60, max: 230 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      lifespan: 380,
      quantity: 14,
      tint,
      blendMode: 'ADD',
      emitting: false,
    });
    burst.setDepth(24);
    burst.explode(14);
    this.time.delayedCall(460, () => burst.destroy());

    this.popupText
      .setText(scoreLabel(score))
      .setColor(score >= 9 ? '#ffd23f' : score === 0 ? '#ffb4b4' : '#ffffff')
      .setPosition(landing.x, landing.y - 82)
      .setScale(0.5)
      .setAlpha(1)
      .setVisible(true);
    this.tweens.add({
      targets: this.popupText,
      scale: 1.15,
      y: landing.y - 206,
      alpha: 0,
      duration: 880,
      ease: 'Cubic.easeOut',
    });

    this.totalScore += score;
    this.updateScoreHud();
    this.refreshRank(); // 점수 변화 → 왼쪽 랭킹 실시간 반영(내 행이 NPC를 추월하며 등수↑)

    this.phase = 'scored';
    this.time.delayedCall(SHOW_SCORE_MS, () => this.nextArrow());
  }

  private nextArrow(): void {
    this.arrowInRound += 1;
    if (this.arrowInRound >= ARROWS_PER_ROUND) {
      this.arrowInRound = 0;
      this.round += 1;
      if (this.round > ROUNDS) {
        this.gameOver();
        return;
      }
      this.clearStuck();
    }
    this.springBack(this.curD, () => this.toReady());
  }

  /** 줌아웃 + 활 원위치. 박힌 화살·명중 점은 world 자식이라 줌아웃을 자동으로 따라간다. */
  private springBack(fromD: number, done: () => void): void {
    const holder = { p: 1 };
    this.resetTween = this.tweens.add({
      targets: holder,
      p: 0,
      duration: 460,
      ease: 'Cubic.easeOut',
      onUpdate: () => this.setZoom(fromD * holder.p),
      onComplete: done,
    });
    if (this.bowImg) {
      this.tweens.add({
        targets: this.bowImg,
        x: this.bowBaseX,
        angle: this.bowBaseAngle,
        y: this.bowBaseY,
        scaleX: this.bowBaseScaleX,
        scaleY: this.bowBaseScaleY,
        duration: 380,
        ease: 'Quad.easeOut',
      });
    }
  }

  // ── 게임 종료 ─────────────────────────────────────────────────

  /** 누적 경기 수 +1(localStorage) — 관문 광고 주기 판정용. */
  private bumpPlayCount(): number {
    try {
      const n = Number(localStorage.getItem('archery_played') ?? 0) + 1;
      localStorage.setItem('archery_played', String(n));
      return n;
    } catch {
      return 0; // 저장 불가 — 관문 없이 진행(사용자를 가두지 않는다).
    }
  }

  private gameOver(): void {
    this.phase = 'gameover';
    this.refreshRank(); // 최종 총점 기준 등수를 왼쪽 패널에 확정 표시(그대로 남는다)
    this.promptText.setText('');
    this.handle.setVisible(false);
    this.anchorRing.setVisible(false);
    this.aimReticle.setVisible(false);
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const max = maxScore(ROUNDS, ARROWS_PER_ROUND);

    this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x06210b, 0.74).setDepth(40);
    this.add
      .text(cx, cy - 281, '경기 종료', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '84px', color: '#F9A825' })
      .setOrigin(0.5)
      .setStroke('#0a2540', 12)
      .setDepth(41);
    this.add
      .text(cx, cy - 56, `${this.totalScore}`, { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '180px', color: '#ffffff' })
      .setOrigin(0.5)
      .setStroke('#0a2540', 15)
      .setDepth(41);
    this.add
      .text(cx, cy + 113, `/ ${max} 점`, { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '51px', color: '#e8f5e9' })
      .setOrigin(0.5)
      .setDepth(41);
    const again = this.add
      .text(cx, cy + 338, '다시하기 — 화면을 탭', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '45px', color: '#ffffff' })
      .setOrigin(0.5)
      .setStroke('#0a2540', 9)
      .setDepth(41);
    this.tweens.add({ targets: again, alpha: 0.4, duration: 700, yoyo: true, repeat: -1 });
  }

  // ── HUD/연출 헬퍼 ────────────────────────────────────────────

  private updateScoreHud(): void {
    this.scoreText.setText(`${this.totalScore}`);
  }

  private updateRoundHud(): void {
    this.editRound?.setText(`${this.round}/${ROUNDS}`);
    this.roundText.setText(`${this.round}/${ROUNDS} 라운드 · ${this.arrowInRound + 1}/${ARROWS_PER_ROUND}발`);
  }

  private bowFollowThrough(): void {
    if (!this.bowImg) return;
    // 9) 활을 오른쪽(시계방향)으로 회전시키며 아래로 내린다.
    this.tweens.add({ targets: this.bowImg, angle: 28, y: this.bowBaseY + 244, duration: 420, ease: 'Quad.easeIn' });
  }

  // ── 매 프레임: 완전 드로우부터 떨림(오버드로우로 증가) + 좌우 조준 + 바람 ──

  update(_time: number, delta: number): void {
    // 에너지바 — 목표값으로 부드럽게 따라간다(모든 단계: 채움/비움). 기계적 1:1 아님.
    this.gaugeFill = lerp(this.gaugeFill, this.gaugeTarget, Math.min(1, (delta / 1000) * GAUGE_SMOOTH));
    this.drawKnob
      .setY(this.gaugeBotY - this.gaugeFill * (this.gaugeBotY - this.gaugeTopY))
      .setVisible(this.gaugeFill > 0.01);

    // 호흡(숨쉬기) — 게임 뷰(world=배경+과녁)만 들숨↔날숨처럼 미세 확대/축소. UI·컨트롤·활은 불변.
    // 0.5-0.5cos: 양 극단에서 부드럽게 멈춰 자연스러운 호흡감(선형 톱니 아님).
    this.breathT += delta / 1000;
    const breath = 0.5 - 0.5 * Math.cos(this.breathT * ((Math.PI * 2) / BREATH_PERIOD));
    this.breathScale = 1 + BREATH_AMP * breath;
    this.applyWorldBreath(); // world 에만 적용(카메라 전체 줌 아님)

    // 타임어택 — ready/draw 동안 카운트다운(우측 다이얼 표시), 만료 시 강제 발사/미스.
    this.tickShotTimer(delta / 1000);

    if (this.phase !== 'draw') return;

    const dt = delta / 1000;

    this.wobbleT += dt;
    // 바람(비행 중 적용) — 십자선엔 표시하지 않는다. 플레이어가 바람을 고려해 조준해야 함.
    this.windOffNow = { x: this.wind.x * WIND_PX, y: this.wind.y * WIND_PX };

    if (!this.maxDraw) {
      // ① 드로우 단계 — 십자선이 과녁 상단에서 중심으로 '서서히 내려온다'(당김 속도=하강 속도).
      const aimY = this.scoreR * AIM_TOP * (this.curD - 1); // -top(상단) → 0(파란 원=중심)
      this.curHit = { x: 0, y: aimY };
      this.handle.setPosition(this.holdX, this.holdY);
    } else {
      // ② 최대 시위 당김 — 손가락 미세 이동(nudge)으로 십자선 2D 조준 + 숨쉬기·긴장에 의한 느린 유동.
      // 미세조정: 손가락 오프셋에 가속도 곡선(중심 부근=아주 미세, 멀수록 가속) + 스무딩(관성)을 적용해
      // 아주 미세한 손 이동에도 십자선이 정밀하게 상하좌우로 움직인다.
      this.tensionHold = Math.min(1, this.tensionHold + dt / TENSION_BUILD);
      const accel = (v: number): number => {
        const n = Phaser.Math.Clamp(v / NUDGE_MAX, -1, 1);
        return Math.sign(n) * (0.35 * Math.abs(n) + 0.65 * n * n) * NUDGE_MAX * FINE_GAIN; // 선형+제곱(가속)
      };
      // 목표 조준점으로 스무스하게 접근(관성) → 부드럽고 미세한 이동.
      const s = Math.min(1, dt * FINE_SMOOTH);
      this.fineAim.x = lerp(this.fineAim.x, accel(this.nudge.x), s);
      this.fineAim.y = lerp(this.fineAim.y, accel(this.nudge.y), s);
      // 숨쉬기·긴장 유동(유지할수록↑).
      const breathPhase = Math.sin(this.breathT * ((Math.PI * 2) / BREATH_PERIOD));
      const driftAmp = this.scoreR * (AIM_SWAY + this.tensionHold * AIM_TENSION_SHAKE);
      const breathY = this.scoreR * BREATH_AIM_AMP * breathPhase;
      const driftY = breathY + driftAmp * Math.sin(this.wobbleT * TENSION_FREQ);
      const driftX = driftAmp * 1.1 * Math.sin(this.wobbleT * TENSION_FREQ * 0.73 + 1.3);
      this.curHit = { x: this.fineAim.x + driftX, y: this.fineAim.y + driftY };
      this.handle.setPosition(this.anchor.x, this.anchor.y); // 흰 원은 파란 원에 고정(최대 당김 유지)
    }

    this.drawAimReticle();
    this.setBow(this.curD);
    this.setZoom(this.curD); // 과녁은 aim 고정 — 이동하는 건 십자선.
  }

  /** 타임어택 카운트다운(우측 다이얼) — 시위를 당기기 시작(draw)할 때부터 감소.
   *  ready(대기) 중엔 멈춰 있고(10.0 표시), 만료 시 충분히 당겼으면 자동발사·아니면 시간초과 미스. */
  private tickShotTimer(dt: number): void {
    if (this.phase !== 'draw') return; // 시위를 당기는 동안에만 카운트다운
    this.shotTimeLeft = Math.max(0, this.shotTimeLeft - dt);
    this.timeDialText?.setText(this.shotTimeLeft.toFixed(1));
    if (this.shotTimeLeft > 0) return;
    if (this.curD >= DRAW_MIN) this.fire();
    else this.timeoutMiss();
  }

  /** 제한시간 초과(미당김/부족) — 이 발을 0점 처리하고 다음으로. */
  private timeoutMiss(): void {
    this.phase = 'scored';
    this.handle.setVisible(false);
    this.anchorRing.setVisible(false);
    this.aimReticle.setVisible(false);
    this.popupText
      .setText('시간 초과!')
      .setColor('#ffb4b4')
      .setPosition(this.scale.width / 2, this.aim.y)
      .setScale(1)
      .setAlpha(1)
      .setVisible(true);
    this.tweens.add({ targets: this.popupText, alpha: 0, duration: 900, ease: 'Cubic.easeOut' });
    this.time.delayedCall(SHOW_SCORE_MS, () => this.nextArrow());
  }
}
