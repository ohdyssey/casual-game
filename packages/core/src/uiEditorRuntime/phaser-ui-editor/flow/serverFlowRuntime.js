/**
 * serverFlowRuntime — serverFlow(서버 흐름)를 DataAdapter 에 대해 실행하는 엔진. (순수 — 백엔드 무관)
 *
 *   클라 flowRuntime 과 같은 "그래프 워커" 패턴이되, host 콜백 대신 **DataAdapter** 를 주입해 데이터/재화/
 *   랭킹/인증/조건/응답 노드를 처리한다. in-memory 어댑터로 시뮬레이션, 같은 그래프를 실 Supabase 어댑터로
 *   재타깃(C-3 "시뮬→실서버 무봉합"). 모든 데이터 연산을 ops 트레이스로 남겨 시각 디버거/리플레이에 쓴다.
 *
 *   설계: docs/SERVER_TOOL_PLAN.md (Part B·C). 노드 config 규약 = flowNodeMeta 의 서버 카테고리와 1:1.
 *
 *   바인딩: config 문자열이 '$' 로 시작하면 요청/인증/변수 참조 — $body.x · $query.x · $auth.uid · $vars.x.
 *     그 외 문자열/숫자/불리언은 리터럴(parseVal). 객체/배열은 깊은 해석.
 */
import { coerceFlow } from './flowSchema.js';
import { parseVal, compareVals } from './flowRuntime.js';

const DEFAULT_MAX_STEPS = 500;
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
// 프로토타입 오염 차단 — 무신뢰 요청($body/$query)이 __proto__/constructor 를 타고 읽거나 doc 키로 오염시키는 것을 막는다.
const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const path = (obj, p) => String(p).split('.').reduce((o, k) => (o == null || BLOCKED_KEYS.has(k)) ? undefined : o[k], obj);

/**
 * @param {object} rawFlow  coerceFlow 전/후 모두 허용. kind==='serverFlow' 권장.
 * @param {{ adapter:object, entities?:object[], maxSteps?:number }} opts  adapter=DataAdapter(필수)
 * @returns {{ handle:(request?:object)=>Promise<object>, flow:object }}
 */
