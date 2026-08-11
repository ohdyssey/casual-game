/**
 * Scoreboard — 최종 라운드 한 줄만 표시(누적 리스트 아님). 회차가 끝날 때마다 이전 줄을
 * 지우고 새 줄로 교체한다("2R HR 110" 형식). 사용자 요청: "최종 라운드 표시는 최종라운드만
 * 표시합니다" — 총점은 더 이상 이 클래스가 관리하지 않는다(상단 헤더의 캐릭터명 옆 트로피
 * 점수 노드(main.json layer_2_copy2/copy3)를 PlayScene 이 직접 갱신한다, "1. 토탈점수는
 * 상단 캐릭터명에 표시합니다" — 기존엔 이 클래스가 별도 "Total" 줄을 좌/우 화면 끝에 그렸으나
 * 그 방식을 폐기하고 헤더로 이전).
 */
import Phaser from 'phaser';

/**
 * 폰트·스타일 기본값 — main.json 의 최종 라운드 목업 노드(layer_9_copy/layer_9_copy2)를 못 찾을
 * 때만 쓰는 방어적 폴백이다. 실제 값은 PlayScene.buildHud() 가 그 노드에서 직접 읽어 옵션으로
 * 넘긴다(사용자 보고: "최종라운드 폰트 표시가 에디터에 적용한 대로 적용되지 않는다" · "위치가
 * 다르다" — 코드에 값을 하드코딩해 두면 에디터에서 다시 조정해도 반영이 안 된다. main.json 이
 * SSOT 라는 원칙을 이 표시에도 그대로 적용한다).
 */
const FALLBACK_FONT_FAMILY = 'Luckiest Guy';
const FALLBACK_FONT_STYLE = 'normal';

export interface ScoreboardOptions {
  entryX: number;
  entryY: number;
  entryFontSize?: number;
  entryColor?: string;
  fontFamily?: string;
  fontStyle?: string;
  /** 정렬 방향 — 'left'·'right'·'center'(헤더 하단 표시는 기본 'center'). */
  align?: 'left' | 'center' | 'right';
  /** 테두리(선택) — main.json 노드가 strokeW>0 일 때만 PlayScene 이 넘긴다. */
  stroke?: { color: string; width: number };
  /** 드롭섀도(선택) — main.json 노드의 shadow 필드를 그대로 반영. color 는 rgba() 문자열이라
   * 에디터 shadowAlpha 는 이미 알파 채널에 반영돼 있다(Phaser setShadow 가 알파를 따로 안 받음). */
  shadow?: { color: string; x: number; y: number; blur: number };
  /**
   * 설정하면 라운드 표시가 조용히 나타나는 대신, 이 색으로 살짝 크게 팝인했다가 entryColor 로
   * 가라앉으며 안착한다(사용자 요청: "라이벌점수는 나타난 후 안착될 때 까지... 노란색으로
   * 표시된다" · "상대방의 최종라운드 표시는 같은 방식의 연출로 적용합니다"). 미설정 시 즉시
   * 완성된 모습으로 나타난다.
   */
  popInColor?: string;
}

const DEFAULTS = {
  entryFontSize: 26,
  entryColor: '#ffffff',
  fontFamily: FALLBACK_FONT_FAMILY,
  fontStyle: FALLBACK_FONT_STYLE,
  align: 'center',
} as const;

