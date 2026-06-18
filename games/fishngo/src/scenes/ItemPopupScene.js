/**
 * ItemPopupScene — 아이템 상세 + 장착/강화/구매 팝업 (재설계 v9 — 4×2 목업 포맷).
 *
 * 포맷 (사용자 목업 #1):
 *   A. 배너   — 카테고리 아이콘(좌) + 워드아트 제목(중앙) + 💰골드(우) + 닫기 ✕(코너)
 *   B. 히어로 — slot_hero(좌상단) + 아이템 아이콘 / 정보(우): 티어배지·이름 / 별 / 능력치 2열 / 상태 pill
 *   C. 그리드 — slot_item 4열 × 2행 = 8칸 고정. 각 칸: 티어배지 + 아이템 아이콘(티어색 틴트) + 자물쇠/가격 pill
 *   D. 액션   — [장착/구매](파랑) + [✦강화](초록)
 *
 * 카드 스타일은 고품질 참고 이미지(#2) 차용: 아이콘 중심 + 하단 가격 pill.
 * 잠김 아이템 직접 구매(골드 차감 + 보유 등록).
 */

import Phaser from 'phaser';
import { COLORS, FONT } from '../config/game.config.js';
import { strokeText, centerInBox } from '../ui/components.js';
import { placeContained, placeByWidth } from '../ui/scale.js';
import { TIER_META } from '../config/items.config.js';
import { getPopupConfig } from '../config/popups.config.js';
import {
  loadEquipment, equipItem, getOwnedItems, getBaitStock, acquireItem,
} from '../systems/Equipment.js';
import { loadProfile, addGold } from '../systems/UserProfile.js';
import { isCapturing, hexColor } from '../dev/uiCapture.js';
import { renderLayoutInto } from '../ui/LocationCard.js';
import { attachPopupAnims, bindPopupAnimLifecycle, resolveBind } from '@ohdyssey/phaser-ui-editor';

const PANEL_MAX_W = 700;
const PANEL_MARGIN_Y = 56;
const F = {
  // A. 배너 — 타이틀 위로 / 아이콘 우측 / 닫기 우측
  bannerIconCx: 0.250, bannerIconCy: 0.072, bannerIconW: 0.244,
  titleCx: 0.515, titleCy: 0.070, titleW: 0.260, titleH: 0.102,
  closeCx: 0.945, closeCy: 0.062, closeW: 0.120,
  // B. 히어로 — 별/능력치 위로 당김. 좌우 마진 0.105 대칭.
  heroIconCx: 0.205, heroIconCy: 0.292, heroIconW: 0.200,
  infoL: 0.325, infoR: 0.895,
  nameY: 0.190, starY: 0.228, statsTop: 0.266,
  statCellH: 0.058, statColGap: 0.014, statRowGap: 0.009,
  // C. 그리드 4×2 — 위로 이동(능력치에 가깝게) + 간격 좁힘
  gridTop: 0.470, gridBottom: 0.768, gridL: 0.105, gridR: 0.895,
  colGap: 0.016, rowGap: 0.018, slotMax: 0.178,
  // D. 액션
  plankCy: 0.886, btnW: 0.280, btnLCx: 0.300, btnRCx: 0.700,
};

const GRID_COLS = 4;
const GRID_ROWS = 2;
const GRID_SLOTS = GRID_COLS * GRID_ROWS;

const TITLE_KEY = { line: 'poptitle_line', bait: 'poptitle_bait', reel: 'poptitle_reel', rod: 'poptitle_rod' };
const CAT_KEY   = { reel: 'popcat_reel', lure: 'popcat_lure', line: 'popcat_line', rod: 'popcat_rod', bait: 'popcat_lure' };
const BAIT_ICON = {
  bait_shrimp: 'item_shrimp', bait_worm: 'item_worm', bait_crab: 'item_crab',
  bait_squid: 'item_squid', bait_pearl: 'item_pearl', bait_herring: 'item_fish_blue',
};
const STAT_ICON = {
  power: 'stat_power', strength: 'stat_power',
  visibility: 'stat_vis',
  rigidity: 'stat_def', drag: 'stat_def', stability: 'stat_def', durability: 'stat_def',
  depthLimit: 'stat_depth', length: 'stat_depth',
  reelSpeed: 'stat_speed', gearRatio: 'stat_speed', action: 'stat_speed', stretch: 'stat_speed',
};

