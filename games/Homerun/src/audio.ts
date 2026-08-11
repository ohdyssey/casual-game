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
  | 'swing'    // 배트 스윙(탭한 순간, 맞았든 헛쳤든)
  | 'whiff'    // 헛스윙 스윙음
  | 'hit'      // 배트 크랙(타격)
  | 'homerun'  // 홈런 — 오르간 팡파레
  | 'safe'     // 안타 징글
  | 'foul'     // 파울 톤
  | 'strike'   // 스트라이크(루킹) 부저
  | 'catch'    // 필드 수비수 포구 퍽(타구 아웃)
  | 'mittCatch' // 포수 미트 포구(스윙 없이/헛스윙 통과) — 글러브+스트라이크 강조음
  | 'crash'    // 전광판/관중석 직격
  | 'cheer'    // 관중 환호(함성+박수+휘파람)
  | 'over';    // 경기 종료 징글

let ctx: AudioContext | null = null;
let sfxOn = true;
let ambienceStarted = false;
let organTimer: number | null = null;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

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

/**
 * 실제 녹음 샘플(mp3) — 사용자 제공(스윙/일반 히트/홈런 히트/스타디움 관중 + 포구 글러브·
 * 스트라이크·홈런 아케이드 강조음). 파일 상단 주석대로 "PLAYERS 항목만 바꾸면 된다"를 실행한
 * 것 — 이 항목들만 실 파일로 재생하고, 나머지(피치·헛스윙·안타 징글 등)는 기존 합성음을 그대로
 * 유지한다. 로드 실패해도 PLAYERS 쪽에서 합성음으로 폴백하므로 게임 진행에 영향 없다.
 */
type RealSfxName = 'swing' | 'hit' | 'homerun' | 'crowd' | 'glove' | 'strikeShort' | 'homerunArcade';
const REAL_SFX_FILES: Record<RealSfxName, string> = {
  swing: 'audio/sfx_swing.mp3',
  hit: 'audio/sfx_hit.mp3',
  homerun: 'audio/sfx_hit_homerun.mp3',
  crowd: 'audio/sfx_crowd.mp3',
  // 포수 미트 포구 — 스윙 없이/헛스윙으로 통과한 공이 미트에 꽂히는 순간(catchBall()) 재생.
  glove: 'audio/sfx_glove_catch.mp3',
  // 위 포구와 동시에 겹쳐 재생하는 스트라이크 강조음(사용자 요청: "캐처미트에 들어오면서... 동시에").
  strikeShort: 'audio/sfx_strike_short.mp3',
  // 홈런 시 기존 홈런음(실 샘플 또는 합성 폴백) 위에 겹쳐 믹싱하는 아케이드 강조음(사용자 요청).
  homerunArcade: 'audio/sfx_homerun_arcade.mp3',
};
const realBuffers: Partial<Record<RealSfxName, AudioBuffer>> = {};
/** 홈런 아나운서 강조음(아케이드 샘플) 지연(초) — 기본 홈런/관중 사운드는 즉시, 이것만 늦게(사용자 요청). */
const ARCADE_SFX_DELAY_S = 1;

/**
 * 실 샘플 4종을 미리 fetch+디코딩(로딩화면에서 호출, game.ts onLoaded 참조). AudioContext 는
 * 사용자 제스처 전이라 'suspended' 상태일 수 있지만 decodeAudioData 자체는 제스처 없이도
 * 동작한다 — 재생(gesture 필요)과 디코딩(불필요)은 별개.
 */
export async function preloadRealSfx(): Promise<void> {
  const a = ac();
  if (!a) return;
  await Promise.all(
    (Object.keys(REAL_SFX_FILES) as RealSfxName[]).map(async (name) => {
      try {
        const res = await fetch(REAL_SFX_FILES[name]);
        const arr = await res.arrayBuffer();
        realBuffers[name] = await a.decodeAudioData(arr);
      } catch {
        /* 실패 — 해당 이름은 realBuffers 에 안 들어가 PLAYERS 쪽 합성음 폴백이 자동 적용된다. */
      }
    }),
  );
}

