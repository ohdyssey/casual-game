/**
 * audio.ts — 김밥 롤 마스터 사운드팩(`public/audio/*.m4a`)을 WebAudio 로 재생.
 *
 * fetch → decodeAudioData → AudioBuffer 를 미리 만들어 두고 BufferSource 로 튼다.
 * 첫 사용자 제스처에서 AudioContext 를 resume 한다(브라우저 자동재생 정책).
 * **모든 실패는 무시한다** — 오디오는 게임 진행에 비치명적이라, 파일이 없거나 디코드가 깨져도 조용히 넘어간다.
 *
 * 사운드 목록·트리거 = `docs/SOUND_DESIGN.md`. 형제 게임 Solitare `src/audio.ts` 패턴 계승.
 * ⚠️ 확장자는 반드시 `.m4a` — Phaser/브라우저 조합에서 `.mp4` 오디오는 조용히 무시된다.
 */
const AUDIO_BASE = `${(import.meta.env?.BASE_URL as string | undefined) ?? '/'}audio/`;

/** 단발 효과음 — 파일명은 `sfx_${name}.m4a`. */
export type Sfx =
  | 'order_in'
  | 'card_pick'
  | 'clock_warn'
  | 'mat_place'
  | 'nori_place'
  | 'rice_lump'
  | 'rice_auto_spread'
  | 'rice_done'
  | 'ingredient_full'
  | 'ingredient_deny'
  | 'roll_swipe'
  | 'roll_press'
  | 'oil_brush'
  | 'sesame_sprinkle'
  | 'knife_take'
  | 'cut_done'
  | 'bell_wake'
  | 'bell_ring'
  | 'plate_up'
  | 'result_1star'
  | 'result_2star'
  | 'result_3star'
  | 'result_fail'
  | 'money_up'
  | 'money_down'
  | 'button'
  | 'popup_open'
  | 'popup_close';

const SFX_NAMES: readonly Sfx[] = [
  'order_in', 'card_pick', 'clock_warn', 'mat_place', 'nori_place', 'rice_lump',
  'rice_auto_spread', 'rice_done', 'ingredient_full', 'ingredient_deny',
  'roll_swipe', 'roll_press', 'oil_brush', 'sesame_sprinkle',
  'knife_take', 'cut_done', 'bell_wake', 'bell_ring', 'plate_up',
  'result_1star', 'result_2star', 'result_3star', 'result_fail',
  'money_up', 'money_down', 'button', 'popup_open', 'popup_close',
];

/**
 * 단계·랜덤 변형이 있는 소리 — `sfx_<이름>_<n>.m4a` (1부터).
 * 재료·조각·별은 **순번이 곧 음정**(올라간다)이고, 칼질은 순번을 랜덤으로 골라 기관총음을 피한다.
 */
const VARIANTS = {
  chop: 3,
  ingredient_place: 6,
  plate_piece: 8,
  star: 3,
} as const;
type VariantName = keyof typeof VARIANTS;

/** 문지르는 동안 도는 루프. */
const SPREAD_LOOP = 'sfx_rice_spread_loop';
/** BGM(아직 미제작 — 파일이 생기면 자동으로 재생된다). */
const BGM_PLAY = 'bgm_play';

/** 기본 SFX 레벨(0~1). 피크 -6dB 기준으로 맞춘 사운드팩이라 여유를 조금 둔다. */
const SFX_LEVEL = 0.85;
/** BGM 배경 레벨. */
const BGM_LEVEL = 0.25;
/**
 * 문지르기 루프를 끄기까지 기다리는 시간.
 * `spread` 효과는 손가락이 움직일 때만 오므로, 잠깐 멈추면 소리도 따라 멎어야 자연스럽다.
 */
const SPREAD_IDLE_MS = 180;

const variantFiles = (name: VariantName): string[] =>
  Array.from({ length: VARIANTS[name] }, (_, i) => `sfx_${name}_${i + 1}`);

const ALL_FILES: readonly string[] = [
  ...SFX_NAMES.map((n) => `sfx_${n}`),
  ...(Object.keys(VARIANTS) as VariantName[]).flatMap(variantFiles),
  SPREAD_LOOP,
  BGM_PLAY,
];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bgmGain: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();
let muted = false;
let gestureHooked = false;

// BGM 은 **dev=꺼짐 / 배포=켜짐**(개발 중 반복 재생 피로 방지) — 형제 게임과 같은 기본값.
let bgmMuted = import.meta.env?.DEV === true;
let bgmSrc: AudioBufferSourceNode | null = null;
let bgmWanted = false;

let spreadSrc: AudioBufferSourceNode | null = null;
let spreadStopAt = 0;

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
      bgmGain = ctx.createGain();
      bgmGain.gain.value = BGM_LEVEL;
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
    if (!res.ok) return; // 아직 없는 파일(bgm 등) — 조용히 넘어간다.
    buffers.set(base, await c.decodeAudioData(await res.arrayBuffer()));
  } catch {
    /* 무시 */
  }
}

/** 모든 샘플을 미리 디코드하고, 첫 제스처 훅을 건다. PlayScene 진입에서 한 번 호출. */
export function preloadAudio(): void {
  void Promise.all(ALL_FILES.map(load));
  hookGesture();
}

