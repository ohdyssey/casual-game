/**
 * sceneChrome.js — 게임 씬을 #uieditor 레이아웃(public/ui/layouts/*.json)으로 구동하는 공용 배선.
 *
 * 홈 상단 HUD·낚시 HUD·하단 탭바 등에서 반복되던 "레이아웃 렌더 + 앵커 + 폴백 + role/binding 와이어"를
 *   한 함수(buildChromeFromLayout)로 정규화한다. 새 화면 연결 시 이 헬퍼를 호출만 하면 됨.
 *
 * 앵커 모드(앵커=레이아웃 디자인프레임을 화면 어디에 고정하는지):
 *   - 'top'    : 컨테이너 (designW/2, designH/2). 디자인좌표=월드좌표(상단고정). HUD 처럼 화면 상단 붙는 UI.
 *                ⚠ 팝업식 (W/2, H/2) 와 달리 designH/2 고정이라 톨폰(scale.height>designH)에서 안 밀림.
 *   - 'bottom' : 컨테이너 (designW/2, scale.height - anchorOffset). 프레임 중심이 화면 하단에 붙음(탭바).
 *   - 'center' : 컨테이너 (scale.width/2, scale.height/2). 실제 화면 중앙(전체화면 팝업).
 *
 * @see docs/UI_EDITOR_INTEGRATION.md  연결 절차/명령 규약
 * @see src/config/ui-screens.js       화면별 연결 매니페스트(캡처/문서)
 */
import { renderLayoutInto } from './LocationCard.js';
import { byRole, resolveBind } from '@ohdyssey/phaser-ui-editor';

export { byRole, resolveBind };

/**
 * 화면 세이프인셋(CSS px, window.__safeArea) → 게임좌표 단위.
 *   풀블리드 캔버스(index.html 패딩 제거)라 HUD/탭이 노치·홈바에 가리지 않도록 앵커를 이만큼 보정.
 *   변환: 게임px = CSSpx × displayScale(=게임크기/캔버스표시크기, FIT 이라 x·y 균일).
 */
function safeInsetsGameUnits(scene) {
  const sa = (typeof window !== 'undefined' && window.__safeArea) || null;
  if (!sa) return { top: 0, bottom: 0, left: 0, right: 0 };
  const ds = scene.scale.displayScale;
  const k = (ds && ds.y) ? ds.y : 1;
  return { top: (sa.top || 0) * k, bottom: (sa.bottom || 0) * k, left: (sa.left || 0) * k, right: (sa.right || 0) * k };
}

/** 레이아웃 디자인프레임 중심을 화면 어디에 둘지 → 컨테이너 (x,y). 세이프영역 보정 포함. */
function anchorPos(scene, frame, anchor, anchorOffset) {
  const fw = frame.designW, fh = frame.designH;
  const safe = safeInsetsGameUnits(scene);
  if (anchor === 'bottom') return { x: fw / 2, y: scene.scale.height - (anchorOffset ?? 95) - safe.bottom };
  // 'center'(전체화면 팝업): 세이프오프셋 없음 — 화면 중앙 고정. 상호작용 요소는 패널 안쪽(화면 끝과 무관)이라
  //   노치 영향 없음. 향후 상단 끝에 탭 요소를 둔 center 팝업이 생기면 여기에 safe.top 보정 추가.
  if (anchor === 'center') return { x: scene.scale.width / 2, y: scene.scale.height / 2 };
  return { x: fw / 2, y: fh / 2 + safe.top };   // 'top'(기본) — 디자인좌표=월드좌표, 노치 아래로 HUD 내림
}

/** 레이아웃 노드(로컬좌표)에 투명 히트영역 + 누름 yoyo 피드백 부착. */
function wireHit(scene, container, frame, entry, handler) {
  const node = entry.node;
  const lx = node.x - frame.designW / 2, ly = node.y - frame.designH / 2;
  const w = node.w || 60, h = node.h || 60;
  const hit = scene.add.rectangle(lx, ly, w, h, 0x000000, 0.001).setInteractive({ useHandCursor: true });
  container.add(hit);
  hit.on('pointerdown', () => {
    const tgt = entry.primary;
    if (tgt && tgt.setScale) scene.tweens.add({ targets: tgt, scaleX: tgt.scaleX * 0.94, scaleY: tgt.scaleY * 0.94, yoyo: true, duration: 90 });
    handler();
  });
  return hit;
}

