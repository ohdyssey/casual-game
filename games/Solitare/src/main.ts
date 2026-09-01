/** 솔리테어 하이츠 진입점 — 코어 셸에 GameModule 을 넘겨 부팅. */
import { createCasualGame } from '@casual/core';
import { SolitaireGame } from './game.js';
import type Phaser from 'phaser';
import { installTextureUsage } from './ui/textureUsage.js';
import { preloadAstcTable, deferredRemaining } from './assets.js';

// **ASTC 표를 먼저**(assets.preloadAstcTable) — 조립본에만 있는 `ui-assets-astc.json`. 없으면(개발) 빈 표로 곧장 진행.
const booted = preloadAstcTable().then(() => createCasualGame(SolitaireGame));

// **QA 훅(dev 전용)** — 헤드리스 회귀(scripts/qa-play-regression.mjs)가 씬을 직접 잡아 시뮬을 돌린다.
//   번들에 Phaser 전역이 없어 브라우저에서 게임 인스턴스에 닿을 방법이 이것뿐이다. 배포 빌드에서는 제거된다.
if (import.meta.env.DEV) {
  void Promise.resolve(booted).then((game) => {
    (window as unknown as { __PHASER_GAME__?: unknown }).__PHASER_GAME__ = game;
    // **표시 크기 계측**(`?measureTextures=1`) — 배포 다이어트의 리사이즈 상한을 자동으로 뽑기 위한
    //   측정기. 쿼리가 없으면 아무것도 하지 않는다. 수집은 scripts/measure-textures.mjs.
    void installTextureUsage(game as Phaser.Game);
    (window as unknown as { __deferredRemaining?: unknown }).__deferredRemaining = deferredRemaining; // 회귀 진단(dev).
  });
}
