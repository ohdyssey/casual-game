/**
 * missionPanel.ts — **한 판의 미션 세 칸**(화면 위쪽 가로 한 줄) + 완수 연출.
 *
 * ⚠️⚠️ **이 줄이 있는 이유는 「쌓이는 것」을 보여 주기 위해서다.** 주문을 내면 별·돈·도장이 오는데
 * 그건 전부 그 한 건의 평가라 다음 주문이 걸리면 리셋된다. 미션 칸은 주문마다 **한 칸씩 차오르고**,
 * 다 차면 그 자리에서 터진다 — 성취는 「잘했다」가 아니라 **「채웠다」**에서 온다.
 *
 * ⚠️ **세 칸이 가로 한 줄에 들어간다.** 그래서 글이 짧아야 한다(`missions.missionLabel`).
 *    세로로 쌓으면 카드·손님을 가리고, 접어 두면 차오르는 게 안 보여 있으나 마나가 된다.
 *
 * ⚠️ 아트는 없다 — 알약과 게이지는 Graphics, 체크는 도형이다.
 */
import Phaser from 'phaser';
import { GAME_FONT_FAMILY, GAME_FONT_STYLE } from '../ui/font.js';
import {
  MISSION_COUNT,
  missionLabel,
  missionProgressText,
  type Mission,
  type MissionState,
} from '../logic/missions.js';

/**
 * 줄이 서는 자리 — 잔고 알약(y 126, 아래끝 165) 아래, 메뉴 카드(윗변 y 524) 위의 빈 띠.
 *
 * ⚠️⚠️ **잔고에 바짝 붙이지 않는다.** 처음엔 y 214 에 두었는데 잔고 알약·왕관 장식과 거의 맞닿아
 *    **머리 위 장식이 한 덩어리로 보였다.** 아래로 내려 사이를 띄우면 「잔고」와 「이 판의 미션」이
 *    서로 다른 것으로 읽힌다(위로 잔고까지 123px · 아래로 카드까지 193px).
 *
 * ⚠️ **화면 폭을 통째로 쓰지 않는다.** 가장자리까지 꽉 찬 띠는 배경을 가르는 판때기로 보인다 —
 *    좌우를 넉넉히 비우고 칸 사이도 벌려 **세 개의 칩**으로 읽히게 한다.
 *
 * ⚠️ 이 띠에 다른 것을 놓으면 첫 칸이 가려진다 — 개발용 「n판 ▶ 다음」 단추가 여기 있어서
 *    미션 한 칸을 덮은 적이 있다(`cookingView.DEV_SKIP` — 지금은 잔고 옆 y 74 로 비켜 두었다).
 *
 * ⚠️⚠️ **칸은 절대 움직이지 않는다.** 자리는 여기 상수로만 정해지고, 어느 칸에 무엇이 오는지도
 *    미션 종류가 정한다(`missions.Spec.column` — 0 무엇을 · 1 어떻게 · 2 얼마나).
 *    예전에는 셋을 한 통에서 뽑아 **같은 미션이 판마다 다른 칸에 서서** 볼 때마다 세 칸을
 *    처음부터 다시 읽어야 했다. 빠듯한 시간에 그건 그냥 손해다.
 */
const ROW = { y: 288, h: 88, gap: 20, margin: 44, width: 1080 } as const;

const COLOR = {
  /**
   * 아직 채우는 중 — **거의 검은 나무빛**.
   * ⚠️ 배경이 네온 간판이 늘어선 밤거리라 어지간히 어둡지 않으면 글자가 배경에 먹힌다.
   */
  track: 0x1a0e04,
  trackAlpha: 0.78,
  /** 게이지가 차오를 자리 — 비어 있어도 **홈이 보여야** 「채우는 것」으로 읽힌다. */
  groove: 0x000000,
  grooveAlpha: 0.3,
  /** 차오른 만큼. */
  fill: 0x2f8fe0,
  /** 다 채운 칸. */
  doneFill: 0xc8901a,
  edge: 0xffeacb,
  /** 위쪽 안테두리에 얹는 옅은 빛 — 납작한 판이 아니라 **둥근 칩**으로 보이게 한다. */
  gloss: 0xffffff,
} as const;

