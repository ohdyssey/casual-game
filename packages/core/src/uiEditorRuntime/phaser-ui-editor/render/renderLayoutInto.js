/**
 * render/renderLayoutInto — 레이아웃 → Phaser GameObject 렌더(에디터/게임 공유 코어).
 *
 * 노드-타입 레지스트리: 제네릭 타입(image/spriteAnim/text/rect/circle/repeater)은 패키지 내장.
 *   게임-특정 타입(coin/iconRow/art …)은 호스트가 registerNodeRenderer 로 등록(또는 text 등 오버라이드).
 *
 * 각 렌더러 시그니처: (ctx, node) => GameObject[]
 *   ctx = { scene, container, data, lx, ly, tintTargets, alphaTargets, add, renderChild, textBuilder }
 *     - add(o): container 에 추가하고 반환
 *     - renderChild(node): 자식 노드 1개 렌더(반복 그리드용 재귀) → objects
 *     - tintTargets/alphaTargets: dim(틴트/알파) 대상 수집 배열(호출부가 setCardTint 등에 사용)
 *     - textBuilder(scene, x, y, str, fontSize, {color,strokeColor,strokeWidth}) => Text
 */
import { loadLayoutSafe } from '../schema/layoutSchema.js';
import { loadSpriteClip, clipNativeSize } from '../anim/clip/spriteClipRuntime.js';
import { sanitizePoints, pointsBounds } from '../schema/shapeGeometry.js';
import { reportToolError } from '../report/reporter.js';

/** 색상 '#rrggbb'|number → number. */
export function hexNum(c) {
  if (typeof c === 'number') return c;
  let s = String(c || '#000000').replace('#', '');
  if (s.length === 3) s = s.split('').map((x) => x + x).join('');
  return parseInt(s.slice(0, 6), 16) || 0;
}

// ── 기본 텍스트 빌더(호스트가 textBuilder 미주입 시) ──
let _defaultTextBuilder = (scene, x, y, str, fontSize, style = {}) => {
  const t = scene.add.text(x, y, String(str ?? ''), {
    fontFamily: 'sans-serif', fontSize: `${fontSize || 18}px`,
    color: style.color || '#ffffff',
    stroke: style.strokeColor || '#000000', strokeThickness: style.strokeWidth || 0,
  }).setOrigin(0.5);
  return t;
};
export function setDefaultTextBuilder(fn) { if (typeof fn === 'function') _defaultTextBuilder = fn; }

const _clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * 그림자 · 외곽 입체(베벨) — 본체 뒤에 "픽셀 단위" 오프셋 복제를 깔아 표현(에디터/게임 공유).
 *   ⚠ Phaser Shadow FX 의 x/y 는 정규화 텍스처좌표(0~1)·광원위치 모델이라 px 직관·미세조정에 부적합.
 *     → 수동 복제: offset 이 정확히 px → 작은 값=작은 움직임(요청대로 세밀 조정 가능).
 *   makeSil(dx, dy, colorNum, alpha, blurPx) = 본체와 같은 모양을 (dx,dy)px 옮긴 단색 실루엣을
 *     container 에 추가하고 반환(없으면 null). 본체보다 "먼저" 호출하므로 자연히 뒤에 깔린다.
 *   (텍스트는 호출부에서 별도 처리 — 그림자=네이티브 setShadow, 입체=글자 복제)
 * @returns 추가된 데코 오브젝트 배열(뒤→앞: 그림자, 음영, 하이라이트)
 */
