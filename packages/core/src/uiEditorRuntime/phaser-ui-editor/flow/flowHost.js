/**
 * flowHost — 게임 런타임용 레퍼런스 호스트 어댑터.
 *
 *   `createFlowRuntime` 의 호스트 콜백(navigate/anim/sound/popup/reward/callFn/delay)을
 *   실제 Phaser 씬 동작에 연결한다. 화면 전환 = 레이아웃 렌더, 버튼 탭 = 렌더된 노드 인터랙션,
 *   애니 = 스프라이트 클립/Phaser 애니, 소리 = scene.sound.
 *
 *   게임이 직접 createFlowRuntime + 호스트를 손수 배선해도 되지만, 흔한 경로를 한 번에 묶은
 *   `mountFlow(scene, flowJson, opts)` 를 제공한다. 모든 동작은 opts 콜백으로 override 가능.
 *
 *   ⚠ 호스트 독립 원칙 유지: renderLayoutInto/loadSpriteClip 은 같은 패키지지만 opts 로 주입
 *      가능(테스트·커스텀 렌더러). 미주입 시 패키지 기본 구현 사용.
 */
import { createFlowRuntime } from './flowRuntime.js';
import { renderLayoutInto as _renderLayoutInto } from '../render/renderLayoutInto.js';
import { loadSpriteClip as _loadSpriteClip } from '../anim/clip/spriteClipRuntime.js';

/**
 * 플로우를 씬에 장착 — 런타임 + 호스트 배선 후 (옵션) 시작.
 * @param {Phaser.Scene} scene
 * @param {object} flowJson - 저작된 플로우(ui/flows/*.json 내용).
 * @param {object} [opts]
 *   resolveLayout(screenDocId) => layout JSON   화면 노드 렌더용(없으면 화면 전환은 콜백만).
 *   sampleData                 renderLayoutInto 에 넘길 데이터(기본 {}).
 *   renderOpts                 renderLayoutInto 추가 opts(textBuilder/nodeRenderers/spriteDocs…).
 *   functions                  { 함수명: (args, ctx) => any }  — custom 동작.
 *   onNavigate/onAnim/onSound/onPopup/onReward/onEnterNode   각 동작 override.
 *   interactive (기본 true)     렌더된 노드를 탭 가능하게 → runtime.tapButton(노드id, 화면).
 *   autoStart (기본 true)       즉시 start().
 *   rootContainer              재사용할 컨테이너(없으면 화면마다 중앙에 새로 생성/파괴).
 *   runtime                    createFlowRuntime opts(vars/maxSteps/autoScreenEnter…).
 *   renderLayout/loadClip      주입(테스트/커스텀). 기본=패키지 구현.
 * @returns {{ runtime, host, getContainer, getNodeMap, destroy }}
 */
