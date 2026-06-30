/**
 * dialogBox.ts — **공용 임시 메시지/다이얼로그**(요청 2026-06-29: 중간 메시지·사용자 판단 다이얼로그가 없어 임시 제작).
 *
 *   showToast(scene, msg)        — 자동 소멸 배너(정보 알림: 미션 보상 획득·일일 보너스·새 미션 등).
 *   showDialog(scene, {…})       — 모달 다이얼로그(사용자 판단: 스핀 부족 → 상점으로/확인 등). 씬당 하나(중복 방지).
 *
 * 좌표는 디자인 공간(1080×2400) 중앙 기준. depth 는 게임플레이 위(설정 메뉴 9800·상점 9500 아래). 스타일은
 *   설정 메뉴/상점 팝업과 동일 톤(크림 패널·골드 테두리·컬러 버튼). 셸 공유 — 로비·게임·호텔 어디서나 동일.
 */
import Phaser from 'phaser';
import { DESIGN_W, DESIGN_H } from '../scenes/PlayScene.js';

const TITLE_FONT = '"Russo One", "Jua", sans-serif';
const KR_FONT = '"Do Hyeon", "Jua", sans-serif';

type SceneWithDialog = Phaser.Scene & { __dialogBox?: Phaser.GameObjects.Container };

// ── 토스트(자동 소멸 배너) ───────────────────────────────────────────────────
export interface ToastOptions {
  /** 표시 시간(ms, 기본 1800). */
  durationMs?: number;
  /** 텍스트 색(기본 흰색). */
  color?: string;
  /** 중심 y(기본 화면 30%). */
  y?: number;
  /** depth(기본 9000). */
  depth?: number;
}

/** 자동 소멸 토스트 — 팝인 → 홀드 → 위로 페이드아웃. 여러 번 호출하면 겹쳐 떠도 각자 소멸. */
export function showToast(scene: Phaser.Scene, message: string, opts: ToastOptions = {}): void {
  const cx = DESIGN_W / 2;
  const y = opts.y ?? DESIGN_H * 0.3;
  const c = scene.add.container(cx, y).setDepth(opts.depth ?? 9000);
  const txt = scene.add
    .text(0, 0, message, {
      fontFamily: KR_FONT,
      fontSize: '46px',
      color: opts.color ?? '#ffffff',
      align: 'center',
      wordWrap: { width: 820 },
      stroke: '#2a1640',
      strokeThickness: 5,
    })
    .setOrigin(0.5);
  const w = Math.min(960, txt.width + 112);
  const h = txt.height + 60;
  const bg = scene.add.graphics();
  bg.fillStyle(0x2a1640, 0.92);
  bg.fillRoundedRect(-w / 2, -h / 2, w, h, 28);
  bg.lineStyle(4, 0xffd34d, 0.9);
  bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 28);
  c.add(bg);
  c.add(txt);
  c.setScale(0.82).setAlpha(0);
  scene.tweens.add({ targets: c, scaleX: 1, scaleY: 1, alpha: 1, duration: 180, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: c, alpha: 0, y: y - 90, delay: opts.durationMs ?? 1800, duration: 440, ease: 'Quad.easeIn', onComplete: () => c.destroy(true) });
}

// ── 다이얼로그(모달 + 결정 버튼) ─────────────────────────────────────────────
export interface DialogButton {
  readonly label: string;
  readonly onClick?: () => void;
  /** 색: primary=초록 · danger=빨강 · default=보라(기본). */
  readonly kind?: 'primary' | 'danger' | 'default';
}

export interface DialogOptions {
  title?: string;
  message: string;
  buttons: ReadonlyArray<DialogButton>; // 1~2개 권장
  /** 제목 색(기본 골드). */
  accent?: string;
  /** depth(기본 9300). */
  depth?: number;
  /** 딤(바깥) 탭으로 닫기 허용(기본 true). */
  dismissible?: boolean;
}

const BTN_COLOR: Record<NonNullable<DialogButton['kind']>, number> = {
  primary: 0x49b148,
  danger: 0xc0463a,
  default: 0x6b5a8a,
};

