/**
 * 분석 — 게임-로컬 스텁 (D4 시드). P1 엔 버퍼+console, P2 에서 코어 analytics 로 hoist
 * 후 원격 전송/원격설정과 연결. 인터페이스(track)는 그대로 유지될 예정.
 */

export type GameEvent = 'level_start' | 'level_complete' | 'level_fail' | 'deadlock' | 'shuffle';

interface EventRecord {
  event: GameEvent;
  props: Record<string, number | string>;
  t: number;
}

const buffer: EventRecord[] = [];

export function track(event: GameEvent, props: Record<string, number | string> = {}): void {
  const rec: EventRecord = { event, props, t: Date.now() };
  buffer.push(rec);
  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[analytics]', event, props);
  }
}

/** P2 hoist 시 flush 대상. 현재는 로컬 버퍼 조회용. */
export function getEvents(): readonly EventRecord[] {
  return buffer;
}
