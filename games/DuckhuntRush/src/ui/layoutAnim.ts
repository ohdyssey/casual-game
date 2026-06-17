/**
 * layoutAnim — 에디터가 저장한 node.anim 을 게임에서 재생(자체 구현, 패키지 비의존).
 *   에디터↔게임 독립 유지: 게임은 main.json 만 읽고, 이 파일이 애니를 해석·구동한다.
 *   buildLayout 이 만든 객체에 적용되며, PlayScene.update 에서 layout.tick(dt) 한 줄만 호출하면 된다.
 *
 *   현재 지원: category 'wind'(자연 바람) — 상시(idle) 루프.
 *     · 일반 객체: 회전(밑동 피벗)+좌우 드리프트+세로 숨(breathe)+반짝임(shimmer).
 *     · rope 노드: 점 변위로 밑동 고정·끝만 휨(anchor 아래는 완전 고정).
 *   에디터 wind 파라미터와 동일한 수식.
 */

const TAU = Math.PI * 2;

function hash01(i: number, salt = 0): number {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
function scatter(i: number, v: number) {
  if (!v) return { phase: 0, period: 1, amp: 1 };
  const p = hash01(i, 1), q = hash01(i, 2), r = hash01(i, 3);
  return { phase: p, period: 1 + (q - 0.5) * 2 * (v * 0.35), amp: 1 + (r - 0.5) * 2 * (v * 0.45) };
}

interface WP { f1: number; f2: number; fg: number; phi1: number; phi2: number; phig: number; amp: number; flutterAmp: number; gust: number; }

function windParams(i: number, cfg: Record<string, number>): WP {
  const v = cfg.variance == null ? 0.6 : cfg.variance;
  const s = scatter(i, v);
  const f1 = (cfg.freq == null ? 0.5 : cfg.freq) / s.period;
  const amp = (cfg.amp == null ? 6 : cfg.amp) * s.amp;
  return {
    f1, f2: f1 * (cfg.flutter == null ? 3.2 : cfg.flutter), fg: cfg.gustFreq == null ? 0.13 : cfg.gustFreq,
    phi1: s.phase * TAU, phi2: hash01(i, 4) * TAU, phig: hash01(i, 5) * TAU,
    amp, flutterAmp: amp * (cfg.flutterAmp == null ? 0.35 : cfg.flutterAmp),
    gust: Math.max(0, Math.min(1, cfg.gust == null ? 0.7 : cfg.gust)),
  };
}
function gust(t: number, p: WP): number { return (1 - p.gust) + p.gust * (0.5 + 0.5 * Math.sin(TAU * p.fg * t + p.phig)); }
function windValue(t: number, p: WP): number { return gust(t, p) * (p.amp * Math.sin(TAU * p.f1 * t + p.phi1) + p.flutterAmp * Math.sin(TAU * p.f2 * t + p.phi2)); }
function breatheWave(t: number, p: WP): number { return Math.sin(TAU * p.f1 * t + p.phi1 + Math.PI / 2); }
function shimmerWave(t: number, p: WP): number { return 0.5 + 0.5 * Math.sin(TAU * p.f2 * t + p.phi2); }

const PIVOTS: Record<string, [number, number]> = { center: [0.5, 0.5], base: [0.5, 1], top: [0.5, 0], left: [0, 0.5], right: [1, 0.5] };

type Updater = (dt: number) => void;
interface AnimEntry { node: unknown; obj: unknown; }

export interface LayoutAnims { tick(dt: number): void; stop(): void; }

/** 레이아웃 항목들에서 wind 애니를 찾아 per-object updater 를 만든다. (obj 는 Phaser GameObject) */
export function createLayoutAnims(entries: ReadonlyArray<AnimEntry>): LayoutAnims {
  const updaters: Updater[] = [];
  let gi = 0;

  for (const e of entries) {
    const anim = (e.node as Record<string, unknown>).anim as Record<string, unknown> | undefined;
    if (!anim || anim.category !== 'wind') continue;
    if (anim.trigger && anim.trigger !== 'idle') continue;
    const cfg = (anim.wind as Record<string, number>) || {};
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const obj = e.obj as any;
    if (!obj) continue;
    const i = gi++;
    const p = windParams(i, cfg);
    let acc = hash01(i, 6) * 4;

    // ── rope: 밑동 고정·끝 휨 ──
    if (obj.type === 'Rope' && Array.isArray(obj.points) && obj.points.length > 1 && typeof obj.setDirty === 'function') {
      const pts = obj.points as Array<{ x: number; y: number }>;
      const N = pts.length;
      const baseX = pts.map((pt) => pt.x || 0);
      const k = cfg.bend == null ? 2 : cfg.bend;
      const anchor = Math.max(0, Math.min(0.95, cfg.anchor == null ? 0.25 : cfg.anchor));
      const hw = pts.map((_, j) => { const frac = (N - 1 - j) / (N - 1); return frac <= anchor ? 0 : Math.pow((frac - anchor) / (1 - anchor), k); });
      const gain = (cfg.bendGain == null ? 2.5 : cfg.bendGain) / (obj.scaleX || 1);
      updaters.push((dt: number) => {
        if (!obj.scene) return;
        acc += dt;
        const v = windValue(acc, p) * gain;
        for (let j = 0; j < N; j++) pts[j].x = baseX[j] + v * hw[j];
        try { obj.setDirty(); } catch { /* */ }
      });
      continue;
    }

    // ── 일반 객체: 회전(밑동 피벗)+드리프트+숨+반짝임 ──
    const pivotName = (cfg.pivot != null && (cfg.pivot as unknown as string) !== 'center') ? (cfg.pivot as unknown as string) : null;
    const tilt = cfg.tilt == null ? 1 : cfg.tilt;
    const drift = cfg.drift == null ? 0.25 : cfg.drift;
    const breathe = cfg.breathe == null ? 0 : cfg.breathe;
    const shimmer = cfg.shimmer == null ? 0 : cfg.shimmer;
    if (pivotName && PIVOTS[pivotName] && typeof obj.setOrigin === 'function') {
      const [px, py] = PIVOTS[pivotName];
      const ox0 = obj.originX == null ? 0.5 : obj.originX, oy0 = obj.originY == null ? 0.5 : obj.originY;
      if (px !== ox0 || py !== oy0) {
        const w = obj.displayWidth || obj.width || 0, h = obj.displayHeight || obj.height || 0;
        obj.setOrigin(px, py); obj.x += (px - ox0) * w; obj.y += (py - oy0) * h;
      }
    }
    const base = { angle: obj.angle || 0, x: obj.x || 0, scaleY: obj.scaleY == null ? 1 : obj.scaleY, alpha: obj.alpha == null ? 1 : obj.alpha };
    updaters.push((dt: number) => {
      if (!obj.scene) return;
      acc += dt;
      const v = windValue(acc, p);
      obj.angle = base.angle + v * tilt;
      if (drift) obj.x = base.x + v * drift;
      if (breathe) obj.scaleY = base.scaleY * (1 + breatheWave(acc, p) * 0.05 * breathe);
      if (shimmer) obj.alpha = base.alpha * (1 - shimmer * (1 - shimmerWave(acc, p)));
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  return {
    tick(dt: number) { for (const u of updaters) u(dt); },
    stop() { updaters.length = 0; },
  };
}