/**
 * 캐시된 레이아웃을 씬에 렌더 + 와이어. 레이아웃 없거나 렌더 실패 시 fallback() 호출 후 null 반환.
 *
 * @param {Phaser.Scene} scene
 * @param {object} opts
 *   @param {string}   opts.cacheKey      this.load.json 키 (예 'layout_home')
 *   @param {'top'|'bottom'|'center'} [opts.anchor='top']
 *   @param {number}   [opts.anchorOffset] bottom 앵커: 화면 하단~프레임중심 거리(없으면 layout._anchorOffset ?? 95)
 *   @param {number}   [opts.depth]        컨테이너 depth
 *   @param {object}   [opts.data]         text 노드 binding 데이터
 *   @param {Object<string,Function>} [opts.roleHandlers]  role → 클릭 핸들러 (예 {'action:menu': fn})
 *   @param {(entries:Array, ctx:object)=>void} [opts.onEntries] 추가 와이어(하트/라이브참조 등). ctx={container,nodeMap,entries,frame}
 *   @param {Function} [opts.fallback]     레이아웃 없을 때 기존 절차적 빌드
 * @returns {{container, nodeMap, entries, frame}|null}
 */
export function buildChromeFromLayout(scene, opts) {
  const layout = scene.cache.json.get(opts.cacheKey);
  if (!layout || !Array.isArray(layout.nodes) || !layout.nodes.length) {
    opts.fallback?.();
    return null;
  }
  let ctx;
  try {
    const frame = layout.frame;
    const off = opts.anchorOffset ?? layout._anchorOffset;
    const pos = anchorPos(scene, frame, opts.anchor || 'top', off);
    const container = scene.add.container(pos.x, pos.y);
    if (opts.depth != null) container.setDepth(opts.depth);
    const { nodeMap } = renderLayoutInto(scene, container, layout, opts.data || {});
    ctx = { container, nodeMap, entries: [...nodeMap.values()], frame };
    // onEntries 에서 헬퍼와 동일한 히트배선(누름 yoyo 포함)을 쓰도록 노출 — role 외 key 폴백 탐색에 사용.
    ctx.wire = (entry, handler) => wireHit(scene, container, frame, entry, handler);
  } catch (e) {
    opts.fallback?.();
    return null;
  }
  // 와이어링(베스트에포트 — 실패해도 외형은 유지).
  try {
    if (opts.roleHandlers) {
      for (const role in opts.roleHandlers) {
        const e = byRole(ctx.entries, role);
        if (e) wireHit(scene, ctx.container, ctx.frame, e, opts.roleHandlers[role]);
      }
    }
    opts.onEntries?.(ctx.entries, ctx);
  } catch (e) { /* 외형은 렌더됨 — 추가 와이어만 생략 */ }
  return ctx;
}

/**
 * lives 막대(role:'lives' 또는 hud_lives_bar) 위에 하트 N개 채움 — 컨테이너 자식(에디터 이동 시 따라감).
 *   막대 월드바운드(getBounds) 기준 → 월드→로컬 변환. 기존 _fillHearts 와 동일 슬롯비율.
 */
export function fillHeartsInto(scene, container, barPrimary, filled, heartKey = 'hud_heart') {
  if (!barPrimary?.getBounds || !container) return;
  const b = barPrimary.getBounds();
  const cx = container.x, cy = container.y;
  const slots = 5;
  const innerLeft  = b.x + b.width * 0.0575;
  const innerRight = b.x + b.width * 0.7825;
  const slotW = (innerRight - innerLeft) / slots;
  const worldCy = b.y + b.height / 2;
  for (let i = 0; i < filled; i++) {
    const hx = innerLeft + slotW * (i + 0.5);
    const heart = scene.add.image(hx - cx, worldCy - cy, heartKey).setOrigin(0.5);
    const src = heart.texture.getSourceImage();
    heart.setScale(Math.min((slotW * 0.80) / (src.width || 1), (b.height * 0.78) / (src.height || 1)));
    heart.setDepth(2);
    container.add(heart);
  }
}
