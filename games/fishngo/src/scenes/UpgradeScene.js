/**
 * UpgradeScene — 강화 팝업 (보유 장비 기반).
 *
 * 사용자 요청 재설계:
 *   - 카테고리 탭 → 제거 (한 화면에 모든 장비 노출).
 *   - 내 보유 장비를 세로 리스트로 표시.
 *   - 각 행에 [아이콘] [이름 + 다음 레벨] [비용] [강화 버튼] — 행에서 즉시 강화 가능.
 *
 * 레이아웃:
 *   [헤더: 🔧 강화                💰 골드]
 *   [장비 리스트 (세로 스크롤)]
 *     · 낚시대  Lv.3 → Lv.4   💰 500   [강화]
 *     · 릴      Lv.2 → Lv.3   💰 300   [강화]
 *     · 낚시줄  Lv.1 → Lv.2   💰 150   [강화]
 *     · 미끼    Lv.1 → Lv.2   💰 100   [강화]
 */

import Phaser from 'phaser';
import {
  buildBackdrop, buildPanel, buildHeader, buildCard, buildButton,
  buildText, blockUnderlyingInput, PALETTE,
} from '../ui/popup.js';
import { renderLayoutInto } from '../ui/LocationCard.js';
import { attachPopupAnims, bindPopupAnimLifecycle, byRole, resolveBind } from '@ohdyssey/phaser-ui-editor';
import { strokeText } from '../ui/components.js';
import { loadProfile, addGold } from '../systems/UserProfile.js';
import {
  loadEquipment, EQUIPMENT_DEFS, getUpgradeCost, upgrade,
  getEquippedRod, getEquippedReel, getEquippedLine, getActiveBaitOrLure,
  getOwnedItems, equipItem, acquireItem,
} from '../systems/Equipment.js';
import { ITEM_RODS, ITEM_REELS, ITEM_LINES, ITEM_BAITS } from '../config/items.config.js';

// 표시 순서/아이콘. rod/line/bait = 레거시 레벨강화(EQUIPMENT_DEFS), reel = ID기반(아이템팝업으로 교체).
const EQUIP_META = [
  { type: 'rod',  icon: '🎣', name: '낚싯대', legacy: true },
  { type: 'reel', icon: '🪝', name: '릴',     legacy: false },
  { type: 'line', icon: '🧵', name: '낚싯줄', legacy: true },
  { type: 'bait', icon: '🪱', name: '미끼',   legacy: true },
];

// 실데이터 강화 행 — 레거시 레벨 + 다음 비용/최대여부.
function equipRows() {
  const eq = loadEquipment();
  return EQUIP_META.map((m) => {
    if (!m.legacy) {
      const reel = getEquippedReel();
      return { ...m, reelName: reel?.name || '릴' };
    }
    const def = EQUIPMENT_DEFS[m.type];
    const level = eq[`${m.type}Level`] || 1;
    const atMax = level >= def.maxLevel;
    return { ...m, level, atMax, cost: atMax ? Infinity : getUpgradeCost(m.type, level), defName: def.name };
  });
}

export class UpgradeScene extends Phaser.Scene {
  constructor() { super('UpgradeScene'); }

  // 에디터 저장 레이아웃(외형) 로드 — 없으면 절차적 폴백. 캐시버스트로 편집 즉시 반영.
  preload() {
    this.cache.json.remove('layout_upgrade');
    this.load.json('layout_upgrade', `ui/layouts/upgrade.json?t=${Date.now()}`);
    this.load.once('loaderror', () => { /* 파일 없음 → create 에서 절차적 폴백 */ });
  }

  init(data) { this._pendingToast = data?.toast || null; }

  create() {
    blockUnderlyingInput(this);
    this._rowRefs = {};
    const layout = this.cache.json.get('layout_upgrade');
    if (layout && Array.isArray(layout.nodes) && layout.nodes.length) this._buildFromLayout(layout);
    else this._buildProcedural();

    bindPopupAnimLifecycle(this);   // 씬 종료/오버레이 시 정리·일시정지(인스턴스당 1회).
    if (this._pendingToast) { this._toast(this._pendingToast); this._pendingToast = null; }
  }

  // 레이아웃에 저작된 idle 스프링 적분(저작 애니 없으면 no-op).
  update(_t, deltaMs) { this._popupAnim?.update(deltaMs / 1000); }