export function mountFlow(scene, flowJson, opts = {}) {
  const {
    resolveLayout = null,
    sampleData = {},
    renderOpts = {},
    functions = {},
    onNavigate, onAnim, onSound, onPopup, onReward, onEnterNode,
    interactive = true,
    autoStart = true,
    rootContainer = null,
    runtime: runtimeOpts = {},
    renderLayout = _renderLayoutInto,
    loadClip = _loadSpriteClip,
  } = opts;

  let runtime = null;
  let curContainer = null;
  let curNodeMap = null;

  const centerX = () => (scene.scale ? scene.scale.width : 0) / 2;
  const centerY = () => (scene.scale ? scene.scale.height : 0) / 2;

  function clearScreen() {
    while (popupStack.length) { const p = popupStack.pop(); try { p.destroy(true); } catch { /* */ } }   // 전체화면 전환 시 팝업 닫기
    if (curContainer && curContainer !== rootContainer && typeof curContainer.destroy === 'function') curContainer.destroy(true);
    else if (curContainer && typeof curContainer.removeAll === 'function') curContainer.removeAll(true);
    curContainer = null; curNodeMap = null;
  }

  function renderScreen(screenDocId, node) {
    if (onNavigate) onNavigate(screenDocId, node, { renderScreen });
    if (!resolveLayout) return;
    const layout = resolveLayout(screenDocId);
    if (!layout) return;
    clearScreen();
    const container = rootContainer || scene.add.container(centerX(), centerY());
    const res = renderLayout(scene, container, layout, sampleData, renderOpts) || {};
    curContainer = container;
    curNodeMap = res.nodeMap || new Map();
    if (interactive) wireTaps(screenDocId, curNodeMap);
  }

  // 렌더된 각 노드의 주 게임오브젝트를 탭 가능하게 → 노드 id 를 role 로 runtime.tapButton.
  //   폴더(그룹) 소속 노드는 폴더 포트(role='grp:<groupId>')도 함께 발동 → 화면 노드의 폴더 출력으로 라우팅.
  function wireTaps(screenDocId, nodeMap) {
    for (const [nodeId, entry] of nodeMap) {
      const obj = entry && entry.primary;
      if (!obj || typeof obj.setInteractive !== 'function') continue;
      obj.setInteractive({ useHandCursor: true });
      const grp = entry.node && entry.node.group;
      if (typeof obj.on === 'function') obj.on('pointerup', () => {
        if (!runtime) return;
        runtime.tapButton(nodeId, screenDocId);
        if (grp) runtime.tapButton(`grp:${grp}`, screenDocId);
      });
    }
  }

  // ref 가 .json(스프라이트 클립) 이면 클립 로드, 아니면 Phaser 애니 키로 시도. 게임은 onAnim 으로 override.
  function defaultAnim(ref, node, provider) {
    if (!ref) return;
    if (/\.json($|\?)/.test(ref)) {
      try { loadClip(scene, ref, { container: curContainer || undefined }); } catch { /* */ }
      return;
    }
    // Phaser 애니 키 — 현재 화면 노드의 주 오브젝트(있으면)에 재생 시도.
    const tgt = node && curNodeMap && curNodeMap.get(node.id);
    const obj = tgt && tgt.primary;
    if (obj && typeof obj.play === 'function' && scene.anims && scene.anims.exists && scene.anims.exists(ref)) obj.play(ref);
  }

  // ── 팝업/오버레이 레이어 — 메인 화면 위에 겹쳐 렌더(메인은 유지). rootContainer 변환(위치·스케일·마스크) 재사용. ──
  const popupStack = [];
  function overlayRender(screenDocId, node, dim) {
    const layout = resolveLayout && resolveLayout(screenDocId);
    if (!layout) return null;
    const base = curContainer || rootContainer;
    const c = scene.add.container(base ? base.x : centerX(), base ? base.y : centerY());
    if (base) { c.setScale(base.scaleX, base.scaleY); if (base.mask) c.setMask(base.mask); }
    c.setDepth(((base && base.depth) || 0) + 1 + popupStack.length);
    if (dim && scene.add.rectangle) {
      const d = scene.add.rectangle(0, 0, 2200, 2600, 0x000000, 0.55);
      if (typeof d.setInteractive === 'function') { d.setInteractive(); if (d.on) d.on('pointerup', () => closeTop()); }
      c.add(d);
    }
    const res = renderLayout(scene, c, layout, sampleData, renderOpts) || {};
    if (interactive) wireTaps(screenDocId, res.nodeMap || new Map());
    popupStack.push(c);
    return c;
  }
  function closeTop() { const c = popupStack.pop(); if (c) { try { c.destroy(true); } catch { /* */ } } }

  const host = {
    navigate: (screenDocId, node) => renderScreen(screenDocId, node),
    popupScreen: (screenDocId, node) => overlayRender(screenDocId, node, true),
    overlayScreen: (screenDocId, node) => overlayRender(screenDocId, node, false),
    anim: (ref, node, provider) => (onAnim ? onAnim(ref, node, provider) : defaultAnim(ref, node, provider)),
    sound: (ref, node, provider) => {
      if (onSound) return onSound(ref, node, provider);
      if (ref && scene.sound && scene.cache && scene.cache.audio && scene.cache.audio.exists(ref)) scene.sound.play(ref);
    },
    popup: (open, ref, node) => { if (!open) closeTop(); if (onPopup) onPopup(open, ref, node); },
    reward: (kind, amount, node) => { if (onReward) onReward(kind, amount, node); },
    callFn: (name, args, ctx) => { const fn = functions[name]; return fn ? fn(args, ctx) : undefined; },
    onEnterNode: (node) => { if (onEnterNode) onEnterNode(node); },
    delay: (ms) => new Promise((res) => {
      if (scene.time && typeof scene.time.delayedCall === 'function') scene.time.delayedCall(Math.max(0, ms | 0), res);
      else setTimeout(res, Math.max(0, ms | 0));
    }),
    log: () => {},
  };

  runtime = createFlowRuntime(flowJson, host, runtimeOpts);
  if (autoStart) runtime.start();

  return {
    runtime,
    host,
    getContainer: () => curContainer,
    getNodeMap: () => curNodeMap,
    destroy: () => { runtime.stop(); clearScreen(); },
  };
}
