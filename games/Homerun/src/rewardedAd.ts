/**
 * 토스 전면/보상형 광고 — loadFullScreenAd → showFullScreenAd. 두 광고 형식은 **동일 API**를
 * adGroupId 로만 구분한다(앱인토스 개발자센터 문서 실측: "load → show → (다음 load)" 순서,
 * 보상형 테스트 adGroupId = ait-ad-test-rewarded-id).
 *
 * 결과화면 "광고보고 경기하기"(사용자 요청: "결과화면을 리워드 광고 및 리그경기비용과 결합") —
 * 코인 없이 광고 시청만으로 재도전하는 경로. ads.ts(배너)와 달리 이 파일은 전면 콘텐츠라 매
 * 호출마다 load→show 를 새로 연다(배너처럼 한 번 붙여두고 재사용하지 않는다).
 *
 * ⚠️ 보상은 반드시 'userEarnedReward' 이벤트에서만 지급한다 — 'dismissed'(그냥 닫힘)에서 주면
 * 광고를 안 보고 나가도 보상을 받는 우회가 생긴다(토스 광고 정책 위반이기도 하다).
 *
 * ⚠️ 실 토스 앱 웹뷰 밖(로컬 개발 서버·일반 브라우저)에는 네이티브 브릿지가 없어 isSupported() 가
 * false다 — 개발 중에도 버튼 흐름을 눈으로 확인할 수 있도록, 그 경우엔 실제로 MOCK_AD_SECONDS 초를
 * 기다리는 목업 오버레이로 대체한다(ads.ts 의 배너 목업과 같은 취지: 광고인 척하지 않고 "TEST AD"로
 * 명시).
 */
import Phaser from 'phaser';
import { FONT } from '@casual/core';
import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';

/** 콘솔에서 발급받은 보상형 광고 그룹 ID. 개발 중엔 반드시 테스트 ID만 사용(실 ID 사용 시 정책 위반). */
const REWARDED_AD_GROUP_ID = import.meta.env.DEV ? 'ait-ad-test-rewarded-id' : 'TODO_REPLACE_WITH_REAL_REWARDED_AD_GROUP_ID';

/** 목업 대기 시간(초) — 결과화면 버튼에 적힌 "15초" 예상 시청시간과 같은 값을 쓴다(바인딩용으로 export). */
export const MOCK_AD_SECONDS = 15;

export interface RewardedAdCallbacks {
  /** 광고 시청 완료(userEarnedReward) 시에만 호출 — 여기서 실제 보상(무료 재도전 등)을 준다. */
  readonly onReward: () => void;
  /** 광고를 못 열었거나(네트워크 등) 보상 없이 닫힌 경우. */
  readonly onUnavailable?: () => void;
}

/** 실 토스 앱에서 보상형 광고를 불러와 보여준다. */
function playRealRewardedAd(callbacks: RewardedAdCallbacks): void {
  let earned = false;
  let cleanupShow: () => void = () => {};
  const cleanupLoad = loadFullScreenAd({
    options: { adGroupId: REWARDED_AD_GROUP_ID },
    onEvent: (event) => {
      if (event.type !== 'loaded') return;
      cleanupLoad();
      cleanupShow = showFullScreenAd({
        options: { adGroupId: REWARDED_AD_GROUP_ID },
        onEvent: (showEvent) => {
          if (showEvent.type === 'userEarnedReward') {
            earned = true;
            callbacks.onReward();
          } else if (showEvent.type === 'dismissed') {
            cleanupShow();
            if (!earned) callbacks.onUnavailable?.();
          } else if (showEvent.type === 'failedToShow') {
            cleanupShow();
            callbacks.onUnavailable?.();
          }
        },
        onError: () => {
          cleanupShow();
          callbacks.onUnavailable?.();
        },
      });
    },
    onError: () => callbacks.onUnavailable?.(),
  });
}

/** 개발 서버/일반 브라우저용 — 실제로 MOCK_AD_SECONDS 초를 기다리게 해 버튼 흐름만 확인시킨다. */
function playMockRewardedAd(scene: Phaser.Scene, callbacks: RewardedAdCallbacks): void {
  const w = scene.scale.width;
  const h = scene.scale.height;
  const overlay = scene.add.container(0, 0).setDepth(20000);
  const dim = scene.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.88).setInteractive();
  const badge = scene.add
    .text(w / 2, h * 0.42, 'TEST AD', { fontFamily: FONT.family, fontSize: '30px', color: '#ffd500' })
    .setOrigin(0.5);
  const label = scene.add
    .text(w / 2, h * 0.5, `광고 시청 중… ${MOCK_AD_SECONDS}`, { fontFamily: FONT.family, fontSize: '40px', color: '#ffffff' })
    .setOrigin(0.5);
  overlay.add([dim, badge, label]);

  let remain = MOCK_AD_SECONDS;
  scene.time.addEvent({
    delay: 1000,
    repeat: MOCK_AD_SECONDS - 1,
    callback: () => {
      remain -= 1;
      label.setText(`광고 시청 중… ${remain}`);
      if (remain <= 0) {
        overlay.destroy();
        callbacks.onReward();
      }
    },
  });
}

/** 결과화면 등에서 호출 — 지원 환경이면 실광고, 아니면 목업으로 자동 폴백한다. */
export function playRewardedAd(scene: Phaser.Scene, callbacks: RewardedAdCallbacks): void {
  try {
    if (showFullScreenAd.isSupported() && loadFullScreenAd.isSupported()) {
      playRealRewardedAd(callbacks);
      return;
    }
  } catch {
    /* isSupported 자체가 예외를 던지는 구버전 환경 — 목업으로 폴백 */
  }
  playMockRewardedAd(scene, callbacks);
}
