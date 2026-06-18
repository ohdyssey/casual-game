/**
 * AlbumScene — 도감 (등록 어종 + 상세 정보).
 *
 * 흐름:
 *   preload(): 19종 sprite 시트 + animation 사전 로드 (도감 진입 시 모든 자연색 아이콘 보장).
 *   create() : 진행도 + 4×N 어종 카드 그리드 + 카드 탭 시 상세 팝업.
 *
 * 상세 팝업:
 *   대형 sprite + 한글/영문/학명 + 실 사이즈(cm) + 점수 + 잡은 횟수 + 최대 사이즈.
 */

import Phaser from 'phaser';
import {
  buildBackdrop, buildPanel, buildHeader, buildCard, buildText,
  blockUnderlyingInput, PALETTE, DEPTH,
} from '../ui/popup.js';
import { FISH_SPECIES } from '../config/fish.config.js';
import { ASSETS_SPRITESHEETS, ANIMATIONS } from '../config/assets.config.js';
import { FISH_CATALOG, FISH_CATALOG_GAMEPLAY } from '../config/fish-catalog.js';
import { loadInventory, getCaughtSpeciesCount } from '../systems/FishInventory.js';
import { renderLayoutInto } from '../ui/LocationCard.js';
import { attachPopupAnims, bindPopupAnimLifecycle, resolveBind } from '@ohdyssey/phaser-ui-editor';

export class AlbumScene extends Phaser.Scene {
  constructor() { super('AlbumScene'); }

  preload() {
    // 도감 표시용 — 모든 등록 어종 sprite 시트를 사전 로드.
    //   다른 낚시터의 sprite 도 자연색으로 보여주기 위해 LRU 캐시 무시하고 한번에 적재.
    //   ~12-14개 시트 × ~30 KB = ~400 KB (디스크), GPU ~28 MB (모바일 안전 범위).
    //
    // 확장 hook: def.albumIcon 이 정의되어 있고 ASSETS 에 등록되면 dedicated 이미지 우선.
    //   별도 도감 일러스트가 준비되는 즉시 fish.config.js 에 albumIcon: 'album_xxx' 만 추가.
    const needed = new Set();
    for (const def of FISH_SPECIES) {
      if (def.sprite && !this.textures.exists(def.sprite)) needed.add(def.sprite);
    }
    for (const key of needed) {
      const meta = ASSETS_SPRITESHEETS[key];
      if (!meta) continue;
      this.load.spritesheet(key, meta.path, {
        frameWidth:  meta.frameWidth,
        frameHeight: meta.frameHeight,
      });
    }

    // 에디터 저장 레이아웃(외형 크롬) — 없으면 절차적 폴백. 캐시버스트로 편집 즉시 반영.
    this.cache.json.remove('layout_album');
    this.load.json('layout_album', `ui/layouts/album.json?t=${Date.now()}`);
    this.load.once('loaderror', () => { /* 파일 없음 → 절차적 폴백 */ });
  }

  // 도감 아이콘 텍스처 키 — 별도 album 이미지 > sprite 시트 frame 0 폴백.
  _albumIconKey(def) {
    if (def.albumIcon && this.textures.exists(def.albumIcon)) return def.albumIcon;
    if (def.sprite && this.textures.exists(def.sprite)) return def.sprite;
    return null;
  }

  create() {
    // 로드 후 animation 등록 (LocationLoaderScene 와 동일 정책).
    this._registerAnimationsForLoadedFish();

    blockUnderlyingInput(this);
    const layout = this.cache.json.get('layout_album');
    if (layout && Array.isArray(layout.nodes) && layout.nodes.length) this._buildFromLayout(layout);
    else this._buildProcedural();

    bindPopupAnimLifecycle(this);   // 인스턴스당 1회 — 누적 방지.
  }

  update(_t, deltaMs) { this._popupAnim?.update(deltaMs / 1000); }

  // ─── 절차적(레이아웃 파일 없을 때) ───
  _buildProcedural() {
    const onClose = () => this.scene.stop();
    buildBackdrop(this, onClose);
    const p = buildPanel(this);
    const h = buildHeader(this, p, '📖 도감', onClose);

    const totalSpecies = FISH_SPECIES.length;
    const caughtCount = getCaughtSpeciesCount();

    // 진행도 라벨.
    const progY = h.bottomY + 20;
    buildText(this, p.cx, progY, `${caughtCount} / ${totalSpecies} 종 발견`, {
      fontSize: '20px', fontStyle: 'bold',
      color: PALETTE.titleText, origin: { x: 0.5, y: 0.5 },
    });

    this._buildGrid(p, progY + 28);
  }

