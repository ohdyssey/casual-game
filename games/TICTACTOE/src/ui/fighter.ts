/**
 * NeonFighter — 광선검 캐릭터(파란 소년 / 핑크 소녀)의 표시·연출 담당.
 *
 * 프레임은 4장뿐이라 연출로 살린다:
 *   idle  준비 자세 — **발밑을 축으로 한 숨쉬기**(origin=하단중앙, scaleY 미세 맥동)
 *   atk1  내리치기 직전(광선검을 든 자세)
 *   atk2  내려친 뒤 — 전환 순간에 **참격 호(弧)** 를 그려 "휘둘렀다"를 만든다
 *   lose  패배 — 숨쉬기는 계속(살아 있는 느낌)
 *
 * 프레임마다 원본 크기가 다르다(검을 들면 세로가 커진다). 그래서 **idle 기준 균일 배율**로
 * 고정하고 origin 을 하단중앙에 두어, 어떤 포즈로 바꿔도 발이 제자리에 붙어 있게 한다.
 * 후광은 Phaser preFX glow(WebGL 전용) — 없으면 조용히 생략한다.
 */
import Phaser from 'phaser';

export interface FighterSkin {
  readonly idle: string;
  readonly atk1: string;
  readonly atk2: string;
  readonly lose: string;
  /** 후광·참격 색(캐릭터 네온 색). */
  readonly color: number;
}

/** 파란 소년(플레이어 O) / 핑크 소녀(컴퓨터 X). 키는 public/img/chr 파일명과 같다. */
export const FIGHTER_SKIN = {
  blue: { idle: 'chr_01_idle', atk1: 'chr_01_atk1', atk2: 'chr_01_atk2', lose: 'chr_01_lose', color: 0x27c4ff },
  pink: { idle: 'chr_02_idle', atk1: 'chr_02_atk1', atk2: 'chr_02_atk2', lose: 'chr_02_lose', color: 0xff2e7e },
} as const satisfies Record<string, FighterSkin>;

/** 캐릭터 프레임 8장 로드(LoadScene.preload 에서 호출). */
export function loadFighterAssets(scene: Phaser.Scene): void {
  for (const skin of Object.values(FIGHTER_SKIN)) {
    for (const key of [skin.idle, skin.atk1, skin.atk2, skin.lose]) {
      scene.load.image(key, `img/chr/${key}.png`);
    }
  }
}

/** 모든 프레임이 준비됐는지 — 하나라도 없으면 캐릭터를 만들지 않는다. */
export function fighterAssetsReady(scene: Phaser.Scene, skin: FighterSkin): boolean {
  return [skin.idle, skin.atk1, skin.atk2, skin.lose].every((k) => scene.textures.exists(k));
}

export interface FighterOptions {
  /** 발밑 중심 X. */
  readonly x: number;
  /** 발이 닿는 Y(= 저작 사각형의 아래변). */
  readonly bottomY: number;
  /** idle 포즈의 표시 높이(px) — 배율은 여기서 뽑아 모든 포즈에 공통 적용한다. */
  readonly height: number;
  /** 바라보는 방향(+1 오른쪽 / -1 왼쪽). 참격 호가 이 방향으로 그려진다. */
  readonly facing: 1 | -1;
  readonly depth?: number;
}

/** 숨쉬기 한 주기(ms) — 사람 호흡처럼 느리게. */
const BREATH_MS = 1500;
/** 숨쉬기 진폭(세로 ±%). */
const BREATH_Y = 0.028;
/** 평상시 후광 세기. */
const GLOW_IDLE = 3.4;
/** 내리치는 순간 후광 세기(광선검이 번쩍인다). */
const GLOW_STRIKE = 13;

