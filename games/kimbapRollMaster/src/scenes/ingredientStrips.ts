/**
 * ingredientStrips.ts — 김 위에 눕히는 재료 스트립.
 *
 * 저작된 본보기 줄(`STRIP_SAMPLE_NODE`)에서 **길이 · 맨 아랫줄 높이 · 가운데 x** 를 읽고,
 * 고른 재료 수만큼 위로 쌓아 올린다.
 *
 * ⚠️⚠️ **원본 방향이 재료마다 다르다.** 01~12 는 가로로 누운 그림(505×68 꼴)인데
 * **13번(진미채)부터는 세로로 저장돼 있다**(82×561 꼴 — `STRIP_VERTICAL`).
 * 김 위 스트립은 김밥 축과 나란히 눕는 그림이라, 세로 원본은 **90° 돌려** 놓는다.
 * 돌린 그림은 `setDisplaySize` 의 가로·세로가 뒤바뀌므로 굵기·길이도 서로 바꿔 넣어야 한다.
 * 굵기는 원본 비율대로 나오되, 유난히 굵은 그림이 한 줄을 다 먹지 않도록 상한을 둔다.
 */
import Phaser from 'phaser';
import { INGREDIENT_STRIP_TEX, STRIP_VERTICAL, type IngredientId } from '../logic/ingredients.js';
import { MAX_PICK } from '../logic/scoring.js';
import { STRIP_DEPTH } from './cookingNodes.js';
import type { DesignRect } from './cookingNodes.js';

/** 지킬 굵기 범위(디자인 px) — 유난히 굵은 그림이 한 줄을 다 먹지 않게. */
const MIN_THICKNESS = 34;
const MAX_THICKNESS = 62;
/** 줄 간격의 상한 — 재료가 적을 때 김밥 전체로 흩어지지 않게. */
const MAX_PITCH = 52;
/** 재료가 꽉 찼을 때 쓸 수 있는 세로 폭. */
const STACK_BAND = 300;
/** 줄 간격 대비 굵기 — 1보다 크면 이웃한 줄과 그만큼 겹쳐 놓인다. */
const OVERLAP = 1.2;

export class IngredientStrips {
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private readonly placed: Phaser.GameObjects.Image[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    /** 저작된 본보기 줄. `w` 가 김밥을 가로지르는 길이다. */
    private readonly sample: DesignRect,
    /** 저작에서 읽은 층 — 코드에 숫자로 박으면 에디터에서 노드를 쌓을 때 어긋난다. */
    private readonly depth: number = STRIP_DEPTH,
  ) {}

  /** 화면에 올라와 있는 스트립들(아래쪽이 먼저 오도록 정렬). */
  get objects(): readonly Phaser.GameObjects.Image[] {
    return [...this.placed].sort((a, b) => b.y - a.y);
  }

  /**
   * index 번째 재료를 놓는다. `need` 줄을 예상해 간격을 잡되,
   * **요구치보다 더 넣으면** 그만큼 간격을 좁혀 이미 놓인 줄까지 다시 정렬한다
   * (더 넣는 건 실패가 아니라 원가만 더 나가는 선택이다).
   */
  place(id: IngredientId, index: number, need: number): void {
    const key = INGREDIENT_STRIP_TEX[id];
    if (!this.scene.textures.exists(key)) return;

    const obj = this.take(index);
    const length = this.sample.w;
    const src = this.scene.textures.get(key).getSourceImage();
    // 세로 원본은 눕혀 놓을 것이므로 「길이 대비 굵기」도 뒤집어 읽는다.
    const upright = STRIP_VERTICAL.has(id);
    const long = upright ? src.height : src.width;
    const short = upright ? src.width : src.height;
    const ratio = long > 0 ? short / long : 0.14;

    const rows = Math.max(need, index + 1);
    const pitch = this.pitchFor(rows);
    // 굵기는 간격보다 두껍게 — 줄끼리 살짝 겹쳐 밥이 비치는 틈이 없도록(조밀하게).
    const natural = Phaser.Math.Clamp(length * ratio, MIN_THICKNESS, MAX_THICKNESS);
    const thickness = Math.max(natural, pitch * OVERLAP);

    obj
      .setTexture(key)
      // ⚠️ 돌린 그림은 가로·세로가 뒤바뀐다 — 세로 원본은 (굵기 × 길이)로 재운 뒤 눕힌다.
      .setDisplaySize(upright ? thickness : length, upright ? length : thickness)
      .setAngle(upright ? -90 : 0)
      .setDepth(this.depth + index * 0.1)
      .setVisible(true)
      .setAlpha(0)
      .setPosition(this.sample.cx, this.sample.cy - index * pitch);

    this.scene.tweens.add({ targets: obj, alpha: 1, duration: 220 });
    this.restack(rows);
  }

  /** 줄 수에 맞는 간격 — 많이 넣을수록 좁아진다. */
  private pitchFor(rows: number): number {
    return Math.min(MAX_PITCH, STACK_BAND / Math.max(1, rows));
  }

  /** 놓인 줄 전체를 지금 간격으로 다시 정렬한다. */
  private restack(rows: number): void {
    const pitch = this.pitchFor(rows);
    this.pool.forEach((obj, i) => {
      if (!this.placed.includes(obj)) return;
      this.scene.tweens.add({ targets: obj, y: this.sample.cy - i * pitch, duration: 220, ease: 'Quad.easeOut' });
    });
  }

  /** 조리대 리셋 — 전부 감춘다(객체는 재사용하므로 지우지 않는다). */
  clear(): void {
    for (const obj of this.pool) {
      this.scene.tweens.killTweensOf(obj);
      obj.setVisible(false).setAlpha(1);
    }
    this.placed.length = 0;
  }

  private take(index: number): Phaser.GameObjects.Image {
    const existing = this.pool[index];
    if (existing) {
      if (!this.placed.includes(existing)) this.placed.push(existing);
      return existing;
    }
    const obj = this.scene.add.image(this.sample.cx, this.sample.cy, '').setOrigin(0.5).setVisible(false);
    this.pool[index] = obj;
    this.placed.push(obj);
    return obj;
  }

  /** 풀은 최대 선택 수만큼만 쓴다(방어). */
  static get capacity(): number {
    return MAX_PICK;
  }
}
