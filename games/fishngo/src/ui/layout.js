/**
 * layout.js — UI 정밀제작 툴킷 (분수 좌표 앵커 + 9-slice + 컨테이너 배치).
 *
 * 설계 철학 ("정밀제작 기법"의 코어):
 *   1. 절대 픽셀이 아니라 "기준 박스 안의 분수 좌표(0~1)"로 배치한다.
 *      → 카드/팝업이 어떤 스케일·해상도여도 내부 요소 비율이 보존된다.
 *      (ItemPopupScene 의 _fx/_fy + 레이아웃 const F 패턴을 일반화한 것)
 *   2. 박스는 중첩된다: 카드(frame) ⊃ 패널 ⊃ 셀. 각 단계가 AnchorBox 를 반환.
 *   3. 늘려야 하는 프레임/버튼은 9-slice 로 모서리 장식을 보존한다.
 *   4. 모든 좌표/크기는 scripts/ui-introspect.cjs 로 측정한 실측치에서 도출한다.
 *
 * AnchorBox 는 순수 좌표 계산기 — Phaser 의존성 없음(테스트 용이). Phaser 객체 생성은
 *   호출부(컴포넌트)가 scale.js / 아래 헬퍼로 수행한다.
 */

import { placeContained } from './scale.js';

/**
 * 분수 좌표 앵커 박스. 화면상의 사각 영역(left, top, w, h)을 감싸고
 *   내부를 0~1 분수로 가리킨다.
 */
export class AnchorBox {
  /**
   * @param {number} left  좌상단 x (절대 px)
   * @param {number} top   좌상단 y (절대 px)
   * @param {number} w     너비 (절대 px)
   * @param {number} h     높이 (절대 px)
   */
  constructor(left, top, w, h) {
    this.left = left; this.top = top; this.w = w; this.h = h;
  }

  /** 중심 좌표 (cx, cy) 와 크기로 생성. */
  static centered(cx, cy, w, h) {
    return new AnchorBox(cx - w / 2, cy - h / 2, w, h);
  }

  /**
   * 이미 배치된 Phaser 이미지/스프라이트의 화면상 박스로 생성.
   *   프레임 이미지를 먼저 놓고, 그 위에 내용을 분수 좌표로 얹을 때 사용.
   */
  static fromGameObject(go) {
    const w = go.displayWidth; const h = go.displayHeight;
    const ox = go.originX ?? 0.5; const oy = go.originY ?? 0.5;
    return new AnchorBox(go.x - w * ox, go.y - h * oy, w, h);
  }

  get right()  { return this.left + this.w; }
  get bottom() { return this.top + this.h; }
  get cx()     { return this.left + this.w / 2; }
  get cy()     { return this.top + this.h / 2; }

  /** 분수 fr(0~1) → 절대 x. */
  fx(fr) { return this.left + fr * this.w; }
  /** 분수 fr(0~1) → 절대 y. */
  fy(fr) { return this.top + fr * this.h; }
  /** 분수 fr → 절대 너비. */
  fw(fr) { return fr * this.w; }
  /** 분수 fr → 절대 높이. */
  fh(fr) { return fr * this.h; }
  /** 분수 좌표 → 절대 점 {x, y}. */
  point(fxr, fyr) { return { x: this.fx(fxr), y: this.fy(fyr) }; }

  /**
   * 내부 분수 영역을 새 AnchorBox 로 추출 (중첩 레이아웃).
   * @param {number} fl 좌측 시작 분수
   * @param {number} ft 상단 시작 분수
   * @param {number} fwr 너비 분수
   * @param {number} fhr 높이 분수
   */
  sub(fl, ft, fwr, fhr) {
    return new AnchorBox(this.fx(fl), this.fy(ft), this.fw(fwr), this.fh(fhr));
  }

  /**
   * 각 변을 분수만큼 안쪽으로 줄인 새 박스 (프레임 보더 안쪽 "내용 영역" 등).
   * @param {number} fl 좌 inset 분수
   * @param {number} ft 상 inset 분수
   * @param {number} [fr] 우 inset 분수 (기본 fl)
   * @param {number} [fb] 하 inset 분수 (기본 ft)
   */
  inset(fl, ft, fr = fl, fb = ft) {
    return new AnchorBox(
      this.fx(fl), this.fy(ft),
      this.w * (1 - fl - fr), this.h * (1 - ft - fb),
    );
  }

