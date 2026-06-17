/**
 * PlayScene — 덕헌트러시 본편 (1인칭 조준 사격).
 *
 * 화면: 에디터 main.json(SSOT) 렌더 — 호수 배경 + 강아지 + HUD 패널 + 1인칭 샷건 + 조준선.
 * 핵심: 에디터가 둔 정적 오리 3마리는 숨기고, 같은 텍스처로 날아다니는 오리를 스폰한다.
 *       조준선이 포인터를 따라가고, 탭/클릭하면 조준점 근처의 오리를 명중 → 점수·콤보·미션.
 *
 * 흐름:
 *   1) 에디터 디자인(SSOT) 렌더 → 키 노드(배경/조준선/샷건/오리자리/텍스트/탄약) 식별.
 *   2) 정적 오리 placeholder 숨김 + 탄약 셸 행 생성.
 *   3) 포인터 이동 → 조준선 추적. 탭 → 샷건 반동/머즐 + 조준점 히트테스트.
 *   4) 명중 → 오리 낙하 + 깃털 + "+점수" + 콤보·미션 갱신. 빗나감 → 콤보 리셋.
 *   5) 탄약 6발, 소진 시 자동/탭 재장전. 미션(청둥·암컷) 완료 시 라운드 클리어.
 */
import Phaser from 'phaser';
import { FEATHER_KEY, SPARK_KEY, UI_LAYOUT_KEY } from '../assets.js';
import { buildLayout, type LayoutDoc, type LayoutIndex } from '../ui/layoutLoader.js';
import {
  bumpMission,
  comboMultiplier,
  isMissionComplete,
  scoreForHit,
  starCountForScore,
  type MissionState,
} from '../logic/scoring.js';

// ── 에디터 노드 id (main.json) ──
const NODE = {
  bg: 'layer_1',
  crosshair: 'layer_8_copy11', // UI_10 조준선
  shotgun: 'layer_9', // UI_11 샷건
  duckMallard: 'layer_8_copy8', // Chr_02 청둥오리 placeholder
  duckFemale: 'layer_8_copy9', // Chr_03 암컷오리 placeholder
  duckSpecial: 'layer_8_copy10', // Chr_04 특수오리 placeholder
  bullet: 'layer_8_copy12', // UI_09 탄피
  ammoPanel: 'layer_8_copy4', // UI_05 탄약 패널
  scoreText: 'layer_10',
  missionMallard: 'layer_10_copy',
  missionFemale: 'layer_10_copy3',
  comboNum: 'layer_10_copy4',
  star: 'layer_11',
} as const;

type SpeciesKey = 'mallard' | 'female' | 'special';

interface SpeciesDef {
  readonly tex: string;
  readonly score: number;
  readonly w: number; // 표시 폭(px)
  readonly weight: number; // 스폰 확률 가중치
  readonly featherTint: number;
  readonly speed: number; // 가로 속도 배율
}

const SPECIES: Readonly<Record<SpeciesKey, SpeciesDef>> = {
  mallard: { tex: 'up_Duckhunt_Chr_02', score: 100, w: 128, weight: 0.55, featherTint: 0x3f8f4f, speed: 1.0 },
  female: { tex: 'up_Duckhunt_Chr_03', score: 150, w: 122, weight: 0.3, featherTint: 0x8a5a30, speed: 1.2 },
  special: { tex: 'up_Duckhunt_Chr_04', score: 300, w: 108, weight: 0.15, featherTint: 0x6a3bd0, speed: 1.45 },
};

interface Duck {
  readonly img: Phaser.GameObjects.Image;
  readonly species: SpeciesKey;
  readonly dir: 1 | -1;
  readonly vx: number;
  readonly baseY: number;
  readonly amp: number;
  readonly freq: number;
  readonly phase: number;
  state: 'fly' | 'fall';
  vy: number;
  spin: number;
  t: number;
}

// ── 진행/튜닝 ──
const AMMO_MAX = 6;
const RELOAD_MS = 1000;
const SKY_MIN_Y = 180;
const SKY_MAX_Y = 600;
const MAX_DUCKS = 5;
const SPAWN_INTERVAL = 0.95; // s
const GRAVITY = 1500; // px/s^2 (낙하)
const DUCK_DEPTH = 9;

export class PlayScene extends Phaser.Scene {
  private layout!: LayoutIndex;

  // 에디터 노드 참조
  private crosshair?: Phaser.GameObjects.Image;
  private shotgun?: Phaser.GameObjects.Image;
  private scoreText?: Phaser.GameObjects.Text;
  private missionMallardText?: Phaser.GameObjects.Text;
  private missionFemaleText?: Phaser.GameObjects.Text;
  private comboText?: Phaser.GameObjects.Text;
  private star?: Phaser.GameObjects.Image;

