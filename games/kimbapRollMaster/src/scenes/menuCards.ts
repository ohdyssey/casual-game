/**
 * menuCards.ts — 상단 메뉴 카드 두 장.
 *
 * 저작(main.json)은 **큰 카드 한 장에만** 내용이 그려져 있고 레이아웃이 평면 구조라
 * 부모-자식으로 묶어 옮길 수가 없다. 그래서 저작된 카드를 **본보기**로 읽어
 * "카드 크기 대비 어디에 무엇이 온다"는 비율만 뽑아 두고, 카드 두 장을 코드가 만든다.
 *
 * ⚠️⚠️ **카드는 고른다고 자리를 옮기지 않는다.** 카드 한 장은 **바로 뒤에 선 손님의 주문표**다 —
 * 왼쪽 카드는 왼쪽 손님, 오른쪽 카드는 오른쪽 손님. 고른 카드가 가운데로 옮겨 오면 그 짝이 끊긴다.
 * 그래서 자리는 **손님 노드의 x 에서 뽑고**(저작 카드의 y·크기는 그대로), 고르면 체크만 붙고
 * 고르지 않은 쪽은 살짝 가라앉는다. 에디터에서 손님을 옮기면 그 앞의 카드도 따라온다.
 *
 * ⚠️ **카드에 필수/금지를 띄우지 않는다.** 조리대 오른쪽 레시피 판이 그 일을 맡는다(`recipePanel.ts`) —
 * 같은 것을 두 군데에 그리면 눈이 갈라지고, 카드가 좁아 글자도 작아진다.
 */
import Phaser from 'phaser';
import { GAME_FONT_FAMILY, GAME_FONT_STYLE } from '../ui/font.js';
import { MENU_LABEL, MENU_PIECE_TEX } from '../logic/menu.js';
import { rollPrice, type Order, type OrderChannel } from '../logic/orders.js';
import type { LayoutIndex, LayoutNode } from '../ui/layoutLoader.js';
import { CheckBadge } from './checkBadge.js';
import {
  CARD_DEPTH_BASE,
  CARD_PART,
  CARD_SLOT_NODES,
  NODE,
  authoredCardNodes,
  designRect,
  type DesignRect,
} from './cookingNodes.js';

/** 대기 카드는 살짝 가라앉혀 둔다(고른 카드가 도드라지게). */
const IDLE_ALPHA = 0.82;
/** 가격표는 스티커처럼 비스듬히 붙는다. */
const PRICE_ANGLE = -14;
/** 가격 글자 크기 — **가장 크게** 읽혀야 한다. 무엇을 고를지는 결국 값으로 정한다. */
const PRICE_FONT = 68;
/**
 * 주문 경로별 엠블럼 — 카드 위쪽에 걸린다(원본 `Img/UI/UI_06-1~3.png`).
 * ⚠️ 에디터 업로드에는 **현장주문 한 장만** 올라와 있고 `pue export` 가 uploads 를 덮어쓰므로
 *    세 장 모두 **게임 소유**로 두고 여기서 키를 가리킨다(`assets.ts`).
 */
const CHANNEL_BADGE_TEX: Record<OrderChannel, string> = {
  onsite: 'game_order_onsite',
  phone: 'game_order_phone',
  app: 'game_order_app',
};

interface PartSpec {
  /** 카드 중심 기준 상대 위치 — 카드 폭·높이에 대한 비율. */
  readonly dx: number;
  readonly dy: number;
  readonly node: LayoutNode;
}

/**
 * **급행** 딱지 — 가격표 아래(바깥쪽)에 붙는다.
 * ⚠️ 이모지(🔥)는 Jua 에 글리프가 없어 두부가 된다. 글자와 도형만 쓴다.
 */
const RUSH_SPOT = { dx: 0.34, dy: -0.35, font: 34 } as const;
/** 급행 카드는 판을 살짝 붉게 물들인다 — 숫자를 읽기 전에 「이건 다르다」가 먼저 보여야 한다. */
const RUSH_TINT = 0xffc9b4;

