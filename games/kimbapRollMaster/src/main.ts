/** 김밥 롤 마스터 진입점 — 글꼴을 먼저 받아 둔 뒤 코어 셸에 GameModule 을 넘겨 부팅. */
import { createCasualGame } from '@casual/core';
import { preloadKoreanFonts } from './assets.js';
import { KimbapRollGame } from './game.js';

// ⚠️ 순서가 곧 버그다 — 캔버스 텍스트는 **만들어지는 순간의 글꼴로 굳는다.**
//    씬을 먼저 켜면 Jua 가 뒤늦게 도착해도 이미 그려진 글자는 시스템 고딕인 채로 남는다.
void preloadKoreanFonts().then(() => createCasualGame(KimbapRollGame));
