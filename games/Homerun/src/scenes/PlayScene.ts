/**
 * PlayScene — 홈런팝 본편 (홈런 클래시 스타일 타이밍 타격).
 *
 * 화면: cover 배경(BG_05, 와이드 원화의 세로 중앙 크롭) + 정적 타자 + 히팅존 링.
 * 루프: 투구(마운드→존으로 공 확대 접근, 수축 타이밍 링) → 터치 = 스윙 →
 *       판정(logic/judge) → 타구 방향으로 카메라 소폭 줌인 + 결과 라벨 →
 *       카메라 복귀 → 다음 투구. 10구 종료 후 점수 정산 + 다시하기.
 *
 * 월드/HUD 는 컨테이너 + 카메라 2대로 분리 — 줌인은 월드에만 적용된다.
 */
import Phaser from 'phaser';
import { FONT } from '@casual/core';
import { getDisplayBounds } from '@casual/core';
import {
  BALL_KEY,
  BG_KEY,
  CONFETTI_KEY,
  fielderKey,
  MITT_KEY,
  SPARK_KEY,
  STARBURST_KEY,
  UI_LAYOUT_KEY,
  UI_SPRITE_INDEX_KEY,
} from '../assets.js';
import { buildLayout, type LayoutDoc, type LayoutNode } from '../ui/layoutLoader.js';
import { resolveCharacterMotions, type SpriteIndex } from '../ui/spriteRegistry.js';
import { CharacterRig } from '../ui/characterRig.js';
import { sfx, startBgm } from '../audio.js';
import { PITCH_END_PROGRESS, resolveAccuracySwing, resolveTake, resolveWhiff } from '../logic/judge.js';
import type { SwingOutcome } from '../logic/types.js';

/** 릴리스→존 도달 시간(ms) — 구속 ~127km/h ≈ 520ms (난이도 완화, 기존 150km/h=440ms). */
const PITCH_MS = 520;
/** 새 투구 준비 → 릴리스(투구 시작)까지의 시간(ms) — 투구 간 ~5초 텀의 본체. */
const ZONE_PREVIEW_MS = 3800;
/**
 * 타자 3동작(에디터 등록: 타격준비/스윙/타격 후) 구동 파라미터.
 *  - 준비(ready): 투구 대기 중 반복.  - 스윙(action): 매 투구 1회.  - 후(after): 스윙 후 반복.
 * 스윙 시트 실측: 24프레임 중 frame 17 에서 배트가 전방 최대 신장(컨택). viewMs 로 압축 재생.
 */
const BATTER_RIG = { viewMs: 600, frames: 24, keyFrame: 17 } as const;
/** 스윙 시작 → 컨택 프레임까지의 시간(ms). 공 도달(pitchStartAt+PITCH_MS)에서 이만큼 빼 스윙 시작. */
const SWING_CONTACT_LEAD_MS = (BATTER_RIG.viewMs * BATTER_RIG.keyFrame) / BATTER_RIG.frames;
/**
 * 투수 3동작(에디터 등록: 투수_준비동작/투수_투구동작/투수_투구후 동작) 구동 파라미터.
 *  - 준비(ready): 투구 예고 중 반복.  - 투구(action): 매 투구 1회.  - 후(after): 투구 후 반복.
 * 투구 시트 실측: 48프레임 중 frame 31 에서 팔 전방 최대 신장(릴리스=공이 손을 떠남). viewMs 로 압축 재생.
 */
const PITCHER_RIG = { viewMs: 1800, frames: 48, keyFrame: 31 } as const;
/** 투구 시작 → 릴리스 프레임까지의 시간(ms). 공 릴리스(throwPitch=ZONE_PREVIEW_MS)에서 이만큼 빼 투구 시작. */
const PITCH_RELEASE_LEAD_MS = (PITCHER_RIG.viewMs * PITCHER_RIG.keyFrame) / PITCHER_RIG.frames;
/** 투수 손(릴리스) 높이 — 노드 발밑(앵커) 기준 위로 노드 높이의 이 비율. 공 출발점 산정. */
const PITCHER_HAND_Y_RATIO = 0.55;
/** 타격 인디케이터가 릴리스보다 먼저 나타나는 리드(ms). */
const INDICATOR_LEAD_MS = 200;
/**
 * 늦은 탭 유예(ms) — 공 통과 후 이 시간 안의 탭은 무시 대신 "헛스윙 풀스윙"으로 처리.
 * 투구 트윈 종료(PITCH_MS×1.25=650ms)보다 짧아야 스윙취소 타이머가 먼저 동작한다.
 */
const LATE_TAP_GRACE_MS = 120;
/** 붉은 타격점 반지름(px) — 공이 존을 통과할 때의 공 크기와 동일 (96px 에셋 × 0.53 / 2). */
const RED_DOT_R = 25;
/** 터치 허용 배수 — 손가락 크기를 감안한 타격점 유효 반경(R×배수). */
const TOUCH_GRACE = 2.9;
/**
 * 타이밍 허용 윈도우(progress 단위) — 도착(1.0) 기준 이만큼 이전부터 탭 인정.
 * 공이 손끝에서 가파르게 내리꽂히는 궤적이라 화면 거리 대신 진행도로 판정한다.
 */
const PITCH_TAP_WINDOW = 0.28;
/** 히팅존 랜덤 편차(px) — 배트 스위트스팟 실측점 주변의 작은 변주만 허용. */
const ZONE_JITTER = { x: 14, y: 8 } as const;
/** 1경기 투구 수. */
const PITCHES_PER_GAME = 10;
/** 히팅존 반지름(px, 720 기준 디자인 좌표) — 스트라이크존을 좁게(was 92). */
const ZONE_RADIUS = 70;
/** 타격 시 카메라 줌 배율 — 타구 방향으로 강하게 확대. */
const HIT_ZOOM = 1.5;
/** 관중석 컨페티 색상 (흰 조각 tint). */
const CHEER_TINTS = [0xffd147, 0xff6b6b, 0x7cd5ff, 0x8dff9e, 0xffffff, 0xff9ff3];
/** 관중석 분출 지점 (W·H 비율) — 좌우 스탠드만 (경기장·전광판 위는 제외). */
const CHEER_SPOTS: ReadonlyArray<[xr: number, yr: number]> = [
  [0.05, 0.37],
  [0.95, 0.37],
  [0.12, 0.32],
  [0.88, 0.32],
  [0.2, 0.27],
  [0.8, 0.27],
];
/** 카메라가 타구를 한 박자 늦게 쫓아가는 지연(ms). */
const CAM_FOLLOW_DELAY_MS = 150;
/**
 * 임팩트 연출 — 슬로우모션은 발사 순간 공을 늦춰 "톡 튀는" 위화감을 만들어 제거.
 * 대신 카메라 셰이크 + 공 화이트 플래시 + 트레일로 맞자마자 풀스피드로 터져나간다.
 */
const IMPACT_SHAKE_MS = 90;
const IMPACT_SHAKE_INTENSITY = 0.004;
const IMPACT_FLASH_MS = 70;
/** 공 추적 lerp — 작을수록 카메라가 늦게 부드럽게 따라붙는다. */
const CAM_FOLLOW_LERP = 0.08;
/** 카메라 복귀(팬/줌) 시간(ms). */
const CAM_RESET_MS = 400;

/** 화면 비율 좌표 (배경 cover 크롭 기준. x 는 720 디자인 px, y 는 height 비율). */
const POS = {
  zoneXRatio: 0.50,  // 스트라이크존 — 홈플레이트 중심 (화면 중앙)
  zoneY: 0.67,
  resultY: 0.27,     // 결과 라벨
} as const;

/** 배경 원본 해상도 (수비수·홈플레이트 BG 원본 좌표 환산용). */
const BG_SRC = { width: 1920, height: 1080 } as const;

/**
 * 에디터 레이아웃의 "배경" 노드 판별 — 키에 BG 가 들어가거나 프레임 폭 이상으로 꽉 찬 이미지.
 * 배경은 월드에서 cover 로 직접 배치하므로(물리 앵커 보존) HUD 레이아웃 빌드에서는 제외한다.
 */
function isBackgroundNode(n: LayoutNode, designW: number): boolean {
  return n.type === 'image' && (/bg/i.test(n.key ?? '') || (n.w ?? 0) >= designW);
}

/**
 * 수비 포지션 — 의사 3D 월드 좌표(x3=좌우 px, z=깊이). 타구 물리와 동일 투영으로
 * 화면 위치·크기를 산출하므로 "거리에 따른 사이즈 비율"이 자동 적용된다.
 * 내야(1·2·3루수/유격수)는 얕은 z, 외야(좌·중·우익수)는 깊은 z.
 */
// 수비 배치 — 1·3루수는 사용자 지정 마커(BG 원본 좌표) 고정, 나머지는 월드 좌표(x3, z).
// bg 앵커는 배경 표시 범위로 환산되어 어떤 화면비에서도 그 지점에 선다.
type FielderPos = { x3: number; z: number } | { bgX: number; bgY: number };
const FIELDER_POSITIONS: ReadonlyArray<FielderPos> = [
  { bgX: 1735, bgY: 548 }, // 1루수 (사용자 지정 — 우측 파울라인 안쪽 잔디)
  { x3: 1830, z: 8200 },   // 2루수 (1~2루 사이, 내야 아크)
  { x3: -1830, z: 8200 },  // 유격수 (2~3루 사이, 내야 아크)
  { bgX: 379, bgY: 562 },  // 3루수 (사용자 지정 — 좌측 파울라인 안쪽 잔디)
  { x3: -3450, z: 10500 }, // 좌익수 (깊은 좌측 최외곽)
  { x3: 50, z: 11000 },    // 중견수 (최심부 정중앙)
  { x3: 3450, z: 10500 },  // 우익수 (깊은 우측 최외곽)
];
/**
 * 수비수 표시 높이 — z=0 기준 화면높이 비율 × 원근 p.
 * 내야(p≈0.16) ≈ 68px, 외야(p≈0.11) ≈ 48px — 거리에 따른 크기 차 유지.
 */
