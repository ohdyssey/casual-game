/**
 * 오늘의 랭킹 보상(TODAY RANK 배지) — 표시 전용 순수 계산.
 * 배지에는 두 가지를 띄운다: **내 순위**와 **일일 리셋까지 남은 시간**(사용자 지시).
 * 리셋 기준은 로컬 자정 — 서버 없이도 기기 시간만으로 결정된다.
 *
 * ⚠️ 펌프러시에서 이식(PO 2026-08-23). 원본의 랭킹 카테고리(무한·PVP 등 모드별 집계)는
 *   덜어냈다 — 이 게임의 리그는 하나뿐이라 구분할 대상이 없다.
 */
/** 다음 리셋(로컬 자정)까지 남은 ms. */
export function msUntilDailyReset(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(0, next.getTime() - now.getTime());
}

/**
 * 남은 시간 표기 — "3일 5시간" / "8시간29분" / "42분" / "곧"(1분 미만).
 *
 * ⚠️ **일 단위가 필요하다.** 탑 이벤트가 7일 주기가 되면서(2026-08-16) 남은 시간이
 *   100시간을 넘는다 — "163시간29분"은 읽히지 않는다. 하루가 넘으면 일·시로 끊는다.
 *   리그(하루)는 여전히 시·분으로만 나오므로 이 분기는 리그 표기를 바꾸지 않는다.
 */
export function formatRemain(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(totalMin / (60 * 24));
  if (d > 0) return `${d}일 ${Math.floor((totalMin - d * 60 * 24) / 60)}시간`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}시간${m}분`;
  if (m > 0) return `${m}분`;
  return '곧';
}

/**
 * 남은 시간 **짧은** 표기 — "8H29M" / "42M" / "곧".
 * 배지 안 저작 노드(layer_11_copy)가 45×22px·18px 글자라 한글 "8시간29분"은 두 배로 넘친다.
 * 에디터 저작 문구가 "8H29M" 이므로 그 형식을 따른다(디자인 SSOT).
 */
export function formatRemainShort(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}H${m}M`;
  if (m > 0) return `${m}M`;
  return '곧';
}

/** 순위 표기 — 기록이 없으면 '-'(미참가). */
export function formatRank(rank: number | null): string {
  return rank === null ? '-' : String(rank);
}
