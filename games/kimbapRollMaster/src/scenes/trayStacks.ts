/**
 * trayStacks.ts — 하단 진열 12칸을 **그 판의 재료로 채운다.**
 *
 * ⚠️⚠️ **재료는 23종인데 저작된 칸은 12개뿐이다.** 그래서 「재료마다 제 자리」가 아니라
 * **자리마다 그 판의 재료**다 — 판이 바뀔 때 그림·이름표를 통째로 갈아 끼운다(`logic/stageTray.ts`).
 *   · 윗줄 6칸은 언제나 같다(기본 재료) — 자리가 손에 익어야 한다.
 *   · 아랫줄 6칸만 판마다 갈린다(그 판 김밥의 주재료).
 *
 * 코드가 자리마다 하는 일은 네 가지다 —
 *   ① 그림 텍스처를 그 재료 것으로 갈고(`game_tray_<id>`), **저작된 칸에 비율 그대로 다시 재운다**.
 *      (재료마다 원본 크기가 128×172 ~ 170×193 으로 달라 그냥 끼우면 크기가 널뛴다.)
 *   ② 이름표 글자를 그 재료 이름으로 다시 쓴다.
 *   ③ 이름표 **글자색을 원가 등급으로** 칠한다(🟩싸다 · ⬛보통 · 🟪주재료).
 *   ④ 이름표 **글꼴을 게임 글꼴로** 고정한다(아래 ⚠️).
 *
 * ⚠️ 저작된 이름표는 `fontFamily: "Roboto"` 로 잡혀 있는데 **Roboto 에는 한글 글리프가 없다.**
 *    그대로 두면 한글이 브라우저 기본 고딕으로 떨어져 나머지 UI(둥근 Jua)와 따로 논다.
 *    에디터에서 글꼴을 Jua 로 바꾸면 이 줄은 지워도 된다.
 */
import type Phaser from 'phaser';
import {
  INGREDIENT_LABEL,
  INGREDIENT_TRAY_TEX,
  TIER_STROKE,
  ingredientColor,
  type IngredientId,
} from '../logic/ingredients.js';
import type { StageTray } from '../logic/stageTray.js';
import type { LayoutIndex } from '../ui/layoutLoader.js';
import { applyGameFont } from '../ui/font.js';
import { TRAY_SLOT_ART, TRAY_SLOT_LABEL, designRect, image } from './cookingNodes.js';

interface Slot {
  readonly art: Phaser.GameObjects.Image;
  readonly label?: Phaser.GameObjects.Text;
  /** 저작된 칸 크기 — 텍스처를 갈 때마다 여기에 다시 재운다. */
  readonly box: { readonly w: number; readonly h: number };
}

/**
 * 진열 12칸. **자리는 저작이 준 그대로 두고 내용만 갈아 끼운다.**
 * 재료가 지금 몇 번 자리에 있는지는 `slotOf` 로 묻는다 — 체크·흐리기가 그 자리를 찾아가야 한다.
 */
export class TrayShelf {
  private readonly slots: Slot[] = [];
  /** 지금 각 자리에 담긴 재료. 판이 바뀌면 통째로 갈린다. */
  private filled: IngredientId[] = [];

  constructor(_scene: Phaser.Scene, private readonly layout: LayoutIndex) {
    TRAY_SLOT_ART.forEach((nodeId, i) => {
      const art = image(layout, nodeId);
      if (!art) return;
      const rect = designRect(layout, nodeId);
      this.slots[i] = {
        art,
        label: layout.tryById<Phaser.GameObjects.Text>(TRAY_SLOT_LABEL[i] ?? ''),
        box: { w: rect?.w ?? art.displayWidth, h: rect?.h ?? art.displayHeight },
      };
    });
  }

  /** 지금 진열된 재료들(자리 순서). */
  get ingredients(): readonly IngredientId[] {
    return this.filled;
  }

  /** 그 재료가 몇 번 자리에 있나. 진열에 없으면 -1. */
  slotOf(id: IngredientId): number {
    return this.filled.indexOf(id);
  }

  /** 그 재료의 그림(진열에 없으면 undefined). 체크·흐리기가 이걸 쥔다. */
  artOf(id: IngredientId): Phaser.GameObjects.Image | undefined {
    const at = this.slotOf(id);
    return at < 0 ? undefined : this.slots[at]?.art;
  }

  /** 자리 번호로 그림을 꺼낸다(탭 배선용). */
  artAt(slot: number): Phaser.GameObjects.Image | undefined {
    return this.slots[slot]?.art;
  }

  /** 자리 번호 → 지금 담긴 재료. */
  at(slot: number): IngredientId | undefined {
    return this.filled[slot];
  }

  /**
   * 그 판의 편성으로 진열을 채운다. **같은 편성이면 아무것도 하지 않는다** —
   * 매 프레임 다시 그리면 흐려 둔 재료가 도로 밝아지고 체크가 깜빡인다.
   */
  fill(tray: StageTray): boolean {
    const next = tray.slots;
    if (this.filled.length === next.length && this.filled.every((id, i) => id === next[i])) return false;
    this.filled = [...next];
    next.forEach((id, i) => {
      const slot = this.slots[i];
      if (!slot) return;
      this.retexture(slot, INGREDIENT_TRAY_TEX[id]);
      const label = slot.label;
      if (!label || !('setText' in label)) return;
      label.setText(INGREDIENT_LABEL[id]).setColor(ingredientColor(id));
      // ⚠️ 나무판 위에서는 색만으로는 안 읽힌다 — 옅은 테를 둘러 글자를 판에서 띄운다.
      label.setStroke(TIER_STROKE.color, TIER_STROKE.width);
      applyGameFont(label);
    });
    return true;
  }

  /** 텍스처를 갈고 **저작된 칸에 비율 그대로 재운다**(재료마다 원본 크기가 다르다). */
  private retexture(slot: Slot, key: string): void {
    const obj = slot.art;
    if (!obj.scene.textures.exists(key)) return;
    obj.setTexture(key);
    if (obj.width <= 0 || obj.height <= 0) return;
    obj.setScale(Math.min(slot.box.w / obj.width, slot.box.h / obj.height));
  }

  /** 갈아 끼운 뒤의 「저작 상태」 — 조리대를 비울 때 여기로 되돌린다(흔들림·흐리기 해제). */
  baseOf(obj: Phaser.GameObjects.Image): { x: number; y: number; scaleX: number; scaleY: number } | undefined {
    const slot = this.slots.find((s) => s?.art === obj);
    if (!slot) return undefined;
    const at = this.slots.indexOf(slot);
    const rect = designRect(this.layout, TRAY_SLOT_ART[at] ?? '');
    if (!rect || obj.width <= 0 || obj.height <= 0) return undefined;
    const fit = Math.min(slot.box.w / obj.width, slot.box.h / obj.height);
    return { x: rect.cx, y: rect.cy, scaleX: fit, scaleY: fit };
  }
}
