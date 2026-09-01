/**
 * eventReset.ts — **이벤트 전체 리셋의 단일 출처**(PO 2026-08-24 "전체 이벤트도 리셋하세요").
 *
 * ## 왜 한 곳에 두는가
 * 이벤트 상태는 세 군데에 흩어져 있다 — 상단 미션 리워드 배너(`missionReward`), 투데이 리그
 * (`leagueStage`·`leaguePeriodId`·`leaguePoints`), 주간 이벤트(`thiefEvent`). 게임의 리셋 메뉴와
 * 계측 대시보드가 **각자** 지우면 반드시 한 군데를 빠뜨리고, "리셋했는데 리그가 완주 상태"처럼
 * 원인을 못 찾는 상태가 남는다(2026-08-23 실측 1,500판이 통째로 0 이었던 이유가 정확히 이것이다).
 *
 * 그래서 지울 목록을 여기 한 곳에 적고, 리셋 메뉴와 `econLab` 이 **같은 함수**를 쓴다.
 *
 * ⚠️ 코인·다이아·레벨·건설·컬렉션은 **건드리지 않는다** — 이벤트만 처음 상태로 되돌린다.
 */
import { freshMissionState } from './missionReward.js';
import type { SaveData } from '../save.js';

/**
 * 이벤트 상태를 처음으로 되돌린 **새 세이브를 만들어 돌려준다**(원본은 그대로 둔다).
 *
 * 기간 id 를 `-1`(어떤 날짜와도 다른 값)로 두는 것이 핵심이다 — 리그·이벤트 로직은 전부
 * "저장된 periodId ≠ 지금 periodId 면 새 기간"으로 판정하므로, 이것만으로 다음 접속이
 * 1단계·1칸부터 다시 시작된다.
 *
 * @param now 미션 배너의 시작 시각(테스트에서 고정하려고 인자로 받는다).
 */
export function resetAllEvents(save: SaveData, now = Date.now()): SaveData {
  return {
    ...save,
    missionReward: freshMissionState(1, now), // 상단 미션 리워드 배너 — 1티어·0진행.
    leagueStage: { periodId: -1, stage: 0, count: 0 }, // 투데이 리그 사다리.
    leaguePeriodId: -1, // 순위 점수의 소속 날짜(정산 판정 기준).
    leaguePoints: 0, // 오늘 모은 별.
    thiefEvent: { periodId: -1, stage: 0, count: 0 }, // 주간 이벤트 사다리.
    itemStock: {}, // 층별 상품 재고.
  };
}

/** 리셋 대상 목록 — 리셋 메뉴·대시보드가 "무엇이 지워지는지" 사람에게 보여줄 때 쓴다. */
export const EVENT_RESET_ITEMS: ReadonlyArray<string> = [
  '미션 리워드 배너',
  '투데이 리그(단계·순위 점수)',
  '주간 이벤트(사다리)',
  '층별 상품 재고',
];