  // ─── 크롬 하이브리드: 레이아웃이 외형(패널/헤더/타이틀/닫기/진행도)을 그리고
  //     라이브 그리드는 절차적으로 패널 위에 얹는다(실시간 도감 상태 보존). ───
  _buildFromLayout(layout) {
    const W = this.scale.width, H = this.scale.height;
    const fw = layout.frame.designW, fh = layout.frame.designH;
    this._layoutFrame = { fw, fh };
    const onClose = () => this.scene.stop();

    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setInteractive().on('pointerdown', onClose).setDepth(0);

    const container = this.add.container(W / 2, H / 2).setDepth(10);
    const { nodeMap } = renderLayoutInto(this, container, layout, {});
    this._container = container;
    const entries = [...nodeMap.values()];

    // 크롬 식별 — role 우선(저자 지정 시 안정) → 휴리스틱 폴백.
    const panelE = entries.find((e) => e.node.name === '패널')
      || entries.find((e) => (e.node.type === 'rect' || e.node.type === 'image') && (e.node.w || 0) > fw * 0.7 && (e.node.h || 0) > fh * 0.5);
    const progE = resolveBind(entries, 'progress', () => entries.find((e) => e.node.type === 'text' && /종\s*발견|\d+\s*\/\s*\d+/.test(e.node.text || '')));
    const titleE = resolveBind(entries, 'title', () => entries.find((e) => e.node.type === 'text' && /도감|📖/.test(e.node.text || '')));
    const headerE = entries.find((e) => e.node !== panelE && (e.node.type === 'rect' || e.node.type === 'image') && (e.node.w || 0) > fw * 0.6 && e.node.y < fh * 0.14);
    const closeE = resolveBind(entries, 'close', () =>
      entries.find((e) => e.node.name === '닫기')
      || entries.find((e) => e.node.type === 'circle')
      || entries.find((e) => e.node.x > fw * 0.82 && e.node.y < fh * 0.12));

    // 본문(그리드) 영역의 작은 노드(캡처된 정적 셀)만 숨김 → 라이브 그리드로 대체.
    //   상단 크롬(패널/헤더/타이틀/✕/구분선/진행도)은 유지 → 외형·애니메이션 보존.
    const keep = new Set([panelE, progE, titleE, headerE, closeE].filter(Boolean));
    const bodyTopDesign = (progE ? progE.node.y : fh * 0.18) + 8;
    for (const e of entries) {
      if (keep.has(e) || e === panelE) continue;
      const inBody = (e.node.y || 0) > bodyTopDesign;
      const small = (e.node.w || 0) < fw * 0.45;
      if (inBody && small) e.objects.forEach((o) => o.setVisible && o.setVisible(false));
    }

    // 진행도 라이브 갱신.
    if (progE) {
      const t = progE.objects.find((o) => o.setText);
      if (t) t.setText(`${getCaughtSpeciesCount()} / ${FISH_SPECIES.length} 종 발견`);
    }

    // 닫기 + ESC.
    if (closeE) this._wireHit(closeE.node, onClose);
    this.input.keyboard?.on('keydown-ESC', onClose);

    // 저작 애니메이션 — 등장 + idle(크롬 노드 대상).
    this._popupAnim = attachPopupAnims(this, { nodeMap, layout, container });
    this._popupAnim.fireEnter();

    // 라이브 그리드 — 패널 노드에서 월드 사각형 도출(컨테이너 중심정렬 보정).
    const pCx = panelE ? panelE.node.x : fw / 2;
    const pW = panelE ? (panelE.node.w || fw * 0.92) : fw * 0.92;
    const pH = panelE ? (panelE.node.h || fh * 0.8) : fh * 0.8;
    const pCyWorld = H / 2 + ((panelE ? panelE.node.y : fh / 2) - fh / 2);
    const p = { x: pCx - pW / 2, y: pCyWorld - pH / 2, w: pW, h: pH, cx: pCx };
    const gridTop = progE ? (H / 2 + (progE.node.y - fh / 2)) + 30 : p.y + 90;
    this._buildGrid(p, gridTop);
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

  // 4 × N 어종 그리드 — 절차적/하이브리드 공용. p={x,y,w,h,cx} 월드 사각형, gridTop 월드 y.
  _buildGrid(p, gridTop) {
    const PAD = 18;
    const inventory = loadInventory();
    const species = FISH_SPECIES.slice().sort((a, b) => (a.size || 0) - (b.size || 0));
    const totalSpecies = species.length;

    const gridBottom = p.y + p.h - 24;
    const gridW = p.w - PAD * 2;
    const cols = 4;
    const gap = 8;
    const cellW = (gridW - gap * (cols - 1)) / cols;
    const cellH = cellW * 1.30;             // sprite + 이름 + 사이즈 라벨 위해

    const rowsNeeded = Math.ceil(totalSpecies / cols);
    const gridH = rowsNeeded * cellH + (rowsNeeded - 1) * gap;
    const gridStartY = gridTop + Math.max(0, (gridBottom - gridTop - gridH) / 2);

    for (let i = 0; i < totalSpecies; i++) {
      const def = species[i];
      const c = i % cols;
      const r = Math.floor(i / cols);
      const cx = p.x + PAD + c * (cellW + gap);
      const cy = gridStartY + r * (cellH + gap);
      this._buildSpeciesCard(def, inventory[def.id], cx, cy, cellW, cellH);
    }
  }

  _registerAnimationsForLoadedFish() {
    for (const [animKey, def] of Object.entries(ANIMATIONS)) {
      if (this.anims.exists(animKey)) continue;
      if (!this.textures.exists(def.spriteKey)) continue;
      this.anims.create({
        key: animKey,
        frames: this.anims.generateFrameNumbers(def.spriteKey, { frames: def.frames }),
        frameRate: def.frameRate,
        repeat:    def.repeat,
      });
    }
  }

  _buildSpeciesCard(def, entry, cx, cy, cellW, cellH) {
    const caught = !!entry;

    // 카드 외곽.
    buildCard(this, cx, cy, cellW, cellH, {
      fill: caught ? 0xffe5a8 : 0xefe5cf,
      border: caught ? PALETTE.cardBorder : 0xb8a98a,
    });
    // 아이콘 영역 (상단).
    const iconBoxH = cellH * 0.55;
    buildCard(this, cx + 6, cy + 6, cellW - 12, iconBoxH, {
      fill: 0xfff8e7, border: 0xd6cbb6,
    });
    this._renderSpeciesIcon(def, caught, cx + cellW / 2, cy + 6 + iconBoxH / 2, cellW - 28);

    // 이름 — 잡지 않은 어종은 '???'.
    const nameY = cy + 6 + iconBoxH + 10;
    buildText(this, cx + cellW / 2, nameY,
      caught ? def.name : '???',
      {
        fontSize: '13px',
        color: caught ? PALETTE.titleText : PALETTE.hint,
        fontStyle: 'bold',
        origin: { x: 0.5, y: 0.5 },
      });

    // 정보 — 사이즈 / 횟수.
    const gp = FISH_CATALOG_GAMEPLAY[def.id];
    const realCm = gp?.realLengthCm ?? def.realLengthCm;
    if (caught) {
      buildText(this, cx + cellW / 2, nameY + 18,
        `${realCm}cm  ×${entry.count}`,
        {
          fontSize: '11px',
          color: '#6a5530',
          origin: { x: 0.5, y: 0.5 },
        });
    } else {
      buildText(this, cx + cellW / 2, nameY + 18, '미발견', {
        fontSize: '11px',
        color: PALETTE.hint,
        origin: { x: 0.5, y: 0.5 },
      });
    }

    // 카드 터치 → 상세 (잡은 어종만, 미발견은 '???' 미스터리 유지).
    const hit = this.add.rectangle(cx + cellW / 2, cy + cellH / 2, cellW, cellH, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      this._showDetail(def, entry);
    });
  }

