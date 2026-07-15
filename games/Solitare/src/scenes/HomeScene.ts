/**
 * HomeScene — 타워(건설 모델).
 *
 * 게임 모델: 솔리테어를 플레이해 **코인**을 벌고, 그 코인으로 타워의 **다음 층을 건설**한다.
 *   (층 클리어 → 자동 다음 층이 아니라, 코인 축적 → 건설로 위로 쌓아 올린다.)
 *   · 건설된 층(1..builtFloors) = 탭하면 플레이(코인 획득)
 *   · 다음 층 = "🔨 건설" 버튼(비용 표시), 코인 충분하면 건설
 *   · 미건설 상층 = 흐린 실루엣
 *
 * 배경/타워 배치는 에디터(home.json) SSOT. 없으면 코드 드로우 플레이스홀더.
 * ⚠️ HD(1080×2400) — 절대 좌표(순수 FIT 1:1).
 */
import Phaser from 'phaser';
import { loadGameAssets, UI_HOME_KEY, UI_ENTRY_KEY, BACK_BG_KEY, floorArtKey } from '../assets.js';
import { buildLayout, LayoutIndex, type LayoutDoc, type LayoutEntry } from '../ui/layoutLoader.js';
import { preloadCustomers, registerCustomerFrames, startCustomerVisits, type CustomerSpot } from './customers.js';
import { buildTopHeader, type TopHeader } from './topHeader.js';
import { preloadClouds, startCloudDrift } from './clouds.js';
import { startRoadsTraffic, type CarTrafficOpts } from './cars.js';
import { addContactShadow } from './shadows.js';
import { FLOORS, TOTAL_LEVELS, editorLevelCount } from '../logic/levels.js';
import type { CardBoardDoc } from '../logic/editorLevels.js';
import { loadSave, writeSave, resetProgress, FLOOR_COST, MAX_FLOORS, GAME_FEE, diamondCostFor, floorLevelReq, type SaveData } from '../save.js';
import { preloadAudio, playBgm, sfx, setMuted, isMuted } from '../audio.js';

/** 층 아트 텍스처 키(…_BG_01..05, 뒤에 _v2 같은 버전 접미사 허용). 배경(…_BG_Back01)·지붕(…_BG_roof)·유리는 제외. */
const FLOOR_KEY_RE = /_BG_0[1-5](?:_v\d+)?$/;

/** 에디터 저작 레벨 팩(public/levels/cardLevels.json) — PlayScene 과 동일 키. */
const EDITOR_PACK_KEY = 'editorLevelPack';

const W = 1080;
const H = 2400;

/**
 * 빌드 버전 라벨 — 홈 화면 우하단에 항상 표시.
 *   dev 서버에서 "지금 뜬 게 방금 고친 버전인지" 즉시 확인용. 변경할 때마다 손으로 올린다.
 *   card1.2 = PlayScene computeGeom 카드 크기 상한(scale cap) 값.
 */
const BUILD_VERSION = 'v7.8 · 다이아(헤더)·게임비팝업·건물다이아비용(10·12·15…)·아이템샵·재화재설정';

const FLOOR_SCALE = 0.72;
const OVERLAP = 46;
const BASE_Y = 2190;

// ── 크레인 · 타워건설 연출 ────────────────────────────────────────────────
// home.json 엔 크레인 노드가 없어 코드로 올린다(레이아웃에 Crane 노드가 있으면 그걸 재사용).
const CRANE_KEY = 'up_Slitare_BG_Crane_v6'; // 매니페스트(ui-assets.json)로 항상 로드됨.
const CRANE_CX = 716; // 크레인 중심 x(디자인) — home_copy 저작 크레인과 동일(마스트 우측·지브 좌측 건물 위).
const CRANE_CY = 642; // 크레인 중심 y.
const CRANE_W = 793; // 크레인 표시 폭(높이는 원본 비율).
// **중경(depth 6) 앞 · 층 아트(depth 9+) 뒤** — 중경 건물이 크레인을 가리지 않도록 6 위로,
//   층/지붕(9~22)보다는 아래라 마스트가 건물 뒤에 서고 지브만 지붕 위로 보인다. (직전 5 → 중경 6 에 가려짐)
const CRANE_DEPTH = 7;
const CABLE_DEPTH = 40; // 케이블은 최상단(층·지붕) 앞에서 보이게 — 리프팅 연결 가시화.
const HOOK_RATIO = { x: 0.277, y: 0.466 }; // 크레인 이미지 내 고리(케이블 끝) 위치 비율 — PNG 실측(가장 깊게 매달린 블록).
const CABLE_COLOR = 0x101010; // 약간 굵은 검은 케이블.
const CABLE_W = 7;
const LIFT_HOOK = 320; // 건설 시 고리를 새 층 최종 중심보다 이만큼 위에 둔다(크레인이 위에서 내림). ↓=크레인 더 아래.
const FLOOR_LIFT = 200; // 새 층이 최종 위치보다 이만큼 위에서 시작해 낙하(쿵). 크레인 고리 아래로 유지(케이블 정상). ⚠️세밀조정 대상.
const DYN_FLOOR_OVERLAP = 30; // 동적 층(4층+)이 **바로 아래층 상단을 침범**하는 양(px). 값↓=4층이 더 위로(겹침↓·틈 방지). ⚠️튜닝.
const INITIAL_OWNED = 1; // **초기 소유 층수(1층만 소유)** — 2층은 건설돼 있으나 미소유 → 점포매입.
const HEADER_MARGIN = 240; // 상단 여백 — 최상단까지 스크롤했을 때 건설 버튼이 헤더 아래로 내려와 보이게.
const MAX_TOP_MARGIN = 520; // **최상층(10) 완공** 시 지붕 위 여백 — 헤더와 겹치지 않게 하늘 공간을 넉넉히.
const BOTTOM_SAFE = 30; // 하단 여백 — 뷰 하단이 근경(지면) 안쪽에 머물게(끝선 안 보이게).
const LOT_DX = 1080; // **두 번째 부지(우측 타워) 가로 오프셋** = 한 화면. 지면(도로/중경 복사)이 이미 우측을 덮음.
const LOT2_CX = W / 2 + LOT_DX; // 두 번째 타워(우측 부지) 중심 x(1620).
const LOT1L_CX = W / 2 - LOT_DX; // **좌측 부지** 중심 x(-540) — 좌로 한 화면 팬하면 중앙에 온다.
// **좌측 공공건물 타워** — 메인타워 왼쪽 부지(LOT1L_CX)에 공공건물 5개를 기존 타워 방식으로 **프리빌트**(항상 완공 상태).
const OFFICE_FLOORS = 3; // 공공건물 층 수 — **초기 릴리스는 3층까지만**(이후 5층으로 업그레이드 예정). 아트는 5개 준비됨.
const OFFICE_CX = LOT1L_CX; // 좌측 부지 중심(-540).
const UI_OFFICE_KEY = 'ui_office'; // 공공건물 에디터 저작 레이아웃(home_copy2.json) — 관리자 캐릭터 배치 좌표 소스.

/** 사이드 부지 1개. cx=부지 중심 x, ruinKey=폐건물 텍스처(**고유·중복금지**), saveKey=저장키. */
interface SideLot {
  cx: number;
  ruinKey: string; // 폐건물 텍스처(코드 선배치).
  saveKey: string;
  hintText: string;
  hintX: number;
  built: boolean;
  demolished: boolean; // 철거 완료(빈 부지, 1층 미건설).
  ruin?: Phaser.GameObjects.Image; // 코드로 생성한 폐건물.
  forSale?: Phaser.GameObjects.Image; // 폐건물 앞 'FOR SALE' 표지판(건설/철거 시 제거).
  sign?: Phaser.GameObjects.Image; // 폐건물 상단 간판(UI_25, 건물 뒤 레이어) — 잠금/구입 메시지 판.
  signMsg?: Phaser.GameObjects.Text | Phaser.GameObjects.Container; // 간판 위 메시지(단문=Text / 제목+설명 2단=Container).
  signOverride?: string; // 이 부지 고유 간판 문구(잠금/구입 문구 대신 항상 표시) — 예: 고수익 경쟁 부지 안내.
  floor?: { img: Phaser.GameObjects.Image; char?: Phaser.GameObjects.Image };
  btn?: Phaser.GameObjects.Container;
  hint?: Phaser.GameObjects.Text;
  stage: number; // 손님 스팟 stage id(중복 방지).
}
const RUIN_W = 760; // 폐건물 표시 폭(공통) — 높이는 텍스처 비율 보존.
const GROUND_Y = 2221; // 지면(1층 건물 밑면) — 폐건물 밑면을 여기에 맞춘다.
const RUIN_DEPTH = 40; // 폐건물 depth — 프롭/1층(≤18) 앞, 근경 차(51) 뒤(부지의 주요 건물).
const FOR_SALE_VARIANTS = 3; // 'FOR SALE' 표지판 변형 수(UI_24-1~3) — 부지별 순환 배치.
const FOR_SALE_BOX = 230; // 표지판 최대 표시 박스(정사각) — 세로/가로 변형 모두 비율 보존해 이 안에 맞춤.
const FOR_SALE_DEPTH = RUIN_DEPTH + 1.5; // 폐건물 바로 앞(지면 표지판) — 근경 차보다는 뒤.
// **폐건물 상단 간판**(UI_25-1~3) — 지붕 위 하늘 영역에 걸린 장식 간판(잠금/구입 메시지). **건물 뒤 레이어**라
//   간판 하단이 지붕 꼭대기·박공(dormer) 뒤로 겹쳐 "지붕에 얹혀 하늘로 솟은" 느낌(사용자 지정 배치 위치).
const LOT_SIGN_W = Math.round(RUIN_W * 0.9); // 간판 표시 폭 = **건물 지붕 폭**(지붕이 건물 상단 가로를 거의 다 덮음).
const LOT_SIGN_DEPTH = RUIN_DEPTH - 2; // **건물 뒤** — 지붕/박공이 간판 하단을 덮어 지붕 위로 솟은 부분만 보인다.
const LOT_SIGN_OVERLAP = 118; // 간판 하단(다리)이 지붕 꼭대기 뒤로 겹치는 양 — 다리가 지붕 기와에 닿도록 더 아래로 내림.
const LOT_SIGN_TEXT_DEPTH = 62; // 간판 메시지(간판 위·항상 최상단).
// **중경 패럴랙스 계수**(applyParallax·중경 도로 통행 공용) — 가로는 근경보다 느리게(붙어 이동 방지),
//   세로는 미세하게만(근경 침범 방지). 중경 도로에 얹는 자동차도 이 계수로 동기화한다.
const PARALLAX_MID_X = 0.72;
const PARALLAX_MID_Y = 0.94;
// 중경(뒤쪽) 도로 차량 depth = **9** — 정확한 레이어링:
//   · 먼 배경 건물(중경 depth 6·8, 화면 우측 절반을 덮음) **앞** → 타워 뒤를 지나 **반대편에서 다시 나타나** 끝까지 이동.
//   · 도로변 가로등(depth 10·11)·타워 건물(18) **뒤** → 소품/타워 **앞쪽으로 튀어나오지 않고** 그 뒤로 지나감.
//   (소화전·화분은 y≥1965로 차 Y(1823~1937)와 안 겹쳐 무관. 차보다 위 겹침은 가로등뿐 → 얇아 노출 충분.)
const MID_ROAD_CAR_DEPTH = 9;
const LOT2_FLOOR_W = 858; // 스테이지2 층 폭(타워1과 동일).
const LOT2_FLOOR_H = 513; // 스테이지2 층 높이.
const LOT2_FLOOR1_Y = 1965; // 스테이지2 1층 중심 y(타워1 1층과 동일 지면).
const LOT2_ROOF_W = 849;
const LOT2_ROOF_H = 298;
const LOT2_ROOF_OVERLAP = 24; // 지붕이 최상층을 너무 가리지 않게 위쪽 배치(겹침 최소). ⚠️튜닝.
const TOWER_ROOF_ATTACH = 22; // 메인 타워 지붕을 최상층에 붙이는 추가 겹침(간격 제거). ⚠️튜닝.
const LOT2_SMALL_OVERLAP = 16; // 층 간 겹침(px) — 작게 유지하되 아트 투명 여백(하단 ~5px)을 덮어 틈이 안 보이게. **양 스테이지 공통**. ⚠️튜닝.
const FLOOR_DEPTH_BASE = 10; // 1층 depth 기준(배경 1~7 위). **양 스테이지 공통 논리적 레이어**.
const FLOOR_DEPTH_STEP = 3; // 층당 depth 증가(위층일수록 앞).
// **계속하기(플레이) 버튼**을 최상단 건설 층 중심 아래로 내려 **전면 발코니(테라스)**에 앉히는 비율(층높이 대비).
const CONTINUE_FLOOR_OFFSET = 0.30;
// 계속하기 버튼 depth = 그 층 depth + 이 값(손님 코인 floorDepth+50 위로 확실히).
const CONTINUE_DEPTH_LIFT = 60;

// ── 점포(층) 코인 누적 → 말풍선 수령 ─────────────────────────────────────
const FLOOR_COIN_GOAL = 100; // 이 값(100) 누적 시 점원 위 말풍선(수령 대기) + **상한 고정(수령 전까지 정지)**.
// **상점(층)별 손님 방문 수익** — 상점마다 수익성이 다르다: 고층(건설비 비싼 고급 상점)일수록 방문 1회 수익↑.
//   [1층 2 … 10층 15] — 기존 일률(3~4)을 대체. 고층은 은행(100) 이 빨리 차 수령 빈도도 높아진다.
const FLOOR_VISIT_YIELD = [0, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15] as const;
const visitYieldFor = (floor: number): number => FLOOR_VISIT_YIELD[((floor - 1) % 10) + 1];
// 사이드 부지(단층 파일럿 상점) 수익 — 부지(stage)마다 다르게.
const SIDE_LOT_YIELD: Record<number, number> = { 4: 5, 5: 7, 6: 9 };
const CLAIM_BUBBLE_KEY = 'up_Solitare_UI_11'; // 말머리 풍선(주문 말풍선 재사용).
const CLAIM_COIN_KEY = 'up_Solitare_UI_2-3'; // 말풍선에 띄울 코인 아이콘.
const CUST_COIN_SPIN = 'custCoinSpin'; // 손님 드랍과 동일한 스핀 코인 애니 키(customers.ts).
// **코인 저장소(상단 헤더 코인 카운터)** 화면 좌표 — 코인 샤워가 빨려드는 목표(topHeader 코인값 근처).
const HEADER_COIN_X = 330;
const HEADER_COIN_Y = 88;
const MICRO_ZOOM_OUT_MAX = 0.06; // 스크롤 중 미세 줌아웃 최대치(직전 0.13 → 축소: 배경 하단 노출 폭↓·연출은 유지).
// **카메라가 도달하는 가장 깊은 줌아웃**(건설 연출 포함) — 원경/도로 하단 커버 계산의 기준.
//   스크롤 미세줌(0.94)보다 건설 연출 줌아웃이 더 깊으므로, 그 값을 여기로 통일하고 건설도 이 값을 쓴다.
const MIN_CAMERA_ZOOM = 0.9;
// ── 타워 스크롤 감촉(부드러움/가속도) ──────────────────────────────────
//   드래그: 손가락을 1:1로 딱 붙어 따라가는 대신 **목표(target)로 부드럽게 수렴**해 미세한 지연=가속/감속감을 준다.
//   릴리스: 관성으로 길게 미끄러지다(SCROLL_FRICTION) 정지 직전 부드럽게 감속(SETTLE_FOLLOW).
const DRAG_FOLLOW = 0.4; // 드래그 중 목표 추종 비율(1=즉시·딱딱, 낮을수록 부드러운 지연)
const SETTLE_FOLLOW = 0.16; // 관성/정지 시 목표 수렴 비율(감속 마무리)
const SCROLL_FRICTION = 0.955; // 관성 감속 계수(1에 가까울수록 더 오래 미끄러짐 = 관성↑)
/** 층 번호 → 2자리 zero-pad("01".."10"). 층별 지정 아트/점원 키(up_Slitare_BG_NN·up_Solirare_Chr_NN)용. */
const pad2 = (n: number): string => String(n).padStart(2, '0');
// **데모(연출 미리보기) 모드** — 4층 배치 버튼을 눌러도 코인 차감·영구저장 없이 연출만 재생하고 3층으로 리셋.
//   반복해서 건설 연출만 확인하기 위한 임시 모드. 실제 건설로 전환하려면 false.
const DEMO_CONSTRUCTION = true;

/** 진입 팝업(blank.json) 노드 — layoutLoader 의 LayoutNode 상위집합(텍스트 그림자 포함). */
interface EntryNode {
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
interface EntryDoc {
  readonly frame: { designW: number; designH: number };
  readonly nodes: ReadonlyArray<EntryNode>;
}
// 층 파사드의 **시각 모서리**(이미지 좌우/상하 여백 보정) — 노드 중심 대비 비율. ⚠️세밀조정 대상.
const BLD_HALF = 0.42; // 상단/하단 모서리 x = 중심 ± w×0.42.
const BLD_TOP = 0.3; // 상단 모서리 y = 중심 − h×0.30.
const BLD_BOT = 0.34; // 하단 모서리 y = 중심 + h×0.34.

export class HomeScene extends Phaser.Scene {
  constructor() {
    super('home');
  }

  // 타워/크레인 연출 상태(에디터 레이아웃 경로에서만 채워짐).
  private layoutIdx?: LayoutIndex;
  private towerFloors: LayoutEntry[] = [];
  private officeFloors: Phaser.GameObjects.Image[] = []; // 좌측 공공건물 타워 5층(프리빌트) — 세로 스크롤 상한 산출용.
  private craneImg?: Phaser.GameObjects.Image;
  private craneIsLayout = false; // 크레인이 에디터 레이아웃 노드면 true → 그 위치(아래층에 붙인 위치) 그대로 사용.
  private cablesGfx?: Phaser.GameObjects.Graphics;
  private buildBtn?: Phaser.GameObjects.Text;
  private buildStoreBtn?: Phaser.GameObjects.Image; // 에디터 저작 4층 건축 버튼(연출 중·매입 전 숨김).
  private buildStoreLabel?: Phaser.GameObjects.Text; // 그 버튼의 라벨(같이 숨김).
  /** 계속하기(플레이) 버튼 + '계속하기' 타이틀 + 레벨 라벨(최상단 건설 층에 배치) + 각 상대 오프셋. */
  private continueBtn?: Phaser.GameObjects.Image;
  private continueTitle?: Phaser.GameObjects.Text;
  private continueLabel?: Phaser.GameObjects.Text;
  private continueTitleDX = 0;
  private continueTitleDY = -15;
  private continueLabelDX = 0;
  private continueLabelDY = 27;
  private constructing = false;
  /** 층별 장식(유리/캐릭터) 오브젝트 — 건설 연출이 해당 층의 장식만 등장시키도록. */
  private floorDecor = new Map<number, { glass?: Phaser.GameObjects.Image; char?: Phaser.GameObjects.Image }>();
  /** UI 전용 카메라(줌·스크롤 없음) — 월드(타워)만 줌/스크롤하고 HUD 는 고정 크기로. */
  private uiCam?: Phaser.Cameras.Scene2D.Camera;
  /** UI 오브젝트(헤더·레일·버전·건설버튼 등) — uiCam 만 렌더, mainCam 은 무시. */
  private uiObjects: Phaser.GameObjects.GameObject[] = [];
  private homeHeader?: TopHeader; // 공통 상단 헤더(코인·다이아) — 갱신용.
  // 위아래 드래그 스크롤 + **관성(가속도)** 상태.
  private scrollOn = false;
  private scrollDragging = false;
  private scrollVel = 0;
  private scrollTargetY = 0; // 드래그/관성이 갱신하는 세로 목표 — 카메라가 부드럽게 수렴.
  private scrollTargetX = 0; // 좌우 목표(부지 팬).
  private scrollMin = 0;
  private scrollMax = 0;
  // **수평 스크롤**(부지 확장) — 타워1(scrollX=0) ↔ 우측 부지/타워2(scrollX=LOT_DX).
  private scrollMinX = 0;
  private scrollMaxX = 0;
  private scrollVelX = 0;
  // 좌우 스테이지 이동 화살표(디자이너 배치 UI 노드 layer_17/17_copy) — 해당 방향 스테이지가 없으면 숨김.
  private leftArrow?: Phaser.GameObjects.Image;
  private rightArrow?: Phaser.GameObjects.Image;
  private lot2Built = false; // 두 번째 부지 1층 건설 여부(=스테이지2 시작).
  private lot2Btn?: Phaser.GameObjects.Container; // 부지 구입·1층 건설 버튼.
  private lot2Hint?: Phaser.GameObjects.Text; // '새 부지 →' 힌트.
  // **스테이지 2 타워**(우측 부지) — 코드 구동. 층 아트=up_Slitare_BG_02_NN, 점원=up_Solirare_Chr_02_NN.
  private lot2Floors = 0; // 건설된 스테이지2 층 수.
  private lot2FloorObjs = new Map<number, { img: Phaser.GameObjects.Image; char?: Phaser.GameObjects.Image; glass?: Phaser.GameObjects.Image }>();
  private lot2Roof?: Phaser.GameObjects.Image; // 스테이지2 지붕(최상층 위).
  private lot2BuildBtn?: Phaser.GameObjects.Container; // 스테이지2 'N층 건설' 버튼.
  private lot2Ruin?: Phaser.GameObjects.Image; // 우 내측 부지 폐건물(코드 선배치).
  private lot2ForSale?: Phaser.GameObjects.Image; // 우 내측 폐건물 앞 'FOR SALE' 표지판.
  private lot2Sign?: Phaser.GameObjects.Image; // 우 내측 폐건물 상단 간판(UI_25).
  private lot2SignMsg?: Phaser.GameObjects.Text | Phaser.GameObjects.Container; // 우 내측 간판 메시지.
  private ruinTopRatioCache = new Map<string, number>(); // 폐건물 텍스처별 **실제 지붕(불투명 최상단) 비율**(0..1) 캐시 — 간판을 상단 투명여백 아닌 실지붕에 얹기 위함.
  // **사이드 부지들**(좌 내/외 · 우 외 — 폐건물 철거→1층 파일럿). 우 내(lot2)는 다층 시스템 별도.
  private sideLots: SideLot[] = [];
  private scrollBaseZoom = 1; // 스크롤 미세 줌 기준(원래 줌=1). 이동 시 축소→멈추면 원복.
  private prevScrollY = 0; // 직전 프레임 scrollY — 실제 이동량(속도) 산출용(미세 줌).
  private atMaxFloor = false; // 최상층(10) 완공 상태 — 최상단 여백을 크게(공간 확보).
  private justBuiltLevel = 0; // 직전에 건설한 층 — 프레이밍을 그 층에 맞춘다(0=없음).
  private builtFloors = 3; // **건설된(보이는) 층 수(제자리 진행)** — 재시작 없이 finishConstruction 에서 증가.
  private ownedFloors = 1; // **소유한 층 수** — 건설됐지만 미소유 층은 점포매입 대상. 매입/건설 시 증가.
  private customerActive = new Set<string>(); // 손님 시트 중복 방지 공유 셋(동적 층 추가 시에도 공유).
  private customerSpots: CustomerSpot[] = []; // **라이브** 손님 스팟 배열 — 랜덤 스포너가 참조, 건설 시 push.
  // **점포 코인 누적**: 층→누적코인(세이브 미러) + 층→수령 말풍선 오브젝트(중복 방지·정리).
  private floorBanks = new Map<number, number>();
  private floorClaimBubbles = new Map<number, Phaser.GameObjects.GameObject[]>();

  preload(): void {
    loadGameAssets(this);
    preloadAudio(); // 사운드팩(m4a) 미리 디코드 + 첫 제스처 BGM 훅.
    preloadCustomers(this); // 점포 방문 손님 시트(10종).
    preloadClouds(this); // 하늘 구름 3종.
    // 에디터 저작 레벨 팩(배포 시 번들). 없어도 무방(dev 는 localStorage 공유).
    this.load.json(EDITOR_PACK_KEY, 'levels/cardLevels.json');
    // 층 건물 아트를 확실히 선로딩(매니페스트 타이밍과 무관하게) → 색상 사각형 폴백 방지.
    for (let i = 1; i <= TOTAL_LEVELS; i++) {
      const k = floorArtKey(i);
      if (!this.textures.exists(k)) this.load.image(k, `ui/uploads/up_Solitaire_BG_0${i}.png`);
    }
    // **스테이지 2 타워 아트/점원**(우측 부지) — 층 1~10 서로 다른 건물 + 점원.
    for (let i = 1; i <= MAX_FLOORS; i++) {
      const f = pad2(i);
      for (const k of [`up_Slitare_BG_02_${f}`, `up_Solirare_Chr_02_${f}`]) {
        if (!this.textures.exists(k)) this.load.image(k, `ui/uploads/${k}.png`);
      }
    }
    // **철거 연출 에셋**(Destroy_01~05) — 01 철구·02 착암기·03 해머·04 먼지+잔해·05 먼지+구멍.
    for (let i = 1; i <= 5; i++) {
      const k = `up_Destroy_0${i}`;
      if (!this.textures.exists(k)) this.load.image(k, `ui/uploads/${k}.png`);
    }
    // **폐건물 6종**(Ruin_01~06) — 매니페스트엔 01·05만 있어 나머지도 코드로 선로딩(부지별 고유 텍스처).
    for (let i = 1; i <= 6; i++) {
      const k = `up_Slitare_BG_Ruin_0${i}`;
      if (!this.textures.exists(k)) this.load.image(k, `ui/uploads/${k}.png`);
    }
    // **건설 연출 에셋**(Const) — 01 톱·04 흙손·07 판자·09/10 벽돌·14 붓.
    for (const n of ['01', '04', '07', '09', '10', '14']) {
      const k = `up_Const_${n}`;
      if (!this.textures.exists(k)) this.load.image(k, `ui/uploads/${k}.png`);
    }
    // **다이아·코인 아이콘** + **아이템샵** 패널 + **와일드**(진입 팝업 아이템 슬롯).
    if (!this.textures.exists('up_Solitare_UI_2_2')) this.load.image('up_Solitare_UI_2_2', 'ui/uploads/up_Solitare_UI_2_2.png');
    if (!this.textures.exists('up_Solitare_UI_2_3')) this.load.image('up_Solitare_UI_2_3', 'ui/uploads/up_Solitare_UI_2_3.png');
    if (!this.textures.exists('up_Solitare_UI_ItemShop')) this.load.image('up_Solitare_UI_ItemShop', 'ui/uploads/up_Solitare_UI_ItemShop.png');
    if (!this.textures.exists('up_Solitare_UI_08')) this.load.image('up_Solitare_UI_08', 'ui/uploads/up_Solitare_UI_08.png');
    if (!this.textures.exists('up_Solitare_UI_02_v2')) this.load.image('up_Solitare_UI_02_v2', 'ui/uploads/up_Solitare_UI_02_v2.png'); // 별(진입 팝업).
    // **점포 코인 수령 말풍선** — 말머리 풍선(UI_11) + 코인 아이콘(UI_2-3).
    if (!this.textures.exists(CLAIM_BUBBLE_KEY)) this.load.image(CLAIM_BUBBLE_KEY, 'ui/uploads/up_Solitare_UI_11.png');
    if (!this.textures.exists(CLAIM_COIN_KEY)) this.load.image(CLAIM_COIN_KEY, 'ui/uploads/up_Solitare_UI_2-3.png');
    // **좌측 공공건물 타워** — 공공건물 아트 + 관리자(officer) 캐릭터 + 저작 레이아웃(캐릭터 배치 좌표).
    for (let i = 1; i <= OFFICE_FLOORS; i++) {
      const b = `up_Slitare_Office_${pad2(i)}`;
      if (!this.textures.exists(b)) this.load.image(b, `ui/uploads/${b}.png`);
      const c = `up_Solirare_Officer_${pad2(i)}`;
      if (!this.textures.exists(c)) this.load.image(c, `ui/uploads/${c}.png`);
    }
    this.load.json(UI_OFFICE_KEY, 'ui/layouts/home_copy2.json'); // 관리자 배치 좌표(빌딩 대비 상대).
    // **구입 가능한 폐건물** — 앞 'FOR SALE' 표지판(UI_24-1~3) + 상단 간판(UI_25-1~3, 잠금/구입 메시지). 부지별 변형·건설 시 삭제.
    for (let n = 1; n <= FOR_SALE_VARIANTS; n++) {
      const k24 = `up_Solitare_UI_24-${n}`;
      if (!this.textures.exists(k24)) this.load.image(k24, `ui/uploads/${k24}.png`);
      const k25 = `up_Solitare_UI_25-${n}`;
      if (!this.textures.exists(k25)) this.load.image(k25, `ui/uploads/${k25}.png`);
    }
  }

