/**
 * 토스 인앱결제 — "광고 제거"(NO ADS) 단건 구매. 실제 결제 SDK 사용법은 앱인토스 개발자센터
 * 문서(developers-apps-in-toss.toss.im, documentation/common/monetization/iap/in-app-purchase.md)
 * 실측을 그대로 따른다.
 *
 * 흐름: #no-ads-btn 탭 → IAP.createOneTimePurchaseOrder → processProductGrant(로컬 지급, 여기선
 * localStorage 플래그) → onEvent('success') 에서 completeProductGrant 로 토스 서버에 지급완료 통보.
 * 앱이 중간에 죽는 등으로 completeProductGrant 가 못 불린 주문은 다음 부팅 시
 * getPendingOrders() 로 복구한다(공식 문서의 필수 테스트 시나리오 — "결제 성공/서버 실패").
 *
 * 기기 변경/재설치 복구(사용자 요청): 새 기기에서 NO ADS 를 다시 누르면 토스 서버가 "이미 이
 * 계정으로 구매한 상품"임을 알고 과금 없이 ITEM_ALREADY_OWNED 에러를 준다 — 이걸 성공(복구)으로
 * 처리한다(isAlreadyOwnedError). 서버 없이도 지금 동작한다.
 * ⚠️ 더 적극적인 복구(로그인만 하면 버튼 안 눌러도 자동 복구, appLogin()+getCompletedOrRefundedOrders)는
 * 이번엔 넣지 않았다 — appLogin 은 설치된 SDK(@apps-in-toss/web-framework ^2.10.8)의 공개 export에
 * 없고 3.0.0 부터 노출된다(직접 확인함). 이미 검증된 배너/IAP 연동을 건드리는 메이저 업그레이드라
 * 별도로 검토 후 진행하는 게 안전하다.
 *
 * ⚠️ 가격(2,000원)은 코드가 아니라 앱인토스 콘솔의 상품 등록 화면에서 설정한다 — 여기서는
 * 상품을 sku 문자열로만 참조한다. REMOVE_ADS_SKU 가 실제 콘솔에 등록한 상품 ID와 반드시
 * 일치해야 한다(다르면 IAP.createOneTimePurchaseOrder 가 INVALID_PRODUCT_ID 로 실패).
 */
import { IAP } from '@apps-in-toss/web-framework';
import { showToast } from './toast.js';

/** 콘솔에 등록한 "광고 제거" 상품의 SKU. 실제 등록한 값과 다르면 이 상수만 바꾸면 된다. */
export const REMOVE_ADS_SKU = 'remove_ads';

const ADS_REMOVED_STORAGE_KEY = 'homerun_ads_removed';
const NO_ADS_BUTTON_ID = 'no-ads-btn';

