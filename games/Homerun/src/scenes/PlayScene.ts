/**
 * PlayScene — 홈런팝 본편 (홈런 클래시 스타일 타이밍 타격).
 *
 * 화면: SSOT 배경(BG_06_v3, 정사각 원화의 세로 중앙 크롭) + 에디터 타자 + 히팅존 링.
 * 루프: 투구(마운드→존으로 공 확대 접근, 수축 타이밍 링) → 터치 = 스윙 →
 *       판정(logic/judge) → 타구 방향으로 카메라 소폭 줌인 + 결과 라벨 →
 *       카메라 복귀 → 다음 투구. 10구 종료 후 점수 정산 + 다시하기.
 *
 * 월드/HUD 는 컨테이너 + 카메라 2대로 분리 — 줌인은 월드에만 적용된다.
 */
import Phaser from 'phaser';
import { FONT } from '@casual/core';
import { getDisplayBounds, vibrate } from '@casual/core';
import {
  BALL_KEY,
  BALL_SPIN_KEYS,
  BALL_SPIN_SCALE_COMP,
  BG_KEY,
  CONFETTI_KEY,
  MITT_KEY,
  SPARK_KEY,
  STARBURST_KEY,
  RESULT_BADGE_DRAW_KEY,
  RESULT_BADGE_LOSE_KEY,
  UI_LAYOUT_KEY,
  UI_RESULT_LAYOUT_KEY,
  UI_SPRITE_INDEX_KEY,
  preloadPlayClips,
} from '../assets.js';
import { anchorLayoutDoc, buildLayout, textAnchor, type LayoutDoc, type LayoutIndex, type LayoutNode, type PinMode } from '../ui/layoutLoader.js';
import {
  DEFAULT_BATTER_PLACEMENT,
  hasBatterNode,
  activeBatterAnchor,
  activeBatterReadySlow,
  activeBatterSwing,
  isPitcherNode,
  resolvePlayNodeMotions,
  type BatterSwingTiming,
  type SpriteIndex,
} from '../ui/spriteRegistry.js';
import { CharacterRig } from '../ui/characterRig.js';
import { formatLeagueNumber, getLeagueTier, initLeagueTierFromUrl, type LeagueTierDef } from '../logic/league.js';
import { addCoins, canAfford, getCoins, spendCoins } from '../logic/economy.js';
import { showToast } from '../toast.js';
import { MOCK_AD_SECONDS, playRewardedAd } from '../rewardedAd.js';
import { pickRival, saveRecord } from '../logic/rival.js';
import { evaluateTrophies, trophiesOf, trophyById, type PlayedRound } from '../logic/trophies.js';
import { applyMatchToStreak, getEarnedTrophies, grantTrophies } from '../logic/trophyStore.js';
import { Scoreboard, type ScoreboardOptions } from '../ui/scoreboard.js';
import { sfx, startBgm, swellCrowd } from '../audio.js';
import {
  ACCURACY_TIERS,
  PITCH_END_PROGRESS,
  resolveAccuracySwing,
  resolveTake,
  resolveWhiff,
  setAccuracyTiers,
} from '../logic/judge.js';
import { hitScore, homerunScore, type HitZone, type RivalRoundOutcome } from '../logic/scoring.js';
import type { PitchResult, SwingOutcome } from '../logic/types.js';

/**
 * 릴리스→존 도달 시간(ms) — 구속 체감치. 520→560→600ms 에 이어, "모바일에서 난이도가 높다"는
 * 요청으로 650ms(≈101km/h)로 한 번 더 늦춤(기존 150km/h=440ms). 모바일 기준값 — PC 는
 * applyDeviceDifficulty() 가 부팅 시 별도 값으로 덮어쓴다(let 인 이유).
 */
let PITCH_MS = 650;
/**
 * ms→km/h 환산 상수 — 그동안 튜닝 주석에 남긴 실측 대응값(520ms≈127, 560ms≈118, 600ms≈110,
 * 650ms≈101km/h)이 전부 ms×km/h≈66000 으로 일관돼 있어 그 값을 그대로 공식화했다(포수 미트
 * 쪽 구속 표시용 — 사용자 요청).
 */
const PITCH_SPEED_KMH_CONST = 66000;
/**
 * 새 투구 준비 → 릴리스(투구 시작)까지의 시간(ms) — 투구 간 텀의 본체(사용자 요청: "라운드가
 * 인터벌을 지금보다 2초 늘일 것" — 3800→5800).
 */
const ZONE_PREVIEW_MS = 5800;
/**
 * 타자 3동작 구동 파라미터.
 *  - 준비(ready): 투구 대기 중 반복.  - 스윙(action): 매 투구 1회.  - 후: 스윙 마지막 프레임 정지.
 *
 * 스윙 1회를 이 길이로 압축 재생(timeScale)하는 기준값. 프레임 수·시작/컨택 프레임은 **로비에서
 * 고른 캐릭터**에 따라 달라지므로 상수가 아니라 씬 생성 시점에 읽는다(swingLeadsFor 참조).
 */
const BATTER_VIEW_MS = 600;

/**
 * 스윙 클립에서 실제로 틀 구간(정상 재생 기준 ms) — 시작 프레임 ~ 컨택 프레임.
 * 시작이 0 이 아닌 이유(대기 자세 구간 건너뛰기)는 spriteRegistry.BatterSwingTiming 주석 참조.
 */
function swingLeadsFor(t: BatterSwingTiming): { startMs: number; contactMs: number } {
  return {
    startMs: (BATTER_VIEW_MS * t.startFrame) / t.frames,
    contactMs: (BATTER_VIEW_MS * t.contactFrame) / t.frames,
  };
}
/**
 * 투수 3동작(에디터 등록: 투수_준비동작/투수_투구동작/투수_투구후 동작) 구동 파라미터.
 *  - 준비(ready): 투구 예고 중 반복.  - 투구(action): 매 투구 1회.  - 후(after): 투구 후 반복.
 * 투구 시트 실측: 48프레임 중 frame 31 에서 팔 전방 최대 신장(릴리스=공이 손을 떠남). viewMs 로 압축 재생.
 */
const PITCHER_RIG = { viewMs: 1800, frames: 48, keyFrame: 31 } as const;
/** 투구 시작 → 릴리스 프레임까지의 시간(ms). 공 릴리스(throwPitch=ZONE_PREVIEW_MS)에서 이만큼 빼 투구 시작. */
const PITCH_RELEASE_LEAD_MS = (PITCHER_RIG.viewMs * PITCHER_RIG.keyFrame) / PITCHER_RIG.frames;
/** 투수 손(릴리스) 높이 — 노드 발밑(앵커) 기준 위로 노드 높이의 이 비율. 공 출발점 산정. */
const PITCHER_HAND_Y_RATIO = 0.55;
/** 타격 인디케이터가 릴리스보다 먼저 나타나는 리드(ms) — 난이도 완화 요청으로 200→280 확대(더 일찍 표시). */
const INDICATOR_LEAD_MS = 280;
/**
 * 늦은 탭 유예(ms) — 공 통과 후 이 시간 안의 탭은 무시 대신 "헛스윙 풀스윙"으로 처리.
 * 투구 트윈 종료(currentPitchMs×1.25)보다 짧아야 스윙취소 타이머가 먼저 동작한다
 * (currentPitchMs×0.25 한도 — 가장 빠른 구종(직구, 배율 1.0×PITCH_MS≥600)에서도 150ms ≥ 130
 * 로 여유 있음. 더 느린 구종은 배율이 1보다 커서 한도가 늘어나므로 항상 안전하다).
 */
const LATE_TAP_GRACE_MS = 130;
/** 붉은 타격점 반지름(px, 1080 디자인) — 공이 존을 통과할 때의 공 크기와 동일 (96px 에셋 × 0.795 / 2). */
const RED_DOT_R = 38;
/**
 * 붉은 타격점 시작 스케일 — 작은 점에서 시작해, 노란 타이밍 링이 수축하는 동안 같이 커져서
 * 도달 순간 둘이 같은 크기(scale 1 = RED_DOT_R)로 만난다(사용자 요청: "이 붉은점은 하나의
 * 점으로부터 시작하여 외곽 노란색원이 줄어들면서 최종적으로 같은 사이즈 원이 되는 구조로
 * 다시 만들 것" — 예전엔 등장 즉시 풀사이즈로 고정돼 있었다).
 * ⚠️ 0.08→0.35→0.7→0.8(사용자 재요청: "원이 작아진 상태에서 출발하는 사이즈 크기를 80프로로
 * 확대하라") — 여전히 커지는 애니메이션은 남기되, 시작부터 최종 크기의 80%로 출발한다.
 */
const RED_DOT_START_SCALE = 0.8;
/**
 * 터치 허용 배수 — 손가락 크기를 감안한 타격점 유효 반경(R×배수).
 * 모바일 실측 피드백(손가락으로 타점을 맞추기 어려움) 반영해 2.9→3.8에 이어, "모바일 난이도가
 * 아직 높다"는 요청으로 3.8→4.2로 재확대.
 * accuracy = 1 - tapDist/touchRadius 이므로 반경이 커질수록 같은 터치 오차에서도
 * 정확도가 높게 나와 홈런 등급에 더 잘 도달한다(스킬샷 성격은 유지). 모바일 기준값(let, PC 오버라이드 참조).
 */
let TOUCH_GRACE = 4.2;
/**
 * 타이밍 허용 윈도우(progress 단위) — 도착(1.0) 기준 이만큼 이전부터 탭 인정.
 * 공이 손끝에서 가파르게 내리꽂히는 궤적이라 화면 거리 대신 진행도로 판정한다.
 * 0.28→0.38→0.48 에 이어, "모바일 난이도가 아직 높다"는 요청으로 0.48→0.55로 재확대
 * (PITCH_MS=650 기준 진행도 0.45, 즉 릴리스+292ms부터 탭 인정 — 더 일찍부터 유효). 모바일 기준값(let).
 */
let PITCH_TAP_WINDOW = 0.55;
/** 실제 터치 지점 표시 마커 반지름(px) — 판정 결과와 별개로 "내가 어디를 눌렀는지" 보여주는 시각 피드백. */
const TAP_MARKER_R = 20;
/** 탭 마커 색상 — 판정 성공(파울 이상)/실패(헛스윙) 구분. */
const TAP_MARKER_COLOR_HIT = 0x4dff88;
const TAP_MARKER_COLOR_MISS = 0xff4d4d;
/** 히팅존 랜덤 편차(px, 1080 디자인) — 배트 스위트스팟 실측점 주변의 작은 변주만 허용. */
const ZONE_JITTER = { x: 21, y: 12 } as const;
/**
 * 배트 접점(batContactY) 보정(px, 1080 디자인, +값=타자 쪽/화면 아래로) — 스트라이크존 중심을
 * 그대로 쓰면 배트가 실제 스윙 리치보다 더 앞(투수 쪽)까지 뻗어 보여 "공이 배트 뒤에서 맞는"
 * 느낌이 났다(사용자 피드백). 접점을 타자 쪽으로 살짝 당겨 배트의 실제 스윙 위치와 맞춘다.
 * ⚠️ 아틀라스 스위트스팟 픽셀이 없어 눈대중 보정값 — 여전히 어긋나 보이면 이 값을 더 키울 것.
 */
const BAT_CONTACT_BACK_OFFSET = 40;
/** 1경기 투구 수 — 9라운드까지 진행(사용자 요청: "라운드는 9라운드까지 진행한다"). */
const PITCHES_PER_GAME = 9;
/**
 * 헤더 총점 노드(main.json) — 캐릭터명 옆 트로피 점수 텍스트를 코드가 직접 갱신한다(사용자
 * 요청: "점수표시를 상단헤더 부분으로 이동 적용합니다. 토탈점수는 상단 캐릭터명에 표시합니다" —
 * 기존 좌/우 화면 끝 "Player Total"/"Rival Total" 줄 방식을 폐기하고 헤더로 이전).
 * layer_2_copy2=플레이어(x=224,y=184), layer_2_copy3=라이벌(x=845,y=184) — 둘 다 Luckiest Guy
 * 40px 노란색(#ffd500)+갈색 아웃라인으로 에디터가 이미 저작해 둔 스타일을 그대로 쓴다(코드가
 * setText 만 갱신 — 폰트/색은 buildLayout 이 노드 데이터로 이미 적용).
 */
const HEADER_TOTAL_NODE_ID = { player: 'layer_2_copy2', rival: 'layer_2_copy3' } as const;
/**
 * 최종 라운드 한 줄 표시 — main.json 의 최종 라운드 목업 노드에서 위치·정렬·폰트·색·아웃라인·
 * 그림자를 그대로 읽어온다(사용자 요청: "에디터에서 설정한 좌우정렬 및 폰트 스타일, 색상적용을
 * 에디터에서 적용한대로 적용하세요" — 코드에 값을 하드코딩해 두면 에디터에서 다시 조정해도
 * 반영이 안 된다). layer_9_copy2=플레이어(좌, align:left), layer_9_copy=라이벌(우, align:right).
 * scoreboardOptionsFromNode() 가 buildHud() 에서 실제 값을 읽어 구성한다 — 아래 두 상수는 그
 * 노드를 못 찾을 때만 쓰는 방어적 폴백(레이아웃 미배포 단계 방어)이다.
 */
const ROUND_MOCKUP_NODE_ID = { player: 'layer_9_copy2', rival: 'layer_9_copy' } as const;
/**
 * 헤더 점수 게이지 — 상대와의 격차를 한눈에 보여 주는 막대(사용자 요청: "상대와의 경쟁심리를
 * 확보하기 위한 표현 수단").
 *
 * ⚠️ 게이지 홈(빈 막대)은 **헤더 이미지(up_Homerun_UI_00) 안에 그려져 있다** — 별도 노드가 없어
 * 그 위에 채움을 얹는 수밖에 없다. 아래 좌표는 헤더 에셋(1332×259)에서 홈의 픽셀 범위를 실측한
 * 뒤 노드 rect(537,189,1024×199) 기준으로 환산한 값이다. 에디터에서 헤더 이미지나 그 배치가
 * 바뀌면 이 값도 다시 재야 한다 — 디자이너가 게이지 노드를 따로 저작해 주면 그때 노드에서 읽도록
 * 바꾸는 편이 낫다.
 */
const HEADER_GAUGE_RECTS = {
  player: { x: 181, y: 222, w: 224, h: 27 },
  rival: { x: 666, y: 221, w: 226, h: 28 },
} as const;
/** 게이지 채움 색 — 헤더의 좌(파랑)/우(빨강) 프로필 테두리 색과 맞춘다. */
const HEADER_GAUGE_COLORS = { player: 0x2f80ed, rival: 0xd7443e } as const;
/** 게이지가 새 값으로 차오르는 시간(ms) — 점수가 붙는 순간이 눈에 들어오도록 살짝 늦게 따라온다. */
const GAUGE_TWEEN_MS = 420;

/** 홈버튼 노드 id(에디터 저작, 상단 중앙) — 누르면 로비로 돌아간다. */
const HOME_BUTTON_NODE_ID = 'layer_12';
/**
 * 헤더 전체를 구성하는 노드 id 전부(좌/우 선수 이름·트로피 점수, 중앙 ROUND 배지, 배경 바,
 * 좌/우 프로필 초상화, 홈버튼) — 세이프에어리어(아이폰 다이나믹 아일랜드)가 있는 기기에서
 * headerSafeOffsetY() 만큼 다 같이 아래로 밀어낸다(사용자 요청: "닫기 버튼을 제외한 홈버튼이
 * 아일랜드 독에 가릴 경우 상단헤더 및 최종라운드 표시 UI만 아래쪽으로 이동"). 상단 닫기(X)
 * 버튼은 게임 캔버스 밖(허브/포털 쪽) 요소라 여기 포함하지 않는다.
 */
const HEADER_NODE_IDS: ReadonlySet<string> = new Set([
  'layer_2',
  'layer_2_copy',
  'layer_2_copy2',
  'layer_2_copy3',
  'layer_2_copy4',
  'layer_2_copy5',
  'layer_1',
  'layer_10',
  'layer_10_copy',
  HOME_BUTTON_NODE_ID,
]);

/**
 * 다이나믹 아일랜드/노치 아래로 헤더를 내릴 때 적용할 상단 여백 상한(CSS pt).
 * 아이폰 프로의 인셋 원값은 ~59pt 라 그대로 쓰면 헤더가 너무 내려온다(사용자 보고: "상단
 * 아일랜드독 부분도 너무 많이 내려옵니다" → "15포인트 여백만 적용하세요"). 헤더 아트 자체에
 * 위 여백이 있어 15pt 만 내려도 아일랜드에 가리지 않는다.
 */
const HEADER_SAFE_TOP_CAP_CSS = 15;

/**
 * 헤더/최종라운드 표시 UI 를 세이프에어리어 아래로 밀어낼 오프셋(게임 px 단위) — main.ts 의
 * readSafeArea() 가 채운 window.__safeArea(CSS px, --sat 등) 를 FIT 배율(displayScale.y)로
 * 게임좌표로 환산한다. 세이프에어리어가 없는 기기(대다수 안드로이드/PC)는 0 그대로.
 * 인셋이 있으면 원값 대신 HEADER_SAFE_TOP_CAP_CSS 로 캡(사용자 요청: 15pt 만).
 */
function headerSafeOffsetY(scene: Phaser.Scene): number {
  const sa = typeof window !== 'undefined' ? window.__safeArea : undefined;
  if (!sa) return 0;
  const ds = scene.scale.displayScale;
  const k = ds && ds.y ? ds.y : 1;
  return Math.min(sa.top || 0, HEADER_SAFE_TOP_CAP_CSS) * k;
}

/**
 * 하단 UI(시즌패스 바·미션 게이지 바·콤보/스트릭 아이콘) 전체 — 배너 광고가 떠 있을 때
 * bottomAdOffsetY() 만큼 다 같이 위로 밀어낸다. 콤보 아이콘(layer_1_copy7/layer_1_copy)도
 * 원래 디자인에서 나머지 두 바와 하단 정렬돼 있어(main.json 실측 — 세 요소 밑변이 모두
 * y≈2293) 같이 옮겨야 한 줄로 맞는다(사용자 보고: "하단의 3개 UI를 하단 배치를 맞춰 주세요" —
 * 콤보 아이콘만 빼두면 나머지 두 바만 떠서 정렬이 깨졌었다). 콤보 아이콘이 NO ADS 버튼에
 * 가려지는 건 이미 허용된 사항이라 같이 옮겨도 문제없다.
 */
const BOTTOM_UI_NODE_IDS: ReadonlySet<string> = new Set([
  'layer_1_copy5',
  'layer_1_copy6',
  'layer_1_copy7',
  'layer_2_copy9',
  'layer_2_copy10',
  'layer_9',
  'layer_1_copy',
  'layer_11',
]);

/** 하단 UI 행의 밑변과 배너 윗변 사이 간격(게임 px) — 0 이면 딱 붙는다. */
const BOTTOM_UI_AD_GAP = 6;
/**
 * 광고가 없을 때 하단 UI 행의 밑변과 **화면 아래 끝** 사이 간격(게임 px).
 * 캔버스 자체가 이미 세이프에어리어(홈 인디케이터) 위로 잘려 있어(index.html 의 #game-container
 * padding-bottom) 여기서 또 크게 띄울 필요가 없다 — 살짝만 띄운다.
 */
const BOTTOM_UI_SCREEN_GAP = 12;
/** 배너 위치 재확인 주기(ms) — 광고는 부팅 후 비동기로 붙고, 제거 구매/회전으로도 바뀐다. */
const BOTTOM_UI_RECHECK_MS = 500;

/**
 * 하단 UI(시즌패스 바·미션 게이지 바·콤보 아이콘)의 밑변을 **배너 광고 윗변에 붙이기 위한**
 * 오프셋(게임 px). 양수면 그만큼 위로 민다.
 *
 * ⚠️ 배너는 DOM(index.html #ad-banner-container)이고 게임은 캔버스라 좌표계가 다르다. 예전엔
 * `window.__adBannerHeight`(배너 높이)만 받아 "그 높이에서 상수만큼 뺀 만큼" 밀어올렸는데,
 * 그건 배너가 **어디에** 있는지는 전혀 안 보는 계산이라 하단 UI 와 배너 사이가 화면 비율에 따라
 * 벌어졌다 좁았다 했다(사용자 보고: 아이콘과 배너 사이가 뜬다 → "광고상단에 붙여서 배치").
 * 이제 배너 엘리먼트의 실제 화면 위치(getBoundingClientRect)를 캔버스 위치와 같이 재서
 * 게임좌표로 환산한다 — 배너 높이·세이프에어리어·화면 비율이 어떻든 항상 윗변에 붙는다.
 *
 * 배너가 없으면(광고 미지원·제거 구매) **화면 아래 끝**에 붙인다 — 저작 위치 그대로 두면 바닥에
 * 빈 공간이 남는다(사용자 보고: "아직도 하단 UI가 위쪽으로 좀 올라가 있습니다"). 광고가 있고
 * 없고에 따라 기준선만 바뀌고 "아래에 붙인다"는 규칙은 같다(사용자 요청: "광고위치와 광고 존재
 * 여부에 따라 이 하단 아이콘의 위치는 변한다").
 *
 * @param uiBottomY 하단 UI 행의 밑변(게임 좌표) — 저작값 기준.
 * @returns 위로 밀 거리(게임 px). **음수면 아래로** 내린다.
 */
function bottomAdOffsetY(scene: Phaser.Scene, uiBottomY: number): number {
  return uiBottomY - bottomUiTargetBottomY(scene);
}

/** 하단 UI 행의 밑변이 놓일 기준선(게임 좌표) — 배너가 있으면 배너 윗변, 없으면 화면 아래 끝. */
function bottomUiTargetBottomY(scene: Phaser.Scene): number {
  const screenBottom = scene.scale.height - BOTTOM_UI_SCREEN_GAP;
  if (typeof document === 'undefined') return screenBottom;
  const el = document.getElementById('ad-banner-container');
  if (!el) return screenBottom;
  const banner = el.getBoundingClientRect();
  const canvas = scene.scale.canvasBounds;
  if (banner.height <= 0 || !canvas.height) return screenBottom; // 광고 없음.
  const bannerTopGame = ((banner.top - canvas.top) * scene.scale.height) / canvas.height;
  return bannerTopGame - BOTTOM_UI_AD_GAP;
}
/** 회전 공 애니메이션 키 + 재생 속도(fps). 6프레임이 한 바퀴라 18fps = 초당 3회전. */
const BALL_SPIN_ANIM = 'ball_spin';
const BALL_SPIN_FPS = 18;
/** 홈버튼 눌림 표시 — 눌린 동안 이 배율로 살짝 줄었다가 떼면 복귀. */
const HOME_BUTTON_PRESS_SCALE = 0.92;
/** 기권 확인창 버튼 — 두 개를 화면 중앙에서 좌우로 이만큼씩 벌려 놓는다. */
const FORFEIT_BUTTON_W = 300;
const FORFEIT_BUTTON_GAP = 170;
const SCOREBOARD_FALLBACK: ScoreboardOptions = { entryX: 224, entryY: 305, entryColor: '#4fb3ff', align: 'center' };
/** popInColor=노란색(사용자 요청: "상대방의 최종라운드 표시는 같은 방식의 연출로 적용합니다" —
 * 기존에 튜닝해 둔 팡팡펄스+스탬프 팝인 연출을 재사용) — 에디터 노드엔 없는 연출 전용 옵션이라
 * 노드 데이터와 별개로 항상 적용한다. */
const RIVAL_POP_IN_COLOR = '#ffe14d';
const RIVAL_SCOREBOARD_FALLBACK: ScoreboardOptions = {
  entryX: 845,
  entryY: 305,
  entryColor: '#ff5f5f',
  align: 'center',
  popInColor: RIVAL_POP_IN_COLOR,
};

/** main.json 의 shadowColor(#rrggbb)+shadowAlpha(0~1) → Phaser setShadow 가 받는 rgba() 문자열. */
function shadowRgba(hex: string, alpha: number): string {
  const c = Phaser.Display.Color.HexStringToColor(hex);
  return `rgba(${c.red},${c.green},${c.blue},${alpha})`;
}

/**
 * 최종 라운드 목업 노드(layer_9_copy/layer_9_copy2) → ScoreboardOptions 변환 — 노드를 못 찾으면
 * fallback 그대로 반환. popInColor 는 노드 데이터에 없는 연출 전용 옵션이라 fallback 쪽 값을
 * 그대로 이어받는다(라이벌만 fallback.popInColor 가 설정돼 있다).
 */
function scoreboardOptionsFromNode(node: LayoutNode | undefined, fallback: ScoreboardOptions): ScoreboardOptions {
  if (!node) return fallback;
  // 가로 앵커는 buildLayout 의 일반 텍스트 경로와 같은 규약을 써야 한다(textAnchor — wrapW 상자
  // 노드면 x 가 상자 중심). 두 경로가 갈라지지 않도록 공용 헬퍼를 그대로 쓴다.
  return {
    entryX: textAnchor(node).x,
    entryY: node.y,
    entryFontSize: node.fontSize,
    entryColor: node.color,
    fontFamily: node.fontFamily,
    fontStyle: node.fontStyle,
    align: node.align ?? fallback.align,
    stroke: node.stroke && (node.strokeW ?? 0) > 0 ? { color: node.stroke, width: (node.strokeW ?? 0) * 2 } : undefined,
    shadow: node.shadow
      ? { color: shadowRgba(node.shadowColor ?? '#000000', node.shadowAlpha ?? 1), x: node.shadowX ?? 0, y: node.shadowY ?? 0, blur: node.shadowBlur ?? 0 }
      : undefined,
    popInColor: fallback.popInColor,
  };
}
/** 스코어보드 회차 줄 라벨 — 약자 표기(사용자 요청: "홈런 등의 표시를 약자로 표시하라"). */
const SCOREBOARD_RESULT_LABEL: Record<PitchResult, string> = {
  homerun: 'HR',
  hit: 'H',
  foul: 'F',
  strike: 'K',
};
/**
 * 스코어보드 라벨 → 결과 종류(역방향) — 내 회차 결과를 상대 후보 기록으로 남길 때 쓴다.
 * recordPitchScore 가 라벨만 받기 때문에 되짚어야 한다(호출부를 전부 바꾸는 것보다 국소적).
 */
const SCOREBOARD_LABEL_TO_OUTCOME: Record<string, RivalRoundOutcome> = {
  HR: 'homerun',
  H: 'hit',
  F: 'foul',
  K: 'strike',
  OUT: 'out',
};
/** 라이벌 결과(RivalRoundOutcome, 'out' 포함) → 스코어보드 라벨. 나머지 4종은 SCOREBOARD_RESULT_LABEL 재사용. */
const RIVAL_RESULT_LABEL: Record<RivalRoundOutcome, string> = {
  ...SCOREBOARD_RESULT_LABEL,
  out: 'OUT',
};
/**
 * 히팅존 반지름(px, 1080 기준 디자인 좌표) — 붉은 타격점이 이 원 안 랜덤 위치에 뜬다.
 * 105→92로 축소 — 타격점이 인디케이터 중심에서 덜 흩어져야 탭이 자연히 중심 가까이 몰려
 * 정확도(홈런 등급)에 더 잘 닿는다(사용자 요청: 모바일 난이도 완화 + 홈런 비율↑). 모바일 기준값(let).
 */
let ZONE_RADIUS = 92;
/**
 * 현재 적용 중인 홈런 정확도 기준(judge.ts 의 activeAccuracyTiers.homerun 과 항상 같은 값을
 * PlayScene 쪽에서도 들고 있는다) — 홈런 비거리 산출 시 power(정확도)를 "홈런 문턱~1.0" 구간
 * 기준으로 재정규화하는 데 쓴다(applyDeviceDifficulty 참조).
 */
let ACTIVE_HOMERUN_ACCURACY: number = ACCURACY_TIERS.homerun;

/**
 * PC(데스크톱) 난이도 프로파일 — 위 네 값(+홈런 정확도 기준)은 전부 "모바일 현재 수준 유지"
 * 요청에 따른 모바일 기준값이다. PC 는 "약간 더 어렵게" 요청받아 별도 오버라이드를 둔다:
 * 마우스는 손가락과 달리 클릭 오차가 작으므로 터치 관용을 줄이고, 타이밍 윈도우·타격점 반경도
 * 살짝 좁혀 스킬샷 성격을 더 살린다. applyDeviceDifficulty() 가 create() 시작 시 1회 적용한다.
 */
const DESKTOP_TUNING = {
  pitchMs: 600,
  touchGrace: 3.4,
  pitchTapWindow: 0.46,
  zoneRadius: 102,
  accuracyHomerun: 0.85,
} as const;

/** 디바이스(PC/모바일) 감지 후 난이도 상수를 재설정 — 모바일이면 아무것도 안 바꾼다(기본값=모바일 기준). */
function applyDeviceDifficulty(scene: Phaser.Scene): void {
  // 리그 티어 — 평소엔 로비의 리그 카드(좌/우 전환 버튼)가 정한다. 여기서는 플레이 화면만 직접
  // 열어 볼 때를 위해 URL 쿼리(?tier=1~5)만 반영한다(logic/league.ts).
  initLeagueTierFromUrl();
  if (!scene.sys.game.device.os.desktop) return;
  PITCH_MS = DESKTOP_TUNING.pitchMs;
  TOUCH_GRACE = DESKTOP_TUNING.touchGrace;
  PITCH_TAP_WINDOW = DESKTOP_TUNING.pitchTapWindow;
  ZONE_RADIUS = DESKTOP_TUNING.zoneRadius;
  setAccuracyTiers({ homerun: DESKTOP_TUNING.accuracyHomerun, hit: ACCURACY_TIERS.hit });
  ACTIVE_HOMERUN_ACCURACY = DESKTOP_TUNING.accuracyHomerun;
}
/** 타격 시 카메라 줌 배율 — 타구 방향으로 강하게 확대. */
const HIT_ZOOM = 1.5;
/** 관중석 컨페티 색상 (흰 조각 tint). */
const CHEER_TINTS = [0xffd147, 0xff6b6b, 0x7cd5ff, 0x8dff9e, 0xffffff, 0xff9ff3];
/** 관중석 분출 지점 (W·H 비율) — 좌우 스탠드만 (경기장·전광판 위는 제외). */
const CHEER_SPOTS: ReadonlyArray<[xr: number, yr: number]> = [
  [0.05, 0.37],
  [0.95, 0.37],
  [0.12, 0.32],
  [0.88, 0.32],
  [0.2, 0.27],
  [0.8, 0.27],
];
/**
 * 진입 연출 — 씬 시작 시 타자 클로즈업에서 시작해 전체 화면으로 줌아웃하며 오프닝.
 * 인트로가 끝나면 줌 1·중앙 정렬(identity)로 정확히 복귀해 이후 로직(휴식 시 카메라=identity 전제)을 지킨다.
 */
const INTRO_ZOOM = 1.55;
/** 클로즈업 중심을 타격 지점보다 위로 올리는 비율(타자 상반신이 보이도록, h 기준). */
const INTRO_FOCUS_Y_OFFSET = 0.09;
/** 클로즈업 유지 시간(ms) — 줌아웃 시작 전 잠깐 정지. */
const INTRO_HOLD_MS = 200;
/** 줌아웃(오프닝) 지속 시간(ms). */
const INTRO_MS = 750;
/**
 * 경기장 공개 연출 — 줌아웃이 끝난 뒤(identity 정착) 카메라를 좌→우로 훑어 경기장 전체와
 * 홈런포인트 과녁을 보여준 뒤 중앙으로 복귀, 그 다음에야 첫 투구가 시작된다(사용자 요청).
 * 좌/우 각 구간은 REVEAL_LEG_MS, 가운데를 가로지르는 구간(좌→우)은 그 2배.
 */
const INTRO_REVEAL_LEG_MS = 750;
/** 배경 경계까지 완전히 붙지 않게 화면폭 비율만큼 여유를 둔다(가장자리 노출 방지). */
const INTRO_REVEAL_INSET_RATIO = 0.12;
/**
 * 플레이 화면 좌우 드래그(사용자 요청: "화면을 좌우로 끌 수 있다... 고무줄에 연결된 화면을
 * 좌우로 끌어서 좌우를 살펴볼 수 있는 구조... 놓으면 다시 원점으로 회복"). 스윙 탭은 즉시(pointerdown
 * 순간) 판정되므로, 타이밍이 걸린 상태('pitch')에 드래그가 끼어들면 안 된다 — state==='ready'
 * (투구 준비/인디케이터 예고 구간, 다음 투구 전까지) 동안에만 허용하고 진입 연출 중에도 막는다
 * (introComplete 참조).
 * ⚠️ 고무줄 느낌 — 손가락 이동량을 그대로(1:1) 스크롤에 반영하지 않고 제곱근으로 눌러(당길수록
 * 저항이 커짐), 놓으면 Back.easeOut 트윈으로 원점(scrollX=0)까지 튕기듯 복귀시킨다.
 */
const CAMERA_DRAG_ELASTIC_SCALE = 45; // 손가락 이동 1px당 스크롤 반응 배율(제곱근 곡선의 계수).
const CAMERA_DRAG_SNAPBACK_MS = 550;
/**
 * "투수가 공을 던지지 않았다면 좌우 드래그하는 도중에 공을 투구하지 않는다. 공이 투구 0.5초
 * 전에는 드래그를 막는다"(사용자 추가 요청) — 두 규칙이 상호보완적으로 맞물린다.
 *  · LOCKOUT: 예정된 투구 시각(scheduledThrowAt) 0.5초 전부턴 새 드래그를 아예 시작 못 한다 —
 *    막판에 드래그를 시작해 타이밍을 방해하는 걸 막는다.
 *  · 그래도 이미 드래그 중이던 상태로 예정 시각이 되면 throwPitch() 를 곧장 부르지 않고
 *    attemptThrowPitch() 가 손을 뗄 때까지 짧게 재시도한다(THROW_WAIT_CAP_MS 까지만 — 손가락이
 *    화면에 눌린 채 멈추는 등의 예외 상황에서도 게임이 영원히 멈추지 않도록 하는 안전망).
 */
