import { texSize } from '../assets.js';
/**
 * 투데이 리그 팝업 — **저작(에디터 blank 화면) 배치를 그대로** 재현한다.
 *
 * 좌표·크기·글자 크기·색은 전부 `LAYOUT.BLANK` 에서 읽는다(숫자 하드코딩 금지). 데이터는
 * `logic/league.ts` 의 시뮬레이션이 만들고, 이 파일은 **그 값을 저작 슬롯에 꽂는 일만** 한다.
 *
 * ⚠️ 에디터 텍스트는 align 에 따라 x 기준점이 다르다(left = 왼쪽 끝, center = 중앙).
 *    전 게임 공통 함정이라 placeText() 한 곳에서 처리한다.
 */
import Phaser from 'phaser';
// 저작 좌표는 이식 상수에서 읽는다(`scripts/gen-ported-layout.mts` 가 public/ui/layouts/league.json 에서 구움).
// ⚠️ 이 게임은 저작 프레임이 세이프존과 같고(1080×2400) 카메라가 세이프존을 중앙정렬하므로
//    펌프러시의 앵커 변환층(screens())이 필요 없다 — 저작 좌표를 그대로 쓴다.
import { LEAGUE_LAYOUT } from './generated/portedLayout.js';

const BD = LEAGUE_LAYOUT;
import { sfx } from '../audio.js';
import { formatRemain, msUntilDailyReset } from '../logic/dailyRank.js';
import { periodIdFor, periodProgress, standings, type LeagueRow } from '../logic/league.js';
import { isLeagueCleared, LEAGUE_STAGE_COUNT, leagueGrandCoins, leagueGrandDiamonds, stageCoins, stageGoal } from '../logic/dailyLeague.js';
import { leagueStageOf } from '../logic/collectRuntime.js';
import { LEAGUE_VISIBLE_ROWS } from '../config/league.js';
import { loadSave } from '../save.js';
import { profileOf } from '../logic/leagueRuntime.js';
import { FONT } from './uiKit.js';
import { POPUP_HEADER_NAME, popupSubtleIn } from '../scenes/popupFx.js';
import { authoredNodes } from './authoredNodes.js';
import { overlayScrim } from './overlay.js';
/** 헤더·보상에서 쓰는 이 게임의 골드 코인 아트(주간 배너와 같은 키). */
const COIN_ICON_KEY = 'up_Solitare_UI_2-3';

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



interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 행 하나를 이루는 저작 노드 묶음 — 슬롯마다 좌표가 따로 저작돼 있다. */
interface RowSlot {
  bg: Rect;
  /** 1~3위 메달 아트(있으면) 또는 숫자 명패. */
  medal: Rect;
  medalKey: string;
  /** 숫자 명패에 얹는 순위 텍스트(4위 이하 슬롯만). */
  rankText: Rect | null;
  avatar: Rect;
  name: Rect;
  pill: Rect;
  pillAlpha: number;
  scoreIcon: Rect;
  scoreText: Rect;
  /** 선물상자(상위 3행만 저작). */
  gift: Rect | null;
  coin: Rect;
  rewardText: Rect;
}

/**
 * 저작 슬롯 5개 — 위에서 아래 순서. id 를 직접 나열하는 이유: 에디터가 복사 노드에
 * `_copy`, `_copy2` … 를 **생성 순서대로** 붙여서 이름만으로는 위아래를 알 수 없다.
 */
/**
 * 저작 슬롯 표 — 원본은 앵커 변환 때문에 함수였다. 이 게임은 변환이 없지만(저작 프레임 = 세이프존),
 * 좌표 출처를 인자로 받는 형태를 유지해 두면 나중에 변환층이 필요해져도 이 파일은 그대로다.
 */
