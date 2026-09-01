/**
 * 리그 봇 닉네임 풀 — 순위표에 이름으로 등장한다.
 *
 * ⚠️ 펌프러시 풀을 그대로 쓰지 않았다. 그쪽은 바다·계단 소재("바다사나이"·"계단장인")라
 *   카드로 도시를 짓는 이 게임의 순위표에 섞이면 곧바로 어색하다. **UI 구조는 이식하되
 *   문구는 이 게임 것으로** 만든다(PO 2026-08-23 "게임은 다른 게임이므로 이를 감안").
 *
 * 한글·영문을 섞어 40개 — 실제 랭킹처럼 보이려면 어형이 한쪽으로 쏠리지 않아야 한다.
 */
export const LEAGUE_NICKNAMES: readonly string[] = [
  '카드장인', 'AceHunter', '한줄더', 'SpadeKing', '건물주꿈나무', 'CityBloom', '솔리테어러버', 'RoyalFlush7',
  '조커한장', 'TowerUp', '연승중', 'HeartQueen', '층층이', 'CardSmith', '다이아모아', 'NeonDeck',
  '오늘도한판', 'ClubMaster', '스택쌓기', 'PennyLane', '골든크러스트', 'MidnightDeal', '별다섯', 'ShuffleGo',
  '점포왕', 'AceOfCity', '느긋한손', 'PixelPile', '커피한잔', 'GrandSlam88', '무한콤보', 'VelvetJack',
  '옥상정원', 'LuckyDraw', '한수앞', 'SkylineKo', '분양완료', 'CardCarla', '야근왕', 'QuietRiver',
];