  // 동적 상태
  private ducks: Duck[] = [];
  private shells: Phaser.GameObjects.Image[] = [];
  private ammo = AMMO_MAX;
  private reloading = false;
  private combo = 0;
  private score = 0;
  private mission: MissionState = { mallard: { need: 8, got: 0 }, female: { need: 5, got: 0 } };
  private state: 'play' | 'win' = 'play';
  private spawnTimer = 0.4;
  private shotgunBaseY = 0;
  private muzzleY = 825;

  constructor() {
    super('play');
  }

  create(): void {
    const doc = this.cache.json.get(UI_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!doc || !doc.nodes) {
      this.add
        .text(this.scale.width / 2, this.scale.height / 2, '레이아웃을 불러오지 못했습니다', {
          fontFamily: '"Jua", sans-serif',
          fontSize: '26px',
          color: '#ffffff',
        })
        .setOrigin(0.5);
      return;
    }

    // 1) 에디터 디자인(SSOT) 렌더.
    this.layout = buildLayout(this, doc);

    // 2) 정적 오리 placeholder + 탄피 노드 숨김(동적 스폰/생성으로 대체).
    for (const id of [NODE.duckMallard, NODE.duckFemale, NODE.duckSpecial, NODE.bullet]) {
      this.layout.tryById(id)?.setVisible(false);
    }

    // 3) 키 노드 참조.
    this.crosshair = this.layout.tryById<Phaser.GameObjects.Image>(NODE.crosshair);
    this.shotgun = this.layout.tryById<Phaser.GameObjects.Image>(NODE.shotgun);
    this.scoreText = this.layout.tryById<Phaser.GameObjects.Text>(NODE.scoreText);
    this.missionMallardText = this.layout.tryById<Phaser.GameObjects.Text>(NODE.missionMallard);
    this.missionFemaleText = this.layout.tryById<Phaser.GameObjects.Text>(NODE.missionFemale);
    this.comboText = this.layout.tryById<Phaser.GameObjects.Text>(NODE.comboNum);
    this.star = this.layout.tryById<Phaser.GameObjects.Image>(NODE.star);

    if (this.shotgun) {
      this.shotgunBaseY = this.shotgun.y;
      this.muzzleY = this.shotgun.y - this.shotgun.displayHeight / 2 + 12;
    }

    // 4) 탄약 셸 행 생성(에디터 탄피 텍스처 재사용).
    this.buildShells();

    // 5) 입력 — 포인터 추적 + 사격.
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerdown', this.onPointerDown, this);

    // 6) 초기 HUD.
    this.updateScoreHud();
    this.updateMissionHud();
    this.updateComboHud();
    this.updateShells();
  }

  // ── 탄약 ───────────────────────────────────────────────────────

  private buildShells(): void {
    const panel = this.layout.nodeById(NODE.ammoPanel);
    const bullet = this.layout.nodeById(NODE.bullet);
    const cx = panel?.x ?? 599;
    const py = (panel?.y ?? 1014) + (panel?.h ?? 134) * 0.16;
    const sw = (bullet?.w ?? 27) * 0.92;
    const sh = (bullet?.h ?? 47) * 0.92;
    const span = (panel?.w ?? 179) * 0.78;
    const step = span / (AMMO_MAX - 1);
    const startX = cx - span / 2;
    for (let i = 0; i < AMMO_MAX; i++) {
      const s = this.add
        .image(startX + step * i, py, 'up_Duckhunt_UI_09')
        .setDisplaySize(sw, sh)
        .setDepth(22);
      this.shells.push(s);
    }
  }

  private updateShells(): void {
    this.shells.forEach((s, i) => {
      const filled = i < this.ammo;
      s.setAlpha(filled ? 1 : 0.22);
    });
  }

  private startReload(): void {
    if (this.reloading || this.ammo >= AMMO_MAX) return;
    this.reloading = true;
    this.time.delayedCall(RELOAD_MS, () => {
      this.ammo = AMMO_MAX;
      this.reloading = false;
      this.updateShells();
      // 재장전 완료 깜빡임.
      this.shells.forEach((s, i) =>
        this.tweens.add({ targets: s, scale: s.scale * 1.25, duration: 120, yoyo: true, delay: i * 30 }),
      );
    });
  }

  // ── 입력 ───────────────────────────────────────────────────────

  private onPointerMove(p: Phaser.Input.Pointer): void {
    this.crosshair?.setPosition(p.x, p.y);
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (this.state === 'win') {
      this.scene.restart();
      return;
    }
    this.crosshair?.setPosition(p.x, p.y);
    if (this.reloading) return;
    if (this.ammo <= 0) {
      this.startReload();
      return;
    }
    this.fire(p.x, p.y);
  }

  // ── 사격 ───────────────────────────────────────────────────────