function pressFx(scene: Phaser.Scene, targets: Phaser.GameObjects.GameObject[]): void {
  scene.tweens.add({ targets, scaleX: 0.93, scaleY: 0.93, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
}

/** 모달 다이얼로그 — 딤 + 크림 패널 + 제목/본문 + 결정 버튼. 씬당 하나(이미 열려 있으면 무시). */
export function showDialog(scene: Phaser.Scene, opts: DialogOptions): void {
  const s = scene as SceneWithDialog;
  if (s.__dialogBox) return; // 중복 방지
  const depth = opts.depth ?? 9300;
  const cx = DESIGN_W / 2;
  const cy = DESIGN_H / 2;
  const layer = scene.add.container(0, 0).setDepth(depth);
  s.__dialogBox = layer;
  if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__dialogBox = layer;

  const dim = scene.add.rectangle(cx, cy, DESIGN_W * 1.4, DESIGN_H * 1.2, 0x000000, 0.6).setInteractive();
  if (opts.dismissible !== false) dim.on('pointerdown', () => closeDialog(s));
  layer.add(dim);

  const W = 840;
  const H = 620;
  const panel = scene.add.rectangle(cx, cy, W, H, 0xfff4e0, 1).setStrokeStyle(8, 0xffd34d);
  layer.add(panel);

  let ty = cy - H / 2 + 110;
  if (opts.title) {
    const title = scene.add
      .text(cx, ty, opts.title, { fontFamily: TITLE_FONT, fontSize: '58px', color: opts.accent ?? '#c98a16', stroke: '#2a1640', strokeThickness: 6 })
      .setOrigin(0.5);
    layer.add(title);
    ty += 70;
  }
  const msg = scene.add
    .text(cx, ty + 60, opts.message, { fontFamily: KR_FONT, fontSize: '40px', color: '#3a2456', align: 'center', wordWrap: { width: W - 140 }, lineSpacing: 12 })
    .setOrigin(0.5, 0);
  layer.add(msg);

  // 버튼 행(1~2개) — 하단 중앙.
  const btns = opts.buttons.length ? opts.buttons : [{ label: '확인' }];
  const bw = 340;
  const bh = 120;
  const gap = 40;
  const total = btns.length * bw + (btns.length - 1) * gap;
  let bx = cx - total / 2 + bw / 2;
  const by = cy + H / 2 - 100;
  for (const b of btns) {
    const color = BTN_COLOR[b.kind ?? 'default'];
    const bg = scene.add.rectangle(bx, by, bw, bh, color, 1).setStrokeStyle(4, 0xffffff, 0.85).setInteractive({ useHandCursor: true });
    const txt = scene.add.text(bx, by, b.label, { fontFamily: TITLE_FONT, fontSize: '44px', color: '#ffffff', stroke: '#2a1640', strokeThickness: 3 }).setOrigin(0.5);
    bg.on('pointerdown', () => {
      pressFx(scene, [bg, txt]);
      closeDialog(s);
      b.onClick?.();
    });
    layer.add(bg);
    layer.add(txt);
    bx += bw + gap;
  }

  layer.setScale(0.9).setAlpha(0);
  scene.tweens.add({ targets: layer, scaleX: 1, scaleY: 1, alpha: 1, duration: 170, ease: 'Back.easeOut' });
}

/** 열린 다이얼로그 닫기(페이드아웃 후 정리). */
export function closeDialog(scene: Phaser.Scene): void {
  const s = scene as SceneWithDialog;
  const layer = s.__dialogBox;
  if (!layer) return;
  s.__dialogBox = undefined;
  scene.tweens.add({ targets: layer, alpha: 0, duration: 120, ease: 'Quad.easeIn', onComplete: () => layer.destroy(true) });
}

/** 다이얼로그 열림 여부(게임 로직이 입력 차단 판단 등에 사용). */
export function isDialogOpen(scene: Phaser.Scene): boolean {
  return !!(scene as SceneWithDialog).__dialogBox;
}
