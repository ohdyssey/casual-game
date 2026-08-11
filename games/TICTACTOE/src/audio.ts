/**
 * 오디오 — `public/audio/` 에 담긴 실제 사운드 파일을 재생한다.
 *
 * **사운드의 정의는 파일명이다.** 이 모듈은 파일명 목록(`SFX_FILES`)을 그대로 타입으로 올려
 * 호출부가 `playSfx('ui_tap')` 처럼 파일명을 쓰게 한다 — 새 소리를 추가하려면 파일을 넣고
 * 목록에 한 줄 더하면 끝이다(합성 코드를 고칠 일이 없다).
 *
 *  · SFX: WebAudio 로 미리 디코드해 캐시(짧고 잦아 지연이 곧 체감 품질) — `preloadSfx()`
 *  · BGM: `BGM_` 접두 파일 2곡. **레벨별로 번갈아** 튼다(`startBgm(level)`) — 스트리밍 재생
 *
 * 모든 실패는 무시한다 — 오디오는 게임 진행에 치명적이지 않다.
 */

/** `public/audio/<name>.m4a` — 파일명이 곧 사운드 이름이다. */
const SFX_FILES = [
  // UI · 버튼
  'ui_tap',
  'ui_btn_main',
  'ui_btn_confirm',
  'ui_btn_cancel',
  'ui_toggle_on',
  'ui_toggle_off',
  'ui_invalid',
  'ui_toast',
  'ui_popup_open',
  'ui_scene_in',
  // 대국 진행
  'place',
  'move',
  'hit',
  'turn_mine',
  'slash_01',
  'slash_02',
  'slash_03',
  // 타이머
  'countdown_1',
  'countdown_2',
  'countdown_3',
  'go',
  'tick',
  'timeout',
  // 결과 · 보상
  'saber',
  'win',
  'lose',
  'draw',
  'promote',
  'point_gain',
  'rating_up',
  'rating_down',
  // AI 스터디
  'hint_show',
  'mistake',
  'study_clear',
  'study_complete',
  // 매칭 · 광고
  'match_search',
  'match_found',
  'card_flip',
  'ad_open',
  'ad_reward',
] as const;

type SfxFile = (typeof SFX_FILES)[number];

/** 호출부가 쓰는 이름 — 파일명 + 별칭 `slash`(3종 중 무작위) + `countdown`(숫자 지정). */
export type SfxName = SfxFile | 'slash';

/** 매 턴 울리는 공격음 — 같은 소리의 반복 피로를 막으려 3종을 돌려 쓴다. */
const SLASH_VARIANTS: readonly SfxFile[] = ['slash_01', 'slash_02', 'slash_03'];

/** 카운트다운 숫자 → 파일. `startCountdown` 의 onStep(3·2·1)과 짝을 이룬다. */
const COUNTDOWN_BY_N: Readonly<Record<number, SfxFile>> = {
  3: 'countdown_3',
  2: 'countdown_2',
  1: 'countdown_1',
};

/**
 * 소리별 상대 음량 — 파일은 저마다 정규화돼 있어 그대로 틀면 잦은 소리가 귀에 박힌다.
 * 여기 없는 소리는 1.0.
 */
const SFX_GAIN: Readonly<Partial<Record<SfxFile, number>>> = {
  tick: 0.45, // 초읽기 — 2초 내내 울린다
  turn_mine: 0.35, // 내 턴 신호 — 거의 안 들릴 정도로
  ui_toast: 0.5,
  ui_tap: 0.7,
  slash_01: 0.55, // 매 턴 공격 — saber 를 덮으면 안 된다
  slash_02: 0.55,
  slash_03: 0.55,
  hit: 0.6,
  ui_scene_in: 0.6,
  match_search: 0.45, // 루프 — 배경으로 깔린다
};

/**
 * BGM 2곡(`BGM_` 접두) — **화면별로 갈린다**.
 *   home  = 홈(메뉴)·매칭 화면 · play = 대국 화면
 * 같은 곡이면 씬이 바뀌어도 이어서 재생하므로, 홈↔매칭 사이에서는 음악이 끊기지 않는다.
 */
export const BGM = {
  home: 'BGM_Perfect_Turn',
  play: 'BGM_Terminal_Rank_Up',
} as const;
export type BgmTrack = (typeof BGM)[keyof typeof BGM];

