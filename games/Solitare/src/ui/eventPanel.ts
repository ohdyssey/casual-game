import { texSize } from '../assets.js';
/**
 * 탑 이벤트 팝업(JUMP FEST) — **저작(에디터 `blank_5`) 배치를 그대로** 재현한다.
 *
 * 구조는 코인마스터/모노폴리고식 **상승 사다리**다. 아래가 1단계(현재), 위로 갈수록 먼 단계,
 * 꼭대기에 GRAND PRIZE. 이 게임이 무한계단을 오르는 게임이라 **진행 방향이 게임과 같다**.
 *
 * 저작이 상태별 아트를 두 벌 준다 — 코드는 어느 쪽을 쓸지만 고른다:
 *   · 원형 아이콘  `up_TopEvent_07-1`(잠김) / `up_TopEvent_07-2`(열림)
 *   · 행 패널      `up_TopEvent_07-3`(잠김) / `up_TopEvent_07-4`(열림)
 *
 * ⚠️ 좌표는 `screens()`(앵커 변환본)에서 읽는다 — 저작 LAYOUT 직참조 금지.
 * ⚠️ 저작에 **닫기(✕) 노드가 없다**. 배경 딤 탭과 하단 버튼으로 닫는다.
 */
import Phaser from 'phaser';
import { EVENT_LAYOUT } from './generated/portedLayout.js';
import { authoredNodes, type Rect } from './authoredNodes.js';
import { sfx } from '../audio.js';
import { loadSave } from '../save.js';
import { formatRemain } from '../logic/dailyRank.js';
import { msUntilEventReset, progressNow, thiefPeriodId } from '../logic/thiefEvent.js';
import { eventStageIconKey,
  THIEF_GRAND as TOP_EVENT_GRAND,
  THIEF_STAGES as TOP_EVENT_STAGES,
  THIEF_ROW_COUNT as TOP_EVENT_ROW_COUNT,
  goalOf,
  isEventCleared,
  type ThiefStage as TopEventStage,
} from '../config/thiefEvent.js';
import { floorItemKey } from '../config/floorItems.js';
import { POPUP_HEADER_NAME, popupSubtleIn } from '../scenes/popupFx.js';
import { overlayScrim } from './overlay.js';

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

/**
 * 단계 번호의 미세 위치 보정(px, 저작 프레임 기준).
 *
 * 별 명패는 행 아트(`up_TopEvent_07-3/-4`)에 **그려져 들어가 있어** 코드가 그 중심을 알 수 없고,
 * 숫자 텍스트 노드는 눈대중으로 얹혀 있다.
 *
 * ─── 눈대중이 아니라 아트를 재서 구한 값이다 ───
 * `up_TopEvent_07-4.png`(776×150 → 저작 597×115, 배율 1.300)에서 별의 **빨강 rim** 범위를 재면
 * 아트 기준 x[33..155] y[15..123] → 중심 (94, 69)px. 행 rect(x311 y1702)에 얹으면
 * **저작 (383.3, 1754.9)**. 숫자 노드(layer_12, x352 y1722 w52 h67)의 중심이 (378.0, 1755.5)
 * 이므로 차이가 이 값이다. 측정 스크립트는 대화 기록의 `star-probe.mjs` 방식(rim 색 필터 +
 * 패널 테두리를 피하는 안쪽 여백)을 쓴다.
 *
 * ⚠️ 처음엔 눈대중으로 (+14, +8) → 오른쪽·아래로 치우쳤고, (+7, −2) 로도 여전히 왼쪽으로
 *   보였다(사용자 리포트 2회). 남은 원인은 좌표가 아니라 **이탤릭 패딩이 한쪽에만 걸려
 *   잉크를 3px 왼쪽으로 밀던 것**이었다 — `authoredNodes.decorate()` 에서 대칭 패딩으로 고쳤다.
 * ⚠️ 이 값은 **임시 보정**이다. 에디터에서 `layer_12*` 를 별 중심으로 옮기면 0 으로 되돌릴 것.
 */
// 실측 차이는 +5.3 이지만 눈으로는 아직 오른쪽으로 보인다(사용자 리포트) — 이탤릭이라 잉크의
// 무게가 위쪽에 쏠려 광학 중심이 기하 중심보다 왼쪽에 있다. 그만큼만 덜어낸다.
const STAGE_NO_DX = 2;
const STAGE_NO_DY = 0;

