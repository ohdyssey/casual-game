import Phaser from 'phaser';
import { COLORS, strokeText, capsule } from '@casual/core';
import {
  loadProfile,
  saveProfile,
  type Profile,
  syncLives,
  availableLives,
  DEFAULT_AVATAR_KEY,
  MAX_LIVES,
  SHOP_ITEMS,
  purchase,
  canAfford,
  claimDaily,
  canClaimDaily,
  DAILY_REWARDS,
  applyReward,
  type Reward,
} from '../meta/index.js';
import { LEVEL_COUNT } from '../logic/levels.js';
import { buildLayout, type LayoutDoc, type LayoutIndex, type LayoutObject } from '../ui/layoutLoader.js';
import { showMessagePopup, applyProfile, renderLayoutFit } from './storeOverlays.js';
import { UI_HOME_LAYOUT_KEY, UI_MSG_LAYOUT_KEY, UI_MENU_LAYOUT_KEY } from '../assets.js';
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

// ── 진입화면 에디터 노드 id (blank.json = "게임로비", 세로 HD 1080×2400 재저장본) ──
const N = {
  bg: 'layer_1', // 매장 배경(1080×2400 풀프레임)
  profile: 'layer_5', // 프로필창(좌상단) — 밑에 레벨 표시
  signMain: 'layer_3_copy', // 열정편의점(간판 텍스트)
  signSub: 'layer_3', // CONVENIANCE STORE 24H
  coin: 'layer_13_copy7', // 코인 수치 "36,708"
  heartPanel: 'layer_7', // 헬쓰(하트) 바
  settings: 'layer_8', // 설정 기어
  playBtn: 'layer_14', // 영업시작 버튼
  lv: 'layer_3_copy2', // 프로필 배지 레벨(정적 "Lv 21" → 실제 레벨로 바인딩)
} as const;

// 좌/우 아이콘 버튼 — panel = 탭 히트 기준 노드, bounce = 탭 시 함께 눌리는 노드들.
// (재저장본은 좌=MISSION, 우=SPECIAL 두 개의 캔디 아이콘만 둔 간소 구성.)
const ICON_BTNS = [
  { id: 'mission', panel: 'layer_9_copy', bounce: ['layer_9', 'layer_9_copy', 'layer_2', 'layer_13'] },
  { id: 'special', panel: 'layer_9_copy2', bounce: ['layer_9_copy2', 'layer_2_copy', 'layer_13_copy'] },
] as const;

