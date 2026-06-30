/**
 * reporter — 저작툴 런타임이 "게임 안에서" 일으키는 오류를 게임 → 저작툴(dev 서버)로 보내는 채널(브라우저측).
 *
 *   게임 개발 중 저작툴(렌더러/플로우/스프라이트 런타임)에서 발생한 오류를 저작툴 쪽으로 보고해 빠르게 고치게 한다.
 *
 *   게임이 dev 모드에서 한 번 설치:
 *     import { installToolReporter } from '@ohdyssey/phaser-ui-editor';
 *     installToolReporter({ project: 'Homerun', toolVersion: '0.x', endpoint: 'http://127.0.0.1:7180/__pue_report' });
 *
 *   - reportToolError(subsystem, error, context): 저작툴 런타임이 내부에서 호출(catch 지점). 미설치면 no-op(저렴).
 *   - reportIssue({message,...}): 개발자가 수동으로 "이상함" 보고.
 *   - 전송 실패는 조용히 무시(게임을 절대 깨지 않음). 중복은 dedupeMs 내 억제, 큐는 디바운스 후 일괄 전송.
 *
 *   ⚠ 프로덕션 빌드에서는 설치하지 말 것(dev 전용 진단 채널). 미설치 상태의 report* 호출은 아무 일도 하지 않는다.
 */

const TOOL = 'phaser-ui-editor';
let _cfg = null;                 // 설치 전엔 null → 모든 report* 가 no-op
const _seen = new Map();         // dedup key → 마지막 전송 시각(ms)
let _queue = [];
let _flushTimer = null;

/** 게임이 dev 부팅 시 1회 호출. 반환: 적용된 설정. */
export function installToolReporter(opts = {}) {
  _cfg = {
    endpoint: opts.endpoint || 'http://127.0.0.1:7180/__pue_report',
    project: opts.project || 'unknown',
    toolVersion: opts.toolVersion || '',
    enabled: opts.enabled !== false,
    max: opts.max > 0 ? opts.max : 50,         // 큐 상한(전송 전 누적)
    dedupeMs: opts.dedupeMs ?? 5000,
    flushMs: opts.flushMs ?? 800,
    onReport: typeof opts.onReport === 'function' ? opts.onReport : null,
    captureGlobal: !!opts.captureGlobal,       // window.onerror/unhandledrejection 도 캡처(저작툴 프레임만)
  };
  if (_cfg.captureGlobal) installGlobalHooks();
  return _cfg;
}

/** 설치 여부(런타임 모듈이 비용 회피용으로 확인 가능). */
export function reporterActive() { return !!(_cfg && _cfg.enabled); }

/** 저작툴 런타임 내부 오류 보고(catch 지점에서 호출). 미설치면 no-op. */
export function reportToolError(subsystem, error, context) {
  if (!reporterActive()) return;
  const message = (error && (error.message || (typeof error === 'string' ? error : ''))) || String(error || 'unknown error');
  const stack = (error && error.stack) || '';
  enqueue({ kind: 'error', subsystem: subsystem || 'runtime', message, stack, context });
}

/** 개발자 수동 보고("이 화면이 이상함"). 미설치면 no-op. */
export function reportIssue(info = {}) {
  if (!reporterActive()) return;
  enqueue({ kind: info.kind === 'warn' ? 'warn' : 'issue', subsystem: info.subsystem || 'manual', message: info.message || '', stack: info.stack || '', context: info.context });
}

// ── 내부 ──
function nowMs() { try { return Date.now(); } catch { return 0; } }
function safeUrl() { try { return String((typeof location !== 'undefined' && location.href) || ''); } catch { return ''; } }

function enqueue(rec) {
  const key = `${rec.subsystem}|${rec.message}|${(rec.stack || '').slice(0, 120)}`;
  const t = nowMs();
  const last = _seen.get(key);
  if (last != null && t - last < _cfg.dedupeMs) return;   // 중복 억제
  _seen.set(key, t);
  const full = {
    ts: t, tool: TOOL, toolVersion: _cfg.toolVersion, project: _cfg.project, url: safeUrl(),
    kind: rec.kind, subsystem: rec.subsystem, message: rec.message, stack: rec.stack,
    context: rec.context == null ? '' : rec.context,
  };
  if (_cfg.onReport) { try { _cfg.onReport(full); } catch { /* */ } }
  _queue.push(full);
  if (_queue.length > _cfg.max) _queue = _queue.slice(-_cfg.max);
  scheduleFlush();
}

function scheduleFlush() {
  if (_flushTimer) return;
  const run = () => { _flushTimer = null; flush(); };
  try { _flushTimer = setTimeout(run, _cfg.flushMs); } catch { run(); }
}

function flush() {
  if (!_queue.length || !_cfg) return;
  const batch = _queue.slice();
  _queue = [];
  for (const rec of batch) send(rec);
}

function send(rec) {
  try {
    if (typeof fetch !== 'function') return;
    fetch(_cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rec),
      keepalive: true,        // 페이지 언로드 중에도 전송 시도
      mode: 'cors',
    }).catch(() => { /* 저작툴 서버 미가동/네트워크 — 무시(게임 영향 없음) */ });
  } catch { /* */ }
}

let _hooked = false;
function installGlobalHooks() {
  if (_hooked || typeof window === 'undefined') return;
  _hooked = true;
  const isToolFrame = (s) => /phaser-ui-editor|renderLayoutInto|flow(Runtime|Host)|spriteClip|\/report\//.test(String(s || ''));
  try {
    window.addEventListener('error', (e) => {
      const stack = (e && e.error && e.error.stack) || '';
      if (isToolFrame(stack) || isToolFrame(e && e.filename)) reportToolError('window', e.error || e.message, { filename: e && e.filename, line: e && e.lineno });
    });
    window.addEventListener('unhandledrejection', (e) => {
      const r = e && e.reason;
      const stack = (r && r.stack) || '';
      if (isToolFrame(stack)) reportToolError('promise', r, null);
    });
  } catch { /* */ }
}
