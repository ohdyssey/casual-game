/**
 * tween 엔진 — 변형(위치/스케일/회전) + 속성(알파/틴트) 통합.
 *   props 의 각 채널은 상대('+='/'*=')/절대/{from,to} 지원(Phaser 트윈 그대로).
 *   틴트는 트윈 키로 직접 보간 불가 → driver + onUpdate 색보간.
 */
import Phaser from 'phaser';

const CHANNELS = ['x', 'y', 'scale', 'scaleX', 'scaleY', 'angle', 'rotation', 'alpha'];

export function buildTween(scene, targets, anim, opts = {}) {
  const t = anim.tween || {};
  const props = t.props || {};
  const reduced = !!opts.reduced;
  const base = {
    duration: t.duration ?? 600,
    ease: t.ease || 'Sine.easeInOut',
    yoyo: reduced ? false : !!t.yoyo,
    repeat: (opts.oneShot || reduced) ? 0 : (t.repeat ?? 0),
    repeatDelay: t.repeatDelay ?? 0,
    delay: anim.delay || 0,
    hold: t.hold ?? 0,
  };
  const out = { tweens: [] };

  // 변형/알파 채널
  const tcfg = { targets, ...base };
  let hasT = false;
  for (const k of CHANNELS) {
    if (props[k] == null) continue;
    const v = props[k];
    tcfg[k] = (v && typeof v === 'object') ? { from: v.from, to: v.to } : v;
    hasT = true;
  }
  if (t.stagger && targets.length > 1) tcfg.delay = scene.tweens.stagger(t.stagger, { start: anim.delay || 0 });
  if (hasT) out.tweens.push(scene.tweens.add(tcfg));

  // 틴트(색) 보간
  if (props.tint && props.tint.from != null && props.tint.to != null) {
    const from = Phaser.Display.Color.ValueToColor(props.tint.from);
    const to = Phaser.Display.Color.ValueToColor(props.tint.to);
    const driver = { v: 0 };
    out.tweens.push(scene.tweens.add({
      targets: driver, v: 1, ...base,
      onUpdate: () => {
        const col = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, 100, Math.round(driver.v * 100));
        const tint = (col.r << 16) | (col.g << 8) | col.b;
        for (const o of targets) o.setTint && o.setTint(tint);
      },
      onStop: () => { for (const o of targets) o.clearTint && o.clearTint(); },
    }));
  }
  return out;
}
