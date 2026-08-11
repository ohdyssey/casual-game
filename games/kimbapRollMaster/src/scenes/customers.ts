/**
 * customers.ts — 조리대 양옆에 선 **주문한 사람 두 명**.
 *
 * 하는 일은 셋이다.
 *   ① **살짝살짝 흔들린다** — 발밑을 축으로 아주 조금. 서 있는 그림이 얼어 있지 않게만 한다.
 *   ② **주문 경로에 맞는 사람이 선다** — 현장주문은 손님, **전화·앱주문은 배달원**이다.
 *      카드 위 엠블럼과 뒤에 선 사람이 같은 이야기를 해야 한다.
 *   ③ **주문을 받아 간 자리만 새 사람으로 갈린다** — 아직 기다리는 쪽은 제 카드와 함께 그대로 서 있는다.
 *
 * ⚠️ **얼굴 26장을 미리 다 받지 않는다.** 한 장이 300~450KB 라 전부면 9MB —
 * 로딩 화면도 없는 게임에서 첫 진입을 그만큼 늦출 수는 없다. 그래서 **필요해진 사람만 받고,
 * 도착하는 즉시 갈아 세운다.** 못 받은 동안에는 있던 사람이 서 있는다(빈 자리보다 낫다).
 *
 * ⚠️ 얼굴마다 원본 비율이 다르다(276×886 ~ 420×856). 저작 칸에 그냥 늘리면 사람이 찌그러지므로
 * **키를 맞추고 폭은 비율대로** 두며, **발밑을 고정**한다(origin 0.5, 1).
 * 키는 **자리와 무관하게, 갈래와도 무관하게 하나**다(`baseHeight`) —
 * 같은 사람이 좌우에서 다른 크기로 보이면 안 되고, 배달원이라고 작아지지도 않는다.
 *
 * ⚠️ 사람은 **자리를 가리지 않는다.** 왼쪽 전용·오른쪽 전용이 따로 있는 게 아니라 한 통에서 랜덤으로 뽑는다.
 * 다만 **같은 사람이 양옆에 동시에 서지는 않는다.**
 */
import type Phaser from 'phaser';
import { CARD_DEPTH_BASE, NODE, designRect, image } from './cookingNodes.js';
import { GAME_FONT_FAMILY, GAME_FONT_STYLE } from '../ui/font.js';
import type { LayoutIndex } from '../ui/layoutLoader.js';
import type { Order, OrderChannel } from '../logic/orders.js';

/** 서 있는 사람의 갈래 — 가게에 온 손님인가, 받으러 온 배달원인가. */
type Kind = 'guest' | 'rider';

/**
 * 그림 묶음. `Chr_01-*`·`Chr_02-*` 는 손님, **`Chr_04-*` 는 배달원**이다
 * (`public/game/chr/<묶음>_<번호>.png`).
 */
const SETS: ReadonlyArray<{ readonly set: number; readonly count: number; readonly kind: Kind }> = [
  { set: 1, count: 11, kind: 'guest' },
  { set: 2, count: 10, kind: 'guest' },
  { set: 4, count: 5, kind: 'rider' },
];

/**
 * **쓰지 않는 그림**(PO 지시). 번호를 건너뛰지 않고 여기서 빼는 이유는, `SETS` 의 개수를 줄이면
 * 뒤 번호까지 함께 사라지기 때문이다 — 빼는 것은 **그 한 장**이다.
 * 파일은 `public/game/chr/` 에 그대로 두고 **받지 않는다**(안 쓰는 그림을 내려받을 이유가 없다).
 */
const EXCLUDED: ReadonlySet<string> = new Set(['02_10']);

/**
 * **여성 그림** — `Chr_01-*` 는 전원 여성이고, 배달원 중에는 `04-05` 한 명이다.
 * (`Chr_02-*` 는 전원 남성.)
 */
const FEMALE = (set: number, no: number): boolean => set === 1 || (set === 4 && no === 5);

