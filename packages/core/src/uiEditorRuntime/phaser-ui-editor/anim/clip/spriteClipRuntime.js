/**
 * spriteClipRuntime — 저작된 SpriteDoc(ui/sprites/*.json)을 게임/에디터 런타임에서 재생. (브라우저/Phaser)
 *
 *   SpriteAnimEditorScene 의 _rebuildStage / _applyPose / _rebuildPlayer 와 동일 규율을 패키지 코어로 추출.
 *   순수 샘플러 ClipPlayer 가 프레임 ⊕ 트랜스폼을 구동 → 파트 Sprite 에 적용(포즈는 elapsed 의 순수 함수).
 *
 *   ensureSpriteDocTexture(scene, doc)        — doc.source 아틀라스를 textureKey 로 보장 로드(grid/rects).
 *   buildClipParts(scene, container, doc, key) — doc.parts → 파트 Sprite 생성(깊이 정렬) + 베이스 포즈.
 *   playSpriteClip(scene, container, doc, opts) — 텍스처가 이미 로드된 doc 로 즉시 재생 → handle.
 *   loadSpriteClip(scene, ref, opts)           — file/id/json 을 받아 텍스처 로드 후 재생(Promise<handle>).
 */
import { ClipPlayer } from './ClipPlayer.js';
import { loadSpriteDocSafe } from '../../sprite/spriteDocSchema.js';

const TEX_LOAD_TIMEOUT = 15000;

/** dev 전용 경고(프로덕션 콘솔 오염 방지). */
function devWarn(...args) {
  try { if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) console.warn('[spriteClipRuntime]', ...args); } catch { /* */ }
}

/**
 * doc.source 의 아틀라스를 textureKey 로 보장 로드. 이미 있으면 즉시 resolve.
 *   grid  = scene.load.spritesheet(frameWidth/Height)  → setFrame(index) 로 칸 선택
 *   rects = scene.load.image + tex.add(index, ...)      → 비균일 콘텐츠 맞춤 프레임
 * @returns {Promise<string>} 로드된 textureKey
 */
