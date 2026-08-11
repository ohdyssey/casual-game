/**
 * collectionPopup.ts — **콜렉션 카드 개별 세트 화면**(1~10번 세트 상세, 2026-07-19).
 *   에디터 저작 blank_copy2.json(프레임·보상·9칸 카드 그리드·별 장식·닫기)을 SSOT 로 렌더한다.
 *   ⚠️2026-07-19 PO: "콜렉션카드를 직접 진입하지 말고 메인카드(허브)에 진입 후 각 카드 스테이지에 진입하는
 *   것으로 수정" — 이제 홈 Pass 아이콘은 이 화면을 직접 열지 않고 collectionHub.ts(세트 목록)를 먼저 열며,
 *   허브에서 세트를 골라야 이 화면이 `initialPage` 로 그 세트에서 시작한다(HomeScene.showCollectionCards).
 *   닫기(layer_2)만 항상 고정하고 **프레임(layer_1)을 포함한 나머지 전부**(테마 배너·보상·9칸 카드·장식 별)를
 *   한 그룹으로 묶어 **좌우 스와이프 시 카드 전체가 통째로 이동**한다(2026-07-19 QA "프레임은 안 움직이고
 *   위쪽 레이어만 스와이프된다" 재지적 반영 — 이전엔 프레임을 고정시켜 내용물만 움직이는 것처럼 보였음).
 *   1번 세트(편의점)는 에디터 저작 카드 아트(up_01_v2 등)를 그대로 보여주고, 2번부터는 수동 이식 아트
 *   (collectionCardKey, CARD_ART_SETS 등록분 — 현재 2·3번)를 슬롯에 갈아끼운다. 아트 없는 세트는
 *   그리드·장식 별을 숨기고 테마 배너+보상만 전환한다(새 세트 저장 시 CARD_ART_SETS 에 추가하면 노출).
 *   ⚠️2026-07-26: **보유 개념 도입**(logic/collection.ts) — 플레이 미션 보상으로 카드가 드랍되면서
 *   미보유 카드는 숨기지 않고 **실루엣**(tintFill + 반투명)으로 자리만 보여준다. 배너 아래에 세트
 *   수집 진행도("7/9")를 함께 표기.
 */
import Phaser from 'phaser';
import { sfx } from '../audio.js';
import { cardCount, ownedCount, isNewCard, markSetSeen, type CollectionState } from '../logic/collection.js';
import { collectionOf, collectionSeenOf, loadSave, writeSave } from '../save.js';
import { popupOrganicIn, popupOrganicOut, popupOrganicPageSwap } from './popupFx.js';

/** 진입 팝업(entryPopup.ts)과 동일한 노드 상위집합 — layoutLoader 의 LayoutNode 텍스트 그림자 포함 버전. */
export interface CollectionNode {
  readonly id: string;
  readonly type: string;
  readonly key?: string;
  readonly x: number;
  readonly y: number;
  readonly w?: number;
  readonly h?: number;
  readonly visible?: boolean;
  readonly text?: string;
  readonly fontSize?: number;
  readonly fontFamily?: string;
  readonly color?: string;
  readonly stroke?: string;
  readonly strokeW?: number;
  readonly shadow?: boolean;
  readonly shadowColor?: string;
  readonly shadowX?: number;
  readonly shadowY?: number;
  readonly shadowBlur?: number;
}
export interface CollectionDoc {
  readonly frame: { designW: number; designH: number };
  readonly nodes: ReadonlyArray<CollectionNode>;
}

export const UI_COLLECTION_KEY = 'ui_collection';
export const UI_COLLECTION_PATH = 'ui/layouts/blank_copy2.json';

export const SET_COUNT = 10; // up_CollecttionCard_01..10. collectionHub.ts 도 동일 개수 참조.
const SWIPE_THRESHOLD = 60; // 이 이상 드래그해야 페이지 전환(px, 팝업 좌표계).

/**
 * **세트별 카드 아트 텍스처 키**(2번 세트부터) — 디스크 `CollectionCardNN\MM.png` 를
 *   `public/ui/uploads/up_CollectionCardNN_MM.png` 로 이식한 수동 에셋(매니페스트 밖, HomeScene preload 가
 *   uploadPath 로 직접 로드). 1번 세트만 에디터 저작 키(up_01_v2·up_02…)를 그대로 쓴다(blank_copy2.json).
 */
