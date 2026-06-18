/**
 * card-layout.js — 낚시터 카드 레이아웃 데이터 모델 (UI 저작도구의 단일 진실원천).
 *
 * 편집기(UiEditorScene)가 읽고/쓰고, 게임(LocationCard)이 읽어 렌더한다.
 *   - 모든 노드는 디자인 좌표계(프레임 408×645) 기준 "절대 좌표(center origin)".
 *     → 편집기에서 드래그 = x,y 직접 설정 (부모 변환 계산 없음 → 단순·정밀).
 *   - 콘텐츠 노드(text/iconRow/starRow/coin)는 data 바인딩 키를 갖고 위치만 레이아웃이 정함.
 *
 * 노드 공통: { id, type, name, x, y, depth, visible }
 *   type 별 추가 필드:
 *     image   : key, w, h, tintable
 *     art     : key(또는 binding:'artKey'), w, h, topRadius, botRadius, borderColor, borderWidth
 *     text    : text | binding('title'|'reward'), fontSize, color, stroke, strokeW, align
 *     iconRow : binding('fishIcons'), iconH, gap, max
 *     starRow : binding('difficulty'), starH, gap, count, onKey, offKey
 *     slotRow : key, slotH, gap, count
 *     coin    : r
 *
 * 저장 파일: public/card.layout.json (Vite 플러그인이 기록). 없으면 DEFAULT_LAYOUT 사용.
 */

import { LOCATION_CARD_SPEC as S } from './card.spec.js';

/** 조각 네이티브 픽셀 (ui-introspect 실측). aspect 계산용. */
export const PIECE_NATIVE = {
  card_frame:   { w: 408, h: 645 },
  card_header:  { w: 414, h: 131 },
  card_panel_a: { w: 224, h: 92 },
  card_panel_b: { w: 139, h: 92 },
  card_panel_c: { w: 365, h: 125 },
  card_bar:     { w: 364, h: 50 },
  card_btn:     { w: 148, h: 48 },
  card_slot:    { w: 65, h: 64 },
  card_star_on: { w: 21, h: 22 },
  card_star_off:{ w: 21, h: 21 },
};

