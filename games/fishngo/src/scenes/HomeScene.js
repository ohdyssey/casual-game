/**
 * HomeScene — 메인 허브 (게임 화면 user2 모드 레이아웃 준용).
 *
 * 사용자 요청:
 *   - 게임 화면 (FishingScene user2) 레이아웃을 그대로 준용.
 *   - 게이지 / 아이템 아이콘 (미끼/낚시줄/릴/낚시대) 제거.
 *   - 뒷편 나무 패널 + CAST 버튼 모두 조금 아래로 배치 (메뉴 아이콘 비침범).
 *   - 자동 모드 / 유저 모드 I 버튼 숨김 → CAST 버튼이 곧 유저 모드 II 입장 트리거.
 *   - 4 메뉴 아이콘 (홈/강화/도감/상점) 그대로.
 */

import Phaser from 'phaser';
import { COLORS, LAYOUT, FONT, GAME_HEIGHT } from '../config/game.config.js';
import { strokeText, centerInBox } from '../ui/components.js';
import { placeContained, placeByWidth, getDisplayBounds } from '../ui/scale.js';
import { FishSpawner } from '../entities/FishSpawner.js';
import { loadProfile } from '../systems/UserProfile.js';
import { stopMusic } from '../systems/Music.js';
import { LOCATIONS } from '../config/assets.config.js';
import { buildLocationCard } from '../ui/LocationCard.js';
import { buildChromeFromLayout, fillHeartsInto, resolveBind } from '../ui/sceneChrome.js';
import { playLayoutAnims, stopLayoutAnims, playAnimForTargets } from '@ohdyssey/phaser-ui-editor';
import { LOCATION_CARD_SPEC } from '../config/card.spec.js';
// LocationCache.markVisited 는 LocationLoaderScene 이 단일 owner — HomeScene 에선 호출 안 함.

// z-depth — FishingScene 과 동일 규약.
const DEPTH = {
  bg:      0,
  fish:    7,
  water:   8,
  deck:   11,
  card:    40,    // 낚시터 카드 (캐러셀)
  castBtn: 90,
  hud:    110,
  cast:   130,
  tabs:   140,
  toast: 1000,
};

// 사용자 요청(임시): 메인화면 유영 물고기 제거.
//   복구하려면 true 로 되돌리면 됨 — _buildAmbientFish / update / shutdown 로직은 그대로 보존.
const AMBIENT_FISH_ENABLED = false;

export class HomeScene extends Phaser.Scene {
  constructor() { super('HomeScene'); }

  // 상단 HUD 크롬을 에디터 레이아웃(home.json)으로 구동 — 캐시버스트로 편집 즉시 반영. 없으면 절차적 폴백.
  preload() {
    this.cache.json.remove('layout_home');
    this.load.json('layout_home', `ui/layouts/home.json?t=${Date.now()}`);
    this.cache.json.remove('layout_home_tabs');
    this.load.json('layout_home_tabs', `ui/layouts/home_tabs.json?t=${Date.now()}`);
    this.load.once('loaderror', () => { /* 파일 없음 → create 에서 폴백 */ });
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.profile = loadProfile();

    // 톨한 화면(예: Galaxy Z Flip, 9:21+) 대응 — 디자인 기준(1280)보다 큰 추가 높이의 절반만큼
    //   카드+CAST 군집을 위로 올려 화면 중앙에 배치(아래 쏠림 방지). HUD(상단)·데크/탭(하단)은 가장자리 고정.
    //   1280 화면에선 shift=0 → 기존 레이아웃 그대로.
    this._clusterShiftY = -Math.round(Math.max(0, H - GAME_HEIGHT) * 0.5);

    // 사용자 보고: FishingScene 다녀온 뒤 CAST 가 다시 안 눌리는 문제.
    //   Phaser 씬 인스턴스는 재사용되므로 instance 변수가 stale 한 상태로 남음.
    //   create() 진입마다 per-run 상태 reset.
    this._starting = false;
    this._swipeStart = null;
    this._selectedIndex = 0;
    this._hudContainer = null;        // 씬 재진입 대비 — 폴백 시 이전 run 의 파괴된 참조가 남지 않게 리셋
    this._tabsContainer = null;       // 하단 탭바 컨테이너(바텀앵커) — 동일 리셋

    this._buildBackground(W, H);
    this._buildTopChrome(W);                                 // 상단 HUD = 에디터 레이아웃(home.json) or 폴백
    if (AMBIENT_FISH_ENABLED) this._buildAmbientFish(W);   // 임시 비활성 (사용자 요청)
    this._buildWoodDeck(W);
    this._buildLocationCarousel(W);
    this._buildCastButton(W);
    this._buildBottomTabsChrome(W);                          // 하단 탭바 = 에디터 레이아웃(home_tabs.json, 바텀앵커) or 폴백

    // 사용자 요청: 홈 화면은 배경음악 없음 — 이전 씬(낚시 등)에서 넘어온 BGM 도 정지.
    stopMusic();

    // 씬 종료 시 정리
    this.events.once('shutdown', this._shutdown, this);
    this.events.once('destroy',  this._shutdown, this);
    // 씬 sleep/pause(다른 씬으로 전환·오버레이) 시 카드 애니 정지, 복귀 시 재개.
    //   ⚠ Phaser shutdown 은 리스너를 제거하지 않으므로(재시작 시 누적) 인스턴스당 1회만 바인딩.
    if (!this._cardAnimEventsBound) {
      this._cardAnimEventsBound = true;
      this.events.on('sleep',  this._pauseCardAnims, this);
      this.events.on('pause',  this._pauseCardAnims, this);
      this.events.on('wake',   this._resumeCardAnims, this);
      this.events.on('resume', this._resumeCardAnims, this);
    }
  }

