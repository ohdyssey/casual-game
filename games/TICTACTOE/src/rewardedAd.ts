/**
 * 전면/보상형 광고 — **호스트 층**. 광고 SDK 호출은 빌드 타겟별 어댑터(`@store`)가 맡고,
 * 여기서는 결과를 게임 흐름으로 옮기고 목업 오버레이를 그리는 일만 한다.
 *
 * ⚠️ 보상은 어댑터가 `'rewarded'` 를 돌려줄 때만 지급한다 — 그냥 닫힘(`'closed'`)에 주면
 *    광고를 안 보고 나가도 보상을 받는 우회가 생긴다(광고 정책 위반이기도 하다).
 * ⚠️ 광고를 못 띄운 경우에도 반드시 콜백을 부른다 — 우리 쪽 실패로 사용자를 가두지 않는다.
 * ⚠️ 목업 오버레이는 `allowPlaceholders` 인 타겟(web·toss dev)에서만 그린다.
 *    스토어 제출 빌드에서 "TEST AD" 화면이 나오면 반려 사유가 된다.
 */
import Phaser from 'phaser';
import store from '@store';
import { playSfx } from './audio.js';

/** 목업 대기 시간(초) — 버튼 라벨에 적을 예상 시청시간과 같은 값을 쓴다. */
export const MOCK_AD_SECONDS = 15;
/** 관문 광고 목업 대기(초) — 전면광고는 짧다. 광고 없는 환경에서 흐름만 확인하는 용도. */
const MOCK_GATE_SECONDS = 5;

export interface RewardedAdCallbacks {
  /** 시청 완료 시에만 호출 — 여기서 실제 보상(무료 재도전 등)을 준다. */
  readonly onReward: () => void;
  /** 광고를 못 열었거나 보상 없이 닫힌 경우. */
  readonly onUnavailable?: () => void;
}

/** 개발 서버/광고 없는 환경용 — 실제로 초를 세어 버튼 흐름만 확인시킨다. */
function playMockAd(scene: Phaser.Scene, seconds: number, onDone: () => void): void {
  const w = scene.scale.width;
  const h = scene.scale.height;
  const font = 'Jua, sans-serif';
  const overlay = scene.add.container(0, 0).setDepth(20000);
  const dim = scene.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.88).setInteractive();
  const badge = scene.add
    .text(w / 2, h * 0.42, 'TEST AD', { fontFamily: font, fontSize: '36px', color: '#FFD54D' })
    .setOrigin(0.5);
  const label = scene.add
    .text(w / 2, h * 0.5, `광고 시청 중… ${seconds}`, {
      fontFamily: font,
      fontSize: '48px',
      color: '#FFFFFF',
    })
    .setOrigin(0.5);
  overlay.add([dim, badge, label]);

  let remain = seconds;
  scene.time.addEvent({
    delay: 1000,
    repeat: seconds - 1,
    callback: () => {
      remain -= 1;
      if (label.active) label.setText(`광고 시청 중… ${remain}`);
      if (remain <= 0) {
        overlay.destroy();
        onDone();
      }
    },
  });
}

/**
 * **관문(전면) 광고** — 보상을 주는 광고가 아니라 "다음 판으로 가기 전에 한 번 본다".
 *
 * ⚠️ 보상형과 결정적으로 다른 점: 콜백이 **광고가 닫힌 시점**에 온다. 시청 도중에 게임을
 *    시작해 버리면 광고에 가려진 채 턴 제한시간이 흘러 그 판을 시간초과로 지게 된다.
 */
export function playGateAd(scene: Phaser.Scene, onClosed: () => void): void {
  const { ads } = store;
  void ads.showFullscreen('interstitial').then((result) => {
    if (result !== 'unavailable') {
      onClosed(); // 봤든 그냥 닫았든 다음 판으로 보낸다
      return;
    }
    if (ads.allowPlaceholders) {
      playMockAd(scene, MOCK_GATE_SECONDS, onClosed);
      return;
    }
    onClosed(); // 광고가 아예 없는 타겟 — 기다리게 하지 않고 그대로 통과
  });
}

/** 보상형 광고 — 끝까지 본 경우에만 `onReward`. */
export function playRewardedAd(scene: Phaser.Scene, cb: RewardedAdCallbacks): void {
  const { ads } = store;
  playSfx('ad_open');
  /** 보상 지급음 — 지급 경로가 둘(실광고·목업)이라 한 군데로 모은다. */
  const reward = (): void => {
    playSfx('ad_reward');
    cb.onReward();
  };
  void ads.showFullscreen('rewarded').then((result) => {
    if (result === 'rewarded') {
      reward();
      return;
    }
    if (result === 'closed') {
      cb.onUnavailable?.(); // 광고는 떴지만 보상 조건 미충족
      return;
    }
    if (ads.allowPlaceholders) {
      playMockAd(scene, MOCK_AD_SECONDS, reward);
      return;
    }
    cb.onUnavailable?.();
  });
}