const STROKE_LT = '#eaf6ff';
const PILL_GREEN = 0x2a9d4e;
const PILL_GOLD  = 0xe0900f;
const PRICE_PILL = 0x0c2944;

const MOCK_ENHANCE_LEVEL = 4;
const MOCK_ENHANCE_MAX   = 6;

export class ItemPopupScene extends Phaser.Scene {
  constructor() { super('ItemPopupScene'); }

  init(data) {
    this.slot = data?.slot;
    this.parentSceneKey = data?.parentSceneKey || this._findActiveParent();
    this.cfg = getPopupConfig(this.slot);
    if (!this.cfg) { this.scene.stop(); return; }
    const eq = loadEquipment();
    this._equippedId = eq[this.cfg.equippedKey];
    this._selectedId = this._equippedId || Object.keys(this.cfg.catalog)[0];
    this._enhanceLevel = MOCK_ENHANCE_LEVEL;
  }

  // 에디터 저장 레이아웃(외형 크롬) — slot 별 ui/layouts/{bait,line,reel,rod}.json. 캐시버스트.
  preload() {
    if (!this.slot) return;
    const key = `layout_${this.slot}`;
    this.cache.json.remove(key);
    this.load.json(key, `ui/layouts/${this.slot}.json?t=${Date.now()}`);
    this.load.once('loaderror', () => { /* 파일 없음 → 절차적 프레임 */ });
  }

  _findActiveParent() {
    const mgr = this.scene.manager;
    if (!mgr) return null;
    const skip = new Set(['ItemPopupScene', 'BootScene', 'LoadingScene', 'LocationLoaderScene']);
    for (const s of mgr.scenes) {
      if (s.scene.key === this.scene.key) continue;
      if (skip.has(s.scene.key)) continue;
      if (s.scene.isActive() || s.scene.isVisible()) return s.scene.key;
    }
    return null;
  }

  create() {
    if (!this.cfg) return;
    const W = this.scale.width; const H = this.scale.height;
    this._layoutChrome = false;   // 인스턴스 재사용 — 매 오픈마다 초기화(폴백 시 stale true 방지).
    if (this.parentSceneKey && this.scene.isActive(this.parentSceneKey)) this.scene.pause(this.parentSceneKey);
    this._frameLayer = this.add.container(0, 0).setDepth(0);
    this._contentLayer = this.add.container(0, 0).setDepth(10);
    this._buildBackdrop(W, H);

    // 크롬 하이브리드: 레이아웃이 외형(패널/타이틀/카테고리/닫기)을 그리고 동적 콘텐츠는 절차적.
    const layout = this.cache.json.get(`layout_${this.slot}`);
    if (layout && Array.isArray(layout.nodes) && layout.nodes.length) this._buildFromLayoutFrame(layout, W, H);
    else this._buildPopupFrame(W, H);

    this._renderContent();
    this.input.keyboard?.on('keydown-ESC', () => this._close());
    this.scene.bringToTop();

    bindPopupAnimLifecycle(this);   // 인스턴스당 1회 — 누적 방지.
  }

  update(_t, deltaMs) { this._popupAnim?.update(deltaMs / 1000); }

