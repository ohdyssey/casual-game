/**
 * build-all-levels.mts — LevelData 참조 44장 중 실제 보드 레이아웃 42장(UI팝업 2장 제외) 전수 모델링.
 * 이미 손저작 검증한 레벨1(무지개아치)·레벨2(삼중 십자뭉치)는 유지하고, 3~42를 이 배치로 일괄 생성한다.
 * 매 레벨을 픽셀부터 다시 파는 대신 3가지 검증된 안전 패턴(리지/발리필·크로스클러스터·컬럼스택)을 재사용.
 *
 * 2차 개정("너무 간단하고 단순함" 피드백): 컬럼스택에 지그재그 peek 추가(완전동일좌표 겹침 지양) +
 * 리지 템플릿에 깊은골(deepBase)·매달림(hangPoint) 플러리시를 얹어 아치 레벨(5층·19장) 수준 밀도로 상향.
 * 3차 개정("중심에 뭉쳐있다·상하로 20% 확장" 피드백): withCrownFoot 로 본체 위(크라운)·아래(풋)에
 * 카드 ~20%를 추가 배치해 세로 전체를 쓰도록 폄.
 */
import fs from 'node:fs';
import { bakeLevel, columnStacks, tileClusters, openRow, ridgeFromProfile, withCrownFoot, type RawSlot } from './level-kit.mts';

// ── 리지(발리필) 자동 생성: 원본 아치(레벨1)의 검증된 규칙을 일반화 ──
// ringCols[i] = i번째 링(안쪽→바깥쪽)의 오픈 피크 열 위치. 같은 링 내 인접 피크 사이엔 한 칸 더 깊은 골 커버,
// 다른 링 인접 피크 사이엔 바깥쪽 링의 깊이에 골 커버 — 아치 레벨의 손저작 규칙 그대로.
// deepBase: 안쪽 링(3피크 이상)의 두 갭 밑에 가로 3장 깊은골(아치의 "중간 깊은 골 커버 층3")을 더 얹음.
// hangPoint: 맨 밑으로 세로 연결 커버 2장 + 매달림 오픈 1장(아치의 "하단 매달림") — 폭 안 늘리고 깊이만 추가.
function buildRidge(ringCols: number[][], opts?: { deepBase?: boolean; hangPoint?: boolean }): { col: number; row: number; layer: number }[] {
  const out: { col: number; row: number; layer: number }[] = [];
  const peaks: { col: number; row: number }[] = [];
  ringCols.forEach((cols, row) => { for (const col of cols) { out.push({ col, row, layer: 5 }); peaks.push({ col, row }); } });
  peaks.sort((a, b) => a.col - b.col);
  for (let i = 0; i < peaks.length - 1; i++) {
    const a = peaks[i], b = peaks[i + 1];
    const gap = b.col - a.col;
    if (gap <= 0.05) continue;
    const midCol = (a.col + b.col) / 2;
    const midRow = a.row === b.row ? a.row + 1 : Math.max(a.row, b.row);
    out.push({ col: midCol, row: midRow, layer: 4 });
  }
  let maxRow = Math.max(...out.map((o) => o.row));
  if (opts?.deepBase && ringCols[0].length >= 3) {
    const baseRow = maxRow + 1;
    for (const col of ringCols[0]) out.push({ col, row: baseRow, layer: 2 });
    maxRow = baseRow;
  }
  if (opts?.hangPoint) {
    const r1 = maxRow + 1;
    out.push({ col: -0.5, row: r1, layer: 2 });
    out.push({ col: 0.5, row: r1, layer: 2 });
    out.push({ col: 0, row: r1 + 1, layer: 5 });
  }
  return out;
}
const ridge = (ringCols: number[][], opts?: Parameters<typeof buildRidge>[1] & Parameters<typeof ridgeFromProfile>[1]): RawSlot[] =>
  ridgeFromProfile(buildRidge(ringCols, opts), opts);
const multiRidge = (centers: number[], ringCols: number[][], y0 = 1150, ropts?: Parameters<typeof buildRidge>[1]): RawSlot[] => {
  const out: RawSlot[] = [];
  for (const cx of centers) out.push(...ridge(ringCols, { ...ropts, centerX: cx, y0 }));
  return out;
};
const crossFlank = (flankDepths: [number, number], flankCx: [number, number], centerCx = 540, y0 = 1150): RawSlot[] => [
  ...tileClusters([centerCx], y0),
  ...columnStacks([flankDepths[0], flankDepths[0]], { centerX: flankCx[0], y0, spacing: 150 }),
  ...columnStacks([flankDepths[1], flankDepths[1]], { centerX: flankCx[1], y0, spacing: 150 }),
];