/**
 * ⚠️ 수집 아이템 아이콘은 **저작 슬롯 크기 그대로** 그린다(사용자 지시 2026-08-15).
 *
 * 한때 "작고 탁하다"는 지적에 1.55배로 키웠으나, 그건 크기 문제가 아니라 **아트 색조** 문제였다
 * (어두운 원본을 작게 줄이니 뭉개져 보였다). 키우면 수량 텍스트를 덮고 행 균형이 무너진다.
 * 진짜 해법은 파스텔 변환(`scripts/build-collect-icons.mjs`)이고, 배치는 에디터가 정한다.
 */

/** 저작 아트 키 — 이름이 곧 역할이라 별칭을 두지 않는다. */
const ART = {
  panel: 'up_TopEvent_01',
  theme: 'up_TopEvent_02',
  title: 'up_TopEvent_03',
  timerChip: 'up_TopEvent_03-1_v2',
  rail: 'up_TopEvent_07',
  grandBanner: 'up_TopEvent_06',
  bottomTheme: 'up_TopEvent_08',
  btn: 'up_TopEvent_05-1',
  btnPlay: 'up_TopEvent_05-2',
  btnLabel: 'up_TopEvent_05-3',
  markLock: 'up_TopEvent_07-1',
  markOpen: 'up_TopEvent_07-2',
  rowLock: 'up_TopEvent_07-3',
  rowOpen: 'up_TopEvent_07-4',
  grandCoin: 'up_Event_02',
  grandChest: 'up_Event_03',
  rowCoin: 'up_Event_02_v2',
  rowGift: 'up_Event_06',
  /** 칸 목표 아이콘 — 원본은 칸마다 달랐지만 이 게임은 하나다(저작 샘플 재사용). */
  rowItem: 'up_Event_02_v2',
  close: 'up_BR_Shop_03_v3',
} as const;

/**
 * 저작 텍스트 스타일 — `blank_5.json` 의 값을 **그대로** 옮긴다.
 * `generated/screens.js` 는 rect 만 담고 글자 스타일은 담지 않아서 여기 수동 미러링한다
 * (좌표는 자동 반영, 스타일은 수동 — leaguePanel 과 같은 규약).
 *
 * ⚠️ 저작은 전부 **흰 글자 + 색 외곽선**이다. 반대로(색 글자 + 흰 외곽선) 넣으면 화면이
 *    통째로 달라 보인다(2026-08-15 실제 발생 — 추측으로 넣었다가 색·정렬이 전부 어긋났다).
 * ⚠️ 행 보상은 **align: right** 다. left 로 넣으면 자릿수가 다른 숫자(20 / 280)의
 *    오른쪽 끝이 들쭉날쭉해진다(사용자 리포트).
 * ⚠️ 에디터에서 글자 크기·색·외곽선을 바꾸면 이 표도 같이 고쳐야 한다.
 */
const TS = {
  /** layer_13 — 남은 시간. */
  timer: { size: 36, color: '#ffffff', weight: '500', stroke: '#5a3210', strokeW: 0, shadow: false, align: 'center' },
  /** layer_12* — 별 명패 위 단계 번호(파란 외곽선 + 이탤릭). */
  stageNo: { size: 60, color: '#ffffff', weight: '700 italic', stroke: '#007bff', strokeW: 5, shadow: true, align: 'center' },
  /** layer_15 — GRAND 코인 수치(분홍 외곽선). */
  grandCoin: { size: 42, color: '#ffffff', weight: '500', stroke: '#ff007b', strokeW: 5, shadow: false, align: 'center' },
  /** layer_15_copy — GRAND 상자 수량(파란 외곽선, 더 크다). */
  grandChest: { size: 54, color: '#ffffff', weight: '500', stroke: '#001eff', strokeW: 7, shadow: false, align: 'center' },
  /** layer_15_copy2~6 — 행 보상 수치·아이템 수량(보라 외곽선, 우측 정렬). */
  /** 보상 금액 — **더 크고 또렷하게**(PO 2026-08-24). 저작 정렬(우측)은 그대로 둔다. */
  rowReward: { size: 46, color: '#ffffff', weight: '700', stroke: '#9900ff', strokeW: 7, shadow: true, align: 'right' },
  // 필요 수량(저작 layer_15_copy6~9) — 파란 외곽선으로 보상(보라)과 구분된다.
  rowQty: { size: 32, color: '#ffffff', weight: '500', stroke: '#00aaff', strokeW: 5, shadow: false, align: 'center' },
} as const;