  private fire(x: number, y: number): void {
    this.ammo -= 1;
    this.updateShells();
    this.recoil();
    this.muzzleFlash();

    // 조준점 근처의 가장 가까운 비행 오리 명중.
    let hit: Duck | undefined;
    let best = Infinity;
    for (const d of this.ducks) {
      if (d.state !== 'fly') continue;
      const r = d.img.displayWidth * 0.45 + 20;
      const dist = Phaser.Math.Distance.Between(x, y, d.img.x, d.img.y);
      if (dist < r && dist < best) {
        best = dist;
        hit = d;
      }
    }

    if (hit) this.onHit(hit);
    else if (this.combo !== 0) {
      this.combo = 0;
      this.updateComboHud();
    }

    if (this.ammo <= 0) {
      this.time.delayedCall(450, () => {
        if (this.ammo <= 0 && !this.reloading) this.startReload();
      });
    }
  }

  private onHit(d: Duck): void {
    d.state = 'fall';
    d.vy = -120;
    d.spin = (d.dir === 1 ? 1 : -1) * Phaser.Math.FloatBetween(3, 5);

    const def = SPECIES[d.species];
    this.combo += 1;
    const pts = scoreForHit(def.score, this.combo);
    this.score += pts;
    this.mission = bumpMission(this.mission, d.species);

    this.spawnFeathers(d.img.x, d.img.y, def.featherTint);
    this.floatText(d.img.x, d.img.y, `+${pts}`, comboMultiplier(this.combo) > 1 ? '#ffce3d' : '#ffffff');

    this.updateScoreHud();
    this.updateMissionHud();
    this.updateComboHud();

    if (isMissionComplete(this.mission)) this.win();
  }

  private recoil(): void {
    if (!this.shotgun) return;
    this.tweens.killTweensOf(this.shotgun);
    this.shotgun.setY(this.shotgunBaseY);
    this.tweens.add({
      targets: this.shotgun,
      y: this.shotgunBaseY + 34,
      duration: 60,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  private muzzleFlash(): void {
    const flash = this.add.graphics().setDepth(22);
    flash.fillStyle(0xfff2a0, 0.95);
    const cx = this.shotgun?.x ?? 360;
    const n = 10;
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? 44 : 18;
      pts.push({ x: cx + Math.cos(a) * r, y: this.muzzleY + Math.sin(a) * r });
    }
    flash.fillPoints(pts, true);
    flash.fillStyle(0xffffff, 0.95);
    flash.fillCircle(cx, this.muzzleY, 16);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.4,
      duration: 110,
      onComplete: () => flash.destroy(),
    });
  }

  private spawnFeathers(x: number, y: number, tint: number): void {
    const burst = this.add.particles(x, y, FEATHER_KEY, {
      speed: { min: 60, max: 230 },
      angle: { min: 0, max: 360 },
      gravityY: 320,
      rotate: { min: 0, max: 360 },
      scale: { start: 1.1, end: 0.2 },
      alpha: { start: 1, end: 0 },
      lifespan: 700,
      quantity: 12,
      tint,
      emitting: false,
    });
    burst.setDepth(24);
    burst.explode(12);
    // 흰 스파크 약간 섞어 임팩트 강조.
    const spark = this.add.particles(x, y, SPARK_KEY, {
      speed: { min: 40, max: 160 },
      scale: { start: 0.9, end: 0 },
      lifespan: 300,
      quantity: 6,
      blendMode: 'ADD',
      emitting: false,
    });
    spark.setDepth(24);
    spark.explode(6);
    this.time.delayedCall(800, () => {
      burst.destroy();
      spark.destroy();
    });
  }

