/**
 * 덱 UI — NEXT 충전 큐 방식.
 *   · NEXT 카드(좌하단) = 지금 배치 가능한 유일한 캐릭터. **항상 선택 상태** —
 *     별도 선택 없이 레인을 탭하면 즉시 배치된다.
 *   · 충전 대기는 오직 **회전 시계**로 표현(카드 딤/노란 배경 노출 없음) —
 *     배치하면 시계가 돌기 시작, 한 바퀴 돌면 다음 캐릭터 활성.
 *   · 배치 연출: 카드가 해당 레인 출발점으로 날아가며 캐릭터가 나타난다.
 *   · 좌측 카드열 4장 = 등장 순서 프리뷰(맨 아래=다음 순번). 드래그로 순서 변경(NEXT 불가침).
 *   TODO(하네스 hints 기반 — 에디터에서 「버튼」 역할 저작 시 그쪽이 우선.)
 */
import Phaser from 'phaser';
import { NODES } from '../../.pue-harness/generated/screens.js';
import { currentNext, isNextReady, queuePreview, TURN_MS } from '../logic/battle.js';
import { UNIT_SPECS } from '../logic/roster.js';
import { type BattleState, type UnitKind } from '../logic/types.js';
import type { LayoutIndex } from './layoutLoader.js';
import { buildLanePaths, laneFromPoint, START_POINT_IDS, type LanePath } from './laneAnchors.js';
import { sfx } from '../audio.js';

const M = NODES.MAIN;

/** 프리뷰 카드 노드 — 위→아래(레이아웃 세로 순). 맨 아래(index 3)가 가장 임박한 순번. */
const CARD_IDS = [M.LAYER_3_COPY11, M.LAYER_3_COPY12, M.LAYER_3_COPY13, M.LAYER_3_COPY14];
/** 프리뷰 카드 캡션 텍스트 노드 — 카드와 같은 세로 순. */
const CARD_LABEL_IDS = [M.LAYER_2_COPY6, M.LAYER_2_COPY11, M.LAYER_2_COPY12, M.LAYER_2_COPY13];

/**
 * 직업 → 카드 텍스처 — 이미지 순서 규약(2026-07-24 확정):
 *   1P · 2T · 3Brawler · 4Sprinter · 5Healer · 6C (캐릭터 me_0N 과 동일 순서).
 */
const CARD_TEX: Readonly<Record<UnitKind, string>> = {
  pusher: 'up_SC_UI_015-01',
  tank: 'up_SC_UI_015-02',
  brawler: 'up_SC_UI_015-03',
  sprinter: 'up_SC_UI_015-04',
  healer: 'up_SC_UI_015-05',
  crusher: 'up_SC_UI_015-06',
};

/** 카드 캡션(영문 직업명). */
const CARD_LABEL: Readonly<Record<UnitKind, string>> = {
  pusher: 'Pusher',
  tank: 'Tank',
  sprinter: 'Sprinter',
  healer: 'Healer',
  brawler: 'Brawler',
  crusher: 'Crusher',
};

/** NEXT 충전 시계 — 카드 중앙 다이얼 반지름(px, 카드 폭보다 약간 작게). */
const CLOCK_RADIUS = 44;
/** 시계/비행 연출 깊이 — 필드·UI 위, 결과 오버레이(100) 아래. */
const CLOCK_DEPTH = 80;

export class Deck {
  private readonly cards: (Phaser.GameObjects.Image | undefined)[] = [];
  private readonly cardLabels: (Phaser.GameObjects.Text | undefined)[] = [];
  private readonly costTexts: (Phaser.GameObjects.Text | undefined)[] = [];
  private readonly starts: (Phaser.GameObjects.Image | undefined)[] = [];
  private readonly nextCard: Phaser.GameObjects.Image | undefined;
  private readonly nextLabel: Phaser.GameObjects.Text | undefined;
  private readonly nextCostText: Phaser.GameObjects.Text | undefined;
  /** 충전 시계 — 지연 생성(생성 시점 이슈 우회) + 높은 깊이로 항상 최상단 렌더. */
  private clock: Phaser.GameObjects.Graphics | null = null;
  private readonly clockCx: number = 0;
  private readonly clockCy: number = 0;
  private readonly lanePaths: LanePath[];
  private pulseTween: Phaser.Tweens.Tween | null = null;
  private lastState: BattleState | null = null;
  private lastQueueKey = '';
  private wasReady = true;
  /** 카드 슬롯 원위치(드래그 스냅백용) — 표시 순(위→아래). */
  private readonly slotPos: { x: number; y: number; depth: number }[] = [];

