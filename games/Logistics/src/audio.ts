/**
 * 오디오 — delivery_match_sfx_pack 의 m4a 샘플을 WebAudio 로 재생(SFX 전용, BGM 없음).
 * 첫 사용자 제스처(타일/버튼 탭)에서 컨텍스트 resume. 모든 실패는 무시(오디오는 비치명적).
 * WAV→m4a 변환본은 public/audio/<key>.m4a. (ZombieArrow audio.ts 패턴 계승.)
 */
const AUDIO_BASE = `${(import.meta.env?.BASE_URL as string | undefined) ?? '/'}audio/`;

export type Sfx =
  | 'ui_tap'
  | 'tile_select'
  | 'tile_swap'
  | 'match'
  | 'combo'
  | 'wrong'
  | 'collect_veggie'
  | 'collect_banana'
  | 'collect_box'
  | 'order_ping'
  | 'order_complete'
  | 'truck_ready'
  | 'truck_depart'
  | 'timer_tick'
  | 'time_warning'
  | 'shuffle'
  | 'forklift'
  | 'repack'
  | 'help'
  | 'level_up'
  | 'coin'
  | 'fail'
  | 'panel_open'
  | 'panel_close';

const KEYS: ReadonlyArray<Sfx> = [
  'ui_tap', 'tile_select', 'tile_swap', 'match', 'combo', 'wrong',
  'collect_veggie', 'collect_banana', 'collect_box', 'order_ping', 'order_complete',
  'truck_ready', 'truck_depart', 'timer_tick', 'time_warning', 'shuffle', 'forklift',
  'repack', 'help', 'level_up', 'coin', 'fail', 'panel_open', 'panel_close',
];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();
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
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

async function load(key: Sfx): Promise<void> {
  const c = ac();
  if (!c || buffers.has(key)) return;
  try {
    const res = await fetch(`${AUDIO_BASE}${key}.m4a`);
    const buf = await c.decodeAudioData(await res.arrayBuffer());
    buffers.set(key, buf);
  } catch {
    /* 무시 */
  }
}

/** 모든 샘플을 미리 디코드(LoadScene onLoaded). */
export async function preloadAudio(): Promise<void> {
  await Promise.all(KEYS.map(load));
}

/** 첫 사용자 제스처에서 호출 — 오디오 컨텍스트 resume. */
export function startAudio(): void {
  ac();
}

/** 단발 효과음 — volume(0~1), pitch(재생속도=피치). 비치명적(실패 무시). */
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

export function setMuted(m: boolean): void {
  muted = m;
  if (master) master.gain.value = m ? 0 : 1;
}

/** ±pct 피치 변주(매치/콜렉트 음 다채롭게). */
export function pitchVar(pct: number): number {
  return 1 + (Math.random() * 2 - 1) * pct;
}