function addDecor(node, makeSil) {
  const out = [];
  if (node.shadow) {   // 드롭 그림자 — 가장 뒤
    const o = makeSil(node.shadowX ?? 2, node.shadowY ?? 2, hexNum(node.shadowColor ?? '#000000'),
      _clamp(node.shadowAlpha ?? 0.4, 0, 1), _clamp(node.shadowBlur ?? 2, 0, 24));
    if (o) out.push(o);
  }
  if (node.bevel) {    // 외곽 입체 — 하단-우측 음영 + 상단-좌측 하이라이트(솟은 3D)
    const d = _clamp(node.bevelDepth ?? 1, 0, 40);
    const a = _clamp(node.bevelStrength ?? 0.5, 0, 1);
    const lo = makeSil(d, d, hexNum(node.bevelDark ?? '#000000'), a, 0);
    const hi = makeSil(-d, -d, hexNum(node.bevelLight ?? '#ffffff'), a, 0);
    if (lo) out.push(lo);
    if (hi) out.push(hi);
  }
  return out;
}

/** 텍스트 입체(베벨) — 본체 글자 뒤에 음영/하이라이트 글자 복제. buildText(x,y,colorStr)=설정된 Text. */
function addTextBevel(node, X, Y, container, buildText) {
  if (!node.bevel) return [];
  const d = _clamp(node.bevelDepth ?? 1, 0, 40);
  const a = _clamp(node.bevelStrength ?? 0.5, 0, 1);
  const lo = buildText(X + d, Y + d, node.bevelDark ?? '#000000'); if (lo.setAlpha) lo.setAlpha(a); container.add(lo);
  const hi = buildText(X - d, Y - d, node.bevelLight ?? '#ffffff'); if (hi.setAlpha) hi.setAlpha(a); container.add(hi);
  return [lo, hi];
}

/**
 * 도형 채우기 = 이미지/스프라이트클립을 "도형 모양으로 마스킹"(rect/circle/polygon 공통).
 *   geo = { cx, cy, ang, boxW, boxH, drawPath(g) } — drawPath 는 중심(0,0) 기준 도형 경로를 g 에 채운다.
 *
 *   ⚠ Phaser 4 의 GeometryMask(setMask)는 Canvas 전용 — WebGL 에선 무시된다. 대신 새 Filters 마스크
 *     (`obj.enableFilters().filters.internal.addMask(maskGO, false)`)를 쓴다. maskGO 를 컨테이너 자식으로
 *     두고 'world' 변환(기본)으로 캡처 → parentContainer(카드 컨테이너) 변환을 따라가 에디터 팬/줌·게임
 *     변환과 정렬된다. 마스크는 setVisible(false)(필터 capture 는 visible 무시) — autoUpdate 로 매 프레임 추적.
 *   미디어 없으면 [] 반환(단색 채움 폴백).
 * @returns {GameObject[]} [미디어, 마스크]
 */