  /** 에디터 저작 레벨 수(1부터 연속). 번들 팩 + localStorage 병합 기준. 최소 1(항상 1레벨은 시도 가능). */
  private levelCount(): number {
    const packRaw = this.cache.json.get(EDITOR_PACK_KEY) as
      | { levels?: Record<string, CardBoardDoc> }
      | Record<string, CardBoardDoc>
      | null;
    const pack = ((packRaw && 'levels' in packRaw ? packRaw.levels : packRaw) ?? {}) as Record<string, CardBoardDoc>;
    return Math.max(1, editorLevelCount(pack));
  }

  create(): void {
    this.uiObjects = []; // restart 마다 재수집(스테일 참조 누적 방지).
    this.uiCam = undefined;
    const save = loadSave();
    // 데모 모드: 저장과 무관하게 **점포매입 → 건설 데모**. 진행은 restart init(demoBuilt)로 이어붙여 3층 시작 → 최대 10층까지 쌓는다.
    this.justBuiltLevel = 0;
    this.customerActive = new Set<string>();
    // (초기 재화는 save 기본값: 코인 1000·다이아 30. 데모 자동 충전 제거 — 상점/재설정 메뉴로 조정.)
    // **임시저장 기반 진행**: 저장된 건설 상태를 그대로 이어간다(리셋/첫 진입 = 1~2층·1소유).
    this.builtFloors = save.builtFloors;
    this.ownedFloors = save.ownedFloors ?? INITIAL_OWNED;
    // **씬 재사용 대비 스테이지2 상태 리셋** — Phaser 는 씬 인스턴스를 재사용하므로, 이전 진입에서 남은
    //   lot2Built 등이 그대로면 setupLot2 가 조기 반환해(빈 부지 + 버튼 없음) 저장 복원/구입 버튼이 모두 사라진다.
    //   여기서 런타임 상태만 비우고, setupLot2 가 매 진입 저장(save)으로부터 다시 구성하게 한다.
    this.lot2Built = false;
    this.lot2Floors = 0;
    this.lot2Btn = undefined;
    this.lot2Hint = undefined;
    this.lot2BuildBtn = undefined;
    this.lot2Roof = undefined;
    this.lot2Ruin = undefined;
    this.lot2ForSale = undefined;
    this.lot2Sign = undefined;
    this.lot2SignMsg = undefined;
    this.lot2FloorObjs.clear();
    this.sideLots = []; // 사이드 부지 리스트 리셋(setupSideLots 가 저장으로 재구성).
    this.scrollMaxX = 0; // setupLot2/사이드 부지가 다시 열어준다(미실행 시 수평 스크롤 차단).
    this.scrollMinX = 0;
    this.leftArrow = undefined; // 좌우 화살표는 enableTowerScroll 에서 재생성(씬 재사용 대비 참조 비움).
    this.rightArrow = undefined;
    // ⚠️ **소프트락 방지**: constructing 은 필드 초기화라 씬 재사용 시 1회만 실행됨. 건설 애니 도중 홈을 떠나면
    //   Phaser 가 리셋 콜백(delayedCall/tween)을 파괴해 true 로 굳는다 → 복귀 시 스크롤·건설·매입 전부 잠김.
    //   매 진입마다 여기서 강제로 풀어 소프트락을 회복한다(건설 중 이탈은 아래 씬-이탈 버튼 가드로도 예방).
    this.constructing = false;
    this.floorClaimBubbles.clear(); // 씬 재사용 대비: 스테일 말풍선 참조 비움(오브젝트는 씬 재시작이 파괴).
    this.loadFloorBanks(); // 층별 누적 코인을 세이브에서 로드.
    playBgm('home'); // 홈 BGM(첫 제스처에서 실제 시작).

    // 홈(로비)에는 카드가 있어선 안 된다 — 비정상 전환으로 play/preview 가 남아 있으면 강제 정지(카드 오버레이 방지).
    for (const key of ['play', 'preview']) {
      if (this.scene.key !== key && this.scene.isActive(key)) this.scene.stop(key);
    }

    const homeDoc = (this.cache.json.get(UI_HOME_KEY) ?? null) as LayoutDoc | null;
    if (homeDoc && Array.isArray(homeDoc.nodes) && homeDoc.nodes.length > 0) {
      const idx = buildLayout(this, homeDoc);
      this.wireTower(idx);
      this.animateCharacters(idx);
      registerCustomerFrames(this);
      this.customerSpots = this.buildCustomerSpots(); // 건설된 층 손님 스팟(라이브 배열).
      startCustomerVisits(this, this.customerSpots, this.customerActive); // 전역 랜덤 스포너(랜덤 층·랜덤 간격).
      this.startBottomCars(idx); // 하단 도로 자동차 통행(디자이너 참조 차 위치/크기/depth 기준).
      this.wireHomeUI(idx, save); // 새 UI(플레이 버튼·설정 기어·코인/레벨 텍스트) 배선.
    } else {
      // 폴백(디자인 미저작) — 코드 크롬.
      this.drawBackground();
      this.drawTitle();
      this.drawPlaceholderTower(save);
      this.drawCoins(save);
      this.drawNav(save);
      this.drawHint(save);
    }
    startCloudDrift(this); // 하늘(배경 위·빌딩 뒤)에 구름을 한 방향으로 천천히 흘려보낸다.
    // 빌드 버전 라벨은 **메뉴(설정) 화면 하단**으로 이관(openSettings) — 홈 화면에는 표시하지 않음.
    // 에디터 레이아웃 경로: 월드/UI 카메라 분리(월드만 줌·스크롤, UI 는 고정 크기).
    if (homeDoc && Array.isArray(homeDoc.nodes) && homeDoc.nodes.length > 0) {
      this.setupCameras();
      this.restoreClaimBubbles(); // 이미 목표 채운 층에 수령 말풍선 복원(uiCam 준비 후 = pinToWorld 유효).
    }
  }

  /** HUD(상단 헤더 + 좌우 레일 아이콘)를 **UI 카메라 대상**으로 등록(고정·비줌). 계속하기(layer_8*)는 타워 하단에 붙어 함께 스크롤(제외). */
  private collectHud(idx: LayoutIndex, header: TopHeader): void {
    this.uiObjects.push(...header.objects);
    const HUD_RE = /^(layer_11|layer_13|layer_17|layer_4|layer_5)(_|$)/;
    for (const e of idx.entries()) if (HUD_RE.test(e.node.id)) this.uiObjects.push(e.obj);
  }

