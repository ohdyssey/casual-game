/**
 * audio.ts — 간단 SFX 매니저(Phaser sound). public/sfx/*.wav.
 *
 * 짧은 효과음은 play(), 행위보다 긴 음(릴 회전 루프 등)은 loopStart()로 시작했다가 fadeStop()으로
 * 뒷단을 줄이며 종료해 행위 길이에 맞춰 자연스럽게 끊는다(요청).
 */
import Phaser from 'phaser';

/** SFX 키 → 파일명(확장자 포함). public/sfx/<file>. (mp3=ElevenLabs, wav=기존 팩) */
export const SFX = {
  // 슬롯머신/승리/코인 — ElevenLabs(2026-06-23). 긴 클립은 호출부에서 길이매칭+페이드.
  reelLoop: 'eleven_reel_spin_loop.mp3', // MACHMech 슬롯 회전음(사용자 지정) → 스핀 길이만 재생 후 fadeStop
  reelStop: 'eleven_reel_stop.mp3', // ElevenLabs reel_st 0.30s 클랙(5릴 스태거용)
  reelStopFinal: 'eleven_reel_stop_final.mp3', // 0.55s — 마지막 릴 살짝 묵직
  spinButton: 'eleven_spin_button.mp3',
  lever: 'eleven_lever_pull.mp3', // 레버 당기는 소리(스핀 시작 — 퍼즐/슬롯 양 모드 공통)
  winSmall: 'eleven_win_small.mp3',
  winMedium: 'eleven_win_medium.mp3',
  winBig: 'eleven_win_big.mp3',
  jackpot: 'eleven_jackpot.mp3', // 카지노 빅토리 explosion
  countUp: 'reward_score_count_up.wav',
  coin: 'eleven_coin_drop.mp3', // ⭐코인 드랍 — 버스트 스트림 길이만큼 재생 후 페이드
  // 퍼즐/UI — 2차 교체 예정이라 일단 유지(기존 wav).
  select: 'puzzle_tile_select_01.wav',
  swap: 'puzzle_tile_swap.wav',
  match3: 'puzzle_match_3_casual.wav',
  match4: 'puzzle_match_4_special.wav',
  match5: 'puzzle_match_5_bonus.wav',
  combo: 'puzzle_combo_01.wav',
  drop: 'puzzle_tile_drop.wav',
  error: 'ui_error_no_match.wav',
  click: 'ui_button_click_casual.wav',
  shuffle: 'powerup_shuffle_tiles.wav',
} as const;

export type SfxKey = keyof typeof SFX;
const SFX_DIR = 'sfx';

/** assets preload 에서 호출 — 사용 SFX 일괄 로드. SFX 값에 확장자 포함(.mp3/.wav 혼용). */
export function loadSfx(scene: Phaser.Scene): void {
  for (const file of Object.values(SFX)) {
    if (!scene.cache.audio.exists(file)) scene.load.audio(file, `${SFX_DIR}/${file}`);
  }
}

export class Sfx {
  private readonly scene: Phaser.Scene;
  private readonly master = 0.85;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** 짧은 일회성 효과음. */
  play(key: SfxKey, volume = 1): void {
    const file = SFX[key];
    if (this.scene.cache.audio.exists(file)) this.scene.sound.play(file, { volume: volume * this.master });
  }

  /** 루프 사운드 시작(릴 회전음 등). 반환값을 fadeStop 으로 끝낸다. */
  loopStart(key: SfxKey, volume = 0.5): Phaser.Sound.BaseSound | null {
    const file = SFX[key];
    if (!this.scene.cache.audio.exists(file)) return null;
    const s = this.scene.sound.add(file, { loop: true, volume: volume * this.master });
    s.play();
    return s;
  }

  /**
   * 일회성이지만 길이를 제어할 사운드(코인 드랍 등) — 인스턴스를 반환해 애니 길이에 맞춰
   * fadeStop 으로 볼륨을 줄이며 끊는다. loop 옵션으로 애니가 사운드보다 길면 이어 깔 수도 있다.
   */
  playTracked(key: SfxKey, volume = 1, loop = false): Phaser.Sound.BaseSound | null {
    const file = SFX[key];
    if (!this.scene.cache.audio.exists(file)) return null;
    const s = this.scene.sound.add(file, { loop, volume: volume * this.master });
    s.play();
    return s;
  }

  /** 긴/루프 사운드를 뒷단을 줄이며(volume→0) 자연스럽게 종료 후 해제. */
  fadeStop(sound: Phaser.Sound.BaseSound | null | undefined, ms = 180): void {
    if (!sound) return;
    const snd = sound as Phaser.Sound.WebAudioSound;
    const from = typeof snd.volume === 'number' ? snd.volume : this.master;
    this.scene.tweens.addCounter({
      from,
      to: 0,
      duration: ms,
      onUpdate: (tw) => snd.setVolume(tw.getValue() ?? 0),
      onComplete: () => sound.destroy(),
    });
  }
}
