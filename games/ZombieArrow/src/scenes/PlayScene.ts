/**
 * PlayScene — 좀비애로우러시 본편. "멀리서 겨냥하고 사냥"이 핵심.
 *
 * 화면(에디터 main.json, SSOT): 좀비 묘지 배경 + 상/하단 HUD + 1인칭 활(layer_4) + 2.5D 필드(layer_8).
 * 플레이:
 *   · 흰 원(시위)을 좌우로 자유롭게 움직여 조준점(레티클) 가로 위치를 잡고,
 *   · 아래로 당길수록(=세게) 조준점이 멀리(위로) 가며 활이 커지고 필드가 그 지점으로 줌인(겨냥 확대),
 *   · 손을 떼면 화살이 조준점으로 날아가 거기 좀비를 맞힌다(조준선이 아니라 조준점이 핵심).
 *
 * 원근(에디터 'field' 노드 = SSOT): 소실점·먼/가까운 평면 y·높이로 좀비를 투영. 멀리선 작고 느리고
 * 흐릿, 가까이서 크고 빠르게. 배경+좀비+화살은 하나의 world 컨테이너에 담아 조준점을 축으로 줌 →
 * 모든 충돌/조준 계산은 컨테이너 로컬(=필드) 좌표라 줌과 무관하게 동일하게 동작한다.
 */
import Phaser from 'phaser';
import {
  ARROW_KEY,
  ARROW_STUCK_KEY,
  SHADOW_KEY,
  SPARK_KEY,
  UI_LAYOUT_KEY,
  ZOMBIE_FRAME0,
  ZOMBIE_TYPES,
} from '../assets.js';
import { buildLayout, type LayoutDoc, type LayoutIndex } from '../ui/layoutLoader.js';
import { comboMultiplier, formatScore, killScore } from '../logic/score.js';
import { loadIdentity, buildNpcScores, rankBoard, type Identity, type NpcRow } from '../logic/leaderboard.js';
import { mountLiveRankPanel, type LiveRankPanel } from '../ui/liveRankPanel.js';
import {
  MAX_HEALTH,
  ZOMBIE_DAMAGE,
  isAllClear,
  waveAt,
  waveLabel,
  type WaveDef,
} from '../logic/waves.js';
import { depthFromY, laneFromX, project, type FieldDef } from '../logic/perspective.js';
import { pitchVar, setIntense, sfx, startAudio } from '../audio.js';

// ── 에디터 노드 id (main.json) ──
const NODE = {
  bg: 'layer_1',
  bow: 'layer_4',
  anchor: 'layer_3_copy4',
  reticle: 'layer_3_copy6',
  waveText: 'layer_5',
  healthText: 'layer_5_copy4',
  scoreText: 'layer_5_copy',
  scoreDup: 'layer_5_copy3',
} as const;

// ── 원근 필드(에디터 'field' = "2.5D 영역" = SSOT). 노드 부재 시 폴백. ──
// 투영 수식·상수(PERSP_GAMMA/FAR_ALPHA/LATERAL_FLOOR)는 logic/perspective.ts(순수·테스트)로 분리.
const SPAWN_X_MIN = 70; // near 평면 좌우 분포(소실점에서 퍼져나옴)
const SPAWN_X_MAX = 650;
const FIELD_FALLBACK = { vpX: 360, vpY: 192, yFar: 348, yNear: 1020, hFar: 9, hNear: 352 };

// ── 활의 조준(시위를 당길수록 조준점이 상승 → 더 멀리 / 더 높은 포물선) ──
const BOW_ALPHA = 0.5; // 활 반투명
const AIM_X_MIN = 20; // 조준점 좌우 범위 — 거의 전체 폭(자유 이동)
const AIM_X_MAX = 700;
const AIM_Y_NEAR = 1015; // 드로우 0 → 조준점 아주 아래(코앞/플레이어 라인까지)
const AIM_Y_FAR = 170; // 풀 드로우 → 조준점 아주 멀리(소실점 근처까지)
const NOCK = { x: 360, y: 1018 }; // 활시위(화살) 발사 지점
const BOW_GRIP_ORIGIN_Y = 0.66; // 활 회전축(그립) 텍스처 세로 비율
const BOW_ZOOM_MIN = 0.6; // 활 최소 배율(아주 가까운 조준점에서 활이 사라지지 않게)
// 활 사이트 링의 활-로컬 오프셋(원점 기준, bz=1 표시 px). 조준점(선의 끝)이 링의 "보이는 중심"에 오도록
// 링(고리) 시각 중심 ≈ 텍스처(245,560), 원점(189,770), 스케일 1.5185.
const BOW_SIGHT_LX = 80;
const BOW_SIGHT_LY = -323;
const SCOPE_ZOOM = 0.45; // 시위를 당길수록 조준점(표적)을 축으로 더 확대(겨냥 확대)