function rowSlots(B: typeof LEAGUE_LAYOUT): readonly RowSlot[] {
  return [
    {
      bg: B.LAYER_6_COPY4,
      medal: B.LAYER_8,
      medalKey: 'up_BR_UI_League_05-1',
      rankText: null,
      avatar: B.LAYER_16,
      name: B.LAYER_17,
      pill: B.LAYER_18,
      pillAlpha: 0.4,
      scoreIcon: B.LAYER_19,
      scoreText: B.LAYER_22,
      gift: B.LAYER_23_COPY5,
      coin: B.LAYER_23,
      rewardText: B.LAYER_22_COPY5,
    },
    {
      bg: B.LAYER_6_COPY2,
      medal: B.LAYER_8_COPY,
      medalKey: 'up_BR_UI_League_05-2',
      rankText: null,
      avatar: B.LAYER_16_COPY,
      name: B.LAYER_17_COPY,
      pill: B.LAYER_18_COPY,
      pillAlpha: 0.4,
      scoreIcon: B.LAYER_19_COPY,
      scoreText: B.LAYER_22_COPY,
      gift: B.LAYER_23_COPY6,
      coin: B.LAYER_23_COPY,
      rewardText: B.LAYER_22_COPY6,
    },
    {
      bg: B.LAYER_6,
      medal: B.LAYER_8_COPY2,
      medalKey: 'up_BR_UI_League_05-3',
      rankText: null,
      avatar: B.LAYER_16_COPY2,
      name: B.LAYER_17_COPY2,
      pill: B.LAYER_18_COPY2,
      pillAlpha: 0.4,
      scoreIcon: B.LAYER_19_COPY2,
      scoreText: B.LAYER_22_COPY2,
      gift: B.LAYER_23_COPY7,
      coin: B.LAYER_23_COPY2,
      rewardText: B.LAYER_22_COPY7,
    },
    {
      bg: B.LAYER_6_COPY,
      medal: B.LAYER_8_COPY3,
      medalKey: 'up_BR_UI_League_05-4',
      rankText: B.LAYER_9,
      avatar: B.LAYER_16_COPY3,
      name: B.LAYER_17_COPY3,
      pill: B.LAYER_18_COPY3,
      pillAlpha: 0.4,
      scoreIcon: B.LAYER_19_COPY3,
      scoreText: B.LAYER_22_COPY3,
      gift: null,
      coin: B.LAYER_23_COPY3,
      rewardText: B.LAYER_22_COPY8,
    },
    {
      bg: B.LAYER_6_COPY3,
      medal: B.LAYER_8_COPY4,
      medalKey: 'up_BR_UI_League_05-4',
      rankText: B.LAYER_9_COPY,
      avatar: B.LAYER_16_COPY4,
      name: B.LAYER_17_COPY4,
      pill: B.LAYER_18_COPY4,
      pillAlpha: 0.55,
      scoreIcon: B.LAYER_19_COPY4,
      scoreText: B.LAYER_22_COPY4,
      gift: null,
      coin: B.LAYER_23_COPY4,
      rewardText: B.LAYER_22_COPY9,
    },  ];
}

/**
 * 저작 텍스트 스타일 미러 — `generated/screens.js` 는 **rect 만** 담고 글자 스타일은 담지
 * 않는다. 그래서 `blank.json` 의 style 값을 여기 옮겨 둔다(좌표는 자동 반영, 스타일은 수동).
 * ⚠️ 에디터에서 글자 크기·외곽선·그림자를 바꾸면 이 표도 같이 고쳐야 한다.
 */
