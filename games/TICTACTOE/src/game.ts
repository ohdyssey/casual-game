import type { GameModule } from '@casual/core';
import { makePortalLoading } from '@casual/core';
import { MatchScene } from './scenes/MatchScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { hasHubExit } from './shell.js';
import { PlayScene } from './scenes/PlayScene.js';
import { loadGameAssets, preloadKoreanFonts } from './assets.js';
import { preloadSfx } from './audio.js';

/**
 * 틱택토 네온 GameModule — Load→Menu→(Match)→Play.
 *
 * Menu(게임 선택)는 에디터 저작 화면(`public/ui/layouts/main.json`)이다 —
 * AI 스터디 / 싱글플레이 / 대전플레이 중에서 골라 들어간다.
 * 대전플레이는 Match(매칭 화면)를 거친다 — 현재 상대는 **가상 유저(봇)** 이고,
 * 실유저 대전 서버가 붙으면 매칭 호출만 교체하면 된다.
 * 로딩 화면은 자체 START 버튼 없이 메뉴로 바로 넘긴다(선택은 메뉴에서 한 번만).
 *
 * 게임 1(vs 컴퓨터): "3개 말 순환 이동" 변형 틱택토.
 *  · 각자 말 3개 — 4번째 차례부턴 가장 오래된 말을 빈 칸으로 이동
 *  · 말 나이에 따라 15%씩 반투명(가장 오래된 말 = 30% = 다음 이동 대상 예고)
 *  · 턴당 20초 제한 — 시간초과 시 즉시 패배
 *  · 승패는 **3목 또는 시간초과**로만 갈린다(버티기 승리는 2026-08-05 폐지)
 *  · 싱글 AI 등급 30단계 — Lv.11+ 선공 교차, Lv.21+ 턴 제한시간 1초씩 감소(Lv.30 = 10초)
 *
 * 배경 아트(841×1870, 보드 내장)를 세로 HD 1080×2400 고정 캔버스에 cover 로 깐다
 * (비율이 사실상 동일해 크롭 없음). 보드 셀 좌표는 배경 원본 좌표계 기준.
 */
export const TicTacToeGame: GameModule = {
  id: 'tictactoe',
  title: '틱택토 네온',
  scenes: [
    ...makePortalLoading({
      startScene: 'menu',
      hasLogo: false, // 배경 자체에 TIC.TAC.TOE 네온 로고가 있다
      barColor: 0x27c4ff,
      autoAdvance: true, // 메뉴 화면이 곧 타이틀 — 로딩 START 버튼과 겹치지 않게
      // 로딩바는 **홈런팝과 같은 모양**으로 통일한다(유저 확정 2400 기준 수치 그대로):
      // 바닥에서 위로 올린 두꺼운 바 + 진행률 %를 바 한가운데 볼드로 얹는다.
      barY: 1930,
      barHeight: 78,
      barWidth: 460,
      barPctPosition: 'center',
      barPctFontSize: 52,
      barPctBold: true,
      preload: (s) => loadGameAssets(s),
      onLoaded: async () => {
        // 효과음은 배경으로 받는다 — 40개 합쳐 220KB 라 로딩을 붙잡을 이유가 없다.
        preloadSfx();
        await preloadKoreanFonts();
      },
    }),
    MenuScene,
    MatchScene,
    PlayScene,
  ],
  // 코어 셸이 얹는 허브 오버레이(··· / ✕) — 토스 미니앱엔 돌아갈 허브가 없어 끈다.
  hubButton: hasHubExit(),
  backgroundColor: '#0A0714',
  designWidth: 1080,
  designHeight: 2400,
  theme: { brand: '#27C4FF' },
};
