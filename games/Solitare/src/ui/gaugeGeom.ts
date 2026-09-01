/**
 * gaugeGeom.ts — **좌측 별 게이지의 저작 좌표**(main.json HUD).
 *
 * PlayScene(트라이픽스)과 PlayKlondikeScene(보너스 라운드)이 **같은 크롬(main.json)** 을 쓰므로 좌표도
 * 하나여야 한다. 예전에는 PlayScene 안에만 상수가 있어, 보너스 라운드가 같은 HUD 를 쓰면서도 값을
 * 베껴 써야 했다 — 저작이 바뀌면 한쪽만 따라가 어긋난다.
 *
 * ⚠️ 이 값들은 **저작 문서에서 읽지 못하는 것들**이다. layer_7(파란 바)·layer_15_copy3(별)은
 *   `DYNAMIC_NODE_IDS` 로 정적 렌더에서 제외돼 런타임 조회가 안 되기 때문에 값을 고정해 둔다.
 *   저작에서 HUD 를 옮기면 **여기 한 곳**만 고치면 두 화면이 함께 따라간다.
 */

/** 5칸 별의 x 좌표(좌→우). */
export const GAUGE_STAR_XS = [104, 192, 280, 370, 459] as const;
/** 별 중심 y — layer_15_copy3 y=760(2026-07-18 전체 하향 조정 반영). */
export const GAUGE_STAR_Y = 760;
/** 별 한 변 — layer_15_copy3 w=51. */
export const GAUGE_STAR_SZ = 51;
/** 파란 바 기하 — 에디터 layer_7(x=135 w=177 y=761 h=58 radius=17, #006eff). */
export const GAUGE_BAR_GEOM = { left: 46, y: 761, h: 58, r: 17 } as const;