export function createServerFlowRuntime(rawFlow, opts = {}) {
  const { flow, ok } = coerceFlow(rawFlow, { source: 'serverFlowRuntime' });
  if (!ok || !flow) throw new Error('createServerFlowRuntime: 유효하지 않은 플로우');
  const adapter = opts.adapter;
  if (!adapter || typeof adapter.get !== 'function') throw new Error('createServerFlowRuntime: DataAdapter 가 필요합니다');
  const maxSteps = Number.isFinite(opts.maxSteps) ? opts.maxSteps : DEFAULT_MAX_STEPS;
  // entities 가 배열로 주어지면(빈 배열 포함) 미정의 엔티티를 검증. undefined 면 관용 모드(검증 생략).
  const hasEntitySpec = Array.isArray(opts.entities);
  const entityNames = new Set((opts.entities || []).map((e) => e && e.name).filter(Boolean));

  const nodes = new Map(flow.nodes.map((n) => [n.id, n]));
  const flowOut = new Map();   // 'nodeId|port' → [toNodeId]
  for (const e of flow.edges) {
    if (e.kind === 'attach') continue;
    const k = `${e.from.node}|${e.from.port}`;
    if (!flowOut.has(k)) flowOut.set(k, []);
    flowOut.get(k).push(e.to.node);
  }
  const firstFlow = (id, port) => { const l = flowOut.get(`${id}|${port}`); return l && l.length ? l[0] : null; };

  // ── 바인딩 해석 ──
  const resolveRef = (val, ctx) => {
    if (typeof val !== 'string') return val;
    if (val[0] !== '$') return parseVal(val);
    const expr = val.slice(1);
    if (expr === 'auth.uid' || expr === 'uid') return ctx.auth.uid;
    if (expr.startsWith('body.')) return path(ctx.request.body, expr.slice(5));
    if (expr.startsWith('query.')) return path(ctx.request.query, expr.slice(6));
    if (expr.startsWith('auth.')) return path(ctx.auth, expr.slice(5));
    if (expr.startsWith('vars.')) return path(ctx.vars, expr.slice(5));
    return undefined;
  };
  const resolveDeep = (v, ctx) => {
    if (Array.isArray(v)) return v.map((x) => resolveDeep(x, ctx));
    if (isObj(v)) { const o = {}; for (const k of Object.keys(v)) { if (BLOCKED_KEYS.has(k)) continue; o[k] = resolveDeep(v[k], ctx); } return o; }   // 오염 키 제거
    return resolveRef(v, ctx);
  };
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

  // ── 노드 처리 ── 반환: { next } | { respond:{status,body} } | null
  async function processNode(node, ctx) {
    const c = isObj(node.config) ? node.config : {};
    const next = () => ({ next: firstFlow(node.id, 'out') });
    const warnEntity = (name) => { if (name && hasEntitySpec && !entityNames.has(name)) ctx.ops.push({ op: 'warn', detail: `미정의 엔티티 '${name}' — 데이터 모드에서 정의 필요` }); };

    switch (node.type) {
      case 'trigger':
        ctx.ops.push({ op: 'trigger', event: c.event || 'http', method: c.method, path: c.path });
        return next();

      case 'auth': {
        const op = c.op || 'require';
        if (op === 'require' && (ctx.auth.uid == null || ctx.auth.uid === '')) {
          ctx.ops.push({ op: 'auth.require', ok: false });
          return { respond: { status: 401, body: { ok: false, error: '인증 필요' } } };
        }
        if (op === 'uid') ctx.vars[c.as || 'uid'] = ctx.auth.uid;
        ctx.ops.push({ op: `auth.${op}`, uid: ctx.auth.uid });
        return next();
      }

      case 'condition': {
        if (typeof c.var === 'string' && c.var[0] !== '$' && c.var.includes('.')) ctx.ops.push({ op: 'warn', detail: `조건 변수 '${c.var}' 가 점(.) 경로지만 $ 접두사 없음 — 중첩값은 $vars.${c.var} 형식 사용` });
        const left = (typeof c.var === 'string' && c.var[0] === '$') ? resolveRef(c.var, ctx) : ctx.vars[c.var];
        const branch = compareVals(left, c.op, parseVal(c.value)) ? 'true' : 'false';
        ctx.ops.push({ op: 'condition', var: c.var, cmp: c.op, value: c.value, left, branch });
        return { next: firstFlow(node.id, branch) };
      }

      case 'data': {
        const op = c.op || 'get', entity = c.entity, as = c.as || 'result';
        warnEntity(entity);
        let res;
        if (op === 'get') res = await adapter.get(entity, resolveRef(c.id, ctx));
        else if (op === 'query') res = await adapter.query(entity, { where: resolveDeep(c.where || {}, ctx), sort: c.sort, limit: c.limit });
        else if (op === 'insert') res = await adapter.insert(entity, resolveDeep(c.doc || {}, ctx));
        else if (op === 'update') res = await adapter.update(entity, resolveRef(c.id, ctx), resolveDeep(c.doc || {}, ctx));
        else if (op === 'upsert') res = await adapter.upsert(entity, resolveRef(c.id, ctx), resolveDeep(c.doc || {}, ctx));
        else if (op === 'increment') res = await adapter.increment(entity, resolveRef(c.id, ctx), c.field, num(resolveRef(c.delta, ctx)));
        else if (op === 'remove') res = await adapter.remove(entity, resolveRef(c.id, ctx));
        else { ctx.ops.push({ op: 'data', error: `미지의 op '${op}'` }); return next(); }
        ctx.vars[as] = res;
        ctx.ops.push({ op: `data.${op}`, entity, id: c.id, as });
        return next();
      }

      case 'economy': {
        const op = c.op || 'grant', entity = c.entity, id = resolveRef(c.id, ctx), cur = c.currency || 'coins', amt = num(resolveRef(c.amount, ctx));
        warnEntity(entity);
        // 서버권위 약화 경고 — 재화 금액을 클라이언트 입력에서 바인딩하면 조작 가능(설계 검토 필요).
        if (typeof c.amount === 'string' && /^\$(body|query)\./.test(c.amount)) ctx.ops.push({ op: 'warn', detail: `재화 금액이 클라이언트 입력(${c.amount})에서 옴 — 서버에서 결정/검증 권장` });
        if (op === 'verifyReceipt') {   // 시뮬: 영수증 검증 통과 가정(실 어댑터/호스트가 대체)
          ctx.ops.push({ op: 'economy.verifyReceipt', entity, id, verified: true });
          return next();
        }
        const delta = op === 'spend' ? -Math.abs(amt) : Math.abs(amt);
        const guard = op === 'spend' ? ((doc) => (num(doc[cur]) >= Math.abs(amt))) : undefined;
        try {
          const res = await adapter.increment(entity, id, cur, delta, { guard });
          ctx.vars[c.as || 'balance'] = res[cur];
          ctx.ops.push({ op: `economy.${op}`, entity, id, currency: cur, amount: Math.abs(amt), balance: res[cur], serverAuthoritative: c.serverAuthoritative !== false });
          return next();
        } catch (e) {
          ctx.ops.push({ op: `economy.${op}`, entity, id, error: String(e.message || e) });
          if (op === 'spend') return { respond: { status: 400, body: { ok: false, error: '잔액 부족' } } };   // 서버권위 거부
          throw e;
        }
      }

      case 'rank': {
        const op = c.op || 'submit', entity = c.board || c.entity, field = c.field || 'score';
        warnEntity(entity);
        if (op === 'submit') {
          const id = resolveRef(c.id, ctx), value = num(resolveRef(c.value, ctx));
          const res = await adapter.upsert(entity, id, { [field]: value });
          ctx.vars[c.as || 'submitted'] = res;
          ctx.ops.push({ op: 'rank.submit', entity, id, field, value });
        } else if (op === 'topN') {
          const n = Number(c.n) || 10;
          ctx.vars[c.as || 'top'] = await adapter.topN(entity, field, n);
          ctx.ops.push({ op: 'rank.topN', entity, field, n });
        } else if (op === 'rankOf') {
          const id = resolveRef(c.id, ctx);
          ctx.vars[c.as || 'rank'] = await adapter.rankOf(entity, field, id);
          ctx.ops.push({ op: 'rank.rankOf', entity, id });
        }
        return next();
      }

      case 'external':   // 시뮬: 외부 호출은 부수효과 없이 로그만(실 호스트가 대체)
        ctx.ops.push({ op: 'external', method: c.method, url: c.url, provider: c.provider });
        return next();

      case 'response':
        // ⚠ 기본 body 를 vars 전체로 두면 DB 레코드(PII 포함)가 통째 노출됨 → 명시 body 없으면 {ok:true} 만.
        return { respond: { status: Number(c.status) || 200, body: c.body !== undefined ? resolveDeep(c.body, ctx) : { ok: true } } };

      case 'schedule':   // 스케줄 노드는 트리거 역할 — 흐름상 통과
        return next();

      default:   // 클라 노드(screen/action/provider)는 serverFlow 에서 무시(통과)
        ctx.ops.push({ op: 'skip', type: node.type });
        return next();
    }
  }

  /**
   * 한 요청을 처리. request = { method, path, body, query, uid|auth:{uid} }.
   * @returns {Promise<{ ok:boolean, status:number, body:any, vars:object, ops:object[], error?:string }>}
   */
  async function handle(request = {}) {
    const ctx = {
      request: { method: request.method || 'POST', path: request.path || '/', body: isObj(request.body) ? request.body : {}, query: isObj(request.query) ? request.query : {} },
      auth: { uid: request.uid != null ? request.uid : (request.auth && request.auth.uid) },
      vars: {},
      ops: [],
    };
    let startId = null;
    for (const n of flow.nodes) if (n.type === 'trigger' || n.type === 'schedule') { startId = n.id; break; }
    // body = 클라이언트에게 가는 응답(제네릭). error/vars/ops = 내부 텔레메트리(호스트/시뮬용, 클라 비전송).
    if (!startId) return { ok: false, status: 500, body: { ok: false, error: '내부 서버 오류' }, error: '시작(트리거) 노드가 없습니다', vars: ctx.vars, ops: ctx.ops };

    let response = null;
    try {
      let id = startId, steps = 0;
      while (id) {
        if (++steps > maxSteps) {
          ctx.ops.push({ op: 'error', detail: 'maxSteps 초과' });
          return { ok: false, status: 500, body: { ok: false, error: '처리 한도 초과' }, error: 'maxSteps 초과(사이클 가능성)', vars: ctx.vars, ops: ctx.ops };
        }
        const node = nodes.get(id); if (!node) break;
        const before = ctx.ops.length;
        const r = await processNode(node, ctx);
        for (let i = before; i < ctx.ops.length; i++) if (ctx.ops[i].nodeId == null) ctx.ops[i].nodeId = node.id;   // 시각 디버거: ops→노드 매핑
        if (r && r.respond) { response = r.respond; break; }
        id = r ? r.next : null;
      }
    } catch (e) {
      // 내부 오류 메시지(엔티티/스키마 구조)를 클라 body 로 누설하지 않는다 — 제네릭 body, 상세는 error/ops 로만.
      return { ok: false, status: 500, body: { ok: false, error: '내부 서버 오류' }, error: String(e.message || e), vars: ctx.vars, ops: ctx.ops };
    }
    const resp = response || { status: 200, body: { ok: true } };   // 흐름이 응답 없이 끝남 → 안전 기본(vars 미노출)
    return { ok: resp.status < 400, status: resp.status, body: resp.body, vars: ctx.vars, ops: ctx.ops };
  }

  return { handle, flow };
}