function addShapeMedia(ctx, node, geo) {
  if (!node.fillImage && !node.fillClip) return [];
  const { scene, container } = ctx;
  const hasImg = node.fillImage && scene.textures.exists(node.fillImage);
  if (!node.fillClip && !hasImg) return [];   // 이미지 키 미로드 → 마스크 생성 안 함(단색 채움 폴백)

  const mask = scene.add.graphics();
  mask.fillStyle(0xffffff, 1); geo.drawPath(mask);   // 도형 경로를 로컬(0,0) 기준으로 채움
  container.add(mask); mask.setVisible(false);        // 카드 자식(재렌더 시 함께 정리) + 정상 렌더 생략
  // ⚠ Phaser 3 마스크(Geometry/Bitmap)는 마스크 GO 를 부모변환 없이 "자기 로컬변환"으로만 렌더한다
  //   (GetCalcMatrix, parentMatrix=null). 줌/팬된 카드 컨테이너 안 콘텐츠와 어긋나 통째로 잘림 → 마스크의
  //   로컬변환을 "부모(카드) 월드변환 × 도형위치(geo.cx,cy,ang)"로 베이크해 화면상에서 콘텐츠와 정렬시킨다.
  const bakeMaskTransform = () => {
    const pm = container.getWorldTransformMatrix();
    mask.setPosition(pm.getX(geo.cx, geo.cy), pm.getY(geo.cx, geo.cy));
    mask.setScale(pm.scaleX, pm.scaleY);
    mask.setRotation((pm.rotation || 0) + (geo.ang ? geo.ang * Math.PI / 180 : 0));
  };
  bakeMaskTransform();
  // 에디터: 줌/팬으로 카드 변환이 바뀌면(재렌더 없이) 마스크도 다시 베이크해야 정렬 유지.
  if (ctx.maskResyncs) ctx.maskResyncs.push(bakeMaskTransform);

  // 미디어 중심 = 도형의 시각적 bbox 중심(노드중심 + bbox 오프셋). 삼각형 등 points 가 bbox-중심이
  //   아닌 도형에서도 채움이 도형 한가운데 오도록. 회전 시 오프셋도 노드중심 둘레로 함께 회전.
  let mx = geo.cx, my = geo.cy;
  const bx = geo.boxCx || 0, by = geo.boxCy || 0;
  if (bx || by) {
    if (geo.ang) { const r = geo.ang * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); mx += bx * c - by * s; my += bx * s + by * c; }
    else { mx += bx; my += by; }
  }

  // 성능: 마스크는 도형(모양·위치·회전·카메라)이 바뀔 때만 다시 캡처하면 된다. 채움이 애니메이션(클립)
  //   이어도 "도형"이 정적이면 마스크는 1회 캡처로 충분(클립 프레임은 대상 텍스처에서 갱신됨).
  //   기본 autoUpdate=true 는 매 프레임 마스크를 재캡처해 비싸므로, 정적인 경우 끈다.
  //   동적으로 유지: ① 에디터(팬/줌으로 월드변환 변함) ② 노드 자체 애니(위치·회전 변동 가능).
  //   (게임에서 부모 컨테이너가 움직이는 도형은 node.fillMaskDynamic:true 로 강제 동적 지정.)
  const dynamicMask = !!ctx.editor || !!node.anim || !!node.fillMaskDynamic;
  const applyMask = (obj) => {
    if (!obj) return;
    // Phaser 4: 필터 마스크(enableFilters + addMask). 현재 런타임(에디터=게임 Phaser 3 alias, v3.90)엔 없음.
    if (typeof obj.enableFilters === 'function') {
      try {
        obj.enableFilters();
        const mf = obj.filters.internal.addMask(mask, false);
        if (mf && !dynamicMask) { mf.autoUpdate = false; mf.needsUpdate = true; }   // 정적 도형 → 마스크 1회만 캡처
      } catch (e) { /* 필터 미지원 */ }
      return;
    }
    // Phaser 3 폴백 = GeometryMask(WebGL 스텐실/Canvas 공통). 마스크 그래픽스의 로컬변환을 위에서
    //   카드 월드변환으로 베이크했으므로(부모변환 무시 렌더에 맞춤) 줌/팬된 에디터에서도 정확히 클립된다.
    if (typeof obj.setMask === 'function' && typeof mask.createGeometryMask === 'function') {
      try { obj.setMask(mask.createGeometryMask()); } catch (e) { /* 마스크 미지원 — 외곽/채움만 */ }
    }
  };

  if (node.fillClip) {
    // 스프라이트 애니(클립)를 도형에 채움 — 중앙 앵커로 로드(발밑 등 doc 기본앵커 무시 → 도형 중앙 정렬),
    //   박스를 덮도록(cover) 스케일 후 도형 모양으로 마스킹.
    const sub = scene.add.container(mx, my);
    if (geo.ang) sub.setAngle(geo.ang);
    container.add(sub);
    loadSpriteClip(scene, node.fillClip, {
      container: sub, clipId: node.fillClipId,
      autoPlay: node.autoPlay !== false && !ctx.pauseClips,
      anchor: { x: 0.5, y: 0.5 },
      docJson: node.__fillDocJson || null, docs: ctx.spriteDocs || null,
      docUrl: ctx.spriteDocUrl || null,   // 에디터: 스테이징 엔드포인트로 미적용 작업본도 렌더
    }).then((h) => {
      if (h && sub.setScale) {
        const ns = clipNativeSize(h.doc || {});
        if (ns.w > 0 && ns.h > 0 && geo.boxW > 0 && geo.boxH > 0) sub.setScale(Math.max(geo.boxW / ns.w, geo.boxH / ns.h));
      }
      applyMask(sub);   // GeometryMask 는 컨테이너(scaled) 자식 전체를 도형 모양으로 클립
    }).catch(() => { applyMask(sub); /* 클립 로드 실패 — 도형 외곽만 표시 */ });
    return [sub, mask];
  }

  const img = scene.add.image(mx, my, node.fillImage).setOrigin(0.5);
  const src = scene.textures.get(node.fillImage).getSourceImage();
  const sw = (src && src.width) || geo.boxW || 1, sh = (src && src.height) || geo.boxH || 1;
  const s = Math.max((geo.boxW || sw) / sw, (geo.boxH || sh) / sh);   // cover-fit
  img.setDisplaySize(sw * s, sh * s);
  if (geo.ang) img.setAngle(geo.ang);
  container.add(img);
  applyMask(img);
  return [img, mask];
}

