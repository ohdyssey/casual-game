/**
 * messageStyle.ts — **메시지 창 색 고르기**(순수, Phaser-free).
 *
 * PO 2026-08-22:
 *   · **노란 창** = 숫자 등 표시 분량이 적은 것(예: `🪙 +1,200`, `＋2 카드`)
 *   · **초록 창** = 문장 단위의 정보(예: `코인이 부족합니다. 상점에서 충전하고 이어서 하세요.`)
 *
 * 호출부마다 색을 손으로 고르면 금방 어긋나므로 **문구 길이로 자동 판정**한다.
 */

/** 공백·이모지를 뺀 실질 글자 수가 이 이하면 "짧은 표시"로 본다. */
export const SHORT_MSG_MAX = 12;

/** 노란 창(짧은 표시)인가 — 아니면 초록 창(문장). */
export function isShortMessage(msg: string): boolean {
  if (msg.includes(String.fromCharCode(10))) return false; // 줄바꿈이 있으면 문장으로 본다(공백 제거 전에 확인).
  const compact = msg
    .replace(/\s+/g, '')
    // 이모지·기호는 길이 판정에서 제외(글자 수만 센다).
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{20E3}]/gu, '');
  return compact.length <= SHORT_MSG_MAX;
}

/**
 * **문구를 "같은 메시지"로 묶는 열쇠** — 숫자·기호를 지운 뼈대만 남긴다.
 *   `＋5 카드  🪙 1,200` 과 `＋5 카드  🪙 900` 은 플레이어에겐 같은 안내다. 숫자를 그대로 두면
 *   판마다 다른 열쇠가 돼 반복 제한이 전혀 걸리지 않는다(PO 2026-08-22 "계속 표시된다").
 */
export function messageKey(msg: string): string {
  return msg
    .replace(/[0-9,.]+/g, '#')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{20E3}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 같은 문구를 띄우는 최대 횟수. */
export const MESSAGE_REPEAT_MAX = 2;

/**
 * **같은 메시지를 반복해서 띄우지 않는다**(PO 2026-08-22 "반복적인 메시지는 1~2회만").
 *   보너스 획득·안내처럼 판마다 반복되는 문구가 매번 뜨면 진행을 방해한다. 같은 문구는 `max` 회까지만.
 * @param counts 문구별 표시 횟수(호출부가 보관) — 이 함수가 직접 올린다.
 */
export function shouldShowMessage(counts: Map<string, number>, msg: string, max = MESSAGE_REPEAT_MAX): boolean {
  const key = messageKey(msg);
  const n = counts.get(key) ?? 0;
  if (n >= max) return false;
  counts.set(key, n + 1);
  return true;
}
