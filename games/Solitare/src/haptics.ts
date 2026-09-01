/**
 * haptics.ts — Solitaire Heights 햅틱 문법(2026-08-25).
 *
 * ## 설계 원칙 — "손끝으로 느끼는 리듬"
 * 솔리테어 하이츠의 재미는 **±1 연쇄를 끊기지 않게 이어 가는 리듬**에 있다. 진동은 그 리듬을
 * 손끝에 얹는 장치이지, 모든 소리의 복제가 아니다. 그래서 세 가지 규칙으로 좁힌다.
 *
 * 1. **콤보가 손에서 자라난다** — 카드 놓기는 콤보 길이에 따라 light→medium→heavy 로 굵어진다.
 *    눈으로 보는 "콤보 x7" 보다 먼저, 손이 "지금 흐름을 타고 있다"를 안다. 콤보가 끊기면 다시 light 로
 *    돌아가 상실감이 촉각으로 전달된다.
 * 2. **판정은 알림, 조작은 충격, 탐색은 틱** — 결과(세트 완성·별·데드락·코인 부족)는 notify,
 *    물리 접촉(카드 놓기·와일드·건설)은 impact, 탐색(뽑기·되돌리기)은 selection 으로 계층을 나눠
 *    진동만으로도 무슨 일이 났는지 구분되게 한다.
 * 3. **UI 는 침묵한다** — 버튼·팝업·토스트·코인 틱은 진동하지 않는다. 진동이 흔해지면 콤보의 굵어짐이
 *    묻히고(대비 상실), 손이 피로해 설정에서 꺼 버린다. 켜 둔 채로 오래 가는 것이 목표다.
 *
 * ## 이벤트 → 촉각 표
 * | 이벤트 | 큐 | 의도 |
 * |---|---|---|
 * | 카드 놓기(콤보 1~2 / 3~5 / 6+) | impact light / medium / heavy | 흐름의 굵기 |
 * | 잘못된 탭(±1 불일치) | selection 틱 2연타 | "아니야" — 가볍게, 벌주지 않음 |
 * | 뽑기·되돌리기·+5 | selection | 탐색 행동 |
 * | 와일드 켜기/쓰기 | impact medium | 특수 카드의 무게 |
 * | 세트 완성·미션 슬롯·건설·해금 | notify success | 성취 |
 * | 별 1/2/3 | impact light/medium/heavy | 올라가는 등급 |
 * | 게이지 가득 | notify success | 보상 문턱 |
 * | 승리 | notify success | 정산 시작 |
 * | 막힘(데드락) | notify warning | 한 번 묵직하게 — 결정을 요구 |
 * | 코인 부족·건설 실패 | notify error | 거부 |
 * | 버튼·팝업·토스트·코인 틱 | (없음) | 대비 유지 |
 *
 * ## 배선
 * 별도 호출을 씬마다 흩뿌리지 않고 **`audio.ts` 의 sfx 재생 지점 한 곳에서 짝짓는다**(SOUND_DESIGN.md
 * "햅틱 페어링"). 사운드 볼륨이 0 이어도 진동은 독립적으로 울린다(무음 플레이가 가장 흔한 사용 환경).
 * 콤보 강도만 예외로, 씬이 `sfxCardPlace(combo)` 에 콤보 길이를 넘긴다.
 */
import { impact, notify, selection, setHapticsEnabled, hapticsSupported } from '@casual/core/systems/haptics.js';
import type { Sfx } from './audio.js';

/** 콤보 길이 → 충격 강도 문턱. 3에서 medium, 6에서 heavy — 콤보 별 게이지(5칸)와 엇갈리게 둬 두 신호가 겹치지 않는다. */
export const COMBO_MEDIUM_AT = 3;
export const COMBO_HEAVY_AT = 6;

export type HapticCue =
  | { kind: 'impact'; style: 'light' | 'medium' | 'heavy' }
  | { kind: 'notify'; type: 'success' | 'warning' | 'error' }
  | { kind: 'selection'; times?: number }
  | { kind: 'none' };