  update(timeMs, deltaMs) {
    const dt = deltaMs / 1000;
    // hook 없이 빈 헤드 fish 만 헤엄치게 (잡힘 X).
    this.spawner?.update(dt, null);
    // UI 애니메이션 스프링 적분(선택 카드 + 트리거 1회성).
    if (this._cardIdle) this._cardIdle.tick(dt);
    if (this._cardFx && this._cardFx.length) for (const h of this._cardFx) h.tick(dt);
  }

  _shutdown() {
    this.tweens?.killAll();
    this.spawner?.destroyAll?.();
    try { stopLayoutAnims(this._cardIdle); this._cardIdle = null; (this._cardFx || []).forEach((h) => h.stop()); this._cardFx = []; } catch { /* */ }
  }

  // 선택(중앙) 카드의 상시(idle) 애니메이션 재생 — 선택 변경 시 갱신. (game-wired UI 애니메이션)
  _playCenterIdle(fireEnter) {
    try { stopLayoutAnims(this._cardIdle); } catch { /* */ }
    this._cardIdle = null;
    const card = this._cards?.[this._selectedIndex]?.img;
    if (!card || !card.__nodeMap || !card.__layout) return;
    this._cardIdle = playLayoutAnims(this, card.__nodeMap, card.__layout, { only: 'idle', container: card });
    if (fireEnter) this._fireCardTrigger('enter');
  }
  // 트리거(등장/탭) 1회 발화 — 2.6s 후 자동 정리.
  _fireCardTrigger(trigger) {
    const card = this._cards?.[this._selectedIndex]?.img;
    if (!card || !card.__nodeMap || !card.__layout) return;
    const h = playLayoutAnims(this, card.__nodeMap, card.__layout, { only: trigger, container: card });
    if (h.empty) { h.stop(); return; }
    this._cardFx = this._cardFx || [];
    this._cardFx.push(h);
    this.time.delayedCall(2600, () => { try { h.stop(); } catch { /* */ } this._cardFx = (this._cardFx || []).filter((x) => x !== h); });
  }
  // 컬링 pause/resume — 팝업 오버레이·씬 sleep 시 카드 애니 정지(update tick는 paused 핸들을 no-op).
  _pauseCardAnims() {
    try { this._cardIdle?.pause(); (this._cardFx || []).forEach((h) => h.pause()); } catch { /* */ }
  }
  _resumeCardAnims() {
    try { this._cardIdle?.resume(); (this._cardFx || []).forEach((h) => h.resume()); } catch { /* */ }
  }

  // ─── 배경 — 선택된 낚시터(location) 의 배경 사용 + 선택 변경 시 크로스페이드 ───
  _buildBackground(W, H) {
    const initialLoc = LOCATIONS[this._selectedIndex ?? 0] ?? LOCATIONS[0];
    const key = this._resolveBgKey(initialLoc);
    this._currentBgKey = key;
    this.bg = this._spawnBg(W, H, key);
    this.bg.setAlpha(1);
    // 초기 선택 스테이지의 실제 배경이 미로드(beach fallback)면 lazy-load 후 크로스페이드.
    if (initialLoc?.bgKey && initialLoc.bgKey !== key) this._updateBackgroundForLocation();
  }

  _resolveBgKey(loc) {
    const key = loc?.bgKey ?? 'bg_fishing';
    return this.textures.exists(key) ? key : 'bg_fishing';
  }

  _spawnBg(W, H, key) {
    const bg = this.add.image(W / 2, H / 2, key);
    bg.setOrigin(0.5);
    const tex = bg.texture.getSourceImage();
    const s = Math.max(W / tex.width, H / tex.height);
    bg.setScale(s);
    bg.setDepth(DEPTH.bg);
    return bg;
  }

