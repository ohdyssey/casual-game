/**
 * anim/index — UI 애니메이션 멀티엔진 디스패처 + AnimHandle.
 *
 * playLayoutAnims(scene, nodeMap, layout, opts)
 *   - 성능 게이트: getAnimProfile()로 reduced-motion/티어/캡을 진입부에서 일괄 적용.
 *   - 기존 group→ungrouped 타겟 수집 로직 재사용.
 *   - 레거시 anim({type})은 ANIM_PRESETS 경로, v2 anim({category})은 엔진 분기.
 *   - opts.only='idle'(기본): 상시/루프 애니만 자동재생. enter/tap/exit는 fireTrigger로 발화.
 *   - 결과를 단일 AnimHandle(tweens/emitters/springUpdaters/spriteTargets)로 병합 → pause/resume/stop 일원화.
 *
 * 성능: 정지 시 emitter destroy·spring detach·sprite stop까지 완전 해체(누수 가드 + 레지스트리).
 */
import { getAnimProfile, registerHandle, unregisterHandle } from './AnimProfile.js';
import { buildTween } from './engines/tween.js';
import { buildSpring, buildSpringFallback } from './engines/spring.js';
import { buildParticle } from './engines/particle.js';
import { buildSprite } from './engines/sprite.js';
import { buildLegacy } from './engines/legacy.js';

export { ANIM_CATEGORIES, TRIGGERS, EASES, ANIM_TYPES } from './presets.js';
export { PARTICLE_EFFECTS } from './engines/particle.js';
export { getAnimProfile, setAnimPref, getAnimPref, pauseAllHandles, resumeAllHandles, teardownHandlesForScene } from './AnimProfile.js';

export class AnimHandle {
  constructor(scene) {
    this.scene = scene;
    this.tweens = []; this.emitters = []; this.springUpdaters = []; this.spriteTargets = [];
    this.paused = false; this._dead = false;
    registerHandle(this);
  }
  merge(part) {
    if (!part) return;
    if (part.tweens) this.tweens.push(...part.tweens);
    if (part.emitters) this.emitters.push(...part.emitters);
    if (part.springUpdaters) this.springUpdaters.push(...part.springUpdaters);
    if (part.spriteTargets) this.spriteTargets.push(...part.spriteTargets);
  }
  get empty() { return !this.tweens.length && !this.emitters.length && !this.springUpdaters.length && !this.spriteTargets.length; }
  /** 스프링 적분 — 씬 update에서 dt(초) 전달. dead 스프링 자동 정리. */
  tick(dt) {
    if (this.paused || !this.springUpdaters.length) return;
    for (const u of this.springUpdaters) u.update && u.update(dt);
    if (this.springUpdaters.some((u) => u.dead)) this.springUpdaters = this.springUpdaters.filter((u) => !u.dead);
  }
  pause() {
    if (this.paused) return; this.paused = true;
    for (const t of this.tweens) { try { t.pause(); } catch { /* */ } }
    for (const e of this.emitters) { try { e.pause(); } catch { /* */ } }
    for (const s of this.spriteTargets) { try { s.sprite.anims && s.sprite.anims.pause(); } catch { /* */ } }
    for (const u of this.springUpdaters) u.paused = true;
  }
  resume() {
    if (!this.paused) return; this.paused = false;
    for (const t of this.tweens) { try { t.resume(); } catch { /* */ } }
    for (const e of this.emitters) { try { e.resume(); } catch { /* */ } }
    for (const s of this.spriteTargets) { try { s.sprite.anims && s.sprite.anims.resume(); } catch { /* */ } }
    for (const u of this.springUpdaters) u.paused = false;
  }
  stop() {
    if (this._dead) return; this._dead = true;
    for (const t of this.tweens) { try { t.stop(); t.remove(); } catch { /* */ } }
    for (const e of this.emitters) { try { e.stop(); e.destroy(); } catch { /* */ } }
    for (const u of this.springUpdaters) { try { u.reset && u.reset(); } catch { /* */ } }
    for (const s of this.spriteTargets) { try { s.sprite.anims && s.sprite.anims.stop(); } catch { /* */ } }
    this.tweens.length = 0; this.emitters.length = 0; this.springUpdaters.length = 0; this.spriteTargets.length = 0;
    unregisterHandle(this);
  }
}

/** anim이 의미있는 재생 대상인지(none/빈값 제외). */
export function animActive(anim) {
  if (!anim) return false;
  if (anim.category && anim.category !== 'none') return true;
  if (!anim.category && anim.type && anim.type !== 'none') return true;
  return false;
}

