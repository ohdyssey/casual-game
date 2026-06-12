/**
 * 오디오 — 외부 파일 없이 WebAudio 신스로 SFX 합성(P0).
 * 첫 사용자 제스처에서 AudioContext 가 잠금 해제되므로 호출 시점에 lazy 생성.
 * 모든 실패는 무시(오디오는 게임에 치명적이지 않음).
 */
import { loadSave, updateSave } from './save.js';

type SfxName =
  | 'tap'
  | 'pick'
  | 'place'
  | 'invalid'
  | 'match'
  | 'refill'
  | 'mission'
  | 'mission_win'
  | 'mission_fail'
  | 'win'
  | 'fail'
  | 'tick';

let ctx: AudioContext | null = null;
let sfxOn = loadSave().sfx;

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** 단음 — freq(Hz) 를 dur 동안, 타입/볼륨/시작지연 지정. */
function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; at?: number; slide?: number } = {}): void {
  const a = ac();
  if (!a) return;
  const { type = 'sine', vol = 0.18, at = 0, slide = 0 } = opts;
  const t0 = a.currentTime + at;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide !== 0) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** 노이즈 버스트 — 지글(sizzle)/펑 효과. */
function noise(dur: number, opts: { vol?: number; at?: number; lowpass?: number } = {}): void {
  const a = ac();
  if (!a) return;
  const { vol = 0.12, at = 0, lowpass = 2400 } = opts;
  const t0 = a.currentTime + at;
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpass;
  const gain = a.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter).connect(gain).connect(a.destination);
  src.start(t0);
}

const PLAYERS: Record<SfxName, () => void> = {
  tap: () => tone(620, 0.07, { type: 'triangle', vol: 0.14 }),
  pick: () => tone(440, 0.08, { type: 'triangle', vol: 0.16, slide: 220 }),
  place: () => {
    tone(330, 0.07, { type: 'triangle', vol: 0.16 });
    noise(0.05, { vol: 0.05, lowpass: 1600 });
  },
  invalid: () => tone(180, 0.16, { type: 'square', vol: 0.1, slide: -60 }),
  match: () => {
    noise(0.32, { vol: 0.14, lowpass: 5200 }); // 지글지글
    tone(523, 0.1, { vol: 0.16, at: 0.02 });
    tone(659, 0.1, { vol: 0.16, at: 0.1 });
    tone(784, 0.18, { vol: 0.18, at: 0.18 });
  },
  refill: () => tone(520, 0.06, { type: 'triangle', vol: 0.1, slide: 180 }),
  mission: () => {
    tone(880, 0.09, { vol: 0.14 });
    tone(1108, 0.12, { vol: 0.14, at: 0.1 });
  },
  mission_win: () => {
    tone(659, 0.1, { vol: 0.18 });
    tone(830, 0.1, { vol: 0.18, at: 0.1 });
    tone(988, 0.22, { vol: 0.2, at: 0.2 });
  },
  mission_fail: () => {
    tone(330, 0.14, { vol: 0.12 });
    tone(247, 0.22, { vol: 0.12, at: 0.14 });
  },
  win: () => {
    tone(523, 0.12, { vol: 0.2 });
    tone(659, 0.12, { vol: 0.2, at: 0.12 });
    tone(784, 0.12, { vol: 0.2, at: 0.24 });
    tone(1047, 0.34, { vol: 0.22, at: 0.36 });
  },
  fail: () => {
    tone(220, 0.2, { type: 'sawtooth', vol: 0.1 });
    tone(165, 0.34, { type: 'sawtooth', vol: 0.1, at: 0.2 });
  },
  tick: () => tone(980, 0.04, { type: 'square', vol: 0.07 }),
};

export function sfx(name: SfxName): void {
  if (!sfxOn) return;
  try {
    PLAYERS[name]();
  } catch {
    /* noop */
  }
}

export function isSfxOn(): boolean {
  return sfxOn;
}

export function setSfxOn(on: boolean): void {
  sfxOn = on;
  updateSave({ sfx: on });
}
