/**
 * Music — 전역 BGM 관리 (씬 간 유지).
 *
 * 사용법:
 *   import { playMusic, crossfadeMusic, stopMusic } from '../systems/Music.js';
 *   crossfadeMusic(this, 'music_01');   // 부드러운 전환
 *   playMusic(this, 'music_02');        // 즉시 교체
 *
 * 같은 키 재요청 시 no-op (이미 재생 중이면 무시).
 */

import { AUDIO_ASSETS } from '../config/assets.config.js';

let _currentKey = null;
let _currentSound = null;
// BGM 지연로드(부트 경량화) — 캐시 미존재 키를 필요 시 로드 후 재생. 중복 로드 방지 set.
const _loadingKeys = new Set();
function _ensureLoaded(scene, key, onReady) {
  if (scene?.cache?.audio?.exists?.(key)) { onReady(); return; }
  if (_loadingKeys.has(key)) return;                      // 이미 로딩 중
  const path = AUDIO_ASSETS?.[key];
  if (!path || !scene?.load) return;                      // 경로/로더 없음 — 무시
  _loadingKeys.add(key);
  scene.load.once('filecomplete-audio-' + key, () => { _loadingKeys.delete(key); onReady(); });
  scene.load.once('loaderror', () => { _loadingKeys.delete(key); });
  scene.load.audio(key, path);
  scene.load.start();
}
// 진행 중인 페이드 트윈/타이머 추적 — 씬 teardown(killAll) 시에도 직접 정리하기 위함.
let _fadeTweens = [];
let _fadeTimers = [];
// 페이드아웃 중인 "이전 사운드" 폐기 클로저 — teardown/재크로스페이드 시 직접 폐기 보장.
//   (tween.remove()/timer.remove(false) 는 onComplete 를 실행하지 않으므로 별도 추적 필수.)
let _fadeDisposers = [];

const DEFAULT_VOLUME = 0.45;

// 사운드 안전 폐기 (이미 파괴된 객체 대비 try/catch).
function _disposeSound(sound) {
  if (!sound) return;
  try { sound.stop(); } catch (_) {}
  try { sound.destroy(); } catch (_) {}
}

// 진행 중이던 페이드 트윈/타이머를 모두 정리 (중복 onComplete/delayedCall 방지).
function _clearPendingFades() {
  for (const t of _fadeTweens) {
    try { t.remove(); } catch (_) {}
  }
  for (const timer of _fadeTimers) {
    try { timer.remove(false); } catch (_) {}
  }
  // tween/timer 제거는 onComplete 를 실행하지 않는다(BaseTween.remove / TimerEvent.remove(false)).
  //   따라서 페이드아웃 중이던 이전 사운드를 여기서 직접 폐기하지 않으면, loop 사운드가
  //   다른 씬에서도 계속 재생되고 Sound 객체가 누수된다(전역 sound 매니저라 씬 종료로 안 죽음).
  //   disposeOld 는 oldDisposed 가드로 멱등 — 이미 폐기됐으면 no-op.
  for (const dispose of _fadeDisposers) {
    try { dispose(); } catch (_) {}
  }
  _fadeTweens = [];
  _fadeTimers = [];
  _fadeDisposers = [];
}

// ─── 즉시 전환 (no fade) ───
export function playMusic(scene, key, opts = {}) {
  const volume = opts.volume ?? DEFAULT_VOLUME;
  if (_currentKey === key && _currentSound?.isPlaying) return;

  if (!scene?.cache?.audio?.exists?.(key)) {
    _ensureLoaded(scene, key, () => playMusic(scene, key, opts));   // 지연로드 후 재생(현재 음악 유지)
    return;
  }

  _disposeCurrent();
  try {
    _currentSound = scene.sound.add(key, { volume, loop: true });
    _currentSound.play();
    _currentKey = key;
  } catch (e) {
    _currentSound = null;
    _currentKey = null;
  }
}

// ─── 크로스페이드 전환 ───
//   duration ms 동안 이전 음악 fade out + 새 음악 fade in.
export function crossfadeMusic(scene, key, opts = {}) {
  const duration = opts.duration ?? 700;
  const targetVolume = opts.volume ?? DEFAULT_VOLUME;
  if (_currentKey === key && _currentSound?.isPlaying) return;
  if (!scene?.cache?.audio?.exists?.(key)) {
    _ensureLoaded(scene, key, () => crossfadeMusic(scene, key, opts));   // 지연로드 후 전환(현재 음악 유지)
    return;
  }

  let newSound;
  try {
    newSound = scene.sound.add(key, { volume: 0, loop: true });
    newSound.play();
  } catch (e) {
    return;
  }

  // 이전 크로스페이드가 남아 있으면(빠른 씬 전환) 먼저 정리.
  _clearPendingFades();

  const fadeIn = scene.tweens.add({
    targets: newSound, volume: targetVolume,
    duration, ease: 'Sine.Out',
  });
  _fadeTweens.push(fadeIn);

  if (_currentSound) {
    const old = _currentSound;
    // 한 번만 폐기되도록 가드 — tween onComplete / delayedCall 양쪽 중 먼저 도착한 쪽만 실행.
    let oldDisposed = false;
    const disposeOld = () => {
      if (oldDisposed) return;
      oldDisposed = true;
      _disposeSound(old);
    };
    _fadeDisposers.push(disposeOld);
    const fadeOut = scene.tweens.add({
      targets: old, volume: 0,
      duration, ease: 'Sine.Out',
      onComplete: disposeOld,
    });
    _fadeTweens.push(fadeOut);
    // 씬 teardown(this.tweens.killAll())은 onComplete 를 실행하지 않으므로
    // 트윈과 독립적인 타이머로도 폐기를 보장한다.
    try {
      const timer = scene.time.delayedCall(duration + 50, disposeOld);
      if (timer) _fadeTimers.push(timer);
    } catch (_) {
      // time 매니저가 없으면(드문 경우) 즉시 폐기로 폴백.
      disposeOld();
    }
  }

  _currentSound = newSound;
  _currentKey = key;
}

export function stopMusic() {
  _disposeCurrent();
}

export function getCurrentMusicKey() {
  return _currentKey;
}

function _disposeCurrent() {
  // 진행 중 페이드 트윈/타이머를 먼저 정리 — 죽은 씬의 onComplete 가
  // 사라진 사운드를 건드리지 못하도록.
  _clearPendingFades();
  _disposeSound(_currentSound);
  _currentSound = null;
  _currentKey = null;
}
