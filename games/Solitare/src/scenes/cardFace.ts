/**
 * cardFace.ts — **카드 앞면 무늬/숫자 그리기**(캔버스 2D만 쓰는 순수 그리기 · Phaser 비의존).
 *
 * cardView.ts 가 텍스처를 구울 때 호출하고, design/card-face-preview.html 이 같은 함수로 시안을
 * 그려 본다 — 미리보기와 실제 게임이 **같은 코드**를 쓰므로 "미리보기에선 예뻤는데" 가 생기지 않는다.
 *
 * 좌표계 약속: 호출자가 원점을 **카드 중심**으로 옮겨 두고(textAlign=center · textBaseline=middle)
 * 카드 크기 w·h 를 넘긴다.
 */

/**
 * 랭크·무늬 글꼴 — **원래 쓰던 Arial 볼드**(PO 2026-08-21 "폰트는 원래 적용했던 폰트를 적용해 달라").
 * 중간에 Baloo 2(랭크)+세리프(핍) 조합을 시도했다가 되돌렸다 — 트럼프 숫자는 Arial 쪽이 또렷하다.
 */
export const CARD_FONT = 'Arial, sans-serif';

/**
 * (cx,cy)에 **글자 잉크의 실제 중심**이 오도록 그린다(maxW 를 넘으면 자동 축소).
 *
 * textBaseline='middle' 은 글꼴 em 상자 기준이라 글꼴마다 글자가 위아래로 치우친다 — 랭크(Baloo 2)와
 * 무늬(세리프)는 서로 다른 글꼴이어서 같은 y 에 그리면 눈에 띄게 어긋나고, 카드 전체로 보면 내용이
 * 위쪽으로 쏠려 보인다(PO 지적). actualBoundingBox(잉크 상자)로 보정해 **보이는 대로** 정렬한다.
 */
