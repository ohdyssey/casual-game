/**
 * 오디오 시스템(게임-로컬, P1). SFX 20종 + BGM 1(32s 루프).
 *   - MP3(범용 웹/PWA/iOS). LoadScene 에서 loadAudio()로 프리로드.
 *   - sfx(scene, key): 단발 효과음. startBgm/stopBgm: 루프 배경음(씬 전환에도 지속).
 *   - 브라우저 자동재생 정책: 첫 사용자 제스처 전엔 잠김 → unlock 후 BGM 시작.
 */
import Phaser from 'phaser';

/** 오디오 매니페스트(텍스처 키 ↔ public 경로). */
export const AUDIO_ASSETS: Record<string, string> = {
  sfx_button_tap: 'assets/store/audio/ui_button_tap.mp3',
  sfx_popup_open: 'assets/store/audio/ui_popup_open.mp3',
  sfx_popup_close: 'assets/store/audio/ui_popup_close.mp3',
  sfx_item_select: 'assets/store/audio/item_select.mp3',
  sfx_item_place: 'assets/store/audio/item_place_soft.mp3',
  sfx_item_invalid: 'assets/store/audio/item_invalid.mp3',
  sfx_item_return: 'assets/store/audio/item_return.mp3',
  sfx_match: 'assets/store/audio/match_3.mp3',
  sfx_match_collect: 'assets/store/audio/match_collect.mp3',
  sfx_combo_2: 'assets/store/audio/combo_2.mp3',
  sfx_combo_3: 'assets/store/audio/combo_3.mp3',
  sfx_combo_4: 'assets/store/audio/combo_4_plus.mp3',
  sfx_timer_warning: 'assets/store/audio/timer_10sec_warning.mp3',
  sfx_timer_tick: 'assets/store/audio/timer_countdown_tick.mp3',
  sfx_level_start: 'assets/store/audio/level_start.mp3',
  sfx_level_clear: 'assets/store/audio/level_clear.mp3',
  sfx_level_fail: 'assets/store/audio/level_fail.mp3',
  sfx_star: 'assets/store/audio/star_earn.mp3',
  sfx_hammer_select: 'assets/store/audio/booster_hammer_select.mp3',
  sfx_hammer_hit: 'assets/store/audio/booster_hammer_hit.mp3',
  bgm_main: 'assets/store/audio/bgm_main_store_puzzle_loop_32s.mp3',
};

/** 키별 볼륨(미세 밸런스). 미지정 시 기본값. */
const VOL: Record<string, number> = {
  sfx_button_tap: 0.5,
  sfx_popup_open: 0.55,
  sfx_popup_close: 0.5,
  sfx_item_select: 0.45,
  sfx_item_place: 0.5,
  sfx_item_invalid: 0.5,
  sfx_item_return: 0.45,
  sfx_match: 0.6,
  sfx_match_collect: 0.55,
  sfx_combo_2: 0.55,
  sfx_combo_3: 0.6,
  sfx_combo_4: 0.65,
  sfx_timer_warning: 0.6,
  sfx_timer_tick: 0.4,
  sfx_level_start: 0.6,
  sfx_level_clear: 0.7,
  sfx_level_fail: 0.6,
  sfx_star: 0.6,
  sfx_hammer_select: 0.5,
  sfx_hammer_hit: 0.6,
};
const DEFAULT_VOL = 0.55;
const BGM_VOL = 0.3;

let sfxOn = true;
let bgmOn = false;
let bgm: Phaser.Sound.BaseSound | null = null;

/** LoadScene.preload 에서 호출 — 모든 오디오 프리로드. */
export function loadAudio(scene: Phaser.Scene): void {
  for (const [key, path] of Object.entries(AUDIO_ASSETS)) scene.load.audio(key, path);
}

/** 단발 효과음 재생(없거나 끄면 무시, 예외 무시). */
export function sfx(scene: Phaser.Scene, key: string): void {
  if (!sfxOn) return;
  try {
    if (!scene.cache.audio.exists(key)) return;
    scene.sound.play(key, { volume: VOL[key] ?? DEFAULT_VOL });
  } catch {
    /* 오디오 실패는 게임에 치명적이지 않음 — 무시 */
  }
}

/** 루프 BGM 시작(이미 재생 중이면 무시). 자동재생 잠김 시 unlock 후 시작. */
export function startBgm(scene: Phaser.Scene): void {
  if (!bgmOn) return;
  try {
    if (!scene.cache.audio.exists('bgm_main')) return;
    if (!bgm) bgm = scene.sound.add('bgm_main', { loop: true, volume: BGM_VOL });
    if (bgm.isPlaying) return;
    const play = (): void => {
      try {
        if (bgm && !bgm.isPlaying) bgm.play();
      } catch {
        /* noop */
      }
    };
    if (scene.sound.locked) scene.sound.once('unlocked', play);
    else play();
  } catch {
    /* noop */
  }
}

export function stopBgm(): void {
  try {
    bgm?.stop();
  } catch {
    /* noop */
  }
}

export function isSfxOn(): boolean {
  return sfxOn;
}
export function isBgmOn(): boolean {
  return bgmOn;
}
export function setSfxEnabled(on: boolean): void {
  sfxOn = on;
}
export function setBgmEnabled(scene: Phaser.Scene, on: boolean): void {
  bgmOn = on;
  if (!on) stopBgm();
  else startBgm(scene);
}
