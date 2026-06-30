/**
 * econ/store.ts — 콘솔 **작업셋 영속 + 변경 기록(changelog) + 익스포트**.
 *
 *   작업셋(WorkingState) = 튜닝 중인 파라미터(localStorage 영속, 리로드 생존).
 *   changelog = 설계 결정 추적(레버 from→to + 사유 + 타임스탬프).
 *   export = JSON(작업셋 전체) + 소스 diff(변경된 상수만 파일·이름·값) → 커밋용 붙여넣기.
 */
import { LEVERS, type WorkingState } from './levers.js';
import { defaultEconParams } from './sim.js';
import { DEFAULT_LEAGUE } from './league.js';

const WORKING_KEY = 'socialcasino_econ_working_v1';
const CHANGELOG_KEY = 'socialcasino_econ_changelog_v1';

/** SSOT 기본 작업셋(라이브 게임 값). */
export function ssotWorking(): WorkingState {
  return { params: defaultEconParams(), league: { ...DEFAULT_LEAGUE } };
}

/** 작업셋 로드 — 저장본을 SSOT 기본 위에 병합(전방호환: 새 필드는 기본값 유지). */
export function loadWorking(): WorkingState {
  const base = ssotWorking();
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(WORKING_KEY) : null;
    if (!raw) return base;
    const o = JSON.parse(raw) as Partial<WorkingState>;
    return {
      params: { ...base.params, ...(o.params ?? {}) },
      league: { ...base.league, ...(o.league ?? {}) },
    };
  } catch {
    return base;
  }
}

export function saveWorking(ws: WorkingState): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(WORKING_KEY, JSON.stringify(ws));
  } catch {
    /* ignore */
  }
}

export function resetWorking(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(WORKING_KEY);
  } catch {
    /* ignore */
  }
}

// ── 변경 기록 ──
export interface ChangeDiff {
  readonly label: string;
  readonly srcName?: string;
  readonly from: number;
  readonly to: number;
}
export interface ChangeEntry {
  readonly ts: number;
  readonly note: string;
  readonly diffs: ReadonlyArray<ChangeDiff>;
}

export function loadChangelog(): ChangeEntry[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CHANGELOG_KEY) : null;
    if (!raw) return [];
    const o = JSON.parse(raw) as ChangeEntry[];
    return Array.isArray(o) ? o : [];
  } catch {
    return [];
  }
}

export function saveChangelog(log: ReadonlyArray<ChangeEntry>): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(CHANGELOG_KEY, JSON.stringify(log));
  } catch {
    /* ignore */
  }
}

export function appendChangelog(entry: ChangeEntry): ChangeEntry[] {
  const log = loadChangelog();
  const next = [entry, ...log].slice(0, 200); // 최신 200개
  saveChangelog(next);
  return next;
}

export function clearChangelog(): void {
  saveChangelog([]);
}

/** 스칼라 레버 기준 SSOT 대비 변경분(레버 단위). */
export function diffFromSsot(ws: WorkingState): ChangeDiff[] {
  const ssot = ssotWorking();
  const diffs: ChangeDiff[] = [];
  for (const lv of LEVERS) {
    const to = lv.get(ws);
    const from = lv.get(ssot);
    if (Math.abs(to - from) > 1e-9) diffs.push({ label: lv.label, srcName: lv.srcName, from, to });
  }
  return diffs;
}

/** 익스포트: 작업셋 전체 JSON. */
export function exportJSON(ws: WorkingState): string {
  return JSON.stringify(ws, null, 2);
}

/** 익스포트: 변경된 소스 상수 diff(파일별 그룹, 커밋용 붙여넣기). 미션/럭표/리그밴드는 JSON 참조. */
export function exportSourceDiff(ws: WorkingState): string {
  const diffs = diffFromSsot(ws).filter((d) => d.srcName);
  if (diffs.length === 0) return '// 변경된 스칼라 상수 없음 (미션·럭표·리그밴드는 JSON export 참조).';
  const byFile = new Map<string, ChangeDiff[]>();
  for (const lv of LEVERS) {
    if (!lv.srcName || !lv.srcFile) continue;
    const d = diffs.find((x) => x.srcName === lv.srcName);
    if (!d) continue;
    if (!byFile.has(lv.srcFile)) byFile.set(lv.srcFile, []);
    byFile.get(lv.srcFile)!.push(d);
  }
  const lines: string[] = ['// ⚠️ 소스 상수 변경분(커밋용). 해당 파일에서 값을 아래로 교체하세요.'];
  for (const [file, ds] of byFile) {
    lines.push(`\n// ── ${file} ──`);
    for (const d of ds) lines.push(`export const ${d.srcName} = ${d.to}; // was ${d.from}`);
  }
  return lines.join('\n');
}
