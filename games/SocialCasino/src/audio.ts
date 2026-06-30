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
  // ⭐미션 타임어택 사운드 — **bomb_countdown_sfx_pack**(요청 2026-06-30). 긴장도 에스컬레이션:
  //   30초=부드러운 챔 → 20초=긴급 트리플 → **10~1초 초별 비프 카운트다운(촉박)** → 미완료=폭탄 폭발.
  //   ⭐카운트다운은 **초별 분리형 비프**(표시 타이머에 정확 동기 — 어텍/레이드로 시간이 멈추면 비프도 멈춤. 단일 10초 클립이면 어긋남).
  missionSuccess: 'mission_success_short_under_5sec.wav', // ⭐미션 성공(밝은 상승 멜로디+반짝임, ~4.65s) — 폭탄 실패와 대비(요청)
  missionWarn30: '01_warning_30sec_soft_chime.wav', // 30초 경고(부드러운 알림)
  missionWarn20: '02_warning_20sec_urgent_triple.wav', // 20초 경고(긴급 트리플)
  missionFail: '04_fail_bomb_explosion_gameover.wav', // 실패(폭탄 폭발 + 게임오버)
  missionCount1: 'countdown_01sec_beep.wav',
  missionCount2: 'countdown_02sec_beep.wav',
  missionCount3: 'countdown_03sec_beep.wav',
  missionCount4: 'countdown_04sec_beep.wav',
  missionCount5: 'countdown_05sec_beep.wav',
  missionCount6: 'countdown_06sec_beep.wav',
  missionCount7: 'countdown_07sec_beep.wav',
  missionCount8: 'countdown_08sec_beep.wav',
  missionCount9: 'countdown_09sec_beep.wav',
  missionCount10: 'countdown_10sec_beep.wav',
} as const;

export type SfxKey = keyof typeof SFX;
const SFX_DIR = 'sfx';

// ── 사운드 on/off 설정(메뉴 → 설정에서 토글, 영속) ──────────────────────────────
//   ⭐Phaser 전역 mute 는 음악/효과음을 분리 못하므로 **효과음 플래그**(Sfx 가 존중)와 **음악 볼륨**을 따로 둔다.
//   모듈 로드 시 localStorage 에서 초기화 → 부팅 배선 불필요(자체 완결). '0' 이면 OFF, 그 외/없음=ON(기본 켜짐).
const SFX_PREF_KEY = 'socialcasino_sfx_on_v1';
const MUSIC_PREF_KEY = 'socialcasino_music_on_v1';
const readPref = (k: string): boolean => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(k) !== '0' : true;
  } catch {
    return true;
  }
};
const writePref = (k: string, on: boolean): void => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(k, on ? '1' : '0');
  } catch {
    /* 무시 */
  }
};
let sfxEnabled = readPref(SFX_PREF_KEY);
let musicEnabled = readPref(MUSIC_PREF_KEY);

/** 효과음 on/off 상태. */
export const isSfxEnabled = (): boolean => sfxEnabled;
/** 음악 on/off 상태. */
export const isMusicEnabled = (): boolean => musicEnabled;

/** 효과음 on/off 설정(영속) — off 면 Sfx.play/loopStart/playTracked 가 무음. */
export function setSfxEnabled(on: boolean): void {
  sfxEnabled = on;
  writePref(SFX_PREF_KEY, on);
}

/** 음악 on/off 설정(영속) — BGM 볼륨을 0↔기본으로. (BGM 인스턴스는 유지하고 볼륨만 조절해 토글 즉시 반영.) */
export function setMusicEnabled(on: boolean): void {
  musicEnabled = on;
  writePref(MUSIC_PREF_KEY, on);
  setBgmVolume(on ? BGM_VOLUME : 0);
}

/** assets preload 에서 호출 — 사용 SFX 일괄 로드. SFX 값에 확장자 포함(.mp3/.wav 혼용). */
export function loadSfx(scene: Phaser.Scene): void {
  for (const file of Object.values(SFX)) {
    if (!scene.cache.audio.exists(file)) scene.load.audio(file, `${SFX_DIR}/${file}`);
  }
}

// ── 배경음(BGM) ──
/** ⭐BGM = Lucky Lounge 루프. **MP4(AAC) 우선 + OGG 폴백**(Chrome/Safari=mp4·일부 Chromium 빌드 AAC 미지원 시 ogg). wav 19.5MB→mp4 2.27MB. */
export const BGM_KEY = 'bgm_lounge';
const BGM_FILES = ['matchslot_bgm_loop.mp4', 'matchslot_bgm_loop.ogg'];
/** BGM 기본 볼륨 — SFX 아래로 은은하게(사용자 소음 민감 고려). */
const BGM_VOLUME = 0.3;
let bgmSound: Phaser.Sound.BaseSound | null = null;