const FIELDER_BASE_H = 0.34;

/**
 * 포수 미트 — 공이 "도착하는 순간에만" 잠깐 나타나 포구 후 사라진다 (타격 시 미등장).
 * 50% 투명이라 꽂힌 공이 미트 너머로 비쳐 보인다. 공은 미트 정중앙에 도착한다.
 */
const MITT_ALPHA = 0.5;
const MITT_DISPLAY_W = 230;
const MITT_TEX_SIZE = 192;
/** 홈플레이트 꼭지점(포수 쪽 끝) — BG 원본(1920×1080) 좌표 실측. 투구 종착점. */
const PLATE_APEX_SRC = { x: 962, y: 900 } as const;
/** 투구 좌우 커브 폭(월드 px) — 매 투구 랜덤 부호·크기로 휘어 들어온다. */
const PITCH_CURVE = { min: 50, max: 110 } as const;

/** 에디터 UI 일괄 투명도 — 10% 투명(알파 0.9). 캐릭터 아바타는 제외. */
const UI_DIM_ALPHA = 0.9;
const UI_AVATAR_KEYS: ReadonlySet<string> = new Set(['up_Homerun_UI_01-1', 'up_Homerun_UI_03-1']);

/** HUD 캡슐/버튼 치수 (720 디자인 px). */
const HUD = {
  capsuleY: 18,
  capsuleH: 52,
  capsuleRadius: 26,
  scoreW: 220,
  pitchW: 140,
  margin: 16,
  buttonW: 280,
  buttonH: 84,
} as const;

// ─── 타구 물리 (전방 시점 의사 3D) ────────────────────────────────────
// 월드 좌표: x3=좌우(px), y3=높이(px), z=깊이(px, 외야 방향). 단위는 z=0 화면 px 등가.
// 원근 투영: p = FOCAL/(FOCAL+z). 화면크기·좌우오프셋·높이 모두 p 배,
// 지면선은 홈플레이트(0.74H)에서 지평선(0.32H)으로 p 비율 수렴.

/**
 * 원근 초점거리 — 작을수록 멀어질 때 더 빨리 작아진다.
 * 1300: 내야(z≈0~1800)가 지면선 0.76→0.55H(실측 내야 잔디 경계)에 걸치도록 조정 —
 * 내야 거리감이 충분히 펼쳐진 뒤 외야·펜스로 수렴한다.
 */
const PROJ_FOCAL = 1300;
/**
 * 지면선 — Homerun_BG_05 픽셀 실측(2026-06-11, x=600/760/1320 컬럼 재측정):
 * 외야 펜스 밑단(=사용자 지정 붉은 선, 외야 경계) ≈0.50H / 외야 잔디 0.51~0.62H /
 * 내야 흙 아크 0.62H~ / 홈플레이트 흙 0.66~0.83H(플레이트 ≈0.77H).
 * ⚠️ 이전 0.39H 는 관중석 녹지를 잔디로 오판한 값 — 공이 외야벽 너머까지 굴러가던 원인.
 */
const GROUND_PLATE_Y = 0.76;
/**
 * 투영 소실선 — 펜스 "뒤" 지평. 펜스 밑단 0.50H 는 z=Z_FENCE 에서 정확히 도달:
 * 0.45 + (0.76-0.45)·p(Z_FENCE=7000) ≈ 0.50. 공은 이 선(붉은 선)을 넘지 않는다.
 */
const GROUND_HORIZON_Y = 0.45;
/**
 * 공 크기 축소 지수 — 크기는 위치 수렴(p)보다 훨씬 가파르게 p^1.8 로 줄어든다.
 * 내야 구간에서부터 빠르게 작아져 외야로 갈수록 더 작아 보인다 (2루에서 p 대비 ≈50%).
 */
const BALL_SIZE_EXP = 1.8;
/** 중력 (px/s²). */
const GRAVITY = 2400;
/** 이 수직속도 미만의 착지는 바운드 대신 구름(롤)으로 전환 (px/s). */
const MIN_BOUNCE_VY = 130;
/** 바운드 시 수평(좌우·깊이) 속도 감쇠 — 높을수록 바운드 체인이 멀리 이어진다. */
const BOUNCE_DAMP_XZ = 0.82;
/** 기본 구름 마찰 감속 (px/s²) — 타구별 rollDecel 로 재정의 가능. */
const ROLL_DECEL = 380;
/** 내야 낙구·파울의 구름 마찰 — 기본의 약 1/3 = 마지막 흐름이 ~3배 길다. */
const ROLL_DECEL_SLOW = 130;
/** 시뮬 안전 상한 (s) — 타구별 maxT 로 재정의 가능. */
const SIM_MAX_T = 6.5;
/** 내야 낙구·파울용 연장 상한 (s). */
const SIM_MAX_T_LONG = 10;
/** 외야 펜스 깊이(z) — 실측 지면선 0.45H 부근(워닝트랙)에서 벽과 충돌. */
const Z_FENCE = 7000;
/**
 * 전광판/관중석 평면 깊이(z) — 펜스 너머 장외 구역. 공중으로 이 평면을 통과하는
 * 홈런은 높이(y3)에 따라 관중석 직격 / 전광판 직격 / 장외 통과로 갈린다.
 */
const Z_STANDS = 30000;
/** Z_STANDS 에서의 월드 높이 밴드 — 화면 실측(관중석 0.28~0.42H, 전광판 0.06~0.28H) 투영 역산. */
const STANDS_CROWD_MIN_Y3 = 1300;  // 펜스 상단 위 = 관중석 하단
const STANDS_BOARD_MIN_Y3 = 4200;  // 전광판 하단 (낮은 탄도에 맞춰 하향)
const STANDS_TOP_Y3 = 12400;       // 전광판 상단 — 이보다 높으면 그대로 장외로 넘어간다
/** 마운드(투수 릴리스) 깊이(z) — 실측 마운드 지면선 0.515H 를 투영식으로 역산. */
const Z_MOUND = 4900;
/** 투구 중력 처짐 (h 비율) — 릴리스→존 포물선 폭. 클수록 궤적이 넓게 휜다. */
const PITCH_SAG_H = 0.038;
/** 공의 z=0(플레이트) 기준 표시 스케일 — 투구·타구 공통. 96px 에셋 기준 ≈51px 표시(기존과 동일). */
const BALL_PLATE_SCALE = 0.53;
/** 릴리스 순간 공 추가 축소 배율 — 출발은 작게, 존 도달 시 1.0(타격지점 크기 불변). */
const BALL_RELEASE_SHRINK = 0.78;
/** 펜스 월드 높이 — 화면 실측(밑단 0.39H, 상단 0.33H)을 z=Z_FENCE 의 p 로 역산한 값. */
const WALL_WORLD_HEIGHT = 600;
/** 벽 리바운드 반발계수 (깊이 방향). */
const WALL_REBOUND = 0.35;

/** 발사 초기속도 (px/s) — 타구 유형별. restitution 0 = 첫 착지에서 정지(담장 너머). */
interface LaunchParams {
  vx: number;
  vy: number;
  vz: number;
  restitution: number;
  /** 구름 마찰 (px/s²) — 내야 낙구·파울은 ROLL_DECEL_SLOW 로 길게 흐른다. */
  rollDecel: number;
  /** 시뮬 상한 (s). */
  maxT: number;
}

/** 비행 중 공의 물리 상태. */
interface BallSim {
  t: number;
  x3: number;
  y3: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  restitution: number;
  rollDecel: number;
  maxT: number;
  /** 접점에서의 공 화면 스케일 (z=0 기준 크기). */
  baseScale: number;
}

/** 결과 라벨(스트라이크/홈런/안타/파울/비거리) 폰트 색 — 흰색 통일. */
const RESULT_TEXT_COLOR = '#FFFFFF';

type PlayState = 'ready' | 'pitch' | 'resolve' | 'over';

export class PlayScene extends Phaser.Scene {
  private worldLayer!: Phaser.GameObjects.Container;
  private hudLayer!: Phaser.GameObjects.Container;
  private ball!: Phaser.GameObjects.Image;
  private mitt!: Phaser.GameObjects.Image;
  /** 타자·투수 3동작 리그(에디터 등록 준비/액션/후) — 게임 상태에 맞춰 구동. 미배포 시 undefined. */
  private batterRig?: CharacterRig;
  private pitcherRig?: CharacterRig;
  /** 투수 노드(에디터 레이아웃) — 투구 시 공 릴리스 지점 산정에 사용. */
  private pitcherNode?: LayoutNode;
  private zoneFill!: Phaser.GameObjects.Arc;
  private timingRing!: Phaser.GameObjects.Arc;
  private redDot!: Phaser.GameObjects.Arc;
  /** 인디케이터(반투명 큰 원) 중심 — 붉은 원은 이 안의 랜덤 위치에 출현. */
  private indicatorX = 0;
  private indicatorY = 0;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  private scoreText!: Phaser.GameObjects.Text;
  private pitchText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;