  /**
   * 새 홈 UI(에디터 저작 home.json) 배선 — 계속하기 플레이 버튼·코인/레벨 텍스트·설정 기어.
   *   레벨 선택/배치 점검은 상단 코인패널 우측 **⚙ 설정 기어**를 눌러 여는 설정 오버레이로 이동.
   */
  private wireHomeUI(idx: LayoutIndex, save: SaveData): void {
    const cont = Math.min(Math.max(1, save.level), this.levelCount());
    // 디자이너 헤더 노드(코인 패널+통화 텍스트)는 숨기고 **공통 헤더**로 대체(골드 우측정렬 + 플레이와 동일).
    for (const id of ['layer_4', 'layer_5', 'layer_5_copy', 'layer_5_copy2']) idx.tryById(id)?.setVisible(false);
    const header = buildTopHeader(this, save.coins, save.diamonds ?? 0, cont, () => {
      sfx('button');
      this.openSettings(save);
    });
    this.homeHeader = header;
    this.collectHud(idx, header); // HUD(헤더·레일)를 UI 카메라 대상으로 등록(고정·비줌).
    // **아이템샵** — 좌측 레일 '상점'(layer_11)·'골드'(layer_11_copy2) 아이콘 → 코인/다이아 팩 상점.
    for (const id of ['layer_11', 'layer_11_copy2']) {
      const b = idx.tryById<Phaser.GameObjects.Image>(id);
      b?.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        sfx('button');
        this.openItemShop();
      });
    }
    // **좌우 스테이지 이동 화살표**(디자이너 배치) — 스와이프를 모르는 플레이어용. 누르면 한 스테이지씩 팬.
    //   layer_17=좌(x=72), layer_17_copy=우(x=1004). 해당 방향 스테이지 없으면 updateLotArrows 가 숨김.
    this.leftArrow = idx.tryById<Phaser.GameObjects.Image>('layer_17');
    this.rightArrow = idx.tryById<Phaser.GameObjects.Image>('layer_17_copy');
    this.leftArrow?.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      sfx('button');
      this.panOneStage(-1);
    });
    this.rightArrow?.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      sfx('button');
      this.panOneStage(1);
    });
    this.updateLotArrows(); // 초기 표시 상태(우측 부지 유무 등) 반영.
    // 계속하기 = **플레이 버튼(UI_21, layer_8)** + 레벨 라벨(layer_12) → **최상단(최신) 건설 층 전면 발코니**에 배치.
    const playBtn = idx.tryById<Phaser.GameObjects.Image>('layer_8');
    const playTitle = idx.tryById<Phaser.GameObjects.Text>('layer_9'); // '계속하기' 타이틀.
    const playLbl = idx.tryById<Phaser.GameObjects.Text>('layer_12'); // 'Lv N' 라벨.
    if (playBtn) {
      this.continueBtn = playBtn;
      this.continueTitle = playTitle;
      this.continueLabel = playLbl;
      // 타이틀/라벨의 버튼 대비 상대 오프셋(저작 위치)을 보존해 옮겨도 배치 동일.
      const bNode = idx.nodeById('layer_8');
      const tNode = idx.nodeById('layer_9');
      const lNode = idx.nodeById('layer_12');
      if (bNode && tNode) {
        this.continueTitleDX = tNode.x - bNode.x;
        this.continueTitleDY = tNode.y - bNode.y;
      }
      if (bNode && lNode) {
        this.continueLabelDX = lNode.x - bNode.x;
        this.continueLabelDY = lNode.y - bNode.y;
      }
      playBtn.setInteractive({ useHandCursor: true });
      playBtn.on('pointerdown', () => {
        if (this.constructing) return; // 건설/철거 애니 중 이탈 금지(소프트락 방지).
        sfx('floor_select');
        this.startPlay(Math.min(Math.max(1, loadSave().level), this.levelCount()));
      });
      this.placeContinueButton(); // 최상단 건설 층으로 이동.
    }
  }

  /**
   * **계속하기(플레이) 버튼을 최상단(최신) 건설 층의 전면 발코니에 배치**(요구사항: 최종 업그레이드 층에 CTA).
   *   층이 늘면(건설 완료) 그 새 최상층으로 함께 올라간다. 월드 오브젝트라 타워와 함께 스크롤.
   */
  private placeContinueButton(): void {
    const btn = this.continueBtn;
    if (!btn) return;
    const topLevel = Math.max(1, Math.min(this.builtFloors, this.towerFloors.length));
    const entry = this.towerFloors[topLevel - 1];
    if (!entry) return;
    const cx = entry.node.x ?? W / 2;
    const by = entry.node.y + (entry.node.h ?? LOT2_FLOOR_H) * CONTINUE_FLOOR_OFFSET; // 층 중심 아래 = 전면 발코니.
    const depth = this.floorDepth(topLevel) + CONTINUE_DEPTH_LIFT; // 손님/코인 위로.
    btn.setPosition(cx, by).setDepth(depth).setVisible(true);
    const cont = Math.min(Math.max(1, loadSave().level), this.levelCount());
    this.continueTitle
      ?.setPosition(cx + this.continueTitleDX, by + this.continueTitleDY)
      .setDepth(depth + 1)
      .setVisible(true);
    this.continueLabel
      ?.setPosition(cx + this.continueLabelDX, by + this.continueLabelDY)
      .setDepth(depth + 1)
      .setVisible(true)
      .setText(`Lv ${cont}`);
  }

  /** 다이아 보유 표시 갱신(건설 차감·상점 구매 뒤 호출) — 상단 헤더의 다이아(젬) 값. */
  private refreshHomeDiamond(): void {
    this.homeHeader?.setDiamonds(loadSave().diamonds ?? 0);
  }

  /**
   * **게임 진입 팝업**(레벨 엔트리) — 에디터 저작 blank.json(패널·별·보상·플레이 버튼)을 SSOT 로 렌더.
   *   디자인 미저작 시 코드 드로우 폴백(startPlayFallback).
   */
  private startPlay(level: number): void {
    const doc = (this.cache.json.get(UI_ENTRY_KEY) ?? null) as EntryDoc | null;
    if (doc && Array.isArray(doc.nodes) && doc.nodes.length > 0) this.startPlayFromLayout(level, doc);
    else this.startPlayFallback(level);
  }

  /**
   * blank.json 진입 팝업 렌더 — 프레임(720×1600)을 세로HD(1080×2400)에 균일 스케일(×1.5)로 매핑.
   *   동적 배선: 레벨 번호·게임비 표시·PLAY 버튼(코인 충분 여부)·닫기(딤 배경/패널 ✕).
   *   보상(보물상자·별·슬롯)은 패널 아트에 포함 — 오버레이 노드만 좌표대로 얹는다.
   */
  private startPlayFromLayout(level: number, doc: EntryDoc): void {
    const save = loadSave();
    const enough = save.coins >= GAME_FEE;
    const scale = W / doc.frame.designW; // 720 → 1080 = 1.5.
    const layer = this.add.container(0, 0).setDepth(4000);
    this.pinToUi(layer); // UI(고정) 카메라 전용.

    // 딤 배경 — 탭하면 닫힘(입력 하부 차단 겸용).
    const closePopup = (): void => {
      sfx('level_close');
      layer.destroy();
    };
    const scrim = this.add.rectangle(0, 0, W, H, 0x140a1e, 0.86).setOrigin(0, 0).setInteractive();
    scrim.on('pointerdown', closePopup);
    layer.add(scrim);

    // 노드 렌더(이미지/텍스트) — id 로 조회해 이후 동적 배선.
    const byId = new Map<string, Phaser.GameObjects.Image | Phaser.GameObjects.Text>();
    for (const n of doc.nodes) {
      if (n.visible === false) continue;
      let obj: Phaser.GameObjects.Image | Phaser.GameObjects.Text | null = null;
      if (n.type === 'image' && n.key) {
        if (!this.textures.exists(n.key)) continue; // 텍스처 누락 방어.
        const img = this.add.image(n.x * scale, n.y * scale, n.key);
        if (n.w && n.h) img.setDisplaySize(n.w * scale, n.h * scale);
        obj = img;
      } else if (n.type === 'text') {
        const family = n.fontFamily ? `"${n.fontFamily}", "Jua", sans-serif` : '"Jua", sans-serif';
        const t = this.add.text(n.x * scale, n.y * scale, n.text ?? '', {
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
      layer.add(obj);
      byId.set(n.id, obj);
    }

    // ── 동적 배선 ──
    // 레벨 번호(‘10’) → 현재(이어갈) 레벨.
    (byId.get('layer_3_copy4') as Phaser.GameObjects.Text | undefined)?.setText(`${level}`);
    // 게임비(‘2000’) → 실제 게임비(코인). 표시=차감액 동일(정직). 부족 시 적색.
    (byId.get('layer_3_copy2') as Phaser.GameObjects.Text | undefined)
      ?.setText(GAME_FEE.toLocaleString())
      .setColor(enough ? '#fcbe03' : '#e74c3c');

    // PLAY 버튼(배경 layer_2 + 텍스트 layer_3).
    const playBg = byId.get('layer_2') as Phaser.GameObjects.Image | undefined;
    const playTxt = byId.get('layer_3') as Phaser.GameObjects.Text | undefined;
    if (!enough) playBg?.setTint(0x9a9a9a); // 코인 부족 = 회색 처리.
    const doPlay = (): void => {
      if (!enough) {
        sfx('no_coin');
        this.toast('코인이 부족해요');
        return;
      }
      sfx('floor_select');
      const s = loadSave();
      s.coins = Math.max(0, s.coins - GAME_FEE);
      writeSave(s);
      this.homeHeader?.setCoins(s.coins);
      layer.destroy();
      this.scene.start('play', { level });
    };
    if (playBg) {
      const pressTargets = [playBg, playTxt].filter(Boolean) as Phaser.GameObjects.GameObject[];
      playBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        // displaySize 이미지는 절대 scale 트윈이 크기를 깨므로 y 상대 넛지로 눌림 피드백.
        this.tweens.add({ targets: pressTargets, y: '+=6', duration: 80, yoyo: true, onComplete: doPlay });
      });
    }

    // 닫기(✕) — 패널(layer_1) 아트 우상단에 히트존(딤 배경 탭으로도 닫힘).
    const panel = doc.nodes.find((n) => n.id === 'layer_1');
    if (panel?.w && panel.h) {
      const zx = (panel.x + panel.w * 0.46) * scale;
      const zy = (panel.y - panel.h * 0.47) * scale;
      const z = this.add.zone(zx, zy, 120 * scale, 120 * scale).setOrigin(0.5).setInteractive({ useHandCursor: true });
      z.on('pointerdown', closePopup);
      layer.add(z);
    }

    // 등장 페이드인.
    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 160, ease: 'Quad.easeOut' });
  }

  /**
   * **게임 진입 팝업 폴백**(디자인 미저작) — 코드 드로우 placeholder.
   *   상단: 레벨 + 별3 · ✕ | 중앙: 보상 미리보기 | 아이템 슬롯 3칸 | 플레이 버튼 + 게임비.
   */
  private startPlayFallback(level: number): void {
    const save = loadSave();
    const enough = save.coins >= GAME_FEE;
    const cx = W / 2;
    const layer = this.add.container(0, 0).setDepth(4000);
    this.pinToUi(layer);
    layer.add(this.add.rectangle(0, 0, W, H, 0x140a1e, 0.86).setOrigin(0, 0).setInteractive());

    // ── 패널(크림 프레임, 추후 디자인 교체) ──
    const panelTop = 420;
    const panelBot = 1980;
    const panel = this.add.rectangle(cx, (panelTop + panelBot) / 2, 940, panelBot - panelTop, 0xfff3e0).setStrokeStyle(10, 0xe0b070);
    layer.add(panel);

    // ── 상단: 레벨 + 별3 + ⓘ/✕ ──
    layer.add(this.add.text(cx, panelTop + 60, `레벨 ${level}`, { fontFamily: '"Jua", sans-serif', fontSize: '64px', color: '#7a4a1a', stroke: '#ffffff', strokeThickness: 4 }).setOrigin(0.5));
    for (let i = 0; i < 3; i++) {
      const st = this.add.image(cx + (i - 1) * 90, panelTop + 150, 'up_Solitare_UI_02_v2').setDisplaySize(76, 76);
      if (!this.textures.exists('up_Solitare_UI_02_v2')) st.setVisible(false);
      layer.add(st);
    }
    const closeBtn = this.add.text(panelBot > 0 ? cx + 400 : 0, panelTop + 40, '✕', { fontFamily: '"Jua", sans-serif', fontSize: '56px', color: '#c0392b', backgroundColor: '#ffffff', padding: { x: 16, y: 6 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => {
      sfx('level_close');
      layer.destroy();
    });
    layer.add(closeBtn);

    // ── 중앙: 보상 미리보기(승리 시 획득) — 코인·다이아 아이콘. ──
    const rewY = panelTop + 430;
    layer.add(this.add.text(cx, rewY - 130, '승리 보상', { fontFamily: '"Jua", sans-serif', fontSize: '42px', color: '#9a6a2a' }).setOrigin(0.5));
    const coinPrev = this.add.image(cx - 170, rewY, 'up_Solitare_UI_2_3');
    if (this.textures.exists('up_Solitare_UI_2_3')) {
      const s = coinPrev.texture.getSourceImage() as { width: number; height: number };
      coinPrev.setDisplaySize(150, 150 * (s.height / s.width));
    }
    layer.add(coinPrev);
    layer.add(this.add.text(cx - 170, rewY + 110, '코인', { fontFamily: '"Jua", sans-serif', fontSize: '36px', color: '#7a4a1a' }).setOrigin(0.5));
    const gemPrev = this.add.image(cx + 170, rewY, 'up_Solitare_UI_2_2');
    if (this.textures.exists('up_Solitare_UI_2_2')) {
      const s = gemPrev.texture.getSourceImage() as { width: number; height: number };
      gemPrev.setDisplaySize(140, 140 * (s.height / s.width));
    }
    layer.add(gemPrev);
    layer.add(this.add.text(cx + 170, rewY + 110, '다이아', { fontFamily: '"Jua", sans-serif', fontSize: '36px', color: '#7a4a1a' }).setOrigin(0.5));

    // ── **아이템 슬롯 3칸**(부스터 placeholder) — 추후 인벤토리/디자인 연동. ──
    const slotY = panelTop + 780;
    const slots: Array<{ icon: string; label: string; count: number }> = [
      { icon: '🃏', label: '와일드', count: 2 },
      { icon: '➕', label: '＋5 카드', count: 2 },
      { icon: '↩', label: '되돌리기', count: 1 },
    ];
    slots.forEach((it, i) => {
      const sx = cx + (i - 1) * 250;
      const box = this.add.rectangle(sx, slotY, 200, 200, 0xffe6bf).setStrokeStyle(6, 0xd8a860);
      layer.add(box);
      layer.add(this.add.text(sx, slotY - 20, it.icon, { fontSize: '80px' }).setOrigin(0.5));
      layer.add(this.add.text(sx, slotY + 72, it.label, { fontFamily: '"Jua", sans-serif', fontSize: '28px', color: '#7a4a1a' }).setOrigin(0.5));
      // 개수 배지(우하단).
      layer.add(this.add.circle(sx + 78, slotY + 78, 30, 0x2a7ad8).setStrokeStyle(4, 0xffffff));
      layer.add(this.add.text(sx + 78, slotY + 78, `${it.count}`, { fontFamily: '"Jua", sans-serif', fontSize: '34px', color: '#ffffff' }).setOrigin(0.5));
    });
    layer.add(this.add.text(cx, slotY + 150, '아이템(부스터) — 배치 자리', { fontFamily: '"Jua", sans-serif', fontSize: '26px', color: '#a98' }).setOrigin(0.5));

    // ── 플레이 버튼(대형) + 게임비 ──
    const playBg = this.add.rectangle(cx, panelBot - 200, 560, 150, enough ? 0x4caf50 : 0x9a9a9a).setStrokeStyle(8, 0xffffff).setInteractive({ useHandCursor: true });
    const playTxt = this.add.text(cx, panelBot - 200, '플레이', { fontFamily: '"Jua", sans-serif', fontSize: '68px', color: '#ffffff', stroke: '#2a6a2a', strokeThickness: 6 }).setOrigin(0.5);
    layer.add(playBg);
    layer.add(playTxt);
    layer.add(this.add.text(cx, panelBot - 90, `게임비  🪙 ${GAME_FEE.toLocaleString()}   (보유 ${save.coins.toLocaleString()})`, { fontFamily: '"Jua", sans-serif', fontSize: '38px', color: enough ? '#7a4a1a' : '#c0392b' }).setOrigin(0.5));
    const doPlay = (): void => {
      if (!enough) {
        sfx('no_coin');
        this.toast('코인이 부족해요');
        return;
      }
      sfx('floor_select');
      const s = loadSave();
      s.coins = Math.max(0, s.coins - GAME_FEE);
      writeSave(s);
      this.homeHeader?.setCoins(s.coins);
      layer.destroy();
      this.scene.start('play', { level });
    };
    playBg.on('pointerdown', () => {
      this.tweens.add({ targets: [playBg, playTxt], scaleX: 0.94, scaleY: 0.94, duration: 80, yoyo: true, onComplete: doPlay });
    });
  }

  /**
   * **아이템샵**(Solitare_UI_ItemShop) — 코인 팩·다이아 팩 상점 오버레이. 데모: 팩 탭 시 해당 재화를 지급(무료).
   *   이미지에 팩/버튼이 박혀 있어, 각 팩 위에 **투명 히트존**을 얹어 처리한다.
   */
  private openItemShop(): void {
    const key = 'up_Solitare_UI_ItemShop';
    const layer = this.add.container(0, 0).setDepth(4500);
    this.pinToUi(layer);
    layer.add(this.add.rectangle(0, 0, W, H, 0x140a1e, 0.88).setOrigin(0, 0).setInteractive());
    if (!this.textures.exists(key)) {
      const t = this.add.text(W / 2, H / 2, '아이템샵 준비중\n(탭하여 닫기)', { fontFamily: '"Jua", sans-serif', fontSize: '50px', color: '#fff', align: 'center' }).setOrigin(0.5).setInteractive();
      t.on('pointerdown', () => layer.destroy());
      layer.add(t);
      return;
    }
    const img = this.add.image(W / 2, H / 2, key);
    const src = img.texture.getSourceImage() as { width: number; height: number };
    const dw = 880; // 가로폭 축소(화면보다 작게).
    const dh = dw * (src.height / src.width);
    img.setDisplaySize(dw, dh);
    layer.add(img);
    const left = W / 2 - dw / 2;
    const top = H / 2 - dh / 2;
    // 정규화 좌표(이미지 대비)에 투명 히트존.
    const zone = (nx: number, ny: number, nw: number, nh: number, on: () => void): void => {
      const z = this.add.zone(left + nx * dw, top + ny * dh, nw * dw, nh * dh).setOrigin(0.5).setInteractive({ useHandCursor: true });
      z.on('pointerdown', on);
      layer.add(z);
    };
    const grantCoin = (amt: number): void => {
      const s = loadSave();
      s.coins += amt;
      writeSave(s);
      this.homeHeader?.setCoins(s.coins);
      sfx('coin_burst', { volume: 0.3 });
      this.toast(`🪙 +${amt.toLocaleString()} (데모)`, true);
    };
    const grantDiamond = (amt: number): void => {
      const s = loadSave();
      s.diamonds = (s.diamonds ?? 0) + amt;
      writeSave(s);
      this.refreshHomeDiamond();
      sfx('button');
      this.toast(`💎 +${amt} (데모)`, true);
    };
    // 닫기(X) 우상단.
    zone(0.86, 0.072, 0.12, 0.055, () => {
      sfx('level_close');
      layer.destroy();
    });
    // 코인 팩(2×2) — 1,000 / 5,000 / 11,000 / 65,000.
    zone(0.28, 0.262, 0.38, 0.15, () => grantCoin(1000));
    zone(0.7, 0.262, 0.38, 0.15, () => grantCoin(5000));
    zone(0.28, 0.456, 0.38, 0.15, () => grantCoin(11000));
    zone(0.7, 0.456, 0.38, 0.15, () => grantCoin(65000));
    // 다이아 팩(2×2) — 30 / 100 / 300 / 500.
    zone(0.28, 0.7, 0.38, 0.14, () => grantDiamond(30));
    zone(0.7, 0.7, 0.38, 0.14, () => grantDiamond(100));
    zone(0.28, 0.858, 0.38, 0.14, () => grantDiamond(300));
    zone(0.7, 0.858, 0.38, 0.14, () => grantDiamond(500));
  }

  /** 설정 오버레이 — 레벨 선택 · 배치 점검 · 사운드 토글. */
  private openSettings(save: SaveData): void {
    const cont = Math.min(Math.max(1, save.level), this.levelCount());
    const layer = this.add.container(0, 0).setDepth(3000);
    this.pinToUi(layer); // 오버레이는 UI(고정) 카메라 전용.
    const bg = this.add.rectangle(0, 0, W, H, 0x140a1e, 0.92).setOrigin(0, 0).setInteractive();
    layer.add(bg);
    layer.add(
      this.add
        .text(W / 2, 380, '⚙ 설정', {
          fontFamily: '"Jua", sans-serif',
          fontSize: '80px',
          color: '#ffe066',
          stroke: '#7a2d9a',
          strokeThickness: 9,
        })
        .setOrigin(0.5),
    );
    const mkBtn = (y: number, label: string, bgc: string, fn: () => void): Phaser.GameObjects.Text => {
      const t = this.add
        .text(W / 2, y, label, {
          fontFamily: '"Jua", sans-serif',
          fontSize: '52px',
          color: '#ffffff',
          backgroundColor: bgc,
          padding: { x: 40, y: 26 },
          align: 'center',
          fixedWidth: 620,
        })
        .setOrigin(0.5)
        .setShadow(0, 4, '#00000066', 8)
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', fn);
      layer.add(t);
      return t;
    };
    mkBtn(620, '≡ 레벨 선택', '#3a2a52', () => {
      sfx('level_open');
      layer.destroy();
      this.showLevelSelect(loadSave());
    });
    mkBtn(770, '🔍 배치 점검', '#2a6a9a', () => {
      if (this.constructing) return; // 건설/철거 애니 중 이탈 금지(소프트락 방지).
      sfx('button');
      this.scene.start('preview', { level: cont });
    });
    const soundLabel = (): string => `${isMuted() ? '🔇' : '🔊'} 사운드: ${isMuted() ? '꺼짐' : '켜짐'}`;
    const snd = mkBtn(920, soundLabel(), '#4a3a5a', () => {
      setMuted(!isMuted());
      snd.setText(soundLabel());
      if (!isMuted()) sfx('button');
    });
    // **재화 재설정**(개발/테스트) — 코인·다이아 값을 조정/초기화.
    mkBtn(1070, '💰 재화 재설정', '#2a7a5a', () => {
      sfx('button');
      layer.destroy();
      this.openCurrencyEditor();
    });
    // **건설 리셋**(임시저장 초기화) — 확인 후 초기 상태로 재시작.
    mkBtn(1220, '🔄 건설 리셋', '#a15c1e', () => {
      sfx('button');
      layer.destroy();
      this.confirmReset();
    });
    mkBtn(1400, '✕ 닫기', '#c0392b', () => {
      sfx('level_close');
      layer.destroy();
    });
    // **빌드 버전** — 메뉴(설정) 화면 하단에 표시(홈 화면에서 이관).
    layer.add(
      this.add
        .text(W / 2, H - 36, BUILD_VERSION, {
          fontFamily: '"Jua", sans-serif',
          fontSize: '26px',
          color: '#ffffff',
          backgroundColor: '#00000055',
          padding: { x: 14, y: 7 },
          align: 'center',
        })
        .setOrigin(0.5, 1)
        .setAlpha(0.8),
    );
  }

  /**
   * **재화 재설정 메뉴**(설정 → 재화 재설정) — 코인·다이아 현재값 표시 + 조정(±)·초기화(코인 1000·다이아 30).
   *   상단 헤더 값도 즉시 갱신.
   */
  private openCurrencyEditor(): void {
    const layer = this.add.container(0, 0).setDepth(3200);
    this.pinToUi(layer);
    layer.add(this.add.rectangle(0, 0, W, H, 0x140a1e, 0.94).setOrigin(0, 0).setInteractive());
    layer.add(this.add.text(W / 2, 480, '💰 재화 재설정', { fontFamily: '"Jua", sans-serif', fontSize: '72px', color: '#ffe066', stroke: '#7a2d9a', strokeThickness: 9 }).setOrigin(0.5));
    const coinVal = this.add.text(W / 2, 700, '', { fontFamily: '"Jua", sans-serif', fontSize: '54px', color: '#ffd84a' }).setOrigin(0.5);
    const gemVal = this.add.text(W / 2, 1120, '', { fontFamily: '"Jua", sans-serif', fontSize: '54px', color: '#e79bff' }).setOrigin(0.5);
    layer.add(coinVal);
    layer.add(gemVal);
    const refresh = (): void => {
      const s = loadSave();
      coinVal.setText(`🪙 코인 : ${s.coins.toLocaleString()}`);
      gemVal.setText(`💎 다이아 : ${(s.diamonds ?? 0).toLocaleString()}`);
      this.homeHeader?.setCoins(s.coins);
      this.refreshHomeDiamond();
    };
    const adjust = (coinD: number, gemD: number): void => {
      const s = loadSave();
      s.coins = Math.max(0, s.coins + coinD);
      s.diamonds = Math.max(0, (s.diamonds ?? 0) + gemD);
      writeSave(s);
      sfx('button');
      refresh();
    };
    const setVals = (coins: number, gems: number): void => {
      const s = loadSave();
      s.coins = coins;
      s.diamonds = gems;
      writeSave(s);
      sfx('button');
      refresh();
    };
    // 작은 조정 버튼(±) — 코인 라벨 아래 / 다이아 라벨 아래.
    const small = (x: number, y: number, label: string, bg: string, fn: () => void): void => {
      const t = this.add
        .text(x, y, label, { fontFamily: '"Jua", sans-serif', fontSize: '40px', color: '#fff', backgroundColor: bg, padding: { x: 26, y: 16 }, align: 'center', fixedWidth: 220 })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', fn);
      layer.add(t);
    };
    small(W / 2 - 260, 820, '−1000', '#7a3a3a', () => adjust(-1000, 0));
    small(W / 2, 820, '+1000', '#3a6a3a', () => adjust(1000, 0));
    small(W / 2 + 260, 820, '+10000', '#3a6a3a', () => adjust(10000, 0));
    small(W / 2 - 260, 1240, '−10', '#5a3a6a', () => adjust(0, -10));
    small(W / 2, 1240, '+10', '#5a4a7a', () => adjust(0, 10));
    small(W / 2 + 260, 1240, '+100', '#5a4a7a', () => adjust(0, 100));
    // 초기화 + 닫기.
    const big = (y: number, label: string, bg: string, fn: () => void): void => {
      const t = this.add
        .text(W / 2, y, label, { fontFamily: '"Jua", sans-serif', fontSize: '50px', color: '#fff', backgroundColor: bg, padding: { x: 40, y: 24 }, align: 'center', fixedWidth: 640 })
        .setOrigin(0.5)
        .setShadow(0, 4, '#00000066', 8)
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', fn);
      layer.add(t);
    };
    big(1440, '↺ 초기값 (코인 1000·다이아 30)', '#2a7a5a', () => setVals(1000, 30));
    big(1620, '✕ 닫기', '#c0392b', () => {
      sfx('level_close');
      layer.destroy();
    });
    refresh();
  }

  /** 건설 리셋 확인 — 초기화 시 임시저장 삭제 후 씬 재시작(초기 상태). */
  private confirmReset(): void {
    const layer = this.add.container(0, 0).setDepth(3100);
    this.pinToUi(layer);
    layer.add(this.add.rectangle(0, 0, W, H, 0x000000, 0.72).setOrigin(0, 0).setInteractive());
    layer.add(
      this.add
        .text(W / 2, H / 2 - 170, '건설 진행을 초기화할까요?\n(스테이지1·2 모두 초기 상태로)', {
          fontFamily: '"Jua", sans-serif',
          fontSize: '54px',
          color: '#ffffff',
          align: 'center',
        })
        .setOrigin(0.5),
    );
    const btn = (x: number, label: string, bgc: string, fn: () => void): void => {
      const t = this.add
        .text(x, H / 2 + 70, label, { fontFamily: '"Jua", sans-serif', fontSize: '52px', color: '#ffffff', backgroundColor: bgc, padding: { x: 54, y: 24 } })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', fn);
      layer.add(t);
    };
    btn(W / 2 - 210, '취소', '#4a4a5a', () => {
      sfx('level_close');
      layer.destroy();
    });
    btn(W / 2 + 210, '초기화', '#c0392b', () => {
      sfx('button');
      resetProgress();
      this.scene.restart();
    });
  }

  /** 하단 내비 — 계속하기(저장 레벨) + 레벨 선택. */
  private drawNav(save: SaveData): void {
    // 진행 레벨을 **저작된 레벨 수**로 클램프(미저작 레벨로 못 들어가게).
    const cont = Math.min(Math.max(1, save.level), this.levelCount());
    this.add
      .text(W / 2, H - 250, `▶ 계속하기  Lv.${cont}`, {
        fontFamily: '"Jua", sans-serif',
        fontSize: '52px',
        color: '#2a1830',
        backgroundColor: '#ffd166',
        padding: { x: 46, y: 20 },
      })
      .setOrigin(0.5)
      .setDepth(800)
      .setShadow(0, 3, '#00000066', 6)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.startPlay(cont);
      });
    this.add
      .text(W / 2 - 150, H - 150, '≡ 레벨 선택', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '40px',
        color: '#ffffff',
        backgroundColor: '#3a2a52',
        padding: { x: 30, y: 16 },
      })
      .setOrigin(0.5)
      .setDepth(800)
      .setShadow(0, 3, '#00000066', 6)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        sfx('level_open');
        this.showLevelSelect(save);
      });
    // 배치(디자인) 점검 — 게임이 아닌 레벨별 카드 배치 갤러리.
    this.add
      .text(W / 2 + 160, H - 150, '🔍 배치 점검', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '40px',
        color: '#20143a',
        backgroundColor: '#8fd0ff',
        padding: { x: 30, y: 16 },
      })
      .setOrigin(0.5)
      .setDepth(800)
      .setShadow(0, 3, '#00000066', 6)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (this.constructing) return; // 건설/철거 애니 중 이탈 금지(소프트락 방지).
        sfx('button');
        this.scene.start('preview', { level: cont });
      });
  }

  /** 레벨 선택 오버레이 — **저작된 레벨(1..N)만** 표시, 진행(save.level) 이하만 탭 가능. 그리드 드래그 스크롤. */
  private showLevelSelect(save: SaveData): void {
    const total = this.levelCount(); // 에디터에 저작된 레벨 수(그 이상은 아예 표시하지 않음)
    const layer = this.add.container(0, 0).setDepth(2000);
    this.pinToUi(layer); // 레벨 선택 오버레이 — UI(고정) 카메라 전용.
    const bg = this.add.rectangle(0, 0, W, H, 0x140a1e, 0.94).setOrigin(0, 0).setInteractive();
    layer.add(bg);
    layer.add(
      this.add
        .text(W / 2, 130, '레벨 선택', {
          fontFamily: '"Jua", sans-serif',
          fontSize: '72px',
          color: '#ffe066',
          stroke: '#7a2d9a',
          strokeThickness: 8,
        })
        .setOrigin(0.5),
    );

    const cols = 5;
    const cellW = 200;
    const cellH = 170;
    const startX = W / 2 - ((cols - 1) * cellW) / 2;
    const startY = 300;
    const shown = total; // 저작된 레벨 수만큼만 표시(이후 에디터로 추가하면 자동 증가)
    const gridC = this.add.container(0, 0);
    layer.add(gridC);
    for (let lv = 1; lv <= shown; lv++) {
      const idx = lv - 1;
      const x = startX + (idx % cols) * cellW;
      const y = startY + Math.floor(idx / cols) * cellH;
      const unlocked = lv <= Math.min(save.level, total);
      const btn = this.add
        .text(x, y, unlocked ? `${lv}` : `🔒`, {
          fontFamily: '"Jua", sans-serif',
          fontSize: '54px',
          color: unlocked ? '#2a1830' : '#ffffff',
          backgroundColor: unlocked ? '#ffd166' : '#4a3a5a',
          fixedWidth: 150,
          fixedHeight: 130,
          align: 'center',
        })
        .setOrigin(0.5)
        .setPadding(0, 44, 0, 0);
      if (unlocked) {
        btn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          this.startPlay(lv);
        });
      }
      gridC.add(btn);
    }

    // 넘치면 드래그 스크롤.
    const rows = Math.ceil(shown / cols);
    const contentBottom = startY + rows * cellH;
    const minY = Math.min(0, H - 190 - contentBottom);
    if (minY < 0) {
      bg.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (p.isDown) gridC.y = Phaser.Math.Clamp(gridC.y + (p.position.y - p.prevPosition.y), minY, 0);
      });
    }

    layer.add(
      this.add
        .text(W / 2, H - 90, '✕ 닫기', {
          fontFamily: '"Jua", sans-serif',
          fontSize: '44px',
          color: '#ffffff',
          backgroundColor: '#c0392b',
          padding: { x: 40, y: 16 },
        })
        .setOrigin(0.5)
        .setDepth(2001)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          sfx('level_close');
          layer.destroy();
        }),
    );
  }

  /** 에디터 층 노드를 건설 상태에 따라 배선(플레이 / 건설 / 실루엣). */
  private wireTower(idx: LayoutIndex): void {
    this.layoutIdx = idx; // ⚠️ **먼저** 설정 — 아래 nearestEntry(floorDecor 구성)가 this.layoutIdx 를 쓴다.
    const allFloors = idx.entries().filter((e) => FLOOR_KEY_RE.test(e.node.key ?? ''));
    allFloors.sort((a, b) => b.node.y - a.node.y); // 아래(y 큰)=1F
    // **타워 = 템플릿의 모든 층 노드**(카드레벨 lc 와 무관). lc 로 자르면 4층이 동적층으로 중복 생성돼 idle 유리가 생겼음.
    const floors = allFloors;
    // 숨긴 층 위에 얹힌 장식(점주 Chr·유리난간)도 함께 숨긴다 — 최상위 표시층의 상단보다 위면 숨김.
    const topVisible = floors[floors.length - 1]?.node;
    if (topVisible) {
      const cutY = topVisible.y - (topVisible.h ?? 500) / 2;
      idx
        .entries()
        .filter((e) => /_Chr_|_BG_Glass/i.test(e.node.key ?? '') && e.node.y < cutY)
        .forEach((e) => (e.obj as Phaser.GameObjects.Image).setVisible(false));
    }
    this.floorDecor.clear();
    floors.forEach((e, i) => {
      const level = i + 1;
      const obj = e.obj as Phaser.GameObjects.Image;
      // 이 층의 장식(유리/캐릭터) — 건설 연출이 해당 층 것만 등장시키게 기록.
      this.floorDecor.set(level, {
        glass: this.nearestEntry(e.node, /_BG_Glass/i)?.obj as Phaser.GameObjects.Image | undefined,
        char: this.nearestEntry(e.node, /_Chr_/i)?.obj as Phaser.GameObjects.Image | undefined,
      });
      if (level <= this.builtFloors) {
        obj.setAlpha(1); // 건설됨 — **표시만**. 층 탭으로 게임 진입 안 함(게임은 '계속하기'로만 진입).
      } else {
        obj.setVisible(false); // 미건설 층은 **숨김**(반투명 실루엣 X). 건설 연출에서만 등장.
        // 이 층 **자기 장식(유리/캐릭터)만** 숨긴다 — 아래 건설된 층 것(멀리 있는 것)은 건드리지 않게 근접 판정.
        const dec = this.floorDecor.get(level);
        const near = (o?: Phaser.GameObjects.Image): boolean => !!o && Math.abs(o.y - e.node.y) < (e.node.h ?? 500) * 0.7;
        if (near(dec?.glass)) dec!.glass!.setVisible(false);
        if (near(dec?.char)) dec!.char!.setVisible(false);
        // 건설 버튼은 **에디터 버튼(점포매입/건축)**을 쓴다 → wireStoreButtons. (코드 버튼 미생성)
      }
    });
    // **1층(편의점)은 앞 유리팬스 미설치**(요구사항 예외) — 유리 숨김 + decor 에서 제거(손님 depth 폴백).
    const dec1 = this.floorDecor.get(1);
    if (dec1?.glass) {
      dec1.glass.setVisible(false);
      dec1.glass = undefined;
    }
    this.towerFloors = floors.slice();
    // 레이아웃에 없는 상위 층(4~10)은 **전부 코드로 미리 렌더**(미건설은 숨김) → 건설 시 제자리에서 등장(재시작 없음).
    this.renderDynamicFloors();
    this.restackStage1(); // **스테이지2 기준 통일 스택**으로 스테이지1 층·장식을 재조정(수직위치·겹침·레이어 통일).
    // 지붕은 **현재 건설된 최상층**에 얹는다(3층까지 지어진 상태면 3층 위).
    this.capRoof(idx, this.towerFloors, Math.max(1, Math.min(this.builtFloors, this.towerFloors.length)));
    this.normalizeClerkDepths(); // **모든 층 점원을 자기 층 유리팬스 바로 뒤로**(에디터 3층 점원이 유리 위로 올라오던 문제 수정).
    this.wireStoreButtons(idx); // 에디터 저작 점포매입/건축 버튼 배선 + depth 정정(손님이 앞을 가리지 않게).
    this.setupCrane();
    this.applyParallax(idx); // 배경 패럴랙스(근경 빠름·원경 느림·하늘 가장 느림).
    this.frameTower(); // 타워가 화면보다 크므로 카메라를 타워에 맞춘다(층 전체가 보이게).
    this.enableTowerScroll(); // 위아래 드래그 스크롤(월드 카메라).
    this.coverFarBackground(idx); // 원경(느린 패럴랙스)이 스크롤 하단에서 잘리지 않게 아래로 연장.
    // 도로/보도블록은 **에디터 위치 그대로** 둔다(늘리지 않음). 대신 update() 의 줌아웃을 지면 근처에서
    //   제한해(minZoomForGround) 도로 바닥 아래가 드러나지 않게 한다 → 도로가 화면 하단에서 안 떨어짐.
    this.applyPropShadows(idx); // 건물·가로등·소화전·화분 발밑 접지 그림자.
    this.setupLot2(); // 우측 내측 부지(lot2, 다층) 구입·건설 + 우측 팬 개방.
    this.setupSideLots(); // 좌 내/외·우 외 부지(폐건물 철거→1층) + 좌우 팬 개방.
    this.buildOfficeTower(); // **좌측 공공건물 타워(5층) 프리빌트** — 메인타워 왼쪽 부지에 미리 완공 배치.
    // **각 부지 건물 좌우에 프롭**(가로등/소화전/화분) — 타워(중앙)는 home.json 이 이미 배치. 5개 부지에 코드 생성.
    for (const cx of [LOT1L_CX - LOT_DX, LOT1L_CX, LOT2_CX, LOT2_CX + LOT_DX, LOT2_CX + 2 * LOT_DX]) this.addLotProps(cx, cx === OFFICE_CX); // 오피스 부지 프롭은 타워 뒤로.
    this.extendRoad(); // 도로가 최외곽 부지까지 자동으로 이어지도록 타일 확장(끊김 방지).
  }

  /**
   * **좌측 공공건물 타워(프리빌트)** — 메인타워 왼쪽 부지(OFFICE_CX=-540)에 공공건물 5개(소방서 등)를
   *   기존 타워 층 스택 방식(동일 폭 LOT2_FLOOR_W·높이 LOT2_FLOOR_H·겹침 LOT2_SMALL_OVERLAP·1층 지면 동일)으로
   *   **항상 완공 상태로 미리 배치**한다. 정적(비상호작용) 월드 오브젝트라 타워와 함께 스크롤(좌로 한 화면 팬 시 중앙).
   */
  private buildOfficeTower(): void {
    this.officeFloors = []; // 씬 재사용 대비: 스테일 참조 비움(오브젝트는 씬 재시작이 파괴).
    const fw = LOT2_FLOOR_W;
    const fh = LOT2_FLOOR_H;
    // 공공건물 에디터(home_copy2) 노드 — 관리자 캐릭터의 **빌딩 대비 상대 위치**를 읽어 게임 층에 적용.
    const officeDoc = (this.cache.json.get(UI_OFFICE_KEY) ?? null) as { nodes?: Array<{ key?: string; x: number; y: number; w?: number; h?: number }> } | null;
    const nodes = officeDoc?.nodes ?? [];
    const findByKey = (part: string): (typeof nodes)[number] | undefined => nodes.find((n) => (n.key ?? '').includes(part));
    for (let level = 1; level <= OFFICE_FLOORS; level++) {
      const key = `up_Slitare_Office_${pad2(level)}`;
      if (!this.textures.exists(key)) continue; // 아트 없으면 건너뜀(방어).
      const y = LOT2_FLOOR1_Y - (level - 1) * (fh - LOT2_SMALL_OVERLAP); // 동일 높이 층을 위로 스택.
      const img = this.add.image(OFFICE_CX, y, key).setDisplaySize(fw, fh).setDepth(this.floorDepth(level));
      this.pinToWorld(img); // 월드(타워와 함께 스크롤) — uiCam 제외.
      this.officeFloors.push(img);
      // **관리자 캐릭터를 건물 중앙(저작 위치)에** — home_copy2 의 Officer 노드를 빌딩 대비 상대로 배치.
      const chrKey = `up_Solirare_Officer_${pad2(level)}`;
      const bNode = findByKey(`Office_${pad2(level)}_v2`) ?? findByKey(`Office_${pad2(level)}`);
      const oNode = findByKey(`Officer_${pad2(level)}`);
      let chr: Phaser.GameObjects.Image | undefined;
      if (oNode && this.textures.exists(chrKey)) {
        const s = fh / (bNode?.h ?? fh); // 저작 빌딩 높이 → 게임 표시(fh) 스케일.
        const offX = bNode ? (oNode.x - bNode.x) * s : 0;
        const offY = bNode ? (oNode.y - bNode.y) * s : fh * 0.1;
        chr = this.add
          .image(OFFICE_CX + offX, y + offY, chrKey)
          .setDisplaySize((oNode.w ?? 110) * s, (oNode.h ?? 240) * s)
          .setDepth(this.floorDepth(level) + 1); // 자기 층 앞(캐릭터가 건물 안에 보이게), 다음 층 뒤.
        this.pinToWorld(chr);
      }
      // **2층+ 앞 유리팬스** — 메인타워와 동일 스타일(y+fh*0.33·폭690·depth+2, 관리자=유리 바로 뒤).
      //   1층(지면 로비)은 유리팬스 없음(타워1/타워2 1층 예외와 동일). 5층까지 업그레이드 시 자동 적용.
      if (level !== 1 && this.textures.exists('up_Slitare_BG_Glass')) {
        const glass = this.add.image(OFFICE_CX, y + fh * 0.33, 'up_Slitare_BG_Glass').setDepth(this.floorDepth(level) + 2);
        glass.setDisplaySize(690, glass.height * (690 / glass.width));
        this.pinToWorld(glass);
        if (chr) chr.setDepth(glass.depth - 0.5); // 관리자=유리 바로 뒤.
      }
    }
  }

  /** 좌측 공공건물 타워 **상단**(가장 위 층의 top edge) — 없으면 지면. 세로 스크롤 상한 산출용. */
  private officeTop(): number {
    let topY = Infinity;
    for (const o of this.officeFloors) if (o.visible) topY = Math.min(topY, o.y - o.displayHeight / 2);
    return Number.isFinite(topY) ? topY : this.groundBottom();
  }

  /**
   * **도로 자동 확장** — 기존 도로(home.json)가 최외곽 부지에서 끊기므로, 도로 텍스처를 좌우로 타일링해
   *   **모든 스테이지 화면 범위(scrollMinX~scrollMaxX)까지** 이어 붙인다. 기존 커버 밖에만 추가(중복 최소).
   */
  private extendRoad(): void {
    const roads = (this.layoutIdx?.entries() ?? []).filter((e) => e.node.type === 'image' && /도로/.test(e.node.name ?? ''));
    if (roads.length === 0) return;
    const ref = roads[0].node;
    const key = ref.key ?? '';
    if (!key || !this.textures.exists(key)) return;
    const w = ref.w ?? 2285;
    const h = ref.h ?? 592;
    const y = ref.y ?? 2180;
    const depth = ref.depth ?? 3;
    // 기존 도로 커버 범위(월드 x).
    let covL = Infinity;
    let covR = -Infinity;
    for (const r of roads) {
      const nw = r.node.w ?? w;
      covL = Math.min(covL, r.node.x - nw / 2);
      covR = Math.max(covR, r.node.x + nw / 2);
    }
    // 필요 범위 = 최좌·최우 스테이지의 화면 좌우 끝 + 여유.
    const needL = this.scrollMinX - 120;
    const needR = this.scrollMaxX + W + 120;
    const step = w * 0.98; // 살짝 겹쳐 이음새 없이.
    const tile = (cx: number): void => {
      const img = this.add.image(cx, y, key).setDisplaySize(w, h).setDepth(depth);
      this.pinToWorld(img);
    };
    for (let cx = covR + step / 2; cx - w / 2 < needR; cx += step) tile(cx); // 우측 확장.
    for (let cx = covL - step / 2; cx + w / 2 > needL; cx -= step) tile(cx); // 좌측 확장.
  }

  /**
   * **두 번째 부지(우측)** — 편의점(타워1) 오른쪽 빈 부지로 수평 스크롤을 열고, 부지 중앙에
   *   "부지 구입 · 1층 건설" 버튼을 둔다. 버튼을 누르면 화면이 우측으로 이동하며 타워2 1층을 건설한다.
   *   지면(도로/중경 복사)은 이미 우측을 덮고 있고, 원경/하늘은 near-fixed 라 팬해도 함께 보인다.
   */
  private setupLot2(): void {
    if (this.lot2Built) return;
    this.scrollMaxX = LOT_DX; // 우측 빈 부지까지 팬 가능(타워1 ↔ 부지).
    // **임시저장 복원**: 저장된 스테이지2 건설 상태가 있으면 즉시 그 높이까지 세운다(폐건물 없이).
    const saved = loadSave();
    if (saved.lot2Built && (saved.lot2Floors ?? 0) >= 1) {
      this.restoreLot2(saved.lot2Floors ?? 1);
      return;
    }
    if (saved.lot2Demolished) {
      // 철거됨(빈 부지) → 1층 건설 버튼만.
      this.lot2Btn = this.makeLotButton(LOT2_CX, LOT2_FLOOR1_Y - LOT2_FLOOR_H / 2 - 90, `🏗️ 1층 건설\n💎 ${diamondCostFor(1)}`, () => this.buildLot2Floor1(), 240);
      return;
    }
    this.lot2Ruin = this.spawnRuin(LOT2_CX, 'up_Slitare_BG_Ruin_05'); // 폐건물 코드 선배치(고유).
    this.lot2ForSale = this.spawnForSaleSign(LOT2_CX, FOR_SALE_VARIANTS - 1); // 'FOR SALE'(우 내측 = 마지막 변형).
    const lot2Sign = this.spawnLotSignboard(LOT2_CX, FOR_SALE_VARIANTS - 1, this.lot2Ruin, this.lotSignMessage()); // 상단 간판 + 메시지.
    this.lot2Sign = lot2Sign.board;
    this.lot2SignMsg = lot2Sign.text;
    if (!this.lotsUnlocked()) return; // 메인타워 10층 완공 전 = 구입 잠금(간판 메시지로 안내).
    this.showLot2BuyButton();
  }

  /** 우 내측(lot2) '부지 구입(철거)' 버튼 + '새 부지 →' 힌트(잠금 해제 시). */
  private showLot2BuyButton(): void {
    const btnY = this.lot2Ruin ? this.lot2Ruin.y - this.lot2Ruin.displayHeight / 2 + 60 : 1780;
    this.lot2Btn = this.makeLotButton(LOT2_CX, btnY, '🏗️ 부지 구입\n(철거)', () => this.demolishLot2(), 260);
    const hint = this.add
      .text(1035, 1360, '새 부지 →', { fontFamily: 'sans-serif', fontSize: '30px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(60);
    hint.setShadow(2, 2, '#00000088', 4);
    this.pinToWorld(hint);
    this.tweens.add({ targets: hint, x: 1065, alpha: 0.5, duration: 780, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.lot2Hint = hint;
  }

  /** 우 내측 부지 **철거** → 빈 부지(1층 건설 버튼). 그 뒤 1층부터 다층 건설(기존 lot2 시스템). */
  private demolishLot2(): void {
    if (this.lot2Built || this.constructing) return;
    this.constructing = true; // 연출 중 스크롤/입력 잠금.
    sfx('button');
    for (const o of [this.lot2Btn, this.lot2Hint, this.lot2ForSale, this.lot2Sign, this.lot2SignMsg]) {
      if (o) this.tweens.add({ targets: o, alpha: 0, duration: 300, onComplete: () => o.destroy() }); // 표지판·간판도 함께 제거.
    }
    this.lot2Btn = undefined;
    this.lot2Hint = undefined;
    this.lot2ForSale = undefined;
    this.lot2Sign = undefined;
    this.lot2SignMsg = undefined;
    const ruin = this.lot2Ruin;
    this.lot2Ruin = undefined;
    this.panToLot2Floor(1, 700);
    const done = (): void => {
      this.constructing = false;
      const s = loadSave();
      s.lot2Demolished = true;
      writeSave(s);
      this.lot2Btn = this.makeLotButton(LOT2_CX, LOT2_FLOOR1_Y - LOT2_FLOOR_H / 2 - 90, `🏗️ 1층 건설\n💎 ${diamondCostFor(1)}`, () => this.buildLot2Floor1(), 240);
      this.toast('🏚️ 철거 완료 — 빈 부지', true);
    };
    if (!ruin) {
      done();
      return;
    }
    this.demolishRuin(ruin, done);
  }

  /** 폐건물 철거 연출 — 흔들림 → 붕괴(가라앉으며 기울고 먼지·화면 흔들) → 소멸 후 onDone. */
  /**
   * **철거 연출**(Destroy_01~05 · 2번 이미지 스타일) — 도구가 두드리는 사이 먼지가 뭉클뭉클 피어오르며 건물이 주저앉는다.
   *   · 도구 01(철구)·02(착암기)·03(해머)를 건물 위에 등장시켜 스윙/드릴/내리치기.
   *   · 먼지 04를 **반투명(≈0.75)** 로 깔고 **크게-작게 뭉클뭉클** 펄스로 키우다 후반 **05로 교체**.
   *   · 건물은 흔들→주저앉아 소멸. 끝나면 onDone(=빈 부지).
   *   에셋 없으면 간단 붕괴로 폴백.
   */
  private demolishRuin(ruin: Phaser.GameObjects.Image, onDone: () => void): void {
    const cx = ruin.x;
    const y0 = ruin.y;
    const rh = ruin.displayHeight;
    const rw = ruin.displayWidth;
    const baseY = y0 + rh / 2;
    const D = ruin.depth ?? RUIN_DEPTH;

    if (!this.textures.exists('up_Destroy_04')) {
      // 폴백(에셋 미로드) — 기존 간단 붕괴.
      this.cameras.main.shake(320, 0.008);
      this.emitSmokeBand(cx, baseY, rw * 0.92, D + 1);
      this.tweens.add({ targets: ruin, y: y0 + 130, angle: -5, alpha: 0, scaleY: ruin.scaleY * 0.65, duration: 680, ease: 'Quad.easeIn', onComplete: () => { ruin.destroy(); onDone(); } });
      return;
    }

    sfx('build');
    // ── 도구 3종 — 건물 주변에 등장해 두드린다(01 철구·02 착암기·03 해머). ──
    const tools: Phaser.GameObjects.Image[] = [];
    const addTool = (key: string, x: number, y: number, dispH: number, from: { x: number; y: number; a: number }, hit: (t: Phaser.GameObjects.Image) => void): void => {
      if (!this.textures.exists(key)) return;
      // **도구는 먼지(연기, D+7)·잔해밴드(D+8)보다 위 레이어**(D+10)에 둔다 — 연기 뒤로 가리지 않게.
      const t = this.add.image(from.x, from.y, key).setDepth(D + 10).setAngle(from.a).setAlpha(0);
      const src = this.textures.get(key).getSourceImage() as { width: number; height: number };
      t.setDisplaySize(dispH * (src.width / src.height), dispH);
      this.pinToWorld(t);
      this.tweens.add({ targets: t, x, y, angle: 0, alpha: 1, duration: 260, ease: 'Back.easeOut', onComplete: () => hit(t) });
      tools.push(t);
    };
    // 도구는 **건물 안쪽**(중심에 가깝게)에서 두드린다(바깥으로 튀지 않게).
    addTool('up_Destroy_01', cx - rw * 0.18, y0 - rh * 0.14, 240, { x: cx - rw * 0.38, y: y0 - rh * 0.42, a: -30 }, (t) => {
      this.tweens.add({ targets: t, angle: 18, duration: 360, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); // 철퇴 스윙.
    });
    addTool('up_Destroy_02', cx + rw * 0.18, y0 + rh * 0.12, 220, { x: cx + rw * 0.38, y: baseY + 46, a: 16 }, (t) => {
      const yy = t.y;
      this.tweens.add({ targets: t, y: yy + 12, duration: 70, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); // 착암기 드릴.
    });
    addTool('up_Destroy_03', cx + rw * 0.02, y0 - rh * 0.22, 230, { x: cx + rw * 0.14, y: y0 - rh * 0.42, a: -42 }, (t) => {
      this.tweens.add({ targets: t, angle: 24, duration: 300, yoyo: true, repeat: -1, ease: 'Cubic.easeIn' }); // 망치 내리치기.
    });

    // ── 먼지 04 — 반투명·뭉클뭉클(크게-작게) 성장 후 05 로 교체. ──
    const dust = this.add.image(cx, y0 + rh * 0.12, 'up_Destroy_04').setDepth(D + 7).setAlpha(0);
    const src4 = this.textures.get('up_Destroy_04').getSourceImage() as { width: number; height: number };
    const fullW = rw * 1.25;
    dust.setDisplaySize(fullW * 0.5, fullW * 0.5 * (src4.height / src4.width));
    this.pinToWorld(dust);
    let puff: Phaser.Tweens.Tween | undefined;
    this.tweens.add({
      targets: dust,
      alpha: 0.95, // 투명도 낮춤(더 불투명하게) — 건물이 비쳐 보이지 않게.
      scaleX: dust.scaleX * 2,
      scaleY: dust.scaleY * 2,
      duration: 340,
      ease: 'Back.easeOut', // 뭉클 부풀며 등장.
      onComplete: () => {
        const s = dust.scaleX;
        // **크게-작게 뭉클뭉클**(가로/세로 어긋난 스쿼시 펄스).
        puff = this.tweens.add({ targets: dust, scaleX: s * 0.88, scaleY: s * 1.14, duration: 230, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      },
    });
    this.emitSmokeBand(cx, baseY, rw * 0.95, D + 8); // 하단 잔해 먼지.

    // ── 건물 붕괴(먼지 뒤에서 흔들→주저앉으며 소멸) — **약 2배 더 긴 철거**. ──
    this.tweens.add({ targets: ruin, x: cx + 8, duration: 60, yoyo: true, repeat: 9, ease: 'Sine.easeInOut' }); // 더 오래 흔들.
    this.tweens.add({ targets: ruin, y: y0 + 140, scaleY: ruin.scaleY * 0.55, alpha: 0, angle: -4, delay: 420, duration: 1440, ease: 'Quad.easeIn', onComplete: () => { this.cameras.main.shake(180, 0.006); ruin.destroy(); } });
    // 중간중간 추가 잔해 먼지(길어진 연출을 채운다).
    this.time.delayedCall(700, () => this.emitSmokeBand(cx, baseY, rw * 0.85, D + 8));
    this.time.delayedCall(1300, () => this.emitSmokeBand(cx, baseY, rw * 0.8, D + 8));

    // 후반: 먼지 04 → 05 교체(구멍/걷힘).
    this.time.delayedCall(1560, () => {
      if (!dust.active) return;
      const dw = dust.displayWidth;
      const dh = dust.displayHeight;
      dust.setTexture('up_Destroy_05').setDisplaySize(dw, dh); // 비율 유지 교체(펄스는 아래서 재개).
      const s = dust.scaleX;
      puff?.stop();
      puff = this.tweens.add({ targets: dust, scaleX: s * 0.9, scaleY: s * 1.12, duration: 240, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });

    // 종료: 먼지·도구 걷히고(페이드) → 빈 부지. onDone.
    this.time.delayedCall(2360, () => {
      puff?.stop();
      this.tweens.add({ targets: dust, alpha: 0, duration: 520, ease: 'Sine.easeIn', onComplete: () => dust.destroy() });
      for (const t of tools) this.tweens.add({ targets: t, alpha: 0, y: t.y - 44, duration: 420, ease: 'Sine.easeIn', onComplete: () => t.destroy() });
    });
    this.time.delayedCall(3100, () => onDone());
  }

  /**
   * **건설 연출**(Const 도구 · 2단계) — 새 층이 올라오는 동안 도구들이 먼지 위에서 작업한다.
   *   · 먼지(Destroy_04→05) 반투명·뭉클뭉클 + 벽돌(Const_09/10) 쌓임.
   *   · **1단계(왼쪽)**: 톱(Const_01)이 켜고 판자(Const_07)를 얹는다.
   *   · **2단계(오른쪽)**: 붓(Const_14)으로 칠하고 흙손(Const_04)으로 마감 + 판자.
   *   도구는 먼지보다 **위 레이어**(가리지 않게). 자체 정리(정해진 시간 뒤 페이드).
   */
  private constructFx(cx: number, cy: number, w: number): void {
    const D = 130; // FX 레이어(건물/차 위).
    const baseY = GROUND_Y - 30;
    const tools: Phaser.GameObjects.Image[] = [];
    // 공용 도구 헬퍼 — 등장(delay) → work 반복 → leaveAt 에 퇴장.
    const addTool = (key: string, x: number, y: number, dispH: number, ang: number, delay: number, leaveAt: number, work: (t: Phaser.GameObjects.Image) => void): void => {
      if (!this.textures.exists(key)) return;
      const t = this.add.image(x, y + 34, key).setDepth(D + 8).setAngle(ang - 10).setAlpha(0);
      const src = this.textures.get(key).getSourceImage() as { width: number; height: number };
      t.setDisplaySize(dispH * (src.width / src.height), dispH);
      this.pinToWorld(t);
      this.tweens.add({ targets: t, y, angle: ang, alpha: 1, delay, duration: 260, ease: 'Back.easeOut', onComplete: () => work(t) });
      this.time.delayedCall(leaveAt, () => this.tweens.add({ targets: t, alpha: 0, y: t.y - 42, duration: 320, ease: 'Sine.easeIn', onComplete: () => t.destroy() }));
      tools.push(t);
    };

    // ── 먼지(반투명·뭉클뭉클) — 전 구간 유지. ──
    let dust: Phaser.GameObjects.Image | undefined;
    let puff: Phaser.Tweens.Tween | undefined;
    if (this.textures.exists('up_Destroy_04')) {
      dust = this.add.image(cx, cy + 30, 'up_Destroy_04').setDepth(D + 3).setAlpha(0);
      const src = this.textures.get('up_Destroy_04').getSourceImage() as { width: number; height: number };
      const fw = w * 0.8; // 먼지 조금 작게.
      dust.setDisplaySize(fw * 0.55, fw * 0.55 * (src.height / src.width));
      this.pinToWorld(dust);
      const d = dust;
      this.tweens.add({
        targets: d,
        alpha: 0.9,
        scaleX: d.scaleX * 1.5,
        scaleY: d.scaleY * 1.5,
        duration: 340,
        ease: 'Back.easeOut',
        onComplete: () => {
          const s = d.scaleX;
          puff = this.tweens.add({ targets: d, scaleX: s * 0.9, scaleY: s * 1.12, duration: 240, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        },
      });
    }
    // ── 벽돌 쌓임(3개, 바닥에서 **크게 튀어오르며** 회전·안착 후 계속 들썩). ──
    ['up_Const_09', 'up_Const_10', 'up_Const_09'].forEach((bk, i) => {
      if (!this.textures.exists(bk)) return;
      const src = this.textures.get(bk).getSourceImage() as { width: number; height: number };
      const bw = 110; // 벽돌 조금 크게.
      const b = this.add.image(cx - 70 + i * 70, baseY - i * 30, bk).setDepth(D + 4).setAlpha(0);
      b.setDisplaySize(bw, bw * (src.height / src.width));
      this.pinToWorld(b);
      const fy = b.y;
      const spin = i % 2 === 0 ? 1 : -1;
      b.y = fy - 190; // 더 높이서 낙하.
      b.setAngle(spin * -30);
      // 크게 튀어오르며 회전 안착.
      this.tweens.add({ targets: b, y: fy, angle: 0, alpha: 1, delay: 200 + i * 150, duration: 560, ease: 'Bounce.easeOut', onComplete: () => {
        this.tweens.add({ targets: b, y: fy - 14, angle: spin * 4, duration: 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); // 계속 들썩(큰 움직임).
      } });
      this.time.delayedCall(2700, () => this.tweens.add({ targets: b, alpha: 0, y: fy - 30, duration: 400, onComplete: () => b.destroy() }));
    });

    // ── 1단계(왼쪽): 톱 + 판자 (0~1400ms) — 움직임 크게. ──
    addTool('up_Const_01', cx - w * 0.14, cy - 20, 210, -20, 0, 1400, (t) => {
      const x0 = t.x;
      this.tweens.add({ targets: t, x: x0 + 40, angle: t.angle + 6, duration: 190, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); // 톱질(크게).
    });
    addTool('up_Const_07', cx + w * 0.15, cy + 24, 150, 20, 160, 1400, (t) => {
      const y0 = t.y;
      this.tweens.add({ targets: t, y: y0 - 20, angle: t.angle + 8, duration: 320, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); // 판자 얹기(크게).
    });

    // ── 2단계(오른쪽): 붓 + 흙손 + 판자 (1450~2700ms) — 움직임 크게. ──
    addTool('up_Const_14', cx + w * 0.17, cy - 40, 200, 28, 1450, 2700, (t) => {
      this.tweens.add({ targets: t, angle: 2, y: t.y + 22, duration: 280, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); // 붓칠(크게 위아래).
    });
    addTool('up_Const_04', cx - w * 0.16, cy + 30, 170, -22, 1560, 2700, (t) => {
      const x0 = t.x;
      this.tweens.add({ targets: t, x: x0 + 30, angle: -6, duration: 320, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); // 흙손 마감(크게).
    });
    addTool('up_Const_07', cx, cy - 6, 140, -14, 1620, 2700, (t) => {
      const y0 = t.y;
      this.tweens.add({ targets: t, y: y0 - 16, angle: -2, duration: 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });

    // ── 마무리: 1단계→2단계 사이 먼지 05 교체 + 종료 시 먼지 걷힘. ──
    if (dust) {
      const d = dust;
      this.time.delayedCall(1450, () => {
        if (!d.active || !this.textures.exists('up_Destroy_05')) return;
        const dw = d.displayWidth;
        const dh = d.displayHeight;
        d.setTexture('up_Destroy_05').setDisplaySize(dw, dh);
      });
      this.time.delayedCall(2700, () => {
        puff?.stop();
        this.tweens.add({ targets: d, alpha: 0, duration: 520, ease: 'Sine.easeIn', onComplete: () => d.destroy() });
      });
    }
  }

  // ── 사이드 부지(좌 내/외·우 외) — 폐건물 철거 → 1층 건설. 데이터 기반 일반화 ──
  /** 사이드 부지 목록 구성 — 좌 내(-540)·좌 외(-1620)·우 외(2700). 우 내(1620)는 lot2(다층) 별도. */
  private setupSideLots(): void {
    // 편집기(home.json) 의존 없이 **폐건물을 코드로 선배치** — 편집기 자동저장이 되돌려도 항상 표시.
    this.hideLayoutRuins(); // home.json Ruin 노드는 숨김(중복 방지).
    // **폐건물 5개(lot2 포함) 각기 다른 텍스처**(중복 금지). 여기 4개(좌2·우2) + lot2(우 내측, Ruin_05).
    this.sideLots = [
      // ⚠️ 좌측 첫 부지(LOT1L_CX)는 **공공건물 타워 프리빌트**(buildOfficeTower)가 차지 → 폐건물 부지에서 제외.
      // **가장 왼쪽 부지 = 고수익 경쟁 부지**(간판 문구 고정) — 건설 수익↑ 이지만 공격 시 강제경매되는 경쟁형 부지.
      { cx: LOT1L_CX - LOT_DX, ruinKey: 'up_Slitare_BG_Ruin_02', saveKey: 'L2', hintText: '← 새 부지', hintX: 45, built: false, demolished: false, stage: 4, signOverride: '고수익 경쟁 부지\n건설 수익은 높지만 공격 시 강제경매됩니다.' },
      { cx: LOT2_CX + LOT_DX, ruinKey: 'up_Slitare_BG_Ruin_03', saveKey: 'R2', hintText: '새 부지 →', hintX: 1035, built: false, demolished: false, stage: 5 },
      { cx: LOT2_CX + 2 * LOT_DX, ruinKey: 'up_Slitare_BG_Ruin_04', saveKey: 'R3', hintText: '새 부지 →', hintX: 1035, built: false, demolished: false, stage: 6 },
    ];
    // 좌우 팬 범위 = 최외곽 부지까지(중앙 기준 ±스테이지 오프셋).
    this.scrollMinX = Math.min(this.scrollMinX, LOT1L_CX - LOT_DX - W / 2); // 좌 외곽(-2160).
    this.scrollMaxX = Math.max(this.scrollMaxX, LOT2_CX + 2 * LOT_DX - W / 2); // 우 최외곽(3240).
    const saved = loadSave();
    for (const lot of this.sideLots) this.setupSideLot(lot, !!saved.sideBuilt?.[lot.saveKey], !!saved.sideDemolished?.[lot.saveKey]);
  }

  /** home.json 의 폐건물(Ruin) 노드를 모두 숨긴다 — 폐건물은 코드로 선배치하므로 중복/편집기 되돌림 방지. */
  private hideLayoutRuins(): void {
    for (const e of this.layoutIdx?.entries() ?? []) {
      if (/Ruin/i.test(e.node.key ?? '')) (e.obj as Phaser.GameObjects.Image).setVisible(false);
    }
  }

  /** 폐건물 코드 선배치 — cx·지면 정렬, **텍스처 비율 보존**(높이=폭×원본비). depth=RUIN_DEPTH. */
  private spawnRuin(cx: number, key: string): Phaser.GameObjects.Image | undefined {
    if (!this.textures.exists(key)) return undefined;
    const src = this.textures.get(key).getSourceImage() as { width: number; height: number };
    const h = RUIN_W * (src.height / Math.max(1, src.width));
    const img = this.add.image(cx, GROUND_Y - h / 2, key).setDisplaySize(RUIN_W, h).setDepth(RUIN_DEPTH);
    this.pinToWorld(img);
    return img;
  }

  /**
   * **'FOR SALE' 표지판 선배치** — 구입 가능한 폐건물 앞(좌측 인도, 입구 안 가림)에 지면으로 세운다.
   *   variant(0-base)로 UI_24-1~3 순환 → 부지마다 다른 표지판. 세로/가로 변형 모두 정사각 박스에 비율 보존 맞춤.
   *   depth=폐건물 바로 앞. 건설/철거 시 호출부에서 제거한다.
   */
  private spawnForSaleSign(cx: number, variant: number): Phaser.GameObjects.Image | undefined {
    const n = (((variant % FOR_SALE_VARIANTS) + FOR_SALE_VARIANTS) % FOR_SALE_VARIANTS) + 1; // 1..3 순환.
    const key = `up_Solitare_UI_24-${n}`;
    if (!this.textures.exists(key)) return undefined;
    const src = this.textures.get(key).getSourceImage() as { width: number; height: number };
    const scale = Math.min(FOR_SALE_BOX / Math.max(1, src.width), FOR_SALE_BOX / Math.max(1, src.height)); // 박스 안 맞춤.
    const w = src.width * scale;
    const h = src.height * scale;
    const x = cx - RUIN_W * 0.3; // 건물 앞-좌측(입구 안 가리게).
    const img = this.add.image(x, GROUND_Y - h / 2, key).setDisplaySize(w, h).setDepth(FOR_SALE_DEPTH); // 지면에 세움.
    this.pinToWorld(img);
    return img;
  }

  /**
   * **폐건물 상단 간판**(UI_25-1~3, 부지별 변형) — 지붕 위로 솟은 장식 간판. **건물 뒤 레이어**(하단이 건물에
   *   가려 지붕 위로만 보임). `message`가 있으면 간판 패널 위에 메시지(잠금 안내 등)를 얹는다.
   *   반환: `{ board, text }` — 철거/건설 시 호출부가 함께 제거.
   */
  /** 폐건물 텍스처의 **실제 지붕(불투명 최상단) 비율**(0..1) — 상단 투명여백을 건너뛰어 간판을 실지붕에 얹기 위함. 캐시. */
  private visibleTopRatio(key: string): number {
    const cached = this.ruinTopRatioCache.get(key);
    if (cached !== undefined) return cached;
    let ratio = 0;
    try {
      const src = this.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
      const w = src.width;
      const hh = src.height;
      const cnv = document.createElement('canvas');
      cnv.width = w;
      cnv.height = hh;
      const ctx = cnv.getContext('2d', { willReadFrequently: true });
      if (ctx && w > 0 && hh > 0) {
        ctx.drawImage(src, 0, 0);
        const data = ctx.getImageData(0, 0, w, hh).data;
        scan: for (let y = 0; y < hh; y++) {
          const row = y * w * 4;
          for (let x = 0; x < w; x++) {
            if (data[row + x * 4 + 3] > 30) {
              ratio = y / hh;
              break scan;
            }
          }
        }
      }
    } catch {
      ratio = 0; // CORS/미지원 시 바운딩박스 상단 사용(폴백).
    }
    this.ruinTopRatioCache.set(key, ratio);
    return ratio;
  }

  private spawnLotSignboard(cx: number, variant: number, ruin: Phaser.GameObjects.Image | undefined, message?: string): { board?: Phaser.GameObjects.Image; text?: Phaser.GameObjects.Text | Phaser.GameObjects.Container } {
    const n = (((variant % FOR_SALE_VARIANTS) + FOR_SALE_VARIANTS) % FOR_SALE_VARIANTS) + 1; // 1..3 순환.
    const key = `up_Solitare_UI_25-${n}`;
    // 건물 **실제 지붕선**(상단 투명여백 제외) — 간판 하단을 여기 얹어 지붕과 간판 사이 빈틈이 없게 한다.
    const ruinTop = ruin ? ruin.y - ruin.displayHeight / 2 + this.visibleTopRatio(ruin.texture.key) * ruin.displayHeight : 1500;
    let board: Phaser.GameObjects.Image | undefined;
    let panelY = ruinTop - 120; // 폴백(간판 없을 때 메시지 y).
    if (this.textures.exists(key)) {
      const src = this.textures.get(key).getSourceImage() as { width: number; height: number };
      const h = LOT_SIGN_W * (src.height / Math.max(1, src.width));
      const y = ruinTop + LOT_SIGN_OVERLAP - h / 2; // 하단이 지붕 꼭대기 뒤로 OVERLAP 겹치고 **나머지는 지붕 위 하늘로** 솟는다.
      board = this.add.image(cx, y, key).setDisplaySize(LOT_SIGN_W, h).setDepth(LOT_SIGN_DEPTH);
      this.pinToWorld(board);
      panelY = y - h * 0.02; // 패널 세로 중앙(3종 변형 모두 패널 중심 비율 ≈0.48 — 측정값)에 텍스트를 중간 배치.
    }
    let text: Phaser.GameObjects.Text | Phaser.GameObjects.Container | undefined;
    if (message) {
      const long = [...message.replace(/\n/g, '')].length > 18; // 긴 설명형 문구(예: 고수익 경쟁 부지)만 제목+설명 2단(코드포인트 기준 — 이모지 서로게이트 오판 방지).
      const dress = (t: Phaser.GameObjects.Text): Phaser.GameObjects.Text => {
        t.setStroke('#5a3410', 6); // 크림/파랑 패널 모두 가독(흰 글자+진갈색 외곽선).
        t.setShadow(2, 2, '#00000066', 4);
        return t;
      };
      if (long) {
        // **제목(첫 줄) 크게 + 설명(나머지) 조금 작게** — 2단 스택을 컨테이너로 패널 중앙에 배치.
        const [title, ...rest] = message.split('\n');
        const desc = rest.join('\n');
        const wrap = Math.round(LOT_SIGN_W * 0.8);
        const base = { fontFamily: '"Jua", sans-serif', color: '#ffffff', align: 'center' as const, fontStyle: 'bold', wordWrap: { width: wrap } };
        const tTitle = dress(this.add.text(0, 0, title, { ...base, fontSize: '36px' }).setOrigin(0.5, 0));
        const tDesc = dress(this.add.text(0, 0, desc, { ...base, fontSize: '28px', lineSpacing: -4 }).setOrigin(0.5, 0));
        const gap = -2; // 제목↔설명 줄간 — 제목 아래 여백만 살짝 당기고, 너무 좁지 않게 자연스러운 간격 유지.
        const totalH = tTitle.height + gap + tDesc.height;
        tTitle.y = -totalH / 2;
        tDesc.y = tTitle.y + tTitle.height + gap;
        text = this.add.container(cx, panelY, [tTitle, tDesc]).setDepth(LOT_SIGN_TEXT_DEPTH);
        this.pinToWorld(text);
      } else {
        text = dress(this.add.text(cx, panelY, message, { fontFamily: '"Jua", sans-serif', fontSize: '32px', color: '#ffffff', align: 'center', fontStyle: 'bold', lineSpacing: -10 }).setOrigin(0.5).setDepth(LOT_SIGN_TEXT_DEPTH));
        this.pinToWorld(text);
      }
    }
    return { board, text };
  }

  /** 잠금 상태에 따른 간판 메시지 문구. */
  private lotSignMessage(): string {
    return this.lotsUnlocked() ? '🏗️ 구입 가능!' : '🔒 타워 10층\n완공 시 개방';
  }

  /** 한 사이드 부지 세팅 — 3상태: 건설됨=1층 / 철거됨=빈 부지+건설버튼 / 아니면 폐건물+구입버튼. */
  private setupSideLot(lot: SideLot, savedBuilt: boolean, savedDemolished: boolean): void {
    if (savedBuilt) {
      lot.built = true;
      const objs = this.renderSideFloor1(lot, true);
      if (objs?.char) this.animateClerk(objs.char);
      this.addSideCustomer(lot);
      return;
    }
    if (savedDemolished) {
      lot.demolished = true; // 빈 부지 → 1층 건설 버튼만.
      this.showSideBuildButton(lot);
      return;
    }
    lot.ruin = this.spawnRuin(lot.cx, lot.ruinKey); // 폐건물 선배치(잠금 여부와 무관하게 항상 표시).
    const variant = this.sideLots.indexOf(lot);
    lot.forSale = this.spawnForSaleSign(lot.cx, variant); // 구입 가능한 폐건물 앞 'FOR SALE'(부지별 변형).
    const sign = this.spawnLotSignboard(lot.cx, variant, lot.ruin, lot.signOverride ?? this.lotSignMessage()); // 상단 간판 + 메시지(부지 고유 문구 우선).
    lot.sign = sign.board;
    lot.signMsg = sign.text;
    if (!this.lotsUnlocked()) return; // **메인타워 10층 완공 전 = 구입 잠금**(간판 메시지로 안내, 구입 버튼 없음).
    this.showSideBuyButton(lot);
  }

  /** 사이드 부지 '부지 구입(철거)' 버튼 + 방향 힌트(잠금 해제 시). */
  private showSideBuyButton(lot: SideLot): void {
    const by = lot.ruin ? lot.ruin.y - lot.ruin.displayHeight / 2 + 60 : 1780;
    lot.btn = this.makeLotButton(lot.cx, by, '🏗️ 부지 구입\n(철거)', () => this.demolishSide(lot), 260);
    const hint = this.add
      .text(lot.hintX, 1360, lot.hintText, { fontFamily: 'sans-serif', fontSize: '30px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(60);
    hint.setShadow(2, 2, '#00000088', 4);
    this.pinToWorld(hint);
    const dir = lot.cx < W / 2 ? -1 : 1;
    this.tweens.add({ targets: hint, x: lot.hintX + dir * 20, alpha: 0.5, duration: 780, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    lot.hint = hint;
  }

  /**
   * **부지 구입 잠금 해제**(메인타워 10층 완공 시) — 잠긴 부지의 자물쇠 라벨을 없애고 구입 버튼을 켠다.
   *   건설/철거 완료된 부지는 건너뛴다. 재진입 없이 즉시 반영.
   */
  private unlockLots(): void {
    if (!this.lotsUnlocked()) return;
    // 우 내측(lot2) — 간판 메시지를 '구입 가능'으로 바꾸고 구입 버튼 켜기.
    if (!this.lot2Built && this.lot2Ruin && !this.lot2Btn && !loadSave().lot2Demolished) {
      (this.lot2SignMsg as Phaser.GameObjects.Text | undefined)?.setText(this.lotSignMessage()); // lot2는 고유문구 없음 → 항상 Text.
      this.showLot2BuyButton();
    }
    // 사이드 부지.
    for (const lot of this.sideLots) {
      if (lot.built || lot.demolished || lot.btn || !lot.ruin) continue;
      if (!lot.signOverride) (lot.signMsg as Phaser.GameObjects.Text | undefined)?.setText(this.lotSignMessage()); // 고유 문구 부지는 유지, 그 외(단문 Text)만 '구입 가능!'.
      this.showSideBuyButton(lot);
    }
  }

  /** **부지 구입 활성 조건** — 메인타워가 최대(10)층까지 완공돼야 새 부지 구입이 열린다. */
  private lotsUnlocked(): boolean {
    return this.builtFloors >= MAX_FLOORS;
  }

  /** 빈 부지에 `🏗️ 1층 건설\n💎 ${diamondCostFor(1)}` 버튼(철거 후). */
  private showSideBuildButton(lot: SideLot): void {
    lot.btn = this.makeLotButton(lot.cx, LOT2_FLOOR1_Y - LOT2_FLOOR_H / 2 - 90, `🏗️ 1층 건설\n💎 ${diamondCostFor(1)}`, () => this.buildSideFloor1(lot), 240);
  }

  /** 사이드 부지 1층(서점 아트) 렌더 — 부지 cx·지면. 유리팬스 없음(1층 예외). */
  private renderSideFloor1(lot: SideLot, visible: boolean): { img: Phaser.GameObjects.Image; char?: Phaser.GameObjects.Image } | undefined {
    const key = 'up_Slitare_BG_02_01';
    if (!this.textures.exists(key)) return undefined;
    const y = LOT2_FLOOR1_Y;
    const depth = FLOOR_DEPTH_BASE + FLOOR_DEPTH_STEP; // 1층 depth(13).
    const img = this.add.image(lot.cx, y, key).setDisplaySize(LOT2_FLOOR_W, LOT2_FLOOR_H).setDepth(depth).setVisible(visible);
    this.pinToWorld(img);
    let char: Phaser.GameObjects.Image | undefined;
    const chKey = 'up_Solirare_Chr_02_01';
    if (this.textures.exists(chKey)) {
      char = this.add.image(lot.cx + LOT2_FLOOR_W * 0.22, y + LOT2_FLOOR_H * 0.16, chKey).setDepth(depth + 1.5).setVisible(visible);
      char.setDisplaySize(char.width * (245 / char.height), 245);
      this.pinToWorld(char);
    }
    lot.floor = { img, char };
    return { img, char };
  }

  /** 사이드 부지 **철거** = 폐건물 철거 연출 → **빈 부지**(1층 건설 버튼). */
  private demolishSide(lot: SideLot): void {
    if (lot.built || lot.demolished || this.constructing) return;
    this.constructing = true;
    sfx('button');
    for (const o of [lot.btn, lot.hint, lot.forSale, lot.sign, lot.signMsg]) {
      if (o) this.tweens.add({ targets: o, alpha: 0, duration: 300, onComplete: () => o.destroy() }); // 표지판·간판도 함께 페이드 제거.
    }
    lot.btn = undefined;
    lot.hint = undefined;
    lot.forSale = undefined;
    lot.sign = undefined;
    lot.signMsg = undefined;
    const ruin = lot.ruin;
    lot.ruin = undefined;
    this.panToSide(lot, 700);
    const done = (): void => {
      this.constructing = false;
      lot.demolished = true;
      const s = loadSave();
      s.sideDemolished = { ...(s.sideDemolished ?? {}), [lot.saveKey]: true };
      writeSave(s);
      this.showSideBuildButton(lot); // 빈 부지 → 1층 건설 버튼.
      this.toast('🏚️ 철거 완료 — 빈 부지', true);
    };
    if (!ruin) {
      done();
      return;
    }
    this.demolishRuin(ruin, done);
  }

  /** 빈 부지 → 1층 건설 — **다이아 비용**(10) 차감 + 렌더 + 등장 + 저장 + 팬. */
  private buildSideFloor1(lot: SideLot): void {
    if (lot.built) return;
    const cost = diamondCostFor(1);
    const sv = loadSave();
    if ((sv.diamonds ?? 0) < cost) {
      sfx('build_fail');
      this.toast(`💎 다이아가 부족해요 (필요 ${cost})`);
      return;
    }
    lot.built = true;
    if (lot.btn) {
      const b = lot.btn;
      this.tweens.add({ targets: b, alpha: 0, duration: 300, onComplete: () => b.destroy() });
      lot.btn = undefined;
    }
    sfx('button');
    const objs = this.renderSideFloor1(lot, false);
    if (objs) this.raiseLot2Floor(objs, 1); // 위에서 내려오며 등장(공용).
    this.constructFx(lot.cx, LOT2_FLOOR1_Y, LOT2_FLOOR_W); // 건설 연출(2단계 도구+먼지).
    this.addSideCustomer(lot);
    const s = loadSave();
    s.diamonds = Math.max(0, (s.diamonds ?? 0) - cost); // 다이아 차감.
    s.sideBuilt = { ...(s.sideBuilt ?? {}), [lot.saveKey]: true };
    writeSave(s);
    this.refreshHomeDiamond();
    this.panToSide(lot, 1100);
    this.toast('🏗️ 1층(서점) 건설!', true);
  }

  /** 카메라를 사이드 부지로 팬(현재 세로 유지, 가로만 이동). */
  private panToSide(lot: SideLot, dur: number): void {
    const cam = this.cameras.main;
    const y = Phaser.Math.Clamp(cam.scrollY, this.sideStageMinY(lot), this.scrollMax);
    cam.pan(lot.cx, y + H / 2, dur, 'Sine.easeInOut');
  }

  /** 사이드 스테이지 세로 스크롤 상한(폐건물/1층 상단 위 여백). 상단 간판이 지붕 위로 솟으므로 간판 상단도 포함. */
  private sideStageMinY(lot: SideLot): number {
    let top = lot.ruin ? lot.ruin.y - lot.ruin.displayHeight / 2 : LOT2_FLOOR1_Y - LOT2_FLOOR_H / 2;
    if (lot.sign) top = Math.min(top, lot.sign.y - lot.sign.displayHeight / 2); // 간판 상단까지 스크롤 허용.
    return Math.min(this.scrollMax, top - this.topMargin());
  }

  /** 사이드 부지 손님 스팟 — 전역 스포너가 랜덤 등장. */
  private addSideCustomer(lot: SideLot): void {
    const objs = lot.floor;
    if (!objs || this.customerSpots.some((s) => s.stage === lot.stage)) return;
    const clerk = objs.char;
    const groundY = clerk ? clerk.y + clerk.displayHeight * (1 - clerk.originY) : LOT2_FLOOR1_Y + LOT2_FLOOR_H * 0.4;
    const depth = objs.img.depth + 1.8;
    this.customerSpots.push({
      entryX: lot.cx - LOT2_FLOOR_W * 0.22,
      centerX: lot.cx,
      groundY,
      height: 233 * 0.92,
      depth,
      floor: 1,
      stage: lot.stage,
      coinYield: SIDE_LOT_YIELD[lot.stage] ?? 5, // 사이드 부지 상점별 수익성(부지마다 다름).
    });
  }

  /** 스테이지 스크롤 위치가 속한 사이드 부지(대략 반 화면 이내) — 세로 상한 판정용. */
  private sideLotForScrollX(sx: number): SideLot | undefined {
    return this.sideLots.find((l) => Math.abs(l.cx - W / 2 - sx) < LOT_DX / 2);
  }

  /**
   * **각 부지 건물 좌우에 프롭**(가로등·소화전·화분) — 타워 프롭(home.json) 오프셋/크기/depth 를 그대로 복제해
   *   부지 cx 좌우에 코드로 세운다. 접지 그림자도 함께. (부지는 항상 있는 거리 풍경이므로 건설 여부와 무관.)
   */
  private addLotProps(cx: number, behindTower = false): void {
    // **behindTower**(공공건물 오피스 부지) — 프롭(특히 소화전)이 타워 앞으로 튀어나오지 않게 **타워 뒤 레이어**로.
    //   오피스 1층 depth(floorDepth(1)=13) 미만으로 상한을 걸어 전부 건물 뒤에 둔다.
    const cap = behindTower ? this.floorDepth(1) - 1 : Infinity;
    const mk = (dx: number, y: number, w: number, h: number, key: string, depth: number): void => {
      if (!this.textures.exists(key)) return;
      const img = this.add.image(cx + dx, y, key).setDisplaySize(w, h).setDepth(Math.min(depth, cap));
      this.pinToWorld(img);
    };
    // 타워(중앙 550) 프롭의 상대 오프셋/크기/depth 를 그대로 사용.
    mk(-486, 1889, 79, 391, 'up_Slitare_BG_Item_01', 10); // 가로등 L
    mk(465, 1890, 79, 391, 'up_Slitare_BG_Item_01', 11); // 가로등 R
    mk(-422, 2024, 79, 119, 'up_Slitare_BG_Item_02', 12); // 소화전 L
    mk(404, 2024, 79, 119, 'up_Slitare_BG_Item_02', 14); // 소화전 R
    mk(-497, 2097, 112, 109, 'up_Slitare_BG_Item_04', 13); // 화분 L
    mk(479, 2094, 112, 113, 'up_Slitare_BG_Item_05', 15); // 화분 R
  }

  /** 저장된 스테이지2를 **즉시**(연출 없이) 그 높이까지 세운다 — 로드 복원용. */
  private restoreLot2(floors: number): void {
    this.lot2Built = true;
    this.lot2Floors = 0;
    for (let l = 1; l <= Math.min(MAX_FLOORS, floors); l++) {
      this.lot2Floors = l;
      const objs = this.renderLot2Floor(l, true);
      if (objs?.char) this.animateClerk(objs.char);
      this.addLot2Customer(l);
    }
    this.capLot2Roof();
    this.wireLot2BuildButton();
  }

  /** **임시저장**: 스테이지2 건설 상태 저장(건설/매입 시 호출). */
  private saveLot2(): void {
    const s = loadSave();
    s.lot2Built = this.lot2Built;
    s.lot2Floors = this.lot2Floors;
    s.lot2Owned = this.lot2Floors; // 건설=소유(스테이지2는 매입 단계 없음).
    writeSave(s);
  }

  /** 부지/건설 버튼 = **1번 스테이지와 동일한 UI_22(파란 버튼)** + 라벨(월드 오브젝트, 명멸 펄스). 탭 시 onTap. */
  private makeLotButton(x: number, y: number, label: string, onTap: () => void, bw = 200): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(61);
    const btn = this.add.image(0, 0, 'up_Solitare_UI_22');
    btn.setDisplaySize(bw, bw * (btn.height / btn.width));
    const fontSize = Math.round(bw * 0.13); // 버튼 폭에 비례한 라벨 크기.
    const t = this.add
      .text(0, 0, label, { fontFamily: 'sans-serif', fontSize: `${fontSize}px`, color: '#ffffff', fontStyle: 'bold', align: 'center' })
      .setOrigin(0.5);
    t.setShadow(2, 2, '#00000077', 3);
    c.add([btn, t]);
    // **자식 이미지에 직접 interactive**(컨테이너 히트영역 변환 이슈 회피 → 첫 탭 확실 작동). 스테이지1(Image+pointerdown)과 동일 방식.
    btn.setInteractive({ useHandCursor: true });
    btn.on('pointerdown', onTap);
    this.pinToWorld(c);
    this.tweens.add({ targets: c, scale: 1.05, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return c;
  }

  /**
   * **우측 부지 1층 건설** — 화면을 타워2 자리로 팬하면서 편의점(1층) 아트+점원을 페이드인으로 세운다.
   *   버튼/힌트는 제거. 이후 이 부지에도 위로 층을 쌓는 구조로 확장 가능(현재는 1층까지).
   */
  /** 층 높이(레벨) — 스테이지1 towerFloors 기준(양 스테이지 공통). */
  private floorHeight(level: number): number {
    return this.towerFloors[level - 1]?.node.h ?? LOT2_FLOOR_H;
  }
  /** 층 폭(레벨). */
  private floorWidth(level: number): number {
    return this.towerFloors[level - 1]?.node.w ?? LOT2_FLOOR_W;
  }

  /**
   * **통일 스택 y** — 1층=지면(FLOOR1_Y), 위로 **작은 균일 겹침(LOT2_SMALL_OVERLAP)**만큼만 침범하며 누적.
   *   두 스테이지가 동일하게 이 로직으로 쌓인다(스테이지2 기준을 스테이지1에도 적용).
   */
  private stackedFloorY(level: number): number {
    let y = LOT2_FLOOR1_Y;
    for (let l = 2; l <= level; l++) {
      y = y - this.floorHeight(l - 1) / 2 + LOT2_SMALL_OVERLAP - this.floorHeight(l) / 2;
    }
    return y;
  }

  /** 층 레이어(depth) — 논리적 순차(위층일수록 앞). 양 스테이지 공통. */
  private floorDepth(level: number): number {
    return FLOOR_DEPTH_BASE + level * FLOOR_DEPTH_STEP;
  }

  /** 스테이지2 층 기하 = 통일 스택(y/depth) + 스테이지1 동일 층 w/h. */
  private lot2FloorRef(level: number): { y: number; w: number; h: number; depth: number } {
    return { y: this.stackedFloorY(level), w: this.floorWidth(level), h: this.floorHeight(level), depth: this.floorDepth(level) };
  }

  /**
   * **스테이지1을 통일 스택으로 재조정** — 각 층 이미지·장식(유리·점원)을 stackedFloorY(겹침 통일)로 이동하고
   *   depth 를 floorDepth(논리적 순차)로 재설정한다. 이후 capRoof/normalizeClerkDepths/wireStoreButtons 가
   *   갱신된 위치·depth 를 사용한다(지붕·버튼 자동 정렬). → 스테이지1·2 가 동일 로직으로 쌓인다.
   */
  private restackStage1(): void {
    const n = this.towerFloors.length;
    for (let level = 1; level <= n; level++) {
      const entry = this.towerFloors[level - 1];
      const img = entry.obj as Phaser.GameObjects.Image;
      const newY = this.stackedFloorY(level);
      const dy = newY - entry.node.y;
      const newDepth = this.floorDepth(level);
      img.y += dy;
      img.setDepth(newDepth);
      const mn = entry.node as { y: number; depth: number }; // 런타임 노드는 가변(towerTop/버튼이 node.y 를 참조).
      mn.y = newY;
      mn.depth = newDepth;
      const dec = this.floorDecor.get(level);
      if (dec?.glass) {
        dec.glass.y += dy;
        dec.glass.setDepth(newDepth + 2);
      }
      if (dec?.char) {
        dec.char.y += dy;
        dec.char.setDepth(newDepth + 1.5); // 유리 있으면 normalizeClerkDepths 가 glass−0.5 로 다시 맞춤.
      }
    }
  }

  /** 스테이지2 층 중심 y(스테이지1 동일 층 기준). */
  private lot2FloorY(level: number): number {
    return this.lot2FloorRef(level).y;
  }

  /**
   * 스테이지2 한 층 렌더 — 아트(up_Slitare_BG_02_NN) + 점원(홀수=우·짝수=좌) + 유리팬스. built=false 면 숨겨 둔다.
   *   depth 는 층마다 위로(타워2는 x가 달라 타워1과 겹치지 않음). 반환 objs 는 건설 연출이 등장시킨다.
   */
  private renderLot2Floor(level: number, visible: boolean): { img: Phaser.GameObjects.Image; char?: Phaser.GameObjects.Image; glass?: Phaser.GameObjects.Image } | undefined {
    const key = `up_Slitare_BG_02_${pad2(level)}`;
    if (!this.textures.exists(key)) return undefined;
    const ref = this.lot2FloorRef(level); // 통일 스택 y/depth + 층 w/h.
    const y = ref.y;
    const fw = ref.w;
    const fh = ref.h;
    const depth = ref.depth;
    const img = this.add.image(LOT2_CX, y, key).setDisplaySize(fw, fh).setDepth(depth).setVisible(visible);
    this.pinToWorld(img);
    let char: Phaser.GameObjects.Image | undefined;
    const chKey = `up_Solirare_Chr_02_${pad2(level)}`;
    if (this.textures.exists(chKey)) {
      const side = level % 2 === 1 ? 1 : -1; // 홀수=우, 짝수=좌.
      char = this.add.image(LOT2_CX + side * fw * 0.22, y + fh * 0.16, chKey).setDepth(depth + 1.5).setVisible(visible);
      char.setDisplaySize(char.width * (245 / char.height), 245);
      this.pinToWorld(char);
    }
    // **1층은 앞 유리팬스 없음**(타워1 1층과 동일 예외). 2층+ 만 유리팬스.
    let glass: Phaser.GameObjects.Image | undefined;
    if (level !== 1 && this.textures.exists('up_Slitare_BG_Glass')) {
      glass = this.add.image(LOT2_CX, y + fh * 0.33, 'up_Slitare_BG_Glass').setDepth(depth + 2).setVisible(visible);
      glass.setDisplaySize(690, glass.height * (690 / glass.width));
      this.pinToWorld(glass);
      if (char) char.setDepth(glass.depth - 0.5); // 점원=유리 바로 뒤.
    }
    this.lot2FloorObjs.set(level, { img, char, glass });
    return { img, char, glass };
  }

  /** 스테이지2 지붕을 최상 건설층 위에 얹는다(층 늘 때마다 재배치). */
  private capLot2Roof(): void {
    if (this.lot2Floors < 1 || !this.textures.exists('up_Slitare_BG_roof_v2')) return;
    const ref = this.lot2FloorRef(this.lot2Floors);
    const roofY = ref.y - ref.h / 2 - LOT2_ROOF_H / 2 + LOT2_ROOF_OVERLAP; // 최상층 위(차양이 층 상단에 닿게 겹침).
    if (!this.lot2Roof) {
      this.lot2Roof = this.add.image(LOT2_CX, roofY, 'up_Slitare_BG_roof_v2').setDisplaySize(LOT2_ROOF_W, LOT2_ROOF_H);
      this.pinToWorld(this.lot2Roof);
    } else {
      this.lot2Roof.setPosition(LOT2_CX, roofY).setVisible(true);
    }
    const topDepth = this.lot2FloorObjs.get(this.lot2Floors)?.img.depth ?? 20;
    this.lot2Roof.setDepth(topDepth + 2.5); // 유리(+2)보다 위.
  }

  /** 스테이지2 'N층 건설' 버튼을 지붕 위에 배치·갱신(10층 완공 시 숨김). */
  private wireLot2BuildButton(): void {
    const next = this.lot2Floors + 1;
    if (next > MAX_FLOORS) {
      this.lot2BuildBtn?.setVisible(false);
      return;
    }
    const ref = this.lot2FloorRef(this.lot2Floors);
    const roofTop = this.lot2Roof ? this.lot2Roof.y - this.lot2Roof.displayHeight / 2 : ref.y - ref.h / 2;
    const by = roofTop - 30 - 66;
    const label = `${next}층 건설\n💎 ${diamondCostFor(next)}`; // 업그레이드 다이아 비용 표시.
    if (!this.lot2BuildBtn) {
      this.lot2BuildBtn = this.makeLotButton(LOT2_CX, by, label, () => this.buildLot2Next());
    } else {
      this.lot2BuildBtn.setPosition(LOT2_CX, by).setVisible(true);
      const t = this.lot2BuildBtn.list.find((o) => o instanceof Phaser.GameObjects.Text) as Phaser.GameObjects.Text | undefined;
      t?.setText(label);
    }
  }

  /** 카메라를 스테이지2 특정 층으로 부드럽게 팬(스테이지2 세로 범위 내 클램프). */
  private panToLot2Floor(level: number, dur: number): void {
    const cam = this.cameras.main;
    const y = Phaser.Math.Clamp(this.lot2FloorY(level) - H * 0.55, this.scrollMinYFor(true), this.scrollMax);
    cam.pan(LOT2_CX, y + H / 2, dur, 'Sine.easeInOut');
  }

  /** 한 층을 위에서 내려오며 페이드인(건설감) + 점원/유리 등장. */
  private raiseLot2Floor(objs: { img: Phaser.GameObjects.Image; char?: Phaser.GameObjects.Image; glass?: Phaser.GameObjects.Image }, _level: number): void {
    const y = objs.img.y; // 렌더된 안착 y(하단 연장 오프셋 반영).
    objs.img.setAlpha(0).setVisible(true);
    objs.img.y = y - 60;
    this.tweens.add({ targets: objs.img, y, alpha: 1, duration: 700, ease: 'Back.easeOut' });
    for (const o of [objs.char, objs.glass]) {
      if (!o) continue;
      o.setVisible(true).setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, duration: 700, delay: 250 });
    }
    if (objs.char) this.time.delayedCall(750, () => objs.char && this.animateClerk(objs.char));
  }

  /**
   * **우측 부지 1층 건설(스테이지2 시작)** — 화면을 타워2로 팬하고 서점(1층) 아트+점원을 세운다.
   *   이후 지붕 위 'N층 건설' 버튼으로 1번 스테이지와 **동일한 개념**으로 2~10층을 쌓는다.
   */
  private buildLot2Floor1(): void {
    if (this.lot2Built) return;
    const cost = diamondCostFor(1);
    const sv = loadSave();
    if ((sv.diamonds ?? 0) < cost) {
      sfx('build_fail');
      this.toast(`💎 다이아가 부족해요 (필요 ${cost})`);
      return;
    }
    this.lot2Built = true;
    this.lot2Floors = 1;
    // 매입/힌트 버튼 + 표지판 + 간판 제거(방어 — 보통 철거 시 이미 제거됨).
    for (const o of [this.lot2Btn, this.lot2Hint, this.lot2ForSale, this.lot2Sign, this.lot2SignMsg]) {
      if (o) this.tweens.add({ targets: o, alpha: 0, duration: 400, onComplete: () => o.destroy() });
    }
    this.lot2Btn = undefined;
    this.lot2Hint = undefined;
    this.lot2ForSale = undefined;
    this.lot2Sign = undefined;
    this.lot2SignMsg = undefined;
    sfx('button');
    const objs = this.renderLot2Floor(1, false);
    if (objs) this.raiseLot2Floor(objs, 1);
    this.constructFx(LOT2_CX, LOT2_FLOOR1_Y, LOT2_FLOOR_W); // 건설 연출(2단계 도구+먼지).
    this.capLot2Roof();
    this.wireLot2BuildButton();
    this.addLot2Customer(1); // 스테이지2 손님(stage=2 아이템).
    const dsv = loadSave();
    dsv.diamonds = Math.max(0, (dsv.diamonds ?? 0) - cost); // 다이아 차감.
    writeSave(dsv);
    this.refreshHomeDiamond();
    this.saveLot2(); // 임시저장.
    this.panToLot2Floor(1, 1100); // 타워2 1층 프레이밍(우측으로 이동).
    this.toast('🏗️ 2번 스테이지 1층(서점) 건설!', true);
  }

  /**
   * 스테이지2 다음 층 건설 — **1번 스테이지 runConstruction 과 동일한 연출**:
   *   ①줌아웃+포커스 상향(크레인 드러남)·옛 지붕 걷힘 → ②새 층·유리가 위에서 바운스 낙하(쿵+연기)
   *   → ③지붕 재-캡·크레인 퇴장 → ④점원 등장 → ⑤원래 줌 복귀+새 층 포커스 → ⑥완료.
   */
  private buildLot2Next(): void {
    if (this.constructing) return;
    const next = this.lot2Floors + 1;
    if (next > MAX_FLOORS) return;
    // **업그레이드 다이아 비용** — 부족하면 차단.
    const cost = diamondCostFor(next);
    const sv = loadSave();
    if ((sv.diamonds ?? 0) < cost) {
      sfx('build_fail');
      this.toast(`💎 다이아가 부족해요 (필요 ${cost})`);
      return;
    }
    this.constructing = true;
    this.lot2Floors = next;
    const dsv = loadSave();
    dsv.diamonds = Math.max(0, (dsv.diamonds ?? 0) - cost); // 다이아 차감.
    writeSave(dsv);
    this.refreshHomeDiamond();
    this.saveLot2(); // 임시저장(건설 확정).
    this.lot2BuildBtn?.setVisible(false); // 연출 중 버튼 숨김.

    const cam = this.cameras.main;
    const z0 = cam.zoom;
    const idleY = cam.midPoint.y;
    const ref = this.lot2FloorRef(next);
    const fh = ref.h;
    const fw = ref.w;
    const depth = 16 + next * 3;
    const node = { w: fw, h: fh };
    const objs = this.renderLot2Floor(next, false); // 숨긴 채 준비.
    if (!objs) {
      this.constructing = false;
      return;
    }
    const bld = objs.img;
    const finalY = bld.y; // 안착 y(=ref.y).
    const glassObj = objs.glass;
    const glassFinalY = glassObj?.y;
    const charObj = objs.char;
    const charFinalY = charObj?.y;
    const roof = this.lot2Roof;
    const crane = this.craneImg;

    // 크레인을 새 층 위(스테이지2 타워)로 배치.
    if (crane) {
      crane.x = LOT2_CX - crane.displayWidth * (HOOK_RATIO.x - 0.5);
      crane.y = finalY - LIFT_HOOK - crane.displayHeight * (HOOK_RATIO.y - 0.5);
      crane.setVisible(true).setAlpha(0);
    }

    sfx('button');
    // ① 줌아웃 + 포커스 상향(크레인 드러남) + 옛 지붕 걷힘 + 크레인 페이드인.
    const conZoom = Math.max(z0 * MIN_CAMERA_ZOOM, this.minZoomForGround(idleY - H / 2));
    cam.zoomTo(conZoom, 820, 'Sine.easeInOut');
    cam.pan(LOT2_CX, idleY - 220, 820, 'Sine.easeInOut');
    if (crane) this.tweens.add({ targets: crane, alpha: 1, duration: 460, ease: 'Sine.easeOut' });
    if (roof) this.tweens.add({ targets: roof, y: roof.y - 200, alpha: 0, duration: 460, ease: 'Sine.easeIn' });

    // ② 새 층·유리 낙하(바운스) + 케이블 + 쿵 + 가로 연기.
    this.time.delayedCall(900, () => {
      bld.setAlpha(0).setVisible(true);
      bld.y = finalY - FLOOR_LIFT;
      this.tweens.add({ targets: bld, alpha: 1, duration: 200 });
      if (glassObj && glassFinalY != null) {
        glassObj.setAlpha(0).setVisible(true);
        glassObj.y = glassFinalY - FLOOR_LIFT;
        this.tweens.add({ targets: glassObj, alpha: 1, duration: 200 });
        this.tweens.add({ targets: glassObj, y: glassFinalY, duration: 780, ease: 'Bounce.easeOut' });
      }
      this.cablesGfx?.setVisible(true).setAlpha(1);
      this.tweens.add({
        targets: bld,
        y: finalY,
        duration: 780,
        ease: 'Bounce.easeOut',
        onUpdate: () => this.redrawCables(bld, node),
        onComplete: () => {
          cam.shake(240, 0.01); // 쿵.
          sfx('build');
          this.emitSmokeBand(LOT2_CX, finalY + fh * 0.5, fw * 0.92, depth + 3);
          this.tweens.add({ targets: this.cablesGfx, alpha: 0, duration: 240, onComplete: () => this.cablesGfx?.clear().setVisible(false).setAlpha(1) });
        },
      });
    });

    // ③ 지붕 재-캡(새 최상층) + 크레인 퇴장.
    this.time.delayedCall(1860, () => {
      this.capLot2Roof();
      const r = this.lot2Roof;
      if (r) {
        const ry = r.y;
        r.setAlpha(1);
        r.y = ry - 170;
        this.tweens.add({ targets: r, y: ry, duration: 440, ease: 'Bounce.easeOut' });
      }
      if (crane) this.tweens.add({ targets: crane, alpha: 0, y: crane.y - 60, duration: 480, ease: 'Sine.easeIn', onComplete: () => crane.setVisible(false) });
    });

    // ④ 점원 등장(살짝 튀어오르며) + idle 애니.
    this.time.delayedCall(2360, () => {
      if (charObj && charFinalY != null) {
        charObj.setAlpha(0).setVisible(true);
        charObj.y = charFinalY - 44;
        this.tweens.add({ targets: charObj, y: charFinalY, alpha: 1, duration: 340, ease: 'Back.easeOut', onComplete: () => this.animateClerk(charObj) });
      }
    });

    // ⑤ 원래 줌 복귀 + 새 층 포커스.
    this.time.delayedCall(2760, () => {
      cam.zoomTo(z0, 1400, 'Sine.easeInOut');
      const target = Phaser.Math.Clamp(finalY - H * 0.55, this.scrollMinYFor(true), this.scrollMax);
      cam.pan(LOT2_CX, target + H / 2, 1400, 'Sine.easeInOut');
    });

    // ⑥ 완료(버튼 재배선·손님 추가·잠금 해제).
    this.time.delayedCall(4400, () => {
      this.wireLot2BuildButton();
      this.addLot2Customer(next);
      this.constructing = false;
      if (next >= MAX_FLOORS) this.toast('🏙️ 2번 스테이지 완공! (10층)', true);
    });
  }

  /** 스테이지2 층에 손님 스팟 추가(stage=2 → 그 층 아이템 세트). 전역 스포너(customerSpots)가 랜덤 등장시킴. */
  private addLot2Customer(level: number): void {
    const objs = this.lot2FloorObjs.get(level);
    if (!objs || this.customerSpots.some((s) => s.stage === 2 && s.floor === level)) return;
    const ref = this.lot2FloorRef(level);
    const side = level % 2 === 1 ? 1 : -1; // 점원 위치(홀=우) → 손님은 반대편.
    const clerk = objs.char;
    const groundY = clerk ? clerk.y + clerk.displayHeight * (1 - clerk.originY) : ref.y + ref.h * 0.4;
    const depth = objs.glass ? objs.glass.depth - 0.3 : objs.img.depth + 1.8;
    this.customerSpots.push({
      entryX: LOT2_CX - side * ref.w * 0.22, // 점원 반대편 끝자리.
      centerX: LOT2_CX,
      groundY,
      height: 233 * 0.92,
      depth,
      floor: level,
      stage: 2,
      coinYield: visitYieldFor(level), // 스테이지2 도 층별 수익성 동일 곡선.
    });
  }

  /**
   * **접지 그림자 배치** — 현재 배치된 건물(타워 base)·가로등·소화전·화분 발밑에 부드러운 타원 그림자.
   *   소품은 자기 depth 바로 뒤, 건물은 소품보다 뒤(지면 레이어)로 깔아 소품이 그림자 위에 서게 한다.
   *   (자동차 그림자는 이동을 따라야 하므로 cars.ts 에서 컨테이너에 함께 붙인다.)
   */
  private applyPropShadows(idx: LayoutIndex): void {
    const pick = (re: RegExp): Phaser.GameObjects.Image[] =>
      idx.entries().filter((e) => re.test(e.node.name ?? '')).map((e) => e.obj as Phaser.GameObjects.Image);

    for (const o of pick(/가로등/)) this.pinToWorld(addContactShadow(this, o, { widthScale: 1.05, thickness: 0.5, alpha: 0.5, lift: 0.42 }));
    for (const o of pick(/소화전/)) this.pinToWorld(addContactShadow(this, o, { widthScale: 1.3, thickness: 0.55, alpha: 0.52, lift: 0.5 }));
    for (const o of pick(/화분/)) this.pinToWorld(addContactShadow(this, o, { widthScale: 1.2, thickness: 0.45, alpha: 0.52, lift: 0.48 }));

    // 건물 = 타워 최하층(가장 아래) base. **건물(d16) 폭과 같으면 건물 뒤에 가려지므로**, 건물보다 조금 넓게 +
    //   base 아래(보도) 로 내려(lift 음수) 보도에 드리운 부분이 보이게 한다. depth 는 소품보다 뒤(6.5).
    let base: { obj: Phaser.GameObjects.Image; y: number } | undefined;
    for (const f of this.towerFloors) {
      const o = f.obj as Phaser.GameObjects.Image;
      if (o.visible && (!base || f.node.y > base.y)) base = { obj: o, y: f.node.y };
    }
    if (base) this.pinToWorld(addContactShadow(this, base.obj, { widthScale: 1.12, thickness: 0.13, alpha: 0.4, lift: -0.35, depth: 6.5 }));
  }

  /**
   * 줌아웃이 **도로(지면) 바닥 아래를 드러내지 않는 최소 줌** — 뷰포트 바닥(월드)이 groundBottom 을 넘지 않게.
   *   뷰포트 바닥 = (scrollY + H/2) + (H/2)/z ≤ groundBottom → z ≥ (H/2)/(groundBottom - scrollY - H/2).
   *   지면 근처(scrollY≈scrollMax)에선 ≈1(줌아웃 거의 없음), 위로 올라갈수록 여유가 생겨 줌아웃 허용.
   */
  private minZoomForGround(scrollY: number): number {
    const denom = this.groundBottom() - scrollY - H / 2;
    if (denom <= 0) return 1;
    return Math.min(1, H / 2 / denom);
  }

  /**
   * **원경 하단 화면 바닥 고정** — 원경은 패럴랙스로 거의 안 움직이지만, 스크롤 전 범위에서 이미지 바닥이
   *   화면 밑(H) 아래에 **항상** 머물러야 한다(하단 경계선/틈 노출 방지). scrollFactor 를 고려한 최소 필요 바닥
   *   = scrollMax*factor + H + 여유 를 **반드시 충족**하도록 부족할 때만 아래로 연장(상단 고정). 이미 충분하면 손대지 않아
   *   신장 0. 낮은 패럴랙스(0.0008)+도로 기준 scrollMax 라 실제 신장은 수 px 수준.
   */
  private coverFarBackground(idx: LayoutIndex): void {
    const far = idx.entries().find((e) => /원경/.test(e.node.name ?? ''))?.obj as
      | Phaser.GameObjects.Image
      | undefined;
    if (!far || !Number.isFinite(this.scrollMax)) return;
    const FAR_DROP = 70; // 원경을 약간 아래로 배치(사용자 요청) — 상단은 하늘이 덮어 여유 있음.
    far.y += FAR_DROP;
    const factor = Math.max(0, far.scrollFactorY);
    // 원경은 near-fixed(factor≈0)라 **줌아웃 시 화면 중심 기준으로 수축** → 바닥이 위로 뜬다.
    //   가장 깊은 줌아웃(MIN_CAMERA_ZOOM)에서도 원경 바닥이 화면 밑(H)을 덮으려면 월드 바닥 ≥ (H/2)(1+1/zoom).
    //   스크롤 항(scrollMax*factor)은 미미하지만 함께 취해 더 안전한 쪽으로. +여유 80.
    const zoomBottom = (H / 2) * (1 + 1 / MIN_CAMERA_ZOOM);
    const needBottom = Math.max(this.scrollMax * factor + H, zoomBottom) + 80;
    const topEdge = far.y - far.displayHeight / 2; // 상단은 고정(위로는 이미 충분히 덮음).
    const curBottom = far.y + far.displayHeight / 2;
    if (curBottom < needBottom) {
      const newH = needBottom - topEdge;
      far.displayHeight = newH; // 부족분만 아래로 연장(scaleY 증가).
      far.y = topEdge + newH / 2; // 상단 고정 유지.
    }
    this.hazeFarBackground(far); // 원경이 너무 선명하지 않게 뿌연(haze) 오버레이.
  }

  /**
   * **원경 흐림(haze)** — 원경이 너무 또렷하게 드러나지 않도록 그 앞에 옅은 반투명 안개막을 깐다.
   *   원경과 **같은 near-fixed 패럴랙스**로 붙여 함께 움직이고, depth 는 원경 바로 앞(중경/도로보다 뒤).
   *   블러 대신 흰빛 오버레이(대기원근·헤이즈)로 대비/채도를 낮춰 원근감을 준다(성능·호환 안전).
   */
  private hazeFarBackground(far: Phaser.GameObjects.Image): void {
    const b = far.getBounds();
    const haze = this.add
      .rectangle(b.centerX, b.centerY, b.width, b.height, 0xdfe8f2, 0.28)
      .setDepth((far.depth ?? 2) + 0.1)
      .setScrollFactor(far.scrollFactorX, far.scrollFactorY)
      .setBlendMode(Phaser.BlendModes.NORMAL);
    this.pinToWorld?.(haze); // 월드(mainCam) 레이어로 — uiCam 누수 방지.
  }

  /**
   * 에디터 저작 **점포 버튼(up_Solitare_UI_22 × 3)** 배선 + depth 정정.
   *   - 손님/말풍선/코인이 (floorDepth+1.8 ~ +50) 이라 depth 12~37 버튼을 **앞에서 가리던 문제** →
   *     버튼·라벨 depth 를 손님 코인(최대 floorDepth+50) 위로 올린다(월드 오브젝트 유지=타워와 함께 스크롤).
   *   - **최상단(y 최소) 버튼 = 건축**(다음 층 건설 연출). 나머지 = 매입(현재 준비중 토스트).
   */
  private wireStoreButtons(idx: LayoutIndex): void {
    const BTN_LIFT = 110; // 손님 코인(floorDepth+50, 최대 ~64) 위로 확실히.
    const PAIRS: ReadonlyArray<{ btn: string; label: string }> = [
      { btn: 'layer_8_copy', label: 'layer_10' },
      { btn: 'layer_8_copy2', label: 'layer_10_copy' },
      { btn: 'layer_8_copy3', label: 'layer_10_copy2' },
    ];
    const items: Array<{
      obj: Phaser.GameObjects.Image;
      x: number;
      y: number;
      label?: Phaser.GameObjects.Text;
    }> = [];
    for (const p of PAIRS) {
      const obj = idx.tryById<Phaser.GameObjects.Image>(p.btn);
      const node = idx.nodeById(p.btn);
      if (!obj || !node) continue;
      const label = idx.tryById<Phaser.GameObjects.Text>(p.label);
      const d = (node.depth ?? 0) + BTN_LIFT; // depth 정정 — 손님 위로(라벨은 버튼 +1).
      obj.setDepth(d);
      label?.setDepth(d + 1);
      items.push({ obj, x: node.x, y: node.y, label });
    }
    if (items.length === 0) return;
    const ordered = items.sort((a, b) => a.y - b.y);
    const buildItem = ordered[0]; // 최상단(건축) 버튼 = **건설용**(지붕 위).
    const purchaseByFloor = ordered.slice(1).sort((a, b) => b.y - a.y); // y 큰 순: [2층 매입, 3층 매입].
    this.atMaxFloor = this.builtFloors >= MAX_FLOORS; // 프레이밍 상단 여백을 크게(공간 확보).
    // **개념**: 건설된(보이는) 미소유 층이 있으면 그 층 **점포매입**(그 층 자리), 없으면 다음 미건설 층 **건설**(지붕 위).
    const purchaseStep = this.ownedFloors < this.builtFloors;
    const complete = !purchaseStep && this.builtFloors >= MAX_FLOORS;

    // 모든 버튼 초기화(숨김 + 리스너 제거).
    for (const it of items) {
      it.obj.removeAllListeners('pointerdown');
      it.obj.setVisible(false);
      it.label?.setVisible(false);
    }

    if (complete) {
      this.buildStoreBtn = buildItem.obj; // 완공 — 버튼 없음(프레이밍 기준만).
      this.buildStoreLabel = buildItem.label;
      buildItem.obj.disableInteractive();
    } else if (purchaseStep) {
      // ── **점포매입** — 대상 층의 매입 버튼을 **그 층 자리(저작 위치)**에 표시(지붕 위 X). ──
      const target = this.ownedFloors + 1;
      const it = purchaseByFloor[target - 2] ?? purchaseByFloor[0];
      it.obj.setPosition(it.x, it.y);
      it.label
        ?.setOrigin(0.5)
        .setPosition(it.x, it.y)
        .setText(`${target}층 점포매입\n💎 ${diamondCostFor(target)}`)
        .setAlign('center');
      it.obj.setVisible(true).setInteractive({ useHandCursor: true });
      it.label?.setVisible(true);
      it.obj.on('pointerdown', () => this.purchaseFloor(target));
      this.buildStoreBtn = it.obj;
      this.buildStoreLabel = it.label;
    } else {
      // ── **건설** — 다음 미건설 층. 건축 버튼을 **지붕 위**에. ──
      const target = Math.min(MAX_FLOORS, this.builtFloors + 1);
      const req = floorLevelReq(target); // **레벨 해금 요구치**(3층=10, 층당 10레벨).
      const playerLevel = loadSave().level;
      const locked = playerLevel < req;
      const roofObj = idx.entries().find((e) => /roof/i.test(e.node.key ?? ''))?.obj as Phaser.GameObjects.Image | undefined;
      const bx = roofObj ? roofObj.x : W / 2;
      const by = roofObj ? roofObj.y - roofObj.displayHeight / 2 - 30 - buildItem.obj.displayHeight / 2 : 319;
      buildItem.obj.setPosition(bx, by);
      // 레벨 미달이면 **잠금 표시**(🔒 Lv N), 충족이면 다이아 비용.
      buildItem.label
        ?.setOrigin(0.5)
        .setPosition(bx, by)
        .setText(locked ? `${target}층 건설\n🔒 Lv ${req}` : `${target}층 건설\n💎 ${diamondCostFor(target)}`)
        .setAlign('center');
      buildItem.obj.setVisible(true).setInteractive({ useHandCursor: true });
      buildItem.obj.setAlpha(locked ? 0.75 : 1);
      buildItem.label?.setVisible(true);
      buildItem.obj.on('pointerdown', () => {
        if (this.constructing) return;
        if (locked) {
          sfx('build_fail');
          this.toast(`🔒 레벨 ${req} 이상 필요\n(현재 레벨 ${playerLevel})`);
          return;
        }
        this.runConstruction(target, FLOOR_COST[target] ?? 0);
      });
      this.buildStoreBtn = buildItem.obj;
      this.buildStoreLabel = buildItem.label;
    }
  }

  /**
   * 층 **점포매입** — 이미 **건설된(보이는) 점포**를 소유한다(크레인·등장 없음). 비용 차감 + 성공 메시지 →
   *   상단 버튼이 다음 단계(**미건설 층 건설**)로 전환. (개념: 건설된 점포=매입, 미건설=건설.)
   */
  private purchaseFloor(level: number): void {
    if (this.constructing) return;
    // **점포매입 비용 = 다이아**(업그레이드와 동일 곡선). 부족하면 차단.
    const cost = diamondCostFor(level);
    const s = loadSave();
    if ((s.diamonds ?? 0) < cost) {
      sfx('build_fail');
      this.toast(`💎 다이아가 부족해요 (필요 ${cost})`);
      return;
    }
    this.ownedFloors = Math.max(this.ownedFloors, level); // 소유.
    s.diamonds = Math.max(0, (s.diamonds ?? 0) - cost); // 다이아 차감.
    s.ownedFloors = this.ownedFloors; // **임시저장**: 소유 상태 저장.
    writeSave(s);
    this.refreshHomeDiamond();
    sfx('build');
    this.toast(`${level}층 점포매입 성공!\n(💎 -${cost})`, true);
    if (this.layoutIdx) this.wireStoreButtons(this.layoutIdx); // 상단 버튼 재배선(→ "3층 건설").
    this.panToFloor(level, 900); // 매입한 층으로 부드럽게 포커스.
  }

  /** 카메라를 특정 층으로 **부드럽게 팬**(범위 내 클램프). 매입/건설 후 새 층 안착용. */
  private panToFloor(level: number, duration: number): void {
    const entry = this.towerFloors[level - 1];
    if (!entry) return;
    const cam = this.cameras.main;
    const target = Phaser.Math.Clamp(entry.node.y - H * 0.55, this.scrollMin, this.scrollMax);
    cam.pan(W / 2, target + H / 2, duration, 'Sine.easeInOut');
    this.prevScrollY = target; // 미세줌 튐 방지.
  }

  /**
   * 배경 **패럴랙스** — 카메라(월드) 스크롤·건설 포커싱 시 레이어별로 다른 속도로 따라 올라간다.
   *   근경=빠르게(카메라 바로 따라), 원경=아주 느리게, 하늘=가장 느리게. Phaser scrollFactor 로 구현.
   *   (UI 는 uiCam 이라 무관. 배경 레이어는 월드=mainCam 렌더.)
   */
  private applyParallax(idx: LayoutIndex): void {
    // **가로/세로 계수를 분리** — 세로(타워 상승)와 가로(부지 좌우 이동)의 패럴랙스를 독립 제어.
    const set = (re: RegExp, fx: number, fy: number = fx): void => {
      for (const e of idx.entries()) {
        if (re.test(e.node.name ?? '')) (e.obj as Phaser.GameObjects.Image).setScrollFactor(fx, fy);
      }
    };
    // 패럴랙스 계수(scrollFactor) — 0=화면에 고정, 1=카메라와 완전히 함께. factor>0 이면 **위로 스크롤(타워 상승)
    //   할수록 원경이 화면 아래로 내려온다**(자연스러운 원근 + 하단 커버). 0.0008 은 사실상 0이라 "적용 안 됨"으로 보였음.
    const PARALLAX_NEAR = 1.0; // 근경(도로) = 타워가 선 지면 → 카메라와 함께(하단 도로 끝선 이탈 방지).
    // 중경 가로/세로 계수는 모듈 상수(PARALLAX_MID_X/Y) 사용 — 중경 도로 통행과 공유.
    //   가로: 근경보다 느리게 흘러 붙어 이동 방지(중경 노드 폭 4341px라 가장자리 안 드러남).
    //   세로: 미세하게만(도로 가시 구간 |scrollY|≲516·겹침 여유 ~80px → fm≥0.94 유지 시 침범 없음).
    const PARALLAX_FAR = 0.04; // 원경 — 타워가 올라갈수록 아래로 약간씩 이동(눈에 보이되 과하지 않게).
    const PARALLAX_SKY = 0.02; // 하늘 — 원경보다 더 느리게(가장 먼 배경).
    set(/근경|도로/, PARALLAX_NEAR); // 도로(근경) 명시 고정(기본값과 동일하지만 의도 명확화).
    set(/중경/, PARALLAX_MID_X, PARALLAX_MID_Y);
    set(/원경/, PARALLAX_FAR);
    set(/하늘/, PARALLAX_SKY);
  }

  /**
   * 타워 **위아래 드래그 스크롤** — **목표(scrollTarget)로 부드럽게 수렴**(직선 X, 가속/감속) + 관성 + **이동 중 미세 줌**.
   *   드래그는 목표만 옮기고, 카메라는 매 프레임 목표로 lerp → 시작·정지가 부드럽게 이어진다. UI 는 uiCam 이라 안 움직임.
   */
  /** 스크롤 상·하한만 재계산(카메라는 건드리지 않음). */
  private computeScrollBounds(): void {
    if (!Number.isFinite(this.towerTop())) return;
    this.scrollMax = this.groundBottom() - H - BOTTOM_SAFE; // 하단 = 지면(근경 바닥) 안쪽.
    this.scrollMin = Math.min(this.scrollMax, this.buildButtonTop() - this.topMargin()); // 상단 = 버튼/지붕 위 여백.
  }

  /** 상·하한 재계산 + 현재 위치 클램프(초기/enableTowerScroll 용). */
  private updateScrollBounds(): void {
    this.computeScrollBounds();
    const cam = this.cameras.main;
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, this.scrollMin, this.scrollMax);
  }

  private enableTowerScroll(): void {
    const cam = this.cameras.main;
    if (!Number.isFinite(this.towerTop())) return;
    this.updateScrollBounds(); // 상·하한 + 초기(frameTower) 위치 클램프.
    this.scrollOn = true;
    this.updateLotArrows(); // 좌우 스테이지 이동 화살표 초기 표시 상태.
    this.scrollVel = 0;
    this.scrollTargetY = cam.scrollY;
    this.scrollTargetX = cam.scrollX;
    this.scrollBaseZoom = 1; // idle 줌 기준.
    this.prevScrollY = cam.scrollY;
    const LOCK = 14; // 축 확정 임계(px) — 이만큼 움직여야 방향 잠금.
    let lastY = 0;
    let lastX = 0;
    let startY = 0;
    let startX = 0;
    let axis: 'none' | 'x' | 'y' = 'none'; // 이 제스처의 잠긴 축(상하 or 좌우) — 한쪽만 반응.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.constructing) return;
      this.scrollDragging = true;
      this.scrollVel = 0;
      this.scrollVelX = 0;
      // 목표를 현재 카메라 위치에 재동기화(직전 관성/팬의 잔여로 튀지 않게).
      this.scrollTargetY = cam.scrollY;
      this.scrollTargetX = cam.scrollX;
      lastY = startY = p.y;
      lastX = startX = p.x;
      axis = 'none';
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.scrollDragging || !p.isDown || this.constructing) return;
      // **축 잠금**: 시작점 대비 누적 이동으로 지배 축을 정한다(정해지기 전엔 아무 것도 안 움직임 → 드리프트 방지).
      if (axis === 'none') {
        const tdx = Math.abs(p.x - startX);
        const tdy = Math.abs(p.y - startY);
        if (tdx > LOCK || tdy > LOCK) {
          if (tdx > tdy * 1.3) axis = 'x'; // 확실히 좌우일 때만 좌우.
          else if (tdy > tdx * 1.3) axis = 'y'; // 확실히 상하일 때만 상하.
          else return; // 애매하면 더 움직일 때까지 대기.
        } else {
          lastY = p.y;
          lastX = p.x;
          return;
        }
      }
      const dy = p.y - lastY;
      const dx = p.x - lastX;
      lastY = p.y;
      lastX = p.x;
      // **목표만 갱신** — 카메라는 update() 에서 목표로 부드럽게 수렴(1:1 즉시 이동의 딱딱함 제거).
      //   릴리스 관성 속도는 프레임 델타의 지수이동평균(EMA)으로 매끈하게(단일 프레임 노이즈 제거).
      if (axis === 'y') {
        this.scrollTargetY = Phaser.Math.Clamp(this.scrollTargetY - dy, this.currentScrollMinY(), this.scrollMax);
        this.scrollVel = this.scrollVel * 0.55 + -dy * 1.5 * 0.45;
      } else if (axis === 'x') {
        this.scrollTargetX = Phaser.Math.Clamp(this.scrollTargetX - dx, this.scrollMinX, this.scrollMaxX);
        this.scrollVelX = this.scrollVelX * 0.55 + -dx * 1.5 * 0.45;
      }
    });
    const stop = (): void => {
      if (this.scrollDragging && axis === 'x') this.snapToStage(); // 좌우 스와이프는 놓으면 스테이지로 스냅(확실한 이동).
      this.scrollDragging = false;
      axis = 'none';
    };
    this.input.on('pointerup', stop);
    this.input.on('pointerupoutside', stop);
  }

  /**
   * **좌우 스와이프 후 스테이지 스냅** — 릴리스 시 스와이프 속도/위치로 가까운 스테이지(scrollX 0 or LOT_DX)로 팬.
   *   빠른 스와이프면 방향대로 다음 스테이지, 느리면 가장 가까운 쪽. 좌우 관성 대신 확실한 스냅으로 "확실한 이동".
   */
  private snapToStage(): void {
    if (this.scrollMaxX <= 0 && this.scrollMinX >= 0) return;
    const cam = this.cameras.main;
    const cur = cam.scrollX;
    const step = LOT_DX; // 스테이지 = LOT_DX 배수(중앙0·내±LOT_DX·외±2LOT_DX).
    let idx = Math.round(cur / step); // 가장 가까운 스테이지.
    if (this.scrollVelX > 6) idx = Math.floor(cur / step) + 1; // 왼쪽으로 빠르게 밀면 다음(우측).
    else if (this.scrollVelX < -6) idx = Math.ceil(cur / step) - 1; // 오른쪽으로 빠르게 밀면 이전(좌측).
    const target = Phaser.Math.Clamp(idx * step, this.scrollMinX, this.scrollMaxX);
    this.scrollVelX = 0; // 좌우 관성 끄고 스냅으로만.
    // 대상 스테이지의 세로 범위로 scrollY 도 함께 클램프(짧은 스테이지로 가면 아래로 내려 빈 하늘 방지).
    const y = Phaser.Math.Clamp(cam.scrollY, this.scrollMinYForScrollX(target), this.scrollMax);
    // 살짝 길고 부드러운 감속 이징 — 좌우 스테이지 전환이 딱 끊기지 않고 미끄러지듯.
    cam.pan(target + W / 2, y + H / 2, 560, 'Cubic.easeOut');
  }

  /** 한 스테이지(LOT_DX)만큼 dir 방향으로 팬 — 좌우 스와이프 1회와 동일. 경계 밖이면 무시. */
  private panOneStage(dir: number): void {
    const cam = this.cameras.main;
    if (cam.panEffect?.isRunning || this.constructing) return;
    const step = LOT_DX;
    const curIdx = Math.round(cam.scrollX / step);
    const target = Phaser.Math.Clamp((curIdx + dir) * step, this.scrollMinX, this.scrollMaxX);
    if (Math.abs(target - cam.scrollX) < 1) return; // 더 갈 스테이지 없음.
    this.scrollVelX = 0;
    const yy = Phaser.Math.Clamp(cam.scrollY, this.scrollMinYForScrollX(target), this.scrollMax);
    this.scrollTargetX = target;
    this.scrollTargetY = yy;
    cam.pan(target + W / 2, yy + H / 2, 560, 'Cubic.easeOut');
  }

  /** 현재 스크롤 위치 기준으로 좌/우 스테이지 존재 여부에 따라 화살표 표시/숨김. */
  private updateLotArrows(): void {
    if (!this.leftArrow || !this.rightArrow) return;
    const sx = this.cameras.main.scrollX;
    this.leftArrow.setVisible(sx > this.scrollMinX + 2);
    this.rightArrow.setVisible(sx < this.scrollMaxX - 2);
  }

  /** scrollX 위치가 속한 스테이지의 세로 스크롤 상한(사이드 부지/우 내측 lot2/중앙 타워). */
  private scrollMinYForScrollX(sx: number): number {
    // **좌측 공공건물 타워 영역**(OFFICE_CX=-540) — 그 타워 높이 기준 세로 상한(5층이라 메인타워보다 높을 수 있어
    //   메인타워 기준으로 두면 위로 스크롤이 막힌다). 오피스 존을 먼저 판정.
    if (this.officeFloors.length > 0 && Math.abs(OFFICE_CX - W / 2 - sx) < LOT_DX / 2) {
      return Math.min(this.scrollMax, this.officeTop() - this.topMargin());
    }
    const side = this.sideLotForScrollX(sx);
    if (side) return this.sideStageMinY(side); // 사이드 부지(좌 내/외·우 외).
    return this.scrollMinYFor(sx >= LOT_DX / 2); // 우 내측(lot2) or 중앙(타워).
  }

  /**
   * 매 프레임 — ① 놓은 뒤 **관성(더 미끄러지듯 오래)** → ② **실제 이동 속도에 비례한 미세 줌**(움직일수록 더 축소, 멈추면 원복).
   *   드래그 중엔 손가락을 바로 따라가고(밀착), 놓으면 길게 미끄러진다. 건설 중엔 건너뜀(카메라 연출 우선).
   */
  update(): void {
    if (!this.scrollOn) return;
    const cam = this.cameras.main;
    this.updateLotArrows(); // 좌우 스테이지 존재 여부에 따라 화살표 표시/숨김(매 프레임).
    // 카메라 팬/줌 연출(snapToStage·panToFloor·건설) 중엔 수동 스크롤 개입 금지 — 연출이 scrollX/Y 를 소유.
    //   ⚠️ **constructing 체크보다 먼저** 목표를 카메라에 동기화한다 → 건설 완료(⑤ 층 포커스 팬) 직후
    //   낡은 목표로 되돌아가며 아래로 튀는 현상 방지(팬이 안착한 '맨 위층' 위치를 그대로 유지).
    if (cam.panEffect?.isRunning || cam.zoomEffect?.isRunning) {
      this.scrollTargetY = cam.scrollY;
      this.scrollTargetX = cam.scrollX;
      this.prevScrollY = cam.scrollY;
      return;
    }
    if (this.constructing) return;
    const minY = this.currentScrollMinY();
    if (this.scrollDragging) {
      // ① 드래그 — 카메라가 손가락 목표로 **부드럽게 수렴**(즉시 1:1 대신 미세 지연 → 가속/감속감).
      cam.scrollY += (this.scrollTargetY - cam.scrollY) * DRAG_FOLLOW;
      cam.scrollX += (this.scrollTargetX - cam.scrollX) * DRAG_FOLLOW;
    } else {
      // ② 관성 — 놓은 뒤 목표를 속도로 밀며 감속(길게 미끄러짐), 카메라는 목표로 수렴(정지 직전 부드럽게).
      if (Math.abs(this.scrollVel) >= 0.04) {
        const nt = Phaser.Math.Clamp(this.scrollTargetY + this.scrollVel, minY, this.scrollMax);
        if (nt === this.scrollTargetY) this.scrollVel = 0; // 경계 → 정지.
        this.scrollTargetY = nt;
        this.scrollVel *= SCROLL_FRICTION;
      } else {
        this.scrollVel = 0;
      }
      cam.scrollY += (this.scrollTargetY - cam.scrollY) * SETTLE_FOLLOW;
    }
    // ③ **이동 속도(실제 프레임 이동량)에 비례한 미세 줌** — 멈추면 원래(1)로 복귀.
    const speed = Math.abs(cam.scrollY - this.prevScrollY);
    this.prevScrollY = cam.scrollY;
    const wantZoom = this.scrollBaseZoom * (1 - Math.min(MICRO_ZOOM_OUT_MAX, speed * 0.006));
    // 줌아웃이 도로(지면) 바닥 아래를 드러내지 않도록 현재 스크롤 기준 최소 줌으로 하한 → 지면 근처선 거의 줌아웃 없음.
    const targetZoom = Math.max(wantZoom, this.minZoomForGround(cam.scrollY));
    cam.zoom += (targetZoom - cam.zoom) * 0.1;
  }

  /** 콘텐츠 **상단** = 보이는 최상단 층/지붕/건설버튼 중 가장 위(작은 y). */
  private towerTop(): number {
    let topY = Infinity;
    for (const f of this.towerFloors) {
      const o = f.obj as Phaser.GameObjects.Image;
      if (o.visible) topY = Math.min(topY, f.node.y - (f.node.h ?? 500) / 2);
    }
    const roof = this.layoutIdx?.entries().find((e) => /roof/i.test(e.node.key ?? ''))?.obj as Phaser.GameObjects.Image | undefined;
    if (roof?.visible) topY = Math.min(topY, roof.y - roof.displayHeight / 2);
    // 건설 버튼이 **보일 때만** 상단에 포함(최상층 완공 시 버튼 숨김 → 지붕 기준으로 일정 여백).
    if (this.buildStoreBtn?.visible) topY = Math.min(topY, this.buildStoreBtn.y - this.buildStoreBtn.displayHeight / 2);
    return topY;
  }

  /** 스테이지2 콘텐츠 상단(가장 위 층/지붕/버튼). **미건설(0층)이면** 폐건물+상단 간판(있으면) 기준, 없으면 지면. */
  private lot2Top(): number {
    if (this.lot2Floors < 1) {
      let t = this.lot2Ruin ? this.lot2Ruin.y - this.lot2Ruin.displayHeight / 2 : this.groundBottom();
      if (this.lot2Sign) t = Math.min(t, this.lot2Sign.y - this.lot2Sign.displayHeight / 2); // 간판 상단까지.
      return this.lot2Ruin ? t : this.groundBottom();
    }
    let topY = Infinity;
    for (const o of this.lot2FloorObjs.values()) if (o.img.visible) topY = Math.min(topY, o.img.y - o.img.displayHeight / 2);
    if (this.lot2Roof?.visible) topY = Math.min(topY, this.lot2Roof.y - this.lot2Roof.displayHeight / 2);
    if (this.lot2BuildBtn?.visible) topY = Math.min(topY, this.lot2BuildBtn.y - 66);
    return Number.isFinite(topY) ? topY : this.groundBottom();
  }

  /** 해당 스테이지의 **세로 상한(스크롤 최소 y)** — 그 스테이지의 건설 높이 기준. 안 지어졌으면 지면(상한=바닥). */
  private scrollMinYFor(atLot2: boolean): number {
    const top = atLot2 ? this.lot2Top() : this.towerTop();
    return Math.min(this.scrollMax, top - this.topMargin());
  }

  /** 현재 카메라가 있는 스테이지 기준 세로 상한(좌/중앙/우 위치로 스테이지 판정). */
  private currentScrollMinY(): number {
    return this.scrollMinYForScrollX(this.cameras.main.scrollX);
  }

  /**
   * 스크롤 **하단 한계**(지면) = **도로(보도블록)/근경** 레이어의 바닥.
   *   이 값으로 scrollMax 를 잡아, 스크롤을 끝까지 내려도 **도로 하단이 화면 밑에서 떨어지지 않게**(그 아래 틈 방지).
   *   예전엔 최하층+300 으로 잡아 실제 도로/원경 바닥(더 얕음)보다 깊게 스크롤 → 도로·원경이 화면 바닥에서 떴다.
   */
  private groundBottom(): number {
    const grounds = this.layoutIdx?.entries().filter((e) => /도로|근경/.test(e.node.name ?? '')) ?? [];
    let bot = -Infinity;
    for (const e of grounds) {
      const o = e.obj as Phaser.GameObjects.Image;
      bot = Math.max(bot, o.y + o.displayHeight / 2);
    }
    if (Number.isFinite(bot)) return bot;
    for (const f of this.towerFloors) bot = Math.max(bot, f.node.y + (f.node.h ?? 500) / 2);
    return Number.isFinite(bot) ? bot + 300 : H;
  }

  /**
   * 도로 자동차 통행 — 디자이너가 home.json 에 배치한 **참조 차(up_Car_0N)를 숨기고**, 그 위치/크기/depth 를
   *   기준으로 애니메이션 통행(cars.ts)으로 대체한다. depth 로 **두 도로를 분리**:
   *     · 근경(하단) 도로 = depth ≥ MID_ROAD_DEPTH_MAX (자동차1·2) → 카메라와 함께(패럴랙스 없음).
   *     · 중경(뒤쪽) 도로 = depth < MID_ROAD_DEPTH_MAX (자동차3) → **중경 레이어와 같은 패럴랙스**로 얹어
   *       스크롤/부지 팬 시에도 도로에서 벗어나지 않게 한다.
   *   참조 차가 없으면 근경 바닥 기준 단일 통행으로 폴백.
   */
  private startBottomCars(idx: LayoutIndex): void {
    const MID_ROAD_DEPTH_MAX = 20; // 이 미만 depth = 배경(중경) 도로 차.
    const refs = idx.entries().filter((e) => /up_Car_0/i.test(e.node.key ?? ''));
    refs.forEach((e) => (e.obj as Phaser.GameObjects.Image).setVisible(false)); // 참조 차는 숨김.
    const roadYOf = (list: typeof refs): number => Math.max(...list.map((e) => (e.node.y ?? 0) + (e.node.h ?? 0) / 2));
    const widthOf = (list: typeof refs): number => Math.max(...list.map((e) => e.node.w ?? 430));
    const depthOf = (list: typeof refs): number => Math.max(...list.map((e) => e.node.depth ?? 39));

    const near = refs.filter((e) => (e.node.depth ?? 0) >= MID_ROAD_DEPTH_MAX); // 근경(하단) 도로.
    const mid = refs.filter((e) => (e.node.depth ?? 0) < MID_ROAD_DEPTH_MAX); // 중경(뒤쪽) 도로.

    // **전체 주행 범위** — 최좌 스테이지 화면 좌단(scrollMinX) ~ 최우 스테이지 화면 우단(scrollMaxX+W).
    //   차량이 **왼쪽 끝에서 오른쪽 끝까지** 지나가고 중간에 사라지지 않도록 전 부지 폭을 덮는다.
    const worldMinX = this.scrollMinX;
    const worldW = this.scrollMaxX + W - this.scrollMinX;

    // 도로 구성 — 근경(하단)·중경(뒤쪽). **한 번에 한 대만, 매번 랜덤 도로**로 나오게 하나의 컨트롤러에 넘긴다.
    const roads: CarTrafficOpts[] = [];
    if (near.length > 0) {
      roads.push({ roadY: roadYOf(near), depth: depthOf(near), width: widthOf(near), worldMinX, worldW });
    }
    // **중경(뒤쪽) 도로** — 먼 배경 건물 앞·가로등/타워 뒤(MID_ROAD_CAR_DEPTH). 패럴랙스 미적용(정위치).
    if (mid.length > 0) {
      roads.push({ roadY: roadYOf(mid), depth: MID_ROAD_CAR_DEPTH, width: widthOf(mid), worldMinX, worldW });
    }
    if (roads.length === 0) {
      // 참조 차가 전혀 없을 때만 폴백(근경 바닥).
      roads.push({ roadY: this.groundBottom() - 80, depth: 4, width: 300, worldMinX, worldW });
    }
    // **한 대씩·랜덤 도로** — 한 대가 끝나야 다음 대(랜덤 도로)가 나온다 → 앞/뒤 동시 등장 없음.
    startRoadsTraffic(this, roads);
  }

  /** 건설 버튼 상단 y(버튼이 보일 때만; 최상층 완공 등 숨김 시 최상층/지붕 기준). 프레이밍·스크롤 상한 기준. */
  private buildButtonTop(): number {
    // towerTop 이 이미 **보이는 건설 버튼**을 포함(건설=지붕 위 버튼이 최상단, 매입=버튼이 층 위라 지붕이 최상단).
    return this.towerTop();
  }

  /** 상단 여백 — 최상층 완공 시엔 넉넉히(MAX_TOP_MARGIN), 그 외엔 HEADER_MARGIN. */
  private topMargin(): number {
    return this.atMaxFloor ? MAX_TOP_MARGIN : HEADER_MARGIN;
  }

  /**
   * 카메라(월드) idle 배치 — **항상 zoom 1(축소하지 않는다. 축소는 건설 연출 때만).**
   *   초기엔 **상단(건설 버튼/지붕) 아래 여백** 확보 + **뷰 하단이 지면(근경) 밖으로 안 나가게**.
   *   **방금 건설한 층이 있으면 그 층에 포커스**(층 중심을 화면 중상단) — 건설 후 위아래로 튀지 않고 건설된 층에 안착.
   */
  private frameTower(): void {
    const cam = this.cameras.main;
    cam.setZoom(1); // ★ idle 은 원본 배율 고정.
    if (!Number.isFinite(this.towerTop())) return;
    const bottomAligned = this.groundBottom() - H - BOTTOM_SAFE; // 지면 하단(끝선 안 넘게).
    const topAligned = this.buildButtonTop() - this.topMargin(); // 건설 버튼/최상층 지붕 위 여백(스크롤 상한).
    const built = this.justBuiltLevel ? this.towerFloors[this.justBuiltLevel - 1] : undefined;
    if (built) {
      // 방금 지은 층 중심을 화면 ~55% 지점에(상한/하한 범위 내). → 건설된 층에 맞춰 안착.
      const focus = built.node.y - H * 0.55;
      cam.setScroll(0, Phaser.Math.Clamp(focus, topAligned, bottomAligned));
    } else {
      cam.setScroll(0, Math.min(bottomAligned, topAligned)); // 기본: 상단 여백 확보 + 하단 안 벗어남.
    }
  }

  /** 월드/UI 카메라 분리 — mainCam=월드(줌·스크롤), uiCam=UI(고정). 이후 생성물은 pinToWorld/pinToUi 로 분류. */
  private setupCameras(): void {
    const uiCam = this.cameras.add(0, 0, W, H);
    uiCam.setScroll(0, 0);
    this.uiCam = uiCam;
    const uiSet = new Set(this.uiObjects);
    for (const o of this.children.list) {
      if (uiSet.has(o)) this.cameras.main.ignore(o); // UI 는 월드 카메라서 제외.
      else uiCam.ignore(o); // 월드는 UI 카메라서 제외.
    }
  }

  /** 월드 오브젝트(타워·연출·손님 등) — mainCam 만 렌더(줌·스크롤 따라감). uiCam 에서 제외. (손님 등 외부 생성물도 호출) */
  pinToWorld(o?: Phaser.GameObjects.GameObject): void {
    if (o) this.uiCam?.ignore(o);
  }

  /** UI 오브젝트(오버레이·토스트 등) — uiCam 만 렌더(고정). mainCam 에서 제외. */
  private pinToUi(o?: Phaser.GameObjects.GameObject): void {
    if (o && this.uiCam) this.cameras.main.ignore(o);
  }

  /**
   * 레이아웃 층 노드(1..B) 위로 **동적 층(B+1..)**을 코드로 쌓는다. 층 아트(up_Slitare_BG_0N)를 레이아웃 최상단
   *   층과 같은 폭·세로피치로 올리고, 건설된 층은 유리+캐릭터를, 다음 건설 대상은 실루엣+건설버튼을 붙인다.
   *   ⚠️ 현재 화면 한 장에 들어오는 높이까지만 자연스럽다(아주 높은 탑은 스크롤/축소가 후속 과제).
   */
  private renderDynamicFloors(): void {
    const base = this.towerFloors;
    const B = base.length;
    if (B < 2) return;
    const top = base[B - 1].node;
    const fw = top.w ?? 832; // 폭·높이는 **바로 아래층과 동일**(아래폭 일치).
    const fh = top.h ?? 517;
    const fx = top.x;
    let prevTopEdge = top.y - fh / 2; // 바로 아래(최상단 레이아웃) 층의 상단 edge.
    // **4~10층 전부 미리 렌더**(미건설은 숨김) → 건설 시 제자리에서 등장(재시작 없이 부드럽게).
    for (let level = B + 1; level <= MAX_FLOORS; level++) {
      const key = this.floorArtVersion(level);
      if (!key) continue;
      // 이 층의 **하단이 아래층 상단을 DYN_FLOOR_OVERLAP 만큼 침범** → 틈 없이 약간 겹침.
      const y = prevTopEdge - fh / 2 + DYN_FLOOR_OVERLAP;
      const depth = 11 + (level - B) * 5; // 레이아웃 최상단(11) 위로.
      const img = this.add.image(fx, y, key).setDepth(depth);
      img.setDisplaySize(fw, fh);
      const node = { id: `dynfloor_${level}`, type: 'image', key, x: fx, y, w: fw, h: fh, depth };
      const built = level <= this.builtFloors;
      const decor = this.addDynamicDecor(level, fx, y, fw, fh, depth, built);
      this.floorDecor.set(level, decor);
      prevTopEdge = y - fh / 2; // 다음(더 위) 층은 이 층 상단 위로 쌓인다.
      img.setAlpha(1).setVisible(built); // 건설된 층만 표시(미건설은 숨김, 건설 연출서 등장).
      if (built && decor.char) this.animateClerk(decor.char, (level - 1) * 300); // 건설된 동적 점원 idle 애니.
      this.towerFloors.push({ node, obj: img } as unknown as LayoutEntry);
    }
  }

  /**
   * 층 아트 텍스처 키 — **최신 버전(_v3 > _v2 > base) 우선**. 6~10층은 아트가 5종뿐이라 **순환**(2~5 재사용,
   *   1층 로비는 제외)해 데모용으로 채운다. 없으면 undefined.
   */
  private floorArtVersion(level: number): string | undefined {
    // **층별 지정 아트**(BG_01~10, 순환 아님) — 최신 버전(_v3>_v2>base) 우선. 예: 4층=라멘 BG_04_v3.
    const p = pad2(level);
    const cands = [`up_Slitare_BG_${p}_v3`, `up_Slitare_BG_${p}_v2`, `up_Slitare_BG_${p}`];
    const found = cands.find((k) => this.textures.exists(k));
    if (found) return found;
    const fb = floorArtKey(level);
    return this.textures.exists(fb) ? fb : undefined;
  }

  /**
   * **모든 층 점원을 자기 층 유리팬스 바로 뒤(glass.depth − 0.5)로 정규화**한다.
   *   에디터 저작 3층 점원(Chr_03)이 유리팬스보다 위 depth 로 저작돼 **유리 위로 올라오던** 문제를 코드로 교정.
   *   동적 층 점원은 이미 유리 뒤라 무영향(멱등). 위치는 그대로(홀·짝 좌우 규칙 유지).
   */
  private normalizeClerkDepths(): void {
    for (const dec of this.floorDecor.values()) {
      if (dec.char && dec.glass) dec.char.setDepth(dec.glass.depth - 0.5);
    }
  }

  /** 동적 층의 유리·점원(레이아웃 층의 상대 오프셋을 모사). built=false 면 숨겨 두고 건설 연출이 등장시킨다. */
  private addDynamicDecor(
    level: number,
    fx: number,
    fy: number,
    fw: number,
    fh: number,
    depth: number,
    built: boolean,
  ): { glass?: Phaser.GameObjects.Image; char?: Phaser.GameObjects.Image } {
    let glass: Phaser.GameObjects.Image | undefined;
    const glassDepth = depth + 2;
    if (this.textures.exists('up_Slitare_BG_Glass')) {
      glass = this.add.image(fx, fy + fh * 0.33, 'up_Slitare_BG_Glass').setDepth(glassDepth);
      glass.setDisplaySize(690, glass.height * (690 / glass.width));
      glass.setVisible(built);
    }
    // **층별 지정 점원(Chr_NN)** — 예: 4층 라멘집 점원 up_Solirare_Chr_04. 아트엔 사람이 없어 코드로 카운터에 세운다.
    //   배치: **홀수 층=오른쪽, 짝수 층=왼쪽**(1층 우·2층 좌… 규칙). depth = 유리 바로 뒤(유리팬스 뒤·건물 앞).
    let char: Phaser.GameObjects.Image | undefined;
    const charKey = `up_Solirare_Chr_${pad2(level)}`;
    if (this.textures.exists(charKey)) {
      const side = level % 2 === 1 ? 1 : -1; // 홀수=오른쪽(+), 짝수=왼쪽(−).
      const charX = fx + side * fw * 0.22; // 중심서 ~±185 (아래층 점원과 동일).
      char = this.add.image(charX, fy + fh * 0.16, charKey).setDepth(glassDepth - 0.5);
      char.setDisplaySize(char.width * (245 / char.height), 245); // 아래층 점원 키(~240)에 맞춤.
      char.setVisible(built);
    }
    return { glass, char };
  }

  /**
   * 크레인 + 케이블 준비 — **평소엔 숨김**(건설 연출 중에만 표시). 레이아웃에 Crane 노드가 있으면 재사용,
   *   없으면(home.json) 코드로 만든다.
   */
  private setupCrane(): void {
    const idx = this.layoutIdx;
    if (!idx) return;
    const existing = idx.entries().find((e) => /Crane/i.test(e.node.key ?? ''));
    if (existing) {
      // 에디터 배치 크레인 — 위치는 그대로 쓰되, **중경(depth 6) 앞으로** depth 를 끌어올린다(가림 방지).
      this.craneImg = existing.obj as Phaser.GameObjects.Image;
      this.craneIsLayout = true;
      if (((existing.obj as Phaser.GameObjects.Image).depth ?? 0) < CRANE_DEPTH) {
        (existing.obj as Phaser.GameObjects.Image).setDepth(CRANE_DEPTH);
      }
    } else if (this.textures.exists(CRANE_KEY)) {
      const img = this.add.image(CRANE_CX, CRANE_CY, CRANE_KEY).setDepth(CRANE_DEPTH);
      img.setScale(CRANE_W / img.width);
      this.craneImg = img;
      this.craneIsLayout = false;
    }
    // 크레인은 **건설 연출 중에만** 등장(평소 숨김). 에디터 크레인은 위치(건물 뒤·아래층에 붙음)만 유지.
    this.craneImg?.setVisible(false);
    this.cablesGfx = this.add.graphics().setDepth(CABLE_DEPTH).setVisible(false);
  }

  /** 크레인 고리(케이블 시작점) — 크레인 이미지 내 HOOK_RATIO 위치(원점 0.5 기준 보정). */
  private hookPoint(): { x: number; y: number } {
    const c = this.craneImg;
    if (!c) return { x: CRANE_CX, y: CRANE_CY };
    const left = c.x - c.displayWidth * c.originX;
    const top = c.y - c.displayHeight * c.originY;
    return { x: left + c.displayWidth * HOOK_RATIO.x, y: top + c.displayHeight * HOOK_RATIO.y };
  }

  /**
   * 고리 → **들어올리는 층(obj)의 시각 4개 모서리** 케이블(약간 굵은 검은 선) + 고리 매듭.
   *   obj 의 **현재 위치**로 그려서 층이 내려오는 동안 케이블이 따라온다(연결 유지).
   */
  private redrawCables(obj: Phaser.GameObjects.Image, node: { w?: number; h?: number }): void {
    const g = this.cablesGfx;
    if (!g) return;
    g.clear();
    const hook = this.hookPoint();
    const w = node.w ?? 800;
    const h = node.h ?? 500;
    const corners = [
      { x: obj.x - w * BLD_HALF, y: obj.y - h * BLD_TOP },
      { x: obj.x + w * BLD_HALF, y: obj.y - h * BLD_TOP },
      { x: obj.x - w * BLD_HALF, y: obj.y + h * BLD_BOT },
      { x: obj.x + w * BLD_HALF, y: obj.y + h * BLD_BOT },
    ];
    g.lineStyle(CABLE_W, CABLE_COLOR, 0.92);
    for (const c of corners) {
      g.beginPath();
      g.moveTo(hook.x, hook.y);
      g.lineTo(c.x, c.y);
      g.strokePath();
    }
    g.fillStyle(CABLE_COLOR, 1);
    g.fillCircle(hook.x, hook.y, CABLE_W * 1.1); // 고리 매듭 — 케이블 시작점을 덮어 연결감.
  }

  /** 특정 층 노드에 가장 가까운(중심 y 최근접) 장식 엔트리(유리/캐릭터). */
  private nearestEntry(floorNode: { y: number }, re: RegExp): LayoutEntry | undefined {
    const idx = this.layoutIdx;
    if (!idx) return undefined;
    return idx
      .entries()
      .filter((e) => re.test(e.node.key ?? ''))
      .sort((a, b) => Math.abs(a.node.y - floorNode.y) - Math.abs(b.node.y - floorNode.y))[0];
  }

  /**
   * 타워건설 연출 — ①줌아웃+포커스 상향(크레인 드러남)·옛 지붕 걷힘 → ②새 층·유리가 위에서 낙하(쿵) →
   *   ③캐릭터 등장 → ④지붕 재-캡 + 카메라 복귀 → ⑤저장·정착(restart).
   *   레이아웃/타워 정보가 없으면(플레이스홀더 경로) 즉시 반영으로 폴백.
   */
  private runConstruction(level: number, cost: number): void {
    if (this.constructing) return;
    const s = loadSave();
    // **레벨 해금 요구치** — 미달이면 차단(3층=Lv10, 층당 10레벨).
    const req = floorLevelReq(level);
    if (s.level < req) {
      sfx('build_fail');
      this.toast(`🔒 레벨 ${req} 이상 필요 (현재 ${s.level})`);
      return;
    }
    // **건물 건설/업그레이드 비용 = 다이아**(처음 10, 단계별 증가). 부족하면 차단.
    const dCost = diamondCostFor(level);
    if ((s.diamonds ?? 0) < dCost) {
      sfx('build_fail');
      this.toast(`💎 다이아가 부족해요 (필요 ${dCost})`);
      return;
    }
    const idx = this.layoutIdx;
    const entry = this.towerFloors[level - 1];
    if (!idx || !entry) {
      this.finishConstruction(level, cost);
      return;
    }
    this.constructing = true;
    this.buildBtn?.destroy();
    this.buildBtn = undefined;
    this.buildStoreBtn?.setVisible(false); // 에디터 건축 버튼·라벨은 연출 중 숨김(완료 후 그 층은 건설됨).
    this.buildStoreLabel?.setVisible(false);

    const cam = this.cameras.main;
    const z0 = cam.zoom; // idle(원래) 줌 — 배치 후 이 값으로 되돌린다(원래대로 확대).
    const idleY = cam.midPoint.y; // idle 카메라 세로 중심.
    const bld = entry.obj as Phaser.GameObjects.Image;
    const node = entry.node;
    const fh = node.h ?? 500;
    const fw = node.w ?? 800;
    const finalY = bld.y; // 에디터에서 조정한 4층 최종 위치.
    const roof = idx.entries().find((e) => /roof/i.test(e.node.key ?? ''))?.obj as Phaser.GameObjects.Image | undefined;

    // 유리팬스 = **템플릿의 4층 유리(layer_6_copy3, 지붕 자리에 미리 있던 것)를 그대로 등장**시킨다(중복 생성 X).
    const glassObj = this.floorDecor.get(level)?.glass;
    const glassFinalY = glassObj?.y ?? finalY + fh * 0.33;
    // **층 점원** = addDynamicDecor 가 만들어 둔 Chr_0{level}(예: 4층 라멘 점원 Chr_04). 지붕이 씌워진 뒤 등장.
    //   (라멘 아트엔 사람이 없어 코드 점원을 세운다. 별도 신규 생성 X — 중복 방지.)
    const charObj = this.floorDecor.get(level)?.char;
    const charFinalY = charObj?.y ?? finalY + fh * 0.16;

    // 크레인은 **건설 중에만** 등장. 에디터 크레인은 위치(건물 뒤·아래층에 붙음) 유지, 코드 폴백만 새 층 위로 재배치.
    const crane = this.craneImg;
    if (crane) {
      if (!this.craneIsLayout) {
        crane.x = node.x - crane.displayWidth * (HOOK_RATIO.x - 0.5);
        crane.y = finalY - LIFT_HOOK - crane.displayHeight * (HOOK_RATIO.y - 0.5);
      }
      crane.setVisible(true).setAlpha(0); // 숨김에서 페이드인.
    }

    sfx('button');
    // ① **화면 살짝 축소(줌아웃) + 살짝 위로** — 4층 내려올 자리·크레인 드러냄. (UI 는 uiCam 이라 안 변함)
    //   줌아웃은 MIN_CAMERA_ZOOM 까지만, 그리고 지면 근처(낮은 타워)에선 도로 바닥이 드러나지 않는 선까지만.
    const conZoom = Math.max(z0 * MIN_CAMERA_ZOOM, this.minZoomForGround(idleY - H / 2));
    cam.zoomTo(conZoom, 820, 'Sine.easeInOut');
    cam.pan(W / 2, idleY - 220, 820, 'Sine.easeInOut');
    if (crane) this.tweens.add({ targets: crane, alpha: 1, duration: 460, ease: 'Sine.easeOut' });
    if (roof) this.tweens.add({ targets: roof, y: roof.y - 200, alpha: 0, duration: 460, ease: 'Sine.easeIn' });

    // ② 크레인이 4층을 최종 위치로 내림 → **3층과 마주 닿는 순간** 안착(쿵 + 가로 연기). 유리팬스는 4층과 함께 낙하.
    this.time.delayedCall(900, () => {
      bld.setAlpha(0).setVisible(true);
      bld.y = finalY - FLOOR_LIFT;
      this.tweens.add({ targets: bld, alpha: 1, duration: 200 });
      if (glassObj) {
        glassObj.setAlpha(0).setVisible(true);
        glassObj.y = glassFinalY - FLOOR_LIFT;
        this.tweens.add({ targets: glassObj, alpha: 1, duration: 200 });
        this.tweens.add({ targets: glassObj, y: glassFinalY, duration: 780, ease: 'Bounce.easeOut' });
      }
      this.cablesGfx?.setVisible(true).setAlpha(1);
      this.tweens.add({
        targets: bld,
        y: finalY,
        duration: 780,
        ease: 'Bounce.easeOut',
        onUpdate: () => this.redrawCables(bld, node),
        onComplete: () => {
          cam.shake(240, 0.01); // 쿵.
          sfx('build');
          // **3층↔4층이 닿는 접합선 전체에 가로로 풍부한 연기**(위로가 아니라 옆으로 퍼짐).
          this.emitSmokeBand(node.x, finalY + fh * 0.5, fw * 0.92, (node.depth ?? 34) + 3);
          this.tweens.add({
            targets: this.cablesGfx,
            alpha: 0,
            duration: 240,
            onComplete: () => this.cablesGfx?.clear().setVisible(false).setAlpha(1),
          });
        },
      });
    });

    // ③ **지붕이 상단(4층)에 맞춰짐** — 캐릭터보다 먼저. + 크레인 퇴장.
    this.time.delayedCall(1860, () => {
      if (roof) {
        this.capRoof(idx, this.towerFloors, level);
        const ry = roof.y;
        roof.setAlpha(1);
        roof.y = ry - 170;
        this.tweens.add({ targets: roof, y: ry, duration: 440, ease: 'Bounce.easeOut' });
      }
      if (crane) this.tweens.add({ targets: crane, alpha: 0, y: crane.y - 60, duration: 480, ease: 'Sine.easeIn' });
    });

    // ④ **지붕이 맞춰진 뒤 점원 등장**(카운터 자리에서 살짝 튀어오르며).
    this.time.delayedCall(2360, () => {
      if (charObj) {
        charObj.setAlpha(0).setVisible(true);
        charObj.y = charFinalY - 44;
        this.tweens.add({ targets: charObj, y: charFinalY, alpha: 1, duration: 340, ease: 'Back.easeOut' });
      }
    });

    // ⑤ 배치 후 **원래대로 확대(z0) + 방금 지은 층에 포커스** — **느리고 부드럽게**(1.4초, Cubic.easeOut).
    //   목표를 **건설 후 스크롤 범위 안**으로 미리 클램프해 팬 → 이후 클램프로 툭 튕기지 않게(끊김 제거).
    this.time.delayedCall(2760, () => {
      cam.zoomTo(z0, 1400, 'Sine.easeInOut');
      const scrollMaxEst = this.groundBottom() - H - BOTTOM_SAFE;
      const roofTop = roof ? roof.y - roof.displayHeight / 2 : finalY - 400;
      const atMaxNow = level >= MAX_FLOORS;
      const marginNow = atMaxNow ? MAX_TOP_MARGIN : HEADER_MARGIN;
      const btnH = this.buildStoreBtn?.displayHeight ?? 120;
      const topRef = atMaxNow ? roofTop : roofTop - 30 - btnH; // 다음 건설 버튼 상단(대략) 또는 지붕.
      const scrollMinEst = Math.min(scrollMaxEst, topRef - marginNow);
      const target = Phaser.Math.Clamp(finalY - H * 0.55, scrollMinEst, scrollMaxEst); // 층 포커스, 범위 내.
      cam.pan(W / 2, target + H / 2, 1400, 'Sine.easeInOut');
    });

    // ⑥ 팬(1.4초)이 끝난 뒤 완료 처리(제자리 갱신).
    this.time.delayedCall(4400, () => this.finishConstruction(level, cost));
  }

  /**
   * 안착 연기 — **접합선(y)에 가로로 풍부한 먼지 밴드**. 위로가 아니라 좌우 바깥으로 퍼지며 옅어진다.
   *   centerX 중심 width 폭에 균일 분포.
   */
  private emitSmokeBand(centerX: number, y: number, width: number, depth: number): void {
    const n = 16;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1) - 0.5;
      const px = centerX + t * width;
      const c = this.add
        .circle(px + Phaser.Math.Between(-14, 14), y + Phaser.Math.Between(-10, 10), Phaser.Math.Between(16, 32), 0xf3f3f3, 0.72)
        .setDepth(depth);
      this.pinToWorld(c);
      this.tweens.add({
        targets: c,
        x: c.x + Math.sign(t || 1) * Phaser.Math.Between(40, 130), // 주로 가로(바깥)로.
        y: c.y - Phaser.Math.Between(4, 26), // 위로는 살짝만.
        scale: Phaser.Math.FloatBetween(2.2, 3.2),
        alpha: 0,
        duration: Phaser.Math.Between(560, 920),
        ease: 'Sine.easeOut',
        onComplete: () => c.destroy(),
      });
    }
  }

  /** 건설 확정 — 데모면 방금 지은 층을 유지한 채 **다음 층 건설 가능 상태로 이어붙임**(restart+demoBuilt), 최대 10층. */
  private finishConstruction(level: number, _cost: number): void {
    this.constructing = false;
    this.builtFloors = Math.min(MAX_FLOORS, level); // **제자리 증가**(재시작 없음).
    // **건설 = 소유** — 저장 **전에** 소유를 반영해야 한다. (안 그러면 저장된 ownedFloors 가 builtFloors 보다
    //   1 뒤처져, 다음 홈 진입 때 방금 지은 층을 '미소유'로 보고 **불필요한 N층 점포매입 버튼**이 뜬다 = 재매입 버그.)
    this.ownedFloors = Math.max(this.ownedFloors, this.builtFloors);
    // **임시저장**: 건설 레벨 저장 + **다이아 비용 차감**(건물 업그레이드 비용) + 소유 반영.
    const s = loadSave();
    s.diamonds = Math.max(0, (s.diamonds ?? 0) - diamondCostFor(level));
    s.builtFloors = this.builtFloors;
    s.ownedFloors = Math.max(s.ownedFloors ?? 0, this.ownedFloors);
    writeSave(s);
    this.advanceAfterBuild(level);
  }

  /**
   * 건설 완료 후 **제자리 갱신**(재시작 없이 부드럽게) — 지붕 재-캡·점원 애니·손님 등장·건설 버튼 재배선·스크롤 범위 갱신.
   *   카메라는 이미 연출 ⑤에서 방금 지은 층으로 부드럽게 팬돼 있으므로, 여기선 위치를 건드리지 않고 범위만 맞춘다.
   */
  private advanceAfterBuild(level: number): void {
    this.refreshHomeDiamond(); // 타워 건설로 차감된 다이아 표시 갱신.
    const idx = this.layoutIdx;
    if (!idx) return;
    this.justBuiltLevel = level;
    this.ownedFloors = Math.max(this.ownedFloors, this.builtFloors); // 건설=소유(크레인으로 지은 층은 내 것).
    this.capRoof(idx, this.towerFloors, Math.max(1, Math.min(this.builtFloors, this.towerFloors.length)));
    this.normalizeClerkDepths();
    const dec = this.floorDecor.get(level);
    if (dec?.char) this.animateClerk(dec.char, 0); // 방금 지은 층 점원 idle 애니.
    const spot = this.spotForLevel(level); // 이 층을 손님 스포너 후보(라이브 배열)에 추가 → 랜덤 등장.
    if (spot && !this.customerSpots.some((s) => s.floor === level)) this.customerSpots.push(spot);
    this.wireStoreButtons(idx); // 건설 버튼을 다음 층으로(또는 최상층 완공 시 숨김).
    this.placeContinueButton(); // 계속하기 버튼을 방금 지은 **새 최상층**으로 이동.
    this.computeScrollBounds(); // 스크롤 범위만 갱신(카메라는 ⑤ 팬이 이미 범위 내에 안착 → 클램프로 튕기지 않게).
    // 스크롤 목표/관성을 방금 팬으로 안착한 '맨 위층' 위치에 고정 — 낡은 목표로 되돌아가 아래로 튀지 않게.
    const cam = this.cameras.main;
    this.scrollTargetY = cam.scrollY;
    this.scrollTargetX = cam.scrollX;
    this.scrollVel = 0;
    this.scrollVelX = 0;
    this.prevScrollY = cam.scrollY; // 미세줌 속도 튐 방지(팬 직후 정지 상태).
    if (this.builtFloors >= MAX_FLOORS) {
      this.toast('🏙️ 타워 완공! 새 부지 구입이 열렸어요', true);
      this.unlockLots(); // **메인타워 10층 완공 → 부지 구입 잠금 해제**(재진입 없이 즉시).
    }
  }

  /**
   * 타워 캐릭터(up_Solirare_Chr_0N) — **발밑(하단) 고정 + 상단만 살랑살랑** 아이들 애니메이션.
   *   캐릭터 느낌을 위해 (1) 바닥을 축으로 좌우로 아주 살짝 갸웃(회전 ±SWAY°)하고,
   *   (2) 숨쉬듯 세로로 미세하게 늘었다 줄었다(scaleY 브레스, 바닥 고정이라 머리만 오르내림) 한다.
   *   원점을 하단 중앙으로 옮겨 회전·신축 축을 발밑에 두고, 시각 위치를 유지하도록 y 를 바닥으로 보정.
   *   캐릭터마다 위상(delay)을 어긋나게 해 로봇처럼 동시에 움직이지 않게 한다.
   */
  private animateCharacters(idx: LayoutIndex): void {
    const chars = idx.entries().filter((e) => /_Chr_/i.test(e.node.key ?? ''));
    chars.forEach((e, i) => {
      const img = e.obj as Phaser.GameObjects.Image;
      if (img.visible) this.animateClerk(img, i * 430);
    });
  }

  /**
   * 점원 **idle 애니메이션**(1~3층·동적 층 공통) — 발밑 고정 + 좌우 아주 살짝 갸웃 + 숨쉬기(세로 신축).
   *   원점을 하단 중앙으로 옮겨 회전/신축 축을 발밑에 두고, 위상(delay)을 어긋나게 해 로봇처럼 안 움직이게.
   *   ⚠️ 이미 애니 적용된 오브젝트에 중복 호출 방지 위해 data 플래그로 1회만.
   */
  private animateClerk(img: Phaser.GameObjects.Image, phase = 0): void {
    if (img.getData('clerkAnim')) return; // 중복 방지.
    img.setData('clerkAnim', true);
    const SWAY = 1.1; // 좌우 갸웃 진폭(도).
    const baseAngle = img.angle;
    const bottom = img.y + img.displayHeight * (1 - img.originY); // 발밑(하단) 고정.
    img.setOrigin(img.originX, 1);
    img.y = bottom;
    img.setAngle(baseAngle - SWAY);
    this.tweens.add({
      targets: img,
      angle: baseAngle + SWAY,
      duration: 1500,
      delay: phase,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: img,
      scaleY: img.scaleY * 1.03, // 숨쉬기.
      duration: 1950,
      delay: phase + 250,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /**
   * 점포 방문 손님 스팟 계산 — **표시 중인(저작·건설된) 각 층**에 대해 가게 주인(Chr)과 겹치지 않는
   *   반대쪽 지점을 잡는다. 층/주인 좌표는 에디터 노드값(FIT 1:1 이라 화면 좌표와 동일)에서 읽는다.
   */
  private buildCustomerSpots(): CustomerSpot[] {
    // **건설된 모든 층(1~builtFloors, 레이아웃+동적)**에 손님 스팟. 동적 층도 floorDecor 로 점원/유리 참조.
    const shown = Math.min(this.builtFloors, this.towerFloors.length);
    const spots: CustomerSpot[] = [];
    for (let level = 1; level <= shown; level++) {
      const spot = this.spotForLevel(level);
      if (spot) spots.push(spot);
    }
    return spots;
  }

  /** 한 층의 손님 스팟 — 층 노드 + 그 층 점원(floorDecor.char)·유리(floorDecor.glass) 기준. 없으면 undefined. */
  private spotForLevel(level: number): CustomerSpot | undefined {
    const entry = this.towerFloors[level - 1];
    if (!entry) return undefined;
    const f = entry.node;
    const fw = f.w ?? 800;
    const fh = f.h ?? 500;
    const dec = this.floorDecor.get(level);
    const owner = dec?.char; // 점원 이미지(위치·크기·origin 무관하게 하단 산출).
    const glass = dec?.glass;
    const ownerX = owner?.x ?? f.x + fw * 0.18;
    // 등장/퇴장 = 점원 반대편(중심 대칭 미러) → 층 폭 안 클램프.
    const entryX = Phaser.Math.Clamp(2 * f.x - ownerX, f.x - fw * 0.34, f.x + fw * 0.34);
    // 발끝(바닥선) = 점원 이미지 하단(origin 무관: y + displayHeight×(1−originY)). 없으면 층 하단서 살짝 위.
    const ownerBottom = owner ? owner.y + owner.displayHeight * (1 - owner.originY) : f.y + fh / 2 - 46;
    const ownerH = owner ? owner.displayHeight : 220;
    return {
      entryX,
      centerX: f.x,
      groundY: ownerBottom,
      height: ownerH * 0.924, // 점원의 0.924배.
      // depth = **이 층 유리팬스 바로 뒤**(유리가 손님을 가림). 유리 없으면 아트 살짝 앞. 버튼(120+)보다 훨씬 아래.
      depth: glass ? glass.depth - 0.3 : (f.depth ?? 0) + 1.8,
      floor: level,
      onSatisfied: (fl, coins) => this.accrueFloorCoins(fl, coins), // 만족 방문 → 상점 수익만큼 누적.
      coinYield: visitYieldFor(level), // **상점별 수익성** — 고층일수록 방문 1회 수익↑.
    };
  }

  // ── 점포 코인 누적 → 말풍선 수령 ─────────────────────────────────────
  /** 세이브의 층별 누적 코인을 런타임 맵으로 로드(create 초기화용). */
  private loadFloorBanks(): void {
    this.floorBanks.clear();
    const banks = loadSave().floorCoinBanks ?? {};
    for (const [k, v] of Object.entries(banks)) {
      const fl = parseInt(k, 10);
      if (Number.isFinite(fl) && Number.isFinite(v)) this.floorBanks.set(fl, Math.max(0, Math.floor(v as number)));
    }
  }

  /** 이미 목표를 채운 층에 수령 말풍선을 띄운다(홈 재진입 시 복원). */
  private restoreClaimBubbles(): void {
    const shown = Math.min(this.builtFloors, this.towerFloors.length);
    for (let level = 1; level <= shown; level++) {
      if ((this.floorBanks.get(level) ?? 0) >= FLOOR_COIN_GOAL) this.spawnClaimBubble(level);
    }
  }

  /**
   * 만족 방문 1회 → 이 층에 **떨어뜨린 코인 수만큼** 누적(세이브 반영). **100 도달 시 상한 고정 + 더 누적 안 함**
   *   (플레이어가 수령하기 전까지 정지). 목표 도달 시 점원 위 수령 말풍선 표시.
   */
  private accrueFloorCoins(floor: number, coins: number): void {
    if (floor < 1 || floor > this.builtFloors) return;
    const cur = this.floorBanks.get(floor) ?? 0;
    if (cur >= FLOOR_COIN_GOAL) return; // **이미 가득참(100) → 수령 전까지 더 누적하지 않음.**
    const next = Math.min(FLOOR_COIN_GOAL, cur + Math.max(1, Math.floor(coins))); // 100 상한.
    this.floorBanks.set(floor, next);
    const s = loadSave();
    s.floorCoinBanks = { ...(s.floorCoinBanks ?? {}), [floor]: next };
    writeSave(s);
    // 목표(100) 도달 + 아직 말풍선 없음 → 수령 말풍선.
    if (next >= FLOOR_COIN_GOAL && !this.floorClaimBubbles.has(floor)) this.spawnClaimBubble(floor);
  }

  /**
   * **수령 말풍선** — 그 층 점원 머리 위에 말머리 풍선(UI_11) + 코인 아이콘(UI_2-3)을 띄운다.
   *   맥동으로 눈에 띄게. 탭하면 claimFloorCoins(코인 쏟아짐 → 유저 코인).
   */
  private spawnClaimBubble(floor: number): void {
    if (this.floorClaimBubbles.has(floor)) return; // 중복 방지.
    const clerk = this.floorDecor.get(floor)?.char;
    if (!clerk || !this.textures.exists(CLAIM_BUBBLE_KEY)) return;
    const headX = clerk.x;
    const headTop = clerk.y - clerk.displayHeight * clerk.originY; // 점원 머리 top.
    const bubY = headTop - 12;
    const baseDepth = (clerk.depth ?? 20) + 45; // 점원·유리 앞.
    const BW = 150;
    const bub = this.add.image(headX, bubY, CLAIM_BUBBLE_KEY).setOrigin(0.5, 1).setDepth(baseDepth);
    bub.setScale(BW / bub.width);
    this.pinToWorld(bub);
    const objs: Phaser.GameObjects.GameObject[] = [bub];
    // 코인 아이콘(말풍선 몸통 중앙).
    if (this.textures.exists(CLAIM_COIN_KEY)) {
      const cy = bubY - bub.displayHeight * 0.6;
      const coin = this.add.image(headX, cy, CLAIM_COIN_KEY).setOrigin(0.5).setDepth(baseDepth + 1);
      const fit = Math.min((bub.displayHeight * 0.52) / coin.height, (BW * 0.6) / coin.width);
      coin.setScale(fit);
      this.pinToWorld(coin);
      objs.push(coin);
    }
    this.floorClaimBubbles.set(floor, objs);
    // 팝인 + 맥동(수령 유도).
    bub.setScale((BW / bub.width) * 0.7);
    this.tweens.add({ targets: bub, scaleX: BW / bub.width, scaleY: BW / bub.width, duration: 260, ease: 'Back.easeOut' });
    for (const o of objs) this.tweens.add({ targets: o, y: `-=8`, duration: 720, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // 탭 히트존(말풍선 전체) — 월드 좌표.
    const hit = this.add.zone(headX, bubY - bub.displayHeight / 2, bub.displayWidth, bub.displayHeight).setInteractive({ useHandCursor: true });
    this.pinToWorld(hit);
    hit.on('pointerdown', () => this.claimFloorCoins(floor));
    objs.push(hit);
  }

  /** 수령 — 점원 위에서 코인이 많이 쏟아지는 연출 후 유저 코인으로 적립. 누적 리셋 + 말풍선 제거. */
  private claimFloorCoins(floor: number): void {
    const amount = this.floorBanks.get(floor) ?? 0;
    if (amount <= 0) return;
    const clerk = this.floorDecor.get(floor)?.char;
    const bx = clerk ? clerk.x : W / 2;
    const by = clerk ? clerk.y - clerk.displayHeight * clerk.originY : H / 2;
    // 말풍선 제거 — **무한 맥동 트윈을 먼저 종료**하고 파괴(Phaser 는 destroy 시 트윈 자동취소 안 함 → 파괴된 객체에
    //   repeat:-1 트윈이 매프레임 계속 write 하는 좀비 누수 방지).
    this.floorClaimBubbles.get(floor)?.forEach((o) => {
      this.tweens.killTweensOf(o);
      o.destroy();
    });
    this.floorClaimBubbles.delete(floor);
    // 누적 리셋(세이브).
    this.floorBanks.set(floor, 0);
    const s = loadSave();
    s.floorCoinBanks = { ...(s.floorCoinBanks ?? {}), [floor]: 0 };
    s.coins += amount; // 유저 코인 적립.
    writeSave(s);
    this.homeHeader?.setCoins(s.coins);
    this.spawnCoinShower(bx, by, amount); // 코인 쏟아짐 연출.
    this.toast(`🪙 +${amount.toLocaleString()}`, true);
  }

  /**
   * 코인 샤워 — (x,y)에서 코인이 **손님 드랍처럼** 튀어나와 **커지며 흩어졌다가**, 상단 **코인 저장소(헤더)로
   *   빨려 들어가며** 사라진다. 스핀 코인 스프라이트(손님 드랍과 동일) 사용, 없으면 코인 아이콘 폴백.
   */
  private spawnCoinShower(x: number, y: number, amount: number): void {
    sfx('coin_burst', { volume: 0.35 });
    const spin = this.anims.exists(CUST_COIN_SPIN) && this.textures.exists('cust_coin_1');
    const coinKey = spin ? 'cust_coin_1' : this.textures.exists(CLAIM_COIN_KEY) ? CLAIM_COIN_KEY : 'up_Solitare_UI_2_3';
    if (!this.textures.exists(coinKey)) return;
    // **코인 저장소(헤더 코인 카운터)** 의 월드 좌표 — 현재 카메라 기준 화면 좌표를 월드로 역변환(빨려드는 목표).
    const target = this.cameras.main.getWorldPoint(HEADER_COIN_X, HEADER_COIN_Y);
    const n = Phaser.Math.Clamp(Math.round(amount / 8), 12, 24); // 코인 개수(금액 비례).
    for (let i = 0; i < n; i++) {
      const c = spin ? this.add.sprite(x, y, 'cust_coin_1') : this.add.image(x, y, coinKey);
      c.setDepth(4000).setScale(0.24);
      this.pinToWorld(c);
      if (spin) (c as Phaser.GameObjects.Sprite).play(CUST_COIN_SPIN);
      const dx = Phaser.Math.Between(-150, 150);
      const fallY = y + Phaser.Math.Between(30, 120); // 손님 드랍처럼 살짝 아래로 떨어짐.
      // ① 흩어지며 **커지며** 살짝 떨어진다(손님 코인 드랍 느낌).
      this.tweens.add({
        targets: c,
        x: x + dx,
        y: fallY,
        scale: Phaser.Math.FloatBetween(0.66, 0.92), // 작게 시작 → 커짐.
        duration: 360,
        delay: i * 28,
        ease: 'Quad.easeOut',
        onComplete: () => {
          // ② 코인 저장소로 **빨려 들어가며** 축소·페이드(가속 진입).
          this.tweens.add({
            targets: c,
            x: target.x,
            y: target.y,
            scale: 0.18,
            alpha: 0.25,
            duration: 480,
            ease: 'Back.easeIn',
            onComplete: () => c.destroy(),
          });
        },
      });
    }
  }

  /**
   * 지붕을 **타워 최상단 층 위에 항상 얹는다**. 에디터 저작상 (지붕 하단 ↔ 최상단 층 상단) 관계를
   * 그대로 재현하되, 건설 상태로 최상단이 바뀌거나 에디터에서 층을 추가/재배치해도 지붕이 자동으로
   * 그 층 위로 옮겨가 항상 꼭대기를 덮는다. (지붕 노드 key 에 'roof' 포함 규칙.)
   */
  private capRoof(idx: LayoutIndex, floors: LayoutEntry[], topBuiltLevel: number): void {
    if (floors.length === 0) return;
    const roofEntry = idx.entries().find((e) => e.node.type === 'image' && /roof/i.test(e.node.key ?? ''));
    const top = floors[topBuiltLevel - 1];
    if (!roofEntry || !top) return;
    const roof = roofEntry.obj as Phaser.GameObjects.Image;
    const topFloor = top.obj as Phaser.GameObjects.Image;
    // **디자인(노드) 좌표**로 지붕↔저작 최상단 층의 원래 겹침(overlap)·x오프셋을 산출한다(불변 상수).
    //   라이브 roof.y 를 쓰면 연출 중 지붕을 이미 옮겨 놨을 때 값이 틀어지므로 노드값을 쓴다.
    //   저작 최상단 = 레이아웃(동적 아님) 층 중 가장 위. 그 관계를 실제 최상단(topFloor, 동적 포함)에 재현.
    const roofNode = roofEntry.node;
    // 저작상 지붕이 얹힌 기준 층 = **지붕 하단에 가장 가까운 층 상단**(4층 placeholder가 아니라 실제 얹힌 3층).
    const roofBottom = roofNode.y + (roofNode.h ?? 300) / 2;
    const authoredTopNode = floors
      .map((f) => f.node)
      .sort((a, b) => Math.abs(a.y - (a.h ?? 500) / 2 - roofBottom) - Math.abs(b.y - (b.h ?? 500) / 2 - roofBottom))[0];
    const aTopEdge = authoredTopNode.y - (authoredTopNode.h ?? 500) / 2;
    const overlap = aTopEdge - (roofNode.y + (roofNode.h ?? 300) / 2);
    const dx = roofNode.x - authoredTopNode.x;
    const floorTop = topFloor.y - topFloor.displayHeight / 2;
    // **지붕을 최상층에 붙인다** — 저작 overlap 에 더해 살짝 더 내려(TOWER_ROOF_ATTACH) 틈을 없앤다.
    roof.setY(floorTop - overlap - roof.displayHeight / 2 + TOWER_ROOF_ATTACH);
    roof.setX(topFloor.x + dx);
    roof.setDepth((topFloor.depth ?? 14) + 1); // 지붕은 최상층 위로.
    roof.setVisible(true); // 템플릿에서 지붕이 visible:false 여도 **항상 최상층에 표시**(요구사항: 배치 전에도 지붕 존재).
  }

  private drawBackground(): void {
    if (this.textures.exists(BACK_BG_KEY)) {
      const img = this.add.image(W / 2, H / 2, BACK_BG_KEY).setDepth(-100);
      const src = img.texture.getSourceImage() as { width: number; height: number };
      img.setScale(Math.max(W / src.width, H / src.height));
      return;
    }
    const g = this.add.graphics().setDepth(-100);
    const top = Phaser.Display.Color.IntegerToColor(0x9ad0f5);
    const bot = Phaser.Display.Color.IntegerToColor(0xf7c9e4);
    for (let i = 0; i < 40; i++) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(top, bot, 100, (i / 39) * 100);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(0, (H / 40) * i, W, H / 40 + 1);
    }
  }

  private drawTitle(): void {
    this.add
      .text(W / 2, 130, 'SOLITAIRE', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '100px',
        color: '#ffffff',
        stroke: '#7a2d9a',
        strokeThickness: 12,
      })
      .setOrigin(0.5)
      .setDepth(50);
    this.add
      .text(W / 2, 218, 'HEIGHTS', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '64px',
        color: '#ffe066',
        stroke: '#7a2d9a',
        strokeThickness: 9,
      })
      .setOrigin(0.5)
      .setDepth(50);
  }

  /** 플레이스홀더 타워(에디터 미저작 시) — 건설 상태 반영. */
  private drawPlaceholderTower(save: SaveData): void {
    let yb = BASE_Y;
    // 저작된 레벨 수만큼만(단, 층 아트는 5종 → 그 이하로) 그린다.
    const shownFloors = Math.min(this.levelCount(), FLOORS.length);
    for (let level = 1; level <= shownFloors; level++) {
      const floor = FLOORS[level - 1];
      const h = floor.artH * FLOOR_SCALE;
      const cy = yb - h / 2;
      this.placeFloor(level, cy, save);
      yb = cy - h / 2 + OVERLAP;
    }
  }

  private placeFloor(level: number, cy: number, save: SaveData): void {
    const floor = FLOORS[level - 1];
    const key = floorArtKey(level);
    const hasArt = this.textures.exists(key);
    const built = level <= save.builtFloors;

    const hit: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle = hasArt
      ? this.add.image(W / 2, cy, key).setScale(FLOOR_SCALE).setDepth(level)
      : this.add
          .rectangle(W / 2, cy, floor.artW * FLOOR_SCALE, floor.artH * FLOOR_SCALE, floor.tint, 0.95)
          .setStrokeStyle(5, 0xffffff, 0.85)
          .setDepth(level);
    hit.setAlpha(built ? 1 : 0.16);

    if (!hasArt && built) {
      this.add
        .text(W / 2, cy, `${floor.name}\n${floor.sub}`, {
          fontFamily: '"Jua", sans-serif',
          fontSize: '40px',
          color: '#3a1030',
          align: 'center',
        })
        .setOrigin(0.5)
        .setDepth(level + 0.5);
    }

    if (built) {
      const s = hasArt ? FLOOR_SCALE : 1;
      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        this.startPlay(level);
      });
      hit.on('pointerover', () => hit.setScale(s * 1.03));
      hit.on('pointerout', () => hit.setScale(s));
    } else if (level === save.builtFloors + 1) {
      this.placeBuildButton(W / 2, cy, level, save);
    }
  }

  /** 다음 층 건설 버튼(비용 표시). 코인 충분 → 건설 연출, 부족 → 안내. */
  private placeBuildButton(_x: number, _y: number, level: number, save: SaveData): void {
    const cost = FLOOR_COST[level] ?? 0;
    const can = DEMO_CONSTRUCTION || save.coins >= cost;
    const label = DEMO_CONSTRUCTION ? `🔨 ${level}층 배치\n(연출 보기)` : `🔨 ${level}층 건설\n💰 ${cost.toLocaleString()}`;
    this.buildBtn?.destroy();
    // **고정 UI 버튼**(상단·화면 고정) — 타워를 줌/스크롤해도 항상 눌러지도록 uiCam 대상.
    const btn = this.add
      .text(W / 2, 250, label, {
        fontFamily: '"Jua", sans-serif',
        fontSize: '40px',
        color: '#ffffff',
        align: 'center',
        backgroundColor: can ? '#3aa655' : '#7a6f7a',
        padding: { x: 30, y: 18 },
        stroke: '#2a1830',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(600)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => this.runConstruction(level, cost));
    this.buildBtn = btn;
    this.uiObjects.push(btn); // UI 카메라(고정) 대상.
  }

  /** 상단 코인 표시. */
  private drawCoins(save: SaveData): void {
    this.add
      .rectangle(44, 60, 320, 84, 0x2a1830, 0.6)
      .setOrigin(0, 0.5)
      .setDepth(700)
      .setStrokeStyle(3, 0xffffff, 0.3);
    this.add
      .text(70, 60, `🪙 ${save.coins.toLocaleString()}`, {
        fontFamily: '"Jua", sans-serif',
        fontSize: '46px',
        color: '#ffe9a0',
      })
      .setOrigin(0, 0.5)
      .setDepth(701);
  }

  private drawHint(save: SaveData): void {
    const done = save.builtFloors >= MAX_FLOORS;
    this.add
      .text(
        W / 2,
        H - 40,
        done ? '타워 완공! 지은 층을 탭해 플레이하세요' : '지은 층을 탭해 플레이 · 코인을 모아 위층을 건설하세요',
        { fontFamily: '"Jua", sans-serif', fontSize: '30px', color: '#ffffff', align: 'center' },
      )
      .setOrigin(0.5, 1)
      .setDepth(700)
      .setShadow(0, 2, '#000000', 4);
  }

  private toast(msg: string, ok = false): void {
    const t = this.add
      .text(W / 2, H * 0.5, msg, {
        fontFamily: '"Jua", sans-serif',
        fontSize: '48px',
        color: '#ffffff',
        align: 'center',
        backgroundColor: ok ? '#2e9e4f' : '#c0392b', // 성공=초록, 안내/실패=빨강.
        padding: { x: 40, y: 24 },
        stroke: '#123a1f',
        strokeThickness: ok ? 4 : 0,
      })
      .setOrigin(0.5)
      .setDepth(1500);
    this.pinToUi(t); // 토스트는 UI(고정) 카메라 전용.
    // 성공은 살짝 팝 + 조금 더 오래 유지.
    if (ok) {
      t.setScale(0.8);
      this.tweens.add({ targets: t, scale: 1, duration: 240, ease: 'Back.easeOut' });
    }
    this.tweens.add({ targets: t, alpha: 0, y: H * 0.42, duration: 1200, delay: ok ? 1100 : 500, onComplete: () => t.destroy() });
  }
}
