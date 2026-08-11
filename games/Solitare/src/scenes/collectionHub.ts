/**
 * collectionHub.ts — **콜렉션 메인 카드**(세트 목록 허브, 2026-07-19).
 *   PO 지시: "콜렉션카드를 직접 진입하지 말고 이 메인카드에 진입 후 각 카드 스테이지에 진입하는 것으로
 *   수정 바람" → 이어서 "CollecttionCard_main 이미지를 사용하라는 의미다" — `D:\캐쥬얼 게임\SolitareHeights\
 *   Card\CollectionCard\CollecttionCard_main.png`(841×1870, 코드 드로우 placeholder 아님, 실제 지정 아트)를
 *   허브 배경 전체로 쓴다. 이미지 종횡비(841:1870)가 게임 캔버스(1080:2400)와 **정확히 동일**해 화면 꽉 채워
 *   1:1 표시된다.
 *   이 아트에는 20칸 샵 그리드가 이미 그려져 있지만(placeholder 상점명·진행도), 우리가 가진 실제 세트는
 *   10개(up_CollecttionCard_01~10)뿐이다 — 그리드 첫 10칸(3열×3행 + 4행 첫칸, 위에서부터 Convenience
 *   Store·Golden Crust Bakery·Bean & Bloom Coffee 등)의 좌표에 **투명 히트존만** 얹어 우리 세트 1~10에
 *   매핑한다(정확한 픽셀 정렬은 근사치 — PO가 이 화면 자체를 다시 제작할 예정이라 우선 기능만 구현).
 */
import Phaser from 'phaser';
import { sfx } from '../audio.js';
import { SET_COUNT, NEW_CARD_BADGE_KEY } from './collectionPopup.js';
import { popupOrganicIn, popupOrganicOut } from './popupFx.js';
import { hasNewInSet } from '../logic/collection.js';
import { loadSave, collectionOf, collectionSeenOf } from '../save.js';

export interface CollectionHubOpts {
  readonly depth?: number; // 기본 4000.
  readonly pinToUi?: (o: Phaser.GameObjects.GameObject) => void; // HomeScene 스크롤 카메라 대응(선택).
  readonly onClose?: () => void;
  /** 세트 카드를 탭했을 때(1..SET_COUNT) — 호출부가 collectionPopup.ts 를 initialPage 로 연다. */
  readonly onSelect: (setIndex: number) => void;
}

export interface CollectionHubHandle {
  readonly layer: Phaser.GameObjects.Container;
  close(): void;
}

const BG_KEY = 'up_CollecttionCard_main';
const SRC_W = 841; // 원본 841×1870 = 캔버스(1080×2400)와 동일 종횡비 → 이 폭 기준 scale 하나로 충분.

/**
 * **NEW 배지**(2026-07-20) — 그 세트에 아직 안 본 새 카드가 있으면 상점 타일 좌상단에 이 리본을 띄운다.
 *   아트 키는 collectionPopup.ts 의 카드별 NEW 배지와 동일(NEW_CARD_BADGE_KEY, `up_Solitare_UI_Play_03-3`) —
 *   원본 좌상단이 뾰족하게 물리는 모양이라 origin(0,0)으로 타일 모서리에 붙인다.
 */
const NEW_BADGE_KEY = NEW_CARD_BADGE_KEY;
const NEW_BADGE_SIZE = 64;

// 배경 아트에 그려진 20칸 그리드의 첫 10칸 중심좌표(원본 픽셀, 3열×5행 중 앞 10개) — 실측 근사치.
const GRID_COLS_X = [153, 420, 687];
const GRID_ROW_Y = [779, 1017, 1255, 1493];
const CELL_W = 267; // 열 피치.
const CELL_H = 238; // 행 피치.
const SLOTS: ReadonlyArray<{ x: number; y: number }> = [
  { x: GRID_COLS_X[0], y: GRID_ROW_Y[0] },
  { x: GRID_COLS_X[1], y: GRID_ROW_Y[0] },
  { x: GRID_COLS_X[2], y: GRID_ROW_Y[0] },
  { x: GRID_COLS_X[0], y: GRID_ROW_Y[1] },
  { x: GRID_COLS_X[1], y: GRID_ROW_Y[1] },
  { x: GRID_COLS_X[2], y: GRID_ROW_Y[1] },
  { x: GRID_COLS_X[0], y: GRID_ROW_Y[2] },
  { x: GRID_COLS_X[1], y: GRID_ROW_Y[2] },
  { x: GRID_COLS_X[2], y: GRID_ROW_Y[2] },
  { x: GRID_COLS_X[0], y: GRID_ROW_Y[3] },
];