  private floatText(x: number, y: number, txt: string, color: string): void {
    const t = this.add
      .text(x, y, txt, { fontFamily: '"Do Hyeon", sans-serif', fontSize: '34px', color })
      .setOrigin(0.5)
      .setStroke('#10425b', 6)
      .setDepth(25);
    this.tweens.add({
      targets: t,
      y: y - 90,
      alpha: 0,
      scale: 1.2,
      duration: 850,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  // ── HUD ────────────────────────────────────────────────────────

  private updateScoreHud(): void {
    this.scoreText?.setText(String(this.score).padStart(5, '0'));
    // 별 — 점수 구간에 도달할 때 살짝 팝(0~3개; 노드는 1개라 도달 시 강조).
    if (this.star) {
      const stars = starCountForScore(this.score);
      this.star.setAlpha(stars > 0 ? 1 : 0.4);
    }
  }

  private updateMissionHud(): void {
    const m = this.mission.mallard;
    const f = this.mission.female;
    this.missionMallardText?.setText(`${m.got}/${m.need}`);
    this.missionFemaleText?.setText(`${f.got}/${f.need}`);
  }

  private updateComboHud(): void {
    const shown = Math.max(1, this.combo);
    this.comboText?.setText(`${shown}`);
    if (this.combo >= 2 && this.comboText) {
      this.tweens.killTweensOf(this.comboText);
      this.comboText.setScale(1);
      this.tweens.add({ targets: this.comboText, scale: 1.35, duration: 110, yoyo: true });
    }
  }

  // ── 오리 스폰/이동 ─────────────────────────────────────────────

  private pickSpecies(): SpeciesKey {
    const r = Math.random();
    let acc = 0;
    for (const key of Object.keys(SPECIES) as SpeciesKey[]) {
      acc += SPECIES[key].weight;
      if (r <= acc) return key;
    }
    return 'mallard';
  }

  private spawnDuck(): void {
    const species = this.pickSpecies();
    const def = SPECIES[species];
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const x = dir === 1 ? -90 : this.scale.width + 90;
    const y = Phaser.Math.Between(SKY_MIN_Y, SKY_MAX_Y);
    const speed = Phaser.Math.FloatBetween(120, 190) * def.speed;
    const img = this.add.image(x, y, def.tex).setDepth(DUCK_DEPTH);
    const scale = def.w / img.width;
    img.setScale(scale);
    if (dir === -1) img.setFlipX(true); // 텍스처는 오른쪽 바라봄 → 왼쪽 비행 시 반전

    this.ducks.push({
      img,
      species,
      dir,
      vx: dir * speed,
      baseY: y,
      amp: Phaser.Math.Between(18, 42),
      freq: Phaser.Math.FloatBetween(1.4, 2.6),
      phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      state: 'fly',
      vy: 0,
      spin: 0,
      t: 0,
    });
  }

  // ── 라운드 클리어 ──────────────────────────────────────────────

  private win(): void {
    if (this.state === 'win') return;
    this.state = 'win';
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x06210b, 0.66).setDepth(40);
    this.add
      .text(cx, cy - 120, '라운드 클리어!', { fontFamily: '"Do Hyeon", sans-serif', fontSize: '58px', color: '#ffce3d' })
      .setOrigin(0.5)
      .setStroke('#10425b', 8)
      .setDepth(41);
    this.add
      .text(cx, cy, `${this.score}`, { fontFamily: '"Do Hyeon", sans-serif', fontSize: '110px', color: '#ffffff' })
      .setOrigin(0.5)
      .setStroke('#10425b', 10)
      .setDepth(41);
    const star = starCountForScore(this.score);
    this.add
      .text(cx, cy + 96, '★★★'.slice(0, star) + '☆☆☆'.slice(0, 3 - star), {
        fontFamily: 'sans-serif',
        fontSize: '46px',
        color: '#ffce3d',
      })
      .setOrigin(0.5)
      .setDepth(41);
    const again = this.add
      .text(cx, cy + 190, '다시하기 — 화면을 탭', { fontFamily: '"Jua", sans-serif', fontSize: '30px', color: '#ffffff' })
      .setOrigin(0.5)
      .setStroke('#10425b', 6)
      .setDepth(41);
    this.tweens.add({ targets: again, alpha: 0.4, duration: 700, yoyo: true, repeat: -1 });
  }

  // ── 매 프레임 ──────────────────────────────────────────────────

  update(_time: number, delta: number): void {
    (this.layout as LayoutIndex | undefined)?.tick(Math.min(0.05, delta / 1000));   // 편집된 애니(바람 등) 구동 — state 무관(상시 재생). 레이아웃 로드 실패 시 무동작.
    const dt = Math.min(0.05, delta / 1000);
    if (this.state !== 'play') return;

    // 스폰.
    this.spawnTimer -= dt;
    const flying = this.ducks.reduce((n, d) => n + (d.state === 'fly' ? 1 : 0), 0);
    if (this.spawnTimer <= 0 && flying < MAX_DUCKS) {
      this.spawnDuck();
      this.spawnTimer = SPAWN_INTERVAL;
    }

    // 이동.
    for (const d of this.ducks) {
      d.t += dt;
      if (d.state === 'fly') {
        d.img.x += d.vx * dt;
        d.img.y = d.baseY + Math.sin(d.t * d.freq + d.phase) * d.amp;
        if (d.img.x < -140 || d.img.x > this.scale.width + 140) d.img.setData('dead', true);
      } else {
        d.vy += GRAVITY * dt;
        d.img.y += d.vy * dt;
        d.img.x += d.dir * 30 * dt;
        d.img.rotation += d.spin * dt;
        if (d.img.y > this.scale.height + 120) d.img.setData('dead', true);
      }
    }

    // 정리.
    const alive: Duck[] = [];
    for (const d of this.ducks) {
      if (d.img.getData('dead')) d.img.destroy();
      else alive.push(d);
    }
    this.ducks = alive;
  }
}
