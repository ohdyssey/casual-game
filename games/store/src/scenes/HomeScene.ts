import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, placeCover, strokeText, capsule } from '@casual/core';
import {
  loadProfile,
  saveProfile,
  type Profile,
  syncLives,
  availableLives,
  msToNextLife,
  consumeLife,
  MAX_LIVES,
  SHOP_ITEMS,
  purchase,
  canAfford,
  spin,
  canFreeSpin,
  SPIN_WHEEL,
  claimDaily,
  canClaimDaily,
  DAILY_REWARDS,
  applyReward,
  type Reward,
} from '../meta/index.js';
import { LEVEL_COUNT } from '../logic/levels.js';
import { sfx, startBgm } from '../audio.js';

const hexc = (s: string): number => parseInt(s.replace('#', ''), 16);
const rewardText = (r: Reward): string =>
  [
    r.coins && `코인 ${r.coins}`,
    r.gems && `젬 ${r.gems}`,
    r.lives && `하트 ${r.lives}`,
    r.hint && `힌트 ${r.hint}`,
    r.shuffle && `셔플 ${r.shuffle}`,
    r.undo && `되돌리기 ${r.undo}`,
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * HomeScene — 메타 허브(D3 게임-로컬). 코인/젬/하트 HUD + 플레이 + 상점/스핀/데일리.
 * 프로필은 saveStore(localStorage) 단일 소스. 플레이 시 하트 소모.
 */
export class HomeScene extends Phaser.Scene {
  private profile!: Profile;
  private coinText!: Phaser.GameObjects.Text;
  private gemText!: Phaser.GameObjects.Text;
  private heartText!: Phaser.GameObjects.Text;
  private heartTimerText!: Phaser.GameObjects.Text;

  constructor() {
    super('HomeScene');
  }

  create(): void {
    this.profile = syncLives(loadProfile(), Date.now());
    // DEV: 테스트용 하트 자동 충전(MAX) + 힌트 10개 — 실제 빌드(prod)에선 적용 안 됨.
    if (import.meta.env?.DEV) {
      this.profile = { ...this.profile, lives: MAX_LIVES, powerups: { ...this.profile.powerups, hint: 10 } };
    }
    saveProfile(this.profile);

    if (this.textures.exists('bg_room')) {
      placeCover(this, 'bg_room', GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT);
    } else {
      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, hexc(COLORS.surfaceFloor));
    }

    this.buildHud();

    // 로고 (60% 수준 크기)
    if (this.textures.exists('logo')) {
      const logoImg = this.add.image(GAME_WIDTH / 2, 310, 'logo').setOrigin(0.5);
      const tex = logoImg.texture.getSourceImage() as { width: number; height: number };
      const targetW = GAME_WIDTH * 0.60;
      logoImg.setScale(targetW / tex.width);
    } else {
      strokeText(this, GAME_WIDTH / 2, 310, '열정편의점', 48, { strokeColor: COLORS.brandGreen, strokeWidth: 8 }).setOrigin(0.5);
    }

    // 플레이 버튼 (신규 노란색 이미지 버튼 ui_btn_yellow 적용)
    this.button(GAME_WIDTH / 2, 640, 320, 96, '▶  플레이', COLORS.brandGreen, () => this.onPlay(), 32, 'ui_btn_yellow');

    // DEV: 테스트용 레벨 선택(1, 25, 50, … LEVEL_COUNT) — 실제 빌드(prod)엔 없음.
    if (import.meta.env?.DEV) this.buildTestLevelSelect();

    // 하단: 상점 / 스핀 / 데일리 (신규 이미지 버튼 적용)
    const by = GAME_HEIGHT - 140;
    this.button(GAME_WIDTH / 2 - 230, by, 200, 84, '🛒 상점', COLORS.surfaceWood, () => this.openShop(), 24, 'ui_btn_blue');
    this.button(GAME_WIDTH / 2, by, 200, 84, '🎡 스핀', COLORS.brandAccent, () => this.openSpin(), 24, 'ui_btn_yellow');
    this.button(GAME_WIDTH / 2 + 230, by, 200, 84, '🎁 데일리', COLORS.gemBlue, () => this.openDaily(), 24, 'ui_btn_blue');
    if (canClaimDaily(this.profile, Date.now())) {
      this.add.circle(GAME_WIDTH / 2 + 230 + 90, by - 36, 12, hexc(COLORS.stateWarn));
    }

    this.refreshHud();
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.refreshHud() });

    // 하단 버전 표시 (버전 정보 항상 기록 규칙 준수)
    strokeText(this, GAME_WIDTH / 2, GAME_HEIGHT - 40, 'v0.1.20', 16, { color: '#888888', strokeWidth: 0 }).setOrigin(0.5);

    // 배경음악 시작(자동재생 잠김 시 첫 탭에서 시작).
    startBgm(this);
  }

  // ─── HUD ───
  private buildHud(): void {
    // 코인 HUD + 신규 플러스 버튼(ui_add)
    capsule(this, 24, 40, 180, 56, COLORS.hudCapsule, { radius: 16 });
    this.add.circle(54, 68, 16, hexc(COLORS.coinGold));
    this.coinText = strokeText(this, 78, 56, '0', 24, { color: COLORS.hudText, strokeWidth: 0 });
    if (this.textures.exists('ui_add')) {
      const addBtn = this.add.image(24 + 180 - 24, 68, 'ui_add').setOrigin(0.5).setDisplaySize(36, 36).setInteractive({ useHandCursor: true });
      addBtn.on('pointerdown', () => this.openShop());
    }

    // 젬 HUD + 신규 플러스 버튼(ui_add)
    capsule(this, 220, 40, 150, 56, COLORS.hudCapsule, { radius: 16 });
    this.add.circle(250, 68, 14, hexc(COLORS.gemBlue));
    this.gemText = strokeText(this, 272, 56, '0', 24, { color: COLORS.hudText, strokeWidth: 0 });
    if (this.textures.exists('ui_add')) {
      const addBtn = this.add.image(220 + 150 - 22, 68, 'ui_add').setOrigin(0.5).setDisplaySize(36, 36).setInteractive({ useHandCursor: true });
      addBtn.on('pointerdown', () => this.openShop());
    }

    // 하트 HUD + 신규 플러스 버튼(ui_add)
    capsule(this, GAME_WIDTH - 210, 40, 186, 56, COLORS.hudCapsule, { radius: 16 });
    this.heartText = strokeText(this, GAME_WIDTH - 188, 56, '❤ 0', 24, { color: COLORS.stateWarn, strokeWidth: 0 });
    this.heartTimerText = strokeText(this, GAME_WIDTH - 110, 60, '', 18, { color: COLORS.hudText, strokeWidth: 0 });
    if (this.textures.exists('ui_add')) {
      const addBtn = this.add.image(GAME_WIDTH - 44, 68, 'ui_add').setOrigin(0.5).setDisplaySize(36, 36).setInteractive({ useHandCursor: true });
      addBtn.on('pointerdown', () => this.openShop());
    }
  }

  private refreshHud(): void {
    const now = Date.now();
    const lives = availableLives(this.profile, now);
    this.coinText.setText(String(this.profile.coins));
    this.gemText.setText(String(this.profile.gems));
    this.heartText.setText(`❤ ${lives}/${MAX_LIVES}`);
    if (lives >= MAX_LIVES) {
      this.heartTimerText.setText('FULL');
    } else {
      const ms = msToNextLife(this.profile, now);
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      this.heartTimerText.setText(`${m}:${String(s).padStart(2, '0')}`);
    }
  }

  // ─── 플레이 ───
  private onPlay(): void {
    const now = Date.now();
    const next = consumeLife(this.profile, now);
    if (!next) {
      this.toast('하트가 부족해요! 충전을 기다리거나 상점/스핀에서 얻으세요.');
      return;
    }
    this.profile = next;
    saveProfile(this.profile);
    const levelIndex = (this.profile.level - 1) % LEVEL_COUNT;
    this.scene.start('StoreScene', { levelIndex });
  }

  // ─── DEV: 테스트 레벨 선택(1, 25, 50, … ) — 하트 소모 없이 바로 입장 ───
  private buildTestLevelSelect(): void {
    const levels: number[] = [1];
    for (let n = 25; n <= LEVEL_COUNT; n += 25) levels.push(n);
    const cols = 5;
    const bw = 122;
    const bh = 50;
    const gapX = 10;
    const gapY = 10;
    const gridW = cols * bw + (cols - 1) * gapX;
    const startX = GAME_WIDTH / 2 - gridW / 2 + bw / 2;
    const startY = 745;
    strokeText(this, GAME_WIDTH / 2, startY - 34, '🧪 TEST 레벨 입장', 22, { color: COLORS.hudText, strokeWidth: 0 }).setOrigin(0.5);
    levels.forEach((lv, i) => {
      const cx = startX + (i % cols) * (bw + gapX);
      const cy = startY + Math.floor(i / cols) * (bh + gapY);
      this.button(cx, cy, bw, bh, `L${lv}`, COLORS.gemBlue, () => this.scene.start('StoreScene', { levelIndex: lv - 1 }), 20);
    });
  }

  // ─── 공용 오버레이 ───
  private overlay(titleStr: string): Phaser.GameObjects.Container {
    sfx(this, 'sfx_popup_open');
    const layer = this.add.container(0, 0).setDepth(200);
    layer.add(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setInteractive());
    const panelBg = this.add.graphics();
    panelBg.fillStyle(0xffffff, 1);
    panelBg.fillRoundedRect(GAME_WIDTH / 2 - 300, 280, 600, 720, 28);
    layer.add(panelBg);
    layer.add(strokeText(this, GAME_WIDTH / 2, 330, titleStr, 40, { strokeColor: COLORS.brandGreen, strokeWidth: 7 }).setOrigin(0.5));
    // 닫기
    const close = this.add.circle(GAME_WIDTH / 2 + 260, 320, 26, hexc(COLORS.stateWarn));
    layer.add(close);
    layer.add(strokeText(this, GAME_WIDTH / 2 + 260, 320, '✕', 26, { strokeWidth: 0 }).setOrigin(0.5));
    layer.add(
      this.add
        .zone(GAME_WIDTH / 2 + 260, 320, 56, 56)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          sfx(this, 'sfx_popup_close');
          layer.destroy();
          this.refreshHud();
        }),
    );
    return layer;
  }

  private openShop(): void {
    const layer = this.overlay('상점');
    SHOP_ITEMS.forEach((item, i) => {
      const y = 430 + i * 96;
      const afford = canAfford(this.profile, item);
      this.panelRow(layer, GAME_WIDTH / 2 - 250, y - 38, 500, 76, afford ? COLORS.surfaceFloor : '#dddddd', 14);
      layer.add(strokeText(this, GAME_WIDTH / 2 - 230, y - 16, item.label, 24, { color: COLORS.hudText, strokeWidth: 0 }));
      const cost = item.cost.coins ? `🪙 ${item.cost.coins}` : `💎 ${item.cost.gems}`;
      layer.add(strokeText(this, GAME_WIDTH / 2 + 150, y - 16, cost, 22, { color: afford ? COLORS.brandGreen : COLORS.stateWarn, strokeWidth: 0 }));
      layer.add(
        this.add
          .zone(GAME_WIDTH / 2, y, 500, 76)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            const bought = purchase(this.profile, item);
            if (!bought) {
              this.toast('재화가 부족해요.');
              return;
            }
            this.profile = bought;
            saveProfile(this.profile);
            this.refreshHud();
            layer.destroy();
            this.openShop();
          }),
      );
    });
  }

  private openSpin(): void {
    const layer = this.overlay('스핀 휠');
    const free = canFreeSpin(this.profile, Date.now());
    layer.add(strokeText(this, GAME_WIDTH / 2, 430, free ? '무료 스핀 가능!' : '오늘 무료 스핀 완료', 24, { color: COLORS.hudText, strokeWidth: 0 }).setOrigin(0.5));
    // 보상 목록(미리보기)
    SPIN_WHEEL.forEach((seg, i) => {
      layer.add(strokeText(this, GAME_WIDTH / 2, 500 + i * 44, seg.label, 22, { color: COLORS.hudText, strokeWidth: 0 }).setOrigin(0.5));
    });
    this.button(GAME_WIDTH / 2, 880, 300, 84, free ? '🎡 무료 스핀' : '💎5 스핀', free ? COLORS.brandAccent : COLORS.gemBlue, () => {
      if (!free) {
        const paid = this.profile.gems >= 5 ? applyReward(this.profile, { gems: -5 }) : null;
        if (!paid) {
          this.toast('젬이 부족해요.');
          return;
        }
        this.profile = paid;
      }
      const result = spin(() => Math.random());
      this.profile = applyReward(this.profile, result.segment.reward);
      this.profile = { ...this.profile, lastSpinAt: Date.now() };
      saveProfile(this.profile);
      this.refreshHud();
      layer.destroy();
      this.toast(`🎉 ${result.segment.label} 획득!`);
    }, 24, undefined, layer);
  }

  private openDaily(): void {
    const layer = this.overlay('데일리 보상');
    DAILY_REWARDS.forEach((r, i) => {
      const claimed = i < this.profile.dailyStreak % DAILY_REWARDS.length || (this.profile.dailyStreak > 0 && !canClaimDaily(this.profile, Date.now()) && i === (this.profile.dailyStreak - 1) % DAILY_REWARDS.length);
      const y = 440 + i * 70;
      this.panelRow(layer, GAME_WIDTH / 2 - 250, y - 28, 500, 56, claimed ? '#cccccc' : COLORS.surfaceFloor, 12);
      layer.add(strokeText(this, GAME_WIDTH / 2 - 230, y - 12, `Day ${i + 1}`, 22, { color: COLORS.hudText, strokeWidth: 0 }));
      layer.add(strokeText(this, GAME_WIDTH / 2 + 40, y - 12, rewardText(r), 20, { color: COLORS.brandGreen, strokeWidth: 0 }));
    });
    const can = canClaimDaily(this.profile, Date.now());
    this.button(GAME_WIDTH / 2, 920, 300, 84, can ? '🎁 받기' : '내일 다시', can ? COLORS.brandGreen : COLORS.surfaceWood, () => {
      const res = claimDaily(this.profile, Date.now());
      if (!res) {
        this.toast('오늘은 이미 받았어요.');
        return;
      }
      this.profile = applyReward(res.profile, res.reward);
      saveProfile(this.profile);
      this.refreshHud();
      layer.destroy();
      this.toast(`🎁 ${rewardText(res.reward)} 획득!`);
    }, 24, undefined, layer);
  }

  // ─── 토스트 ───
  private toast(msg: string): void {
    const c = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 260).setDepth(300);
    const bg = this.add.graphics();
    bg.fillStyle(hexc(COLORS.hudText), 1);
    bg.fillRoundedRect(-290, -34, 580, 68, 18);
    c.add(bg);
    c.add(strokeText(this, 0, -10, msg, 20, { color: COLORS.textWhite, strokeWidth: 0 }).setOrigin(0.5));
    this.tweens.add({ targets: c, alpha: 0, delay: 1800, duration: 600, onComplete: () => c.destroy() });
  }

  /** 오버레이 내부 행 배경 — layer 에 추가하여 닫을 때 함께 제거(capsule=scene-level 잔류버그 회피). */
  private panelRow(layer: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number, fill: string, radius: number): void {
    const g = this.add.graphics();
    g.fillStyle(hexc(fill), 1);
    g.fillRoundedRect(x, y, w, h, radius);
    layer.add(g);
  }

  // ─── 버튼 헬퍼 (신규 이미지 버튼 렌더 대응. parent 지정 시 오버레이 layer 에 귀속) ───
  private button(
    cx: number,
    cy: number,
    w: number,
    h: number,
    label: string,
    fill: string,
    onClick: () => void,
    size = 24,
    textureKey?: string,
    parent?: Phaser.GameObjects.Container,
  ): void {
    // parent 가 있으면 생성물을 모두 거기에 add → 오버레이 닫을 때 함께 제거(잔류버그 회피).
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      if (parent) parent.add(o);
      return o;
    };
    if (textureKey && this.textures.exists(textureKey)) {
      keep(this.add.image(cx, cy, textureKey).setOrigin(0.5).setDisplaySize(w, h));
    } else if (parent) {
      // 컨테이너 안에서는 capsule(scene-level) 대신 graphics 직접 생성·add.
      const g = this.add.graphics();
      g.fillStyle(hexc(fill), 1);
      g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 18);
      keep(g);
    } else {
      capsule(this, cx - w / 2, cy - h / 2, w, h, fill, { radius: 18 });
    }
    // 이미지 버튼일 때 텍스트 높이 오프셋 미세 조정
    const textY = textureKey ? cy - 2 : cy;
    keep(strokeText(this, cx, textY, label, size, { strokeWidth: 0 }).setOrigin(0.5));
    keep(
      this.add
        .zone(cx, cy, w, h)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          sfx(this, 'sfx_button_tap');
          onClick();
        }),
    );
  }
}
