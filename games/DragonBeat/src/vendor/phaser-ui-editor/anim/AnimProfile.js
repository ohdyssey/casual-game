/**
 * AnimProfile — UI 애니메이션 성능 프로파일 (순수, Phaser 무의존).
 *
 * 단일 진실원: reduced-motion / 디바이스 티어 / 카테고리별 캡.
 *   해석순: localStorage 'anim_pref'(off|reduced|full) > prefers-reduced-motion > full.
 *   티어: devicePixelRatio·hardwareConcurrency·deviceMemory 휴리스틱(iOS는 deviceMemory 없음 → mid 편향).
 * 전역 활성 핸들 레지스트리: pause-on-hidden + 누수 가드(씬 teardown).
 *
 * 성능 설계: 이 한 모듈을 playLayoutAnims 진입부/엔진 분기에서 읽어 전 레이아웃에 일괄 적용.
 */

const CAPS = {
  low:  { particles: false, maxParticles: 0,  maxEmitters: 0, maxSprings: 2, maxTweens: 6 },
  mid:  { particles: true,  maxParticles: 30, maxEmitters: 1, maxSprings: 4, maxTweens: 12 },
  high: { particles: true,  maxParticles: 60, maxEmitters: 2, maxSprings: 8, maxTweens: 24 },
};

let _profile = null;
let _mqlBound = false;

function _detectTier() {
  try {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
    const mem = (typeof navigator !== 'undefined' && navigator.deviceMemory) || null;   // iOS Safari undefined
    if (cores <= 4 || (mem != null && mem <= 2)) return 'low';
    if (cores >= 8 && (mem == null || mem >= 4) && dpr <= 3) return 'high';
    return 'mid';
  } catch { return 'mid'; }
}

function _detectMotion() {
  try {
    const pref = (typeof localStorage !== 'undefined' && localStorage.getItem('anim_pref')) || '';
    if (pref === 'off' || pref === 'reduced' || pref === 'full') return pref;
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'reduced';
  } catch { /* */ }
  return 'full';
}

/** 메모이즈된 프로파일. (matchMedia 변경/setAnimPref 시 무효화) */
export function getAnimProfile() {
  if (_profile) return _profile;
  try {
    if (!_mqlBound && typeof window !== 'undefined' && window.matchMedia) {
      const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
      const inval = () => { _profile = null; };
      if (mql.addEventListener) mql.addEventListener('change', inval);
      else if (mql.addListener) mql.addListener(inval);
      _mqlBound = true;
    }
  } catch { /* */ }
  const motion = _detectMotion();
  const tier = motion === 'off' ? 'low' : _detectTier();
  const caps = CAPS[tier];
  _profile = {
    motion, tier,
    particles: motion === 'full' && caps.particles,        // reduced/off → 파티클 전면 비활성
    maxParticles: caps.maxParticles,
    maxEmitters: motion === 'full' ? caps.maxEmitters : 0,
    maxSprings: caps.maxSprings,
    maxTweens: caps.maxTweens,
  };
  return _profile;
}

/** 사용자/개발자 모션 설정 변경(off|reduced|full). */
export function setAnimPref(pref) { try { localStorage.setItem('anim_pref', pref); } catch { /* */ } _profile = null; }
export function getAnimPref() { try { return localStorage.getItem('anim_pref') || ''; } catch { return ''; } }
export function invalidateAnimProfile() { _profile = null; }

// ─── 전역 활성 핸들 레지스트리 ───
const _active = new Set();
export function registerHandle(h) { _active.add(h); }
export function unregisterHandle(h) { _active.delete(h); }
export function pauseAllHandles() { for (const h of _active) { try { h.pause(); } catch { /* */ } } }
export function resumeAllHandles() { for (const h of _active) { try { h.resume(); } catch { /* */ } } }
/** 씬 종료 시 해당 씬의 미정지 핸들 강제 해체(누수 가드). */
export function teardownHandlesForScene(scene) { for (const h of [..._active]) { if (h.scene === scene) { try { h.stop(); } catch { /* */ } } } }
export function activeHandleCount() { return _active.size; }
