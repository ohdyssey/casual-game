/**
 * 오디오 — 외부 파일 없이 WebAudio 로 "실제 야구장" 음향을 설계해 합성한다.
 *  · 타격음: 순간 트랜지언트(고역 크랙) + 우드 노크(저역 울림) 레이어
 *  · 관중: 핑크노이즈 웅성거림(상시 앰비언스) + 함성 스웰 + 박수 버스트 + 휘파람
 *  · 배경: 멜로디 BGM 대신 구장 앰비언스 + 간헐적 볼파크 오르간 리프
 * 추후 실제 녹음 샘플(mp3/ogg)로 교체 시 PLAYERS 항목만 바꾸면 된다.
 * 모든 실패는 무시(오디오는 게임에 치명적이지 않음).
 */

export type SfxName =
  | 'pitch'    // 투구 릴리스 휙
  | 'whiff'    // 헛스윙 스윙음
  | 'hit'      // 배트 크랙(타격)
  | 'homerun'  // 홈런 — 오르간 팡파레
  | 'safe'     // 안타 징글
  | 'foul'     // 파울 톤
  | 'strike'   // 스트라이크(루킹) 부저
  | 'catch'    // 포수 미트 포구 퍽
  | 'crash'    // 전광판/관중석 직격
  | 'cheer'    // 관중 환호(함성+박수+휘파람)
  | 'over';    // 경기 종료 징글

let ctx: AudioContext | null = null;
let sfxOn = true;
let ambienceStarted = false;
let organTimer: number | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** 핑크노이즈 버퍼(캐시) — 관중 웅성거림/함성의 원천. Paul Kellet 근사. */
let pinkBuf: AudioBuffer | null = null;
function pinkNoise(a: AudioContext): AudioBuffer {
  if (pinkBuf && pinkBuf.sampleRate === a.sampleRate) return pinkBuf;
  const len = a.sampleRate * 3;
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.997 * b0 + 0.029591 * w;
    b1 = 0.985 * b1 + 0.032534 * w;
    b2 = 0.95 * b2 + 0.048056 * w;
    d[i] = (b0 + b1 + b2 + w * 0.05) * 2.1;
  }
  pinkBuf = buf;
  return buf;
}