export const collectionCardKey = (set: number, card: number): string =>
  `up_CollectionCard${String(set).padStart(2, '0')}_${String(card).padStart(2, '0')}`;
/** 카드 아트 이식이 끝난 세트 번호(2..SET_COUNT) — 디자이너가 새 세트를 저장하면 여기에 추가. */
export const CARD_ART_SETS: ReadonlyArray<number> = [2, 3];

/**
 * **1번 세트 카드 아트 키**(blank_copy2.json 저작 슬롯 순서 그대로) — 팝업은 저작 노드에서 읽지만,
 *   팝업 밖(PlayScene 획득 연출)에서도 같은 아트를 써야 해서 여기 상수로 노출한다.
 *   ⚠️ 순서·개수는 CARD_SLOT_IDS(9칸)와 1:1 — 레이아웃을 다시 저작하면 여기도 맞출 것.
 */
export const SET1_CARD_KEYS: ReadonlyArray<string> = ['up_01_v2', 'up_02', 'up_03', 'up_04', 'up_05', 'up_06', 'up_07', 'up_08', 'up_09'];

/** 세트·카드 번호(1-base) → 카드 아트 텍스처 키(1세트=저작 키, 2세트부터=이식 아트). */
export const collectionArtKey = (set: number, card: number): string =>
  set === 1 ? (SET1_CARD_KEYS[card - 1] ?? '') : collectionCardKey(set, card);

/** 보유 장수 배지 **원판 아트**(PO 2026-07-26 5차 지정: `SolitareHeights\UI\Solitare_UI_Play_03-1`). */
export const COUNT_BADGE_KEY = 'up_Solitare_UI_Play_03-1';

/**
 * **카드 우상단 보유 장수 배지**(PO 2026-07-26 5차) — 지정 원판(COUNT_BADGE_KEY) 위에 숫자를 얹어
 *   **카드 우상단 모서리**에 배치한다(첨부 스크린샷의 붉은 원 위치). 콜렉션 화면에서 "이 카드를 몇 장
 *   가지고 있는지" 알려주는 용도이며, **획득 순간 연출에는 쓰지 않는다**(PO: 획득 시엔 숫자 미표시).
 *   **2장 이상일 때만** 표시한다(PO 2026-07-26 6차: 1장은 굳이 표시할 필요 없음) — 그 미만이면 null.
 *   원판 아트가 없으면 숫자 텍스트만 폴백.
 */
export function makeCardCountBadge(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  w: number,
  h: number,
  count: number,
  depth?: number,
): Phaser.GameObjects.Container | null {
  if (count < 2) return null; // 1장(기본 보유)은 배지 없이 카드만.
  const d = Math.max(30, Math.round(w * 0.4)); // 배지 지름 — 카드 폭 기준.
  const x = cx + w / 2; // 카드 **우상단 모서리 정중앙**(PO 스샷의 붉은 원 위치) — 절반이 카드 밖으로 걸친다.
  const y = cy - h / 2; //   → 저작된 별 장식(카드 상단 좌·중앙)과 겹치지 않는다.
  const box = scene.add.container(x, y);
  if (scene.textures.exists(COUNT_BADGE_KEY)) {
    const src = scene.textures.get(COUNT_BADGE_KEY).getSourceImage() as { width: number; height: number };
    box.add(scene.add.image(0, 0, COUNT_BADGE_KEY).setDisplaySize(d, d * (src.height / src.width)));
  }
  const t = scene.add
    .text(0, 0, `${count}`, { fontFamily: '"Jua", sans-serif', fontSize: `${Math.round(d * 0.62)}px`, color: '#7a3b00', fontStyle: '700' })
    .setOrigin(0.5);
  t.setShadow(0, 2, '#ffffffaa', 2, false, true);
  box.add(t);
  if (depth != null) box.setDepth(depth);
  return box;
}

/** NEW 배지 아이콘 — 접힌 리본 모양(디자이너 지정: `SolitareHeights\UI\Solitare_UI_Play_03-3`, 코너에 딱 붙는 형태). */
export const NEW_CARD_BADGE_KEY = 'up_Solitare_UI_Play_03-3';

/**
 * **카드 좌상단 NEW 배지**(2026-07-20) — 아직 확인 안 한(획득 후 이 세트를 열어본 적 없는) 카드에 표시.
 *   보유 장수 배지(makeCardCountBadge)가 우상단을 쓰므로 겹치지 않게 **좌상단**에 둔다. 리본 아트는 자체
 *   좌상단이 뾰족하게 코너에 물리는 모양이라 origin(0,0)으로 카드 모서리에 딱 붙여야 자연스럽다(PO 지정
 *   에디터 스크린샷 기준).
 */