/** 글자 그림자 — 밤거리 배경 위에서 알약을 넘어가도 읽히게. */
const INK_STROKE = { color: '#170b02', width: 6 } as const;

const LABEL_FONT = 26;
const VALUE_FONT = 40;
/** 게이지 홈이 알약 안쪽에서 물러나는 폭. */
const GROOVE_PAD = 7;

/** 라벨·값이 알약 안에서 서는 높이(중심 대비). */
const LABEL_DY = -21;
const VALUE_DY = 20;

interface Cell {
  readonly bar: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
  readonly value: Phaser.GameObjects.Text;
  readonly cx: number;
  readonly w: number;
}

export class MissionPanel {
  private readonly cells: Cell[] = [];
  private readonly banner: Phaser.GameObjects.Text;
  private state: MissionState | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    depth: number,
    bannerDepth: number,
    private readonly bannerSpot: { readonly x: number; readonly y: number },
  ) {
    const usable = ROW.width - ROW.margin * 2 - ROW.gap * (MISSION_COUNT - 1);
    const w = usable / MISSION_COUNT;
    for (let i = 0; i < MISSION_COUNT; i++) {
      const cx = ROW.margin + w / 2 + i * (w + ROW.gap);
      const bar = scene.add.graphics().setDepth(depth);
      const label = scene.add
        .text(cx, ROW.y + LABEL_DY, '', {
          fontFamily: GAME_FONT_FAMILY,
          fontStyle: GAME_FONT_STYLE,
          fontSize: `${LABEL_FONT}px`,
          // ⚠️ 값보다 **한 단 낮은 색**이다 — 무엇을 세는지는 한 번 읽으면 되고, 눈이 계속 가야 할 것은 숫자다.
          color: '#e8c9a0',
          stroke: INK_STROKE.color,
          strokeThickness: INK_STROKE.width,
        })
        .setOrigin(0.5)
        .setDepth(depth + 1);
      const value = scene.add
        .text(cx, ROW.y + VALUE_DY, '', {
          fontFamily: GAME_FONT_FAMILY,
          fontStyle: GAME_FONT_STYLE,
          fontSize: `${VALUE_FONT}px`,
          color: '#ffffff',
          stroke: INK_STROKE.color,
          strokeThickness: INK_STROKE.width,
        })
        .setOrigin(0.5)
        .setDepth(depth + 1);
      this.cells.push({ bar, label, value, cx, w });
    }

    this.banner = scene.add
      .text(bannerSpot.x, bannerSpot.y, '', {
        fontFamily: GAME_FONT_FAMILY,
        fontStyle: GAME_FONT_STYLE,
        fontSize: '58px',
        color: '#ffffff',
        backgroundColor: '#c8901a',
        padding: { x: 30, y: 12 },
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(bannerDepth)
      .setVisible(false);
  }

  /** 판이 바뀌었다 — 새 미션 셋을 건다. */
  setMissions(state: MissionState): void {
    this.state = state;
    this.redraw();
  }

  /**
   * 주문 하나를 낸 뒤 — 채워진 만큼 게이지가 오르고, **새로 완수한 칸은 그 자리에서 터진다.**
   * @param delayMs 완수 배너를 늦출 시간(별이 다 뜬 뒤에 오게 한다 — 겹치면 둘 다 안 읽힌다).
   */
  update(state: MissionState, completed: readonly number[], reward: number, delayMs = 0): void {
    this.state = state;
    this.redraw();
    for (const i of completed) this.pop(i);
    if (completed.length === 0) return;
    const all = state.done.every(Boolean);
    this.scene.time.delayedCall(delayMs, () => this.showBanner(all, reward, completed.length));
  }

  /** 채워진 칸 하나가 튀어 오른다. */
  private pop(index: number): void {
    const cell = this.cells[index];
    if (!cell) return;
    for (const obj of [cell.label, cell.value]) {
      this.scene.tweens.killTweensOf(obj);
      obj.setScale(1.5);
      this.scene.tweens.add({ targets: obj, scale: 1, duration: 320, ease: 'Back.easeOut' });
    }
  }

  private showBanner(all: boolean, reward: number, count: number): void {
    const head = all ? '미션 전부 완수!' : count > 1 ? `미션 ${count}개 완수!` : '미션 완수!';
    this.banner
      .setText(`${head}  +$${reward}`)
      .setBackgroundColor(all ? '#1d7a33' : '#c8901a')
      .setVisible(true)
      .setAlpha(0)
      .setScale(0.5)
      .setPosition(this.bannerSpot.x, this.bannerSpot.y);
    this.scene.tweens.killTweensOf(this.banner);
    this.scene.tweens.add({
      targets: this.banner,
      alpha: 1,
      scale: 1,
      duration: 300,
      ease: 'Back.easeOut',
    });
    // 떠오르며 사라진다 — 별·결과 줄을 오래 가리지 않게.
    this.scene.tweens.add({
      targets: this.banner,
      y: this.bannerSpot.y - 40,
      alpha: 0,
      duration: 460,
      delay: 1200,
      onComplete: () => this.banner.setVisible(false),
    });
  }

  private redraw(): void {
    const state = this.state;
    this.cells.forEach((cell, i) => {
      const mission = state?.list[i];
      if (!mission) {
        cell.bar.clear();
        cell.label.setVisible(false);
        cell.value.setVisible(false);
        return;
      }
      const value = state?.progress[i] ?? 0;
      const done = state?.done[i] ?? false;
      cell.label.setVisible(true).setText(missionLabel(mission));
      cell.value.setVisible(true).setText(done ? '완수!' : missionProgressText(mission, value));
      cell.value.setColor(done ? '#ffe9a8' : '#ffffff');
      this.drawBar(cell, mission, value, done);
    });
  }

  /** 알약 바탕 + 차오른 만큼. 다 채운 칸은 통째로 금빛이 된다. */
  private drawBar(cell: Cell, mission: Mission, value: number, done: boolean): void {
    const { bar, cx, w } = cell;
    const x = cx - w / 2;
    const y = ROW.y - ROW.h / 2;
    const r = ROW.h / 2;
    bar.clear();

    // ① 바탕 — 밤거리 위에서도 글자가 뜨도록 거의 검게.
    bar.fillStyle(COLOR.track, COLOR.trackAlpha);
    bar.fillRoundedRect(x, y, w, ROW.h, r);

    // ② 게이지가 찰 **홈** — 비어 있어도 자리가 보여야 「채우는 것」으로 읽힌다.
    const pad = GROOVE_PAD;
    const gh = ROW.h - pad * 2;
    bar.fillStyle(COLOR.groove, COLOR.grooveAlpha);
    bar.fillRoundedRect(x + pad, y + pad, w - pad * 2, gh, gh / 2);

    // ③ 차오른 만큼.
    const ratio = done ? 1 : Math.max(0, Math.min(1, mission.goal > 0 ? value / mission.goal : 0));
    if (ratio > 0) {
      // ⚠️ 폭이 반지름보다 좁으면 `fillRoundedRect` 가 찌그러진다 — 최소 폭을 준다.
      const fillW = Math.max(gh, (w - pad * 2) * ratio);
      bar.fillStyle(done ? COLOR.doneFill : COLOR.fill, done ? 0.95 : 0.82);
      bar.fillRoundedRect(x + pad, y + pad, fillW, gh, gh / 2);
    }

    // ④ 위쪽 안테두리에 얹는 옅은 빛 — 납작한 판이 아니라 둥근 칩으로 보이게 한다.
    bar.lineStyle(3, COLOR.gloss, 0.16);
    bar.strokeRoundedRect(x + 5, y + 5, w - 10, ROW.h - 10, r - 5);

    // ⑤ 테두리 — 다 채운 칸은 또렷해진다.
    bar.lineStyle(4, COLOR.edge, done ? 1 : 0.7);
    bar.strokeRoundedRect(x, y, w, ROW.h, r);
  }
}
