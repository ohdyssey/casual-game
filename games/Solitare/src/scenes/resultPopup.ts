/**
 * resultPopup.ts — **레벨 클리어 결과 화면**(2026-08-30, 에디터 저작 `blank_2.json` = 결과화면 SSOT).
 *
 * 예전엔 PlayScene.showMissionReward 가 별·제목·카드·코인을 **세로 스택으로 코드 계산**해 그렸다.
 * 이제 저작 문서의 노드(팝업창 프레임·별 5·제목·컬렉션 라벨·카드 슬롯 2·코인/다이아/별 값·HOME/NEXT)를
 * 그대로 렌더하고 **값만 바꿔 끼운다**. 배치를 바꾸려면 코드가 아니라 에디터에서 고칠 것.
 *
 * 역할 분담: 이 모듈은 **그리기와 버튼 배선**만 한다. 보상 회수 연출(코인 버스트 → 헤더)과 씬 전환은
 * PlayScene 이 반환 핸들(아이콘 오브젝트·좌표)로 이어서 한다.
 *
 * ⚠️ 카드 슬롯은 저작에 2개뿐이다. 3장 이상 획득하면 두 슬롯의 중심을 기준으로 **같은 간격으로 재배치**하고
 *   패널 안쪽 폭(CARD_ROW_W)에 맞춰 줄인다 — 슬롯 크기(120×180)보다 크게 그리지는 않는다(diet-hints 계약).
 *
 * TODO(하네스 추정): layer_5(홈버튼)·layer_5_copy(넥스트레벨)는 저작에 action 이 없어 이름으로 역할을 정했다.
 */
import Phaser from 'phaser';
import { fullBleedBounds } from '@casual/core';
import { NODES } from '../../.pue-harness/generated/screens.js';
import { sfx, sfxStar } from '../audio.js';
import { popupScale, SAFE_H, SAFE_W } from '../logic/responsiveFrame.js';
import { overlayLayer } from '../ui/overlay.js';
import type { CollectionDoc, CollectionNode } from './collectionPopup.js';

export const UI_RESULT_KEY = 'ui_result';
export const UI_RESULT_PATH = 'ui/layouts/blank_2.json';

const R = NODES.BLANK_2;
/** 별 5개 — 왼쪽부터(저작 id 순서가 아니라 화면 순서). */
const STAR_IDS: readonly string[] = [R.LAYER_2_COPY3, R.LAYER_2_COPY, R.LAYER_2, R.LAYER_2_COPY2, R.LAYER_2_COPY4];
const CARD_ROW_W = 620; // 카드 줄이 차지할 수 있는 최대 폭 — 패널 안쪽 파란 영역(저작 x 130~950 중 여유 둠). 넘치면 겹친다.
const CARD_GAP = 24;
const NO_CARD_LABEL = '조각을 획득하지 못했어요'; // 조각 0개일 때 리본(프레임 아트에 박힌 띠) 문구(PO 2026-08-30).
const CARD_LABEL = '컬렉션 조각 획득'; // 저작 문구 "컬렉션카드 획득" 을 조각 수집 규칙(2026-08-30)에 맞춰 바꿔 끼운다.
const RIBBON_W = 360; // 프레임 아트의 라벨 띠 안쪽 폭 — 문구가 넘치면 글자를 줄인다.
const EMPTY_SLOT_RADIUS = 14;
const DIM_ALPHA = 0.2; // 아주 옅은 막(PO 2026-08-30).
const DIM_PAD = 90; // 입력 차단 존이 캔버스 밖까지 덮게(셰이크 대비).
const FONT = '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif';
const SLOT_IDS: ReadonlySet<string> = new Set([R.LAYER_7, R.LAYER_7_COPY, R.LAYER_8, R.LAYER_8_COPY]);