export function makeNewCardBadge(scene: Phaser.Scene, cx: number, cy: number, w: number, h: number, depth?: number): Phaser.GameObjects.Container {
  const d = Math.max(30, Math.round(w * 0.4));
  const x = cx - w / 2;
  const y = cy - h / 2;
  const box = scene.add.container(x, y);
  if (scene.textures.exists(NEW_CARD_BADGE_KEY)) {
    const src = scene.textures.get(NEW_CARD_BADGE_KEY).getSourceImage() as { width: number; height: number };
    box.add(scene.add.image(0, 0, NEW_CARD_BADGE_KEY).setOrigin(0, 0).setDisplaySize(d, d * (src.height / src.width)));
  } else {
    box.add(scene.add.circle(0, 0, d / 2, 0xe0453e).setStrokeStyle(2, 0xffffff));
    box.add(scene.add.text(0, 0, 'NEW', { fontFamily: '"Jua", sans-serif', fontSize: `${Math.round(d * 0.32)}px`, color: '#ffffff' }).setOrigin(0.5));
  }
  if (depth != null) box.setDepth(depth);
  return box;
}

export interface CollectionPopupOpts {
  readonly depth?: number; // 기본 4000.
  readonly pinToUi?: (o: Phaser.GameObjects.GameObject) => void; // HomeScene 스크롤 카메라 대응(선택).
  /** 허브(collectionHub.ts)에서 특정 세트를 골라 들어올 때 시작 페이지(1..SET_COUNT). 기본 1. */
  readonly initialPage?: number;
  readonly onClose?: () => void;
}

export interface CollectionPopupHandle {
  readonly layer: Phaser.GameObjects.Container;
  close(): void;
}