/** 디코딩된 버퍼를 원샷 재생. delay(초) 를 주면 오디오 클록 기준으로 그만큼 늦게 시작한다. */
function playBuffer(buf: AudioBuffer, opts: { vol?: number; delay?: number } = {}): void {
  const a = ac();
  if (!a) return;
  const { vol = 1, delay = 0 } = opts;
  const src = a.createBufferSource();
  src.buffer = buf;
  const gain = a.createGain();
  gain.gain.value = vol;
  src.connect(gain).connect(a.destination);
  src.start(a.currentTime + Math.max(0, delay));
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

const PLAYERS: Record<SfxName, (intensity: number) => void> = {
  pitch: () => fxNoise(0.12, { vol: 0.06, type: 'bandpass', freq: 3200, q: 0.6 }),
  // 실 스윙 샘플 — 합성음 시절엔 없던 이름(스윙=탭 즉시, 헛침 여부와 무관). 실패 시 짧은 훅 폴백.
  swing: () => {
    const buf = realBuffers.swing;
    if (buf) playBuffer(buf, { vol: 0.5 });
    else fxNoise(0.09, { vol: 0.06, type: 'bandpass', freq: 1600, q: 0.4 });
  },
  whiff: () => fxNoise(0.2, { vol: 0.09, type: 'bandpass', freq: 2200, q: 0.5 }),
  // intensity(0~1) — 비거리/타구 세기에 비례해 호출자가 넘긴다(사용자 요청: "홈런이나 비거리가
  // 길수록... 최대크게"). 0.5~1.0 구간으로 매핑해 짧은 안타도 아예 안 들리진 않게 한다.
  hit: (intensity) => {
    const vol = 0.4 + 0.45 * clamp01(intensity);
    const buf = realBuffers.hit;
    if (buf) { playBuffer(buf, { vol }); return; }
    // 실 샘플 미로드 시 폴백 — 배트 크랙 ① 고역 트랜지언트(찰나) ② 크랙 바디 ③ 우드 노크(저역 울림)
    fxNoise(0.012, { vol: 0.5 * vol / 0.65, type: 'highpass', freq: 2400 });
    fxNoise(0.05, { vol: 0.3 * vol / 0.65, type: 'bandpass', freq: 3100, q: 1.6 });
    tone(185, 0.09, { type: 'triangle', vol: 0.16, slide: -60 });
    tone(95, 0.12, { vol: 0.1, at: 0.004 });
  },
  homerun: (intensity) => {
    const vol = 0.55 + 0.45 * clamp01(intensity);
    const buf = realBuffers.homerun;
    if (buf) playBuffer(buf, { vol });
    else {
      // 실 샘플 미로드 시 폴백 — 볼파크 오르간 팡파레 ("Charge!" 풍 상승 리프)
      const riff = [392, 523, 659, 784, 1047];
      riff.forEach((f, i) => {
        tone(f, i === riff.length - 1 ? 0.5 : 0.13, { type: 'square', vol: 0.07 * vol / 0.8, at: i * 0.11 });
        tone(f / 2, i === riff.length - 1 ? 0.5 : 0.13, { type: 'triangle', vol: 0.06 * vol / 0.8, at: i * 0.11 });
      });
    }
    // 아나운서 강조음(아케이드 샘플) — 위 기본 홈런음(관중 반응 타이밍)은 즉시 그대로 두고,
    // 이것만 ARCADE_SFX_DELAY_S 만큼 늦게 겹쳐 믹싱한다(사용자 요청: "홈런 아나운서 사운드만
    // 늦게 플레이하고 관중사운드 타이밍은 그대로 유지").
    const arcadeBuf = realBuffers.homerunArcade;
    if (arcadeBuf) playBuffer(arcadeBuf, { vol: vol * 0.85, delay: ARCADE_SFX_DELAY_S });
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
  // 필드 수비수 포구(revealFielderCatch(), 타구 아웃) — 캐처 미트 포구(mittCatch)와는 별개
  // 이벤트라 여기엔 스트라이크음을 섞지 않는다. 기존 합성 퍽 소리 그대로 유지.
  catch: () => {
    fxNoise(0.05, { vol: 0.22, type: 'lowpass', freq: 900 }); // 가죽 퍽
    tone(110, 0.06, { vol: 0.1 });
  },
  // 포수 미트 포구 — 스윙 없이/헛스윙으로 통과한 공이 미트에 꽂히는 순간(catchBall()) 전용.
  // 글러브 샘플이 있으면 스트라이크 강조음과 동시에 재생(사용자 요청: "캐처미트에 들어오면서...
  // 스트라이크 사운드도 동시에"), 없으면 기존 합성 퍽 소리로 폴백.
  mittCatch: () => {
    const glove = realBuffers.glove;
    const strikeShort = realBuffers.strikeShort;
    if (glove) playBuffer(glove, { vol: 0.7 });
    else {
      fxNoise(0.05, { vol: 0.22, type: 'lowpass', freq: 900 });
      tone(110, 0.06, { vol: 0.1 });
    }
    if (strikeShort) playBuffer(strikeShort, { vol: 0.6 });
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

/** intensity(0~1, 기본 1) — hit/homerun 은 비거리·타구 세기에 비례해 볼륨을 키우는 데 쓴다. */
export function sfx(name: SfxName, intensity = 1): void {
  if (!sfxOn) return;
  try {
    PLAYERS[name](intensity);
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
 * 관중 앰비언스(실 샘플) 상태 — 평소엔 낮은 볼륨으로 루프 재생하다가, 히트/홈런 순간
 * swellCrowd() 가 처음부터 다시 재생 + 볼륨을 확 올린 뒤 서서히 원래 볼륨으로 되돌린다
 * (사용자 요청: "일반상황에서는 작게... 히트나 홈런시 볼륨을 높여서 처음부터 플레이").
 * AudioBufferSourceNode 는 한 번 start() 하면 되감기가 안 되므로, "처음부터"를 구현하려면
 * 매번 새 소스를 만들어야 한다 — gain 노드만 재사용해 볼륨 로직을 한곳에 유지한다.
 */
const CROWD_BASE_VOL = 0.05;
const CROWD_SWELL_VOL = 0.42;
const CROWD_SWELL_DECAY_S = 3.2;
let crowdGain: GainNode | null = null;
let crowdSrc: AudioBufferSourceNode | null = null;

function playCrowdFrom(a: AudioContext, buf: AudioBuffer, gain: GainNode): void {
  crowdSrc = a.createBufferSource();
  crowdSrc.buffer = buf;
  crowdSrc.loop = true;
  crowdSrc.connect(gain);
  crowdSrc.start();
}

/** 히트/홈런 순간 호출 — 관중 샘플을 처음부터 다시 재생하며 볼륨을 스웰시켰다가 서서히 낮춘다. */
export function swellCrowd(): void {
  const a = ac();
  const buf = realBuffers.crowd;
  if (!a || !buf || !crowdGain) return;
  try {
    crowdSrc?.stop();
  } catch {
    /* 이미 멈춰 있었을 수 있음 — 무시 */
  }
  playCrowdFrom(a, buf, crowdGain);
  const now = a.currentTime;
  crowdGain.gain.cancelScheduledValues(now);
  crowdGain.gain.setValueAtTime(CROWD_SWELL_VOL, now);
  crowdGain.gain.linearRampToValueAtTime(CROWD_BASE_VOL, now + CROWD_SWELL_DECAY_S);
}

/**
 * 구장 앰비언스 — 실 관중 샘플이 로드돼 있으면 그걸 낮은 볼륨으로 루프 재생(swellCrowd() 가
 * 히트/홈런마다 스웰). 로드 실패 시 기존 핑크노이즈 합성 웅성거림으로 폴백.
 * + 18~30초 간격의 볼파크 오르간 리프. 첫 사용자 제스처에서 시작(startBgm 호환 이름 유지).
 */
export function startBgm(): void {
  const a = ac();
  if (!a || ambienceStarted) return;
  ambienceStarted = true;
  const realCrowd = realBuffers.crowd;
  try {
    if (realCrowd) {
      crowdGain = a.createGain();
      crowdGain.gain.value = CROWD_BASE_VOL;
      crowdGain.connect(a.destination);
      playCrowdFrom(a, realCrowd, crowdGain);
    } else {
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
    }
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
  try {
    crowdSrc?.stop();
  } catch {
    /* 이미 멈춰 있었을 수 있음 — 무시 */
  }
  // 핑크노이즈 앰비언스 노드는 컨텍스트와 함께 정리 — 간단 구현(추후 음원 교체 시 재설계).
}
