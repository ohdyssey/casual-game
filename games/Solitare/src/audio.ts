/**
 * audio.ts — Solitaire Heights 사운드팩(m4a/AAC=mp4 오디오)을 WebAudio 로 재생.
 *
 * public/audio/*.m4a 를 fetch→decodeAudioData→AudioBuffer 로 디코드해 BufferSource 로 재생한다.
 * 첫 사용자 제스처에서 AudioContext 를 resume 하고 대기 중인 BGM 을 시작한다. 모든 실패는 무시(오디오는 비치명적).
 *
 * 형제 게임 ZombieArrow 의 파일-오디오 패턴 계승. 믹싱 기본값은 사운드팩 README 권장치.
 */
const AUDIO_BASE = `${(import.meta.env?.BASE_URL as string | undefined) ?? '/'}audio/`;

/** 단발 효과음 이름(파일명은 `sfx_${name}.m4a`). */
export type Sfx =
  | 'card_place'
  | 'card_deal'
  | 'card_invalid'
  | 'combo_step'
  | 'mission_slot'
  | 'set_complete'
  | 'star'
  | 'gauge_full'
  | 'coin_tick'
  | 'coin_burst'
  | 'win_fanfare'
  | 'stuck'
  | 'wild_activate'
  | 'wild_use'
  | 'undo'
  | 'add5'
  | 'buy'
  | 'no_coin'
  | 'floor_select'
  | 'build'
  | 'build_fail'
  | 'unlock'
  | 'level_open'
  | 'level_close'
  | 'level_pick'
  | 'button'
  | 'popup_open'
  | 'popup_close'
  | 'toast'
  | 'transition'
  | 'start';

/** BGM 루프 이름. */
export type Bgm = 'home' | 'play';

// 파일 base(확장자 제외). 메인 SFX + BGM + 변형.
const SFX_NAMES: Sfx[] = [
  'card_place', 'card_deal', 'card_invalid', 'combo_step', 'mission_slot', 'set_complete', 'star', 'gauge_full',
  'coin_tick', 'coin_burst', 'win_fanfare', 'stuck', 'wild_activate', 'wild_use', 'undo', 'add5', 'buy', 'no_coin',
  'floor_select', 'build', 'build_fail', 'unlock', 'level_open', 'level_close', 'level_pick', 'button',
  'popup_open', 'popup_close', 'toast', 'transition', 'start',
];
const BGM_FILE: Record<Bgm, string> = { home: 'bgm_home', play: 'bgm_play' };
const WIN_STING = 'bgm_win_sting';
/** BGM 배경 레벨(0~1). 이전 0.4 → 0.25 로 낮춤(배경음 볼륨 감소). 여기 한 곳만 조절. */
const BGM_LEVEL = 0.25;
// 변형(피치/단계) — 파일 base 목록.
const CARD_PLACE_VARIANTS = [1, 2, 3, 4].map((n) => `sfx_card_place_0${n}`);

/** 미리 디코드할 전체 파일 base 목록. */
const ALL_FILES: string[] = [
  ...SFX_NAMES.map((n) => `sfx_${n}`),
  ...CARD_PLACE_VARIANTS,
  ...([1, 2, 3] as const).map((n) => `sfx_star_0${n}`),
  ...([1, 2, 3, 4, 5] as const).map((n) => `sfx_mission_slot_0${n}`),
  BGM_FILE.home,
  BGM_FILE.play,
  WIN_STING,
];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bgmGain: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();
let bgmSrc: AudioBufferSourceNode | null = null;
let currentBgm: Bgm | null = null;
let desiredBgm: Bgm | null = null;
let muted = false;
let bgmMuted = true; // ⚠️ 우선 BGM 기본 뮤트(효과음은 유지). 이후 setBgmMuted(false) 로 재설정 예정.
let gestureHooked = false;

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
      bgmGain = ctx.createGain();
      bgmGain.gain.value = BGM_LEVEL; // BGM 배경 레벨(낮춤).
      bgmGain.connect(master);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

async function load(base: string): Promise<void> {
  const c = ac();
  if (!c || buffers.has(base)) return;
  try {
    const res = await fetch(`${AUDIO_BASE}${base}.m4a`);
    buffers.set(base, await c.decodeAudioData(await res.arrayBuffer()));
  } catch {
    /* 무시 */
  }
}

/** 모든 샘플 미리 디코드. 첫 제스처 훅도 건다(대기 BGM 시작). */
export function preloadAudio(): void {
  void Promise.all(ALL_FILES.map(load));
  hookGesture();
}

