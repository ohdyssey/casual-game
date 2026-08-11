/** build-arch-level.mts — 참조작 무지개아치 **한 레벨**을 골-채움 원리로 손저작 + 승리딜 베이크 + 단일팩 기록. */
import fs from 'node:fs';
import { bakeLevel, withCrownFoot, type RawSlot } from './level-kit.mts';

const OUT = 'C:/Users/user/AppData/Local/Temp/claude/d--Dev-CasualGame-games-Solitare/348a5bef-5620-4544-9f0f-478dbfcb7114/scratchpad';

// 오픈=외곽/꼭짓점(층5), 커버=골에 엇갈려 낀 하위층(4→3→2). tri-peaks: 커버는 위 두 카드가 덮음.
function buildLayout(): RawSlot[] {
  const cx = 540, px = 128, py = 86, y0 = 940;
  const P: RawSlot[] = [];
  const add = (col: number, row: number, layer: number) => P.push({ x: cx + col * px, y: y0 + row * py, layer });
  // 상단 아치 오픈 3(2·A·3).
  add(-1, 0, 5); add(0, 0, 5); add(1, 0, 5);
  // 상단 골 커버(2-A, A-3 사이).
  add(-0.5, 1, 4); add(0.5, 1, 4);
  // 어깨 오픈(K 좌·9 우) + 어깨 안쪽 골 커버.
  add(-2, 1, 5); add(2, 1, 5); add(-1.5, 1, 4); add(1.5, 1, 4);
  // 중간 깊은 골 커버(층3).
  add(-1, 2, 3); add(0, 2, 3); add(1, 2, 3);
  // 끝 오픈(10 좌·10 우) + 끝 안쪽 골 커버.
  add(-3, 2, 5); add(3, 2, 5); add(-2.5, 2, 4); add(2.5, 2, 4);
  // 중앙 세로 연결 커버(층2) → 하단 매달림으로 잇기.
  add(-0.5, 3, 2); add(0.5, 3, 2);
  // 하단 매달림 오픈(3♠).
  add(0, 4, 5);
  // "중앙에 뭉쳐있다·상하 20% 확장" 피드백 — 본체 위/아래에 추가 카드 배치(세로 전체 사용).
  return withCrownFoot(P, { centerX: cx });
}

const baked = bakeLevel({ id: 'arch', name: '1. 무지개아치', level: 1, raw: buildLayout() });
console.log('보드', baked.boardN, '장 · 오픈', baked.openN, '· 스톡', baked.stockN, '· 해답', baked.solMoves != null ? baked.solMoves + '수' : '못찾음');
fs.writeFileSync(`${OUT}/final-arch.svg`, baked.svg);

// 단일 레벨 팩 기록(산 전부 제거).
if (process.argv.includes('--write')) {
  fs.writeFileSync('./public/levels/cardLevels.json', JSON.stringify({ kind: 'cardLevels', levels: { '1': baked.doc } }, null, 2) + '\n', 'utf8');
  console.log('✅ 단일 레벨 팩 기록(레벨1만) → public/levels/cardLevels.json');
}
