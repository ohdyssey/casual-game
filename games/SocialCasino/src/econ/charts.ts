/**
 * econ/charts.ts — 의존성 없는 **캔버스 차트**(현대 대시보드용). 라인(다중 시리즈) + 막대.
 *   다크 패널·그리드·컬러 스트로크. DPR 보정으로 선명.
 */

export interface Series {
  readonly label: string;
  readonly color: string;
  readonly points: ReadonlyArray<number>;
}

const GRID = '#243049';
const AXIS = '#5b6b8c';
const TEXT = '#9fb0d0';
const FONT = '12px "Inter", system-ui, sans-serif';

function setup(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const w = canvas.clientWidth || 360;
  const h = canvas.clientHeight || 180;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

/** 다중 라인 차트. yMin/yMax 미지정 시 데이터에서 산출. xLabels 옵션(하단). */
export function drawLines(
  canvas: HTMLCanvasElement,
  series: ReadonlyArray<Series>,
  opts: { yMin?: number; yMax?: number; zeroLine?: boolean; xLabel?: string; yLabel?: string } = {},
): void {
  const s = setup(canvas);
  if (!s) return;
  const { ctx, w, h } = s;
  const padL = 52, padR = 12, padT = 12, padB = 24;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const all = series.flatMap((x) => x.points);
  let yMin = opts.yMin ?? Math.min(0, ...all);
  let yMax = opts.yMax ?? Math.max(1, ...all);
  if (yMax === yMin) yMax = yMin + 1;
  const maxLen = Math.max(2, ...series.map((x) => x.points.length));
  const xOf = (i: number) => padL + (plotW * i) / (maxLen - 1);
  const yOf = (v: number) => padT + plotH * (1 - (v - yMin) / (yMax - yMin));

  // 그리드 + y축 라벨
  ctx.font = FONT;
  ctx.fillStyle = TEXT;
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  const rows = 4;
  for (let r = 0; r <= rows; r++) {
    const v = yMin + ((yMax - yMin) * r) / rows;
    const y = yOf(v);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(fmtNum(v), padL - 6, y);
  }
  // 0선 강조
  if (opts.zeroLine && yMin < 0 && yMax > 0) {
    ctx.strokeStyle = AXIS; ctx.lineWidth = 1.5;
    const y0 = yOf(0); ctx.beginPath(); ctx.moveTo(padL, y0); ctx.lineTo(w - padR, y0); ctx.stroke();
  }
  // 라인
  for (const sr of series) {
    if (sr.points.length < 2) continue;
    ctx.strokeStyle = sr.color; ctx.lineWidth = 2; ctx.beginPath();
    sr.points.forEach((v, i) => { const x = xOf(i), y = yOf(v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.stroke();
  }
  // x 라벨
  if (opts.xLabel) { ctx.fillStyle = TEXT; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(opts.xLabel, padL + plotW / 2, h - 4); }
}

/** 막대 차트(라벨 하단·값 상단). */
export function drawBars(
  canvas: HTMLCanvasElement,
  bars: ReadonlyArray<{ label: string; value: number; color: string }>,
  opts: { yMax?: number; fmt?: (v: number) => string } = {},
): void {
  const s = setup(canvas);
  if (!s) return;
  const { ctx, w, h } = s;
  const padT = 18, padB = 28, padX = 10;
  const plotH = h - padT - padB;
  const yMax = opts.yMax ?? Math.max(1, ...bars.map((b) => b.value));
  const n = Math.max(1, bars.length);
  const bw = (w - padX * 2) / n;
  const fmt = opts.fmt ?? fmtNum;
  ctx.font = FONT;
  bars.forEach((b, i) => {
    const bh = plotH * Math.max(0, b.value) / yMax;
    const x = padX + i * bw + bw * 0.16;
    const ww = bw * 0.68;
    const y = padT + (plotH - bh);
    ctx.fillStyle = b.color;
    roundRect(ctx, x, y, ww, bh, 4); ctx.fill();
    ctx.fillStyle = TEXT; ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom'; ctx.fillText(fmt(b.value), x + ww / 2, y - 2);
    ctx.textBaseline = 'top'; ctx.fillText(b.label, x + ww / 2, padT + plotH + 4);
  });
}

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

/** 큰 수 축약(차트 라벨). */
export function fmtNum(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  if (a >= 1 || v === 0) return v.toFixed(0);
  return v.toFixed(2);
}
