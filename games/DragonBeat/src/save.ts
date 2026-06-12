/**
 * 저장 — localStorage 단일 키(dragonbeat_v1), 안전 파싱(불량 데이터 → 기본값). 불변 업데이트.
 */

const SAVE_KEY = 'dragonbeat_v1';

export interface SaveData {
  /** 다음에 도전할 레이스 (1~3, 3판 완주 시 1로 순환). */
  readonly race: number;
  readonly coins: number;
  readonly gems: number;
  readonly sfx: boolean;
  readonly bestCombo: number;
}

const DEFAULTS: SaveData = { race: 1, coins: 500, gems: 50, sfx: true, bestCombo: 0 };

function isValid(v: unknown): v is SaveData {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.race === 'number' &&
    o.race >= 1 &&
    typeof o.coins === 'number' &&
    typeof o.gems === 'number' &&
    typeof o.sfx === 'boolean' &&
    typeof o.bestCombo === 'number'
  );
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (!isValid(parsed)) return DEFAULTS;
    return {
      race: Math.min(3, Math.max(1, Math.floor(parsed.race))),
      coins: Math.max(0, Math.floor(parsed.coins)),
      gems: Math.max(0, Math.floor(parsed.gems)),
      sfx: parsed.sfx,
      bestCombo: Math.max(0, Math.floor(parsed.bestCombo)),
    };
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
