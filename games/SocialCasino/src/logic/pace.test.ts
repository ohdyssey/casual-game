import { describe, it, expect } from 'vitest';
import {
  createPace,
  recordMatch,
  paceIntensity,
  paceTiming,
  FAST_INTERVAL_MS,
  SLOW_INTERVAL_MS,
  BACKLOG_FULL,
  ROUND_GAP_SLOW_MS,
  ROUND_GAP_FAST_MS,
  PUZZLE_TO_SLOT_SLOW_MS,
  PUZZLE_TO_SLOT_FAST_MS,
} from './pace.js';

describe('pace — state tracking', () => {
  it('빈 상태는 매치 이력이 없다', () => {
    const s = createPace();
    expect(s.lastMatchAt).toBeNull();
    expect(s.emaIntervalMs).toBeNull();
  });

  it('첫 매치는 시각만 기록하고 간격(EMA)은 아직 null', () => {
    const s = recordMatch(createPace(), 1000);
    expect(s.lastMatchAt).toBe(1000);
    expect(s.emaIntervalMs).toBeNull();
  });

  it('두 번째 매치에서 간격이 EMA 로 잡힌다', () => {
    const s = recordMatch(recordMatch(createPace(), 1000), 1400);
    expect(s.lastMatchAt).toBe(1400);
    expect(s.emaIntervalMs).toBe(400);
  });

  it('세 번째 매치는 EMA 로 평활된다(alpha=0.5)', () => {
    let s = recordMatch(createPace(), 0); // last=0
    s = recordMatch(s, 400); // interval 400 → ema 400
    s = recordMatch(s, 600); // interval 200 → ema lerp(400,200,0.5)=300
    expect(s.emaIntervalMs).toBe(300);
  });

  it('불변 — 입력 상태를 변형하지 않는다', () => {
    const a = recordMatch(createPace(), 100);
    const b = recordMatch(a, 300);
    expect(a.lastMatchAt).toBe(100); // a 는 그대로
    expect(b).not.toBe(a);
  });

  it('역행/동시 매치(now ≤ lastMatch)는 간격 0 으로 안전 처리', () => {
    const s = recordMatch(recordMatch(createPace(), 1000), 900); // now < last
    expect(s.emaIntervalMs).toBe(0);
  });
});

describe('pace — intensity', () => {
  it('이력 없고 백로그 없으면 0', () => {
    expect(paceIntensity(createPace(), 5000, 0)).toBe(0);
  });

  it('여유 페이스(느린 간격) → 0 근처', () => {
    let s = recordMatch(createPace(), 0);
    s = recordMatch(s, 3000); // 3s 간격 = 매우 여유
    expect(paceIntensity(s, 3000, 0)).toBe(0);
  });

  it('빠른 연속 매치 → 높은 강도', () => {
    let s = recordMatch(createPace(), 0);
    s = recordMatch(s, FAST_INTERVAL_MS); // FAST 간격
    expect(paceIntensity(s, FAST_INTERVAL_MS, 0)).toBeGreaterThan(0.9);
  });

  it('FAST 이하 간격은 1 로 포화', () => {
    let s = recordMatch(createPace(), 0);
    s = recordMatch(s, 100); // 100ms < FAST(350)
    expect(paceIntensity(s, 100, 0)).toBe(1);
  });

  it('손을 멈추면(now−lastMatch 증가) 빠른 EMA 라도 강도가 감쇠', () => {
    let s = recordMatch(createPace(), 0);
    s = recordMatch(s, 200); // ema 200(빠름)
    const hot = paceIntensity(s, 200, 0);
    const cooled = paceIntensity(s, 200 + SLOW_INTERVAL_MS, 0); // 그 뒤 오래 멈춤
    expect(hot).toBe(1);
    expect(cooled).toBe(0);
  });

  it('백로그만으로도 가속(간격 신호 없이도)', () => {
    // 매치 1회뿐 → 간격 신호 0. 그래도 백로그가 차면 따라잡기 가속.
    const s = recordMatch(createPace(), 0);
    expect(paceIntensity(s, 0, BACKLOG_FULL)).toBe(1);
    expect(paceIntensity(s, 0, Math.ceil(BACKLOG_FULL / 2))).toBeGreaterThan(0.4);
  });

  it('백로그가 BACKLOG_FULL 을 넘어도 1 로 클램프', () => {
    const s = recordMatch(createPace(), 0);
    expect(paceIntensity(s, 0, BACKLOG_FULL * 5)).toBe(1);
  });

  it('두 신호 중 큰 값을 쓴다', () => {
    let s = recordMatch(createPace(), 0);
    s = recordMatch(s, 1200); // 다소 느린 간격(낮은 기여)
    const lowInterval = paceIntensity(s, 1200, 0);
    const withBacklog = paceIntensity(s, 1200, BACKLOG_FULL); // 백로그가 끌어올림
    expect(withBacklog).toBeGreaterThan(lowInterval);
    expect(withBacklog).toBe(1);
  });
});

describe('pace — timing mapping', () => {
  it('강도 0 → 느린(풀연출) 끝값', () => {
    const t = paceTiming(0);
    expect(t.slotPace).toBe(0);
    expect(t.roundGapMs).toBe(ROUND_GAP_SLOW_MS);
    expect(t.puzzleToSlotMs).toBe(PUZZLE_TO_SLOT_SLOW_MS);
  });

  it('강도 1 → 빠른(터보) 끝값', () => {
    const t = paceTiming(1);
    expect(t.slotPace).toBe(1);
    expect(t.roundGapMs).toBe(ROUND_GAP_FAST_MS);
    expect(t.puzzleToSlotMs).toBe(PUZZLE_TO_SLOT_FAST_MS);
  });

  it('중간 강도는 두 끝값 사이로 보간 + slotPace 전달', () => {
    const t = paceTiming(0.5);
    expect(t.slotPace).toBe(0.5);
    expect(t.roundGapMs).toBeGreaterThan(ROUND_GAP_FAST_MS);
    expect(t.roundGapMs).toBeLessThan(ROUND_GAP_SLOW_MS);
  });

  it('범위 밖 강도는 클램프', () => {
    expect(paceTiming(-1).roundGapMs).toBe(ROUND_GAP_SLOW_MS);
    expect(paceTiming(9).roundGapMs).toBe(ROUND_GAP_FAST_MS);
  });

  it('강도가 높을수록 라운드 텀이 단조 감소', () => {
    const gaps = [0, 0.25, 0.5, 0.75, 1].map((k) => paceTiming(k).roundGapMs);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeLessThanOrEqual(gaps[i - 1]);
  });
});
