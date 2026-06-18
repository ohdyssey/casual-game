/**
 * ShopScene — 상점 팝업 (캐주얼 톤, 단순 구조).
 *
 * 하이브리드: 에디터 저장 레이아웃(ui/layouts/shop.json)이 있으면 외형을 레이아웃으로
 *   렌더하고 코드가 딤·닫기·골드·구매버튼·UI 애니메이션을 재바인딩한다.
 *   레이아웃이 없으면 절차적 폴백(_buildProcedural).
 *
 * 절차적 레이아웃:
 *   [헤더: 🛒 상점        💰 골드]
 *   [3개 카테고리 탭]
 *   [아이템 카드 세로 리스트]
 */

import Phaser from 'phaser';
import {
  buildBackdrop, buildPanel, buildHeader, buildCard, buildButton,
  buildTabBar, buildText, blockUnderlyingInput, PALETTE,
} from '../ui/popup.js';
import { renderLayoutInto } from '../ui/LocationCard.js';
import { attachPopupAnims, bindPopupAnimLifecycle, byRolePrefix, resolveBind } from '@ohdyssey/phaser-ui-editor';
import { strokeText } from '../ui/components.js';
import { loadProfile } from '../systems/UserProfile.js';

export class ShopScene extends Phaser.Scene {
  constructor() { super('ShopScene'); }

  // 에디터 저장 레이아웃(외형) 로드 — 없으면 절차적 폴백. 캐시버스트로 편집 즉시 반영.
  preload() {
    this.cache.json.remove('layout_shop');
    this.load.json('layout_shop', `ui/layouts/shop.json?t=${Date.now()}`);
    this.load.once('loaderror', () => { /* 파일 없음 → create 에서 절차적 폴백 */ });
  }

  create() {
    blockUnderlyingInput(this);
    const layout = this.cache.json.get('layout_shop');
    if (layout && Array.isArray(layout.nodes) && layout.nodes.length) this._buildFromLayout(layout);
    else this._buildProcedural();

    bindPopupAnimLifecycle(this);   // 인스턴스당 1회 — 누적 방지.
  }

  update(_t, deltaMs) { this._popupAnim?.update(deltaMs / 1000); }

  // ─── 하이브리드: 레이아웃(외형) + 코드(딤·닫기·골드·구매·애니메이션) ───
  _buildFromLayout(layout) {
    const W = this.scale.width, H = this.scale.height;
    const fw = layout.frame.designW, fh = layout.frame.designH;
    this._layoutFrame = { fw, fh };
    const onClose = () => this.scene.stop();

    // 딤 배경(클릭=닫기).
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setInteractive().on('pointerdown', onClose).setDepth(0);

    // 레이아웃 렌더(외형) — 디자인프레임 중심정렬.
    const container = this.add.container(W / 2, H / 2).setDepth(10);
    const { nodeMap } = renderLayoutInto(this, container, layout, {});
    this._container = container;
    const entries = [...nodeMap.values()];

    // 저작 애니메이션 — 등장 + idle.
    this._popupAnim = attachPopupAnims(this, { nodeMap, layout, container });
    this._popupAnim.fireEnter();

    // 바인딩은 role 우선(저자 지정 시 이름·위치 무관) → 휴리스틱 폴백.
    // 1) 골드 라이브 — role:gold > 헤더의 💰/🪙 텍스트.
    const profile = loadProfile();
    const hasGold = (s) => s.includes('💰') || s.includes('🪙');
    const goldE = resolveBind(entries, 'gold', () =>
      entries.find((e) => e.node.type === 'text' && hasGold(e.node.text || '') && e.node.y < fh * 0.15)
      || entries.find((e) => e.node.type === 'text' && hasGold(e.node.text || '')));
    if (goldE) {
      const t = goldE.objects.find((o) => o.setText);
      const gold = (profile.gold ?? 0).toLocaleString();
      if (t) t.setText(/[\d,]+/.test(t.text) ? t.text.replace(/[\d,]+/, gold) : `${t.text} ${gold}`);
    }

    // 2) 닫기 — role:close > 이름 '닫기' > circle > 우상단 코너.
    const closeE = resolveBind(entries, 'close', () =>
      entries.find((e) => e.node.name === '닫기')
      || entries.find((e) => e.node.type === 'circle')
      || entries.find((e) => e.node.x > fw * 0.82 && e.node.y < fh * 0.12));
    if (closeE) this._wireHit(closeE.node, onClose);
    this.input.keyboard?.on('keydown-ESC', onClose);

    // 3) 구매 버튼 — role:action:purchase 우선(y정렬) > 이름 '버튼/구매' rect > 우측영역 rect.
    let btns = byRolePrefix(entries, 'action:purchase');
    if (!btns.length) btns = entries.filter((e) => e.node.type === 'rect' && /버튼|구매/.test(e.node.name || ''));
    if (!btns.length) btns = entries.filter((e) => e.node.type === 'rect' && e.node.x > fw * 0.62 && e.node.w < fw * 0.4 && e.node.y > fh * 0.2);
    btns.sort((a, b) => a.node.y - b.node.y);
    btns.forEach((e, i) => this._wireHit(e.node, () => { this._popupAnim?.fireTap(); this._onPurchase(i); }));
  }