  // ─── 카드 선택 변경 시 배경 크로스페이드 (미로드 배경은 lazy-load) ───
  _updateBackgroundForLocation() {
    const loc = LOCATIONS[this._selectedIndex] ?? LOCATIONS[0];
    const key = loc?.bgKey;

    // 이미 로드된 텍스처면 즉시 크로스페이드.
    if (key && this.textures.exists(key)) { this._crossfadeBg(key); return; }

    // 미로드(예: bg_stage_NN) → 해당 배경만 lazy-load 후 크로스페이드.
    //   홈 캐러셀에서 모든 스테이지 배경을 보여주되 초기 로드는 늘리지 않는다(50 스테이지 확장 안전).
    if (key && loc.bgPath) {
      if (this._bgLoadingKey === key) return;             // 동일 키 중복 로드 방지
      this._bgLoadingKey = key;
      this.load.image(key, loc.bgPath);
      this.load.once(`filecomplete-image-${key}`, () => {
        this._bgLoadingKey = null;
        // 로드 완료 시 같은 스테이지가 여전히 선택돼 있을 때만 적용(빠른 스크롤 레이스 가드).
        const cur = LOCATIONS[this._selectedIndex];
        if (cur?.bgKey === key && this.textures.exists(key)) this._crossfadeBg(key);
      });
      this.load.once('loaderror', () => { this._bgLoadingKey = null; });
      this.load.start();
      return;
    }

    // 키/경로 없음 → beach fallback.
    this._crossfadeBg('bg_fishing');
  }

  // 배경 이미지 교체 — 새 bg 페이드인 + 옛 bg 페이드아웃 후 파기.
  _crossfadeBg(newKey) {
    if (this._currentBgKey === newKey) return;
    this._currentBgKey = newKey;

    const W = this.scale.width;
    const H = this.scale.height;
    const newBg = this._spawnBg(W, H, newKey);
    newBg.setAlpha(0);

    const oldBg = this.bg;
    this.bg = newBg;

    this.tweens.add({
      targets: newBg, alpha: 1, duration: 400, ease: 'Sine.Out',
    });
    if (oldBg) {
      this.tweens.add({
        targets: oldBg, alpha: 0, duration: 400, ease: 'Sine.Out',
        onComplete: () => oldBg.destroy(),
      });
    }
  }

  // ─── 상단 HUD (FishingScene 과 동일 패턴) ───
  _buildTopHUDRow(W) {
    const cy = LAYOUT.hudBarY;
    const pad = LAYOUT.outerPad;
    const leftW = LAYOUT.hudLeftW, rightW = LAYOUT.hudRightW;

    const livesCx = pad + leftW / 2;
    const lives = placeByWidth(this, 'hud_lives_bar', livesCx, cy, leftW);
    lives.setDepth(DEPTH.hud);
    this._fillHearts(lives, 4);

    const nextLifeBg = placeByWidth(this, 'bar_progress', livesCx, LAYOUT.nextLifeY,
      leftW * 0.9);
    nextLifeBg.setDepth(DEPTH.hud - 2);
    const nextLife = strokeText(this, livesCx, LAYOUT.nextLifeY,
      'Next life in: 18m 24s', FONT.size.sm,
      { color: '#ffd147', strokeColor: COLORS.textStroke, strokeWidth: 3 });
    centerInBox(nextLife, 0.5);
    nextLife.setDepth(DEPTH.hud - 1);

    const coinCx = W - pad - rightW / 2;
    const coinBar = placeByWidth(this, 'hud_coin_bar', coinCx, cy, rightW);
    coinBar.setDepth(DEPTH.hud);
    const goldTxt = strokeText(this, coinBar.x + rightW * 0.10, coinBar.y,
      `${(this.profile?.gold ?? 0).toLocaleString()}`, FONT.size.lg,
      { color: COLORS.textWhite, strokeColor: COLORS.textStroke, strokeWidth: 4 });
    centerInBox(goldTxt, 0.5);
    goldTxt.setDepth(DEPTH.hud + 1);

    const midLeft  = pad + leftW + 4;
    const midRight = W - pad - rightW - 4;
    const barH = lives.displayHeight;
    const starSize = Math.round(barH * LAYOUT.hudStarSizeFactor);
    const starCx = midLeft + 24 + starSize / 2;
    const starCy = cy - 8;
    const star = placeContained(this, 'hud_star', starCx, starCy, starSize, starSize);
    star.setDepth(DEPTH.hud + 1);
    const lvlTxt = strokeText(this, star.x, star.y + starSize * 0.06,
      `${this.profile?.level ?? 12}`, Math.round(starSize * 0.40),
      { color: COLORS.textWhite, strokeColor: '#a35a00', strokeWidth: 4 });
    centerInBox(lvlTxt, 0.5);
    lvlTxt.setDepth(DEPTH.hud + 2);

    const xpBarLeft  = star.x + starSize / 2 - LAYOUT.hudStarXpOverlap;
    const xpBarBoxW  = midRight - xpBarLeft;
    const xpBarCx    = xpBarLeft + xpBarBoxW / 2;
    const xpBar = placeByWidth(this, 'bar_progress', xpBarCx, cy, xpBarBoxW);
    xpBar.setDepth(DEPTH.hud);
    const xpTxt = strokeText(this, xpBar.x, xpBar.y,
      `${this.profile?.xp ?? 560} / 1000`, FONT.size.sm,
      { color: COLORS.textWhite, strokeColor: COLORS.textStroke, strokeWidth: 3 });
    centerInBox(xpTxt, 0.5);
    xpTxt.setDepth(DEPTH.hud + 1);
  }