const BGM_VOLUME = 0.34; // SFX 를 가리지 않는 선(대국 중 초읽기가 묻히면 안 된다)
const BGM_FADE_MS = 600;

/** 오디오 파일 URL — base 가 './'(허브 하위)와 '/'(설치형 PWA)로 갈려 절대경로를 쓰지 않는다. */
function audioUrl(name: string): string {
  return new URL(`audio/${name}.m4a`, document.baseURI).href;
}

// ── WebAudio: SFX ──
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
const buffers = new Map<SfxFile, AudioBuffer>();
const loading = new Map<SfxFile, Promise<AudioBuffer | null>>();

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
    }
    // 첫 입력 전 resume 은 브라우저에 따라 거부된다 — 조용히 넘긴다(다음 호출에서 다시 시도).
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** 파일 1개를 받아 디코드해 캐시한다. 실패하면 null(그 소리만 조용해진다). */
function load(name: SfxFile): Promise<AudioBuffer | null> {
  const cached = buffers.get(name);
  if (cached) return Promise.resolve(cached);
  const inflight = loading.get(name);
  if (inflight) return inflight;

  const p = (async (): Promise<AudioBuffer | null> => {
    try {
      const a = ac();
      if (!a) return null;
      const res = await fetch(audioUrl(name));
      if (!res.ok) return null;
      const raw = await res.arrayBuffer();
      const buf = await a.decodeAudioData(raw);
      buffers.set(name, buf);
      return buf;
    } catch {
      return null;
    } finally {
      loading.delete(name);
    }
  })();
  loading.set(name, p);
  return p;
}

/**
 * 전체 SFX 를 미리 받아 둔다(부팅 로딩 중 호출).
 * 40개 합쳐 220KB 남짓이라 로딩을 붙잡지 않는다 — 그래도 await 하지 않고 배경으로 돌린다.
 */
export function preloadSfx(): void {
  for (const name of SFX_FILES) void load(name);
}

function output(name: SfxFile, loop: boolean): AudioBufferSourceNode | null {
  const a = ac();
  const buf = buffers.get(name);
  if (!a || !master || !buf) return null;
  try {
    const src = a.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    const g = a.createGain();
    g.gain.value = SFX_GAIN[name] ?? 1;
    src.connect(g).connect(master);
    src.start();
    return src;
  } catch {
    return null;
  }
}

/** 이름 별칭을 실제 파일로 푼다. */
function resolveFile(name: SfxName): SfxFile {
  if (name === 'slash') {
    return SLASH_VARIANTS[Math.floor(Math.random() * SLASH_VARIANTS.length)] ?? 'slash_01';
  }
  return name;
}

export function playSfx(name: SfxName): void {
  const file = resolveFile(name);
  if (buffers.has(file)) {
    output(file, false);
    return;
  }
  // 아직 안 받아졌으면 받아서 튼다 — 늦게 울리느니 그냥 넘긴다(0.4초 넘으면 이미 장면이 지났다).
  const askedAt = performance.now();
  void load(file).then((buf) => {
    if (buf && performance.now() - askedAt < 400) output(file, false);
  });
}

/** 3·2·1 카운트다운 — 숫자에 맞는 파일을 튼다(범위 밖이면 무시). */
export function playCountdown(n: number): void {
  const file = COUNTDOWN_BY_N[n];
  if (file) playSfx(file);
}

// ── 루프 SFX(매칭 대기음처럼 "끝날 때까지" 깔리는 소리) ──
/** 재생 중인 루프. 값이 null 이면 "파일을 받는 중" — 그 사이에 멈추면 항목을 지워 취소한다. */
const loops = new Map<SfxFile, AudioBufferSourceNode | null>();

export function startLoopSfx(name: SfxFile): void {
  if (loops.has(name)) return;
  loops.set(name, null); // 자리를 먼저 잡는다 — 로딩이 끝나기 전에 멈춰도 새어 나오지 않게
  void load(name).then(() => {
    if (!loops.has(name)) return; // 받는 동안 stopLoopSfx 가 왔다
    const src = output(name, true);
    if (src) loops.set(name, src);
    else loops.delete(name);
  });
}

export function stopLoopSfx(name: SfxFile): void {
  const src = loops.get(name);
  loops.delete(name);
  try {
    src?.stop();
  } catch {
    /* 이미 끝났으면 무시 */
  }
}