/** 필터 노이즈 원샷 — type/freq/Q 로 음색을 만든다. */
function fxNoise(
  dur: number,
  opts: {
    vol?: number;
    at?: number;
    type?: BiquadFilterType;
    freq?: number;
    q?: number;
    attack?: number;
    pink?: boolean;
  } = {},
): void {
  const a = ac();
  if (!a) return;
  const { vol = 0.12, at = 0, type = 'lowpass', freq = 2400, q = 0.8, attack = 0, pink = false } = opts;
  const t0 = a.currentTime + at;
  const src = a.createBufferSource();
  if (pink) {
    src.buffer = pinkNoise(a);
    src.loop = true;
  } else {
    const len = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    src.buffer = buf;
  }
  const filter = a.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = a.createGain();
  if (attack > 0) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + attack);
  } else {
    gain.gain.setValueAtTime(vol, t0);
  }
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter).connect(gain).connect(a.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

/** 단음 — freq(Hz), 슬라이드/비브라토 지원. */
function tone(
  freq: number,
  dur: number,
  opts: { type?: OscillatorType; vol?: number; at?: number; slide?: number; vibrato?: number } = {},
): void {
  const a = ac();
  if (!a) return;
  const { type = 'sine', vol = 0.18, at = 0, slide = 0, vibrato = 0 } = opts;
  const t0 = a.currentTime + at;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide !== 0) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  if (vibrato > 0) {
    const lfo = a.createOscillator();
    const lfoGain = a.createGain();
    lfo.frequency.value = 6;
    lfoGain.gain.value = vibrato;
    lfo.connect(lfoGain).connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(t0 + dur);
  }
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** 박수 버스트 — 짧은 고역 클릭을 랜덤 타이밍으로 다발 재생(군중 박수). */
function claps(count: number, span: number, opts: { vol?: number; at?: number } = {}): void {
  const { vol = 0.05, at = 0 } = opts;
  for (let i = 0; i < count; i++) {
    fxNoise(0.025, {
      vol: vol * (0.6 + Math.random() * 0.8),
      at: at + Math.random() * span,
      type: 'highpass',
      freq: 1800 + Math.random() * 1200,
    });
  }
}

/** 휘파람 — 고역 사인 스윕 + 비브라토(관중 휘슬). */
function whistle(at: number): void {
  tone(2100 + Math.random() * 500, 0.5, { vol: 0.035, at, slide: 500, vibrato: 60 });
}

/** 관중 함성 스웰 — 핑크노이즈 밴드패스 크레셴도 + 박수 + 휘파람. */
function crowdRoar(intensity: number): void {
  fxNoise(2.4, { pink: true, vol: 0.16 * intensity, type: 'bandpass', freq: 650, q: 0.45, attack: 0.3 });
  fxNoise(1.6, { pink: true, vol: 0.09 * intensity, type: 'bandpass', freq: 1400, q: 0.7, at: 0.18, attack: 0.2 });
  claps(Math.round(26 * intensity), 1.6, { vol: 0.05, at: 0.15 });
  whistle(0.35);
  if (intensity > 0.8) whistle(0.9);
}

const PLAYERS: Record<SfxName, () => void> = {
  pitch: () => fxNoise(0.12, { vol: 0.06, type: 'bandpass', freq: 3200, q: 0.6 }),
  whiff: () => fxNoise(0.2, { vol: 0.09, type: 'bandpass', freq: 2200, q: 0.5 }),
  hit: () => {
    // 배트 크랙 — ① 고역 트랜지언트(찰나) ② 크랙 바디 ③ 우드 노크(저역 울림)
    fxNoise(0.012, { vol: 0.5, type: 'highpass', freq: 2400 });
    fxNoise(0.05, { vol: 0.3, type: 'bandpass', freq: 3100, q: 1.6 });
    tone(185, 0.09, { type: 'triangle', vol: 0.16, slide: -60 });
    tone(95, 0.12, { vol: 0.1, at: 0.004 });
  },
  homerun: () => {
    // 볼파크 오르간 팡파레 ("Charge!" 풍 상승 리프)
    const riff = [392, 523, 659, 784, 1047];
    riff.forEach((f, i) => {
      tone(f, i === riff.length - 1 ? 0.5 : 0.13, { type: 'square', vol: 0.07, at: i * 0.11 });
      tone(f / 2, i === riff.length - 1 ? 0.5 : 0.13, { type: 'triangle', vol: 0.06, at: i * 0.11 });
    });
  },
  safe: () => {
    tone(587, 0.09, { type: 'triangle', vol: 0.14 });
    tone(880, 0.14, { type: 'triangle', vol: 0.14, at: 0.09 });
    crowdRoar(0.45);
  },
  foul: () => {
    tone(392, 0.12, { type: 'triangle', vol: 0.1, slide: -60 });
    fxNoise(0.7, { pink: true, vol: 0.05, type: 'bandpass', freq: 600, q: 0.5, attack: 0.1 }); // 아쉬운 웅성
  },
  strike: () => tone(196, 0.18, { type: 'square', vol: 0.08, slide: -50 }),
  catch: () => {
    fxNoise(0.05, { vol: 0.22, type: 'lowpass', freq: 900 }); // 가죽 퍽
    tone(110, 0.06, { vol: 0.1 });
  },
  crash: () => {
    fxNoise(0.25, { vol: 0.22, type: 'lowpass', freq: 2200 });
    tone(140, 0.18, { type: 'square', vol: 0.09, slide: -40 });
    claps(10, 0.5, { vol: 0.05, at: 0.1 });
  },
  cheer: () => crowdRoar(1),
  over: () => {
    const riff = [523, 659, 784, 880];
    riff.forEach((f, i) => tone(f, i === riff.length - 1 ? 0.34 : 0.12, { type: 'square', vol: 0.08, at: i * 0.13 }));
    crowdRoar(0.9);
  },
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
}

/**
 * 구장 앰비언스 — 관중 웅성거림(핑크노이즈 저역 밴드 + 느린 LFO 출렁임) 상시 루프
 * + 18~30초 간격의 볼파크 오르간 리프. 첫 사용자 제스처에서 시작(startBgm 호환 이름 유지).
 */
export function startBgm(): void {
  const a = ac();
  if (!a || ambienceStarted) return;
  ambienceStarted = true;
  try {
    const src = a.createBufferSource();
    src.buffer = pinkNoise(a);
    src.loop = true;
    const filter = a.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.4;
    const gain = a.createGain();
    gain.gain.value = 0.035;
    // 느린 LFO — 웅성거림이 파도처럼 출렁인다.
    const lfo = a.createOscillator();
    const lfoGain = a.createGain();
    lfo.frequency.value = 0.13;
    lfoGain.gain.value = 0.013;
    lfo.connect(lfoGain).connect(gain.gain);
    src.connect(filter).connect(gain).connect(a.destination);
    src.start();
    lfo.start();
  } catch {
    /* noop */
  }
  // 간헐적 오르간 리프 — 실제 구장처럼 가끔씩만.
  const organ = () => {
    if (!sfxOn) return;
    const riff = [523, 659, 523, 784];
    riff.forEach((f, i) => tone(f, 0.16, { type: 'square', vol: 0.04, at: i * 0.18 }));
  };
  organTimer = window.setInterval(() => {
    if (Math.random() < 0.65) organ();
  }, 22000);
}

export function stopBgm(): void {
  if (organTimer !== null) {
    window.clearInterval(organTimer);
    organTimer = null;
  }
  // 앰비언스 노드는 컨텍스트와 함께 정리 — 간단 구현(추후 음원 교체 시 재설계).
}