// ── 4가지 리지 템플릿(작은 언덕 / 3피크 기본 / 대형 돔 / 트윈·나비형) ──
// "가로폭 초과·세로로 처리" 피드백: 디자인 캔버스 전체(1080)가 아니라 실제 렌더 보드폭
// (PlayScene.ts BOARD_LEFT=55~BOARD_RIGHT=1025, 970px)을 기준으로, 카드 반폭(60) 포함해도
// 안전마진 40px 이상 남도록 전 템플릿 col 상한을 역산·하향(±2.9칸 = 여백 약 54px).
// 잃은 카드 수는 가로가 아니라 withCrownFoot 의 세로 크라운/풋 확장이 채운다.
const T1 = [[-0.5, 0.5], [-1.6, 1.6]];
const T2 = [[-1, 0, 1], [-2, 2], [-2.9, 2.9]];
const T3 = [[-1, 0, 1], [-2, 2], [-2.9, 2.9]];
const T4 = [[-0.6, 0.6], [-1.8, 1.8], [-2.9, 2.9]];
// 삼중탑(가로 3개 나열)용 — 개별 탑 폭을 크게 좁히고(±0.9칸) 중심 간격도 재조정해 3개가 나란히 있어도
// 맨 끝 탑조차 보드 경계 안(여백≥40px)에 들어오게.
const TOWER = [[-0.3, 0.3], [-0.9, 0.9]];
const TOWER_CENTERS = [300, 540, 780];
const DEEP = { deepBase: true, hangPoint: true };

// ── 레벨3~42: 참조 이미지 → (아카이브 id, 이름, 원시 슬롯) ──
const LEVELS: { id: string; name: string; raw: RawSlot[]; stockCandidates?: number[] }[] = [
  { id: 'ref170915', name: '3. 흩어진 짝', raw: columnStacks([2, 2, 2, 2, 6]) },
  { id: 'ref171044', name: '4. 트윈피크 능선', raw: ridge(T4, DEEP) },
  { id: 'ref171327', name: '5. 삼중 삼각탑', raw: multiRidge(TOWER_CENTERS, TOWER, 1150, { hangPoint: true }) },
  { id: 'ref171608', name: '6. 페어드 블록', raw: columnStacks([5, 5, 5, 5, 5, 5]) },
  { id: 'ref172142', name: '7. 단봉 피라미드', raw: ridge(T2, DEEP) },
  { id: 'ref172339', name: '8. 그랜드 돔', raw: ridge(T3, DEEP) },
  { id: 'ref172546', name: '9. 물결 부채꼴', raw: columnStacks([4, 6, 3, 5, 3, 6]) },
  { id: 'ref172826', name: '10. 넓은 파도열', raw: columnStacks([5, 7, 5, 7, 5, 7]) },
  { id: 'ref173421', name: '11. 균일 성벽열', raw: columnStacks([6, 6, 6, 6, 6, 6]) },
  { id: 'ref173638', name: '12. 층층 피라미드', raw: ridge(T3, DEEP) },
  { id: 'ref173922', name: '13. 다이아몬드 링', raw: tileClusters([540], 1150, { openFront: false }) },
  { id: 'ref174229', name: '14. 나비 부채꼴', raw: columnStacks([6, 5, 5, 6]) },
  { id: 'ref174326', name: '15. 쌍둥이 부채', raw: columnStacks([7, 8]) },
  { id: 'ref174556', name: '16. 흩어진 미니스택', raw: columnStacks([4, 5, 4, 6, 4, 5]) },
  { id: 'ref174758', name: '17. 여섯 기둥열', raw: columnStacks([6, 7, 5, 7, 6, 5]) },
  { id: 'ref175431', name: '18. 쌍기둥', raw: columnStacks([7, 7, 6, 6]) },
  { id: 'ref175532', name: '19. 짧은 쌍기둥', raw: columnStacks([5, 5, 4, 4]) },
  { id: 'ref180002', name: '20. 대형 링돔', raw: ridge(T3, DEEP) },
  { id: 'ref180604', name: '21. 부채 한쌍', raw: columnStacks([5, 5, 4]) },
  { id: 'ref180818', name: '22. 여섯 조각', raw: columnStacks([5, 4, 5, 4, 5, 4]) },
  { id: 'ref181032', name: '23. 방사형 버스트', raw: tileClusters([540], 1150, { openFront: false }) },
  { id: 'ref181805', name: '24. 보너스 아치', raw: ridge(T2, DEEP) },
  { id: 'ref182125', name: '25. 더블윙 능선', raw: ridge(T3, DEEP) },
  { id: 'ref182342', name: '26. 나비 능선', raw: ridge(T4, DEEP) },
  { id: 'ref182635', name: '27. 가로 한줄', raw: openRow(10, [0, 2, 3, 5, 6, 8, 9]) },
  { id: 'ref183037', name: '28. 이중 다이아몬드', raw: tileClusters([300, 780], 1150, { openFront: false }) },
  { id: 'ref183324', name: '29. 이단 삼중탑', raw: multiRidge(TOWER_CENTERS, TOWER, 1150, { hangPoint: true }) },
  { id: 'ref183756', name: '30. 완전 오픈열', raw: openRow(6, []) },
  { id: 'ref184328', name: '31. 사중 날개열', raw: columnStacks([6, 6, 6, 6, 6, 6]) },
  { id: 'ref184551', name: '32. 와이드 트윈피크', raw: ridge(T4, DEEP) },
  { id: 'ref232749', name: '33. 십자+양옆기둥', raw: crossFlank([5, 5], [235, 845]) },
  { id: 'ref014138', name: '34. 십자+양옆기둥 B', raw: crossFlank([4, 4], [235, 845]) },
  { id: 'ref014415', name: '35. 트윈 정상', raw: ridge(T4, DEEP) },
  { id: 'ref015157', name: '36. 와이드 타워능선', raw: ridge(T3, DEEP) },
  { id: 'ref133504', name: '37. 와이드 타워능선 B', raw: ridge(T3, DEEP) },
  { id: 'ref133813', name: '38. 혼합 블록', raw: columnStacks([4, 4, 6, 6, 6, 5]) },
  { id: 'ref134300', name: '39. 미니스택 다섯', raw: columnStacks([5, 5, 4, 5, 4]) },
  { id: 'ref134632', name: '40. 얕은 언덕', raw: ridge(T1, { hangPoint: true }) },
  { id: 'ref134912', name: '41. 보우타이+양탑', raw: crossFlank([4, 4], [300, 780]) },
  { id: 'ref135258', name: '42. 티피 쌍봉', raw: columnStacks([7, 7, 6, 6]) },
];

