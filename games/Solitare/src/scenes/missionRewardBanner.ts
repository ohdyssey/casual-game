import { texSize } from '../assets.js';
/**
 * missionRewardBanner.ts — 홈/플레이 **공용 미션 리워드 배너**(연속 플레이 별 수집, 2026-07-18).
 *
 * 디자이너가 에디터(main.json)에 저작한 "리워드" 배지(up_Rewards_01_v2 트랙 + up_Rewards_03 타이틀
 * 리본 + up_Rewards_02 아이콘 원판(좌우 대칭) + up_Item_01_01-4 아이템(캔) + up_Rewards_04_v3 타이머
 * 배경 + up_Solitare_UI_2-2_v3 보상 미리보기 아이콘(다이아) + "X{N}" 수량 텍스트)를 **코드로 복제**해
 * 홈·플레이 두 씬에 동일하게 배치한다(topHeader.ts 와 동일 패턴 — home.json 에는 이 노드가 없어서
 * 플레이 화면 저작 좌표를 그대로 두 씬 공용 상수로 이식).
 * ⚠️ up_Rewards_03 의 "CATCH THE THIEF REWARDS" 문구는 벤치마크 참고 목업 텍스트 그대로 이식된 것 —
 *    추후 정식 카피/현지화 교체 대상.
 * ⚠️ 보상 미리보기(우측 다이아 아이콘+수량)는 **현재 티어의 다이아 보상만** 표시한다(2026-07-18, PO
 *    "우선 에디터에서 저장한 다이아 기준으로 수정" 지시) — 코인 전용 보상이나 "박스 상품"(여러 판에 걸쳐
 *    쌓이는 박스가 열리는 연출)은 아직 저작/구현 전이라 다음 작업으로 남겨둔다.
 * main.json 원본 노드(layer_13*·layer_17·layer_19·layer_8_copy4·layer_8_copy5)는 PlayScene 의
 *   DYNAMIC_NODE_IDS 로 정적 렌더에서 제외되고, 이 모듈이 두 씬 모두에서 대신 그린다(진행 바·타이머·
 *   보상 미리보기는 코드 제어 필요).
 */
import Phaser from 'phaser';
import { sfx } from '../audio.js';
import { tierConfig, remainingMs, formatCountdown, type MissionRewardState } from '../logic/missionReward.js';

const BADGE_KEY = 'up_Rewards_01_v2';
const TITLE_KEY = 'up_Rewards_03';
const LEFT_ICON_FRAME_KEY = 'up_Rewards_02';
// 우측 아이콘 원판도 좌측과 동일 텍스처로 통일(2026-07-18 에디터 재저장 — layer_13_copy3, 기존 "GO!" 깃발 폐기).
const RIGHT_ICON_FRAME_KEY = 'up_Rewards_02';
const ITEM_ICON_KEY = 'up_Item_01_01-4';
const TIMER_BG_KEY = 'up_Rewards_04_v3'; // 에디터 재저장으로 v3 로 교체(layer_13_copy4).
// 우측 원판 위에 얹는 **보상 미리보기 아이콘**(다이아) — layer_13_copy6.
const REWARD_ICON_KEY = 'up_Solitare_UI_2-2_v3';
// 흡입 연출(별이 배너로 빨려올라가는 연출)에 쓰는 별 텍스처 — 게이지로 빨려가는 별과 동일한 노란 별로
//   통일한다(2026-07-18 — 아이템 아이콘 색으로 대체되어 "빨갛게 변한다"는 지적 반영, 색은 항상 노랑 유지).
const STAR_FLIER_KEY = 'up_Solitare_UI_02_v2';

