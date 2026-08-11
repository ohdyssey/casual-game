/**
 * stageTimer.ts — 화면 가운데 **스테이지 시계**(저작 `up_UI_07` + 분침 `up_UI_07-1`).
 *
 * 카드에 붙은 시계가 "이 김밥을 언제까지"라면, 이건 "이 판이 언제 끝나나"다(`logic/stage.ts`).
 * **분침 한 바퀴 = 3분**이라 진행도가 그대로 각도가 된다 — 눈금을 읽을 필요 없이 한 바퀴만 보면 된다.
 *
 * 시계 아래 명판에는 **미션을 다 채우기까지 남은 시간**이 `분:초` 로 뜬다 —
 * **저작된 텍스트 노드**(`NODE.stageCount`)를 그대로 쓰고 자리·글꼴은 에디터가 정한다.
 *
 * ⚠️⚠️ 예전에는 여기에 **처리량 「3 / 10」**이 떴다. 그런데 판을 끝내는 조건이 처리량에서
 * **미션 셋 완수**로 옮겨 가면서(`cookingFlow` 의 `allMissionsDone`) 그 숫자는 **목표가 아닌 것을
 * 가리키고 있었다.** 분침만으로는 「얼마나 남았나」를 초 단위로 읽을 수 없어서, 명판이 그 일을 맡는다.
 * ⚠️ 분침과 같은 것을 가리키지만 층이 다르다 — 분침은 **한눈에**, 명판은 **정확히**.
 */
import Phaser from 'phaser';
import { GAME_FONT_FAMILY, GAME_FONT_STYLE } from '../ui/font.js';
import { formatClock } from '../logic/cookingFlow.js';
import type { DesignRect } from './cookingNodes.js';

/** 시간이 얼마 안 남으면 숫자에 힘을 준다. */
const COUNT_COLOR = { normal: '#ffffff', near: '#ffd0d0' } as const;
/** 이만큼 남으면 붉어진다(초). */
const NEAR_SEC = 30;

export class StageTimer {
  private readonly hand: Phaser.GameObjects.Image | undefined;
  private readonly count: Phaser.GameObjects.Text | undefined;
  private readonly banner: Phaser.GameObjects.Text | undefined;
  /** 마지막으로 그린 초 — 초가 바뀔 때만 다시 그린다(Text 갱신은 비싸다). */
  private lastSec = -1;
  /** 지금 몇 번째 판인가 — **목표 건수와 판 시간이 판마다 다르다**(`logic/stage.ts`). */
  private stageIndex = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    face: DesignRect | null,
    hand: { readonly obj: Phaser.GameObjects.Image; readonly rect: DesignRect } | null,
    count?: Phaser.GameObjects.Text,
  ) {
    if (hand) {
      // 분침은 **아래 끝을 축으로** 돈다. 저작된 자리에서 그 축을 그대로 읽는다.
      const pivotX = hand.rect.cx;
      const pivotY = hand.rect.cy + hand.rect.h / 2;
      hand.obj.setOrigin(0.5, 1).setPosition(pivotX, pivotY).setAngle(0);
      this.hand = hand.obj;
    }
    if (count) {
      // ⚠️ 저작 텍스트에 좁은 줄바꿈 폭이 걸려 있으면 「00:00」이 세로로 한 글자씩 쪼개진다.
      //    자리·글꼴은 저작대로 두고 줄바꿈만 푼다.
      count.setWordWrapWidth(undefined as unknown as number).setOrigin(0.5).setText(formatClock(0));
      this.count = count;
    }
    if (!face) return;

    const size = Math.max(28, Math.round(face.h * 0.19));
    const depth = (this.count?.depth ?? hand?.obj.depth ?? 67) + 1;

    this.banner = scene.add
      .text(face.cx, face.cy - face.h / 2 - size, '', {
        fontFamily: GAME_FONT_FAMILY,
        fontStyle: GAME_FONT_STYLE,
        fontSize: `${Math.round(size * 1.15)}px`,
        color: '#ffffff',
        stroke: '#8a3b00',
        strokeThickness: 8,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(depth + 1)
      .setVisible(false);
  }

  /** 분침을 돌린다 — `progress` 0~1 이 곧 한 바퀴다. */
  setProgress(progress: number): void {
    this.hand?.setAngle(Phaser.Math.Clamp(progress, 0, 1) * 360);
  }

  /** 판이 바뀌었다 — 시간이 판마다 다르므로 표기를 다시 그린다. */
  setStage(stageIndex: number): void {
    if (this.stageIndex === stageIndex) return;
    this.stageIndex = stageIndex;
    this.lastSec = -1;
  }

  /**
   * 명판에 **미션을 다 채우기까지 남은 시간**을 `분:초` 로 적는다.
   * ⚠️ 초가 바뀔 때만 다시 그린다 — 매 프레임 `setText` 는 비싸고, 튀는 연출도 눈에 거슬린다.
   */
  setRemaining(ms: number): void {
    const sec = Math.max(0, Math.ceil(ms / 1000));
    if (sec === this.lastSec) return;
    const wasNear = this.lastSec >= 0 && this.lastSec <= NEAR_SEC;
    this.lastSec = sec;
    const text = this.count;
    if (!text) return;
    text.setText(formatClock(ms));
    const near = sec <= NEAR_SEC;
    text.setColor(near ? COUNT_COLOR.near : COUNT_COLOR.normal);
    // ⚠️ **평소에는 튀지 않는다** — 매초 튀면 화면이 잠시도 가만있지 않는다.
    //    마지막 30초에 들어설 때 한 번, 그 뒤로는 매초 살짝만.
    if (!near) return;
    this.scene.tweens.killTweensOf(text);
    text.setScale(1);
    this.scene.tweens.add({
      targets: text,
      scale: wasNear ? 1.12 : 1.34,
      duration: 110,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  /** 판이 끝났다 — 클리어인지 시간 초과인지 알리고 시계를 되감는다. */
  announce(cleared: boolean, stageIndex: number): void {
    this.lastSec = -1;
    this.setRemaining(0);
    this.setProgress(0);
    const banner = this.banner;
    if (!banner) return;
    banner
      // ⚠️ 레벨을 끝내는 건 **미션 완수**다(`cookingFlow.withStageEnd`). 시간이 다 되면 못 깬 것이므로
      //    「다음」이 아니라 **같은 레벨을 다시** 한다 — 문구도 그렇게 읽혀야 한다.
      .setText(cleared ? `레벨 ${stageIndex + 1} 클리어!` : `레벨 ${stageIndex + 1} 실패 — 다시`)
      .setColor(cleared ? '#fff2a8' : '#ffffff')
      .setVisible(true)
      .setAlpha(0)
      .setScale(0.5);
    this.scene.tweens.killTweensOf(banner);
    this.scene.tweens.add({
      targets: banner,
      alpha: 1,
      scale: 1,
      duration: 260,
      ease: 'Back.easeOut',
      completeDelay: 1200,
      onComplete: () => {
        this.scene.tweens.add({
          targets: banner,
          alpha: 0,
          duration: 320,
          onComplete: () => banner.setVisible(false),
        });
      },
    });
  }
}