interface CardParts {
  readonly panel: Phaser.GameObjects.Image;
  /** 고른 카드에만 붙는 체크 표시(왼쪽 위). */
  readonly check: CheckBadge;
  /** 값을 제대로 냈을 때 받는 돈 — 오른쪽 위에 기울여 붙는 가격표. */
  readonly price: Phaser.GameObjects.Text;
  readonly clock: Phaser.GameObjects.Text;
  readonly icon: Phaser.GameObjects.Image;
  readonly name: Phaser.GameObjects.Text;
  /** 받기로 한 줄 수(`×2`). ×1 이면 감춘다. */
  readonly rolls: Phaser.GameObjects.Text;
  /** 급행 주문 딱지. */
  readonly rush: Phaser.GameObjects.Text;
  /** 다 만들어 냈다는 도장 — 서빙 순간에 찍히고 주문표와 함께 물러난다. */
  readonly stamp: Phaser.GameObjects.Text;
  /** 교체 연출이 도는 중인가 — 그동안 기다림 게이지를 다시 켜지 않는다. */
  swapping: boolean;
  /** 카드 위쪽 주문 경로 엠블럼 — 주문마다 그림이 갈린다. */
  readonly badge: Phaser.GameObjects.Image;
  /**
   * 카드를 이루는 것 전부와 **저작 순서(오프셋)**.
   * 고른 카드를 통째로 앞으로 끌어올릴 때 쓴다 — 카드끼리 살짝 겹치므로 순서가 곧 「고름」의 표시다.
   */
  readonly layers: ReadonlyArray<{ readonly at: number; readonly setDepth: (d: number) => unknown }>;
  readonly depth: number;
  /** 트윈이 걸릴 수 있는 것 전부 — 카드를 다시 걸 때 남은 트윈을 끊으려고 들고 있는다. */
  readonly objects: ReadonlyArray<Phaser.GameObjects.GameObject>;
  /** 손님이 기다리는 시간 게이지. */
  readonly wait: Phaser.GameObjects.Graphics;
}

/** 고른 카드를 이만큼 앞으로 끌어올린다(다른 카드의 모든 층보다 위). */
const CHOSEN_LIFT = 20;

type PartKey = keyof typeof CARD_PART;

/** 고른 카드만 제자리에서 이만큼 커진다. 자리·크기는 저작이 정한다. */
const CHOSEN_SCALE = 1.14;

/** **다음 주문으로 눌러 둔** 카드의 불투명도 — 가라앉은 카드(`IDLE_ALPHA`)보다 또렷하다. */
const RESERVED_ALPHA = 0.96;

/**
 * **다 만들어 냈다는 도장** — 서빙하는 순간 그 주문표에 비스듬히 찍힌다.
 *
 * ⚠️⚠️ 이게 없으면 주문표는 **같은 자리에서 내용만 조용히 갈립니다.** 한 건을 끝냈다는 신호가
 * 조리대(별)에만 있고 주문표에는 없어서, 주문이 「처리된」 게 아니라 「사라진」 것으로 보인다.
 * 도장 → 퇴장 → 새 주문표 등장, 이 세 박자가 있어야 한 주기가 닫힌다.
 */
const STAMP: Record<0 | 1 | 2 | 3, { readonly text: string; readonly bg: string }> = {
  3: { text: '완벽!', bg: '#c8901a' },
  2: { text: '완료', bg: '#1d7a33' },
  1: { text: '완료', bg: '#4c6b4f' },
  0: { text: '실패', bg: '#a3302a' },
};
const STAMP_ANGLE = -13;
const STAMP_FONT = 54;

/**
 * 주문표 교체 연출 — **밀려 올라가 사라지고, 새것이 떨어져 들어온다.**
 * ⚠️ 짧아야 한다. 이 게임은 「결과와 다음 주문을 동시에」 굴려서 멈춰 서는 시간을 없앤 구조라
 * (`playServe` 의 `finish`), 교체에 뜸을 들이면 그 설계가 무너진다.
 * ⚠️ **등장 중에도 카드는 눌린다** — 급한 사람이 연출을 기다리지 않게.
 */
const SWAP_CARD = { hold: 260, out: 200, in: 280, rise: 46, drop: 84 } as const;

/**
 * 고른 카드에 붙는 체크 자리 — 카드 중심 대비 비율(왼쪽 위).
 * ⚠️ 두 카드가 바짝 붙어 있어 **모서리에 걸쳐 놓으면 옆 카드에 붙은 것처럼 보인다.**
 * 그래서 카드 안쪽으로 들여 붙인다 — 체크는 「이 카드」를 가리키는 표시라 자리를 잘못 잡으면 뜻이 뒤집힌다.
 */
/**
 * 카드 위 두 표시의 자리 — **가격은 바깥쪽, 체크는 안쪽**(둘 다 카드 안에 들어온다).
 *
 * ⚠️ 가격을 둘 다 오른쪽에 붙였더니 **왼쪽 카드의 가격표가 두 카드 사이 틈에 끼어** 오른쪽 카드에 붙은 것처럼
 * 보였다. 카드가 바짝 붙어 있으니 눈에 드는 것은 **바깥변**으로 내보내야 제 카드의 것으로 읽힌다.
 * 그래서 왼쪽 카드는 왼쪽에, 오른쪽 카드는 오른쪽에 붙인다.
 * 체크도 같은 **바깥변**이되 **가운데 높이** — 가격(위)과 겹치지 않고, 고른 카드는 기다림 게이지가
 * 사라진 자리라 비어 있다. 「기다리던 자리에 체크가 대신 선다」로도 읽힌다.
 */
