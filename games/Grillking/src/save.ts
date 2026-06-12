/**
 * 저장 — localStorage 단일 키, 안전 파싱(불량 데이터 → 기본값). 불변 업데이트.
 */

const SAVE_KEY = 'grillking_v1';

export interface SaveData {
  readonly level: number;
  readonly coins: number;
  readonly sfx: boolean;
}

const DEFAULTS: SaveData = { level: 1, coins: 500, sfx: true };

function isValid(v: unknown): v is SaveData {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.level === 'number' && o.level >= 1 && typeof o.coins === 'number' && typeof o.sfx === 'boolean';
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (!isValid(parsed)) return DEFAULTS;
    return { level: Math.floor(parsed.level), coins: Math.max(0, Math.floor(parsed.coins)), sfx: parsed.sfx };
  } catch {
    return DEFAULTS;
  }
}

export function writeSave(data: SaveData): SaveData {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* 프라이빗 모드 등 저장 불가 — 게임은 계속 */
  }
  return data;
}

export function updateSave(patch: Partial<SaveData>): SaveData {
  return writeSave({ ...loadSave(), ...patch });
}