/** 첫 사용자 제스처에서 ctx resume + 대기 BGM 시작(브라우저 자동재생 정책). */
function hookGesture(): void {
  if (gestureHooked || typeof window === 'undefined') return;
  gestureHooked = true;
  const kick = (): void => {
    ac();
    startDesiredBgm();
  };
  window.addEventListener('pointerdown', kick, { passive: true });
  window.addEventListener('keydown', kick, { passive: true });
}

function playBuf(base: string, opts?: { volume?: number; pitch?: number }): void {
  const c = ac();
  const buf = buffers.get(base);
  if (!c || !buf || muted || !master) return;
  try {
    const src = c.createBufferSource();
    src.buffer = buf;
    if (opts?.pitch) src.playbackRate.value = opts.pitch;
    const g = c.createGain();
    g.gain.value = opts?.volume ?? 0.85; // README: 일반 SFX 75~90%.
    src.connect(g).connect(master);
    src.start();
  } catch {
    /* 무시 */
  }
}

/** 단발 효과음. */
export function sfx(name: Sfx, opts?: { volume?: number; pitch?: number }): void {
  playBuf(`sfx_${name}`, opts);
}

/** 카드 안착 — 변형 4종 랜덤 + 미세 피치 변주(README 권장). */
export function sfxCardPlace(): void {
  const base = CARD_PLACE_VARIANTS[Math.floor(Math.random() * CARD_PLACE_VARIANTS.length)];
  playBuf(base, { volume: 0.85, pitch: 0.96 + Math.random() * 0.08 });
}

/** 별 획득 — 1·2·3 단계별 상승 피치. */
export function sfxStar(step: number): void {
  const n = Math.min(3, Math.max(1, Math.round(step)));
  playBuf(`sfx_star_0${n}`, { volume: 0.95 });
}

/** 미션 슬롯 채움 — 1~5칸 단계별. */
export function sfxMissionSlot(step: number): void {
  const n = Math.min(5, Math.max(1, Math.round(step)));
  playBuf(`sfx_mission_slot_0${n}`, { volume: 0.85 });
}

/** 승리 스팅(정산) — 짧은 팡파레 위 레이어. */
export function sfxWinSting(): void {
  playBuf(WIN_STING, { volume: 0.95 });
}

function stopBgm(fade = 0.4): void {
  if (!ctx || !bgmSrc || !bgmGain) return;
  const old = bgmSrc;
  bgmSrc = null;
  currentBgm = null;
  try {
    const t = ctx.currentTime;
    // 개별 페이드 게인(현 bgmGain 위)로 부드럽게 끈다.
    old.stop(t + fade + 0.05);
  } catch {
    /* 무시 */
  }
}

function startDesiredBgm(): void {
  if (bgmMuted) return; // BGM 기본 뮤트 — 재생 시작 안 함.
  const c = ac();
  if (!c || !bgmGain || !desiredBgm) return;
  if (currentBgm === desiredBgm && bgmSrc) return; // 이미 재생 중.
  const buf = buffers.get(BGM_FILE[desiredBgm]);
  if (!buf) return; // 아직 디코드 전 — 이후 제스처/재시도에서.
  if (bgmSrc) stopBgm(0.3);
  try {
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(bgmGain);
    // 페이드 인.
    const t = c.currentTime;
    bgmGain.gain.cancelScheduledValues(t);
    bgmGain.gain.setValueAtTime(0.0001, t);
    bgmGain.gain.linearRampToValueAtTime(BGM_LEVEL, t + 0.6);
    src.start();
    bgmSrc = src;
    currentBgm = desiredBgm;
  } catch {
    /* 무시 */
  }
}

/** BGM 지정(홈/플레이). ctx 가 아직 잠겨 있으면 첫 제스처에서 시작. */
export function playBgm(name: Bgm): void {
  desiredBgm = name;
  startDesiredBgm();
}

/** 음소거 토글. */
export function setMuted(m: boolean): void {
  muted = m;
  if (master && ctx) master.gain.value = m ? 0 : 1;
}
export function isMuted(): boolean {
  return muted;
}

/** BGM 전용 뮤트(효과음과 별개). 기본 true. false 로 켜면 대기 중인 BGM 을 시작한다. */
export function setBgmMuted(m: boolean): void {
  bgmMuted = m;
  if (m) stopBgm(0.2);
  else startDesiredBgm();
}
export function isBgmMuted(): boolean {
  return bgmMuted;
}