export interface ResultPopupOpts {
  readonly stars: number; // 획득 별(0~5) — 나머지는 흐림.
  readonly coins: number;
  readonly diamonds: number;
  readonly leagueStars: number; // 리그로 보낼 별(보관분).
  readonly cardKeys: readonly string[]; // 획득 컬렉션 카드 텍스처 키.
  readonly hasNext: boolean;
  /** 오버레이 depth(기본 2000). 보너스 씬은 자체 팝업(3000)보다 위에 둔다. */
  readonly depth?: number;
  readonly onHome: () => void;
  readonly onNext: () => void;
}

export interface ResultPopupHandle {
  readonly layer: Phaser.GameObjects.Container;
  /** 회수 연출에서 팝하며 사라질 큰 아이콘·숫자. */
  readonly rewardObjs: readonly Phaser.GameObjects.GameObject[];
  /** 팝업에 그려진 컬렉션 카드(회수 연출이 보관함으로 날린다). */
  readonly cardObjs: readonly Phaser.GameObjects.Image[];
  /** 카드 옆 `+1` 배지 — 카드가 날아갈 때 함께 사라진다. */
  readonly cardBadgeObjs: readonly Phaser.GameObjects.Text[];
  readonly coinAt: { x: number; y: number };
  readonly gemAt: { x: number; y: number };
  readonly starAt: { x: number; y: number };
}

type Obj = Phaser.GameObjects.Image | Phaser.GameObjects.Text;
type NodeEx = CollectionNode & { readonly depth?: number; readonly fontStyle?: string };

/** 저작 텍스트 노드 → Phaser Text(entryPopup 과 같은 규칙: 외곽선 2배·그림자 저작값). */
function makeText(scene: Phaser.Scene, n: NodeEx, scale: number, value?: string): Phaser.GameObjects.Text {
  const family = n.fontFamily ? `${n.fontFamily}, ${FONT}` : FONT;
  const t = scene.add.text(n.x * scale, n.y * scale, value ?? n.text ?? '', {
    fontFamily: family,
    fontSize: `${Math.round((n.fontSize ?? 20) * scale)}px`,
    fontStyle: n.fontStyle ?? '700',
    color: n.color ?? '#ffffff',
    align: 'center',
  });
  if (n.stroke && (n.strokeW ?? 0) > 0) t.setStroke(n.stroke, (n.strokeW ?? 0) * 2 * scale);
  if (n.shadow) t.setShadow((n.shadowX ?? 2) * scale, (n.shadowY ?? 2) * scale, n.shadowColor ?? '#000000', (n.shadowBlur ?? 2) * scale, false, true);
  return t.setOrigin(0.5, 0.5);
}

/** 팝(등장) 트윈 — 현재 스케일을 목표로 0 에서 튀어나온다. */
function popIn(scene: Phaser.Scene, o: Obj, delay: number, angle = 0): void {
  const sx = o.scaleX;
  const sy = o.scaleY;
  o.setScale(0).setAngle(angle);
  scene.tweens.add({ targets: o, scaleX: sx, scaleY: sy, angle: 0, duration: 380, delay, ease: 'Back.easeOut' });
}

/** 이미지 버튼 — 저작 아트 위에 눌림 스케일 + 라벨 텍스트를 같이 움직인다. */
function wireButton(scene: Phaser.Scene, img: Phaser.GameObjects.Image, label: Phaser.GameObjects.Text | undefined, on: () => void): void {
  const targets: Obj[] = label ? [img, label] : [img];
  const base = targets.map((o) => ({ o, sx: o.scaleX, sy: o.scaleY }));
  img.setInteractive({ useHandCursor: true });
  img.on('pointerdown', () => {
    sfx('button');
    for (const b of base) scene.tweens.add({ targets: b.o, scaleX: b.sx * 0.92, scaleY: b.sy * 0.92, duration: 80, yoyo: true, ease: 'Quad.easeOut' });
    scene.time.delayedCall(160, on);
  });
}