  // ─── 하이브리드: 레이아웃(외형) + 코드(딤·닫기·골드 라이브·강화 버튼 동작) ───
  _buildFromLayout(layout) {
    const W = this.scale.width, H = this.scale.height;
    const fw = layout.frame.designW, fh = layout.frame.designH;
    this._layoutFrame = { fw, fh };
    const onClose = () => this.scene.stop();

    // 딤 배경 — 입력 차단만(닫기는 X 버튼/ESC 로만, 다른 공간 클릭으로 닫히지 않도록).
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setInteractive().setDepth(0);

    // 레이아웃 렌더(외형) — 디자인프레임 중심정렬.
    const container = this.add.container(W / 2, H / 2).setDepth(10);
    const { nodeMap } = renderLayoutInto(this, container, layout, {});
    this._container = container;
    const entries = [...nodeMap.values()];

    // 저작 애니메이션 재생(외형 레이아웃 노드 대상) — 등장 + idle 시작.
    this._popupAnim = attachPopupAnims(this, { nodeMap, layout, container });
    this._popupAnim.fireEnter();

    // 아이템 화면 콘텐츠(장착중 그리드 · 카테고리 탭 · 보유 리스트 · 교체/강화/합성) 구현.
    this._buildItemScreen(entries, container, onClose);
  }

