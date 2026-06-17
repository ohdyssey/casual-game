/**
 * ClipPlayer — 클립을 샘플해 호출자가 준 파트 객체(Phaser GameObject 또는 목)에 적용. Phaser 객체를 소유하지 않음.
 *
 * 핵심 불변식: 포즈는 elapsed 의 순수 함수다(_apply 는 elapsed 만 읽음, 히스토리 없음).
 *   따라서 seek(t)(스크럽)와 tick 누적(재생)이 같은 elapsed 면 반드시 같은 포즈 → "스크럽 == 재생".
 *   자기-구동 트윈(상태/경로 의존)과 달리 발산할 수 없다.
 */
import { localTime, isFinished } from './clipTime.js';
import { sampleTrack, sampleFrame, buildCels } from './sampleTrack.js';

export class ClipPlayer {
  /** @param {object} clip 정규화된 클립 @param {Map<string, object>} parts partId → 타깃 객체 */
  constructor(clip, parts) {
    this.clip = clip;
    this.parts = parts || new Map();
    this.elapsed = 0;
    this.playing = false;
    this._curFrame = new Map();                 // partId → 마지막 적용 프레임(setFrame 디듀프)
    this._frameCels = new Map();
    for (const ft of (clip.frameTracks || [])) this._frameCels.set(ft.partId, buildCels(ft));
  }

  play() { this.playing = true; return this; }
  pause() { this.playing = false; return this; }
  stop() { this.playing = false; this.elapsed = 0; this._apply(); return this; }

  /** 스크럽: 임의 시간으로 이동(포즈는 elapsed 의 순수 함수). */
  seek(tMs) { this.elapsed = tMs > 0 ? tMs : 0; this._apply(); return this; }

  /** 재생 틱. dt 초. */
  tick(dtSec) {
    if (!this.playing) return;
    this.elapsed += dtSec * 1000 * (this.clip.timeScale || 1);
    this._apply();
    if (isFinished(this.elapsed, this.clip.length, this.clip.loop)) this.playing = false;
  }

  // 현재 elapsed 의 포즈를 타깃에 적용 — elapsed 외 어떤 상태도 읽지 않는다(불변식의 근거).
  _apply() {
    const loop = this.clip.loop || 'loop';
    const t = localTime(this.elapsed, this.clip.length, loop);

    for (const ft of (this.clip.frameTracks || [])) {
      const target = this.parts.get(ft.partId);
      if (!target) continue;
      const frame = sampleFrame(this._frameCels.get(ft.partId), t);
      if (frame != null && this._curFrame.get(ft.partId) !== frame) {   // 변경 시에만 setFrame(배치 churn 방지)
        this._curFrame.set(ft.partId, frame);
        if (target.setFrame) target.setFrame(frame);
      }
    }

    for (const tt of (this.clip.transformTracks || [])) {
      const target = this.parts.get(tt.partId);
      if (!target) continue;
      for (const ch in tt.channels) {
        const v = sampleTrack(tt.channels[ch].keys, t);
        if (v != null) applyChannel(target, ch, v);
      }
    }
  }
}

/** 채널 → 타깃 적용. scale 은 scaleX/scaleY 로 fan-out, origin 은 setOrigin, 그 외 직접 대입. */
function applyChannel(o, ch, v) {
  switch (ch) {
    case 'scale':
      if (typeof o.setScale === 'function') o.setScale(v); else { o.scaleX = v; o.scaleY = v; }
      break;
    case 'originX':
      if (typeof o.setOrigin === 'function') o.setOrigin(v, o.originY != null ? o.originY : 0.5); else o.originX = v;
      break;
    case 'originY':
      if (typeof o.setOrigin === 'function') o.setOrigin(o.originX != null ? o.originX : 0.5, v); else o.originY = v;
      break;
    default:
      o[ch] = v;   // x · y · scaleX · scaleY · angle · rotation · alpha
  }
}