// 단일 (anim, targets) → 핸들 병합. counts로 동시 캡 추적.
function _applyAnim(scene, handle, anim, targets, container, profile, onlyTrigger, counts) {
  if (!animActive(anim) || !targets.length) return;
  const cat = anim.category;
  const trigger = anim.trigger || 'idle';

  // 레거시 v1 — idle 취급, reduced면 스킵(루프 제거).
  if (!cat && anim.type) {
    if (onlyTrigger !== 'idle' || profile.motion === 'reduced') return;
    handle.merge(buildLegacy(scene, targets, anim, { oneShot: false }));
    return;
  }
  if (trigger !== onlyTrigger) return;
  const oneShot = trigger !== 'idle';
  const reduced = profile.motion === 'reduced';

  switch (cat) {
    case 'tween':
      if (counts.tweenTargets >= profile.maxTweens) return;
      counts.tweenTargets += targets.length;
      handle.merge(buildTween(scene, targets, anim, { oneShot, reduced }));
      break;
    case 'spring':
      if (reduced && trigger === 'idle') return;             // 루프 스프링 reduced 스킵
      if (counts.springs >= profile.maxSprings) { handle.merge(buildSpringFallback(scene, targets, anim, { trigger })); return; }
      counts.springs += 1;
      handle.merge(buildSpring(scene, targets, anim, { trigger }));
      break;
    case 'particle':
      if (!profile.particles || counts.emitters >= profile.maxEmitters) return;
      counts.emitters += 1;
      handle.merge(buildParticle(scene, targets, anim, container, { trigger }));
      break;
    case 'sprite':
      if (reduced && trigger === 'idle') { handle.merge(buildSprite(scene, targets, anim, { oneShot: true })); return; }
      handle.merge(buildSprite(scene, targets, anim, { oneShot }));
      break;
    default: break;
  }
}

/**
 * 레이아웃의 (트리거에 맞는) 애니메이션 재생 → AnimHandle.
 * @param opts {only?: trigger, container?: Phaser.Container}
 */
export function playLayoutAnims(scene, nodeMap, layout, opts = {}) {
  const handle = new AnimHandle(scene);
  const profile = getAnimProfile();
  if (profile.motion === 'off' || (layout && layout.animEnabled === false)) return handle;
  const onlyTrigger = opts.only || 'idle';
  const container = opts.container || null;
  const counts = { tweenTargets: 0, springs: 0, emitters: 0 };

  // 우선순위: 노드 자신의 anim > 그룹 anim. 자기 anim 이 있는 멤버는 그룹 타겟에서 제외하고
  //   개별 anim 으로 재생(폴더로 묶어도 레이어별 애니 저작 가능). anim 없는 멤버만 그룹 anim 적용.
  const inGroup = new Set();
  for (const g of (layout.groups || [])) {
    const targets = [];
    for (const node of layout.nodes) {
      if (node.group !== g.id) continue;
      inGroup.add(node.id);
      if (animActive(node.anim)) continue;          // 개별 anim 보유 멤버 — 아래 노드 루프에서 재생
      const e = nodeMap.get(node.id); if (e) targets.push(...e.objects);
    }
    _applyAnim(scene, handle, g.anim, targets, container, profile, onlyTrigger, counts);
  }
  for (const node of layout.nodes) {
    if (inGroup.has(node.id) && !animActive(node.anim)) continue;
    const e = nodeMap.get(node.id); if (!e || !e.objects.length) continue;
    _applyAnim(scene, handle, node.anim, e.objects, container, profile, onlyTrigger, counts);
  }
  return handle;
}

/** 특정 타겟에 anim을 1회 발화(에디터 트리거 테스트 / 게임 enter·tap). */
export function playAnimForTargets(scene, targets, anim, container) {
  const handle = new AnimHandle(scene);
  if (!animActive(anim) || !targets.length) return handle;
  const profile = getAnimProfile();
  if (profile.motion === 'off') return handle;
  const cat = anim.category;
  if (!cat && anim.type) { handle.merge(buildLegacy(scene, targets, anim, { oneShot: true })); return handle; }
  switch (cat) {
    case 'tween':   handle.merge(buildTween(scene, targets, anim, { oneShot: true, reduced: profile.motion === 'reduced' })); break;
    case 'spring':  handle.merge(buildSpring(scene, targets, anim, { trigger: 'tap' })); break;
    case 'particle': if (profile.particles) handle.merge(buildParticle(scene, targets, anim, container, { trigger: 'tap' })); break;
    case 'sprite':  handle.merge(buildSprite(scene, targets, anim, { oneShot: true })); break;
    default: break;
  }
  return handle;
}

/** AnimHandle | Tween[] 모두 정지. */
export function stopLayoutAnims(h) {
  if (!h) return;
  if (h instanceof AnimHandle) { h.stop(); return; }
  if (Array.isArray(h)) { for (const t of h) { try { t.stop(); t.remove(); } catch { /* */ } } }
}

export function pauseLayoutAnims(h) { if (h instanceof AnimHandle) h.pause(); }
export function resumeLayoutAnims(h) { if (h instanceof AnimHandle) h.resume(); }

/** 레거시 v1 anim을 v2 tween/category로 인메모리 변환(편집 시). 시각은 동일. */
export function migrateAnim(anim) {
  if (!anim || !anim.type || anim.category) return anim;
  const amp = anim.amp ?? 0.5, dur = anim.dur ?? 600;
  const base = { category: 'tween', trigger: 'idle', delay: 0, tween: { ease: 'Sine.easeInOut', duration: dur, yoyo: true, repeat: -1, props: {} } };
  switch (anim.type) {
    case 'pulse':  base.tween.props.scale = { to: '*=' + (1 + amp * 0.2) }; break;
    case 'bounce': base.tween.props.y = { to: '-=' + (amp * 40) }; break;
    case 'fade':   base.tween.props.alpha = { to: '*=' + (1 - amp * 0.6) }; break;
    case 'sway':   base.tween.props.angle = { from: -(amp * 16), to: amp * 16 }; break;
    case 'spin':   base.tween.props.angle = { to: '+=360' }; base.tween.ease = 'Linear'; base.tween.yoyo = false; base.tween.duration = Math.max(400, dur * 4); break;
    default: return anim;
  }
  return base;
}