  // ─── 아이템 화면 — 저작된 upgrade.json(아이템 UI)에 데이터/상호작용만 연결(외형 불변) ───
  //   에디터 노드를 그대로 사용: 그리드/리스트 텍스트만 채우고, 추가 리스트 행은 행0 노드와 동일 스타일로 복제.
  //   상단 "장착중" 2×2 그리드 + 카테고리 탭 + 보유 아이템 리스트 + 액션(교체/강화/합성).
  _buildItemScreen(entries, container, onClose) {
    const byId = {};
    for (const e of entries) byId[e.node.id] = e;
    const node = (id) => byId[id]?.node || null;
    const obj = (id) => byId[id]?.primary || null;
    const txtOf = (id) => byId[id]?.objects.find((o) => o.setText) || null;
    const setText = (id, s) => { const t = txtOf(id); if (t) t.setText(s); };
    const lx = (n) => n.x - this._layoutFrame.fw / 2;
    const ly = (n) => n.y - this._layoutFrame.fh / 2;
    const styleOf = (n) => ({ color: n.color, strokeColor: n.stroke, strokeWidth: n.strokeW || 0 });
    const originX = (n) => (n.align === 'left' ? 0 : n.align === 'right' ? 1 : 0.5);

    // 팝업 텍스트 전체 비볼드(사용자 요청) + 교체 버튼 라벨 → '장착'.
    for (const e of entries) if (e.node.type === 'text' && e.primary?.setFontStyle) e.primary.setFontStyle('normal');
    setText('layer_13_copy5', '장착');

    // 에디터가 추가한 리스트 행1+ 정적 placeholder(layer_6_copy9 "꼬임 면줄"·layer_8_copy5 "Lv 2"·
    //   layer_18_copy "장착 대기"·소형 배지 bg 등, y≈733~1002)는 게임이 아래 renderList 로 동적 렌더하므로
    //   숨긴다. 안 숨기면 동적 행과 겹쳐 "꼬임 면줄/Lv 이중" 같은 겹침이 생긴다(사용자 보고).
    //   행0 템플릿(y≈607)과 하단 버튼(y≈1117)은 범위 밖이라 보존.
    for (const e of entries) {
      const n = e.node;
      const small = n.type === 'image' && (n.w || 999) < 200;     // 소형 배지 bg(행 bg w=579 는 제외)
      if (n.y > 690 && n.y < 1060 && (n.type === 'text' || small) && e.primary?.setVisible) {
        e.primary.setVisible(false);
      }
    }

    const SLOTS = ['line', 'bait', 'reel', 'rod'];
    const ITEMS = { line: ITEM_LINES, bait: ITEM_BAITS, reel: ITEM_REELS, rod: ITEM_RODS };
    // 장착중 그리드: 슬롯별 이름/레벨 노드 + 아이콘 슬롯(rect 100×100) id(에디터 노드 그대로).
    const GRID = {
      line: { name: 'layer_6_copy4', level: 'layer_8',       iconSlot: 'layer_7' },
      bait: { name: 'layer_6_copy5', level: 'layer_8_copy',  iconSlot: 'layer_7_copy' },
      reel: { name: 'layer_6_copy7', level: 'layer_8_copy3', iconSlot: 'layer_7_copy3' },
      rod:  { name: 'layer_6_copy6', level: 'layer_8_copy2', iconSlot: 'layer_7_copy2' },
    };
    // 아이템 아이콘 이미지를 슬롯 노드 위에 배치(저장된 아이템 이미지). box=목표 한 변(px).
    const placeIcon = (slotNode, iconKey, box, store, k) => {
      if (store[k]) { store[k].destroy(); store[k] = null; }
      if (!slotNode || !iconKey || !this.textures.exists(iconKey)) return;
      const img = this.add.image(lx(slotNode), ly(slotNode), iconKey).setOrigin(0.5);
      const src = img.texture.getSourceImage();
      img.setScale(Math.min(box / (src.width || 1), box / (src.height || 1)));
      container.add(img); store[k] = img;
    };
    const TAB_LABEL = { line: 'layer_13_copy', bait: 'layer_13_copy2', reel: 'layer_13_copy3', rod: 'layer_13_copy4' };
    const TAB_X = { line: 137, bait: 283, reel: 430, rod: 576 };   // 탭 bg x(에디터 좌표) — 선택 하이라이트 이동·히트영역
    const ROW_BG = ['layer_11', 'layer_11_copy', 'layer_11_copy2', 'layer_11_copy3'];

    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const equippedId = (slot) => loadEquipment()[`equipped${cap(slot)}Id`];
    const equippedSpec = { line: getEquippedLine, bait: getActiveBaitOrLure, reel: getEquippedReel, rod: getEquippedRod };
    const slotLevel = (slot) => (slot === 'reel' ? (getEquippedReel()?.tier || 1) : (loadEquipment()[`${slot}Level`] || 1));
    const specOf = (slot, id) => (ITEMS[slot] || {})[id] || null;

    // ── 장착중 그리드: 에디터 이름/레벨 노드에 데이터 + 아이콘 슬롯에 장착 아이템 이미지 ──
    this._gridIcons = {};
    const refreshGrid = () => {
      for (const slot of SLOTS) {
        const s = equippedSpec[slot]() || {};
        setText(GRID[slot].name, s.name || '미장착');
        setText(GRID[slot].level, `Lv ${s.tier || slotLevel(slot)}`);   // 장착 아이템 티어(리스트와 일관)
        const sn = node(GRID[slot].iconSlot);
        placeIcon(sn, s.icon, (sn?.w || 100) * 0.82, this._gridIcons, slot);
      }
    };

    // ── 보유 아이템 리스트 ── 행0=에디터 템플릿 노드 그대로, 행1~3=행0과 동일 스타일로 복제(숨김 없음).
    const ROW0Y = node('layer_11')?.y ?? 624;
    const tName = node('layer_6_copy8'), tLv = node('layer_8_copy4'), tBadge = node('layer_18'), tBadgeBg = node('layer_17');
    const oName = obj('layer_6_copy8'), oLv = obj('layer_8_copy4'), oBadge = obj('layer_18'), oBadgeBg = obj('layer_17');
    if (oBadge) oBadge.setVisible(false);      // 배지는 동적 렌더(장착중/장착대기)로 통일 — 행0 템플릿 배지 숨김.
    if (oBadgeBg) oBadgeBg.setVisible(false);
    // 행 배지 — 'eq'(장착중) | 'pending'(장착대기: 선택했으나 아직 장착 전).
    const mkBadge = (dy, state) => {
      if (!tBadge) return;
      const text = state === 'eq' ? '장착중' : '장착대기';
      const color = state === 'eq' ? (tBadge.color || '#000770') : '#c2540a';
      if (tBadgeBg?.key) { const bb = this.add.image(lx(tBadgeBg), ly(tBadgeBg) + dy, tBadgeBg.key).setOrigin(0.5); if (tBadgeBg.w) bb.setDisplaySize(tBadgeBg.w, tBadgeBg.h); container.add(bb); this._listObjs.push(bb); }
      const bt = strokeText(this, lx(tBadge), ly(tBadge) + dy, text, tBadge.fontSize, { color, strokeColor: tBadge.stroke, strokeWidth: tBadge.strokeW || 0 }).setOrigin(0.5);
      if (bt.setFontStyle) bt.setFontStyle('normal');
      container.add(bt); this._listObjs.push(bt);
    };
    this._listObjs = [];
    const renderList = () => {
      this._listObjs.forEach((o) => o.destroy());
      this._listObjs = [];
      const slot = this._itemSlot;
      const eid = equippedId(slot);
      // 카테고리 카탈로그 — 각 탭에 여러 아이템 표시(번호 아이템 slot_NN, 표시 행 수만큼).
      const re = new RegExp(`^${slot}_\\d+$`);
      const list = Object.values(ITEMS[slot] || {}).filter((it) => it && it.id && re.test(it.id)).slice(0, ROW_BG.length);
      const names = [];   // {id, obj} — 선택 강조용
      for (let i = 0; i < ROW_BG.length; i++) {
        const bg = node(ROW_BG[i]); if (!bg) continue;
        const dy = bg.y - ROW0Y;
        const sp = list[i] || null;
        const id = sp?.id;
        const isEq = !!(id && id === eid);
        if (i === 0) {                                       // 행0 = 에디터 템플릿 노드(이름/Lv) 그대로 채움
          if (oName) { oName.setVisible(!!id); if (id) oName.setText(sp.name); }
          if (oLv) { oLv.setVisible(!!id); if (id) oLv.setText(`Lv ${sp.tier || 1}`); }
          if (id && oName) names.push({ id, obj: oName });
        } else if (id && tName) {                            // 행1~3 = 행0 스타일 복제(비볼드)
          const nm = strokeText(this, lx(tName), ly(tName) + dy, sp.name, tName.fontSize, styleOf(tName)).setOrigin(originX(tName), 0.5);
          if (nm.setFontStyle) nm.setFontStyle('normal');
          container.add(nm); this._listObjs.push(nm); names.push({ id, obj: nm });
          if (tLv) { const lv = strokeText(this, lx(tLv), ly(tLv) + dy, `Lv ${sp.tier || 1}`, tLv.fontSize, styleOf(tLv)).setOrigin(originX(tLv), 0.5); if (lv.setFontStyle) lv.setFontStyle('normal'); container.add(lv); this._listObjs.push(lv); }
        }
        if (id) {
          if (sp.icon && this.textures.exists(sp.icon)) {   // 행 아이콘(저장된 아이템 이미지) — 행 왼쪽 가까이
            const im = this.add.image(lx(bg) - bg.w / 2 + 50, ly(bg), sp.icon).setOrigin(0.5);
            const src = im.texture.getSourceImage();
            im.setScale(Math.min(64 / (src.width || 1), 64 / (src.height || 1)));
            container.add(im); this._listObjs.push(im);
          }
          const state = isEq ? 'eq' : (id === this._itemSel ? 'pending' : null);   // 장착중 / 장착대기(선택)
          if (state) mkBadge(dy, state);
          const hit = this.add.rectangle(lx(bg), ly(bg), bg.w, bg.h, 0x000000, 0.001).setInteractive({ useHandCursor: true });
          hit.on('pointerdown', () => { this._itemSel = id; this._popupAnim?.fireTap?.(); renderList(); });
          container.add(hit); this._listObjs.push(hit);
        }
      }
      for (const n of names) if (n.obj.setScale) n.obj.setScale(n.id === this._itemSel ? 1.06 : 1);   // 선택 강조(확대만)
    };

    // ── 카테고리 탭 — 에디터 선택색(p16, layer_9)을 현재 탭으로 이동(최상단) + 비선택 디밍 ──
    const tabBg = obj('layer_9');
    // 낚시줄 탭 미선택 배경 — 에디터엔 선택 스타일(p16)만 있어 비선택 시 빈 상태 → 다른 탭과 동일 p17_v2 추가.
    if (this.textures.exists('card_up_popup_17_v2')) {
      const lp = this.add.image(TAB_X.line - this._layoutFrame.fw / 2, 532 - this._layoutFrame.fh / 2, 'card_up_popup_17_v2').setOrigin(0.5);
      lp.setDisplaySize(141, 48); container.add(lp);
    }
    const refreshTabs = () => {
      if (tabBg) { tabBg.x = TAB_X[this._itemSlot] - this._layoutFrame.fw / 2; container.bringToTop(tabBg); }
      for (const slot of SLOTS) {
        const t = obj(TAB_LABEL[slot]); if (!t) continue;
        container.bringToTop(t);                              // 라벨을 선택 하이라이트 위로
        const on = slot === this._itemSlot;
        if (t.setScale) t.setScale(on ? 1.06 : 1);
        if (t.setAlpha) t.setAlpha(on ? 1 : 0.5);             // 비선택 탭 디밍 → 현재 탭 색 강조
      }
    };
    for (const slot of SLOTS) {
      const hx = TAB_X[slot] - this._layoutFrame.fw / 2, hy = 532 - this._layoutFrame.fh / 2;
      const hit = this.add.rectangle(hx, hy, 141, 48, 0x000000, 0.001).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => { this._itemSlot = slot; this._itemSel = null; refreshTabs(); renderList(); });
      container.add(hit);
    }