const CHECK_SPOT = { dx: 0.38, dy: 0.02, r: 0.13 } as const;
/** ⚠️ 가격표는 카드 **윗변 위로** 걸터앉는다 — 카드 안으로 들어오면 엠블럼·시계와 부딪힌다. */
const PRICE_SPOT = { dx: 0.36, dy: -0.52 } as const;

/**
 * ⚠️ `X2` 는 저작 자리에서 **안쪽으로** 조금 들여 놓는다(카드 가운데 쪽).
 * 저작 자리 그대로면 오른쪽 카드에서 바깥변의 **기다림 게이지와 겹친다** —
 * 게이지는 두 카드 다 바깥변에 서므로, 겹침은 오른쪽 카드에서만 나서 눈에 잘 안 띈다.
 */
const ROLLS_INSET = 0.05;

/**
 * **손님이 기다리는 시간** 게이지 — 카드 안쪽 바깥변에 세로로 선다(왼쪽 카드는 왼쪽, 오른쪽 카드는 오른쪽).
 * 위에서 아래로 줄어들며, 다 줄면 그 손님은 그냥 가 버린다(`WAIT_MS`).
 * 카드에 적힌 시계(조리 제한시간)와 **다른 시계**라 글자가 아니라 막대로 보여 준다 — 숫자가 둘이면 헷갈린다.
 */
const WAIT_BAR = {
  dx: 0.38,
  /**
   * ⚠️ 막대 길이 — **급행 딱지와 겹치지 않을 만큼**만 쓴다. 세로 가운데를 기준으로 서므로
   * 이 값이 0.46 이던 시절에는 위쪽 끝이 급행 딱지(`RUSH_SPOT.dy`)까지 올라가 서로 먹었다.
   */
  h: 0.32,
  w: 0.055,
  full: 0x2f8fe0,
  low: 0xd8452f,
  /** 이 아래로 남으면 붉어진다 — 곧 간다는 신호. */
  lowAt: 0.3,
  track: 0x2a1608,
  trackAlpha: 0.3,
} as const;