  // 레이아웃 크롬 렌더 + this._p(콘텐츠 좌표 기준) 도출 + 저작 애니메이션 부착.
  _buildFromLayoutFrame(layout, W, H) {
    const fw = layout.frame.designW, fh = layout.frame.designH;
    this._layoutFrame = { fw, fh };
    const container = this.add.container(W / 2, H / 2).setDepth(5);
    const { nodeMap } = renderLayoutInto(this, container, layout, {});
    this._chromeContainer = container;
    const entries = [...nodeMap.values()];
    const tagOf = (e) => `${e.node.key || ''} ${e.node.name || ''}`;

    // 크롬 allow-list: 패널/타이틀/카테고리/닫기.
    const panelE = entries.find((e) => /panel_popup/.test(tagOf(e)))
      || entries.find((e) => (e.node.type === 'image' || e.node.type === 'rect') && (e.node.w || 0) > fw * 0.7 && (e.node.h || 0) > fh * 0.5);
    const titleE = entries.find((e) => /poptitle_/.test(tagOf(e)));
    const catE = entries.find((e) => /popcat_/.test(tagOf(e)));
    const closeE = resolveBind(entries, 'close', () =>
      entries.find((e) => /btn_pop_close/.test(tagOf(e)) || e.node.name === '닫기')
      || entries.find((e) => e.node.type === 'circle'));

    const chrome = new Set([panelE, titleE, catE, closeE].filter(Boolean));
    for (const e of entries) {
      if (chrome.has(e)) continue;
      e.objects.forEach((o) => o.setVisible && o.setVisible(false));   // 캡처된 정적 콘텐츠 숨김 → 절차적 라이브로 대체.
    }

    // this._p — 콘텐츠 배치 기준(절차적 _buildPopupFrame 와 동형). 패널 노드 월드 사각형.
    const pCx = panelE ? panelE.node.x : (fw / 2);
    const pW = panelE ? (panelE.node.w || fw) : Math.min(PANEL_MAX_W, W - 16);
    const pH = panelE ? (panelE.node.h || fh) : (H - PANEL_MARGIN_Y);
    const pCyWorld = H / 2 + ((panelE ? panelE.node.y : fh / 2) - fh / 2);
    this._p = { left: pCx - pW / 2, top: pCyWorld - pH / 2, w: pW, h: pH, cx: pCx };

    // 패널 영역 입력 차단(빈 곳 클릭이 backdrop=닫기로 새지 않도록).
    this._frameLayer.add(this.add.rectangle(pCx, pCyWorld, pW, pH, 0x000000, 0.001).setInteractive());

    // 닫기 hit(레이아웃 노드 위치).
    if (closeE) this._wireChromeHit(closeE.node, () => this._close());

    // 저작 애니메이션 — 등장 + idle(크롬 노드 대상, 선택변경 시 재생성 안 됨).
    this._popupAnim = attachPopupAnims(this, { nodeMap, layout, container });
    this._popupAnim.fireEnter();
    this._layoutChrome = true;
  }

  _wireChromeHit(node, handler) {
    if (!node || !handler) return;
    const { fw, fh } = this._layoutFrame;
    const lx = node.x - fw / 2, ly = node.y - fh / 2;
    const w = node.w || (node.r ? node.r * 2 : 60), h = node.h || (node.r ? node.r * 2 : 60);
    const hit = this.add.rectangle(lx, ly, w, h, 0x000000, 0.001).setInteractive({ useHandCursor: true });
    this._chromeContainer.add(hit);
    hit.on('pointerdown', () => handler());
  }