/** blank_copy2.json 이 로드돼 있으면 팝업을 그리고 핸들을 반환, 없으면 null. */
export function buildCollectionPopup(scene: Phaser.Scene, opts: CollectionPopupOpts = {}): CollectionPopupHandle | null {
  const doc = (scene.cache.json.get(UI_COLLECTION_KEY) ?? null) as CollectionDoc | null;
  if (!doc || !Array.isArray(doc.nodes) || doc.nodes.length === 0) return null;

  const depth = opts.depth ?? 4000;
  const W = scene.scale.width;
  const H = scene.scale.height;
  const scale = W / doc.frame.designW;
  const layer = scene.add.container(0, 0).setDepth(depth);
  opts.pinToUi?.(layer);

  const scrim = scene.add.rectangle(0, 0, W, H, 0x140a1e, 0.86).setOrigin(0, 0).setInteractive();
  layer.add(scrim);
  // **유기체(젤리) 연출용 프레임**(popupFx) — 중심(W/2,H/2) 기준 스케일, inner 는 저작 절대좌표 유지용 역오프셋.
  const frame = scene.add.container(W / 2, H / 2);
  layer.add(frame);
  const inner = scene.add.container(-W / 2, -H / 2);
  frame.add(inner);

  let closing = false; // 닫힘 애니 중 재클릭 가드.
  const close = (): void => {
    if (closing) return;
    closing = true;
    sfx('level_close');
    popupOrganicOut(scene, scrim, frame, () => layer.destroy());
  };
  const cancel = (): void => {
    if (closing) return; // onClose 중복 호출 방지(딤+✕ 연타).
    close();
    opts.onClose?.();
  };
  scrim.on('pointerdown', cancel);

  // 닫기(layer_2)만 고정 — 프레임(layer_1) 포함 나머지 전부는 pageGroup 으로 묶어 카드 전체가 함께 스와이프한다.
  const FIXED_IDS = new Set(['layer_2']);
  // 카드 그리드 9칸(저작 노드) — 1번 세트는 저작 키 그대로, 2번부터는 세트별 아트(collectionCardKey)로
  //   텍스처를 갈아끼운다(이식 안 된 세트는 그리드·장식 별 숨김 → 추후 아트 저장+CARD_ART_SETS 등록 시 노출).
  const CARD_SLOT_IDS = ['layer_3', 'layer_3_copy3', 'layer_3_copy4', 'layer_3_copy5', 'layer_3_copy6', 'layer_3_copy7', 'layer_3_copy8', 'layer_3_copy9', 'layer_3_copy10'];
  const slotMeta = CARD_SLOT_IDS.map((id) => {
    const node = doc.nodes.find((n) => n.id === id);
    return { id, authoredKey: node?.key, w: (node?.w ?? 0) * scale, h: (node?.h ?? 0) * scale };
  });
  const starIds: string[] = doc.nodes.filter((n) => n.id.startsWith('layer_6')).map((n) => n.id); // layer_6·layer_6_copy1..17(별 장식).

  const byId = new Map<string, Phaser.GameObjects.Image | Phaser.GameObjects.Text>();
  const pageGroup = scene.add.container(0, 0);
  for (const n of doc.nodes) {
    if (n.visible === false) continue;
    let obj: Phaser.GameObjects.Image | Phaser.GameObjects.Text | null = null;
    if (n.type === 'image' && n.key) {
      if (!scene.textures.exists(n.key)) continue;
      const img = scene.add.image(n.x * scale, n.y * scale, n.key);
      if (n.w && n.h) img.setDisplaySize(n.w * scale, n.h * scale);
      obj = img;
    } else if (n.type === 'text') {
      const family = n.fontFamily ? `"${n.fontFamily}", "Jua", sans-serif` : '"Jua", sans-serif';
      const t = scene.add.text(n.x * scale, n.y * scale, n.text ?? '', {
        fontFamily: family,
        fontSize: `${Math.round((n.fontSize ?? 20) * scale)}px`,
        color: n.color ?? '#ffffff',
        align: 'center',
      });
      if (n.stroke && (n.strokeW ?? 0) > 0) t.setStroke(n.stroke, (n.strokeW ?? 0) * 2 * scale);
      if (n.shadow) t.setShadow((n.shadowX ?? 2) * scale, (n.shadowY ?? 2) * scale, n.shadowColor ?? '#000000', (n.shadowBlur ?? 2) * scale, false, true);
      obj = t;
    }
    if (!obj) continue;
    obj.setOrigin(0.5, 0.5);
    if (FIXED_IDS.has(n.id)) {
      inner.add(obj); // 닫기 버튼 — 루프 중엔 순서상 pageGroup 보다 먼저 붙지만 아래서 맨 위로 끌어올린다.
    } else {
      pageGroup.add(obj); // 프레임 포함 전부 — 컨테이너 좌표계로 재배치돼도 절대 위치는 그대로 유지(컨테이너가 (0,0)이므로).
    }
    byId.set(n.id, obj);
  }
  inner.add(pageGroup); // 카드 전체(프레임+내용물) 붙임.
  const closeObj = byId.get('layer_2');
  if (closeObj) inner.bringToTop(closeObj); // 닫기 버튼은 카드가 슬라이드돼도 항상 최상단 고정.

  // ── 닫기(✕, layer_2) ──
  byId.get('layer_2')?.setInteractive({ useHandCursor: true }).on('pointerdown', cancel);

  // ── 콜렉션 페이지 스와이프(테마 배너·보상·9칸 카드·장식 별 전부 한 그룹으로 이동) ──
  const bannerNode = doc.nodes.find((n) => n.id === 'layer_5');
  const banner = byId.get('layer_5') as Phaser.GameObjects.Image | undefined;
  const frameNode = doc.nodes.find((n) => n.id === 'layer_1');
  if (banner && bannerNode && frameNode) {
    const bw = (bannerNode.w ?? banner.displayWidth) * scale;
    const bh = (bannerNode.h ?? banner.displayHeight) * scale;
    // **페이지 전환 젤리 연출용 중심 래퍼**(popupFx.popupOrganicPageSwap) — 스케일이 카드(패널) 중심
    //   기준으로 먹도록 pageGroup 을 패널 중심(cx,cy) 래퍼로 감싼다(자식 절대좌표는 역오프셋으로 유지).
    //   렌더 순서 보존을 위해 pageGroup 이 있던 index 그대로 끼워 넣는다(닫기 버튼이 다시 아래로 깔리지 않게).
    const cx = frameNode.x * scale;
    const cy = frameNode.y * scale;
    const groupIdx = inner.getIndex(pageGroup);
    inner.remove(pageGroup);
    const pageWrap = scene.add.container(cx, cy);
    pageWrap.add(pageGroup);
    pageGroup.setPosition(-cx, -cy);
    inner.addAt(pageWrap, groupIdx);
    let page = Phaser.Math.Clamp(Math.floor(opts.initialPage ?? 1), 1, SET_COUNT); // 허브에서 고른 세트로 시작.
    let sliding = false;

    // 페이지 표시("1/10") — **저작 디자인을 가리지 않게** 프레임 하단 안쪽(닫기 버튼 위)에 작게 둔다.
    //   (예전엔 배너 바로 아래에 큼직하게 떠서 저작된 리본·보상 영역과 겹쳐 보였다 — 2026-07-26 PO 스샷 반영.)
    const pageText = scene.add
      .text(575 * scale, 1385 * scale, `${page} / ${SET_COUNT}`, {
        fontFamily: '"Jua", sans-serif',
        fontSize: `${Math.round(22 * scale)}px`,
        color: '#b08a5a',
      })
      .setOrigin(0.5)
      .setDepth(depth + 50);
    inner.add(pageText);
    // 세트 수집 진행도는 **저작 노드(layer_7 "9")를 직접 갱신**한다 — 코드가 따로 그리면 저작 카운터("/ 9")와
    //   나란히 두 벌이 보인다(2026-07-26 PO 스샷의 떠 있는 "8/9" 제거).
    const ownedText = byId.get('layer_7') as Phaser.GameObjects.Text | undefined;

    // **NEW 배지 판정 기준 스냅샷**(2026-07-20) — 팝업을 여는 시점에 한 번만 고정한다. applyPageVisuals 는
    //   페이지를 볼 때마다 save.collectionSeen 을 그 세트 기준으로 갱신(write-through)하지만, 배지 표시
    //   여부는 이 고정 스냅샷으로 판정하므로 "지금 이 세션에서 보고 있는 동안은" 계속 보인다(방금 갱신한
    //   seen 값으로 즉시 판정하면 열자마자 배지가 사라져 버려서 애초에 보여줄 수 없다).
    const seenSnapshot: CollectionState = collectionSeenOf(loadSave());
    const seenSets = new Set<number>(); // 이번 세션에서 이미 write-through 한 세트(중복 저장 방지).

    // 카드별 **보유 장수 배지**(우상단 원판+숫자) + **NEW 배지**(좌상단) — 페이지마다 다시 만든다.
    let countBadges: Phaser.GameObjects.Container[] = [];
    let newBadges: Phaser.GameObjects.Container[] = [];
    const applyPageVisuals = (p: number): void => {
      const state: CollectionState = collectionOf(loadSave()); // 열려 있는 동안 바뀌지 않지만, 재진입 시 최신 보유 반영.
      for (const b of countBadges) b.destroy();
      countBadges = [];
      for (const b of newBadges) b.destroy();
      newBadges = [];
      const bannerKey = `up_CollecttionCard_${p.toString().padStart(2, '0')}`;
      if (scene.textures.exists(bannerKey)) banner.setTexture(bannerKey).setDisplaySize(bw, bh);
      // 카드 그리드 — 1번=저작 키, 2번부터=세트별 이식 아트(collectionCardKey). 텍스처 없는 세트는 숨김.
      //   **미보유 카드**는 숨기지 않고 실루엣으로 자리를 남긴다(무엇을 더 모아야 하는지 보이게).
      let hasCards = false;
      slotMeta.forEach((m, i) => {
        const img = byId.get(m.id) as Phaser.GameObjects.Image | undefined;
        if (!img) return;
        const key = p === 1 ? m.authoredKey : collectionCardKey(p, i + 1);
        const ok = !!key && scene.textures.exists(key);
        img.setVisible(ok);
        if (ok && key) {
          img.setTexture(key);
          if (m.w && m.h) img.setDisplaySize(m.w, m.h); // setTexture 가 원본 크기로 되돌리므로 슬롯 크기 재적용.
          hasCards = true;
          const n = cardCount(state, p, i + 1);
          if (n > 0) {
            img.clearTint();
            img.setAlpha(1);
            // **2장 이상이면 우상단에 원문자 장수**(중복 보유 표시).
            const badge = makeCardCountBadge(scene, img.x, img.y, img.displayWidth, img.displayHeight, n);
            if (badge) {
              pageGroup.add(badge); // 카드와 함께 스와이프되도록 같은 그룹에.
              countBadges.push(badge);
            }
            // **NEW 배지(좌상단)** — 이 팝업을 열기 전 스냅샷(seenSnapshot) 대비 새로 늘어난 카드만.
            if (isNewCard(state, seenSnapshot, p, i + 1)) {
              const nb = makeNewCardBadge(scene, img.x, img.y, img.displayWidth, img.displayHeight);
              pageGroup.add(nb);
              newBadges.push(nb);
            }
          } else {
            img.setTintFill(0x2b1c3a); // 실루엣(형태만) — 보유 시 컬러로 밝아진다.
            img.setAlpha(0.55);
          }
        }
      });
      // 이 세트를 봤으니 NEW 확인 상태를 저장(write-through) — 배지 자체는 seenSnapshot 기준이라 이번
      //   세션 동안엔 그대로 보이고, 다음에 허브/이 세트를 다시 열 때부터 사라진다.
      if (!seenSets.has(p)) {
        seenSets.add(p);
        const s = loadSave();
        s.collectionSeen = markSetSeen(collectionOf(s), collectionSeenOf(s), p);
        writeSave(s);
      }
      // 장식 별 — 카드가 보이는 세트에서만 노출(빈 세트에서 별만 떠 보이는 것 방지).
      for (const id of starIds) (byId.get(id) as Phaser.GameObjects.Image | undefined)?.setVisible(hasCards);
      ownedText?.setText(hasCards ? `${ownedCount(state, p)}` : '0'); // 저작 하단 카운터("n / 9")의 앞 숫자.
    };

    const groupW = (frameNode.w ?? bannerNode.w) * scale; // 둘 다 design-space 값(스케일 전).
    const setPage = (p: number, dir: 1 | -1): void => {
      if (sliding) return;
      const clamped = Phaser.Math.Clamp(p, 1, SET_COUNT);
      if (clamped === page) return;
      sliding = true;
      sfx('button');
      // 유기체(젤리) 페이지 전환 — 카드 전체가 눌리며 퇴장했다가 반대편에서 젤리로 안착(popupFx 공용).
      popupOrganicPageSwap(
        scene,
        pageWrap,
        cx,
        dir * groupW * 0.5,
        () => {
          page = clamped;
          pageText.setText(`${page}/${SET_COUNT}`);
          applyPageVisuals(page);
        },
        () => {
          sliding = false;
        },
      );
    };

    // 드래그 스와이프 — 카드 프레임 전체(layer_1) 영역에서 인식.
    //   ⚠️ 배경(HomeScene) 타워 드래그 스크롤은 `this.input.on('pointerdown'/'pointermove', …)`(씬 전역
    //   리스너)이라 여기서 stopPropagation 해도 안 막힌다 — 호출부(HomeScene.showCollectionCards)가
    //   `scrollSuspended` 플래그로 직접 잠가야 한다. 여기 stopPropagation 은 다른 game object 리스너용(방어적).
    let dragStartX: number | null = null;
    const zoneW = (frameNode.w ?? bannerNode.w) * scale;
    const zoneH = (frameNode.h ?? bh / scale) * scale;
    const zoneX = frameNode.x * scale;
    const zoneY = frameNode.y * scale;
    const panelZone = scene.add.zone(zoneX, zoneY, zoneW, zoneH).setOrigin(0.5).setInteractive();
    inner.add(panelZone);
    panelZone.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation?.();
      dragStartX = p.x;
    });
    panelZone.on('pointermove', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
      if (dragStartX != null) ev?.stopPropagation?.(); // 드래그 중엔 계속 전파 차단(배경 타워 스크롤 방지).
    });
    panelZone.on('pointerup', (p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation?.();
      if (dragStartX == null) return;
      const dx = p.x - dragStartX;
      dragStartX = null;
      if (Math.abs(dx) < SWIPE_THRESHOLD) return;
      if (dx < 0) setPage(page + 1, 1); // 왼쪽으로 스와이프 → 다음 세트.
      else setPage(page - 1, -1); // 오른쪽으로 스와이프 → 이전 세트.
    });
    panelZone.on('pointerupoutside', (_p: Phaser.Input.Pointer, ev?: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation?.();
      dragStartX = null;
    });

    applyPageVisuals(page); // 초기 표시(허브에서 고른 세트로 시작 — 기본 1번).
  }

  popupOrganicIn(scene, scrim, frame); // 유기체(젤리) 열림 연출(기존 단순 페이드인 대체).

  return { layer, close };
}