const HANDLE_R = 44;
const DRAG_FULL = 480; // 시위를 이만큼(px) 당기면 풀 드로우(최대 파워/확대)
const DRAW_MIN_DIST = 45; // 발사에 필요한 최소 당김 거리(px) — 오발 방지
// 슬링샷: 당긴 반대 방향으로 조준점이 뻗는 배율. 좌우는 회전점을 높여 미세하게(낮은 배율), 상하는 넉넉히.
const SLING_GAIN_X = 0.7; // 좌우 — 작을수록 미세/쉬움(회전점 높임 효과)
const SLING_GAIN_Y = 1.5; // 상하 — 멀리/가까이 조준 거리
const ARROW_SPEED = 700; // px/s — 비행 속도(거리/속도 = 비행 시간)
// 화면상 호 lift = max(0, (위로 겨냥한 높이 − ARC_STRAIGHT)) × ARC_FRAC (상한 ARC_MAX).
// 지면점을 위로 띄우는 양(px). 바로 앞은 0=직선, 멀수록 큰 로브. ※지면 깊이/크기와 분리(2.5D).
const ARC_STRAIGHT = 180; // 이 높이(px) 이내는 직선(가까운 곳은 거의 직선)
const ARC_FRAC = 0.27; // 호를 전체적으로 절반으로(0.54→0.27)
const ARC_MAX = 170; // 호 상한도 절반(340→170)
// 화살 = 실제 스프라이트(ARROW_KEY 24×176). 발사 크기에서 비행 진행에 따라 점차 축소 → 도착 시 1/5.
const ARROW_NEAR_H = 96; // 발사 시 화살 표시 높이(px)
const ARROW_END_SCALE = 0.2; // 도착(t=1) 시 발사 크기의 비율(1/5) — 발사 후 계속 줄어듦
const ARROW_SHADOW_ALPHA = 0.26; // 지면 그림자 진하기
const GROUND_ARROW_MAX = 14; // 바닥에 꽂혀 남는 빗나간 화살 최대 수(넘으면 오래된 것부터 제거)
// 명중 판정 = 좀비 "실제 표시 크기"에 비례한 박스(최소값 없음 → 먼 좀비는 작아서 정확 조준 필요).
const HIT_BOX_W = 0.34; // 박스 반폭 = 표시폭 × 이값(몸통 폭에 맞춤, 패딩 제외)
const HIT_BOX_H = 0.46; // 박스 반높이 = 표시높이 × 이값(머리~다리 전체 높이)
// 부위별 피해 — HP 6: 머리=6(1방), 몸통=3(2방), 다리=2(3방). 부위는 명중 y의 좀비 내 세로 비율로 판정.
const ZOMBIE_HP = 6;
const DMG_HEAD = 6;
const DMG_TORSO = 3;
const DMG_LEG = 2;
const ZONE_HEAD_MAX = 0.34; // 위 34% = 머리
const ZONE_TORSO_MAX = 0.66; // 34~66% = 몸통, 그 아래 = 다리
// 좀비에 꽂힌 옆모습 화살 — 길이 = 좀비 표시높이 × 이값(또렷이 보이게). ARROW_KEY 텍스처높이 176 기준.
const STUCK_ARROW_LEN_FRAC = 0.42;
// 좀비 발밑 그림자(원형 그라디언트). 살짝 낮춤(너무 선명했음).
const ZOMBIE_SHADOW_ALPHA = 0.78;
const ZOMBIE_SHADOW_W = 0.95; // 그림자 가로 = 좀비 표시폭 × 이값
const ZOMBIE_SHADOW_FLAT = 0.34; // 그림자 세로 납작 비율
const ZOMBIE_FOOT_FRAC = 0.42; // 발(그림자) 위치 = 중심 + 표시높이 × 이값
const FIRE_COOLDOWN = 220; // ms 연사 제한
const STREAK_TIMEOUT = 3000; // ms 콤보 유지

type Phase = 'playing' | 'over';

/** 좀비 몸에 꽂힌 화살(옆모습 ARROW_KEY) — 좀비 표시 크기 기준 오프셋(fx,fy)·임팩트 각도·크기비로 따라 이동·확대. */
interface StuckInZombie {
  readonly img: Phaser.GameObjects.Image;
  readonly fx: number; // 가로 오프셋 / 표시폭
  readonly fy: number; // 세로 오프셋 / 표시높이
  readonly ang: number; // 꽂힌(임팩트) 각도(rad)
  readonly sf: number; // 화살 스케일 / 좀비 표시높이 (꽂힐 때 도착 크기 → 좀비와 함께 확대)
}

interface Zombie {
  readonly spr: Phaser.GameObjects.Sprite;
  d: number; // 깊이 0(멀리)~1(플레이어)
  readonly speed: number; // depth/s
  readonly laneX: number; // near 평면 가로 위치
  readonly sizeMul: number; // 개체 크기 편차
  readonly frameH: number; // 종류별 네이티브 프레임 높이
  hp: number; // 남은 체력(부위별 피해로 감소)
  readonly shadow: Phaser.GameObjects.Image; // 발밑 원형 그라디언트 그림자
  readonly stuck: StuckInZombie[]; // 몸에 꽂힌 화살들
  dead: boolean;
}

interface Arrow {
  readonly img: Phaser.GameObjects.Image; // 옆모습 비행 화살(ARROW_KEY)
  readonly shadow: Phaser.GameObjects.Ellipse; // 지면 그림자
  readonly d0: number; // 발사 시 지면 깊이(≈1 near)
  readonly dT: number; // 착탄(조준점) 지면 깊이
  readonly lane0: number; // 발사 지면 레인 x
  readonly laneT: number; // 착탄 지면 레인 x
  readonly tx: number; // 조준점 화면 x(명중 판정·꽂힘용)
  readonly ty: number; // 조준점 화면 y
  readonly screenArcH: number; // 화면상 호 lift 최대(px)
  readonly dur: number; // 비행 시간(초)
  t: number; // 진행도 0→1
  prevX: number; // 직전 화면 x(회전=화면 속도)
  prevY: number;
  dead: boolean;
}

const lerp = Phaser.Math.Linear;
const clamp = Phaser.Math.Clamp;

export class PlayScene extends Phaser.Scene {
  private layout!: LayoutIndex;

  // 필드 컨테이너(배경+좀비+화살) — 조준 시 일부 확대. 조준/명중은 모두 필드 좌표라 줌과 무관히 일치.
  private world!: Phaser.GameObjects.Container;
  private worldTween?: Phaser.Tweens.Tween;

  // 조준/활 컨트롤 — 활 자체가 조준선(가상 크로스헤어 없음)
  private bowImg?: Phaser.GameObjects.Image;
  private bowBaseAngle = 15;
  private bowBaseX = 360;
  private bowBaseY = 1020;
  private bowBaseScaleX = 1;
  private bowBaseScaleY = 1;
  // 에디터 크로스헤어 — 가상 조준선 금지로 항상 숨김(활이 조준선).
  private reticle?: Phaser.GameObjects.Image;

  private handle!: Phaser.GameObjects.Arc;
  private handleTween?: Phaser.Tweens.Tween;
  private anchorRing!: Phaser.GameObjects.Arc;
  private sightFx!: Phaser.GameObjects.Graphics; // 활의 조준선(빛나는 이펙트)
  private dragStart = { x: 360, y: 1010 }; // 시위 당김 시작점(슬링샷)
  private anchor = { x: 343, y: 1080 };

  // 원근 필드(에디터 SSOT)
  private field: FieldDef = { ...FIELD_FALLBACK };

  // HUD
  private waveText?: Phaser.GameObjects.Text;
  private healthText?: Phaser.GameObjects.Text;
  private scoreText?: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;

