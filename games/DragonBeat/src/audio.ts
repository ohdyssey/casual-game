/**
 * 오디오 — 외부 파일 없이 WebAudio 로 "용선 축제" 음향을 합성한다 (Homerun audio.ts 계승).
 *  · 북소리: 강박 '둥'(저역 멤브레인) / 약박 '딱'(림 클릭) — 메트로놈이자 게임의 심장박동
 *  · 물살: 필터 노이즈 스플래시, 부스트: 상승 스윕, 관중: 핑크노이즈 함성
 * 박자 재생은 씬 update 의 박자 경계에서 호출(단일 클럭) — 지터 ≤1프레임으로
 * perfect 윈도우(±12%)보다 충분히 작아 룩어헤드 스케줄러 없이 캐쥬얼 품질 확보.
 * 추후 실제 녹음 샘플(mp3/ogg)로 교체 시 PLAYERS 항목만 바꾸면 된다.
 * 모든 실패는 무시(오디오는 게임에 치명적이지 않음).
 */

import { loadSave, updateSave } from './save.js';

export type SfxName =
  | 'dum'      // 북 강박 (왼쪽 패들)
  | 'tak'      // 북 약박 (오른쪽 패들)
  | 'perfect'  // 완벽 판정 반짝임
  | 'good'     // 좋아 판정 톤
  | 'miss'     // 놓침 둔탁음
  | 'wrong'    // 반대쪽 버저
  | 'splash'   // 노 물살
  | 'boost'    // 부스트 발동 스윕
  | 'count'    // 카운트다운 틱
  | 'horn'     // 출발 뿔피리
  | 'cheer'    // 관중 함성 (콤보 마일스톤)
  | 'finish'   // 결승선 팡파레
  | 'over';    // 최종 결과 징글

let ctx: AudioContext | null = null;
// 저장된 사운드 설정을 즉시 반영 (비브라우저 컨텍스트에선 loadSave 가 기본값 true 반환).
let sfxOn = loadSave().sfx;
let ambienceStarted = false;

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

/** 핑크노이즈 버퍼(캐시) — 물결/함성의 원천. Paul Kellet 근사. */
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

/** 관중 함성 스웰 — 핑크노이즈 밴드패스 크레셴도. */
function crowdRoar(intensity: number): void {
  fxNoise(2.0, { pink: true, vol: 0.14 * intensity, type: 'bandpass', freq: 650, q: 0.45, attack: 0.25 });
  fxNoise(1.3, { pink: true, vol: 0.08 * intensity, type: 'bandpass', freq: 1400, q: 0.7, at: 0.15, attack: 0.18 });
}

const PLAYERS: Record<SfxName, () => void> = {
  dum: () => {
    // 용선 북 강박 — 저역 멤브레인 슬라이드 + 가죽 두께감 노이즈
    tone(150, 0.22, { type: 'sine', vol: 0.32, slide: -95 });
    fxNoise(0.05, { vol: 0.16, type: 'lowpass', freq: 700 });
  },
  tak: () => {
    // 북 림 약박 — 높은 멤브레인 + 클릭 트랜지언트
    tone(240, 0.12, { type: 'sine', vol: 0.2, slide: -110 });
    fxNoise(0.025, { vol: 0.18, type: 'highpass', freq: 2600 });
  },
  perfect: () => {
    tone(880, 0.08, { type: 'triangle', vol: 0.1 });
    tone(1320, 0.12, { type: 'triangle', vol: 0.08, at: 0.05 });
  },
  good: () => tone(660, 0.09, { type: 'triangle', vol: 0.08 }),
  miss: () => tone(140, 0.16, { type: 'square', vol: 0.06, slide: -40 }),
  wrong: () => {
    tone(196, 0.14, { type: 'square', vol: 0.08, slide: -30 });
    tone(185, 0.14, { type: 'square', vol: 0.06, at: 0.02 });
  },
  splash: () => fxNoise(0.18, { vol: 0.1, type: 'bandpass', freq: 1700, q: 0.6 }),
  boost: () => {
    tone(220, 0.5, { type: 'sawtooth', vol: 0.09, slide: 660 });
    fxNoise(0.5, { vol: 0.08, type: 'bandpass', freq: 2400, q: 0.8, attack: 0.1 });
  },
  count: () => tone(523, 0.1, { type: 'square', vol: 0.09 }),
  horn: () => {
    // 출발 뿔피리 — 저역 혼 + 배음
    tone(311, 0.7, { type: 'sawtooth', vol: 0.12, vibrato: 8 });
    tone(622, 0.7, { type: 'square', vol: 0.05, vibrato: 8 });
  },
  cheer: () => crowdRoar(1),
  finish: () => {
    const riff = [523, 659, 784, 1047];
    riff.forEach((f, i) => {
      tone(f, i === riff.length - 1 ? 0.45 : 0.13, { type: 'square', vol: 0.08, at: i * 0.12 });
      tone(f / 2, i === riff.length - 1 ? 0.45 : 0.13, { type: 'triangle', vol: 0.06, at: i * 0.12 });
    });
    crowdRoar(0.9);
  },
  over: () => {
    const riff = [392, 523, 659, 784];
    riff.forEach((f, i) => tone(f, i === riff.length - 1 ? 0.34 : 0.12, { type: 'triangle', vol: 0.09, at: i * 0.13 }));
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
  updateSave({ sfx: on }); // 설정을 영속화 (Grillking audio.ts 컨벤션).
}

/**
 * 강변 앰비언스 — 잔잔한 물결(핑크노이즈 저역 + 느린 LFO 출렁임) 상시 루프.
 * 첫 사용자 제스처에서 시작(autoplay 정책).
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
    filter.type = 'lowpass';
    filter.frequency.value = 480;
    filter.Q.value = 0.5;
    const gain = a.createGain();
    gain.gain.value = 0.03;
    // 느린 LFO — 물결이 파도처럼 출렁인다.
    const lfo = a.createOscillator();
    const lfoGain = a.createGain();
    lfo.frequency.value = 0.11;
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(gain.gain);
    src.connect(filter).connect(gain).connect(a.destination);
    src.start();
    lfo.start();
  } catch {
    /* noop */
  }
}

export function stopBgm(): void {
  // 앰비언스 노드는 컨텍스트와 함께 정리 — 간단 구현(추후 음원 교체 시 재설계).
}