/** 배경 텍스처가 로드돼 있으면 그리고, 없으면 코드 드로우 최소 폴백(스크림+안내 텍스트)으로 대체. */
export function buildCollectionHub(scene: Phaser.Scene, opts: CollectionHubOpts): CollectionHubHandle {
  const depth = opts.depth ?? 4000;
  const W = scene.scale.width;
  const H = scene.scale.height;
  const scale = W / SRC_W; // 종횡비가 캔버스와 동일 → scaleX≈scaleY.
  const layer = scene.add.container(0, 0).setDepth(depth);
  opts.pinToUi?.(layer);

  // 딤 배경 — 유기체 연출 중 가장자리로 보이는 홈 화면을 어둡게 + 입력 하부 차단(탭 닫기는 아님, 기존 UX 유지).
  const scrim = scene.add.rectangle(0, 0, W, H, 0x140a1e, 0.86).setOrigin(0, 0).setInteractive();
  layer.add(scrim);
  // **유기체(젤리) 연출용 프레임**(popupFx) — 중심(W/2,H/2) 기준 스케일, inner 는 절대좌표 유지용 역오프셋.
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

  if (scene.textures.exists(BG_KEY)) {
    const bg = scene.add.image(W / 2, H / 2, BG_KEY).setDisplaySize(W, H);
    inner.add(bg);
  } else {
    inner.add(scene.add.rectangle(0, 0, W, H, 0x140a1e, 0.9).setOrigin(0, 0));
    inner.add(
      scene.add
        .text(W / 2, H / 2, '콜렉션 카드 준비 중', { fontFamily: '"Jua", sans-serif', fontSize: '50px', color: '#ffffff' })
        .setOrigin(0.5),
    );
  }

  // 세트 1~10 히트존(투명) — 배경 아트의 그리드 첫 10칸 위치에 얹는다.
  const save = loadSave();
  const owned = collectionOf(save);
  const seen = collectionSeenOf(save);
  for (let i = 0; i < SET_COUNT; i++) {
    const slot = SLOTS[i];
    if (!slot) break;
    const setNo = i + 1;
    // **NEW 배지** — 상점 원형 아이콘 좌상단 모서리에 리본이 딱 붙는 위치(PO 에디터 스샷 기준).
    if (hasNewInSet(owned, seen, setNo)) {
      const bx = (slot.x - CELL_W * 0.28) * scale;
      const by = (slot.y - CELL_H * 0.42) * scale;
      if (scene.textures.exists(NEW_BADGE_KEY)) {
        const src = scene.textures.get(NEW_BADGE_KEY).getSourceImage() as { width: number; height: number };
        inner.add(
          scene.add
            .image(bx, by, NEW_BADGE_KEY)
            .setOrigin(0, 0)
            .setDisplaySize(NEW_BADGE_SIZE * scale, NEW_BADGE_SIZE * scale * (src.height / src.width))
            .setDepth(depth + 10),
        );
      } else {
        const ribbon = scene.add.container(bx + (NEW_BADGE_SIZE * scale) / 2, by + (NEW_BADGE_SIZE * scale) / 2).setDepth(depth + 10);
        ribbon.add(scene.add.circle(0, 0, (NEW_BADGE_SIZE * scale) / 2, 0xe0453e).setStrokeStyle(3 * scale, 0xffffff));
        ribbon.add(
          scene.add
            .text(0, 0, 'NEW', { fontFamily: '"Jua", sans-serif', fontSize: `${Math.round(15 * scale)}px`, color: '#ffffff' })
            .setOrigin(0.5),
        );
        inner.add(ribbon);
      }
    }
    const zone = scene.add
      .zone(slot.x * scale, slot.y * scale, CELL_W * scale, CELL_H * scale)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    inner.add(zone);
    zone.on('pointerdown', () => {
      if (closing) return;
      sfx('button');
      opts.onSelect(i + 1);
    });
  }

  // 닫기 버튼 — 코드로 그린 ✕ 대신 지정 아트(up_DailyMission_08, 다른 팝업 닫기와 같은 패밀리) 사용.
  //   (2026-07-19 PO 지시: "상단 닫기 버튼을 지정한 버튼을 사용하라" — DailyMission_08.)
  const CLOSE_KEY = 'up_DailyMission_08';
  let closeBtn: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
  if (scene.textures.exists(CLOSE_KEY)) {
    closeBtn = scene.add.image(W - 90, 90, CLOSE_KEY).setDisplaySize(110, 110).setInteractive({ useHandCursor: true });
  } else {
    closeBtn = scene.add
      .text(W - 70, 60, '✕', { fontFamily: '"Jua", sans-serif', fontSize: '44px', color: '#ffffff', backgroundColor: '#c0392bcc', padding: { x: 18, y: 6 } })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
  }
  closeBtn.on('pointerdown', () => {
    if (closing) return; // onClose 중복 호출 방지.
    close();
    opts.onClose?.();
  });
  inner.add(closeBtn);

  popupOrganicIn(scene, scrim, frame); // 유기체(젤리) 열림 연출(기존 단순 페이드인 대체).

  return { layer, close };
}