  // 실시간 글로벌 랭킹(왼쪽 패널) — 식별자/NPC 사다리는 판 시작 시 1회, 내 점수로 매 갱신.
  private identity!: Identity;
  private npcs: NpcRow[] = [];
  private liveRank?: LiveRankPanel;

  // 엔티티
  private zombies: Zombie[] = [];
  private arrows: Arrow[] = [];
  private groundArrows: Phaser.GameObjects.Image[] = []; // 빗나가 바닥에 꽂힌 화살(누적, 캡)

  // 상태
  private phase: Phase = 'playing';
  private waveIndex = 0;
  private wave!: WaveDef;
  private waveActive = false;
  private spawnedInWave = 0;
  private spawnAcc = 0;
  private health = MAX_HEALTH;
  private score = 0;
  private streak = 0;
  private lastKillAt = 0;
  private lastFireAt = -9999;

  // 드로우(조준) 입력
  private drawing = false;
  private aimX = 360;
  private aimY = AIM_Y_NEAR;
  private drawAmt = 0;

  constructor() {
    super('play');
  }

  create(): void {
    const doc = this.cache.json.get(UI_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!doc?.nodes) {
      this.add
        .text(this.scale.width / 2, this.scale.height / 2, '레이아웃을 불러오지 못했습니다', {
          fontFamily: '"Jua", sans-serif',
          fontSize: '26px',
          color: '#ffffff',
        })
        .setOrigin(0.5);
      return;
    }

    // 1) 에디터 디자인(SSOT) 렌더 — spriteDocClip·field 노드는 로더가 건너뜀.
    this.layout = buildLayout(this, doc);
    this.parseField(doc); // 'field'(2.5D 영역) → 소실점/원근/충돌라인

    // 2) 핵심 노드 참조.
    this.bowImg = this.layout.tryById<Phaser.GameObjects.Image>(NODE.bow);
    if (this.bowImg) {
      this.bowBaseAngle = this.bowImg.angle;
      this.bowBaseScaleX = this.bowImg.scaleX;
      this.bowBaseScaleY = this.bowImg.scaleY;
      // 그립을 회전축으로 — 보이는 위치는 동일하게 유지하며 origin/position 보정(활 각도 애니메이션용).
      const dh = this.bowImg.displayHeight;
      this.bowImg.setOrigin(0.5, BOW_GRIP_ORIGIN_Y);
      this.bowImg.y += (BOW_GRIP_ORIGIN_Y - 0.5) * dh;
      this.bowBaseX = this.bowImg.x;
      this.bowBaseY = this.bowImg.y;
      this.bowImg.setDepth(6).setAlpha(BOW_ALPHA); // 활 반투명
    }
    // 가상 크로스헤어(레티클)는 쓰지 않는다 — 조준은 오직 활(방향/이동/각도)로. 숨김.
    this.reticle = this.layout.tryById<Phaser.GameObjects.Image>(NODE.reticle);
    this.reticle?.setVisible(false);

    const anchorNode = this.layout.nodeById(NODE.anchor);
    this.anchor = { x: anchorNode?.x ?? 343, y: anchorNode?.y ?? 1080 };

    this.waveText = this.layout.tryById<Phaser.GameObjects.Text>(NODE.waveText);
    this.healthText = this.layout.tryById<Phaser.GameObjects.Text>(NODE.healthText);
    this.scoreText = this.layout.tryById<Phaser.GameObjects.Text>(NODE.scoreText);
    this.layout.tryById<Phaser.GameObjects.Text>(NODE.scoreDup)?.setVisible(false);

    // 3) 줌 가능한 필드 컨테이너 — 배경(에디터 1280폭, 화면보다 넓음)을 옮긴다. 평소엔 scale 1
    //    (달/프레임 다 보임), 조준(드로우) 시에만 조준점 축으로 확대(조준되면서 확대). 추가 상시확대 없음.
    this.world = this.add.container(0, 0).setDepth(2);
    const bg = this.layout.tryById<Phaser.GameObjects.Image>(NODE.bg);
    if (bg) this.world.add(bg);

    // 4) 조준 시각요소(스크린 공간). 활의 조준선 = 빛나는 이펙트(이미지 아님).
    this.sightFx = this.add.graphics().setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
    this.anchorRing = this.add
      .circle(this.anchor.x, this.anchor.y, 38, 0x74c13a, 0.2)
      .setStrokeStyle(3, 0x74c13a, 0.8)
      .setDepth(9.4);
    this.handle = this.add
      .circle(this.anchor.x, this.anchor.y, HANDLE_R, 0xffffff, 0.42)
      .setStrokeStyle(4, 0xffffff, 0.92)
      .setDepth(9.5);

    // 5) 안내/배너 텍스트.
    this.promptText = this.add
      .text(this.scale.width / 2, 1208, '드래그로 그 지점을 조준(배경 확대) · 미세조정 후 떼면 발사', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '20px',
        color: '#eaffd6',
      })
      .setOrigin(0.5)
      .setStroke('#0c1a06', 5)
      .setDepth(28);
    this.bannerText = this.add
      .text(this.scale.width / 2, 360, '', {
        fontFamily: '"Do Hyeon", sans-serif',
        fontSize: '64px',
        color: '#9be85a',
      })
      .setOrigin(0.5)
      .setStroke('#0c1a06', 8)
      .setDepth(30)
      .setVisible(false);

