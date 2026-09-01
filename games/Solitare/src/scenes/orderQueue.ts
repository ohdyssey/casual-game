import { texSize } from '../assets.js';
/**
 * orderQueue.ts — **주문서 시스템**의 손님 대기열 연출 (PO 2026-07-17, 개념 v2 §14).
 *
 * 상단 점포 카운터에 손님이 **줄을 서고**, 맨 앞 손님이 주문(기본 5개)을 건다:
 *   · 콤보 매치 1개 = 주문 1개 제조(말풍선 카운터 채움 + 아이템 팝).
 *   · 주문 완성(5) = 만점 — 별 5개가 게이지로 날아가고 만족 이모지 후 퇴장(더 큰 보상).
 *   · 콤보 끊김(1~4) = **부분 판매** — 맞춘 수만큼 별을 지불하고 떠난다(실패 아님·불만 없음).
 *   · 0개 상태에서 뽑기만 계속되면 손님은 **대기**(떠나지 않음) — PO 확정 규칙.
 *   · 퇴장은 왼쪽, 대기열은 오른쪽에서 컨베이어처럼 당겨진다(무한 공급).
 *
 * 손님 시트·말풍선·아이템 텍스처는 customers.ts 가 preload/등록한 것을 그대로 사용한다.
 * 별 적립 **수치**는 PlayScene 의 기존 게이지(starGauge/MATCH_PARTIAL/STAR_GAUGE)가 담당 —
 * 이 모듈은 순수 **연출 레이어**다(경제 로직 없음).
 */
import Phaser from 'phaser';
import { sfx } from '../audio.js';
import { orderItemCountForFloor, orderItemKeyForFloor } from './customers.js';

// customers.ts 와 동일한 시트/프레임 규약(앞·옆좌·뒤·옆우).
const KEYS = Array.from({ length: 10 }, (_, i) => `cust_${String(i + 1).padStart(2, '0')}`);
const FRONT = 0;
const SIDE_LEFT = 1;
const BACK = 2;
const SIDE_RIGHT = 3; // 오른쪽을 바라보는 옆모습(오른쪽으로 이동할 때).
// **주문 말풍선은 UI_11 하나만 사용**(PO 2026-07-17) — 성별 구분(UI_11/UI_12) 폐지.
const BUBBLE = 'ord_bubble_m'; // = up_Solitare_UI_11.
const BUBBLE_TAIL = 0.5; // UI_11 꼬리 x 비율(폭 대비) — customers.ts 실측값.
const STAR_KEY = 'up_Solitare_UI_02_v2'; // 별(게이지 별과 동일 아트).

export interface OrderQueueOpts {
  /** 카운터(맨 앞 손님) 발밑 기준. */
  readonly counterX: number;
  readonly groundY: number;
  readonly height: number;
  readonly depth: number;
  /** 주문 아이템 세트 — 점포 아트와 일치시킬 것(현 플레이 점포 = 베이커리 = 2층 세트). */
  readonly itemFloor: number;
  readonly itemStage?: number;
  /** 주문 크기(기본 5 = SET_SIZE). */
  readonly orderSize?: number;
  /** 별이 날아갈 목표(왼쪽 별점 게이지 중심). */
  readonly starTarget: { x: number; y: number };
  /**
   * **별 지불 콜백**(PO 2026-07-17) — 손님 정산 시 지불 별 수 + 시작 위치(손님 머리)를 넘긴다.
   *   PlayScene 이 이 별들을 게이지로 날려 **점등된 채 축적**한다(사라지지 않음). 미지정 시 큐가 자체 연출.
   */
  readonly onStarsPaid?: (count: number, src: { x: number; y: number }) => void;
  /**
   * **별 수집 콜백**(PO 2026-07-17) — 정산 시 손님이 쌓은 **정확한 별 개수**(count)와 시작 위치(말풍선)를 넘긴다.
   *   PlayScene 이 count 개의 개별 별을 게이지 끝으로 **순차 흡입**(커지며)하고 게이지를 동시에 변화시킨다.
   */
  readonly onCollectStars?: (count: number, src: { x: number; y: number }) => void;
}

interface Customer {
  readonly img: Phaser.GameObjects.Image;
  bubble?: Phaser.GameObjects.GameObject[];
  starSlots?: { x: number; y: number }[]; // ≤5 별 좌표(가운데→좌우 교대). 바탕은 안 그림.
  starAnchor?: { cx: number; y: number }; // 별 배치 중심(말풍선 상단) — >5 탤리 렌더 기준.
  stars?: Phaser.GameObjects.Image[]; // 획득한 별만(매치 시 생성).
  itemImg?: Phaser.GameObjects.Image;
}

