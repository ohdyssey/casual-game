/**
 * leagueRail.ts — **투데이 리그 아이콘 배지**(순위 + 남은 시간)의 단일 출처.
 *
 * PO 2026-08-24: "플레이화면에서도 이 투데이리그 표시를 홈화면과 동일하게 표시" ·
 * "투데이리그에서 순위를 표시해야 함" · "하드코딩된 숫자가 아닌 실제 시간".
 *
 * 홈은 저작 노드(`layer_13_copy3` · `layer_13_copy6`)에 얹고 플레이는 코드로 그리지만, **무엇을
 * 얼마나 큰 글씨로 어디에 쓰는지**는 같아야 한다. 그 규약을 여기 한 곳에 둔다.
 */
import Phaser from 'phaser';
import { formatRemain, msUntilDailyReset } from '../logic/dailyRank.js';
import { currentStandings } from '../logic/leagueRuntime.js';

const FONT = '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif';

/** 아이콘 중심 기준 오프셋 — 홈 저작값(아이콘 139×164, 중심 y=268)에서 그대로 뽑았다. */
export const LEAGUE_BADGE = {
  /** 순위 숫자: 중심에서 위로 33, 34px. */
  rankDy: -33,
  rankSize: 34,
  /** 남은 시간: 중심에서 아래로 47, 28px. */
  timeDy: 47,
  timeSize: 28,
} as const;

/** 지금 순위 표기(예: `3위`). 참가 전(0점)이면 꼴찌권이라 그대로 보여 준다. */
export function rankLabel(now = new Date()): string {
  return `${currentStandings(now).myRank}위`;
}

/** 자정까지 남은 시간 표기(예: `14시간10분`). */
export function remainLabel(now = new Date()): string {
  return formatRemain(msUntilDailyReset(now));
}

/**
 * 리그 아이콘 위에 **순위 + 남은 시간**을 얹고 1초마다 갱신한다.
 * @returns 만들어진 텍스트 두 개(씬 정리 시 파괴는 호출부 몫 — 보통 씬 재시작으로 함께 사라진다).
 */
export function attachLeagueBadge(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  depth: number,
): { rank: Phaser.GameObjects.Text; time: Phaser.GameObjects.Text } {
  const mk = (dy: number, size: number): Phaser.GameObjects.Text =>
    scene.add
      .text(cx, cy + dy, '', { fontFamily: FONT, fontSize: `${size}px`, color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(depth)
      .setStroke('#3a2410', 6);
  const rank = mk(LEAGUE_BADGE.rankDy, LEAGUE_BADGE.rankSize);
  const time = mk(LEAGUE_BADGE.timeDy, LEAGUE_BADGE.timeSize);
  /*
   * ⚠️ **순위는 매초 계산하지 않는다**(2026-08-24 성능 점검).
   *   `rankLabel` → `currentStandings` 는 세이브를 JSON 파싱하고 **봇 99명 명단을 만들어 정렬**한다.
   *   그걸 1초마다, 그것도 홈·플레이 두 화면에서 돌리면 그냥 서 있어도 프레임을 갉아먹는다.
   *   순위는 5초마다, 남은 시간은 매초(문자열 포맷만) 갱신한다 — 눈으로는 차이가 없다.
   */
  const paintTime = (): void => {
    if (time.active) time.setText(remainLabel(new Date()));
  };
  const paintRank = (): void => {
    if (rank.active) rank.setText(rankLabel(new Date()));
  };
  paintTime();
  paintRank();
  scene.time.addEvent({ delay: 1000, loop: true, callback: paintTime });
  scene.time.addEvent({ delay: 5000, loop: true, callback: paintRank });
  return { rank, time };
}
