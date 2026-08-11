/** build-burst-level.mts — 참조작 "삼중 십자뭉치"(3개 독립 버스트 파일) 손저작 + 승리딜 베이크 + 레벨2로 추가. */
import fs from 'node:fs';
import { bakeLevel, withCrownFoot, type RawSlot } from './level-kit.mts';

const OUT = 'C:/Users/user/AppData/Local/Temp/claude/d--Dev-CasualGame-games-Solitare/348a5bef-5620-4544-9f0f-478dbfcb7114/scratchpad';

// 참조: 화면 캡처 175053 — 3개 독립 "십자뭉치". 뭉치당 오픈1(front)이 5장(top·upperL·upperR·lowerL·lowerR)을 한번에 덮고,
// top은 upperL+upperR에 한번 더 가려짐(모서리만 삐져나옴) → front 제거 시 4장 동시노출, upperL/R 제거 후 top 노출.
// 카드 120×164(반폭60·반높82) 기준 픽셀 오프셋 직접 지정 — 의도한 커버만 나오게 여백 정밀 계산.
// front(0,0)는 top·upperL/R·lowerL/R 5장 전부와 겹침. upperL/R은 top과도 겹침(top=이중피복).
// lowerL/R은 top·upperL/R 와는 안 겹치도록(세로거리≥164) 간격 확보 → 말단(leaf)으로 홀로 front에만 덮임.
function buildLayout(): RawSlot[] {
  // 실제 보드폭(BOARD_LEFT=55~BOARD_RIGHT=1025, PlayScene.ts) 기준 안전마진 40px 이상 남도록
  // (클러스터 반폭 90+카드반폭60=150 감안, 예전 [156,924]는 넘쳤음).
  const clusterX = [250, 540, 830];
  const y0 = 1180;
  const local: { dx: number; dy: number; layer: number }[] = [
    { dx: 0, dy: -140, layer: 1 },   // top(최배후, upperL/R+front 3장에 가려짐)
    { dx: -90, dy: -70, layer: 3 },  // upperLeft
    { dx: 90, dy: -70, layer: 3 },   // upperRight
    { dx: -90, dy: 100, layer: 3 },  // lowerLeft(말단)
    { dx: 90, dy: 100, layer: 3 },   // lowerRight(말단)
    { dx: 0, dy: 0, layer: 5 },      // front(오픈)
  ];
  const P: RawSlot[] = [];
  for (const cx of clusterX) for (const s of local) P.push({ x: cx + s.dx, y: y0 + s.dy, layer: s.layer });
  // "중앙에 뭉쳐있다·상하 20% 확장" 피드백 — 본체 위/아래에 추가 카드 배치(세로 전체 사용).
  return withCrownFoot(P, { centerX: 540 });
}

const baked = bakeLevel({ id: 'burst', name: '2. 삼중 십자뭉치', level: 2, raw: buildLayout() });
console.log('보드', baked.boardN, '장 · 오픈', baked.openN, '· 스톡', baked.stockN, '· 해답', baked.solMoves != null ? baked.solMoves + '수' : '못찾음');
fs.writeFileSync(`${OUT}/final-burst.svg`, baked.svg);

if (process.argv.includes('--write')) {
  const pack = JSON.parse(fs.readFileSync('./public/levels/cardLevels.json', 'utf8')) as { kind: string; levels: Record<string, unknown> };
  pack.levels['2'] = baked.doc;
  fs.writeFileSync('./public/levels/cardLevels.json', JSON.stringify(pack, null, 2) + '\n', 'utf8');
  console.log('✅ 레벨2 추가(기존 레벨 유지) → public/levels/cardLevels.json');
}
