/**
 * 리더보드 — **저작(에디터 blank_6) 배치 그대로**. 우상단 랭킹 아이콘이 연다.
 *
 * 저작 구성: 헤더 배너 + 탭 3개 + 행 11개 + 닫기.
 *   행 한 줄 = [1~3위 메달 / 4위부터 순위 숫자] · [아바타 프레임+아바타] · [이름] · [기록]
 *
 * 탭 3종(사용자 확정 2026-08-16): **최고계단 / 최고레벨 / PVP**.
 *   `logic/ranking.ts` 는 카테고리 9종을 갖고 있지만 리더보드에는 이 셋만 올린다 —
 *   순위표는 "무엇으로 겨루는지"가 한눈에 읽혀야 하고, 탭이 많으면 그 순간 표가 아니라 메뉴가 된다.
 *
 * ## ⚠️ 표의 글자 크기는 **열마다 하나**다 — `fitTxt` 를 행마다 쓰지 말 것
 * `fitTxt`(ui/fitText)는 슬롯 하나를 최대로 채우는 헬퍼라, 값마다 크기가 달라진다:
 *   ① `scriptSizeBumpPx` 가 **문자 종류별로 기준 크기를 바꾼다**(숫자·영문 > 한글)
 *   ② `fitFontSize` 가 짧으면 1.3배까지 키우고 길면 0.85배까지 줄인다
 * 둘이 겹치면 같은 열에서 **최대 1.53배** 차이가 난다. 버튼 하나에는 맞는 규칙이지만 표에는
 * 틀린 규칙이다(2026-08-16 사용자 리포트: "폰트 사이즈가 들쭉날쭉"). 그래서 여기서는
 * **열의 모든 값을 미리 재서 다 들어가는 크기 하나**를 구하고(`columnSize`), 전 행에 그 크기를
 * 고정으로 쓴다. 굵기도 행마다 바꾸지 않는다 — 굵기 차이도 크기 차이로 읽힌다.
 *
 * ⚠️ 좌표는 전부 `screens().BLANK_6` 에서 읽는다(LAYOUT 직참조·숫자 하드코딩 금지).
 * ⚠️ 행 자식(메달·아바타·이름·기록)은 **1행 저작을 템플릿으로** 삼아 행 간격만큼 평행이동한다.
 *   저작에는 2·3행 메달만 개별로 놓여 있는데 y 가 몇 px 씩 어긋나 있어(521/652/791 vs 행 496/632/768),
 *   그대로 쓰면 11행이 들쭉날쭉해진다. 템플릿 방식이라야 줄이 맞는다.
 */
import Phaser from 'phaser';
import { loadSave } from '../save.js';
import { buildRanking, formatRankValue, RANK_FLAGS, type RankCategory } from '../logic/ranking.js';
import { profileOf } from '../logic/leagueRuntime.js';
import { periodIdFor } from '../logic/league.js';
import { fitFontSize } from '../logic/textFit.js';
import {
  LB_ROW_COUNT as ROW_COUNT,
  LB_SCROLL_STEP as SCROLL_STEP,
  clampOffset,
  maxScrollOffset,
  windowRows,
  type RankedEntry,
} from '../logic/leaderboardWindow.js';
import { LEADERBOARD_LAYOUT } from './generated/portedLayout.js';
import { sfx } from '../audio.js';
import { authoredNodes } from './authoredNodes.js';
import { ensureFlagTextures, flagKey } from '../assets.js';
import { FONT } from './uiKit.js';
import { POPUP_HEADER_NAME } from '../scenes/popupFx.js';
import { overlayScrim } from './overlay.js';
import { popupSubtleIn } from '../scenes/popupFx.js';

/**
 * 저작이 지정한 아트 키를 우선 쓴다 — 없으면 코드 기본값.
 *
 * ⚠️ 예전엔 키를 코드에 박아 썼다. 그러면 디자이너가 에디터에서 그림을 바꿔도 **화면이 안 바뀐다**
 *   (실측 2026-08-23: 레이아웃만 갈아끼웠는데 옛 아트가 그대로 나왔다). 좌표와 그림은 같은 출처여야 한다.
 */