/**
 * 여성은 **아주 조금만** 작게 세운다(95.5%).
 * ⚠️ 90%로 줄였더니 **남녀 키 차이가 너무 벌어졌다** — 여기서 줄이려는 건 「원본이 작게 그려져
 * 같은 높이로 늘리면 확대돼 보이는 것」뿐이지, 실제 키 차이를 만들려는 게 아니다.
 * ⚠️ 모두 같은 키로 맞춰 놓으니 **여성 그림이 상대적으로 커 보였다** — 원본이 남성보다 작게 그려져 있어
 * 같은 높이로 늘리면 그만큼 확대되기 때문이다. 발밑이 축이라 줄여도 같은 바닥을 딛고 선다.
 */
const FEMALE_SCALE = 0.955;

interface Face {
  readonly key: string;
  readonly path: string;
  readonly kind: Kind;
  /** 이 그림에 곱하는 키 배율(여성은 조금 작다). */
  readonly scale: number;
}

const pad = (n: number): string => String(n).padStart(2, '0');

const FACES: readonly Face[] = SETS.flatMap(({ set, count, kind }) =>
  Array.from({ length: count }, (_, i) => `${pad(set)}_${pad(i + 1)}`)
    .filter((name) => !EXCLUDED.has(name))
    .map((name, _i, _all) => {
      const [setPart, noPart] = name.split('_');
      const no = Number(noPart);
      return {
        key: `game_chr_${name}`,
        path: `game/chr/${name}.png`,
        kind,
        scale: FEMALE(Number(setPart), no) ? FEMALE_SCALE : 1,
      };
    }),
);

/**
 * 주문 경로 → 누가 서 있나.
 * **전화·앱주문은 배달원**이 받으러 온다 — 손님이 직접 온 게 아니다.
 */
const KIND_OF: Record<OrderChannel, Kind> = { onsite: 'guest', phone: 'rider', app: 'rider' };

/** 흔들림 — **아주 조금.** 각도는 1도 아래, 숨쉬기는 0.6% 다. */
const SWAY = {
  angle: 0.45,
  angleMs: 2600,
  breath: 1.006,
  breathMs: 2100,
  /** 두 사람이 같은 박자로 흔들리면 인형처럼 보인다 — 자리마다 어긋나게 한다. */
  stagger: 430,
} as const;

/** 교체 연출 — 스윽 사라졌다 나타난다. */
const SWAP = { out: 200, in: 240 } as const;

/**
 * **받아 가면서 하는 인사** — 손님이 물러나기 전에 머리 위에 한 마디 뜬다.
 *
 * ⚠️ 성적이 그대로 말이 된다. 별 개수만 조리대에 띄우고 손님은 말없이 사라지면
 * 「누구에게 무엇을 해 줬는지」가 끊긴다 — 주문표의 도장(`menuCards.stamp`)과 한 쌍이다.
 * ⚠️ 이모지는 Jua 에 글리프가 없어 두부가 된다. 글자만 쓴다.
 */
const THANKS: Record<0 | 1 | 2 | 3, { readonly text: string; readonly bg: string }> = {
  3: { text: '최고예요!', bg: '#c8901a' },
  2: { text: '감사합니다!', bg: '#1d7a33' },
  1: { text: '잘 먹을게요', bg: '#4c6b4f' },
  0: { text: '아쉽네요…', bg: '#a3302a' },
};
/** 말풍선이 떠 있는 시간 — 손님이 갈리기 전에 읽히고 사라져야 한다. */
const THANKS_MS = { in: 180, hold: 620, out: 260, rise: 34 } as const;

/**
 * 모두에게 한 번 더 곱하는 키 — **머리가 더 위로 올라오게** 키운다.
 * 발밑이 축이라 키우면 그만큼 머리가 올라간다(바닥은 그대로).
 * ⚠️ **이 한 숫자가 사람 키 손잡이다.** 지금은 1.0 — 저작 높이 그대로다.
 * 키우면 머리가 화면 위로 올라가다 잘리므로, 올릴 거면 에디터에서 사람 자리도 함께 봐야 한다.
 */
const BASE_SCALE = 1.0;

