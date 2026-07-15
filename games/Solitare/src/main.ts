/** 솔리테어 하이츠 진입점 — 코어 셸에 GameModule 을 넘겨 부팅. */
import { createCasualGame } from '@casual/core';
import { SolitaireGame } from './game.js';

void createCasualGame(SolitaireGame);