/**
 * 사다리 한 행의 저작 노드 묶음 — **아래(1단계) → 위(4단계)** 순서로 담는다.
 * ⚠️ 에디터 복사 노드의 `_copy` 번호는 생성 순서라 위아래를 뜻하지 않는다. 저작 y 를 보고 직접 나열한다.
 */
interface RowSlot {
  /** 행 패널(잠김/열림 아트를 갈아 끼운다). */
  bg: Rect;
  /** 좌측 원형 표식(잠김/열림). */
  mark: Rect;
  /** 단계 번호 텍스트. */
  no: Rect;
  /** 그 칸이 노리는 수집 아이템 아이콘(저작 layer_19* — 샘플로 c01~c04 가 꽂혀 있다). */
  itemIcon: Rect;
  /** 필요 수량(저작 layer_15_copy6~9 — "120"). 2026-08-15 사용자가 추가한 노드. */
  qty: Rect;
  coinIcon: Rect;
  coinText: Rect;
  /** 아이템(선물) 슬롯. 저작에는 3단계 행에만 있어 나머지는 행 기준으로 옮겨 만든다(`withGifts`). */
  gift: Rect | null;
}

/**
 * 선물 슬롯을 **모든 행에** 만들어 준다.
 *
 * 저작(`layer_17`)은 3단계 행 한 곳에만 있는데, 선물은 "톱니의 **낮은 보상 칸**"에 붙어야 한다
 * (사용자 지시 2026-08-15) — 그 칸이 2·4단계라 저작 슬롯과 어긋난다.
 * 좌표를 새로 지어내지 않고, 저작 슬롯의 **행 안에서의 상대 위치**를 그대로 다른 행에 옮긴다.
 * x 는 그대로, y 만 각 행 배경의 위쪽 기준으로 같은 만큼 내린다.
 *
 * ⚠️ 임시 유도값이다. 에디터에서 각 행에 선물 노드를 만들어 주시면 그때 직접 참조로 바꾼다.
 */
function withGifts(rows: readonly RowSlot[]): readonly RowSlot[] {
  const ref = rows.find((r) => r.gift);
  if (!ref?.gift) return rows;
  const dy = ref.gift.y - ref.bg.y;
  const g = ref.gift;
  return rows.map((r) => (r.gift ? r : { ...r, gift: { x: g.x, y: r.bg.y + dy, w: g.w, h: g.h } }));
}

function rowSlots(B: typeof EVENT_LAYOUT): readonly RowSlot[] {
  return withGifts([
    // 1단계(맨 아래) — 저작에서 유일하게 "열림" 아트로 그려져 있다.
    {
      bg: B.LAYER_11_COPY3, mark: B.LAYER_10_COPY3, no: B.LAYER_12,
      itemIcon: B.LAYER_19, qty: B.LAYER_15_COPY7,
      coinIcon: B.LAYER_16, coinText: B.LAYER_15_COPY2, gift: null,
    },
    {
      bg: B.LAYER_11_COPY2, mark: B.LAYER_10_COPY2, no: B.LAYER_12_COPY,
      itemIcon: B.LAYER_19_COPY, qty: B.LAYER_15_COPY6,
      coinIcon: B.LAYER_16_COPY, coinText: B.LAYER_15_COPY3, gift: null,
    },
    // 3단계 — 저작에 선물 아이콘(layer_17)이 함께 있다.
    // ⚠️ 예전에 이 행의 "x1" 이던 layer_15_copy6 은 2단계의 **필요 수량**으로 용도가 바뀌었다.
    //    그래서 선물에는 수량 텍스트가 없다 — 개수는 아이콘 하나로 읽힌다.
    {
      bg: B.LAYER_11_COPY, mark: B.LAYER_10_COPY, no: B.LAYER_12_COPY2,
      itemIcon: B.LAYER_19_COPY2, qty: B.LAYER_15_COPY8,
      coinIcon: B.LAYER_16_COPY2, coinText: B.LAYER_15_COPY4, gift: B.LAYER_17,
    },
    {
      bg: B.LAYER_11, mark: B.LAYER_10, no: B.LAYER_12_COPY3,
      itemIcon: B.LAYER_19_COPY3, qty: B.LAYER_15_COPY9,
      coinIcon: B.LAYER_16_COPY3, coinText: B.LAYER_15_COPY5, gift: null,
    },
  ]);
}

