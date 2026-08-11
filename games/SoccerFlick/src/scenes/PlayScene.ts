/**
 * PlayScene — 사커플릭 본편.
 *   · 에디터 레이아웃(배경/골대/헤더/HUD/파워업) 렌더 + field 노드 → Matter 정적 벽/골.
 *   · 말(레드5/블루5)·공 = Matter 강체. 슬링샷 드래그로 발사 → 충돌 시뮬 → 정지 시 턴 교대.
 *   · 레드=플레이어(슬링샷 입력), 블루=AI(고스트볼 휴리스틱). 5v5 시간제.
 *
 * 물리·턴·골·AI 의 판정 로직은 src/logic(순수·테스트됨)에 있고, 여기선 Matter 와 입력만 배선.
 */
import Phaser from 'phaser';
import { TEX, CODE_OWNED_KEYS, UI_LAYOUT_KEY } from '../assets.js';
import { buildLayout, type LayoutIndex, type LayoutDoc, type LayoutEntry } from '../ui/layoutLoader.js';
import { parseField, detectGoal, targetGoalCenter, type FieldGeom } from '../logic/field.js';
import { kickoffFormation, ballKickoff, type Disc as FormDisc } from '../logic/formation.js';
import {
  createMatch,
  startSim,
  endSim,
  scoreGoal,
  resumeAfterGoal,
  tick,
  isOver,
  winner,
  formatTime,
  type MatchState,
} from '../logic/match.js';
import { startCountdown } from '@casual/core';
import { aimFromDrag, shotVelocity, edgeShotMultiplier, edgeProximity } from '../logic/aim.js';
import { chooseAiShot } from '../logic/ai.js';
import type { Team } from '../logic/types.js';

// ── 물리 튜닝 상수(HD 1080×2400 좌표 기준, 720 시절 ×1.5 스케일) ──
const DISC_R = 63; // 선수 말 반경(HD 기준 58 → 조정 후 +10% 확대)
const BALL_R = 38; // 공 반경(HD 기준 35 → 확대 후 -10% 축소)
const WALL_T = 100; // 벽 두께 — 최대 발사 속도(MAX_SPEED)보다 커야 터널링 방지
const REST_EPS = 0.36; // 이 속도 이하 = 정지
const SETTLE_FRAMES = 6; // 연속 정지 프레임 수
const SIM_TIMEOUT_MS = 6500; // 시뮬 강제 종료
const MAX_SPEED = 90; // 터널링 방지 속도 캡(벽 두께 100 미만 유지). 강화된 외곽·파워업 슛도 이 한도로 수렴.
const GRAB_R = 79; // 말 잡기 반경(디스크 크기에 맞춤)
const SPEED_MUL = 1.4; // SPEED 파워업 배율
const AI_DELAY_MS = 650;
const GOAL_PAUSE_MS = 1600;

interface DiscRef {
  readonly team: Team;
  readonly img: Phaser.Physics.Matter.Image;
}

export class PlayScene extends Phaser.Scene {
  private layout!: LayoutIndex;
  private field!: FieldGeom;
  private match!: MatchState;
  /** 3·2·1 킥오프 카운트다운 완료 여부 — 완료 전엔 매치 클록이 흐르지 않는다. */
  private introDone = false;

  private discs: DiscRef[] = [];
  private formation: FormDisc[] = [];
  private ball!: Phaser.Physics.Matter.Image;

  // HUD
  private timeText?: Phaser.GameObjects.Text;
  private redScoreText?: Phaser.GameObjects.Text;
  private blueScoreText?: Phaser.GameObjects.Text;
  private turnText?: Phaser.GameObjects.Text;

  // 입력/조준
  private dragging = false;
  private activeDisc: DiscRef | null = null;
  private aimGfx!: Phaser.GameObjects.Graphics;
  private turnRingGfx!: Phaser.GameObjects.Graphics; // 현재 턴 팀 말에 금색 링

  // 시뮬 추적
  private simStartedAt = 0;
  private settleCount = 0;

  // 파워업
  private speedCount = 2;
  private accCount = 2;
  private pendingSpeed = false;
  private pendingAccuracy = false;
  private speedBadge?: Phaser.GameObjects.Text;
  private accBadge?: Phaser.GameObjects.Text;
  private speedRing?: Phaser.GameObjects.Graphics;
  private accRing?: Phaser.GameObjects.Graphics;

  private resultShown = false;
  private timeAccum = 0;

