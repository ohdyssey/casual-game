/**
 * spring 엔진 — 강성(k)/감쇠(c)/질량(m) 적분기 (Hook.js _bump 패턴 포팅).
 *   offset 모델: obj[prop] = base + x. 정지 시 reset()으로 base 복원(재렌더 복원 계약 유지).
 *   **auto-settle**: |v|·|x|<ε 면 dead 처리(영원히 도는 스프링 금지 — 배터리 보호).
 *     idle 트리거는 settle 시 재임펄스(호흡), tap은 1회 오버슈트 후 정착.
 *   per-frame update(dt)는 AnimHandle.tick 에서 호출. dt는 1/30 클램프(탭 복귀 폭발 방지).
 */
const PROP_MAP = { scale: ['scaleX', 'scaleY'], scaleX: ['scaleX'], scaleY: ['scaleY'], x: ['x'], y: ['y'], angle: ['angle'], rotation: ['rotation'], alpha: ['alpha'] };

export function buildSpring(scene, targets, anim, opts = {}) {
  const s = anim.spring || {};
  const props = PROP_MAP[s.prop || 'scale'] || ['scaleX', 'scaleY'];
  const k = s.stiffness ?? 120, c = s.damping ?? 12, m = s.mass ?? 1;
  const to = s.to ?? (s.prop && s.prop !== 'scale' ? 0 : 1.12);
  const trigger = opts.trigger || 'idle';
  const updaters = [];

  for (const obj of targets) {
    if (obj == null) continue;
    const isScale = props[0].startsWith('scale');
    const base = {};
    for (const p of props) base[p] = obj[p] ?? (isScale ? 1 : 0);
    const restBase = base[props[0]];
    // 목표 변위(offset)
    const peak = isScale ? (to - 1) : (to - restBase);
    const impulse = peak * 9;             // 임펄스 속도(오버슈트 강도)

    const u = {
      obj, props, base,
      x: 0, v: trigger === 'tap' ? impulse : 0,
      target: 0,                           // 항상 base로 정착(idle은 재임펄스로 호흡)
      paused: false, dead: false,
    };
    if (trigger === 'idle') u.v = impulse; // 시작 시 한 번 튕김
    u.update = (dt) => {
      if (u.paused || u.dead) return;
      const d = Math.min(dt, 1 / 30);
      const a = (-k * (u.x - u.target) - c * u.v) / m;
      u.v += a * d; u.x += u.v * d;
      for (const p of props) obj[p] = base[p] + u.x;
      if (Math.abs(u.v) < 0.0009 && Math.abs(u.x - u.target) < 0.0009) {
        if (trigger === 'idle') { u.x = u.target; u.v = impulse; }   // 재임펄스(호흡 루프)
        else { for (const p of props) obj[p] = base[p]; u.dead = true; }
      }
    };
    u.reset = () => { for (const p of props) obj[p] = base[p]; u.dead = true; };
    updaters.push(u);
  }
  return { springUpdaters: updaters };
}

/** 스프링 캡 초과 시 폴백 — Back.easeOut 트윈으로 근사(루프=yoyo). */
export function buildSpringFallback(scene, targets, anim, opts = {}) {
  const s = anim.spring || {};
  const isScale = !s.prop || s.prop === 'scale';
  const to = s.to ?? (isScale ? 1.12 : 0);
  const key = isScale ? 'scale' : s.prop;
  const cfg = { targets, [key]: to, duration: 420, ease: 'Back.easeOut', delay: anim.delay || 0 };
  if (opts.trigger === 'idle') { cfg.yoyo = true; cfg.repeat = -1; cfg.ease = 'Sine.easeInOut'; }
  else { cfg.yoyo = true; cfg.repeat = 0; }   // tap: 1회 왕복
  return { tweens: [scene.tweens.add(cfg)] };
}