export interface EventPanelOpts {
  depth: number;
  /** 플레이어의 보유 층 — 칸마다 어떤 층 상품을 모을지 정한다. */
  /** 지금 점포의 상품 층(1..20) — 칸마다 바뀌지 않는다. 없으면 1층. */
  itemFloor?: number;
  builtFloors?: number;
  /** UI 전용 카메라 — 딤이 이 카메라 기준으로 화면 전체를 덮게 한다. */
  uiCam?: Phaser.Cameras.Scene2D.Camera;
  /** 닫힐 때 — 로비 진행바를 갱신한다. */
  onClose: () => void;
  /** 하단 CTA(플레이하러 가기). 미지정이면 닫기만 한다. */
  onPlay?: () => void;
}

/**
 * 사다리에 보여줄 4행 = 현재 단계부터 위로 4개.
 * 단계가 진행되면 창이 위로 미끄러져, 현재 단계가 **항상 맨 아래 칸**에 온다.
 * (마지막 구간에서는 표 끝을 넘지 않도록 창을 뒤로 당긴다.)
 */
export function ladderWindow(stage: number, rows = TOP_EVENT_ROW_COUNT): number {
  const maxStart = Math.max(0, TOP_EVENT_STAGES.length - rows);
  return Math.min(Math.max(0, Math.floor(stage)), maxStart);
}

