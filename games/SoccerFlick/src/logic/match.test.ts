import { describe, it, expect } from 'vitest';
import {
  createMatch,
  startSim,
  endSim,
  scoreGoal,
  resumeAfterGoal,
  tick,
  isOver,
  winner,
  formatTime,
  MATCH_SECONDS,
} from './match.js';

describe('match state machine', () => {
  it('creates with red first, 0-0, full clock', () => {
    const s = createMatch();
    expect(s.phase).toBe('aim');
    expect(s.turn).toBe('red');
    expect(s.score).toEqual({ red: 0, blue: 0 });
    expect(s.timeLeft).toBe(MATCH_SECONDS);
  });

  it('aim → sim → aim switches turn', () => {
    let s = createMatch('red');
    s = startSim(s);
    expect(s.phase).toBe('sim');
    s = endSim(s);
    expect(s.phase).toBe('aim');
    expect(s.turn).toBe('blue');
  });

  it('is immutable (returns new objects)', () => {
    const a = createMatch();
    const b = startSim(a);
    expect(a.phase).toBe('aim');
    expect(b).not.toBe(a);
  });

  it('startSim only from aim; endSim only from sim', () => {
    const aim = createMatch();
    expect(endSim(aim)).toBe(aim); // no-op
    const sim = startSim(aim);
    expect(startSim(sim)).toBe(sim); // no-op
  });

  it('scoreGoal increments scorer and enters goal phase', () => {
    let s = startSim(createMatch('red'));
    s = scoreGoal(s, 'red');
    expect(s.score).toEqual({ red: 1, blue: 0 });
    expect(s.phase).toBe('goal');
  });

  it('resumeAftergoal gives kickoff to the conceding team', () => {
    let s = scoreGoal(startSim(createMatch('red')), 'red');
    s = resumeAfterGoal(s, 'red');
    expect(s.phase).toBe('aim');
    expect(s.turn).toBe('blue'); // blue conceded → blue kicks off
  });

  it('tick counts down and ends at zero', () => {
    let s = createMatch('red', 3);
    s = tick(s, 1);
    expect(s.timeLeft).toBe(2);
    expect(isOver(s)).toBe(false);
    s = tick(s, 5);
    expect(s.timeLeft).toBe(0);
    expect(isOver(s)).toBe(true);
  });

  it('winner resolves only when over', () => {
    let s = createMatch('red', 1);
    s = scoreGoal(startSim(s), 'blue');
    expect(winner(s)).toBeNull(); // goal phase, not over
    s = { ...s, phase: 'over' };
    expect(winner(s)).toBe('blue');
  });

  it('winner draw on equal score', () => {
    const s = { phase: 'over' as const, turn: 'red' as const, score: { red: 2, blue: 2 }, timeLeft: 0 };
    expect(winner(s)).toBe('draw');
  });

  it('formatTime pads mm:ss', () => {
    expect(formatTime(96)).toBe('01:36');
    expect(formatTime(5)).toBe('00:05');
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(-3)).toBe('00:00');
  });
});