  _buildBackdrop(W, H) {
    const bd = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65);
    bd.setInteractive().on('pointerdown', () => this._close());
    this._frameLayer.add(bd);
  }

  _buildPopupFrame(W, H) {
    const cx = W / 2; const cy = H / 2;
    const maxW = Math.min(PANEL_MAX_W, W - 16);
    const maxH = H - PANEL_MARGIN_Y;
    let dW; let dH;
    if (this.textures.exists('panel_popup')) {
      const img = this.add.image(cx, cy, 'panel_popup').setOrigin(0.5);
      const tex = img.texture.getSourceImage();
      img.setScale(Math.min(maxW / tex.width, maxH / tex.height));
      this._frameLayer.add(img);
      dW = img.displayWidth; dH = img.displayHeight;
    } else {
      dW = Math.min(680, W - 40); dH = Math.min(maxH, dW / 0.741);
      this._frameLayer.add(this.add.rectangle(cx, cy, dW, dH, 0x162d4a, 0.97).setStrokeStyle(3, 0x4e9aff, 1));
    }
    this._frameLayer.add(this.add.rectangle(cx, cy, dW, dH, 0x000000, 0.001).setInteractive());
    this._p = { left: cx - dW / 2, top: cy - dH / 2, w: dW, h: dH, cx };
  }

  _fx(fr) { return this._p.left + fr * this._p.w; }
  _fy(fr) { return this._p.top + fr * this._p.h; }

  _img(key, cx, cy, w, h, tint) {
    if (!this.textures.exists(key)) return null;
    const img = placeContained(this, key, cx, cy, w, h);
    if (tint != null) img.setTint(tint);
    this._contentLayer.add(img);
    return img;
  }

  _roundRect(cx, cy, w, h, radius, fill, fillAlpha = 1, strokeColor = null, strokeW = 0) {
    const g = this.add.graphics();
    const x = cx - w / 2; const y = cy - h / 2;
    if (fillAlpha > 0) { g.fillStyle(fill, fillAlpha); g.fillRoundedRect(x, y, w, h, radius); }
    if (strokeColor != null && strokeW > 0) { g.lineStyle(strokeW, strokeColor, 1); g.strokeRoundedRect(x, y, w, h, radius); }
    // UI 캡처용 — 절차적 도형 지오메트리를 그래픽스 객체에 태깅(캡처 활성 시에만). 게임 동작 무관.
    if (isCapturing()) g.__capRect = { x: cx, y: cy, w, h, radius, fill: hexColor(fill), fillAlpha, stroke: strokeColor != null ? hexColor(strokeColor) : null, strokeW };
    this._contentLayer.add(g);
    return g;
  }

  _pill(anchorX, cy, text, { fill, fontSize = FONT.size.sm, originX = 0, textColor = '#ffffff', textStroke = COLORS.textStroke } = {}) {
    const t = strokeText(this, 0, cy, text, fontSize, { color: textColor, strokeColor: textStroke, strokeWidth: 3 });
    const padX = Math.round(fontSize * 0.7) + 5;
    const w = Math.ceil(t.width) + padX * 2;
    const h = fontSize + 13;
    const left = originX === 0 ? anchorX : (originX === 1 ? anchorX - w : anchorX - w / 2);
    this._roundRect(left + w / 2, cy, w, h, h / 2, fill, 1, 0x06243f, 2);
    t.setX(left + padX); centerInBox(t, 0); this._contentLayer.add(t);
    return { w, right: left + w, left };
  }

  _renderContent() {
    this._contentLayer.removeAll(true);
    this._gold = loadProfile().gold ?? 0;
    // 레이아웃 크롬이 배너/닫기/카테고리를 제공하면 절차적 중복 렌더 생략.
    if (!this._layoutChrome) { this._buildBanner(); this._buildClose(); }
    this._buildHero();
    this._buildGrid();
    this._buildActions();
  }

  // A. 배너 ────────────────────────────────────────
  _buildBanner() {
    const catKey = CAT_KEY[this.slot];
    if (catKey) this._img(catKey, this._fx(F.bannerIconCx), this._fy(F.bannerIconCy), F.bannerIconW * this._p.w, F.bannerIconW * this._p.w);
    const titleKey = TITLE_KEY[this.slot];
    if (titleKey && this.textures.exists(titleKey)) {
      this._img(titleKey, this._fx(F.titleCx), this._fy(F.titleCy), F.titleW * this._p.w, F.titleH * this._p.h);
    } else {
      const t = strokeText(this, this._fx(F.titleCx), this._fy(F.titleCy), this.cfg.title, FONT.size.xl,
        { color: COLORS.textWhite, strokeColor: COLORS.textStroke, strokeWidth: 6 });
      centerInBox(t, 0.5); this._contentLayer.add(t);
    }
  }

  _buildClose() {
    const cx = this._fx(F.closeCx); const cy = this._fy(F.closeCy); const w = F.closeW * this._p.w;
    if (this.textures.exists('btn_pop_close')) {
      const img = placeByWidth(this, 'btn_pop_close', cx, cy, w, { maxScale: 1.4 });
      img.setInteractive({ useHandCursor: true }).on('pointerdown', () => this._close());
      this._contentLayer.add(img);
    } else {
      const bg = this.add.circle(cx, cy, w / 2, 0xe63946, 1).setStrokeStyle(3, 0xffffff, 0.9);
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => this._close());
      this._contentLayer.add(bg);
      const t = strokeText(this, cx, cy, '✕', FONT.size.md, { color: '#fff', strokeColor: '#7a1818', strokeWidth: 3 });
      centerInBox(t, 0.5); this._contentLayer.add(t);
    }
  }

  // B. 히어로 ──────────────────────────────────────
  _buildHero() {
    const item = this.cfg.catalog[this._selectedId];
    if (!item) return;

    const iconCx = this._fx(F.heroIconCx); const iconCy = this._fy(F.heroIconCy);
    const iconW = F.heroIconW * this._p.w;
    if (!this._img('slot_hero', iconCx, iconCy, iconW, iconW)) {
      this._contentLayer.add(this.add.rectangle(iconCx, iconCy, iconW, iconW, 0xbfe4ff, 1).setStrokeStyle(3, 0x6fb6e8, 1));
    }
    // 우선순위: item.icon(신규 line_NN / bait_NN) > 레거시 BAIT_ICON 매핑 > 카테고리 기본 아이콘
    const itemIconKey = item.icon
      || (this.slot === 'bait' && BAIT_ICON[item.id])
      || CAT_KEY[this.slot]
      || this.cfg.heroIconKey;
    if (itemIconKey) this._img(itemIconKey, iconCx, iconCy, iconW * 0.66, iconW * 0.66);

    const infoL = this._fx(F.infoL);

    // 티어 배지 + 이름.
    const nameY = this._fy(F.nameY);
    const badgeW = 0.066 * this._p.w;
    const badgeImg = this._img(`tier_badge_${item.tier}`, infoL + badgeW / 2, nameY, badgeW, badgeW * 0.95);
    const nameX = infoL + (badgeImg ? badgeW + 14 : 0);
    const nameTxt = strokeText(this, nameX, nameY, item.name, 28, { color: COLORS.textWhite, strokeColor: COLORS.textStroke, strokeWidth: 6 });
    nameTxt.setOrigin(0, 0.5); centerInBox(nameTxt, 0); this._contentLayer.add(nameTxt);

    // 강화 별.
    const starY = this._fy(F.starY); const starSz = 0.039 * this._p.w;
    let sx = infoL + starSz / 2;
    for (let i = 0; i < MOCK_ENHANCE_MAX; i++) {
      const key = i < this._enhanceLevel ? 'pop_star_on' : 'pop_star_off';
      if (!this._img(key, sx, starY, starSz, starSz)) {
        const st = strokeText(this, sx, starY, i < this._enhanceLevel ? '★' : '☆', FONT.size.sm, { color: '#ffc21e', strokeColor: COLORS.textStroke, strokeWidth: 2 });
        centerInBox(st, 0.5); this._contentLayer.add(st);
      }
      sx += starSz + 2;
    }
    const lvTxt = strokeText(this, sx + 4, starY, `${this._enhanceLevel}/${MOCK_ENHANCE_MAX}`, FONT.size.sm, { color: '#b9740a', strokeColor: STROKE_LT, strokeWidth: 2 });
    lvTxt.setOrigin(0, 0.5); centerInBox(lvTxt, 0); this._contentLayer.add(lvTxt);

    // 능력치 — 이미지 #2 스타일 라이트 셀 (아이콘 + 라벨 + 값→강화).
    const isEquipped = item.id === this._equippedId;
    const canEnhance = isEquipped && this._enhanceLevel < MOCK_ENHANCE_MAX;
    const rows = this.cfg.statRows;
    const areaW = (F.infoR - F.infoL) * this._p.w;
    const colGap = F.statColGap * this._p.w;
    const cellW = (areaW - colGap) / 2;
    const cellH = F.statCellH * this._p.h;
    const rowGap = F.statRowGap * this._p.h;
    const rowPitch = cellH + rowGap;
    rows.forEach((row, i) => {
      const col = i % 2; const r = Math.floor(i / 2);
      const cellL = infoL + col * (cellW + colGap);
      const cellTop = this._fy(F.statsTop) + r * rowPitch;
      this._statCell(cellL, cellTop, cellW, cellH, row, item, canEnhance);
    });
  }

  /** 능력치 셀 — 청색 배경 + 크림 아이콘박스 + 흰색 라벨/값(크게) + 초록 강화. */
  _statCell(cellL, cellTop, cw, ch, row, item, canEnhance) {
    // 셀 배경 (청색).
    this._roundRect(cellL + cw / 2, cellTop + ch / 2, cw, ch, 13, 0x2f7cc0, 1, 0x7ec2ee, 2);
    // 아이콘 박스 (크림).
    const ibW = ch * 0.70;
    const ibx = cellL + 8 + ibW / 2;
    this._roundRect(ibx, cellTop + ch / 2, ibW, ibW, 9, 0xfdf2d6, 1, 0xe6c88a, 1);
    const iconKey = STAT_ICON[row.key];
    if (!(iconKey && this._img(iconKey, ibx, cellTop + ch / 2, ibW * 0.82, ibW * 0.82))) {
      const em = strokeText(this, ibx, cellTop + ch / 2, row.icon, FONT.size.md, { color: '#b9740a', strokeColor: '#ffffff', strokeWidth: 2 });
      centerInBox(em, 0.5); this._contentLayer.add(em);
    }
    const tx = cellL + ibW + 18;
    // 라벨 (위) — 흰색.
    const lab = strokeText(this, tx, cellTop + ch * 0.30, row.label, FONT.size.sm, { color: '#ffffff', strokeColor: COLORS.textStroke, strokeWidth: 3 });
    lab.setOrigin(0, 0.5); centerInBox(lab, 0); this._contentLayer.add(lab);
    // 라벨 옆 진행바 (밝게).
    const barX0 = tx + lab.width + 9; const barX1 = cellL + cw - 12;
    if (barX1 - barX0 > 14) this._roundRect((barX0 + barX1) / 2, cellTop + ch * 0.30, barX1 - barX0, 5, 2.5, 0xbfe2fa, 0.85);
    // 값 (아래) — 흰색(크게) + 강화 → 초록. (긴 값은 셀 폭에 맞춰 절단)
    let valStr = row.format(item[row.key]).replace(/ \/ /g, '/');
    if (valStr.length > 11) valStr = valStr.slice(0, 10) + '…';
    const valTxt = strokeText(this, tx, cellTop + ch * 0.70, valStr, FONT.size.md, { color: '#ffffff', strokeColor: COLORS.textStroke, strokeWidth: 3 });
    valTxt.setOrigin(0, 0.5); centerInBox(valTxt, 0); this._contentLayer.add(valTxt);
    if (canEnhance && row.enhanceNext != null) {
      const ax = tx + valTxt.width + 7;
      const ar = strokeText(this, ax, cellTop + ch * 0.70, '→', FONT.size.sm, { color: '#cfe8ff', strokeColor: COLORS.textStroke, strokeWidth: 2 });
      ar.setOrigin(0, 0.5); centerInBox(ar, 0); this._contentLayer.add(ar);
      const nt = strokeText(this, ax + ar.width + 5, cellTop + ch * 0.70, row.format(row.enhanceNext(item[row.key])).replace(/ \/ /g, '/'), FONT.size.md, { color: '#8ff0a8', strokeColor: COLORS.textStroke, strokeWidth: 3 });
      nt.setOrigin(0, 0.5); centerInBox(nt, 0); this._contentLayer.add(nt);
    }
  }

  // C. 그리드 4×2 (참고 #2 카드 스타일) ─────────────
  _buildGrid() {
    // 30종 카탈로그 → 티어별 대표 1종(`featured: true`) 만 그리드 표시 (legacy 별칭 제외).
    //   featured 없는 카탈로그(루어 등) 는 전체 노출(상위 8개).
    const all = Object.values(this.cfg.catalog).filter((it) => !it.legacy);
    const featuredOnly = all.filter((it) => it.featured);
    const items = (featuredOnly.length > 0 ? featuredOnly : all).sort((a, b) => a.tier - b.tier);
    const ownedSet = new Set(getOwnedItems(this.slot));
    const gridLeft = this._fx(F.gridL);
    const gridW = (F.gridR - F.gridL) * this._p.w;
    const colGap = F.colGap * this._p.w;
    const slotW = Math.min(F.slotMax * this._p.w, (gridW - (GRID_COLS - 1) * colGap) / GRID_COLS);
    const rowGap = F.rowGap * this._p.h;
    const rowPitch = slotW + rowGap;
    const availTop = this._fy(F.gridTop);
    const availH = (F.gridBottom - F.gridTop) * this._p.h;
    const blockH = GRID_ROWS * rowPitch - rowGap;
    const startY = availTop + Math.max(0, (availH - blockH) / 2);
    const rowW = GRID_COLS * slotW + (GRID_COLS - 1) * colGap;
    const firstColCx = this._p.cx - rowW / 2 + slotW / 2;

    for (let i = 0; i < GRID_SLOTS; i++) {
      const col = i % GRID_COLS; const r = Math.floor(i / GRID_COLS);
      const cx = firstColCx + col * (slotW + colGap);
      const cy = startY + slotW / 2 + r * rowPitch;
      const item = items[i];
      if (item) {
        this._buildSlot(cx, cy, slotW, item, {
          isOwned: ownedSet.has(item.id),
          isEquipped: item.id === this._equippedId,
          isSelected: item.id === this._selectedId,
        });
      } else {
        if (!this._dimImg('slot_item', cx, cy, slotW, slotW, 0.4)) this._roundRect(cx, cy, slotW, slotW, 14, 0x2a3f5c, 0.4);
      }
    }
  }

  _dimImg(key, cx, cy, w, h, alpha) {
    const img = this._img(key, cx, cy, w, h);
    if (img) img.setAlpha(alpha);
    return img;
  }

  _buildSlot(cx, cy, sw, item, { isOwned, isEquipped, isSelected }) {
    const affordable = (item.price ?? 0) <= this._gold;

    if (isEquipped) this._roundRect(cx, cy, sw + 12, sw + 12, 18, 0xffd147, 0.30);

    // 슬롯 배경 (상태 무관 자연색 — 참고 #2: 잠김도 회색처리 없이 pill 로 표시).
    if (this.textures.exists('slot_item')) {
      this._contentLayer.add(placeContained(this, 'slot_item', cx, cy, sw, sw));
    } else {
      this._roundRect(cx, cy, sw, sw, 14, 0x2f6db5, 1, 0x1a4a7a, 2);
    }

    // 아이템 아이콘 (자연색) — item.icon 우선, 없으면 카테고리 기본.
    const iconKey = item.icon
      || (this.slot === 'bait' && BAIT_ICON[item.id])
      || CAT_KEY[this.slot]
      || this.cfg.heroIconKey;
    if (iconKey) this._img(iconKey, cx, cy - sw * 0.06, sw * 0.62, sw * 0.62);

    // 티어 배지 (좌상단) — 조금 작게.
    const bw = sw * 0.32;
    this._img(`tier_badge_${item.tier}`, cx - sw / 2 + bw / 2 + 7, cy - sw / 2 + bw * 0.5 + 6, bw, bw * 0.95);

    // 하단 상태 pill.
    const py = cy + sw / 2 - sw * 0.16;
    if (isEquipped) {
      this._pill(cx, py, '장착중', { fill: PILL_GOLD, fontSize: FONT.size.xs, originX: 0.5, textColor: '#fff' });
    } else if (isOwned) {
      this._pill(cx, py, '보유', { fill: PILL_GREEN, fontSize: FONT.size.xs, originX: 0.5 });
    } else {
      this._pill(cx, py, `🔒 ${(item.price ?? 0).toLocaleString()}G`, { fill: PRICE_PILL, fontSize: FONT.size.xs, originX: 0.5, textColor: affordable ? '#ffe48a' : '#ff9b9b' });
    }

    if (isSelected) this._roundRect(cx, cy, sw + 7, sw + 7, 16, 0x000000, 0, 0xffd147, 4);

    const hit = this.add.rectangle(cx, cy, sw, sw, 0x000000, 0).setInteractive({ useHandCursor: true });
    this._contentLayer.add(hit);
    hit.on('pointerdown', () => {
      if (this._selectedId === item.id) return;
      this._selectedId = item.id; this._renderContent();
    });
  }

  // D. 액션 ────────────────────────────────────────
  _buildActions() {
    const item = this.cfg.catalog[this._selectedId];
    if (!item) return;
    const cy = this._fy(F.plankCy);
    const btnW = F.btnW * this._p.w;
    const leftCx = this._fx(F.btnLCx); const rightCx = this._fx(F.btnRCx);
    const isOwned = new Set(getOwnedItems(this.slot)).has(item.id);
    const isEquipped = item.id === this._equippedId;
    const price = item.price ?? 0; const affordable = price <= this._gold;

    let lLabel; let lEnabled; let lAction;
    if (isEquipped) { lLabel = '장착중 ✓'; lEnabled = false; lAction = null; }
    else if (isOwned) { lLabel = '장착하기'; lEnabled = true; lAction = () => this._doEquip(); }
    else if (affordable) { lLabel = `구매 ${price.toLocaleString()}G`; lEnabled = true; lAction = () => this._doBuy(); }
    else { lLabel = `골드 부족\n${price.toLocaleString()}G`; lEnabled = false; lAction = () => this._toast(`골드가 부족합니다 (${price.toLocaleString()}G 필요)`); }
    this._imageButton('btn_pop_blue', leftCx, cy, btnW, lLabel, lEnabled, lAction);

    const ec = this.cfg.enhanceCost; const eMax = this._enhanceLevel >= MOCK_ENHANCE_MAX;
    const canEnh = isEquipped && !eMax;
    const matStr = ec?.materials?.[0] ? `+${ec.materials[0].name}×${ec.materials[0].count}` : '';
    const eLabel = eMax ? '✦ 최대 강화' : (isEquipped ? `✦ 강화 ${ec.gold.toLocaleString()}G\n${matStr}` : '✦ 강화\n(장착 후)');
    this._imageButton('btn_pop_green', rightCx, cy, btnW, eLabel, canEnh, canEnh ? () => this._doEnhance() : null);
  }

  _imageButton(key, cx, cy, targetW, label, enabled, onClick) {
    let base;
    if (this.textures.exists(key)) {
      const img = placeByWidth(this, key, cx, cy, targetW, { maxScale: 1.4 });
      if (!enabled) img.setTint(0x9a9a9a);
      this._contentLayer.add(img); base = img;
    } else {
      base = this.add.rectangle(cx, cy, targetW, targetW * 0.45, enabled ? 0x3a8de0 : 0x6a6a72, 1).setStrokeStyle(3, 0x062a55, 1);
      this._contentLayer.add(base);
    }
    const txt = strokeText(this, cx, cy, label, FONT.size.md, { color: COLORS.textWhite, strokeColor: COLORS.textStroke, strokeWidth: 3 });
    txt.setAlign('center'); txt.setLineSpacing(2); centerInBox(txt, 0.5); this._contentLayer.add(txt);
    if (enabled && onClick) {
      const s = base.scaleX || 1; const sy = base.scaleY || 1;
      base.setInteractive({ useHandCursor: true });
      base.on('pointerdown', () => {
        this._popupAnim?.fireTap();   // 레이아웃에 tap 트리거 저작 시 재생(없으면 no-op).
        this.tweens.add({ targets: base, scaleX: s * 0.95, scaleY: sy * 0.95, yoyo: true, duration: 80, onComplete: onClick });
        this.tweens.add({ targets: txt, scale: 0.95, yoyo: true, duration: 80 });
      });
    }
  }

  // ─── 액션 로직 ───
  _doEquip() {
    if (!this.cfg) return;
    equipItem(this.slot, this._selectedId);
    this._equippedId = this._selectedId;
    this._toast(`장착 완료: ${this.cfg.catalog[this._selectedId].name}`);
    this._renderContent();
  }

  _doBuy() {
    const item = this.cfg.catalog[this._selectedId];
    if (!item) return;
    const price = item.price ?? 0;

    // 이미 보유한 아이템이면 골드 차감 없이 종료(중복 구매 방지).
    if (getOwnedItems(this.slot).includes(item.id)) { this._toast(`이미 보유 중입니다: ${item.name}`); return; }

    // 결제 직전 최신 잔액으로 재검증(렌더 시점 스냅샷이 오래되어 음수/과다 차감되는 것 방지).
    const profile = loadProfile();
    const balanceBefore = profile.gold ?? 0;
    if (balanceBefore < price) { this._toast(`골드가 부족합니다 (${price.toLocaleString()}G 필요)`); return; }

    // 1) 골드 먼저 차감 + 저장. 아이템 지급보다 먼저 처리해 중단/저장실패 시 '공짜 아이템' 누수 방지.
    addGold(profile, -price);

    // 2) 차감이 실제로 영속화됐는지 확인(addGold/saveProfile 는 boolean 미반환 — STATE-07 별도 파일).
    //    재로드한 골드가 기대치와 일치하지 않으면 저장 실패로 간주하고 아이템 지급을 중단.
    const expected = Math.max(0, balanceBefore - price);
    if ((loadProfile().gold ?? 0) > expected) {
      this._toast('구매 처리 중 오류가 발생했습니다 (저장 실패)');
      this._renderContent();
      return;
    }

    // 3) 차감 확인 후에만 아이템 지급.
    acquireItem(this.slot, item.id);
    if (!getOwnedItems(this.slot).includes(item.id)) {
      // 지급 실패 → 차감했던 골드 환불(경제 데싱크 방지).
      addGold(profile, price);
      this._toast('구매 처리 중 오류가 발생했습니다');
      this._renderContent();
      return;
    }

    this._toast(`구매 완료: ${item.name} (-${price.toLocaleString()}G)`);
    this._renderContent();
  }

  _doEnhance() { this._toast('강화 시스템 — 별도 Phase 작업에서 연결 예정'); }

  _toast(msg) {
    const t = strokeText(this, this._p.cx, this._fy(0.16), msg, FONT.size.sm, { color: '#fff', strokeColor: '#000', strokeWidth: 4 });
    centerInBox(t, 0.5); t.setDepth(1000);
    this.tweens.add({ targets: t, alpha: { from: 1, to: 0 }, y: t.y - 20, duration: 1500, onComplete: () => t.destroy() });
  }

  _close() {
    if (this.parentSceneKey) {
      if (this.scene.isPaused(this.parentSceneKey)) this.scene.resume(this.parentSceneKey);
      const parent = this.scene.get(this.parentSceneKey);
      if (parent?.events) parent.events.emit('item-popup-closed');
    }
    this.scene.stop();
  }
}