// ── BGM: 2곡 교대 ──
let bgmEl: HTMLAudioElement | null = null;
let bgmTrack: BgmTrack | null = null;
let bgmFadeTimer: number | null = null;

/**
 * 첫 사용자 입력 전에는 브라우저가 자동재생을 막는다 — 막혔으면 다음 탭 한 번에 다시 튼다.
 * (게임 부팅 직후 메뉴에서 BGM 을 걸기 때문에 거의 항상 이 경로를 탄다)
 */
let gestureRetryArmed = false;
function armGestureRetry(): void {
  if (gestureRetryArmed) return;
  gestureRetryArmed = true;
  const retry = (): void => {
    gestureRetryArmed = false;
    window.removeEventListener('pointerdown', retry);
    if (!muted && bgmEl?.paused) void bgmEl.play().catch(() => {});
  };
  window.addEventListener('pointerdown', retry, { once: true });
}

function clearFade(): void {
  if (bgmFadeTimer !== null) {
    window.clearInterval(bgmFadeTimer);
    bgmFadeTimer = null;
  }
}

/**
 * 화면에 맞는 BGM 을 튼다(`BGM.home` / `BGM.play`). **같은 곡이면 이어서 재생한다** —
 * 홈→매칭처럼 씬만 바뀔 때 곡을 처음부터 다시 틀면 음악이 끊긴 것처럼 들린다.
 */
export function startBgm(track: BgmTrack): void {
  if (bgmEl && bgmTrack === track) {
    clearFade();
    bgmEl.volume = muted ? 0 : BGM_VOLUME;
    if (bgmEl.paused && !muted) void bgmEl.play().catch(() => {});
    return;
  }
  stopBgm();
  try {
    const el = new Audio(audioUrl(track));
    el.loop = true;
    el.preload = 'auto';
    el.volume = muted ? 0 : BGM_VOLUME;
    bgmEl = el;
    bgmTrack = track;
    if (!muted) void el.play().catch(() => armGestureRetry());
  } catch {
    bgmEl = null;
    bgmTrack = null;
  }
}

/** 페이드아웃 후 정지 — 결과 화면처럼 음악이 뚝 끊기면 안 되는 곳에서 쓴다. */
export function fadeOutBgm(): void {
  const el = bgmEl;
  if (!el) return;
  clearFade();
  const step = 50;
  const dec = el.volume / Math.max(1, BGM_FADE_MS / step);
  bgmFadeTimer = window.setInterval(() => {
    if (!bgmEl) {
      clearFade();
      return;
    }
    const next = bgmEl.volume - dec;
    if (next <= 0.01) {
      clearFade();
      stopBgm();
      return;
    }
    bgmEl.volume = next;
  }, step);
}

export function stopBgm(): void {
  clearFade();
  const el = bgmEl;
  bgmEl = null;
  bgmTrack = null;
  try {
    el?.pause();
  } catch {
    /* 무시 */
  }
}

/** 실제로 소리를 죽이거나 되살린다(상태 갱신과 분리 — 토글음을 들려주려면 잠깐 늦춰야 한다). */
function applyMute(m: boolean): void {
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02);
  if (bgmEl) {
    clearFade();
    bgmEl.volume = m ? 0 : BGM_VOLUME;
    if (m) bgmEl.pause();
    else void bgmEl.play().catch(() => {});
  }
}

export function setMuted(m: boolean): void {
  muted = m;
  applyMute(m);
}

/** 토글음이 잦아들 시간 — 이만큼 지난 뒤에 실제로 음소거한다. */
const MUTE_DELAY_MS = 260;

/**
 * 사운드 켜기/끄기 토글 — 새 음소거 상태를 돌려준다.
 * **끄는 순간에도 `ui_toggle_off` 가 들려야** 상태 변화를 귀로 확인할 수 있어,
 * 소리를 먼저 울리고 잠깐 뒤에 실제로 죽인다(그 사이 다시 켜면 취소된다).
 */
export function toggleMuted(): boolean {
  const next = !muted;
  muted = next; // 상태는 즉시 바뀐다 — 아이콘과 연타 처리가 이 값을 본다
  if (next) {
    playSfx('ui_toggle_off');
    window.setTimeout(() => {
      if (muted) applyMute(true);
    }, MUTE_DELAY_MS);
  } else {
    applyMute(false);
    playSfx('ui_toggle_on');
  }
  return next;
}

export function isMuted(): boolean {
  return muted;
}