function artOf(slot: unknown, fallback: string): string {
  const k = (slot as { key?: unknown }).key;
  return typeof k === 'string' ? k : fallback;
}

export interface LeaderboardPanelOpts {
  depth: number;
  /** UI 전용 카메라 — 딤이 이 카메라 기준으로 화면 전체를 덮게 한다. */
  uiCam?: Phaser.Cameras.Scene2D.Camera;
  /** 처음 보여 줄 탭(없으면 최고계단). */
  initial?: RankCategory;
  onClose: () => void;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 저작 탭 3개에 1:1 대응하는 카테고리(사용자 확정). */
const TABS: ReadonlyArray<{ cat: RankCategory; label: string }> = [
  { cat: 'level', label: '최고레벨' },
  { cat: 'floor', label: '최고층' },
  { cat: 'league', label: '리그점수' },
];

/** 탭 글자색 — 선택 노랑 / 비선택 밝은 회색(사용자 지시 2026-08-16). */
const TAB_COLOR_ON = '#FFD166';
const TAB_COLOR_OFF = '#D6DEE8';

/** 1~3위 메달 아트(순위 순서). */
const MEDAL_KEYS = ['up_LeaderBoard_05-1', 'up_LeaderBoard_05-2', 'up_LeaderBoard_05-3'] as const;

/** 국기 표시 높이 = 이름 슬롯 높이 대비 비율. 이름보다 커지면 국기가 주인공이 된다. */
const FLAG_W_RATIO = 1.05;
/** 국기와 이름 사이 여백(px). */
const FLAG_GAP = 14;

/** 행 안의 글자색 — 기본은 저작 크림 배경 위 진남색, 내 줄만 골드. */
const ROW_INK = '#0E1630';
const ROW_INK_ME = '#C8891B';

/** 저작 행 11개 — z 순서대로. */
function rowSlots(P: typeof LEADERBOARD_LAYOUT): readonly Rect[] {
  return [
    P.LAYER_3,
    P.LAYER_3_COPY,
    P.LAYER_3_COPY2,
    P.LAYER_3_COPY3,
    P.LAYER_3_COPY4,
    P.LAYER_3_COPY5,
    P.LAYER_3_COPY6,
    P.LAYER_3_COPY7,
    P.LAYER_3_COPY8,
    P.LAYER_3_COPY9,
    P.LAYER_3_COPY10,
  ];
}

/** 저작 탭 슬롯 3개. */
function tabSlots(P: typeof LEADERBOARD_LAYOUT): readonly Rect[] {
  return [P.LAYER_2, P.LAYER_2_COPY, P.LAYER_2_COPY2];
}

export function openLeaderboardPanel(
  scene: Phaser.Scene,
  opts: LeaderboardPanelOpts,
): Phaser.GameObjects.Container {
  // ⚠️ 저작 좌표는 캔버스 크기에 맞춘 앵커 변환본(ui/screens) — LAYOUT 직참조 금지.
  const P = LEADERBOARD_LAYOUT;
  // 국기는 SVG 라 지연 로드다 — 열 때 확보하고, 도착하면 행을 다시 그린다.
  //   ⚠️ 실패해도 게임이 멈추면 안 된다 — 파괴된 오브젝트의 콜백 예외 하나가 게임 루프를 영구
  //     정지시키는 사고가 이 프로젝트에 이미 있었다(전 게임 공통 함정). 반드시 삼킨다.
  void ensureFlagTextures(scene, RANK_FLAGS)
    .then(() => {
      if (ui.active) renderRows();
    })
    .catch(() => {
      /* 국기는 장식이다 — 못 올려도 순위표는 그대로 보인다. */
    });
  const ROWS = rowSlots(P);
  const TAB_SLOTS = tabSlots(P);

  const ui = scene.add.container(0, 0).setDepth(opts.depth);
  const A = authoredNodes(scene, ui);

  /**
   * **열 하나에 쓸 글자 크기** — 그 열의 모든 값을 재서 전부 들어가는 최대 크기를 고른다.
   *
   * 측정용 텍스트를 하나만 만들어 크기를 바꿔 가며 잰다(값마다 새로 만들면 GC 부담이 크고
   * 해상도 설정이 달라 측정이 어긋난다 — ui/fitText 와 같은 이유).
   * ⚠️ `scriptSizeBumpPx` 를 쓰지 않는다 — 그게 바로 열 안에서 크기를 흔드는 원인이다.
   */
  const columnSize = (slotW: number, values: readonly string[], base: number, weight: string): number => {
    if (values.length === 0) return base;
    const probe = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: `${base}px`, fontStyle: weight })
      .setVisible(false);
    let size = Number.POSITIVE_INFINITY;
    for (const v of values) {
      probe.setText(v);
      size = Math.min(
        size,
        fitFontSize(
          (px) => {
            probe.setFontSize(px);
            return probe.width;
          },
          base,
          slotW,
        ),
      );
    }
    probe.destroy();
    return Number.isFinite(size) ? size : base;
  };

  // 배경 딤 — 밖을 눌러 닫히지 않게(오탭 방지, 다른 팝업과 같은 규약).
  // ⚠️ 캔버스 크기로 그리면 UI 카메라의 세이프존 오프셋만큼 좌우가 안 덮인다(리그·이벤트와 같은 함정).
  const dim = overlayScrim(scene, 0x061024, 0.62, opts.uiCam);
  ui.add(dim);

  // ─── 1행 저작을 행 템플릿으로 굳힌다(위 주석 참조) ───
  const ROW0 = ROWS[0]!;
  const T = {
    medal: P.LAYER_6, // 메달 슬롯(= 순위 숫자 자리이기도 하다)
    frame: P.LAYER_5, // 아바타 프레임
    avatar: P.LAYER_7,
    name: P.LAYER_8,
    score: P.LAYER_8_COPY,
  };
  /** 템플릿 자식을 n번째 행 높이로 평행이동. */
  const at = (r: Rect, rowIdx: number): Rect => ({ ...r, y: r.y + (ROWS[rowIdx]!.y - ROW0.y) });

  let tabIdx = Math.max(0, TABS.findIndex((t) => t.cat === (opts.initial ?? 'infinite')));
  /** 창의 시작 줄(0-based). 탭을 바꾸면 맨 위로 되돌린다. */
  let offset = 0;

  const tabLayer = scene.add.container(0, 0);
  const rowLayer = scene.add.container(0, 0);
  const navLayer = scene.add.container(0, 0);

  // 탭 글자 크기도 세 탭이 같아야 한다 — 라벨 길이가 제각각이라 개별로 맞추면 눈에 띄게 어긋난다.
  const TAB_SIZE = columnSize(
    A.rect(TAB_SLOTS[0]!).w,
    TABS.map((t) => t.label),
    34,
    '800',
  );

  const renderTabs = (): void => {
    tabLayer.removeAll(true);
    TABS.forEach((t, i) => {
      const slot = TAB_SLOTS[i]!;
      const active = i === tabIdx;
      // 저작이 선택/비선택 두 벌을 준다 — layer_2 가 선택 상태(_03), 나머지가 비선택(_02).
      A.img(slot, active ? 'up_LeaderBoard_03' : 'up_LeaderBoard_02', tabLayer);
      A.txt(
        slot,
        t.label,
        { size: TAB_SIZE, color: active ? TAB_COLOR_ON : TAB_COLOR_OFF, align: 'center', weight: '800', shadow: true },
        tabLayer,
      );
      A.hit(
        slot,
        () => {
          if (i === tabIdx) return;
          sfx('button');
          tabIdx = i;
          offset = 0; // 다른 종목으로 넘어가면 1위부터 — 전 탭의 스크롤 위치를 물려받으면 혼란스럽다
          renderTabs();
          renderRows();
        },
        0,
        tabLayer,
      );
    });
  };

  const renderRows = (): void => {
    rowLayer.removeAll(true);
    const cat = TABS[tabIdx]!.cat;
    const save = loadSave();
    // 시드 = 날짜 인덱스 — 같은 날은 같은 명단, 날이 바뀌면 새로 짜인다(리그와 같은 규약).
    const { entries, playerRank } = buildRanking(cat, save, periodIdFor(new Date()), profileOf(save).avatar);
    const ranked: RankedEntry[] = entries.map((e, i) => ({ ...e, rank: i + 1 }));
    const maxOff = maxScrollOffset(ranked.length);
    offset = clampOffset(offset, ranked.length);
    const rows = windowRows(ranked, offset, playerRank);
    renderNav(maxOff);

    // 열별 크기를 **먼저** 확정한다(전 행 공통).
    //   ⚠️ 국기는 이제 **그림**이라 이름 문자열에서 뺀다 — 이름 슬롯도 국기 폭만큼 좁혀 잡아야
    //     긴 닉네임이 국기를 파고들지 않는다.
    const names = rows.map((e) => (e.isPlayer ? '나' : e.name));
    const scores = rows.map((e) => formatRankValue(cat, e.value));
    const ranks = rows.filter((e) => e.rank > 3).map((e) => String(e.rank));
    const nameSlot = T.name;
    const flagW = Math.round(nameSlot.h * FLAG_W_RATIO);
    const flagH = Math.round(flagW * 2 / 3); // 국기 표준 비 3:2
    const nameSize = columnSize(nameSlot.w - flagW - FLAG_GAP, names, 34, '800');
    const scoreSize = columnSize(A.rect(T.score).w, scores, 34, '800');
    const rankSize = columnSize(A.rect(T.medal).w, ranks, 44, '800');

    rows.forEach((e, i) => {
      A.img(ROWS[i]!, 'up_LeaderBoard_04', rowLayer);

      // 순위 — 1~3위는 메달 아트, 그 아래는 숫자.
      if (e.rank <= 3) {
        A.img(at(T.medal, i), MEDAL_KEYS[e.rank - 1]!, rowLayer);
      } else {
        A.txt(
          at(T.medal, i),
          String(e.rank),
          { size: rankSize, color: ROW_INK, align: 'center', weight: '800' },
          rowLayer,
        );
      }

      A.img(at(T.frame, i), 'up_PVP_08-1_v3', rowLayer);
      A.img(at(T.avatar, i), 'up_BR_UI_Profile_005_v5', rowLayer);

      // 국기 — 이름 왼쪽. 텍스처가 없으면(목록에 없는 국가) **그냥 건너뛴다**:
      //   MISSING 플레이스홀더가 표를 덮는 것보다 국기가 없는 편이 낫다.
      const nameRect = at(T.name, i);
      if (scene.textures.exists(flagKey(e.flag))) {
        A.img({ x: nameRect.x, y: nameRect.y + (nameRect.h - flagH) / 2, w: flagW, h: flagH }, flagKey(e.flag), rowLayer);
      }

      // 내 줄은 색으로만 구분한다 — 굵기까지 바꾸면 그 줄만 커 보인다(위 주석의 '열 = 한 크기').
      const ink = e.isPlayer ? ROW_INK_ME : ROW_INK;
      const textSlot = { ...nameRect, x: nameRect.x + flagW + FLAG_GAP, w: nameRect.w - flagW - FLAG_GAP };
      A.txt(textSlot, names[i]!, { size: nameSize, color: ink, align: 'left', weight: '800' }, rowLayer);
      A.txt(at(T.score, i), scores[i]!, { size: scoreSize, color: ink, align: 'right', weight: '800' }, rowLayer);
    });

    // 미참가(기록 없음) — 빈 표만 보여 주면 고장으로 읽힌다. 한 줄로 사실을 말한다.
    if (playerRank === null) {
      const slot = at(T.name, Math.min(rows.length, ROW_COUNT - 1));
      A.txt(slot, '아직 기록이 없습니다', { size: 30, color: '#7A879A', align: 'left', weight: '700' }, rowLayer);
    }
  };

  /**
   * 상하 이동 버튼 — **저작에 없는 노드라 코드로 그린다.**
   *
   * ⚠️ 좌표를 숫자로 박지 않는다. 표 오른쪽 끝(행 rect)과 닫기 버튼 높이에서 파생시켜,
   *   에디터에서 행이나 닫기를 옮기면 버튼도 따라가게 한다. 저작에 전용 노드가 생기면
   *   `A.img(P.LAYER_xx, ...)` 로 바꾸면 된다.
   */
  const renderNav = (maxOff: number): void => {
    navLayer.removeAll(true);
    if (maxOff <= 0) return; // 스크롤할 게 없으면 버튼도 없다(눌러도 아무 일 없는 버튼은 고장으로 읽힌다)

    const lastRow = A.rect(ROWS[ROWS.length - 1]!);
    const close = A.rect(P.LAYER_4);
    const size = Math.round(close.h * 0.82);
    const cy = close.y + close.h / 2;
    const rightEdge = lastRow.x + lastRow.w;

    const mk = (cx: number, glyph: string, delta: number, enabled: boolean): void => {
      const g = scene.add.graphics();
      // 원본은 공용 uiKit 의 drawRoundRect/UI_COLORS 를 썼다 — 이 게임 uiKit 에는 없어 직접 그린다.
      g.fillStyle(0x2f7ad6, enabled ? 1 : 0.35);
      g.fillRoundedRect(cx - size / 2, cy - size / 2, size, size, size * 0.32);
      g.lineStyle(4, 0xffffff, enabled ? 0.55 : 0.2);
      g.strokeRoundedRect(cx - size / 2, cy - size / 2, size, size, size * 0.32);
      navLayer.add(g);
      const t = scene.add
        .text(cx, cy, glyph, { fontFamily: FONT, fontSize: `${Math.round(size * 0.5)}px`, color: '#FFFFFF', fontStyle: '800' })
        .setOrigin(0.5)
        .setAlpha(enabled ? 1 : 0.4);
      navLayer.add(t);
      if (!enabled) return;
      const hit = scene.add
        .rectangle(cx, cy, size, size, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        sfx('button');
        offset = Math.max(0, Math.min(offset + delta, maxOff));
        renderRows();
      });
      navLayer.add(hit);
    };

    const gap = Math.round(size * 0.18);
    mk(rightEdge - size * 1.5 - gap, '▲', -SCROLL_STEP, offset > 0);
    mk(rightEdge - size * 0.5, '▼', SCROLL_STEP, offset < maxOff);
  };

  // 저작 z 순서 그대로: 헤더 → 탭 → 행 → 닫기.
  A.img(P.LAYER_1, artOf(P.LAYER_1, 'up_LeaderBoard_01')).setName(POPUP_HEADER_NAME);
  ui.add(tabLayer);
  ui.add(rowLayer);
  ui.add(navLayer);
  A.img(P.LAYER_4, artOf(P.LAYER_4, 'up_Mode_09_v2'));
  A.hit(P.LAYER_4, () => {
    sfx('button');
    opts.onClose();
  });

  renderTabs();
  renderRows();
  // 살짝만 일렁이며 등장(PO 2026-08-24) — 딤은 흔들지 않는다.
  popupSubtleIn(scene, dim, ui, { x: LEADERBOARD_LAYOUT.FRAME.w / 2, y: LEADERBOARD_LAYOUT.FRAME.h / 2 });
  return ui;
}
