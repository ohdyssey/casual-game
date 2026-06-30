import type { GameModule } from '@casual/core';
import { PlayScene, DESIGN_W, DESIGN_H } from './scenes/PlayScene.js';
import { LoadScene } from './scenes/LoadScene.js';
import { LobbyScene } from './scenes/LobbyScene.js';
import { Stage1Scene } from './scenes/Stage1Scene.js';
import { HammerFxScene } from './scenes/HammerFxScene.js';
import { HotelScene } from './scenes/HotelScene.js';

/**
 * MATCHSLOT CITY(내부 id: socialcasino) GameModule — 퍼즐 + 슬롯 하이브리드 소셜 게임.
 *
 * 장르: "MATCH = 1 SPIN". 하단 매치-3 보드에서 3개 이상 매치를 만들면 스핀이 적립되고,
 *       상단 5×3 슬롯릴을 돌려(레버) 코인·잭팟을 노린다. 매치가 스핀의 연료, 슬롯이 보상 루프.
 *       소셜: TOP SPINNERS 랭킹 · INVITE · 잭팟 게이지(N매치마다 해금). 베팅 금액으로 배당 조절.
 *       파워업: 망치(단일제거) · 로우블래스트(가로줄) · 스왑 · 컬러밤.
 *
 * 화면은 에디터(phaser-ui-editor)를 SSOT 로 렌더(1080×2400 HD 세로 FIT — 슬롯+배너+매치보드+
 *   파워업+베팅 5단 밀도 때문에 형제 ZombieArrow/Logistics 와 동일한 HD 세로 프레임 채택).
 *   에셋 디자인 착수 단계라 PlayScene 이 레이아웃이 있으면 렌더하고, 없으면 "에셋 디자인 대기"
 *   플레이스홀더(영역 라벨)를 그린다.
 *
 * 로딩 화면은 디자이너가 에디터에서 저작한 ui/layouts/splash.json("게임로딩")을 SSOT 로 LoadScene
 *   이 렌더한다(진행바·상태문구는 실제 에셋 로더 진행률에 연동). 코어 공용 makePortalLoading
 *   (public/loading/*.png 고정 레이아웃) 대신 게임 전용 에디터 디자인을 쓴다.
 */
export const SocialCasinoGame: GameModule = {
  id: 'socialcasino', // ⚠️ 내부 식별자/라우트/포트 키 — 표시명만 MATCHSLOT CITY 로 변경(id 는 유지)
  title: 'MATCHSLOT CITY',
  // 로딩(게임로딩) → 로비(단일 이미지) → PLAY → 게임(play). 첫 씬이 자동 부팅되므로 LoadScene 을 맨 앞에 둔다.
  //   Stage1Scene(공격/약탈 결과)·HammerFxScene(망치 임팩트 연출)은 PlayScene 위에 띄우는 오버레이라 **맨 뒤**.
  //   HammerFxScene 은 update 마다 bringToTop 해 Stage1 위까지 떠서 회전(스테이지 위에서 축소·소멸).
  scenes: [LoadScene, LobbyScene, PlayScene, Stage1Scene, HammerFxScene, HotelScene],
  backgroundColor: '#1A1030',
  designWidth: DESIGN_W, // 1080 — 에디터 SSOT(HD 세로)와 캔버스 1:1 매칭(GAME_WIDTH 720 override)
  designHeight: DESIGN_H, // 2400 — 슬롯/배너/매치보드/파워업/베팅 5단 세로 스택
  theme: { brand: '#9B5DE5' },
  // 본편 준비되면 코어가 소비할 메타(현재 셸 P1 이라 게임-로컬 구현; 선언만 남겨둠).
  hud: { coins: true, lives: true }, // 코인 잔고 + 에너지(5/5)
  liveops: { shop: true, spin: true, daily: true },
  powerups: ['hammer', 'rowBlast', 'swap', 'colorBomb'],
  // ⚠️ 테스트 단계: 첫 탭 풀스크린 진입/뒤로가기 가드 끔(창모드 유지). 출시 시 제거 검토.
  backGuard: false,
};
