/**
 * popups.ts — 코드 드로우 팝업(일시정지·클리어·실패).
 * 크롬(HUD)은 에디터 SSOT 지만 팝업은 동적 상태 의존이라 코드로 그린다(형제 게임 패턴).
 * 팝업 배경 디자인이 나오면 에디터 업로드 이미지로 교체할 수 있게 단일 진입점으로 유지.
 */
import Phaser from 'phaser';
import { LOGO_TEX } from '../assets.js';

const DESIGN_W = 1080;
const DESIGN_H = 2400;

export interface PopupButton {
  readonly label: string;
  readonly onClick: () => void;
  /** 강조(초록) / 보조(갈색) 스타일. */
  readonly primary?: boolean;
}

export interface PopupOptions {
  readonly title: string;
  readonly subtitle?: string;
  readonly buttons: ReadonlyArray<PopupButton>;
  readonly showLogo?: boolean;
}

/** 팝업 열기 — 반환된 close() 로 닫는다. 뒤 레이어 입력은 딤이 흡수. */
export function showPopup(scene: Phaser.Scene, opts: PopupOptions): () => void {
  const root = scene.add.container(0, 0).setDepth(100);

  const dim = scene.add
    .rectangle(0, 0, DESIGN_W, DESIGN_H, 0x1a3306, 0.62)
    .setOrigin(0)
    .setInteractive(); // 입력 흡수
  root.add(dim);

  const panelW = 860;
  const panelH = opts.showLogo ? 980 : 760;
  const cx = DESIGN_W / 2;
  const cy = DESIGN_H / 2;
  const panel = scene.add.graphics();
  panel.fillStyle(0xfff6e3, 1);
  panel.fillRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 48);
  panel.lineStyle(10, 0x7a4d1f, 1);
  panel.strokeRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 48);
  root.add(panel);

  let y = cy - panelH / 2 + 90;
  if (opts.showLogo && scene.textures.exists(LOGO_TEX)) {
    const logo = scene.add.image(cx, y + 130, LOGO_TEX);
    logo.setDisplaySize(500, 500 * (438 / 701));
    root.add(logo);
    y += 320;
  }

  const title = scene.add
    .text(cx, y, opts.title, {
      fontFamily: '"Jua", sans-serif',
      fontSize: '72px',
      color: '#5b3d20',
      align: 'center',
    })
    .setOrigin(0.5);
  root.add(title);
  y += 96;

  if (opts.subtitle) {
    const sub = scene.add
      .text(cx, y, opts.subtitle, {
        fontFamily: '"Jua", sans-serif',
        fontSize: '42px',
        color: '#8a6a44',
        align: 'center',
        wordWrap: { width: panelW - 120 },
      })
      .setOrigin(0.5, 0);
    root.add(sub);
    y += sub.height + 48;
  }

  const btnW = 560;
  const btnH = 120;
  const btnGap = 36;
  const total = opts.buttons.length * btnH + (opts.buttons.length - 1) * btnGap;
  let by = cy + panelH / 2 - 80 - total + btnH / 2;
  for (const b of opts.buttons) {
    const color = b.primary === false ? 0xa9855c : 0x6fbf3a;
    const g = scene.add.graphics();
    g.fillStyle(color, 1);
    g.fillRoundedRect(cx - btnW / 2, by - btnH / 2, btnW, btnH, 32);
    g.lineStyle(6, 0xffffff, 0.55);
    g.strokeRoundedRect(cx - btnW / 2, by - btnH / 2, btnW, btnH, 32);
    root.add(g);
    const label = scene.add
      .text(cx, by, b.label, { fontFamily: '"Jua", sans-serif', fontSize: '52px', color: '#ffffff' })
      .setOrigin(0.5);
    root.add(label);
    const hit = scene.add
      .rectangle(cx, by, btnW, btnH, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      scene.tweens.add({ targets: [label], scale: 0.92, duration: 70, yoyo: true, onComplete: b.onClick });
    });
    root.add(hit);
    by += btnH + btnGap;
  }

  // 등장 연출 — 페이드 인(컨테이너 스케일은 좌상단 기준이라 쓰지 않는다).
  root.setAlpha(0);
  scene.tweens.add({ targets: root, alpha: 1, duration: 150, ease: 'Quad.easeOut' });

  return () => root.destroy();
}
