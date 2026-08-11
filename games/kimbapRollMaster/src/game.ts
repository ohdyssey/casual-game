import type { GameModule } from '@casual/core';
import { PlayScene } from './scenes/PlayScene.js';

/**
 * 김밥 롤 마스터(Kimbap Roll Master) GameModule.
 *
 * 장르: 캐주얼 조리 게임. 손님 주문 카드를 판독해 **추가 재료 3개**를 정확히 고르고,
 *       김 놓기 → 밥 펴기 → (기본 재료 자동 배치) → 추가 재료 배치 → 말기(Perfect Roll 게이지)
 *       → 참기름·깨소금(보너스, 생략 가능) → 썰기 → 서빙의 조리 루프를 반복한다.
 *       스테이지가 진행되면 김밥 스타일(일반/누드/미니/굵은/특수)·주문 수·조리 조건이 확장된다.
 *       규칙 상세 = docs/GAME_RULES.md (변경 가능한 기준안).
 *
 * 화면은 에디터(phaser-ui-editor) main.json 을 SSOT 로 렌더(세로 HD 1080×2400 FIT 1:1).
 * 현재는 에셋 디자인 착수 단계라 PlayScene 이 레이아웃 노드가 있으면 그대로 렌더하고,
 * 없으면 화면 구조(주문 카드/조리대/재료 케이스/액션 버튼)를 라벨 플레이스홀더로 그린다.
 *
 * ⚠️ HD(1080×2400) 이므로 코어 720 기반 responsive 헬퍼(coverBackground/fillCoverLayout 등)를
 *    쓰지 않는다(폭을 720 으로 덮어 배경/HUD 가 어긋남). buildLayout 단독 + 순수 FIT.
 * ⚠️ 로딩 화면(makePortalLoading)은 public/loading/{bg,logo,start_on,start_off}.png 준비 후
 *    형제 게임처럼 scenes 앞에 펼쳐 붙인다(TODO). 지금은 곧장 PlayScene 으로 부팅.
 */
export const KimbapRollGame: GameModule = {
  id: 'kimbaproll',
  title: '김밥 롤 마스터',
  // TODO(로딩 에셋 준비 후): scenes 앞에 makePortalLoading({ startScene: 'play', ... }) 를 펼쳐 넣기.
  scenes: [PlayScene],
  backgroundColor: '#241610',
  designWidth: 1080,
  designHeight: 2400,
  theme: { brand: '#F08A2C' },
  // 본편 준비되면 코어가 소비할 메타(현재 셸 P1 이라 게임-로컬 구현; 선언만 남겨둠).
  hud: { coins: true, combo: true, timer: true },
};