  // 레이아웃 노드 위치에 투명 hit-area 부착(컨테이너 로컬좌표).
  _wireHit(node, handler) {
    if (!node || !handler) return;
    const { fw, fh } = this._layoutFrame;
    const lx = node.x - fw / 2, ly = node.y - fh / 2;
    const w = node.w || (node.r ? node.r * 2 : 60), h = node.h || (node.r ? node.r * 2 : 60);
    const hit = this.add.rectangle(lx, ly, w, h, 0x000000, 0.001).setInteractive({ useHandCursor: true });
    this._container.add(hit);
    hit.on('pointerdown', () => handler());
  }

  _onPurchase(i) {
    this._toast(`아이템 ${i + 1} 구매 — 준비 중 (상점 시스템 연동 예정)`);
  }

  _toast(msg) {
    const W = this.scale.width, H = this.scale.height;
    const t = strokeText(this, W / 2, H * 0.2, msg, 22, { color: '#fff', strokeColor: '#000', strokeWidth: 4 })
      .setOrigin(0.5).setDepth(2000);
    this.tweens.add({ targets: t, alpha: { from: 1, to: 0 }, y: t.y - 24, duration: 1500, onComplete: () => t.destroy() });
  }

  // ─── 절차적 폴백(레이아웃 파일 없을 때) ───
  _buildProcedural() {
    const onClose = () => this.scene.stop();
    const profile = loadProfile();

    buildBackdrop(this, onClose);
    const p = buildPanel(this);
    const h = buildHeader(this, p, '🛒 상점', onClose);

    // 헤더 우측 — 골드 표시.
    buildText(this, p.x + p.w - 70, p.y + h.headerH / 2,
      `💰 ${(profile.gold ?? 0).toLocaleString()}`,
      {
        fontSize: '18px', fontStyle: 'bold',
        color: PALETTE.titleText, origin: { x: 1, y: 0.5 },
      });

    const PAD = 20;

    // 카테고리 탭 (3개로 단순화)
    const tabY = h.bottomY + 18;
    const tabH = 52;
    buildTabBar(this, p.x + PAD, tabY, p.w - PAD * 2, tabH,
      ['장비', '미끼', '특가'], 0);

    // 아이템 리스트 (1열, 세로)
    const listY = tabY + tabH + 18;
    const listBottom = p.y + p.h - 20;
    const listW = p.w - PAD * 2;
    const rowH = 96;
    const rowGap = 12;
    const rows = Math.floor((listBottom - listY + rowGap) / (rowH + rowGap));

    for (let i = 0; i < rows; i++) {
      const ry = listY + i * (rowH + rowGap);
      this._buildShopRow(p.x + PAD, ry, listW, rowH, i);
    }
  }

  _buildShopRow(x, y, w, h, i) {
    // 행 카드.
    buildCard(this, x, y, w, h);

    // 아이콘 — 좌측 정사각.
    const iconPad = 10;
    const iconSize = h - iconPad * 2;
    buildCard(this, x + iconPad, y + iconPad, iconSize, iconSize, {
      fill: 0xffe5a8, border: PALETTE.cardBorder,
      label: ['🎣', '🪱', '⭐'][i % 3], fontSize: '36px',
    });

    // 이름 + 가격 — 가운데 영역.
    const textX = x + iconSize + iconPad * 2;
    buildText(this, textX, y + 22, `아이템 ${i + 1}`, {
      fontSize: '20px', fontStyle: 'bold',
      color: PALETTE.titleText,
    });
    buildText(this, textX, y + 54, `💰 ${(100 + i * 50).toLocaleString()}`, {
      fontSize: '18px',
      color: PALETTE.bodyText,
    });

    // 구매 버튼 — 우측.
    const btnW = 96;
    const btnH = 52;
    const btnX = x + w - btnW - iconPad;
    const btnY = y + (h - btnH) / 2;
    buildButton(this, btnX, btnY, btnW, btnH, '구매',
      () => this._onPurchase(i), { fill: PALETTE.btnPrimary, fontSize: '18px' });
  }
}
