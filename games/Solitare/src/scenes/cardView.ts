/**
 * cardView.ts — 코드 드로우 카드(캐주얼 스타일) + **이미지(픽셀) 기반 정확 선택**.
 *
 * 카드를 오프스크린 캔버스에 **고정 기준 크기(REF)로 한 번만** 굽고(Phaser addCanvas), Image 로 표시한다.
 * 레벨마다 카드 표시 크기가 달라도(다양한 배치) 텍스처는 재사용하고 setDisplaySize 로만 스케일한다
 * → 텍스처 수 폭증 방지. `setInteractive({ pixelPerfect })` 로 카드 실제 픽셀에만 탭이 반응.
 *
 * 정식 카드 에셋(에디터 업로드)이 오면 이 텍스처 대신 up_Solitaire_CARD_* Image 로 교체하면 된다.
 */
import Phaser from 'phaser';
import { type Card, isRed, rankLabel, suitSymbol } from '../logic/types.js';
import { CARD_BACK_KEY } from '../assets.js';

const FACE = '#fffdf8';
const RED = '#e8402f';
const BLACK = '#26344a';
const BACK_FILL = '#2f6fe0';
const PAD = 15; // 글로우/그림자 여백(투명) — 부드러운 드롭섀도(블러+오프셋) 수용
const SS = 2; // 슈퍼샘플(선명도)

/** 모든 카드 공통 **옅은(부드러운) 드롭섀도**. ctx 에 걸고 카드 몸통을 채우면 그림자가 생긴다. */
function applyCardShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'rgba(0,0,0,0.26)';
  ctx.shadowBlur = 9;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 5;
}
function clearShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

// 텍스처 기준 크기(모든 카드 동일). 표시 크기는 CardView(scene,x,y,w,h)의 w/h 로 스케일.
const REF_W = 132;
const REF_H = 181;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function newCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = (REF_W + PAD * 2) * SS;
  canvas.height = (REF_H + PAD * 2) * SS;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SS, SS);
  ctx.translate(REF_W / 2 + PAD, REF_H / 2 + PAD); // 원점 = 카드 중심
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  return { canvas, ctx };
}

// **텍스처 캐시 키 = 카드 내용(무늬+랭크+하이라이트)** — id(b5·s3…)로 키하면 **레벨마다 같은 id 가 다른 카드로 재사용**돼
//   이전 레벨의 낡은 얼굴 텍스처가 그대로 나오는 버그(표시 랭크≠논리 랭크 → K가 K로 매칭돼 보임). 내용 기반으로 고정.
const faceKey = (card: Card, hl: boolean): string => `solc_${card.suit}${card.rank}${hl ? '_h' : ''}`;
const BACK_KEY = 'solc_back';

function bakeFace(scene: Phaser.Scene, card: Card, hl: boolean): string {
  const key = faceKey(card, hl);
  if (scene.textures.exists(key)) return key;
  const w = REF_W;
  const h = REF_H;
  const color = isRed(card.suit) ? RED : BLACK;
  const r = Math.min(24, w * 0.17);
  const { canvas, ctx } = newCanvas();

  if (hl) {
    ctx.fillStyle = 'rgba(255,213,74,0.95)';
    roundRect(ctx, -w / 2 - 6, -h / 2 - 6, w + 12, h + 12, r + 5);
    ctx.fill();
  }
  // 카드 몸통 = 옅은 드롭섀도와 함께 채움(그림자는 몸통에서 파생).
  // **오픈 카드는 외곽선 없음**(레퍼런스: 깨끗한 흰 카드 + 부드러운 그림자만). 흰선/이중테두리 방지.
  // 플레이 가능(hl) 표시는 위에서 몸통 뒤에 깐 골드 헤일로만으로 나타낸다(선이 아니라 광).
  applyCardShadow(ctx);
  ctx.fillStyle = FACE;
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.fill();
  clearShadow(ctx);

  const label = rankLabel(card.rank);
  const sym = suitSymbol(card.suit);
  ctx.fillStyle = color;
  const draw = (str: string, x: number, y: number, size: number): void => {
    ctx.font = `bold ${Math.round(size)}px Arial, sans-serif`;
    ctx.fillText(str, x, y);
  };
  // 숫자(랭크) 표시를 **조금 크게** — 중앙 0.40→0.47, 모서리 0.16→0.19.
  draw(label, 0, -h * 0.09, h * 0.47);
  draw(sym, 0, h * 0.28, h * 0.3);
  draw(label, -w * 0.33, -h * 0.33, h * 0.19);
  draw(sym, -w * 0.33, -h * 0.15, h * 0.13);
  ctx.save();
  ctx.rotate(Math.PI);
  draw(label, -w * 0.33, -h * 0.33, h * 0.19);
  draw(sym, -w * 0.33, -h * 0.15, h * 0.13);
  ctx.restore();

  scene.textures.addCanvas(key, canvas);
  return key;
}

