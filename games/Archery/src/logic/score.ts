/**
 * 양궁 점수 로직 — 순수 함수(테스트 가능). 착탄점과 과녁 중심(불스아이) 사이 거리로 링 점수 산정.
 * World Archery 규격: 10링(중심)→1링(가장자리), 그 밖은 0(빗나감).
 */

/** 만점(불스아이 골드). */
export const MAX_RING = 10;

/** 한 라운드/경기 최고점 계산 헬퍼 (라운드 수 × 라운드당 발 수 × 10). */
export function maxScore(rounds: number, arrowsPerRound: number): number {
  return rounds * arrowsPerRound * MAX_RING;
}

/**
 * 착탄 거리 → 링 점수.
 *  - dist: 불스아이 중심에서의 거리(px, 디자인 좌표)
 *  - scoringRadius: 1링(최외곽 득점 링)의 반지름(px). 이보다 멀면 0.
 * 반환: 10..1 (명중) 또는 0 (빗나감).
 */
export function scoreForDistance(dist: number, scoringRadius: number): number {
  if (scoringRadius <= 0 || dist < 0) return 0;
  const ratio = dist / scoringRadius; // 0=정중앙 .. 1=최외곽 득점 링
  if (ratio > 1) return 0;
  // 10등분: 중심대(0~0.1)=10 ... 최외곽(0.9~1.0)=1.
  const score = MAX_RING - Math.floor(ratio * MAX_RING);
  return Math.max(1, Math.min(MAX_RING, score));
}

/** 링 점수 → 과녁 색(파티클/팝업 틴트). 10·9=골드, 8·7=레드, 6·5=블루, 4·3=블랙, 2·1=화이트. */
export function ringTint(score: number): number {
  if (score >= 9) return 0xffd23f; // 골드
  if (score >= 7) return 0xff4d4d; // 레드
  if (score >= 5) return 0x35a7ff; // 블루
  if (score >= 3) return 0x2b2b2b; // 블랙
  if (score >= 1) return 0xffffff; // 화이트
  return 0x9aa0a6; // 빗나감
}

/** 링 점수 → 표시 라벨. */
export function scoreLabel(score: number): string {
  if (score >= MAX_RING) return '불스아이!';
  if (score <= 0) return '빗나감';
  return `+${score}`;
}