const CAMERA_DRAG_LOCKOUT_MS = 500;
const CAMERA_DRAG_THROW_POLL_MS = 80;
const CAMERA_DRAG_THROW_WAIT_CAP_MS = 2000;
/** 카메라가 타구를 한 박자 늦게 쫓아가는 지연(ms). */
const CAM_FOLLOW_DELAY_MS = 150;
/**
 * 임팩트 연출 — 셰이크 + 공 화이트 플래시 + 트레일(전 타구 공통).
 * 슬로우모션은 여러 방식을 거쳐 지금 형태로 정착했다 — 실패 이력을 남겨 재시도 방지:
 *  ① "발사(비행) 자체를 늦추는" 방식 — "톡 튀는" 위화감으로 제거.
 *  ② "tweens.timeScale 로 전역 트윈만 늦추는" 방식 — 타자 스윙은 Phaser 트윈이 아닌 별도
 *     클립 플레이어(characterRig)로 재생돼 전혀 안 늦춰지고, 공은 남은 실시간이 짧을수록
 *     (흔한 경우) 사실상 멈췄다가 컨택 순간 순간이동하는 것처럼 보였다.
 *  ③ "화면 좌표 직선 트윈(x/y 보간)" — 투구의 실제 곡선(커브·처짐·원근)을 무시해 막판에 방향이
 *     꺾이는 부자연스러움, 이후 onContact() 의 배트 접점 강제 스냅이 "톡 튀는" 팝으로 보였다.
 *  ④ "남은 자연 도달 시간 + 소폭 여유"로 지속시간을 정함 — 탭이 자연 도달 시점에 가까울수록
 *     (흔한 경우) 여유가 거의 없어 "급격히 느려지는" 게 전혀 안 보였다.
 *  ⑤ "이미 재생 중인 스윙의 남은 꼬리만 늦추기"(slowActiveActionTo) — 스윙 트리거는 탭보다
 *     훨씬 이전(투구 시작+95ms)에 발동돼, 탭 시점(보통 300ms 이후)엔 컨택 키프레임을 이미
 *     정상 속도로 지나 있었다. 남은 꼬리(팔로우스루)만 늦춰봐야 "스윙이 이미 끝나고 뒤에서
 *     다시 때리는" 것처럼 보였다(사용자 피드백).
 *  ⑥ "elapsed=0(준비 자세)부터 통째로 재시작"(restartActionSlow) — 스윙 전체를 되감아
 *     "헛스윙 후 다시 치는" 두 번째 스윙처럼 보였다.
 *  ⑦ "항상 고정 지점(키프레임-N ms)으로 되감기" — 탭이 키프레임보다 이르면(흔한 경우) 불필요한
 *     되감기가 들어가 재생 중이던 애니메이션이 순간적으로 "스킵/점프"하는 것처럼 보였다.
 *  ⑧ "스윙은 투구 시작+95ms 에 자동 발동"(탭 무관) — 사용자가 "탭하지도 않았는데 자동으로
 *     스윙한다"고 지적, 자동 발동을 완전히 폐지했다.
 * 최종 방식(현재):
 *  · 스윙은 자동 발동 없이 **탭한 순간에만** batterRig.swingOnTap() 이 처음부터 재생한다 —
 *    컨택 키프레임이 "지금부터 남은 시간"(히트/파울=pitchStartAt+PITCH_MS 까지, 홈런=
 *    HR_ANTICIPATION_MS) 후에 오도록 매번 재생 속도를 계산해 공과 항상 정확히 같은 순간에 끝난다.
 *  · 홈런 예감 슬로우모션 지속시간을 고정값(HR_ANTICIPATION_MS)으로 정해 탭 타이밍과 무관하게
 *    항상 뚜렷하게 느려진다. 공은 startHomerunAnticipation() 이 탭 시점에 투구 트윈을 넘겨받아,
 *    기존 경로 함수(곡선 그대로) 위에서 진행도만 느린 이징(Sine.easeIn)으로 이 시간에 걸쳐 재생한다.
 *  · 동시에 progress≥CONTACT_PULL_START(일반 타구)/트윈 진행률(홈런)로 배트 접점(batContactX/Y)에
 *    서서히 자석처럼 당겨(선형 보간) — 컨택 순간엔 이미 그 위에 있어 최종 스냅이 안 보인다.
 *  · 컨택 직후엔 onContact() 가 짧게 붙잡았다(HR_HANG_*) 정상 속도로 램프해
 *    "느리게 들어와 퍽! 하고 확 날아가는" 손맛을 낸다.
 */
const IMPACT_SHAKE_MS = 90;
const IMPACT_SHAKE_INTENSITY = 0.004;
const IMPACT_FLASH_MS = 70;
/**
 * 타격음(스윙+히트) 지연(ms) — 시각적 컨택 프레임 직후가 아니라 아주 약간 늦게 낸다(사용자
 * 요청: "타격동작보다 아주 약간 느리게... 사운드의 속도가 있기에"). 실제로 소리는 빛보다
 * 훨씬 느려 타석 인근 관객/카메라 기준으로도 수십 ms 늦게 들린다 — 그 정도를 흉내 낸 값.
 * 스윙 사운드도 같은 지연으로 같이 내 컨택 순간에 스윙+히트가 겹쳐 들리게 한다(사용자 보고:
 * "스윙과 타격이 겹쳐서 출력되어야... 지금은 순차적으로 나타납니다").
 */
const IMPACT_SFX_DELAY_MS = 60;
/**
 * 진동 피드백(사용자 요청: "베팅시 히트 혹은 홈런시 진동을 적용") — @casual/core 의 공용
 * vibrate() 를 쓴다(Web Vibration API, 미지원 브라우저에선 자동 no-op). 진폭 제어가 없는
 * API라 "세기"는 길이·펄스 구성으로만 표현할 수 있다 — 홈런은 히트보다 뚜렷이 강하게(사용자
 * 요청: "홈런 진동은 좀 강하게") 두 번 울리는 패턴으로 차별화했다.
 */
const HIT_VIBRATION_MS = 40;
// vibrate() 시그니처(number[])와 맞추려 readonly 아닌 일반 배열로 선언.
const HOMERUN_VIBRATION_PATTERN: number[] = [0, 70, 50, 160];
/**
 * 홈런 비거리(m) 정규화 상한/하한 — onContact() 의 METERS_BY_STYLE 전체 범위(liner 하한~towering
 * 상한)와 동일. 히트/홈런 효과음 볼륨을 비거리에 비례시키는 데 쓴다(사용자 요청: "홈런이나
 * 비거리가 길수록 히트 사운드를 최대크게").
 */
const HOMERUN_METERS_MIN = 96;
const HOMERUN_METERS_MAX = 230;
/**
 * 게이지 만점 기준 = **9회를 전부 최대 비거리 홈런으로 채웠을 때의 점수**.
 * 홈런 점수 = 비거리(m) 이고(scoring.homerunScore) 최대 비거리가 HOMERUN_METERS_MAX 이므로,
 * 한 회차 최대 = 230점 · 9회 = 2,070점이 만점이 된다.
 *
 * 과녁(홈런포인트)을 맞히면 배율(1.5~3배)이 붙어 이 값을 넘길 수 있는데, 그건 넘치는 대로 두지
 * 않고 100% 에서 멈춘다. 이론상 최대치(230×3×9=6,210)를 만점으로 잡으면 잘 친 경기에서도 막대가
 * 3분의 1도 안 차 "경쟁"이 읽히지 않기 때문 — 게이지는 정확한 비율표가 아니라 격차를 보여 주는
 * 장치다.
 */
const GAUGE_FULL_SCORE = HOMERUN_METERS_MAX * PITCHES_PER_GAME;
function homerunSfxIntensity(meters: number): number {
  return Phaser.Math.Clamp((meters - HOMERUN_METERS_MIN) / (HOMERUN_METERS_MAX - HOMERUN_METERS_MIN), 0, 1);
}
/** 컨택 지점 마스킹 플래시 반경(px, 1080 디자인) — 공/배트 레이어 경계를 가릴 만큼 큼직하게. */
const CONTACT_MASK_R = 46;
/**
 * 투구 진행도(progress) 이 값부터 공을 배트 접점(batContactX/Y)으로 서서히 당긴다(선형 보간, 1.0=완전
 * 도달) — 컨택 순간 이미 배트 위에 있어 onContact() 의 안전망 스냅이 시각적으로 드러나지 않는다.
 */
const CONTACT_PULL_START = 0.85;
/**
 * t>1(존 통과 후) 구간에서 배트 접점 당김을 "즉시 0"이 아니라 이 비율만큼 서서히 풀어준다.
 * ⚠️ 이전엔 t=1 에서 pull 이 1(배트 접점)→0(원래 포구 경로)으로 즉시 끊겨, 타점(batContactX/Y)과
 * 포구 경로 시작점(zoneX3/zoneY3 투영)이 다른 좌표라 공이 그 지점에서 눈에 띄게 꺾이며 미트로
 * "빨려들어가는" 것처럼 보였다(사용자 보고). t=1 이후에도 짧게 당김을 유지하며 서서히 풀어
 * 두 경로 사이를 부드럽게 이어준다.
 */
const CONTACT_PULL_RELEASE_FRAC = 0.45;
/**
 * 홈런 예감 슬로우모션 — 탭 시점부터 컨택까지, 고정된 실시간(ms) 동안 재생한다.
 * ⚠️ 이전엔 "남은 자연 도달 시간 + 소폭 여유"로 계산했는데, 탭이 자연 도달 시점에 가까울수록
 * (흔한 경우) 여유가 거의 없어 "급격히 느려지는" 게 전혀 안 보였다. 고정 길이로 바꿔 탭 타이밍과
 * 무관하게 항상 뚜렷하게 느려지도록 한다 — 공(경로 함수 위 진행도)과 스윙(batterRig)을 **같은**
 * 이 값으로 맞춰야 둘이 어긋나지 않는다(공은 Sine.easeIn 재생, 스윙은 CharacterRig.swingOnTap 이
 * 클립을 처음부터 정확히 이 시간 동안 컨택 키프레임까지 재생하도록 속도를 계산한다).
 */
const HR_ANTICIPATION_MS = 600;
/** 홈런 컨택 직후 짧게 붙잡아두는(행타임) 슬로우 배율 — update() 의 물리 dt 에만 곱한다. */
const HR_HANG_SCALE = 0.4;
/** 행타임 유지 시간(ms, 실시간). */
const HR_HANG_HOLD_MS = 90;
/** 행타임에서 정상 속도로 되돌아가는 램프 시간(ms, 실시간). */
const HR_HANG_RAMP_MS = 180;
/**
 * 수비수 캐치 판정 반경(px, 월드 좌표) — 안타 궤적이 이 안에 들어오면 "맞았거나 근처" 로 간주해
 * 아웃 처리한다. 85 는 너무 넉넉해 살짝 스쳐 지나가는 궤적까지 아웃으로 삼켜버렸다(사용자 보고:
 * "수비수 근처에 공이 떨어지지 않을 경우 안타로 처리하라") — 확실히 근처에 온 경우만 아웃으로.
 */
const FIELDER_CATCH_R = 62;
/**
 * 수비수 자석 — "구르는 중"인 타구에만 적용한다(사용자 요청: "자석기능은 기본적인 궤적을
 * 유지하되, 수비수 근처에서 볼이 구를경우에만 자석기능을 적용" — 공중 비행 중엔 launchFor() 가
 * 고른 원래 포물선을 그대로 유지, 굴러가는 동안만 수비수 쪽으로 서서히 휘어 들어간다).
 * FIELDER_CATCH_R(캐치 판정 반경)보다 넓은 "인력 범위" 안에 들어오면 가까울수록 강하게
 * 끌어당기다가, 그 반경 안(FIELDER_CATCH_R)까지 가까워지면 공이 수비수에게 흡수되어 사라진다
 * (사용자 요청: "볼이 수비수에게 가까이할 경우 수비수에게 흡수되고 사라지게 만들라").
 */
const FIELDER_MAGNET_RANGE = 260;
const FIELDER_MAGNET_STRENGTH = 0.14;
/** 공 추적 lerp — 작을수록 카메라가 늦게 부드럽게 따라붙는다. */
const CAM_FOLLOW_LERP = 0.08;
/** 카메라 복귀(팬/줌) 시간(ms). */
const CAM_RESET_MS = 400;
/**
 * 타구 궤적 트레이서 폭 — 각 지점의 공 크기(scale)에 비례(코어) + 낮은 하한 + 글로우 배수.
 * 공 크기가 원근으로 멀수록 작아지므로 궤적도 **가까운 타자쪽=굵고, 멀어질수록 가늘어지는**
 * 테이퍼(혜성 꼬리)가 된다. 글로우+코어 2겹으로 가는 구간도 완전한 실선으로 보이지 않게 유지.
 */
const TRACER_CORE_MULT = 26;
const TRACER_MIN_W = 2.5;
const TRACER_GLOW_MULT = 2.8;

/** 화면 비율 좌표 (배경 cover 크롭 기준. x 는 1080 디자인 px, y 는 height 비율). */
const POS = {
  zoneXRatio: 0.50,  // 스트라이크존 — 홈플레이트 중심 (화면 중앙)
  zoneY: 0.67,
  resultY: 0.27,     // 결과 라벨
  pitchInfoY: 0.80,  // 구종+구속 라벨(화면 하단 고정 UI) — 하단 버튼 행보다 위.
} as const;

/** 배경 원본 해상도 (홈플레이트 BG 원본 좌표 환산용) — BG_06_v3 정사각 원본(1254×1254). */
const BG_SRC = { width: 1254, height: 1254 } as const;

/**
 * 필드 좌표의 기준 디자인 **폭** — 에디터 SSOT(1080×2400)의 저작 폭. 캔버스 폭이 가변
 * (designWidthRange, 1080~1440)이라 `scale.width` 와는 다를 수 있어, "저작 기준" 임계값에는
 * 반드시 이 상수를 쓴다(FIELD_DESIGN_H 와 같은 역할).
 */
const FIELD_DESIGN_W = 1080;

/** 코드 기본 배치로 세운 타자 노드의 id — 에디터 노드와 구분되도록 접두사를 둔다. */
const DEFAULT_BATTER_NODE_ID = 'batter_default';

/**
 * 에디터에 타자 노드가 없으면 **기본 배치 타자 노드를 끼운 새 문서**를 반환(원본 불변).
 *
 * 배경: 타자를 어느 캐릭터로 그릴지는 로비 선택(프리셋)이 정하고, 에디터 노드는 위치·크기만
 * 제공한다. 그래서 그 배치를 코드 기본값(DEFAULT_BATTER_PLACEMENT)으로 옮기면 **에디터에서
 * 타자 노드를 지워도** 타자가 정상적으로 뜬다(사용자 지시). 에디터에 타자 노드가 있으면
 * 그쪽이 이긴다 — 디자이너가 배치를 다시 잡을 여지를 남긴다.
 *
 * 이름에 '투수'가 들어가면 안 된다 — isPitcherNode 가 이름으로 투수를 가린다.
 */
function withDefaultBatterNode(doc: LayoutDoc): LayoutDoc {
  if (!Array.isArray(doc.nodes) || hasBatterNode(doc.nodes)) return doc;
  const p = DEFAULT_BATTER_PLACEMENT;
  const batter: LayoutNode = {
    id: DEFAULT_BATTER_NODE_ID,
    type: 'spriteDocClip',
    name: '캐릭터: 타자(코드 기본 배치)',
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
    depth: p.depth,
    autoPlay: true,
  };
  return { ...doc, nodes: [...doc.nodes, batter] };
}

/**
 * 에디터 레이아웃의 "배경" 노드 판별 — 키에 BG 가 들어가거나 저작 프레임 폭 이상으로 꽉 찬 이미지.
 * 배경은 월드에서 cover 로 직접 배치하므로(물리 앵커 보존) HUD 레이아웃 빌드에서는 제외한다.
 * ⚠️ 임계값은 캔버스 폭이 아니라 저작 폭(FIELD_DESIGN_W) — 가로 확장 구간에서 캔버스가 넓어져도
 * 같은 노드가 계속 배경으로 판별돼야 한다.
 */
function isBackgroundNode(n: LayoutNode): boolean {
  return n.type === 'image' && (/bg/i.test(n.key ?? '') || (n.w ?? 0) >= FIELD_DESIGN_W);
}

/**
 * 에디터 레이아웃의 "수비수" 노드 판별 — 이름에 '수비수' 또는 키가 Ch-3 아틀라스인 이미지.
 * 수비수는 필드 요소라 배경·캐릭터처럼 월드 레이어(카메라 줌/팬 추종)에 직접 배치하고
 * HUD 레이아웃 빌드에서는 제외한다(고정 HUD 로 라우팅돼 디밍·팬 미추종되는 것 방지).
 * 디자이너가 에디터에서 배치 → 코드 하드코딩 수비 배치는 제거됨(2026-07-04).
 */
function isFielderNode(n: LayoutNode): boolean {
  return n.type === 'image' && (/Ch-3/i.test(n.key ?? '') || (n.name ?? '').includes('수비수'));
}

/**
 * 가변 캔버스 높이의 세로 앵커(pin) 오버라이드 — 월드(필드) 노드는 전부 bottom.
 * 배경·수비수·캐릭터(타자/투수)·필드영역(zone)·전광판(fillClip=world) 은 한 몸으로 바닥에
 * 붙어야 배경 크롭과 투영 좌표(projectedGroundY)가 일치한다. 휴리스틱에 맡기면 전광판(y705)
 * 은 top, 투수(y1286)는 center 로 흩어져 필드가 찢어진다. 스크린 HUD 노드는 명시하지 않는다 —
 * 휴리스틱(상단⅓=top·하단⅓=bottom)이 main.json 전 노드에서 올바르게 떨어짐을 실측 확인.
 */
function worldPinOverrides(doc: LayoutDoc): Record<string, PinMode> {
  const overrides: Record<string, PinMode> = {};
  for (const n of doc.nodes) {
    const isWorld =
      isBackgroundNode(n) ||
      isFielderNode(n) ||
      n.type === 'spriteDocClip' ||
      n.type === 'zone' ||
      (n.space ?? (n.fillClip ? 'world' : 'screen')) === 'world';
    if (isWorld) overrides[n.id] = 'bottom';
  }
  return overrides;
}

/**
 * 에디터 레이아웃의 "스코어보드 목업" 텍스트 노드 판별 — main.json layer_9 계열("2R Homerun 110"
 * 등 디자인용 예시 텍스트). Scoreboard 클래스가 같은 좌표에 실제 값을 코드로 렌더하므로 목업
 * 텍스트를 그대로 두면 이중 표기로 겹쳐 보인다(사용자 보고: "게임화면에서 이중으로 나타남").
 * HUD 빌드에서 제외해 코드 렌더만 남긴다. ⚠️ 반드시 type==='text' 도 같이 확인할 것 — 에디터가
 * 레이어를 재구성하며 id 를 재사용해 layer_9 가 완전히 다른 노드(하단 아이콘 이미지)를 가리킨
 * 적이 있다(사용자 보고: "하단 아이콘 부분을 다시설정 저장" 이후 아이콘이 사라짐). id 만 보고
 * 걸러내면 그 이미지까지 스코어보드 목업으로 오인해 통째로 숨겨버린다.
 */
function isScoreboardMockupNode(n: LayoutNode): boolean {
  return n.type === 'text' && (n.id === 'layer_9' || n.id.startsWith('layer_9_copy'));
}

/** 헤더 트로피 총점 표기 — 에디터 목업("1,835")과 같은 천단위 콤마 형식. */
function formatScore(score: number): string {
  return score.toLocaleString('en-US');
}

/** 경기 결과 — 결과화면 배지(RESULT_BADGE_* / up_Homerun_UI_14-1) 선택 기준. */
type GameOutcome = 'win' | 'lose' | 'draw';

/**
 * 스무스스텝(0~1) — 양끝(0,1)에서 기울기(속도)가 0으로 수렴하는 S자 보간. 선형 보간과 달리
 * 시작·끝 지점에서 "속도가 갑자기 바뀌는" 느낌(꺾임)이 없다. 투구 궤적의 배트 접점 당김
 * (CONTACT_PULL_START 이후)에 써서 당김이 시작/해제되는 지점에서 공이 부드럽게 방향을
 * 바꾸도록 한다 — 선형이면 위치는 이어지지만 속도가 그 지점에서 뚝 꺾여 눈에 띈다.
 */
function smoothstep01(p: number): number {
  const c = Phaser.Math.Clamp(p, 0, 1);
  return c * c * (3 - 2 * c);
}

