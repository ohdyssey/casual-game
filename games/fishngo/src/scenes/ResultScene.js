/**
 * ResultScene — 매치 결과 화면.
 *
 * 새 자산 (사용자 요청):
 *   bg_result        : 수직 산호초 배경 (cover)
 *   result_header    : RESULT 헤더 + FINAL SCORE 박스 (숫자/마릿수/거리보너스 라벨 포함)
 *   result_breakdown : SCORE BREAKDOWN 박스 (Fish Caught / Distance Bonus 라벨 포함)
 *   result_rewards   : REWARDS 박스 (코인/XP/다이아 아이콘 포함)
 *   btn_home         : HOME 버튼 (녹색)
 *   btn_play_again   : PLAY AGAIN 버튼 (빨강)
 *
 * 자산에 baked-in 된 텍스트/아이콘 위에 동적 숫자만 overlay.
 */

import Phaser from 'phaser';
import { COLORS, FONT } from '../config/game.config.js';
import { strokeText, centerInBox } from '../ui/components.js';
import { placeContained, placeByWidth, getDisplayBounds } from '../ui/scale.js';
import { smoothStart } from '../systems/sceneTransition.js';

export class ResultScene extends Phaser.Scene {
  constructor() { super('ResultScene'); }

  init(data) {
    this.score      = data?.score      ?? 0;
    this.catches    = data?.catches    ?? 0;
    this.caughtList = data?.caughtList ?? [];
    // 직전 매치의 location id 보존 — PLAY AGAIN 시 동일 낚시터로 복귀
    this.location   = data?.location   ?? 'beach';
    this.mode       = data?.mode       ?? 'user2';
    // 거리 보너스 — 잡은 마릿수당 +15 (단순 룰)
    this.distanceBonus = this.catches * 15;
  }