// 전부 main.json 저작 좌표 그대로(layer_13/layer_13_copy*/layer_17/layer_19/layer_8_copy4/layer_8_copy5,
//   2026-07-18 재조정 반영).
const CX = 540;
const BADGE = { y: 247, w: 474, h: 135 };
const TITLE = { y: 194, w: 229, h: 91 };
const LEFT_ICON = { x: 383, y: 251, w: 79, h: 80 };
const RIGHT_ICON = { x: 701, y: 251, w: 79, h: 80 }; // layer_13_copy3.
/*
 * 보상 아이콘 — **크게**(PO 2026-08-24 "코인 아이콘을 크게 배치"). 저작값(63×55)은 우측 원판(지름 80)
 *   안에서 작게 떠 있어 무엇을 주는지 잘 안 읽혔다. 원판을 거의 채우도록 키운다.
 * ⚠️ **비율을 바꾸지 않는다**(PO 2026-08-24: "어떤 경우에도 이미지의 비율을 변경하여 적용하지 마세요").
 *   가로만 주고 세로는 원본 비율로 계산한다 — `imgFit` 참조.
 */
const REWARD_ICON = { x: RIGHT_ICON.x, y: RIGHT_ICON.y, w: 86, h: 86 }; // 우측 원판 정중앙(코인).
const REWARD_TEXT_Y = 288; // layer_8_copy5("X10") — REWARD_ICON.x 와 같은 x(CX 아님, 우측 원판 중심).
const REWARD_FONT_SIZE = 34; // 금액도 약간 크게(PO 2026-08-24).
// 아이템(캔) 아이콘 — 기존 좌표(y:247,h:101)는 좌측 원판(LEFT_ICON, 지름 80) 대비 세로로 너무 커서
//   회전 시 원판 아래로 삐져나와 "아래로 처져 보이는" 문제가 있었다(2026-07-18 QA 지적). 원판 중심(y:251)에
//   맞추고 원판 안에 들어오도록 살짝 축소.
/*
 * 아이템(캔) 아이콘 — **좌측 원판의 정중앙**(PO 2026-08-24: "콜라아이콘과 코인 아이콘이 뒷배경 원의
 *   중심에 배치"). 크기는 원판 안에 들어오는 상자를 주고 **비율은 원본 그대로** 맞춘다.
 */
const ITEM_ICON = { x: LEFT_ICON.x, y: LEFT_ICON.y, w: 66, h: 74, angle: 15 };
const TIMER_BG = { y: 304, w: 179, h: 41 }; // 2026-07-18 에디터에서 시간표시 패널 확대 저장분 반영.
const TIMER_TEXT_X = 557; // 시계 아이콘(배경에 각인) 오른쪽 여백.
const PROGRESS_TEXT_Y = 251;
const PROGRESS_FONT_SIZE = 29;
// 진행 바 트랙 — up_Rewards_01_v2 안쪽 짙은 홈 영역(실측: 뱃지 폭의 74.5%·높이의 32%, 중앙정렬).
const TRACK = { left: CX - (BADGE.w * 0.745) / 2, y: 252, w: BADGE.w * 0.745, h: Math.round(BADGE.h * 0.32), r: Math.round((BADGE.h * 0.32) / 2) };

/**
 * 배너의 **가장 아래 끝**(저작 y, offsetY 반영 전). 지금은 타이머 패널(TIMER_BG)이 최하단이다.
 *
 * 이 배너는 uiCam 에 고정돼 화면 위쪽을 점유하므로, 그 아래에 와야 하는 것(홈 타워의 "N층 건설"
 * 버튼 등)이 **직접 참조해서** 여백을 잡아야 한다. 숫자를 따로 적어 두면 배너가 움직일 때
 * 같이 안 움직여 가려진다(실측: 세이프에어리어로 배너가 내려가자 건설 버튼이 배너 뒤로 들어감).
 */
export const MISSION_BANNER_BOTTOM = TIMER_BG.y + TIMER_BG.h / 2;

/** 배너 묶음의 세로 중심(저작 y, offsetY 반영 전) — 배너를 덮는 입력 존을 놓을 때 쓴다. */
export const MISSION_BANNER_CENTER_Y = Math.round((TITLE.y - TITLE.h / 2 + MISSION_BANNER_BOTTOM) / 2);

const DROP_DIST = 46; // 등장 연출 — 이 만큼 위에서 "쿵" 떨어진다.
const DROP_DURATION = 380;