/** 저작 노드를 depth 순으로 컨테이너에 그린다(카드 슬롯은 제외 — 획득분만큼 따로). */
function renderNodes(scene: Phaser.Scene, doc: CollectionDoc, scale: number, inner: Phaser.GameObjects.Container, values: Readonly<Record<string, string>>): Map<string, Obj> {
  const byId = new Map<string, Obj>();
  // ⚠️ Container 는 depth 로 자동 정렬하지 않는다 — 저작 depth 순으로 미리 정렬해 add.
  const sorted = [...(doc.nodes as readonly NodeEx[])].sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));
  for (const n of sorted) {
    if (n.visible === false || SLOT_IDS.has(n.id)) continue;
    let obj: Obj | null = null;
    if (n.type === 'image' && n.key) {
      if (!scene.textures.exists(n.key)) continue;
      const img = scene.add.image(n.x * scale, n.y * scale, n.key).setOrigin(0.5, 0.5);
      if (n.w && n.h) img.setDisplaySize(n.w * scale, n.h * scale);
      obj = img;
    } else if (n.type === 'text') {
      obj = makeText(scene, n, scale, values[n.id]);
    }
    if (!obj) continue;
    inner.add(obj);
    byId.set(n.id, obj);
  }
  return byId;
}

/**
 * 컬렉션 카드 줄 — 저작 슬롯 2개(layer_7·layer_7_copy)와 `+1` 배지(layer_8) 오프셋을 기준으로 N장.
 *   ⚠️ 3장 이상은 **줄이지 않고 겹친다**(PO 2026-08-30 "여러 개면 창을 벗어난다 → 겹쳐서 배치"). 카드 크기는
 *   저작 그대로 두고 간격만 줄여 줄 폭(CARD_ROW_W) 안에 넣는다 — 부채꼴처럼 왼쪽 카드가 아래, 오른쪽이 위.
 *   겹칠 때 `+1` 배지는 가려지므로 **맨 위 카드에 합계(+N)** 하나만 붙인다.
 */
function renderCards(scene: Phaser.Scene, nodeById: ReadonlyMap<string, NodeEx>, scale: number, inner: Phaser.GameObjects.Container, cards: readonly string[]): { cards: Phaser.GameObjects.Image[]; badges: Phaser.GameObjects.Text[] } {
  const slot = nodeById.get(R.LAYER_7);
  const slot2 = nodeById.get(R.LAYER_7_COPY);
  const plus = nodeById.get(R.LAYER_8);
  const out: Phaser.GameObjects.Image[] = [];
  const badges: Phaser.GameObjects.Text[] = [];
  if (!slot || !plus) return { cards: out, badges };
  const slotW = (slot.w ?? 120) * scale;
  const slotH = (slot.h ?? 180) * scale;
  const cy = slot.y * scale;
  const cx = slot2 ? ((slot.x + slot2.x) / 2) * scale : SAFE_W / 2;
  const pitch = slot2 ? (slot2.x - slot.x) * scale : slotW + CARD_GAP;
  const n = cards.length;
  const rowW = CARD_ROW_W * scale;
  // 간격: 저작 간격이 줄 폭에 들어가면 그대로, 아니면 겹쳐서라도 줄 폭 안에(최소 겹침 폭은 카드의 1/4).
  const fitStep = n > 1 ? (rowW - slotW) / (n - 1) : pitch;
  const step = Math.max(slotW * 0.25, Math.min(pitch, fitStep));
  const overlapped = step < slotW;
  const plusDx = (plus.x - slot.x) * scale;
  const plusDy = (plus.y - slot.y) * scale;
  cards.forEach((key, i) => {
    const x = cx + (i - (n - 1) / 2) * step;
    const img = scene.add.image(x, cy, key).setDisplaySize(slotW, slotH);
    inner.add(img); // add 순서 = 그리는 순서 → 오른쪽 카드가 위로 올라온다.
    out.push(img);
    popIn(scene, img, 900 + i * 160, -12);
    if (!overlapped || i === n - 1) {
      const badge = makeText(scene, plus, scale, overlapped ? `+${n}` : undefined).setPosition(x + plusDx, cy + plusDy);
      inner.add(badge);
      badges.push(badge);
      popIn(scene, badge, 980 + i * 160);
    }
    scene.time.delayedCall(900 + i * 160, () => sfx('star', { volume: 0.45 }));
  });
  return { cards: out, badges };
}

