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

/** BGM 루프 이름 — home/play + **부지(스테이지)별 트랙**(카메라가 그 부지에 있을 때 재생, 파일 없으면 home 폴백). */
export type Bgm = 'home' | 'play' | 'lot_l2' | 'lot_l1' | 'lot_r1' | 'lot_r2' | 'lot_r3';

// 파일 base(확장자 제외). 메인 SFX + BGM + 변형.
const SFX_NAMES: Sfx[] = [
  'card_place', 'card_deal', 'card_invalid', 'combo_step', 'mission_slot', 'set_complete', 'star', 'gauge_full',
  'coin_tick', 'coin_burst', 'win_fanfare', 'stuck', 'wild_activate', 'wild_use', 'undo', 'add5', 'buy', 'no_coin',
  'floor_select', 'build', 'build_fail', 'unlock', 'level_open', 'level_close', 'level_pick', 'button',
  'popup_open', 'popup_close', 'toast', 'transition', 'start',
];
const BGM_FILE: Record<Bgm, string> = {
  home: 'bgm_home',
  play: 'bgm_play',
  // 부지(스테이지)별 트랙 — public/audio/ 에 같은 이름의 .m4a 를 넣으면 그 부지에서 재생된다(없으면 home 폴백).
  lot_l2: 'bgm_lot_l2', // 좌측 외곽 부지
  lot_l1: 'bgm_lot_l1', // 좌측 내측 부지(공공건물 타워)
  lot_r1: 'bgm_lot_r1', // 우측 내측 부지(스테이지2 타워)
  lot_r2: 'bgm_lot_r2', // 우측 외곽 부지1
  lot_r3: 'bgm_lot_r3', // 우측 외곽 부지2
};
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
  BGM_FILE.lot_l2,
  BGM_FILE.lot_l1,
  BGM_FILE.lot_r1,
  BGM_FILE.lot_r2,
  BGM_FILE.lot_r3,
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

/**
 * **사운드 볼륨**(0~1, 마스터 게인) — PO 2026-07-28 "사운드볼륨 조절 버튼을 만드세요".
 *   버튼 하나로 조절할 수 있게 **단계 순환** 방식을 쓴다(슬라이더 위젯 없이 기존 메뉴 행에 그대로 얹힘).
 *   마지막 단계 0 = 음소거이므로 별도 on/off 토글이 필요 없다(메뉴의 사운드 행이 이 버튼으로 대체됐다).
 *   설정은 localStorage 에 남아 다음 실행에도 유지된다(세이브 스키마와 무관하게 audio 모듈 안에서 자급).
 */
export const VOLUME_STEPS = [1, 0.75, 0.5, 0.25, 0] as const;
const VOLUME_KEY = 'solitaire.volume';

function loadVolume(): number {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(VOLUME_KEY);
    if (raw == null) return 1;
    const v = Number(raw);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  } catch {
    return 1; // 저장소 접근 불가(사파리 프라이빗 등) — 기본 최대 볼륨.
  }
}
let volume = loadVolume();
// BGM 기본값 — **dev=꺼짐 / 배포(PROD)=켜짐**(2026-07-16 지시: 개발 중 반복 재생 피로 방지).
//   setBgmMuted() 로 런타임 토글 가능(효과음과 별개).
let bgmMuted = import.meta.env.DEV;
let gestureHooked = false;

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = masterGain();
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
  if (bgmMuted) return; // BGM 뮤트 — 재생 시작 안 함.
  const c = ac();
  if (!c || !bgmGain || !desiredBgm) return;
  // **스테이지 전용 재생**(2026-07-16 지시) — 그 부지 전용 트랙만 재생하고, 없으면 **무음**.
  //   (구: home 폴백 → 다른 스테이지에 홈 사운드가 흘러나오는 문제. 이제 다른 스테이지 사운드는 재생하지 않는다.)
  const eff: Bgm = desiredBgm;
  if (!buffers.has(BGM_FILE[eff])) {
    if (bgmSrc) stopBgm(0.4); // 재생 중이던 다른 스테이지 트랙을 페이드아웃.
    return;
  }
  if (currentBgm === eff && bgmSrc) return; // 이미 재생 중.
  const buf = buffers.get(BGM_FILE[eff]);
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
    currentBgm = eff;
  } catch {
    /* 무시 */
  }
}

/** BGM 지정(홈/플레이). ctx 가 아직 잠겨 있으면 첫 제스처에서 시작. */
export function playBgm(name: Bgm): void {
  desiredBgm = name;
  startDesiredBgm();
}

/** 실제 마스터 게인 — 음소거면 0, 아니면 설정 볼륨. 이 한 곳이 두 상태를 합치는 유일한 지점. */
function masterGain(): number {
  return muted ? 0 : volume;
}
function applyMasterGain(): void {
  if (master && ctx) master.gain.value = masterGain();
}

/** 음소거 토글. */
export function setMuted(m: boolean): void {
  muted = m;
  applyMasterGain();
}
export function isMuted(): boolean {
  return muted;
}

/** 현재 볼륨(0~1). */
export function getVolume(): number {
  return volume;
}

/** 볼륨 설정(0~1 로 클램프) + 저장. 0 이면 음소거와 같은 효과. */
export function setVolume(v: number): void {
  volume = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1));
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    /* 저장 실패는 무시(이번 세션에만 적용) */
  }
  applyMasterGain();
}

/** **버튼 1개용** — 다음 볼륨 단계로 순환하고 적용된 값을 돌려준다(100→75→50→25→0→100…). */
export function cycleVolume(): number {
  const i = VOLUME_STEPS.findIndex((s) => Math.abs(s - volume) < 0.01);
  setVolume(VOLUME_STEPS[(i + 1) % VOLUME_STEPS.length]); // 목록에 없는 값(-1)이면 0번(=최대)부터.
  return volume;
}

/** 메뉴 버튼 라벨 — `🔊 사운드 100%` / `🔇 사운드 꺼짐`. 아이콘은 볼륨 크기를 따라간다. */
export function volumeLabel(): string {
  if (muted || volume <= 0) return '🔇 사운드 꺼짐';
  const icon = volume >= 0.75 ? '🔊' : volume >= 0.4 ? '🔉' : '🔈';
  return `${icon} 사운드 ${Math.round(volume * 100)}%`;
}

/** BGM 전용 뮤트(효과음과 별개). 기본값 = dev 꺼짐/배포 켜짐. false 로 켜면 대기 중인 BGM 을 시작한다. */
export function setBgmMuted(m: boolean): void {
  bgmMuted = m;
  if (m) stopBgm(0.2);
  else startDesiredBgm();
}
export function isBgmMuted(): boolean {
  return bgmMuted;
}