export class NeonFighter {
  readonly img: Phaser.GameObjects.Image;
  private readonly scene: Phaser.Scene;
  private readonly skin: FighterSkin;
  private readonly facing: 1 | -1;
  private readonly baseScale: number;
  private breath?: Phaser.Tweens.Tween;
  private glow?: Phaser.FX.Glow;
  private fx: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, skin: FighterSkin, opts: FighterOptions) {
    this.scene = scene;
    this.skin = skin;
    this.facing = opts.facing;

    const src = scene.textures.get(skin.idle).getSourceImage();
    this.baseScale = opts.height / (src.height || opts.height);

    this.img = scene.add
      .image(opts.x, opts.bottomY, skin.idle)
      .setOrigin(0.5, 1) // 발밑 기준 — 포즈가 바뀌어도 서 있는 자리가 안 흔들린다
      .setScale(this.baseScale)
      .setDepth(opts.depth ?? 6);

    // 후광(캐릭터 색) — WebGL 에서만 동작하므로 없으면 조용히 넘어간다.
    this.glow = this.img.preFX?.addGlow(skin.color, GLOW_IDLE, 0, false, 0.08, 12) ?? undefined;

    this.startBreathing();
  }

  /** 발밑을 축으로 한 숨쉬기 — idle/패배 포즈에서 계속 돈다. */
  startBreathing(delay = 0): void {
    this.stopBreathing();
    this.img.setScale(this.baseScale);
    this.breath = this.scene.tweens.add({
      targets: this.img,
      scaleY: this.baseScale * (1 + BREATH_Y),
      scaleX: this.baseScale * (1 - BREATH_Y * 0.45), // 부피 보존 느낌
      duration: BREATH_MS,
      delay,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  private stopBreathing(): void {
    this.breath?.remove();
    this.breath = undefined;
  }

  /** 준비 자세로 되돌린다(숨쉬기 재개). */
  toIdle(): void {
    if (!this.img.active) return;
    this.img.setTexture(this.skin.idle);
    this.startBreathing();
  }

  /** ① 내리치기 직전 — 검을 들고 멈춘다(숨쉬기 정지). */
  windUp(): void {
    if (!this.img.active) return;
    this.stopBreathing();
    this.img.setTexture(this.skin.atk1).setScale(this.baseScale);
  }

  /** ② 내려친 뒤 — 프레임 교체 + 참격 호 + 후광 번쩍임. */
  strike(): void {
    if (!this.img.active) return;
    this.img.setTexture(this.skin.atk2).setScale(this.baseScale);
    this.slashArc();
    this.flashGlow();
  }

  /** 패배 자세 — 숨은 계속 쉰다. */
  toDefeat(): void {
    if (!this.img.active) return;
    this.img.setTexture(this.skin.lose);
    this.startBreathing();
  }

  /** 후광을 잠깐 강하게 — 검이 번쩍이는 순간. */
  private flashGlow(): void {
    const glow = this.glow;
    if (!glow) return;
    this.scene.tweens.add({
      targets: glow,
      outerStrength: GLOW_STRIKE,
      duration: 70,
      yoyo: true,
      hold: 40,
      ease: 'Quad.Out',
      onComplete: () => {
        glow.outerStrength = GLOW_IDLE;
      },
    });
  }

  /**
   * 참격 호 — 든 자세(위)에서 내려친 자세(아래)로 훑고 지나가는 광선 궤적.
   * 두 장뿐인 프레임 사이를 이 궤적이 이어 준다.
   */
  private slashArc(): void {
    const h = this.img.displayHeight;
    const cx = this.img.x + this.facing * h * 0.08;
    const cy = this.img.y - h * 0.62;
    const radius = h * 0.6;
    // 오른쪽을 보면 위(-100°) → 아래(30°) 로, 왼쪽을 보면 좌우 반전.
    const from = this.facing > 0 ? Phaser.Math.DegToRad(-105) : Phaser.Math.DegToRad(180 + 105);
    const to = this.facing > 0 ? Phaser.Math.DegToRad(35) : Phaser.Math.DegToRad(180 - 35);

    const g = this.scene.add.graphics({ x: cx, y: cy }).setDepth(this.img.depth + 1);
    this.fx.push(g);

    const sweep = { t: 0 };
    const draw = () => {
      if (!g.active) return;
      const end = from + (to - from) * sweep.t;
      g.clear();
      g.lineStyle(30, this.skin.color, 0.28);
      g.beginPath();
      g.arc(0, 0, radius, from, end, this.facing < 0);
      g.strokePath();
      g.lineStyle(13, this.skin.color, 0.75);
      g.beginPath();
      g.arc(0, 0, radius, from, end, this.facing < 0);
      g.strokePath();
      g.lineStyle(5, 0xffffff, 0.95);
      g.beginPath();
      g.arc(0, 0, radius, from, end, this.facing < 0);
      g.strokePath();
      // 칼끝 발광
      const tip = { x: Math.cos(end) * radius, y: Math.sin(end) * radius };
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(tip.x, tip.y, 11);
      g.fillStyle(this.skin.color, 0.55);
      g.fillCircle(tip.x, tip.y, 24);
    };

    this.scene.tweens.add({
      targets: sweep,
      t: 1,
      duration: 110,
      ease: 'Quad.In', // 마지막에 확 베어내는 가속
      onUpdate: draw,
      onComplete: () => {
        if (!g.active) return;
        this.scene.tweens.add({
          targets: g,
          alpha: 0,
          scale: 1.14,
          duration: 160,
          ease: 'Cubic.Out',
          onComplete: () => this.destroyFx(g),
        });
      },
    });
  }

  private destroyFx(obj: Phaser.GameObjects.GameObject): void {
    this.scene.tweens.killTweensOf(obj);
    this.fx = this.fx.filter((o) => o !== obj);
    obj.destroy();
  }

  /** 판 재시작 등 — 연출을 모두 접고 준비 자세로. */
  reset(x?: number, y?: number): void {
    for (const o of [...this.fx]) this.destroyFx(o);
    this.scene.tweens.killTweensOf(this.img);
    if (this.glow) this.glow.outerStrength = GLOW_IDLE;
    if (!this.img.active) return;
    this.img.clearTint();
    if (x !== undefined && y !== undefined) this.img.setPosition(x, y);
    this.toIdle();
  }

  destroy(): void {
    for (const o of [...this.fx]) this.destroyFx(o);
    this.stopBreathing();
    this.scene.tweens.killTweensOf(this.img);
    this.img.destroy();
  }
}