    // ── 액션 + 닫기 ──
    this._itemRefresh = () => { refreshGrid(); renderList(); };
    this._wireHit(node('layer_14'), () => this._itemEquip());                       // 교체
    this._wireHit(node('layer_15'), () => this._itemUpgrade());                     // 강화
    this._wireHit(node('layer_16'), () => this._toast('합성은 준비 중입니다'));     // 합성(추후 craftRecipe 연동)
    this._wireHit(node('layer_4'), onClose);                                        // 닫기(우상단 X)
    this.input.keyboard?.on('keydown-ESC', onClose);

    this._itemSlot = 'line';
    this._itemSel = null;
    refreshGrid(); refreshTabs(); renderList();
  }

  // 교체 — 목록에서 선택한 아이템 장착(미보유면 획득 후 장착).
  _itemEquip() {
    if (!this._itemSel) { this._toast('교체할 아이템을 먼저 선택하세요'); return; }
    acquireItem(this._itemSlot, this._itemSel);
    equipItem(this._itemSlot, this._itemSel);
    this._popupAnim?.fireDataChange();
    this._itemRefresh?.();
    this._toast('장착 완료');
  }

  // 강화 — 선택 카테고리 레벨 업(레거시 rod/line/bait). 릴은 ID기반이라 교체로 안내.
  _itemUpgrade() {
    const slot = this._itemSlot;
    if (slot === 'reel') { this._toast('릴은 교체(목록 선택)로 변경하세요'); return; }
    const def = EQUIPMENT_DEFS[slot]; if (!def) return;
    const level = loadEquipment()[`${slot}Level`] || 1;
    if (level >= def.maxLevel) { this._toast(`${def.name} 최대 레벨입니다`); return; }
    const cost = getUpgradeCost(slot, level);
    const profile = loadProfile();
    if ((profile.gold ?? 0) < cost) { this._toast(`골드 부족 — ${cost.toLocaleString()}G 필요`); return; }
    addGold(profile, -cost);
    upgrade(slot);
    this._popupAnim?.fireDataChange();
    this._itemRefresh?.();
    this._toast(`${def.name} 강화 완료 → Lv ${level + 1}`);
  }

  // 행 텍스트(레벨/비용) 실값 적용 — 하이브리드/리프레시 공용.
  _applyRowText(type, row, setT) {
    if (!row) return;
    const ref = this._rowRefs[type] || {};
    if (type === 'reel') {
      setT(ref.lvE, row.reelName);
      setT(ref.costE, '🔧 변경');
      return;
    }
    setT(ref.lvE, row.atMax ? `Lv.${row.level}  (MAX)` : `Lv.${row.level}  →  Lv.${row.level + 1}`);
    setT(ref.costE, row.atMax ? '— 최대 —' : `💰 ${row.cost.toLocaleString()}`);
  }

  _refreshGold() {
    if (!this._goldText) return;
    const gold = (loadProfile().gold ?? 0).toLocaleString();
    const cur = this._goldText.text || '';
    this._goldText.setText(/[\d,]+/.test(cur) ? cur.replace(/[\d,]+/, gold) : `💰 ${gold}`);
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

  // 실 강화 — 골드 검증 → 차감 → 레벨업 → 인플레이스 갱신.
  _doUpgrade(type) {
    const def = EQUIPMENT_DEFS[type];
    if (!def) return;
    const eq = loadEquipment();
    const level = eq[`${type}Level`] || 1;
    if (level >= def.maxLevel) { this._toast(`${def.name} 최대 레벨입니다`); return; }
    const cost = getUpgradeCost(type, level);
    const profile = loadProfile();
    if ((profile.gold ?? 0) < cost) { this._toast(`골드 부족 — ${cost.toLocaleString()}G 필요`); return; }
    addGold(profile, -cost);
    upgrade(type);
    this._refreshAfterChange(`${def.name} 강화 완료 → Lv.${level + 1}`);
  }

  // 릴은 ID기반 — 아이템팝업(릴)에서 교체. 팝업 닫히면 데이터 갱신.
  _openItemPopup(slot) {
    if (this.scene.isActive('ItemPopupScene')) return;
    this.scene.launch('ItemPopupScene', { slot, parentSceneKey: this.scene.key });
    const popup = this.scene.get('ItemPopupScene');
    if (popup) popup.events.once('shutdown', () => this._refreshAfterChange());
  }

  // 강화/장비변경 후 갱신 — 하이브리드는 인플레이스(토스트 즉시), 절차적은 재시작(토스트 init 경유).
  _refreshAfterChange(toastMsg) {
    const hybrid = this._rowRefs && Object.keys(this._rowRefs).length;
    if (hybrid) {
      this._refreshGold();
      const setT = (e, s) => { const t = e?.objects.find((o) => o.setText); if (t) t.setText(s); };
      for (const r of equipRows()) this._applyRowText(r.type, r, setT);
      this._popupAnim?.fireDataChange();   // 값변경 트리거 — 저작된 dataChange 애니 재생.
      if (toastMsg) this._toast(toastMsg);
    } else {
      this.scene.restart(toastMsg ? { toast: toastMsg } : undefined);
    }
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
    const h = buildHeader(this, p, '🔧 강화', onClose);

    // 헤더 우측 — 골드 표시.
    buildText(this, p.x + p.w - 70, p.y + h.headerH / 2,
      `💰 ${(profile.gold ?? 0).toLocaleString()}`,
      {
        fontSize: '18px', fontStyle: 'bold',
        color: PALETTE.titleText, origin: { x: 1, y: 0.5 },
      });

    const PAD = 20;

    // 보유 장비 리스트 — 실데이터.
    const listY = h.bottomY + 22;
    const listW = p.w - PAD * 2;
    const rowH = 108;
    const rowGap = 14;

    equipRows().forEach((row, i) => {
      const ry = listY + i * (rowH + rowGap);
      this._buildEquipRow(p.x + PAD, ry, listW, rowH, row, profile);
    });
  }

  _buildEquipRow(x, y, w, h, row, profile) {
    // 행 카드 배경.
    buildCard(this, x, y, w, h);

    // 좌측 아이콘 박스 (정사각).
    const pad = 12;
    const iconSize = h - pad * 2;
    buildCard(this, x + pad, y + pad, iconSize, iconSize, {
      fill: 0xffe5a8, border: PALETTE.cardBorder,
      label: row.icon, fontSize: '44px',
    });

    // 중앙 — 이름 + 레벨/상태 + 비용.
    const textX = x + iconSize + pad * 2;
    buildText(this, textX, y + 18, row.name, {
      fontSize: '22px', fontStyle: 'bold',
      color: PALETTE.titleText,
    });
    const isReel = !row.legacy;
    const midText = isReel ? row.reelName
      : (row.atMax ? `Lv.${row.level}  (MAX)` : `Lv.${row.level}  →  Lv.${row.level + 1}`);
    buildText(this, textX, y + 48, midText, { fontSize: '17px', color: PALETTE.bodyText });
    const costText = isReel ? '🔧 변경' : (row.atMax ? '— 최대 —' : `💰 ${row.cost.toLocaleString()}`);
    buildText(this, textX, y + 76, costText, { fontSize: '17px', color: PALETTE.bodyText });

    // 우측 강화/변경 버튼.
    const btnW = 116;
    const btnH = 60;
    const btnX = x + w - btnW - pad;
    const btnY = y + (h - btnH) / 2;
    const canAct = isReel || (!row.atMax && (profile?.gold ?? 0) >= row.cost);
    const label = isReel ? '변경' : '강화';
    const onClick = isReel ? () => this._openItemPopup('reel') : () => this._doUpgrade(row.type);
    buildButton(this, btnX, btnY, btnW, btnH, label, onClick, {
      fill: canAct ? PALETTE.btnAccent : PALETTE.btnDisabled,
      fontSize: '20px',
    });
  }
}
