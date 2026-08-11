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
import { servableCountByType } from '../logic/board.js';
import type { BoardState, ItemType } from '../logic/types.js';
import { LayoutIndex, asLeftGauge } from '../ui/layoutLoader.js';
import { formatClock } from './hud.js';

const GROUP = 'grp_6';
const ID_ITEM = 'layer_15_copy7';
const ID_TIME = 'layer_19_copy5';
const ID_GAUGE_BG = 'layer_20_copy3';
const ID_GAUGE_FILL = 'layer_20_copy4';
const ID_BUBBLE = 'layer_11_copy';
const ID_CHEF = 'layer_11';

/**
 * 슬라이드-인 하는 미션 노드(캐릭터·말풍선·주문 타이머·게이지·꼬치)만 명시적으로 모은다.
 * ⚠️ 디자인 grp_6 에는 테이블 배경(layer_3)도 묶여 있어(디자이너 그룹핑), 그룹 전체를 옮기면
 *    테이블이 화면 밖으로 딸려간다 → 반드시 이 허용목록으로 미션 노드만 컨테이너에 담는다.
 */
const MISSION_NODE_IDS = new Set([ID_CHEF, ID_BUBBLE, ID_TIME, ID_GAUGE_BG, ID_GAUGE_FILL, ID_ITEM]);
/** 세로 HD(1080 폭)에서 컨테이너가 완전히 화면 밖으로 나가는 x. */
const HIDDEN_X = -1400;
/** 주문 꼬치 미리보기 표시 크기(말풍선 안). 에디터 SSOT 노드(layer_15_copy7) 80×173 반영. */
const MISSION_ITEM_W = 80;
const MISSION_ITEM_H = 173;
const MISSION_SEC = 20;
/** 기본(레벨1) 등장 간격(초). 레벨이 오를수록 이 값을 최대 60%까지 단축 → 특별주문이 더 자주 등장. */
const FIRST_DELAY: [number, number] = [16, 26];
const NEXT_DELAY: [number, number] = [24, 40];
/** 레벨→간격 단축 계수(0~0.6). L1=0(기본), L200+=0.6(간격 40%로 단축=최대 빈도). */
function frequencyScale(level: number): number {
  return Math.min(0.6, Math.max(0, (level - 1) / 200));
}
function scaleRange(range: [number, number], f: number): [number, number] {
  return [range[0] * (1 - f), range[1] * (1 - f)];
}

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
  private nextIn: number;
  private sliding = false;

  /** 이 레벨의 메뉴(주문 가능한 꼬치 종류 = typePool). 특별주문은 이 안에서만 요청한다. */
  private readonly menu: Set<ItemType>;
  /** 레벨별로 단축된 등장 간격(초). */
  private readonly firstDelay: [number, number];
  private readonly nextDelay: [number, number];

  constructor(
    private readonly scene: Phaser.Scene,
    layout: LayoutIndex,
    menu: ReadonlyArray<ItemType>,
    level: number,
    private readonly cb: MissionCallbacks,
  ) {
    this.menu = new Set(menu);
    const f = frequencyScale(level);
    this.firstDelay = scaleRange(FIRST_DELAY, f);
    this.nextDelay = scaleRange(NEXT_DELAY, f);
    this.nextIn = randBetween(this.firstDelay);
    // 미션 노드(허용목록)만 depth 순서로 컨테이너에 옮긴다(원좌표 유지, 컨테이너로 슬라이드).
    //   테이블 배경(layer_3)이 같은 grp_6 에 섞여 있어 그룹 전체를 옮기면 안 된다(위 주석 참조).
    const entries = layout
      .byGroup(GROUP)
      .filter((e) => MISSION_NODE_IDS.has(e.node.id))
      .sort((a, b) => (a.node.depth ?? 0) - (b.node.depth ?? 0));
    this.container = scene.add.container(HIDDEN_X, 0, entries.map((e) => e.obj));
    this.container.setDepth(8).setVisible(false);

    this.itemImg = layout.byId<Phaser.GameObjects.Image>(ID_ITEM);
    this.timeText = layout.byId<Phaser.GameObjects.Text>(ID_TIME);
    this.gauge = asLeftGauge(layout.byId<Phaser.GameObjects.Rectangle>(ID_GAUGE_FILL));
    this.chef = layout.byId<Phaser.GameObjects.Image>(ID_CHEF);
    this.chefBaseY = this.chef.y;

    // 말풍선 X 버튼(이미지에 그려진 위치, 세로 HD 좌표)에 투명 히트존.
    const closeZone = scene.add.circle(702, 360, 40, 0xffffff, 0).setInteractive({ useHandCursor: true });
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
    // 메뉴(typePool)에 있고 **한 그릴에 3개를 실제로 모을 수 있는** 종류만 대상 — 서빙 불가능한 미션 방지.
    //   (단순 총량이 아니라 servableCountByType 로 판정 → 고정 꼬치가 여러 그릴에 흩어져 못 모으는 경우 제외.)
    const candidates = [...servableCountByType(board).entries()]
      .filter(([t, n]) => n >= 3 && this.menu.has(t))
      .map(([t]) => t);
    if (candidates.length === 0) {
      this.nextIn = randBetween(this.nextDelay);
      return;
    }
    this.target = candidates[Math.floor(Math.random() * candidates.length)];
    this.remaining = MISSION_SEC;
    this.itemImg.setTexture(itemKey(this.target)).setDisplaySize(MISSION_ITEM_W, MISSION_ITEM_H);
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
    this.nextIn = randBetween(this.nextDelay);
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
