/** 홈런팝 진입점 — 코어 셸에 GameModule 을 넘겨 부팅. */
import { createCasualGame } from '@casual/core';
import { HomerunGame } from './game.js';
import { resolveSwing, resolveTake } from './logic/judge.js';

void createCasualGame(HomerunGame);

// DEV 노브: 콘솔에서 판정 로직 점검용.
if (import.meta.env?.DEV) {
  const g = globalThis as Record<string, unknown>;
  g.__resolveSwing = resolveSwing;
  g.__resolveTake = resolveTake;
}