export interface MissionRewardBanner {
  objects: Phaser.GameObjects.GameObject[];
  /** **즉시 반영**(연출 없음) — 최초 배치·씬 진입 시 기준값 세팅용. */
  setState(state: MissionRewardState): void;
  /**
   * **연출 반영** — 진행 바가 부드럽게 채워지고 숫자가 카운트업된다. `flyFrom` 을 주면 그 위치에서
   *   작은 아이템 아이콘이 배너로 빨려 올라온 뒤 카운트업이 시작된다(별 수집 시 사용).
   */
  animateTo(next: MissionRewardState, flyFrom?: { x: number; y: number }): void;
  /**
   * **주간 이벤트 표시로 전환**(PO 2026-08-23) — 이 배너는 `CATCH THE THIEF` 이벤트의 얼굴이다.
   * 옛 미션 티어(다이아 X42) 대신 **지금 모으는 층 상품 · 진행 · 코인 보상**을 보여 준다.
   * 한 번 부르면 그 뒤로는 이 값만 그린다(티어 렌더로 되돌아가지 않는다).
   */
  setView(v: { itemKey?: string; current: number; goal: number; rewardText: string; remainMs: number; rewardIconKey?: string }): void;
  /** 배너 아이템 아이콘의 월드 좌표(수집 연출의 도착점 참고용). */
  itemAnchor: { x: number; y: number };
  /** 배너 우측 보상 미리보기 아이콘의 월드 좌표(티어 완료 시 "커졌다가 저장소로 빨려가는" 연출의 출발점). */
  rewardAnchor: { x: number; y: number };
  destroy(): void;
}

/**
 * onExpire = 배너가 떠 있는 동안 **제한시간이 0 이 되는 순간** 1회 호출(선택). 만료 처리(리셋 + 저장)는
 *   호출부 책임이고, 배너는 알리기만 한다 — 없으면 예전처럼 타이머만 0 에 멈춘다.
 */