/** 빈 카드 자리 — 저작 슬롯 rect 에 반투명 라운드 사각형(카드는 둥글다 — 직각 사각형은 어색). */
function renderEmptySlots(scene: Phaser.Scene, nodeById: ReadonlyMap<string, NodeEx>, scale: number, inner: Phaser.GameObjects.Container): void {
  const g = scene.add.graphics();
  for (const id of [R.LAYER_7, R.LAYER_7_COPY]) {
    const n = nodeById.get(id);
    if (!n?.w || !n.h) continue;
    const w = n.w * scale;
    const h = n.h * scale;
    const x = n.x * scale - w / 2;
    const y = n.y * scale - h / 2;
    g.fillStyle(0xffffff, 0.18);
    g.fillRoundedRect(x, y, w, h, EMPTY_SLOT_RADIUS * scale);
    g.lineStyle(3 * scale, 0xffffff, 0.55);
    g.strokeRoundedRect(x, y, w, h, EMPTY_SLOT_RADIUS * scale);
  }
  inner.add(g);
}

/**
 * 결과 팝업을 그린다. 저작 문서나 프레임 아트가 없으면 null — 호출부가 대비한다.
 */
export function buildResultPopup(scene: Phaser.Scene, opts: ResultPopupOpts): ResultPopupHandle | null {
  const doc = scene.cache.json.get(UI_RESULT_KEY) as CollectionDoc | undefined;
  if (!doc?.nodes?.length) return null;
  const scale = popupScale(doc.frame.designW);
  const layer = overlayLayer(scene, opts.depth ?? 2000);

  // **아주 옅은 막**(PO 2026-08-30 2차: "아주 투명도 높은 반투명막") — 뒤 화면과 보상 회수 연출이 그대로
  //   보이면서 팝업이 살짝 도드라지게. 예전 0.88 딤은 연출을 가렸다.
  const fb = fullBleedBounds(scene);
  const dim = scene.add.graphics();
  dim.fillStyle(0x0a0a1a, DIM_ALPHA);
  dim.fillRect(fb.x - DIM_PAD, fb.y - DIM_PAD, fb.w + DIM_PAD * 2, fb.h + DIM_PAD * 2);
  layer.add(dim);
  layer.add(scene.add.zone(fb.x + fb.w / 2, fb.y + fb.h / 2, fb.w + DIM_PAD * 2, fb.h + DIM_PAD * 2).setInteractive());

  // 패널 — 화면 중심 컨테이너 + 저작 절대좌표용 역오프셋(세이프존 기준이라 넓은 캔버스에서도 가운데).
  const panel = scene.add.container(SAFE_W / 2, SAFE_H / 2);
  layer.add(panel);
  const inner = scene.add.container(-SAFE_W / 2, -SAFE_H / 2);
  panel.add(inner);

  const nodeById = new Map<string, NodeEx>((doc.nodes as readonly NodeEx[]).map((n) => [n.id, n]));
  const byId = renderNodes(scene, doc, scale, inner, {
    [R.LAYER_8_COPY2]: opts.coins.toLocaleString(),
    [R.LAYER_8_COPY4]: `${opts.diamonds}`,
    [R.LAYER_8_COPY5]: `${opts.leagueStars}`,
  });
  if (!byId.has(R.LAYER_1)) {
    layer.destroy();
    return null; // 프레임 아트가 없으면 저작대로 그릴 수 없다.
  }

  // ── 별 5개 — 획득만 금색, 나머지 흐림. 왼쪽부터 순서대로 팝. ──
  STAR_IDS.forEach((id, i) => {
    const st = byId.get(id) as Phaser.GameObjects.Image | undefined;
    if (!st) return;
    const got = i < opts.stars;
    if (!got) st.setTint(0x555566).setAlpha(0.55);
    popIn(scene, st, 200 + i * 180);
    if (got) scene.time.delayedCall(200 + i * 180, () => sfxStar(i + 1));
  });

  // ── 컬렉션 카드 — 없으면 라벨("컬렉션카드 획득")도 숨긴다. ──
  const cards = opts.cardKeys.filter((k) => scene.textures.exists(k));
  let cardObjs: Phaser.GameObjects.Image[] = [];
  let cardBadgeObjs: Phaser.GameObjects.Text[] = [];
  if (cards.length > 0) {
    (byId.get(R.LAYER_4) as Phaser.GameObjects.Text | undefined)?.setText(CARD_LABEL);
    ({ cards: cardObjs, badges: cardBadgeObjs } = renderCards(scene, nodeById, scale, inner, cards));
  } else {
    // 카드 0장 — 빈 카드 자리를 그대로 보여 주고 "획득하지 못함"을 띠에 적는다(PO 2026-08-30).
    const lbl = byId.get(R.LAYER_4) as Phaser.GameObjects.Text | undefined;
    lbl?.setText(NO_CARD_LABEL);
    if (lbl && lbl.width > RIBBON_W * scale) lbl.setScale((RIBBON_W * scale) / lbl.width);
    renderEmptySlots(scene, nodeById, scale, inner);
  }

  // ── 보상 아이콘 팝. ──
  const coinIcon = byId.get(R.LAYER_6);
  const gemIcon = byId.get(R.LAYER_6_COPY);
  const starIcon = byId.get(R.LAYER_6_COPY2);
  for (const o of [coinIcon, gemIcon, starIcon]) if (o) popIn(scene, o, 700);

  // ── 버튼 — 홈은 항상, 넥스트는 진행도 상한 안에서만(없으면 홈을 가운데로). ──
  const homeBtn = byId.get(R.LAYER_5) as Phaser.GameObjects.Image | undefined;
  const nextBtn = byId.get(R.LAYER_5_COPY) as Phaser.GameObjects.Image | undefined;
  const homeLbl = byId.get(R.LAYER_8_COPY3) as Phaser.GameObjects.Text | undefined;
  const nextLbl = byId.get(R.LAYER_8_COPY6) as Phaser.GameObjects.Text | undefined;
  if (homeBtn) wireButton(scene, homeBtn, homeLbl, opts.onHome);
  if (nextBtn && opts.hasNext) wireButton(scene, nextBtn, nextLbl, opts.onNext);
  else if (nextBtn) {
    nextBtn.setVisible(false);
    nextLbl?.setVisible(false);
    if (homeBtn) {
      const dx = SAFE_W / 2 - homeBtn.x;
      homeBtn.setX(homeBtn.x + dx);
      homeLbl?.setX(homeLbl.x + dx);
    }
  }

  // 패널 등장 — 살짝 작게서 안착.
  panel.setScale(0.86).setAlpha(0);
  scene.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });

  const at = (id: string, fallback: { x: number; y: number }): { x: number; y: number } => {
    const n = nodeById.get(id);
    return n ? { x: n.x * scale, y: n.y * scale } : fallback;
  };
  return {
    layer,
    cardObjs,
    cardBadgeObjs,
    rewardObjs: [coinIcon, byId.get(R.LAYER_8_COPY2), gemIcon, byId.get(R.LAYER_8_COPY4), starIcon, byId.get(R.LAYER_8_COPY5)].filter(Boolean) as Phaser.GameObjects.GameObject[],
    coinAt: at(R.LAYER_6, { x: SAFE_W / 2 - 214, y: 1335 }),
    gemAt: at(R.LAYER_6_COPY, { x: SAFE_W / 2, y: 1335 }),
    starAt: at(R.LAYER_6_COPY2, { x: SAFE_W / 2 + 221, y: 1335 }),
  };
}
