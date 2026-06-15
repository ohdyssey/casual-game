/**
 * 웨이브 규칙 — 순수 데이터/함수(테스트 가능). 좀비가 몇 마리, 얼마나 빨리, 얼마나 자주 등장하는지.
 * 웨이브가 거듭될수록 마릿수·속도↑, 등장 간격↓.
 */

export interface WaveDef {
  /** 이 웨이브에 등장하는 좀비 총 마릿수. */
  readonly count: number;
  /** 좀비 등장 간격(ms). */
  readonly intervalMs: number;
  /**
   * 좀비 전진 속도 — 깊이(depth) 단위/초. 0=소실점(멀리) → 1=플레이어 도달선.
   * 1/speed ≈ 한 마리가 끝까지 오는 데 걸리는 초. 원근 이징 때문에 멀리선 느리고 가까이서 빨라진다.
   */
  readonly speed: number;
}

/** 기본 3웨이브. 클리어하면 승리. 속도는 아주 느리게(여유롭게 조준). */
export const WAVES: readonly WaveDef[] = [
  { count: 8, intervalMs: 2300, speed: 0.015 }, // ≈67초/마리(원근 이징으로 멀리선 더 느림)
  { count: 12, intervalMs: 1850, speed: 0.019 }, // ≈53초/마리
  { count: 16, intervalMs: 1450, speed: 0.025 }, // ≈40초/마리
];

/** 플레이어 최대 체력. */
export const MAX_HEALTH = 100;
/** 좀비가 플레이어 라인에 닿을 때 깎이는 체력. */
export const ZOMBIE_DAMAGE = 12;

/** 전체 웨이브 좀비 합계. */
export function totalZombies(waves: readonly WaveDef[] = WAVES): number {
  return waves.reduce((sum, w) => sum + w.count, 0);
}

/** waveIndex(0-base) 의 정의. 범위를 벗어나면 undefined. */
export function waveAt(waveIndex: number, waves: readonly WaveDef[] = WAVES): WaveDef | undefined {
  return waves[waveIndex];
}

/** 모든 웨이브를 클리어했는가(승리 조건). */
export function isAllClear(waveIndex: number, waves: readonly WaveDef[] = WAVES): boolean {
  return waveIndex >= waves.length;
}

/** 표시용 라벨 (예: "1/3"). 클리어 상태면 마지막 번호로 고정. */
export function waveLabel(waveIndex: number, waves: readonly WaveDef[] = WAVES): string {
  const shown = Math.min(waveIndex + 1, waves.length);
  return `${shown}/${waves.length}`;
}