interface TextStyle {
  size: number;
  color: string;
  /** 저작 fontStyle(700/900) → Phaser 굵기. */
  weight: 'bold' | '900';
  stroke: string;
  /** 저작 strokeW — 0 이면 외곽선 없음. */
  strokeW: number;
  /** 저작 shadow(2,2 blur2 검정 40%). */
  shadow: boolean;
  align: 'left' | 'center';
}
const TS: Readonly<Record<string, TextStyle>> = {
  // 진행/시간 영역
  chip: { size: 28, color: '#4e2222', weight: 'bold', stroke: '#5a3210', strokeW: 0, shadow: false, align: 'center' },
  barReward: { size: 36, color: '#ffffff', weight: 'bold', stroke: '#5a3210', strokeW: 2, shadow: true, align: 'center' },
  remain: { size: 28, color: '#ffffff', weight: 'bold', stroke: '#5a3210', strokeW: 0, shadow: false, align: 'center' },
  // 순위 행
  rank: { size: 36, color: '#000000', weight: 'bold', stroke: '#5a3210', strokeW: 0, shadow: false, align: 'center' },
  name: { size: 32, color: '#1a1919', weight: 'bold', stroke: '#5a3210', strokeW: 0, shadow: false, align: 'left' },
  score: { size: 28, color: '#ffffff', weight: 'bold', stroke: '#1a140f', strokeW: 3, shadow: true, align: 'left' },
  reward: { size: 28, color: '#ffffff', weight: 'bold', stroke: '#1a140f', strokeW: 3, shadow: true, align: 'center' },
  // CTA
  cta: { size: 50, color: '#ffffff', weight: '900', stroke: '#5a3210', strokeW: 3, shadow: true, align: 'center' },
};

/**
 * 순위 아트 크기는 **종류마다 다르다** — 메달(05-1~3)은 62×79 세로형, 숫자 명패(05-4)는
 * 77×76 정사각형에 가깝다. 슬롯의 저작 rect 를 그대로 쓰면(슬롯 1~3 은 메달 크기) 명패가
 * 그 안에 눌려 **찌그러진다**(사용자 리포트). 그래서 아트 종류의 저작 크기를 따로 읽어
 * 슬롯 중심에 그린다.
 */
const MEDAL_ART = { w: BD.LAYER_8.w, h: BD.LAYER_8.h };
const PLATE_ART = { w: BD.LAYER_8_COPY3.w, h: BD.LAYER_8_COPY3.h };
/** 명패 위 순위 숫자의 중심 보정 — 저작(layer_9 중심 − layer_8_copy3 중심). */
const RANK_TEXT_DX = BD.LAYER_9.x + BD.LAYER_9.w / 2 - (BD.LAYER_8_COPY3.x + BD.LAYER_8_COPY3.w / 2);
const RANK_TEXT_DY = BD.LAYER_9.y + BD.LAYER_9.h / 2 - (BD.LAYER_8_COPY3.y + BD.LAYER_8_COPY3.h / 2);

/**
 * 행 묶음의 가로 위치는 **저작 그대로** 쓴다(보정 없음).
 *
 * 한때 행 컨테이너를 `layer_4`(목록 영역 배경) 중심으로 되미는 보정이 있었다. 전제는
 * "목록 영역이 곧 정중앙"이었는데 **그 전제가 틀렸다** — layer_4 자체가 저작상 중심에서
 * 왼쪽으로 치우쳐 있다(81‥974, 중심 527.5 / 프레임 중심 540). 그래서 디자이너가 행판을
 * 정확히 가운데(134‥941, 중심 537.5) 맞춰 놓아도 코드가 도로 10px 왼쪽으로 밀어
 * **좌우 여백이 124:139 로 벌어졌다**(사용자 리포트: "정확히 배치했는데 균형이 안 맞는다").
 *
 * 교훈: 저작 배치를 다른 저작 노드에 맞춰 재정렬하지 않는다. 배치가 틀렸다면 고칠 곳은
 * 코드가 아니라 에디터다(CLAUDE.md 규약). 여기서는 저작 좌표를 그대로 신뢰한다.
 */
/** 천 단위 구분(저작 표기 "4,000"). */
function fmtScore(n: number): string {
  return n.toLocaleString('en-US');
}

