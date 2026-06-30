/**
 * spriteDocSchema — SpriteDoc(스프라이트 애니 문서) 검증·정규화·버전 스탬프. (순수 — Phaser/게임 무관)
 *
 * coerceLayout(layoutSchema.js) 규율을 그대로 따른다: 비파괴(새 객체 반환), 잘못된 항목은 경고와 함께
 *   개별 제거, 버전 스탬프, {ok, doc, warnings}. 회전은 rotation(rad) 입력도 받아 angle(deg) 로 정규화.
 */

export const SPRITE_DOC_SCHEMA_VERSION = 1;
export const SLICING_MODES = new Set(['grid', 'rects', 'atlas']);
export const CLIP_LOOPS = new Set(['once', 'loop', 'pingpong']);
export const FRAME_LOOPS = new Set(['once', 'loop', 'pingpong']);
// 트랜스폼 채널 — buildTween CHANNELS + origin. rotation 은 입력만(→angle 정규화), 저장은 angle.
export const TWEEN_CHANNELS = new Set(['x', 'y', 'scale', 'scaleX', 'scaleY', 'angle', 'alpha', 'originX', 'originY']);

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const str = (v, d = '') => (typeof v === 'string' ? v : d);
const bool = (v, d = true) => (typeof v === 'boolean' ? v : d);

function coerceRect(r, i, w) {
  if (!isObj(r)) { w.push(`slicing.rects[${i}]: 비객체 제거`); return null; }
  const rw = Math.max(0, num(r.w)), rh = Math.max(0, num(r.h));
  if (rw <= 0 || rh <= 0) { w.push(`slicing.rects[${i}]: 크기 0 이하 제거`); return null; }
  const out = { index: Number.isInteger(r.index) ? r.index : i, x: num(r.x), y: num(r.y), w: rw, h: rh };
  // 프레임별 중심점(pivot)도 보존 — rects 가 프레임 재생성의 단일 소스이므로 여기 없으면 재로드 시 소실됨.
  if (typeof r.pivotX === 'number' && isFinite(r.pivotX)) out.pivotX = Math.max(0, Math.min(1, r.pivotX));
  if (typeof r.pivotY === 'number' && isFinite(r.pivotY)) out.pivotY = Math.max(0, Math.min(1, r.pivotY));
  return out;
}

function coerceFrame(f, i, w) {
  if (!isObj(f)) { w.push(`source.frames[${i}]: 비객체 제거`); return null; }
  return {
    index: Number.isInteger(f.index) ? f.index : i,
    name: str(f.name, `frame_${String(i).padStart(2, '0')}`),
    x: num(f.x), y: num(f.y), w: num(f.w), h: num(f.h),
    pivotX: num(f.pivotX, 0.5), pivotY: num(f.pivotY, 0.5),
  };
}

function coerceSource(raw, w) {
  const s = isObj(raw) ? raw : {};
  const sl = isObj(s.slicing) ? s.slicing : {};
  let mode = str(sl.mode, 'grid');
  if (!SLICING_MODES.has(mode)) { w.push(`source.slicing.mode '${mode}' → grid`); mode = 'grid'; }
  const frames = Array.isArray(s.frames) ? s.frames.map((f, i) => coerceFrame(f, i, w)).filter(Boolean) : [];
  return {
    textureKey: str(s.textureKey),
    path: str(s.path),
    imageW: num(s.imageW), imageH: num(s.imageH),
    slicing: {
      mode,
      frameWidth: num(sl.frameWidth), frameHeight: num(sl.frameHeight),
      margin: num(sl.margin), spacing: num(sl.spacing),
      columns: Number.isInteger(sl.columns) ? sl.columns : 0,
      rows: Number.isInteger(sl.rows) ? sl.rows : 0,
      rects: Array.isArray(sl.rects) ? sl.rects.map((r, i) => coerceRect(r, i, w)).filter(Boolean) : null,
      atlasFrames: Array.isArray(sl.atlasFrames) ? sl.atlasFrames : null,
    },
    frameCount: frames.length,
    frames,
  };
}

function coercePart(p, i, w) {
  if (!isObj(p) || typeof p.id !== 'string' || !p.id) { w.push(`parts[${i}]: id 없는/비객체 파트 제거`); return null; }
  const b = isObj(p.base) ? p.base : {};
  const o = isObj(p.origin) ? p.origin : {};
  // 회전 정규화: rotation(rad) 만 있으면 angle(deg) 로.
  let angle = num(b.angle, NaN);
  if (!isFinite(angle) && typeof b.rotation === 'number') angle = b.rotation * 180 / Math.PI;
  return {
    id: p.id, name: str(p.name, p.id),
    parentId: typeof p.parentId === 'string' ? p.parentId : null,
    frameIndex: Number.isInteger(p.frameIndex) ? p.frameIndex : 0,
    base: { x: num(b.x), y: num(b.y), scaleX: num(b.scaleX, 1), scaleY: num(b.scaleY, 1), angle: isFinite(angle) ? angle : 0, alpha: num(b.alpha, 1) },
    origin: { x: num(o.x, 0.5), y: num(o.y, 0.5) },
    depth: num(p.depth, 0), visible: bool(p.visible, true),
  };
}

