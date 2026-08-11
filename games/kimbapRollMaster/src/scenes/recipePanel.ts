/**
 * recipePanel.ts — 조리대 **오른쪽 판에 걸리는 레시피**.
 *
 * 고른 주문을 그대로 받아 적는다 — 위에서부터
 * **메뉴**(김밥 단면 + 흰 글씨) · **필수**(재료 그림 + 초록 글씨) · **금지**(재료 그림 + 빨간 글씨).
 * 재료를 고르는 진열 바로 옆이라, 조건을 보려고 화면 위 카드까지 올려다볼 일이 없다.
 * (예전에는 대나무발 아래에 필수/금지 알림띠를 따로 깔았는데, 이 판이 그 일을 대신한다.)
 *
 * 필수 재료를 김 위에 올리면 그 그림에 **작은 체크**가 붙는다 —
 * 「몇 개 남았나」는 알약 카운터가 세고, 여기서는 **「그 하나를 챙겼나」**를 본다.
 * 금지 쪽에는 체크를 붙이지 않는다 — 초록 체크는 「잘했다」로 읽혀서 뜻이 뒤집힌다.
 *
 * ⚠️ **자리·크기·색은 전부 저작이 정한다**(`RECIPE_NODE`). 코드는 텍스처와 글자만 갈아 끼운다.
 * 판 배경은 조리대 그림에 그려져 있어 별도 노드가 없다 — 주문이 없으면 내용물만 감추면 빈 판이 된다.
 */
import type Phaser from 'phaser';
import {
  INGREDIENT_LABEL,
  INGREDIENT_TRAY_TEX,
  forbiddenLabel,
  isSeasoningId,
  type ForbiddenId,
  type IngredientId,
} from '../logic/ingredients.js';
import { MENU_LABEL, MENU_PIECE_TEX } from '../logic/menu.js';
import type { Order } from '../logic/orders.js';
import type { LayoutIndex } from '../ui/layoutLoader.js';
import { CheckBadge } from './checkBadge.js';
import { RECIPE_NODE, RECIPE_NODES, SEASONING_ART_NODE, designRect } from './cookingNodes.js';

/** 체크 반지름 = 재료 그림 짧은 변 × 이만큼. **작게** — 재료가 뭔지 가리면 안 된다. */
const CHECK_R_RATIO = 0.19;

export class RecipePanel {
  private readonly menuIcon?: Phaser.GameObjects.Image;
  private readonly menuName?: Phaser.GameObjects.Text;
  private readonly requiredIcon?: Phaser.GameObjects.Image;
  private readonly requiredName?: Phaser.GameObjects.Text;
  private readonly forbiddenIcon?: Phaser.GameObjects.Image;
  private readonly forbiddenName?: Phaser.GameObjects.Text;
  /** 필수 재료를 챙겼다는 표시 — 그 그림 오른쪽 위 모서리에 붙는다. */
  private readonly requiredCheck: CheckBadge;

  /**
   * 저작된 그림 칸의 크기 — 텍스처를 갈아 끼우면 원본 크기가 제각각이라
   * **이 칸에 맞춰 비율 그대로 다시 재운다**(안 그러면 재료마다 크기가 널뛴다).
   */
  private readonly iconBox = new Map<Phaser.GameObjects.Image, { readonly w: number; readonly h: number }>();

