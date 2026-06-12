import { createCasualGame } from '@casual/core';
import { DragonBeatGame } from './game.js';
import { nearestBeat, resolveStroke } from './logic/judge.js';
import { raceConfig } from './logic/race.js';

void createCasualGame(DragonBeatGame);

// DEV 전용 콘솔 노브 — 판정/밸런스 튜닝, 자동화 검증용.
if (import.meta.env?.DEV) {
  const g = globalThis as Record<string, unknown>;
  g.__resolveStroke = resolveStroke;
  g.__nearestBeat = nearestBeat;
  g.__raceConfig = raceConfig;
}