interface Spot {
  readonly obj: Phaser.GameObjects.Image;
  /** 발밑 — 사람이 갈려도 여기를 딛고 선다. */
  readonly footX: number;
  readonly footY: number;
  /** 지금 서 있는 사람(`FACES` 번호). 저작 그림 그대로면 null. */
  face: number | null;
  /** 세우기로 한 사람 — 그림이 도착하는 즉시 갈아 세운다. */
  want: number | null;
  /**
   * 흔들림·숨쉬기 트윈. ⚠️ **참조로 붙잡아 두고 이것만 끊는다** —
   * `killTweensOf(obj)` 로 쓸어 버리면 교체 중인 **알파 트윈까지 죽어** 그 사람이 반쯤 사라진 채 남는다
   * (옆 손님이 같이 사라진 것처럼 보인 사고).
   */
  sway: Phaser.Tweens.Tween[];
  /** 교체 중인 알파 트윈 — 새 교체가 들어오면 이것만 끊는다. */
  fade?: Phaser.Tweens.Tween;
  /** 머리 위 인사 말풍선. */
  bubble?: Phaser.GameObjects.Text;
}

export class Customers {
  private readonly spots: Spot[] = [];
  /**
   * **모두가 같은 키로 선다.** 저작된 두 자리는 높이가 서로 다른데(1072 · 1044) 그대로 쓰면
   * 같은 사람이 왼쪽에 설 때와 오른쪽에 설 때 크기가 달라진다 — 사람이 아니라 자리가 사람을 정하는 셈이다.
   * 그래서 저작값 중 **큰 쪽 하나**를 모두에게 쓴다(갈래별 배율은 그 위에 곱한다).
   */
  private readonly baseHeight: number;
  /** 아직 안 쓴 사람들 — 다 쓰면 다시 채운다. 같은 사람이 금방 다시 나오지 않게 한다. */
  private bag: number[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    layout: LayoutIndex,
    private readonly rand: () => number = Math.random,
  ) {
    const heights: number[] = [];
    [NODE.customer1, NODE.customer2].forEach((id, slot) => {
      const obj = image(layout, id);
      const rect = designRect(layout, id);
      if (!obj || !rect) return;
      // 발밑을 축으로 세운다 — 흔들림도 교체도 이 점을 기준으로 한다.
      const footY = rect.cy + rect.h / 2;
      obj.setOrigin(0.5, 1).setPosition(rect.cx, footY);
      const spot: Spot = { obj, footX: rect.cx, footY, face: null, want: null, sway: [] };
      // 인사 말풍선 — **주문표보다 위**여야 한다. 머리 위가 카드와 겹치는 자리다.
      spot.bubble = scene.add
        .text(0, 0, '', {
          fontFamily: GAME_FONT_FAMILY,
          fontStyle: GAME_FONT_STYLE,
          fontSize: '40px',
          color: '#ffffff',
          padding: { x: 20, y: 8 },
          align: 'center',
        })
        .setOrigin(0.5)
        .setDepth(CARD_DEPTH_BASE + 60)
        .setVisible(false);
      this.spots.push(spot);
      heights.push(rect.h);
      this.startSway(spot, slot);
    });
    this.baseHeight = (heights.length > 0 ? Math.max(...heights) : 1000) * BASE_SCALE;
  }

  /**
   * 화면에 걸린 카드에 맞춰 사람을 세운다.
   *
   * ⚠️⚠️ **한 명이 주문을 받아 갔다고 둘 다 갈지 않는다.**
   * `replaced` 는 **새 카드가 걸린 자리** — 그 자리만 새 사람으로 갈린다.
   * 그 밖에도 **지금 서 있는 사람이 카드의 경로와 안 맞으면**(손님이 서 있는데 전화주문이 걸렸다면)
   * 갈아 세운다. 처음 한 번은 두 자리 다 여기서 채워진다.
   */
  setCards(cards: readonly Order[], replaced?: readonly number[]): void {
    this.spots.forEach((spot, slot) => {
      // ⚠️ 카드가 아직 없는 자리에도 **사람은 세워 둔다**(그냥 손님으로). 비워 뒀다가 나중에 카드가 걸리면
      //    그때 처음 사람을 세우게 되는데, 하필 그 순간이 옆자리가 갈리는 순간이라
      //    **둘이 동시에 바뀌어** 보인다. 한 명이 주문을 받아 갔을 뿐인데 가게 사람이 통째로 갈린 것처럼.
      const kind = cards[slot] ? KIND_OF[cards[slot]!.channel] : 'guest';
      const standing = spot.face !== null ? FACES[spot.face]?.kind : undefined;
      const mustChange = replaced ? replaced.includes(slot) : standing === undefined;
      if (!mustChange && standing === kind) return;
      this.request(spot, slot, kind);
    });
  }