  _renderSpeciesIcon(def, caught, cx, cy, maxSize) {
    const iconKey = caught ? this._albumIconKey(def) : null;
    if (iconKey) {
      // frame 0 — sprite 시트면 첫 frame, 단일 image 면 전체.
      // depth 필수 — popup buildCard 가 DEPTH.body(2015) 사용 → 그 위에 표시되어야 함.
      const img = this.add.image(cx, cy, iconKey, 0).setDepth(DEPTH.body + 2);
      const tex = img.texture.get(0);
      const fw = tex?.width || 256;
      const fh = tex?.height || 256;
      const scale = Math.min(maxSize / fw, maxSize / fh) * 0.85;
      img.setScale(scale);
    } else {
      const glyph = caught ? '🐟' : '❓';
      const fontSize = caught ? '32px' : '36px';
      buildText(this, cx, cy, glyph, {
        fontSize, color: caught ? '#333' : PALETTE.hint,
        origin: { x: 0.5, y: 0.5 },
      });
    }
  }

  /**
   * 상세 팝업 — 큰 sprite + 한글/영문/학명 + 사이즈 + 점수 + 잡은 횟수.
   * 닫기는 backdrop tap 또는 ✕.
   */
  _showDetail(def, entry) {
    const W = this.scale.width;
    const H = this.scale.height;
    const caught = !!entry;

    // 모달 backdrop (반투명 검정 — 도감보다 더 어둡게).
    const backdrop = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55)
      .setInteractive();
    backdrop.setDepth(200);
    const onClose = () => layer.destroy(true);
    backdrop.on('pointerdown', onClose);

