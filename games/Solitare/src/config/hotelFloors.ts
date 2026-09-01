/**
 * hotelFloors.ts — **3번 라인 호텔 15층 설계표**(PO 2026-08-30). 아트 `up_Slitare_BG_04_NN` 과 1:1.
 */
export const HOTEL_FLOORS: readonly string[] = [
  'Entrance Lobby', 'Lobby & Reception', 'All-Day Dining', 'Lounge & Café', 'Wellness Club',
  'Standard Room', 'Deluxe Room', 'Premier Room', 'Family Room', 'Executive Room',
  'Junior Suite', 'Executive Suite', 'Grand Suite', 'Presidential Suite', 'Sky Lounge',
];
export const HOTEL_FLOOR_COUNT = HOTEL_FLOORS.length;
/** 1..15 → 층 이름(범위 밖이면 undefined). */
export function hotelFloorName(floor: number): string | undefined {
  return HOTEL_FLOORS[Math.floor(floor) - 1];
}