const NONE: HapticCue = { kind: 'none' };

/** 효과음 → 촉각 큐. 표에 없는 소리(UI)는 진동하지 않는다. */
const SFX_CUES: Partial<Record<Sfx, HapticCue>> = {
  card_place: { kind: 'impact', style: 'light' }, // 클론다이크 드롭(콤보 없음).
  card_invalid: { kind: 'selection', times: 2 },
  card_deal: { kind: 'selection' },
  undo: { kind: 'selection' },
  add5: { kind: 'selection' },
  wild_activate: { kind: 'impact', style: 'medium' },
  wild_use: { kind: 'impact', style: 'medium' },
  set_complete: { kind: 'notify', type: 'success' },
  mission_slot: { kind: 'notify', type: 'success' },
  gauge_full: { kind: 'notify', type: 'success' },
  win_fanfare: { kind: 'notify', type: 'success' },
  build: { kind: 'notify', type: 'success' },
  unlock: { kind: 'notify', type: 'success' },
  stuck: { kind: 'notify', type: 'warning' },
  no_coin: { kind: 'notify', type: 'error' },
  build_fail: { kind: 'notify', type: 'error' },
  star: { kind: 'impact', style: 'medium' }, // 단계 없는 별(sfxStar 가 아닌 sfx('star')).
};

export function cueForSfx(name: Sfx): HapticCue {
  return SFX_CUES[name] ?? NONE;
}

/** 콤보 길이에 따른 카드 놓기 큐. */
export function cueForCardPlace(combo: number): HapticCue {
  const c = Math.max(0, Math.floor(combo));
  if (c >= COMBO_HEAVY_AT) return { kind: 'impact', style: 'heavy' };
  if (c >= COMBO_MEDIUM_AT) return { kind: 'impact', style: 'medium' };
  return { kind: 'impact', style: 'light' };
}

/** 별 1·2·3 — 등급이 올라갈수록 굵게. */
export function cueForStar(step: number): HapticCue {
  const n = Math.min(3, Math.max(1, Math.round(step)));
  return { kind: 'impact', style: (['light', 'medium', 'heavy'] as const)[n - 1] };
}

/** 큐 실행. 연타(selection times>1)는 iOS 프리셋에 연타가 없어 짧은 간격으로 반복 호출한다. */
export function playCue(cue: HapticCue): void {
  switch (cue.kind) {
    case 'impact':
      impact(cue.style);
      return;
    case 'notify':
      notify(cue.type);
      return;
    case 'selection': {
      const times = Math.max(1, cue.times ?? 1);
      selection();
      for (let i = 1; i < times; i += 1) setTimeout(selection, i * 70);
      return;
    }
    default:
      return;
  }
}

// ── 설정(켜짐/꺼짐) — 볼륨과 같은 방식으로 audio 모듈처럼 자급 저장 ──────────────────────
const HAPTICS_KEY = 'solitaire.haptics';

function loadEnabled(): boolean {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(HAPTICS_KEY);
    return raw == null ? true : raw === '1';
  } catch {
    return true;
  }
}
let on = loadEnabled();
setHapticsEnabled(on);

export function hapticsOn(): boolean {
  return on;
}

export function setHapticsOn(v: boolean): void {
  on = v;
  setHapticsEnabled(v);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(HAPTICS_KEY, v ? '1' : '0');
  } catch {
    /* 저장 실패는 무시(이번 세션에만 적용) */
  }
}

/** **버튼 1개용** 토글 — 바뀐 상태를 돌려준다. 켜지는 순간 medium 충격 한 번으로 즉시 확인시킨다. */
export function toggleHaptics(): boolean {
  setHapticsOn(!on);
  if (on) impact('medium');
  return on;
}

/** 메뉴 버튼 라벨 — 기기가 진동을 못 내면 사실대로 표시한다(iOS 웹 등). */
export function hapticsLabel(): string {
  if (!hapticsSupported()) return '📳 진동 미지원 기기';
  return on ? '📳 진동 켜짐' : '📴 진동 꺼짐';
}