    // 컨테이너 — 닫기 시 모두 destroy.
    const layer = this.add.container(0, 0).setDepth(201);
    layer.add(backdrop);

    // 카드 본체.
    const cardW = Math.min(W * 0.86, 520);
    const cardH = Math.min(H * 0.72, 620);
    const cardX = W / 2 - cardW / 2;
    const cardY = H / 2 - cardH / 2;
    const cardBg = this.add.graphics();
    cardBg.fillStyle(0xfff3d6, 0.98);
    cardBg.lineStyle(4, 0xa07a44, 1);
    cardBg.fillRoundedRect(cardX, cardY, cardW, cardH, 18);
    cardBg.strokeRoundedRect(cardX, cardY, cardW, cardH, 18);
    layer.add(cardBg);

    // 닫기 ✕.
    const closeBtn = this.add.text(cardX + cardW - 18, cardY + 14, '✕', {
      fontFamily: 'Jua, system-ui, sans-serif', fontSize: '26px',
      color: '#8a5a20',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', onClose);
    layer.add(closeBtn);

    // 상단: 큰 sprite.
    const iconAreaH = cardH * 0.42;
    const iconCx = cardX + cardW / 2;
    const iconCy = cardY + 30 + iconAreaH / 2;
    const detailIconKey = caught ? this._albumIconKey(def) : null;
    if (detailIconKey) {
      // Container layer 가 depth 201 이라 child 의 상대 depth 는 자동으로 컨테이너 위.
      // 단 컨테이너 내부 순서도 추가 순으로 결정 → 마지막 add 가 위.
      const sprite = this.add.image(iconCx, iconCy, detailIconKey, 0);
      const tex = sprite.texture.get(0);
      const fw = tex?.width || 256;
      const fh = tex?.height || 256;
      const scale = Math.min((cardW - 80) / fw, iconAreaH / fh) * 0.9;
      sprite.setScale(scale);
      layer.add(sprite);
    } else {
      const glyph = caught ? '🐟' : '❓';
      const t = this.add.text(iconCx, iconCy, glyph, {
        fontFamily: 'system-ui, sans-serif', fontSize: '96px',
        color: '#999',
      }).setOrigin(0.5);
      layer.add(t);
    }

    // 정보 영역.
    const infoTop = cardY + 30 + iconAreaH + 20;
    const cat = FISH_CATALOG.find((f) => f.id === def.id);
    const gp = FISH_CATALOG_GAMEPLAY[def.id];

    const rows = [];
    if (caught) {
      rows.push({ label: '이름',       value: def.name });
      if (cat?.nameEn)         rows.push({ label: 'English',    value: cat.nameEn });
      if (cat?.scientificName) rows.push({ label: 'Scientific', value: cat.scientificName, italic: true });
      if (cat?.regionKo)       rows.push({ label: '지역',       value: cat.regionKo });
      if (cat?.gradeKo)        rows.push({ label: '등급',       value: cat.gradeKo });
      const realCm = gp?.realLengthCm ?? def.realLengthCm;
      if (realCm)              rows.push({ label: '실제 크기',  value: `${realCm} cm` });
      rows.push({ label: '점수',     value: `${def.score} pt` });
      rows.push({ label: '잡은 횟수', value: `${entry.count} 회` });
      if (entry.bestSize)      rows.push({ label: '최대 사이즈', value: `${Math.round(entry.bestSize)} px` });
    } else {
      rows.push({ label: '상태', value: '미발견 — 잡으면 도감에 기록됩니다.' });
    }

    let lineY = infoTop;
    for (const row of rows) {
      const lt = this.add.text(cardX + 30, lineY, `${row.label}`, {
        fontFamily: 'Jua, system-ui, sans-serif', fontSize: '14px',
        color: '#7a5d2a',
      }).setOrigin(0, 0);
      const rt = this.add.text(cardX + cardW - 30, lineY, `${row.value}`, {
        fontFamily: row.italic ? 'serif' : 'Jua, system-ui, sans-serif',
        fontSize: row.italic ? '13px' : '14px',
        fontStyle: row.italic ? 'italic' : 'normal',
        color: '#3a2a10',
      }).setOrigin(1, 0);
      layer.add(lt); layer.add(rt);
      lineY += 24;
      if (lineY > cardY + cardH - 30) break;
    }
  }
}