/** BGM 적재(loadGameAssets 에서 호출). 다중 URL → 브라우저가 지원 포맷 자동 선택(mp4 우선). */
export function loadBgm(scene: Phaser.Scene): void {
  if (!scene.cache.audio.exists(BGM_KEY)) scene.load.audio(BGM_KEY, BGM_FILES.map((f) => `${SFX_DIR}/${f}`));
}

/** BGM 루프 시작 — 이미 재생 중이면 무시(전 화면에서 호출해도 단일 인스턴스). 오디오 잠금 시 첫 사용자 입력에 자동 시작. */
export function startBgm(scene: Phaser.Scene, volume = BGM_VOLUME): void {
  if (bgmSound && (bgmSound as { isPlaying?: boolean }).isPlaying) return;
  if (!scene.cache.audio.exists(BGM_KEY)) return;
  const begin = (): void => {
    if (bgmSound && (bgmSound as { isPlaying?: boolean }).isPlaying) return;
    try {
      bgmSound = scene.sound.add(BGM_KEY, { loop: true, volume: musicEnabled ? volume : 0 }); // 음악 OFF 면 무음으로 시작(토글 시 볼륨만 복구)
      bgmSound.play();
    } catch {
      /* 재생 실패 무시 */
    }
  };
  if (scene.sound.locked) scene.sound.once(Phaser.Sound.Events.UNLOCKED, begin);
  else begin();
}

/** BGM 볼륨 조정(0~1). */
export function setBgmVolume(v: number): void {
  try {
    (bgmSound as Phaser.Sound.WebAudioSound | null)?.setVolume(Math.max(0, Math.min(1, v)));
  } catch {
    /* 무시 */
  }
}

/** BGM 정지/해제. */
export function stopBgm(): void {
  try {
    bgmSound?.stop();
    bgmSound?.destroy();
  } catch {
    /* 무시 */
  }
  bgmSound = null;
}

export class Sfx {
  private readonly scene: Phaser.Scene;
  private readonly master = 0.85;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** 짧은 일회성 효과음. (효과음 OFF 면 무음.) */
  play(key: SfxKey, volume = 1): void {
    if (!sfxEnabled) return;
    const file = SFX[key];
    if (this.scene.cache.audio.exists(file)) this.scene.sound.play(file, { volume: volume * this.master });
  }

  /** 루프 사운드 시작(릴 회전음 등). 반환값을 fadeStop 으로 끝낸다. (효과음 OFF 면 미재생.) */
  loopStart(key: SfxKey, volume = 0.5): Phaser.Sound.BaseSound | null {
    if (!sfxEnabled) return null;
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
    if (!sfxEnabled) return null;
    const file = SFX[key];
    if (!this.scene.cache.audio.exists(file)) return null;
    const s = this.scene.sound.add(file, { loop, volume: volume * this.master });
    s.play();
    return s;
  }

  /** 긴/루프 사운드를 뒷단을 줄이며(volume→0) 자연스럽게 종료 후 해제.
   *  ⚠️ 이미 파괴/정지된 사운드를 다시 넘기면 WebAudioSound.volume 게터가 null gainNode 를 읽어 **throw** 한다
   *     (같은 루프음을 두 번 fadeStop 하면 호출자까지 예외 전파 → 복귀 로직이 중단되던 버그). 전 구간 예외 격리. */
  fadeStop(sound: Phaser.Sound.BaseSound | null | undefined, ms = 180): void {
    if (!sound) return;
    const snd = sound as Phaser.Sound.WebAudioSound;
    if (snd.pendingRemove) return; // 이미 해제 대기 중 — 무시
    let from: number;
    try {
      from = typeof snd.volume === 'number' ? snd.volume : this.master;
    } catch {
      return; // 파괴된 사운드(gainNode null) — 안전하게 무시
    }
    this.scene.tweens.addCounter({
      from,
      to: 0,
      duration: ms,
      onUpdate: (tw) => {
        try {
          snd.setVolume(tw.getValue() ?? 0);
        } catch {
          /* 페이드 중 파괴됨 — 무시 */
        }
      },
      onComplete: () => {
        try {
          sound.destroy();
        } catch {
          /* 이미 파괴됨 — 무시 */
        }
      },
    });
  }
}
