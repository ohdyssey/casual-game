/**
 * "광고 제거"(NO ADS) 단건 구매 — **호스트 층**. 버튼 배선과 로컬 지급 플래그만 담당하고,
 * 실제 결제 호출은 빌드 타겟별 어댑터(`@store`)가 맡는다.
 *
 * 흐름: #no-ads-btn 탭 → `store.iap.purchase(sku)` → 성공이면 로컬 플래그 + 배너 제거.
 * 앱이 중간에 죽어 지급완료 통보를 못 보낸 주문은 부팅 때 `restorePending()` 이 복구한다.
 * 기기 변경·재설치는 재구매 시도 시 `already-owned` 로 돌아와 과금 없이 복구된다.
 *
 * 타겟별:
 *   · toss    — 토스 인앱결제
 *   · web     — 결제 수단 없음. 단 버튼은 남겨 동선을 확인할 수 있게 한다(안내 토스트)
 *   · msstore / android / ios — 결제 미연결 → **버튼을 DOM 에서 제거한다**
 *
 * ⚠️ 가격은 코드가 아니라 각 스토어 콘솔의 상품 등록 화면에서 정한다. 여기서는 sku 로만 참조한다.
 */
import { readItem, writeItem } from '@casual/core/store/index.js';
import store from '@store';
import { ADS_REMOVED_KEY } from './saveKeys.js';
import { showToast } from './toast.js';

/** 콘솔에 등록한 "광고 제거" 상품의 SKU. 실제 등록값과 다르면 이 상수만 바꾸면 된다. */
export const REMOVE_ADS_SKU = 'remove_ads';

const NO_ADS_BUTTON_ID = 'no-ads-btn';

/** 이미 구매했는지 — 로컬 저장값 기준. */
export function isAdsRemoved(): boolean {
  return readItem(ADS_REMOVED_KEY) === '1';
}

function markAdsRemoved(): void {
  writeItem(ADS_REMOVED_KEY, '1');
}

/**
 * NO ADS 버튼 배선 — 이미 구매했으면 버튼을 없애고 끝. 아직이면 탭 시 결제 플로우를 시작한다.
 * 구매 성공 시 로컬 플래그를 남기고 onRemoved() 로 배너 제거를 호출부(main.ts)에 위임한다
 * (iap.ts 가 ads.ts 를 몰라도 되게 — 순환 참조 방지).
 */
export async function initNoAdsButton(onRemoved: () => void): Promise<void> {
  const btn = document.getElementById(NO_ADS_BUTTON_ID);
  if (!btn) return;

  const { iap, ads } = store;

  // 결제도 없고 목업도 금지인 타겟(스토어 제출 빌드) — 눌리지 않는 버튼을 남기지 않는다.
  if (!iap.supported && !ads.allowPlaceholders) {
    btn.remove();
    return;
  }

  // 과금은 됐는데 지급완료 통보를 못 보낸 주문 복구.
  if (await iap.restorePending(REMOVE_ADS_SKU)) markAdsRemoved();

  if (isAdsRemoved()) {
    btn.remove();
    onRemoved();
    return;
  }

  btn.hidden = false;
  btn.addEventListener('click', () => {
    btn.setAttribute('disabled', 'true'); // 연타 방지 — 어느 결과든 아래서 다시 풀어준다.
    void iap.purchase(REMOVE_ADS_SKU).then((result) => {
      switch (result) {
        case 'granted':
          markAdsRemoved();
          btn.remove();
          onRemoved();
          showToast('광고가 제거되었습니다. 감사합니다!');
          return;
        case 'already-owned':
          // 기기 변경·재설치 후 재구매 시도 — 계정 기준으로 이미 소유하고 있어 과금 없이 복구.
          markAdsRemoved();
          btn.remove();
          onRemoved();
          showToast('이미 구매하신 내역을 확인해 복구했습니다.');
          return;
        case 'cancelled':
          // 사용자가 결제창을 스스로 닫음 — 실패 안내 없이 버튼만 복구.
          btn.removeAttribute('disabled');
          return;
        case 'unavailable':
          // 결제 수단이 없는 타겟(웹 등) — "아무 반응이 없다"는 오해를 막는다.
          showToast('토스 앱에서만 결제할 수 있어요. 앱에서 다시 시도해 주세요.');
          btn.removeAttribute('disabled');
          return;
        default:
          showToast('결제를 진행할 수 없습니다. 잠시 후 다시 시도해 주세요.');
          btn.removeAttribute('disabled');
      }
    });
  });
}