/** 표준 레이캐스팅 점-폴리곤 판정 — 필드영역(에디터 zone 폴리곤) 안팎 검사에 쓰인다. */
function pointInPolygon(x: number, y: number, points: ReadonlyArray<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * 안타의 낙구 구역(내야/외야) 판정 — 사전에 정해둔 발사 유형이 아니라 **실제 도달한 깊이**로
 * 정한다(사용자 요청: "정확한 궤적을 기반으로 표현"). 발사 시 무작위로 고른 유형(라이너/
 * 내야/플라이)은 초기 속도일 뿐, 바운드·필드영역 감쇠 등을 거친 뒤 실제로 어디까지 갔는지와는
 * 다를 수 있어 결과 표시·점수 산정 모두 항상 실측(z) 기준으로 한다. 안타 점수(logic/scoring.ts)도
 * 이 구역 판정을 그대로 재사용한다.
 */
function hitZoneFromDepth(z: number): HitZone {
  return z < INFIELD_DEPTH_MAX ? 'infield' : 'outfield';
}

/** 안타 결과 라벨(야구 용어) — 낙구 구역에 따라 "내야안타!"/"외야안타!". */
function hitResultLabel(zone: HitZone): string {
  return zone === 'infield' ? '내야안타!' : '외야안타!';
}

/**
 * 수비 판정 라벨(야구 용어) — "수비 성공!" 같은 포괄 표현 대신, 실제 궤적(지면 접촉 여부)·발사
 * 설계 유형과 잡은 수비수의 좌우 위치로 유형+포지션을 표기한다(사용자 요청). 캐치 순간 공이
 * 이미 땅에 닿아 있었으면(grounded, 실측) "땅볼 아웃" — 안 닿았어도 애초에 launchFor() 가
 * 고른 발사 유형이 grounder(내야안타성 짧은 타구)면 마찬가지로 "땅볼 아웃"으로 본다(사용자
 * 재보고: "라이너아웃이 대부분입니다. 땅볼일 경우가 많은데 판단을 제대로 하여 아웃을
 * 평가하세요" — 수비수가 첫 바운드 전에 잡아버리면 grounded 가 false 로 남아, 원래 땅볼성으로
 * 설계된 타구도 전부 "라이너"로 뭉뚱그려지던 문제). 나머지는 발사 유형 그대로 라이너/뜬공.
 * 좌익수/중견수/우익수는 개별 포지션 데이터가 없어 좌우 3분할로 추정한다.
 */
function fielderOutLabel(
  grounded: boolean,
  trajectoryKind: HitTrajectoryKind,
  fielderX: number | undefined,
  centerX: number,
): string {
  if (fielderX === undefined) return '내야땅볼 아웃!';
  const side = fielderX < centerX - 150 ? '좌익수' : fielderX > centerX + 150 ? '우익수' : '중견수';
  const verb =
    grounded || trajectoryKind === 'grounder' ? '땅볼 아웃!' : trajectoryKind === 'liner' ? '라이너 아웃!' : '뜬공 아웃!';
  return `${side} ${verb}`;
}

/**
 * 포수 미트 — 공이 "도착하는 순간에만" 잠깐 나타나 포구 후 사라진다 (타격 시 미등장).
 * 50% 투명이라 꽂힌 공이 미트 너머로 비쳐 보인다. 공은 미트 정중앙에 도착한다.
 */
const MITT_ALPHA = 0.5;
const MITT_DISPLAY_W = 345;
const MITT_TEX_SIZE = 192;
/** 홈플레이트 꼭지점(포수 쪽 끝) — BG_06_v3 원본(1254×1254) 좌표. 투구 종착점(≈중앙 하단). */
const PLATE_APEX_SRC = { x: 628, y: 1045 } as const;

/**
 * 구종(구질+구속) — 투구마다 하나씩 뽑아 궤적 셰이핑·구속·색 티를 바꾼다(사용자 요청: "구질과
 * 구속을 적용"). PITCH_MS(모바일/PC 기준 구속, applyDeviceDifficulty 가 정함)를 "직구 기준"으로
 * 삼고 나머지는 배율로 파생 — 기존 기기별 난이도 차등은 그대로 유지된다.
 *  · speedMult: PITCH_MS 에 곱하는 배율(클수록 느림).
 *  · curveMagMin/Max: 좌우 휘어짐 폭(px, 부호는 매 투구 랜덤).
 *  · shape(t): 진행도(0=릴리스~1=존 도달)에서 curveMag 에 곱할 계수 — 휘는 "타이밍"을 결정한다.
 *  · sagMult: 중력 처짐(PITCH_SAG_H) 배율 — 커브의 낙차감용.
 *  · weight: 가중치 랜덤 선택 비중. tint: 공 스프라이트 색조(은은한 시각적 티).
 */
interface PitchTypeDef {
  readonly id: 'fastball' | 'fastFastball' | 'slider' | 'curve' | 'changeup';
  readonly label: string;
  readonly speedMult: number;
  readonly curveMagMin: number;
  readonly curveMagMax: number;
  readonly shape: (t: number) => number;
  readonly sagMult: number;
  readonly weight: number;
  readonly tint: number;
  /**
   * 타이밍 링(노란 원)이 붉은 원 크기까지 수축하는 이징 — 구질별로 달라 "타격원이 구질·속도에
   * 따라 게임성을 조절하는" 핵심 요소가 되게 한다(사용자 요청). 직구/빠른 직구=선형(기준, 가장
   * 읽기 쉬움), 슬라이더=초반 완만·막판 급격(late break를 링 수축으로도 체감), 커브=초반 급격·
   * 막판 완만(일찍 훅 들어와 보이지만 마지막엔 참을성 필요), 체인지업=직구와 동일(궤적처럼 링도
   * 똑같이 속여야 체인지업다움 — 사용자 요청과 별개로 기존 "속도로만 속인다" 설계와 일관되게 유지).
   */
  readonly ringEase: string;
  /**
   * 붉은 타격점이 "점"에서 커지기 시작하는 위치 — 존 중심(zoneX/zoneY) 기준 오프셋(px, 1080
   * 디자인). 생략하면 중심(0,0)에서 커진다(사용자 요청: "직구일 경우 중심에서 커지는 방식으로
   * 진행... 슬라이드 커브 등 구질에 따라서 커지는 중심점이 다르게 설정되도록"). 슬라이더는
   * 좌우로 꺾이는 구질이라 옆에서, 커브는 위에서 떨어지는 구질이라 위에서 시작해 존 중심으로
   * 모여들며 커진다. 체인지업은 궤적처럼 직구와 완전히 동일해야(기존 설계) 오프셋도 생략.
   */
  readonly dotGrowOffset?: { x: number; y: number };
}

const PITCH_TYPES: readonly PitchTypeDef[] = [
  {
    id: 'fastball',
    label: '직구',
    speedMult: 1.0,
    curveMagMin: 20,
    curveMagMax: 45,
    shape: (t) => Math.sin(Math.PI * t), // 완만한 대칭 곡선 — 지금까지의 기본 궤적과 동일.
    sagMult: 1.0,
    weight: 40,
    tint: 0xffffff,
    ringEase: 'Linear',
  },
  {
    // 사용자 요청: "직구도 빠른 직구도 추가하라" — 기존 직구보다 더 빠른 별도 구종.
    id: 'fastFastball',
    label: '빠른 직구',
    speedMult: 0.82, // PITCH_MS 배율 — 1.0(직구)보다 짧아 더 빠르게 존에 도달.
    curveMagMin: 20,
    curveMagMax: 45,
    shape: (t) => Math.sin(Math.PI * t), // 직구와 같은 궤적 — 오직 구속만 다르다.
    sagMult: 1.0,
    weight: 15,
    tint: 0xeaffff, // 살짝 청백색 — 빠른 공 느낌의 은은한 티.
    ringEase: 'Linear',
  },
  {
    id: 'slider',
    label: '슬라이더',
    speedMult: 1.08,
    curveMagMin: 60,
    curveMagMax: 100,
    shape: (t) => Math.sin(Math.PI * t) ** 3, // 존 앞까지 거의 직선이다 막판에 날카롭게 꺾임(late break).
    sagMult: 1.0,
    weight: 20,
    tint: 0xfff2a0,
    // late break 를 링 수축으로도 체감 — 초반엔 거의 안 줄다 막판에 확 줄어든다(더 어렵게 읽힘).
    ringEase: 'Sine.easeIn',
    // 0.9→0.55→0.3(사용자 재요청: "붉은색 원의 중심점 변동이 너무 편차가 커서 타격이 힘들다" —
    // 실제 판정은 항상 고정된 zoneX/zoneY 기준이라, 시각적 오프셋이 크면 탭 시점에 보이는
    // 위치와 실제 판정 위치가 크게 어긋나 보여 체감 난이도만 불필요하게 올라갔다).
    dotGrowOffset: { x: RED_DOT_R * 0.3, y: 0 }, // 좌우로 꺾이는 구질 — 옆에서 시작해 중심으로 모임.
  },
  {
    id: 'curve',
    label: '커브',
    speedMult: 1.18,
    curveMagMin: 90,
    curveMagMax: 140,
    shape: (t) => Math.sin(Math.PI * t ** 0.6), // 초반부터 넓게 휘는 완만한 아치.
    sagMult: 1.6, // 낙차 추가 — 12-6 커브 느낌.
    weight: 15,
    tint: 0xa0d8ff,
    // 초반에 급격히 줄었다 막판엔 거의 안 줄어든다 — 일찍 훅 들어와 보이지만 마지막 참을성이 관건.
    ringEase: 'Sine.easeOut',
    // 0.9→0.55→0.3(사용자 재요청 — 위 슬라이더 dotGrowOffset 주석 참조).
    dotGrowOffset: { x: 0, y: -RED_DOT_R * 0.3 }, // 위에서 떨어지는 구질(12-6) — 위에서 시작해 아래 중심으로.
  },
  {
    id: 'changeup',
    label: '체인지업',
    speedMult: 1.3, // 가장 느림 — 궤적은 직구와 동일해 속도로만 타이밍을 속인다.
    curveMagMin: 20,
    curveMagMax: 45,
    shape: (t) => Math.sin(Math.PI * t),
    sagMult: 1.0,
    weight: 15,
    // 궤적처럼 링 수축·타격점 성장 위치도 직구와 완전히 동일해야 "속도로만 속인다"는 설계가 유지된다.
    ringEase: 'Linear',
    tint: 0xffb3b3,
  },
];

/** 직구 계열(변화 없음) — 티어의 offspeedWeightMult 배율에서 제외한다. */
function isFastballFamily(id: PitchTypeDef['id']): boolean {
  return id === 'fastball' || id === 'fastFastball';
}

/** 가중치 랜덤으로 구종 하나 선택. forceFastball 이면 첫 투구를 항상 직구로(워밍업). */
function pickPitchType(forceFastball: boolean): PitchTypeDef {
  if (forceFastball) return PITCH_TYPES[0];
  // 티어가 변화구 비중을 밀어올린다(offspeedWeightMult) — 직구 계열은 그대로, 나머지만 배율.
  const total = PITCH_TYPES.reduce(
    (sum, p) => sum + (isFastballFamily(p.id) ? p.weight : p.weight * getLeagueTier().offspeedWeightMult),
    0,
  );
  let r = Math.random() * total;
  for (const p of PITCH_TYPES) {
    r -= isFastballFamily(p.id) ? p.weight : p.weight * getLeagueTier().offspeedWeightMult;
    if (r < 0) return p;
  }
  return PITCH_TYPES[0];
}

/** 에디터 UI 일괄 투명도 — 10% 투명(알파 0.9). 캐릭터 아바타는 제외. */
const UI_DIM_ALPHA = 0.9;
const UI_AVATAR_KEYS: ReadonlySet<string> = new Set(['up_Homerun_UI_01-1', 'up_Homerun_UI_03-1']);

/** HUD 캡슐/버튼 치수 (720 디자인 px). */
const HUD = {
  capsuleY: 18,
  capsuleH: 52,
  capsuleRadius: 26,
  scoreW: 220,
  pitchW: 140,
  margin: 16,
  buttonW: 280,
  buttonH: 84,
} as const;

// ─── 타구 물리 (전방 시점 의사 3D) ────────────────────────────────────
// 월드 좌표: x3=좌우(px), y3=높이(px), z=깊이(px, 외야 방향). 단위는 z=0 화면 px 등가.
// 원근 투영: p = FOCAL/(FOCAL+z). 화면크기·좌우오프셋·높이 모두 p 배,
// 지면선은 홈플레이트(0.74H)에서 지평선(0.32H)으로 p 비율 수렴.

/**
 * 원근 초점거리 — 작을수록 멀어질 때 더 빨리 작아진다.
 * 1300: 내야(z≈0~1800)가 지면선 0.76→0.55H(실측 내야 잔디 경계)에 걸치도록 조정 —
 * 내야 거리감이 충분히 펼쳐진 뒤 외야·펜스로 수렴한다.
 */
const PROJ_FOCAL = 1300;
/**
 * 외야 심도 확장 — 이 깊이(z, 실측 내야 경계와 일치) 너머는 화면상 더 천천히 진행되도록 "늘여"
 * 외야 공간이 더 깊고 넓게 느껴지게 한다(사용자 요청: "외야쪽의 공간적 심도를 더 깊게").
 * 내야(z≤이 값)는 건드리지 않아 실측 캘리브레이션(위 PROJ_FOCAL 주석)이 그대로 유지된다.
 */
const OUTFIELD_DEPTH_START_Z = 1800;
/**
 * 외야 구간의 깊이 확장 배율(1=미확장) — 클수록 화면상 같은 진행에 더 많은 실제 깊이가 필요해
 * 더 깊어 보인다. 1.6에서 "외야심도를 더 깊게" 요청으로 2.4로 재확대.
 */
const OUTFIELD_DEPTH_SCALE = 2.4;
/**
 * 안타/수비 결과 라벨 판정 기준 — 타구가 실제로 도달한 최고 깊이(z)가 이 값 미만이면
 * "내야"(내야안타·내야땅볼 아웃), 이상이면 "외야"로 표기한다(사용자 요청: 실제 궤적 기반 표기).
 * 내야안타 발사 깊이(≈1600~2700)와 수비수가 선 깊이(≈3700~7000) 사이 값.
 */
const INFIELD_DEPTH_MAX = 3000;

/**
 * 타구(컨택 이후) 전용 "화면 투영용" 깊이 — 내야 구간은 실제 z 그대로, 외야 구간(z>시작점)만
 * 배율만큼 늘여 완만하게 진행시킨다. 물리 시뮬레이션 자체(sim.z, 속도·타이밍)는 건드리지 않고
 * **렌더링(원근 p·지면선·필드영역 경계 판정)에만** 적용한다 — 투구(ballPosAt)는 별도 계산이라 무관.
 */
function outfieldProjectedZ(z: number): number {
  if (z <= OUTFIELD_DEPTH_START_Z) return z;
  return OUTFIELD_DEPTH_START_Z + (z - OUTFIELD_DEPTH_START_Z) / OUTFIELD_DEPTH_SCALE;
}
/**
 * 지면선 — Homerun_BG_05 픽셀 실측(2026-06-11, x=600/760/1320 컬럼 재측정):
 * 외야 펜스 밑단(=사용자 지정 붉은 선, 외야 경계) ≈0.50H / 외야 잔디 0.51~0.62H /
 * 내야 흙 아크 0.62H~ / 홈플레이트 흙 0.66~0.83H(플레이트 ≈0.77H).
 * ⚠️ 이전 0.39H 는 관중석 녹지를 잔디로 오판한 값 — 공이 외야벽 너머까지 굴러가던 원인.
 */
const GROUND_PLATE_Y = 0.76;
/**
 * 투영 소실선 — 펜스 "뒤" 지평. 펜스 밑단 0.50H 는 z≈7000(원래 캘리브레이션에 쓰인 깊이값,
 * 지금은 실제 펜스 판정은 필드영역 폴리곤이 담당)에서 도달: 0.45+(0.76-0.45)·p(7000)≈0.50.
 */
const GROUND_HORIZON_Y = 0.45;
/**
 * 필드 좌표의 기준 디자인 높이 — GROUND_*·POS.* 세로 비율은 전부 에디터 SSOT(1080×2400)의
 * 2400px 기준으로 실측·보정된 값이다. 캔버스 높이가 가변(designHeightRange, 1920~2400)이라
 * 2400 보다 짧아지면 필드(배경·홈플레이트·존)는 **바닥 앵커**로 환산해야 배경 크롭과 어긋나지
 * 않는다(배경도 anchorLayoutDoc 이 bottom 으로 시프트 — 하늘 쪽 상단이 잘리고 필드는 그대로).
 */
const FIELD_DESIGN_H = 2400;
/** 디자인(2400) 기준 세로 비율 → 캔버스 y (바닥 앵커: y = 2400·ratio + (h − 2400)). */
function fieldY(h: number, ratio: number): number {
  return FIELD_DESIGN_H * ratio + (h - FIELD_DESIGN_H);
}
/** 투영 지면선 y — 소실선(HORIZON)에서 플레이트(PLATE)까지 원근 p 로 보간(바닥 앵커 반영). */
function projectedGroundY(h: number, p: number): number {
  return fieldY(h, GROUND_HORIZON_Y + (GROUND_PLATE_Y - GROUND_HORIZON_Y) * p);
}
/**
 * 공 크기 축소 지수 — 크기는 위치 수렴(p)보다 훨씬 가파르게 p^1.8 로 줄어든다.
 * 내야 구간에서부터 빠르게 작아져 외야로 갈수록 더 작아 보인다 (2루에서 p 대비 ≈50%).
 */
const BALL_SIZE_EXP = 1.8;
/** 중력 (px/s²). */
const GRAVITY = 2400;
/** 이 수직속도 미만의 착지는 바운드 대신 구름(롤)으로 전환 (px/s). */
const MIN_BOUNCE_VY = 130;
/**
 * 바운드 시 수평(좌우·깊이) 속도 감쇠 — 높을수록 바운드 체인이 멀리 이어진다.
 * ⚠️ 한때 안타에 한해 좌우(X)만 강하게 죽이는 비대칭 감쇠(BOUNCE_DAMP_HIT_X/Z)를 썼는데,
 * 바운드를 거듭할수록 타구가 원래 맞은 각도에서 벗어나 중앙 쪽으로 "꺾이는" 부작용이 있었다
 * (사용자 보고: "타격방향으로 진행하다가 각도가 꺾인다"). 좌우·깊이를 항상 같은 배율로 죽여야
 * 방향(각도)이 절대 안 변하고 속도만 줄어든다 — 전 타구 공통으로 대칭 감쇠를 쓴다.
 */
const BOUNCE_DAMP_XZ = 0.82;
/** 내야 낙구·파울의 구름 마찰 (px/s²) — 낮을수록 마지막 흐름이 길다. 타구별 rollDecel 로 재정의. */
const ROLL_DECEL_SLOW = 130;
/** 시뮬 안전 상한 (s) — 타구별 maxT 로 재정의 가능. */
const SIM_MAX_T = 6.5;
/** 내야 낙구·파울용 연장 상한 (s). */
const SIM_MAX_T_LONG = 10;
/**
 * 전광판/관중석 평면 깊이(z) — 펜스 너머 장외 구역. 공중으로 이 평면을 통과하는
 * 홈런은 높이(y3)에 따라 관중석 직격 / 전광판 직격 / 장외 통과로 갈린다.
 */
const Z_STANDS = 30000;
/** Z_STANDS 에서의 월드 높이 밴드 — 화면 실측(관중석 0.28~0.42H, 전광판 0.06~0.28H) 투영 역산. */
const STANDS_CROWD_MIN_Y3 = 1300;  // 펜스 상단 위 = 관중석 하단
const STANDS_BOARD_MIN_Y3 = 4200;  // 전광판 하단 (낮은 탄도에 맞춰 하향)
const STANDS_TOP_Y3 = 12400;       // 전광판 상단 — 이보다 높으면 그대로 장외로 넘어간다

/** 홈런 발사 스타일 — launchFor() 가 정하고, 비거리 산출(onContact)·과녁 로직이 함께 참조. */
type HomerunStyle = 'liner' | 'standard' | 'towering';
/** 안타 발사 유형 — launchFor() 의 'hit' 분기가 정하고, fielderOutLabel() 이 수비 판정 라벨에 참조. */
type HitTrajectoryKind = 'liner' | 'grounder' | 'fly';

/**
 * 홈런 3스타일의 발사 속도·출현확률 — launchFor()(실제 발사)와 sampleHomerunLandingPoint()
 * (과녁 위치 산출)가 이 표 하나를 공유한다. 예전엔 두 곳에 각각 [2200,18500] 같은 숫자를
 * 따로 적어 값이 어긋날 위험이 있었다 — 과녁이 "실제 물리"를 그대로 반영해야 하므로 단일
 * 소스로 합쳤다(사용자 요청: "타겟지점을 정확히 분석하라").
 *  · 라이너(30%, ≈7°): 낮고 빠르게. · 표준(55%, ≈17°): 기존과 비슷한 무난한 포물선.
 *  · 타워링(15%, ≈29°): 높이 솟아 체공시간이 김.
 */
interface HomerunStyleDef {
  readonly style: HomerunStyle;
  /** 누적 확률 상한(0~1) — Math.random() 값이 이보다 작으면 이 스타일. */
  readonly cum: number;
  readonly vy: number;
  readonly vz: number;
}
const HOMERUN_STYLES: readonly HomerunStyleDef[] = [
  { style: 'liner', cum: 0.3, vy: 2200, vz: 18500 },
  { style: 'standard', cum: 0.85, vy: 4200, vz: 14000 },
  { style: 'towering', cum: 1, vy: 5800, vz: 10500 },
];
function pickHomerunStyle(): HomerunStyleDef {
  const r = Math.random();
  return HOMERUN_STYLES.find((s) => r < s.cum) ?? HOMERUN_STYLES[HOMERUN_STYLES.length - 1];
}
/** launchFor()의 홈런 케이스가 실제로 쓰는 반발계수·구름감속 — 착지 시뮬레이션도 동일해야 한다. */
const HOMERUN_RESTITUTION = 0.3;
const HOMERUN_ROLL_DECEL = 2600;

/**
 * 홈런포인트 과녁(양궁 과녁처럼, 사용자 요청) — 외야 상공에 뜬 지점(동심원).
 * ⚠️ "홈런이 발생했을 때 나타나는 구조가 아니라, 유저가 그 방향으로 치겠다는 의지를 가지는
 * 목표"여야 한다 — 평소 플레이 중(줌/팬 없는 기본 카메라)에도 화면 안에서 늘 보여야 한다.
 * 홈런 타구가 비행 중 그 지점에 3D 거리로 (visualR × HOMERUN_TARGET_HIT_R_RATIO) 이내까지
 * 근접하면 적중(추가 보상) — 판정 반경이 과녁마다 다른 시각 크기(visualR)에 비례한다. 그보다
 * 넓은 NEAR 반경에만 들면 점수 없이 반응 연출만(사용자 요청, HOMERUN_TARGET_NEAR_R_RATIO 참조).
 * update() 가 매 프레임 검사(비행 전체에 걸쳐 "스쳤는지"를 봄 — 한 순간의 평면 통과만 보면
 * 홈런 3스타일(라이너/표준/타워링)마다 높이·깊이가 달라 특정 스타일만 맞는 궤적을 놓친다).
 * ⚠️ 좌우 대칭 배치하지 말 것(사용자 요청) — 두 과녁의 좌표·깊이·보상을 서로 다르게 둔다.
 * ⚠️ "게임이 재시작되면 위치가 변경돼야 한다"(사용자 요청) — 고정 좌표 대신 매 판(create())마다
 * pickHomerunTargets() 로 새로 뽑는다(PlayScene.homerunTargets, 인스턴스 필드).
 */
interface HomerunTargetDef {
  readonly x3: number;
  readonly y3: number;
  readonly z: number;
  /** 착지 고도(y3)에서 유도(visualRFromY3) — 화면 위(고도 높음)일수록 크다(사용자 요청). */
  readonly visualR: number;
}
/**
 * 과녁 산출용 홈런 조준 크기 범위 — 한때 하한을 0.5까지 올려 "정면 배치"를 막았는데, 그러면
 * 항상 좌/우 끝으로만 쏠려 "랜덤하게 중앙 및 좌우로"라는 재요청을 못 만족했다. 0.15로 낮춰
 * 약한 조준(→중앙에 가까운 착지)도 다시 후보에 넣되, 0(정면 직격)은 배제해 완전한 대칭/정중앙
 * 쏠림은 막는다. 실측(Node): 재추첨 성공률 100%, 평균 2.2회.
 */
const HOMERUN_TARGET_AIM_MIN = 0.15;
const HOMERUN_TARGET_AIM_MAX = 0.95;
/** 화면 가장자리에서 이만큼(px)은 항상 남겨 과녁이 절대 화면 밖으로 나가지 않게 한다. */
const HOMERUN_TARGET_SCREEN_MARGIN = 45;
/**
 * 전광판(동영상, main.json layer_5 fillClip 폴리곤) 화면 사각형(디자인 1080×2400 좌표) — 과녁이
 * 이 영역과 겹치지 않도록 배치를 재추첨하는 데 쓴다(사용자 요청: "이 동심원은 전광판에 겹치지
 * 않도록 하라"). 폴리곤 실측 좌표(x:548,y:705, points 상대 x:±220.56·y:±155.67)의 바운딩
 * 박스에 여유(SCOREBOARD_BOUNDS_PAD)를 더했다 — 폴리곤이 완전한 사각형은 아니라 축 정렬 사각형
 * 겹침 검사가 실제 경계보다 살짝 넉넉해도(더 자주 재추첨해도) 안전한 쪽이 낫다.
 */
const SCOREBOARD_BOUNDS_PAD = 20;
const SCOREBOARD_BOUNDS = {
  xMin: 548 - 220.56 - SCOREBOARD_BOUNDS_PAD,
  xMax: 548 + 220.56 + SCOREBOARD_BOUNDS_PAD,
  yMin: 705 - 155.67 - SCOREBOARD_BOUNDS_PAD,
  yMax: 705 + 155.67 + SCOREBOARD_BOUNDS_PAD,
} as const;
/** 두 축 정렬 사각형이 겹치는지 — 과녁의 화면 원을 사각형으로 근사해 전광판과 비교한다. */
function rectsOverlap(
  aX: number,
  aY: number,
  aHalf: number,
  b: { xMin: number; xMax: number; yMin: number; yMax: number },
): boolean {
  return aX + aHalf > b.xMin && aX - aHalf < b.xMax && aY + aHalf > b.yMin && aY - aHalf < b.yMax;
}
/**
 * 착지 고도(y3, 세계 단위)→시각 반경(visualR) 변환 — "상단으로 올라갈수록 더 크게"(사용자 요청).
 * y3 가 낮을수록(펜스·잔디 지평선에 가까움) 화면에서도 아래쪽에 작게, y3 가 높을수록(전광판·
 * 하늘 쪽) 위쪽에 크게 뜬다. Y3_LOW 이하는 전부 MIN_R(바닥), Y3_HIGH 이상은 전부 MAX_R(상한)로
 * 눌러 극단값에서 과녁이 너무 작아지거나(안 보임) 너무 커지는(다른 요소를 가림) 것을 막는다.
 * ⚠️ MIN_R 을 500→900으로 올렸다(사용자 요청: "아래쪽에 배치되더라도 사이즈를 너무 작게 만들지
 * 말라") — 바닥(500)이 상한(2200)의 23%에 불과해 아래쪽 과녁이 눈에 잘 안 띌 정도로 작았다.
 * Y3_LOW 도 900으로 같이 올려 자기일관성(y3 ≥ visualR)을 유지한다.
 */
const HOMERUN_TARGET_VISUAL_R_MIN = 900;
const HOMERUN_TARGET_VISUAL_R_MAX = 2200;
const HOMERUN_TARGET_Y3_LOW = 900;
const HOMERUN_TARGET_Y3_HIGH = 9000;
function visualRFromY3(y3: number): number {
  const ratio = Phaser.Math.Clamp(
    (y3 - HOMERUN_TARGET_Y3_LOW) / (HOMERUN_TARGET_Y3_HIGH - HOMERUN_TARGET_Y3_LOW),
    0,
    1,
  );
  return HOMERUN_TARGET_VISUAL_R_MIN + (HOMERUN_TARGET_VISUAL_R_MAX - HOMERUN_TARGET_VISUAL_R_MIN) * ratio;
}
/**
 * 과녁 판정 반경(월드 단위, 3D 거리) 배율 — 두 단계로 나뉜다(사용자 요청: "동심원 근처에 공이
 * 떨어질때 반응하는 연출은 하되, 정확히 동심원을 맞췄을 때 점수가 주어져야 한다").
 *  · NEAR: 넓은 반경 — 스쳐도(HIT 는 아니어도) pulseHomerunTargetNear() 로 가볍게 반응만.
 *  · HIT: 실제로 그려진 원(visualR)에 거의 맞아떨어질 때만 — 점수 지급 + flashHomerunTarget().
 * 과녁마다 크기(visualR)가 다르므로 고정값 대신 visualR 에 비례시킨다.
 */
const HOMERUN_TARGET_NEAR_R_RATIO = 2.5;
const HOMERUN_TARGET_HIT_R_RATIO = 1.05;
/**
 * 과녁은 양궁처럼 동심원 3겹(바깥 금색·중간 흰색·중앙 빨강 부시아이, buildHomerunTargets 의
 * rings 배열과 반경 비율을 공유)이라, 어느 링에 맞았는지에 따라 점수 배율을 차등한다(사용자
 * 요청: "홈런타겟 동심원의 각 원당 점수를 1.5배 2배 3배 등으로 차등하여 적용하세요"). 예전엔
 * 과녁을 맞히면 링 구분 없이 항상 같은 고정 보너스(300~380)를 회차 점수와 무관하게 Total 에만
 * 몰래 더해서, 회차별 내역엔 안 잡히는데 총점만 튀는 불일치가 있었다(사용자 보고: "점수가
 * 제대로 표시되고 있지 않습니다") — 이제 링 배율은 scoring.ts 의 homerunScore(distance, mult)
 * 에 넘겨 회차 점수 자체에 반영하고, recordPitchScore() 한 번으로만 표시한다.
 */
// ⚠️ 0.66/0.33 → 0.78/0.42(사용자 보고: "동심원에 맞았을때 1.5배로만 표시됩니다" — 링 판정
// 로직 자체는 정확했지만, 세 링이 "반지름" 비율이라 "넓이" 기준으로는 바깥(1.5배) 링 하나가
// 전체 판정 면적의 약 60%를 차지해(반지름 제곱에 비례) 실제로 중앙 링에 좀처럼 안 걸렸다.
// 자석(HOMERUN_MAGNET_MAX_PULL)도 100% 정중앙 고정이 아니라 잔차가 남아 더더욱 바깥 링 쪽으로
// 쏠렸다. 링 반지름 비율을 키워 중간·중앙 링의 실제 판정 넓이를 확대했다.
const HOMERUN_TARGET_RING_MID_RATIO = 0.78;
const HOMERUN_TARGET_RING_INNER_RATIO = 0.42;
const HOMERUN_TARGET_RING_MULT_OUTER = 1.5;
const HOMERUN_TARGET_RING_MULT_MID = 2;
const HOMERUN_TARGET_RING_MULT_INNER = 3;
/**
 * 좌우로 치우칠수록 원근상 비스듬히 보여야 자연스럽다(사용자 요청: "좌우로 배치될수록 약간
 * 찌그러지게 타원으로... 카메라 뷰각도에 맞는 구조") — 화면 중앙에서 먼 과녁일수록 가로
 * 스케일을 줄여 타원으로 찌그러뜨린다. 0이면 안 찌그러짐(원), 값이 클수록 더 납작해진다.
 * ⚠️ 0.45→0.25(사용자 요청: "너무 비율을 찌그러트리지 말라") — 가장 바깥쪽 과녁이 가로 55%까지
 * 눌려 원래 원형에서 너무 멀어 보였다. 0.25 는 최대여도 가로 75% — 각도 힌트는 남기되 과하지 않게.
 */
const HOMERUN_TARGET_SQUISH_STRENGTH = 0.25;

/**
 * 발사 속도(vx,vy,vz)로 실제 update()와 완전히 같은 물리(중력·바운드·구름 마찰·장외 평면
 * 충돌 판정)를 그대로 적분해 "이 타구가 실제로 멈추는(관중석/전광판에 닿는) 착지지점"을 구한다.
 * ⚠️ 사용자 지적: "동심원은 실제 타구의 착지지점에 붙어 있다는 관점에서" — 예전엔 화면에 보이는
 * 얕은 깊이(z=5000~8500)의 궤적선 위 점을 썼는데, 그건 착지지점이 아니라 "그리로 가는 길목의
 * 한 점"일 뿐이라 "과녁을 통과하며 지나간다"는 인상을 줬다. 실제로 공이 멈추는 자리(장외 평면
 * Z_STANDS 충돌 지점)를 그대로 써야 "과녁에 착지한다"는 느낌이 맞다.
 * 실측(Node 시뮬레이션 2만 회): 홈런은 예외 없이(0% 실패) 9초 안에 장외에 도달하며, 대부분
 * (평균 바운드 0.07회) 지면에 닿지 않고 곧장 관중석/전광판에 꽂힌다 — 착지지점은 항상 유효하다.
 */
function simulateHomerunLanding(launchVx: number, launchVy: number, launchVz: number): { x3: number; y3: number; z: number } {
  let x3 = 0;
  let y3 = 0;
  let z = 0;
  let vx = launchVx;
  let vy = launchVy;
  let vz = launchVz;
  const dt = 1 / 240; // update()의 프레임 dt 보다 세밀하게 — 결과가 프레임레이트에 안 흔들리게.
  let t = 0;
  while (t < 9) {
    t += dt;
    const zPrev = z;
    vy -= GRAVITY * dt;
    x3 += vx * dt;
    y3 += vy * dt;
    z += vz * dt;
    if (z <= 0 && vz < 0) {
      z = 0;
      vz = 0;
    }
    const directHit =
      zPrev < Z_STANDS && z >= Z_STANDS && vz > 0 && y3 >= STANDS_CROWD_MIN_Y3 && y3 < STANDS_TOP_Y3;
    const fallingOnto = z >= Z_STANDS && vy < 0 && y3 > 0 && y3 < STANDS_TOP_Y3;
    if (directHit || fallingOnto) return { x3, y3, z };
    if (y3 <= 0 && vy < 0) {
      y3 = 0;
      if (-vy > MIN_BOUNCE_VY) {
        vy = -vy * HOMERUN_RESTITUTION;
        vx *= BOUNCE_DAMP_XZ;
        vz *= BOUNCE_DAMP_XZ;
      } else vy = 0;
    }
    if (y3 === 0 && vy === 0) {
      const speed = Math.hypot(vx, vz);
      const ratio = speed > 0 ? Math.max(0, speed - HOMERUN_ROLL_DECEL * dt) / speed : 0;
      vx *= ratio;
      vz *= ratio;
      if (Math.hypot(vx, vz) < 30) return { x3, y3, z }; // 장외 도달 전에 멈춤(실측상 사실상 없음).
    }
  }
  return { x3, y3, z }; // 9초 초과(실측상 발생 안 함) — 마지막 위치로 폴백.
}

/**
 * 홈런 발사 속도(vx,vy)를 "자연스러운 착지점이 과녁 근처면 그쪽으로 살짝 끌어당긴다"(사용자
 * 요청: "가능한 그 근처에 떨어지는 구조로 유인되는 구조를 설계하라" — 실측: 자석 없이는 적중
 * 9%·근접 35%에 불과해 "아슬아슬한" 느낌이 거의 없었다).
 *  1) 원래(자석 적용 전) 조준으로 실제 착지점을 미리 시뮬레이션한다.
 *  2) 가장 가까운 과녁까지 거리가 CAPTURE_RANGE 이내면, "그 과녁에 정확히 떨어지려면 필요한
 *     vx·vy"를 역산해(탄도의 x3-z 는 직선이라 vx ∝ x3, y3 공식을 vy 로 역산 가능) 그 값 쪽으로
 *     보간한다. 이미 가까울수록(비율) 더 강하게 끌린다.
 *  3) CAPTURE_RANGE 밖(원래도 완전히 딴 곳으로 가는 타구)은 건드리지 않는다 — 모든 홈런이
 *     과녁으로 빨려가면 부자연스럽다. vz 는 착지 시점(t) 계산의 기준이라 건드리지 않는다.
 * Node 시뮬레이션(2만 타구): CAPTURE=10000·MAX_PULL=0.85 일 때 약 95%의 홈런이 끌림 대상이
 * 되고, 적중 9%→25%, 근접(반응만) 35%→60% 로 향상 — 완전히 결정적이진 않되(평균 보정폭
 * ≈0.4) 대부분의 타구가 "그 근처"로 유인된다.
 */
const HOMERUN_MAGNET_CAPTURE_RANGE = 10000;
// 0.85→0.95(사용자 보고: "동심원에 맞았을때 1.5배로만 표시됩니다" — 근접 타구까지도 잔차가 남아
// 중간/중앙 링에 좀처럼 안 걸렸다). 가장 가까운 경우 거의 정중앙까지 당겨 중앙 링 적중이 실제로 가능하게.
const HOMERUN_MAGNET_MAX_PULL = 0.95;
function applyHomerunTargetMagnet(
  vx: number,
  vy: number,
  vz: number,
  targets: readonly HomerunTargetDef[],
): { vx: number; vy: number } {
  if (targets.length === 0) return { vx, vy };
  const natural = simulateHomerunLanding(vx, vy, vz);
  let closest: HomerunTargetDef | undefined;
  let closestDist = Infinity;
  for (const t of targets) {
    const d = Math.hypot(natural.x3 - t.x3, natural.y3 - t.y3, natural.z - t.z);
    if (d < closestDist) {
      closestDist = d;
      closest = t;
    }
  }
  if (!closest || closestDist > HOMERUN_MAGNET_CAPTURE_RANGE) return { vx, vy };
  const tLand = natural.z / vz; // 자연 착지 시점(vz 는 안 바꾸므로 그대로 유효).
  if (!(tLand > 0)) return { vx, vy };
  const pull = HOMERUN_MAGNET_MAX_PULL * (1 - closestDist / HOMERUN_MAGNET_CAPTURE_RANGE);
  const vxIdeal = closest.x3 / tLand; // x3(t)=vx·t 가 직선이라 정확히 역산된다.
  const vyIdeal = (closest.y3 + 0.5 * GRAVITY * tLand * tLand) / tLand; // y3(t)=vy·t-½gt² 역산.
  return {
    vx: Phaser.Math.Linear(vx, vxIdeal, pull),
    vy: Phaser.Math.Linear(vy, vyIdeal, pull),
  };
}

/**
 * 과녁 하나(왼쪽/오른쪽)를 "실제 홈런 발사 물리(HOMERUN_STYLES, launchFor()와 완전히 동일한
 * 분포)로 뽑은 진짜 타구가 실제로 착지하는 자리"에서 뽑는다 — simulateHomerunLanding() 이 그
 * 착지지점을 정확히 구해준다. 착지지점은 항상 장외 평면(z≈Z_STANDS) 근처라 화면 중앙에서
 * 멀리 벗어날수록 화면 밖으로 나갈 수 있으므로, 배경 이미지 안에 들어오는 조합이 나올 때까지
 * (최대 60회) 재추첨한다 — 좌표를 임의로 옮기는 게 아니라 "그 자리에 착지하는 타구"를 다시
 * 뽑는 것이라 여전히 물리적으로 진짜인 자리다.
 * ⚠️ "좌우로 넓게"는 화면(캔버스) 안이 아니라 배경 이미지 전체 폭 기준이다(사용자 재지적:
 * "초기 화면 배치상의 세로사이즈화면 상만을 의미하는 것이 아닌 좌우 화면 바깥쪽까지"). 배경은
 * 카메라 팬 여지를 두려고 캔버스보다 훨씬 넓게 깔려 있다(실측: 캔버스 1080px인데 배경
 * 2415px). 캔버스 폭으로 제한하면 항상 화면 안쪽에만 배치돼 "좌우로 넓게"가 안 된다 — 배경
 * 실제 표시 폭(bgDisplayWidth)을 기준으로 삼아야, 평소엔 화면 밖이라도 진입 연출의 좌우 카메라
 * 패닝(playStadiumReveal)에서 실제로 보이는 위치까지 배치될 수 있다.
 * ⚠️ "외야를 침범하지 않도록"(사용자 요청) — 착지 고도(y3)가 낮으면 화면상 펜스 지평선
 * (GROUND_HORIZON_Y) 근처나 그 아래로 내려가 잔디 위에 걸쳐 보인다. visualR 을 이제 y3 에서
 * 직접 유도하므로(visualRFromY3, "상단으로 올라갈수록 더 크게") 두 값이 항상 같은 방향으로
 * 움직여 y3(고도) ≥ visualR(시각 반경)이 사실상 저절로 성립한다 — 그래도 극단값 안전망으로
 * 명시적으로 검사한다.
 */
function sampleHomerunLandingPoint(
  side: 'left' | 'right',
  bgDisplayWidth: number,
  w: number,
  h: number,
): { x3: number; y3: number; z: number; visualR: number } {
  const maxOffsetPx = bgDisplayWidth / 2 - HOMERUN_TARGET_SCREEN_MARGIN;
  for (let attempt = 0; attempt < 60; attempt++) {
    const styleDef = pickHomerunStyle();
    // launchFor()의 홈런 케이스와 동일한 산출식(power→dist→jitter→boost, hrAim→vx/vy/vz).
    const power = ACTIVE_HOMERUN_ACCURACY + Math.random() * (1 - ACTIVE_HOMERUN_ACCURACY);
    const dist = 0.85 + 0.3 * power;
    const boost = dist * (0.9 + Math.random() * 0.2);
    const magnitude = HOMERUN_TARGET_AIM_MIN + Math.random() * (HOMERUN_TARGET_AIM_MAX - HOMERUN_TARGET_AIM_MIN);
    const hrAim = (side === 'left' ? -1 : 1) * magnitude;
    const vx = hrAim * 4600;
    const vy = styleDef.vy * boost;
    const vz = styleDef.vz * boost * (1 - 0.3 * Math.abs(hrAim));
    const land = simulateHomerunLanding(vx, vy, vz);
    const visualR = visualRFromY3(land.y3);
    if (land.y3 < visualR) continue; // 외야(잔디) 침범 방지 — 원 바닥이 지평선 아래로 안 내려가게.
    const p = PROJ_FOCAL / (PROJ_FOCAL + outfieldProjectedZ(land.z));
    if (Math.abs(land.x3) * p > maxOffsetPx) continue;
    // 전광판(동영상)과 겹치지 않도록 재추첨(사용자 요청: "이 동심원은 전광판에 겹치지 않도록
    // 하라") — 과녁의 화면 좌표·반경을 사각형으로 근사해 SCOREBOARD_BOUNDS 와 비교한다.
    // 전광판도 필드(월드)와 함께 바닥 앵커로 시프트되므로 경계 y 에 같은 오프셋을 더한다.
    const fieldDy = h - FIELD_DESIGN_H;
    const groundY = projectedGroundY(h, p);
    const screenX = w / 2 + land.x3 * p;
    const screenY = groundY - land.y3 * p;
    const sbBounds = { ...SCOREBOARD_BOUNDS, yMin: SCOREBOARD_BOUNDS.yMin + fieldDy, yMax: SCOREBOARD_BOUNDS.yMax + fieldDy };
    if (rectsOverlap(screenX, screenY, visualR * p, sbBounds)) continue;
    return { ...land, visualR };
  }
  // 재추첨 60회 모두 실패면(실측상 거의 없음, 성공률 100%) 안전한 값으로 폴백.
  const z = Z_STANDS;
  const p = PROJ_FOCAL / (PROJ_FOCAL + outfieldProjectedZ(z));
  const sign = side === 'left' ? -1 : 1;
  const y3 = 3000;
  return { x3: (sign * maxOffsetPx * 0.7) / p, y3, z, visualR: visualRFromY3(y3) };
}
/**
 * 매 게임 시작마다 새로 뽑는 과녁 2개 — 왼쪽 하나·오른쪽 하나. 각각 실제 착지지점 시뮬레이션
 * 결과에서 뽑으므로 매번 위치는 바뀌어도 항상 "그 자리에 실제로 떨어지는 홈런이 존재"한다.
 * visualR 은 착지 고도(y3)에서 자동으로 유도된다(위 함수 참조) — 더 이상 독립적으로 뽑지 않는다.
 */
/**
 * 좌/우가 화면 중심 기준 "|x3| 값이 거의 같은" 채로 뽑히면 부호만 반대인 완전 대칭으로 보인다
 * (사용자 요청: "너무 화면중심으로 대칭 배치하지 말라"). 두 |x3| 차이가 이 비율 미만이면
 * 오른쪽만 다시 뽑는다 — 왼쪽을 기준으로 고정해야 매번 다시 뽑을 때마다 비교 기준이 안 흔들린다.
 */
const HOMERUN_TARGET_ASYMMETRY_MIN = 0.3;
function pickHomerunTargets(bgDisplayWidth: number, w: number, h: number): readonly HomerunTargetDef[] {
  const left = sampleHomerunLandingPoint('left', bgDisplayWidth, w, h);
  let right = sampleHomerunLandingPoint('right', bgDisplayWidth, w, h);
  for (let attempt = 0; attempt < 8; attempt++) {
    const a = Math.abs(left.x3);
    const b = Math.abs(right.x3);
    const asymmetry = Math.abs(a - b) / Math.max(a, b, 1);
    if (asymmetry >= HOMERUN_TARGET_ASYMMETRY_MIN) break;
    right = sampleHomerunLandingPoint('right', bgDisplayWidth, w, h);
  }
  return [left, right];
}
/**
 * 과녁 전체 불투명도(0=완전 투명 ~ 1=완전 불투명) — 용어 통일(사용자 요청): 이 프로젝트에서
 * 반투명 수치는 항상 "불투명도"로 부르고 0~1 기준으로 얘기한다("투명도를 올린다" 같은 반대
 * 방향 표현은 쓰지 않는다). 0.34→0.55→0.75(+0.2)로 계속 높여 왔다가,
 * 0.75→0.60 으로 처음 낮췄다(사용자 요청: "동심원의 투명도를 지금보다 15%정도 투명하게").
 */
const HOMERUN_TARGET_OPACITY = 0.6;

/** 마운드(투수 릴리스) 깊이(z) — 실측 마운드 지면선 0.515H 를 투영식으로 역산. */
const Z_MOUND = 4900;
/** 투구 중력 처짐 (h 비율) — 릴리스→존 포물선 폭. 클수록 궤적이 넓게 휜다. */
const PITCH_SAG_H = 0.038;
/** 공의 z=0(플레이트) 기준 표시 스케일 — 투구·타구 공통. 96px 에셋 기준 ≈76px 표시(1080 디자인, 720 기준 0.53 스케일). */
const BALL_PLATE_SCALE = 0.795;
/** 릴리스 순간 공 추가 축소 배율 — 출발은 작게, 존 도달 시 1.0(타격지점 크기 불변). */
const BALL_RELEASE_SHRINK = 0.78;
/**
 * 필드영역(에디터 zone 폴리곤) 밖으로 나간 안타의 좌우/깊이 속도 프레임당 감쇠율(1=무감쇠).
 * 낮을수록 빨리 멎는다. 반발(역주행) 없이 매 프레임 곱해 "타격 방향으로 나아가려는 관성을
 * 유지한 채 서서히 멈추는" 그림을 만든다 — 예전 평평한 Z_FENCE 벽 반발(WALL_REBOUND)은
 * 좌우 테이퍼를 무시해 엉뚱한 지점에서 튕기거나 홈 쪽으로 역주행하는 원인이었다(사용자 보고).
 */
const FIELD_BOUNDARY_DAMP = 0.82;

/** 발사 초기속도 (px/s) — 타구 유형별. restitution 0 = 첫 착지에서 정지(담장 너머). */
interface LaunchParams {
  vx: number;
  vy: number;
  vz: number;
  restitution: number;
  /** 구름 마찰 (px/s²) — 내야 낙구·파울은 ROLL_DECEL_SLOW 로 길게 흐른다. */
  rollDecel: number;
  /** 시뮬 상한 (s). */
  maxT: number;
  /** 바운드 시 좌우(x)/깊이(z) 속도 감쇠 — 항상 대칭(BOUNCE_DAMP_XZ)이라 방향(각도)이 변하지 않는다. */
  bounceDampX: number;
  bounceDampZ: number;
}

/** 비행 중 공의 물리 상태. */
interface BallSim {
  t: number;
  x3: number;
  y3: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  restitution: number;
  rollDecel: number;
  maxT: number;
  bounceDampX: number;
  bounceDampZ: number;
  /** 접점에서의 공 화면 스케일 (z=0 기준 크기). */
  baseScale: number;
  /** 한 번이라도 지면에 닿았는지(바운드/구름 시작) — 수비수가 "땅볼"을 잡았는지 실측 판정용. */
  grounded: boolean;
}

/** 결과 라벨(스트라이크/홈런/안타/파울/비거리) 폰트 색 — 흰색 통일. */
const RESULT_TEXT_COLOR = '#FFFFFF';

type PlayState = 'ready' | 'pitch' | 'resolve' | 'over';

export class PlayScene extends Phaser.Scene {
  private worldLayer!: Phaser.GameObjects.Container;
  private hudLayer!: Phaser.GameObjects.Container;
  /** 공 — 홈런 슬로우모션에서 회전 애니메이션을 재생하므로 Image 가 아니라 Sprite. */
  private ball!: Phaser.GameObjects.Sprite;
  /**
   * 공 텍스처 크기 보정 — 회전 프레임(132px)이 기본 공(96px)보다 커서, 회전 중에는 setScale 에
   * 이 값을 곱해 겉보기 크기를 맞춘다. 정지 공일 때는 1.
   */
  private ballScaleComp = 1;
  /** 홈버튼으로 로비 전환 중 — 연타로 scene.start 가 중복 실행되는 것을 막는다. */
  private leavingToLobby = false;
  /** 기권 확인창을 이루는 오브젝트들(떠 있지 않으면 undefined). */
  private forfeitConfirm?: Phaser.GameObjects.GameObject[];
  /** 하단 UI(시즌패스·미션바·콤보 아이콘)와 각자의 저작 y — 배너 위치에 맞춰 통째로 옮긴다. */
  private bottomUiItems: Array<{ obj: Phaser.GameObjects.Image; baseY: number }> = [];
  /** 하단 UI 행의 저작 밑변(게임 좌표) — 이 선을 배너 윗변에 맞춘다. */
  private bottomUiBaseBottomY = 0;
  /** 마지막으로 적용한 하단 UI 오프셋(NaN=아직 없음) — 값이 그대로면 다시 옮기지 않는다.
   *  ⚠️ 오프셋은 음수(아래로 내림)도 되므로 -1 같은 실제 값을 센티넬로 쓰면 안 된다. */
  private bottomUiOffsetApplied = Number.NaN;
  /** 헤더 점수 게이지(좌=플레이어, 우=라이벌) — 헤더 이미지의 빈 막대 위에 얹는 채움. */
  private gauges?: { player: Phaser.GameObjects.Graphics; rival: Phaser.GameObjects.Graphics };
  /** 게이지 채움 비율(0~1) — 트윈 대상이라 객체로 들고 있는다. */
  private gaugeRatio = { player: 0, rival: 0 };
  /** 세이프에어리어로 헤더가 내려간 양 — 게이지도 같은 만큼 내려 그린다. */
  private gaugeOffsetY = 0;
  private mitt!: Phaser.GameObjects.Image;
  /** 타자·투수 3동작 리그(에디터 등록 준비/액션/후) — 게임 상태에 맞춰 구동. 미배포 시 undefined. */
  private batterRig?: CharacterRig;
  /** 이번 게임 타자(로비 선택)의 스윙 재생 구간 — create() 에서 확정. */
  private swingLeads = swingLeadsFor(activeBatterSwing());
  private pitcherRig?: CharacterRig;
  /** 투수 노드(에디터 레이아웃) — 투구 시 공 릴리스 지점 산정에 사용. */
  private pitcherNode?: LayoutNode;
  private zoneFill!: Phaser.GameObjects.Arc;
  private timingRing!: Phaser.GameObjects.Arc;
  private redDot!: Phaser.GameObjects.Arc;
  /** 실제 터치 지점 마커 — 탭 순간 잠깐 나타나 판정과 별개로 "어디를 눌렀는지" 보여준다. */
  private tapMarker!: Phaser.GameObjects.Arc;
  /** 인디케이터(반투명 큰 원) 중심 — 붉은 원은 이 안의 랜덤 위치에 출현. */
  private indicatorX = 0;
  private indicatorY = 0;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  private scoreboard!: Scoreboard;
  /** 라이벌(가상 상대) 스코어보드 — 우측 정렬, 매 회차 투구 전 revealRivalRound() 가 채운다. */
  private rivalScoreboard!: Scoreboard;
  /** 헤더 캐릭터명 옆 트로피 총점 노드(main.json layer_2_copy2/copy3) — buildHud() 가 layout 에서
   * 찾아 저장, updateHud()/revealRivalRound() 가 setText 로 직접 갱신한다. 레이아웃 미배포 단계
   * 등 노드가 없을 수 있어 optional. */
  private playerTotalText?: Phaser.GameObjects.Text;
  private rivalTotalText?: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;

  private state: PlayState = 'ready';
  /** 진입 연출(줌인→줌아웃→경기장 공개 패닝)이 끝났는지 — 그 전엔 좌우 드래그를 막는다(연출 중 카메라 충돌 방지). */
  private introComplete = false;
  /** 좌우 드래그(고무줄) 진행 중인지 — onCameraDragStart~End 참조. */
  private cameraDragActive = false;
  private cameraDragStartPointerX = 0;
  private cameraDragStartScrollX = 0;
  /** 이번 투구가 예정된 시각(this.time.now 기준) — startPitch() 가 기록, 드래그 락아웃 판단에 쓰인다. */
  private scheduledThrowAt = 0;
  private sim?: BallSim;
  private pitchTween?: Phaser.Tweens.Tween;
  private pitchStartAt = 0;
  /** 이번 투구의 구종 — startPitch() 가 뽑고, throwPitch()/onTap()/onContact() 가 참조. */
  private currentPitchType: PitchTypeDef = PITCH_TYPES[0];
  /** 이번 투구의 실제 구속(ms) — PITCH_MS(기준) × currentPitchType.speedMult. */
  private currentPitchMs = PITCH_MS;
  /** 구종+구속 표시 라벨(포수 미트 쪽) — buildWorld() 가 생성, throwPitch() 가 매 투구 갱신. */
  private pitchInfoText!: Phaser.GameObjects.Text;
  /** 구종+구속 라벨을 감추는 예약 타이머 — 다음 투구가 먼저 오면 취소하고 새로 잡는다. */
  private pitchInfoHideEvent?: Phaser.Time.TimerEvent;
  private pitchIndex = 0;
  private score = 0;
  private homeruns = 0;
  /** 라이벌 누적 총점 — revealRivalRound() 가 매 회차 갱신. */
  private rivalScore = 0;
  /** 라이벌 누적 홈런 수 — revealRivalRound() 가 회차의 outcome 이 'homerun' 일 때마다 갱신(결과화면 표시용). */
  private rivalHomeruns = 0;
  /**
   * 라이벌의 "이전 경기" 회차별 기록(라벨+점수+결과종류, PITCHES_PER_GAME 개) — create() 가 판 시작 시
   * 한 번 시뮬레이션해 채운다(사용자 요청: "라이벌의 라운드 데이터 표시를 내 경기데이터의 전
   * 라운드 데이터로 하지 말고 전 경기 데이터를 쓸것. 임시 시뮬레이션" — 지금 플레이 중인 내
   * 회차 실적을 그때그때 참조하지 않고, 미리 만들어 둔 "지난 경기 기록"을 그대로 재생한다).
   * revealRivalRound() 가 회차마다 이 배열에서 순서대로 꺼내 보여준다.
   */
  private rivalHistoricalRounds: ReadonlyArray<{ label: string; score: number; outcome: RivalRoundOutcome }> = [];
  /** 이번 판 내 회차 결과 — 9회를 다 채우면 다음 사람의 상대 후보로 저장한다(logic/rival.ts). */
  private myRounds: PlayedRound[] = [];
  private zoneX = 0;
  private zoneY = 0;
  /** 배트 스위트스팟 월드 좌표 — 임팩트 프레임에서 배트가 실제로 지나는 지점. */
  private batContactX = 0;
  private batContactY = 0;
  /** 홈플레이트 꼭지점 화면 좌표 — 투구 종착(포구) 지점. */
  private plateApexX = 0;
  private plateApexY = 0;
  /** 현재 투구의 경로 함수 — 진행도 t 의 공 화면 좌표/스케일 (컨택 정밀 정렬용). */
  private pitchBallAt?: (t: number) => { x: number; y: number; scale: number };
  /** 현재 비행이 홈런 타구인지 — 비행 종료 시 비거리 표시 여부. */
  private flightHomerun = false;
  /**
   * 이번 홈런의 발사 스타일(라이너/표준/타워링) — launchFor() 가 정하고, onContact() 의 비거리
   * 산출이 참조한다. 스타일별로 비거리 하한이 달라 "궤적은 높이 떴는데 비거리는 짧게 나온다"는
   * 모순을 막는다(사용자 보고 — 이전엔 비거리가 스타일과 무관하게 독립적으로 뽑혔다).
   */
  private lastHomerunStyle: HomerunStyle = 'standard';
  /**
   * 이번 안타의 발사 유형(라이너/땅볼성 내야안타/뜬공) — launchFor() 의 'hit' 분기가 정하고,
   * fielderOutLabel() 이 참조한다(사용자 보고: "라이너아웃이 대부분입니다. 땅볼일 경우가
   * 많은데 판단을 제대로 하여 아웃을 평가하세요" — 예전엔 캐치 "순간의 실측 고도"만으로
   * 라이너/뜬공을 갈랐는데, 수비수가 첫 바운드 전에 잡으면 원래 땅볼성 타구(내야안타 유형)도
   * grounded=false 로 남아 전부 "라이너 아웃"으로 뭉뚱그려졌다 — 설계상 유형을 직접 기억해 뒀다가 쓴다).
   */
  private lastHitTrajectoryKind: HitTrajectoryKind = 'liner';
  /** 이번 타구가 홈런포인트 과녁에 이미 적중했는지(중복 지급 방지) — onContact() 가 매 타구 초기화. */
  private homerunTargetHit = false;
  /**
   * 이번 타구가 맞힌 과녁 링의 점수 배율(1=과녁 미적중, 1.5/2/3=바깥/중간/부시아이) —
   * update() 의 링 판정이 채우고, showDistance() 가 비거리 표시 직후 homerunScore() 에 넘긴다.
   */
  private homerunTargetMultiplier = 1;
  /**
   * 과녁별로 "근처 반응"(pulseHomerunTargetNear)을 이번 비행에서 이미 보여줬는지 — 근처 반경 안에
   * 머무는 여러 프레임 동안 매번 다시 펄스가 터지지 않도록 1회로 제한한다. onContact() 가 매
   * 타구 새로 초기화(homerunTargets 개수만큼).
   */
  private homerunTargetNearShown: boolean[] = [];
  /** 이번 판의 홈런포인트 과녁 좌표 — create() 가 pickHomerunTargets() 로 매번 새로 뽑는다(재시작마다 위치 변경). */
  private homerunTargets: readonly HomerunTargetDef[] = [];
  /** 홈런포인트 과녁 시각 오브젝트(동심원 컨테이너) — this.homerunTargets 와 같은 순서. buildHomerunTargets() 가 채운다. */
  private homerunTargetViews: Phaser.GameObjects.Container[] = [];
  /**
   * 과녁별 좌우 찌그러짐 배율(squishX, buildHomerunTargets() 가 렌더 시 계산해 저장) —
   * update() 의 링 적중 판정이 3D 거리 계산에 그대로 반영해야 "화면에 그려진 링"과 "실제 점수
   * 배정"이 일치한다(사용자 요청: "타점에 대한 점수배정이 정확하게 매칭되도록 하라"). ⚠️ 링은
   * 컨테이너의 scaleX 만 squishX 만큼 줄여 타원으로 그리는데(카메라 각도 연출), 공 자체의 화면
   * 투영은 이 찌그러짐을 받지 않는다 — 순수 3D 거리로만 판정하면 좌우로 치우친 과녁일수록
   * "화면상 링 안"과 "판정상 적중"이 어긋난다. this.homerunTargets 와 같은 순서.
   */
  private homerunTargetSquishX: number[] = [];
  /** 이번 타구의 비거리(m) — 발사 파라미터 기반, 컨택 시 산출. */
  private flightMeters = 0;
  /** 홈런 컨택 직후 행타임 배율 — update() 의 물리 dt 에 곱해진다(1=정상). onContact() 가 설정. */
  private slowMoScale = 1;
  /** 행타임(HR_HANG_SCALE 유지) 종료 시각 — this.time.now 기준. */
  private hangUntil = 0;
  /** 정상 속도(1)로 완전히 되돌아가는 시각 — this.time.now 기준. */
  private hangRampEndAt = 0;
  /** 수비수 위치(화면/월드 좌표) — buildWorld() 가 채운다. update() 의 캐치 판정에 쓰인다. */
  private fielderSpots: Array<{ x: number; y: number }> = [];
  /** 수비수 이미지 오브젝트 — buildWorld() 가 채운다. update() 가 공과의 앞뒤 렌더 순서를 매 프레임 보정한다. */
  private fielderImages: Phaser.GameObjects.Image[] = [];
  /** 필드영역 폴리곤(에디터 zone 노드, 화면/월드 좌표 절대값) — buildWorld() 가 채운다. */
  private fieldAreaPoints: Array<{ x: number; y: number }> = [];
  /** 비행 중인 타구가 안타(hit) 판정이라 필드영역 밖으로 못 나가게 제한할 대상인지(아직 판정 전). */
  private flightFieldBound = false;
  /** 비행 중인 타구가 안타(hit) 판정이라 수비수 캐치 검사 대상인지(아직 판정 전). */
  private flightCatchable = false;
  /** 수비수 캐치가 확정됐는지 — 표시는 비행이 자연스럽게 끝날 때까지 미룬다(finishFlightReveal 참조). */
  private flightCaught = false;
  /**
   * 이번 안타의 타격 정확도(power) — 안타는 낙구 구역(내야/외야)이 확정돼야 최종 점수를 매길 수
   * 있어(logic/scoring.ts hitScore), onContact() 가 정확도만 미리 저장해 두고 revealHitResult()가
   * 구역 확정 시점에 최종 점수를 계산한다. 수비수에게 잡히면(revealFielderCatch) 점수는 0.
   */
  private flightHitPower = 0;
  /** 이번 타구가 실제로 도달한 최고 깊이(z) — 수비 판정(공-수비수 z-order)에 쓰인다. */
  private flightMaxZ = 0;
  /**
   * 공이 "처음 땅에 떨어진" 깊이(z) — 내야안타/외야안타 판정은 이 값을 쓴다(flightMaxZ 아님).
   * flightMaxZ 는 착지 후 굴러가는 거리까지 계속 누적되므로(rollDecel 이 낮으면 꽤 길게 구름),
   * 짧게 떨어진 내야안타가 굴러가다 3000 을 넘겨 "외야안타"로 오판되는 문제가 있었다(사용자 보고:
   * "내야안타와 외야안타가 제대로 구별되지 않는다"). 첫 낙구 지점이 실제 타구 성격을 더 정확히
   * 반영한다(실제 야구에서도 내야/외야 안타는 굴러간 거리가 아니라 떨어진 지점으로 가른다).
   */
  private flightFirstBounceZ?: number;
  /** 캐치한 수비수의 x 좌표(포지션 추정용) — update() 의 캐치 판정이 채운다. */
  private flightCatchFielderX?: number;
  /** 캐치 순간 공이 이미 지면에 닿아 있었는지(땅볼 실측 판정용) — update() 의 캐치 판정이 채운다. */
  private flightCatchGrounded = false;
  /** 타구 궤적 트레이서 — 비행 경로를 빛나는 라인으로 그린다 (TV 중계 트레이서 풍). */
  private tracer!: Phaser.GameObjects.Graphics;
  private tracerPts: Array<{ x: number; y: number; s: number }> = [];

  constructor() {
    super('play');
  }

  create(): void {
    // 디바이스(PC/모바일)에 맞춰 난이도 재설정 — 다른 초기화보다 먼저(투구 시작 전 반드시 반영).
    applyDeviceDifficulty(this);
    // await 하지 않는다: 카메라 인트로·카운트다운이 도는 동안 배경에서 받으면 첫 투구 전에 끝난다.
    // 늦어지더라도 layoutLoader 의 런타임 lazy 로드가 같은 파일을 이어받는다.
    void preloadPlayClips(this);
    // ⚠️ Phaser 는 씬 인스턴스를 재사용한다(클래스 필드 초기화는 최초 1회뿐) — 이전 판에서 홈버튼을
    //    눌러 나갔다면 이 플래그가 true 로 남아 다음 판의 홈버튼이 먹지 않는다. 매 판 되돌린다.
    this.leavingToLobby = false;
    this.forfeitConfirm = undefined; // 이전 판의 확인창 오브젝트는 씬 종료와 함께 이미 파괴됐다.
    this.bottomUiItems = [];
    this.bottomUiBaseBottomY = 0;
    this.bottomUiOffsetApplied = Number.NaN;
    // 로비에서 고른 타자의 스윙 구간을 이 게임 내내 쓴다(캐릭터마다 프레임 수·컨택 프레임이 다름).
    this.swingLeads = swingLeadsFor(activeBatterSwing());
    // 디자인(designWidth×designHeight=1080×2400)이 캔버스와 1:1 → 순수 FIT 재현.
    // fillViewportHeight(폭을 720 으로 강제)는 쓰지 않는다 — 1080 폭 SSOT 가 720 으로 눌려
    // HUD(절대좌표)가 어긋나기 때문. scale.width/height 는 그대로 1080/2400 을 유지한다.
    const w = this.scale.width;
    const h = this.scale.height;
    this.state = 'ready';
    this.pitchIndex = 0;
    this.score = 0;
    this.homeruns = 0;
    this.rivalScore = 0;
    this.rivalHomeruns = 0;
    // 이번 판 상대 — 첫 판은 정해진 성적(홈런3·안타2)의 튜토리얼 상대, 두 번째 판부터는 이미
    // 치러진 경기 기록 중 하나를 꺼내 그 사람이 다시 치는 것처럼 매칭한다(logic/rival.ts).
    this.rivalHistoricalRounds = pickRival().rounds.map((r) => ({
      label: RIVAL_RESULT_LABEL[r.outcome],
      score: r.score,
      outcome: r.outcome,
    }));
    this.myRounds = [];
    this.zoneX = w * POS.zoneXRatio;
    this.zoneY = fieldY(h, POS.zoneY);

    this.worldLayer = this.add.container(0, 0);
    this.hudLayer = this.add.container(0, 0);

    // 에디터 레이아웃(main.json)이 화면 구성의 단일 진실 공급원(SSOT):
    // 배경·타자·투수·수비수·전광판 이펙트·HUD 가 모두 여기서 온다(공·궤적·타이밍링만 코드).
    // 캔버스 높이가 디자인(2400)과 다르면(가변 높이) 세로 앵커 변환을 먼저 적용한다 —
    // 월드(필드) 노드는 전부 바닥 고정, 스크린 HUD 는 pin 휴리스틱(상단 헤더=top·하단 바=bottom).
    const rawDoc = (this.cache.json.get(UI_LAYOUT_KEY) ?? null) as LayoutDoc | null;
    // 타자 노드가 에디터에 없으면 코드 기본 배치로 세운다(에디터에서 지워도 타자가 뜨도록).
    // ⚠️ 앵커 변환 **전에** 끼워야 pin/pinX 가 실제 노드와 완전히 똑같이 적용된다.
    const baseDoc = rawDoc ? withDefaultBatterNode(rawDoc) : null;
    // 가로도 가변(designWidthRange) — 필드 수학이 전부 w/2 상대 좌표라(zoneX·batContactX·타구 궤적)
    // 세이프존 중앙정렬(pinX 기본 center)만으로 정합이 유지된다. 배경(2415px)이 좌우 블리드를 이미
    // 갖고 있어 폭이 늘어도 빈 띠가 없다.
    const doc = baseDoc ? anchorLayoutDoc(baseDoc, h, worldPinOverrides(baseDoc), { canvasW: w }) : null;
    const bg = this.buildWorld(w, h, doc);
    this.buildHud(w, h, doc);
    // 홈런포인트 과녁(양궁 과녁처럼, 옅은 반투명 동심원 2개) — buildHud() 이후에 지어야 한다.
    // ⚠️ buildHud() 가 에디터 "전광판" 같은 월드 노드를 늦게 추가하면서 zoneFill 바로 아래로
    // 강제 재배치(moveBelow)하는데, 그보다 먼저 만들어 뒀던 과녁이 그 밑에 깔려 안 보인 적이
    // 있었다(사용자 보고: "동심원이 표현이 안된다"). buildHomerunTargets() 내부에서 bg 바로
    // 위로 moveAbove 해 넣으므로, 여기서의 호출 순서(buildHud 이후)는 더 이상 중요하지 않다 —
    // 최종 배치는 bg 인자로 직접 정한다(사용자 요청: "동심원 레이어가 배경 바로 위에").
    this.buildHomerunTargets(w, h, bg);

    // 카메라 분리 — 메인(월드, 줌 대상) / HUD(고정).
    // 메인 카메라 bounds 는 캔버스가 아닌 "배경 이미지 실제 폭" — cover 배경이 좌우로
    // 훨씬 넓어서, 그 안에서는 멀리 패닝해도 배경 밖이 노출되지 않는다.
    const bgBounds = getDisplayBounds(bg);
    this.cameras.main.setBounds(Math.floor(bgBounds.left), 0, Math.ceil(bgBounds.w), h);
    // 휴식 시 카메라는 identity — 디자인 좌표(에디터)와 1:1. 타구 시에만 줌/팬, 끝나면 복귀.
    // 진입 연출만 예외 — 타자 클로즈업(INTRO_ZOOM)에서 시작해 줌아웃하며 identity 로 정착한다.
    this.cameras.main.setZoom(INTRO_ZOOM);
    this.cameras.main.centerOn(this.batContactX, this.batContactY - FIELD_DESIGN_H * INTRO_FOCUS_Y_OFFSET);
    this.cameras.main.ignore(this.hudLayer);
    const hudCam = this.cameras.add(0, 0, w, h);
    hudCam.ignore(this.worldLayer);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onTap(pointer));
    // 좌우 드래그(고무줄) — 스윙 탭과 같은 pointerdown 을 공유해도 무해하다(onTap 은 state==='ready'
    // 일 때 "아직이야" 마커만 띄우고 그냥 리턴하므로 서로 안 부딪힌다). 위 CAMERA_DRAG_* 주석 참조.
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onCameraDragStart(pointer));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.onCameraDragMove(pointer));
    this.input.on('pointerup', () => this.onCameraDragEnd());
    this.input.on('pointerupoutside', () => this.onCameraDragEnd());
    // BGM — 로비의 START 탭에서 이미 사용자 제스처가 발생했으므로 여기서 바로 시작한다.
    // pointerdown 리스너는 그 제스처를 브라우저가 인정하지 않는 예외적인 경우를 위한 안전망
    // (ambienceStarted 가드가 있어 중복 시작되지 않는다).
    startBgm();
    // 진입 시 관중 환호가 먼저 크게 울리고 서서히 평상시 볼륨으로 가라앉는다(사용자 요청:
    // "게임에 진입하면서 우선 관중의 환호성이 크게 울리면서 게임이 시작되어야").
    sfx('cheer');
    swellCrowd();
    this.input.once('pointerdown', () => startBgm());
    this.time.delayedCall(INTRO_HOLD_MS, () => {
      this.cameras.main.pan(w / 2, h / 2, INTRO_MS, 'Sine.easeInOut');
      this.cameras.main.zoomTo(1, INTRO_MS, 'Sine.easeInOut');
    });
    // 줌아웃이 identity 로 정착한 뒤 경기장 공개 연출(좌→우→중앙) — 그 다음에야 첫 투구.
    this.time.delayedCall(INTRO_HOLD_MS + INTRO_MS, () => this.playStadiumReveal(bgBounds, w));
  }

  /**
   * 경기장 공개 연출 — 카메라를 좌→우로 훑어 경기장 전체와 홈런포인트 과녁을 보여준 뒤 중앙으로
   * 복귀하고서야 첫 투구를 시작한다(사용자 요청). 배경이 화면보다 별로 안 넓어 스크롤 여지가
   * 거의 없으면(다른 화면비 등) 그냥 건너뛰고 바로 시작 — 억지로 훑을 게 없으면 의미가 없다.
   */
  private playStadiumReveal(bgBounds: { left: number; w: number }, w: number): void {
    const cam = this.cameras.main;
    const inset = w * INTRO_REVEAL_INSET_RATIO;
    const scrollMin = Math.floor(bgBounds.left) + inset;
    const scrollMax = Math.ceil(bgBounds.left + bgBounds.w) - w - inset;
    if (scrollMax - scrollMin < w * 0.1) {
      this.introComplete = true; // 좌우 드래그 허용 시작(사용자 요청) — 훑을 여지가 없어 건너뛴 경우도 포함.
      this.startPitch();
      return;
    }
    this.tweens.add({
      targets: cam,
      scrollX: scrollMin,
      duration: INTRO_REVEAL_LEG_MS,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.tweens.add({
          targets: cam,
          scrollX: scrollMax,
          duration: INTRO_REVEAL_LEG_MS * 2,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            this.tweens.add({
              targets: cam,
              scrollX: 0,
              duration: INTRO_REVEAL_LEG_MS,
              ease: 'Sine.easeInOut',
              onComplete: () => {
                this.introComplete = true; // 좌우 드래그 허용 시작(사용자 요청).
                this.startPitch();
              },
            });
          },
        });
      },
    });
  }

  /**
   * 좌우 드래그(고무줄) 시작 — 위 CAMERA_DRAG_* 주석 참조. state==='ready' 이고 진입 연출이
   * 끝난 뒤에만 시작한다(사용자 요청: "투구 중간 타임에서만 드래그가 가능"). 스윙 판정(onTap)과
   * 같은 pointerdown 이벤트를 공유하지만, onTap 은 state==='ready' 일 때 아무 부작용 없이
   * 마커만 띄우므로 서로 간섭하지 않는다. 예정된 투구 시각 0.5초 전부턴 새로 시작 못 한다
   * (사용자 요청: "공이 투구 0.5초 전에는 드래그를 막는다").
   */
  private onCameraDragStart(pointer: Phaser.Input.Pointer): void {
    if (this.state !== 'ready' || !this.introComplete) return;
    if (this.time.now >= this.scheduledThrowAt - CAMERA_DRAG_LOCKOUT_MS) return;
    this.cameraDragActive = true;
    this.cameraDragStartPointerX = pointer.x;
    this.cameraDragStartScrollX = this.cameras.main.scrollX;
    this.tweens.killTweensOf(this.cameras.main); // 이전 스냅백이 아직 돌고 있었다면 취소하고 새로 시작.
  }

  /**
   * 드래그 중 매 프레임 — 손가락 이동량을 고무줄처럼 제곱근으로 눌러 반영한다(당길수록 저항이
   * 커짐). 카메라는 이미 setBounds() 로 배경 폭 안쪽으로 자동 클램프되므로 여기서 별도 상한을
   * 계산할 필요가 없다. 드래그 도중 상태가 'ready' 를 벗어나면(투구 시작 등) 즉시 원점 복귀.
   */
  private onCameraDragMove(pointer: Phaser.Input.Pointer): void {
    if (!this.cameraDragActive) return;
    if (this.state !== 'ready') {
      this.onCameraDragEnd();
      return;
    }
    // 화면을 손가락으로 직접 끄는 느낌 — 콘텐츠가 손가락을 따라가므로 카메라(scrollX)는 반대로 움직인다.
    const fingerDelta = pointer.x - this.cameraDragStartPointerX;
    const elastic = Math.sign(fingerDelta) * Math.sqrt(Math.abs(fingerDelta)) * CAMERA_DRAG_ELASTIC_SCALE;
    this.cameras.main.scrollX = this.cameraDragStartScrollX - elastic;
  }

  /** 드래그 종료(손을 뗌) — 고무줄이 튕기듯 원점(scrollX=0)으로 복귀한다(사용자 요청). */
  private onCameraDragEnd(): void {
    if (!this.cameraDragActive) return;
    this.cameraDragActive = false;
    this.tweens.add({
      targets: this.cameras.main,
      scrollX: 0,
      duration: CAMERA_DRAG_SNAPBACK_MS,
      ease: 'Back.easeOut',
    });
  }

  /**
   * 드래그 강제 취소 — 투구가 시작되기 전에 반드시 원점으로 되돌려야 한다(타이밍 창엔 카메라가
   * 밀려 있으면 안 됨). instant=true 면 트윈 없이 즉시(throwPitch() 시작 시점의 최종 안전망),
   * false 면 스냅백 트윈으로(showIndicator() 시점의 1차 정리 — 애니메이션이 끝날 여유가 있다).
   */
  private cancelCameraDrag(instant: boolean): void {
    this.cameraDragActive = false;
    this.tweens.killTweensOf(this.cameras.main);
    if (instant) this.cameras.main.scrollX = 0;
    else if (this.cameras.main.scrollX !== 0) {
      this.tweens.add({
        targets: this.cameras.main,
        scrollX: 0,
        duration: CAMERA_DRAG_SNAPBACK_MS,
        ease: 'Back.easeOut',
      });
    }
  }

  // ── 구성 ──────────────────────────────────────────────────────────

  /**
   * 월드 구성 — 카메라 bounds 산정을 위해 배경 이미지를 반환.
   * 배경은 에디터 레이아웃 노드(layer_3)의 **정확한 위치·크기**로 배치한다(SSOT). cover 가 아니라
   * 디자인 좌표 그대로라 에디터 미리보기와 1:1 정렬되고, 같은 좌표계의 타자·전광판 이펙트와도 맞는다.
   * 카메라는 휴식 시 identity(scroll 0, zoom 1)라 월드 노드가 HUD 노드와 동일 좌표에서 겹친다.
   */
  private buildWorld(w: number, h: number, doc: LayoutDoc | null): Phaser.GameObjects.Image {
    const bgNode = doc?.nodes?.find((n) => isBackgroundNode(n));
    const bgKey = bgNode?.key && this.textures.exists(bgNode.key) ? bgNode.key : BG_KEY;
    const bg = this.add.image(bgNode?.x ?? w / 2, bgNode?.y ?? h / 2, bgKey).setOrigin(0.5, 0.5);
    if (bgNode?.w && bgNode?.h) bg.setDisplaySize(bgNode.w, bgNode.h);
    else bg.setScale(Math.max(w / bg.width, h / bg.height)); // 노드 미지정 시 cover 폴백
    // 캔버스보다 작으면(에디터 1280 설계 < 실제 더 긴 캔버스) 키워 빈 띠 방지.
    const coverScale = Math.max(1, w / bg.displayWidth, h / bg.displayHeight);
    if (coverScale > 1) bg.setDisplaySize(bg.displayWidth * coverScale, bg.displayHeight * coverScale);
    // 위치 클램프 — 에디터 프레이밍(x)은 유지하되 배경이 화면 상·하·좌·우를 항상 덮도록
    // (배경 중심이 설계상 화면 중앙보다 위면 하단에 빈 띠가 생기는 것을 방지).
    bg.x = Phaser.Math.Clamp(bg.x, w - bg.displayWidth / 2, bg.displayWidth / 2);
    bg.y = Phaser.Math.Clamp(bg.y, h - bg.displayHeight / 2, bg.displayHeight / 2);
    this.worldLayer.add(bg);
    // 수비수 — 에디터 SSOT(main.json)의 수비수 이미지 노드를 월드 레이어에 그대로 배치.
    // 배경과 같은 좌표계라 카메라 줌/팬 시 필드와 함께 움직인다(코너 수비수는 타구 팬에서 노출).
    // ⚠️ 배경(위) 바로 다음·공/이펙트/캐릭터(아래)보다 먼저 삽입 → z-order: 배경 < 수비수 < 공·투수·타자.
    // depth 오름차순으로 생성해 에디터가 지정한 앞뒤 겹침(depth 12~17)을 유지한다.
    const fielderNodes = (doc?.nodes ?? [])
      .filter(isFielderNode)
      .slice()
      .sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));
    for (const fn of fielderNodes) {
      if (!fn.key || !this.textures.exists(fn.key)) continue;
      const img = this.add.image(fn.x, fn.y, fn.key).setOrigin(0.5, 0.5);
      if (fn.w && fn.h) img.setDisplaySize(fn.w, fn.h);
      if (fn.alpha !== undefined) img.setAlpha(fn.alpha);
      if (fn.visible === false) img.setVisible(false);
      // 정지된 이미지가 어색해 은은한 "숨쉬기"(사용자 요청)를 준다 — 발은 고정돼야 하므로
      // 원점을 발밑(하단 중앙)으로 바꾸고 그만큼 y 를 내려 시각적 위치는 그대로 유지한 채,
      // 이후 scale 트윈이 중심(발) 기준이 아니라 발밑 기준으로 커지게 만든다(몸통만 위로 부풂).
      const bottomY = img.y + img.displayHeight / 2;
      img.setOrigin(0.5, 1).setY(bottomY);
      this.worldLayer.add(img);
      if (fn.visible !== false) {
        this.tweens.add({
          targets: img,
          scaleX: { from: img.scaleX, to: img.scaleX * 1.025 },
          scaleY: { from: img.scaleY, to: img.scaleY * 1.035 },
          duration: Phaser.Math.Between(1300, 1700),
          delay: Phaser.Math.Between(0, 600), // 다 같은 박자로 숨쉬지 않도록 살짝 어긋나게.
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
      // 캐치 판정용 위치 기록(화면에 실제로 보이는 수비수만) — update() 가 안타 궤적과 거리 비교.
      if (fn.visible !== false) {
        this.fielderSpots.push({ x: fn.x, y: fn.y });
        this.fielderImages.push(img); // 공-수비수 앞뒤 렌더 순서 보정용(update() 참조).
      }
    }
    // 필드영역(에디터가 'zone' 타입으로 그린 폴리곤, 예: layer_8 "영역 설정") — 안타 착지/구름 범위를
    // 이 밖으로 나가지 않게 제한하는 경계로 쓴다(update() 참조). 렌더링 대상이 아니므로 buildLayout 은
    // 건드리지 않고(무시하고 스킵) 여기서 좌표만 절대값으로 환산해 읽는다.
    const fieldNode = (doc?.nodes ?? []).find((n) => n.type === 'zone' && n.points && n.points.length >= 3);
    if (fieldNode?.points) {
      this.fieldAreaPoints = fieldNode.points.map((p) => ({ x: fieldNode.x + p.x, y: fieldNode.y + p.y }));
    }
    // 투수는 에디터 캐릭터(layer_6, 3동작 리그)로 buildHud 에서 별도 구성된다(아틀라스 피처 제거).
    // 홈플레이트 꼭지점 — 투구가 최종적으로 꽂히는 포구 지점 (BG 좌표 → 화면 환산).
    const bgLeft = bg.x - bg.displayWidth / 2;
    const bgTop = bg.y - bg.displayHeight / 2;
    this.plateApexX = bgLeft + (PLATE_APEX_SRC.x / BG_SRC.width) * bg.displayWidth;
    this.plateApexY = bgTop + (PLATE_APEX_SRC.y / BG_SRC.height) * bg.displayHeight;
    // 컨택 포인트(붉은원·인디케이터·임팩트 이펙트 기준점) — 타자는 에디터 캐릭터로 대체돼
    // 아틀라스 스위트스팟 픽셀이 없으므로 스트라이크존 중심을 컨택 지점으로 사용한다.
    // 공이 도달하는 존과 일치하므로 타격 판정·이펙트가 같은 지점에서 일어난다.
    this.batContactX = w * POS.zoneXRatio;
    this.batContactY = fieldY(h, POS.zoneY) + BAT_CONTACT_BACK_OFFSET;

    // 타격 인디케이터 — 외곽선 없는 반투명 원. 릴리스와 동시 등장, 둥둥 떠 있는 부유 모션.
    this.zoneFill = this.add.circle(0, 0, ZONE_RADIUS, 0xffffff, 0.18).setVisible(false);
    // 타이밍 링(노란) — 붉은 원 중심으로 수축, 도달 순간 붉은 원과 같은 크기가 된다.
    // 굵기 3→5(사용자 요청: 약간 굵게) — 수축 이징이 구질별로 달라지면서(throwPitch 참조)
    // 그 차이가 더 잘 보이도록.
    this.timingRing = this.add
      .circle(0, 0, RED_DOT_R)
      .setStrokeStyle(5, 0xffe14d, 0.9)
      .setVisible(false);
    // 붉은 타격점 — 반투명, 인디케이터 원 안의 랜덤 위치에 출현. 공 통과 크기와 동일.
    this.redDot = this.add.circle(0, 0, RED_DOT_R, 0xe23030, 0.55).setVisible(false);
    // 터치 지점 마커 — 채움 없는 외곽선 원. 탭 시 showTapMarker 가 위치·색을 잡고 짧게 재생한다.
    this.tapMarker = this.add.circle(0, 0, TAP_MARKER_R).setStrokeStyle(4, 0xffffff, 0.95).setVisible(false);
    // 타구 궤적 트레이서 — 공 아래 레이어에 라인으로 누적 렌더.
    this.tracer = this.add.graphics();
    this.ball = this.add.sprite(0, 0, BALL_KEY).setVisible(false);
    // 포수 미트 — 공 "위" 레이어 + 50% 투명: 통과한 공이 미트 너머로 비치며 꽂힌다.
    this.mitt = this.add
      .image(0, 0, MITT_KEY)
      .setScale(MITT_DISPLAY_W / MITT_TEX_SIZE)
      .setAlpha(0)
      .setVisible(false);
    // 구종+구속 라벨 — "직구 145km/h" 식으로 표시. throwPitch() 가 갱신. 화면 하단 고정 UI로
    // 취급한다(사용자 요청: "구질 및 속도 표시는 UI로 취급하여 화면하단에 표시할 것, 배경에
    // 붙여서 표시하지 말것" — 예전엔 월드 좌표(포수 미트 쪽, plateApexX/Y)에 배치돼 카메라
    // 줌/팬을 따라 같이 움직였다). hudLayer 에 넣고 화면 비율 좌표(POS.pitchInfoY)로 고정한다.
    // 폰트 30→60px(2배 요청). ⚠️ 스트로크를 10으로 키웠더니(폰트 대비 16.7%, resultText 의
    // 11.9% 비율보다 두꺼움) 폰트가 깨진 것처럼 보인다는 보고가 있었다 — 7로 낮추고, Phaser Text
    // 캔버스가 두꺼운 stroke 폭만큼 여백을 안 잡아 외곽선이 잘리는 경우도 있어 setPadding 으로
    // 안전 여백을 둔다(두 원인 다 방어).
    this.pitchInfoText = this.add
      .text(w / 2, fieldY(h, POS.pitchInfoY), '', {
        fontFamily: FONT.family,
        fontSize: '60px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0.5)
      .setStroke('#0a2540', 7)
      .setPadding(16)
      .setAlpha(0);
    // 임팩트 스파크 — ⚠️ 공과 같은 흰 원이면 "공이 두 개"로 보인다(픽셀 분석으로 확인).
    // 노란 불꽃 틴트 + 작게 + 짧게 — 공과 시각적으로 분리.
    this.sparks = this.add.particles(0, 0, SPARK_KEY, {
      speed: { min: 100, max: 280 },
      scale: { start: 0.6, end: 0 },
      lifespan: 300,
      tint: [0xffd147, 0xffb347, 0xfff2a8],
      emitting: false,
    });
    // 타구 잔상은 점 입자 대신 "궤적 라인(tracer)"만 사용한다.
    // ⚠️ 원형 점 입자는 측면 타구처럼 화면 이동이 빠를 때 공과 분리돼 보여
    //    "공이 두 개"로 오인되는 것이 반복 확인됨 — 입자 트레일 영구 제거.
    // 관중 환호 컨페티 — 스탠드에서 위로 분출 후 낙하.
    // 짧은 수명 — 조각이 필드까지 떨어지기 전에 관중석 위에서 소멸.
    this.confetti = this.add.particles(0, 0, CONFETTI_KEY, {
      speed: { min: 140, max: 340 },
      angle: { min: 235, max: 305 },
      gravityY: 500,
      lifespan: { min: 450, max: 850 },
      scale: { start: 1.1, end: 0.3 },
      rotate: { min: 0, max: 360 },
      tint: CHEER_TINTS,
      emitting: false,
    });
    // pitchInfoText 는 화면 고정 UI라 hudLayer 에 별도로 넣는다(worldLayer 는 카메라 줌/팬을 받음).
    this.hudLayer.add(this.pitchInfoText);
    this.worldLayer.add([
      this.zoneFill,
      this.timingRing,
      this.redDot,
      this.tapMarker,
      this.tracer,
      this.ball,
      this.mitt,
      this.sparks,
      this.confetti,
    ]);
    // 에디터 타자 캐릭터는 buildHud 에서 월드 레이어 최상위로 올린다(공이 타자 뒤로 안 가도록).
    return bg;
  }

  /**
   * 홈런포인트 과녁(양궁 과녁처럼, 사용자 요청) — 외야 상공 고정 평면(HOMERUN_TARGET_Z)에 옅은
   * 반투명 동심원 2개를 띄운다. 판정은 update() 의 평면 통과 검사가 담당 — 여긴 시각 표현만.
   * 배경·수비수와 같은 투영식(PROJ_FOCAL/outfieldProjectedZ/GROUND_*)을 써서 카메라가 이동해도
   * 항상 "제자리"에 있는 것처럼 자연스럽게 보인다(월드 레이어 소속이라 카메라 팬을 함께 받는다).
   * ⚠️ 레이어 순서 — 배경 < 수비수 < 전광판(동영상) < 동심원 < 존/공/이펙트 < 캐릭터. 여러 번
   * 시행착오 끝에(수비수를 가림 → 전광판보다 아래라 사용자 요청으로 재수정) 확정한 자리다.
   * buildHud() 가 전광판 등 world-space 노드를 zoneFill 바로 앞(= zoneFill 보다 낮은 인덱스)에
   * 몰아넣으므로, zoneFill 의 "현재" 인덱스에 addAt() 으로 직접 끼워 넣으면 전광판보다는 위,
   * zoneFill/공/캐릭터보다는 아래 자리가 정확히 확보된다(헤드리스로 인덱스 직접 확인).
   * ⚠️ moveAbove/moveBelow 는 대상이 현재 반대 방향에 있을 때만 조용히 무시된다(둘 다 실제로는
   * 정상 동작하지만 방향성 가드가 있다 — 아무것도 안 바뀐 걸 "고장"으로 오인해 이전에 두 번
   * 잘못 고쳤다). remove-then-reinsert 방식의 moveTo 도 대상이 목표보다 앞에 있으면 인덱스가
   * 한 칸씩 밀려 어긋난다 — addAt() 은 제거 없이 그 자리에 바로 꽂아 이런 함정이 없다.
   */
  private buildHomerunTargets(w: number, h: number, bg: Phaser.GameObjects.Image): void {
    this.homerunTargets = pickHomerunTargets(bg.displayWidth, w, h); // 재시작마다 위치 변경(사용자 요청).
    this.homerunTargetSquishX = [];
    this.homerunTargetViews = this.homerunTargets.map((target) => {
      const p = PROJ_FOCAL / (PROJ_FOCAL + outfieldProjectedZ(target.z));
      const groundY = projectedGroundY(h, p);
      const x = w / 2 + target.x3 * p;
      const y = groundY - target.y3 * p;
      // 좌우로 치우칠수록 타원으로 찌그러뜨린다(사용자 요청: "카메라 뷰각도에 맞는 구조") —
      // 배치 기준과 같은 배경 폭 기준 오프셋 비율로 세로 대비 가로 스케일만 줄인다.
      const maxOffsetPx = bg.displayWidth / 2 - HOMERUN_TARGET_SCREEN_MARGIN;
      const lateralRatio = Phaser.Math.Clamp(Math.abs(x - w / 2) / maxOffsetPx, 0, 1);
      const squishX = 1 - HOMERUN_TARGET_SQUISH_STRENGTH * lateralRatio;
      this.homerunTargetSquishX.push(squishX); // update() 의 링 판정이 재사용(위 필드 JSDoc 참조).
      // 불투명도 — 용어 통일(사용자 요청): "불투명도"만 쓰고 항상 "0(완전 투명)~1(완전 불투명)"
      // 기준으로 얘기한다("투명도를 올린다"처럼 반대 방향 표현은 섞지 않는다). HOMERUN_TARGET_OPACITY
      // 하나가 과녁 전체의 불투명도를 결정 — 링별 alpha 는 그 안에서의 상대 명암(더 밝은/진한
      // 링)만 담당한다. 낮추면 더 흐리게(투명하게), 높이면 더 진하게(색이 또렷하게) 보인다.
      const c = this.add.container(x, y).setScale(p * squishX, p).setAlpha(HOMERUN_TARGET_OPACITY);
      const g = this.add.graphics();
      // 양궁 과녁 배색(바깥 금색→흰색→빨강 부시아이) — 테두리(stroke) 대신 채움(fill)만으로 그린
      // 동심 색상 띠(사용자 요청: "색상으로만"). 큰 원부터 채워 작은 원이 덮으며 띠가 생기게 한다.
      const rings: ReadonlyArray<[radius: number, color: number, alpha: number]> = [
        [target.visualR, 0xffe14d, 0.6],
        [target.visualR * HOMERUN_TARGET_RING_MID_RATIO, 0xffffff, 0.75],
        [target.visualR * HOMERUN_TARGET_RING_INNER_RATIO, 0xff5a3c, 0.9],
      ];
      for (const [radius, color, alpha] of rings) {
        g.fillStyle(color, alpha);
        g.fillCircle(0, 0, radius);
      }
      c.add(g);
      // zoneFill 의 "현재" 인덱스에 직접 끼워 넣는다 — 전광판(등 world-space HUD 노드)은 이미
      // zoneFill 바로 앞에 몰려 있으므로, 그 자리에 addAt() 하면 전광판 바로 위·zoneFill 바로
      // 아래 자리가 정확히 확보된다(위 클래스 JSDoc 참조, 헤드리스로 검증).
      try {
        const zoneFillIndex = this.worldLayer.list.indexOf(this.zoneFill);
        this.worldLayer.addAt(c, zoneFillIndex);
      } catch {
        this.worldLayer.add(c); // 무시 — 최악의 경우 최상단에 남을 뿐, 게임 진행에는 영향 없음.
      }
      // 은은한 숨쉬기 펄스 — 가만히 있으면 눈에 안 띄어서 존재감을 살짝 준다.
      // scale(균일) 대신 scaleX/scaleY 를 따로 트윈 — 타원 찌그러짐(squishX) 비율을 유지한 채 커진다.
      this.tweens.add({
        targets: c,
        scaleX: { from: p * squishX, to: p * squishX * 1.08 },
        scaleY: { from: p, to: p * 1.08 },
        duration: 1600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      return c;
    });
  }

  /**
   * 홈런포인트 과녁 적중 연출 — 과녁 강조 펄스 + 링 배율 팝업 + 스파크. 실제 점수 숫자는 아직
   * 안 보여준다(showDistance() 가 비거리 표시 직후에 표시) — 여기선 어느 링을 맞혔는지만 알린다.
   */
  private flashHomerunTarget(view: Phaser.GameObjects.Container, multiplier: number): void {
    this.tweens.killTweensOf(view);
    // scaleX/scaleY 를 따로 — 좌우로 찌그러진 과녁(squishX)은 scaleX≠scaleY 라, 균일한 `scale`
    // 하나만 트윈하면 flash 후 타원비가 깨진다(둘 다 같은 값으로 눌려버림).
    const baseScaleX = view.scaleX;
    const baseScaleY = view.scaleY;
    this.tweens.add({
      targets: view,
      scaleX: baseScaleX * 1.6,
      scaleY: baseScaleY * 1.6,
      alpha: 1,
      duration: 220,
      yoyo: true,
      ease: 'Back.easeOut',
    });
    const ringLabel =
      multiplier >= HOMERUN_TARGET_RING_MULT_INNER
        ? '퍼펙트'
        : multiplier >= HOMERUN_TARGET_RING_MULT_MID
          ? '그레이트'
          : '나이스';
    const popup = this.add
      .text(view.x, view.y, `${ringLabel}! ×${multiplier}`, {
        fontFamily: FONT.family,
        fontSize: '40px',
        color: '#ffe14d',
      })
      .setOrigin(0.5)
      .setStroke('#5a3210', 8)
      .setPadding(16)
      .setDepth(9999);
    this.worldLayer.add(popup);
    this.tweens.add({
      targets: popup,
      y: view.y - 80,
      alpha: 0,
      duration: 1400,
      delay: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => popup.destroy(),
    });
    this.sparks.explode(20, view.x, view.y);
    this.cameras.main.shake(180, 0.006);
  }

  /**
   * 홈런포인트 과녁 "근처" 반응 — 정확히 맞춘 건 아니지만(점수 없음) 스쳐 지나간다는 걸
   * 보여준다(사용자 요청: "동심원 근처에 공이 떨어질때 반응하는 연출은 하되"). flashHomerunTarget()
   * 과 달리 텍스트·점수·카메라 흔들림 없이 가볍게 — 그리고 과녁 자체(view)의 scaleX/scaleY 를
   * 직접 건드리지 않는다. view 는 항상 숨쉬기 펄스(buildHomerunTargets 참조)가 반복 중이라, 여기서
   * killTweensOf(view) 하면 그 숨쉬기가 영구히 멈춘다 — 대신 view 의 자식으로 별도 링 하나를 만들어
   * 그것만 확장·소멸시킨다(부모 트윈과 절대 안 겹침).
   */
  private pulseHomerunTargetNear(target: HomerunTargetDef, view: Phaser.GameObjects.Container): void {
    const ripple = this.add.circle(0, 0, target.visualR, 0xffffff, 0).setStrokeStyle(14, 0xffe14d, 0.85);
    view.add(ripple);
    this.tweens.add({
      targets: ripple,
      scale: 1.5,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ripple.destroy(),
    });
  }

  /**
   * 화면 구성 적용 — 에디터(phaser-ui-editor)의 ui/layouts/main.json 을 그대로 생성해
   * 노드를 두 레이어로 라우팅한다:
   *   · 캐릭터(spriteDocClip, 타자/투수) → 월드 레이어. 3동작 리그(buildCharacterRig)로 별도 구성.
   *   · 도형+채움 전광판 이펙트 → 월드 레이어(배경과 함께 줌/팬).
   *   · 그 외 패널/텍스트 → HUD 레이어(고정, 필드가 비치도록 살짝 디밍).
   * 배경(layer_3)·캐릭터는 buildLayout 에서 제외하고 별도 처리한다.
   * 스코어보드(총점+회차별 점수)는 화면 좌측에 좌측 정렬로 고정 배치한다(SCOREBOARD_LAYOUT 참조).
   * 레이아웃이 없으면 기존 캡슐 HUD 로 폴백(디자인 미배포 단계 방어).
   */
  private buildHud(w: number, h: number, doc: LayoutDoc | null): void {
    // 세이프에어리어(다이나믹 아일랜드 등) 오프셋 — 헤더 노드 + 최종라운드 표시 UI 에만 적용.
    const headerOffsetY = headerSafeOffsetY(this);
    // 하단 배너 광고 정렬 — 시즌패스·미션바·콤보 아이콘의 밑변을 배너 윗변에 붙인다.
    // 실제 적용은 레이아웃을 다 만든 뒤(밑변을 알아야 하므로) applyBottomUiOffset() 이 한다.
    // 최종 라운드 목업 노드 — 필터(isScoreboardMockupNode)로 제외되기 전, 원본 doc.nodes 에서
    // 찾아 둔다(scoreboardOptionsFromNode() 가 위치·정렬·폰트·색·아웃라인·그림자를 그대로 읽어감).
    let playerRoundNode: LayoutNode | undefined;
    let rivalRoundNode: LayoutNode | undefined;
    if (doc && Array.isArray(doc.nodes) && doc.nodes.length > 0) {
      playerRoundNode = doc.nodes.find((n) => n.id === ROUND_MOCKUP_NODE_ID.player);
      rivalRoundNode = doc.nodes.find((n) => n.id === ROUND_MOCKUP_NODE_ID.rival);
      // 배경(월드 cover)·수비수(월드 배치)·캐릭터(3동작 컨트롤러)는 제외하고 나머지만 일반 빌드.
      const layoutDoc: LayoutDoc = {
        ...doc,
        nodes: doc.nodes.filter(
          (n) =>
            !isBackgroundNode(n) &&
            !isFielderNode(n) &&
            !isScoreboardMockupNode(n) &&
            n.type !== 'spriteDocClip',
        ),
      };
      const layout = buildLayout(this, layoutDoc);
      // 헤더 트로피 총점 노드 — 존재하면 참조를 들고 있다가 updateHud()/revealRivalRound() 가
      // 직접 setText 로 갱신한다(사용자 요청: "토탈점수는 상단 캐릭터명에 표시합니다").
      this.playerTotalText = layout.tryById<Phaser.GameObjects.Text>(HEADER_TOTAL_NODE_ID.player);
      this.rivalTotalText = layout.tryById<Phaser.GameObjects.Text>(HEADER_TOTAL_NODE_ID.rival);
      this.playerTotalText?.setText(formatScore(0));
      this.rivalTotalText?.setText(formatScore(0));
      this.bindHomeButton(layout);
      // 컨테이너는 자식 depth 를 자동 정렬하지 않음 — depth 순으로 추가.
      const sorted = layout.entries().sort((a, b) => (a.node.depth ?? 0) - (b.node.depth ?? 0));
      for (const e of sorted) {
        // 좌표공간 — 에디터가 넘긴 space 를 우선 적용, 없으면 휴리스틱으로 폴백(하위호환).
        //   'world' = 배경과 같은 좌표계 → 카메라 줌/팬을 함께 받음(전광판=fillClip 애니메이션).
        //   'screen' = 고정 카메라(HUD). ⚠️ fillImage(정지 이미지 채움 — 예: 헤더 아바타 초상화
        //   layer_10/layer_10_copy)는 world 로 보면 안 된다 — 카메라 팬을 따라가며 배경과 함께
        //   움직여 헤더 패널에서 떨어져 보인다(사용자 보고: "프로필 이미지가 헤더 뒷편 레이어에
        //   표시되고, 배경과 같이 움직인다"). fillClip 만 world 기본값으로 남기고 fillImage 는
        //   screen 기본값으로 분리.
        const space = e.node.space ?? (e.node.fillClip ? 'world' : 'screen');
        if (space === 'world') {
          this.worldLayer.add(e.obj);
          // 전광판(전광판 동영상) 등 월드 노드는 buildWorld 의 효과 그룹(궤적·공)보다 "아래"로 내린다 —
          // 나중에 add 되면 최상단이라 공/궤적이 전광판에 가려진다(사용자 보고). zoneFill 바로 아래로
          // 이동해 z 순서: 배경 < 수비수 < 전광판 < 궤적·공 < 캐릭터 를 확정한다.
          this.worldLayer.moveBelow<Phaser.GameObjects.GameObject>(e.obj, this.zoneFill);
        } else {
          // HUD 패널/텍스트 — 고정 카메라. 필드가 비치도록 살짝 디밍.
          this.hudLayer.add(e.obj);
          // 아바타(헤더 프로필 초상화)는 디밍 제외 — image 타입(n.key)뿐 아니라 fillImage 로 채운
          // rect(예: layer_10/layer_10_copy, 도형+정지이미지 채움)도 같은 방식으로 판별해야 한다.
          // ⚠️ 이전엔 n.key 만 검사해 fillImage 노드는 항상 false 로 빠져 다른 HUD 요소처럼
          // 디밍됐다(사용자 보고와 함께 발견 — 헤더 위에 붙어야 할 아바타가 흐릿해 보이는 원인).
          const isAvatar = UI_AVATAR_KEYS.has(e.node.key ?? e.node.fillImage ?? '');
          if (!isAvatar) e.obj.setAlpha((e.node.alpha ?? 1) * UI_DIM_ALPHA);
          // 헤더 노드는 세이프에어리어(다이나믹 아일랜드)만큼 다 같이 아래로.
          if (headerOffsetY > 0 && HEADER_NODE_IDS.has(e.node.id)) e.obj.y += headerOffsetY;
          // 하단 UI 노드는 배너 광고 높이만큼 다 같이 위로.
          // 하단 UI 는 저작 y 를 기억해 두고, 배너 위치가 잡히는 대로 applyBottomUiOffset() 이 옮긴다.
          if (BOTTOM_UI_NODE_IDS.has(e.node.id)) {
            this.bottomUiItems.push({ obj: e.obj as Phaser.GameObjects.Image, baseY: e.obj.y });
            const half = (e.node.h ?? 0) / 2; // 노드는 중심 기준 — 밑변 = y + h/2.
            this.bottomUiBaseBottomY = Math.max(this.bottomUiBaseBottomY, e.obj.y + half);
          }
        }
      }
      // 캐릭터(spriteDocClip) — 타자/투수를 각각 3동작 리그로 구성(에디터 등록 준비/액션/후).
      // ⚠️ depth 오름차순으로 생성 → 컨테이너가 depth 순으로 worldLayer 에 추가돼 z-order 가 결정적이고
      //    에디터 depth(투수 24 > 타자 23 등)에 충실하다(비동기 로드 순서에 흔들리지 않음).
      const charNodes = doc.nodes
        .filter((n) => n.type === 'spriteDocClip')
        .sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));
      // 타자는 **한 명만** 만든다 — 에디터에 타자 캐릭터 노드가 둘 이상 남아 있어도(작업용으로
      // 올려둔 클립 노드 등) 가장 큰 노드 하나만 실제 타자로 쓰고 나머지는 아예 생성하지 않는다.
      // 예전엔 노드마다 리그를 만들어 ① 작은 캐릭터가 타석 옆에 같이 그려지고 ② depth 가 큰 쪽이
      // 마지막에 batterRig 를 덮어써 **스윙이 작은 쪽에서 재생**됐다(2026-08-03 사용자 보고:
      // "작은 캐릭터와 큰 캐릭터가 존재합니다. 작은 캐릭터는 없애야 합니다").
      const batterNode = charNodes
        .filter((n) => !isPitcherNode(n))
        .reduce<LayoutNode | undefined>((best, n) => ((n.h ?? 0) > (best?.h ?? 0) ? n : best), undefined);
      for (const node of charNodes) {
        if (isPitcherNode(node)) {
          this.pitcherNode = node;
          this.pitcherRig = this.buildCharacterRig(node, PITCHER_RIG.viewMs);
        } else if (node === batterNode) {
          this.batterRig = this.buildCharacterRig(node, BATTER_VIEW_MS);
        }
      }
    } else {
      const capsule = this.add.graphics();
      capsule.fillStyle(0x0a2540, 0.55);
      capsule.fillRoundedRect(HUD.margin, HUD.capsuleY, HUD.scoreW, HUD.capsuleH, HUD.capsuleRadius);
      capsule.fillRoundedRect(w - HUD.pitchW - HUD.margin, HUD.capsuleY, HUD.pitchW, HUD.capsuleH, HUD.capsuleRadius);
      this.hudLayer.add(capsule);
    }

    this.startBottomUiAlignment();
    this.buildHeaderGauges(headerOffsetY);
    // 헤더 하단 최종 라운드 표시(플레이어) — 회차가 끝날 때마다 이 한 줄만 교체(누적 아님).
    // 세이프에어리어만큼 헤더와 같이 밀려야 어긋나지 않는다(entryY 에도 headerOffsetY 반영).
    const playerScoreboardOpts = scoreboardOptionsFromNode(playerRoundNode, SCOREBOARD_FALLBACK);
    this.scoreboard = new Scoreboard(this, { ...playerScoreboardOpts, entryY: playerScoreboardOpts.entryY + headerOffsetY });
    this.hudLayer.add(this.scoreboard.container);
    // 헤더 하단 최종 라운드 표시(라이벌) — revealRivalRound() 가 매 회차 투구 전에 교체한다.
    const rivalScoreboardOpts = scoreboardOptionsFromNode(rivalRoundNode, RIVAL_SCOREBOARD_FALLBACK);
    this.rivalScoreboard = new Scoreboard(this, { ...rivalScoreboardOpts, entryY: rivalScoreboardOpts.entryY + headerOffsetY });
    this.hudLayer.add(this.rivalScoreboard.container);
    this.resultText = this.add
      .text(w / 2, h * POS.resultY, '', { fontFamily: FONT.family, fontSize: '84px', color: '#ffffff' })
      .setStroke('#0a2540', 10)
      .setOrigin(0.5)
      .setAlpha(0);
    this.hudLayer.add([this.resultText]);
  }

  // ── 회전하는 공 (홈런 슬로우모션 전용) ─────────────────────────────────

  /**
   * 회전 공 애니메이션 등록 — 6프레임 루프. 텍스처가 하나라도 없으면(로드 실패) 만들지 않고,
   * 그때는 정지 공 그대로 재생된다(연출만 빠지고 게임은 정상).
   * 애니메이션은 게임 전역(this.anims)에 등록되므로 씬을 다시 시작해도 중복 생성하지 않는다.
   */
  private ensureBallSpinAnim(): void {
    if (this.anims.exists(BALL_SPIN_ANIM)) return;
    if (!BALL_SPIN_KEYS.every((k) => this.textures.exists(k))) return;
    this.anims.create({
      key: BALL_SPIN_ANIM,
      frames: BALL_SPIN_KEYS.map((key) => ({ key })),
      frameRate: BALL_SPIN_FPS,
      repeat: -1,
    });
  }

  /**
   * 홈런 슬로우모션 동안 공을 회전 프레임으로 바꿔 돌린다(사용자 요청: "홈런시 이 볼을 슬로우
   * 모션에 도입"). 프레임이 기본 공보다 커서 ballScaleComp 로 겉보기 크기를 맞춘다 — 실제
   * setScale 은 슬로우모션 트윈이 매 프레임 수행하므로 여기선 배율만 바꿔 둔다.
   */
  private startBallSpin(): void {
    this.ensureBallSpinAnim();
    if (this.ballScaleComp !== 1 || !this.anims.exists(BALL_SPIN_ANIM)) return;
    this.ballScaleComp = BALL_SPIN_SCALE_COMP;
    this.ball.setScale(this.ball.scale * BALL_SPIN_SCALE_COMP); // 트윈 첫 틱 전 한 프레임 튐 방지.
    this.ball.play(BALL_SPIN_ANIM);
  }

  /** 정지 공으로 되돌린다(컨택 순간). 겉보기 크기가 유지되도록 보정도 함께 푼다. */
  private stopBallSpin(): void {
    if (this.ballScaleComp === 1) return;
    this.ball.stop();
    this.ball.setTexture(BALL_KEY);
    this.ball.setScale(this.ball.scale / this.ballScaleComp);
    this.ballScaleComp = 1;
  }

  /**
   * 홈버튼(에디터 layer_12) — 누르면 진행 중인 게임을 접고 로비로 돌아간다(사용자 요청:
   * "홈버튼을 눌렀을 때 로비화면으로 이동하도록"). scene.start 가 이 씬을 종료시키므로 예약된
   * 타이머·트윈(투구 스케줄 등)은 함께 정리된다 — 따로 취소할 필요가 없다.
   *
   * 노드가 없으면(에디터에서 아직 안 그렸거나 삭제) 조용히 넘어간다 — 게임 진행을 막지 않는다.
   */
  private bindHomeButton(layout: LayoutIndex): void {
    const btn = layout.tryById<Phaser.GameObjects.Image>(HOME_BUTTON_NODE_ID);
    if (!btn) return;
    // 레이아웃이 노드 w/h 에 맞춰 스케일을 이미 잡아 뒀다 — 그 값을 기준으로 눌림 표시만 얹는다.
    const baseX = btn.scaleX;
    const baseY = btn.scaleY;
    const press = (on: boolean): void => {
      const k = on ? HOME_BUTTON_PRESS_SCALE : 1;
      btn.setScale(baseX * k, baseY * k);
    };
    btn.setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => press(true));
    btn.on('pointerout', () => press(false));
    btn.on('pointerup', () => {
      press(false);
      if (this.leavingToLobby) return; // 연타 방어 — 확인창이 두 번 뜨지 않게.
      // 경기가 끝난 뒤(게임오버 오버레이)엔 포기할 게 없으니 곧장 나간다.
      if (this.state === 'over') {
        this.goToLobby();
        return;
      }
      this.showForfeitConfirm();
    });
  }

  // ── 하단 UI ↔ 배너 광고 정렬 ────────────────────────────────────────

  /**
   * 하단 UI 를 배너 윗변에 붙여 두는 감시를 시작한다.
   *
   * 한 번만 계산하면 안 된다 — 광고는 부팅 후 **비동기로** 붙고(토스 SDK 초기화 → attachBanner),
   * 광고 제거 구매나 화면 회전으로도 사라지거나 크기가 바뀐다. 그래서 짧은 주기로 배너 위치를
   * 다시 재고, 값이 달라졌을 때만 옮긴다(사용자 요청: "광고위치와 광고 존재 여부에 따라 이 하단
   * 아이콘의 위치는 변한다").
   */
  private startBottomUiAlignment(): void {
    if (!this.bottomUiItems.length) return;
    this.applyBottomUiOffset();
    this.time.addEvent({
      delay: BOTTOM_UI_RECHECK_MS,
      loop: true,
      callback: () => this.applyBottomUiOffset(),
    });
    this.scale.on('resize', this.applyBottomUiOffset, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.applyBottomUiOffset, this));
  }

  /** 지금 배너 위치로 하단 UI 를 정렬 — 오프셋이 그대로면 아무 것도 안 한다. */
  private applyBottomUiOffset(): void {
    const offset = bottomAdOffsetY(this, this.bottomUiBaseBottomY);
    if (Math.abs(offset - this.bottomUiOffsetApplied) < 1) return; // NaN 비교는 항상 false → 최초 1회는 통과.
    this.bottomUiOffsetApplied = offset;
    for (const item of this.bottomUiItems) item.obj.y = item.baseY - offset;
  }

  // ── 헤더 점수 게이지 ───────────────────────────────────────────────

  /**
   * 헤더 이미지에 그려진 빈 막대 위에 채움 그래픽을 얹는다. 좌=플레이어, 우=라이벌.
   * @param offsetY 세이프에어리어만큼 헤더가 내려간 양 — 게이지도 같이 내려야 홈에 맞는다.
   */
  private buildHeaderGauges(offsetY: number): void {
    this.gaugeRatio = { player: 0, rival: 0 };
    this.gauges = { player: this.add.graphics(), rival: this.add.graphics() };
    this.gaugeOffsetY = offsetY;
    for (const side of ['player', 'rival'] as const) {
      this.hudLayer.add(this.gauges[side]);
    }
    this.drawGauges();
  }

  /** 현재 비율대로 두 게이지를 다시 그린다(매 트윈 프레임 호출). */
  private drawGauges(): void {
    if (!this.gauges) return;
    for (const side of ['player', 'rival'] as const) {
      const rect = HEADER_GAUGE_RECTS[side];
      const g = this.gauges[side];
      g.clear();
      const ratio = Phaser.Math.Clamp(this.gaugeRatio[side], 0, 1);
      if (ratio <= 0) continue;
      // 둥근 끝이 뭉개지지 않도록 최소 폭은 높이(=지름)만큼 확보한다.
      const width = Math.max(rect.h, rect.w * ratio);
      g.fillStyle(HEADER_GAUGE_COLORS[side], 1);
      g.fillRoundedRect(rect.x, rect.y + this.gaugeOffsetY, width, rect.h, rect.h / 2);
    }
  }

  /**
   * 한쪽 게이지를 이 점수에 맞춰 채운다 — 9회 만점(GAUGE_FULL_SCORE) 대비 비율.
   * 값이 툭 바뀌지 않고 짧게 차오르도록 트윈으로 이어 준다.
   */
  private setGaugeScore(side: 'player' | 'rival', score: number): void {
    if (!this.gauges) return;
    const target = Phaser.Math.Clamp(score / GAUGE_FULL_SCORE, 0, 1);
    this.tweens.add({
      targets: this.gaugeRatio,
      [side]: target,
      duration: GAUGE_TWEEN_MS,
      ease: 'Cubic.easeOut',
      onUpdate: () => this.drawGauges(),
    });
  }

  /** 로비로 나간다 — scene.start 가 이 씬을 종료시키므로 예약된 타이머·트윈은 함께 정리된다. */
  private goToLobby(): void {
    this.leavingToLobby = true;
    this.scene.start('lobby'); // 전용 UI 클릭음이 없어 소리는 내지 않는다(오발음보다 무음이 낫다).
  }

  /**
   * 경기 중 홈버튼 — 나가면 기권패라는 걸 알리고 한 번 더 확인받는다(사용자 요청: "홈화면으로
   * 이동하면 경기를 포기한 것이 되어 경기에서 패배합니다. 라는 형식의 문구"). 확인 전까지는
   * 경기가 그대로 진행되므로(타이머를 멈추지 않는다) 취소하면 하던 타석을 이어서 친다.
   */
  private showForfeitConfirm(): void {
    if (this.forfeitConfirm) return;
    const w = this.scale.width;
    const h = this.scale.height;

    const dim = this.add.rectangle(w / 2, h / 2, w, h, 0x06121f, 0.66).setInteractive(); // 뒤쪽 탭(스윙) 차단.
    const title = this.add
      .text(w / 2, h * 0.40, '경기를 포기할까요?', { fontFamily: FONT.family, fontSize: '64px', color: '#ffd147' })
      .setStroke('#0a2540', 10)
      .setOrigin(0.5);
    const body = this.add
      .text(w / 2, h * 0.48, '홈화면으로 이동하면\n경기를 포기한 것이 되어\n경기에서 패배합니다.', {
        fontFamily: FONT.family,
        fontSize: '40px',
        color: '#ffffff',
        align: 'center',
        lineSpacing: 12,
      })
      .setOrigin(0.5);

    const makeButton = (cx: number, label: string, fill: number, onPick: () => void): Phaser.GameObjects.GameObject[] => {
      const rect = this.add
        .rectangle(cx, h * 0.60, FORFEIT_BUTTON_W, HUD.buttonH, fill)
        .setStrokeStyle(4, 0xffffff, 0.9)
        .setInteractive({ useHandCursor: true });
      const text = this.add
        .text(cx, h * 0.60, label, { fontFamily: FONT.family, fontSize: '36px', color: '#ffffff' })
        .setOrigin(0.5);
      rect.once('pointerup', onPick);
      return [rect, text];
    };

    const parts: Phaser.GameObjects.GameObject[] = [dim, title, body];
    parts.push(...makeButton(w / 2 - FORFEIT_BUTTON_GAP, '계속하기', 0x37474f, () => this.closeForfeitConfirm()));
    parts.push(...makeButton(w / 2 + FORFEIT_BUTTON_GAP, '포기하기', 0xd7443e, () => this.forfeitToLobby()));

    for (const p of parts) this.hudLayer.add(p);
    this.forfeitConfirm = parts;
  }

  private closeForfeitConfirm(): void {
    for (const p of this.forfeitConfirm ?? []) p.destroy();
    this.forfeitConfirm = undefined;
  }

  /** 기권 확정 — 이 경기를 패배로 남기고 로비로. */
  private forfeitToLobby(): void {
    this.closeForfeitConfirm();
    this.state = 'over'; // 진행 중인 투구·판정이 더는 점수에 반영되지 않게 먼저 닫는다.
    this.goToLobby();
  }

  // ── 캐릭터 3동작 리그 (에디터 등록: 준비/액션/후) ────────────────────────

  /**
   * 캐릭터(타자/투수) 3동작 리그 생성 — 노드 위치·발밑 앵커·노드 높이 균일 스케일로 로드한다.
   * 모두 월드 레이어(배경과 함께 줌/팬). 투수는 레지스트리(_index.json) 이름 기반 해석,
   * 타자는 선택된 프리셋 기준 — resolvePlayNodeMotions 참조.
   * 액션 발동(triggerAction) 시점은 startPitch/throwPitch 가 키 프레임(컨택·릴리스)에 맞춰 스케줄한다.
   *
   * 타자에겐 프리셋 앵커를 폴백으로 넘긴다 — 클립 문서에 `meta.anchor` 가 없으면 프레임 중심이
   * 노드에 맞춰져 타격박스를 벗어나기 때문(activeBatterAnchor 주석 참조). 투수는 문서에 앵커가
   * 저작돼 있어 넘기지 않는다.
   */
  private buildCharacterRig(node: LayoutNode, viewMs: number): CharacterRig {
    const index = (this.cache.json.get(UI_SPRITE_INDEX_KEY) ?? null) as SpriteIndex | null;
    const files = resolvePlayNodeMotions(index, node);
    const isPitcher = isPitcherNode(node);
    const anchor = isPitcher ? undefined : activeBatterAnchor();
    // 준비 동작 감속도 타자에게만 — 투수 준비동작은 저작 속도 그대로 쓴다.
    const readySlow = isPitcher ? undefined : activeBatterReadySlow();
    return new CharacterRig(this, this.worldLayer, node, files, viewMs, anchor, readySlow);
  }

  // ── 투구 루프 ──────────────────────────────────────────────────────

  /** 투구 예고 — 랜덤 위치에 흰 반투명 존 출현, ZONE_PREVIEW_MS 뒤 투구. */
  private startPitch(): void {
    if (this.pitchIndex >= PITCHES_PER_GAME) {
      this.showGameOver();
      return;
    }
    this.pitchIndex += 1;
    this.sim = undefined;

    // 구종 선택(구질+구속) — 1구는 항상 직구(워밍업), 이후엔 가중치 랜덤 전체 풀에서.
    this.currentPitchType = pickPitchType(this.pitchIndex === 1);
    // 리그 티어가 전체 구속을 한 번 더 스케일(사용자 요청: "리그 티어레벨에 따라 큰 편차").
    this.currentPitchMs = Math.round(PITCH_MS * this.currentPitchType.speedMult * getLeagueTier().speedMult);

    this.updateHud();
    // 라이벌 회차 결과를 투수가 던지기 전에 먼저 표시(사용자 요청: "상대방이 먼저 점수가
    // 표시되고 플레이어가 친 점수가 표시된다" · "상대방의 점수는 투수 투구 전에 표시된다").
    // 전 라운드 종료 직후 곧바로가 아니라 1.5초 뒤에 나타난다(사용자 요청: "전 라운드 종료후
    // 1.5초 후에 라이벌 점수가 출현").
    this.time.delayedCall(1500, () => {
      if (this.state !== 'over') this.revealRivalRound();
    });

    // 타자 — 새 투구 시작 시 "타격준비" 반복(스윙은 throwPitch 에서 컨택 타이밍에 맞춰 발동).
    this.batterRig?.playReady();

    // 투수 — "준비동작" 반복 후, 투구동작의 릴리스 프레임이 공 릴리스(throwPitch=ZONE_PREVIEW_MS)와
    // 정확히 일치하도록 ZONE_PREVIEW_MS - PITCH_RELEASE_LEAD_MS 시점에 투구동작을 발동한다.
    this.pitcherRig?.playReady();
    this.time.delayedCall(Math.max(0, ZONE_PREVIEW_MS - PITCH_RELEASE_LEAD_MS), () => {
      if (this.state !== 'over') this.pitcherRig?.triggerAction();
    });

    // 인디케이터(반투명 큰 원) 중심 = 스트라이크존 컨택 지점 ± 소폭 편차.
    this.indicatorX = this.batContactX + Phaser.Math.FloatBetween(-ZONE_JITTER.x, ZONE_JITTER.x);
    this.indicatorY = this.batContactY + Phaser.Math.FloatBetween(-ZONE_JITTER.y, ZONE_JITTER.y);
    // 붉은 타격점 = 인디케이터 원 "안"의 랜덤 위치 (원 경계를 벗어나지 않게 반경 제한).
    const maxOff = ZONE_RADIUS - RED_DOT_R - 4;
    const offR = maxOff * Math.sqrt(Math.random());
    const offA = Math.random() * Math.PI * 2;
    this.zoneX = this.indicatorX + Math.cos(offA) * offR;
    this.zoneY = this.indicatorY + Math.sin(offA) * offR;

    // 인디케이터·타격점은 릴리스 0.2초 전에 등장, 투구는 ZONE_PREVIEW_MS 에 시작(예정).
    // scheduledThrowAt 기록 — 좌우 드래그의 0.5초 락아웃(CAMERA_DRAG_LOCKOUT_MS)이 이 시각을 기준으로 계산된다.
    this.scheduledThrowAt = this.time.now + ZONE_PREVIEW_MS;
    this.time.delayedCall(ZONE_PREVIEW_MS - INDICATOR_LEAD_MS, () => this.showIndicator());
    this.time.delayedCall(ZONE_PREVIEW_MS, () => this.attemptThrowPitch());
  }

  /** 타격 인디케이터 표시 — 반투명 큰 원(부유 모션) + 반투명 붉은 타격점. */
  private showIndicator(): void {
    if (this.state === 'over') return;
    this.cancelCameraDrag(false); // 투구 준비 시작 — 드래그 중이었다면 애니메이션으로 원점 복귀.
    this.tweens.killTweensOf(this.zoneFill);
    this.zoneFill
      .setPosition(this.indicatorX, this.indicatorY)
      .setVisible(true)
      .setAlpha(0)
      .setScale(1);
    this.tweens.add({ targets: this.zoneFill, alpha: 1, duration: 140 });
    // 둥둥 떠 있는 부유 모션 — 위아래 + 미세한 호흡 스케일.
    this.tweens.add({
      targets: this.zoneFill,
      y: this.indicatorY - 7,
      scale: 1.04,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    // 아직 "점" 크기로만 등장 — 실제 성장(→ RED_DOT_R, 존 중심으로 이동)은 throwPitch() 가
    // 타이밍 링 수축과 같은 지속시간·이징으로 함께 재생한다(둘이 같은 순간 같은 크기로 수렴).
    // 시작 위치부터 구종별 dotGrowOffset(직구=중심, 슬라이더/커브=옆·위)을 적용해야 throwPitch()
    // 시작 순간 위치가 갑자기 튀지 않는다.
    const growOffset = this.currentPitchType.dotGrowOffset ?? { x: 0, y: 0 };
    this.redDot
      .setPosition(this.zoneX + growOffset.x, this.zoneY + growOffset.y)
      .setVisible(true)
      .setScale(RED_DOT_START_SCALE)
      .setAlpha(0);
    this.tweens.add({ targets: this.redDot, alpha: 1, duration: 130 });
  }

  /**
   * throwPitch() 의 예약된 진입점 — 아직 드래그 중이면 투구를 미룬다(사용자 요청: "드래그하는
   * 도중에 공을 투구하지 않는다"). 화면이 눌린 채 멈추는 등의 예외로 드래그가 안 끝나도
   * WAIT_CAP_MS 이후엔 강제로 정리하고 진행 — 게임이 영원히 멈추지 않게 하는 안전망.
   */
  private attemptThrowPitch(waitedMs = 0): void {
    if (this.state === 'over') return;
    if (this.cameraDragActive && waitedMs < CAMERA_DRAG_THROW_WAIT_CAP_MS) {
      this.time.delayedCall(CAMERA_DRAG_THROW_POLL_MS, () => this.attemptThrowPitch(waitedMs + CAMERA_DRAG_THROW_POLL_MS));
      return;
    }
    this.throwPitch();
  }

  /** 150km/h 초고속 투구 — 마운드 릴리스(z=Z_MOUND)에서 원근 투영으로 정확히 접근. */
  private throwPitch(): void {
    if (this.state === 'over') return;
    this.cancelCameraDrag(true); // 최종 안전망 — 투구 시작 순간엔 반드시 원점(즉시, 트윈 없이).
    const w = this.scale.width;
    const h = this.scale.height;

    // 릴리스 지점 = 에디터 투수 노드의 손 높이(발밑 앵커 위로 노드 높이 비율) — 화면 좌표를 월드로 역투영.
    // 투수 노드가 없으면(미배포) 마운드 중앙 폴백.
    const releaseScreenX = this.pitcherNode?.x ?? w / 2;
    const releaseScreenY = (this.pitcherNode?.y ?? fieldY(h, 0.53)) - (this.pitcherNode?.h ?? 0) * PITCHER_HAND_Y_RATIO;
    const pMound = PROJ_FOCAL / (PROJ_FOCAL + Z_MOUND);
    const groundYMound = projectedGroundY(h, pMound);
    // 월드 좌표(타구 시뮬과 동일 법칙): z 등속 접근, 높이는 릴리스→존으로 중력 처짐.
    const relY3 = Math.max(0, (groundYMound - releaseScreenY) / pMound); // 릴리스 높이
    const relX3 = (releaseScreenX - w / 2) / pMound; // 릴리스 좌우 (손끝 오프셋)
    const zoneY3 = Math.max(0, fieldY(h, GROUND_PLATE_Y) - this.zoneY); // 존 높이
    const zoneX3 = this.zoneX - w / 2; // 존 좌우
    const pitchType = this.currentPitchType;
    const sag = FIELD_DESIGN_H * PITCH_SAG_H * pitchType.sagMult; // 디자인 고정 — 화면비로 구질 체감이 안 변하게

    // 투구 종착점 = 홈플레이트 꼭지점(존 통과 후 t=1~1.25 구간) — 미트 정중앙과 일치.
    const tEnd = PITCH_END_PROGRESS;
    const zEnd = Math.max(Z_MOUND * (1 - tEnd), -PROJ_FOCAL * 0.3);
    const pEnd = PROJ_FOCAL / (PROJ_FOCAL + zEnd);
    const groundYEnd = projectedGroundY(h, pEnd);
    const catchX3 = (this.plateApexX - w / 2) / pEnd;
    const catchY3 = Math.max(0, (groundYEnd - this.plateApexY) / pEnd);
    // 좌우 커브 — 구종별 폭(curveMagMin/Max)에서 매 투구 랜덤 부호·크기로 휘어 존에 들어온다.
    // 리그 티어의 breakMult 로 한 번 더 스케일(사용자 요청: "구질의 퀄리티에 따른 난이도").
    const curveMag =
      Phaser.Math.FloatBetween(pitchType.curveMagMin, pitchType.curveMagMax) *
      getLeagueTier().breakMult *
      (Math.random() < 0.5 ? -1 : 1);
    // 미트는 위치만 잡아두고 숨김 — 공이 "도착하는 순간"(catchBall)에만 잠깐 나타난다.
    const mittScale = MITT_DISPLAY_W / MITT_TEX_SIZE;
    this.tweens.killTweensOf(this.mitt);
    this.mitt
      .setScale(mittScale)
      .setPosition(this.plateApexX, this.plateApexY)
      .setVisible(false)
      .setAlpha(0);

    // 경로 함수 — 진행도 t 의 공 화면 좌표/스케일. onUpdate 와 컨택 정밀 정렬이 공유한다.
    // 구간 분리: 릴리스→존(t≤1, 커브+처짐) / 존→플레이트 꼭지점(t>1, 포구 진입).
    const ballPosAt = (t: number): { x: number; y: number; scale: number } => {
      const z = Math.max(Z_MOUND * (1 - t), -PROJ_FOCAL * 0.3); // t>1 = 존 통과(포수 쪽)
      const p = PROJ_FOCAL / (PROJ_FOCAL + z);
      const tc = Math.min(t, 1);
      let x3: number;
      let y3: number;
      if (t <= 1) {
        x3 = Phaser.Math.Linear(relX3, zoneX3, t) + curveMag * pitchType.shape(t);
        y3 = Phaser.Math.Linear(relY3, zoneY3, t) - sag * 4 * t * (1 - t);
      } else {
        const t2 = (t - 1) / (PITCH_END_PROGRESS - 1);
        x3 = Phaser.Math.Linear(zoneX3, catchX3, t2);
        y3 = Phaser.Math.Linear(zoneY3, catchY3, t2);
      }
      const groundY = projectedGroundY(h, p);
      return {
        x: w / 2 + x3 * p,
        y: groundY - y3 * p,
        // 원근 비례 + 릴리스 축소 램프 — 손끝에선 더 작게, 존 도달 시 정규 크기.
        scale: BALL_PLATE_SCALE * p * (BALL_RELEASE_SHRINK + (1 - BALL_RELEASE_SHRINK) * tc),
      };
    };
    this.pitchBallAt = ballPosAt;

    sfx('pitch');
    // 구종 색 티 — 은은한 시각적 구분(직구/체인지업은 흰색=무색이라 티가 안 남, 의도된 기만).
    this.ball.setTint(pitchType.tint);
    this.ball.setAlpha(1).setVisible(true);
    // 구종+구속 라벨(포수 미트 쪽) — 이번 투구 값으로 갱신 후 페이드인.
    // 표시 유지시간 — "더 오래 보이게" 요청으로 기존(≈판정 시점까지) 대비 3배: currentPitchMs×3.
    const kmh = Math.round(PITCH_SPEED_KMH_CONST / this.currentPitchMs);
    this.tweens.killTweensOf(this.pitchInfoText);
    this.pitchInfoHideEvent?.remove();
    this.pitchInfoText.setText(`${pitchType.label} ${kmh}km/h`).setAlpha(0);
    this.tweens.add({ targets: this.pitchInfoText, alpha: 1, duration: 180 });
    // 고속 구질(빠른 직구, speedMult<1)은 currentPitchMs 자체가 짧아 표시 유지시간(×3)도
    // 같이 짧아져 읽을 시간이 부족했다(사용자 요청: "고속 구질 표시를 조금 더 길게, +2초
    // 정도 길게 표시하라") — 그만큼 고정 시간을 더해 보정한다.
    const extraHoldMs = this.currentPitchType.speedMult < 1 ? 2000 : 0;
    // 전 구종 공통으로 추가 2초(사용자 재요청: "구속 구질 표시를 지금 보다 2초 더 표시하세요").
    const UNIVERSAL_EXTRA_HOLD_MS = 2000;
    this.pitchInfoHideEvent = this.time.delayedCall(
      this.currentPitchMs * 3 + extraHoldMs + UNIVERSAL_EXTRA_HOLD_MS,
      () => {
        this.tweens.add({ targets: this.pitchInfoText, alpha: 0, duration: 250 });
      },
    );
    // 투구 궤적 트레이서 초기화 — 공이 너무 밋밋하게 정지해 보인다는 피드백으로, 날아오는 공에도
    // 타구와 같은 혜성 꼬리(recordTracer)를 붙여 속도감을 준다.
    this.tracerPts = [];
    this.tracer.clear();
    this.tracer.setAlpha(1);
    this.tweens.killTweensOf(this.tracer);
    // t=1(존 통과 순간)에 배트 접점 쪽으로 당겨져 있던 화면 좌표 — t>1(헛스윙/루킹이 미트로
    // 흘러가는 구간)에서 이 "이어받은 지점"부터 자연 경로(pos)로 풀어준다(아래 onUpdate 참조).
    let handoffX: number | undefined;
    let handoffY: number | undefined;
    this.pitchTween = this.tweens.addCounter({
      from: 0,
      to: PITCH_END_PROGRESS,
      duration: this.currentPitchMs * PITCH_END_PROGRESS,
      ease: 'Linear',
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        const pos = ballPosAt(t);
        let x: number;
        let y: number;
        if (t <= 1) {
          // 막판(progress≥CONTACT_PULL_START)엔 배트 접점으로 서서히 당긴다 — 컨택 시 onContact()의
          // 스냅이 안 보이게. 히트/홈런은 onContact() 가 곧장 트윈을 멈추고 배트 접점으로 확정
          // 스냅하므로(이 트윈은 t>1 에 절대 안 감), 이 당김은 사실상 헛스윙/루킹으로 이어질
          // 투구에서도 "정타처럼 존 중앙에 수렴"하는 자연스러운 접근 연출로만 남는다.
          const pull = smoothstep01((t - CONTACT_PULL_START) / (1 - CONTACT_PULL_START));
          x = pull > 0 ? Phaser.Math.Linear(pos.x, this.batContactX, pull) : pos.x;
          y = pull > 0 ? Phaser.Math.Linear(pos.y, this.batContactY, pull) : pos.y;
          handoffX = x;
          handoffY = y;
        } else {
          // ⚠️ 예전엔 여기서도 배트 접점(batContactX/Y, 고정 좌표)으로 계속 당기다 서서히 풀었는데,
          // 배트 접점과 이번 투구의 존 좌표(zoneX/zoneY, 매 투구 랜덤 지터)가 서로 다른 지점이라
          // 공이 "배트 쪽으로 한 번 갔다가 미트 쪽으로 다시 꺾이는" 것처럼 보였다(사용자 보고:
          // "공이 하나 먼저 지나가고... 이중표시가 됩니다"). 고정 지점으로 계속 당기는 대신,
          // t=1 순간의 실제 화면 위치(handoffX/Y)에서 자연 경로(pos, 존→미트 직선)로만 풀어주면
          // 별도 목표 지점 없이 한 방향으로 부드럽게 이어져 두 번째 궤적처럼 안 보인다.
          const releaseSpan = (PITCH_END_PROGRESS - 1) * CONTACT_PULL_RELEASE_FRAC;
          const release = smoothstep01(Phaser.Math.Clamp((t - 1) / releaseSpan, 0, 1));
          const fromX = handoffX ?? pos.x;
          const fromY = handoffY ?? pos.y;
          x = release > 0 ? Phaser.Math.Linear(fromX, pos.x, release) : fromX;
          y = release > 0 ? Phaser.Math.Linear(fromY, pos.y, release) : fromY;
        }
        this.ball.setPosition(x, y).setScale(pos.scale);
        this.recordTracer();
      },
      onComplete: () => {
        this.onPitchPassed();
        this.catchBall();
      },
    });

    // 노란 타이밍 링 — 릴리스와 동시에 크게 시작, "붉은 원 크기까지" 수축 = 도달 순간 perfect.
    this.timingRing
      .setPosition(this.zoneX, this.zoneY)
      .setVisible(true)
      .setScale((ZONE_RADIUS * 1.6) / RED_DOT_R)
      .setAlpha(0.9);
    // 수축 이징을 구종별로 다르게(사용자 요청: "타격원이 구질·속도에 따라 게임성을 조절하는
    // 핵심 요소") — pitchType.ringEase 참조(각 구종 정의부 주석).
    this.tweens.add({ targets: this.timingRing, scale: 1, duration: this.currentPitchMs, ease: pitchType.ringEase });
    // 붉은 타격점도 "점"에서 같은 지속시간·이징으로 동시에 커진다 — 타이밍 링과 정확히 같은
    // 순간에 같은 크기(scale 1)로 수렴해야 도달 타이밍이 한눈에 보인다. 시작 위치(구종별
    // dotGrowOffset)는 showIndicator() 가 이미 잡아뒀다 — 여기선 존 중심으로 모이며 커지는
    // 트윈만 재생한다.
    this.tweens.add({
      targets: this.redDot,
      x: this.zoneX,
      y: this.zoneY,
      scale: 1,
      duration: this.currentPitchMs,
      ease: pitchType.ringEase,
    });

    this.state = 'pitch';
    this.pitchStartAt = this.time.now;

    // 타자 스윙은 더 이상 자동 발동하지 않는다(사용자 요청: 탭했을 때만 스윙) — onTap() 참조.

    // ── 공 도달 체크 ───────────────────────────────────────────────────
    // 유예까지 탭이 없으면(state='pitch' 유지) 루킹 처리.
    // 유예 안의 늦은 탭은 onTap 에서 헛스윙으로 처리된다.
    this.time.delayedCall(this.currentPitchMs + LATE_TAP_GRACE_MS, () => {
      if (this.state !== 'pitch') return;
      this.state = 'resolve';
      this.hideZone();
      // 공은 그대로 포수 미트까지 — 포구 연출(catchBall)이 미트와 함께 정리한다.
      this.applyOutcome(resolveTake());
      this.time.delayedCall(1000, () => this.nextPitch());
    });
  }

  /**
   * 포구 연출 — 스윙 없이/헛스윙으로 통과한 공이 포수 미트 포켓에 꽂힌다.
   * 미트가 공 위 50% 투명 레이어라 공이 미트 너머로 비치는 "포구" 장면이 된다.
   */
  private catchBall(): void {
    if (this.sim || !this.ball.visible) return;
    sfx('mittCatch');
    this.fadeTracer(); // 헛스윙/루킹으로 포수까지 흘러간 공의 투구 트레일을 정리한다.
    // 도착 순간에만 등장 — 살짝 크게 나타나 포켓 크기로 죄며 포구, 여운 후 공과 함께 퇴장.
    const baseScale = MITT_DISPLAY_W / MITT_TEX_SIZE;
    this.mitt.setVisible(true).setAlpha(0).setScale(baseScale * 1.08);
    // 최상단 레이어로(사용자 요청) — 타자 리그가 등장할 때마다 자기 자신을 월드 레이어 맨 위로
    // 올리므로(bringToTop), 미트도 보여줄 때마다 다시 맨 위로 올려야 뒤로 밀리지 않는다.
    this.worldLayer.bringToTop(this.mitt);
    this.tweens.add({
      targets: this.mitt,
      alpha: MITT_ALPHA,
      scaleX: baseScale,
      scaleY: baseScale,
      duration: 110,
      ease: 'Sine.easeOut',
    });
    this.tweens.add({ targets: [this.ball, this.mitt], alpha: 0, delay: 650, duration: 280 });
  }

  /**
   * 실제 터치 지점 마커 — 탭 순간 그 자리에 나타나 살짝 커지며 빠르게 사라진다.
   * 판정 성공(파울 이상, success=true)이면 초록, 헛스윙(success=false)이면 빨강 — 붉은 타격점과
   * 겹쳐 보이는 위치로 "내가 눌렀던 곳"과 "맞아야 했던 곳"을 바로 비교할 수 있다.
   */
  private showTapMarker(x: number, y: number, success: boolean): void {
    this.tweens.killTweensOf(this.tapMarker);
    this.tapMarker
      .setPosition(x, y)
      .setStrokeStyle(4, success ? TAP_MARKER_COLOR_HIT : TAP_MARKER_COLOR_MISS, 0.95)
      .setScale(0.5)
      .setAlpha(1)
      .setVisible(true);
    this.tweens.add({
      targets: this.tapMarker,
      scale: 1.6,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => this.tapMarker.setVisible(false),
    });
  }

  /**
   * 홈런 예감 슬로우모션 — 탭 순간 이미 홈런임을 알 수 있으므로(정확도 기반 판정), 컨택까지
   * 고정된 실시간(HR_ANTICIPATION_MS)에 걸쳐 공을 느리게 재생한다(스윙은 onTap() 이 같은 시간으로
   * 이미 트리거했다 — swingOnTap 참조).
   * ⚠️ 화면 좌표를 직선으로 잇는 트윈(x/y 보간)은 투구의 실제 곡선 궤적(커브·처짐·원근)을 무시해
   * 막판에 방향이 꺾여 보이는 부자연스러움을 만들었다 — 대신 기존 경로 함수(pitchBallAt)는
   * 그대로 두고 "진행도(progress)" 만 느리게 이징으로 진행시켜 정확히 같은 곡선 위를 따라가게 한다.
   */
  private startHomerunAnticipation(outcome: SwingOutcome): void {
    const pathFn = this.pitchBallAt;
    this.pitchTween?.stop();
    this.pitchTween = undefined;
    this.pitchBallAt = undefined; // onContact() 의 "exact" 재계산 대신 이 트윈이 최종 위치/스케일을 담당.
    if (!pathFn) {
      this.onContact(outcome); // 경로 함수가 없으면(방어적) 즉시 컨택으로 폴백.
      return;
    }
    // 탭이 늦어 공이 이미 배트 접점을 지나친 상태(진행도≥1, 포수 쪽으로 흘러가는 구간)라면
    // 접점으로 "거꾸로" 되돌리는 애니메이션을 재생하지 않는다(사용자 보고: "공이 이미 타점을
    // 통과했다가... 거꾸로 이동하여 슬로우모션으로 표현되는 연출을 방지하라" — 아래 직선 보간이
    // 시작점(현재 위치)에서 접점까지 잇는데, 진행도>1 이면 현재 위치가 접점보다 더 앞서(포수
    // 쪽으로) 가 있어 접점 쪽으로 보간하면 역방향으로 튄다). 이 경우 곧장 컨택 처리 —
    // onContact() 자체가 배트 접점으로 위치를 스냅한다(cleanContact).
    const progressNow = (this.time.now - this.pitchStartAt) / this.currentPitchMs;
    if (progressNow >= 1) {
      this.onContact(outcome);
      return;
    }
    // 스윙은 onTap() 이 이미 트리거했다(swingOnTap, targetMs=HR_ANTICIPATION_MS) — 여기선 공만 담당.
    // 공의 "지금" 화면 위치·스케일에서 배트 접점까지 직선으로, 등속(Linear)으로 보간한다(사용자
    // 재보고: "슬로우모션 처리되면서 공이 정지되지 않도록... 슬로우로 다가오는 연출로 이루어져야").
    // ⚠️ 예전엔 곡선(pathFn) 진행도 + 배트 접점 당김(pull)을 따로 섞었는데, 곡선이 t≈1 부근에서
    // 원근 투영상 화면 이동량이 작아지고 pull 도 ease-out(smoothstep)이라 뒤쪽 구간에서 두 감속이
    // 겹쳐 "거의 멈춘 것처럼" 보였다(HR_ANTICIPATION_MIN_T_SPAN 으로 시작 구간을 넓혀도 후반부
    // 감속 자체는 못 없앴다). 직선 등속 보간은 남은 거리가 짧아도 속도(px/ms)가 항상 일정해
    // 구조적으로 멈출 수 없다 — 거리가 짧으면 그만큼 덜 이동할 뿐, 감속하는 인상이 없다.
    const startX = this.ball.x;
    const startY = this.ball.y;
    const startScale = this.ball.scale;
    const endScale = pathFn(1).scale;
    // 슬로우모션 동안만 공을 회전 프레임으로 — 느려진 공이 도는 게 보여야 "슬로우"가 읽힌다.
    this.startBallSpin();
    const state = { t: 0 };
    this.tweens.add({
      targets: state,
      t: 1,
      duration: HR_ANTICIPATION_MS,
      ease: 'Linear',
      onUpdate: () => {
        const x = Phaser.Math.Linear(startX, this.batContactX, state.t);
        const y = Phaser.Math.Linear(startY, this.batContactY, state.t);
        // 회전 프레임은 기본 공보다 커서 보정 배율을 곱해야 겉보기 크기가 유지된다.
        this.ball.setPosition(x, y).setScale(Phaser.Math.Linear(startScale, endScale, state.t) * this.ballScaleComp);
        this.recordTracer();
      },
      onComplete: () => this.onContact(outcome),
    });
  }

  /**
   * 존·타격점 표시 제거 (투구 해소 시). 구종+구속 라벨은 여기서 안 지운다 —
   * 판정과 동시에 사라지면 읽을 시간이 부족하다는 요청으로 별도의 더 긴 타이머(throwPitch()
   * 의 pitchInfoHideEvent)로 관리한다.
   */
  private hideZone(): void {
    this.tweens.killTweensOf([this.zoneFill, this.timingRing, this.redDot]);
    this.zoneFill.setVisible(false);
    this.timingRing.setVisible(false);
    this.redDot.setVisible(false);
  }

  /** 공이 존 통과 완료 (PITCH_END_PROGRESS). 실제 처리는 PITCH_MS 타이머가 먼저 완료. 안전장치. */
  private onPitchPassed(): void {
    if (this.state !== 'pitch') return;
    this.state = 'resolve';
    this.hideZone();
    this.applyOutcome(resolveTake());
    this.time.delayedCall(1000, () => this.nextPitch());
  }

  private onTap(pointer: Phaser.Input.Pointer): void {
    if (this.state === 'ready') {
      // 공이 던져지기 전(타격 인디케이터 미리보기 단계)에 탭함 — 무효 탭이지만, 조용히 씹으면
      // "탭이 아예 안 먹힌다"로 오인하기 쉽다(사용자 보고). 최소한 "아직이야" 피드백은 보여준다.
      const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.showTapMarker(wp.x, wp.y, false);
      return;
    }
    if (this.state !== 'pitch') return;
    const progress = (this.time.now - this.pitchStartAt) / this.currentPitchMs;

    // 성공 조건 ① 붉은 타격점 터치(정확도 = 중심에 가까울수록 1 → 더 긴 타구)
    const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tapDist = Phaser.Math.Distance.Between(wp.x, wp.y, this.zoneX, this.zoneY);
    const touchRadius = RED_DOT_R * TOUCH_GRACE;
    // 성공 조건 ② 공이 도착 직전 구간 — 너무 이른 탭은 타격 실패, 공이 이미 타점(progress=1)을
    // 지나친 뒤의 탭도 헛스윙 처리한다(사용자 요청: "공이 타점을 지나갔는데 타격을 하였을 경우
    // 헛스위으로 처리할 것" — 예전엔 상한이 없어 타점을 한참 지나쳐도 여전히 정타 판정이 났다).
    const ballInZone = this.ball.visible && progress >= 1 - PITCH_TAP_WINDOW && progress <= 1;

    // 터치 좌우 오프셋 — 적색원 왼쪽 탭 = 당겨치기(좌익), 오른쪽 탭 = 밀어치기(우익).
    const lateral = Phaser.Math.Clamp((wp.x - this.zoneX) / touchRadius, -1, 1);
    const outcome: SwingOutcome =
      tapDist <= touchRadius && ballInZone
        ? resolveAccuracySwing(1 - tapDist / touchRadius, progress, lateral)
        : resolveWhiff();

    // 실제 터치 지점 표시 — 붉은 타격점과 비교해 "내가 얼마나 정확히 눌렀는지" 바로 확인 가능.
    this.showTapMarker(wp.x, wp.y, outcome.judgement !== 'miss');

    // 스윙 — 자동 발동 폐지, 탭한 이 순간에만 처음부터 재생한다(사용자 요청). 컨택 키프레임이
    // "공이 실제로 존에 도달하는 순간"(pitchStartAt+PITCH_MS, 홈런은 슬로우모션이 끝나는 순간)에
    // 정확히 오도록, 지금부터 남은 시간에 맞춰 재생 속도를 계산한다. 헛스윙도 같은 순간에
    // 스윙이 완결돼야 "그 타이밍에 놓쳤다"는 그림이 나온다.
    const timeToContact = Math.max(50, this.pitchStartAt + this.currentPitchMs - this.time.now);
    const swingTargetMs = outcome.result === 'homerun' ? HR_ANTICIPATION_MS : timeToContact;
    this.batterRig?.swingOnTap(this.swingLeads.startMs, this.swingLeads.contactMs, swingTargetMs);
    // ⚠️ 정타/파울/홈런은 스윙 사운드를 여기(탭 즉시)서 내지 않는다 — 탭은 컨택보다 훨씬 먼저
    // 일어날 수 있어(타이밍 메커닉상 미리 탭) 스윙음과 타격음 사이에 큰 공백이 생겼다(사용자
    // 보고: "순차적으로 나타납니다"). 대신 onContact() 에서 타격음과 함께(겹쳐서) 낸다 — 헛스윙만
    // 예외: 컨택 자체가 없어 onContact() 를 안 타므로 여기서 헛스윙음과 함께 즉시 낸다.

    this.state = 'resolve';
    this.hideZone();

    if (outcome.judgement === 'miss') {
      // 헛스윙 — 스윙은 계속 재생, 공은 그대로 포수까지.
      sfx('swing');
      sfx('whiff');
      this.applyOutcome(outcome);
      this.time.delayedCall(1200, () => this.nextPitch());
      return;
    }
    // 홈런 예감 — 탭 시점에 이미 정확도로 홈런 여부를 알 수 있으므로, 컨택 전 남은 접근 구간을
    // 전용 슬로우모션 트윈으로 재생한다(컨택도 그 트윈이 끝날 때 발동).
    if (outcome.result === 'homerun') {
      this.startHomerunAnticipation(outcome);
      return;
    }
    // 히트/파울 — 공이 실제로 존에 도달하는 순간(pitchStartAt + PITCH_MS)에 컨택.
    // 탭 시점에 관계없이 배트 임팩트 프레임과 공 도달 위치(적색원)가 항상 일치.
    this.time.delayedCall(timeToContact, () => this.onContact(outcome));
  }

  /**
   * 배트 임팩트 프레임에 호출 — 공이 날아오는 중 배트가 통과하는 순간.
   * 공을 zoneX/Y 로 스냅하지 않고 현재 위치를 그대로 컨택 포인트로 사용해
   * "배트가 공에 맞아 나가는" 자연스러운 연출을 만든다.
   */
  private onContact(outcome: SwingOutcome): void {
    const w = this.scale.width;
    const h = this.scale.height;
    // 피치 트윈 정지 — 공은 이 시점까지 자유 비행, 임팩트와 동시에 발사 시작.
    this.pitchTween?.stop();
    this.pitchTween = undefined;
    this.tweens.killTweensOf(this.ball);
    this.tweens.killTweensOf(this.timingRing);

    // ⚠️ 컨택 포인트 = "던져진 공"의 현재 시각 정확한 경로상 위치 — 새 공을 만들지 않는다.
    // 렌더 프레임 지연(저사양에서 프레임당 ~40px)을 경로 함수로 보정해
    // 이펙트가 항상 공의 실제 위치에서 터진다 (경로 위 전진이므로 순간이동 아님).
    const tNow = Phaser.Math.Clamp((this.time.now - this.pitchStartAt) / this.currentPitchMs, 0, PITCH_END_PROGRESS);
    const exact = this.pitchBallAt?.(tNow);
    // 안타·홈런(정타)은 배트와 정확히 맞아떨어져야 자연스럽다 — 컨택 지점(batContactX/Y)으로 강제 스냅.
    // 파울(빗맞음)은 실제 경로 위치를 그대로 써 "빗맞아서 어긋난" 느낌을 유지한다(사용자 요청: 정타만 강제 정렬).
    const cleanContact = outcome.result === 'homerun' || outcome.result === 'hit';
    // 회전 프레임을 쓰고 있었다면(홈런 슬로우모션) 여기서 정지 공으로 되돌린다 — 아래 setScale
    // 들이 보정 없는 값(exact.scale)을 그대로 쓰므로, 그 전에 텍스처·보정을 원상복구해야 한다.
    this.stopBallSpin();
    if (cleanContact) this.ball.setPosition(this.batContactX, this.batContactY).setScale(exact?.scale ?? this.ball.scale);
    else if (exact) this.ball.setPosition(exact.x, exact.y).setScale(exact.scale);
    this.pitchBallAt = undefined;
    // 스윙+히트를 같이, 컨택 프레임보다 살짝 늦게(IMPACT_SFX_DELAY_MS 주석 참조) — 둘이 겹쳐 들린다.
    // 콜백은 60ms 뒤 실행되므로 아래에서 계산되는 this.flightMeters(홈런 비거리)를 안전하게 참조
    // 할 수 있다 — 비거리·타격 세기가 클수록 히트 사운드도 커진다(사용자 요청).
    this.time.delayedCall(IMPACT_SFX_DELAY_MS, () => {
      sfx('swing');
      const hitIntensity = outcome.result === 'homerun' ? homerunSfxIntensity(this.flightMeters) : outcome.power;
      sfx('hit', hitIntensity);
      // 안타만 여기서 진동 — 파울은 무진동, 홈런은 applyOutcome() 에서 더 강한 패턴으로 따로 울린다.
      if (outcome.result === 'hit') vibrate(HIT_VIBRATION_MS);
    });
    const cx = this.ball.x;
    const cy = this.ball.y;
    // 타격 이펙트는 공 위치 기준(75%)에 배트 쪽으로 살짝 끌어당김(25%) —
    // 늦은/이른 탭으로 공·배트가 어긋나도 이펙트가 공에서 벗어나지 않는다.
    const fxX = cx * 0.75 + this.batContactX * 0.25;
    const fxY = cy * 0.75 + this.batContactY * 0.25;
    this.sparks.explode(12, fxX, fxY);

    // 미트 — 타격 성공 시 미등장 보장(예약된 표시 트윈 제거).
    this.tweens.killTweensOf(this.mitt);
    this.mitt.setVisible(false).setAlpha(0);

    // 컨택 지점 마스킹 플래시 — 공/배트 레이어 경계가 한 프레임 어긋나 보여도 가려지도록,
    // 정확한 컨택 지점(cx,cy — 정타는 배트 접점과 동일)에 아주 짧고 밝은 원반을 최상단에 깔았다 지운다.
    const maskFlash = this.add.circle(cx, cy, CONTACT_MASK_R, 0xffffff, 0.95);
    this.worldLayer.add(maskFlash);
    this.worldLayer.bringToTop(maskFlash);
    this.tweens.add({
      targets: maskFlash,
      scale: 1.8,
      alpha: 0,
      duration: 130,
      ease: 'Cubic.easeOut',
      onComplete: () => maskFlash.destroy(),
    });

    // 만화풍 임팩트(크게) — 스타버스트 팝 + 금색 확산 링.
    const burst = this.add
      .image(fxX, fxY, STARBURST_KEY)
      .setScale(0.8)
      .setAngle(Math.random() * 90)
      .setAlpha(0.95);
    const ring = this.add.circle(fxX, fxY, 22).setStrokeStyle(3, 0xffd147, 0.9);
    this.worldLayer.add([ring, burst]);
    // 타자 동작(월드 최상위)을 임팩트 위로 — 현재 표시 중인 동작 컨테이너를 올림.
    this.batterRig?.bringToTop();
    this.worldLayer.bringToTop(burst); // 임팩트는 타자 위에 보이도록
    this.tweens.add({
      targets: burst,
      scale: 2.6,
      angle: '+=35',
      alpha: 0,
      duration: 340,
      ease: 'Cubic.easeOut',
      onComplete: () => burst.destroy(),
    });
    this.tweens.add({
      targets: ring,
      scale: 2.4,
      alpha: 0,
      duration: 240,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });


    // 임팩트 펀치 — 셰이크 + 공 화이트 플래시. 공은 감속 없이 즉시 풀스피드로 발사.
    if (outcome.result === 'homerun' || outcome.result === 'hit') {
      this.cameras.main.shake(IMPACT_SHAKE_MS, IMPACT_SHAKE_INTENSITY);
      this.ball.setTintFill(0xffffff);
      this.time.delayedCall(IMPACT_FLASH_MS, () => this.ball.clearTint());
    }

    // 의사 3D 발사 — update() 가 매 프레임 중력/바운드/마찰 적분 후 원근 투영으로 그린다.
    // 공이 완전히 멈춰(점) 비행이 끝나야 onFlightDone() 이 카메라를 복귀시킨다.
    const launch = this.launchFor(outcome);
    this.flightHomerun = outcome.result === 'homerun';
    this.homerunTargetHit = false; // 홈런포인트 과녁 판정 — 매 타구 새로 시작.
    this.homerunTargetMultiplier = 1; // 배율도 매 타구 기본값(과녁 미적중)으로 리셋.
    this.homerunTargetNearShown = this.homerunTargets.map(() => false); // 근처 반응도 매 타구 새로.
    // 안타만 수비수 캐치 판정 대상 — 홈런은 담장을 넘어가 수비 불가, 파울은 수비 범위 밖 처리.
    this.flightCatchable = outcome.result === 'hit';
    this.flightHitPower = outcome.result === 'hit' ? outcome.power : 0;
    // 안타만 필드영역(에디터 폴리곤) 밖으로 못 나가게 제한 — 홈런은 애초에 담장을 넘어가야 하고,
    // 파울은 필드 밖(라인 밖)으로 흐르는 게 정상이라 대상에서 뺀다.
    this.flightFieldBound = outcome.result === 'hit';
    // 실제 궤적 추적 초기화 — 안타 구역 라벨(내야/외야)은 사전에 고른 발사 유형이 아니라
    // 실측 깊이(z)로 정한다. 수비 판정 라벨(땅볼/라이너/뜬공)은 지면 접촉 실측 + 발사 유형
    // (lastHitTrajectoryKind, launchFor 참조)을 함께 쓴다 — fielderOutLabel() 주석 참조.
    this.flightMaxZ = 0;
    this.flightFirstBounceZ = undefined;
    this.flightCatchFielderX = undefined;
    this.flightCatchGrounded = false;
    // 홈런 비거리(m) — 편차 확대(사용자 요청: "비거리 기준 승부" 연출에 쓸 것이라 격차가 뚜렷해야
    // 함) + 스타일별 범위(사용자 재보고: "궤적이 높게 떴는데 99m가 나온다" — 예전엔 비거리가
    // launchFor() 가 고른 스타일(라이너/표준/타워링)과 완전히 무관하게 독립적으로 뽑혀서, 높이
    // 솟는 타워링이 낮은 정확도를 뽑으면 라이너보다도 짧은 숫자가 나오는 모순이 있었다).
    // power(정확도)는 홈런 문턱(ACTIVE_HOMERUN_ACCURACY)~1.0 구간에만 몰려 있어 재정규화해서 쓴다.
    const normPower = Phaser.Math.Clamp(
      (outcome.power - ACTIVE_HOMERUN_ACCURACY) / (1 - ACTIVE_HOMERUN_ACCURACY),
      0,
      1,
    );
    // 스타일별 비거리 하한을 궤적 인상에 맞게 달리 둬 "높이 떴는데 짧다" 모순을 구조적으로 막는다.
    // ⚠️ standard/towering max 를 올렸다(사용자 재요청: "홈런시 높게 날라갈 경우 비거리를 더
    // 늘려라") — 예전 max(168/185)가 base+scale 만으로도 거의 다 차버려서, 아래 높이 보너스를
    // 늘려도 이 클램프에 막혀 실제로는 거의 반영되지 않았다. 여유를 둬야 보너스가 눈에 보인다.
    const METERS_BY_STYLE: Record<HomerunStyle, { base: number; scale: number; jitter: number; max: number }> = {
      liner: { base: 100, scale: 40, jitter: 10, max: 160 },
      standard: { base: 110, scale: 42, jitter: 12, max: 195 },
      towering: { base: 124, scale: 44, jitter: 14, max: 230 },
    };
    const mCfg = METERS_BY_STYLE[this.lastHomerunStyle];
    const monster = Math.random() < 0.12 ? Phaser.Math.Between(10, 20) : 0;
    // 타구가 높이 뜰수록 비거리도 늘어야 한다(사용자 요청: "타구가 높이 뜰 경우 비거리를
    // 늘려야 한다") — mCfg 는 스타일(라이너/표준/타워링)이라는 "카테고리"만 반영해, 같은
    // 스타일 안에서도(launch.vy 의 개별 편차로) 유독 높이 솟는 타구가 있을 수 있는데 그게
    // 비거리에 안 잡혔다. 실제 발사 수직 속도(launch.vy, 과녁 자석 보정 반영 후 = 실제 궤적
    // 그대로)를 전 스타일 범위(라이너 하단~타워링 상단) 기준으로 정규화해 추가 보너스로 더한다.
    const HEIGHT_VY_MIN = 1600;
    const HEIGHT_VY_MAX = 7400;
    const HEIGHT_BONUS_MAX = 35; // 20→35(사용자 재요청: "비거리를 더 늘려라") — mCfg.max 도 같이 올려 실제로 반영되게 했다.
    const heightRatio = Phaser.Math.Clamp(
      (Math.abs(launch.vy) - HEIGHT_VY_MIN) / (HEIGHT_VY_MAX - HEIGHT_VY_MIN),
      0,
      1,
    );
    this.flightMeters =
      outcome.result === 'homerun'
        ? Math.round(
            Phaser.Math.Clamp(
              mCfg.base +
                normPower * mCfg.scale +
                heightRatio * HEIGHT_BONUS_MAX +
                (Math.random() - 0.5) * mCfg.jitter * 2 +
                monster,
              mCfg.base - 4,
              mCfg.max,
            ),
          )
        : 0;
    this.tracerPts = [];
    this.tracer.clear();
    this.tracer.setAlpha(1);
    this.tweens.killTweensOf(this.tracer);
    this.sim = {
      t: 0,
      x3: cx - w / 2,
      y3: Math.max(0, fieldY(h, GROUND_PLATE_Y) - cy),
      z: 0,
      vx: launch.vx,
      vy: launch.vy,
      vz: launch.vz,
      restitution: launch.restitution,
      rollDecel: launch.rollDecel,
      maxT: launch.maxT,
      bounceDampX: launch.bounceDampX,
      bounceDampZ: launch.bounceDampZ,
      baseScale: this.ball.scale,
      grounded: false,
    };
    if (outcome.result === 'homerun') {
      // 컨택 직후 짧은 행타임 — HR_HANG_HOLD_MS 동안 붙잡았다 HR_HANG_RAMP_MS 에 걸쳐 정상 속도로 램프.
      this.slowMoScale = HR_HANG_SCALE;
      this.hangUntil = this.time.now + HR_HANG_HOLD_MS;
      this.hangRampEndAt = this.hangUntil + HR_HANG_RAMP_MS;
    }

    // 카메라 — 공을 실시간 추적(follow, lerp 로 한 박자 늦게)+줌. 비틀기(roll) 없음.
    // bounds 가 배경 이미지 범위로 설정돼 있어 배경 밖으로는 절대 나가지 않는다.
    this.time.delayedCall(CAM_FOLLOW_DELAY_MS, () => {
      this.cameras.main.startFollow(this.ball, false, CAM_FOLLOW_LERP, CAM_FOLLOW_LERP);
      this.cameras.main.zoomTo(HIT_ZOOM, 900, 'Sine.easeOut');
    });

    // 컨택 순간엔 일반 라벨("안타!")로 즉시 반응하고, 세부 야구 용어("내야안타!"/"외야안타!")는
    // 타구가 다 날아간 뒤 실제 궤적을 근거로 finishFlightReveal() 이 뒤집는다(정확한 궤적 기반 표시).
    // ⚠️ IMPACT_SFX_DELAY_MS 만큼 같이 지연 — 안 그러면 홈런 팡파레(sfx('homerun'), applyOutcome
    // 내부)가 스윙+히트보다 60ms 먼저 터져 "겹쳐 들려야" 할 임팩트 사운드 뭉치가 다시 어긋난다.
    this.time.delayedCall(IMPACT_SFX_DELAY_MS, () => this.applyOutcome(outcome));
  }

  /**
   * 결과별 발사 초기속도 — 실제 야구 타구 분류 기반.
   * 홈런=발사각 ~40° 대형 플라이(담장 너머, 첫 착지에서 정지),
   * 안타=직선타/뜬공/땅볼 무작위, 파울=측면 슬라이스.
   */
  /**
   * 발사 파라미터 — 야구 논리(우타자 기준):
   *  · 이른 스윙(타이밍 -) = 당겨치기 → 좌익수 방향, 타구질은 라이너/땅볼 성향(강하고 낮음).
   *  · 정타이밍(0) = 중견수 방향.
   *  · 늦은 스윙(+) = 밀어치기 → 우익수 방향, 뜬공 성향(높이 뜸).
   * 좌우는 pickAim() 이 결정 — dir(타이밍)은 아주 약한 확률 편향만 주고, 장기 평균은 50:50 에
   * 수렴한다. 비거리는 붉은 존 정확도(power).
   */
  /**
   * 좌우 조준 부호+크기를 분리해서 뽑는다. 부호(좌/우)는 "공정한 동전던지기에 dir 로 최대
   * ±biasCap 만큼만" 확률을 기울여 뽑으므로, 특정 플레이어의 타이밍 습관이 dir 을 한쪽으로
   * 계속 쏠리게 만들어도 장기 평균은 50:50 근처로 수렴한다(사용자 보고: "아직도 좌편향" —
   * 이전엔 dir 을 크기에 직접 곱해 클램프했더니 dir 이 조금만 쏠려도 부호가 사실상 고정됐다).
   * 크기(세기)는 dir 과 무관하게 [minMag,maxMag] 균등분포로 뽑아 방향 편향이 세기로 새지 않게 한다.
   */
  private pickAim(dir: number, minMag: number, maxMag: number, biasCap: number): number {
    const pRight = 0.5 + Phaser.Math.Clamp(dir, -1, 1) * biasCap;
    const sign = Math.random() < pRight ? 1 : -1;
    const mag = minMag + Math.random() * (maxMag - minMag);
    return sign * mag;
  }

  private launchFor(outcome: SwingOutcome): LaunchParams {
    const dir = outcome.directionX; // 타이밍 + 터치 좌우 오프셋 기반 (-1 좌 ~ +1 우)
    // 좌우 방향 — 부호(좌/우)와 크기(세기)를 분리한다: 부호는 pickAim() 이 "공정한 동전던지기에
    // dir 로 아주 약한 확률 편향만" 얹어 뽑으므로, 특정 플레이어의 타이밍 습관(예: 항상 살짝
    // 이르게 탭 = dir 이 늘 음수)이 있어도 장기 평균은 50:50 에 가깝게 수렴한다(사용자 보고:
    // "아직도 좌편향" — 이전엔 dir 을 크기에 직접 곱해 클램프했더니 dir 이 조금만 쏠려도 부호가
    // 사실상 고정돼 버렸다). 크기는 dir 과 무관하게 별도로 뽑아 방향 편향이 세기로 새지 않게 한다.
    const aim = this.pickAim(dir, 0.24, 1, 0.12);
    // 비거리 — 붉은 존 정확도(power 0~1)에 비례.
    const dist = 0.85 + 0.3 * outcome.power;
    // 궤적 다양화 — 같은 등급이라도 매번 ±10% 편차로 다른 포물선.
    const jitter = () => 0.9 + Math.random() * 0.2;
    switch (outcome.result) {
      case 'homerun': {
        // 홈런 3스타일 — 뚜렷하게 다른 궤적으로 연출 다양화(사용자 요청: "높게 뜨는 경우도,
        // 라이너성으로 뻗는 경우도" 있어야 함). dist·jitter 를 vy·vz 양쪽에 곱해 발사각은
        // 유지한 채 세기만 스케일한다(vz 만 곱하면 각도가 낮아진다).
        //  · 라이너(30%, ≈7°): 낮고 빠르게 — 뜬 느낌 없이 순식간에 담장을 넘어간다.
        //  · 표준(55%, ≈17°): 기존 홈런 궤적과 비슷한 무난한 포물선 — 가장 흔한 기본값.
        //  · 타워링(15%, ≈29°): 높이 솟아 체공시간이 눈에 띄게 길다 — 시원한 대포알 홈런.
        // ⚠️ 30/45/25→30/55/15 로 재조정 — 타워링 비중이 30%면 "너무 높은 궤적이 많이
        // 발생한다"는 보고가 있었다. 각도도 32°→29°로 살짝 낮춰 과함을 조금 눌렀다.
        // 장외 평면(Z_STANDS=30000, 펜스의 4.3배)에 닿는 순간 정지(직격/낙하 연출)하므로,
        // 셋 다 vz 를 그 거리를 감당할 만큼 남겨 뒀다(라이너=가장 빠르게, 타워링=가장 느리게 도달).
        const styleDef = pickHomerunStyle(); // 과녁 위치 산출(sampleHomerunLandingPoint)과 같은 분포 공유.
        const { vy, vz } = styleDef;
        this.lastHomerunStyle = styleDef.style;
        const boost = dist * jitter();
        // 좌우 홈런 전용 조준 — pickAim() 과 같은 이유로 부호는 공정한 동전던지기+약한 dir 편향,
        // 크기만 별도로 뽑는다(0.32~1.0, 이전 데드존 최소치 0.3과 비슷하게 정면 홈런은 드물게).
        const hrAim = this.pickAim(dir, 0.32, 1, 0.15);
        const naturalVx = hrAim * 4600;
        const naturalVy = vy * boost;
        const finalVz = vz * boost * (1 - 0.3 * Math.abs(hrAim));
        // 홈런포인트 과녁 자석 — 자연 착지점이 과녁 근처면 그쪽으로 살짝 끌어당긴다(사용자 요청,
        // applyHomerunTargetMagnet() 주석 참조). vz 는 착지 시점 계산 기준이라 그대로 둔다.
        const pulled = applyHomerunTargetMagnet(naturalVx, naturalVy, finalVz, this.homerunTargets);
        return {
          vx: pulled.vx,
          vy: pulled.vy,
          vz: finalVz,
          restitution: HOMERUN_RESTITUTION,
          rollDecel: HOMERUN_ROLL_DECEL,
          maxT: 9,
          bounceDampX: BOUNCE_DAMP_XZ,
          bounceDampZ: BOUNCE_DAMP_XZ,
        };
      }
      case 'hit': {
        // 안타 3종 — 대부분 외야(수비수가 선 z≈3700~7000)까지 날아가 바운드·구름으로 마무리,
        // 일부는 짧은 내야안타. 파워(정확도)로 비거리 스케일 → 낮으면 내야, 높으면 담장 근처.
        // 타이밍(당김/밀어침)으로 타구질 비중 조절: 당김=라이너·땅볼↑, 밀어침=플라이↑.
        const pull = dir < -0.3;
        const oppo = dir > 0.3;
        const linerP = pull ? 0.46 : oppo ? 0.22 : 0.36; // 외야 라이너
        const infieldP = pull ? 0.3 : oppo ? 0.2 : 0.26; // 내야안타(짧은 타구)  (나머지 = 외야 플라이)
        const r = Math.random();
        // 비거리 계수 — 내야안타(≈z1600~2700)~외야 깊숙이(≈z6800). power 0.3~0.84 → reach 1.01~1.31.
        const reach = 0.85 + 0.55 * outcome.power;
        // ① 외야 라이너 — 낮고 강하게, 외야 잔디에 낮게 떨어져 크게 튀며 담장 쪽으로 굴러간다.
        if (r < linerP) {
          this.lastHitTrajectoryKind = 'liner'; // 수비 판정 라벨용(fielderOutLabel 참조).
          return {
            vx: aim * 3200,
            vy: 1250 * jitter(),
            vz: 5400 * reach * jitter(),
            restitution: 0.5,
            rollDecel: 300,
            maxT: SIM_MAX_T,
            bounceDampX: BOUNCE_DAMP_XZ,
            bounceDampZ: BOUNCE_DAMP_XZ,
          };
        }
        // ② 내야안타 — 살짝 뜬 빗맞은 타구, 내야에 떨어져 통통 튀며 내야~얕은 외야에 멈춘다(짧은 안타).
        if (r < linerP + infieldP) {
          this.lastHitTrajectoryKind = 'grounder'; // 수비 판정 라벨용 — 짧은 통통-튀는 타구는 땅볼 취급.
          return {
            vx: aim * 2600,
            vy: 1150 * jitter(),
            vz: 2100 * reach * jitter(),
            restitution: 0.55,
            rollDecel: 460,
            maxT: SIM_MAX_T,
            bounceDampX: BOUNCE_DAMP_XZ,
            bounceDampZ: BOUNCE_DAMP_XZ,
          };
        }
        // ③ 외야 플라이 — 시원한 높은 포물선, 외야에 낙하 후 담장 방향으로 굴러간다(원거리 심도↑).
        this.lastHitTrajectoryKind = 'fly';
        return {
          vx: aim * 2500,
          vy: 2500 * jitter(),
          vz: 2900 * reach * jitter(),
          restitution: 0.42,
          rollDecel: 320,
          maxT: SIM_MAX_T,
          bounceDampX: BOUNCE_DAMP_XZ,
          bounceDampZ: BOUNCE_DAMP_XZ,
        };
      }
      default: // 파울 — 빗맞은 쪽 라인 밖으로 휘어 끝까지 흐른다.
        return {
          vx: (dir >= 0 ? 1 : -1) * 1600,
          vy: 1400,
          vz: 800,
          restitution: 0.5,
          rollDecel: ROLL_DECEL_SLOW,
          maxT: SIM_MAX_T_LONG,
          bounceDampX: BOUNCE_DAMP_XZ,
          bounceDampZ: BOUNCE_DAMP_XZ,
        };
    }
  }

  /** 매 프레임 타구 물리 적분 + 원근 투영 — 공이 멈출 때까지(점) 끝까지 추적. */
  update(_time: number, deltaMs: number): void {
    // 배트가 공보다 항상 위(앞)에 보여야 한다 — 매 프레임 보정한다(사용자 보고: 트리거 시점의
    // 1회성 bringToTop 만으로는 순서가 다시 어긋나는 사례가 있었음). moveAboveInLayer 는 "공보다
    // 위"만 보장하고 레이어 절대 최상단으로 올리진 않아, 컨택 임팩트(burst/ring)가 이미 최상단으로
    // 쌓아둔 순서는 건드리지 않는다. 이미 올바른 순서면 아무 것도 안 바뀌는 저렴한 호출이다.
    this.batterRig?.moveAboveInLayer(this.ball);

    const sim = this.sim;
    if (!sim) return;
    // 홈런 컨택 직후 행타임 — HR_HANG_HOLD_MS 동안 HR_HANG_SCALE 유지, 이후 HR_HANG_RAMP_MS 동안
    // 정상 속도(1)로 선형 램프. onContact() 가 hangUntil/hangRampEndAt 을 설정해 시작한다.
    if (this.slowMoScale !== 1) {
      const now = this.time.now;
      if (now >= this.hangRampEndAt) this.slowMoScale = 1;
      else if (now >= this.hangUntil) {
        const t = (now - this.hangUntil) / (this.hangRampEndAt - this.hangUntil);
        this.slowMoScale = Phaser.Math.Linear(HR_HANG_SCALE, 1, t);
      }
    }
    const dt = (Math.min(deltaMs, 50) / 1000) * this.slowMoScale;
    sim.t += dt;
    const zPrev = sim.z;
    sim.vy -= GRAVITY * dt;
    sim.x3 += sim.vx * dt;
    sim.y3 += sim.vy * dt;
    sim.z += sim.vz * dt;
    this.flightMaxZ = Math.max(this.flightMaxZ, sim.z); // 실제 궤적 최고 깊이(안타/수비 라벨 기준).

    // 홈런포인트 과녁 적중 판정 — 비행 내내 매 프레임 3D 거리로 검사(평면을 스쳐 지나가도 걸리게).
    // 홈런 3스타일은 궤적의 높이·깊이가 크게 달라 한 순간의 평면 통과만 보면 특정 스타일만
    // 잡히는 궤적을 놓친다(위 HomerunTargetDef/pickHomerunTargets 주석 참조).
    // ⚠️ 예전엔 homerunTargetHit 이 true 가 되는 순간(=바깥 링에 "처음" 걸리는 순간) 이 블록
    // 전체를 건너뛰어 이후 더 가까워져도 재평가가 없었다 — 공은 계속 착지지점(과녁 중심)으로
    // 다가가는 중인데 "처음 걸린" 바깥 링(1.5배)에서 그대로 굳어버렸다(사용자 재보고: "동심원
    // 점수획득이 아직 정확하지 않습니다. 타구의 도달점을 정확히 평가하여"). 비행이 끝날 때까지
    // 계속 재평가해 더 가까운(=배율이 큰) 값이 나오면 갱신한다 — "도달점"(가장 가까이 다가간
    // 지점) 기준으로 최종 배율이 정해진다. 팝업/스파크(flashHomerunTarget)는 처음 걸릴 때 한
    // 번만 재생한다(매 프레임 다시 터지면 산만하다).
    if (this.flightHomerun) {
      for (let i = 0; i < this.homerunTargets.length; i++) {
        const target = this.homerunTargets[i];
        const view = this.homerunTargetViews[i];
        // 링은 화면에서 좌우로 squishX 만큼 찌그러진 타원으로 그려지는데(buildHomerunTargets
        // 참조), 공의 화면 투영은 그 찌그러짐을 안 받는다 — 순수 3D 거리로만 판정하면 "화면에
        // 보이는 링 안"과 "실제 판정"이 어긋난다(사용자 요청: "타점에 대한 점수배정이 정확하게
        // 매칭되도록 하라"). x3 델타를 squishX 로 나눠 화면상 찌그러진 정도를 판정에도 반영한다.
        const squishX = this.homerunTargetSquishX[i] ?? 1;
        const dx3 = (sim.x3 - target.x3) / squishX;
        const d = Math.hypot(dx3, sim.y3 - target.y3, sim.z - target.z);
        if (d <= target.visualR * HOMERUN_TARGET_HIT_R_RATIO) {
          const mult =
            d <= target.visualR * HOMERUN_TARGET_RING_INNER_RATIO
              ? HOMERUN_TARGET_RING_MULT_INNER
              : d <= target.visualR * HOMERUN_TARGET_RING_MID_RATIO
                ? HOMERUN_TARGET_RING_MULT_MID
                : HOMERUN_TARGET_RING_MULT_OUTER;
          if (!this.homerunTargetHit) {
            this.homerunTargetHit = true;
            if (view) this.flashHomerunTarget(view, mult);
          }
          // 더 가까워져(=배율이 커져) 재평가될 때만 갱신 — 착지 직전 잠깐 멀어지는 프레임이 있어도
          // 이미 확보한 더 좋은 배율을 잃지 않는다.
          if (mult > this.homerunTargetMultiplier) this.homerunTargetMultiplier = mult;
          break;
        } else if (d <= target.visualR * HOMERUN_TARGET_NEAR_R_RATIO && !this.homerunTargetNearShown[i]) {
          // 근처를 스침 — 점수는 없이 가벼운 반응만(사용자 요청: "근처에 공이 떨어질때 반응하는 연출").
          this.homerunTargetNearShown[i] = true;
          if (view) this.pulseHomerunTargetNear(target, view);
        }
      }
    }

    // 되돌아온 공이 홈 쪽 경계를 넘지 않게 클램프.
    if (sim.z <= 0 && sim.vz < 0) {
      sim.z = 0;
      sim.vz = 0;
    }

    // 장외 구역 충돌 — ① 공중으로 전광판 평면(Z_STANDS)을 통과하는 순간 높이로 직격 판정,
    // ② 평면을 넘어간 공이 하강해 전광판 상단 아래로 내려오면 관중석 "착탄"(떨어지는 홈런).
    let standsHit: 'crowd' | 'board' | undefined;
    const directHit =
      zPrev < Z_STANDS && sim.z >= Z_STANDS && sim.vz > 0 &&
      sim.y3 >= STANDS_CROWD_MIN_Y3 && sim.y3 < STANDS_TOP_Y3;
    const fallingOnto = sim.z >= Z_STANDS && sim.vy < 0 && sim.y3 > 0 && sim.y3 < STANDS_TOP_Y3;
    if (directHit || fallingOnto) {
      standsHit = sim.y3 >= STANDS_BOARD_MIN_Y3 ? 'board' : 'crowd';
      sim.vx = 0;
      sim.vy = 0;
      sim.vz = 0;
    }

    // 착지 — 반발 바운드(체감) 또는 구름(롤) 전환. 담장 너머(restitution 0)는 그 자리 정지.
    if (sim.y3 <= 0 && sim.vy < 0) {
      sim.y3 = 0;
      sim.grounded = true; // 한 번이라도 지면에 닿음 — 이후 수비수가 잡으면 "땅볼"로 실측 판정.
      // 첫 낙구 지점만 기록(그 이후 바운드·구름은 무시) — 내야/외야안타 판정 기준(위 필드 주석 참조).
      if (this.flightFirstBounceZ === undefined) this.flightFirstBounceZ = sim.z;
      if (sim.restitution === 0) {
        sim.vx = 0;
        sim.vy = 0;
        sim.vz = 0;
      } else if (-sim.vy > MIN_BOUNCE_VY) {
        sim.vy = -sim.vy * sim.restitution;
        sim.vx *= sim.bounceDampX;
        sim.vz *= sim.bounceDampZ;
      } else {
        sim.vy = 0;
      }
    }
    // 구름 마찰 감속 — 타구 유형별 (내야 낙구·파울은 느리게 = 오래 흐름).
    if (sim.y3 === 0 && sim.vy === 0) {
      const speed = Math.hypot(sim.vx, sim.vz);
      const ratio = speed > 0 ? Math.max(0, speed - sim.rollDecel * dt) / speed : 0;
      sim.vx *= ratio;
      sim.vz *= ratio;
    }

    // 원근 투영 — 크기·좌우·높이 전부 p 배, 지면선은 플레이트→펜스 밑단으로 수렴.
    // 외야 심도 확장(outfieldProjectedZ) — 내야는 그대로, 외야 구간만 화면상 늘여 더 깊어 보이게.
    const w = this.scale.width;
    const h = this.scale.height;
    const p = PROJ_FOCAL / (PROJ_FOCAL + outfieldProjectedZ(Math.max(0, sim.z)));
    const groundY = projectedGroundY(h, p);
    this.ball.setPosition(w / 2 + sim.x3 * p, groundY - sim.y3 * p);
    this.ball.setScale(Math.max(0.03, sim.baseScale * Math.pow(p, BALL_SIZE_EXP)));
    this.recordTracer();

    // 공-수비수 앞뒤 렌더 순서 — 공의 현재 깊이(지면 투영 Y, groundY)와 각 수비수의 화면 Y(고정,
    // 그들이 선 깊이를 나타냄)를 매 프레임 비교한다. 이 게임은 "화면 아래(Y 큼)=카메라에 더
    // 가까움" 규칙이라, 공보다 가까운(Y 큰) 수비수는 공 위로, 공보다 먼(Y 작거나 같은) 수비수는
    // 공 아래로 보낸다 — "수비수 뒤로 날아가는 공이 수비수 앞에 그려지지 않도록"(사용자 요청).
    // moveAbove 는 대상이 같은 컨테이너 자식이 아니면 예외를 던지는 Phaser 특성이 있어(다른 곳에서
    // 실측) try/catch 로 감싼다 — 렌더 순서 보정 실패가 게임 루프를 멈추면 안 된다.
    for (const imgF of this.fielderImages) {
      try {
        if (imgF.y > groundY) this.worldLayer.moveAbove(imgF, this.ball);
        else this.worldLayer.moveAbove(this.ball, imgF);
      } catch {
        /* 무시 — 다음 프레임에 재시도됨. */
      }
    }

    // 수비수 자석 — "구르는 중"에만 적용한다(사용자 요청: "자석기능은 기본적인 궤적을
    // 유지하되, 수비수 근처에서 볼이 구를경우에만 자석기능을 적용"). 공중일 땐 원래 발사
    // 궤적을 그대로 유지 — launchFor() 가 고른 포물선을 자석이 건드리지 않는다.
    const isRolling = this.flightCatchable && sim.y3 === 0 && sim.vy === 0;
    if (isRolling) {
      let nearestF: { x: number; y: number } | undefined;
      let nearestD = FIELDER_MAGNET_RANGE;
      for (const f of this.fielderSpots) {
        const d = Phaser.Math.Distance.Between(this.ball.x, this.ball.y, f.x, f.y);
        if (d < nearestD) {
          nearestD = d;
          nearestF = f;
        }
      }
      if (nearestF) {
        if (nearestD <= FIELDER_CATCH_R) {
          // 수비수에게 가까이 다가가면 흡수되어 사라진다(사용자 요청: "볼이 수비수에게
          // 가까이할 경우 수비수에게 흡수되고 사라지게 만들라") — 자연스럽게 더 굴러가다 먼
          // 곳에서 멎는 대신, 여기서 즉시 축소+페이드로 흡수하고 결과를 확정한다.
          this.flightCatchable = false;
          this.flightCaught = true;
          this.flightCatchFielderX = nearestF.x;
          this.flightCatchGrounded = true;
          this.sim = undefined;
          this.tweens.add({ targets: this.ball, scale: 0, alpha: 0, duration: 220, ease: 'Cubic.easeIn' });
          this.finishFlightReveal();
          this.fadeTracer();
          this.onFlightDone();
          return;
        }
        // 아직 인력 범위 안 — 수비수 쪽으로 서서히 끌려간다. 수비수 화면 x 를 지금 공의 깊이(p)
        // 기준 월드 x3 로 역투영해, sim.x3 를 매 프레임 그 쪽으로 조금씩 당긴다.
        const fielderX3 = (nearestF.x - w / 2) / p;
        const pullT = FIELDER_MAGNET_STRENGTH * (1 - nearestD / FIELDER_MAGNET_RANGE) * Math.min(dt * 60, 2);
        sim.x3 = Phaser.Math.Linear(sim.x3, fielderX3, Phaser.Math.Clamp(pullT, 0, 1));
      }
    }

    // 필드영역(에디터 zone 폴리곤, 내야~외야 펜스까지) 경계 — 실제 펜스 판정을 전담한다.
    // 이전엔 평평한 Z_FENCE(깊이값 하나)로 반발시켰는데, 좌우 테이퍼를 무시해 엉뚱한 지점에서
    // 튕기거나 역주행하는 원인이었다(사용자 보고).
    // ⚠️ 폴리곤은 "지면(고도 0) 기준 평면도"다(사용자 지적) — 공의 실제 화면 위치(this.ball.x/y,
    // 고도 sim.y3 반영)로 비교하면 공이 높이 떠 있을 때 화면 Y 가 위로 밀려 올라가(원근 특성)
    // 아직 필드 안쪽 깊이인데도 폴리곤 밖으로 잘못 벗어난 것처럼 판정된다. 대신 "지금 이 깊이·
    // 좌우 위치에서 공이 지면에 있다면 어디일지"(고도 0 투영, groundX/groundY)를 폴리곤과
    // 비교해 심도(깊이)만으로 안팎을 가린다 — 공이 아무리 높이 솟아도 오직 깊이·좌우 위치만 본다.
    // 밖으로 나가면 매 프레임 좌우/깊이 속도를 감쇠만 시킨다(반발 없음) — 타격 방향으로 나아가려는
    // 관성을 유지한 채 서서히 멎어, "가능한 타격 방향으로 계속 진행"하는 그림이 된다(사용자 요청).
    // 홈런은 flightFieldBound=false 라 제외(담장을 넘어가야 함).
    if (this.flightFieldBound && this.fieldAreaPoints.length >= 3) {
      const groundX = w / 2 + sim.x3 * p;
      if (!pointInPolygon(groundX, groundY, this.fieldAreaPoints)) {
        sim.vx *= FIELD_BOUNDARY_DAMP;
        sim.vz *= FIELD_BOUNDARY_DAMP;
      }
    }

    // 수비수 캐치/포구 판정 — 여기선 "확정"만 해둔다. 표시는 비행이 자연스럽게 끝날 때까지
    // 미룬다(finishFlightReveal) — 공이 날아가 떨어지는 연출을 다 보여준 뒤 결과를 뒤집어야
    // 자연스럽다(사용자 피드백: 판정이 너무 빨리 나와 어색함).
    if (this.flightCatchable) {
      // 범위 내 첫 매치가 아니라 "가장 가까운" 수비수를 잡은 것으로 판정 — 여러 수비수가 동시에
      // 범위에 걸릴 때 배열 순서가 아니라 실제 거리로 정확히 가린다(사용자 요청: 더 정확한 분석).
      let caughtBy: { x: number; y: number } | undefined;
      let bestDist = FIELDER_CATCH_R;
      for (const f of this.fielderSpots) {
        const d = Phaser.Math.Distance.Between(this.ball.x, this.ball.y, f.x, f.y);
        if (d <= bestDist) {
          bestDist = d;
          caughtBy = f;
        }
      }
      if (caughtBy) {
        this.flightCatchable = false; // 한 번만 판정
        this.flightCaught = true;
        this.flightCatchFielderX = caughtBy.x; // 포지션(좌익수/중견수/우익수) 추정용.
        this.flightCatchGrounded = sim.grounded; // 이미 지면에 닿았는지 — 땅볼 구분용(실측).
      }
    }

    // 장외 직격/착탄 연출 — 부딪힌 지점에서 스파크 + 셰이크, 전광판이면 더 크게 + 관중 환호.
    if (standsHit) {
      this.sim = undefined;
      sfx('crash');
      this.sparks.explode(standsHit === 'board' ? 16 : 9, this.ball.x, this.ball.y);
      this.cameras.main.shake(140, standsHit === 'board' ? 0.006 : 0.004);
      if (standsHit === 'board') this.cheerCrowd(3, 12);
      this.tweens.add({ targets: this.ball, alpha: 0, duration: 450, delay: 250 });
      this.finishFlightReveal();
      this.fadeTracer();
      this.onFlightDone();
      return;
    }

    const stopped = sim.y3 === 0 && sim.vy === 0 && Math.hypot(sim.vx, sim.vz) < 30;
    const offside = Math.abs(this.ball.x - w / 2) > w * 1.5;
    if (stopped || offside || sim.t > sim.maxT) {
      this.sim = undefined;

      this.finishFlightReveal();
      this.fadeTracer();
      this.onFlightDone();
    }
  }

  /**
   * 궤적 포인트 기록 + 라인 렌더 — 머리 쪽일수록 진하고, 굵기는 그 지점의 공 크기 비례.
   * 5px 이상 이동 시에만 기록(데시메이션), 최대 300포인트로 비용 상한.
   */
  private recordTracer(): void {
    const pts = this.tracerPts;
    const last = pts[pts.length - 1];
    if (!last || Phaser.Math.Distance.Between(last.x, last.y, this.ball.x, this.ball.y) > 5) {
      pts.push({ x: this.ball.x, y: this.ball.y, s: this.ball.scale });
      if (pts.length > 300) pts.shift();
    }
    const g = this.tracer;
    g.clear();
    if (pts.length < 2) return;
    for (let i = 1; i < pts.length; i++) {
      const head = i / pts.length; // 0(꼬리)~1(머리)
      const core = Math.max(TRACER_MIN_W, TRACER_CORE_MULT * pts[i].s);
      // ① 넓고 옅은 글로우 — 혜성 꼬리의 번짐. 먼저 깔아 코어가 위에 얹히게 한다.
      g.lineStyle(core * TRACER_GLOW_MULT, 0xffe89a, 0.08 + 0.26 * head);
      g.beginPath();
      g.moveTo(pts[i - 1].x, pts[i - 1].y);
      g.lineTo(pts[i].x, pts[i].y);
      g.strokePath();
      // ② 밝은 코어 — 머리 쪽일수록 굵고 진하게.
      g.lineStyle(core, 0xfffdf2, 0.14 + 0.5 * head);
      g.beginPath();
      g.moveTo(pts[i - 1].x, pts[i - 1].y);
      g.lineTo(pts[i].x, pts[i].y);
      g.strokePath();
    }
  }

  /** 비행 종료 시 궤적을 여운 있게 지운다. */
  private fadeTracer(): void {
    this.tweens.add({
      targets: this.tracer,
      alpha: 0,
      duration: 700,
      delay: 250,
      onComplete: () => {
        this.tracer.clear();
        this.tracerPts = [];
      },
    });
  }

  /**
   * 비행 종료 시 결과 표시 분기 — 수비 캐치가 확정됐으면 그 결과를, 안 잡힌 안타면 실제 궤적
   * 기반 세부 라벨을, 그 외(홈런)엔 비거리를 보여준다.
   * flightCatchable 이 아직 true 라는 건 "안타였는데 끝까지 안 잡혔다"는 뜻이다 — 'hit' 결과에서만
   * true 로 시작하고, 잡히면 즉시 false 로 내려가므로 여기 도달했을 때 true 로 남아있으면 안타 미포구.
   */
  private finishFlightReveal(): void {
    if (this.flightCaught) {
      this.flightCaught = false;
      this.revealFielderCatch();
    } else if (this.flightCatchable) {
      this.flightCatchable = false;
      this.revealHitResult();
    } else {
      this.showDistance();
    }
  }

  /**
   * 안타(수비수 근처로 날아가지 않아 캐치가 안 걸린) 결과 표시 — 첫 낙구 지점(flightFirstBounceZ)
   * 기준으로 "내야안타!"/"외야안타!"를 뒤집는다(flightMaxZ 가 아님 — 위 필드 주석 참조: 구르는
   * 거리까지 반영하면 짧은 내야안타가 외야안타로 오판된다). 수비수 캐치 판정(거리 기반, update()
   * 참조)에서 한 번도 안 걸렸다는 뜻이므로 확률로 다시 아웃 처리하지 않는다(사용자 요청: 수비수
   * 근처에 날아가지 않았으면 안타로 처리). 아웃 여부는 오직 실제 캐치(거리) 판정으로만 정한다.
   */
  private revealHitResult(): void {
    // 낙구 구역이 지금 확정됐다 — logic/scoring.ts 로 최종 점수를 매기고 스코어보드 칸을 채운다
    // (applyOutcome() 은 'hit' 결과일 때 점수를 더하지 않고 여기까지 미뤄둔다).
    const zone = hitZoneFromDepth(this.flightFirstBounceZ ?? this.flightMaxZ);
    const finalScore = hitScore(this.flightHitPower, zone, ACCURACY_TIERS.hit, ACTIVE_HOMERUN_ACCURACY);
    this.score += finalScore;
    this.recordPitchScore(finalScore, SCOREBOARD_RESULT_LABEL.hit);
    const label = hitResultLabel(zone);
    sfx('safe'); // 안타 징글 — 컨택이 아니라 낙구 확정 시(단일 판정 지점, applyOutcome 주석 참조).
    swellCrowd();
    this.tweens.killTweensOf(this.resultText);
    this.resultText.setText(label).setColor(RESULT_TEXT_COLOR).setAlpha(0).setScale(0.6);
    this.tweens.add({
      targets: this.resultText,
      alpha: 1,
      scale: 1,
      duration: 220,
      ease: 'Back.easeOut',
      yoyo: true,
      hold: 700,
    });
  }

  /**
   * 수비수 캐치/포구 결과 표시 — 공이 다 날아가 떨어질 때까지 지켜본 뒤(자연스러운 비행 연출 유지)
   * "안타!" 라벨을 "수비 성공!" 으로 덮어쓴다. applyOutcome() 은 'hit' 결과의 점수를 미리 더하지
   * 않으므로(revealHitResult() 참조), 잡힌 타구는 여기서 이 회차 점수를 0(아웃)으로 확정한다.
   */
  private revealFielderCatch(): void {
    sfx('catch');
    this.sparks.explode(10, this.ball.x, this.ball.y);
    this.cameras.main.shake(80, 0.003);

    this.recordPitchScore(0, 'OUT');

    // "수비 성공!" 같은 포괄 표현 대신, 실제 궤적(지면 접촉 여부)+발사 유형+포지션의 야구 용어로 표시.
    const label = fielderOutLabel(this.flightCatchGrounded, this.lastHitTrajectoryKind, this.flightCatchFielderX, this.batContactX);
    this.tweens.killTweensOf(this.resultText);
    this.resultText
      .setText(label)
      .setColor(RESULT_TEXT_COLOR)
      .setAlpha(0)
      .setScale(0.6);
    this.tweens.add({
      targets: this.resultText,
      alpha: 1,
      scale: 1,
      duration: 220,
      ease: 'Back.easeOut',
      yoyo: true,
      hold: 700,
    });
  }

  /**
   * 홈런 비거리 표시 + 회차 점수 확정 — 컨택 시 정확도+발사 스타일(라이너 96~155m·표준
   * 106~168m·타워링 120~185m)로 산출한 비거리를 먼저 보여준 다음, 그 직후에 점수를 총점·
   * 스코어보드에 반영한다(사용자 요청: "홈런점수가 실제 비거리가 표시된 후 점수를 표시하세요").
   * 점수 = 비거리 × 과녁 링 배율(homerunTargetMultiplier, 과녁 미적중이면 1 — scoring.ts 참조).
   */
  private showDistance(): void {
    if (!this.flightHomerun) return;
    this.flightHomerun = false;
    const finalScore = homerunScore(this.flightMeters, this.homerunTargetMultiplier);
    this.score += finalScore;
    this.recordPitchScore(finalScore, SCOREBOARD_RESULT_LABEL.homerun, {
      meters: this.flightMeters,
      ringMult: this.homerunTargetMultiplier,
    });
    this.resultText
      .setText(`비거리 ${this.flightMeters}m`)
      .setColor(RESULT_TEXT_COLOR)
      .setAlpha(0)
      .setScale(0.7);
    this.tweens.add({
      targets: this.resultText,
      alpha: 1,
      scale: 1,
      duration: 220,
      ease: 'Back.easeOut',
      yoyo: true,
      hold: 900,
    });
  }

  /** 비행 종료 — 짧은 여운 후 카메라 복귀, 다음 투구. */
  private onFlightDone(): void {
    if (this.state !== 'resolve') return;
    const w = this.scale.width;
    const h = this.scale.height;
    this.time.delayedCall(450, () => {
      this.cameras.main.stopFollow();
      this.cameras.main.pan(w / 2, h / 2, CAM_RESET_MS, 'Sine.easeInOut', true);
      // force=true 필수 — 타구가 빨리 끝나면(짧은 내야 아웃·수비 캐치 등) 타격 시 시작한
      // 900ms 줌인 이펙트가 아직 실행 중일 수 있고, Phaser 는 force 없이는 겹치는 zoomTo 를
      // 조용히 무시한다(공식 동작) — 그러면 줌아웃이 씹혀 카메라가 확대된 채로 다음 투구가 진행된다.
      this.cameras.main.zoomTo(1, CAM_RESET_MS, 'Sine.easeInOut', true);
      this.time.delayedCall(CAM_RESET_MS + 50, () => this.nextPitch());
    });
  }

  /** 관중 환호 — 스탠드 곳곳에서 컨페티 분출. waves 만큼 반복(홈런=크게). */
  private cheerCrowd(waves: number, perSpot: number): void {
    const w = this.scale.width;
    const h = this.scale.height;
    for (let wave = 0; wave < waves; wave++) {
      this.time.delayedCall(wave * 340, () => {
        for (const [xr, yr] of CHEER_SPOTS) {
          this.confetti.explode(perSpot, w * xr, h * yr);
        }
      });
    }
  }

  /**
   * 이번 회차(this.pitchIndex, 1-base)의 최종 점수를 확정 — 총점에 더하고 스코어보드에 한 줄
   * 추가한다("1R HR 125" 형식). 파울/스트라이크는 applyOutcome() 이 즉시 호출하고, 안타는 낙구
   * 구역이 확정된 뒤 revealHitResult()/revealFielderCatch() 가, 홈런은 비거리가 확정·표시된
   * 뒤 showDistance() 가 호출한다(사용자 요청: "홈런점수가 실제 비거리가 표시된 후 점수를
   * 표시하세요" — logic/scoring.ts 참조).
   */
  /**
   * @param detail 홈런일 때의 비거리·링 배율. 트로피 판정(장타·퍼펙트 계열)이 이 값을 본다 —
   *   점수만으로는 "230m 를 퍼펙트로 쳤는지"와 "짧은 타구를 여러 번 쳤는지"를 구분할 수 없다.
   */
  private recordPitchScore(finalScore: number, label: string, detail?: { meters: number; ringMult: number }): void {
    this.scoreboard.showRound(this.pitchIndex, label, finalScore);
    this.updateHud();
    // 이번 판을 상대 후보로 남기기 위해 회차별 결과를 모아 둔다(경기 종료 시 저장).
    // ⚠️ meters/ringMult 는 고스트 기록(rival.ts)에는 불필요하지만 같이 실려도 무해하다
    //    (isRecord 검증은 outcome/score 만 본다). 트로피 판정용으로 이 배열을 그대로 재사용한다.
    this.myRounds.push({
      outcome: SCOREBOARD_LABEL_TO_OUTCOME[label] ?? 'strike',
      score: finalScore,
      ...(detail ? { meters: detail.meters, ringMult: detail.ringMult } : {}),
    });
  }

  /**
   * 라이벌(가상 상대) 이번 회차 결과 확정 — startPitch() 가 투수 투구 스케줄을 잡기 전에
   * 곧바로 호출해 플레이어보다 먼저 보여준다. create() 가 판 시작 시 미리 시뮬레이션해 둔
   * "이전 경기" 기록(rivalHistoricalRounds)에서 이번 회차 순서에 맞는 항목을 그대로 꺼내
   * 보여준다 — 지금 플레이 중인 내 회차 실적을 그때그때 참조하지 않는다(사용자 요청: "라이벌의
   * 라운드 데이터 표시를 내 경기데이터의 전라운드 데이터로 하지 말고 전 경기 데이터를 쓸것").
   */
  private revealRivalRound(): void {
    const entry = this.rivalHistoricalRounds[this.pitchIndex - 1];
    if (!entry) return; // 방어적 — 정상 흐름에선 항상 존재(PITCHES_PER_GAME 만큼 미리 채움).
    this.rivalScore += entry.score;
    if (entry.outcome === 'homerun') this.rivalHomeruns += 1;
    this.rivalScoreboard.showRound(this.pitchIndex, entry.label, entry.score);
    this.rivalTotalText?.setText(formatScore(this.rivalScore));
    this.setGaugeScore('rival', this.rivalScore);
  }

  /** 점수 반영 + 결과 라벨 연출 + 결과별 효과음 (HUD 카메라 — 줌과 무관하게 고정). */
  /** labelOverride — 야구 용어 세부 표기(예: "외야안타!")로 outcome.label 을 대신할 때 쓴다. */
  private applyOutcome(outcome: SwingOutcome, labelOverride?: string): void {
    if (outcome.result !== 'homerun' && outcome.result !== 'hit') {
      // 안타는 낙구 구역(내야/외야)이 확정돼야, 홈런은 비거리가 확정·표시돼야 점수가 나온다 —
      // 각각 revealHitResult()/showDistance() 로 위임.
      this.score += outcome.score;
      this.recordPitchScore(outcome.score, SCOREBOARD_RESULT_LABEL[outcome.result]);
    }
    if (outcome.result === 'homerun') this.homeruns += 1;
    if (outcome.result === 'homerun') {
      this.cheerCrowd(7, 14);
      // 관중/기본 홈런음은 원래 타이밍대로 즉시(사용자 요청: "관중사운드 타이밍은 그대로 유지") —
      // 아나운서 강조음(아케이드 샘플)만 지연시키는 건 audio.ts 의 homerun 플레이어가 담당한다.
      sfx('homerun', homerunSfxIntensity(this.flightMeters));
      sfx('cheer');
      swellCrowd(); // 관중 앰비언스 처음부터 재생 + 볼륨 스웰(사용자 요청).
      vibrate(HOMERUN_VIBRATION_PATTERN); // 히트보다 강하게(사용자 요청: "홈런 진동은 좀 강하게").
    } else if (outcome.result === 'hit') {
      // 컨택 순간엔 가벼운 함성만 — "안타!" 판정 라벨·안타 징글(safe)은 낙구가 확정된 뒤
      // revealHitResult()/revealFielderCatch() 가 딱 한 번 낸다(사용자 요청: "안타나 아웃일 경우
      // 타격 후 판정, 공이 떨어지고 판정 등 두번 판정이 일어납니다. 공이 떨어진 후 판정으로
      // 통일하세요" — 예전엔 컨택에서 '안타!' 를 먼저 띄우고 낙구에서 '외야안타!'/'수비 성공!' 을
      // 또 띄워 판정이 두 번으로 보였고, 잡히면 안타 징글 뒤에 아웃이 떠 어색했다).
      this.cheerCrowd(2, 8);
    } else if (outcome.result === 'foul') {
      sfx('foul');
    } else if (outcome.judgement === 'miss' && outcome.label === '스트라이크') {
      sfx('strike'); // 루킹 — 헛스윙은 onTap 에서 whiff 재생
    }
    this.updateHud();

    // 안타는 여기서 라벨을 띄우지 않는다 — 낙구 확정 시(revealHitResult/revealFielderCatch) 1회.
    if (outcome.result === 'hit' && !labelOverride) return;

    this.resultText
      .setText(labelOverride ?? outcome.label)
      .setColor(RESULT_TEXT_COLOR)
      .setAlpha(0)
      .setScale(0.6);
    this.tweens.add({
      targets: this.resultText,
      alpha: 1,
      scale: 1,
      duration: 240,
      ease: 'Back.easeOut',
      yoyo: true,
      hold: 700,
    });
  }

  private nextPitch(): void {
    if (this.state === 'over') return;
    this.ball.setVisible(false);
    this.state = 'ready';
    this.time.delayedCall(400, () => this.startPitch());
  }

  private updateHud(): void {
    // 헤더 트로피 총점만 갱신(최종 라운드 줄은 recordPitchScore() 가 개별 확정).
    this.playerTotalText?.setText(formatScore(this.score));
    this.setGaugeScore('player', this.score);
  }

  // ── 경기 종료 ──────────────────────────────────────────────────────

  private showGameOver(): void {
    this.state = 'over';
    sfx('over');
    // 끝까지 친 경기만 다음 사람의 상대 후보로 남긴다(기권·중도 이탈은 회차가 모자라 저장 안 됨).
    saveRecord(this.myRounds, Date.now()); // 씬 시간이 아니라 실제 시각 — 기록 정렬에 쓰인다.
    const w = this.scale.width;
    const h = this.scale.height;

    // 방어적 정리 — 잔여 시뮬/타이머/트윈 제거 + 카메라 즉시 원점 복귀.
    this.sim = undefined;
    this.time.removeAllEvents();
    this.tweens.killAll();
    // 캐릭터 리그를 준비동작으로 복귀 — removeAllEvents 가 액션→후 전환 타이머를 취소해
    // 액션 포즈로 굳는 것을 방지(게임오버 오버레이 아래 정지 포즈 방지).
    this.batterRig?.playReady();
    this.pitcherRig?.playReady();
    this.cameras.main.stopFollow();
    this.cameras.main.setZoom(1);
    this.cameras.main.centerOn(w / 2, h / 2);

    // 승패무 + 코인 보상(사용자 요청: "게임내 재화 설계") — 이겼을 때만 리그 reward(입장료×1.5)를
    // 지급한다. 입장료는 이미 로비 startGame() 에서 차감됐으므로, 여기서는 "이긴 만큼만 더" 준다
    // (지면/비기면 입장료를 그대로 잃는 위험/보상 구조 — league.ts 의 entryFee/reward 표를 실물로
    // 완성). 동점(무승부)은 승리가 아니므로 보상 없음 — 화면 배지만 별도 표기한다(사용자 요청:
    // "승리 패배 무승부의 아이콘 표시").
    const tier = getLeagueTier();
    const outcome: GameOutcome = this.score > this.rivalScore ? 'win' : this.score < this.rivalScore ? 'lose' : 'draw';
    if (outcome === 'win') addCoins(tier.reward);

    // 트로피 판정 — 리그 승급의 유일한 조건(logic/trophies.ts). 연승을 **먼저** 갱신해야
    // 이번 경기 승리가 연승 조건에 반영된다(3연승 트로피는 이긴 그 판에서 떠야 한다).
    const winStreak = applyMatchToStreak(outcome === 'win');
    const newTrophyIds = grantTrophies(
      tier.id,
      evaluateTrophies(
        tier.id,
        {
          won: outcome === 'win',
          score: this.score,
          rivalScore: this.rivalScore,
          rounds: this.myRounds,
          winStreak,
        },
        getEarnedTrophies(tier.id),
      ),
    );

    // 배경 딤 + 에디터 결과화면(overlay 컨테이너 자체에 높은 depth 를 줘 hudLayer 의 다른
    // 자식(스코어보드 등, depth 0~수십)과 무관하게 항상 맨 위에 뜬다 — 내부 노드들의 z 는
    // blank_2.json 이 저작한 상대 순서(1~21)를 그대로 쓴다).
    const overlay = this.add.container(0, 0).setDepth(5000);
    this.hudLayer.add(overlay);
    const dim = this.add.rectangle(w / 2, h / 2, w, h, 0x06121f, 0.66).setInteractive();
    overlay.add(dim);
    this.buildTrophyPanel(overlay, w, h, tier.id, newTrophyIds);

    const doc = (this.cache.json.get(UI_RESULT_LAYOUT_KEY) ?? null) as LayoutDoc | null;
    if (doc) this.buildResultScreen(overlay, doc, tier, outcome);
    else this.buildResultScreenFallback(overlay, w, h, tier, outcome);
  }

  /**
   * 결과화면(에디터 SSOT `ui/layouts/blank_2.json`) — 노드 id 는 `.pue-harness/screens/blank_2.md`
   * 기준(사용자 요청: "결과화면 디자인을 에디터에 저장 — 이 화면을 분석하고 구현, 리워드 광고 및
   * 리그경기비용과 결합"). 라벨(내팀/상대팀/VS/SCORE/HOMERUNS/버튼 문구)은 에디터가 저작한 정적
   * 텍스트 그대로 두고, 실제 값이 필요한 6개 노드만 갈아 끼운다.
   */
  private buildResultScreen(overlay: Phaser.GameObjects.Container, doc: LayoutDoc, tier: LeagueTierDef, outcome: GameOutcome): void {
    const layout = buildLayout(this, doc);
    overlay.add(layout.entries().map((e) => e.obj));

    layout.tryById<Phaser.GameObjects.Text>('layer_3_copy2')?.setText(String(this.homeruns)); // 내팀 홈런
    layout.tryById<Phaser.GameObjects.Text>('layer_3_copy3')?.setText(String(this.rivalHomeruns)); // 상대팀 홈런
    layout.tryById<Phaser.GameObjects.Text>('layer_3_copy9')?.setText(formatScore(this.score)); // 내팀 점수
    layout.tryById<Phaser.GameObjects.Text>('layer_3_copy10')?.setText(formatScore(this.rivalScore)); // 상대팀 점수
    layout.tryById<Phaser.GameObjects.Text>('layer_5_copy3')?.setText(formatLeagueNumber(tier.entryFee)); // 포인트 버튼 금액
    layout.tryById<Phaser.GameObjects.Text>('layer_5_copy4')?.setText(`${MOCK_AD_SECONDS}초`); // 광고 버튼 예상 시청시간

    // 승/패/무 배지 — layer_2 는 에디터에 "승리"(up_Homerun_UI_14-1)로 저작돼 있고, 패배·무승부는
    // 디자이너가 같은 세트로 내려준 14-2/14-3 텍스처로 갈아 끼운다(사용자 요청: "승리 패배 무승부의
    // 아이콘 표시" — Homerun_UI_14-1~3 적용). 세 텍스처 모두 173~175×78 로 거의 동일 비율이라
    // displaySize 재계산 없이 텍스처만 바꿔도 눈에 띄는 크기 차이가 없다.
    const badge = layout.tryById<Phaser.GameObjects.Image>('layer_2');
    if (badge && outcome !== 'win') {
      badge.setTexture(outcome === 'lose' ? RESULT_BADGE_LOSE_KEY : RESULT_BADGE_DRAW_KEY);
    }

    const adBtn = layout.tryById<Phaser.GameObjects.Image>('layer_4'); // 광고보고 경기하기
    const coinBtn = layout.tryById<Phaser.GameObjects.Image>('layer_4_copy'); // 포인트로 경기하기
    const lobbyBtn = layout.tryById<Phaser.GameObjects.Image>('layer_4_copy2'); // 로비로 나가기
    const buttons = [adBtn, coinBtn, lobbyBtn].filter((b): b is Phaser.GameObjects.Image => !!b);
    // 광고 요청~응답 사이(네트워크 지연)에 다른 버튼을 눌러 코인 차감/재시작이 겹치지 않도록,
    // 광고 진행 중엔 세 버튼 모두 잠근다(실광고는 전면이라 어차피 배경 탭이 막히지만, 실 광고가
    // 뜨기 전 대기 구간은 이 화면이 그대로 보여 눌릴 수 있다).
    const setButtonsEnabled = (enabled: boolean): void => {
      for (const b of buttons) if (enabled) b.setInteractive({ useHandCursor: true }); else b.disableInteractive();
    };
    setButtonsEnabled(true);

    adBtn?.once('pointerdown', () => {
      setButtonsEnabled(false);
      // 광고 시청만으로 무료 재도전(사용자 결정 결합: 리워드 광고 + 리그경기비용) — 입장료를
      // 받지도, 코인을 주지도 않는다. 순수 대체 경로.
      playRewardedAd(this, {
        onReward: () => this.scene.restart(),
        onUnavailable: () => {
          showToast('광고를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
          setButtonsEnabled(true);
        },
      });
    });
    coinBtn?.once('pointerdown', () => {
      // 코인 재도전(사용자 결정: "PvP 재도전 티켓" — 리그 카드의 입장료 자체가 재도전 게이트).
      if (!canAfford(tier.entryFee)) {
        showToast(`코인이 부족합니다 (필요 ${formatLeagueNumber(tier.entryFee)}) — 로비로 이동합니다`);
        this.goToLobby();
        return;
      }
      spendCoins(tier.entryFee);
      this.scene.restart();
    });
    lobbyBtn?.once('pointerdown', () => this.goToLobby());
  }

  /**
   * 결과화면 트로피 표시 — 이번에 딴 트로피와 이 리그의 진행도·남은 조건을 알려준다.
   *
   * **왜 "남은 조건"까지 보여주는가**: 트로피는 승리만으로 나오지 않는다(예: 클럽리그는 삼진 없이
   * 이겨야 한다). 이겼는데 아무것도 안 뜨면 "왜 안 오르지?"가 되고, 이게 가장 나쁜 이탈 사유다.
   * 그래서 못 딴 경우엔 **다음에 뭘 하면 되는지**를 한 줄이라도 띄운다.
   *
   * ⚠️ 지금은 좌표를 코드로 잡은 임시 배치다(사용자: "UI는 나중에 정리하겠습니다").
   *    트로피 이미지도 추후 제공 예정이라 아이콘 없이 이름·조건 텍스트만 쓴다.
   *    에디터(blank_2.json)에 트로피 영역이 생기면 그 노드로 옮긴다.
   */
  private buildTrophyPanel(
    overlay: Phaser.GameObjects.Container,
    w: number,
    h: number,
    tierId: number,
    newIds: ReadonlyArray<string>,
  ): void {
    const all = trophiesOf(tierId);
    if (all.length === 0) return;
    const earned = getEarnedTrophies(tierId);
    const top = h * 0.72; // 결과 패널(에디터) 아래 빈 영역 — 임시 위치.

    const line = (y: number, text: string, color: string, size: number): Phaser.GameObjects.Text =>
      this.add.text(w / 2, y, text, { fontFamily: FONT.family, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5);

    overlay.add(line(top, `트로피  ${earned.length} / ${all.length}`, '#ffd147', 30));

    if (newIds.length > 0) {
      // 이번에 딴 것 — 여러 개면 전부 보여준다("3개 한꺼번에"가 보상 순간이다).
      const names = newIds.map((id) => trophyById(tierId, id)?.name ?? id).join(' · ');
      overlay.add(line(top + 44, `트로피 획득!  ${names}`, '#57ff29', 30));
      return;
    }

    // 못 땄으면 아직 남은 조건 중 하나를 힌트로 — 전부 나열하면 결과화면이 설명서가 된다.
    const next = all.find((t) => !earned.includes(t.id));
    if (next) overlay.add(line(top + 44, `다음 트로피 · ${next.name} — ${next.desc}`, '#c9d6e2', 24));
    else overlay.add(line(top + 44, '이 리그 트로피를 모두 모았습니다 — 상위 리그가 열렸어요!', '#57ff29', 24));
  }

  /** blank_2.json 로드 실패 시의 안전망 — 이전 하드코딩 UI(사용자에게 보여줄 화면이 아예 없는 것보다는 낫다). */
  private buildResultScreenFallback(overlay: Phaser.GameObjects.Container, w: number, h: number, tier: LeagueTierDef, outcome: GameOutcome): void {
    const resultLabel = outcome === 'win' ? '승리!' : outcome === 'draw' ? '무승부' : '패배';
    const coinLine = outcome === 'win' ? `+${formatLeagueNumber(tier.reward)} 코인 획득` : '보상 없음';
    const title = this.add
      .text(w / 2, h * 0.34, `경기 종료 — ${resultLabel}`, {
        fontFamily: FONT.family,
        fontSize: '58px',
        color: outcome === 'win' ? '#ffd147' : outcome === 'draw' ? '#cfd8dc' : '#ff8a80',
      })
      .setStroke('#0a2540', 10)
      .setOrigin(0.5);
    const summary = this.add
      .text(
        w / 2,
        h * 0.46,
        `SCORE ${this.score} vs ${this.rivalScore}\n홈런 ${this.homeruns}개 · ${coinLine}\n보유 코인 ${formatLeagueNumber(getCoins())}`,
        { fontFamily: FONT.family, fontSize: '34px', color: '#ffffff', align: 'center' },
      )
      .setOrigin(0.5);
    const button = this.add
      .rectangle(w / 2, h * 0.6, HUD.buttonW, HUD.buttonH, 0x1e88e5)
      .setStrokeStyle(4, 0xffffff, 0.9)
      .setInteractive({ useHandCursor: true });
    const buttonLabel = this.add.text(w / 2, h * 0.6, '다시하기', { fontFamily: FONT.family, fontSize: '36px', color: '#ffffff' }).setOrigin(0.5);
    button.once('pointerdown', () => {
      if (!canAfford(tier.entryFee)) {
        showToast(`코인이 부족합니다 (필요 ${formatLeagueNumber(tier.entryFee)}) — 로비로 이동합니다`);
        this.goToLobby();
        return;
      }
      spendCoins(tier.entryFee);
      this.scene.restart();
    });
    overlay.add([title, summary, button, buttonLabel]);
  }
}