function coerceFrameTrack(t, i, w) {
  if (!isObj(t)) { w.push(`frameTracks[${i}]: 비객체 제거`); return null; }
  const frames = Array.isArray(t.frames) ? t.frames.filter((n) => Number.isInteger(n)) : [];
  let frameDurations = Array.isArray(t.frameDurations) ? t.frameDurations.map((n) => num(n)) : null;
  if (frameDurations && frameDurations.length !== frames.length) {
    w.push(`frameTracks[${i}].frameDurations 길이 불일치 → 무시`); frameDurations = null;
  }
  let loop = str(t.loop, 'loop');
  if (!FRAME_LOOPS.has(loop)) loop = 'loop';
  return { partId: str(t.partId, '__root__'), frames, fps: num(t.fps, 10), frameDurations, loop };
}

function coerceKey(k, w, ctx) {
  if (!isObj(k) || typeof k.t !== 'number' || typeof k.v !== 'number') { w.push(`${ctx}: 잘못된 키 제거`); return null; }
  return { t: k.t, v: k.v, ease: str(k.ease, 'Sine.easeInOut') };
}

function coerceTransformTrack(t, i, w) {
  if (!isObj(t) || typeof t.partId !== 'string') { w.push(`transformTracks[${i}]: partId 없는 트랙 제거`); return null; }
  const rawCh = isObj(t.channels) ? t.channels : {};
  const channels = {};
  for (const ch in rawCh) {
    let key = ch;
    if (ch === 'rotation') { key = 'angle'; w.push(`transformTracks[${i}] rotation→angle 정규화`); }
    if (!TWEEN_CHANNELS.has(key)) { w.push(`transformTracks[${i}] 미지 채널 '${ch}' 유지`); }
    const keys = (isObj(rawCh[ch]) && Array.isArray(rawCh[ch].keys) ? rawCh[ch].keys : [])
      .map((k) => coerceKey(k, w, `transformTracks[${i}].${key}`)).filter(Boolean)
      .sort((a, b) => a.t - b.t);
    if (key === 'angle' && ch === 'rotation') for (const k of keys) k.v = k.v * 180 / Math.PI;
    if (keys.length) channels[key] = { keys };
  }
  return { partId: t.partId, channels };
}

function coerceEvent(e, i, w) {
  if (!isObj(e) || typeof e.t !== 'number') { w.push(`events[${i}]: t 없는 이벤트 제거`); return null; }
  return { t: e.t, name: str(e.name, 'event'), data: isObj(e.data) ? e.data : {} };
}

function coerceClip(c, i, w) {
  if (!isObj(c) || typeof c.id !== 'string' || !c.id) { w.push(`clips[${i}]: id 없는 클립 제거`); return null; }
  let loop = str(c.loop, 'loop');
  if (!CLIP_LOOPS.has(loop)) { w.push(`clips[${i}].loop '${loop}' → loop`); loop = 'loop'; }
  return {
    id: c.id, name: str(c.name, c.id),
    length: Math.max(1, num(c.length, 800)),
    loop, timeScale: num(c.timeScale, 1),
    frameTracks: (Array.isArray(c.frameTracks) ? c.frameTracks : []).map((t, j) => coerceFrameTrack(t, j, w)).filter(Boolean),
    transformTracks: (Array.isArray(c.transformTracks) ? c.transformTracks : []).map((t, j) => coerceTransformTrack(t, j, w)).filter(Boolean),
    events: (Array.isArray(c.events) ? c.events : []).map((e, j) => coerceEvent(e, j, w)).filter(Boolean),
  };
}

/**
 * 원시 SpriteDoc → 안전 정규화. 비파괴.
 * @returns {{ ok: boolean, doc: object|null, warnings: string[] }}
 */
export function coerceSpriteDoc(raw, { source = 'spriteDoc' } = {}) {
  const w = [];
  if (!isObj(raw)) return { ok: false, doc: null, warnings: [`${source}: 객체가 아닙니다`] };
  const seen = new Set();
  const clips = (Array.isArray(raw.clips) ? raw.clips : []).map((c, i) => coerceClip(c, i, w)).filter((c) => {
    if (!c) return false;
    if (seen.has(c.id)) { w.push(`중복 clip id '${c.id}' 제거`); return false; }
    seen.add(c.id); return true;
  });
  const doc = {
    schemaVersion: SPRITE_DOC_SCHEMA_VERSION,
    kind: 'spriteDoc',
    id: str(raw.id, 'sprite'),
    name: str(raw.name, str(raw.id, 'Sprite')),
    source: coerceSource(raw.source, w),
    parts: (Array.isArray(raw.parts) ? raw.parts : []).map((p, i) => coercePart(p, i, w)).filter(Boolean),
    clips,
    meta: isObj(raw.meta) ? raw.meta : {},
  };
  return { ok: true, doc, warnings: w };
}

/** coerce 후 유효 doc 만 반환(실패 시 null). 경고는 DEV 콘솔. */
export function loadSpriteDocSafe(raw, source = 'spriteDoc') {
  const { ok, doc, warnings } = coerceSpriteDoc(raw, { source });
  if (warnings.length && typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
    console.warn('[spriteDocSchema]', warnings.join(' · '));
  }
  return ok ? doc : null;
}