  /**
   * 그 자리 사람의 **머리 위**. 「그냥 갔어요」 같은 말은 조리대가 아니라 **그 사람 옆에서** 떠야
   * 누구 이야기인지 바로 읽힌다 — 조리대에 띄우면 지금 만들던 김밥이 잘못된 줄 안다.
   */
  headSpot(slot: number): { readonly x: number; readonly y: number } | null {
    const spot = this.spots[slot];
    if (!spot) return null;
    return { x: spot.footX, y: spot.footY - this.baseHeight * 1.04 };
  }

  /**
   * **받아 가며 인사한다** — 그 자리 손님 머리 위에 한 마디 띄운다. `stars` 0 은 실패다.
   * ⚠️ 손님이 갈리기 전에 떠야 한다. 새 사람이 선 뒤에 뜨면 **엉뚱한 사람이 인사하는** 꼴이 된다 —
   *    그래서 `nextOrder` 보다 앞선 서빙 순간(`playServe`)에서 부른다.
   */
  thank(slot: number, stars: number): void {
    const spot = this.spots[slot];
    const head = this.headSpot(slot);
    const bubble = spot?.bubble;
    if (!spot || !head || !bubble) return;
    const grade = Math.min(3, Math.max(0, Math.round(stars))) as 0 | 1 | 2 | 3;
    const spec = THANKS[grade];
    this.scene.tweens.killTweensOf(bubble);
    bubble
      .setText(spec.text)
      .setBackgroundColor(spec.bg)
      .setPosition(head.x, head.y)
      .setVisible(true)
      .setAlpha(0)
      .setScale(0.6);
    this.scene.tweens.add({
      targets: bubble,
      alpha: 1,
      scale: 1,
      duration: THANKS_MS.in,
      ease: 'Back.easeOut',
    });
    // 떠오르며 사라진다 — 손님이 물러나는 것과 같은 방향이라 한 동작으로 읽힌다.
    this.scene.tweens.add({
      targets: bubble,
      y: head.y - THANKS_MS.rise,
      alpha: 0,
      duration: THANKS_MS.out,
      delay: THANKS_MS.in + THANKS_MS.hold,
      onComplete: () => bubble.setVisible(false),
    });
  }

  /** 그 갈래에서 한 사람을 뽑아 세울 준비를 한다(그림이 없으면 받아 두고 도착하면 세운다). */
  private request(spot: Spot, slot: number, kind: Kind): void {
    const face = this.draw(kind);
    if (face === null) return;
    const entry = FACES[face];
    if (!entry) return;
    spot.want = face;
    if (this.scene.textures.exists(entry.key)) {
      this.swap(spot, slot);
      return;
    }
    // 못 받은 그림을 붙들고 있으면 그 자리는 영영 안 바뀐다 — 실패하면 놓아준다.
    this.scene.load.once('loaderror', (file: { key?: string }) => {
      if (file?.key === entry.key && spot.want === face) spot.want = null;
    });
    this.scene.load.once(`filecomplete-image-${entry.key}`, () => {
      if (spot.want === face) this.swap(spot, slot);
    });
    this.scene.load.image(entry.key, entry.path);
    if (!this.scene.load.isLoading()) this.scene.load.start();
  }