/**
 * popInColor 애니메이션 — 3단계(사용자 최종 요청: "팡팡펄스를 2배~1.8사이를 왔다갔다 하게...
 * 3번 왕복하고, 지금 같은 방식의 늘어났다 줄었다하는 방식이 아닌 다른 방식으로 수정. 스탬프는
 * 팍 꽂히듯이 연출할 것"):
 *  ① 등장 — popInColor·ENTRY_PULSE_HIGH_SCALE(2배) 로 즉시 나타남.
 *  ② 팡팡 펄스 — ENTRY_PULSE_HIGH_SCALE(2배)~ENTRY_PULSE_LOW_SCALE(1.8배) 사이를
 *     ENTRY_PULSE_REPEATS(3)번 왕복. 하나의 yoyo 트윈(Sine.easeInOut)으로 매끈하게 늘었다
 *     줄었다 하지 않고(사용자 지적: "지금 같은 방식... 아닌 다른 방식으로"), 축소는
 *     Quad.easeOut(팍 줄어듦)·확대는 Back.easeOut(스프링처럼 튀어오름)으로 방향마다 다른
 *     이징을 쓰는 독립 트윈 체인으로 통통 튀는 "팡팡" 느낌을 낸다.
 *  ③ 스탬프 — 아주 짧고(ENTRY_STAMP_MS) 급격한 Back.easeIn 으로 정상 크기(1)·entryColor(흰색)
 *     로 스냅해 "팍 꽂히는" 임팩트를 낸다(사용자 요청).
 */
/**
 * 이탤릭 글자가 오른쪽으로 삐져나가는 폭 ÷ 글자 크기. 흔한 이탤릭 기울기(약 12°)의 tan 값
 * (≈0.21)에 여유를 더한 값 — 폰트마다 기울기가 조금씩 달라 넉넉히 잡는다(여백은 투명 픽셀이라
 * 넉넉해도 화면상 손해가 없고, 모자라면 글자가 잘린다).
 */
const ITALIC_OVERHANG_RATIO = 0.3;

const ENTRY_PULSE_HIGH_SCALE = 2.0;
const ENTRY_PULSE_LOW_SCALE = 1.8;
const ENTRY_PULSE_REPEATS = 3;
const ENTRY_PULSE_STEP_MS = 220;
const ENTRY_STAMP_MS = 130;