function hookGesture(): void {
  if (gestureHooked || typeof window === 'undefined') return;
  gestureHooked = true;
  const kick = (): void => {
    ac();
    if (bgmWanted) startBgm();
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
    g.gain.value = opts?.volume ?? SFX_LEVEL;
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

/** 변형 중 `step` 번째(1부터, 범위를 넘으면 마지막 것). 재료·조각·별처럼 순번이 음정인 소리에 쓴다. */
function playStep(name: VariantName, step: number, opts?: { volume?: number; pitch?: number }): void {
  const n = Math.min(VARIANTS[name], Math.max(1, Math.round(step)));
  playBuf(`sfx_${name}_${n}`, opts);
}

/** 재료 한 줄 놓기 — 담은 순번만큼 음이 올라간다(index 는 0부터). */
export function sfxIngredientPlace(index: number): void {
  playStep('ingredient_place', index + 1);
}

/** 접시에 조각 담기 — 조각 순번만큼 음이 올라간다(index 는 0부터). */
export function sfxPlatePiece(index: number): void {
  playStep('plate_piece', index + 1, { volume: 0.7 });
}

/** 별 1~3 — 순번마다 음이 올라간다. */
export function sfxStar(step: number): void {
  playStep('star', step, { volume: 0.95 });
}

/** 칼질 — 변형 3종 랜덤 + 피치 ±6%(같은 소리가 여덟 번 이어지면 기관총이 된다). */
export function sfxChop(): void {
  const n = 1 + Math.floor(Math.random() * VARIANTS.chop);
  playBuf(`sfx_chop_${n}`, { pitch: 0.94 + Math.random() * 0.12 });
}

/** 별 개수(0=실패)에 맞는 결과음. */
export function sfxResult(stars: number): void {
  if (stars >= 3) sfx('result_3star', { volume: 0.95 });
  else if (stars === 2) sfx('result_2star');
  else if (stars === 1) sfx('result_1star');
  else sfx('result_fail');
}

/**
 * 밥 문지르기 루프 — 문지르는 동안 계속 부르면 된다.
 * 잠깐 멈추면(SPREAD_IDLE_MS) 스스로 꺼지므로, 손을 떼는 이벤트를 따로 배선하지 않아도 된다.
 */
export function spreadLoop(): void {
  const c = ac();
  spreadStopAt = c ? c.currentTime + SPREAD_IDLE_MS / 1000 : 0;
  if (spreadSrc || !c || muted || !master) return;
  const buf = buffers.get(SPREAD_LOOP);
  if (!buf) return;
  try {
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = c.createGain();
    g.gain.value = 0.75;
    src.connect(g).connect(master);
    src.start();
    spreadSrc = src;
    watchSpread();
  } catch {
    /* 무시 */
  }
}

/** 문지르기가 멎었는지 지켜보다 스스로 끈다(트윈·타이머를 씬에 만들지 않으려고 여기서 처리). */
function watchSpread(): void {
  if (typeof window === 'undefined') return;
  window.setTimeout(() => {
    if (!spreadSrc) return;
    const c = ctx;
    if (c && c.currentTime < spreadStopAt) {
      watchSpread();
      return;
    }
    stopSpreadLoop();
  }, SPREAD_IDLE_MS);
}

/** 문지르기 루프 즉시 중단(밥 다 폄 · 주문 종료 · 리셋). */
export function stopSpreadLoop(): void {
  const src = spreadSrc;
  spreadSrc = null;
  spreadStopAt = 0;
  try {
    src?.stop();
  } catch {
    /* 무시 */
  }
}

function startBgm(): void {
  const c = ac();
  if (!c || !bgmGain || bgmMuted || bgmSrc) return;
  const buf = buffers.get(BGM_PLAY);
  if (!buf) return; // 아직 없는 트랙 — 무음으로 둔다.
  try {
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(bgmGain);
    const t = c.currentTime;
    bgmGain.gain.cancelScheduledValues(t);
    bgmGain.gain.setValueAtTime(0.0001, t);
    bgmGain.gain.linearRampToValueAtTime(BGM_LEVEL, t + 0.6);
    src.start();
    bgmSrc = src;
  } catch {
    /* 무시 */
  }
}

function stopBgm(): void {
  const src = bgmSrc;
  bgmSrc = null;
  try {
    src?.stop();
  } catch {
    /* 무시 */
  }
}

/** BGM 재생 요청 — ctx 가 아직 잠겨 있거나 파일이 없으면 첫 제스처/디코드 완료 뒤에 시작된다. */
export function playBgm(): void {
  bgmWanted = true;
  startBgm();
}

/** BGM 전용 뮤트(효과음과 별개). 기본값 = dev 꺼짐 / 배포 켜짐. */
export function setBgmMuted(m: boolean): void {
  bgmMuted = m;
  if (m) stopBgm();
  else if (bgmWanted) startBgm();
}
export function isBgmMuted(): boolean {
  return bgmMuted;
}

/** 전체 음소거. */
export function setMuted(m: boolean): void {
  muted = m;
  if (m) stopSpreadLoop();
  if (master) master.gain.value = m ? 0 : 1;
}
export function isMuted(): boolean {
  return muted;
}
