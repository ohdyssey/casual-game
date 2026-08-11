/**
 * costTip.ts — **한 판을 끝내고 딱 한 번** 뜨는 알림: 재료값은 이름표 색으로 정해진다.
 *
 * 조리하는 법은 화면의 ①②③ 한 줄 안내가 알려 준다(`STAGE_GUIDE`). 그런데 **재료값**만은
 * 화면 어디에도 설명이 없다 — 이름표 색이 등급인 걸 모르면 비싼 재료를 아무 생각 없이 담게 된다.
 * 그래서 **한 판을 다 겪어 본 뒤**, 무엇을 아껴야 하는지 알고 싶어질 때 한 번만 알려 준다.
 * 값 이야기 끝에 **금지 재료**를 한 줄 덧붙인다 — 아끼는 것보다 먼저 지켜야 할 것이라서다.
 *
 * ⚠️ 예전의 21장짜리 튜토리얼은 걷어냈다. 이건 그 자리를 대신하는 게 아니라 **한 장짜리 알림**이다 —
 * 늘리고 싶어지면 그때 다시 「너무 복잡하다」는 말을 듣게 된다.
 */
import Phaser from 'phaser';
import { GAME_FONT_FAMILY, GAME_FONT_STYLE } from '../ui/font.js';
import {
  INGREDIENT_COST,
  INGREDIENT_LABEL,
  INGREDIENT_TIER,
  TIER_COLOR,
  type CostTier,
  type IngredientId,
} from '../logic/ingredients.js';

const DESIGN = { w: 1080, h: 2400 } as const;
/** 별(220)보다 위 — 판이 끝나는 순간과 겹치므로 맨 앞이어야 한다. */
const DEPTH = { scrim: 300, panel: 302, text: 304 } as const;

/**
 * ⚠️⚠️ **알림판은 밝은 크림색이다.** 등급 글자색(`TIER_COLOR`)은 **진열의 밝은 나무판 위에서 읽히도록**
 * 고른 어두운 색이라, 짙은 갈색 판에 얹으면 배경에 묻혀 아예 안 보인다(첫 판이 그랬다).
 * 판을 진열 이름표와 같은 밝기로 맞춰야 **화면에서 본 그 색 그대로** 읽힌다.
 */
const PANEL = { w: 940, padX: 52, padY: 46, radius: 34, fill: 0xf7e3c8, edge: 0x8a5a2a } as const;
const INK = { title: '#3a1d05', body: '#3a2412', note: '#7a5a3c', ban: '#a8201a', hint: '#8a5a2a' } as const;

/**
 * 등급별 한 줄 — 색은 진열 이름표와 **같은 색**을 쓴다(화면에서 본 그 색이 여기 그대로 있어야 한다).
 * ⚠️ 특별 재료는 **재료마다 값이 달라** 이름 옆에 값을 붙인다 — 「비싸다」로 뭉뚱그리면
 * 깻잎($2)과 제육볶음($5)을 같은 것으로 알게 된다.
 */
const TIER_LINE: ReadonlyArray<{ readonly tier: CostTier; readonly note: string; readonly withCost: boolean }> = [
  { tier: 'cheap', note: '공짜입니다 — 넣을수록 남습니다', withCost: false },
  { tier: 'basic', note: '한 가지에 $1', withCost: false },
  { tier: 'premium', note: '특별 재료 — 재료마다 값이 다릅니다 (판마다 갈립니다)', withCost: true },
];

/**
 * 그 등급 재료들. **지금 진열대에 있는 것만** 적는다 —
 * ⚠️ 주재료가 열여섯 종이라 전부 적으면 한 줄이 대여섯 줄로 늘어나 읽히지 않는다.
 * 게다가 방금 한 판을 그 진열로 만들었으니, **화면에서 본 그 재료**여야 「아, 그거」가 된다.
 */
const idsOf = (tier: CostTier, shown: readonly IngredientId[]): IngredientId[] =>
  shown.filter((id) => INGREDIENT_TIER[id] === tier).sort((a, b) => INGREDIENT_COST[a] - INGREDIENT_COST[b]);

/** 그 등급 재료를 한 줄로. 특별 재료는 값을 함께 적는다(싼 것부터). */
const namesOf = (tier: CostTier, withCost: boolean, shown: readonly IngredientId[]): string =>
  idsOf(tier, shown)
    .map((id) => (withCost ? `${INGREDIENT_LABEL[id]} $${INGREDIENT_COST[id]}` : INGREDIENT_LABEL[id]))
    .join(withCost ? '  ·  ' : ' · ');