/** N개 슬롯을 **가운데부터 좌우로** 채우는 순서(가운데 먼저 → 안쪽→바깥쪽 교대). */
function centerOutOrder(n: number): number[] {
  const c = (n - 1) / 2;
  return Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(a - c) - Math.abs(b - c) || a - b);
}

/** 중앙→바깥 위치 순서(동거리는 오른쪽 먼저 → 큰별이 중앙/우중앙에 오도록). 손님 별 탤리용. */
function symmetricOrder(g: number): number[] {
  const c = (g - 1) / 2;
  return Array.from({ length: g }, (_, i) => i).sort((a, b) => {
    const da = Math.abs(a - c);
    const db = Math.abs(b - c);
    return da !== db ? da - db : b - a;
  });
}

// **손님 별 탤리(무제한 누적, PO 2026-07-17)** — 5 초과 시 큰별(=5개분)을 중앙, 작은별(=1)을 좌우 대칭.
const TALLY_UNIT = 5; // 큰별 1개 = 5개분.
const STAR_SMALL = 34; // 작은별(=1) 크기(기존 별 크기 유지).
const STAR_BIG = 46; // 큰별(=5) 크기.
const TALLY_PITCH = 34; // 탤리 별 간 기본 간격.
const TALLY_MAX_SPAN = 168; // 말풍선 상단 최대 폭(초과 시 간격·크기 축소).

const QUEUE_GAP = 118; // 대기열 간격(px).
const QUEUE_SIZE = 2; // 카운터 뒤 대기 인원(항상 유지 — 무한 공급).

export class OrderQueue {
  private readonly scene: Phaser.Scene;
  private readonly o: Required<Pick<OrderQueueOpts, 'itemStage' | 'orderSize'>> & OrderQueueOpts;
  private current?: Customer;
  private waiting: Customer[] = [];
  private itemV = 1; // 주문 아이템 변형 순환.
  private destroyed = false;

  constructor(scene: Phaser.Scene, opts: OrderQueueOpts) {
    this.scene = scene;
    this.o = { itemStage: 1, orderSize: 5, ...opts };
    // 초기 라인업: 카운터 1명 + 대기 2명(즉시 배치, 살짝 스태거 등장).
    this.current = this.spawn(this.counterX(), BACK, 0);
    if (this.current) this.attachOrderBubble(this.current);
    for (let i = 0; i < QUEUE_SIZE; i++) {
      const c = this.spawn(this.queueX(i), SIDE_LEFT, 120 + i * 120);
      if (c) this.waiting.push(c);
    }
  }

  // ── 좌표 ──────────────────────────────────────────────
  private counterX(): number {
    return this.o.counterX;
  }
  private queueX(i: number): number {
    return this.o.counterX + QUEUE_GAP * (i + 1) + 26;
  }
  private entryX(): number {
    return this.o.counterX + QUEUE_GAP * (QUEUE_SIZE + 1) + 80;
  }
  private headY(c: Customer): number {
    return c.img.y - c.img.displayHeight;
  }

