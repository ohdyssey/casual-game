/**
 * 특별 미션 — 주방장 캐릭터가 가끔 등장해 제한시간 내 특정 꼬치 매치를 요청한다.
 * 등장 연출/카운트다운/성공·실패 판정을 담당. 보상 지급은 씬 콜백으로 위임.
 *
 * 비주얼은 에디터 grp_6(캐릭터·말풍선·아이템 슬롯·타이머·게이지)을 컨테이너로 묶어
 * 슬라이드 인/아웃한다. 디자인 좌표는 main.json 그대로.
 */
import Phaser from 'phaser';
import { itemKey } from '../assets.js';
import { sfx } from '../audio.js';
import { remainingByType } from '../logic/board.js';
import type { BoardState, ItemType } from '../logic/types.js';
import { LayoutIndex, asLeftGauge } from '../ui/layoutLoader.js';
import { formatClock } from './hud.js';

const GROUP = 'grp_6';
const ID_ITEM = 'layer_15_copy7';
const ID_TIME = 'layer_19_copy5';
const ID_GAUGE_FILL = 'layer_20_copy4';
const ID_CHEF = 'layer_11';

const HIDDEN_X = -600;
const MISSION_SEC = 20;
const FIRST_DELAY: [number, number] = [16, 26];
const NEXT_DELAY: [number, number] = [24, 40];

export interface MissionCallbacks {
  /** 미션 성공(매치 달성). */
  readonly onSuccess: (type: ItemType) => void;
  /** 시간 초과. */
  readonly onExpire: (type: ItemType) => void;
}

function randBetween(range: [number, number]): number {
  return range[0] + Math.random() * (range[1] - range[0]);
}

export class MissionDirector {
  private readonly container: Phaser.GameObjects.Container;
  private readonly itemImg: Phaser.GameObjects.Image;
  private readonly timeText: Phaser.GameObjects.Text;
  private readonly gauge: ReturnType<typeof asLeftGauge>;
  private readonly chef: Phaser.GameObjects.Image;
  private readonly chefBaseY: number;
  private chefBob?: Phaser.Tweens.Tween;

  private target: ItemType | null = null;
  private remaining = 0;
  private nextIn = randBetween(FIRST_DELAY);
  private sliding = false;

  constructor(
    private readonly scene: Phaser.Scene,
    layout: LayoutIndex,
    private readonly cb: MissionCallbacks,
  ) {
    // grp_6 객체들을 노드 depth 순서로 컨테이너에 옮긴다(원좌표 유지, 컨테이너로 슬라이드).
    const entries = layout.byGroup(GROUP).sort((a, b) => (a.node.depth ?? 0) - (b.node.depth ?? 0));
    this.container = scene.add.container(HIDDEN_X, 0, entries.map((e) => e.obj));
    this.container.setDepth(8).setVisible(false);

    this.itemImg = layout.byId<Phaser.GameObjects.Image>(ID_ITEM);
    this.timeText = layout.byId<Phaser.GameObjects.Text>(ID_TIME);
    this.gauge = asLeftGauge(layout.byId<Phaser.GameObjects.Rectangle>(ID_GAUGE_FILL));
    this.chef = layout.byId<Phaser.GameObjects.Image>(ID_CHEF);
    this.chefBaseY = this.chef.y;

    // 말풍선 X 버튼(이미지에 그려진 위치)에 투명 히트존.
    const closeZone = scene.add.circle(494, 202, 30, 0xffffff, 0).setInteractive({ useHandCursor: true });
    this.container.add(closeZone);
    closeZone.on('pointerup', () => {
      if (this.target !== null && !this.sliding) {
        sfx('tap');
        this.end(false);
      }
    });
  }

  get active(): boolean {
    return this.target !== null;
  }

  /** 매 프레임 호출(일시정지/종료 상태에서는 씬이 호출을 멈춘다). */
  update(dtSec: number, board: BoardState): void {
    if (this.target === null) {
      this.nextIn -= dtSec;
      if (this.nextIn <= 0) this.start(board);
      return;
    }
    if (this.sliding) return;
    this.remaining -= dtSec;
    this.timeText.setText(formatClock(Math.ceil(this.remaining)));
    this.gauge.setRatio(this.remaining / MISSION_SEC);
    if (this.remaining <= 0) {
      const t = this.target;
      this.end(false);
      this.cb.onExpire(t as ItemType);
      sfx('mission_fail');
    }
  }

  /** 씬이 매치 발생 시 호출 — 미션 대상이면 성공 처리. */
  notifyMatch(type: ItemType): boolean {
    if (this.target === null || this.sliding || type !== this.target) return false;
    const t = this.target;
    this.end(true);
    this.cb.onSuccess(t);
    sfx('mission_win');
    return true;
  }

  /** 게임 종료 시 즉시 정리. */
  stop(): void {
    this.target = null;
    this.chefBob?.stop();
    this.scene.tweens.killTweensOf(this.container);
    this.container.setVisible(false).setX(HIDDEN_X);
  }

  private start(board: BoardState): void {
    // 3개 이상 남은 종류만 미션 대상 — 달성 불가능 미션 방지.
    const candidates = [...remainingByType(board).entries()].filter(([, n]) => n >= 3).map(([t]) => t);
    if (candidates.length === 0) {
      this.nextIn = randBetween(NEXT_DELAY);
      return;
    }
    this.target = candidates[Math.floor(Math.random() * candidates.length)];
    this.remaining = MISSION_SEC;
    this.itemImg.setTexture(itemKey(this.target)).setDisplaySize(28, 60);
    this.timeText.setText(formatClock(MISSION_SEC));
    this.gauge.setRatio(1);

    this.sliding = true;
    this.container.setVisible(true);
    sfx('mission');
    this.scene.tweens.add({
      targets: this.container,
      x: 0,
      duration: 460,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.sliding = false;
        this.chef.setY(this.chefBaseY);
        this.chefBob = this.scene.tweens.add({
          targets: this.chef,
          y: this.chefBaseY - 6,
          duration: 700,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      },
    });
  }

  /** 미션 종료 — 슬라이드 아웃 후 다음 미션 예약. */
  private end(success: boolean): void {
    this.target = null;
    this.sliding = true;
    this.chefBob?.stop();
    this.chef.setY(this.chefBaseY);
    this.nextIn = randBetween(NEXT_DELAY);
    this.scene.tweens.add({
      targets: this.container,
      x: HIDDEN_X,
      delay: success ? 320 : 60,
      duration: 380,
      ease: 'Back.easeIn',
      onComplete: () => {
        this.sliding = false;
        this.container.setVisible(false);
      },
    });
  }
}
