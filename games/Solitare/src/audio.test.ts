import { describe, it, expect, beforeEach } from 'vitest';
import { VOLUME_STEPS, getVolume, setVolume, cycleVolume, volumeLabel, setMuted } from './audio.js';

/** 볼륨은 마스터 게인만 건드리므로 AudioContext 없이(노드 환경) 그대로 검증할 수 있다. */
describe('사운드 볼륨 — 버튼 1개로 단계 순환(PO 2026-07-28)', () => {
  beforeEach(() => {
    setMuted(false);
    setVolume(1);
  });

  it('기본값은 최대(1)', () => {
    expect(getVolume()).toBe(1);
  });

  it('단계는 큰 값 → 작은 값 순이고 마지막이 0(=꺼짐)', () => {
    expect(VOLUME_STEPS[0]).toBe(1);
    expect(VOLUME_STEPS[VOLUME_STEPS.length - 1]).toBe(0);
    for (let i = 1; i < VOLUME_STEPS.length; i++) expect(VOLUME_STEPS[i]).toBeLessThan(VOLUME_STEPS[i - 1]);
  });

  it('누를 때마다 다음 단계로 내려가고 끝에서 최대로 되돌아온다', () => {
    for (let i = 1; i < VOLUME_STEPS.length; i++) expect(cycleVolume()).toBe(VOLUME_STEPS[i]);
    expect(cycleVolume()).toBe(VOLUME_STEPS[0]); // 0 → 다시 100%
  });

  it('0~1 밖의 값은 클램프된다', () => {
    setVolume(5);
    expect(getVolume()).toBe(1);
    setVolume(-3);
    expect(getVolume()).toBe(0);
    setVolume(Number.NaN);
    expect(getVolume()).toBe(1); // 잘못된 입력은 최대로 폴백.
  });

  it('단계에 없는 값에서 눌러도 최대부터 다시 순환한다(깨진 저장값 방어)', () => {
    setVolume(0.37);
    expect(cycleVolume()).toBe(VOLUME_STEPS[0]);
  });

  it('라벨 — 볼륨 크기에 따라 아이콘과 퍼센트가 바뀐다', () => {
    setVolume(1);
    expect(volumeLabel()).toBe('🔊 사운드 100%');
    setVolume(0.5);
    expect(volumeLabel()).toBe('🔉 사운드 50%');
    setVolume(0.25);
    expect(volumeLabel()).toBe('🔈 사운드 25%');
    setVolume(0);
    expect(volumeLabel()).toBe('🔇 사운드 꺼짐');
  });

  it('음소거 상태면 볼륨이 남아 있어도 꺼짐으로 표시된다', () => {
    setVolume(1);
    setMuted(true);
    expect(volumeLabel()).toBe('🔇 사운드 꺼짐');
    expect(getVolume()).toBe(1); // 볼륨 값 자체는 보존(음소거 해제 시 복귀).
  });
});
