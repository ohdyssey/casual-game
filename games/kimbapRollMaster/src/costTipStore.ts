/**
 * costTipStore.ts — 「재료값 알림을 이미 봤다」를 기억한다.
 *
 * 한 판을 끝낼 때마다 같은 알림이 뜨면 그건 안내가 아니라 방해다. 딱 한 번만.
 * ⚠️ 저장소가 없는 환경(헤드리스 검증 등)에서도 게임은 그대로 돌아야 하므로 실패는 삼킨다 —
 * 실패하면 「아직 안 봤다」로 본다(한 번 더 뜨는 쪽이 영영 못 보는 쪽보다 낫다).
 */
const KEY = 'kbrm.costTipSeen';

const store = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export function seenCostTip(): boolean {
  try {
    return store()?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markCostTipSeen(): void {
  try {
    store()?.setItem(KEY, '1');
  } catch {
    /* 못 남겨도 게임은 계속된다 */
  }
}