function bakeBack(scene: Phaser.Scene): string {
  if (scene.textures.exists(BACK_KEY)) return BACK_KEY;
  const w = REF_W;
  const h = REF_H;
  const r = Math.min(24, w * 0.17);
  const { canvas, ctx } = newCanvas();

  // 정식 뒷면 아트(up_Solitaire_CARD_back)가 로드됐으면 그것으로 굽는다(옅은 드롭섀도 포함).
  const src = getBackImage(scene);
  if (src) {
    applyCardShadow(ctx);
    ctx.drawImage(src, -w / 2, -h / 2, w, h); // 그림자는 이미지 알파(카드 실루엣)에서 파생
    clearShadow(ctx);
    scene.textures.addCanvas(BACK_KEY, canvas);
    return BACK_KEY;
  }

  // 폴백: 코드 드로우(정식 아트 미로드 시).
  applyCardShadow(ctx);
  ctx.fillStyle = BACK_FILL;
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.fill();
  clearShadow(ctx);
  ctx.lineWidth = Math.max(2, w * 0.02);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  roundRect(ctx, -w / 2 + 2, -h / 2 + 2, w - 4, h - 4, r - 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth = 2;
  const step = w * 0.3;
  for (let i = -h / 2; i < h / 2; i += step) {
    ctx.beginPath();
    ctx.moveTo(-w * 0.24, i);
    ctx.lineTo(0, i + step * 0.5);
    ctx.lineTo(w * 0.24, i);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(0, 0, w * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = BACK_FILL;
  ctx.beginPath();
  ctx.arc(0, 0, w * 0.095, 0, Math.PI * 2);
  ctx.fill();

  scene.textures.addCanvas(BACK_KEY, canvas);
  return BACK_KEY;
}

/** 로드된 뒷면 아트의 원본 이미지(캔버스 drawImage 소스). 미로드면 null. */
function getBackImage(scene: Phaser.Scene): CanvasImageSource | null {
  if (!scene.textures.exists(CARD_BACK_KEY)) return null;
  const img = scene.textures.get(CARD_BACK_KEY).getSourceImage();
  return img as CanvasImageSource;
}

// **특수 카드 앞면**(와일드·+N 보너스 등) — 업로드된 UI 아트를 카드 몸통 크기로 구워 텍스처화.
const WILD_SRC_KEY = 'up_Solitare_UI_08';
function bakeArt(scene: Phaser.Scene, srcKey: string): string | null {
  const key = `solc_art_${srcKey}`;
  if (scene.textures.exists(key)) return key;
  if (!scene.textures.exists(srcKey)) return null;
  const w = REF_W;
  const h = REF_H;
  const r = Math.min(24, w * 0.17);
  const { canvas, ctx } = newCanvas();
  const src = scene.textures.get(srcKey).getSourceImage() as CanvasImageSource & { width: number; height: number };
  // **외곽 흰색 카드 프레임 제거** — 원본 가장자리(흰 테두리)를 잘라낸 내부만 둥근 카드에 채운다.
  const inset = 0.05;
  const sw = src.width;
  const sh = src.height;
  const sx = sw * inset;
  const sy = sh * inset;
  const sW = sw * (1 - 2 * inset);
  const sH = sh * (1 - 2 * inset);
  // 둥근 카드 실루엣 드롭섀도(내용이 덮으므로 색은 무관, 섀도만 유발).
  applyCardShadow(ctx);
  ctx.fillStyle = '#3a2456';
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.fill();
  clearShadow(ctx);
  // 흰 프레임 제외한 내부를 둥근 카드 영역에 클립해 채움.
  ctx.save();
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.clip();
  ctx.drawImage(src, sx, sy, sW, sH, -w / 2, -h / 2, w, h);
  ctx.restore();
  scene.textures.addCanvas(key, canvas);
  return key;
}

/** 앞면 서명 — 같은 카드+하이라이트면 같은 문자열(중복 그리기 판별). */
function faceSig(card: Card, highlight: boolean): string {
  return `face:${card.rank}${card.suit}${card.wild ? 'w' : ''}:${highlight ? 1 : 0}`;
}

export class CardView extends Phaser.GameObjects.Image {
  private readonly cw: number;
  private faceUp = false;
  private flipping = false;
  /** **지금 그려져 있는 내용의 서명**(back / face:<카드>:<하이라이트> / art:<키>) — 중복 갱신 판별용.
   *   같은 내용을 다시 그리면 setTexture+setDisplaySize 가 진행 중인 스케일 트윈(펄스 등)을 리셋해
   *   미세한 튐이 생긴다. 호출부가 isShowing* 로 먼저 확인하고 넘길 수 있게 서명을 유지한다. */
  private shownSig = 'back';

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, _h: number, interactive = true) {
    bakeBack(scene);
    super(scene, x, y, BACK_KEY);
    this.cw = w; // 표시 폭(높이는 비율 고정 REF_H/REF_W)
    this.applyDisplay();
    if (interactive) this.setInteractive({ pixelPerfect: true });
    scene.add.existing(this);
  }

  /** 텍스처(REF+PAD)를 표시 폭(cw)에 맞춰 스케일. */
  private applyDisplay(): void {
    const s = this.cw / REF_W;
    this.setDisplaySize((REF_W + PAD * 2) * s, (REF_H + PAD * 2) * s);
  }

  showBack(): void {
    this.faceUp = false;
    this.shownSig = 'back';
    this.setTexture(bakeBack(this.scene));
    this.applyDisplay();
  }

  showFace(card: Card, highlight = false): void {
    this.faceUp = true;
    this.shownSig = faceSig(card, highlight);
    this.setTexture(bakeFace(this.scene, card, highlight));
    this.applyDisplay();
  }

  /** 지금 이 카드(같은 하이라이트)를 앞면으로 보여주고 있는가 — 불필요한 재그리기 회피용. */
  isShowingFace(card: Card, highlight = false): boolean {
    return this.faceUp && this.shownSig === faceSig(card, highlight);
  }

  /** 지금 와일드 아트를 보여주고 있는가. */
  isShowingWild(): boolean {
    return this.faceUp && this.shownSig === `art:${WILD_SRC_KEY}`;
  }

  /** 특수 아트(와일드·+N 보너스 등)를 카드 앞면으로 표시 — 아트가 없으면 뒷면으로 폴백. */
  showArt(srcKey: string): void {
    const key = bakeArt(this.scene, srcKey);
    if (!key) {
      this.showBack();
      return;
    }
    this.faceUp = true;
    this.shownSig = `art:${srcKey}`;
    this.setTexture(key);
    this.applyDisplay();
  }

  /** 와일드 앞면 표시(showArt 편의 래퍼). */
  showWild(): void {
    this.showArt(WILD_SRC_KEY);
  }

  isFaceUp(): boolean {
    return this.faceUp;
  }

  /**
   * 뒷면 → 앞면 **뒤집기 연출** — 가로로 접었다가(scaleX→0, 엣지온) 앞면으로 펼친다(살짝 오버슛 팝).
   *   새로 노출되는 카드가 즉시 앞면으로 바뀌지 않고 실제로 뒤집혀 보이게 한다.
   */
  flipToFace(card: Card, highlight = false): void {
    if (this.faceUp || this.flipping) {
      if (this.faceUp) this.showFace(card, highlight);
      return;
    }
    this.flipping = true;
    const half = 105;
    this.scene.tweens.add({
      targets: this,
      scaleX: 0.02,
      duration: half,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        // ⚠️ **파괴 방어**(PO 2026-07-28 "자동 진행되다 멈춤"의 진짜 원인) — 뒤집기 도중 이 뷰가 destroy 되면
        //   Phaser 가 `this.scene = undefined` 로 만들지만 **이 트윈은 죽이지 않는다**. 그 상태로 아래를 실행하면
        //   TypeError 가 TweenManager 밖으로 튀고, RequestAnimationFrame.step 은 try/catch 가 없어
        //   **다음 프레임을 예약하지 못한다 → 게임 전체가 영구 정지**한다.
        if (!this.scene) {
          this.flipping = false;
          return;
        }
        this.showFace(card, highlight); // 엣지온 순간 앞면으로 교체(applyDisplay 가 배율 리셋)
        const full = this.scaleX; // 앞면 표시 후 자연 배율
        this.scaleX = 0.02;
        this.scene.tweens.add({
          targets: this,
          scaleX: full,
          duration: half + 20,
          ease: 'Back.easeOut',
          onComplete: () => {
            if (!this.scene) {
              this.flipping = false;
              return;
            }
            this.scaleX = full;
            this.flipping = false;
          },
        });
      },
    });
  }

  /**
   * 이 카드의 **정상 배율** — 텍스처가 슈퍼샘플(SS)+여백(PAD)까지 구워져 있어 `setScale(1)` 은 카드를
   *   2배 이상으로 키운다. 펄스·흔들기 같은 스케일 연출은 반드시 이 값을 기준으로 해야 한다.
   */
  get baseScale(): number {
    return this.cw / REF_W / SS;
  }

  /** 짧게 눌렀다 놓는 펄스(스톡 더미 "돌아가는 중" 신호 등) — 끝나면 **정상 배율로 복귀**한다. */
  pulse(depth = 0.9, duration = 60): void {
    if (!this.scene || this.flipping) return; // 뒤집기 중이면 배율을 건드리지 않는다(연출 충돌).
    const base = this.baseScale;
    this.scene.tweens.killTweensOf(this);
    this.setScale(base);
    this.scene.tweens.add({
      targets: this,
      scaleX: base * depth,
      scaleY: base * depth,
      duration,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        if (this.scene) this.setScale(base);
      },
    });
  }

  /** 진행 중인 뒤집기를 취소하고 **즉시** 앞면으로 — 자동 완성처럼 연출할 시간이 없는 구간용. */
  showFaceNow(card: Card, highlight = false): void {
    if (this.flipping) {
      this.scene?.tweens.killTweensOf(this);
      this.flipping = false;
    }
    this.showFace(card, highlight); // applyDisplay 가 배율을 정상값으로 되돌린다.
  }

  /**
   * 파괴 직전 정리 — Phaser 가 `destroy()` 초입(**아직 scene 이 살아 있을 때**) 호출한다.
   *   이 오브젝트를 타깃으로 한 트윈을 반드시 끊는다: Phaser 는 destroy 시 트윈을 죽이지 않으므로,
   *   남은 트윈의 콜백이 파괴된 뷰를 만져 게임 루프를 죽이는 사고를 원천 차단한다.
   *   (`Tween.stop()` 은 onComplete 를 발화시키지 않아 재진입 위험도 없다.)
   */
  protected preDestroy(): void {
    this.scene?.tweens.killTweensOf(this);
    this.flipping = false;
  }
}
