import type { GameModule } from '@casual/core';
import { PlayScene } from './scenes/PlayScene.js';

/**
 * SoccerGO GameModule — 프리킥/페널티킥 슛 대결.
 *
 * 장르: 홈런팝과 같은 "한 방 액션 판정" 구조(투구 대신 프리킥) — 수비벽+골키퍼를 향해
 *       슬링샷처럼 공을 당겼다 놓으면 발사, 판정(logic/judge)에 따라 골/선방/벽맞음/포스트/
 *       빗나감으로 갈리고 슛 방향으로 카메라가 줌인한다. 입력 메커닉은 Archery/SoccerFlick 의
 *       드래그(당김-반대발사) 조준을 따른다.
 *
 * 화면은 에디터(phaser-ui-editor) main.json 을 SSOT 로 렌더 예정(1080×2400 세로 HD).
 * 현재는 에셋 디자인 착수 전이라 PlayScene 이 레이아웃 있으면 렌더하고, 없으면 필드/공/
 * 수비벽/골키퍼를 Graphics 플레이스홀더로 그려 코어 게임플레이 구조를 그대로 검증한다.
 *
 * ⚠️ 로딩 화면(makePortalLoading)은 public/loading/{bg,logo,start_on,start_off}.png 가 준비되면
 *    형제 게임처럼 scenes 앞에 펼쳐 붙인다. 지금은 곧장 PlayScene 으로 부팅(Pickmeup 패턴).
 */
export const SoccerGoGame: GameModule = {
  id: 'soccergo',
  title: 'SoccerGO',
  scenes: [PlayScene],
  backgroundColor: '#0E3D1F',
  designWidth: 1080,
  designHeight: 2400,
  theme: { brand: '#2EA84F' },
};