export class MenuCardView {
  /** 저작된 카드 한 장 — 크기·부품 배치의 본보기다. */
  private readonly authored: DesignRect;
  /** 카드 두 장의 자리 — **손님 앞**이다(왼쪽 손님 / 오른쪽 손님). */
  private readonly slots: readonly DesignRect[];
  private readonly specs = new Map<PartKey, PartSpec>();
  private readonly cards: CardParts[] = [];
  private orders: readonly Order[] | null = null;
  private chosen: number | null = null;
  /** 미리 받아 둔 자리 — 기다림 게이지를 감추고 옅은 체크를 붙인다. */
  private reservedSlot: number | null = null;
  private onPick?: (slot: number) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: LayoutIndex,
  ) {
    const fallbackFocus: DesignRect = { cx: 415, cy: 608, w: 336, h: 462 };
    this.authored = designRect(layout, NODE.menuSlotFocus) ?? fallbackFocus;
    // ⚠️ **두 자리 모두 저작돼 있다.** 코드가 크기도 간격도 추측하지 않는다 —
    //    「조금 더 작게 · 조금 더 붙여서」는 에디터에서 카드를 옮기면 그대로 반영된다.
    this.slots = CARD_SLOT_NODES.map((id) => designRect(layout, id) ?? this.authored);
    this.readSpecs();
    this.hideAuthored();
    this.cards.push(this.buildCard(0), this.buildCard(1));
  }

  /** 저작된 구성 요소의 위치를 큰 카드 대비 비율로 환산해 둔다. */
  private readSpecs(): void {
    const { cx, cy, w, h } = this.authored;
    for (const key of Object.keys(CARD_PART) as PartKey[]) {
      const node = this.layout.nodeById(CARD_PART[key]);
      if (!node || w <= 0 || h <= 0) continue;
      this.specs.set(key, { dx: (node.x - cx) / w, dy: (node.y - cy) / h, node });
    }
  }

  /** 저작 본보기는 치운다 — 실제로 보이는 건 코드가 만든 카드 두 장이다. */
  private hideAuthored(): void {
    for (const id of authoredCardNodes(this.layout)) {
      this.layout.tryById(id)?.setVisible(false);
    }
  }

  private buildCard(index: number): CardParts {
    const { scene } = this;
    const panelNode = this.layout.nodeById(NODE.menuSlotFocus);
    const depth = CARD_DEPTH_BASE + index * 10;
    const panel = scene.add
      .image(0, 0, panelNode?.key ?? '')
      .setOrigin(0.5)
      .setDepth(depth)
      .setInteractive({ useHandCursor: true });
    panel.on('pointerdown', () => this.onPick?.(index));

    const iconNode = this.specs.get('icon')?.node;
    const icon = scene.add
      .image(0, 0, iconNode?.key ?? '')
      .setOrigin(0.5)
      .setDepth(depth + 1);

    // 엠블럼은 카드 **위로 삐져나오므로** 판보다 위에 그린다.
    const badge = scene.add
      .image(0, 0, this.specs.get('badge')?.node.key ?? '')
      .setOrigin(0.5)
      .setDepth(depth + 3);

    const text = (key: PartKey): Phaser.GameObjects.Text => {
      const node = this.specs.get(key)?.node;
      // 저작 글꼴은 무시한다 — 화면 전체가 게임 글꼴 한 벌이다(`ui/font.ts`).
      const t = scene.add
        .text(0, 0, node?.text ?? '', {
          fontFamily: GAME_FONT_FAMILY,
          fontStyle: GAME_FONT_STYLE,
          fontSize: `${node?.fontSize ?? 24}px`,
          color: node?.color ?? '#ffffff',
          align: 'center',
        })
        .setOrigin(0.5)
        .setDepth(depth + 2);
      if (node?.stroke && (node.strokeW ?? 0) > 0) t.setStroke(node.stroke, (node.strokeW ?? 0) * 2);
      return t;
    };

    const price = scene.add
      .text(0, 0, '', {
        fontFamily: GAME_FONT_FAMILY,
        fontStyle: GAME_FONT_STYLE,
        fontSize: '44px',
        color: '#ffe9a8',
        stroke: '#5a3210',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setAngle(PRICE_ANGLE)
      .setDepth(depth + 4);

    const rush = scene.add
      .text(0, 0, '급행', {
        fontFamily: GAME_FONT_FAMILY,
        fontStyle: GAME_FONT_STYLE,
        fontSize: `${RUSH_SPOT.font}px`,
        color: '#ffffff',
        backgroundColor: '#c62828',
        padding: { x: 12, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(depth + 4)
      .setVisible(false);

    const stamp = scene.add
      .text(0, 0, '', {
        fontFamily: GAME_FONT_FAMILY,
        fontStyle: GAME_FONT_STYLE,
        fontSize: `${STAMP_FONT}px`,
        color: '#ffffff',
        padding: { x: 26, y: 10 },
      })
      .setOrigin(0.5)
      .setAngle(STAMP_ANGLE)
      .setDepth(depth + 7)
      .setVisible(false);

    const wait = scene.add.graphics().setDepth(depth + 6).setVisible(false);
    const check = new CheckBadge(scene, depth + 5);
    const clock = text('clock');
    const name = text('name');
    // ×N 은 저작 노드(김밥 그림 오른쪽)를 그대로 따른다 — 자리·크기·색은 에디터가 정한다.
    const rolls = text('rolls').setVisible(false).setDepth(depth + 4);
    return {
      panel,
      icon,
      badge,
      price,
      check,
      clock,
      name,
      rolls,
      rush,
      stamp,
      swapping: false,
      depth,
      wait,
      objects: [panel, icon, badge, price, clock, name, rolls, rush, stamp, check.object],
      layers: [
        { at: 7, setDepth: (d) => stamp.setDepth(d) },
        { at: 0, setDepth: (d) => panel.setDepth(d) },
        { at: 1, setDepth: (d) => icon.setDepth(d) },
        { at: 2, setDepth: (d) => clock.setDepth(d) },
        { at: 2, setDepth: (d) => name.setDepth(d) },
        { at: 3, setDepth: (d) => badge.setDepth(d) },
        { at: 4, setDepth: (d) => price.setDepth(d) },
        { at: 4, setDepth: (d) => rolls.setDepth(d) },
        { at: 4, setDepth: (d) => rush.setDepth(d) },
        { at: 5, setDepth: (d) => check.object.setDepth(d) },
        { at: 6, setDepth: (d) => wait.setDepth(d) },
      ],
    };
  }

  /** 카드를 누르면 알려 준다. */
  setOnPick(cb: (slot: number) => void): void {
    this.onPick = cb;
  }


  /** 새 주문 카드 — 첫 주문은 한 장뿐이라 나머지 자리는 비워 둔다. */
  setCards(orders: readonly Order[], replaced?: readonly number[]): void {
    this.orders = orders;
    this.chosen = null;
    this.reservedSlot = null;
    // ⚠️⚠️ **먼저 남은 트윈을 끊는다.** 직전 주문에서 `choose` 가 건 트윈(고르지 않은 카드를 알파 0.82 로
    //    가라앉히고, 고른 카드를 키우는)이 아직 돌고 있으면, 아래에서 되돌려 놓아도 트윈이 도로 덮어쓴다 —
    //    그러면 새 카드가 **반투명한 채로**(테두리가 없는 것처럼) 걸리거나 엉뚱한 크기로 남는다.
    for (const card of this.cards) this.scene.tweens.killTweensOf(card.objects);
    this.cards.forEach((card, i) => this.setCardVisible(card, i < orders.length));
    orders.forEach((order, i) => {
      const card = this.cards[i];
      if (!card) return;
      // ⚠️⚠️ **주문을 받아 간 자리만 갈아 낀다**(`replaced`). 남겨 둔 주문표는 손대지 않는다 —
      //    아직 기다리는 손님의 주문표가 이유 없이 다시 날아 들어오면 「새 주문이 왔다」로 잘못 읽힌다.
      if (replaced?.includes(i)) this.swapCard(card, i, order);
      else this.applyOrder(card, i, order);
    });
  }

  /**
   * **묵은 주문표를 밀어 올려 보내고 새것을 떨어뜨린다.**
   * 도장이 찍힌 채로 잠깐 머물렀다가(`SWAP_CARD.hold`) 물러나므로, 「처리됐다 → 다음 손님」이 한 줄로 읽힌다.
   */
  private swapCard(card: CardParts, index: number, order: Order): void {
    const moving = [card.panel, card.icon, card.badge, card.price, card.clock, card.name, card.rolls, card.rush, card.stamp];
    const shown = moving.filter((o) => o.visible);
    card.swapping = true;
    card.wait.setVisible(false);
    card.check.hide();
    card.panel.disableInteractive();

    const enter = (): void => {
      this.applyOrder(card, index, order);
      const parts = [card.panel, card.icon, card.badge, card.price, card.clock, card.name, card.rolls, card.rush]
        .filter((o) => o.visible);
      // 위에서 떨어져 통통 — 「새로 왔다」는 신호는 자리가 아니라 **움직임**이 만든다.
      for (const obj of parts) obj.setY(obj.y - SWAP_CARD.drop).setAlpha(0);
      this.scene.tweens.add({
        targets: parts,
        y: `+=${SWAP_CARD.drop}`,
        alpha: 1,
        duration: SWAP_CARD.in,
        ease: 'Back.easeOut',
        onComplete: () => {
          card.swapping = false;
          for (const obj of parts) obj.setAlpha(1);
        },
      });
    };

    if (shown.length === 0) {
      enter();
      return;
    }
    this.scene.tweens.add({
      targets: shown,
      y: `-=${SWAP_CARD.rise}`,
      alpha: 0,
      duration: SWAP_CARD.out,
      delay: SWAP_CARD.hold,
      ease: 'Quad.easeIn',
      onComplete: enter,
    });
  }

  /** 주문표 한 장의 내용을 갈아 끼우고 제자리에 놓는다(연출 없음). */
  private applyOrder(card: CardParts, index: number, order: Order): void {
    card.name.setText(MENU_LABEL[order.menu]);
    // ⚠️ 값·시계는 **줄 수까지 곱한 것**이 카드에 뜬다 — 고르기 전에 감당할 크기를 다 보여 준다.
    card.price.setText(`$${rollPrice(order)}`);
    // 표기는 저작을 따른다(에디터에 `X2` 로 그려져 있다). 한 줄이면 감춘다 — 평범한 주문에 군더더기를 붙이지 않는다.
    card.rolls.setText(`X${order.rolls}`).setVisible(order.rolls > 1);
    this.setBadge(card, order.channel);
    const tex = MENU_PIECE_TEX[order.menu];
    if (this.scene.textures.exists(tex)) card.icon.setTexture(tex);
    card.panel.setInteractive({ useHandCursor: true }).setAlpha(1);
    // 급행이면 판이 붉게 물들고 딱지가 붙는다 — 숫자를 읽기 전에 눈에 들어와야 한다.
    card.rush.setVisible(order.rush);
    if (order.rush) card.panel.setTint(RUSH_TINT);
    else card.panel.clearTint();
    card.check.hide();
    card.stamp.setVisible(false);
    card.swapping = false;
    this.lift(card, 0);
    this.placeCard(card, index, this.slotFor(index, null), 0);
  }

  /**
   * **다 만들어 냈다는 도장을 찍는다** — 손님이 물러나기 전에 그 주문표 위에.
   * `stars` 0 은 실패다.
   */
  stamp(slot: number, stars: number): void {
    const card = this.cards[slot];
    if (!card || !card.panel.visible) return;
    const grade = Math.min(3, Math.max(0, Math.round(stars))) as 0 | 1 | 2 | 3;
    const spec = STAMP[grade];
    const rect = this.slotFor(slot, this.chosen);
    card.stamp
      .setText(spec.text)
      .setBackgroundColor(spec.bg)
      .setPosition(rect.cx, rect.cy)
      .setVisible(true)
      .setAlpha(0)
      .setScale(2.4)
      .setAngle(STAMP_ANGLE - 16);
    // 쾅 — 커진 채로 들어와 제 크기에 내리꽂힌다(`easeIn` 이라야 「찍혔다」로 읽힌다).
    this.scene.tweens.add({
      targets: card.stamp,
      scale: 1,
      alpha: 1,
      angle: STAMP_ANGLE,
      duration: 160,
      ease: 'Quad.easeIn',
    });
  }

  /**
   * 고른 카드만 **제자리에서 커지고** 체크가 붙는다. 나머지는 작은 채로 살짝 가라앉는다.
   * ⚠️ 자리는 그대로다 — 옮기면 바로 뒤 손님과의 짝이 끊긴다.
   */
  choose(slot: number): void {
    this.chosen = slot;
    this.cards.forEach((card, i) => {
      // ⚠️⚠️ **고르지 않은 카드는 계속 눌린다.** 이번 주문을 만드는 동안 다음 주문을 미리 눌러 둘 수
      //    있어야 하기 때문이다(`CookingView.reserved`). 고른 카드만 잠근다 — 이미 만들고 있으니까.
      if (i === slot) card.panel.disableInteractive();
      else card.panel.setInteractive({ useHandCursor: true });
      // 커지면서 옆 카드를 살짝 덮는다 — 덮는 쪽이 고른 카드라야 「이걸 골랐다」로 읽힌다.
      this.lift(card, i === slot ? CHOSEN_LIFT : 0);
      this.placeCard(card, i, this.slotFor(i, slot), 260);
      this.scene.tweens.add({ targets: card.panel, alpha: i === slot ? 1 : IDLE_ALPHA, duration: 260 });
    });
    const check = this.cards[slot]?.check;
    check?.setTone('strong');
    check?.show();
  }

  /**
   * **다음 주문으로 눌러 둔 카드**를 표시한다(`null` 이면 표시를 지운다).
   *
   * ⚠️ 고른 카드의 **짙은 초록 체크**와 구별되도록 **옅은 초록**을 쓴다 —
   *    진열 재료의 「아직 다 안 채움(옅은) / 다 채움(짙은)」과 같은 말을 카드에서도 쓰는 것이다.
   * ⚠️ 예약한 카드는 살짝 떠오른다(`RESERVED_ALPHA`) — 가라앉은 채로는 눌린 표시가 안 난다.
   */
  setReserved(slot: number | null): void {
    this.reservedSlot = slot;
    this.cards.forEach((card, i) => {
      if (i === this.chosen) return;
      const on = i === slot;
      if (on) {
        card.check.setTone('light');
        card.check.show();
      } else {
        card.check.hide();
      }
      if (!card.panel.visible) return;
      this.scene.tweens.killTweensOf(card.panel);
      this.scene.tweens.add({
        targets: card.panel,
        alpha: this.chosen === null ? 1 : on ? RESERVED_ALPHA : IDLE_ALPHA,
        duration: 180,
      });
    });
  }


  /** 카드 한 장을 통째로 앞뒤로 옮긴다(저작 순서는 그대로 지킨다). */
  private lift(card: CardParts, extra: number): void {
    for (const layer of card.layers) layer.setDepth(card.depth + extra + layer.at);
  }

  /**
   * **기다리는 시간 게이지** — 카드마다 0(곧 간다) ~ 1(막 왔다).
   * 고른 카드는 기다림이 멈추므로 게이지를 감춘다(그 손님은 이미 주문을 넘겼다).
   */
  setWaits(ratios: readonly number[]): void {
    this.cards.forEach((card, i) => {
      const ratio = ratios[i];
      // ⚠️ **미리 받아 둔 카드도 게이지를 감춘다** — 주문을 받아 준 손님이라 더 기다리는 중이 아니다.
      //    (그 카드에서는 대신 **제한시간 시계**가 흐르기 시작한다.)
      const taken = this.chosen === i || this.reservedSlot === i;
      // ⚠️ 교체 연출이 도는 동안에는 게이지를 켜지 않는다 — 날아가는 주문표에 붙어 같이 움직인다.
      const showing = ratio !== undefined && !taken && !card.swapping && card.panel.visible;
      card.wait.setVisible(showing);
      if (!showing || ratio === undefined) return;
      this.drawWait(card, i, Math.max(0, Math.min(1, ratio)));
    });
  }

  private drawWait(card: CardParts, index: number, ratio: number): void {
    const slot = this.slotFor(index, this.chosen);
    // 바깥변 쪽에 세운다 — 왼쪽 카드는 왼쪽, 오른쪽 카드는 오른쪽.
    const side = index === 0 ? -1 : 1;
    const w = slot.w * WAIT_BAR.w;
    const h = slot.h * WAIT_BAR.h;
    const x = slot.cx + side * slot.w * WAIT_BAR.dx - w / 2;
    const y = slot.cy - h / 2;
    const g = card.wait;
    g.clear();
    g.fillStyle(WAIT_BAR.track, WAIT_BAR.trackAlpha);
    g.fillRoundedRect(x, y, w, h, w / 2);
    const left = h * ratio;
    if (left <= 0) return;
    g.fillStyle(ratio <= WAIT_BAR.lowAt ? WAIT_BAR.low : WAIT_BAR.full, 1);
    // 위에서 아래로 줄어든다 — 남은 만큼이 아래에 남는다.
    g.fillRoundedRect(x, y + (h - left), w, left, w / 2);
  }

  /** 카드마다 제 시계를 본다 — 걸린 시각이 달라 남은 시간도 서로 다르다. */
  setClocks(labels: readonly string[], urgent: readonly boolean[]): void {
    const normal = this.specs.get('clock')?.node.color ?? '#110c09';
    this.cards.forEach((card, i) => {
      const label = labels[i];
      if (label === undefined) return;
      card.clock.setText(label).setColor(urgent[i] ? '#c62828' : normal);
    });
  }

  /** 주문 경로에 맞는 엠블럼으로 갈아 끼운다(크기는 `placeCard` 가 칸에 맞춰 다시 잡는다). */
  private setBadge(card: CardParts, channel: OrderChannel): void {
    const tex = CHANNEL_BADGE_TEX[channel];
    if (this.scene.textures.exists(tex)) card.badge.setTexture(tex);
  }

  /** 카드 한 장을 통째로 보이거나 감춘다(첫 주문은 한 장뿐이다). */
  private setCardVisible(card: CardParts, visible: boolean): void {
    const parts: Array<Phaser.GameObjects.Image | Phaser.GameObjects.Text> = [
      card.panel, card.icon, card.badge, card.price, card.clock, card.name,
    ];
    for (const part of parts) part.setVisible(visible);
    if (!visible) {
      card.check.hide();
      card.wait.setVisible(false);
      // ×N·급행·도장은 주문마다 다시 정해지므로 감출 때 함께 지운다.
      card.rolls.setVisible(false);
      card.rush.setVisible(false);
      card.stamp.setVisible(false);
    }
  }

  /**
   * 카드 **자리는 고정**이다 — 고른다고 옮기지 않는다(그 짝인 손님이 뒤에 서 있다).
   * 대신 **크기가 바뀐다** — 고르기 전에는 작게 걸려 손님을 덜 가리고, 고른 카드만 제 크기로 커진다.
   */
  private slotFor(index: number, chosen: number | null): DesignRect {
    const spot = this.slots[index] ?? this.authored;
    const scale = chosen === index ? CHOSEN_SCALE : 1;
    return { ...spot, w: this.authored.w * scale, h: this.authored.h * scale };
  }

  /** 카드 한 장을 슬롯 크기에 맞춰 배치(0ms 면 즉시). */
  private placeCard(card: CardParts, index: number, slot: DesignRect, duration: number): void {
    const scale = this.authored.h > 0 ? slot.h / this.authored.h : 1;
    // ⚠️ 글자는 **판보다 덜 줄인다** — 작은 카드에서도 저작 크기 그대로 읽힌다.
    const textScale = Math.max(scale, 1);

    const move = (
      obj: Phaser.GameObjects.Image | Phaser.GameObjects.Text,
      key: PartKey | 'panel',
      nudgeX = 0,
    ): void => {
      const target =
        key === 'panel'
          ? { x: slot.cx, y: slot.cy }
          : {
              x: slot.cx + (this.specs.get(key)?.dx ?? 0) * slot.w + nudgeX,
              y: slot.cy + (this.specs.get(key)?.dy ?? 0) * slot.h,
            };
      if (duration <= 0) obj.setPosition(target.x, target.y);
      else this.scene.tweens.add({ targets: obj, x: target.x, y: target.y, duration, ease: 'Quad.easeOut' });
    };

    // 판넬·아이콘은 슬롯 비율대로 크기를 다시 잡는다(텍스트는 폰트 크기로).
    const sizeOf = (key: PartKey): { w: number; h: number } => {
      const node = this.specs.get(key)?.node;
      return { w: (node?.w ?? 0) * scale, h: (node?.h ?? 0) * scale };
    };

    // ⚠️ 엠블럼은 종류마다 원본 크기가 달라(105×115 · 112×110 · 89×108) 저작 칸에 그냥 늘리면 찌그러진다.
    //    칸 안에 **비율 그대로** 재운다.
    const badgeBox = sizeOf('badge');
    if (badgeBox.w > 0 && card.badge.width > 0) {
      const fit = Math.min(badgeBox.w / card.badge.width, badgeBox.h / card.badge.height);
      card.badge.setDisplaySize(card.badge.width * fit, card.badge.height * fit);
    }

    if (duration <= 0) {
      card.panel.setDisplaySize(slot.w, slot.h);
      const icon = sizeOf('icon');
      if (icon.w > 0) card.icon.setDisplaySize(icon.w, icon.h);
    } else {
      const icon = sizeOf('icon');
      this.scene.tweens.add({
        targets: card.panel,
        displayWidth: slot.w,
        displayHeight: slot.h,
        duration,
        ease: 'Back.easeOut',
      });
      if (icon.w > 0) {
        this.scene.tweens.add({
          targets: card.icon,
          displayWidth: icon.w,
          displayHeight: icon.h,
          duration,
          ease: 'Back.easeOut',
        });
      }
    }

    // 가격은 **바깥쪽**, 체크는 그 반대편(안쪽) — 둘 다 카드를 따라 움직인다.
    const out = index === 0 ? -1 : 1;
    card.check.place(
      slot.cx + slot.w * CHECK_SPOT.dx * out,
      slot.cy + slot.h * CHECK_SPOT.dy,
      Math.min(slot.w, slot.h) * CHECK_SPOT.r,
      duration,
    );
    const priceX = slot.cx + slot.w * PRICE_SPOT.dx * out;
    const priceY = slot.cy + slot.h * PRICE_SPOT.dy;
    const priceSize = Math.round(PRICE_FONT * textScale);
    if (duration <= 0) {
      card.price.setPosition(priceX, priceY).setFontSize(priceSize);
    } else {
      card.price.setFontSize(priceSize);
      this.scene.tweens.add({ targets: card.price, x: priceX, y: priceY, duration, ease: 'Quad.easeOut' });
    }

    // 급행 딱지만 코드가 자리를 잡는다(저작 노드가 없다) — 가격표 아래 바깥쪽.
    card.rush.setFontSize(Math.round(RUSH_SPOT.font * textScale));
    const rushX = slot.cx + slot.w * RUSH_SPOT.dx * out;
    const rushY = slot.cy + slot.h * RUSH_SPOT.dy;
    if (duration <= 0) card.rush.setPosition(rushX, rushY);
    else this.scene.tweens.add({ targets: card.rush, x: rushX, y: rushY, duration, ease: 'Quad.easeOut' });

    // ⚠️ `X2` 는 두 카드 **모두 김밥 그림의 오른쪽**에 저작돼 있다. 그것을 안쪽으로 들이면
    //    오른쪽 카드에서만 숫자가 그림 쪽(왼쪽)으로 밀려 든다 — 그 카드에서는 그림도 같이 비켜 준다.
    //    왼쪽 카드는 숫자가 그림에서 멀어지는 방향이라 건드릴 이유가 없다.
    const rollsNudge = -out * slot.w * ROLLS_INSET;
    const iconNudge = Math.min(0, rollsNudge);

    move(card.panel, 'panel');
    move(card.icon, 'icon', iconNudge);
    move(card.badge, 'badge');
    const texts: ReadonlyArray<[PartKey, Phaser.GameObjects.Text]> = [
      ['clock', card.clock],
      ['name', card.name],
      ['rolls', card.rolls],
    ];
    for (const [key, obj] of texts) {
      const size = Math.round((this.specs.get(key)?.node.fontSize ?? 24) * textScale);
      obj.setFontSize(size);
      // `X2` 만 저작 자리에서 안쪽으로 들여 놓는다 — 바깥변의 기다림 게이지와 겹치지 않게.
      move(obj, key, key === 'rolls' ? rollsNudge : 0);
    }
  }

  /** 현재 고른 주문(없으면 null) — 헤드리스 검증용. */
  get chosenOrder(): Order | null {
    return this.chosen === null ? null : (this.orders?.[this.chosen] ?? null);
  }
}
