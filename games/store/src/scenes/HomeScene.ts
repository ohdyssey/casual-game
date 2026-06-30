import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, strokeText, capsule, fillCoverLayout } from '@casual/core';
import {
  loadProfile,
  saveProfile,
  type Profile,
  syncLives,
  availableLives,
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
import { buildLayout, type LayoutDoc, type LayoutIndex, type LayoutObject } from '../ui/layoutLoader.js';
import { UI_HOME_LAYOUT_KEY } from '../assets.js';
import { sfx, startBgm, isBgmOn, isSfxOn, setBgmEnabled, setSfxEnabled } from '../audio.js';

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

// ── 진입화면 에디터 노드 id (blank.json = "진입화면") ──
const N = {
  bg: 'layer_1', // 매장 배경
  signMain: 'layer_3_copy', // 열정편의점(간판 위 오버레이)
  signSub: 'layer_3', // CONVENIANCE STORE 24H
  coin: 'layer_13_copy7', // 코인 수치 "36,708"
  heartPanel: 'layer_7', // 하트 바
  settings: 'layer_8', // 설정 기어
  playBtn: 'layer_14', // 영업시작 버튼
  playText: 'layer_15',
  navRect: 'layer_12', // 하단 네비 바
  dailyPanel: 'layer_9_copy3', // 매일 체크 패널(알림 점 기준)
} as const;

// 좌/우 아이콘 버튼 — panel = 둥근 패널, bounce = 탭 시 눌림 연출 대상.
const ICON_BTNS = [
  { id: 'mission', panel: 'layer_9_copy', bounce: ['layer_9_copy', 'layer_2'] },
  { id: 'daily', panel: 'layer_9_copy3', bounce: ['layer_9_copy3', 'layer_4'] },
  { id: 'event', panel: 'layer_9_copy4', bounce: ['layer_9_copy4', 'layer_4_copy'] },
  { id: 'special', panel: 'layer_9_copy5', bounce: ['layer_9_copy5', 'layer_2_copy'] },
  { id: 'noads', panel: 'layer_9_copy6', bounce: ['layer_9_copy6', 'layer_2_copy2'] },
  { id: 'limited', panel: 'layer_9_copy7', bounce: ['layer_9_copy7', 'layer_2_copy3'] },
] as const;

// 하단 네비(상점/업적/홈/직원/도감).
const NAV_BTNS = [
  { id: 'shop', icon: 'layer_10', bounce: ['layer_10'] },
  { id: 'ach', icon: 'layer_11', bounce: ['layer_11'] },
  { id: 'home', icon: 'layer_11_copy', bounce: ['layer_11_copy'] },
  { id: 'staff', icon: 'layer_10_copy', bounce: ['layer_10_copy'] },
  { id: 'codex', icon: 'layer_10_copy2', bounce: ['layer_10_copy2'] },
] as const;

/**
 * HomeScene — 진입화면. phaser-ui-editor 디자인(blank.json)을 단일 진실 공급원(SSOT)으로 렌더.
 * 배경/헤더/좌우 아이콘/하단 네비/영업시작 버튼은 에디터 레이아웃, 동적 수치(코인·하트)와 탭
 * 인터랙션만 코드가 바인딩한다. 상점/스핀/데일리/설정은 기존 메타 오버레이로 연결.
 */
export class HomeScene extends Phaser.Scene {
  private profile!: Profile;
  private layout?: LayoutIndex;
  private coinText?: Phaser.GameObjects.Text;
  private heartText?: Phaser.GameObjects.Text;
  private dailyDot?: Phaser.GameObjects.Arc;

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

    const doc = this.cache.json.get(UI_HOME_LAYOUT_KEY) as LayoutDoc | undefined;
    if (doc?.nodes?.length) {
      this.layout = buildLayout(this, doc);
      this.fitHome();
      this.bindLayout();
    } else {
      this.buildFallback();
    }

    this.refreshHud();
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.refreshHud() });

    // 배경음악 시작(자동재생 잠김 시 첫 탭에서 시작).
    startBgm(this);
  }

  // ─── 레이아웃 반응형 배치 ───
  private fitHome(): void {
    if (!this.layout) return;
    // 창 비율로 꽉 채우고 배경 cover + 하단(영업시작·네비)을 바닥 정렬(FIT 레터박스 제거).
    fillCoverLayout(this, this.layout, { bottomBelow: 1000 });
    // 배경 cover 변환에 맞춰 간판 텍스트를 추종 배치 — 확대·재중심돼도 흰 간판 위에 정확히 얹힘.
    // 주의: 디자인 좌표는 720×1280 프레임 기준인데 배경 텍스처(608×1080)는 그보다 작다. 따라서
    //   bg.scaleX(텍스처 대비 cover 배율)로 오프셋을 곱하면 1:1 화면에서도 텍스트가 위로 밀리고
    //   과대 확대된다. 배경의 "표시 박스(displayW×displayH)"를 디자인 프레임에 비례 매핑해야 정확.
    const bg = this.layout.tryById<Phaser.GameObjects.Image>(N.bg);
    if (!bg) return;
    const dw = bg.displayWidth;
    const dh = bg.displayHeight;
    const k = dh / GAME_HEIGHT; // 배경이 디자인 프레임 대비 커진 배율(간판·텍스트 동일 비율 확대)
    for (const id of [N.signMain, N.signSub]) {
      const o = this.layout.tryById<Phaser.GameObjects.Text>(id);
      const n = this.layout.nodeById(id);
      if (o && n) {
        const nx = bg.x + ((n.x - GAME_WIDTH / 2) / GAME_WIDTH) * dw;
        const ny = bg.y + ((n.y - GAME_HEIGHT / 2) / GAME_HEIGHT) * dh;
        o.setScale(k).setPosition(nx, ny);
      }
    }
  }

  // ─── 동적 수치 + 인터랙션 바인딩 ───
  private bindLayout(): void {
    if (!this.layout) return;
    // 코인 수치(에디터 텍스트 노드 재사용).
    this.coinText = this.layout.tryById<Phaser.GameObjects.Text>(N.coin);

    // 하트 수 오버레이(헬쓰 바 위에 얹음).
    const hp = this.layout.nodeById(N.heartPanel);
    if (hp) {
      this.heartText = this.add
        .text(hp.x + 10, hp.y - 1, '', { fontFamily: '"Jua", sans-serif', fontSize: '22px', color: '#ffffff', align: 'center' })
        .setOrigin(0.5)
        .setStroke('#5a3210', 5)
        .setDepth((hp.depth ?? 17) + 5);
    }

    // 영업시작 + 설정.
    this.wireTap(N.playBtn, 232, 92, () => this.onPlay(), [N.playBtn, N.playText]);
    this.wireTap(N.settings, 78, 78, () => this.openSettings(), [N.settings]);

    // 좌/우 아이콘 버튼(라벨 포함 영역 → dy 로 아래 보정).
    for (const b of ICON_BTNS) this.wireTap(b.panel, 118, 152, () => this.runAction(b.id), [...b.bounce], 14);
    // 하단 네비.
    for (const b of NAV_BTNS) this.wireTap(b.icon, 124, 130, () => this.runAction(b.id), [...b.bounce], 8);

    // 버전 표시(하단 네비 바 위에 고정).
    const nav = this.layout.nodeById(N.navRect);
    const extra = Math.max(0, this.scale.height - GAME_HEIGHT);
    const vy = nav ? nav.y + extra - (nav.h ?? 146) / 2 - 14 : GAME_HEIGHT - 30;
    strokeText(this, GAME_WIDTH / 2, vy, 'v0.1.21', 15, { color: '#cfd3da', strokeWidth: 0 }).setOrigin(0.5).setDepth(50);

    // DEV: 테스트용 레벨 선택 — 실제 빌드(prod)엔 없음.
    if (import.meta.env?.DEV) this.buildTestLevelSelect();

    this.updateDailyDot();
  }

  /** 레이아웃 노드 위에 탭 영역(투명 zone)을 얹고 눌림 연출 + 핸들러를 배선. */
  private wireTap(id: string, w: number, h: number, onClick: () => void, bounceIds: string[], dy = 0): void {
    const ref = this.layout?.tryById<LayoutObject>(id) as (LayoutObject & { x: number; y: number }) | undefined;
    if (!ref) return;
    const zone = this.add.zone(ref.x, ref.y + dy, w, h).setInteractive({ useHandCursor: true }).setDepth(80);
    zone.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation?.();
      sfx(this, 'sfx_button_tap');
      this.bounce(bounceIds);
      onClick();
    });
  }

  /** 탭 눌림 연출 — 현재 스케일 기준으로 살짝 줄였다 복귀(displaySize 보존). */
  private bounce(ids: string[]): void {
    for (const id of ids) {
      const o = this.layout?.tryById<LayoutObject>(id) as (LayoutObject & { scaleX: number; scaleY: number; setScale: (x: number, y?: number) => unknown }) | undefined;
      if (!o) continue;
      const sx = o.scaleX;
      const sy = o.scaleY;
      this.tweens.killTweensOf(o);
      o.setScale(sx, sy);
      this.tweens.add({ targets: o, scaleX: sx * 0.9, scaleY: sy * 0.9, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
    }
  }

  /** 버튼 id → 동작. 미구현 기능은 안내 토스트(데드 버튼 방지). */
  private runAction(id: string): void {
    switch (id) {
      case 'shop':
      case 'special':
      case 'limited':
        this.openShop();
        break;
      case 'daily':
        this.openDaily();
        break;
      case 'event':
        this.openSpin();
        break;
      case 'home':
        break; // 이미 홈
      case 'mission':
        this.toast('미션은 곧 업데이트돼요!');
        break;
      case 'noads':
        this.toast('광고 제거는 준비 중이에요.');
        break;
      case 'ach':
        this.toast('업적은 준비 중이에요.');
        break;
      case 'staff':
        this.toast('직원 관리는 준비 중이에요.');
        break;
      case 'codex':
        this.toast('도감은 준비 중이에요.');
        break;
    }
  }

  /** 레이아웃 로드 실패 시 최소 진입(영업시작만) — 화면이 비지 않도록 방어. */
  private buildFallback(): void {
    this.add.rectangle(GAME_WIDTH / 2, this.scale.height / 2, GAME_WIDTH, this.scale.height, hexc(COLORS.surfaceFloor));
    strokeText(this, GAME_WIDTH / 2, 320, '열정편의점', 48, { strokeColor: COLORS.brandGreen, strokeWidth: 8 }).setOrigin(0.5);
    this.button(GAME_WIDTH / 2, 640, 320, 96, '▶ 영업시작', COLORS.brandGreen, () => this.onPlay(), 32);
    if (import.meta.env?.DEV) this.buildTestLevelSelect();
  }

  private refreshHud(): void {
    const lives = availableLives(this.profile, Date.now());
    this.coinText?.setText(this.profile.coins.toLocaleString());
    this.heartText?.setText(String(lives));
    this.updateDailyDot();
  }

  /** 매일 체크 받기 가능 시 패널 우상단 알림 점. */
  private updateDailyDot(): void {
    const can = canClaimDaily(this.profile, Date.now());
    if (!this.dailyDot) {
      const n = this.layout?.nodeById(N.dailyPanel);
      if (!n) return;
      this.dailyDot = this.add
        .circle(n.x + (n.w ?? 104) / 2 - 6, n.y - (n.h ?? 111) / 2 + 6, 9, hexc(COLORS.stateWarn))
        .setDepth(60)
        .setStrokeStyle(2, 0xffffff);
    }
    this.dailyDot.setVisible(can);
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
  // 기본은 숨김(진열 디자인을 가리지 않게) + 좌상단 🧪 토글로 펼침. prod 빌드엔 아예 없음.
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
    const grid = this.add.container(0, 0).setDepth(95).setVisible(false);
    const dim = this.add.graphics();
    dim.fillStyle(0x000000, 0.55);
    dim.fillRect(0, startY - 70, GAME_WIDTH, GAME_HEIGHT);
    grid.add(dim);
    grid.add(strokeText(this, GAME_WIDTH / 2, startY - 34, '🧪 TEST 레벨 입장', 22, { color: COLORS.textWhite, strokeWidth: 0 }).setOrigin(0.5));
    levels.forEach((lv, i) => {
      const cx = startX + (i % cols) * (bw + gapX);
      const cy = startY + Math.floor(i / cols) * (bh + gapY);
      this.button(cx, cy, bw, bh, `L${lv}`, COLORS.gemBlue, () => this.scene.start('StoreScene', { levelIndex: lv - 1 }), 20, undefined, grid);
    });
    const toggle = this.add
      .text(40, 168, '🧪', { fontSize: '30px' })
      .setOrigin(0.5)
      .setDepth(96)
      .setInteractive({ useHandCursor: true });
    toggle.on('pointerup', () => grid.setVisible(!grid.visible));
  }

  // ─── 공용 오버레이 ───
  private overlay(titleStr: string): Phaser.GameObjects.Container {
    sfx(this, 'sfx_popup_open');
    const layer = this.add.container(0, 0).setDepth(200);
    layer.add(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT * 2, 0x000000, 0.6).setInteractive());
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

  // ─── 설정(BGM/효과음 토글) ───
  private openSettings(): void {
    const layer = this.overlay('설정');
    this.toggleRow(layer, 470, '🎵 배경음악', isBgmOn(), (on) => setBgmEnabled(this, on));
    this.toggleRow(layer, 560, '🔔 효과음', isSfxOn(), (on) => setSfxEnabled(on));
  }

  private toggleRow(layer: Phaser.GameObjects.Container, y: number, label: string, value: boolean, set: (on: boolean) => void): void {
    layer.add(strokeText(this, GAME_WIDTH / 2 - 200, y - 18, label, 26, { color: COLORS.hudText, strokeWidth: 0 }));
    this.button(
      GAME_WIDTH / 2 + 160,
      y,
      150,
      64,
      value ? 'ON' : 'OFF',
      value ? COLORS.brandGreen : COLORS.surfaceWood,
      () => {
        set(!value);
        layer.destroy();
        this.openSettings();
      },
      24,
      undefined,
      layer,
    );
  }

  // ─── 토스트 ───
  private toast(msg: string): void {
    const c = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 360).setDepth(300);
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

  // ─── 버튼 헬퍼 (오버레이/DEV 용 capsule 버튼. parent 지정 시 오버레이 layer 에 귀속) ───
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
    depth?: number,
  ): void {
    // parent 가 있으면 생성물을 모두 거기에 add → 오버레이 닫을 때 함께 제거(잔류버그 회피).
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      if (parent) parent.add(o);
      else if (depth !== undefined && 'setDepth' in o) (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(depth);
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
      const g = capsule(this, cx - w / 2, cy - h / 2, w, h, fill, { radius: 18 });
      if (depth !== undefined) g.setDepth(depth);
    }
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