// 하단 메뉴(재저장본은 단일 버튼).
const NAV_BTNS = [{ id: 'event', icon: 'layer_10', bounce: ['layer_10'] }] as const;

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
      // 재저장본 blank.json 은 캔버스와 동일한 세로 HD(1080×2400) 프레임으로 저작됐다 →
      // FIT 로 1:1 렌더(별도 cover/reflow 불필요). buildLayout 이 노드를 디자인 좌표 그대로 배치.
      this.layout = buildLayout(this, doc);
      this.bindLayout();
    } else {
      this.buildFallback();
    }

    this.refreshHud();
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.refreshHud() });

    // 배경음악 시작(자동재생 잠김 시 첫 탭에서 시작).
    startBgm(this);
  }

  // ─── 동적 수치 + 인터랙션 바인딩 ───
  private bindLayout(): void {
    if (!this.layout) return;
    // 코인 수치(에디터 텍스트 노드 재사용).
    this.coinText = this.layout.tryById<Phaser.GameObjects.Text>(N.coin);

    // 하트 수 숫자는 숨김(에디터 하트 아이콘만 표시) — 숫자가 아이콘 위에 겹쳐 보이던 문제 제거.
    // (heartText 를 만들지 않음 → refreshHud 의 setText 는 옵셔널 체이닝으로 무동작.)

    // 통합 프로필 — 에디터가 저작한 프로필(배경 rect + 아바타 + 프레임)은 buildLayout 이 렌더하고,
    // 여기서는 아바타 텍스처만 사용자 아바타로 교체(디자인 위치·배경 유지).
    const homeDoc = this.cache.json.get(UI_HOME_LAYOUT_KEY) as LayoutDoc | undefined;
    if (homeDoc) applyProfile(this, this.layout, homeDoc, N.profile, this.profile.avatarKey ?? DEFAULT_AVATAR_KEY);
    // 현재 레벨 — 에디터 프로필 배지 노드(layer_3_copy2)를 실제 레벨로 바인딩.
    // (기존엔 정적 "Lv 21" 플레이스홀더 + 프로필 아래 별도 코드텍스트가 겹쳐 두 번(엉뚱한 값) 표시되던 것을
    //  디자이너 배지 위치의 단일 동적 값으로 정리.)
    const lvText = this.layout.tryById<Phaser.GameObjects.Text>(N.lv);
    lvText?.setText(`Lv ${this.profile.level}`);

    // 영업시작 + 설정.
    this.wireTap(N.playBtn, () => this.onPlay(), [N.playBtn]);
    this.wireTap(N.settings, () => this.openSettings(), [N.settings]);

    // 좌/우 아이콘 버튼.
    for (const b of ICON_BTNS) this.wireTap(b.panel, () => this.runAction(b.id), [...b.bounce]);
    // 하단 메뉴.
    for (const b of NAV_BTNS) this.wireTap(b.icon, () => this.runAction(b.id), [...b.bounce]);

    // 버전 표시(하단 바닥 고정).
    strokeText(this, this.scale.width / 2, this.scale.height - 44, 'v0.1.21', 22, { color: '#cfd3da', strokeWidth: 0 })
      .setOrigin(0.5)
      .setDepth(50);

    // DEV: 테스트용 레벨 선택 — 실제 빌드(prod)엔 없음.
    if (import.meta.env?.DEV) this.buildTestLevelSelect();
  }

  /**
   * 레이아웃 노드 위에 탭 영역(투명 zone)을 얹고 눌림 연출 + 핸들러를 배선.
   * 히트 영역은 에디터 노드의 표시 크기(w/h)에서 파생 → 세로 HD 재저장으로 아트가 커져도 자동 정합.
   */
  private wireTap(id: string, onClick: () => void, bounceIds: string[], dy = 0): void {
    const node = this.layout?.nodeById(id);
    const ref = this.layout?.tryById<LayoutObject>(id) as (LayoutObject & { x: number; y: number }) | undefined;
    if (!node || !ref) return;
    const w = node.w ?? 120;
    const h = node.h ?? 120;
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

  /** 버튼 id → 동작(재저장본 버튼 구성에 맞춰 실기능 연결). */
  private runAction(id: string): void {
    switch (id) {
      case 'mission':
        this.openDaily();
        break;
      case 'special':
        this.openShop();
        break;
      case 'event':
        this.openLevelSelect(); // 하단 좌측 장바구니(layer_10) → 전체 레벨 선택 패널
        break;
    }
  }

  /** 레이아웃 로드 실패 시 최소 진입(영업시작만) — 화면이 비지 않도록 방어. */
  private buildFallback(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.add.rectangle(w / 2, h / 2, w, h, hexc(COLORS.surfaceFloor));
    strokeText(this, w / 2, h * 0.32, '열정편의점', 60, { strokeColor: COLORS.brandGreen, strokeWidth: 8 }).setOrigin(0.5);
    this.button(w / 2, h / 2, 360, 120, '▶ 영업시작', COLORS.brandGreen, () => this.onPlay(), 36);
    if (import.meta.env?.DEV) this.buildTestLevelSelect();
  }

  private refreshHud(): void {
    const lives = availableLives(this.profile, Date.now());
    this.coinText?.setText(this.profile.coins.toLocaleString());
    this.heartText?.setText(String(lives));
  }

  // ─── 플레이 ───
  // 하트는 **진입 시 소모하지 않고**, 레벨 실패 시에만 1개 차감(StoreScene). 0이면 진입 차단.
  private onPlay(): void {
    if (availableLives(this.profile, Date.now()) <= 0) {
      this.toast('하트가 모두 떨어졌어요. 잠시 후 충전되거나 상점에서 채울 수 있어요');
      return;
    }
    const levelIndex = (this.profile.level - 1) % LEVEL_COUNT;
    this.scene.start('StoreScene', { levelIndex });
  }

  // ─── DEV: 테스트 레벨 선택(1, 25, 50, … ) — 하트 소모 없이 바로 입장 ───
  // 기본은 숨김(진열 디자인을 가리지 않게) + 좌상단 🧪 토글로 펼침. prod 빌드엔 아예 없음.
  private buildTestLevelSelect(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const levels: number[] = [1];
    for (let n = 25; n <= LEVEL_COUNT; n += 25) levels.push(n);
    const cols = 5;
    const bw = 180;
    const bh = 74;
    const gapX = 14;
    const gapY = 14;
    const gridW = cols * bw + (cols - 1) * gapX;
    const startX = w / 2 - gridW / 2 + bw / 2;
    const startY = h / 2 - 40;
    const grid = this.add.container(0, 0).setDepth(95).setVisible(false);
    const dim = this.add.graphics();
    dim.fillStyle(0x000000, 0.55);
    dim.fillRect(0, 0, w, h);
    grid.add(dim);
    grid.add(strokeText(this, w / 2, startY - 60, '🧪 TEST 레벨 입장', 30, { color: COLORS.textWhite, strokeWidth: 0 }).setOrigin(0.5));
    levels.forEach((lv, i) => {
      const cx = startX + (i % cols) * (bw + gapX);
      const cy = startY + Math.floor(i / cols) * (bh + gapY);
      this.button(cx, cy, bw, bh, `L${lv}`, COLORS.gemBlue, () => this.scene.start('StoreScene', { levelIndex: lv - 1 }), 26, undefined, grid);
    });
    const toggle = this.add
      .text(60, 300, '🧪', { fontSize: '44px' })
      .setOrigin(0.5)
      .setDepth(96)
      .setInteractive({ useHandCursor: true });
    toggle.on('pointerup', () => grid.setVisible(!grid.visible));
  }

  // ─── 공용 오버레이 ───
  private overlay(titleStr: string): Phaser.GameObjects.Container {
    sfx(this, 'sfx_popup_open');
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2; // 세로 HD 캔버스 중앙 기준으로 팝업 배치
    const panelW = 620;
    const panelH = 780;
    const panelTop = cy - panelH / 2;
    const layer = this.add.container(0, 0).setDepth(200);
    layer.add(this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.6).setInteractive());
    const panelBg = this.add.graphics();
    panelBg.fillStyle(0xffffff, 1);
    panelBg.fillRoundedRect(cx - panelW / 2, panelTop, panelW, panelH, 28);
    layer.add(panelBg);
    layer.add(strokeText(this, cx, panelTop + 54, titleStr, 40, { strokeColor: COLORS.brandGreen, strokeWidth: 7 }).setOrigin(0.5));
    // 닫기
    const closeX = cx + panelW / 2 - 44;
    const closeY = panelTop + 44;
    const close = this.add.circle(closeX, closeY, 28, hexc(COLORS.stateWarn));
    layer.add(close);
    layer.add(strokeText(this, closeX, closeY, '✕', 28, { strokeWidth: 0 }).setOrigin(0.5));
    layer.add(
      this.add
        .zone(closeX, closeY, 60, 60)
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
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const layer = this.overlay('상점');
    SHOP_ITEMS.forEach((item, i) => {
      const y = cy - 210 + i * 96;
      const afford = canAfford(this.profile, item);
      this.panelRow(layer, cx - 250, y - 38, 500, 76, afford ? COLORS.surfaceFloor : '#dddddd', 14);
      layer.add(strokeText(this, cx - 230, y - 16, item.label, 24, { color: COLORS.hudText, strokeWidth: 0 }));
      const cost = item.cost.coins ? `🪙 ${item.cost.coins}` : `💎 ${item.cost.gems}`;
      layer.add(strokeText(this, cx + 150, y - 16, cost, 22, { color: afford ? COLORS.brandGreen : COLORS.stateWarn, strokeWidth: 0 }));
      layer.add(
        this.add
          .zone(cx, y, 500, 76)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            const bought = purchase(this.profile, item);
            if (!bought) {
              this.toast('보유 재화가 부족해요');
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

  private openDaily(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const layer = this.overlay('데일리 보상');
    DAILY_REWARDS.forEach((r, i) => {
      const claimed = i < this.profile.dailyStreak % DAILY_REWARDS.length || (this.profile.dailyStreak > 0 && !canClaimDaily(this.profile, Date.now()) && i === (this.profile.dailyStreak - 1) % DAILY_REWARDS.length);
      const y = cy - 200 + i * 70;
      this.panelRow(layer, cx - 250, y - 28, 500, 56, claimed ? '#cccccc' : COLORS.surfaceFloor, 12);
      layer.add(strokeText(this, cx - 230, y - 12, `Day ${i + 1}`, 22, { color: COLORS.hudText, strokeWidth: 0 }));
      layer.add(strokeText(this, cx + 40, y - 12, rewardText(r), 20, { color: COLORS.brandGreen, strokeWidth: 0 }));
    });
    const can = canClaimDaily(this.profile, Date.now());
    this.button(cx, cy + 290, 300, 84, can ? '🎁 받기' : '내일 다시', can ? COLORS.brandGreen : COLORS.surfaceWood, () => {
      const res = claimDaily(this.profile, Date.now());
      if (!res) {
        this.toast('오늘 보상은 이미 받았어요');
        return;
      }
      this.profile = applyReward(res.profile, res.reward);
      saveProfile(this.profile);
      this.refreshHud();
      layer.destroy();
      this.toast(`🎁 ${rewardText(res.reward)} 획득!`);
    }, 24, undefined, layer);
  }

  // ─── 레벨 선택 패널(하단 좌측 장바구니 버튼에서 호출) — 전체 레벨 중 골라 즉시 입장(테스트/막힘 탈출) ───
  /** 전체 레벨(1~LEVEL_COUNT)을 페이지 그리드로 표시. 탭하면 그 레벨로 StoreScene 시작. 현재 진행 레벨 강조. */
  private openLevelSelect(): void {
    sfx(this, 'sfx_popup_open');
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const cy = h / 2;

    const COLS = 5;
    const PER_PAGE = COLS * 8; // 페이지당 40레벨
    const pageCount = Math.ceil(LEVEL_COUNT / PER_PAGE);
    const current = (this.profile.level - 1) % LEVEL_COUNT; // 현재 진행 레벨(0-based)

    const layer = this.add.container(0, 0).setDepth(300);
    layer.add(this.add.rectangle(cx, cy, w, h, 0x000000, 0.7).setInteractive()); // 뒤 입력 차단

    const panelW = 940;
    const panelH = 1560;
    const panelTop = cy - panelH / 2;
    const pg = this.add.graphics();
    pg.fillStyle(0xffffff, 1);
    pg.fillRoundedRect(cx - panelW / 2, panelTop, panelW, panelH, 32);
    layer.add(pg);
    layer.add(strokeText(this, cx, panelTop + 72, '레벨 선택', 48, { strokeColor: COLORS.brandGreen, strokeWidth: 8 }).setOrigin(0.5));

    // 닫기(✕).
    const closeX = cx + panelW / 2 - 62;
    const closeY = panelTop + 60;
    layer.add(this.add.circle(closeX, closeY, 40, hexc(COLORS.stateWarn)));
    layer.add(strokeText(this, closeX, closeY, '✕', 40, { strokeWidth: 0 }).setOrigin(0.5));
    layer.add(
      this.add
        .zone(closeX, closeY, 92, 92)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => { sfx(this, 'sfx_popup_close'); layer.destroy(); }),
    );

    // 레벨 버튼 그리드(페이지 전환 시 이 컨테이너만 갱신).
    const gridLayer = this.add.container(0, 0);
    layer.add(gridLayer);
    const bw = 150;
    const bh = 120;
    const gapX = 20;
    const gapY = 20;
    const gridW = COLS * bw + (COLS - 1) * gapX;
    const startX = cx - gridW / 2 + bw / 2;
    const startY = panelTop + 190;
    let page = Math.floor(current / PER_PAGE);

    const navY = panelTop + panelH - 84;
    const pageLabel = strokeText(this, cx, navY, '', 36, { color: COLORS.hudText, strokeWidth: 0 }).setOrigin(0.5);
    layer.add(pageLabel);

    const renderPage = (): void => {
      gridLayer.removeAll(true);
      const base = page * PER_PAGE;
      for (let i = 0; i < PER_PAGE; i++) {
        const lv = base + i; // 0-based 레벨 인덱스
        if (lv >= LEVEL_COUNT) break;
        const bx = startX + (i % COLS) * (bw + gapX);
        const by = startY + Math.floor(i / COLS) * (bh + gapY);
        const isCurrent = lv === current;
        const g = this.add.graphics();
        g.fillStyle(hexc(isCurrent ? COLORS.brandAccent : COLORS.gemBlue), 1);
        g.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 20);
        gridLayer.add(g);
        gridLayer.add(strokeText(this, bx, by, `${lv + 1}`, 42, { strokeWidth: 0 }).setOrigin(0.5));
        gridLayer.add(
          this.add
            .zone(bx, by, bw, bh)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
              sfx(this, 'sfx_button_tap');
              layer.destroy();
              this.scene.start('StoreScene', { levelIndex: lv });
            }),
        );
      }
      pageLabel.setText(`${page + 1} / ${pageCount}`);
    };

    // 이전/다음 페이지.
    const mkNav = (nx: number, label: string, delta: number): void => {
      const g = this.add.graphics();
      g.fillStyle(hexc(COLORS.brandGreen), 1);
      g.fillRoundedRect(nx - 90, navY - 46, 180, 92, 22);
      layer.add(g);
      layer.add(strokeText(this, nx, navY, label, 40, { strokeWidth: 0 }).setOrigin(0.5));
      layer.add(
        this.add
          .zone(nx, navY, 180, 92)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            const next = page + delta;
            if (next < 0 || next >= pageCount) return;
            page = next;
            sfx(this, 'sfx_button_tap');
            renderPage();
          }),
      );
    };
    mkNav(cx - panelW / 2 + 130, '◀', -1);
    mkNav(cx + panelW / 2 - 130, '▶', 1);

    renderPage();
  }

  // ─── 설정/메뉴 — 에디터 "팝업 메뉴표시"(blank_3_copy_copy) SSOT 적용(플레이 화면과 동일 디자인). ───
  // 버튼은 이미지 키로 매핑(노드 id·배치 순서 무관). 미로드 시 코드 폴백(openSettingsLegacy).
  private openSettings(): void {
    const doc = this.cache.json.get(UI_MENU_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!doc?.nodes?.length) { this.openSettingsLegacy(); return; }
    sfx(this, 'sfx_popup_open');
    const w = this.scale.width;
    const h = this.scale.height;
    const layer = this.add.container(0, 0).setDepth(250);
    layer.add(this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.6).setInteractive());
    const rl = renderLayoutFit(this, doc, 251);
    layer.add(rl.container);
    // 제목 노드는 "게임일시 정지"(플레이 문맥) → 홈에선 "설정"으로 재바인딩.
    rl.index.tryById<Phaser.GameObjects.Text>('layer_3')?.setText('설정');

    const close = (): void => { sfx(this, 'sfx_popup_close'); layer.destroy(); this.refreshHud(); };
    const reopen = (): void => { layer.destroy(); this.openSettings(); };
    // 버튼 이미지 키 → 동작(플레이 메뉴와 동일; 홈에선 CONTINUE/HOME = 닫기).
    const actions: Record<string, () => void> = {
      'up_UI_profile_04-3': close, // ▶ CONTINUE
      'up_UI_profile_04-1': () => { setSfxEnabled(!isSfxOn()); reopen(); }, // 🔔 SFX
      'up_UI_profile_04-2': () => { setBgmEnabled(this, !isBgmOn()); reopen(); }, // 🎵 BGM
      'up_UI_profile_04-4': close, // 🏠 HOME(이미 홈) = 닫기
    };
    // 토글 OFF 는 흐리게(에셋 단일 상태 → 알파로 켜짐/꺼짐 피드백).
    const dimmed: Record<string, boolean> = {
      'up_UI_profile_04-1': !isSfxOn(),
      'up_UI_profile_04-2': !isBgmOn(),
    };
    for (const n of doc.nodes) {
      if (n.type !== 'image' || !n.key) continue;
      const obj = rl.index.tryById<Phaser.GameObjects.Image>(n.id);
      if (obj && dimmed[n.key]) obj.setAlpha(0.45);
      const onClick = actions[n.key];
      const rect = rl.worldRect(n.id);
      if (!onClick || !rect) continue;
      const zone = this.add
        .zone(rect.x, rect.y, rect.w, rect.h)
        .setInteractive({ useHandCursor: true })
        .setDepth(252)
        .on('pointerdown', () => {
          if (obj) {
            const bx = obj.scaleX;
            const by = obj.scaleY;
            this.tweens.killTweensOf(obj);
            this.tweens.add({ targets: obj, scaleX: bx * 0.9, scaleY: by * 0.9, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
          }
          onClick();
        });
      layer.add(zone); // layer 파괴 시 존도 함께 제거
    }
  }

  // ─── (폴백) 코드 드로우 설정 — 에디터 레이아웃 미로드 시. ───
  private openSettingsLegacy(): void {
    const cy = this.scale.height / 2;
    const layer = this.overlay('설정');
    this.toggleRow(layer, cy - 60, '🎵 배경음악', isBgmOn(), (on) => setBgmEnabled(this, on));
    this.toggleRow(layer, cy + 50, '🔔 효과음', isSfxOn(), (on) => setSfxEnabled(on));
  }

  private toggleRow(layer: Phaser.GameObjects.Container, y: number, label: string, value: boolean, set: (on: boolean) => void): void {
    const cx = this.scale.width / 2;
    layer.add(strokeText(this, cx - 200, y - 18, label, 26, { color: COLORS.hudText, strokeWidth: 0 }));
    this.button(
      cx + 160,
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

  // ─── 메시지 토스트 — 에디터 "빈 화면"(blank_4) SSOT. 미로드 시 코드 폴백. ───
  private toast(msg: string): void {
    if (showMessagePopup(this, UI_MSG_LAYOUT_KEY, msg)) return;
    const label = strokeText(this, 0, 0, msg, 30, { color: COLORS.textWhite, strokeWidth: 0 }).setOrigin(0.5);
    const halfW = Math.max(300, Math.ceil(label.width / 2) + 44);
    const c = this.add.container(this.scale.width / 2, this.scale.height * 0.16).setDepth(300);
    const bg = this.add.graphics();
    bg.fillStyle(hexc(COLORS.hudText), 1);
    bg.fillRoundedRect(-halfW, -40, halfW * 2, 80, 20);
    c.add(bg);
    c.add(label);
    this.tweens.add({ targets: c, alpha: 0, delay: 2400, duration: 600, onComplete: () => c.destroy() });
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