// ── 제네릭 노드 렌더러(패키지 내장) ──
const BUILTIN = {
  image(ctx, node) {
    const { scene, lx, ly, container, tintTargets } = ctx;
    // 변수(데이터) 연결 — 게임이 런타임에 이미지를 교체(인스펙터 약속과 1:1). 바인딩 키 텍스처가
    //   없으면 기본(node.key)으로 폴백.
    const bound = node.binding && ctx.data && ctx.data[node.binding];
    const key = (bound && scene.textures.exists(bound)) ? bound : node.key;
    if (!scene.textures.exists(key)) {
      // 에디터 모드: 텍스처 미로드 이미지 → 플레이스홀더(회색 박스 + 키 이름)로 위치/크기 표시.
      if (ctx.editor) {
        const X = lx(node.x), Y = ly(node.y);
        const w = (node.w > 0 ? node.w : 120), h = (node.h > 0 ? node.h : 80);
        const g = scene.add.graphics();
        g.fillStyle(0x1a2233, 0.75); g.fillRect(X - w / 2, Y - h / 2, w, h);
        g.lineStyle(1, 0x4477bb, 0.7); g.strokeRect(X - w / 2, Y - h / 2, w, h);
        container.add(g);
        const label = (key ? `⚠ ${key}` : '⚠ 이미지 없음');
        const t = scene.add.text(X, Y, label, { fontSize: '11px', color: '#4477bb', wordWrap: { width: w - 6 }, align: 'center' }).setOrigin(0.5);
        container.add(t);
        return [g, t];
      }
      return [];
    }
    const X = lx(node.x), Y = ly(node.y);
    const decor = addDecor(node, (dx, dy, col, alpha, blur) => {
      const c = scene.add.image(X + dx, Y + dy, key).setOrigin(0.5);
      c.setDisplaySize(node.w, node.h); c.setTintFill(col); c.setAlpha(alpha);   // 단색 실루엣(임의 색)
      if (node.angle && c.setAngle) c.setAngle(node.angle);
      if (blur > 0 && c.postFX && c.postFX.addBlur) { try { c.postFX.addBlur(0, blur, blur, 1); } catch { /* 블러 미지원 → 또렷 그림자 */ } }
      container.add(c); return c;
    });
    // 9-slice(나인패치) — 가장자리 보존 늘이기(버튼/패널). WebGL 전용 → 실패 시 일반 이미지 폴백.
    let img = null;
    if (node.slice9 && scene.add.nineslice) {
      const s9 = node.slice9;
      try {
        img = scene.add.nineslice(X, Y, key, undefined, node.w, node.h,
          Math.max(0, s9.l ?? 0), Math.max(0, s9.r ?? 0), Math.max(0, s9.t ?? 0), Math.max(0, s9.b ?? 0));
        img.setOrigin(0.5);
      } catch { img = null; }
    }
    if (!img) {
      img = scene.add.image(X, Y, key).setOrigin(0.5);
      img.setDisplaySize(node.w, node.h);
    }
    if (node.angle && img.setAngle) img.setAngle(node.angle);
    container.add(img);
    if (node.tintable) tintTargets.push(img);
    return [img, ...decor];
  },
  spriteAnim(ctx, node) {
    const { scene, lx, ly, container, tintTargets } = ctx;
    if (!scene.textures.exists(node.key)) return [];
    const s = scene.add.sprite(lx(node.x), ly(node.y), node.key).setOrigin(0.5);
    if (node.w && node.h) s.setDisplaySize(node.w, node.h);
    if (node.angle && s.setAngle) s.setAngle(node.angle);
    container.add(s); tintTargets.push(s);
    return [s];
  },
  // 저작된 SpriteDoc(ui/sprites/*.json) 클립 — 파트 Sprite + ClipPlayer 로 프레임⊕트랜스폼 재생.
  //   비동기로 문서·텍스처를 로드하므로 컨테이너를 먼저 반환하고 준비되는 대로 채운다(실패해도 레이아웃 진행).
  spriteDocClip(ctx, node) {
    const { scene, lx, ly, container } = ctx;
    const c = scene.add.container(lx(node.x), ly(node.y));
    if (node.angle && c.setAngle) c.setAngle(node.angle);
    container.add(c);
    const ref = node.spriteDocFile || node.spriteDocId;
    if (ref) {
      loadSpriteClip(scene, ref, {
        container: c, clipId: node.clipId,
        autoPlay: node.autoPlay !== false && !ctx.pauseClips,   // 크기 조절 중엔 정지(정적 프레임)
        anchor: (node.anchor && node.anchor.x != null) ? node.anchor : null,   // 배치별 중심점(앵커) 우선
        docJson: node.__docJson || null, docs: ctx.spriteDocs || null,
        docUrl: ctx.spriteDocUrl || null,   // 에디터: 스테이징 엔드포인트로 미적용 작업본도 렌더
      }).then((h) => {
        // node.w/h(표시 크기) 지정 시 컨테이너를 네이티브 프레임 크기 기준으로 스케일 → 에디터/게임 공통 크기 조절.
        if (!h || !c.setScale) return;
        const ns = clipNativeSize(h.doc || {});
        if (node.w > 0 && node.h > 0 && ns.w > 0 && ns.h > 0) c.setScale(node.w / ns.w, node.h / ns.h);
      }).catch((e) => {
        reportToolError('sprite', e, { nodeId: node.id, ref });
        try { if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) console.warn('[renderLayoutInto] spriteDocClip 로드 실패:', (e && e.message) || e); } catch { /* */ }
      });
    }
    return [c];
  },
  text(ctx, node) {
    const { scene, lx, ly, container, tintTargets, textBuilder } = ctx;
    const str = (node.binding && ctx.data && ctx.data[node.binding] != null) ? ctx.data[node.binding] : (node.text ?? '');
    const X = lx(node.x), Y = ly(node.y);
    const buildText = (x, y, colorStr) => {                          // 본체·입체복제 공용 빌더
      const tt = (textBuilder || _defaultTextBuilder)(scene, x, y, str, node.fontSize,
        { color: colorStr, strokeColor: node.stroke, strokeWidth: node.strokeW });
      if (node.fontFamily && tt.setFontFamily) tt.setFontFamily(node.fontFamily);
      if (node.fontStyle && tt.setFontStyle) tt.setFontStyle(node.fontStyle);
      if (tt.setResolution) tt.setResolution(3);
      if (node.angle && tt.setAngle) tt.setAngle(node.angle);
      // 줄 정렬(멀티라인) — 좌/가운데/우. 단일라인엔 무영향이지만 origin(앵커)과 함께 일관 적용.
      //   wrapW 없는 텍스트도 정렬이 실제 반영되도록 여기서 항상 설정(에디터·게임 동일).
      if (tt.setAlign) tt.setAlign(node.align || 'center');
      const ox = node.align === 'left' ? 0 : node.align === 'right' ? 1 : 0.5;
      const oy = node.valign === 'top' ? 0 : node.valign === 'bottom' ? 1 : 0.5;
      if (tt.setOrigin) tt.setOrigin(ox, oy);
      return tt;
    };
    const bevel = addTextBevel(node, X, Y, container, buildText);    // 외곽 입체 — 글자 복제(본체 뒤)
    const t = buildText(X, Y, node.color);
    if (node.shadow && t.setShadow) {                               // 그림자 — 네이티브(픽셀 오프셋·블러)
      t.setShadow(node.shadowX ?? 2, node.shadowY ?? 2, node.shadowColor ?? '#000000', _clamp(node.shadowBlur ?? 2, 0, 24), true, true);
    }
    container.add(t); tintTargets.push(t);
    return [t, ...bevel];
  },
  rect(ctx, node) {
    const { scene, lx, ly, container } = ctx;
    const w = Math.round(node.w), h = Math.round(node.h);
    // 중심 기준 로컬좌표로 그린 뒤 setPosition+setAngle — 회전이 노드 중심을 축으로 일관되게 돌도록.
    const cx = lx(node.x), cy = ly(node.y);
    const x0 = -w / 2, y0 = -h / 2;
    const rad = node.radius ?? 0;
    const ang = node.angle || 0;
    const decor = addDecor(node, (dx, dy, col, alpha, blur) => {
      const gg = scene.add.graphics(); gg.fillStyle(col, alpha); gg.fillRoundedRect(x0 + dx, y0 + dy, w, h, rad);
      if (blur > 0 && gg.postFX && gg.postFX.addBlur) { try { gg.postFX.addBlur(0, blur, blur, 1); } catch { /* 또렷 그림자로 폴백 */ } }
      gg.setPosition(cx, cy); if (ang) gg.setAngle(ang);
      container.add(gg); return gg;
    });
    // 이미지/애니 채우기 — 도형 모양으로 마스킹(있으면 단색 채움 생략, 외곽선은 유지).
    const media = addShapeMedia(ctx, node, { cx, cy, ang, boxW: w, boxH: h, drawPath: (mg) => mg.fillRoundedRect(x0, y0, w, h, rad) });
    const g = scene.add.graphics();
    if (node.fill && !media.length) { g.fillStyle(hexNum(node.fill), node.fillAlpha ?? 1); g.fillRoundedRect(x0, y0, w, h, rad); }
    if (node.stroke && node.strokeW) { g.lineStyle(node.strokeW, hexNum(node.stroke), 1); g.strokeRoundedRect(x0, y0, w, h, rad); }
    g.setPosition(cx, cy); if (ang) g.setAngle(ang);
    container.add(g);
    return [g, ...media, ...decor];
  },
  circle(ctx, node) {
    const { scene, lx, ly, container } = ctx;
    if (!(node.r > 0)) return [];
    const cx = lx(node.x), cy = ly(node.y);
    const r = node.r;
    const decor = addDecor(node, (dx, dy, col, alpha, blur) => {
      const gg = scene.add.graphics(); gg.fillStyle(col, alpha); gg.fillCircle(cx + dx, cy + dy, r);
      if (blur > 0 && gg.postFX && gg.postFX.addBlur) { try { gg.postFX.addBlur(0, blur, blur, 1); } catch { /* 또렷 그림자로 폴백 */ } }
      container.add(gg); return gg;
    });
    // 이미지/애니 채우기 — 원형 마스킹(중심 0,0 기준 mask 를 cx,cy 에 배치).
    const media = addShapeMedia(ctx, node, { cx, cy, ang: 0, boxW: r * 2, boxH: r * 2, drawPath: (mg) => mg.fillCircle(0, 0, r) });
    const g = scene.add.graphics();
    if (node.fill && !media.length) { g.fillStyle(hexNum(node.fill), node.fillAlpha ?? 1); g.fillCircle(cx, cy, r); }
    if (node.stroke && node.strokeW) { g.lineStyle(node.strokeW, hexNum(node.stroke), 1); g.strokeCircle(cx, cy, r); }
    container.add(g);
    return [g, ...media, ...decor];
  },
  // 다각형(삼각형·사각형·n각형·자유형) — points 는 중심(0,0) 기준 디자인좌표 꼭지점. rect 와 동일하게
  //   중심에 그린 뒤 setPosition+setAngle. 이미지/애니 채우기·그림자·베벨 공통 지원.
  polygon(ctx, node) {
    const { scene, lx, ly, container } = ctx;
    const pts = sanitizePoints(node.points);
    if (pts.length < 3) return [];
    const cx = lx(node.x), cy = ly(node.y);
    const ang = node.angle || 0;
    const bb = pointsBounds(pts);
    const drawFill = (g, dx = 0, dy = 0) => g.fillPoints(pts.map((p) => ({ x: p.x + dx, y: p.y + dy })), true);
    const decor = addDecor(node, (dx, dy, col, alpha, blur) => {
      const gg = scene.add.graphics(); gg.fillStyle(col, alpha); drawFill(gg, dx, dy);
      if (blur > 0 && gg.postFX && gg.postFX.addBlur) { try { gg.postFX.addBlur(0, blur, blur, 1); } catch { /* 또렷 그림자 폴백 */ } }
      gg.setPosition(cx, cy); if (ang) gg.setAngle(ang); container.add(gg); return gg;
    });
    const media = addShapeMedia(ctx, node, { cx, cy, ang, boxW: bb.w, boxH: bb.h, boxCx: bb.cx, boxCy: bb.cy, drawPath: (mg) => drawFill(mg) });
    const g = scene.add.graphics();
    if (node.fill && !media.length) { g.fillStyle(hexNum(node.fill), node.fillAlpha ?? 1); drawFill(g); }
    if (node.stroke && node.strokeW) { g.lineStyle(node.strokeW, hexNum(node.stroke), 1); g.strokePoints(pts, true, true); }
    g.setPosition(cx, cy); if (ang) g.setAngle(ang);
    container.add(g);
    return [g, ...media, ...decor];
  },
  repeater(ctx, node) {
    const item = node.item;
    if (!item || item.type === 'repeater') return [];
    const iw = item.w || 64, ih = item.h || 64;
    const cols = Math.max(1, Math.round(node.cols || 4));
    const gapX = node.gapX ?? 12, gapY = node.gapY ?? 12;
    const count = Math.max(0, Math.min(Math.round(node.count || 0), 200));
    const out = [];
    for (let i = 0; i < count; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const itemNode = { ...item, id: `${node.id}#${i}`, x: node.x + col * (iw + gapX), y: node.y + row * (ih + gapY) };
      out.push(...ctx.renderChild(itemNode));
    }
    return out;
  },
};