/** 보상 축약(저작 표기 "200K"/"100"). */
function fmtReward(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export interface LeaguePanelOpts {
  depth: number;
  /** UI 전용 카메라 — 딤이 이 카메라 기준으로 화면 전체를 덮게 한다(홈 화면은 필수). */
  uiCam?: Phaser.Cameras.Scene2D.Camera;
  /** 열자마자 '내 주변' 보기로 시작할지(랭크 버튼 진입). 기본은 상위권. */
  startNearMe?: boolean;
  /** 내 표시 이름 — 저작 목업은 "RYANLOGIC(ME)". */
  myName: string;
  /** 지금 내가 모은 리그 점수. */
  myPoints: number;
  /** 지금 단계가 모으는 층(진행바 아이콘) — 없으면 1층 상품. */
  stageFloor?: number;
  onClose: () => void;
}

export function openLeaguePanel(scene: Phaser.Scene, opts: LeaguePanelOpts): Phaser.GameObjects.Container {
  // ⚠️ 저작 좌표는 캔버스 크기에 맞춘 앵커 변환본을 쓴다(ui/screens) — 직접 LAYOUT 을 잡으면
  //    폭·높이가 늘어난 기기에서 팝업이 좌상단으로 쏠린다.
  const B = LEAGUE_LAYOUT;
  const ROW_SLOTS = rowSlots(B);
  const ui = scene.add.container(0, 0).setDepth(opts.depth);

  // 저작 노드 렌더는 공용 규약 하나로(ui/authoredNodes) — align 기준점·외곽선·그림자 처리 포함.
  const A = authoredNodes(scene, ui);
  const img = (r: Rect, key: string): Phaser.GameObjects.Image => A.img(r, key);
  const text = (r: Rect, value: string, s: TextStyle, target?: Phaser.GameObjects.Container): Phaser.GameObjects.Text =>
    A.txt(r, value, { ...s, weight: s.weight === '900' ? '900' : 'bold' }, target);

  /**
   * ─── 배경 딤 — 팝업 밖 탭으로 닫히지 않게(오탭 방지), 닫기는 ✕ 로만 ───
   *
   * ⚠️ **캔버스 크기로 그리면 안 된다.** 원본은 `rect(W/2, H/2, W, H)` 였는데, 이 게임은 UI 카메라가
   *   세이프존을 중앙정렬하느라 **-오프셋만큼 스크롤**돼 있다. 원점(0,0)에서 시작하면 화면 좌우에
   *   오프셋만큼 띠가 남는다(실측: 넓은 화면에서 좌우가 안 덮임 — 사용자 리포트 2026-08-23).
   *   역오프셋이 적용된 공용 헬퍼를 써야 한다(CLAUDE.md "화면을 꽉 채워야 하는 것" 규약).
   */
  const dim = overlayScrim(scene, 0x061024, 0.62, opts.uiCam);
  ui.add(dim);

  // ─── 프레임·타이틀 — **저작 z 순서 그대로**(크림판 1 → 히어로 2 → 프레임 3 → 배너 4).
  //   컨테이너 자식은 add 순서대로 그려지므로(전 게임 공통 함정) 순서를 바꾸면 프레임의
  //   나무 테두리가 크림판에 덮인다.
  const listBg = scene.add.graphics(); // z=1 목록 배경(저작 color 노드)
  listBg.fillStyle(0xffe8b8, 1);
  listBg.fillRect(B.LAYER_4.x, B.LAYER_4.y, B.LAYER_4.w, B.LAYER_4.h);
  ui.add(listBg);
  img(B.LAYER_3, artOf(B.LAYER_3, 'up_BR_UI_League_03_v2')); // z=2 타이틀 테마(섬/바다)
  img(B.LAYER_1, artOf(B.LAYER_1, 'up_BR_UI_League_02_v2')); // z=3 전체 프레임
  // z=4 TODAY LEAGUE 배너 — 등장 시 창보다 늦게 내려앉는 2차 움직임을 받는다(표시만 하면 된다).
  img(B.LAYER_2, artOf(B.LAYER_2, 'up_BR_UI_League_01_v2')).setName(POPUP_HEADER_NAME);

  // ─── 상단 좌우 보조 버튼(ⓘ 규칙 / 🏆 보상표) ───
  const now = new Date();
  const periodId = periodIdFor(now);
  const progress = periodProgress(now);
  /*
   * **바 = 지금 단계의 진행**(PO 2026-08-24: "1단계 완성 후 2단계 식으로 10단계를 완성하면서 소보상").
   *
   * 플레이 화면 미니 게이지와 **같은 척도**를 쓴다(단계 진행 + 단계 번호) — 두 화면이 다른 숫자를
   * 보여 주면 무엇을 믿어야 할지 알 수 없다. 오른쪽 원판은 **그 단계를 채우면 받는 소보상**이고,
   * 10단계를 다 채우면 그 위에 그랜드 프라이즈가 얹힌다.
   */
  const lgStage = leagueStageOf(loadSave(), now);
  const lgCleared = isLeagueCleared(lgStage.stage);
  const ms = {
    from: 0,
    to: stageGoal(lgStage.stage),
    ratio: lgCleared ? 1 : lgStage.count / Math.max(1, stageGoal(lgStage.stage)),
    reward: lgCleared ? leagueGrandCoins() : stageCoins(lgStage.stage),
  };
  const leagueDone = lgCleared ? ms.to : lgStage.count;

  const infoBtn = img(B.LAYER_7, artOf(B.LAYER_7, 'up_BR_UI_League_06-1')).setInteractive({ useHandCursor: true });
  const helpBtn = img(B.LAYER_7_COPY, artOf(B.LAYER_7_COPY, 'up_BR_UI_League_06-2')).setInteractive({ useHandCursor: true });

  /** 짧은 안내 토스트 — 규칙 설명은 아직 전용 화면이 없다(저작 대기). */
  const toast = (msg: string): void => {
    const t = scene.add
      .text(B.FRAME.w / 2, B.LAYER_4.y - 40, msg, {
        fontFamily: FONT,
        fontSize: '30px',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: 820 },
      })
      .setOrigin(0.5)
      .setStroke('#12243c', 8);
    ui.add(t);
    scene.tweens.add({ targets: t, alpha: 0, delay: 1800, duration: 400, onComplete: () => t.destroy() });
  };
  infoBtn.on('pointerdown', () => {
    sfx('button');
    toast(`매일 자정에 리그가 초기화됩니다.\n플레이 중 🥊 를 모아 순위를 올리세요.`);
  });
  helpBtn.on('pointerdown', () => {
    sfx('button');
    toast(`보상: 1위 200K · 2위 100K · 3위 50K · 4위 10K · 참가 100`);
  });

  // ─── 진행바(현재 구간 → 다음 마일스톤) ───
  img(B.LAYER_5, artOf(B.LAYER_5, 'up_BR_UI_League_04')); // z=5 시간/업그레이드 패널
  // ⚠️ 저작 문구 "10에서 업그레이드" 의 10 = 지금 달성한 마일스톤으로 해석했다(이후 확정 필요).
  /*
   * 칩 문구 — 아직이면 "완주하면 얼마", **완주했으면 다음 할 일**(자정 순위 정산)을 알려 준다.
   *   PO 2026-08-24: "게이지가 완료되었으므로 다음단계가 표시되어야 합니다."
   */
  text(
    B.LAYER_15,
    lgCleared
      ? `완주! 그랜드 프라이즈 ${fmtScore(leagueGrandCoins())} 🪙 + ${leagueGrandDiamonds(periodIdFor(now))} 💎`
      : `${lgStage.stage + 1}단계 / ${LEAGUE_STAGE_COUNT}단계`,
    TS.chip,
  ); // z=6 — 지금 몇 단계인지가 먼저 읽혀야 한다. 다이아는 오늘(periodId) 톱니바퀴 배율 반영.

  // 저작 z 순서 그대로: 바 배경(62) → 채움(63) → 좌측 원형(64) → 🥊(65) → 우측 원형(66)
  //   → 코인(67) → 보상 텍스트(68). 원형을 먼저 그리면 바 배경이 아이콘을 덮는다(사용자 리포트).
  img(B.LAYER_12_COPY2, artOf(B.LAYER_12_COPY2, 'up_BR_UI_League_07-3')); // 바 배경
  /*
   * 바 채움 — **트랙 끝까지** 늘린다(PO 2026-08-24: "100/100인데 잔여 게이지가 표시되고 있습니다").
   *
   * 저작 채움 노드(`LAYER_12_COPY3`, x=373·w=296)는 트랙(`LAYER_12_COPY2`, x=355·w=383)보다 좁아,
   * 100% 로 채워도 오른쪽에 **69px 이 비었다**. 트랙 안쪽(좌우 같은 여백)을 실제로 계산해 쓴다.
   */
  const trackRect = B.LAYER_12_COPY2;
  const barPad = B.LAYER_12_COPY3.x - trackRect.x; // 저작이 준 좌측 여백(=우측도 같게 둔다).
  const fillRect = {
    x: trackRect.x + barPad,
    y: B.LAYER_12_COPY3.y,
    w: Math.max(1, trackRect.w - barPad * 2),
    h: B.LAYER_12_COPY3.h,
  };
  const fill = scene.add
    .image(fillRect.x, fillRect.y + fillRect.h / 2, 'up_BR_UI_League_07-4')
    .setOrigin(0, 0.5)
    .setDisplaySize(Math.max(1, fillRect.w * ms.ratio), fillRect.h);
  ui.add(fill);
  img(B.LAYER_12, artOf(B.LAYER_12, 'up_BR_UI_League_07-1')); // 좌측 원형(아이템 받침)
  /**
   * 좌측 원형 위 = **투데이 리그가 모으는 것 = ⭐별**(PO 2026-08-24).
   * 예전엔 층 상품(빵 등)을 그렸는데, 리그가 세는 것은 별이므로 그림과 실제가 어긋났다
   * (상품은 **주간 이벤트**가 모은다). 보드에 꽂히는 별과 같은 아트를 써서 둘을 잇는다.
   */
  {
    const starKey = 'up_Solitare_UI_02_v2';
    const key = scene.textures.exists(starKey) ? starKey : artOf(B.LAYER_12_COPY4, 'up_BR_UI_League_07-5');
    img(B.LAYER_12_COPY4, key);
  }
  /**
   * **바 위에 달성/목표 숫자**(PO 2026-08-24) — 바 길이만으로는 "얼마 남았는지"를 못 읽는다.
   * 지금 점수와 다음 마일스톤을 그대로 적는다(예: `12 / 20`).
   */
  {
    const done = leagueDone;
    const t = scene.add
      .text(fillRect.x + fillRect.w / 2, fillRect.y + fillRect.h / 2, `${fmtScore(done)} / ${fmtScore(ms.to)}`, {
        fontFamily: FONT,
        fontSize: '30px',
        color: '#ffffff',
        fontStyle: '700',
      })
      .setOrigin(0.5)
      .setStroke('#1d3f6b', 7);
    ui.add(t);
  }
  img(B.LAYER_12_COPY, artOf(B.LAYER_12_COPY, 'up_BR_UI_League_07-2')); // 우측 원형(보상 받침)
  /*
   * 보상 원판 — **코인 아이콘을 키우고 금액을 그대로 적는다**(PO 2026-08-24).
   *   축약 표기(`20K`)는 "정확히 얼마인지"를 감춰 결제 판단에 방해가 된다. 원본 비율을 지키면서
   *   저작 사각형보다 크게 그린다(가로만 키우고 세로는 텍스처 비율로 계산 — 찌그러뜨리지 않는다).
   */
  {
    const c = B.LAYER_20;
    /*
     * 게이지 끝 보상 = **이 게임의 골드 코인**(PO 2026-08-24: "별표코인이 아니라 이 게임코인 이미지").
     *   `up_BR_UI_League_09-2` 는 이식해 온 펌프러시의 별 코인이라 이 게임 헤더의 코인과 달랐다.
     */
    const key = scene.textures.exists(COIN_ICON_KEY) ? COIN_ICON_KEY : artOf(c, 'up_BR_UI_League_09-2');
    if (scene.textures.exists(key)) {
      const src = texSize(scene.textures.get(key));
      const w = c.w * 1.34;
      const o = scene.add
        .image(c.x + c.w / 2, c.y + c.h / 2, key)
        .setDisplaySize(w, w * (src.height / src.width))
      ui.add(o);
    }
  }
  text(B.LAYER_21, ms.reward.toLocaleString(), TS.barReward);
  // ─── 남은 시간 ───
  img(B.LAYER_13, artOf(B.LAYER_13, 'up_BR_UI_League_07-6'));
  const remainText = text(B.LAYER_14, formatRemain(msUntilDailyReset(new Date())), TS.remain);
  const tick = scene.time.addEvent({
    delay: 30_000,
    loop: true,
    callback: () => {
      if (remainText.active) remainText.setText(formatRemain(msUntilDailyReset(new Date())));
    },
  });
  ui.once('destroy', () => tick.remove());

  // ─── 순위 5행 ───
  // 매칭 그룹 = 계정 레벨 — 레벨이 오르면 더 높은 점수대의 무리와 붙는다.
  const standing = standings(periodId, opts.myPoints, progress, opts.myName, profileOf(loadSave()).avatar);
  /** '상위권' ↔ '내 주변' 두 가지 보기 — 저작 행이 5개뿐이라 페이지 대신 관점 전환. */
  let nearMe = opts.startNearMe ?? false;
  const rowLayer = scene.add.container(0, 0); // 저작 좌표 그대로(보정 없음 — 위 주석 참조)
  ui.add(rowLayer);

  const visibleRows = (): readonly LeagueRow[] => {
    if (!nearMe) return standing.rows;
    // 내 주변 — 내 순위를 가운데 두고 위아래로 채운다(끝에서는 안쪽으로 밀어 넣는다).
    const all = standing.allRows;
    const half = Math.floor(LEAGUE_VISIBLE_ROWS / 2);
    const start = Math.min(Math.max(0, standing.myRank - 1 - half), Math.max(0, all.length - LEAGUE_VISIBLE_ROWS));
    return all.slice(start, start + LEAGUE_VISIBLE_ROWS);
  };

  const renderRows = (): void => {
    rowLayer.removeAll(true);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      rowLayer.add(o);
      return o;
    };
    visibleRows().forEach((row, i) => {
      const slot = ROW_SLOTS[i];
      if (!slot) return;
      add(scene.add.image(slot.bg.x + slot.bg.w / 2, slot.bg.y + slot.bg.h / 2, 'up_BR_UI_League_05').setDisplaySize(slot.bg.w, slot.bg.h));

      // 순위 — 1~3위는 메달 아트, 그 밖은 숫자 명패 + 숫자.
      //   아트마다 저작 크기가 달라(메달 62×79 / 명패 77×76) **슬롯 rect 에 맞춰 늘이지 않고**
      //   아트 고유 크기로 슬롯 중심에 그린다(찌그러짐 방지 — 사용자 리포트).
      const isMedal = row.rank <= 3;
      const art = isMedal ? MEDAL_ART : PLATE_ART;
      const cx = slot.medal.x + slot.medal.w / 2;
      const cy = slot.medal.y + slot.medal.h / 2;
      const medalKey = isMedal ? `up_BR_UI_League_05-${row.rank}` : 'up_BR_UI_League_05-4';
      add(scene.add.image(cx, cy, medalKey).setDisplaySize(art.w, art.h));
      if (!isMedal) {
        // 숫자 위치 = 명패 중심 + 저작 보정(layer_9 ↔ layer_8_copy3 중심 차).
        add(
          scene.add
            .text(cx + RANK_TEXT_DX, cy + RANK_TEXT_DY, String(row.rank), {
              fontFamily: FONT,
              fontSize: `${TS.rank.size}px`,
              color: TS.rank.color,
              fontStyle: 'bold',
            })
            .setOrigin(0.5),
        );
      }

      // 프로필 · 이름
      const av = slot.avatar;
      const avKey = `up_BR_UI_Profile_00${Math.min(5, Math.max(1, row.avatar))}`;
      add(scene.add.image(av.x + av.w / 2, av.y + av.h / 2, avKey).setDisplaySize(av.w, av.h));
      text(slot.name, row.name, TS.name, rowLayer);

      // 점수 알약(저작 rect) + 아이템 아이콘 + 점수
      const p = slot.pill;
      const g = scene.add.graphics();
      g.fillStyle(0x5b8cff, row.isMe ? 0.55 : slot.pillAlpha);
      g.fillRoundedRect(p.x, p.y, p.w, p.h, p.h / 2);
      g.lineStyle(2, 0xffffff, 0.9);
      g.strokeRoundedRect(p.x, p.y, p.w, p.h, p.h / 2);
      add(g);
      /**
       * 점수는 **숫자만** 표시한다(PO 2026-08-23). 저작에는 행마다 아이템 아이콘이 붙어 있었지만,
       * 단계마다 상품이 바뀌는 구조에서는 그 아이콘이 "누구의 무엇"인지 가리키지 못해 노이즈가 된다.
       * 아이콘 자리까지 숫자 칸으로 합쳐 읽기 쉽게 만든다.
       */
      const si = slot.scoreIcon;
      const st = slot.scoreText;
      const merged = { x: si.x, y: st.y, w: st.x + st.w - si.x, h: st.h };
      text(merged, fmtScore(row.points), TS.score, rowLayer);

      // 보상 — 상위 3위는 선물상자도 함께.
      if (row.gift && slot.gift) {
        const gf = slot.gift;
        add(scene.add.image(gf.x + gf.w / 2, gf.y + gf.h / 2, 'up_BR_UI_League_09-1').setDisplaySize(gf.w, gf.h));
      }
      const c = slot.coin;
      add(scene.add.image(c.x + c.w / 2, c.y + c.h / 2, 'up_BR_UI_League_09-2_v2').setDisplaySize(c.w, c.h));
      text(slot.rewardText, fmtReward(row.reward), TS.reward, rowLayer);

      // 내 행 강조(저작 핑크 테두리) — 어느 슬롯에 오든 따라간다.
      if (row.isMe) {
        const hl = scene.add.graphics();
        hl.lineStyle(5, 0xfe0bea, 1);
        const hr = B.LAYER_11;
        hl.strokeRoundedRect(hr.x, slot.bg.y + (hr.y - B.LAYER_6_COPY3.y), hr.w, hr.h, 16);
        add(hl);
      }
    });
  };
  renderRows();

  // ─── 리그보기(보기 전환) · 닫기 ───
  const cta = img(B.LAYER_10, artOf(B.LAYER_10, 'up_BR_UI_League_08')).setInteractive({ useHandCursor: true });
  const ctaText = text(B.LAYER_24, '리그보기', TS.cta);
  cta.on('pointerdown', () => {
    sfx('button');
    nearMe = !nearMe;
    ctaText.setText(nearMe ? '상위권' : '리그보기');
    renderRows();
  });

  const close = img(B.LAYER_25, artOf(B.LAYER_25, 'up_BR_UI_League_10')).setInteractive({ useHandCursor: true });
  close.on('pointerdown', () => {
    sfx('button');
    opts.onClose();
  });

  // 살짝만 일렁이며 등장(PO 2026-08-24) — 큰 팝업보다 약하게.
  popupSubtleIn(scene, dim, ui, { x: B.FRAME.w / 2, y: B.FRAME.h / 2 });
  return ui;
}
