/**
 * sampleTrack — 트랙을 임의 시간 t 에서 샘플(평가). 자기-구동 트윈과 달리 seek 가능 → 타임라인 도구의 핵심.
 *   transform: 키 사이를 "왼쪽 키의 이징"으로 보간. frame: 스텝-홀드(보간 없음).
 */
import { resolveEase } from './eases.js';

/**
 * 트랜스폼 채널 샘플. keys: [{t, v, ease}] (t 오름차순). 양끝 클램프. 왼쪽 키 이징으로 lerp.
 * @returns {number|undefined}
 */
export function sampleTrack(keys, t) {
  const n = keys ? keys.length : 0;
  if (n === 0) return undefined;
  if (n === 1 || t <= keys[0].t) return keys[0].v;
  if (t >= keys[n - 1].t) return keys[n - 1].v;
  // 브래킷 [lo, lo+1] 이진 탐색: keys[lo].t <= t < keys[lo+1].t.
  let lo = 0, hi = n - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = keys[lo], b = keys[lo + 1];
  const span = b.t - a.t;
  const u = span > 0 ? (t - a.t) / span : 0;
  return a.v + (b.v - a.v) * resolveEase(a.ease)(u);
}

/**
 * 프레임 트랙(frameTrack) → cel 타임라인 [{frame, end}] (end = 누적 ms). fps 또는 frameDurations 로 산출.
 */
export function buildCels(frameTrack) {
  const frames = (frameTrack && frameTrack.frames) || [];
  const cels = [];
  const durs = frameTrack && frameTrack.frameDurations;
  const usePer = !(durs && durs.length === frames.length);
  const per = 1000 / ((frameTrack && frameTrack.fps) || 10);
  let acc = 0;
  for (let i = 0; i < frames.length; i++) {
    acc += usePer ? per : durs[i];
    cels.push({ frame: frames[i], end: acc });
  }
  return cels;
}

/** 프레임 샘플(스텝-홀드). 프레임 트랙은 자기 총길이로 순환. cels: buildCels 결과. */
export function sampleFrame(cels, t) {
  const n = cels ? cels.length : 0;
  if (n === 0) return undefined;
  const total = cels[n - 1].end;
  const tt = total > 0 ? ((t % total) + total) % total : 0;
  for (let i = 0; i < n; i++) if (tt < cels[i].end) return cels[i].frame;
  return cels[n - 1].frame;
}