// 전역 레지스트리 = 내장 + 호스트 등록. (호스트가 같은 타입 등록 시 오버라이드)
const REGISTRY = { ...BUILTIN };

/** 호스트가 게임-특정 노드 렌더러를 등록(또는 제네릭 오버라이드). */
export function registerNodeRenderer(type, fn) { if (type && typeof fn === 'function') REGISTRY[type] = fn; }
export function registerNodeRenderers(map) { for (const k in (map || {})) registerNodeRenderer(k, map[k]); }
export function getNodeRendererTypes() { return Object.keys(REGISTRY); }

/**
 * 레이아웃 노드들을 컨테이너에 렌더.
 * @returns {{ nodeMap: Map, tintTargets: GameObject[], alphaTargets: GameObject[] }}
 */
export function renderLayoutInto(scene, container, layout, data, opts = {}) {
  const safe = loadLayoutSafe(layout, 'render');
  if (!safe) return { nodeMap: new Map(), tintTargets: [], alphaTargets: [] };
  layout = safe;
  const W = layout.frame.designW, H = layout.frame.designH;
  const ox = W / 2, oy = H / 2;
  const lx = (x) => x - ox, ly = (y) => y - oy;
  const tintTargets = [];
  const alphaTargets = [];
  const nodeMap = new Map();
  const registry = opts.nodeRenderers ? { ...REGISTRY, ...opts.nodeRenderers } : REGISTRY;

  const ctx = {
    scene, container, data, lx, ly, tintTargets, alphaTargets,
    textBuilder: opts.textBuilder || null,
    editor: !!opts.editor,
    spriteDocs: opts.spriteDocs || null,   // 저작 스프라이트 매니페스트(id→file 해석) — spriteDocClip 렌더러용
    spriteDocUrl: opts.spriteDocUrl || null, // (file)→url 빌더(에디터: 스테이징 /__ui_sprite). 없으면 정적 적용본.
    maskResyncs: Array.isArray(opts.maskResyncs) ? opts.maskResyncs : null,   // 도형 마스크 변환 재동기(에디터 줌/팬 시)
    pauseClips: !!opts.pauseClips,         // true 면 spriteDocClip 정지(정적 프레임) — 에디터 크기 조절 중

    add: (o) => { container.add(o); return o; },
    renderChild: (node) => {
      const fn = registry[node.type];
      return fn ? (fn(ctx, node) || []) : [];
    },
  };

  const sorted = [...layout.nodes].sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));
  for (const node of sorted) {
    if (node.visible === false && !opts.showHidden) continue;
    // 노드 단위 격리 — 한 노드 렌더가 던져도 나머지 레이아웃은 진행하고, 그 오류를 저작툴로 보고.
    let objects;
    try {
      objects = ctx.renderChild(node);
    } catch (e) {
      objects = [];
      reportToolError('render', e, { source: opts.source || 'render', nodeId: node && node.id, type: node && node.type });
      try { if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) console.warn('[renderLayoutInto] 노드 렌더 실패:', node && node.id, (e && e.message) || e); } catch { /* */ }
    }
    // 텍스트 표시범위(자동 줄바꿈/고정 박스) — 렌더러 무관(빌트인·게임 커스텀 모두)하게 사후 적용.
    //   node.wrapW>0 → 그 너비에서 줄바꿈 + 정렬 기준 박스. node.wrapH>0 → 고정 높이 박스.
    if (node.type === 'text' && node.wrapW > 0 && objects[0] && typeof objects[0].setWordWrapWidth === 'function') {
      const t = objects[0];
      t.setWordWrapWidth(Math.round(node.wrapW), true);
      if (typeof t.setAlign === 'function') t.setAlign(node.align || 'center');
      if (typeof t.setFixedSize === 'function') t.setFixedSize(Math.round(node.wrapW), Math.max(0, Math.round(node.wrapH || 0)));
      // 원점: 가로는 setAlign 이 박스 내부 정렬을 맡으므로 0.5 고정. 세로는 node.valign 존중(top/bottom).
      //   ⚠ 에디터는 리사이즈/선택박스 기하가 (x,y)=박스중심을 전제 → opts.editor 일 때만 세로도 0.5 강제.
      if (typeof t.setOrigin === 'function') {
        const oy = node.valign === 'top' ? 0 : node.valign === 'bottom' ? 1 : 0.5;
        t.setOrigin(0.5, opts.editor ? 0.5 : oy);
      }
    }
    // 투명도(불투명도) — 본체(primary)에 적용. 이미지·텍스트·도형 공통. 데코 복제는 자체 알파 유지.
    if (node.alpha != null && objects[0] && typeof objects[0].setAlpha === 'function') {
      objects[0].setAlpha(_clamp(node.alpha, 0, 1));
    }
    if (objects.length) nodeMap.set(node.id, { node, objects, primary: objects[0] });
  }
  return { nodeMap, tintTargets, alphaTargets };
}
