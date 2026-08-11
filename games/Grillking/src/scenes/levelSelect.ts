/**
 * 레벨 선택 메뉴 — 하단 오른쪽 버튼에서 연다. 열린(플레이 가능) 레벨을 페이지 그리드로 보여주고
 * 탭하면 그 레벨로 시작한다. 잠긴 레벨은 회색(비활성). 현재 레벨은 초록 하이라이트.
 */
import Phaser from 'phaser';
import { sfx } from '../audio.js';

const DEPTH = 2600; // popups(2000)·toast(2500) 위
const FONT = '"Jua", "Do Hyeon", sans-serif';
const COLS = 5;
const ROWS = 6;
const PER_PAGE = COLS * ROWS; // 30

export interface LevelSelectOpts {
  /** 총 레벨 수. */
  readonly maxLevel: number;
  /** 열린 최고 레벨(1..unlocked 플레이 가능). */
  readonly unlocked: number;
  /** 현재 레벨(하이라이트 + 시작 페이지). */
  readonly current: number;
  readonly onPick: (lv: number) => void;
  readonly onClose?: () => void;
}

/** 모달 레벨 선택. 반환된 close() 로 코드에서도 닫을 수 있다. */
export function openLevelSelect(scene: Phaser.Scene, opts: LevelSelectOpts): () => void {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const cx = W / 2;
  const pageCount = Math.max(1, Math.ceil(opts.maxLevel / PER_PAGE));
  let page = Phaser.Math.Clamp(Math.floor((opts.current - 1) / PER_PAGE), 0, pageCount - 1);
  let closed = false;

  const chrome: Phaser.GameObjects.GameObject[] = [];
  let pageObjs: Phaser.GameObjects.GameObject[] = [];

  const close = (): void => {
    if (closed) return;
    closed = true;
    for (const o of pageObjs) o.destroy();
    for (const o of chrome) o.destroy();
    opts.onClose?.();
  };

  const dim = scene.add.rectangle(cx, H / 2, W, H, 0x1a0d06, 0.72).setDepth(DEPTH).setInteractive();
  dim.on('pointerup', () => close());
  chrome.push(dim);

  const panelW = Math.min(W * 0.92, 1000);
  const panelH = Math.min(H * 0.72, 1760);
  const panelLeft = cx - panelW / 2;
  const panelTop = H / 2 - panelH / 2;
  const panel = scene.add.graphics().setDepth(DEPTH + 1);
  panel.fillStyle(0xfff4e0, 1).fillRoundedRect(panelLeft, panelTop, panelW, panelH, 34);
  panel.lineStyle(6, 0x8a4b22, 1).strokeRoundedRect(panelLeft, panelTop, panelW, panelH, 34);
  panel.setInteractive(new Phaser.Geom.Rectangle(panelLeft, panelTop, panelW, panelH), Phaser.Geom.Rectangle.Contains);
  chrome.push(panel);

  chrome.push(
    scene.add.text(cx, panelTop + 50, '레벨 선택', { fontFamily: FONT, fontSize: '46px', color: '#5a2c10' }).setOrigin(0.5).setDepth(DEPTH + 2),
  );
  const xBtn = scene.add
    .text(panelLeft + panelW - 48, panelTop + 44, '✕', { fontFamily: FONT, fontSize: '44px', color: '#8a4b22' })
    .setOrigin(0.5)
    .setDepth(DEPTH + 2)
    .setInteractive({ useHandCursor: true });
  xBtn.on('pointerup', () => close());
  chrome.push(xBtn);

  const gridTop = panelTop + 118;
  const gridBottom = panelTop + panelH - 130;
  const gridLeft = panelLeft + 40;
  const cellW = (panelW - 80) / COLS;
  const cellH = (gridBottom - gridTop) / ROWS;
  const btnSize = Math.min(cellW, cellH) - 16;

  const navY = panelTop + panelH - 62;
  const pageLabel = scene.add.text(cx, navY, '', { fontFamily: FONT, fontSize: '32px', color: '#7a5436' }).setOrigin(0.5).setDepth(DEPTH + 2);
  const prev = scene.add
    .text(panelLeft + 70, navY, '‹', { fontFamily: FONT, fontSize: '60px', color: '#8a4b22' })
    .setOrigin(0.5)
    .setDepth(DEPTH + 2)
    .setInteractive({ useHandCursor: true });
  const next = scene.add
    .text(panelLeft + panelW - 70, navY, '›', { fontFamily: FONT, fontSize: '60px', color: '#8a4b22' })
    .setOrigin(0.5)
    .setDepth(DEPTH + 2)
    .setInteractive({ useHandCursor: true });
  chrome.push(pageLabel, prev, next);

  const renderPage = (): void => {
    for (const o of pageObjs) o.destroy();
    pageObjs = [];
    const start = page * PER_PAGE + 1;
    for (let i = 0; i < PER_PAGE; i++) {
      const lv = start + i;
      if (lv > opts.maxLevel) break;
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const bx = gridLeft + cellW * (col + 0.5);
      const by = gridTop + cellH * (row + 0.5);
      const unlocked = lv <= opts.unlocked;
      const current = lv === opts.current;
      const fill = current ? 0x3cb54a : unlocked ? 0xff8a2a : 0xc9b7a1;
      const bg = scene.add
        .rectangle(bx, by, btnSize, btnSize, fill, 1)
        .setStrokeStyle(3, current ? 0x2a7a33 : 0x7a3c12)
        .setDepth(DEPTH + 2);
      const label = scene.add
        .text(bx, by, String(lv), { fontFamily: FONT, fontSize: `${Math.round(btnSize * 0.34)}px`, color: unlocked ? '#ffffff' : '#8a7a66' })
        .setOrigin(0.5)
        .setDepth(DEPTH + 3);
      if (unlocked) {
        label.setStroke('#6b3410', 3);
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerover', () => bg.setScale(1.06));
        bg.on('pointerout', () => bg.setScale(1));
        bg.on('pointerup', () => {
          sfx('tap');
          const pick = opts.onPick;
          close();
          pick(lv);
        });
      }
      pageObjs.push(bg, label);
    }
    pageLabel.setText(`${page + 1} / ${pageCount}`);
    prev.setAlpha(page > 0 ? 1 : 0.35);
    next.setAlpha(page < pageCount - 1 ? 1 : 0.35);
  };

  prev.on('pointerup', () => {
    if (page > 0) {
      page--;
      sfx('tap');
      renderPage();
    }
  });
  next.on('pointerup', () => {
    if (page < pageCount - 1) {
      page++;
      sfx('tap');
      renderPage();
    }
  });

  renderPage();
  return close;
}
