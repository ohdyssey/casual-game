/**
 * uiCapture — dev 전용 "현재 게임 UI" 캡처 싱크.
 *
 * 목적: 강화/상점/도감 등 절차적 Graphics(ui/popup.js 빌더)로 그려지는 화면을
 *   레이아웃 노드로 그대로 떠서 UI 저작도구(#uieditor)로 불러오기 위함.
 *
 * 동작: popup.js 빌더가 도형/텍스트를 그릴 때마다 record() 를 호출한다.
 *   - 캡처 비활성(평상시 게임 플레이) → record() 는 즉시 반환 = 게임에 영향 없음.
 *   - 캡처 활성(Playwright 하니스가 beginCapture 후 씬 start) → 노드 디스크립터 수집.
 *   하니스가 endCapture() 로 디스크립터를 받아 ui/layouts/<id>.json 으로 저장.
 *
 * record 디스크립터(빌더가 화면 절대좌표=720×1280 기준, 중심좌표로 전달):
 *   { k:'rect',   x,y(중심), w,h, radius(number|{tl,tr,bl,br}), fill, stroke, strokeW, name }
 *   { k:'circle', x,y(중심), r, fill, stroke, strokeW, name }
 *   { k:'text',   x,y(앵커), text, fontSize, color, bold, fontFamily, ox,oy(origin), name }
 */

let _active = false;
let _sink = [];

/** 캡처 시작 — 싱크 비우고 활성화. */
export function beginCapture() { _active = true; _sink = []; }

/** 캡처 종료 — 수집된 디스크립터 배열 반환 후 비활성화. */
export function endCapture() { _active = false; const s = _sink; _sink = []; return s; }

/** 현재 캡처 중인지. */
export function isCapturing() { return _active; }

/** 빌더가 호출 — 캡처 활성 시에만 디스크립터 수집(아니면 no-op). */
export function record(desc) { if (_active && desc) _sink.push(desc); }

/** 색상 number(0xRRGGBB) → '#rrggbb'. 이미 문자열이면 그대로. */
export function hexColor(c) {
  if (typeof c === 'string') return c;
  if (typeof c !== 'number') return null;
  return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
}