  constructor() {
    super('play');
  }

  create(): void {
    const doc = this.cache.json.get(UI_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!doc) {
      this.add
        .text(this.scale.width / 2, this.scale.height / 2, '레이아웃 로드 실패', { color: '#fff', fontSize: '36px' })
        .setOrigin(0.5);
      return;
    }

    // 1) 에디터 렌더(말·공 목업 + 에디터 자동 그림자 노드는 코드가 다루므로 제외).
    //    `__sh_` = phaser-ui-editor 가 생성한 드롭섀도 텍스처(공/말 목업의 그림자) → 렌더 안 함.
    this.layout = buildLayout(this, doc, {
      skip: (n) => !!n.key && (CODE_OWNED_KEYS.has(n.key) || n.key.includes('__sh_')),
    });
    // 에디터 디자인을 1:1 재현(고정 1080×2400 세로 HD + Phaser FIT 레터박스).
    // 코어 fillCoverLayout 은 캔버스 폭을 720 으로 되돌려 HD 필드 우측을 잘라내므로 사용하지 않는다.

    // 2) field 폴리곤 → Matter 벽(골 주머니 포함, 사용자가 그린 라인 그대로).
    this.field = parseField(doc);
    this.buildWalls();

    // 3) 말·공 스폰.
    this.formation = kickoffFormation(this.field);
    this.spawnPieces();

    // 4) HUD 바인딩.
    this.bindHud();
    this.setupPowerups();

    // 5) 조준 그래픽 + 턴 링 + 입력.
    this.turnRingGfx = this.add.graphics().setDepth(12);
    this.aimGfx = this.add.graphics().setDepth(13);
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);

    // 6) 충돌 스파크.
    this.matter.world.on('collisionstart', this.onCollision, this);

