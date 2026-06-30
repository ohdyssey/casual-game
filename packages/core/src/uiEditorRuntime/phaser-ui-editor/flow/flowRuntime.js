/**
 * flowRuntime — 게임 로직 플로우 실행 엔진. (호스트 독립 — Phaser/DOM 직접 의존 없음)
 *
 *   에디터(FlowEditorScene)가 저작한 플로우 JSON 을 게임에서 실행한다.
 *   트리거(시작/화면진입/버튼탭/타이머/변수조건)에서 출발해 flow 엣지를 따라
 *   동작(navigate/popup/sound/anim/setVar/addVar/reward/delay/custom)·갈림길(condition)을 처리.
 *   부속(provider) 블록은 attach 엣지로 화면/동작 노드의 하단 포트(anim/sound)에 붙어,
 *   그 노드 진입 시 함께 발동한다.
 *
 *   부수효과(화면 전환·소리·애니·게임 함수 호출)는 전부 `host` 콜백으로 위임 → 순수 그래프 워킹만 담당.
 *   모든 host 콜백은 선택(없으면 no-op) → 부분 호스트로도 안전 동작 + 단위 테스트 용이.
 *
 *   입력 flow 는 변형하지 않는다(비파괴). vars 는 런타임 상태로 엔진 내부에서 갱신.
 */
import { coerceFlow } from './flowSchema.js';

const DEFAULT_MAX_STEPS = 1000;   // 한 번의 실행에서 거칠 수 있는 최대 노드 수(무한 루프 가드)

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const noop = () => {};

/** 문자열/숫자 값을 적절한 런타임 값으로 — 숫자처럼 보이면 숫자, 아니면 원본 문자열. */
export function parseVal(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (t === '') return '';
  if (t === 'true') return true;
  if (t === 'false') return false;
  const n = Number(t);
  return Number.isFinite(n) && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(t) ? n : v;
}

/** 두 값 비교 — 양쪽이 숫자면 숫자 비교, 아니면 문자열 비교. op 미지원 시 false. */
export function compareVals(a, op, b) {
  const na = Number(a), nb = Number(b);
  const bothNum = Number.isFinite(na) && Number.isFinite(nb)
    && a !== '' && a != null && b !== '' && b != null;
  const x = bothNum ? na : (a == null ? '' : String(a));
  const y = bothNum ? nb : (b == null ? '' : String(b));
  switch (op) {
    case '>=': return x >= y;
    case '>': return x > y;
    case '<=': return x <= y;
    case '<': return x < y;
    case '==': return x === y;
    case '!=': return x !== y;
    default: return false;
  }
}

/** 플로우의 노드/엣지를 빠른 조회 구조로 인덱싱. */
function indexFlow(flow) {
  const nodes = new Map();
  for (const n of flow.nodes) nodes.set(n.id, n);

  const flowOut = new Map();   // 'nodeId|port' → [toNodeId, …]  (메인 흐름)
  const attachTo = new Map();  // toNodeId → [{ port, providerId }, …]  (부속 부착)
  for (const e of flow.edges) {
    if (e.kind === 'attach') {
      if (!attachTo.has(e.to.node)) attachTo.set(e.to.node, []);
      attachTo.get(e.to.node).push({ port: e.to.port, providerId: e.from.node });
    } else {
      const k = `${e.from.node}|${e.from.port}`;
      if (!flowOut.has(k)) flowOut.set(k, []);
      flowOut.get(k).push(e.to.node);
    }
  }
  return { nodes, flowOut, attachTo };
}

/**
 * 플로우 런타임 생성.
 * @param {object} rawFlow  - coerceFlow 통과 전/후 모두 허용(내부에서 coerce).
 * @param {object} [host]   - 부수효과 콜백(전부 선택):
 *   navigate(screenDocId, node), popup(open, ref, node), sound(ref, node, provider),
 *   anim(ref, node, provider), reward(kind, amount, node), callFn(name, args, ctx)→any,
 *   delay(ms)→Promise, onVarChange(name, value, vars), onEnterNode(node), log(...args)
 * @param {object} [opts] - { vars?:object, maxSteps?:number, autoScreenEnter?:boolean }
 */
