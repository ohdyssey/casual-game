/**
 * EquipmentScene — 장비 인벤토리 + 장착 화면 (Phase 5).
 *
 * 4 탭 (BAITS / LURES / ROD PARTS / REELS) 을 단일 씬으로 처리.
 *   - init({ tab: 'rod'|'reel'|'line'|'bait'|'lure', returnTo: 'FishingScene'|'HomeScene' })
 *   - 상단 탭 strip 으로 슬롯 전환.
 *   - 현재 장착 카드 (highlight) + 보유 목록 + 미보유(잠금) 카드.
 *   - 탭 카드 → 장착 (equipItem) + 재진입 시 갱신.
 *
 * 자산:
 *   tile_frame_a / tile_frame_b   : 카드 배경 프레임 (UI_37/38)
 *   icon_item_bait/line/reel/rod  : 탭 아이콘 (UI_39/40/41/42)
 *
 * 디자인:
 *   - 720 × 가변 높이 (scale.height 사용).
 *   - 매 카드는 frame(베이지) + 아이콘(좌측) + 텍스트 (이름/티어/스탯) (우측).
 *   - 잠금 카드는 회색(alpha 0.5) + "🔒" 마커.
 *
 * 신규 자산 의존 안 함 — 기존 assets.config.js / items.config.js 만 사용.
 */

import Phaser from 'phaser';
import { GAME_WIDTH, COLORS, FONT } from '../config/game.config.js';
import { strokeText, centerInBox } from '../ui/components.js';
import { placeContained } from '../ui/scale.js';
import {
  ITEM_RODS, ITEM_REELS, ITEM_LINES, ITEM_BAITS, ITEM_LURES,
  TIER_META,
} from '../config/items.config.js';
import {
  loadEquipment, equipItem, getOwnedItems, getBaitStock,
} from '../systems/Equipment.js';

const TABS = [
  { id: 'bait', label: 'BAITS',     iconKey: 'icon_item_bait', catalog: ITEM_BAITS, equippedKey: 'equippedBaitId' },
  { id: 'lure', label: 'LURES',     iconKey: 'icon_item_line', catalog: ITEM_LURES, equippedKey: 'equippedLureId' },
  { id: 'rod',  label: 'ROD PARTS', iconKey: 'icon_item_rod',  catalog: ITEM_RODS,  equippedKey: 'equippedRodId'  },
  { id: 'reel', label: 'REELS',     iconKey: 'icon_item_reel', catalog: ITEM_REELS, equippedKey: 'equippedReelId' },
];

const TAB_BY_ID = Object.fromEntries(TABS.map((t) => [t.id, t]));

// 카드 레이아웃 상수
const CARD_W = 656;
const CARD_H = 100;
const CARD_GAP = 10;
const CARD_PAD_X = 16;
const TIER_BADGE_W = 56;

export class EquipmentScene extends Phaser.Scene {
  constructor() { super('EquipmentScene'); }

  init(data) {
    this.activeTab = (data?.tab && TAB_BY_ID[data.tab]) ? data.tab : 'bait';
    this.returnTo = data?.returnTo || 'HomeScene';
    this.returnArgs = data?.returnArgs;
    this._cardLayer = null;     // 매 탭 전환 시 destroy + 재구축
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // 배경 — 단색.
    this.cameras.main.setBackgroundColor('#0a2540');
    // 흐릿한 panel 배경 (있으면).
    if (this.textures.exists('panel_wood_board')) {
      const bg = this.add.image(W / 2, H / 2, 'panel_wood_board');
      bg.setOrigin(0.5);
      const tex = bg.texture.getSourceImage();
      const s = Math.max(W / tex.width, H / tex.height) * 1.2;
      bg.setScale(s);
      bg.setAlpha(0.15);
      bg.setDepth(0);
    }

    // 제목 + 닫기 버튼.
    this._buildHeader(W);
    // 탭 strip.
    this._buildTabStrip(W);
    // 카드 리스트 (탭별 갱신).
    this._renderCards();

    // ESC = 돌아가기.
    this.input.keyboard?.on('keydown-ESC', () => this._returnBack());
  }