  private state: PlayState = 'ready';
  private sim?: BallSim;
  private pitchTween?: Phaser.Tweens.Tween;
  private pitchStartAt = 0;
  private pitchIndex = 0;
  private score = 0;
  private homeruns = 0;
  private zoneX = 0;
  private zoneY = 0;
  /** 배트 스위트스팟 월드 좌표 — 임팩트 프레임에서 배트가 실제로 지나는 지점. */
  private batContactX = 0;
  private batContactY = 0;
  /** 홈플레이트 꼭지점 화면 좌표 — 투구 종착(포구) 지점. */
  private plateApexX = 0;
  private plateApexY = 0;
  /** 현재 투구의 경로 함수 — 진행도 t 의 공 화면 좌표/스케일 (컨택 정밀 정렬용). */
  private pitchBallAt?: (t: number) => { x: number; y: number; scale: number };
  /** 현재 비행이 홈런 타구인지 — 비행 종료 시 비거리 표시 여부. */
  private flightHomerun = false;
  /** 이번 타구의 비거리(m) — 발사 파라미터 기반, 컨택 시 산출. */
  private flightMeters = 0;
  /** 타구 궤적 트레이서 — 비행 경로를 빛나는 라인으로 그린다 (TV 중계 트레이서 풍). */
  private tracer!: Phaser.GameObjects.Graphics;
  private tracerPts: Array<{ x: number; y: number; s: number }> = [];