/** 현재 분수 spec → 절대좌표 레이아웃 노드 배열로 변환 (시드/기본값 생성). */
export function specToLayout(spec = S) {
  const W = spec.frame.designW, H = spec.frame.designH;
  const nodes = [];

  // 프레임 폭 fraction → 절대 (이미지 폭 기준, 높이는 네이티브 비율).
  const imgByWidth = (key, cxF, cyF, wF) => {
    const nat = PIECE_NATIVE[key];
    const w = wF * W;
    const h = w * (nat.h / nat.w);
    return { key, x: cxF * W, y: cyF * H, w, h };
  };

  // ── frame ──
  nodes.push({ id: 'frame', type: 'image', name: '프레임', key: 'card_frame',
    x: W / 2, y: H / 2, w: W, h: H, depth: 0, visible: true, tintable: true });

  // ── art ──
  const a = spec.art;
  const aw = a.box.w * W, ah = a.box.h * H;
  const ax = (a.box.l + a.box.w / 2) * W, ay = (a.box.t + a.box.h / 2) * H;
  nodes.push({ id: 'art', type: 'art', name: '아트창', binding: 'artKey', key: 'card_art_01',
    x: ax, y: ay, w: aw, h: ah, depth: 1, visible: true,
    topRadius: Math.round(a.topRadiusFrac * W), botRadius: Math.round(a.bottomRadiusFrac * W),
    borderColor: a.border.color, borderWidth: a.border.width });

  // ── header + title ──
  const h = spec.header;
  const hi = imgByWidth(h.key, h.cx, h.cy, h.wFrac);
  nodes.push({ id: 'header', type: 'image', name: '헤더 배너', ...hi, depth: 5, visible: true, tintable: true });
  nodes.push({ id: 'header.title', type: 'text', name: '낚시터명', binding: 'title',
    x: hi.x, y: hi.y - hi.h / 2 + h.title.fy * hi.h, fontSize: h.title.size,
    color: h.title.color, stroke: h.title.stroke, strokeW: h.title.strokeW, align: 'center',
    depth: 6, visible: true });

  // ── rowLeft (추천 어종) ──
  const pL = spec.rowLeft;
  const pLi = imgByWidth(pL.key, pL.cx, pL.cy, pL.wFrac);
  nodes.push({ id: 'panel_a', type: 'image', name: '추천어종 패널', ...pLi, depth: 4, visible: true, tintable: true });
  nodes.push({ id: 'panel_a.label', type: 'text', name: '추천어종 라벨', text: pL.label.text,
    x: pLi.x, y: pLi.y - pLi.h / 2 + pL.label.fy * pLi.h, fontSize: pL.label.size,
    color: pL.label.color, stroke: pL.label.stroke, strokeW: pL.label.strokeW, align: 'center',
    depth: 6, visible: true });
  nodes.push({ id: 'panel_a.icons', type: 'iconRow', name: '추천어종 아이콘', binding: 'fishIcons',
    x: pLi.x, y: pLi.y - pLi.h / 2 + pL.icons.fy * pLi.h,
    iconH: pL.icons.sizeFh * pLi.h, gap: pL.icons.gapFw * pLi.w, max: pL.icons.max,
    depth: 6, visible: true });

  // ── rowRight (난이도) ──
  const pR = spec.rowRight;
  const pRi = imgByWidth(pR.key, pR.cx, pR.cy, pR.wFrac);
  nodes.push({ id: 'panel_b', type: 'image', name: '난이도 패널', ...pRi, depth: 4, visible: true, tintable: true });
  nodes.push({ id: 'panel_b.label', type: 'text', name: '난이도 라벨', text: pR.label.text,
    x: pRi.x, y: pRi.y - pRi.h / 2 + pR.label.fy * pRi.h, fontSize: pR.label.size,
    color: pR.label.color, stroke: pR.label.stroke, strokeW: pR.label.strokeW, align: 'center',
    depth: 6, visible: true });
  nodes.push({ id: 'panel_b.stars', type: 'starRow', name: '난이도 별', binding: 'difficulty',
    x: pRi.x, y: pRi.y - pRi.h / 2 + pR.stars.fy * pRi.h,
    starH: pR.stars.sizeFh * pRi.h, gap: pR.stars.gapFw * pRi.w, count: pR.stars.count,
    onKey: pR.stars.onKey, offKey: pR.stars.offKey, depth: 6, visible: true });

  // ── slotPanel (4슬롯) ──
  const sp = spec.slotPanel;
  const spi = imgByWidth(sp.key, sp.cx, sp.cy, sp.wFrac);
  nodes.push({ id: 'panel_c', type: 'image', name: '4슬롯 패널', ...spi, depth: 4, visible: true, tintable: true });
  nodes.push({ id: 'panel_c.slots', type: 'slotRow', name: '아이템 슬롯', key: sp.slots.key,
    x: spi.x, y: spi.y - spi.h / 2 + sp.slots.fy * spi.h,
    slotH: sp.slots.sizeFh * spi.h, gap: sp.slots.gapFw * spi.w, count: sp.slots.count,
    depth: 6, visible: true });

  // ── reward bar ──
  const r = spec.reward;
  const ri = imgByWidth(r.key, r.cx, r.cy, r.wFrac);
  nodes.push({ id: 'bar', type: 'image', name: '보상 바', ...ri, depth: 4, visible: true, tintable: true });
  nodes.push({ id: 'bar.label', type: 'text', name: '보상 라벨', text: r.label.text,
    x: ri.x, y: ri.y - ri.h / 2 + r.label.fy * ri.h, fontSize: r.label.size,
    color: r.label.color, stroke: r.label.stroke, strokeW: r.label.strokeW, align: 'center',
    depth: 6, visible: true });
  nodes.push({ id: 'bar.coin', type: 'coin', name: '코인',
    x: ri.x - ri.w / 2 + r.coin.fx * ri.w, y: ri.y - ri.h / 2 + r.coin.fy * ri.h,
    r: r.coin.rFh * ri.h / 2, depth: 6, visible: true });
  nodes.push({ id: 'bar.value', type: 'text', name: '보상 값', binding: 'reward',
    x: ri.x - ri.w / 2 + r.value.fx * ri.w, y: ri.y - ri.h / 2 + r.value.fy * ri.h,
    fontSize: r.value.size, color: r.value.color, stroke: r.value.stroke, strokeW: r.value.strokeW,
    align: 'left', depth: 6, visible: true });

  // ── button ──
  const b = spec.button;
  const bi = imgByWidth(b.key, b.cx, b.cy, b.wFrac);
  nodes.push({ id: 'button', type: 'image', name: '입장 버튼', ...bi, depth: 4, visible: true, tintable: true });
  nodes.push({ id: 'button.label', type: 'text', name: '버튼 라벨', text: b.label.text,
    x: bi.x, y: bi.y, fontSize: b.label.size, color: b.label.color, stroke: b.label.stroke,
    strokeW: b.label.strokeW, align: 'center', depth: 6, visible: true });

  return { frame: { designW: W, designH: H }, nodes };
}

/** 기본 레이아웃 (저장 파일 없을 때 fallback + 편집기 Reset). */
export const DEFAULT_LAYOUT = specToLayout();