export class CostTip {
  private readonly parts: Phaser.GameObjects.GameObject[] = [];
  private readonly scrim: Phaser.GameObjects.Graphics;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly blocker: Phaser.GameObjects.Rectangle;
  private showing = false;
  private onClose?: () => void;

  constructor(private readonly scene: Phaser.Scene) {
    this.scrim = scene.add.graphics().setDepth(DEPTH.scrim).setVisible(false);
    this.panel = scene.add.graphics().setDepth(DEPTH.panel).setVisible(false);
    this.blocker = scene.add
      .rectangle(DESIGN.w / 2, DESIGN.h / 2, DESIGN.w, DESIGN.h, 0x000000, 0)
      .setDepth(DEPTH.scrim + 1)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.blocker.on('pointerdown', () => this.hide());
  }

  get visible(): boolean {
    return this.showing;
  }

  /** 한 번 띄운다. `shown` 은 **지금 진열대에 깔린 재료**다(진열은 판마다 갈린다). 닫으면 `onClose`. */
  show(shown: readonly IngredientId[], onClose: () => void): void {
    if (this.showing) return;
    this.showing = true;
    this.onClose = onClose;

    const text = (
      y: number,
      value: string,
      size: number,
      color: string,
    ): Phaser.GameObjects.Text =>
      this.scene.add
        .text(DESIGN.w / 2 - PANEL.w / 2 + PANEL.padX, y, value, {
          fontFamily: GAME_FONT_FAMILY,
          fontStyle: GAME_FONT_STYLE,
          fontSize: `${size}px`,
          color,
          wordWrap: { width: PANEL.w - PANEL.padX * 2, useAdvancedWrap: true },
        })
        .setOrigin(0, 0)
        .setDepth(DEPTH.text);

    let y = 0;
    const lines: Phaser.GameObjects.Text[] = [];
    const title = text(0, '재료값은 이름표 색으로 압니다', 52, INK.title);
    lines.push(title);
    y += title.height + 34;

    for (const { tier, note, withCost } of TIER_LINE) {
      // 등급색 **그대로** — 진열에서 본 색이 여기 그대로 있어야 「아, 그 색」이 된다.
      const head = text(y, namesOf(tier, withCost, shown), withCost ? 32 : 38, TIER_COLOR[tier]);
      lines.push(head);
      y += head.height + 6;
      const tail = text(y, note, 30, INK.note);
      lines.push(tail);
      y += tail.height + 28;
    }

    y += 6;
    const foot = text(y, '요구한 개수를 넘겨 담은 것만 값이 빠집니다.', 34, INK.body);
    lines.push(foot);
    y += foot.height + 22;

    // ⚠️ 값보다 먼저 지켜야 할 것 — 금지 재료.
    const ban = text(y, '금지 재료는 절대 넣지 마세요.', 38, INK.ban);
    lines.push(ban);
    y += ban.height + 6;
    const banWhy = text(y, '레시피 판의 빨간 글씨입니다. 넣으면 별이 깎이고 $2를 뭅니다.', 30, INK.note);
    lines.push(banWhy);
    y += banWhy.height + 30;

    const hint = text(y, '화면을 탭하면 계속 ▶', 30, INK.hint);
    lines.push(hint);
    y += hint.height;

    // 실제 높이를 알고 나서 판을 그리고, 글자를 통째로 가운데로 내린다.
    const h = y + PANEL.padY * 2;
    const top = (DESIGN.h - h) / 2;
    for (const line of lines) line.setY(line.y + top + PANEL.padY);

    const x = (DESIGN.w - PANEL.w) / 2;
    this.scrim.clear();
    this.scrim.fillStyle(0x120a04, 0.78);
    this.scrim.fillRect(0, 0, DESIGN.w, DESIGN.h);
    this.panel.clear();
    this.panel.fillStyle(PANEL.fill, 1);
    this.panel.fillRoundedRect(x, top, PANEL.w, h, PANEL.radius);
    this.panel.lineStyle(6, PANEL.edge, 1);
    this.panel.strokeRoundedRect(x, top, PANEL.w, h, PANEL.radius);

    this.parts.push(...lines);
    for (const o of [this.scrim, this.panel]) o.setVisible(true);
    this.blocker.setVisible(true);
  }

  private hide(): void {
    if (!this.showing) return;
    this.showing = false;
    for (const o of this.parts) o.destroy();
    this.parts.length = 0;
    this.scrim.setVisible(false);
    this.panel.setVisible(false);
    this.blocker.setVisible(false);
    const done = this.onClose;
    this.onClose = undefined;
    done?.();
  }
}