  // ── 손님 생성/제거 ─────────────────────────────────────
  private spawn(x: number, frame: number, fadeDelay: number): Customer | undefined {
    const keys = KEYS.filter((k) => this.scene.textures.exists(k));
    if (!keys.length) return undefined;
    const idx = Phaser.Math.Between(0, keys.length - 1);
    const key = keys[idx];
    const img = this.scene.add.image(x, this.o.groundY, key, frame).setOrigin(0.5, 1).setDepth(this.o.depth);
    const src = this.scene.textures.get(key).get(frame);
    img.setDisplaySize(this.o.height * (src.width / src.height), this.o.height);
    img.setAlpha(0);
    this.scene.tweens.add({ targets: img, alpha: 1, duration: 240, delay: fadeDelay, ease: 'Sine.easeOut' });
    // 발밑 유동(숨쉬기) — 홈 손님과 동일한 미세 생기.
    this.scene.tweens.add({ targets: img, scaleY: img.scaleY * 1.015, duration: 1400 + Math.random() * 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return { img };
  }

  private killCustomer(c: Customer): void {
    this.clearBubble(c);
    this.scene.tweens.killTweensOf(c.img);
    c.img.destroy();
  }

  // ── 주문 말풍선(아이템 + **상단 별 슬롯**) ────────────────
  private attachOrderBubble(c: Customer): void {
    this.clearBubble(c);
    if (!this.scene.textures.exists(BUBBLE)) return; // UI_11 하나만 사용.
    const bw = 190;
    const bubble = this.scene.add.image(0, 0, BUBBLE);
    bubble.setDisplaySize(bw, bubble.height * (bw / bubble.width));
    const bh = bubble.displayHeight;
    // 꼬리를 머리에 맞춤(UI_11 꼬리 x=0.5).
    const bx = c.img.x + (0.5 - BUBBLE_TAIL) * bw;
    const by = this.headY(c) - bh / 2 + 6;
    bubble.setPosition(bx, by).setDepth(this.o.depth + 0.05);
    // **점포 테마 주문 아이템**(베이커리 등 — 점포 아트와 일치).
    const objs: Phaser.GameObjects.GameObject[] = [bubble];
    // **상품 층(1..20) 기준** — 2번 부지(11~20층)와 변형 수가 4 미만인 층(4층·10층)도 존재하는 키만 가리킨다.
    //   (예전엔 `item_${stage}_${itemFloor}_${1..4}` 로 만들어 2번 부지에서 첫 손님부터 빈 말풍선이 떴다.)
    const ik = orderItemKeyForFloor(this.o.itemFloor, this.itemV);
    this.itemV = (this.itemV % orderItemCountForFloor(this.o.itemFloor)) + 1; // 다음 손님은 다른 상품(변형 수 안에서 순환).
    if (this.scene.textures.exists(ik)) {
      // 말풍선(UI_11)은 아래쪽에 꼬리가 있어 이미지 전체의 세로 중심(by)이 실제 "몸통" 중심보다 낮다 —
      //   아이템을 by 그대로 놓으면 처져 보인다(2026-07-18 QA). 살짝 위로 보정.
      const item = this.scene.add.image(bx, by - 8, ik).setDepth(this.o.depth + 0.06);
      const s = texSize(this.scene.textures.get(ik));
      const iw = 78;
      item.setDisplaySize(iw, iw * (s.height / s.width)).setAlpha(0.55); // 미제조 = 반투명(실루엣 느낌).
      c.itemImg = item;
      objs.push(item);
    }
    // **별 슬롯 좌표만 계산**(바탕 별은 그리지 않음 — PO 2026-07-17). 채우는 순서 = 가운데→좌우 교대.
    const n = this.o.orderSize;
    const sz = 34;
    const span = Math.min(bw - 24, n * (sz - 6)); // 상단 폭 안에 들어오게.
    const topY = by - bh / 2; // 말풍선 위 테두리에 걸침.
    const order = centerOutOrder(n);
    // slotX[k] = k번째로 채워질 별의 x(가운데부터 좌우로).
    c.starSlots = order.map((slotIdx) => ({
      x: bx - span / 2 + (span / Math.max(1, n - 1)) * (n === 1 ? 0.5 : slotIdx),
      y: topY,
    }));
    c.starAnchor = { cx: bx, y: topY }; // >5 탤리 렌더 중심(말풍선 상단).
    c.stars = [];
    // 등장 팝(말풍선·아이템만 — 별은 항상 제자리에 얹혀 있게).
    [bubble, c.itemImg].forEach((g) => {
      if (!g) return;
      const sx = g.scaleX;
      const sy = g.scaleY;
      g.setScale(0);
      this.scene.tweens.add({ targets: g, scaleX: sx, scaleY: sy, duration: 220, ease: 'Back.easeOut' });
    });
    c.bubble = objs;
  }

  private clearBubble(c: Customer): void {
    c.bubble?.forEach((g) => {
      this.scene.tweens.killTweensOf(g);
      g.destroy();
    });
    c.stars?.forEach((st) => {
      this.scene.tweens.killTweensOf(st);
      st.destroy();
    });
    c.bubble = undefined;
    c.stars = undefined;
    c.starSlots = undefined;
    c.starAnchor = undefined;
    c.itemImg = undefined;
  }

  // ── PlayScene 훅 ───────────────────────────────────────
  /**
   * 콤보 매치 — 현재 손님 주문 별 **무제한 누적**(filled = 누적 매치 수, PO 2026-07-17).
   *   ≤5: 슬롯에 별 하나씩 추가(가운데→좌우). >5: **큰별(=5)+작은별 탤리**로 재렌더(손님은 나가지 않고 계속 쌓임).
   */
  onMatch(filled: number): void {
    if (this.destroyed || !this.current) return;
    const c = this.current;
    if (this.scene.textures.exists(STAR_KEY)) {
      if (filled <= this.o.orderSize) {
        // ≤5 — 방금 채운 순번 슬롯에 금색 별 하나 팝(기존 연출 유지).
        const slot = c.starSlots?.[filled - 1];
        if (slot && c.stars && c.stars.length < filled) {
          const st = this.scene.add.image(slot.x, slot.y, STAR_KEY).setDisplaySize(STAR_SMALL, STAR_SMALL).setDepth(this.o.depth + 0.08);
          c.stars.push(st);
          st.setScale(0);
          this.scene.tweens.add({ targets: st, displayWidth: STAR_SMALL, displayHeight: STAR_SMALL, duration: 200, ease: 'Back.easeOut' });
        }
      } else {
        // >5 — 큰별/작은별 탤리로 전량 재렌더(중앙 큰별·좌우 작은별).
        this.renderBubbleTally(c, filled);
      }
    }
    const item = c.itemImg;
    if (item) {
      item.setAlpha(Math.min(1, 0.55 + 0.45 * (filled / this.o.orderSize))); // 채울수록 선명(5에서 만충).
      this.scene.tweens.add({ targets: item, scaleX: item.scaleX * 1.22, scaleY: item.scaleY * 1.22, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
    }
  }

  /**
   * **손님 별 탤리 렌더**(>5) — N을 큰별(=5개분)·작은별(=1)로 표시. 중앙에 큰별, 좌우 대칭으로 작은별.
   *   6=[작은·큰], 7=[작은·큰·작은], 10=[큰·큰], 13=[작·작·큰·큰·작]. 매 매치마다 전량 재구성(도착 강조 펄스).
   */
  private renderBubbleTally(c: Customer, N: number): void {
    if (!c.starAnchor) return;
    c.stars?.forEach((st) => {
      this.scene.tweens.killTweensOf(st);
      st.destroy();
    });
    c.stars = [];
    const { cx, y } = c.starAnchor;
    const big = Math.floor(N / TALLY_UNIT);
    const small = N % TALLY_UNIT;
    const sizes: number[] = [];
    for (let i = 0; i < big; i++) sizes.push(STAR_BIG);
    for (let i = 0; i < small; i++) sizes.push(STAR_SMALL);
    const g = sizes.length;
    if (g === 0) return;
    const placed = symmetricOrder(g)
      .map((pos, k) => ({ pos, sz: sizes[k] }))
      .sort((a, b) => a.pos - b.pos);
    const pitch = Math.min(TALLY_PITCH, TALLY_MAX_SPAN / g); // 폭 초과 시 간격 축소.
    const shrink = Math.min(1, pitch / TALLY_PITCH); // 간격 좁으면 별 크기도 비례 축소(겹침 완화).
    const startX = cx - ((g - 1) * pitch) / 2;
    placed.forEach((p, i) => {
      const st = this.scene.add.image(startX + i * pitch, y, STAR_KEY).setDisplaySize(p.sz * shrink, p.sz * shrink).setDepth(this.o.depth + 0.08);
      c.stars!.push(st);
    });
    const last = c.stars[c.stars.length - 1];
    if (last) {
      const w = last.displayWidth;
      const h = last.displayHeight;
      this.scene.tweens.add({ targets: last, displayWidth: w * 1.3, displayHeight: h * 1.3, yoyo: true, duration: 150, ease: 'Back.easeOut' });
    }
  }

  /**
   * 콤보 끊김/보드클리어 = **손님 정산** — 누적한 별 **전부(무제한)**를 지불하고 떠난다(부분 판매 — 불만 없음).
   *   손님은 5개를 넘겨도 그때까지 나가지 않고 계속 누적했으므로, 여기서 filled(=누적 별) 전량을 회수한다.
   *   filled=0 이면 **대기**(호출부가 걸러도 안전하게 no-op). complete=만점 환호 연출(≥orderSize).
   */
  onBreak(filled: number): void {
    if (this.destroyed || !this.current || filled <= 0) return;
    this.settle(this.current, filled, filled >= this.o.orderSize);
  }

  /** 콤보 되돌림(undo 등) — 손님은 유지, 획득한 별 제거(주문 진행 0으로) + 아이템 흐리게. */
  onRunReset(): void {
    if (this.destroyed || !this.current) return;
    this.current.stars?.forEach((st) => {
      this.scene.tweens.killTweensOf(st);
      st.destroy();
    });
    this.current.stars = [];
    this.current.itemImg?.setAlpha(0.55);
  }

  // ── 정산·퇴장·대기열 전진 ──────────────────────────────
  private settle(c: Customer, stars: number, complete: boolean): void {
    this.current = undefined; // 즉시 교대 시작(정산 연출과 병행).
    const headX = c.img.x;
    const headYv = this.headY(c) + 20;
    // **별 수집 연출**(PO 2026-07-17) — 손님이 쌓은 **정확한 별 개수**(stars=매치 수)를 게이지로 회수한다.
    //   말풍선 탤리(큰별=5 표시)는 지우고, PlayScene 이 개수만큼 개별 별을 게이지 끝으로 순차 흡입한다.
    const anchor = c.starAnchor ? { x: c.starAnchor.cx, y: c.starAnchor.y } : { x: headX, y: this.headY(c) };
    const count = Math.max(0, Math.floor(stars));
    this.clearBubble(c); // 말풍선·아이템·탤리 별 제거(수집 별은 PlayScene 이 새로 생성).
    if (count > 0) this.o.onCollectStars?.(count, anchor);
    if (stars > 0) {
      this.o.onStarsPaid?.(stars, { x: headX, y: headYv });
      sfx(complete ? 'gauge_full' : 'set_complete', { volume: complete ? 0.5 : 0.3 });
    }
    // 완성이면 점프 환호, 부분이면 가볍게 — **왔던 방향(오른쪽)으로 퇴장**하되,
    //   **대기열보다 아래(뒤) 레이어**로 내려 줄 선 손님들 뒤로 지나간다(PO 2026-07-17).
    c.img.setFrame(complete ? FRONT : SIDE_RIGHT);
    const exitDelay = complete ? 420 : 160;
    if (complete) this.scene.tweens.add({ targets: c.img, y: c.img.y - 26, duration: 170, yoyo: true, ease: 'Quad.easeOut' });
    this.scene.time.delayedCall(exitDelay, () => {
      if (this.destroyed) return;
      c.img.setFrame(SIDE_RIGHT);
      c.img.setDepth(this.o.depth - 0.1); // 대기열(depth) 뒤로.
      this.scene.tweens.add({
        targets: c.img,
        x: this.queueX(QUEUE_SIZE - 1) + 70, // **가게 프레임 안쪽에서 소멸**(PO) — 문밖까지 가지 않는다.
        alpha: 0,
        duration: 1300, // 천천히(PO: 이동 속도 감속).
        ease: 'Sine.easeInOut',
        onComplete: () => this.killCustomer(c),
      });
    });
    this.advance();
  }

  /** 대기열 전진 — 첫 대기자가 카운터로, 나머지 한 칸씩, 맨 뒤에 새 손님 입장. */
  private advance(): void {
    const next = this.waiting.shift();
    if (next) {
      // **즉시 current 지정 + 카운터 위치에 주문 말풍선 부착**(PO 2026-07-17: 콤보 바로 반영) —
      //   손님 이미지는 카운터로 걸어오지만, 주문(별)은 도착을 기다리지 않고 바로 채워진다.
      const fromX = next.img.x;
      next.img.x = this.counterX(); // 논리 위치=카운터(말풍선/별 슬롯이 카운터 기준으로 배치).
      next.img.setFrame(BACK);
      this.current = next;
      this.attachOrderBubble(next);
      this.scene.tweens.add({
        targets: next.img,
        x: { from: fromX, to: this.counterX() }, // 시각적 걷기(빠르게 따라붙음).
        duration: 520,
        ease: 'Sine.easeInOut',
      });
    }
    // 나머지 대기자 한 칸 전진.
    this.waiting.forEach((c, i) => {
      this.scene.tweens.add({ targets: c.img, x: this.queueX(i), duration: 860, delay: 120, ease: 'Sine.easeInOut' });
    });
    // 맨 뒤 보충 — 오른쪽(가게 안쪽 끝)에서 걸어 들어온다(무한 공급).
    const newcomer = this.spawn(this.entryX(), SIDE_LEFT, 0);
    if (newcomer) {
      this.waiting.push(newcomer);
      this.scene.tweens.add({ targets: newcomer.img, x: this.queueX(this.waiting.length - 1), duration: 980, delay: 200, ease: 'Sine.easeInOut' });
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.current) this.killCustomer(this.current);
    this.waiting.forEach((c) => this.killCustomer(c));
    this.waiting = [];
    this.current = undefined;
  }
}
