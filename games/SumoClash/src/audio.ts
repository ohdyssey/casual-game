/**
 * 오디오 시스템(게임-로컬) — 스모대전 사운드팩 v2(taiko/hyoshigi/shamisen 계열).
 *   MP4/AAC 컨테이너(확장자 .m4a — Phaser 오디오 지원 목록이 'mp4' 미인식, 'm4a'는 인식).
 *   WAV 원본을 ffmpeg 로 인코딩(15MB→0.65MB). Phaser WebAudio 디코드.
 *   sfx(scene, key): 단발 효과음 · startBgm/stopBgm: 32s 루프 배경음(씬 지속).
 *   브라우저 자동재생 정책: 첫 제스처 전 잠김 → unlock 후 BGM 시작.
 */
import Phaser from 'phaser';

/** 오디오 매니페스트(키 ↔ public 경로). */
export const AUDIO_ASSETS: Record<string, string> = {
  sfx_deploy: 'audio/sfx_deploy.m4a', // 유닛 배치(카드 → 레인)
  sfx_charge_pop: 'audio/sfx_charge_pop.m4a', // NEXT 충전 완료
  sfx_clash: 'audio/sfx_clash.m4a', // 스크럼 접촉(선두끼리 부딪힘)
  sfx_ko_drain: 'audio/sfx_ko_drain.m4a', // 기력 소진 처치
  sfx_ringout: 'audio/sfx_ringout.m4a', // 아군이 하단 끝선 밖으로 밀려남(실점)
  sfx_ringout_score: 'audio/sfx_ringout_score.m4a', // 적을 상단 밖으로 밀어냄/러너 돌파(득점)
  sfx_bounty: 'audio/sfx_bounty.m4a', // 처치·밀어내기 보상 마나 획득
  sfx_ability: 'audio/sfx_ability_sumospirit.m4a', // 특수기 발동
  sfx_button: 'audio/sfx_button.m4a', // 카드/버튼 탭
  sfx_start: 'audio/sfx_start.m4a', // 전투 시작
  sfx_win: 'audio/sfx_win.m4a', // 승리
  bgm_main: 'audio/bgm_play_loop_32s.m4a', // 전투 배경음(루프)
};

/** 키별 볼륨(미세 밸런스). */
const VOL: Record<string, number> = {
  sfx_deploy: 0.6,
  sfx_charge_pop: 0.5,
  sfx_clash: 0.55,
  sfx_ko_drain: 0.6,
  sfx_ringout: 0.65,
  sfx_ringout_score: 0.7,
  sfx_bounty: 0.45,
  sfx_ability: 0.7,
  sfx_button: 0.45,
  sfx_start: 0.7,
  sfx_win: 0.8,
};
const DEFAULT_VOL = 0.55;
const BGM_VOL = 0.3;
/** 같은 사운드 연발 스로틀(ms) — clash/ringout 등이 겹쳐 울리는 것 방지. */
const THROTTLE_MS: Record<string, number> = {
  sfx_clash: 120,
  sfx_ko_drain: 90,
  sfx_ringout: 90,
  sfx_ringout_score: 90,
  sfx_bounty: 120,
  sfx_deploy: 60,
};

let sfxOn = true;
let bgmOn = true;
let bgm: Phaser.Sound.BaseSound | null = null;
const lastPlayedAt = new Map<string, number>();

/** LoadScene.preload 에서 호출 — 모든 오디오 프리로드. */
export function loadAudio(scene: Phaser.Scene): void {
  for (const [key, path] of Object.entries(AUDIO_ASSETS)) scene.load.audio(key, path);
}

/** 단발 효과음 재생(없거나 끄면 무시, 스로틀 적용, 예외 무시). */
export function sfx(scene: Phaser.Scene, key: string): void {
  if (!sfxOn) return;
  try {
    if (!scene.cache.audio.exists(key)) return;
    const throttle = THROTTLE_MS[key];
    if (throttle) {
      const now = scene.time.now;
      const last = lastPlayedAt.get(key) ?? -Infinity;
      if (now - last < throttle) return;
      lastPlayedAt.set(key, now);
    }
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
