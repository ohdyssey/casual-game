import type { GameModule } from '@casual/core';
import { PlayScene } from './scenes/PlayScene.js';

/**
 * 픽미업(Pick Me Up!) GameModule.
 *
 * 장르: 색 정렬 주차장 퍼즐. 보드에 빽빽이 들어찬 색깔 차량을 탭하면 같은 색 "슬롯"으로 이동 →
 *       슬롯의 버스가 같은 색 승객으로 차면 출발(승객 픽업), 슬롯이 비워진다. 보드를 다 비우면 클리어.
 *       슬롯 수가 제한이라 색을 잘못 쌓으면 막힌다(정렬/계획 퍼즐). 부스터: 슬롯추가·셔플·터보·VIP보드.
 *
 * 화면은 에디터(phaser-ui-editor) main.json 을 SSOT 로 렌더(720×1280 FIT). 현재는 에셋 디자인
 * 착수 단계라 PlayScene 이 레이아웃이 있으면 렌더하고, 없으면 "에셋 디자인 대기" 플레이스홀더를 그린다.
 *
 * ⚠️ 로딩 화면(makePortalLoading)은 public/loading/{bg,logo,start_on,start_off}.png 가 준비되면
 *    형제 게임처럼 scenes 앞에 펼쳐 붙인다(아래 TODO). 지금은 곧장 PlayScene 으로 부팅.
 */
export const PickmeupGame: GameModule = {
  id: 'pickmeup',
  title: '픽미업',
  // TODO(로딩 에셋 준비 후): scenes 앞에 makePortalLoading({ startScene: 'play', preload, onLoaded }) 를 펼쳐 넣기.
  scenes: [PlayScene],
  backgroundColor: '#2a1c12',
  designHeight: 1280,
  theme: { brand: '#E5703A' },
  // 본편 준비되면 코어가 소비할 메타(현재 셸 P1 이라 게임-로컬 구현; 선언만 남겨둠).
  hud: { coins: true, timer: true },
  powerups: ['addSlot', 'shuffle', 'turbo', 'vipBoard'],
};
