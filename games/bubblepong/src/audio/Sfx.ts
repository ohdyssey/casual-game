/**
 * Sfx — Web Audio 기반 절차적 효과음 (오디오 에셋 불필요).
 *
 * 오실레이터·노이즈 합성으로 발사/반사/팝/폭발/승패 사운드를 생성한다.
 * 브라우저 자동재생 정책 때문에 AudioContext 는 첫 사용자 제스처에서
 * unlock() 으로 생성·재개해야 하며, 그 전의 재생 요청은 조용히 무시된다.
 */

type Wave = OscillatorType;

interface ToneOpts {
  type?: Wave;
  vol?: number;
  slideTo?: number;
  delay?: number;
}

class SfxEngine {
  private ctx: AudioContext | null = null;
  private supported = true;

  /** 사용자 제스처 핸들러 안에서 호출 — AudioContext 생성/재개 */
  unlock(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => { /* 재개 실패 시 다음 제스처에서 재시도 */ });
    }
  }

  private ensure(): AudioContext | null {
    if (!this.supported) return null;
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new AudioContext();
    } catch {
      this.supported = false; // 미지원 환경 — 이후 호출 전부 무시
      return null;
    }
    return this.ctx;
  }

  /** 짧은 단일 톤 — freq 에서 slideTo 로 미끄러지며 감쇠 */
  private tone(freq: number, dur: number, opts: ToneOpts = {}): void {
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running') return;
    const { type = 'sine', vol = 0.15, slideTo, delay = 0 } = opts;
    const t0 = ctx.currentTime + delay;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    }
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** 노이즈 버스트 — 폭발음용 (로우패스 필터 + 감쇠) */
  private noise(dur: number, vol: number, cutoff: number): void {
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;

    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, cutoff * 0.1), t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t0);
  }

  // ── 게임 이벤트별 사운드 ────────────────────────────────────────────────────

  /** 발사 — 상승 휙 */
  shoot(): void {
    this.tone(280, 0.12, { type: 'triangle', vol: 0.18, slideTo: 660 });
  }

  /** 벽 반사 — 짧은 틱 */
  bounce(): void {
    this.tone(520, 0.06, { type: 'square', vol: 0.06, slideTo: 420 });
  }

  /** 매치 없이 붙음 — 낮은 톡 */
  attach(): void {
    this.tone(340, 0.08, { type: 'sine', vol: 0.12, slideTo: 240 });
  }

  /** 매치 팝 — 개수만큼 음정 상승 연타 */
  pops(count: number): void {
    const n = Math.min(count, 8);
    for (let i = 0; i < n; i++) {
      this.tone(420 * Math.pow(1.12, i), 0.1, {
        type: 'sine', vol: 0.14, slideTo: 180, delay: i * 0.05,
      });
    }
  }

  /** 부유 버블 낙하 — 하강 휘유 */
  drop(): void {
    this.tone(700, 0.3, { type: 'sine', vol: 0.08, slideTo: 120 });
  }

  /** 폭탄 폭발 — 노이즈 + 저음 붐 */
  bomb(): void {
    this.noise(0.5, 0.35, 900);
    this.tone(120, 0.4, { type: 'sine', vol: 0.3, slideTo: 40 });
  }

  /** 무지개 변환 — 반짝이는 아르페지오 */
  rainbow(): void {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone(f, 0.12, { type: 'triangle', vol: 0.1, delay: i * 0.06 }));
  }

  /** 승리 팡파레 */
  win(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      this.tone(f, 0.22, { type: 'triangle', vol: 0.14, delay: i * 0.12 }));
  }

  /** 게임오버 — 하강음 */
  lose(): void {
    [392, 330, 262, 196].forEach((f, i) =>
      this.tone(f, 0.3, { type: 'sawtooth', vol: 0.08, delay: i * 0.15 }));
  }
}

export const Sfx = new SfxEngine();
