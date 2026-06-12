/**
 * 팝업/토스트 — 승리·실패·상점·설정 공용 오버레이. 디머가 하부 입력을 차단한다.
 */
import Phaser from 'phaser';
import { sfx } from '../audio.js';

const DEPTH_POPUP = 2000;
const DEPTH_TOAST = 2500;
const PANEL_W = 520;
const FONT = '"Jua", "Do Hyeon", sans-serif';

export interface PopupButton {
  readonly label: string;
  readonly color?: number;
  /** false 반환 시 팝업 유지(예: 코인 부족). 그 외 닫힘. */
  readonly onTap: () => boolean | void;
  readonly small?: boolean;
}

export interface PopupOpts {
  readonly title: string;
  readonly lines?: ReadonlyArray<string>;
  readonly buttons: ReadonlyArray<PopupButton>;
  /** 디머 탭으로 닫기 허용 여부. */
  readonly dismissible?: boolean;
  readonly onClose?: () => void;
}

/** 모달 팝업. 반환된 close() 로 코드에서도 닫을 수 있다. */
export function openPopup(scene: Phaser.Scene, opts: PopupOpts): () => void {
  const cx = scene.scale.width / 2;
  const cy = Math.min(scene.scale.height / 2, 640);
  const objs: Phaser.GameObjects.GameObject[] = [];
  let closed = false;

  const close = (): void => {
    if (closed) return;
    closed = true;
    for (const o of objs) o.destroy();
    opts.onClose?.();
  };

  const dim = scene.add
    .rectangle(cx, scene.scale.height / 2, scene.scale.width, scene.scale.height, 0x1a0d06, 0.62)
    .setDepth(DEPTH_POPUP)
    .setInteractive();
  if (opts.dismissible) dim.on('pointerup', () => close());
  objs.push(dim);

  const lineCount = opts.lines?.length ?? 0;
  const btnRows = opts.buttons.length;
  const panelH = 150 + lineCount * 44 + btnRows * 92;
  const panel = scene.add.graphics({ x: cx - PANEL_W / 2, y: cy - panelH / 2 }).setDepth(DEPTH_POPUP + 1);
  panel.fillStyle(0xfff4e0, 1);
  panel.fillRoundedRect(0, 0, PANEL_W, panelH, 28);
  panel.lineStyle(6, 0x8a4b22, 1);
  panel.strokeRoundedRect(0, 0, PANEL_W, panelH, 28);
  panel.setInteractive(new Phaser.Geom.Rectangle(0, 0, PANEL_W, panelH), Phaser.Geom.Rectangle.Contains);
  objs.push(panel);

  let y = cy - panelH / 2 + 64;
  objs.push(
    scene.add
      .text(cx, y, opts.title, { fontFamily: FONT, fontSize: '40px', color: '#5a2c10', align: 'center' })
      .setOrigin(0.5)
      .setDepth(DEPTH_POPUP + 2),
  );
  y += 58;
  for (const line of opts.lines ?? []) {
    objs.push(
      scene.add
        .text(cx, y, line, { fontFamily: FONT, fontSize: '26px', color: '#7a5436', align: 'center' })
        .setOrigin(0.5)
        .setDepth(DEPTH_POPUP + 2),
    );
    y += 44;
  }
  y += 16;

  for (const btn of opts.buttons) {
    const bw = btn.small ? 280 : 380;
    const bh = 68;
    const bg = scene.add
      .rectangle(cx, y + bh / 2, bw, bh, btn.color ?? 0xff8a2a, 1)
      .setStrokeStyle(4, 0x7a3c12)
      .setDepth(DEPTH_POPUP + 2)
      .setInteractive({ useHandCursor: true });
    const label = scene.add
      .text(cx, y + bh / 2, btn.label, { fontFamily: FONT, fontSize: '28px', color: '#ffffff' })
      .setStroke('#6b3410', 4)
      .setOrigin(0.5)
      .setDepth(DEPTH_POPUP + 3);
    bg.on('pointerup', () => {
      sfx('tap');
      if (btn.onTap() === false) return;
      close();
    });
    bg.on('pointerover', () => bg.setScale(1.04));
    bg.on('pointerout', () => bg.setScale(1));
    objs.push(bg, label);
    y += 92;
  }

  // 등장 연출
  const pop = objs.filter((o) => o !== dim);
  for (const o of pop) {
    const go = o as unknown as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.AlphaSingle;
    scene.tweens.add({ targets: go, alpha: { from: 0, to: go.alpha ?? 1 }, duration: 160 });
  }
  return close;
}

let activeToast: { text: Phaser.GameObjects.Text; bg: Phaser.GameObjects.Rectangle } | null = null;

/** 짧은 안내 토스트 — 중앙 상단 캡슐. 새 토스트가 이전 것을 대체(씬 재시작에도 안전). */
export function showToast(scene: Phaser.Scene, msg: string): void {
  if (activeToast) {
    activeToast.text.destroy();
    activeToast.bg.destroy();
    activeToast = null;
  }
  const cx = scene.scale.width / 2;
  const text = scene.add
    .text(cx, 420, msg, { fontFamily: FONT, fontSize: '28px', color: '#fff8ea' })
    .setStroke('#54250e', 6)
    .setOrigin(0.5)
    .setDepth(DEPTH_TOAST + 1)
    .setAlpha(0);
  const pad = { x: 28, y: 12 };
  const bg = scene.add
    .rectangle(cx, 420, text.width + pad.x * 2, text.height + pad.y * 2, 0x3a1c0c, 0.88)
    .setDepth(DEPTH_TOAST)
    .setAlpha(0);
  const mine = { text, bg };
  activeToast = mine;
  const finish = (): void => {
    text.destroy();
    bg.destroy();
    if (activeToast === mine) activeToast = null;
  };
  scene.tweens.add({
    targets: [text, bg],
    alpha: 1,
    y: '-=14',
    duration: 180,
    ease: 'Quad.easeOut',
    onComplete: () => {
      scene.time.delayedCall(1100, () => {
        scene.tweens.add({ targets: [text, bg], alpha: 0, duration: 240, onComplete: finish });
      });
    },
  });
}