  _fillHearts(barImg, filled) {
    const b = getDisplayBounds(barImg);
    const slots = 5;
    const innerLeft  = b.left + b.w * 0.0575;
    const innerRight = b.left + b.w * 0.7825;
    const slotW = (innerRight - innerLeft) / slots;
    for (let i = 0; i < filled; i++) {
      const hx = innerLeft + slotW * (i + 0.5);
      const heart = placeContained(this, 'hud_heart', hx, barImg.y, slotW * 0.80, b.h * 0.78);
      heart.setDepth(DEPTH.hud + 1);
    }
  }

  _buildSecondRow(W) {
    const cy = LAYOUT.secondRowY;
    const pad = LAYOUT.outerPad;

    const boardW = LAYOUT.questBoardWidth;
    const board = placeByWidth(this, 'hud_quest_board', pad + boardW / 2, cy, boardW);
    board.setDepth(DEPTH.hud);

    const btnSize = 80;
    const btnCx = W - pad - btnSize / 2;
    const menuCy = LAYOUT.menuY;
    const rankCy = menuCy + btnSize + LAYOUT.rankMenuGap;
    const menu = placeContained(this, 'btn_menu', btnCx, menuCy, btnSize, btnSize);
    const rank = placeContained(this, 'btn_rank', btnCx, rankCy, btnSize, btnSize);
    menu.setDepth(DEPTH.cast); rank.setDepth(DEPTH.cast);
    this._makeClickable(menu, () => this._toast('MENU (TODO)'));
    this._makeClickable(rank, () => this._toast('RANK (TODO)'));
  }

  // ─── 상단 HUD 크롬 — 에디터 레이아웃(home.json) 구동, 없으면 기존 하드코드 폴백 ───
  //   공용 헬퍼(sceneChrome) 사용. anchor:'top' = 디자인프레임 중심 고정(톨폰에서 상단 유지).
  _buildTopChrome(W) {
    const res = buildChromeFromLayout(this, {
      cacheKey: 'layout_home', anchor: 'top', depth: DEPTH.hud,
      data: this._homeHudData(),
      onEntries: (entries, ctx) => {
        const lives = resolveBind(entries, 'lives', () => entries.find((e) => e.node.key === 'hud_lives_bar'));
        if (lives?.primary) fillHeartsInto(this, ctx.container, lives.primary, 4);
        const menu = resolveBind(entries, 'action:menu', () => entries.find((e) => e.node.key === 'btn_menu'));
        const rank = resolveBind(entries, 'action:rank', () => entries.find((e) => e.node.key === 'btn_rank'));
        if (menu) ctx.wire(menu, () => this._toast('MENU (TODO)'));
        if (rank) ctx.wire(rank, () => this._toast('RANK (TODO)'));
      },
      fallback: () => { this._buildTopHUDRow(W); this._buildSecondRow(W); },
    });
    this._hudContainer = res ? res.container : null;
  }

  // HUD 텍스트 바인딩 데이터(create 시 1회 — 라이브 갱신 없음, 기존 동작과 동일).
  _homeHudData() {
    const p = this.profile || {};
    return {
      gold:     `${(p.gold ?? 0).toLocaleString()}`,
      level:    `${p.level ?? 12}`,
      xp:       `${p.xp ?? 560} / 1000`,
      nextLife: 'Next life in: 18m 24s',
    };
  }

  // ─── 하단 탭바 — 에디터 레이아웃(home_tabs.json) 구동, 없으면 기존 하드코드 폴백 ───
  //   공용 헬퍼 + anchor:'bottom' = 화면 하단 고정(톨폰 대응). 탭 클릭은 role 로 연결.
  _buildBottomTabsChrome(W) {
    const openPopup = (key) => {
      if (this.scene.isActive(key)) return;
      this.scene.launch(key);
      this._pauseCardAnims();                                  // 팝업 동안 카드 애니 일시정지(원본과 동일)
      const popup = this.scene.get(key);
      if (popup) popup.events.once('shutdown', () => this._resumeCardAnims());
    };
    const res = buildChromeFromLayout(this, {
      cacheKey: 'layout_home_tabs', anchor: 'bottom', depth: DEPTH.tabs,
      roleHandlers: {
        'action:home':    () => this._toast('현재 홈 화면입니다'),
        'action:upgrade': () => openPopup('UpgradeScene'),
        'action:album':   () => openPopup('AlbumScene'),
        'action:shop':    () => openPopup('ShopScene'),
      },
      fallback: () => this._buildBottomMenus(W),
    });
    this._tabsContainer = res ? res.container : null;
  }