function drawInk(
  ctx: CanvasRenderingContext2D,
  str: string,
  weight: string,
  family: string,
  size: number,
  cx: number,
  cy: number,
  maxW: number,
): void {
  const setFont = (px: number): void => { ctx.font = `${weight} ${Math.max(1, Math.round(px))}px ${family}`; };
  setFont(size);
  const w0 = ctx.measureText(str).width;
  if (w0 > maxW) setFont((size * maxW) / w0);
  const m = ctx.measureText(str);
  ctx.fillText(str, cx, cy - (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2);
}

/**
 * 여러 글자를 **자간을 좁혀** 그린다 — `10` 처럼 두 자짜리 랭크가 한 자(`9`)보다 작아 보이지 않게.
 *
 * ⚠️ 왜 필요한가: `drawInk` 는 폭이 `maxW` 를 넘으면 **글꼴을 줄인다**. 좁은 모서리 인덱스에서는
 *   `10` 만 그 규칙에 걸려 혼자 작게 나온다(PO 2026-08-29 "10 같은 경우 1과 0을 별도로 표시해서
 *   폭을 줄이는 것도 고려"). 글자를 따로 그리고 **사이만 좁히면** 크기를 지키면서 폭이 준다.
 * ⚠️ 한 글자면 `drawInk` 와 완전히 같게 동작한다(자간이 없으므로).
 */
function drawInkTight(
  ctx: CanvasRenderingContext2D,
  str: string,
  weight: string,
  family: string,
  size: number,
  cx: number,
  cy: number,
  maxW: number,
  kern = 0.78,
): void {
  if (str.length < 2) {
    drawInk(ctx, str, weight, family, size, cx, cy, maxW);
    return;
  }
  const chars = [...str];
  const setFont = (px: number): void => { ctx.font = `${weight} ${Math.max(1, Math.round(px))}px ${family}`; };
  setFont(size);
  const widths = chars.map((c) => ctx.measureText(c).width);
  const advance = (i: number): number => widths[i] * (i === chars.length - 1 ? 1 : kern);
  let total = widths.reduce((a, _w, i) => a + advance(i), 0);
  if (total > maxW) {
    setFont((size * maxW) / total);
    const w2 = chars.map((c) => ctx.measureText(c).width);
    total = w2.reduce((a, w, i) => a + w * (i === chars.length - 1 ? 1 : kern), 0);
    widths.splice(0, widths.length, ...w2);
  }
  // 세로 정렬은 drawInk 와 같은 규칙(잉크 상자 기준) — 문자열 전체로 잰다.
  const m = ctx.measureText(str);
  const y = cy - (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  let x = cx - total / 2;
  chars.forEach((c, i) => {
    ctx.fillText(c, x, y);
    x += widths[i] * (i === chars.length - 1 ? 1 : kern);
  });
  ctx.textAlign = prevAlign;
}

/**
 * 카드 앞면 배치.
 *   · `classic` — **원래 솔리테어(TriPeaks)의 디자인**. 상단에 작은 랭크(좌)·무늬(우) 한 줄 +
 *     그 아래 큰 랭크. ⚠️ **바꾸지 말 것**(PO 2026-08-29 "원래 솔리테어 게임의 카드디자인은
 *     변경하지 마세요") — 메인 게임 화면이 이 배치를 전제로 잡혀 있다.
 *   · `index` — **보너스 게임(클론다이크) 전용**. 좌상단에 랭크 위·무늬 아래로 쌓은 모서리 인덱스.
 *     3장 뽑기에서 카드를 옆으로 겹쳐도 좁은 띠 하나로 카드를 읽을 수 있어야 하기 때문이다.
 */
export type CardFaceStyle = 'classic' | 'index';

/**
 * 카드 앞면의 **랭크·무늬**를 그린다(몸통·그림자는 호출자 몫).
 *
 * ⚠️ 두 배치는 **서로 독립**이다 — 한쪽을 손보다가 다른 쪽을 건드리지 말 것.
 *   텍스처 캐시도 스타일별로 갈라져 있다(cardView.faceKey).
 */
export function drawCardFace(
  ctx: CanvasRenderingContext2D,
  label: string,
  sym: string,
  color: string,
  w: number,
  h: number,
  style: CardFaceStyle = 'classic',
): void {
  ctx.fillStyle = color;
  if (style === 'index') {
    /*
     * 좌상단 모서리 인덱스(랭크 위 · 무늬 바로 아래) + 중앙 랭크.
     *
     * **이 여섯 숫자는 한 묶음이다.** 세로로 네 구간(위 여백 · 랭크 · 무늬 · 중앙 랭크)을 나눠 쓰는데
     * 남는 공간이 거의 없어, 하나만 건드리면 반드시 어딘가가 겹친다. 지금 배분(잉크 기준):
     * 배치 원칙(PO 2026-08-29):
     *   · 인덱스는 위 여백을 두고 아래로 — 지금 위 여백 0.065h.
     *   · **인덱스 안에서 랭크와 무늬는 겹치지 않는다** — 지금 사이 0.011h.
     *     (한때 −0.009h 로 붙어 글자가 서로 물렸다. 크기를 키울 땐 이 간격부터 확인할 것.)
     *   · 중앙 랭크는 인덱스 아래쪽(+0.12h)에 크게 둔다.
     *   · **무늬와 중앙 랭크가 약간 겹치는 것은 허용한다** — 둘 다 크게 두는 쪽을 택했다.
     *     (인덱스 내부 겹침과는 다른 이야기다. 저건 안 되고, 이건 된다.)
     * ⚠️ 인덱스 가로 폭은 `PlayKlondikeScene.WASTE_FAN_STEP`(겹침 폭)과 짝이다 —
     *   지금은 왼쪽 모서리에서 0.37w 안에 들어오게 잡아(중심 -0.31w · 폭 0.36w) 겹침 폭을
     *   48px 까지 좁혔다. 넓히면 그 값도 함께 넓혀야 겹친 카드에서 무늬가 잘린다.
     * ⚠️ 랭크는 `drawInkTight` 로 그린다 — `10` 이 글꼴 축소에 걸려 혼자 작아지지 않게.
     */
    // ⚠️ 인덱스 랭크는 **자간을 많이 좁힌다**(0.62) — `10` 이 폭 한도에 걸려 혼자 작아지지 않게.
    //   자간만으로 부족해 x 를 살짝 오른쪽(−0.29w)으로 옮기고 한도도 0.38w 로 넓혔다.
    drawInkTight(ctx, label, 'bold', CARD_FONT, h * 0.3, -w * 0.31, -h * 0.33, w * 0.36, 0.62);
    drawInk(ctx, sym, 'bold', CARD_FONT, h * 0.34, -w * 0.31, -h * 0.095, w * 0.3);
    drawInkTight(ctx, label, 'bold', CARD_FONT, h * 0.5, 0, h * 0.12, w * 0.8);
    return;
  }
  // classic — 원래 배치(건드리지 말 것).
  //   상단 한 줄(랭크 좌 · 무늬 우) + 중앙 큰 랭크. 카드 아래쪽은 앞 카드에 가려지므로 정보는 위에 모은다.
  //   ⚠️ 세로 예산이 빠듯하다 — 상단 줄 잉크 아래끝(−0.165h)과 중앙 랭크 잉크 위끝(−0.108h)
  //   사이가 약 0.06h 뿐이다. 크기를 더 키우면 겹친다.
  drawInk(ctx, label, 'bold', CARD_FONT, h * 0.272, -w * 0.26, -h * 0.3, w * 0.36);
  drawInk(ctx, sym, 'bold', CARD_FONT, h * 0.384, w * 0.27, -h * 0.3, w * 0.34);
  drawInk(ctx, label, 'bold', CARD_FONT, h * 0.58, 0, h * 0.1, w * 0.78);
}