const pack = JSON.parse(fs.readFileSync('./public/levels/cardLevels.json', 'utf8')) as { kind: string; levels: Record<string, unknown> };
const OUT = 'C:/Users/user/AppData/Local/Temp/claude/d--Dev-CasualGame-games-Solitare/348a5bef-5620-4544-9f0f-478dbfcb7114/scratchpad';
let svgAll = '';
let ok = 0, warn = 0;
LEVELS.forEach((L, i) => {
  const level = i + 3;
  const expanded = withCrownFoot(L.raw, { centerX: 540 });
  const baked = bakeLevel({ id: L.id, name: L.name, level, raw: expanded, stockCandidates: L.stockCandidates, seedTries: L.stockCandidates ? 60 : undefined });
  pack.levels[String(level)] = baked.doc;
  const flag = baked.solMoves != null ? 'OK' : '⚠못찾음';
  if (baked.solMoves != null) ok++; else warn++;
  console.log(`lv${level} ${L.name}: 보드${baked.boardN} 오픈${baked.openN} 스톡${baked.stockN} 해답${baked.solMoves ?? '-'}수 ${flag}`);
  svgAll += baked.svg.replace('<svg xmlns="http://www.w3.org/2000/svg" width="540" height="1200" viewBox="0 0 1080 2400">', `<g transform="translate(${(i % 8) * 560} ${Math.floor(i / 8) * 1220})"><svg width="540" height="1200" viewBox="0 0 1080 2400">`).replace('</svg>', '</svg></g>');
});
fs.writeFileSync(`${OUT}/all-levels-sheet.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="4480" height="${Math.ceil(LEVELS.length / 8) * 1220}">${svgAll}</svg>`);
console.log(`\n총 ${LEVELS.length}개 중 해답 확보 ${ok} · 미확보 ${warn}`);

if (process.argv.includes('--write')) {
  fs.writeFileSync('./public/levels/cardLevels.json', JSON.stringify(pack, null, 2) + '\n', 'utf8');
  console.log(`✅ 레벨 3~${2 + LEVELS.length} 기록 → public/levels/cardLevels.json (총 ${Object.keys(pack.levels).length}레벨)`);
}