  // ─── 헤엄치는 fish (시각 효과만 — 잡을 수 없음) ───
  _buildAmbientFish(W) {
    this.spawner = new FishSpawner(this, W);
    this.spawner.start();
    this.spawner.warmup();
  }

  // ─── 나무 패널 — 사용자 요청: 더 밑으로 ───
  _buildWoodDeck(W) {
    const sh = this.scale.height;
    // FishingScene user2: 156. 1차 조정 130 → 사용자 추가 요청 90 (더 아래로 40px).
    //   deckCy = sh-90 = 1190 → 데크 spans 976~1404. 메뉴(1110~1260) 안전 커버.
    const deckOffsetFromBottom = 90;
    const widthScale = 1.45;
    const deckCy = sh - deckOffsetFromBottom;
    const deck = this.add.image(W / 2, deckCy, 'panel_wood_board');
    deck.setOrigin(0.5);
    const tex = deck.texture.getSourceImage();
    const s = (W * widthScale) / tex.width;
    deck.setScale(s);
    deck.setDepth(DEPTH.deck);
  }

  // ─── 낚시터 카드 캐러셀 ───
  //   3장의 카드 (해변/빙하/홍콩) 가 좌-중-우 슬롯에 배치.
  //   - 가운데 카드 = 선택됨 (큰 사이즈, 풀 alpha).
  //   - 옆 카드 = 작고 흐림 — 살짝만 보임 (preview).
  //   - 좌/우 스와이프 또는 옆 카드 탭 → 선택 변경 + 카드 회전 애니메이션.
  _buildLocationCarousel(W) {
    const sh = this.scale.height;

    // 동적 LocationCard 프레임 = 408×645 (레거시 baked 501×620 보다 좁고 김).
    const CARD_W = 408, CARD_H = 645;

    // ─── 카드 크기 = 화면폭 목표(70%) ∩ 세로 밴드(HUD 밑 ~ CAST 위) ───
    //   CAST 는 메뉴바 위 고정(castCy=sh-295, 반경125 → 상단 sh-420). 카드는 그 위 밴드에서 크기 결정.
    const WIDTH_TARGET = 0.70;
    const widthScale = (WIDTH_TARGET * W) / CARD_W;              // 0.70×720/408 ≈ 1.235
    const dispY = this.scale.displayScale?.y || 1;
    const safeTop = ((typeof window !== 'undefined' && window.__safeArea?.top) || 0) * dispY;       // 노치만큼 HUD 내려옴
    const safeBottom = ((typeof window !== 'undefined' && window.__safeArea?.bottom) || 0) * dispY; // 홈바만큼 탭·CAST 올라옴
    const castTop = sh - 420 - safeBottom;                       // CAST 상단(메뉴바 위 고정) — 탭과 동일하게 홈바만큼 위로
    const hudClear = 242 + safeTop;                             // HUD(코인바+클립보드) 하단 + 여백 + 노치
    //   카드 "시각 상단"은 헤더 장식이 645 프레임보다 ~61px 돌출 → 중심→시각상단=384, 전체 시각높이=707(실측).
    const FRAME_HALF = CARD_H / 2;       // 322.5 — 중심→프레임 하단
    const TOP_EXT = 384;                 // 중심→시각 상단(헤더 포함)
    const VIS_H = TOP_EXT + FRAME_HALF;  // 706.5 — 카드 전체 시각 높이 @scale1
    const bandFit = (castTop + 50 - hudClear) / VIS_H;          // 밴드(HUD밑~CAST위+50겹침)에 들어가는 최대 스케일
    const baseScale = Math.max(0.85, Math.min(widthScale, bandFit));
    const sideScale = 0.70;                                      // 옆 카드 — 겹치게
    const sideOffsetX = Math.round(175 * (baseScale / 0.88));    // 중앙 카드 커진 비율만큼 옆카드 바깥으로

    // ─── 위치 = 화면 세로 중앙. 단 시각상단이 HUD 밑·프레임바닥이 CAST 위(+50겹침)로 클램프 ───
    //   톨폰=세로 여유가 커서 진짜 중앙 / 짧은폰=밴드가 빠듯해 CAST 바로 위로 밀착(중앙 불가).
    const cardHalfH = FRAME_HALF * baseScale;
    const minCy = hudClear + TOP_EXT * baseScale;               // 시각상단이 HUD 밑
    const maxCy = castTop + 50 - cardHalfH;                     // 프레임바닥이 CAST 상단+50
    const cardCy = Math.round(Math.max(minCy, Math.min(sh / 2, maxCy)));

    this._cardCy = cardCy;
    this._cardBaseScale = baseScale;
    this._cardSideScale = sideScale;
    this._cardSideOffsetX = sideOffsetX;
    this._centerX = W / 2;
    this._cardWide = baseScale > 1.0;                            // 호환용(현재 미사용)

    this._selectedIndex = 0;              // 기본 선택: 해변
    this._cards = LOCATIONS.map((loc, i) => {
      const img = this._createCard(loc, W / 2, cardCy);
      img.setDepth(DEPTH.card);
      // 컨테이너 hit-area = 프레임 박스(로컬 중심 기준). config 형이라야 useHandCursor 적용.
      img.setInteractive({
        hitArea: new Phaser.Geom.Rectangle(-img.width / 2, -img.height / 2, img.width, img.height),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true,
      });
      img.on('pointerdown', (p) => this._onCardPointerDown(p, i));
      return { img, loc };
    });
    this._applyCardLayout(false);         // 초기 위치 (no anim) + 중앙 카드 idle 재생
    this._fireCardTrigger('enter');       // 초기 등장 트리거

    // 전역 swipe 감지 — 카드 영역 내에서 시작된 드래그만 처리. (카드 크기에 비례)
    this._swipeStart = null;
    const cardHalf = (CARD_H * baseScale) / 2 + 40;
    const cardTop = cardCy - cardHalf;
    const cardBottom = cardCy + cardHalf;
    this.input.on('pointerdown', (p) => {
      if (p.y >= cardTop && p.y <= cardBottom) {
        this._swipeStart = { x: p.x, y: p.y };
      }
    });
    this.input.on('pointerup', (p) => {
      if (!this._swipeStart) return;
      const dx = p.x - this._swipeStart.x;
      const dy = p.y - this._swipeStart.y;
      this._swipeStart = null;
      // 가로 swipe 만 (세로 swipe 무시)
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) this._navigateCard(1);   // 왼쪽 swipe → 다음 카드
        else        this._navigateCard(-1);  // 오른쪽 swipe → 이전 카드
      }
    });
  }

  // 카드 1장 생성 — 동적 LocationCard 우선, card 데이터 없으면 레거시 baked.
  //   반환 객체는 setCardTint(tint) / width / height / setDepth / setScale / setPosition 지원.
  //   사용자 요청: 50 스테이지 모두 동일한 LocationCard 구조 사용 (outline 카드 제거).
  _createCard(loc, cx, cy) {
    if (loc.card) {
      const card = buildLocationCard(this, cx, cy, { title: loc.name, ...loc.card });
      return card;
    }
    // 폴백 — 레거시 통짜 카드 이미지.
    const img = this.add.image(cx, cy, loc.key).setOrigin(0.5);
    img.setCardTint = (t) => (t == null || t === LOCATION_CARD_SPEC.tint.selected
      ? img.clearTint() : img.setTint(t));
    return img;
  }

  // (Outline 카드 코드 제거됨 — 50 스테이지 모두 LocationCard 구조 통일)

  _onCardPointerDown(p, i) {
    const target = LOCATIONS[i];
    // 잠긴 지역: 선택 차단 + 토스트 안내.
    if (!target.unlocked) {
      this._swipeStart = null;
      this._toast(`${target.name} — 잠김`);
      return;
    }
    if (i !== this._selectedIndex) {
      this._swipeStart = null;
      this._selectedIndex = i;
      this._applyCardLayout(true);
      this._updateBackgroundForLocation();
      this._fireCardTrigger('enter');           // 새 중앙 카드 등장
    } else {
      this._fireCardTrigger('tap');             // 선택된 카드 재탭 → 탭 트리거
    }
  }

  _navigateCard(delta) {
    // 잠긴 지역은 건너뛰어 다음 unlocked 카드를 찾음.
    let next = this._selectedIndex + delta;
    while (next >= 0 && next < this._cards.length && !LOCATIONS[next].unlocked) {
      next += delta;
    }
    if (next < 0 || next >= this._cards.length) return;
    if (next === this._selectedIndex) return;
    this._selectedIndex = next;
    this._applyCardLayout(true);
    this._updateBackgroundForLocation();
    this._fireCardTrigger('enter');             // 새 중앙 카드 등장
  }

  _applyCardLayout(animate) {
    //   비선택 카드: setTint 회색조 — 채도/명도 down (alpha 는 풀).
    //   잠긴(unlocked=false) 카드: setTint 단색톤 (monotone) — 원본 디테일 살리면서 단일 색조로 통일.
    const TINT_SELECTED = 0xffffff;     // 무변화 (full saturation, full brightness)
    const TINT_DIMMED   = 0x787e8a;     // ~ 48% 강도 — 비활성 카드 확실히 어둡게 (헤더 포함 전 요소)
    const TINT_LOCKED   = 0x4a5a7a;     // 모노 블루 톤 — 잠금

    this._cards.forEach((c, i) => {
      const slot = i - this._selectedIndex;
      const loc = LOCATIONS[i];
      let tx, ts, td;
      const visible = Math.abs(slot) <= 1;
      if (slot === 0) {
        tx = this._centerX;
        ts = this._cardBaseScale;
        td = DEPTH.card + 2;
      } else if (slot === -1) {
        tx = this._centerX - this._cardSideOffsetX;
        ts = this._cardSideScale;
        td = DEPTH.card + 1;
      } else if (slot === 1) {
        tx = this._centerX + this._cardSideOffsetX;
        ts = this._cardSideScale;
        td = DEPTH.card + 1;
      } else {
        // |slot|>1: 50 카드 시 동일 좌표 스택 → 마지막 카드가 위로 보이는 버그 해결.
        //   가시 영역 밖으로 멀리 보내고 setVisible(false) 로 렌더링 자체 차단.
        tx = this._centerX + Math.sign(slot) * 5000;     // 화면 밖
        ts = this._cardSideScale * 0.7;
        td = DEPTH.card;
      }
      c.img.setDepth(td);
      c.img.setVisible(visible);                          // 비가시 카드 렌더 제외
      c.img.setAlpha(visible ? 1.0 : 0);
      // tint 적용 — 잠금 우선 (단색톤), 다음 선택/비선택 분기.
      //   동적 카드(Container)는 자식 일괄 틴트하는 setCardTint 사용 (Container 는 setTint 없음).
      if (!loc.unlocked) {
        c.img.setCardTint(TINT_LOCKED);
      } else if (slot === 0) {
        c.img.setCardTint(TINT_SELECTED);
      } else {
        c.img.setCardTint(TINT_DIMMED);
      }
      // 슬롯 아이템 인터랙티브 — 중앙 카드만(사이드 아이콘 탭은 카드 선택으로 폴스루 + 사이드 hover 툴팁 방지).
      if (c.img.setSlotsInteractive) c.img.setSlotsInteractive(slot === 0);
      // 설명 텍스트는 보이는 모든 카드(중앙+양옆)에 표시 — wordWrap(wrapW)으로 카드 폭 안에서
      //   줄바꿈되고, 비활성 카드는 중앙 카드 뒤(낮은 depth)라 겹침이 없다. (사용자 요청: 비활성도 노출)
      const nmap = c.img.__nodeMap;
      if (nmap) {
        const showDetail = true;
        for (const entry of nmap.values()) {
          if (entry && entry.node && entry.node.binding === 'description') {
            for (const o of entry.objects) if (o && o.setVisible) o.setVisible(showDetail);
          }
        }
      }
      if (animate) {
        this.tweens.add({
          targets: c.img,
          x: tx, scale: ts,
          duration: 280, ease: 'Sine.Out',
        });
      } else {
        c.img.setPosition(tx, this._cardCy);
        c.img.setScale(ts);
      }
    });
    this._playCenterIdle();   // 중앙 카드 상시(idle) UI 애니메이션 갱신
  }

  // ─── CAST 버튼 — 사용자 요청: 조금 아래로, 메뉴 침범 X ───
  //   user2 castCy = sh-295. 메뉴 타일 top ≈ sh-95-75 = sh-170.
  //   CAST 반경 125 → CAST cy max = sh-170-125 = sh-295. 더 아래로 못 감.
  //   따라서 user2 위치 그대로 유지가 "최대한 아래" 의 의미.
  _buildCastButton(W) {
    const sh = this.scale.height;
    const safeBottom = ((typeof window !== 'undefined' && window.__safeArea?.bottom) || 0) * (this.scale.displayScale?.y || 1);
    const castCy = sh - 295 - safeBottom;   // 메뉴바 위 고정 — 탭(하단앵커)이 홈바만큼 위로 가므로 CAST도 동일 보정(어긋남 방지)

    const cast = this.add.sprite(W / 2, castCy, 'sprite_castbtn', 0);
    cast.setDepth(DEPTH.castBtn);
    const CAST_DISPLAY_SIZE = 250;
    cast.setScale(CAST_DISPLAY_SIZE / 256);
    cast.setInteractive({ useHandCursor: true });
    this.castBtn = cast;

    // 가벼운 pulse — 클릭 유도.
    this.tweens.add({
      targets: cast,
      scale: { from: cast.scale, to: cast.scale * 1.04 },
      yoyo: true, repeat: -1, duration: 800, ease: 'Sine.InOut',
    });

    // 사용자 보고: pointerup 기반은 종종 누락됨 → pointerdown 즉시 진입으로 단순화.
    //   pulse tween 이 cast.scale 을 계속 바꾸므로 baseScale 을 별도 저장 후 사용.
    const baseScale = cast.scale;
    cast.on('pointerdown', () => {
      if (this._starting) return;
      const selected = LOCATIONS[this._selectedIndex ?? 0] ?? LOCATIONS[0];
      // 방어 — locked 지역이면 진입 차단 (정상 흐름에서는 selectedIndex 가 unlocked 만 가리킴).
      if (!selected.unlocked) {
        this._toast(`${selected.name} — 잠김`);
        return;
      }
      this._starting = true;
      this.tweens.killTweensOf(cast);    // pulse 중단 (scale 충돌 방지)
      if (this.anims.exists('castbtn_press_down')) cast.play('castbtn_press_down');
      this.tweens.add({
        targets: cast, scale: baseScale * 0.92, yoyo: true, duration: 100,
        onComplete: () => {
          // 낚시터별 자산 lazy-load 후 FishingScene 으로 진입.
          //   LRU markVisited 는 LocationLoaderScene.create() 에서 단일 호출 (중복 write 방지).
          this.scene.start('LocationLoaderScene', {
            locId: selected.id,
            mode: 'user2',
            targetScene: 'FishingScene',
          });
        },
      });
    });
  }

  // ─── 하단 4 메뉴 (홈/강화/도감/상점) — FishingScene user2 와 동일 ───
  _buildBottomMenus(W) {
    const sh = this.scale.height;
    const pad = LAYOUT.outerPad;

    // 사용자 요청: 강화/도감/상점 → 화면 대부분 가리는 팝업 (scene.launch overlay).
    //   scene.start 는 현 씬 종료 → 팝업 X. scene.launch 는 위에 띄움.
    const openPopup = (key) => {
      if (this.scene.isActive(key)) return;
      this.scene.launch(key);
      // 팝업이 홈을 가리는 동안 카드 UI 애니메이션 일시정지(컬링·배터리 보호), 닫힘 시 재개.
      this._pauseCardAnims();
      const popup = this.scene.get(key);
      if (popup) popup.events.once('shutdown', () => this._resumeCardAnims());
    };
    const menus = [
      { key: 'icon_menu_home',    label: '홈',   onClick: () => this._toast('현재 홈 화면입니다') },
      { key: 'icon_menu_upgrade', label: '강화', onClick: () => openPopup('UpgradeScene') },
      { key: 'icon_menu_album',   label: '도감', onClick: () => openPopup('AlbumScene') },
      { key: 'icon_menu_shop',    label: '상점', onClick: () => openPopup('ShopScene') },
    ];

    const menuCy = sh - 95;
    const tileBoxW = 170;
    const tileBoxH = 150;
    const iconSize = 95;
    const iconYOffset = -22;
    const labelYOffset = 34;
    const menuGap = 12;
    const sidePad = Math.max(pad, 14);
    const totalGap = menuGap * (menus.length - 1);
    const cellW = (W - sidePad * 2 - totalGap) / menus.length;
    const tileW = Math.min(tileBoxW, cellW);

    menus.forEach((m, i) => {
      const cx = sidePad + cellW / 2 + (cellW + menuGap) * i;
      const frame = placeContained(this, 'tile_frame_b', cx, menuCy, tileW, tileBoxH,
        { maxScale: 1.5 });
      frame.setDepth(DEPTH.tabs);
      const icon = placeContained(this, m.key, cx, menuCy + iconYOffset,
        iconSize, iconSize, { maxScale: 1.5 });
      icon.setDepth(DEPTH.tabs + 1);
      const label = strokeText(this, cx, menuCy + labelYOffset, m.label,
        FONT.size.lg,
        { color: COLORS.textWhite, strokeColor: '#5a2e0c', strokeWidth: 4 });
      centerInBox(label, 0.5);
      label.setDepth(DEPTH.tabs + 2);
      this._makeClickable(frame, m.onClick);
    });
  }

  // ─── 헬퍼 ───
  _makeClickable(img, onClick) {
    img.setInteractive({ useHandCursor: true });
    img.on('pointerdown', () => {
      this.tweens.add({ targets: img, scale: img.scale * 0.94, yoyo: true, duration: 90 });
      onClick?.();
    });
  }

  _toast(msg) {
    const t = strokeText(this, this.scale.width / 2, 280, msg, FONT.size.lg,
      { color: '#ffffff', strokeColor: '#000000', strokeWidth: 4 });
    centerInBox(t, 0.5);
    t.setDepth(DEPTH.toast);
    this.tweens.add({
      targets: t, alpha: { from: 1, to: 0 }, y: t.y - 30,
      duration: 700, onComplete: () => t.destroy(),
    });
  }
}