  create() {
    // 반응형: 실제 캔버스 폭/높이 (사용자 요청 — 중앙 정렬)
    const W = this.scale.width;
    const H = this.scale.height;

    // ─── 배경 (cover) ───
    if (this.textures.exists('bg_result')) {
      const bg = this.add.image(W / 2, H / 2, 'bg_result');
      bg.setOrigin(0.5);
      const tex = bg.texture.getSourceImage();
      const s = Math.max(W / tex.width, H / tex.height);
      bg.setScale(s);
      bg.setDepth(0);
    } else {
      // fallback: 단색
      this.cameras.main.setBackgroundColor('#1a3da6');
    }

    // ─── RESULT 헤더 + FINAL SCORE 박스 (UI_31) ───
    // 박스 폭 축소: 620 → 460 (사용자 요청 — 너무 크지 않게)
    // 전체 콘텐츠가 수직 중앙 + 약간 아래 배치되도록 top margin 165px (이전 60).
    const boxW = 460;
    const TOP_MARGIN = 165;
    const header = placeByWidth(this, 'result_header', W / 2, 0, boxW, { maxScale: 1.6 });
    const headerH = header.displayHeight;
    header.y = TOP_MARGIN + headerH / 2;
    header.setDepth(10);

    // 헤더 박스 위 숫자 overlay
    //   자산(305×243) 픽셀 측정 기반 정확한 위치:
    //   - "FINAL SCORE" 라벨 center y=84 (35%) → 점수 숫자는 그 아래 laurel center y=132 (54%)
    //   - "FISH CAUGHT:" 라벨 center y=189 (78%), 라벨 x=61..195 → 우측 빈 공간 center x=245 (80%)
    //   - "DISTANCE BONUS" 라벨 center y=216 (89%)
    const hb = getDisplayBounds(header);
    // 최종 점수 — laurel 중앙에 노란 큰 숫자, 자산 가로 중심에 맞춤
    const scoreText = strokeText(this, hb.left + hb.w * 0.493,
      hb.top + hb.h * 0.54,
      `${this.score}`,
      Math.round(hb.h * 0.22),
      { color: '#ffd147', strokeColor: '#0a2540', strokeWidth: 4 });
    centerInBox(scoreText, 0.5);
    scoreText.setDepth(11);

    // FISH CAUGHT: 숫자 — 라벨 우측 빈공간 중앙 (x=80%, y=78%)
    const fishCaughtNum = strokeText(this,
      hb.left + hb.w * 0.80,
      hb.top + hb.h * 0.78,
      `${this.catches}`,
      Math.round(hb.h * 0.09),
      { color: '#ffd147', strokeColor: '#0a2540', strokeWidth: 3 });
    centerInBox(fishCaughtNum, 0.5);
    fishCaughtNum.setDepth(11);

    // DISTANCE BONUS +N — 라벨 우측 빈공간 중앙 (x=80%, y=89%)
    const distNum = strokeText(this,
      hb.left + hb.w * 0.80,
      hb.top + hb.h * 0.89,
      `+${this.distanceBonus}`,
      Math.round(hb.h * 0.08),
      { color: '#ffd147', strokeColor: '#0a2540', strokeWidth: 3 });
    centerInBox(distNum, 0.5);
    distNum.setDepth(11);

    // ─── SCORE BREAKDOWN (UI_32) ───
    const breakdown = placeByWidth(this, 'result_breakdown',
      W / 2, 0, boxW, { maxScale: 1.6 });
    breakdown.y = hb.bottom + 18 + breakdown.displayHeight / 2;
    breakdown.setDepth(10);
    const bb = getDisplayBounds(breakdown);

    // breakdown 자산(305×117) 측정: Fish Caught 라벨 center y=46 (39%), Distance Bonus y=84 (72%)
    // "Fish Caught" 행 우측 — y=39% 라벨 중심에 정렬
    const fcRow = strokeText(this,
      bb.left + bb.w * 0.93,
      bb.top + bb.h * 0.39,
      `${this.score - this.distanceBonus}`,
      Math.round(bb.h * 0.18),
      { color: '#ffd147', strokeColor: '#0a2540', strokeWidth: 3 });
    centerInBox(fcRow, 1);
    fcRow.setDepth(11);

    // "Distance Bonus" 행 우측 — y=72% 라벨 중심
    const dbRow = strokeText(this,
      bb.left + bb.w * 0.93,
      bb.top + bb.h * 0.72,
      `+${this.distanceBonus}`,
      Math.round(bb.h * 0.18),
      { color: '#ffd147', strokeColor: '#0a2540', strokeWidth: 3 });
    centerInBox(dbRow, 1);
    dbRow.setDepth(11);

    // ─── REWARDS (UI_33) ───
    const rewards = placeByWidth(this, 'result_rewards',
      W / 2, 0, boxW, { maxScale: 1.6 });
    rewards.y = bb.bottom + 18 + rewards.displayHeight / 2;
    rewards.setDepth(10);
    const rb = getDisplayBounds(rewards);

    const rewardYRel = 0.80;
    const coinAmt = this.score;
    const xpAmt   = Math.round(this.score / 5);
    const gemAmt  = Math.max(0, Math.floor(this.catches / 5));

    [
      { x: 0.22, text: `x${coinAmt}` },
      { x: 0.50, text: `x${xpAmt}` },
      { x: 0.78, text: `x${gemAmt}` },
    ].forEach((r) => {
      const t = strokeText(this,
        rb.left + rb.w * r.x,
        rb.top + rb.h * rewardYRel,
        r.text,
        Math.round(rb.h * 0.13),
        { color: '#ffffff', strokeColor: '#0a2540', strokeWidth: 3 });
      centerInBox(t, 0.5);
      t.setDepth(11);
    });

    // ─── HOME / PLAY AGAIN 버튼 (사이즈 줄임) ───
    const btnW = 220;
    const btnGap = 16;
    const btnY = rb.bottom + 28;
    const homeCx = W / 2 - btnW / 2 - btnGap / 2;
    const paCx   = W / 2 + btnW / 2 + btnGap / 2;

    const home = placeByWidth(this, 'btn_home', homeCx, btnY, btnW, { maxScale: 1.8 });
    home.y = btnY + home.displayHeight / 2;
    home.setDepth(10);
    this._makeClickable(home, () => smoothStart(this, 'HomeScene'));

    const pa = placeByWidth(this, 'btn_play_again', paCx, btnY, btnW, { maxScale: 1.8 });
    pa.y = btnY + pa.displayHeight / 2;
    pa.setDepth(10);
    // PLAY AGAIN — 같은 낚시터로 복귀. LocationLoaderScene 을 경유해 자산 보장.
    this._makeClickable(pa, () => this.scene.start('LocationLoaderScene', {
      locId: this.location, mode: this.mode, targetScene: 'FishingScene',
    }));

    // ESC = HOME
    this.input.keyboard?.on('keydown-ESC', () => smoothStart(this, 'HomeScene'));
  }

  _makeClickable(img, onClick) {
    img.setInteractive({ useHandCursor: true });
    img.on('pointerdown', () => {
      this.tweens.add({ targets: img, scale: img.scale * 0.94, yoyo: true, duration: 90,
        onComplete: () => onClick?.() });
    });
  }
}