  /**
   * onPlace(lane) 가 true 를 반환하면 배치 성공.
   * onReorder(from, to) — 큐 인덱스(1..4) 간 순서 변경(성공 시 true).
   */
  constructor(
    private readonly scene: Phaser.Scene,
    layout: LayoutIndex,
    private readonly onPlace: (lane: number) => boolean,
    private readonly onReorder: (from: number, to: number) => boolean,
  ) {
    // 프리뷰 카드열 — 드래그로 순서 변경 가능(NEXT 는 불가침). 코스트 텍스트는 코드 생성.
    CARD_IDS.forEach((id, i) => {
      const card = layout.tryById<Phaser.GameObjects.Image>(id);
      this.cards.push(card);
      this.cardLabels.push(layout.tryById<Phaser.GameObjects.Text>(CARD_LABEL_IDS[i]));
      if (!card) {
        this.costTexts.push(undefined);
        this.slotPos.push({ x: 0, y: 0, depth: 0 });
        return;
      }
      const node = layout.nodeById(id);
      this.slotPos.push({ x: node.x, y: node.y, depth: node.depth ?? 20 });
      const cost = this.scene.add
        .text(node.x + (node.w ?? 129) / 2 - 16, node.y - (node.h ?? 200) / 2 + 18, '', {
          fontFamily: '"Chewy", "Jua", sans-serif',
          fontSize: '34px',
          color: '#8fdcff',
        })
        .setStroke('#123c66', 6)
        .setOrigin(0.5)
        .setDepth((node.depth ?? 20) + 0.5);
      this.costTexts.push(cost);
      this.wireCardDrag(card, i);
    });

    // NEXT 카드 — 항상 선택 상태(별도 탭 불필요). 탭하면 가벼운 바운스만.
    this.nextCard = layout.tryById<Phaser.GameObjects.Image>(M.LAYER_3_COPY39);
    this.nextLabel = layout.tryById<Phaser.GameObjects.Text>(M.LAYER_2_COPY15);
    if (this.nextCard) {
      const node = layout.nodeById(M.LAYER_3_COPY39);
      this.clockCx = node.x;
      this.clockCy = node.y;
      this.nextCard.setInteractive({ useHandCursor: true });
      this.nextCard.on('pointerdown', () => this.bounceNext());
      this.nextCostText = this.scene.add
        .text(node.x + (node.w ?? 129) / 2 - 16, node.y - (node.h ?? 204) / 2 + 18, '', {
          fontFamily: '"Chewy", "Jua", sans-serif',
          fontSize: '34px',
          color: '#8fdcff',
        })
        .setStroke('#123c66', 6)
        .setOrigin(0.5)
        .setDepth((node.depth ?? 32) + 0.6);
    }

    // 출발점/레인 존 — 탭 즉시 배치(항상 선택 상태).
    for (let lane = 0; lane < START_POINT_IDS.length; lane++) {
      const sp = layout.tryById<Phaser.GameObjects.Image>(START_POINT_IDS[lane]);
      this.starts.push(sp);
      if (!sp) continue;
      sp.setInteractive({ useHandCursor: true });
      sp.on('pointerdown', () => this.onLaneTap(lane));
    }
    this.lanePaths = buildLanePaths(layout);
    const zone = scene.add.zone(630, 1295, 900, 1270).setOrigin(0.5).setInteractive();
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.onLaneTap(laneFromPoint(this.lanePaths, p.worldX, p.worldY));
    });
  }

  /**
   * 프리뷰 카드 드래그 — 위/아래로 끌어 등장 순서를 바꾼다.
   *   표시 인덱스 i(0=맨 위..3=맨 아래) ↔ 큐 인덱스 4-i (맨 아래가 다음 순번).
   *   NEXT(큐 0)로는 끌어넣을 수 없다 — 드롭 대상은 카드열 4칸뿐.
   */
  private wireCardDrag(card: Phaser.GameObjects.Image, i: number): void {
    card.setInteractive({ useHandCursor: true, draggable: true });
    card.on('drag', (_p: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      card.setPosition(dragX, dragY);
      card.setDepth(60); // 드는 동안 맨 위
    });
    card.on('dragend', () => {
      // 드롭 위치에서 가장 가까운 카드 슬롯을 찾는다.
      let target = i;
      let best = Infinity;
      this.slotPos.forEach((s, j) => {
        const d = Math.abs(card.y - s.y);
        if (d < best) {
          best = d;
          target = j;
        }
      });
      const home = this.slotPos[i];
      card.setPosition(home.x, home.y);
      card.setDepth(home.depth);
      card.setAngle(0);
      if (target !== i && !this.onReorder(4 - i, 4 - target)) this.shake(card);
    });
  }

  /** NEXT 탭 — 항상 선택 상태이므로 안내 바운스만. */
  private bounceNext(): void {
    if (!this.nextCard) return;
    sfx(this.scene, 'sfx_button');
    const { displayWidth, displayHeight } = this.nextCard;
    this.scene.tweens.add({
      targets: this.nextCard,
      displayWidth: { from: displayWidth * 1.08, to: displayWidth },
      displayHeight: { from: displayHeight * 1.08, to: displayHeight },
      duration: 140,
      ease: 'Back.Out',
    });
  }

  /** 레인 탭 = 즉시 배치. 성공 시 카드가 그 레인으로 날아가는 연출. */
  private onLaneTap(lane: number): void {
    const s = this.lastState;
    if (!s) return;
    const kind = currentNext(s);
    if (!isNextReady(s) || s.mana < UNIT_SPECS[kind].cost) {
      this.shake(this.nextCard);
      return;
    }
    if (this.onPlace(lane)) this.flyCardToLane(kind, lane);
    else this.shake(this.nextCard);
  }

  /** 배치 연출 — NEXT 카드 사본이 출발점으로 날아가 사라지며 캐릭터가 나타난다. */
  private flyCardToLane(kind: UnitKind, lane: number): void {
    const tex = CARD_TEX[kind];
    if (!this.scene.textures.exists(tex) || !this.nextCard) return;
    const p = this.lanePaths[lane];
    const ghost = this.scene.add
      .image(this.clockCx, this.clockCy, tex)
      .setDisplaySize(this.nextCard.displayWidth, this.nextCard.displayHeight)
      .setDepth(CLOCK_DEPTH - 1);
    this.scene.tweens.add({
      targets: ghost,
      x: p.bottomX,
      y: p.bottomY - 30,
      displayWidth: ghost.displayWidth * 0.35,
      displayHeight: ghost.displayHeight * 0.35,
      alpha: { from: 1, to: 0 },
      duration: 320,
      ease: 'Cubic.In',
      onComplete: () => ghost.destroy(),
    });
  }

  /** 배치 가능 상태 안내 — 준비되면 출발점 화살표가 은은히 펄스. */
  private setStartPulse(on: boolean): void {
    if (on && !this.pulseTween) {
      const targets = this.starts.filter((s): s is Phaser.GameObjects.Image => !!s);
      this.pulseTween = this.scene.tweens.add({
        targets,
        alpha: { from: 1, to: 0.55 },
        duration: 520,
        yoyo: true,
        repeat: -1,
      });
    } else if (!on && this.pulseTween) {
      this.pulseTween.stop();
      this.pulseTween = null;
      for (const s of this.starts) s?.setAlpha(1);
    }
  }

  /** 거절 흔들림 — 끝나면 각도를 복원한다(기울어짐 잔류 방지). */
  private shake(obj: Phaser.GameObjects.Image | undefined): void {
    if (!obj) return;
    this.scene.tweens.add({
      targets: obj,
      angle: { from: -4, to: 4 },
      duration: 50,
      yoyo: true,
      repeat: 2,
      onComplete: () => obj.setAngle(0),
      onStop: () => obj.setAngle(0),
    });
  }

  /** 이미지 텍스처 교체(표시 크기 유지). */
  private swapTexture(img: Phaser.GameObjects.Image, tex: string): void {
    if (img.texture.key === tex || !this.scene.textures.exists(tex)) return;
    const { displayWidth, displayHeight } = img;
    img.setTexture(tex);
    img.setDisplaySize(displayWidth, displayHeight);
  }

  /** 큐 내용 변화 시 — NEXT/프리뷰 카드 전면 갱신(등장 연출은 충전 완료 시점에 별도). */
  private refreshQueue(state: BattleState): void {
    const next = currentNext(state);
    if (this.nextCard) this.swapTexture(this.nextCard, CARD_TEX[next]);
    this.nextLabel?.setText(CARD_LABEL[next]);
    this.nextCostText?.setText(String(UNIT_SPECS[next].cost));

    // 프리뷰 4장 — 맨 아래(index 3)가 다음 순번(위로 갈수록 나중).
    const preview = queuePreview(state, 4); // [다음, 그다음, ...]
    CARD_IDS.forEach((_, i) => {
      const kind = preview[3 - i]; // i=3(맨 아래) → preview[0]
      const card = this.cards[i];
      if (card) this.swapTexture(card, CARD_TEX[kind]);
      this.cardLabels[i]?.setText(CARD_LABEL[kind]);
      this.costTexts[i]?.setText(String(UNIT_SPECS[kind].cost));
    });
  }

  /**
   * 충전 시계 — NEXT 카드 정중앙. 충전 중에만 그려지며, 대기 상태는 오직 이 시계로 표현한다.
   * 어두운 받침원 위에 **흰색 반투명** 부채꼴이 12시부터 시계방향으로 줄어들고 바늘이 돈다.
   */
  private drawClock(state: BattleState): void {
    // 지연 생성 — 씬 구성 직후 생성된 Graphics 가 정렬에서 누락되는 이슈 우회.
    if (!this.clock || !this.clock.active) {
      this.clock = this.scene.add.graphics().setDepth(CLOCK_DEPTH);
    }
    const g = this.clock;
    g.clear();
    if (!this.nextCard || state.status !== 'playing' || isNextReady(state)) return;
    const remain = Math.max(0, Math.min(1, (state.nextReadyAtMs - state.timeMs) / TURN_MS));
    const top = -Math.PI / 2; // 12시
    const hand = top + Math.PI * 2 * (1 - remain); // 경과분만큼 시계방향 회전
    // 받침원 — 밝은 카드 위에서도 흰 시계가 또렷하게 읽히도록 어둡게 깐다.
    g.fillStyle(0x000000, 0.45);
    g.fillCircle(this.clockCx, this.clockCy, CLOCK_RADIUS);
    // 남은 시간 부채꼴 — 흰색 반투명(바늘부터 12시까지, 줄어드는 영역).
    g.fillStyle(0xffffff, 0.8);
    g.slice(this.clockCx, this.clockCy, CLOCK_RADIUS - 4, hand, top + Math.PI * 2, false);
    g.fillPath();
    // 테두리 + 바늘.
    g.lineStyle(3, 0xffffff, 0.9);
    g.strokeCircle(this.clockCx, this.clockCy, CLOCK_RADIUS);
    g.lineStyle(4, 0xffffff, 1);
    g.lineBetween(
      this.clockCx,
      this.clockCy,
      this.clockCx + Math.cos(hand) * (CLOCK_RADIUS - 4),
      this.clockCy + Math.sin(hand) * (CLOCK_RADIUS - 4),
    );
  }

  /** 매 프레임 — 큐 갱신·충전 시계·등장 연출·지불 가능 여부 반영. */
  update(state: BattleState): void {
    this.lastState = state;
    const key = state.queue.join(',');
    if (key !== this.lastQueueKey) {
      this.lastQueueKey = key;
      this.refreshQueue(state);
    }
    this.drawClock(state);

    const ready = isNextReady(state);
    if (ready && !this.wasReady && this.nextCard) {
      // 시계 완주 → 캐릭터 활성 팝.
      const { displayWidth, displayHeight } = this.nextCard;
      this.scene.tweens.add({
        targets: this.nextCard,
        displayWidth: { from: displayWidth * 1.15, to: displayWidth },
        displayHeight: { from: displayHeight * 1.15, to: displayHeight },
        duration: 200,
        ease: 'Back.Out',
      });
    }
    this.wasReady = ready;

    // 충전 대기는 시계만으로 표현 — 카드는 항상 온전한 밝기.
    const affordable = ready && state.mana >= UNIT_SPECS[currentNext(state)].cost;
    this.nextCard?.setAlpha(ready && !affordable ? 0.5 : 1);
    this.nextCostText?.setAlpha(ready && !affordable ? 0.55 : 1);
    // 배치 가능하면 출발점 펄스로 "탭해서 배치"를 안내(항상 선택 상태).
    this.setStartPulse(affordable);
  }
}