export function ensureSpriteDocTexture(scene, doc) {
  const s = doc && doc.source;
  const key = s && s.textureKey;
  if (!key) return Promise.reject(new Error('SpriteDoc source.textureKey 없음'));
  if (scene.textures.exists(key)) return Promise.resolve(key);
  // ⚠️상대경로(서브패스 배포 대응) — 절대 '/ui/...' 는 게임이 '/<game>/' 하위에 배포되면 루트엔 없어 404.
  //   Phaser 로더는 document.baseURI(=/<game>/) 기준으로 상대경로를 해석하므로 게임 다른 에셋과 동일하게 동작.
  const path = s.path ? String(s.path).replace(/^\//, '') : '';
  if (!path) return Promise.reject(new Error(`SpriteDoc '${key}' 텍스처 경로(path) 없음 — 호스트가 미리 로드해야 합니다`));
  const sl = s.slicing || {};
  const rects = (sl.mode === 'rects' && Array.isArray(s.frames) && s.frames.length) ? s.frames : null;

  return new Promise((resolve, reject) => {
    let done = false;
    // ⚠️ 예전엔 로더 전체의 제네릭 'complete'/'loaderror' 이벤트를 once() 로 들었는데, 이 함수가
    //    같은 씬의 로더에서 여러 클립을 순차 호출(로딩화면 프리로드)될 때 실제로 실패가
    //    재현됐다(예: 홈런팝 — WebP 전환 후 실 배포/프리뷰 빌드에서도 "Failed to process file"
    //    로 캐릭터·전광판 스프라이트가 아예 안 뜸). 파일별 완료 이벤트(filecomplete-*-key)로
    //    바꾸고, loaderror 도 이 key 것만 걸러 받아 다른 파일의 실패/제네릭 완료 타이밍에
    //    엉뚱하게 반응하지 않게 한다 — 여러 파일을 동시/연속 로드해도 서로 안 섞인다.
    const fileType = rects ? 'image' : 'spritesheet';
    const completeEvent = `filecomplete-${fileType}-${key}`;
    const cleanup = () => {
      scene.load.off(completeEvent, onFileComplete);
      scene.load.off('loaderror', onLoadError);
    };
    const finish = (ok, err) => {
      if (done) return;
      done = true;
      cleanup();
      ok ? resolve(key) : reject(err || new Error('텍스처 로드 실패'));
    };
    const timer = setTimeout(() => finish(false, new Error('텍스처 로드 시간초과')), TEX_LOAD_TIMEOUT);
    const onFileComplete = () => {
      clearTimeout(timer);
      if (rects) {                                  // 비균일 — 단일 이미지에 커스텀 프레임 등록
        try {
          const tex = scene.textures.get(key);
          const src = tex.getSourceImage(); const iw = src.width | 0, ih = src.height | 0;
          for (const fr of rects) {
            const x = Math.max(0, Math.min(iw - 1, fr.x | 0)), y = Math.max(0, Math.min(ih - 1, fr.y | 0));
            const w = Math.max(1, Math.min(iw - x, fr.w | 0)), h = Math.max(1, Math.min(ih - y, fr.h | 0));
            tex.add(fr.index, 0, x, y, w, h);
          }
        } catch (e) { devWarn('rects 프레임 등록 실패:', e && e.message); }
      }
      finish(true);
    };
    const onLoadError = (file) => {
      if (!file || file.key !== key) return; // 다른 파일의 실패는 이 프라미스와 무관 — 무시.
      clearTimeout(timer);
      finish(false, new Error(`텍스처 로드 실패: ${path}`));
    };
    try {
      scene.load.on(completeEvent, onFileComplete);
      scene.load.on('loaderror', onLoadError);
      if (rects) scene.load.image(key, path);
      else scene.load.spritesheet(key, path, { frameWidth: Math.max(1, sl.frameWidth || s.imageW || 1), frameHeight: Math.max(1, sl.frameHeight || s.imageH || 1) });
      scene.load.start();
    } catch (e) { clearTimeout(timer); finish(false, e); }
  });
}

/** 클립의 "네이티브" 한 프레임 px(원본) — grid=slicing.frameW/H, rects=frames[0], 폴백=이미지 전체.
 *   ⚠ 파트 스프라이트의 실제 픽셀 크기이므로 컨테이너 스케일·앵커 오프셋의 기준. alignScale 은 곱하지 않는다. */
export function clipNativeSize(doc) {
  const s = (doc && doc.source) || {};
  const sl = s.slicing || {};
  if (sl.frameWidth > 0 && sl.frameHeight > 0) return { w: sl.frameWidth, h: sl.frameHeight };
  const f0 = (Array.isArray(s.frames) && s.frames[0]) || null;
  if (f0 && f0.w > 0 && f0.h > 0) return { w: f0.w, h: f0.h };
  return { w: s.imageW || 0, h: s.imageH || 0 };
}

/** 캐릭터 정렬 스케일(meta.alignScale) — 크기 다른 애니의 "기본 표시 크기" 비율(1=원본). UI에디터 기본 w/h 시드에만 사용. */
export function clipAlignScale(doc) { const k = doc && doc.meta && doc.meta.alignScale; return k > 0 ? k : 1; }

/** ref(파일/id/JSON) → {w,h(원본 프레임), scale(정렬 스케일), anchor(중심점)}. 텍스처 로드 없이 문서만 fetch(+캐시). */
export async function getSpriteDocNativeSize(ref, opts = {}) {
  const doc = await resolveSpriteDoc(ref, opts);
  if (!doc) return { w: 0, h: 0, scale: 1, anchor: null };
  const ns = clipNativeSize(doc);
  const a = doc.meta && doc.meta.anchor;
  return { w: ns.w, h: ns.h, scale: clipAlignScale(doc), anchor: (a && a.x != null) ? { x: a.x, y: a.y } : null };
}

/**
 * doc.parts → 파트 Sprite 생성(깊이 정렬) + 베이스 포즈 적용. container 에 추가, Map<partId,Sprite> 반환.
 *   정렬 앵커(doc.meta.anchor, 0..1): 프레임 안의 기준점(예: 발밑·중심)을 컨테이너 원점(=배치 지점)에 맞춘다.
 *   → 크기가 다른 애니들도 같은 노드 위치에 두면 앵커가 일치 = 캐릭터가 튀지 않고 정렬. (UI에디터/게임 공통)
 */
export function buildClipParts(scene, container, doc, key, anchor) {
  const parts = new Map();
  const a = anchor || (doc.meta && doc.meta.anchor);   // 배치별(노드) 앵커 우선, 없으면 애니(doc) 기본 앵커
  const ns = clipNativeSize(doc);
  const offX = (a && ns.w) ? (((a.x == null ? 0.5 : a.x)) - 0.5) * ns.w : 0;   // 앵커→중심 오프셋(네이티브 px)
  const offY = (a && ns.h) ? (((a.y == null ? 0.5 : a.y)) - 0.5) * ns.h : 0;
  const list = [...(doc.parts || [])].sort((x, y) => (x.depth || 0) - (y.depth || 0));
  for (const part of list) {
    const sp = scene.add.sprite(0, 0, key, part.frameIndex || 0);
    const b = part.base || {};
    sp.setPosition((b.x || 0) - offX, (b.y || 0) - offY).setScale(b.scaleX == null ? 1 : b.scaleX, b.scaleY == null ? 1 : b.scaleY)
      .setAngle(b.angle || 0).setAlpha(b.alpha == null ? 1 : b.alpha).setVisible(part.visible !== false);
    const o = part.origin || { x: 0.5, y: 0.5 };
    sp.setOrigin(o.x == null ? 0.5 : o.x, o.y == null ? 0.5 : o.y);
    container.add(sp);
    parts.set(part.id, sp);
  }
  return parts;
}

/** 프레임별 중심점(pivot)을 현재 표시 프레임 기준으로 origin 에 반영(프레임마다 다른 시각 중심 지원). */
function applyFramePivots(doc, parts) {
  const frames = doc.source && doc.source.frames; if (!frames || !frames.length) return;
  for (const [, sp] of parts) {
    if (!sp || !sp.frame) continue;
    const idx = Number(sp.frame.name); if (!Number.isFinite(idx)) continue;
    const fr = frames.find((f) => f.index === idx);
    if (fr && (fr.pivotX != null || fr.pivotY != null)) sp.setOrigin(fr.pivotX == null ? 0.5 : fr.pivotX, fr.pivotY == null ? 0.5 : fr.pivotY);
  }
}

/**
 * 텍스처가 이미 로드된 doc 로 즉시 클립 재생. (동기)
 * @param {object} scene Phaser.Scene
 * @param {object} container Phaser.Container — 파트가 이 안에 추가됨(노드 위치/회전 = 컨테이너)
 * @param {object} doc 정규화된 SpriteDoc
 * @param {{clipId?:string, autoPlay?:boolean}} [opts]
 * @returns {{player, parts, clip, play, pause, seek, stop}}
 */
export function playSpriteClip(scene, container, doc, opts = {}) {
  const key = doc.source && doc.source.textureKey;
  if (!key || !scene.textures.exists(key)) throw new Error('텍스처가 로드되지 않음 — loadSpriteClip 을 사용하세요');
  const clips = doc.clips || [];
  const clip = (opts.clipId && clips.find((c) => c.id === opts.clipId)) || clips[0];
  if (!clip) throw new Error('SpriteDoc 에 클립이 없습니다');

  const parts = buildClipParts(scene, container, doc, key, opts.anchor);
  const player = new ClipPlayer(clip, parts);
  applyFramePivots(doc, parts);
  if (opts.autoPlay !== false) player.play(); else player.seek(0);

  const onUpdate = (_t, dtMs) => {
    if (!container.active) return;          // 파괴된 컨테이너(에디터 재렌더) — 틱 무시
    player.tick(dtMs / 1000);
    applyFramePivots(doc, parts);
  };
  scene.events.on('update', onUpdate);
  let stopped = false;
  const stop = () => { if (stopped) return; stopped = true; player.pause(); scene.events.off('update', onUpdate); };
  // 컨테이너 파괴(에디터 재렌더/씬 종료) 시 티커 해제 — 누수/죽은 객체 틱 방지.
  if (container.once) container.once('destroy', stop);
  scene.events.once('shutdown', stop);
  scene.events.once('destroy', stop);

  return {
    player, parts, clip,
    play: () => player.play(), pause: () => player.pause(),
    seek: (ms) => player.seek(ms), stop,
  };
}

/** ref(파일경로/id/JSON) → 정규화 SpriteDoc. opts.docJson/opts.docs 로 주입·해석 가능. */
async function resolveSpriteDoc(ref, opts) {
  let raw = null;
  if (opts.docJson) raw = opts.docJson;
  else if (ref && typeof ref === 'object') raw = ref;                  // 이미 JSON
  else if (typeof ref === 'string') raw = await fetchSpriteDocJson(ref, opts);
  return raw ? loadSpriteDocSafe(raw, 'spriteClip') : null;
}

// fetch 캐시 — 에디터 재렌더(드래그)마다 같은 문서를 반복 요청하지 않도록 url→json 보관(세션).
const _docCache = new Map();
/** 저장된 스프라이트 문서가 갱신됐을 때 캐시 무효화(에디터 진입/재저장 시 호출). */
export function clearSpriteDocCache() { _docCache.clear(); }

/** 파일경로(ui/sprites/*.json) 또는 id 를 fetch(+캐시). opts.docs(매니페스트)에서 id→file 해석. */
function fetchSpriteDocJson(ref, opts) {
  let file = ref;
  if (opts.docs && Array.isArray(opts.docs)) {
    const d = opts.docs.find((x) => x.id === ref || x.file === ref);
    if (d && d.file) file = d.file;
  }
  if (!/\.json$/i.test(file)) file = `ui/sprites/${file}.json`;
  // 기본은 정적 적용본(/ui/...). 에디터 미리보기는 opts.docUrl 로 스테이징 엔드포인트(/__ui_sprite)를 주입해
  //   아직 "게임에 적용" 안 한 작업본도 렌더한다. JSON 이 아니면(SPA 폴백 등) null 처리.
  // ⚠️상대경로(서브패스 배포 대응) — 절대 '/ui/...' 는 '/<game>/' 하위 배포에서 404. document.baseURI 기준 해석.
  const url = (typeof opts.docUrl === 'function') ? opts.docUrl(file) : String(file).replace(/^\//, '');
  if (_docCache.has(url)) return Promise.resolve(_docCache.get(url));
  // content-type 에 의존하지 않고 본문을 JSON 파싱(호스트/SW 가 text/plain 등으로 줘도 견고; HTML 폴백이면 파싱 실패→null).
  return fetch(url)
    .then((r) => (r.ok ? r.text() : ''))
    .then((t) => { let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = null; } if (j) _docCache.set(url, j); return j; })
    .catch(() => null);
}

/**
 * file/id/JSON 을 받아 텍스처 로드 후 재생. 컨테이너 미지정 시 생성.
 * @param {object} scene
 * @param {string|object} ref ui/sprites/<...>.json 경로, 매니페스트 id, 또는 SpriteDoc JSON
 * @param {{container?, x?, y?, clipId?, autoPlay?, docJson?, docs?}} [opts]
 * @returns {Promise<{player, parts, clip, container, doc, play, pause, seek, stop}>}
 */
export async function loadSpriteClip(scene, ref, opts = {}) {
  const doc = await resolveSpriteDoc(ref, opts);
  if (!doc) throw new Error('SpriteDoc 를 불러오지 못했습니다');
  await ensureSpriteDocTexture(scene, doc);
  const container = opts.container || scene.add.container(opts.x || 0, opts.y || 0);
  // 비동기 로드 중 컨테이너가 파괴됐으면(에디터 재렌더) 죽은 객체에 그리지 않는다.
  if (container.active === false || container.scene == null) {
    const noop = () => {};
    return { player: null, parts: new Map(), clip: null, container, doc, play: noop, pause: noop, seek: noop, stop: noop };
  }
  const handle = playSpriteClip(scene, container, doc, opts);
  handle.container = container; handle.doc = doc;
  return handle;
}
