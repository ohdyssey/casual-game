/** SoccerGO 진입점 — 코어 셸에 GameModule 을 넘겨 부팅. */
import { createCasualGame } from '@casual/core';
import { SoccerGoGame } from './game.js';
import { resolveShot } from './logic/judge.js';

const gamePromise = createCasualGame(SoccerGoGame);

// DEV 노브: 콘솔에서 판정 로직 점검 + 헤드리스 검증용.
if (import.meta.env?.DEV) {
  const g = globalThis as Record<string, unknown>;
  g.__resolveShot = resolveShot;
  void gamePromise.then((game) => {
    g.__game = game;
  });
}