    // 6) 입력.
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);

    // 7) 실시간 글로벌 랭킹(왼쪽). 판 시작마다 식별자 로드 + NPC 사다리 고정 → 내 점수로 매 갱신.
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

    // 8) 초기화 + 첫 웨이브.
    this.resetState();
    this.startWave(0);
  }

  /** 내 현재 점수를 NPC 사다리에 끼워 왼쪽 패널을 실시간 갱신. */
  private refreshRank(): void {
    if (!this.liveRank) return;
    this.liveRank.update(rankBoard(this.npcs, this.identity, this.score));
  }

  // ── 상태/HUD ─────────────────────────────────────────────────

  private resetState(): void {
    this.phase = 'playing';
    this.zombies = [];
    this.arrows = [];
    this.groundArrows = []; // 재시작 시 잔여(이미 파괴된) 바닥 화살 참조 정리 — 캡 오작동/누수 방지
    this.health = MAX_HEALTH;
    this.score = 0;
    this.streak = 0;
    this.waveIndex = 0;
    this.aimX = 360;
    this.aimY = AIM_Y_NEAR;
    this.drawing = false;
    this.drawAmt = 0;
    this.world.setScale(1).setPosition(0, 0);
    this.handle.setPosition(this.anchor.x, this.anchor.y); // 흰 원 = d-pad 위치(휴식)
    this.updateHud();
    this.updateAimVisuals();
  }

  private updateHud(): void {
    this.scoreText?.setText(formatScore(this.score));
    this.healthText?.setText(`${Math.max(0, this.health)}/${MAX_HEALTH}`);
    this.waveText?.setText(waveLabel(this.waveIndex));
    this.refreshRank(); // 점수 변화 → 왼쪽 랭킹 실시간 반영
  }

  // ── 웨이브 ────────────────────────────────────────────────────

  private startWave(index: number): void {
    const def = waveAt(index);
    if (!def) {
      this.endGame(true);
      return;
    }
    this.waveIndex = index;
    this.wave = def;
    this.spawnedInWave = 0;
    this.spawnAcc = def.intervalMs;
    this.waveActive = true;
    this.updateHud();
    this.showBanner(`웨이브 ${index + 1}`);
    sfx('wave_start', { volume: 0.7 }); // 웨이브 시작 스팅어
    setIntense(index >= 1); // v3: 1웨이브=story, 2웨이브부터 combat BGM(교전)
  }

  private advanceWaveIfClear(): void {
    if (!this.waveActive) return;
    const aliveOrPending = this.spawnedInWave < this.wave.count || this.aliveCount() > 0;
    if (aliveOrPending) return;
    this.waveActive = false;
    const next = this.waveIndex + 1;
    if (isAllClear(next)) {
      this.endGame(true);
      return;
    }
    sfx('wave_clear', { volume: 0.75 }); // 웨이브 클리어 스팅어
    this.time.delayedCall(1100, () => {
      if (this.phase === 'playing') this.startWave(next);
    });
  }

  private aliveCount(): number {
    let n = 0;
    for (const z of this.zombies) if (!z.dead) n++;
    return n;
  }

  private showBanner(text: string): void {
    this.bannerText.setText(text).setVisible(true).setAlpha(1).setScale(0.7);
    this.tweens.add({ targets: this.bannerText, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: this.bannerText,
      alpha: 0,
      delay: 750,
      duration: 450,
      onComplete: () => this.bannerText.setVisible(false),
    });
  }

  // ── 좀비(원근, 에디터 2.5D 필드 기반) ──────────────────────────

  /** 에디터 'field' 노드(2.5D 영역)에서 소실점·평면·높이를 추출. 없으면 폴백 유지. */
  private parseField(doc: LayoutDoc): void {
    const node = doc.nodes.find((n) => n.type === 'field') as unknown as
      | {
          x: number;
          y: number;
          vp?: { dx?: number; dy?: number };
          far?: { h?: number };
          near?: { h?: number };
          scaleRows?: { y0?: number; y1?: number; vp?: { x?: number; y?: number } };
        }
      | undefined;
    if (node) {
      const sr = node.scaleRows;
      this.field = {
        vpX: sr?.vp?.x ?? node.x + (node.vp?.dx ?? 0),
        vpY: sr?.vp?.y ?? node.y + (node.vp?.dy ?? 0),
        yFar: sr?.y0 ?? FIELD_FALLBACK.yFar,
        yNear: sr?.y1 ?? FIELD_FALLBACK.yNear,
        hFar: node.far?.h ?? FIELD_FALLBACK.hFar,
        hNear: node.near?.h ?? FIELD_FALLBACK.hNear,
      };
    }
    this.aimX = 360;
    this.aimY = AIM_Y_NEAR;
  }

  // 2.5D 투영(project/depthFromY/laneFromX)은 logic/perspective.ts(순수·테스트)로 분리해 import.

  private applyProjection(z: Zombie): void {
    const pr = project(this.field, z.d, z.laneX);
    z.spr
      .setPosition(pr.x, pr.y)
      .setScale((pr.h * z.sizeMul) / z.frameH)
      .setAlpha(pr.alpha)
      .setDepth(pr.depth);
    const dw = z.spr.displayWidth;
    const dh = z.spr.displayHeight;
    // 발밑 그림자 — 좀비 바로 뒤(아래 깊이)에 납작 타원.
    z.shadow
      .setPosition(pr.x, pr.y + dh * ZOMBIE_FOOT_FRAC)
      .setScale((dw * ZOMBIE_SHADOW_W) / 128, (dw * ZOMBIE_SHADOW_W * ZOMBIE_SHADOW_FLAT) / 128)
      .setAlpha(ZOMBIE_SHADOW_ALPHA * pr.alpha)
      .setDepth(pr.depth - 0.1);
    // 꽂힌 화살들 — 좀비 스프라이트 변환(위치·크기)에 강체로 고정해 좀비와 "정확히 동기화"(독립 흔들림 없음).
    for (const st of z.stuck) {
      st.img
        .setPosition(pr.x + st.fx * dw, pr.y + st.fy * dh)
        .setRotation(st.ang)
        .setScale(st.sf * dh)
        .setAlpha(pr.alpha)
        .setDepth(pr.depth + 0.3);
    }
  }

  private spawnZombie(): void {
    const type = ZOMBIE_TYPES[Phaser.Math.Between(0, ZOMBIE_TYPES.length - 1)];
    const laneX = Phaser.Math.Between(SPAWN_X_MIN, SPAWN_X_MAX);
    const spr = this.add.sprite(this.field.vpX, this.field.yFar, type.key, ZOMBIE_FRAME0).setOrigin(0.5, 0.5);
    // 등장 타이밍·걷는 속도를 제각각으로 → 같은 좀비도 다르게.
    spr.play({ key: type.anim, startFrame: Phaser.Math.Between(0, type.frameCount - 1) });
    spr.anims.timeScale = Phaser.Math.FloatBetween(0.7, 1.4);
    const speed = this.wave.speed * Phaser.Math.FloatBetween(0.7, 1.3);
    const shadow = this.add.image(this.field.vpX, this.field.yFar, SHADOW_KEY);
    this.world.add(shadow);
    this.world.add(spr);
    const z: Zombie = {
      spr,
      d: 0,
      speed,
      laneX,
      sizeMul: Phaser.Math.FloatBetween(0.82, 1.2),
      frameH: type.frameH,
      hp: ZOMBIE_HP,
      shadow,
      stuck: [],
      dead: false,
    };
    this.applyProjection(z);
    this.zombies.push(z);
    if (Phaser.Math.FloatBetween(0, 1) < 0.3) {
      sfx('zombie_groan', { volume: 0.26, pitch: pitchVar(0.06) }); // 가끔 분위기용 으르렁
    }
  }

  private killZombie(z: Zombie): void {
    z.dead = true;
    const { x, y } = z.spr;

    const now = this.time.now;
    this.streak = now - this.lastKillAt <= STREAK_TIMEOUT ? this.streak + 1 : 1;
    this.lastKillAt = now;
    const points = Math.round(killScore(z.d) * comboMultiplier(this.streak));
    this.score += points;
    this.updateHud();

    sfx('zombie_death', { volume: 0.8, pitch: pitchVar(0.03) }); // 처치(±3%)
    if (this.streak >= 3) sfx('coin', { volume: 0.4, pitch: pitchVar(0.02) }); // 연속 처치 보너스 칭

    const blood = this.add.particles(x, y, SPARK_KEY, {
      speed: { min: 60, max: 220 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.1 * z.sizeMul, end: 0 },
      lifespan: 380,
      quantity: 12,
      tint: [0x7bbf3a, 0xb33636, 0x4f7a1f],
      blendMode: 'NORMAL',
      emitting: false,
    });
    blood.setDepth(10);
    this.world.add(blood);
    blood.explode(12);
    this.time.delayedCall(460, () => blood.destroy());

    const label = this.streak >= 3 ? `+${points}  x${this.streak}` : `+${points}`;
    const pop = this.add
      .text(x, y - 18, label, {
        fontFamily: '"Do Hyeon", sans-serif',
        fontSize: this.streak >= 3 ? '34px' : '28px',
        color: this.streak >= 3 ? '#ffd23f' : '#ffffff',
      })
      .setOrigin(0.5)
      .setStroke('#0c1a06', 6)
      .setDepth(11);
    this.world.add(pop);
    this.tweens.add({
      targets: pop,
      y: y - 90,
      alpha: 0,
      scale: 1.15,
      duration: 760,
      ease: 'Cubic.easeOut',
      onComplete: () => pop.destroy(),
    });

    this.clearZombieDecor(z, true); // 그림자·꽂힌 화살 함께 페이드
    this.tweens.add({
      targets: z.spr,
      alpha: 0,
      angle: Phaser.Math.Between(-70, 70),
      scaleX: z.spr.scaleX * 1.15,
      scaleY: z.spr.scaleY * 0.7,
      duration: 260,
      ease: 'Quad.easeIn',
      onComplete: () => z.spr.destroy(),
    });
  }

  private leakZombie(z: Zombie): void {
    z.dead = true;
    this.streak = 0;
    this.health = Math.max(0, this.health - ZOMBIE_DAMAGE);
    this.updateHud();
    this.cameras.main.shake(160, 0.008);
    this.cameras.main.flash(140, 120, 0, 0);
    sfx('zombie_groan', { volume: 0.6, pitch: pitchVar(0.04) }); // 좀비가 플레이어에 도달(피격)
    this.clearZombieDecor(z, false);
    z.spr.destroy();
    if (this.health <= 0) this.endGame(false);
  }

  // ── 입력(드로우/조준) ─────────────────────────────────────────

  private onPointerDown(p: Phaser.Input.Pointer): void {
    startAudio(); // 첫 제스처에서 오디오 언락 + BGM/앰비언스 시작(1회)
    if (this.phase === 'over') {
      sfx('ui_tap', { volume: 0.6 });
      this.scene.restart();
      return;
    }
    sfx('bow_draw', { volume: 0.5 }); // 시위 당김
    this.handleTween?.stop();
    this.worldTween?.stop();
    this.handle.setScale(1);
    this.drawing = true;
    this.dragStart = { x: p.x, y: p.y }; // 시위 잡은 지점
    this.updateDrawFromPointer(p);
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (!this.drawing || !p.isDown) return;
    this.updateDrawFromPointer(p);
  }

  private onPointerUp(): void {
    if (this.phase === 'over' || !this.drawing) return;
    this.drawing = false;
    const dragDist = this.drawAmt * DRAG_FULL;
    // 겨냥 줌을 즉시 원위치(Z=1) — 화살은 world 컨테이너 소속이라 줌아웃 트윈을 타면 비행 중 줄어든다(점 됨).
    // 발사 전에 Z=1로 맞춰 화살이 정상 크기로 날아가게 한다.
    this.worldTween?.stop();
    this.world.setScale(1).setPosition(0, 0);
    if (dragDist >= DRAW_MIN_DIST) {
      this.fireArrow();
    }
    this.sightFx.clear(); // 조준선 이펙트 끔
    this.snapHandleBack(); // 흰 원(노크)이 d-pad(앵커)로 튕겨 돌아옴
    this.resetBow();
    this.drawAmt = 0;
  }

  /** 화면 좌표 → 필드(world 로컬) 좌표. 줌이 걸려도 조준/명중을 필드 기준으로 일치시키기 위함. */
  private pointerToField(sx: number, sy: number): { x: number; y: number } {
    const Z = this.world.scaleX || 1;
    return { x: (sx - this.world.x) / Z, y: (sy - this.world.y) / Z };
  }

  /** 필드 좌표 → 화면 좌표(흰 원/활 표시용). */
  private fieldToScreen(fx: number, fy: number): { x: number; y: number } {
    const Z = this.world.scaleX || 1;
    return { x: this.world.x + fx * Z, y: this.world.y + fy * Z };
  }

  private updateDrawFromPointer(p: Phaser.Input.Pointer): void {
    // 슬링샷: 시위를 잡은 지점(dragStart)에서 당긴 벡터의 "반대" 방향으로 조준점이 뻗는다.
    const pullX = p.x - this.dragStart.x;
    const pullY = p.y - this.dragStart.y;
    const pullDist = Math.hypot(pullX, pullY);
    this.drawAmt = clamp(pullDist / DRAG_FULL, 0, 1);
    // 조준점(화면) = NOCK 에서 당김 반대 방향으로. 좌우는 미세(낮은 배율 = 회전점 높임), 상하는 넉넉히.
    const aimSx = clamp(NOCK.x - pullX * SLING_GAIN_X, AIM_X_MIN, AIM_X_MAX);
    const aimSy = clamp(NOCK.y - pullY * SLING_GAIN_Y, AIM_Y_FAR, AIM_Y_NEAR);
    // 조준점을 축으로 확대(당길수록 더) — 표적이 그 자리에서 커진다(확대, 축소 아님).
    const af = this.pointerToField(aimSx, aimSy);
    const Z = 1 + this.drawAmt * SCOPE_ZOOM;
    this.world.setScale(Z).setPosition(aimSx - af.x * Z, aimSy - af.y * Z);
    this.aimX = af.x;
    this.aimY = af.y;
    // 흰 원(시위 노크) = 당긴 손가락 위치.
    this.handle.setPosition(p.x, p.y);
    this.updateAimVisuals();
  }

  private updateAimVisuals(): void {
    this.anchorRing.setPosition(this.anchor.x, this.anchor.y);

    // 타겟 지정(락온) 없음 — 오직 겨냥한 조준점(aimX, aimY)으로만 향한다.
    const scr = this.fieldToScreen(this.aimX, this.aimY); // 조준점 화면 위치

    // 활: 조준선(NOCK→조준점) 방향으로 향함(여분 기울임 없음) + "확대"하여 사이트 링이 조준점(선의 끝)에 닿게 +
    // 활 전체를 좌우로 평행이동하여 링을 선에 맞춘다(기울임 보정 안 함 — 회전 중심 고정 안 함).
    if (this.bowImg) {
      if (this.drawing) {
        const lineRad = Math.atan2(scr.y - NOCK.y, scr.x - NOCK.x);
        const angRad = lineRad + Math.PI / 2; // 활 위축이 조준선을 향함
        const ringLen = Math.hypot(BOW_SIGHT_LX, BOW_SIGHT_LY); // 그립 → 사이트 링 거리(bz=1)
        const distNA = Math.hypot(scr.x - NOCK.x, scr.y - NOCK.y);
        const bz = Math.max(BOW_ZOOM_MIN, distNA / ringLen); // 링이 조준점에 닿도록 확대
        const cos = Math.cos(angRad);
        const sin = Math.sin(angRad);
        const offX = BOW_SIGHT_LX * bz * cos - BOW_SIGHT_LY * bz * sin;
        const offY = BOW_SIGHT_LX * bz * sin + BOW_SIGHT_LY * bz * cos;
        // 평행이동: 사이트 링이 정확히 조준점에 오도록 활을 옮긴다(왼쪽 등).
        this.bowImg
          .setPosition(scr.x - offX, scr.y - offY)
          .setScale(this.bowBaseScaleX * bz, this.bowBaseScaleY * bz)
          .setAngle(angRad * Phaser.Math.RAD_TO_DEG);
      } else {
        this.bowImg
          .setPosition(this.bowBaseX, this.bowBaseY)
          .setScale(this.bowBaseScaleX, this.bowBaseScaleY)
          .setAngle(this.bowBaseAngle);
      }
    }

    this.drawSightLine(scr.x, scr.y);
  }

  /** 조준점 마커만 표시(붉은 점, 투명도 높게) — 플레이어→사이트 사선(빔)은 없음(활 자체가 조준). */
  private drawSightLine(tx: number, ty: number): void {
    this.sightFx.clear();
    if (!this.drawing) return;
    this.sightFx.fillStyle(0xff2e2e, 0.45);
    this.sightFx.fillCircle(tx, ty, 7);
    this.sightFx.fillStyle(0xff5555, 0.6);
    this.sightFx.fillCircle(tx, ty, 3);
  }

  /** 활을 원래 위치·크기·각도로 복귀. */
  private resetBow(): void {
    if (!this.bowImg) return;
    this.tweens.add({
      targets: this.bowImg,
      x: this.bowBaseX,
      y: this.bowBaseY,
      angle: this.bowBaseAngle,
      scaleX: this.bowBaseScaleX,
      scaleY: this.bowBaseScaleY,
      duration: 320,
      ease: 'Quad.easeOut',
    });
  }

  /** 시위 놓기 — 흰 원이 d-pad(앵커)로 빠르게 튕겨 돌아온다. */
  private snapHandleBack(): void {
    this.handleTween?.stop();
    this.handleTween = this.tweens.add({
      targets: this.handle,
      x: this.anchor.x,
      y: this.anchor.y,
      duration: 200,
      ease: 'Quad.easeIn',
    });
  }

  // ── 발사(조준점으로 날아가 착탄) ──────────────────────────────

  private fireArrow(): void {
    const now = this.time.now;
    if (now - this.lastFireAt < FIRE_COOLDOWN) return;
    this.lastFireAt = now;

    // 타겟 지정 없음 — 오직 겨냥한 조준점(aimX, aimY)으로 발사하고, 타격은 그 "도착 지점"에서만.
    const ox = NOCK.x;
    const oy = NOCK.y;
    const tx = this.aimX;
    const ty = this.aimY;
    const dist = Math.hypot(tx - ox, ty - oy);
    // 2.5D: 지면 깊이/레인을 좀비와 동일한 투영 좌표로 환산(발사=near, 착탄=조준점 깊이).
    const dT = depthFromY(this.field, ty);
    const laneT = laneFromX(this.field, tx, dT);
    const d0 = depthFromY(this.field, oy);
    // 화면상 호 lift(지면 위로 띄우는 높이, px). 가까우면 0=직선, 멀수록 큰 로브.
    const screenArcH = Math.max(0, Math.min(ARC_MAX, (oy - ty - ARC_STRAIGHT) * ARC_FRAC));
    const dur = Math.max(0.18, dist / ARROW_SPEED);
    // 실제 화살 스프라이트(촉 끝이 피벗) + 지면 그림자.
    const img = this.add
      .image(ox, oy, ARROW_KEY)
      .setOrigin(0.5, 0.04)
      .setDepth(8)
      .setRotation(Math.atan2(ty - oy, tx - ox) + Math.PI / 2);
    const shadow = this.add
      .ellipse(ox, oy, 30, 10, 0x000000, ARROW_SHADOW_ALPHA)
      .setDepth(7);
    this.world.add(img);
    this.world.add(shadow);
    this.arrows.push({
      img,
      shadow,
      d0,
      dT,
      lane0: NOCK.x,
      laneT,
      tx,
      ty,
      screenArcH,
      dur,
      t: 0,
      prevX: ox,
      prevY: oy,
      dead: false,
    });
    sfx('bow_release', { volume: 0.85 }); // 발사(릴리스)
    sfx('arrow_fly', { volume: 0.5, pitch: pitchVar(0.04) }); // 화살 날아가는 소리(릴리스와 동기)
  }

  /** 도착 지점에서 타격 — 좀비 몸체 안이면 부위(머리/몸통/다리)별 피해. 죽으면 처치, 살면 화살이 몸에 꽂힌다. */
  private landArrow(ar: Arrow): void {
    const lx = ar.tx;
    const ly = ar.ty;
    let best: Zombie | undefined;
    let bestD = Infinity;
    for (const z of this.zombies) {
      if (z.dead) continue;
      // 명중 박스 = 좀비 "실제 표시 크기"에만 비례(최소값 없음). ⚠️최소폭을 두면 작은 먼 좀비가
      // 몸보다 큰 박스로 대충 조준해도 맞음 → 가로·세로 모두 표시크기만 사용해 먼 좀비는 정확 조준 필요.
      const halfW = z.spr.displayWidth * HIT_BOX_W;
      const halfH = z.spr.displayHeight * HIT_BOX_H;
      if (Math.abs(lx - z.spr.x) > halfW || Math.abs(ly - z.spr.y) > halfH) continue;
      const d = Phaser.Math.Distance.Between(lx, ly, z.spr.x, z.spr.y);
      if (d < bestD) {
        bestD = d;
        best = z;
      }
    }
    ar.dead = true;
    ar.shadow.destroy();
    ar.img.destroy();
    if (!best) {
      this.stickArrow(lx, ly); // 빗나감 → 바닥에 꽂힘(피 없음).
      return;
    }
    // 부위 판정: 좀비 스프라이트 안에서 명중 y의 세로 비율(0 위=머리 → 1 아래=다리).
    const dh = best.spr.displayHeight;
    const frac = clamp((ly - (best.spr.y - dh / 2)) / dh, 0, 1);
    const isHead = frac <= ZONE_HEAD_MAX;
    const dmg = isHead ? DMG_HEAD : frac <= ZONE_TORSO_MAX ? DMG_TORSO : DMG_LEG;
    best.hp -= dmg;
    this.bloodSplatter(lx, ly); // 맞으면 피가 튀는 파티클.
    sfx(isHead ? 'hit_head' : 'hit_body', { volume: 0.85, pitch: pitchVar(0.03) }); // 부위별 타격음(±3%)
    if (best.hp <= 0) {
      this.killZombie(best);
    } else {
      this.embedArrowInZombie(best, lx, ly); // 살아남음 → 화살이 몸에 꽂힌 채 따라옴(촉은 안 보임).
    }
  }

  /** 명중 시 피가 튀는 파티클 — 붉은 핏방울 스플래터. */
  private bloodSplatter(x: number, y: number): void {
    const p = this.add.particles(x, y, SPARK_KEY, {
      speed: { min: 80, max: 280 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.0, end: 0 },
      lifespan: { min: 240, max: 460 },
      quantity: 16,
      gravityY: 320,
      tint: [0xb02020, 0x7a1414, 0xd6402f, 0x8e1b1b],
      blendMode: 'NORMAL',
      emitting: false,
    });
    p.setDepth(10);
    this.world.add(p);
    p.explode(16);
    this.time.delayedCall(520, () => p.destroy());
  }

  /** 좀비 몸에 화살을 꽂는다 — 촉은 몸 안(안 보임), 샤프트+깃이 "날아온 방향(플레이어 쪽=앞)"으로 삐져나옴. */
  private embedArrowInZombie(z: Zombie, hitX: number, hitY: number): void {
    const dw = z.spr.displayWidth || 1;
    const dh = z.spr.displayHeight || 1;
    // 깃(아래 끝)이 발사 원점(NOCK=플레이어 쪽)을 향하도록 회전 → 앞에서 맞아 앞으로 박힌 모습.
    const ang = Math.atan2(hitX - NOCK.x, NOCK.y - hitY);
    const sf = STUCK_ARROW_LEN_FRAC / 128; // 텍스처 높이 128 기준
    const img = this.add
      .image(hitX, hitY, ARROW_STUCK_KEY)
      .setOrigin(0.5, 0.02) // 박힌 끝(촉 쪽)이 명중점, 깃이 밖으로
      .setRotation(ang)
      .setScale(sf * dh)
      .setDepth(z.spr.depth + 0.3);
    this.world.add(img);
    z.stuck.push({ img, fx: (hitX - z.spr.x) / dw, fy: (hitY - z.spr.y) / dh, ang, sf });
  }

  /** 좀비 소멸 시 그림자·꽂힌 화살 정리(처치=페이드, 누수=즉시). */
  private clearZombieDecor(z: Zombie, fade: boolean): void {
    const extras = [z.shadow, ...z.stuck.map((s) => s.img)];
    if (fade) {
      this.tweens.add({
        targets: extras,
        alpha: 0,
        duration: 260,
        ease: 'Quad.easeIn',
        onComplete: () => extras.forEach((e) => e.destroy()),
      });
    } else {
      extras.forEach((e) => e.destroy());
    }
  }

  /** 빗나간 화살을 바닥에 꽂아 둔다 — 촉은 땅에 박혀 안 보이고(ARROW_STUCK_KEY), 샤프트+깃이 앞(플레이어 쪽)으로. 누적(캡). */
  private stickArrow(screenX: number, screenY: number): void {
    const d = depthFromY(this.field, screenY);
    const pr = project(this.field, d, laneFromX(this.field, screenX, d));
    const persp = Math.max(0.12, pr.h / this.field.hNear); // 깊이 원근 — 멀리 꽂힌 화살일수록 작게(바닥 0.12)
    const ang = Math.atan2(screenX - NOCK.x, NOCK.y - screenY); // 깃이 발사 원점(앞=플레이어)을 향함
    const stuck = this.add
      .image(screenX, screenY, ARROW_STUCK_KEY)
      .setOrigin(0.5, 0.02) // 박힌 끝(촉 쪽)이 착탄점, 깃이 밖으로
      .setRotation(ang)
      .setDepth(pr.depth + 0.2)
      .setScale((ARROW_NEAR_H / 128) * persp);
    this.world.add(stuck);
    this.groundArrows.push(stuck);
    if (this.groundArrows.length > GROUND_ARROW_MAX) this.groundArrows.shift()?.destroy();
  }

  // ── 매 프레임 ─────────────────────────────────────────────────

  update(_time: number, delta: number): void {
    if (this.phase !== 'playing') return;
    const dt = delta / 1000;

    if (this.streak > 0 && this.time.now - this.lastKillAt > STREAK_TIMEOUT) this.streak = 0;

    // 좀비 등장.
    if (this.waveActive && this.spawnedInWave < this.wave.count) {
      this.spawnAcc += delta;
      if (this.spawnAcc >= this.wave.intervalMs) {
        this.spawnAcc = 0;
        this.spawnedInWave++;
        this.spawnZombie();
      }
    }

    // 좀비 전진(깊이 → 원근 투영).
    for (const z of this.zombies) {
      if (z.dead) continue;
      z.d += z.speed * dt;
      this.applyProjection(z);
      if (z.d >= 1) this.leakZombie(z);
    }

    // 화살 비행 — 2.5D: 지면점은 좀비와 동일 투영(깊이 따라 수렴·축소), 그 위로 화면 호 lift.
    for (const ar of this.arrows) {
      if (ar.dead) continue;
      ar.t = Math.min(1, ar.t + dt / ar.dur);
      const tc = ar.t;
      // 1) 지면 점(near→조준점 깊이) 투영 → 원근 좌표·크기.
      const d = lerp(ar.d0, ar.dT, tc);
      const lane = lerp(ar.lane0, ar.laneT, tc);
      const gp = project(this.field, d, lane);
      // 2) 지면 위로 띄우는 화면 호(가까우면 0, 멀수록 큰 로브).
      const arcLift = ar.screenArcH * 4 * tc * (1 - tc);
      const x = gp.x;
      const y = gp.y - arcLift;
      // 3) 크기 = 발사 크기에서 진행에 따라 점차 축소 → 도착 시 1/5(ARROW_END_SCALE). (그림자는 깊이 원근비 유지)
      const persp = gp.h / this.field.hNear;
      const arrowScale = (ARROW_NEAR_H / 176) * lerp(1, ARROW_END_SCALE, tc);
      // 4) 회전 = 화면 속도(직전→현재) 접선. 발사 시 위, 정점 수평, 낙하 시 표적으로.
      const ang = Math.atan2(y - ar.prevY, x - ar.prevX) + Math.PI / 2;
      ar.img.setPosition(x, y).setScale(arrowScale).setRotation(ang).setDepth(gp.depth + 0.5);
      // 5) 그림자 = 지면점(lift 안 함)에 납작 타원, 원근비로 축소. 화살이 그 위로 떠 입체감.
      ar.shadow
        .setPosition(gp.x, gp.y)
        .setScale(persp * 1.4, persp * 1.4)
        .setAlpha(ARROW_SHADOW_ALPHA * clamp(arcLift / 40, 0.25, 1))
        .setDepth(gp.depth + 0.4);
      ar.prevX = x;
      ar.prevY = y;
      if (ar.t >= 1) this.landArrow(ar);
    }

    // 필드 깊이 정렬(먼 좀비가 뒤, 가까운 좀비가 앞) + 정리 + 웨이브 진행.
    this.world.sort('depth');
    this.zombies = this.zombies.filter((z) => !z.dead);
    this.arrows = this.arrows.filter((a) => !a.dead);
    this.advanceWaveIfClear();
  }

  // ── 종료(승리/패배) ───────────────────────────────────────────

  private endGame(win: boolean): void {
    if (this.phase === 'over') return;
    this.phase = 'over';
    sfx(win ? 'wave_clear' : 'explosion', { volume: win ? 0.95 : 0.7 }); // 승리=클리어 / 패배=임팩트
    this.drawing = false;
    this.worldTween?.stop();
    this.world.setScale(1).setPosition(0, 0);
    this.handle.setVisible(false);
    this.anchorRing.setVisible(false);
    this.reticle?.setVisible(false);
    this.sightFx.clear();
    this.promptText.setText('');
    this.refreshRank(); // 최종 점수 기준 등수를 왼쪽 패널에 확정 표시(그대로 남는다)

    // 캔버스를 어둡게 + 결과 텍스트는 화면 중앙(왼쪽 랭킹 패널은 좌상단이라 세로로 겹치지 않음).
    // (실시간 랭킹은 DOM 이라 dim 위에 그대로 밝게 떠 최종 순위를 보여준다.) 탭=다시하기.
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x06120a, 0.74).setOrigin(0).setDepth(40);
    this.add
      .text(cx, cy - 150, win ? '클리어!' : '게임 오버', {
        fontFamily: '"Do Hyeon", sans-serif',
        fontSize: '56px',
        color: win ? '#9bff5a' : '#ff6b6b',
      })
      .setOrigin(0.5)
      .setStroke('#0c1a06', 8)
      .setDepth(41);
    this.add
      .text(cx, cy - 30, formatScore(this.score), {
        fontFamily: '"Do Hyeon", sans-serif',
        fontSize: '96px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setStroke('#0c1a06', 10)
      .setDepth(41);
    this.add
      .text(cx, cy + 42, '점', { fontFamily: '"Jua", sans-serif', fontSize: '28px', color: '#e8f5e9' })
      .setOrigin(0.5)
      .setDepth(41);
    const again = this.add
      .text(cx, cy + 150, '다시하기 — 화면을 탭', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '26px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setStroke('#0c1a06', 6)
      .setDepth(41);
    this.tweens.add({ targets: again, alpha: 0.4, duration: 700, yoyo: true, repeat: -1 });
  }
}