/** 이미 구매했는지 — 로컬 저장값 기준(기기 변경 시 복구는 아래 restorePendingPurchase 참조). */
export function isAdsRemoved(): boolean {
  try {
    return localStorage.getItem(ADS_REMOVED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** IAP 에러 객체에서 code 필드만 안전하게 뽑아낸다 — SDK 가 error 를 unknown 으로만 타입한다. */
function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const c = (error as { code: unknown }).code;
    return typeof c === 'string' ? c : undefined;
  }
  return undefined;
}

function markAdsRemoved(): void {
  try {
    localStorage.setItem(ADS_REMOVED_STORAGE_KEY, '1');
  } catch {
    /* localStorage 사용 불가(사생활 보호 모드 등) — 이번 세션엔 배너 안 붙었으니 치명적이지 않음 */
  }
}

/**
 * 부팅 시 1회 — 결제는 완료됐는데(사용자 과금 O) 앱이 중간에 죽어 completeProductGrant 를
 * 못 부른 주문이 있는지 확인하고 복구한다. 공식 문서가 명시한 필수 테스트 시나리오.
 */
async function restorePendingPurchase(): Promise<void> {
  try {
    const { orders } = await IAP.getPendingOrders();
    const pending = orders.find((o) => o.sku === REMOVE_ADS_SKU);
    if (!pending) return;
    markAdsRemoved();
    await IAP.completeProductGrant({ params: { orderId: pending.orderId } });
  } catch {
    /* 대기 주문 조회/완료 실패 — 다음 부팅 때 다시 시도됨(로컬 플래그는 아직 미설정 상태 유지) */
  }
}

/**
 * NO ADS 버튼 배선 — 이미 구매했으면 버튼 자체를 숨기고 끝. 아직이면 탭 시 결제 플로우 시작.
 * 구매 성공 시 로컬 플래그를 남기고 onRemoved() 콜백으로 배너 제거를 호출부(main.ts)에 위임한다
 * (iap.ts 는 ads.ts 를 몰라도 되게 — 순환 참조 방지).
 */
export async function initNoAdsButton(onRemoved: () => void): Promise<void> {
  const btn = document.getElementById(NO_ADS_BUTTON_ID);
  if (!btn) return;

  await restorePendingPurchase();

  if (isAdsRemoved()) {
    btn.hidden = true;
    onRemoved();
    return;
  }

  btn.hidden = false;
  btn.addEventListener('click', () => {
    btn.setAttribute('disabled', 'true'); // 연타 방지 — 성공/실패 어느 쪽이든 아래서 다시 풀어준다.
    try {
      // 토스 앱 웹뷰 밖(일반 브라우저 등)에선 네이티브 브릿지가 없어 이 호출 자체가 동기적으로
      // 예외를 던질 수 있다 — 버튼 클릭 한 번으로 게임이 안 죽게 방어한다.
      const cleanup = IAP.createOneTimePurchaseOrder({
        options: {
          sku: REMOVE_ADS_SKU,
          processProductGrant: () => {
            // 지급 로직 — "광고 제거"는 로컬 플래그 하나면 충분(서버 검증이 필요한 재화가 아님).
            markAdsRemoved();
            return true;
          },
        },
        onEvent: async (event) => {
          if (event.type === 'success') {
            try {
              await IAP.completeProductGrant({ params: { orderId: event.data.orderId } });
            } catch {
              /* 완료 통보 실패 — 다음 부팅 때 restorePendingPurchase() 가 재시도 */
            }
            btn.hidden = true;
            onRemoved();
            showToast('광고가 제거되었습니다. 감사합니다!');
          }
          cleanup();
        },
        onError: (error) => {
          const code = errorCode(error);
          if (code === 'ITEM_ALREADY_OWNED') {
            // 기기를 바꾸거나 재설치한 뒤 다시 구매를 시도한 경우 — 토스 계정 기준으로는 이미
            // 소유하고 있으므로 과금 없이 그대로 복구한다(사용자 요청: "기기를 바꿔도 구매 내역
            // 복구되도록"). 진짜 Toss 로그인 연동 복구(getCompletedOrRefundedOrders)는 서버(mTLS)가
            // 있어야 가능해 별도 준비가 필요하지만, 이 케이스는 서버 없이도 안전하게 처리된다.
            markAdsRemoved();
            btn.hidden = true;
            onRemoved();
            showToast('이미 구매하신 내역을 확인해 복구했습니다.');
            cleanup();
            return;
          }
          if (code === 'USER_CANCELED') {
            // 사용자가 결제창을 스스로 닫은 경우 — 실패 안내 없이 조용히 버튼만 복구.
            btn.removeAttribute('disabled');
            cleanup();
            return;
          }
          console.error('[iap] remove_ads purchase failed', error);
          showToast('결제를 진행할 수 없습니다. 잠시 후 다시 시도해 주세요.');
          btn.removeAttribute('disabled');
          cleanup();
        },
      });
    } catch (error) {
      // 토스 앱 웹뷰 밖(로컬 개발 서버·일반 브라우저 등)에서는 네이티브 결제 브릿지가 없어
      // 항상 여기로 온다 — "아무 반응이 없다"는 사용자 보고의 원인이라 반드시 화면에 알려야 한다.
      console.error('[iap] createOneTimePurchaseOrder unavailable', error);
      showToast('토스 앱에서만 결제할 수 있어요. 앱에서 다시 시도해 주세요.');
      btn.removeAttribute('disabled');
    }
  });
}
