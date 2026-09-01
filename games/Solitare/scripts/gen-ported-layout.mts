/**
 * gen-ported-layout — 펌프러시에서 이식한 저작 화면(리그·이벤트)을 **좌표 상수 모듈**로 굽는다.
 *
 * 왜 필요한가: 이식한 패널 코드는 펌프러시 하네스의 `LAYOUT.BLANK` 형태(좌상단 기준 rect)를 읽는다.
 * 이 게임의 `.pue-harness/` 는 에디터 생성물이라 손대면 안 되므로(CLAUDE.md), 런타임 사본
 * `public/ui/layouts/{league,event}.json` 에서 같은 형태를 만들어 소스 트리에 둔다.
 *
 * ⚠️ 런타임 JSON 의 x·y 는 **중심** 기준이고 하네스 LAYOUT 은 **좌상단** 기준이다 — 여기서 변환한다.
 *
 * 사용: npx tsx scripts/gen-ported-layout.mts
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = [
  { file: 'league.json', name: 'LEAGUE_LAYOUT' },
  { file: 'event.json', name: 'EVENT_LAYOUT' },
  { file: 'leaderboard.json', name: 'LEADERBOARD_LAYOUT' },
] as const;

interface Node { id: string; name?: string; key?: string; x: number; y: number; w?: number; h?: number }

const constName = (id: string): string => id.toUpperCase();

const out: string[] = [
  '/* 자동 생성 — scripts/gen-ported-layout.mts. 직접 편집하지 말 것.',
  ' * 펌프러시에서 이식한 저작 화면의 좌표(좌상단 기준). 원본은 public/ui/layouts/{league,event}.json.',
  ' */',
  '',
];

for (const { file, name } of SRC) {
  const doc = JSON.parse(fs.readFileSync(path.join('public/ui/layouts', file), 'utf8')) as {
    frame: { designW: number; designH: number };
    nodes: Node[];
  };
  out.push(`export const ${name} = {`);
  out.push(`  FRAME: { w: ${doc.frame.designW}, h: ${doc.frame.designH} },`);
  for (const n of doc.nodes) {
    const w = Math.round(n.w ?? 0);
    const h = Math.round(n.h ?? 0);
    const comment = n.name ? `   // ${n.name}` : '';
    // ⚠️ **아트 키까지 함께 굽는다.** 예전엔 좌표만 구워서, 디자이너가 에디터에서 그림을 바꿔도
    //   코드에 박힌 키가 그대로라 **화면이 안 바뀌었다**(실측 2026-08-23 리그 개편). 패널은
    //   `artOf(슬롯, 기본키)` 로 이 값을 우선 쓴다 — 이후 디자인 교체는 코드 수정이 필요 없다.
    const key = n.key ? `, key: '${n.key}'` : '';
    out.push(`  ${constName(n.id)}: { x: ${Math.round(n.x - w / 2)}, y: ${Math.round(n.y - h / 2)}, w: ${w}, h: ${h}${key} },${comment}`);
  }
  out.push('} as const;');
  out.push('');
}

fs.mkdirSync('src/ui/generated', { recursive: true });
fs.writeFileSync('src/ui/generated/portedLayout.ts', out.join('\n'), 'utf8');
console.log('생성: src/ui/generated/portedLayout.ts');