export function buildMissionRewardBanner(
  scene: Phaser.Scene,
  initial: MissionRewardState,
  offsetY = 0,
  depth = 1580,
  onExpire?: () => void,
): MissionRewardBanner {
  const objects: Phaser.GameObjects.GameObject[] = [];
  let state = initial;

  const Y = (y: number): number => y + offsetY;

  const img = (key: string, x: number, y: number, w: number, h: number, d: number, angle = 0): Phaser.GameObjects.Image | undefined => {
    if (!scene.textures.exists(key)) return undefined;
    const o = scene.add.image(x, Y(y), key).setDisplaySize(w, h).setDepth(d);
    if (angle) o.setAngle(angle);
    objects.push(o);
    return o;
  };

  /**
   * **비율을 지키며** 주어진 사각형 안에 맞춘다(PO 2026-08-24: "어떤 경우에도 이미지의 비율을
   * 변경하여 적용하지 마세요" — 콜라 캔이 찌그러져 보였다).
   *
   * 저작 사각형은 자리를 잡는 용도로만 쓰고, 실제 크기는 **원본 비율로 contain** 한다.
   * 위치는 그 사각형의 **중심**(뒤 원판의 중심과 같은 지점)이다.
   */
  const imgFit = (key: string, cx: number, cy: number, boxW: number, boxH: number, d: number, angle = 0): Phaser.GameObjects.Image | undefined => {
    if (!scene.textures.exists(key)) return undefined;
    const o = scene.add.image(cx, Y(cy), key).setDepth(d);
    const src = texSize(o.texture);
    const k = Math.min(boxW / src.width, boxH / src.height);
    o.setDisplaySize(src.width * k, src.height * k);
    if (angle) o.setAngle(angle);
    objects.push(o);
    return o;
  };
  /** 텍스처가 바뀌어도 **비율을 지켜** 같은 상자에 다시 맞춘다. */
  const refit = (o: Phaser.GameObjects.Image | undefined, boxW: number, boxH: number): void => {
    if (!o) return;
    const src = texSize(o.texture);
    const k = Math.min(boxW / src.width, boxH / src.height);
    o.setDisplaySize(src.width * k, src.height * k);
  };

  // 깊이 층(낮음→높음): 배지/타이머배경 → 트랙(홈) → 진행 채움 → 아이콘 원판들 → 아이템(캔) → 타이틀 리본 → 텍스트.
  //   (트랙·채움이 아이콘/아이템보다 위로 올라와 가리던 버그 수정, 2026-07-18 — 명시적 층으로 겹침 순서 고정.)
  img(BADGE_KEY, CX, BADGE.y, BADGE.w, BADGE.h, depth);
  img(TIMER_BG_KEY, CX, TIMER_BG.y, TIMER_BG.w, TIMER_BG.h, depth);

  const trackY = Y(TRACK.y);
  const track = scene.add.graphics().setDepth(depth + 1);
  /*
   * 게이지 홈 — **밝은 청색 계열**(PO 2026-08-24: "지금은 너무 탁합니다").
   *   예전 값(0x123a5c · 0.55)은 어두운 남색이라 배너의 밝은 아트 위에서 때가 낀 것처럼 보였다.
   *   홈은 옅은 하늘색으로 낮추고 채움을 시안으로 올려, 채움/홈의 대비만으로 진행이 읽히게 한다.
   */
  track.fillStyle(0x0e4f7a, 0.42);
  track.fillRoundedRect(TRACK.left, trackY - TRACK.h / 2, TRACK.w, TRACK.h, TRACK.r);
  objects.push(track);

  const fill = scene.add.graphics().setDepth(depth + 2);
  objects.push(fill);

  img(RIGHT_ICON_FRAME_KEY, RIGHT_ICON.x, RIGHT_ICON.y, RIGHT_ICON.w, RIGHT_ICON.h, depth + 3);
  img(LEFT_ICON_FRAME_KEY, LEFT_ICON.x, LEFT_ICON.y, LEFT_ICON.w, LEFT_ICON.h, depth + 3);
  const itemImg = imgFit(ITEM_ICON_KEY, ITEM_ICON.x, ITEM_ICON.y, ITEM_ICON.w, ITEM_ICON.h, depth + 4, ITEM_ICON.angle);
  const rewardIcon = imgFit(REWARD_ICON_KEY, REWARD_ICON.x, REWARD_ICON.y, REWARD_ICON.w, REWARD_ICON.h, depth + 4); // 우측 원판 위 보상 미리보기.
  img(TITLE_KEY, CX, TITLE.y, TITLE.w, TITLE.h, depth + 5); // 타이틀 리본을 맨 위(뱃지 위에 걸침).

  const progressText = scene.add
    .text(CX, Y(PROGRESS_TEXT_Y), '', {
      fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
      fontSize: `${PROGRESS_FONT_SIZE}px`,
      color: '#ffffff',
      fontStyle: '700 italic',
    })
    .setOrigin(0.5)
    .setDepth(depth + 6);
  progressText.setStroke('#5a3210', 3);
  progressText.setShadow(2, 2, '#000000', 2, false, true);
  objects.push(progressText);

  // 타이머 폰트 — 21px 하드코딩이던 걸 QA "아직도 너무 작다" 재지적 이후, 에디터에서도 시간표시 패널
  //   자체를 키워 재저장(w151→179,h35→41,fontSize→30). 커진 패널 폭 안에서 최대한 크게 32px.
  const timerText = scene.add
    .text(TIMER_TEXT_X, Y(TIMER_BG.y), '', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '32px', color: '#1a2437', fontStyle: '700' })
    .setOrigin(0.5)
    .setDepth(depth + 6);
  objects.push(timerText);

  // **보상 수량 텍스트**("X10" 등, layer_8_copy5) — 현재 티어의 다이아 보상 수량을 그대로 표시.
  const rewardText = scene.add
    .text(REWARD_ICON.x, Y(REWARD_TEXT_Y), '', {
      fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
      fontSize: `${REWARD_FONT_SIZE}px`,
      color: '#ffffff',
      fontStyle: '900 italic',
    })
    .setOrigin(0.5)
    .setDepth(depth + 6);
  rewardText.setStroke('#5a3210', 1);
  rewardText.setShadow(2, 2, '#000000', 2, false, true);
  objects.push(rewardText);

  let displayedProgress = state.progress; // 카운트업 애니메이션의 현재 표시값(진짜 progress 와 별개로 보간).

  const drawFill = (progress: number, goal: number): void => {
    const ratio = Phaser.Math.Clamp(progress / goal, 0, 1);
    fill.clear();
    if (ratio > 0) {
      const w = Math.max(TRACK.h, TRACK.w * ratio);
      // **밝은 시안**(PO 2026-08-24) — 불투명하게 채우고 윗면에 하이라이트를 얹어 물광을 준다.
      fill.fillStyle(0x1fb6ff, 1);
      fill.fillRoundedRect(TRACK.left, trackY - TRACK.h / 2, w, TRACK.h, TRACK.r);
      fill.fillStyle(0x8ff0ff, 0.55); // 상단 하이라이트 — 탁해 보이지 않게 하는 핵심.
      fill.fillRoundedRect(TRACK.left + 2, trackY - TRACK.h / 2 + 2, Math.max(2, w - 4), TRACK.h * 0.38, TRACK.r);
    }
  };

  /** setView 를 한 번이라도 부르면 티어 기반 렌더를 멈춘다(두 소스가 서로 덮어쓰지 않게). */
  let viewMode = false;

  const setView: MissionRewardBanner['setView'] = (v) => {
    viewMode = true;
    if (v.itemKey && scene.textures.exists(v.itemKey)) { itemImg?.setTexture(v.itemKey); refit(itemImg, ITEM_ICON.w, ITEM_ICON.h); }
    // 보상 아이콘 — 옛 티어는 다이아였지만 이벤트 칸 보상은 **코인**이다.
    if (v.rewardIconKey && scene.textures.exists(v.rewardIconKey)) { rewardIcon?.setTexture(v.rewardIconKey); refit(rewardIcon, REWARD_ICON.w, REWARD_ICON.h); }
    displayedProgress = v.current;
    drawFill(v.current, v.goal);
    progressText.setText(`${v.current}/${v.goal}`);
    rewardText.setText(v.rewardText);
    timerText.setText(formatCountdown(Math.max(0, v.remainMs)));
  };

  const renderInstant = (): void => {
    if (viewMode) return;
    const cfg = tierConfig(state.tier);
    displayedProgress = state.progress;
    drawFill(state.progress, cfg.goal);
    progressText.setText(`${state.progress}/${cfg.goal}`);
    timerText.setText(formatCountdown(remainingMs(state, Date.now())));
    // 보상 미리보기(다이아 수량) — 티어가 바뀌면 다음 보상도 바뀌므로 매번 다시 읽는다.
    rewardText.setText(cfg.reward.diamonds ? `X${cfg.reward.diamonds}` : '');
  };
  renderInstant();

  // 화면에 떠 있는 동안 1초마다 남은시간 갱신 + **만료 순간 알림** — 예전엔 타이머가 0 에 멈춰 있다가
  //   다음 별 반영/씬 재진입 때야 리셋이 보였다(2026-07-27).
  let expiredNotified = false;
  const ticker = scene.time.addEvent({
    delay: 1000,
    loop: true,
    callback: () => {
      if (viewMode) return; // 남은시간도 호출부(이벤트 주기)가 준다.
      const left = remainingMs(state, Date.now());
      timerText.setText(formatCountdown(left));
      if (left <= 0 && !expiredNotified) {
        expiredNotified = true; // 롤오버 후 setState 가 새 상태를 주면 다시 열린다.
        onExpire?.();
      }
    },
  });

  // **등장 연출** — 전 오브젝트를 최종 위치보다 DROP_DIST 만큼 위에 두고 바운스로 떨어뜨린다("쿵").
  for (const o of objects) {
    const t = o as unknown as { y: number };
    const targetY = t.y;
    t.y = targetY - DROP_DIST;
    scene.tweens.add({ targets: o, y: targetY, duration: DROP_DURATION, ease: 'Bounce.easeOut' });
  }
  sfx('level_open', { volume: 0.5 });

  const itemAnchor = { x: ITEM_ICON.x, y: Y(ITEM_ICON.y) };
  const rewardAnchor = { x: REWARD_ICON.x, y: Y(REWARD_ICON.y) };

  const countUpTo = (goal: number, toProgress: number): void => {
    scene.tweens.addCounter({
      from: displayedProgress,
      to: toProgress,
      duration: 360,
      ease: 'Cubic.easeOut',
      onUpdate: (tw) => {
        const v = Math.round((tw.getValue() as number) ?? toProgress);
        drawFill(v, goal);
        progressText.setText(`${v}/${goal}`);
      },
      onComplete: () => {
        displayedProgress = toProgress;
      },
    });
  };

  return {
    objects,
    setView,
    itemAnchor,
    rewardAnchor,
    setState(next: MissionRewardState): void {
      state = next;
      expiredNotified = false; // 새 타이머가 들어왔으니 만료 알림을 다시 무장.
      renderInstant();
    },
    animateTo(next: MissionRewardState, flyFrom?: { x: number; y: number }): void {
      /*
       * ⚠️ **이벤트 표시 중이면 티어 진행을 그리지 않는다**(PO 2026-08-24 신고: 플레이 화면과
       *   팝업의 숫자가 다르다).
       *
       * `renderInstant` 는 `viewMode` 로 막혀 있었지만 이쪽은 뚫려 있어서, 손님을 정산할 때마다
       * (`creditMissionStars` → `animateTo`) 배너가 **티어 숫자**(예: 6/35)로 덮였다. 배너가 보여
       * 주기로 한 것은 주간 이벤트 하나뿐이므로 상태만 갱신하고 그리기는 건너뛴다.
       */
      if (viewMode) {
        state = next;
        expiredNotified = false;
        return;
      }
      const cfg = tierConfig(next.tier);
      const sameTier = next.tier === state.tier;
      state = next;
      expiredNotified = false;
      timerText.setText(formatCountdown(remainingMs(state, Date.now())));
      if (!sameTier) {
        // 티어가 바뀌었으면(완료 롤오버) — **보상 아이콘이 커졌다가 제자리로**(PO 2026-07-18: "다이아가
        //   커졌다가 저장소로 빨려들어가는 연출") 펄스한 뒤, 새 티어 기준으로 스냅. 저장소까지 실제로
        //   날아가는 입자 연출은 PlayScene.creditMissionStars 가 rewardAnchor 를 출발점으로 이어서 재생한다.
        if (rewardIcon) {
          const bw = rewardIcon.displayWidth;
          const bh = rewardIcon.displayHeight;
          scene.tweens.add({
            targets: rewardIcon,
            displayWidth: bw * 1.6,
            displayHeight: bh * 1.6,
            duration: 220,
            yoyo: true,
            ease: 'Back.easeOut',
          });
        }
        sfx('gauge_full', { volume: 0.6 });
        renderInstant();
        return;
      }
      const toProgress = next.progress;
      // 흡입 연출은 항상 **노란 별**로(아이템 아이콘 색으로 바뀌어 보이던 문제 수정, 2026-07-18) — 텍스처가
      //   없으면(구버전 매니페스트 등) 기존 아이템 아이콘으로 안전하게 폴백.
      const flierKey = scene.textures.exists(STAR_FLIER_KEY) ? STAR_FLIER_KEY : ITEM_ICON_KEY;
      if (!flyFrom || !scene.textures.exists(flierKey)) {
        countUpTo(cfg.goal, toProgress);
        return;
      }
      const flier = scene.add.image(flyFrom.x, flyFrom.y, flierKey).setDisplaySize(30, 30).setDepth(2600).setAlpha(0.95);
      scene.tweens.add({
        targets: flier,
        x: itemAnchor.x,
        y: itemAnchor.y,
        displayWidth: 16,
        displayHeight: 16,
        alpha: 0.5,
        duration: 420,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          flier.destroy();
          countUpTo(cfg.goal, toProgress);
        },
      });
    },
    destroy(): void {
      ticker.remove(false);
    },
  };
}