    // 7) 매치 시작 — 시간제 매치라 3·2·1 킥오프 카운트다운(코어 공용) 후 클록 개시.
    this.match = createMatch('red', 120);
    this.beginAimPhase();
    void startCountdown(this, { go: 'KICK OFF!' }).then(() => {
      this.introDone = true;
    });
  }

  // ─────────────────────────── 물리 구성 ───────────────────────────

  /**
   * 에디터 충돌 폴리곤의 각 변을 Matter 정적 벽으로 생성(사용자가 그린 라인 그대로).
   * 골 주머니 notch 가 그대로 닫힌 포켓이 되어, 공은 입구로 들어가 안에 갇힌다(튕겨나가지 않음).
   * 각 벽은 무게중심 반대(외향)로 T/2 밀어 안쪽 면이 라인에 오도록 한다.
   */
  private buildWalls(): void {
    const pts = this.field.polygon;
    const n = pts.length;
    let cgx = 0;
    let cgy = 0;
    for (const p of pts) {
      cgx += p.x;
      cgy += p.y;
    }
    cgx /= n;
    cgy /= n;
    const T = WALL_T;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      const ang = Math.atan2(dy, dx);
      // 외향 법선(무게중심 반대 방향).
      let nx = -dy / len;
      let ny = dx / len;
      if (nx * (cgx - mx) + ny * (cgy - my) > 0) {
        nx = -nx;
        ny = -ny;
      }
      this.matter.add.rectangle(mx + (nx * T) / 2, my + (ny * T) / 2, len + T, T, {
        isStatic: true,
        angle: ang,
        restitution: 0.3,
        friction: 0,
      });
    }
  }

  private spawnPieces(): void {
    this.discs = this.formation.map((f) => {
      const key = f.team === 'red' ? TEX.DISC_RED : TEX.DISC_BLUE;
      const img = this.matter.add.image(f.pos.x, f.pos.y, key);
      // 스프라이트 표시 크기를 먼저 적용한 뒤, 마지막에 setCircle 로 바디 반경을 보이는 외곽(DISC_R)에 고정.
      // (순서 반대면 setDisplaySize 의 스케일이 바디까지 줄여 충돌 반경이 작아진다 → 겹침)
      img.setDisplaySize(DISC_R * 2, DISC_R * 2);
      img.setCircle(DISC_R, { restitution: 0.82, friction: 0.01, frictionStatic: 0, frictionAir: 0.052 });
      img.setDensity(0.0019);
      img.setFixedRotation();
      img.setDepth(10);
      return { team: f.team, img };
    });

    const bk = ballKickoff(this.field);
    this.ball = this.matter.add.image(bk.x, bk.y, TEX.BALL);
    this.ball.setDisplaySize(BALL_R * 2, BALL_R * 2);
    this.ball.setCircle(BALL_R, { restitution: 0.9, friction: 0.005, frictionStatic: 0, frictionAir: 0.03 });
    this.ball.setDensity(0.0011);
    this.ball.setFixedRotation();
    this.ball.setDepth(11);
    (this.ball.body as MatterJS.BodyType).label = 'ball';
  }

  // ─────────────────────────── HUD ───────────────────────────

  private findByName(name: string): LayoutEntry | undefined {
    return this.layout.entries().find((e) => e.node.name === name);
  }

  private bindHud(): void {
    const scores = this.layout.byBinding('score'); // x 오름차순: [0]=좌(레드), [1]=우(블루)
    this.redScoreText = scores[0]?.obj as Phaser.GameObjects.Text | undefined;
    this.blueScoreText = scores[1]?.obj as Phaser.GameObjects.Text | undefined;
    this.timeText = this.layout.byBinding('time')[0]?.obj as Phaser.GameObjects.Text | undefined;
    this.turnText = this.findByName('턴표시')?.obj as Phaser.GameObjects.Text | undefined;
  }

  private updateScoreText(): void {
    this.redScoreText?.setText(String(this.match.score.red));
    this.blueScoreText?.setText(String(this.match.score.blue));
  }

  private updateTurnText(): void {
    if (!this.turnText) return;
    const red = this.match.turn === 'red';
    this.turnText.setText(red ? "Red's Turn" : "Blue's Turn");
    this.turnText.setColor(red ? '#ff5a5a' : '#5aa2ff');
  }

  // ─────────────────────────── 파워업 ───────────────────────────

  private setupPowerups(): void {
    const speedEntry = this.layout.entries().find((e) => e.node.key === TEX.POWER_SPEED);
    const accEntry = this.layout.entries().find((e) => e.node.key === TEX.POWER_ACCURACY);
    if (speedEntry) {
      const o = speedEntry.obj as Phaser.GameObjects.Image;
      o.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.togglePower('speed'));
      this.speedRing = this.add.graphics().setDepth(o.depth + 1);
      this.speedBadge = this.makeBadge(o.x + 36, o.y - 33);
    }
    if (accEntry) {
      const o = accEntry.obj as Phaser.GameObjects.Image;
      o.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.togglePower('accuracy'));
      this.accRing = this.add.graphics().setDepth(o.depth + 1);
      this.accBadge = this.makeBadge(o.x + 36, o.y - 33);
    }
    this.updatePowerBadges();
  }

  private makeBadge(x: number, y: number): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, '2', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '27px',
        color: '#ffffff',
        backgroundColor: '#e23b3b',
        padding: { x: 9, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(40);
  }

  private togglePower(which: 'speed' | 'accuracy'): void {
    // 플레이어 조준 단계에서만, 잔여 카운트가 있을 때만.
    if (this.match.phase !== 'aim' || this.match.turn !== 'red') return;
    if (which === 'speed') {
      if (this.speedCount <= 0) return;
      this.pendingSpeed = !this.pendingSpeed;
    } else {
      if (this.accCount <= 0) return;
      this.pendingAccuracy = !this.pendingAccuracy;
    }
    this.updatePowerBadges();
  }

  private updatePowerBadges(): void {
    this.speedBadge?.setText(String(this.speedCount)).setVisible(this.speedCount > 0);
    this.accBadge?.setText(String(this.accCount)).setVisible(this.accCount > 0);
    this.drawRing(this.speedRing, this.pendingSpeed, this.layout.entries().find((e) => e.node.key === TEX.POWER_SPEED));
    this.drawRing(this.accRing, this.pendingAccuracy, this.layout.entries().find((e) => e.node.key === TEX.POWER_ACCURACY));
  }

  private drawRing(g: Phaser.GameObjects.Graphics | undefined, on: boolean, entry: LayoutEntry | undefined): void {
    if (!g || !entry) return;
    g.clear();
    if (!on) return;
    const o = entry.obj as Phaser.GameObjects.Image;
    g.lineStyle(4, 0xffd147, 1);
    g.strokeRoundedRect(o.x - o.displayWidth / 2 - 3, o.y - o.displayHeight / 2 - 3, o.displayWidth + 6, o.displayHeight + 6, 14);
  }

  private consumePowerups(): void {
    if (this.pendingSpeed && this.speedCount > 0) this.speedCount--;
    if (this.pendingAccuracy && this.accCount > 0) this.accCount--;
    this.pendingSpeed = false;
    this.pendingAccuracy = false;
    this.updatePowerBadges();
  }

  // ─────────────────────────── 입력(슬링샷) ───────────────────────────

  private canPlayerAim(): boolean {
    return this.match.phase === 'aim' && this.match.turn === 'red' && !isOver(this.match) && this.atRest();
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (!this.canPlayerAim()) return;
    let best: DiscRef | null = null;
    let bestD = GRAB_R;
    for (const d of this.discs) {
      if (d.team !== 'red') continue;
      const dist = Phaser.Math.Distance.Between(p.worldX, p.worldY, d.img.x, d.img.y);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    if (!best) return;
    this.activeDisc = best;
    this.dragging = true;
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (!this.dragging || !this.activeDisc) return;
    const disc = this.activeDisc.img;
    const edge = edgeProximity({ x: disc.x, y: disc.y }, this.field.playBounds);
    const aim = aimFromDrag({ x: disc.x, y: disc.y }, { x: p.worldX, y: p.worldY }, edge);
    this.drawAimGuide(disc.x, disc.y, aim.dirX, aim.dirY, aim.power, aim.valid);
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    if (!this.dragging || !this.activeDisc) return;
    const disc = this.activeDisc;
    const pos = { x: disc.img.x, y: disc.img.y };
    // 외곽라인에 가까울수록: 짧은 드래그로도 풀파워(edge → aimFromDrag) + 최종 슛 강화(edgeShotMultiplier).
    const edge = edgeProximity(pos, this.field.playBounds);
    const aim = aimFromDrag(pos, { x: p.worldX, y: p.worldY }, edge);
    this.aimGfx.clear();
    this.dragging = false;
    this.activeDisc = null;
    if (!aim.valid) return;
    const mul = (this.pendingSpeed ? SPEED_MUL : 1) * edgeShotMultiplier(pos, this.field.playBounds);
    const v = this.capToMaxSpeed(shotVelocity(aim.dirX, aim.dirY, aim.power, mul));
    disc.img.setVelocity(v.x, v.y);
    this.consumePowerups();
    this.fireBegan();
  }

  private drawAimGuide(x: number, y: number, dx: number, dy: number, power: number, valid: boolean): void {
    const g = this.aimGfx;
    g.clear();
    if (!valid) return;
    // 파워 링.
    g.lineStyle(4, 0xffffff, 0.5);
    g.strokeCircle(x, y, DISC_R + 9 + power * 15);
    // 방향 점선(어큐러시면 더 길게).
    const dots = Math.round(power * (this.pendingAccuracy ? 16 : 10)) + 2;
    const step = 34;
    for (let i = 1; i <= dots; i++) {
      const t = i * step;
      const a = 0.9 - (i / (dots + 2)) * 0.7;
      g.fillStyle(this.pendingAccuracy ? 0xffd147 : 0xffffff, a);
      g.fillCircle(x + dx * (DISC_R + t), y + dy * (DISC_R + t), 6);
    }
  }

  /** 현재 턴 팀의 말에 금색 링(조준 단계에서만, 은은한 펄스). */
  private drawTurnRings(): void {
    const g = this.turnRingGfx;
    g.clear();
    if (this.match.phase !== 'aim' || isOver(this.match)) return;
    const pulse = 0.55 + 0.35 * Math.sin(this.time.now / 220);
    g.lineStyle(5, 0xffd147, pulse);
    for (const d of this.discs) {
      if (d.team === this.match.turn) g.strokeCircle(d.img.x, d.img.y, DISC_R + 8);
    }
  }

  // ─────────────────────────── 턴 / 시뮬 ───────────────────────────

  private fireBegan(): void {
    this.match = startSim(this.match);
    this.simStartedAt = this.time.now;
    this.settleCount = 0;
  }

  private beginAimPhase(): void {
    this.updateTurnText();
    if (this.match.phase !== 'aim' || isOver(this.match)) return;
    if (this.match.turn === 'blue') {
      this.time.delayedCall(AI_DELAY_MS, () => {
        if (this.match.phase === 'aim' && this.match.turn === 'blue' && !isOver(this.match)) this.aiShoot();
      });
    }
  }

  private aiShoot(): void {
    const goal = targetGoalCenter(this.field, 'blue');
    const blue = this.discs.filter((d) => d.team === 'blue');
    const shot = chooseAiShot({
      discs: blue.map((d, i) => ({ id: i, pos: { x: d.img.x, y: d.img.y } })),
      ball: { x: this.ball.x, y: this.ball.y },
      goal,
      jitterRad: 0.1,
      powerJitter: 0.08,
      rng: Math.random,
    });
    if (!shot) {
      this.match = endSim(startSim(this.match));
      this.beginAimPhase();
      return;
    }
    const shooter = blue[shot.discId];
    // AI 도 동일한 외곽 강화 규칙 적용(포지션 기반 필드 메커닉).
    const edgeMul = edgeShotMultiplier({ x: shooter.img.x, y: shooter.img.y }, this.field.playBounds);
    const v = this.capToMaxSpeed(shotVelocity(shot.dirX, shot.dirY, shot.power, edgeMul));
    shooter.img.setVelocity(v.x, v.y);
    this.fireBegan();
  }

  private atRest(): boolean {
    for (const d of this.discs) {
      const v = (d.img.body as MatterJS.BodyType).velocity;
      if (Math.hypot(v.x, v.y) > REST_EPS) return false;
    }
    const bv = (this.ball.body as MatterJS.BodyType).velocity;
    return Math.hypot(bv.x, bv.y) <= REST_EPS;
  }

  private freezeAll(): void {
    for (const d of this.discs) {
      d.img.setVelocity(0, 0);
      d.img.setAngularVelocity(0);
    }
    this.ball.setVelocity(0, 0);
    this.ball.setAngularVelocity(0);
  }

  /** 속도 벡터를 MAX_SPEED 로 제한(발사 순간 터널링 방지 — clampSpeeds 는 다음 프레임에야 적용되므로). */
  private capToMaxSpeed(v: { x: number; y: number }): { x: number; y: number } {
    const sp = Math.hypot(v.x, v.y);
    if (sp <= MAX_SPEED) return v;
    return { x: (v.x / sp) * MAX_SPEED, y: (v.y / sp) * MAX_SPEED };
  }

  private clampSpeeds(): void {
    const cap = (img: Phaser.Physics.Matter.Image): void => {
      const v = (img.body as MatterJS.BodyType).velocity;
      const capped = this.capToMaxSpeed(v);
      if (capped !== v) img.setVelocity(capped.x, capped.y);
    };
    for (const d of this.discs) cap(d.img);
    cap(this.ball);
  }

  // ─────────────────────────── 골 / 결과 ───────────────────────────

  private handleGoal(scorer: Team): void {
    this.match = scoreGoal(this.match, scorer);
    this.updateScoreText();
    this.freezeAll(); // 공을 골 안에 즉시 정지 — 튕겨 나가지 않게.
    this.goalCeremony(scorer);
    this.time.delayedCall(GOAL_PAUSE_MS, () => {
      if (isOver(this.match)) return;
      this.resetKickoff();
      this.match = resumeAfterGoal(this.match, scorer);
      this.beginAimPhase();
    });
  }

  /** 골 세러모니 — 화면 플래시 + GOAL! 팝 + 득점자 + 공 위치 버스트. 공은 골 안에 멈춰 있다. */
  private goalCeremony(scorer: Team): void {
    const color = scorer === 'red' ? 0xff5a5a : 0x5aa2ff;
    const hex = scorer === 'red' ? '#ff5a5a' : '#5aa2ff';
    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;

    const flash = this.add.rectangle(cx, H / 2, W, H, 0xffffff, 0.45).setDepth(95);
    this.tweens.add({ targets: flash, alpha: 0, duration: 420, onComplete: () => flash.destroy() });

    const txt = this.add
      .text(cx, H * 0.44, 'GOAL!', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '144px',
        color: hex,
        stroke: '#ffffff',
        strokeThickness: 14,
      })
      .setOrigin(0.5)
      .setDepth(97)
      .setScale(0.3);
    this.tweens.add({ targets: txt, scale: 1.15, duration: 320, ease: 'Back.Out', yoyo: true, hold: 640, onComplete: () => txt.destroy() });

    const who = this.add
      .text(cx, H * 0.52, scorer === 'red' ? 'Alex 득점!' : 'Mina 득점!', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '48px',
        color: '#ffffff',
        stroke: hex,
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(97)
      .setAlpha(0);
    this.tweens.add({ targets: who, alpha: 1, duration: 280, yoyo: true, hold: 760, onComplete: () => who.destroy() });

    this.goalBurst(this.ball.x, this.ball.y, color);
  }

  /** 공 위치에서 확장 링 + 색종이 파편. */
  private goalBurst(x: number, y: number, color: number): void {
    const ring = this.add.circle(x, y, 40, color, 0).setStrokeStyle(5, color, 1).setDepth(42).setScale(0.2);
    this.tweens.add({ targets: ring, scale: 1.8, alpha: 0, duration: 560, onComplete: () => ring.destroy() });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const c = this.add.circle(x, y, 5, i % 2 ? color : 0xffd147).setDepth(43);
      this.tweens.add({
        targets: c,
        x: x + Math.cos(a) * (70 + (i % 3) * 14),
        y: y + Math.sin(a) * (70 + (i % 3) * 14),
        alpha: 0,
        duration: 640,
        onComplete: () => c.destroy(),
      });
    }
  }

  private resetKickoff(): void {
    this.formation.forEach((f, i) => {
      const img = this.discs[i].img;
      img.setVelocity(0, 0);
      img.setAngularVelocity(0);
      img.setPosition(f.pos.x, f.pos.y);
    });
    const bk = ballKickoff(this.field);
    this.ball.setVelocity(0, 0);
    this.ball.setAngularVelocity(0);
    this.ball.setPosition(bk.x, bk.y);
  }

  private showResult(): void {
    this.resultShown = true;
    this.freezeAll();
    const w = winner(this.match);
    const label = w === 'red' ? 'Alex 승리!' : w === 'blue' ? 'Mina 승리!' : '무승부';
    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    this.add.rectangle(cx, H / 2, W, H, 0x000000, 0.55).setDepth(100);
    this.add
      .text(cx, H * 0.42, label, {
        fontFamily: '"Jua", sans-serif',
        fontSize: '84px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(101);
    this.add
      .text(cx, H * 0.48, `${this.match.score.red}  :  ${this.match.score.blue}`, {
        fontFamily: '"Jua", sans-serif',
        fontSize: '108px',
        color: '#ffd147',
      })
      .setOrigin(0.5)
      .setDepth(101);
    const btn = this.add
      .text(cx, H * 0.59, '다시 하기', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '51px',
        color: '#ffffff',
        backgroundColor: '#2f80ed',
        padding: { x: 42, y: 18 },
      })
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => this.scene.restart());
  }

  // ─────────────────────────── FX ───────────────────────────

  private onCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      const a = pair.bodyA as MatterJS.BodyType;
      const b = pair.bodyB as MatterJS.BodyType;
      if (a.label === 'ball' || b.label === 'ball') {
        const ballBody = a.label === 'ball' ? a : b;
        const sp = Math.hypot(ballBody.velocity.x, ballBody.velocity.y);
        if (sp > 6) this.spark(this.ball.x, this.ball.y);
      }
    }
  }

  private spark(x: number, y: number): void {
    const s = this.add.circle(x, y, 8, 0xffffff, 0.9).setDepth(20);
    this.tweens.add({ targets: s, scale: 0, alpha: 0, duration: 220, onComplete: () => s.destroy() });
  }

  // ─────────────────────────── 루프 ───────────────────────────

  update(_time: number, delta: number): void {
    if (!this.match) return;

    // 현재 턴 팀 말에 금색 링(내 턴/상대 턴 표시).
    this.drawTurnRings();

    // 매치 클록(킥오프 카운트다운 완료 후부터).
    if (this.introDone && !isOver(this.match)) {
      this.timeAccum += delta;
      if (this.timeAccum >= 100) {
        this.match = tick(this.match, this.timeAccum / 1000);
        this.timeAccum = 0;
        this.timeText?.setText(formatTime(this.match.timeLeft));
      }
    }

    this.clampSpeeds();

    if (this.match.phase === 'sim') {
      const scorer = detectGoal({ x: this.ball.x, y: this.ball.y }, this.field);
      if (scorer) {
        this.handleGoal(scorer);
        return;
      }
      if (this.atRest()) this.settleCount++;
      else this.settleCount = 0;
      if (this.settleCount >= SETTLE_FRAMES || this.time.now - this.simStartedAt > SIM_TIMEOUT_MS) {
        this.freezeAll();
        this.match = endSim(this.match);
        this.beginAimPhase();
      }
    }

    if (isOver(this.match) && !this.resultShown) this.showResult();
  }
}