  constructor() {
    super('play');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.state = 'ready';
    this.pitchIndex = 0;
    this.score = 0;
    this.homeruns = 0;
    this.zoneX = w * POS.zoneXRatio;
    this.zoneY = h * POS.zoneY;

    this.worldLayer = this.add.container(0, 0);
    this.hudLayer = this.add.container(0, 0);

    // 에디터 레이아웃(main.json)이 화면 구성의 단일 진실 공급원(SSOT):
    // 배경·타자 캐릭터·전광판 이펙트·HUD 가 모두 여기서 온다. 투수/수비수는 아직
    // 에디터에 없어 코드로 그린다(추후 에디터에서 추가·배치 예정).
    const doc = (this.cache.json.get(UI_LAYOUT_KEY) ?? null) as LayoutDoc | null;
    const bg = this.buildWorld(w, h, doc);
    this.buildHud(w, h, doc);

    // 카메라 분리 — 메인(월드, 줌 대상) / HUD(고정).
    // 메인 카메라 bounds 는 캔버스가 아닌 "배경 이미지 실제 폭" — cover 배경이 좌우로
    // 훨씬 넓어서, 그 안에서는 멀리 패닝해도 배경 밖이 노출되지 않는다.
    const bgBounds = getDisplayBounds(bg);
    this.cameras.main.setBounds(Math.floor(bgBounds.left), 0, Math.ceil(bgBounds.w), h);
    // 휴식 시 카메라는 identity — 디자인 좌표(에디터)와 1:1. 타구 시에만 줌/팬, 끝나면 복귀.
    this.cameras.main.centerOn(w / 2, h / 2);
    this.cameras.main.ignore(this.hudLayer);
    const hudCam = this.cameras.add(0, 0, w, h);
    hudCam.ignore(this.worldLayer);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onTap(pointer));
    // BGM — 오토플레이 정책상 첫 사용자 제스처에서 시작.
    this.input.once('pointerdown', () => startBgm());
    this.time.delayedCall(700, () => this.startPitch());
  }

  // ── 구성 ──────────────────────────────────────────────────────────

  /**
   * 월드 구성 — 카메라 bounds 산정을 위해 배경 이미지를 반환.
   * 배경은 에디터 레이아웃 노드(layer_3)의 **정확한 위치·크기**로 배치한다(SSOT). cover 가 아니라
   * 디자인 좌표 그대로라 에디터 미리보기와 1:1 정렬되고, 같은 좌표계의 타자·전광판 이펙트와도 맞는다.
   * 카메라는 휴식 시 identity(scroll 0, zoom 1)라 월드 노드가 HUD 노드와 동일 좌표에서 겹친다.
   */
  private buildWorld(w: number, h: number, doc: LayoutDoc | null): Phaser.GameObjects.Image {
    const designW = doc?.frame?.designW ?? w;
    const bgNode = doc?.nodes?.find((n) => isBackgroundNode(n, designW));
    const bgKey = bgNode?.key && this.textures.exists(bgNode.key) ? bgNode.key : BG_KEY;
    const bg = this.add.image(bgNode?.x ?? w / 2, bgNode?.y ?? h / 2, bgKey).setOrigin(0.5, 0.5);
    if (bgNode?.w && bgNode?.h) bg.setDisplaySize(bgNode.w, bgNode.h);
    else bg.setScale(Math.max(w / bg.width, h / bg.height)); // 노드 미지정 시 cover 폴백
    // 캔버스보다 작으면(에디터 1280 설계 < 실제 더 긴 캔버스) 키워 빈 띠 방지.
    const coverScale = Math.max(1, w / bg.displayWidth, h / bg.displayHeight);
    if (coverScale > 1) bg.setDisplaySize(bg.displayWidth * coverScale, bg.displayHeight * coverScale);
    // 위치 클램프 — 에디터 프레이밍(x)은 유지하되 배경이 화면 상·하·좌·우를 항상 덮도록
    // (배경 중심이 설계상 화면 중앙보다 위면 하단에 빈 띠가 생기는 것을 방지).
    bg.x = Phaser.Math.Clamp(bg.x, w - bg.displayWidth / 2, bg.displayWidth / 2);
    bg.y = Phaser.Math.Clamp(bg.y, h - bg.displayHeight / 2, bg.displayHeight / 2);
    this.worldLayer.add(bg);
    // 수비수 7인 — 야구 포지션(1·2·3루수/유격수/외야 3인) 배치. ⚠️ 투수보다 아래 레이어.
    // bg 앵커(사용자 지정)는 화면 좌표→원근 p 역산, 월드 좌표는 투영으로 산출.
    const fbgLeft = bg.x - bg.displayWidth / 2;
    const fbgTop = bg.y - bg.displayHeight / 2;
    const resolved = FIELDER_POSITIONS.map((pos, i) => {
      if ('bgX' in pos) {
        const sx = fbgLeft + (pos.bgX / BG_SRC.width) * bg.displayWidth;
        const sy = fbgTop + (pos.bgY / BG_SRC.height) * bg.displayHeight;
        const p = Phaser.Math.Clamp(
          (sy / h - GROUND_HORIZON_Y) / (GROUND_PLATE_Y - GROUND_HORIZON_Y),
          0.05,
          1,
        );
        return { sx, sy, p, key: fielderKey(i + 1) };
      }
      const p = PROJ_FOCAL / (PROJ_FOCAL + pos.z);
      const groundY = h * GROUND_HORIZON_Y + h * (GROUND_PLATE_Y - GROUND_HORIZON_Y) * p;
      return { sx: w / 2 + pos.x3 * p, sy: groundY, p, key: fielderKey(i + 1) };
    });
    // 먼 수비수(작은 p)부터 그려 앞뒤 겹침 정리.
    for (const f of resolved.sort((a, b) => a.p - b.p)) {
      const img = this.add.image(f.sx, f.sy, f.key).setOrigin(0.5, 1);
      // 거리 비례 크기 + 상한 — 가까운 코너 수비수(1·3루수)가 과도하게 커지지 않게.
      img.setScale(Math.min((h * FIELDER_BASE_H * f.p) / img.height, (h * 0.13) / img.height));
      this.worldLayer.add(img);
    }
    // 투수는 에디터 캐릭터(layer_6, 3동작 리그)로 buildHud 에서 별도 구성된다(아틀라스 피처 제거).
    // 홈플레이트 꼭지점 — 투구가 최종적으로 꽂히는 포구 지점 (BG 좌표 → 화면 환산).
    const bgLeft = bg.x - bg.displayWidth / 2;
    const bgTop = bg.y - bg.displayHeight / 2;
    this.plateApexX = bgLeft + (PLATE_APEX_SRC.x / BG_SRC.width) * bg.displayWidth;
    this.plateApexY = bgTop + (PLATE_APEX_SRC.y / BG_SRC.height) * bg.displayHeight;
    // 컨택 포인트(붉은원·인디케이터·임팩트 이펙트 기준점) — 타자는 에디터 캐릭터로 대체돼
    // 아틀라스 스위트스팟 픽셀이 없으므로 스트라이크존 중심을 컨택 지점으로 사용한다.
    // 공이 도달하는 존과 일치하므로 타격 판정·이펙트가 같은 지점에서 일어난다.
    this.batContactX = w * POS.zoneXRatio;
    this.batContactY = h * POS.zoneY;

    // 타격 인디케이터 — 외곽선 없는 반투명 원. 릴리스와 동시 등장, 둥둥 떠 있는 부유 모션.
    this.zoneFill = this.add.circle(0, 0, ZONE_RADIUS, 0xffffff, 0.18).setVisible(false);
    // 타이밍 링(노란) — 붉은 원 중심으로 수축, 도달 순간 붉은 원과 같은 크기가 된다.
    this.timingRing = this.add
      .circle(0, 0, RED_DOT_R)
      .setStrokeStyle(3, 0xffe14d, 0.9)
      .setVisible(false);
    // 붉은 타격점 — 반투명, 인디케이터 원 안의 랜덤 위치에 출현. 공 통과 크기와 동일.
    this.redDot = this.add.circle(0, 0, RED_DOT_R, 0xe23030, 0.55).setVisible(false);
    // 타구 궤적 트레이서 — 공 아래 레이어에 라인으로 누적 렌더.
    this.tracer = this.add.graphics();
    this.ball = this.add.image(0, 0, BALL_KEY).setVisible(false);
    // 포수 미트 — 공 "위" 레이어 + 50% 투명: 통과한 공이 미트 너머로 비치며 꽂힌다.
    this.mitt = this.add
      .image(0, 0, MITT_KEY)
      .setScale(MITT_DISPLAY_W / MITT_TEX_SIZE)
      .setAlpha(0)
      .setVisible(false);
    // 임팩트 스파크 — ⚠️ 공과 같은 흰 원이면 "공이 두 개"로 보인다(픽셀 분석으로 확인).
    // 노란 불꽃 틴트 + 작게 + 짧게 — 공과 시각적으로 분리.
    this.sparks = this.add.particles(0, 0, SPARK_KEY, {
      speed: { min: 100, max: 280 },
      scale: { start: 0.6, end: 0 },
      lifespan: 300,
      tint: [0xffd147, 0xffb347, 0xfff2a8],
      emitting: false,
    });
    // 타구 잔상은 점 입자 대신 "궤적 라인(tracer)"만 사용한다.
    // ⚠️ 원형 점 입자는 측면 타구처럼 화면 이동이 빠를 때 공과 분리돼 보여
    //    "공이 두 개"로 오인되는 것이 반복 확인됨 — 입자 트레일 영구 제거.
    // 관중 환호 컨페티 — 스탠드에서 위로 분출 후 낙하.
    // 짧은 수명 — 조각이 필드까지 떨어지기 전에 관중석 위에서 소멸.
    this.confetti = this.add.particles(0, 0, CONFETTI_KEY, {
      speed: { min: 140, max: 340 },
      angle: { min: 235, max: 305 },
      gravityY: 500,
      lifespan: { min: 450, max: 850 },
      scale: { start: 1.1, end: 0.3 },
      rotate: { min: 0, max: 360 },
      tint: CHEER_TINTS,
      emitting: false,
    });
    this.worldLayer.add([this.zoneFill, this.timingRing, this.redDot, this.tracer, this.ball, this.mitt, this.sparks, this.confetti]);
    // 에디터 타자 캐릭터는 buildHud 에서 월드 레이어 최상위로 올린다(공이 타자 뒤로 안 가도록).
    return bg;
  }

  /**
   * 화면 구성 적용 — 에디터(phaser-ui-editor)의 ui/layouts/main.json 을 그대로 생성해
   * 노드를 두 레이어로 라우팅한다:
   *   · 캐릭터(spriteDocClip, 타자/투수) → 월드 레이어. 3동작 리그(buildCharacterRig)로 별도 구성.
   *   · 도형+채움 전광판 이펙트 → 월드 레이어(배경과 함께 줌/팬).
   *   · 그 외 패널/텍스트 → HUD 레이어(고정, 필드가 비치도록 살짝 디밍).
   * 배경(layer_3)·캐릭터는 buildLayout 에서 제외하고 별도 처리한다.
   * 점수/투구수 텍스트는 중앙 전광판 패널(layer_1_copy2) 위에 얹는다.
   * 레이아웃이 없으면 기존 캡슐 HUD 로 폴백(디자인 미배포 단계 방어).
   */
  private buildHud(w: number, h: number, doc: LayoutDoc | null): void {
    let scoreAnchor = { x: 36, y: 44, origin: 0, size: 28 };
    let pitchAnchor = { x: w - 86, y: 44, size: 28 };
    if (doc && Array.isArray(doc.nodes) && doc.nodes.length > 0) {
      const designW = doc.frame?.designW ?? w;
      // 배경(월드 cover)·캐릭터(3동작 컨트롤러)는 제외하고 나머지만 일반 빌드.
      const layoutDoc: LayoutDoc = {
        ...doc,
        nodes: doc.nodes.filter((n) => !isBackgroundNode(n, designW) && n.type !== 'spriteDocClip'),
      };
      const layout = buildLayout(this, layoutDoc);
      // 컨테이너는 자식 depth 를 자동 정렬하지 않음 — depth 순으로 추가.
      const sorted = layout.entries().sort((a, b) => (a.node.depth ?? 0) - (b.node.depth ?? 0));
      for (const e of sorted) {
        // 좌표공간 — 에디터가 넘긴 space 를 우선 적용, 없으면 기존 휴리스틱(채움 도형=월드)으로 폴백(하위호환).
        //   'world' = 배경과 같은 좌표계 → 카메라 줌/팬을 함께 받음(전광판). 'screen' = 고정 카메라(HUD).
        const space = e.node.space ?? ((e.node.fillClip || e.node.fillImage) ? 'world' : 'screen');
        if (space === 'world') {
          this.worldLayer.add(e.obj);
        } else {
          // HUD 패널/텍스트 — 고정 카메라. 필드가 비치도록 살짝 디밍.
          this.hudLayer.add(e.obj);
          const isAvatar = e.node.type === 'image' && UI_AVATAR_KEYS.has(e.node.key ?? '');
          if (!isAvatar) e.obj.setAlpha((e.node.alpha ?? 1) * UI_DIM_ALPHA);
        }
      }
      // 캐릭터(spriteDocClip) — 타자/투수를 각각 3동작 리그로 구성(에디터 등록 준비/액션/후).
      // ⚠️ depth 오름차순으로 생성 → 컨테이너가 depth 순으로 worldLayer 에 추가돼 z-order 가 결정적이고
      //    에디터 depth(투수 24 > 타자 23 등)에 충실하다(비동기 로드 순서에 흔들리지 않음).
      const charNodes = doc.nodes
        .filter((n) => n.type === 'spriteDocClip')
        .sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));
      for (const node of charNodes) {
        if ((node.name ?? '').includes('투수')) {
          this.pitcherNode = node;
          this.pitcherRig = this.buildCharacterRig(node, PITCHER_RIG.viewMs);
        } else {
          this.batterRig = this.buildCharacterRig(node, BATTER_RIG.viewMs);
        }
      }
      // 중앙 전광판 패널 — 점수(상단)·투구수(하단) 텍스트 앵커.
      const board = layout.tryById<Phaser.GameObjects.Image>('layer_1_copy2');
      if (board) {
        scoreAnchor = { x: board.x, y: board.y - 16, origin: 0.5, size: 30 };
        pitchAnchor = { x: board.x, y: board.y + 19, size: 20 };
      }
    } else {
      const capsule = this.add.graphics();
      capsule.fillStyle(0x0a2540, 0.55);
      capsule.fillRoundedRect(HUD.margin, HUD.capsuleY, HUD.scoreW, HUD.capsuleH, HUD.capsuleRadius);
      capsule.fillRoundedRect(w - HUD.pitchW - HUD.margin, HUD.capsuleY, HUD.pitchW, HUD.capsuleH, HUD.capsuleRadius);
      this.hudLayer.add(capsule);
    }

    this.scoreText = this.add
      .text(scoreAnchor.x, scoreAnchor.y, '0', {
        fontFamily: FONT.family,
        fontSize: `${scoreAnchor.size}px`,
        color: '#ffe14d',
      })
      .setOrigin(scoreAnchor.origin, 0.5);
    this.pitchText = this.add
      .text(pitchAnchor.x, pitchAnchor.y, `1/${PITCHES_PER_GAME}구`, {
        fontFamily: FONT.family,
        fontSize: `${pitchAnchor.size}px`,
        color: '#ffffff',
      })
      .setOrigin(0.5, 0.5);
    // 중앙 상단 숫자 정보(점수·투구수)는 임시 숨김 — 추후 정확한 표기로 교체 예정.
    this.scoreText.setVisible(false);
    this.pitchText.setVisible(false);
    this.resultText = this.add
      .text(w / 2, h * POS.resultY, '', { fontFamily: FONT.family, fontSize: '84px', color: '#ffffff' })
      .setStroke('#0a2540', 10)
      .setOrigin(0.5)
      .setAlpha(0);
    this.hudLayer.add([this.scoreText, this.pitchText, this.resultText]);
  }

  // ── 캐릭터 3동작 리그 (에디터 등록: 준비/액션/후) ────────────────────────

  /**
   * 캐릭터(타자/투수) 3동작 리그 생성 — 레지스트리(_index.json)에서 같은 캐릭터의 준비/액션/후를
   * 찾아 노드 위치·발밑 앵커·노드 높이 균일 스케일로 로드한다. 모두 월드 레이어(배경과 함께 줌/팬).
   * 액션 발동(triggerAction) 시점은 startPitch/throwPitch 가 키 프레임(컨택·릴리스)에 맞춰 스케줄한다.
   */
  private buildCharacterRig(node: LayoutNode, viewMs: number): CharacterRig {
    const index = (this.cache.json.get(UI_SPRITE_INDEX_KEY) ?? null) as SpriteIndex | null;
    const files = resolveCharacterMotions(index, node.characterId, node.spriteDocFile);
    return new CharacterRig(this, this.worldLayer, node, files, viewMs);
  }

  // ── 투구 루프 ──────────────────────────────────────────────────────

  /** 투구 예고 — 랜덤 위치에 흰 반투명 존 출현, ZONE_PREVIEW_MS 뒤 투구. */
  private startPitch(): void {
    if (this.pitchIndex >= PITCHES_PER_GAME) {
      this.showGameOver();
      return;
    }
    this.pitchIndex += 1;
    this.sim = undefined;

    this.updateHud();

    // 타자 — 새 투구 시작 시 "타격준비" 반복(스윙은 throwPitch 에서 컨택 타이밍에 맞춰 발동).
    this.batterRig?.playReady();

    // 투수 — "준비동작" 반복 후, 투구동작의 릴리스 프레임이 공 릴리스(throwPitch=ZONE_PREVIEW_MS)와
    // 정확히 일치하도록 ZONE_PREVIEW_MS - PITCH_RELEASE_LEAD_MS 시점에 투구동작을 발동한다.
    this.pitcherRig?.playReady();
    this.time.delayedCall(Math.max(0, ZONE_PREVIEW_MS - PITCH_RELEASE_LEAD_MS), () => {
      if (this.state !== 'over') this.pitcherRig?.triggerAction();
    });

    // 인디케이터(반투명 큰 원) 중심 = 스트라이크존 컨택 지점 ± 소폭 편차.
    this.indicatorX = this.batContactX + Phaser.Math.FloatBetween(-ZONE_JITTER.x, ZONE_JITTER.x);
    this.indicatorY = this.batContactY + Phaser.Math.FloatBetween(-ZONE_JITTER.y, ZONE_JITTER.y);
    // 붉은 타격점 = 인디케이터 원 "안"의 랜덤 위치 (원 경계를 벗어나지 않게 반경 제한).
    const maxOff = ZONE_RADIUS - RED_DOT_R - 4;
    const offR = maxOff * Math.sqrt(Math.random());
    const offA = Math.random() * Math.PI * 2;
    this.zoneX = this.indicatorX + Math.cos(offA) * offR;
    this.zoneY = this.indicatorY + Math.sin(offA) * offR;

    // 인디케이터·타격점은 릴리스 0.2초 전에 등장, 투구는 ZONE_PREVIEW_MS 에 시작.
    this.time.delayedCall(ZONE_PREVIEW_MS - INDICATOR_LEAD_MS, () => this.showIndicator());
    this.time.delayedCall(ZONE_PREVIEW_MS, () => this.throwPitch());
  }

  /** 타격 인디케이터 표시 — 반투명 큰 원(부유 모션) + 반투명 붉은 타격점. */
  private showIndicator(): void {
    if (this.state === 'over') return;
    this.tweens.killTweensOf(this.zoneFill);
    this.zoneFill
      .setPosition(this.indicatorX, this.indicatorY)
      .setVisible(true)
      .setAlpha(0)
      .setScale(1);
    this.tweens.add({ targets: this.zoneFill, alpha: 1, duration: 140 });
    // 둥둥 떠 있는 부유 모션 — 위아래 + 미세한 호흡 스케일.
    this.tweens.add({
      targets: this.zoneFill,
      y: this.indicatorY - 7,
      scale: 1.04,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.redDot.setPosition(this.zoneX, this.zoneY).setVisible(true).setScale(0.4).setAlpha(0);
    this.tweens.add({ targets: this.redDot, alpha: 1, scale: 1, duration: 130, ease: 'Back.easeOut' });
  }

  /** 150km/h 초고속 투구 — 마운드 릴리스(z=Z_MOUND)에서 원근 투영으로 정확히 접근. */
  private throwPitch(): void {
    if (this.state === 'over') return;
    const w = this.scale.width;
    const h = this.scale.height;

    // 릴리스 지점 = 에디터 투수 노드의 손 높이(발밑 앵커 위로 노드 높이 비율) — 화면 좌표를 월드로 역투영.
    // 투수 노드가 없으면(미배포) 마운드 중앙 폴백.
    const releaseScreenX = this.pitcherNode?.x ?? w / 2;
    const releaseScreenY = (this.pitcherNode?.y ?? h * 0.53) - (this.pitcherNode?.h ?? 0) * PITCHER_HAND_Y_RATIO;
    const pMound = PROJ_FOCAL / (PROJ_FOCAL + Z_MOUND);
    const groundYMound = h * GROUND_HORIZON_Y + h * (GROUND_PLATE_Y - GROUND_HORIZON_Y) * pMound;
    // 월드 좌표(타구 시뮬과 동일 법칙): z 등속 접근, 높이는 릴리스→존으로 중력 처짐.
    const relY3 = Math.max(0, (groundYMound - releaseScreenY) / pMound); // 릴리스 높이
    const relX3 = (releaseScreenX - w / 2) / pMound; // 릴리스 좌우 (손끝 오프셋)
    const zoneY3 = Math.max(0, h * GROUND_PLATE_Y - this.zoneY); // 존 높이
    const zoneX3 = this.zoneX - w / 2; // 존 좌우
    const sag = h * PITCH_SAG_H;

    // 투구 종착점 = 홈플레이트 꼭지점(존 통과 후 t=1~1.25 구간) — 미트 정중앙과 일치.
    const tEnd = PITCH_END_PROGRESS;
    const zEnd = Math.max(Z_MOUND * (1 - tEnd), -PROJ_FOCAL * 0.3);
    const pEnd = PROJ_FOCAL / (PROJ_FOCAL + zEnd);
    const groundYEnd = h * GROUND_HORIZON_Y + h * (GROUND_PLATE_Y - GROUND_HORIZON_Y) * pEnd;
    const catchX3 = (this.plateApexX - w / 2) / pEnd;
    const catchY3 = Math.max(0, (groundYEnd - this.plateApexY) / pEnd);
    // 좌우 커브 — 매 투구 랜덤 부호·크기로 휘어 존에 들어온다 (t=0·1에서 0 = 연속).
    const curve = Phaser.Math.FloatBetween(PITCH_CURVE.min, PITCH_CURVE.max) * (Math.random() < 0.5 ? -1 : 1);
    // 미트는 위치만 잡아두고 숨김 — 공이 "도착하는 순간"(catchBall)에만 잠깐 나타난다.
    const mittScale = MITT_DISPLAY_W / MITT_TEX_SIZE;
    this.tweens.killTweensOf(this.mitt);
    this.mitt
      .setScale(mittScale)
      .setPosition(this.plateApexX, this.plateApexY)
      .setVisible(false)
      .setAlpha(0);

    // 경로 함수 — 진행도 t 의 공 화면 좌표/스케일. onUpdate 와 컨택 정밀 정렬이 공유한다.
    // 구간 분리: 릴리스→존(t≤1, 커브+처짐) / 존→플레이트 꼭지점(t>1, 포구 진입).
    const ballPosAt = (t: number): { x: number; y: number; scale: number } => {
      const z = Math.max(Z_MOUND * (1 - t), -PROJ_FOCAL * 0.3); // t>1 = 존 통과(포수 쪽)
      const p = PROJ_FOCAL / (PROJ_FOCAL + z);
      const tc = Math.min(t, 1);
      let x3: number;
      let y3: number;
      if (t <= 1) {
        x3 = Phaser.Math.Linear(relX3, zoneX3, t) + curve * Math.sin(Math.PI * t);
        y3 = Phaser.Math.Linear(relY3, zoneY3, t) - sag * 4 * t * (1 - t);
      } else {
        const t2 = (t - 1) / (PITCH_END_PROGRESS - 1);
        x3 = Phaser.Math.Linear(zoneX3, catchX3, t2);
        y3 = Phaser.Math.Linear(zoneY3, catchY3, t2);
      }
      const groundY = h * GROUND_HORIZON_Y + h * (GROUND_PLATE_Y - GROUND_HORIZON_Y) * p;
      return {
        x: w / 2 + x3 * p,
        y: groundY - y3 * p,
        // 원근 비례 + 릴리스 축소 램프 — 손끝에선 더 작게, 존 도달 시 정규 크기.
        scale: BALL_PLATE_SCALE * p * (BALL_RELEASE_SHRINK + (1 - BALL_RELEASE_SHRINK) * tc),
      };
    };
    this.pitchBallAt = ballPosAt;

    sfx('pitch');
    this.ball.setAlpha(1).setVisible(true);
    this.pitchTween = this.tweens.addCounter({
      from: 0,
      to: PITCH_END_PROGRESS,
      duration: PITCH_MS * PITCH_END_PROGRESS,
      ease: 'Linear',
      onUpdate: (tween) => {
        const pos = ballPosAt(tween.getValue() ?? 0);
        this.ball.setPosition(pos.x, pos.y).setScale(pos.scale);
      },
      onComplete: () => {
        this.onPitchPassed();
        this.catchBall();
      },
    });

    // 노란 타이밍 링 — 릴리스와 동시에 크게 시작, "붉은 원 크기까지" 수축 = 도달 순간 perfect.
    this.timingRing
      .setPosition(this.zoneX, this.zoneY)
      .setVisible(true)
      .setScale((ZONE_RADIUS * 1.6) / RED_DOT_R)
      .setAlpha(0.9);
    this.tweens.add({ targets: this.timingRing, scale: 1, duration: PITCH_MS, ease: 'Linear' });

    this.state = 'pitch';
    this.pitchStartAt = this.time.now;

    // ── 타자 스윙 발동 ─────────────────────────────────────────────────
    // 스윙 컨택 프레임(17/24)이 공 도달 순간(pitchStartAt + PITCH_MS)과 정확히 일치하도록
    // PITCH_MS - SWING_CONTACT_LEAD_MS 시점에 스윙을 시작한다(매 투구 자동, 탭 무관).
    this.time.delayedCall(Math.max(0, PITCH_MS - SWING_CONTACT_LEAD_MS), () => {
      if (this.state === 'pitch') this.batterRig?.triggerAction();
    });

    // ── 공 도달 체크 ───────────────────────────────────────────────────
    // 유예까지 탭이 없으면(state='pitch' 유지) 루킹 처리.
    // 유예 안의 늦은 탭은 onTap 에서 헛스윙으로 처리된다.
    this.time.delayedCall(PITCH_MS + LATE_TAP_GRACE_MS, () => {
      if (this.state !== 'pitch') return;
      this.state = 'resolve';
      this.hideZone();
      // 공은 그대로 포수 미트까지 — 포구 연출(catchBall)이 미트와 함께 정리한다.
      this.applyOutcome(resolveTake());
      this.time.delayedCall(1000, () => this.nextPitch());
    });
  }

  /**
   * 포구 연출 — 스윙 없이/헛스윙으로 통과한 공이 포수 미트 포켓에 꽂힌다.
   * 미트가 공 위 50% 투명 레이어라 공이 미트 너머로 비치는 "포구" 장면이 된다.
   */
  private catchBall(): void {
    if (this.sim || !this.ball.visible) return;
    sfx('catch');
    // 도착 순간에만 등장 — 살짝 크게 나타나 포켓 크기로 죄며 포구, 여운 후 공과 함께 퇴장.
    const baseScale = MITT_DISPLAY_W / MITT_TEX_SIZE;
    this.mitt.setVisible(true).setAlpha(0).setScale(baseScale * 1.08);
    this.tweens.add({
      targets: this.mitt,
      alpha: MITT_ALPHA,
      scaleX: baseScale,
      scaleY: baseScale,
      duration: 110,
      ease: 'Sine.easeOut',
    });
    this.tweens.add({ targets: [this.ball, this.mitt], alpha: 0, delay: 650, duration: 280 });
  }

  /** 존·타격점 표시 제거 (투구 해소 시). */
  private hideZone(): void {
    this.tweens.killTweensOf(this.zoneFill);
    this.zoneFill.setVisible(false);
    this.timingRing.setVisible(false);
    this.redDot.setVisible(false);
  }

  /** 공이 존 통과 완료 (PITCH_END_PROGRESS). 실제 처리는 PITCH_MS 타이머가 먼저 완료. 안전장치. */
  private onPitchPassed(): void {
    if (this.state !== 'pitch') return;
    this.state = 'resolve';
    this.hideZone();
    this.applyOutcome(resolveTake());
    this.time.delayedCall(1000, () => this.nextPitch());
  }

  private onTap(pointer: Phaser.Input.Pointer): void {
    if (this.state !== 'pitch') return;
    const progress = (this.time.now - this.pitchStartAt) / PITCH_MS;

    // 성공 조건 ① 붉은 타격점 터치(정확도 = 중심에 가까울수록 1 → 더 긴 타구)
    const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tapDist = Phaser.Math.Distance.Between(wp.x, wp.y, this.zoneX, this.zoneY);
    const touchRadius = RED_DOT_R * TOUCH_GRACE;
    // 성공 조건 ② 공이 도착 직전 구간 — 너무 이른 탭은 타격 실패 (진행도 기반).
    const ballInZone = this.ball.visible && progress >= 1 - PITCH_TAP_WINDOW;

    // 터치 좌우 오프셋 — 적색원 왼쪽 탭 = 당겨치기(좌익), 오른쪽 탭 = 밀어치기(우익).
    const lateral = Phaser.Math.Clamp((wp.x - this.zoneX) / touchRadius, -1, 1);
    const outcome: SwingOutcome =
      tapDist <= touchRadius && ballInZone
        ? resolveAccuracySwing(1 - tapDist / touchRadius, progress, lateral)
        : resolveWhiff();

    // 타자 스윙 비주얼은 에디터 캐릭터(정적)로 대체됨 — 판정·이펙트만 진행한다.
    this.state = 'resolve';
    this.hideZone();

    if (outcome.judgement === 'miss') {
      // 헛스윙 — 스윙은 계속 재생, 공은 그대로 포수까지.
      sfx('whiff');
      this.applyOutcome(outcome);
      this.time.delayedCall(1200, () => this.nextPitch());
      return;
    }
    // 히트 — 공이 실제로 존에 도달하는 순간(pitchStartAt + PITCH_MS)에 컨택.
    // 탭 시점에 관계없이 배트 임팩트 프레임과 공 도달 위치(적색원)가 항상 일치.
    const timeToContact = Math.max(0, (this.pitchStartAt + PITCH_MS) - this.time.now);
    this.time.delayedCall(timeToContact, () => this.onContact(outcome));
  }

  /**
   * 배트 임팩트 프레임에 호출 — 공이 날아오는 중 배트가 통과하는 순간.
   * 공을 zoneX/Y 로 스냅하지 않고 현재 위치를 그대로 컨택 포인트로 사용해
   * "배트가 공에 맞아 나가는" 자연스러운 연출을 만든다.
   */
  private onContact(outcome: SwingOutcome): void {
    const w = this.scale.width;
    const h = this.scale.height;
    // 피치 트윈 정지 — 공은 이 시점까지 자유 비행, 임팩트와 동시에 발사 시작.
    this.pitchTween?.stop();
    this.pitchTween = undefined;
    this.tweens.killTweensOf(this.ball);
    this.tweens.killTweensOf(this.timingRing);

    // ⚠️ 컨택 포인트 = "던져진 공"의 현재 시각 정확한 경로상 위치 — 새 공을 만들지 않는다.
    // 렌더 프레임 지연(저사양에서 프레임당 ~40px)을 경로 함수로 보정해
    // 이펙트가 항상 공의 실제 위치에서 터진다 (경로 위 전진이므로 순간이동 아님).
    const tNow = Phaser.Math.Clamp((this.time.now - this.pitchStartAt) / PITCH_MS, 0, PITCH_END_PROGRESS);
    const exact = this.pitchBallAt?.(tNow);
    if (exact) this.ball.setPosition(exact.x, exact.y).setScale(exact.scale);
    this.pitchBallAt = undefined;
    sfx('hit');
    const cx = this.ball.x;
    const cy = this.ball.y;
    // 타격 이펙트는 공 위치 기준(75%)에 배트 쪽으로 살짝 끌어당김(25%) —
    // 늦은/이른 탭으로 공·배트가 어긋나도 이펙트가 공에서 벗어나지 않는다.
    const fxX = cx * 0.75 + this.batContactX * 0.25;
    const fxY = cy * 0.75 + this.batContactY * 0.25;
    this.sparks.explode(12, fxX, fxY);

    // 미트 — 타격 성공 시 미등장 보장(예약된 표시 트윈 제거).
    this.tweens.killTweensOf(this.mitt);
    this.mitt.setVisible(false).setAlpha(0);

    // 만화풍 임팩트(크게) — 스타버스트 팝 + 금색 확산 링.
    const burst = this.add
      .image(fxX, fxY, STARBURST_KEY)
      .setScale(0.8)
      .setAngle(Math.random() * 90)
      .setAlpha(0.95);
    const ring = this.add.circle(fxX, fxY, 22).setStrokeStyle(3, 0xffd147, 0.9);
    this.worldLayer.add([ring, burst]);
    // 타자 동작(월드 최상위)을 임팩트 위로 — 현재 표시 중인 동작 컨테이너를 올림.
    this.batterRig?.bringToTop();
    this.worldLayer.bringToTop(burst); // 임팩트는 타자 위에 보이도록
    this.tweens.add({
      targets: burst,
      scale: 2.6,
      angle: '+=35',
      alpha: 0,
      duration: 340,
      ease: 'Cubic.easeOut',
      onComplete: () => burst.destroy(),
    });
    this.tweens.add({
      targets: ring,
      scale: 2.4,
      alpha: 0,
      duration: 240,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });


    // 임팩트 펀치 — 셰이크 + 공 화이트 플래시. 공은 감속 없이 즉시 풀스피드로 발사.
    if (outcome.result === 'homerun' || outcome.result === 'hit') {
      this.cameras.main.shake(IMPACT_SHAKE_MS, IMPACT_SHAKE_INTENSITY);
      this.ball.setTintFill(0xffffff);
      this.time.delayedCall(IMPACT_FLASH_MS, () => this.ball.clearTint());
    }

    // 의사 3D 발사 — update() 가 매 프레임 중력/바운드/마찰 적분 후 원근 투영으로 그린다.
    // 공이 완전히 멈춰(점) 비행이 끝나야 onFlightDone() 이 카메라를 복귀시킨다.
    const launch = this.launchFor(outcome);
    this.flightHomerun = outcome.result === 'homerun';
    // 비거리 — 발사 속도 기반 실제 탄도 사거리(vz × 체공시간). 파워·각도·좌우에 따라
    // 매 타구 달라진다 (고정 180m 방지). 펜스(z=7000)=122m 기준 환산.
    const rangeZ = launch.vz * ((2 * launch.vy) / GRAVITY);
    this.flightMeters = Math.round(Phaser.Math.Clamp(118 + (rangeZ - 30000) * 0.0013, 95, 205));
    this.tracerPts = [];
    this.tracer.clear();
    this.tracer.setAlpha(1);
    this.tweens.killTweensOf(this.tracer);
    this.sim = {
      t: 0,
      x3: cx - w / 2,
      y3: Math.max(0, h * GROUND_PLATE_Y - cy),
      z: 0,
      vx: launch.vx,
      vy: launch.vy,
      vz: launch.vz,
      restitution: launch.restitution,
      rollDecel: launch.rollDecel,
      maxT: launch.maxT,
      baseScale: this.ball.scale,
    };

    // 카메라 — 공을 실시간 추적(follow, lerp 로 한 박자 늦게)+줌. 비틀기(roll) 없음.
    // bounds 가 배경 이미지 범위로 설정돼 있어 배경 밖으로는 절대 나가지 않는다.
    this.time.delayedCall(CAM_FOLLOW_DELAY_MS, () => {
      this.cameras.main.startFollow(this.ball, false, CAM_FOLLOW_LERP, CAM_FOLLOW_LERP);
      this.cameras.main.zoomTo(HIT_ZOOM, 900, 'Sine.easeOut');
    });

    this.applyOutcome(outcome);
  }

  /**
   * 결과별 발사 초기속도 — 실제 야구 타구 분류 기반.
   * 홈런=발사각 ~40° 대형 플라이(담장 너머, 첫 착지에서 정지),
   * 안타=직선타/뜬공/땅볼 무작위, 파울=측면 슬라이스.
   */
  /**
   * 발사 파라미터 — 야구 논리(우타자 기준):
   *  · 이른 스윙(타이밍 -) = 당겨치기 → 좌익수 방향, 타구질은 라이너/땅볼 성향(강하고 낮음).
   *  · 정타이밍(0) = 중견수 방향.
   *  · 늦은 스윙(+) = 밀어치기 → 우익수 방향, 뜬공 성향(높이 뜸).
   * 방향은 타이밍이 지배(무작위 편차는 ±0.12 양념), 비거리는 붉은 존 정확도(power).
   */
  private launchFor(outcome: SwingOutcome): LaunchParams {
    const dir = outcome.directionX; // 타이밍 + 터치 좌우 오프셋 기반 (-1 좌 ~ +1 우)
    // 좌우 방향 — 방향성에 랜덤 편차 ±0.5를 더해 좌/중/우 외야로 더 넓게 분산.
    const aim = Phaser.Math.Clamp(dir * 1.2 + (Math.random() - 0.5) * 1.0, -1, 1);
    // 비거리 — 붉은 존 정확도(power 0~1)에 비례.
    const dist = 0.85 + 0.3 * outcome.power;
    // 궤적 다양화 — 같은 등급이라도 매번 ±10% 편차로 다른 포물선.
    const jitter = () => 0.9 + Math.random() * 0.2;
    switch (outcome.result) {
      case 'homerun': {
        // 홈런 3종 — 라인드라이브(17°)/표준(27°)/문샷(36°). 높은 발사각의 시원한 포물선.
        // dist·jitter 를 vy·vz 양쪽에 곱해 발사각을 보존한다(vz 만 곱하면 각도가 낮아짐).
        // 비거리 = vz×체공시간(4.2~7초) = 펜스(z=7000)의 8~10배 — 장외 홈런.
        // 홈런 3종 — 14°/18°/23° 낮은 포물선(고도 억제). 정점을 찍고 내려오면서
        // 장외 평면(Z_STANDS=30000, 펜스의 4.3배)에 도달 — 길게 뻗은 비거리 후 충돌.
        const type = Math.random();
        const [vy, vz] = type < 0.3 ? [3800, 15500] : type < 0.75 ? [4500, 13800] : [5200, 12000];
        const boost = dist * jitter();
        // 좌우 홈런 전용 조준 — 홈런은 정중앙 탭이라 dir 이 항상 작다(구조적 정면 고정).
        // dir 2.5배 증폭 + ±0.9 랜덤, 중앙 ±0.25 데드존은 좌우로 밀어내
        // 정면 홈런을 드물게 하고 좌/우 외야로 또렷하게 분산시킨다.
        let hrAim = Phaser.Math.Clamp(dir * 2.5 + (Math.random() - 0.5) * 1.8, -1, 1);
        if (Math.abs(hrAim) < 0.25) {
          const sign = hrAim === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(hrAim);
          hrAim = sign * (0.25 + Math.random() * 0.2);
        }
        return {
          vx: hrAim * 4200,
          vy: vy * boost,
          vz: vz * boost * (1 - 0.3 * Math.abs(hrAim)),
          restitution: 0.3,
          rollDecel: 2600,
          maxT: 9,
        };
      }
      case 'hit': {
        // 타이밍별 타구질 분포 — 당김(이른) = 라이너·땅볼↑, 밀어침(늦은) = 뜬공↑.
        const pull = dir < -0.3;
        const oppo = dir > 0.3;
        const linerP = pull ? 0.5 : oppo ? 0.25 : 0.4;
        const flyP = pull ? 0.2 : oppo ? 0.55 : 0.4;
        const r = Math.random();
        // 직선타(10~25°): 낮고 빠르게 → 외야 바운드.
        if (r < linerP)
          return { vx: aim * 2600, vy: 900 * jitter(), vz: 4500 * dist * jitter(), restitution: 0.52, rollDecel: ROLL_DECEL, maxT: SIM_MAX_T };
        // 뜬공(25~50°): 높이 체공 → 외야 착지.
        if (r < linerP + flyP)
          return { vx: aim * 2200, vy: 2000 * jitter(), vz: 2800 * dist * jitter(), restitution: 0.48, rollDecel: ROLL_DECEL, maxT: SIM_MAX_T };
        // 땅볼(<10°): 낮은 바운드 후 길게 굴러감.
        return { vx: aim * 2400, vy: 340 * jitter(), vz: 4200 * dist * jitter(), restitution: 0.55, rollDecel: ROLL_DECEL_SLOW, maxT: SIM_MAX_T_LONG };
      }
      default: // 파울 — 빗맞은 쪽 라인 밖으로 휘어 끝까지 흐른다.
        return { vx: (dir >= 0 ? 1 : -1) * 1600, vy: 1400, vz: 800, restitution: 0.5, rollDecel: ROLL_DECEL_SLOW, maxT: SIM_MAX_T_LONG };
    }
  }

  /** 매 프레임 타구 물리 적분 + 원근 투영 — 공이 멈출 때까지(점) 끝까지 추적. */
  update(_time: number, deltaMs: number): void {
    const sim = this.sim;
    if (!sim) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    sim.t += dt;
    const zPrev = sim.z;
    sim.vy -= GRAVITY * dt;
    sim.x3 += sim.vx * dt;
    sim.y3 += sim.vy * dt;
    sim.z += sim.vz * dt;

    // 펜스 충돌 — 벽 높이 아래로 "펜스 평면을 앞에서 통과하는 순간"만 처리.
    // (홈런은 벽 위로 넘고, 담장 너머에 착지한 공이 다시 충돌 판정되지 않도록 crossing 조건 필수.)
    if (zPrev < Z_FENCE && sim.z >= Z_FENCE && sim.vz > 0 && sim.y3 < WALL_WORLD_HEIGHT) {
      sim.z = Z_FENCE;
      if (sim.y3 < 80) {
        // 굴러온/낮은 공 — 되튕기지 않고 벽 앞에서 잦아들며 멈춘다 (역방향 점프 방지).
        sim.vz = 0;
        sim.vx *= 0.25;
        sim.vy = 0;
      } else {
        // 공중 직격 라이너 — 벽 리바운드.
        sim.vz = -sim.vz * WALL_REBOUND;
        sim.vx *= 0.6;
        if (sim.vy > 0) sim.vy *= 0.4;
      }
    }
    // 되돌아온 공이 홈 쪽 경계를 넘지 않게 클램프.
    if (sim.z <= 0 && sim.vz < 0) {
      sim.z = 0;
      sim.vz = 0;
    }

    // 장외 구역 충돌 — ① 공중으로 전광판 평면(Z_STANDS)을 통과하는 순간 높이로 직격 판정,
    // ② 평면을 넘어간 공이 하강해 전광판 상단 아래로 내려오면 관중석 "착탄"(떨어지는 홈런).
    let standsHit: 'crowd' | 'board' | undefined;
    const directHit =
      zPrev < Z_STANDS && sim.z >= Z_STANDS && sim.vz > 0 &&
      sim.y3 >= STANDS_CROWD_MIN_Y3 && sim.y3 < STANDS_TOP_Y3;
    const fallingOnto = sim.z >= Z_STANDS && sim.vy < 0 && sim.y3 > 0 && sim.y3 < STANDS_TOP_Y3;
    if (directHit || fallingOnto) {
      standsHit = sim.y3 >= STANDS_BOARD_MIN_Y3 ? 'board' : 'crowd';
      sim.vx = 0;
      sim.vy = 0;
      sim.vz = 0;
    }

    // 착지 — 반발 바운드(체감) 또는 구름(롤) 전환. 담장 너머(restitution 0)는 그 자리 정지.
    if (sim.y3 <= 0 && sim.vy < 0) {
      sim.y3 = 0;
      if (sim.restitution === 0) {
        sim.vx = 0;
        sim.vy = 0;
        sim.vz = 0;
      } else if (-sim.vy > MIN_BOUNCE_VY) {
        sim.vy = -sim.vy * sim.restitution;
        sim.vx *= BOUNCE_DAMP_XZ;
        sim.vz *= BOUNCE_DAMP_XZ;
      } else {
        sim.vy = 0;
      }
    }
    // 구름 마찰 감속 — 타구 유형별 (내야 낙구·파울은 느리게 = 오래 흐름).
    if (sim.y3 === 0 && sim.vy === 0) {
      const speed = Math.hypot(sim.vx, sim.vz);
      const ratio = speed > 0 ? Math.max(0, speed - sim.rollDecel * dt) / speed : 0;
      sim.vx *= ratio;
      sim.vz *= ratio;
    }

    // 원근 투영 — 크기·좌우·높이 전부 p 배, 지면선은 플레이트→펜스 밑단으로 수렴.
    const w = this.scale.width;
    const h = this.scale.height;
    const p = PROJ_FOCAL / (PROJ_FOCAL + Math.max(0, sim.z));
    const groundY = h * GROUND_HORIZON_Y + h * (GROUND_PLATE_Y - GROUND_HORIZON_Y) * p;
    this.ball.setPosition(w / 2 + sim.x3 * p, groundY - sim.y3 * p);
    this.ball.setScale(Math.max(0.03, sim.baseScale * Math.pow(p, BALL_SIZE_EXP)));
    this.recordTracer();

    // 장외 직격/착탄 연출 — 부딪힌 지점에서 스파크 + 셰이크, 전광판이면 더 크게 + 관중 환호.
    if (standsHit) {
      this.sim = undefined;
      sfx('crash');
      this.sparks.explode(standsHit === 'board' ? 16 : 9, this.ball.x, this.ball.y);
      this.cameras.main.shake(140, standsHit === 'board' ? 0.006 : 0.004);
      if (standsHit === 'board') this.cheerCrowd(3, 12);
      this.tweens.add({ targets: this.ball, alpha: 0, duration: 450, delay: 250 });
      this.showDistance();
      this.fadeTracer();
      this.onFlightDone();
      return;
    }

    const stopped = sim.y3 === 0 && sim.vy === 0 && Math.hypot(sim.vx, sim.vz) < 30;
    const offside = Math.abs(this.ball.x - w / 2) > w * 1.5;
    if (stopped || offside || sim.t > sim.maxT) {
      this.sim = undefined;

      this.showDistance();
      this.fadeTracer();
      this.onFlightDone();
    }
  }

  /**
   * 궤적 포인트 기록 + 라인 렌더 — 머리 쪽일수록 진하고, 굵기는 그 지점의 공 크기 비례.
   * 5px 이상 이동 시에만 기록(데시메이션), 최대 300포인트로 비용 상한.
   */
  private recordTracer(): void {
    const pts = this.tracerPts;
    const last = pts[pts.length - 1];
    if (!last || Phaser.Math.Distance.Between(last.x, last.y, this.ball.x, this.ball.y) > 5) {
      pts.push({ x: this.ball.x, y: this.ball.y, s: this.ball.scale });
      if (pts.length > 300) pts.shift();
    }
    const g = this.tracer;
    g.clear();
    if (pts.length < 2) return;
    for (let i = 1; i < pts.length; i++) {
      const head = i / pts.length;
      g.lineStyle(Math.max(1.2, 7 * pts[i].s), 0xfff6c8, 0.08 + 0.42 * head);
      g.beginPath();
      g.moveTo(pts[i - 1].x, pts[i - 1].y);
      g.lineTo(pts[i].x, pts[i].y);
      g.strokePath();
    }
  }

  /** 비행 종료 시 궤적을 여운 있게 지운다. */
  private fadeTracer(): void {
    this.tweens.add({
      targets: this.tracer,
      alpha: 0,
      duration: 700,
      delay: 250,
      onComplete: () => {
        this.tracer.clear();
        this.tracerPts = [];
      },
    });
  }

  /**
   * 홈런 비거리 표시 — 컨택 시 발사 파라미터로 산출한 실제 탄도 사거리(95~205m).
   * 파워(붉은 원 정확도)·발사각·좌우 방향에 따라 매 타구 다른 값이 나온다.
   */
  private showDistance(): void {
    if (!this.flightHomerun) return;
    this.flightHomerun = false;
    this.resultText
      .setText(`비거리 ${this.flightMeters}m`)
      .setColor(RESULT_TEXT_COLOR)
      .setAlpha(0)
      .setScale(0.7);
    this.tweens.add({
      targets: this.resultText,
      alpha: 1,
      scale: 1,
      duration: 220,
      ease: 'Back.easeOut',
      yoyo: true,
      hold: 900,
    });
  }

  /** 비행 종료 — 짧은 여운 후 카메라 복귀, 다음 투구. */
  private onFlightDone(): void {
    if (this.state !== 'resolve') return;
    const w = this.scale.width;
    const h = this.scale.height;
    this.time.delayedCall(450, () => {
      this.cameras.main.stopFollow();
      this.cameras.main.pan(w / 2, h / 2, CAM_RESET_MS, 'Sine.easeInOut');
      this.cameras.main.zoomTo(1, CAM_RESET_MS, 'Sine.easeInOut');
      this.time.delayedCall(CAM_RESET_MS + 50, () => this.nextPitch());
    });
  }

  /** 관중 환호 — 스탠드 곳곳에서 컨페티 분출. waves 만큼 반복(홈런=크게). */
  private cheerCrowd(waves: number, perSpot: number): void {
    const w = this.scale.width;
    const h = this.scale.height;
    for (let wave = 0; wave < waves; wave++) {
      this.time.delayedCall(wave * 340, () => {
        for (const [xr, yr] of CHEER_SPOTS) {
          this.confetti.explode(perSpot, w * xr, h * yr);
        }
      });
    }
  }

  /** 점수 반영 + 결과 라벨 연출 + 결과별 효과음 (HUD 카메라 — 줌과 무관하게 고정). */
  private applyOutcome(outcome: SwingOutcome): void {
    this.score += outcome.score;
    if (outcome.result === 'homerun') this.homeruns += 1;
    if (outcome.result === 'homerun') {
      this.cheerCrowd(7, 14);
      sfx('homerun');
      sfx('cheer');
    } else if (outcome.result === 'hit') {
      this.cheerCrowd(2, 8);
      sfx('safe');
    } else if (outcome.result === 'foul') {
      sfx('foul');
    } else if (outcome.judgement === 'miss' && outcome.label === '스트라이크') {
      sfx('strike'); // 루킹 — 헛스윙은 onTap 에서 whiff 재생
    }
    this.updateHud();

    this.resultText
      .setText(outcome.label)
      .setColor(RESULT_TEXT_COLOR)
      .setAlpha(0)
      .setScale(0.6);
    this.tweens.add({
      targets: this.resultText,
      alpha: 1,
      scale: 1,
      duration: 240,
      ease: 'Back.easeOut',
      yoyo: true,
      hold: 700,
    });
  }

  private nextPitch(): void {
    if (this.state === 'over') return;
    this.ball.setVisible(false);
    this.state = 'ready';
    this.time.delayedCall(400, () => this.startPitch());
  }

  private updateHud(): void {
    // 전광판 스타일 — 점수는 숫자만 크게 (에디터 중앙 패널 위).
    this.scoreText.setText(`${this.score}`);
    this.pitchText.setText(`${Math.min(this.pitchIndex, PITCHES_PER_GAME)}/${PITCHES_PER_GAME}구`);
  }

  // ── 경기 종료 ──────────────────────────────────────────────────────

  private showGameOver(): void {
    this.state = 'over';
    sfx('over');
    const w = this.scale.width;
    const h = this.scale.height;

    // 방어적 정리 — 잔여 시뮬/타이머/트윈 제거 + 카메라 즉시 원점 복귀.
    this.sim = undefined;
    this.time.removeAllEvents();
    this.tweens.killAll();
    // 캐릭터 리그를 준비동작으로 복귀 — removeAllEvents 가 액션→후 전환 타이머를 취소해
    // 액션 포즈로 굳는 것을 방지(게임오버 오버레이 아래 정지 포즈 방지).
    this.batterRig?.playReady();
    this.pitcherRig?.playReady();
    this.cameras.main.stopFollow();
    this.cameras.main.setZoom(1);
    this.cameras.main.centerOn(w / 2, h / 2);

    const dim = this.add.rectangle(w / 2, h / 2, w, h, 0x06121f, 0.66);
    const title = this.add
      .text(w / 2, h * 0.36, '경기 종료', { fontFamily: FONT.family, fontSize: '72px', color: '#ffd147' })
      .setStroke('#0a2540', 10)
      .setOrigin(0.5);
    const summary = this.add
      .text(w / 2, h * 0.46, `SCORE ${this.score}\n홈런 ${this.homeruns}개`, {
        fontFamily: FONT.family,
        fontSize: '40px',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5);
    const button = this.add
      .rectangle(w / 2, h * 0.58, HUD.buttonW, HUD.buttonH, 0x1e88e5)
      .setStrokeStyle(4, 0xffffff, 0.9)
      .setInteractive({ useHandCursor: true });
    const buttonLabel = this.add
      .text(w / 2, h * 0.58, '다시하기', { fontFamily: FONT.family, fontSize: '36px', color: '#ffffff' })
      .setOrigin(0.5);
    button.once('pointerdown', () => this.scene.restart());

    this.hudLayer.add([dim, title, summary, button, buttonLabel]);
  }
}