export function openEventPanel(scene: Phaser.Scene, opts: EventPanelOpts): Phaser.GameObjects.Container {
  const B = EVENT_LAYOUT;
  const SLOTS = rowSlots(B);
  const ui = scene.add.container(0, 0).setDepth(opts.depth);
  const A = authoredNodes(scene, ui);

  // 파괴는 호출측(panels.closePanel)이 닫힘 트윈과 함께 처리한다 — 여기서 destroy 하지 않는다.
  const close = (): void => opts.onClose();

  // 배경 딤 — 저작에 닫기 버튼이 없어 **바깥 탭이 닫기**다.
  // ⚠️ 캔버스 크기로 그리면 UI 카메라의 세이프존 오프셋만큼 **좌우가 안 덮인다**(leaguePanel 과 같은 함정).
  const dim = overlayScrim(scene, 0x061024, 0.55, opts.uiCam);
  dim.on('pointerdown', () => {
    sfx('button');
    close();
  });
  ui.add(dim);

  // ─── 저작 z 순서대로: 패널 → 레일 → 테마 → 제목 → 타이머 ───
  A.img(B.LAYER_1, artOf(B.LAYER_1, ART.panel));
  A.img(B.LAYER_5, artOf(B.LAYER_5, ART.rail));
  A.img(B.LAYER_2, artOf(B.LAYER_2, ART.theme)).setName(POPUP_HEADER_NAME); // 등장 시 창보다 늦게 내려앉는다
  A.img(B.LAYER_3, artOf(B.LAYER_3, ART.title));
  A.img(B.LAYER_4, artOf(B.LAYER_4, ART.timerChip));
  const remain = A.txt(B.LAYER_13, formatRemain(msUntilEventReset(new Date())), TS.timer);
  const tick = scene.time.addEvent({
    delay: 30_000,
    loop: true,
    callback: () => {
      if (remain.active) remain.setText(formatRemain(msUntilEventReset(new Date())));
    },
  });
  ui.once('destroy', () => tick.remove());

  const periodId = thiefPeriodId(new Date());
  const prog = progressNow(loadSave().thiefEvent, periodId);
  const cleared = isEventCleared(prog.stage);

  // ─── GRAND PRIZE — **모든 칸을 끝냈을 때 추가로 받는 완주 보상** ───
  //   ⚠️ 사다리의 마지막 칸이 아니다. 한때 마지막 칸의 coins 를 그대로 꽂아 **10번 칸과 배너가
  //     같은 숫자를 두 번** 보여 줬다(사용자 리포트 2026-08-16).
  A.img(B.LAYER_6, artOf(B.LAYER_6, ART.grandBanner));
  A.img(B.LAYER_14, artOf(B.LAYER_14, ART.grandCoin));
  A.txt(B.LAYER_15, TOP_EVENT_GRAND.coins.toLocaleString(), TS.grandCoin);
  A.img(B.LAYER_14_COPY, artOf(B.LAYER_14_COPY, ART.grandChest));
  A.txt(B.LAYER_15_COPY, `x${TOP_EVENT_GRAND.chest ? 1 : 0}`, TS.grandChest);

  // ─── 사다리 4행 — 현재 단계가 맨 아래에 오도록 창을 민다 ───
  const start = ladderWindow(prog.stage);
  SLOTS.forEach((slot, i) => {
    const stageIdx = start + i;
    const def: TopEventStage | undefined = TOP_EVENT_STAGES[stageIdx];
    if (!def) return; // 표보다 슬롯이 많은 경우(방어)
    /*
     * 열림 = 이미 받았거나(과거) 지금 진행 중인 단계. 그 위로는 잠김.
     * ⚠️ **완주했으면 전부 열림**(PO 2026-08-24 신고: "보상수집이 제대로 매칭되지 않고 있습니다").
     *   예전 식(`!cleared && …`)은 완주 순간 모든 칸을 잠금으로 되돌려, 상품은 그려져 있는데
     *   자물쇠가 걸린 모순된 화면이 됐다(배너는 DONE 인데 사다리는 전부 잠김).
     */
    const open = cleared || stageIdx <= prog.stage;
    A.img(slot.bg, open ? ART.rowOpen : ART.rowLock);
    A.img(slot.mark, open ? ART.markOpen : ART.markLock);
    // 별 명패의 **단계 번호는 유지**한다(PO 2026-08-23) — 사다리에서 몇 칸째인지가 먼저 읽혀야 한다.
    A.txt(
      { ...slot.no, x: slot.no.x + STAGE_NO_DX, y: slot.no.y + STAGE_NO_DY },
      String(stageIdx + 1),
      TS.stageNo,
    );
    /**
     * ─── 이 칸이 모으는 **층 상품** + 진행 ───
     * 층은 플레이어의 보유 층에서 시작해 칸마다 한 층씩 올라간다(`stageFloor`).
     * 진행 중인 칸만 "n/목표" 와 게이지를 보여 준다 — 잠긴 칸은 목표 수만 보여 준다.
     */
    const floor = opts.itemFloor ?? opts.builtFloors ?? 1; // **지금 점포**의 상품(칸마다 바뀌지 않는다).
    const goal = goalOf(stageIdx);
    const current = stageIdx === prog.stage;
    const done = stageIdx < prog.stage || cleared;
    /*
     * **모든 칸에 지금 모으는 물건을 그린다**(PO 2026-08-24 재지시: "따라서 물음표로 표시하지 말고
     *   나타낼 것").
     *
     * 물음표는 "칸마다 다른 물건이 나온다"는 옛 설계의 흔적이었다. 지금은 **어느 칸이든 지금 점포의
     * 상품**(과 판에서 모으는 아이템 전부)을 세므로 감출 것이 없다 — 감추면 오히려 무엇을 모아야
     * 하는지 알 수 없다.
     *
     * ⚠️ **비율을 바꾸지 않는다** — 저작 사각형은 자리만 잡고 크기는 원본 비율로 맞춘다(`imgFit`).
     */
    /*
     * **칸마다 다른 미션 아이템**(PO 2026-08-24: "스토어 상품수집만이 아닌 … 콜렉션카드 플러스카드
     *   다이아 등"). 위클리는 판에서 모으는 것을 **모두** 세므로, 칸마다 다른 그림을 보여 줘서
     *   "이것들 전부가 대상"임을 알린다. 첫 칸은 지금 점포 상품(콜라 등)으로 둔다.
     */
    const picked = eventStageIconKey(stageIdx, floorItemKey(floor));
    const itemKey = scene.textures.exists(picked) ? picked : floorItemKey(floor); // 아트 누락 시 점포 상품으로.
    if (scene.textures.exists(itemKey)) {
      const r = A.rect(slot.itemIcon);
      const src = texSize(scene.textures.get(itemKey));
      const k = Math.min(r.w / src.width, r.h / src.height);
      ui.add(
        scene.add
          .image(r.x + r.w / 2, r.y + r.h / 2, itemKey)
          .setDisplaySize(src.width * k, src.height * k),
      );
    }
    const have = done ? goal : current ? prog.count : 0;
    if (current || done) {
      /**
       * 게이지 — **아이콘 오른쪽부터 코인 왼쪽까지** 행을 가로질러 그린다.
       * 저작에는 바 노드가 없어 코드로 그린다. 숫자 칸(qty) 폭에만 맞추면 20px 남짓이라
       * 보이지도 않는다(실측) — 행의 빈 구간을 실제로 재서 쓴다.
       */
      const icon = A.rect(slot.itemIcon);
      const coin = A.rect(slot.coinIcon);
      const row = A.rect(slot.bg);
      const left = icon.x + icon.w + 10;
      const right = Math.max(left + 40, coin.x - 12);
      const h = Math.max(10, row.h * 0.16);
      const y = row.y + row.h - h - Math.max(6, row.h * 0.14);
      const g = scene.add.graphics();
      g.fillStyle(0x000000, 0.20);
      g.fillRoundedRect(left, y, right - left, h, h / 2);
      g.fillStyle(done ? 0x3ec46d : 0xffb020, 1);
      g.fillRoundedRect(left, y, Math.max(h, (right - left) * Math.min(1, have / Math.max(1, goal))), h, h / 2);
      ui.add(g);
    }
    /*
     * **모든 칸을 같은 형식(달성/목표)으로**(PO 2026-08-24 신고: "홈화면에서는 17, 팝업화면에서는 11로
     *   서로 다릅니다"). 예전엔 진행 중인 칸만 `n/목표` 이고 나머지는 **목표 숫자만** 적었다.
     *   그래서 배너의 `17/17`(현재 칸)과 사다리의 `11`(다른 칸의 목표)이 서로 다른 값처럼 보였다.
     */
    A.txt(slot.qty, `${have.toLocaleString()}/${goal.toLocaleString()}`, TS.rowQty);
    A.img(slot.coinIcon, ART.rowCoin);
    A.txt(slot.coinText, def.coins.toLocaleString(), TS.rowReward);
    // 아이템 슬롯은 저작상 한 행에만 있다 — 그 행에 배정된 단계가 아이템을 줄 때만 그린다.
    if (slot.gift && def.items) A.img(slot.gift, ART.rowGift);
  });

  // ─── 닫기 ✕(저작 layer_18, 우상단) — 2026-08-15 추가된 노드 ───
  A.img(B.LAYER_18, artOf(B.LAYER_18, ART.close));
  A.hit(B.LAYER_18, () => {
    sfx('button');
    close();
  }, 20);

  // ─── 하단 CTA ───
  A.img(B.LAYER_7, artOf(B.LAYER_7, ART.bottomTheme));
  A.img(B.LAYER_8, artOf(B.LAYER_8, ART.btn));
  A.img(B.LAYER_9, artOf(B.LAYER_9, ART.btnPlay));
  /**
   * CTA 라벨 아트 — **저작에서 사라질 수 있는 노드**다(디자이너가 새 버튼 아트에 글자를 넣어
   * 버리면 필요 없어진다). 실제로 2026-08-23 개편에서 `layer_9_copy` 가 삭제됐다.
   * ⚠️ 없는 노드를 그대로 참조하면 `undefined.x` 가 씬 create() 를 관통해 **로딩 100%에서 멈춘다**
   *   (이 프로젝트의 알려진 사고 패턴). 선택 노드로 다룬다 — 있으면 그리고, 없으면 넘어간다.
   */
  const labelSlot = (B as Partial<Record<'LAYER_9_COPY', Rect>>).LAYER_9_COPY;
  if (labelSlot) A.img(labelSlot, ART.btnLabel);
  A.hit(B.LAYER_8, () => {
    sfx('button');
    close();
    opts.onPlay?.();
  }, 24);

  // 살짝만 일렁이며 등장(PO 2026-08-24) — 큰 팝업보다 약하게.
  popupSubtleIn(scene, dim, ui, { x: B.FRAME.w / 2, y: B.FRAME.h / 2 });
  return ui;
}