  _buildHeader(W) {
    const title = strokeText(this, W / 2, 40, 'EQUIPMENT', FONT.size.xl,
      { color: COLORS.textWhite, strokeColor: COLORS.textStroke, strokeWidth: 5 });
    centerInBox(title, 0.5);
    title.setDepth(10);

    // 닫기 버튼 (우상단 X).
    const close = strokeText(this, W - 40, 40, '✕', FONT.size.xl,
      { color: '#ff6464', strokeColor: COLORS.textStroke, strokeWidth: 4 });
    centerInBox(close, 0.5);
    close.setDepth(10);
    close.setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this._returnBack());
  }

  _buildTabStrip(W) {
    const pad = 16;
    const gap = 8;
    const tabH = 80;
    const cy = 110;
    const tabW = (W - pad * 2 - gap * 3) / TABS.length;

    TABS.forEach((tab, i) => {
      const cx = pad + tabW / 2 + (tabW + gap) * i;
      const isActive = tab.id === this.activeTab;
      // 프레임 — tile_frame_a 가 있으면 사용.
      const frameKey = this.textures.exists('tile_frame_a') ? 'tile_frame_a' : null;
      if (frameKey) {
        const frame = placeContained(this, frameKey, cx, cy, tabW, tabH);
        frame.setAlpha(isActive ? 1.0 : 0.55);
        frame.setDepth(10);
      } else {
        // fallback — 사각형.
        const rect = this.add.rectangle(cx, cy, tabW, tabH,
          isActive ? 0x4ec3ff : 0x1b4d8a, 1);
        rect.setStrokeStyle(2, 0x062a55);
        rect.setDepth(10);
      }
      // 아이콘 (있으면).
      if (this.textures.exists(tab.iconKey)) {
        const icon = placeContained(this, tab.iconKey, cx, cy - 10, tabW * 0.45, tabH * 0.55);
        icon.setAlpha(isActive ? 1.0 : 0.7);
        icon.setDepth(11);
      }
      // 라벨.
      const label = strokeText(this, cx, cy + tabH * 0.35, tab.label, FONT.size.sm,
        { color: COLORS.textWhite, strokeColor: COLORS.textStroke, strokeWidth: 3 });
      centerInBox(label, 0.5);
      label.setAlpha(isActive ? 1.0 : 0.75);
      label.setDepth(12);

      // hit area — 탭 전체 영역.
      const hit = this.add.rectangle(cx, cy, tabW, tabH, 0x000000, 0)
        .setDepth(15)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        if (this.activeTab !== tab.id) {
          this.activeTab = tab.id;
          this._renderTabsAndCards();
        }
      });
    });
  }

  _renderTabsAndCards() {
    // 탭 strip 만 다시 그림 — 가벼우니 전체 destroy 대신 alpha 갱신만 해도 되지만
    // 간단함을 위해 scene restart.
    this.scene.restart({ tab: this.activeTab, returnTo: this.returnTo, returnArgs: this.returnArgs });
  }

  _renderCards() {
    if (this._cardLayer) this._cardLayer.destroy(true);
    this._cardLayer = this.add.container(0, 0);
    this._cardLayer.setDepth(20);

    const tab = TAB_BY_ID[this.activeTab];
    const equipment = loadEquipment();
    const currentEquippedId = equipment[tab.equippedKey];

    // catalog 의 모든 아이템을 tier 순으로 정렬.
    const items = Object.values(tab.catalog).sort((a, b) => a.tier - b.tier);
    const owned = getOwnedItems(tab.id);
    const ownedSet = new Set(owned);

    const startY = 210;
    items.forEach((item, idx) => {
      const cardY = startY + idx * (CARD_H + CARD_GAP);
      this._buildCard(item, cardY, {
        owned: ownedSet.has(item.id),
        equipped: item.id === currentEquippedId,
        tabId: tab.id,
      });
    });
  }

  _buildCard(item, cy, { owned, equipped, tabId }) {
    const W = this.scale.width;
    const cx = W / 2;
    const tierMeta = TIER_META[item.tier] || TIER_META[1];

    // 카드 frame.
    const frameKey = this.textures.exists('tile_frame_b') ? 'tile_frame_b' : null;
    if (frameKey) {
      const frame = placeContained(this, frameKey, cx, cy, CARD_W, CARD_H);
      frame.setAlpha(owned ? 1.0 : 0.45);
      this._cardLayer.add(frame);
    } else {
      const rect = this.add.rectangle(cx, cy, CARD_W, CARD_H, 0x162d4a, 0.85);
      rect.setStrokeStyle(2, equipped ? 0xffd147 : 0x4e6890);
      this._cardLayer.add(rect);
    }
    // equipped 시 황금 stroke 오버레이.
    if (equipped) {
      const ring = this.add.rectangle(cx, cy, CARD_W + 4, CARD_H + 4, 0x000000, 0);
      ring.setStrokeStyle(3, 0xffd147, 1);
      this._cardLayer.add(ring);
    }

    // 좌측 tier 배지.
    const badgeX = cx - CARD_W / 2 + CARD_PAD_X + TIER_BADGE_W / 2;
    const badge = this.add.rectangle(badgeX, cy, TIER_BADGE_W, CARD_H * 0.7,
      tierMeta.color, owned ? 0.9 : 0.4);
    this._cardLayer.add(badge);
    const badgeTxt = strokeText(this, badgeX, cy - 14, `T${item.tier}`, FONT.size.lg,
      { color: COLORS.textWhite, strokeColor: COLORS.textStroke, strokeWidth: 3 });
    centerInBox(badgeTxt, 0.5);
    this._cardLayer.add(badgeTxt);
    const tierLabel = strokeText(this, badgeX, cy + 18, tierMeta.label, FONT.size.xs,
      { color: COLORS.textWhite, strokeColor: COLORS.textStroke, strokeWidth: 2 });
    centerInBox(tierLabel, 0.5);
    this._cardLayer.add(tierLabel);

    // 이름 + 스탯.
    const textX = badgeX + TIER_BADGE_W / 2 + 14;
    const nameTxt = strokeText(this, textX, cy - 26, item.name, FONT.size.md,
      { color: owned ? COLORS.textWhite : '#aab4c0', strokeColor: COLORS.textStroke, strokeWidth: 3 });
    nameTxt.setOrigin(0, 0.5);
    this._cardLayer.add(nameTxt);

    // 스탯 — 슬롯별로 다름.
    const statText = this._formatStats(item, tabId);
    const statTxt = strokeText(this, textX, cy + 4, statText, FONT.size.sm,
      { color: owned ? '#c8d8ee' : '#7a8696', strokeColor: COLORS.textStroke, strokeWidth: 2 });
    statTxt.setOrigin(0, 0.5);
    this._cardLayer.add(statTxt);

    // 보조 정보 (잔량 or 가격).
    let subText;
    if (tabId === 'bait' && owned) {
      subText = `재고 ${getBaitStock(item.id)} / 가격 ${item.price ?? 0}G`;
    } else if (!owned) {
      subText = `🔒 ${item.price?.toLocaleString() ?? '???'} G`;
    } else {
      subText = `가격 ${item.price?.toLocaleString() ?? 0}G`;
    }
    const subTxt = strokeText(this, textX, cy + 28, subText, FONT.size.sm,
      { color: owned ? '#ffd147' : '#7a8696', strokeColor: COLORS.textStroke, strokeWidth: 2 });
    subTxt.setOrigin(0, 0.5);
    this._cardLayer.add(subTxt);

    // 우측 상태 라벨.
    const statusX = cx + CARD_W / 2 - CARD_PAD_X - 30;
    let statusLabel = '';
    let statusColor = '#aab4c0';
    if (equipped) {
      statusLabel = '장착중';
      statusColor = '#ffd147';
    } else if (owned) {
      statusLabel = '장착';
      statusColor = '#4ec56e';
    } else {
      statusLabel = '잠김';
      statusColor = '#ff6464';
    }
    const statusTxt = strokeText(this, statusX, cy, statusLabel, FONT.size.md,
      { color: statusColor, strokeColor: COLORS.textStroke, strokeWidth: 3 });
    centerInBox(statusTxt, 0.5);
    this._cardLayer.add(statusTxt);

    // 클릭 — ItemPopupScene 띄움 (와이어프레임 #1).
    //   팝업 안에서 보유/잠금/장착/강화 모두 처리. 팝업이 close 시
    //   EquipmentScene.events 로 'item-popup-closed' 이벤트 emit → 카드 갱신.
    const hit = this.add.rectangle(cx, cy, CARD_W, CARD_H, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    this._cardLayer.add(hit);
    hit.on('pointerdown', () => {
      this.scene.launch('ItemPopupScene', { slot: tabId, parentSceneKey: 'EquipmentScene' });
      this.events.once('item-popup-closed', () => this._renderCards());
    });
  }

  /** 슬롯별 핵심 스탯 1 줄. */
  _formatStats(item, tabId) {
    if (tabId === 'rod') {
      return `Power ${item.power}kg · Action ${item.action} · ${item.length}m`;
    }
    if (tabId === 'reel') {
      return `Drag ${(item.drag * 100).toFixed(0)}% · Speed ${item.reelSpeed} · Stab ${(item.stability * 100).toFixed(0)}%`;
    }
    if (tabId === 'line') {
      return `Strength ${item.strength}kg · Depth ${item.depthLimit}m · Vis ${(item.visibility * 100).toFixed(0)}%`;
    }
    if (tabId === 'bait' || tabId === 'lure') {
      const ts = item.targetSpecies;
      let targets;
      if (ts === '__all__') targets = '전 어종';
      else if (ts === '__random__') targets = '랜덤';
      else if (Array.isArray(ts) && ts.length > 3) targets = `${ts.slice(0, 3).join('/')} +${ts.length - 3}`;
      else if (Array.isArray(ts)) targets = ts.join('/');
      else targets = '?';
      return `타깃 ${targets} · 입질 +${Math.round((item.biteBonus ?? 0) * 100)}%`;
    }
    return '';
  }

  _toast(msg) {
    const W = this.scale.width;
    const t = strokeText(this, W / 2, 180, msg, FONT.size.md,
      { color: '#ffffff', strokeColor: '#000000', strokeWidth: 4 });
    centerInBox(t, 0.5);
    t.setDepth(100);
    this.tweens.add({
      targets: t, alpha: { from: 1, to: 0 }, y: t.y - 25,
      duration: 1200, onComplete: () => t.destroy(),
    });
  }

  _returnBack() {
    const target = this.returnTo || 'HomeScene';
    this.scene.start(target, this.returnArgs);
  }
}