export class Scoreboard {
  /** HUD 레이어에 추가할 컨테이너(원점 0,0 — 자식 좌표가 곧 화면 절대 좌표). */
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly entryColor: string;
  private readonly align: 'left' | 'center' | 'right';
  private readonly popInColor?: string;
  private readonly entryText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, opts: ScoreboardOptions) {
    this.popInColor = opts.popInColor;
    this.scene = scene;
    this.entryColor = opts.entryColor ?? DEFAULTS.entryColor;
    this.align = opts.align ?? DEFAULTS.align;

    const originX = this.align === 'right' ? 1 : this.align === 'center' ? 0.5 : 0;

    const fontSize = opts.entryFontSize ?? DEFAULTS.entryFontSize;
    const fontStyle = opts.fontStyle ?? DEFAULTS.fontStyle;
    /**
     * 오른쪽 여백 — 이탤릭은 글자 윗부분이 오른쪽으로 기울어 마지막 글자가 텍스처 밖으로
     * 삐져나가고, Phaser 는 그 부분을 그대로 잘라 버린다(사용자 보고: 폰트를 키운 뒤 "2R
     * Homerun 110" 의 끝자리 0 이 세로로 잘림 — 좌/우 표시 양쪽 모두). 기울기 오버행은 글자
     * 크기에 비례하므로 폰트 크기 기준으로 잡고, 드롭섀도 오프셋(오른쪽·아래로 밀려 그려짐)도
     * 같은 이유로 잘리니 함께 더한다.
     */
    const italicOverhang = fontStyle.includes('italic') ? Math.ceil(fontSize * ITALIC_OVERHANG_RATIO) : 0;
    const padRight = italicOverhang + Math.max(0, Math.ceil((opts.shadow?.x ?? 0) + (opts.shadow?.blur ?? 0)));
    const padBottom = Math.max(0, Math.ceil((opts.shadow?.y ?? 0) + (opts.shadow?.blur ?? 0)));

    this.container = scene.add.container(0, 0);
    this.entryText = scene.add
      .text(opts.entryX, opts.entryY, '', {
        fontFamily: opts.fontFamily ?? DEFAULTS.fontFamily,
        fontStyle,
        fontSize: `${fontSize}px`,
        color: this.entryColor,
      })
      .setOrigin(originX, 0);
    // ⚠️ 여백은 텍스처 크기를 키운다 — 오른쪽 정렬(origin.x=1)은 텍스처 오른쪽 끝을 x 에 맞추므로
    //    여백만큼 글자가 왼쪽으로 밀린다. 그만큼 x 를 되돌려 에디터가 정한 자리를 지킨다.
    if (padRight || padBottom) {
      this.entryText.setPadding(0, 0, padRight, padBottom);
      if (originX === 1) this.entryText.x += padRight;
      else if (originX === 0.5) this.entryText.x += padRight / 2;
    }
    if (opts.stroke) this.entryText.setStroke(opts.stroke.color, opts.stroke.width);
    if (opts.shadow) this.entryText.setShadow(opts.shadow.x, opts.shadow.y, opts.shadow.color, opts.shadow.blur, false, true);
    this.container.add(this.entryText);
  }

  /**
   * 이번 회차 결과로 표시를 교체("2R HR 110" 형식) — 이전 회차 줄은 남기지 않고 이 한 줄만
   * 갱신한다(사용자 요청: "최종 라운드 표시는 최종라운드만 표시합니다").
   */
  showRound(round: number, label: string, score: number): void {
    this.scene.tweens.killTweensOf(this.entryText);
    this.entryText.setText(`${round}R ${label} ${score}`).setScale(1).setAlpha(1);
    if (!this.popInColor) {
      this.entryText.setColor(this.entryColor);
      return;
    }
    // ① 등장 — 2배 크기·popInColor(노란색)로 즉시 나타남.
    const startColor = Phaser.Display.Color.HexStringToColor(this.popInColor);
    const endColor = Phaser.Display.Color.HexStringToColor(this.entryColor);
    this.entryText.setColor(this.popInColor).setScale(ENTRY_PULSE_HIGH_SCALE);

    // ③ 스탬프 — 아주 짧고 급격한 Back.easeIn 으로 정상 크기·entryColor 로 스냅(팍 꽂히는 임팩트).
    const stamp = (): void => {
      const state = { t: 0 };
      this.scene.tweens.add({
        targets: state,
        t: 1,
        duration: ENTRY_STAMP_MS,
        ease: 'Back.easeIn',
        onUpdate: () => {
          this.entryText.setScale(Phaser.Math.Linear(ENTRY_PULSE_HIGH_SCALE, 1, Phaser.Math.Clamp(state.t, 0, 1)));
          const idx = Math.round(Phaser.Math.Clamp(state.t, 0, 1) * 100);
          const c = Phaser.Display.Color.Interpolate.ColorWithColor(startColor, endColor, 100, idx);
          this.entryText.setColor(Phaser.Display.Color.RGBToString(c.r, c.g, c.b));
        },
      });
    };

    // ② 팡팡 펄스 — 축소(Quad.easeOut)·확대(Back.easeOut)를 서로 다른 이징으로 잇는 독립 트윈
    // 체인 — (2배→1.8배)/스프링처럼 튀어오름(1.8배→2배)을 3번 반복.
    let pulsesLeft = ENTRY_PULSE_REPEATS;
    const shrink = (): void => {
      this.scene.tweens.add({
        targets: this.entryText,
        scale: ENTRY_PULSE_LOW_SCALE,
        duration: ENTRY_PULSE_STEP_MS,
        ease: 'Quad.easeOut',
        onComplete: grow,
      });
    };
    const grow = (): void => {
      this.scene.tweens.add({
        targets: this.entryText,
        scale: ENTRY_PULSE_HIGH_SCALE,
        duration: ENTRY_PULSE_STEP_MS,
        ease: 'Back.easeOut',
        onComplete: () => {
          pulsesLeft -= 1;
          if (pulsesLeft > 0) shrink();
          else stamp();
        },
      });
    };
    shrink();
  }

  /** 새 판 시작 — 표시 초기화. */
  reset(): void {
    this.scene.tweens.killTweensOf(this.entryText);
    this.entryText.setText('').setScale(1).setAlpha(1);
  }

  destroy(): void {
    this.container.destroy();
  }
}
