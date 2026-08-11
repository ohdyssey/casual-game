/**
 * profilePopup — 프로필/저장 오버레이(사용자 요청: "자신의 프로필과 재화 데이터를 저장할 수 있는
 * 아이콘"). 아바타·보유 코인·현재 리그를 보여 주고 [저장하기]로 스냅샷을 남긴다(logic/profileStore).
 * 상점(shopPopup)과 같은 카드 프레임·팝인 톤으로 통일.
 */
import Phaser from 'phaser';
import { FONT } from '@casual/core';
import { ICON_CLOSE_KEY, ICON_COIN_KEY, ICON_PROFILE_KEY } from '../assets.js';
import { getCoins } from '../logic/economy.js';
import { formatLeagueNumber, getLeagueTier } from '../logic/league.js';
import { formatSavedAt, loadProfileSnapshot, saveProfileSnapshot } from '../logic/profileStore.js';
import { showToast } from '../toast.js';

const W = 1080;
const H = 2400;
const FRAME_KEY = 'up_Homerun_UI_14';
const FRAME_W = 760;
const IN_MS = 240;
const OUT_MS = 180;

/** 프로필 팝업을 연다. */
export function openProfilePopup(scene: Phaser.Scene, opts: { depth?: number } = {}): void {
  const layer = scene.add.container(0, 0).setDepth(opts.depth ?? 4500).setScrollFactor(0);
  const dim = scene.add.rectangle(0, 0, W, H, 0x081226, 0.82).setOrigin(0, 0).setInteractive();
  layer.add(dim);

  const frame = scene.add.container(W / 2, H / 2);
  layer.add(frame);

  let fw = FRAME_W;
  let fh = Math.round((FRAME_W * 759) / 569);
  if (scene.textures.exists(FRAME_KEY)) {
    const img = scene.add.image(0, 0, FRAME_KEY);
    const src = img.texture.getSourceImage() as { width: number; height: number };
    fh = Math.round((fw * src.height) / src.width);
    img.setDisplaySize(fw, fh);
    frame.add(img);
  } else {
    frame.add(scene.add.rectangle(0, 0, fw, fh, 0xf4e6c8).setStrokeStyle(6, 0xc8912f));
  }

  frame.add(
    scene.add
      .text(0, -fh * 0.335, '프로필', { fontFamily: FONT.family, fontSize: '52px', color: '#ffffff' })
      .setStroke('#0a2540', 8)
      .setOrigin(0.5),
  );

  // 아바타 — 본문 상단 중앙.
  if (scene.textures.exists(ICON_PROFILE_KEY)) {
    const avatar = scene.add.image(0, -fh * 0.115, ICON_PROFILE_KEY).setDisplaySize(190, 190);
    frame.add(avatar);
  }

  // 보유 코인 + 현재 리그 — 아바타 아래 두 줄.
  const infoY = fh * 0.045;
  if (scene.textures.exists(ICON_COIN_KEY)) frame.add(scene.add.image(-140, infoY, ICON_COIN_KEY).setDisplaySize(52, 52));
  frame.add(
    scene.add
      .text(-100, infoY, formatLeagueNumber(getCoins()), { fontFamily: FONT.family, fontSize: '42px', color: '#5a3210' })
      .setOrigin(0, 0.5),
  );
  frame.add(
    scene.add
      .text(0, infoY + 66, getLeagueTier().label, { fontFamily: FONT.family, fontSize: '32px', color: '#7b5a2e' })
      .setOrigin(0.5),
  );

  // 마지막 저장 시각 — 저장하면 즉시 갱신된다.
  const last = loadProfileSnapshot();
  const savedText = scene.add
    .text(0, fh * 0.155, last ? `마지막 저장 ${formatSavedAt(last.savedAt)}` : '저장 기록 없음', {
      fontFamily: FONT.family,
      fontSize: '26px',
      color: '#8a7150',
    })
    .setOrigin(0.5);
  frame.add(savedText);

  // [저장하기] — 프로필+재화 스냅샷.
  const btnY = fh * 0.265;
  const btn = scene.add.rectangle(0, btnY, fw * 0.56, 96, 0x2e9e46).setStrokeStyle(4, 0xffffff, 0.85);
  btn.setInteractive({ useHandCursor: true });
  const btnLabel = scene.add
    .text(0, btnY, '저장하기', { fontFamily: FONT.family, fontSize: '38px', color: '#ffffff' })
    .setOrigin(0.5);
  btn.on('pointerdown', () => {
    btn.setScale(0.97);
    btnLabel.setScale(0.97);
  });
  btn.on('pointerout', () => {
    btn.setScale(1);
    btnLabel.setScale(1);
  });
  btn.on('pointerup', () => {
    btn.setScale(1);
    btnLabel.setScale(1);
    const ok = saveProfileSnapshot({ coins: getCoins(), leagueId: getLeagueTier().id });
    if (ok) {
      const snap = loadProfileSnapshot();
      if (snap) savedText.setText(`마지막 저장 ${formatSavedAt(snap.savedAt)}`);
      showToast('프로필과 재화가 저장되었습니다');
    } else {
      showToast('저장에 실패했습니다 — 브라우저 저장소를 확인해 주세요');
    }
  });
  frame.add(btn);
  frame.add(btnLabel);

  // 닫기.
  let closing = false;
  const close = (): void => {
    if (closing) return;
    closing = true;
    scene.tweens.add({ targets: [frame, dim], alpha: 0, scale: 0.92, duration: OUT_MS, ease: 'Cubic.easeIn', onComplete: () => layer.destroy() });
  };
  const closeBtn = scene.textures.exists(ICON_CLOSE_KEY)
    ? scene.add.image(fw / 2 - 24, -fh / 2 + 24, ICON_CLOSE_KEY).setDisplaySize(80, 80)
    : scene.add.text(fw / 2 - 24, -fh / 2 + 24, '✕', { fontFamily: FONT.family, fontSize: '48px', color: '#ffffff' }).setOrigin(0.5);
  closeBtn.setInteractive({ useHandCursor: true });
  closeBtn.on('pointerup', close);
  frame.add(closeBtn);
  dim.on('pointerup', close);

  frame.setScale(0.85).setAlpha(0);
  dim.setAlpha(0);
  scene.tweens.add({ targets: dim, alpha: 1, duration: IN_MS });
  scene.tweens.add({ targets: frame, alpha: 1, scale: 1, duration: IN_MS, ease: 'Back.easeOut' });
}
