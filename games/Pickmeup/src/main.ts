/** 픽미업 진입점 — 코어 셸에 GameModule 을 넘겨 부팅. */
import { createCasualGame } from '@casual/core';
import { PickmeupGame } from './game.js';

void createCasualGame(PickmeupGame);