  /** 지금 적혀 있는 주문 — 같은 것을 또 받으면 다시 그리지 않는다. */
  private order: Order | null | undefined = undefined;
  private required: IngredientId | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly layout: LayoutIndex,
  ) {
    this.menuIcon = this.icon(RECIPE_NODE.menuIcon);
    this.menuName = layout.tryById<Phaser.GameObjects.Text>(RECIPE_NODE.menuName);
    this.requiredIcon = this.icon(RECIPE_NODE.requiredIcon);
    this.requiredName = layout.tryById<Phaser.GameObjects.Text>(RECIPE_NODE.requiredName);
    this.forbiddenIcon = this.icon(RECIPE_NODE.forbiddenIcon);
    this.forbiddenName = layout.tryById<Phaser.GameObjects.Text>(RECIPE_NODE.forbiddenName);

    const iconDepth = this.requiredIcon?.depth ?? 0;
    this.requiredCheck = new CheckBadge(scene, iconDepth + 1, 'strong');
    this.placeRequiredCheck();
    this.setOrder(null);
  }

  /** 그림 노드를 꺼내면서 저작된 칸 크기를 기억해 둔다. */
  private icon(id: string): Phaser.GameObjects.Image | undefined {
    const obj = this.layout.tryById<Phaser.GameObjects.Image>(id);
    const rect = designRect(this.layout, id);
    if (obj && rect) this.iconBox.set(obj, { w: rect.w, h: rect.h });
    return obj;
  }

  /** 필수 재료 그림의 **오른쪽 위 모서리** — 그림 자체는 가리지 않는다. */
  private placeRequiredCheck(): void {
    const rect = designRect(this.layout, RECIPE_NODE.requiredIcon);
    if (!rect) return;
    const r = Math.min(rect.w, rect.h) * CHECK_R_RATIO;
    this.requiredCheck.place(rect.cx + rect.w / 2 - r, rect.cy - rect.h / 2 + r, r);
  }

  /** 텍스처를 갈아 끼우고 저작된 칸에 비율 그대로 다시 재운다. */
  private retexture(obj: Phaser.GameObjects.Image | undefined, key: string | undefined): void {
    if (!obj || !key || !obj.scene.textures.exists(key)) return;
    obj.setTexture(key);
    const box = this.iconBox.get(obj);
    if (!box || obj.width <= 0 || obj.height <= 0) return;
    const fit = Math.min(box.w / obj.width, box.h / obj.height);
    obj.setScale(fit);
  }

  /**
   * 재료(또는 마무리) → 그림 텍스처.
   * ⚠️ 예전에는 **하단 진열 노드에서 빌려 왔다.** 지금은 진열이 판마다 갈려서(재료 23종 · 칸 12개)
   * 그 자리에 그 재료가 있으리라는 보장이 없다 — 그래서 **게임 소유 텍스처를 곧바로** 쓴다.
   * 마무리(참기름·깨소금)는 상단 도구 노드에 저작돼 있으니 거기서 그대로 빌린다.
   */
  private artOf(id: ForbiddenId): string | undefined {
    if (isSeasoningId(id)) return this.layout.nodeById(SEASONING_ART_NODE[id])?.key;
    return INGREDIENT_TRAY_TEX[id];
  }

  /**
   * 새 주문을 받아 적는다. `null` 이면(아직 안 골랐거나 서빙이 끝났으면) 판을 비운다
   * — 배경 판은 조리대 그림이라 그대로 남고, 빈 판이 「아직 주문이 없다」로 읽힌다.
   *
   * ⚠️ **같은 주문이면 아무것도 하지 않는다.** 이 메서드는 입력이 들어올 때마다 불리는데,
   * 매번 다시 적으면 체크가 지워졌다 튀어나오기를 반복한다(주문 객체는 한 번 만들면 안 바뀐다).
   */
  setOrder(order: Order | null): void {
    if (order === this.order) return;
    this.order = order;
    const showing = !!order;
    for (const id of RECIPE_NODES) this.layout.tryById(id)?.setVisible(showing);
    if (!order) {
      this.required = null;
      this.requiredCheck.hide();
      return;
    }

    this.required = order.required;
    this.retexture(this.menuIcon, MENU_PIECE_TEX[order.menu]);
    this.menuName?.setText(MENU_LABEL[order.menu]);
    this.retexture(this.requiredIcon, this.artOf(order.required));
    this.requiredName?.setText(INGREDIENT_LABEL[order.required]);
    this.retexture(this.forbiddenIcon, this.artOf(order.forbidden));
    this.forbiddenName?.setText(forbiddenLabel(order.forbidden));
    this.setPicked([]);
  }

  /** 필수 재료를 김 위에 올렸으면 그 그림에 작은 체크를 붙인다. */
  setPicked(picked: readonly IngredientId[]): void {
    if (this.required && picked.includes(this.required)) this.requiredCheck.show();
    else this.requiredCheck.hide();
  }
}