  /** 같은 중심, 균일 스케일 적용한 새 박스 (호버 확대 등). */
  scaled(s) {
    return AnchorBox.centered(this.cx, this.cy, this.w * s, this.h * s);
  }
}

/**
 * 박스의 분수 앵커 위치에, 박스 대비 분수 크기로 이미지를 contain 배치.
 *   컨테이너가 주어지면 거기에 add (좌표는 박스의 절대 좌표계 기준 — 컨테이너가
 *   (0,0)에 있다는 가정. 컴포넌트는 컨테이너를 화면 중심으로 옮긴 뒤 자식 좌표를
 *   로컬로 다룰 수 있도록 box 를 로컬 좌표로 구성해 전달하면 된다).
 *
 * @param {Phaser.Scene} scene
 * @param {AnchorBox} box
 * @param {string} key            텍스처 키
 * @param {number} fxr            앵커 x 분수
 * @param {number} fyr            앵커 y 분수
 * @param {number} fwBox          박스 너비 대비 목표 너비 분수
 * @param {number} fhBox          박스 높이 대비 목표 높이 분수
 * @param {object} [opts]         { container, tint, depth, maxScale }
 * @returns {Phaser.GameObjects.Image|null}
 */
export function placeFrac(scene, box, key, fxr, fyr, fwBox, fhBox, opts = {}) {
  if (!scene.textures.exists(key)) return null;
  const { x, y } = box.point(fxr, fyr);
  const img = placeContained(scene, key, x, y, box.fw(fwBox), box.fh(fhBox), {
    maxScale: opts.maxScale ?? 1,
  });
  if (opts.tint != null) img.setTint(opts.tint);
  if (opts.depth != null) img.setDepth(opts.depth);
  if (opts.container) opts.container.add(img);
  return img;
}

/**
 * 9-slice 프레임 — 모서리를 고정한 채 변/중앙만 늘려 임의 크기로 렌더.
 *   버튼/패널/프레임을 비율 왜곡 없이 리사이즈할 때. (Phaser 3.60+ NineSlice)
 *
 * @param {Phaser.Scene} scene
 * @param {string} key
 * @param {number} cx 중심 x
 * @param {number} cy 중심 y
 * @param {number} w  목표 너비
 * @param {number} h  목표 높이
 * @param {number|{left:number,right:number,top:number,bottom:number}} insets
 *        보더 inset (px). 숫자면 4변 동일. ui-introspect 의 9slice 값을 권장.
 * @param {object} [opts] { container, tint }
 * @returns {Phaser.GameObjects.NineSlice|Phaser.GameObjects.Image}
 */
export function nineSlice(scene, key, cx, cy, w, h, insets, opts = {}) {
  const i = typeof insets === 'number'
    ? { left: insets, right: insets, top: insets, bottom: insets }
    : insets;
  let go;
  if (typeof scene.add.nineslice === 'function') {
    go = scene.add.nineslice(cx, cy, key, undefined, w, h, i.left, i.right, i.top, i.bottom);
  } else {
    // 폴백 — NineSlice 미지원 시 단순 contain (모서리 왜곡 감수).
    go = placeContained(scene, key, cx, cy, w, h, { maxScale: 999 });
  }
  if (opts.tint != null) go.setTint(opts.tint);
  if (opts.container) opts.container.add(go);
  return go;
}

/**
 * 가로로 늘어나는 캡슐 바/버튼을 9-slice 로 목표 너비에 맞춤 (높이는 원본 비율 유지 후 스케일).
 *   예: 오렌지 버튼(popup_09)을 카드 폭에 맞게 늘리되 둥근 양 끝 보존.
 */
export function stretchBarTo(scene, key, cx, cy, targetW, targetH, sideInset, opts = {}) {
  return nineSlice(scene, key, cx, cy, targetW, targetH,
    { left: sideInset, right: sideInset, top: 1, bottom: 1 }, opts);
}