export function createFlowRuntime(rawFlow, host = {}, opts = {}) {
  const { flow, ok } = coerceFlow(rawFlow, { source: 'flowRuntime' });
  if (!ok || !flow) throw new Error('createFlowRuntime: 유효하지 않은 플로우');

  const { nodes, flowOut, attachTo } = indexFlow(flow);
  const maxSteps = Number.isFinite(opts.maxSteps) ? opts.maxSteps : DEFAULT_MAX_STEPS;
  const autoScreenEnter = opts.autoScreenEnter !== false;   // 기본 true: 화면 전환 시 screenEnter 트리거 자동 발동

  // 런타임 상태
  const vars = { ...(flow.vars || {}), ...(isObj(opts.vars) ? opts.vars : {}) };
  const timers = new Set();       // 활성 타이머 핸들(stop 시 정리)
  const condState = new Map();    // varCondition 트리거 id → 직전 평가값(엣지 트리거용)
  let stopped = false;
  let currentScreen = null;       // 마지막으로 전환한 화면(screenDocId) — 버튼 포트 라우팅 기준

  const h = {
    navigate: host.navigate || noop,
    popupScreen: host.popupScreen || host.navigate || noop,   // 팝업 kind — 미구현 호스트는 navigate 폴백
    overlayScreen: host.overlayScreen || host.navigate || noop,
    popup: host.popup || noop,
    sound: host.sound || noop,
    anim: host.anim || noop,
    reward: host.reward || noop,
    callFn: host.callFn || noop,
    onVarChange: host.onVarChange || noop,
    onEnterNode: host.onEnterNode || noop,
    log: host.log || noop,
    delay: typeof host.delay === 'function'
      ? host.delay
      : (ms) => new Promise((res) => {
          const id = setTimeout(() => { timers.delete(id); res(); }, Math.max(0, ms | 0));
          timers.add(id);
        }),
  };

  function setVar(name, value) {
    if (!name) return;
    vars[name] = value;
    h.onVarChange(name, value, vars);
    evalVarTriggers();   // 변수 변화 → 변수조건 트리거 재평가
  }

  /** 노드에 부착된 provider(anim/sound)들을 발동. */
  function fireAttachments(node, ctx) {
    const atts = attachTo.get(node.id);
    if (!atts) return;
    for (const a of atts) {
      const prov = nodes.get(a.providerId);
      if (!prov) continue;
      const ref = (prov.config && prov.config.ref) || '';
      if (a.port === 'anim') h.anim(ref, node, prov);
      else if (a.port === 'sound') h.sound(ref, node, prov);
    }
  }

  /** 화면 전환 — currentScreen 갱신 + host.navigate. */
  function doNavigate(screenDocId, node) {
    if (screenDocId) currentScreen = screenDocId;
    h.navigate(screenDocId || '', node);
  }

  /** custom 동작 인자(JSON 문자열) 파싱 — 실패 시 빈 객체. */
  function parseArgs(argsJson) {
    if (!argsJson || typeof argsJson !== 'string' || !argsJson.trim()) return {};
    try { return JSON.parse(argsJson); } catch { h.log('[flowRuntime] argsJson 파싱 실패:', argsJson); return {}; }
  }

  /** 한 노드를 처리하고 다음 노드 id(또는 null)를 반환. async(동작 delay 등). */
  async function processNode(node, ctx) {
    h.onEnterNode(node);
    const c = node.config || {};

    if (node.type === 'trigger') return firstFlow(node.id, 'out');

    if (node.type === 'screen') {
      const kind = c.kind || 'full';
      // 표현 종류별 제시: popup=위에 겹침(현재 유지) · overlay=상시겹침 · full/transition=교체.
      if (kind === 'popup') h.popupScreen(c.screenDocId || '', node);
      else if (kind === 'overlay') h.overlayScreen(c.screenDocId || '', node);
      else doNavigate(c.screenDocId || '', node);
      fireAttachments(node, ctx);
      const next = firstFlow(node.id, 'out');
      if (autoScreenEnter && c.screenDocId && kind !== 'popup' && kind !== 'overlay') scheduleScreenEnter(c.screenDocId);
      // 전환(transition): 잠시 표시 후 자동으로 다음으로 진행.
      if (kind === 'transition' && next) { await h.delay(Number(c.transitionMs) || 1200); return next; }
      return next;
    }

    if (node.type === 'condition') {
      const branch = compareVals(vars[c.var], c.op, parseVal(c.value)) ? 'true' : 'false';
      return firstFlow(node.id, branch);
    }

    if (node.type === 'provider') return null;   // 부속은 flow 워킹 대상 아님

    // action
    await runAction(node, c, ctx);
    fireAttachments(node, ctx);
    return firstFlow(node.id, 'out');
  }

  async function runAction(node, c, ctx) {
    switch (c.kind) {
      case 'navigate':
        doNavigate(c.screen || '', node);
        if (autoScreenEnter && c.screen) scheduleScreenEnter(c.screen);
        break;
      case 'popupOpen': h.popup(true, c.ref || '', node); break;
      case 'popupClose': h.popup(false, c.ref || '', node); break;
      case 'sound': h.sound(c.ref || '', node, null); break;
      case 'anim': h.anim(c.ref || '', node, null); break;
      case 'setVar': setVar(c.var, parseVal(c.value)); break;
      case 'addVar': {
        const cur = Number(vars[c.var]) || 0;
        const inc = Number(parseVal(c.value)) || 0;
        setVar(c.var, cur + inc);
        break;
      }
      case 'reward': h.reward(c.reward || '', Number(c.amount) || 0, node); break;
      case 'delay': await h.delay(Number(c.ms) || 0); break;
      case 'custom': await h.callFn(c.fn || '', parseArgs(c.argsJson), { node, vars }); break;
      default: h.log('[flowRuntime] 미지의 동작 kind:', c.kind); break;
    }
  }

  /** node|port 의 첫 flow 대상 노드 id(없으면 null). */
  function firstFlow(nodeId, port) {
    const list = flowOut.get(`${nodeId}|${port}`);
    return list && list.length ? list[0] : null;
  }

  /** node|port 의 모든 flow 대상(병렬 분기용 — 현재 trigger out 다중 연결 대비). */
  function allFlow(nodeId, port) {
    return flowOut.get(`${nodeId}|${port}`) || [];
  }

  /** 한 노드에서 시작해 흐름을 끝까지 실행. */
  async function runFrom(startId, ctx = {}) {
    let id = startId;
    let steps = 0;
    while (id && !stopped) {
      if (++steps > maxSteps) { h.log('[flowRuntime] maxSteps 초과 — 실행 중단'); break; }
      const node = nodes.get(id);
      if (!node) break;
      id = await processNode(node, ctx);
    }
  }

  /** 특정 이벤트의 모든 트리거 노드. */
  function triggersOf(event, pred) {
    const out = [];
    for (const n of flow.nodes) {
      if (n.type !== 'trigger') continue;
      if ((n.config && n.config.event) !== event) continue;
      if (pred && !pred(n)) continue;
      out.push(n);
    }
    return out;
  }

  /** 트리거 노드(들)의 out 분기를 전부 실행. */
  function runTriggers(list, ctx) {
    return Promise.all(list.flatMap((t) => allFlow(t.id, 'out').map((nid) => runFrom(nid, ctx))));
  }

  // ── varCondition 트리거: 변수 변화 시 false→true 전이에서만 발동(엣지 트리거) ──
  function evalVarTriggers() {
    if (stopped) return;
    for (const t of triggersOf('varCondition')) {
      const c = t.config || {};
      const now = compareVals(vars[c.var], c.op, parseVal(c.value));
      const prev = condState.get(t.id) || false;
      condState.set(t.id, now);
      if (now && !prev) runTriggers([t], { trigger: 'varCondition' });
    }
  }

  // ── screenEnter 자동 발동(화면 전환 후 마이크로태스크로 분리 → 재귀 스택 방지) ──
  const enterSeen = new Set();   // 현재 동기 사이클에서 이미 발동한 화면(즉시 재진입 루프 가드)
  function scheduleScreenEnter(screenDocId) {
    if (enterSeen.has(screenDocId)) return;
    enterSeen.add(screenDocId);
    Promise.resolve().then(() => {
      enterSeen.delete(screenDocId);
      if (!stopped) enterScreen(screenDocId);
    });
  }

  // ───────────────────────── 공개 API ─────────────────────────

  /** 게임 시작 — gameStart 트리거 + timer 트리거 예약 + 초기 varCondition 평가. */
  function start(ctx = {}) {
    stopped = false;
    // 초기 변수조건 상태 시드(시작 시점에 이미 참이면 발동하지 않도록 prev=현재값으로 세팅)
    for (const t of triggersOf('varCondition')) {
      const c = t.config || {};
      condState.set(t.id, compareVals(vars[c.var], c.op, parseVal(c.value)));
    }
    for (const t of triggersOf('timer')) scheduleTimer(t);
    return runTriggers(triggersOf('gameStart'), { ...ctx, trigger: 'gameStart' });
  }

  function scheduleTimer(t) {
    const ms = Number(t.config && t.config.ms) || 0;
    h.delay(ms).then(() => { if (!stopped) runTriggers([t], { trigger: 'timer' }); });
  }

  /** 화면 진입 알림 — 해당 화면(또는 화면 무지정) screenEnter 트리거 실행. */
  function enterScreen(screenDocId, ctx = {}) {
    const list = triggersOf('screenEnter', (n) => {
      const s = n.config && n.config.screen;
      return !s || s === screenDocId;
    });
    return runTriggers(list, { ...ctx, trigger: 'screenEnter', screen: screenDocId });
  }

  /**
   * 버튼 탭 알림 — 두 경로를 동시에 라우팅:
   *   (1) role 일치 buttonTap 트리거 노드(전역).
   *   (2) 현재(또는 지정) 화면의 screen 노드에서 `btn:<role>` 출력 포트로 나간 흐름
   *       (에디터 Phase 3: 화면 노드의 버튼별 자동 포트. role = 레이아웃 요소 id).
   */
  function tapButton(role, screenDocId, ctx = {}) {
    const screen = screenDocId || currentScreen;
    const runs = [];

    const list = triggersOf('buttonTap', (n) => {
      const c = n.config || {};
      if (c.role && c.role !== role) return false;
      if (c.screen && screen && c.screen !== screen) return false;
      return true;
    });
    if (list.length) runs.push(runTriggers(list, { ...ctx, trigger: 'buttonTap', role, screen }));

    if (screen) {
      for (const n of flow.nodes) {
        if (n.type !== 'screen' || !(n.config && n.config.screenDocId === screen)) continue;
        for (const nid of allFlow(n.id, `btn:${role}`)) {
          runs.push(runFrom(nid, { ...ctx, trigger: 'buttonTap', role, screen }));
        }
      }
    }
    return Promise.all(runs);
  }

  /** 임의 이벤트 디스패치(gameStart/screenEnter/buttonTap/timer). */
  function fire(event, payload = {}) {
    if (event === 'gameStart') return start(payload);
    if (event === 'screenEnter') return enterScreen(payload.screen, payload);
    if (event === 'buttonTap') return tapButton(payload.role, payload.screen, payload);
    return runTriggers(triggersOf(event), { ...payload, trigger: event });
  }

  /** 모든 예약 타이머 취소 + 이후 트리거 무시. */
  function stop() {
    stopped = true;
    for (const id of timers) clearTimeout(id);
    timers.clear();
  }

  return {
    vars,
    flow,
    getVar: (name) => vars[name],
    setVar,
    start,
    fire,
    enterScreen,
    tapButton,
    stop,
    get stopped() { return stopped; },
    get currentScreen() { return currentScreen; },
  };
}