  /**
   * 그 갈래에서 한 사람. 양옆에 지금 서 있거나 세우려는 사람은 빼고 뽑는다 —
   * 같은 사람이 둘이면 쌍둥이가 된다.
   */
  private draw(kind: Kind): number | null {
    const used = new Set<number>();
    for (const s of this.spots) {
      if (s.face !== null) used.add(s.face);
      if (s.want !== null) used.add(s.want);
    }
    const fits = (f: number): boolean => FACES[f]?.kind === kind && !used.has(f);
    if (!this.bag.some(fits)) this.bag = FACES.map((_, i) => i);
    const pool = this.bag.filter(fits);
    const picked = pool[Math.floor(this.rand() * pool.length)];
    if (picked === undefined) return null;
    this.bag = this.bag.filter((f) => f !== picked);
    return picked;
  }

  /** 준비된 사람으로 갈아 세운다 — 스윽 사라졌다 나타난다. */
  private swap(spot: Spot, slot: number): void {
    const face = spot.want;
    if (face === null) return;
    const key = FACES[face]?.key;
    if (!key || !this.scene.textures.exists(key)) return;
    spot.want = null;

    const put = (): void => {
      spot.face = face;
      spot.obj.setTexture(key);
      this.fit(spot);
      this.startSway(spot, slot); // 기준 배율이 바뀌었으니 흔들림·숨쉬기를 다시 건다
      spot.obj.setAlpha(0);
      spot.fade = this.scene.tweens.add({
        targets: spot.obj,
        alpha: 1,
        duration: SWAP.in,
        ease: 'Quad.easeOut',
        onComplete: () => spot.obj.setAlpha(1),
      });
    };

    // 교체가 겹치면 앞의 것만 끊는다 — 끊긴 페이드가 중간 알파로 굳으면 그 사람이 반쯤 사라진다.
    spot.fade?.stop();
    spot.fade = this.scene.tweens.add({
      targets: spot.obj,
      alpha: 0,
      duration: SWAP.out,
      ease: 'Quad.easeIn',
      onComplete: put,
    });
  }

  /**
   * 발밑을 축으로 아주 조금 흔들리고, 세로로 0.6% 만 눌렸다 편다.
   * ⚠️ **사람을 갈 때마다 다시 건다.** 사람마다 기준 배율이 달라서(`fit`), 처음 배율로 잡아 둔 트윈을
   * 그대로 두면 새 사람이 엉뚱한 크기로 늘어난다.
   */
  private startSway(spot: Spot, slot: number): void {
    // ⚠️ **이 두 개만 끊는다.** `killTweensOf(obj)` 로 쓸어 버리면 교체 중인 알파 트윈까지 죽어
    //    그 사람이 반쯤 사라진 채 남는다(옆 손님이 같이 사라진 것처럼 보인 사고).
    for (const t of spot.sway) t.stop();
    spot.sway = [
      this.scene.tweens.add({
        targets: spot.obj,
        angle: { from: -SWAY.angle, to: SWAY.angle },
        duration: SWAY.angleMs + slot * SWAY.stagger,
        delay: slot * SWAY.stagger,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      }),
      this.scene.tweens.add({
        targets: spot.obj,
        scaleY: spot.obj.scaleY * SWAY.breath,
        duration: SWAY.breathMs + slot * SWAY.stagger,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      }),
    ];
  }

  /**
   * 키를 맞추되 **폭은 비율 그대로**, 발밑은 그대로.
   * ⚠️ **배달원도 손님과 같은 키다.** 갈래로 크기를 가르지 않는다.
   * 다만 **여성 그림만 90%** 로 세운다(`FEMALE_SCALE`) — 원본이 남성보다 작게 그려져 있어
   * 같은 높이로 늘리면 그만큼 확대되어 혼자 커 보인다.
   */
  private fit(spot: Spot): void {
    const { obj, footX, footY } = spot;
    if (obj.height <= 0) return;
    const shrink = spot.face !== null ? (FACES[spot.face]?.scale ?? 1) : 1;
    obj.setScale((this.baseHeight * shrink) / obj.height).setPosition(footX, footY);
  }
}
