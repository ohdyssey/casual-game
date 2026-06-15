/**
 * 오디오 — zombie_archery_sound_pack v2(아쿠스틱/드라이)의 m4a 샘플을 WebAudio 로 재생.
 * 첫 사용자 제스처(활 당김)에서 컨텍스트 resume + BGM/앰비언스 시작. 모든 실패는 무시(오디오는 비치명적).
 * README 권장: 일반 웨이브=bgm_main, 위급/마지막=bgm_intense, 앰비언스는 아주 낮게, 타격/좀비음성 ±3% 피치 변주.
 */
const AUDIO_BASE = `${(import.meta.env?.BASE_URL as string | undefined) ?? '/'}audio/`;

export type Sfx =
  | 'bow_draw'
  | 'bow_release'
  | 'arrow_fly'
  | 'hit_body'
  | 'hit_head'
  | 'zombie_death'
  | 'zombie_groan'
  | 'explosion'
  | 'wave_start'
  | 'wave_clear'
  | 'coin'
  | 'ui_tap';

// 키 → 파일명(.m4a). BGM/앰비언스 포함.
const FILES: Record<string, string> = {
  bow_draw: 'bow_draw',
  bow_release: 'bow_release',
  arrow_fly: 'arrow_fly',
  hit_body: 'hit_body',
  hit_head: 'hit_head',
  zombie_death: 'zombie_death',
  zombie_groan: 'zombie_groan',
  explosion: 'explosion',
  wave_start: 'wave_start',
  wave_clear: 'wave_clear',
  coin: 'coin',
  ui_tap: 'ui_tap',
  bgm_main: 'bgm_main', // v3: story 루프(메뉴/초반 웨이브)
  bgm_intense: 'bgm_intense', // v3: combat 루프(교전 웨이브)
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bgmGain: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();
let bgmSrc: AudioBufferSourceNode | null = null;
let started = false;
let muted = false;

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
      bgmGain = ctx.createGain();
      bgmGain.gain.value = 0.4;
      bgmGain.connect(master);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

async function load(key: string): Promise<void> {
  const c = ac();
  if (!c || buffers.has(key)) return;
  try {
    const res = await fetch(`${AUDIO_BASE}${FILES[key]}.m4a`);
    const buf = await c.decodeAudioData(await res.arrayBuffer());
    buffers.set(key, buf);
  } catch {
    /* 무시 */
  }
}

/** 모든 샘플을 미리 디코드(LoadScene). */
export async function preloadAudio(): Promise<void> {
  await Promise.all(Object.keys(FILES).map(load));
}

/** 단발 효과음 — volume(0~1), pitch(재생속도=피치). */
export function sfx(name: Sfx, opts?: { volume?: number; pitch?: number }): void {
  const c = ac();
  const buf = buffers.get(name);
  if (!c || !buf || muted || !master) return;
  try {
    const src = c.createBufferSource();
    src.buffer = buf;
    if (opts?.pitch) src.playbackRate.value = opts.pitch;
    const g = c.createGain();
    g.gain.value = opts?.volume ?? 1;
    src.connect(g);
    g.connect(master);
    src.start();
  } catch {
    /* 무시 */
  }
}

function loop(key: string, gain: GainNode | null): AudioBufferSourceNode | null {
  const c = ac();
  const buf = buffers.get(key);
  if (!c || !buf || !gain) return null;
  try {
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(gain);
    src.start();
    return src;
  } catch {
    return null;
  }
}

/** 첫 제스처에서 호출 — 컨텍스트 resume + BGM(story 루프) 시작(1회). v3는 앰비언스 없음. */
export function startAudio(): void {
  ac();
  if (started) return;
  started = true;
  bgmSrc = loop('bgm_main', bgmGain);
}

/** 교전 웨이브 — combat BGM(bgm_intense)으로 전환, off면 story(bgm_main)로 복귀. 이미 시작된 경우만. */
export function setIntense(on: boolean): void {
  if (!started) return;
  try {
    bgmSrc?.stop();
  } catch {
    /* 무시 */
  }
  bgmSrc = loop(on ? 'bgm_intense' : 'bgm_main', bgmGain);
}

export function stopAudio(): void {
  try {
    bgmSrc?.stop();
  } catch {
    /* 무시 */
  }
  bgmSrc = null;
  started = false;
}

export function setMuted(m: boolean): void {
  muted = m;
  if (master) master.gain.value = m ? 0 : 1;
}

/** ±pct 피치 변주(README: 타격/좀비 음성 ±3%). */
export function pitchVar(pct: number): number {
  return 1 + (Math.random() * 2 - 1) * pct;
}
