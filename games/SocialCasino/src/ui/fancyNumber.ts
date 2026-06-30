/**
 * fancyNumber.ts — 정보패널 점수를 **굵은 이텔릭 디자인 폰트**로 렌더(요청: 이미지 숫자 → 폰트 대체).
 *
 * 숫자/기호는 Kanit(ital 800, 라틴) 의 진짜 굵은 이텔릭으로, 한글 라벨(퍼즐/슬롯/획득)은 Do Hyeon 폴백
 *   으로 합성 기울임 처리한다. 단일 Text 를 컨테이너에 담아(스케일 팝/롤링 tween 대상) 중앙 정렬.
 *   API(container·setText·setAlpha)는 이전 ImageNumber 와 동일해 호출부 변경을 최소화한다.
 */
import Phaser from 'phaser';

/** 라틴 숫자=Kanit 굵은 이텔릭, 한글 라벨=Do Hyeon 폴백. */
const FONT_FAMILY = '"Kanit", "Do Hyeon", "Jua", sans-serif';
const DEFAULT_COLOR = '#ffe27a';

export class FancyNumber {
  readonly container: Phaser.GameObjects.Container;
  private readonly text: Phaser.GameObjects.Text;
  private readonly baseSize: number;
  private readonly maxW: number; // >0 이면 이 폭을 넘는 큰 숫자는 폰트를 줄여 칸 안에 맞춘다(0=무제한)

  constructor(scene: Phaser.Scene, x: number, y: number, glyphH: number, depth = 200, maxW = 0) {
    this.baseSize = Math.round(glyphH * 0.92);
    this.maxW = maxW;
    this.container = scene.add.container(x, y).setDepth(depth);
    this.text = scene.add
      .text(0, 0, '', {
        fontFamily: FONT_FAMILY,
        fontSize: `${this.baseSize}px`,
        fontStyle: 'italic 800', // 굵은 이텔릭
        color: DEFAULT_COLOR,
        stroke: '#2a1640',
        strokeThickness: Math.max(4, Math.round(glyphH * 0.14)),
      })
      .setOrigin(0.5);
    this.text.setShadow(0, 4, 'rgba(0,0,0,0.6)', 6, false, true);
    this.text.setLetterSpacing(-3); // ⭐자간 좁게(요청) — 좁은 간격으로 같은 폭에 더 길게.
    this.container.add(this.text);
  }

  /** 문자열 + 색상 표시. color 는 전체 글리프에 적용. maxW 설정 시 **자릿수 많아지면 폰트 축소**(칸 안 정렬). */
  setText(str: string, color: string = DEFAULT_COLOR): void {
    this.text.setFontSize(this.baseSize).setText(str).setColor(color);
    if (this.maxW > 0 && this.text.width > this.maxW) {
      this.text.setFontSize(Math.max(20, Math.floor((this.baseSize * this.maxW) / this.text.width)));
    }
  }

  setAlpha(a: number): this {
    this.container.setAlpha(a);
    return this;
  }
}
