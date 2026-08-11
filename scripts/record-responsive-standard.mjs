/**
 * record-responsive-standard — 화면비 대응 표준(3층 프레임 + 양축 가변)을 전 게임 프로젝트에 기록.
 *
 * 규칙 원본은 `packages/core/docs/RESPONSIVE_STANDARD.md` 하나뿐이고, 이 스크립트는 각 게임의
 * `CLAUDE.md` 에 **그 게임의 현재 상태와 구체적 적용값**을 실측해 써 넣는다(원본 중복 금지).
 *
 * 실측 항목: game.ts 의 designWidth/designHeight(Range) · 레이아웃 프레임 · 배경 노드 최대 폭.
 * 배경 최대 폭이 가로 확장 상한을 결정하므로 이게 채택의 실질적 관문이다.
 *
 * 재실행 안전: 기존 「화면비 대응 표준」 절만 잘라내고 다시 쓴다(다른 내용 보존).
 *
 *   node scripts/record-responsive-standard.mjs      # 저장소 루트에서
 */
import fs from 'node:fs';
import path from 'node:path';

const DATE = '2026-08-04';
/** 표준 목표치(1080 저작 기준). 720 저작 게임은 저작 자체를 20:9로 확장해야 적용 가능. */
const H_MIN = 2200, H_MAX = 2400, W_MAX_TARGET = 1600;
/** 실기기 컨테이너 비율(뷰포트 − 배너 슬롯). 커버 판정 기준. */
const DEVICES = [['iPhone 15', 1.84], ['iPhone SE/8', 1.52]];

function scan(g) {
  const s = fs.readFileSync(path.join('games', g, 'src', 'game.ts'), 'utf8');
  const dw = +((s.match(/designWidth:\s*([0-9]+)/) || [])[1] || 720);
  const fixedH = (s.match(/designHeight:\s*([0-9]+)/) || [])[1];
  const hasRange = /designHeightRange/.test(s);
  const hasWRange = /designWidthRange/.test(s);
  const ld = path.join('games', g, 'public', 'ui', 'layouts');
  const frames = {}; let bestMatch = 0, bestAny = 0;
  if (fs.existsSync(ld)) for (const f of fs.readdirSync(ld)) {
    if (!f.endsWith('.json') || f === '_index.json') continue;
    let d; try { d = JSON.parse(fs.readFileSync(path.join(ld, f), 'utf8')); } catch { continue; }
    if (!d.nodes || !d.frame) continue;
    frames[`${d.frame.designW}x${d.frame.designH}`] = (frames[`${d.frame.designW}x${d.frame.designH}`] || 0) + 1;
    for (const n of d.nodes) {
      if ((n.type && n.type !== 'image') || !n.w) continue;
      if (n.w > bestAny) bestAny = n.w;
      if (d.frame.designW === dw && n.w > bestMatch) bestMatch = n.w;
    }
  }
  return { g, dw, fixedH, hasRange, hasWRange, frames, bestMatch, bestAny,
           mode: hasRange ? '가변(표준 적용)' : fixedH ? `고정 ${fixedH}` : '동적(720 기준)' };
}

function classify(d) {
  if (d.hasRange && d.hasWRange) return { icon: '✅', label: '적용 완료' };
  if (d.dw !== 1080) {
    const mismatch = Object.keys(d.frames).some((k) => !k.startsWith(`${d.dw}x`));
    return { icon: '🔴', label: mismatch ? '저작/코드 불일치 — 선행 정리 필요' : '저작 프레임 확장 필요' };
  }
  const wMax = Math.min(W_MAX_TARGET, d.bestMatch);
  if (wMax <= d.dw) return { icon: '🔴', label: '배경 재작업 필요', wMax };
  const covers = DEVICES.filter(([, r]) => H_MIN / wMax <= r).map(([n]) => n);
  if (wMax >= W_MAX_TARGET) return { icon: '🟢', label: '즉시 적용 가능', wMax, covers };
  // 배경이 조금 넓어도 목표 기기를 하나도 커버 못 하면 부분 적용의 실익이 없다 — 과대평가 금지.
  if (covers.length === 0) return { icon: '🔴', label: '배경 재작업 필요', wMax, covers, marginal: true };
  return { icon: '🟡', label: '부분 적용 가능(배경 폭까지)', wMax, covers };
}

function section(d) {
  const c = classify(d);
  const L = [];
  L.push('## 화면비 대응 표준 (필수)', '');
  L.push('화면을 만들거나 고칠 때 **반드시 먼저 읽으세요.** 규칙 원본(SSOT)은 모노레포 공통입니다:', '');
  // 절대경로로 적는다 — 게임 폴더를 작업 디렉터리로 열면 리포 상대경로가 해석되지 않는다.
  // 슬래시 표기: Windows 에서도 그대로 동작하고 이스케이프 사고가 없다.
  L.push('→ `d:/Dev/CasualGame/packages/core/docs/RESPONSIVE_STANDARD.md`');
  L.push('  (리포 루트 기준 `packages/core/docs/RESPONSIVE_STANDARD.md` — 다른 폴더에서 작업할 땐 위 절대경로를 쓰세요)', '');
  L.push('요지: 저작 프레임 / **세이프존(항상 보임)** / 블리드(잘려도 됨) 3층으로 나누고,');
  L.push('캔버스를 **양축 가변**(세로가 하한에 닿으면 폭을 늘림)으로 산출해 FIT 검은 여백을 없앤다.');
  L.push('배경은 축소하지 않고 크롭/확장한다. 구현은 `@casual/core` 의 `designSize.ts`.', '');
  L.push(`### 이 게임의 현재 상태 (${DATE} 실측)`, '');
  L.push('| 항목 | 값 |');
  L.push('|---|---|');
  L.push(`| 저작 폭(designWidth) | ${d.dw} |`);
  L.push(`| 캔버스 높이 모드 | ${d.mode} |`);
  L.push(`| 레이아웃 프레임 | ${Object.entries(d.frames).map(([k, v]) => `${k}(${v}개)`).join(', ') || '없음'} |`);
  L.push(`| 배경 노드 최대 폭 | ${d.bestMatch || d.bestAny || '-'}px |`);
  L.push(`| **채택 상태** | ${c.icon} **${c.label}** |`);
  L.push('');

  if (c.icon === '✅') {
    L.push('이 게임이 **레퍼런스 구현**입니다. 표준을 바꾸려면 여기서 먼저 검증하세요.');
  } else if (c.icon === '🟢') {
    L.push('배경이 가로 블리드를 충분히 갖고 있어 **에셋 재작업 없이** 적용할 수 있습니다.', '');
    L.push('```ts', '// src/game.ts — designHeight 를 아래 두 줄로 교체',
      `designHeightRange: { min: ${H_MIN}, max: ${H_MAX} },`,
      `designWidthRange:  { min: ${d.dw}, max: ${c.wMax} },`, '```', '');
    L.push('적용 전 표준 문서 5절의 **채택 전제 조건 3가지**를 확인하세요 —');
    L.push('특히 게임플레이 좌표가 절대 x(예 `540`)가 아니라 `w/2` 상대 좌표여야 합니다.');
    L.push('레이아웃 소비 측에 `pinX`(세이프존 중앙정렬) 흡수도 함께 배선해야 합니다.');
  } else if (c.icon === '🟡') {
    const ratio = (H_MIN / c.wMax).toFixed(2);
    L.push(`배경 폭이 ${d.bestMatch}px 이라 목표 상한(${W_MAX_TARGET})까지는 못 늘립니다.`);
    L.push(`**배경이 덮는 만큼만** 부분 적용하면 에셋 재작업 없이 이득을 볼 수 있습니다.`, '');
    L.push('```ts', '// src/game.ts — designHeight 를 아래 두 줄로 교체',
      `designHeightRange: { min: ${H_MIN}, max: ${H_MAX} },`,
      `designWidthRange:  { min: ${d.dw}, max: ${c.wMax} },  // = 배경 최대 폭`, '```', '');
    L.push(`이 설정이 여백 0으로 커버하는 최소 컨테이너 비율은 **${ratio}** 입니다.`);
    L.push(`- 커버됨: ${c.covers.length ? c.covers.join(', ') : '없음'}`);
    L.push(`- 미커버: ${DEVICES.filter(([n]) => !c.covers.includes(n)).map(([n]) => n).join(', ') || '없음'} → 좌우 여백 잔존`);
    L.push('', `전 기기 커버하려면 배경을 **${W_MAX_TARGET}px 이상** 폭으로 다시 그려야 합니다.`);
  } else if (c.label === '배경 재작업 필요') {
    if (c.marginal) {
      L.push(`배경 폭이 ${d.bestMatch}px 로 저작 폭보다 조금 넓긴 하지만, 이 정도로는`);
      L.push(`**목표 기기를 하나도 커버하지 못합니다**(커버 가능한 최소 비율 ${(H_MIN / c.wMax).toFixed(2)} > iPhone 15 의 1.84).`);
      L.push('지금 부분 적용해도 좌우 여백이 그대로 남아 실익이 없습니다.', '');
    } else {
      L.push(`배경 노드 폭이 저작 폭(${d.dw})과 같아 **가로로 늘릴 여유가 전혀 없습니다.**`);
      L.push('지금 적용하면 배경 옆에 빈 띠가 생깁니다.', '');
    }
    L.push(`**선행 작업:** 배경 에셋을 폭 ${W_MAX_TARGET}px 이상(세이프존 ${d.dw} + 좌우 블리드)으로 다시 그린 뒤 적용하세요.`);
  } else if (c.label === '저작 프레임 확장 필요') {
    L.push(`저작이 ${d.dw}×${d.fixedH || '?'} (16:9)라 **세로 블리드가 없습니다** — 잘라낼 여유분이 애초에 없어`);
    L.push('세로 가변을 적용할 수 없습니다.', '');
    L.push('**선행 작업:** 저작 프레임을 20:9(1080×2400)로 확장하고 배경에 상하·좌우 블리드를 넣으세요.');
    L.push('그 전까지는 기존 고정 + FIT 레터박스를 유지합니다.');
  } else {
    L.push(`⚠️ **코드와 레이아웃이 어긋나 있습니다.** \`game.ts\` 는 저작 폭 ${d.dw}(미지정 시 기본값)로 동작하는데,`);
    L.push(`실제 레이아웃 프레임은 ${Object.keys(d.frames).join(', ')} 입니다.`);
    L.push('', '표준 적용 이전에 이 불일치부터 정리해야 합니다 — 어느 쪽이 진짜 저작 기준인지 확정하고');
    L.push('`designWidth` 를 맞추세요. 그 전에는 좌표 계산이 전부 어긋납니다.');
  }
  L.push('');
  return L.join('\n');
}

const games = fs.readdirSync('games').filter((g) => fs.existsSync(path.join('games', g, 'src', 'game.ts')));
const summary = [];
for (const g of games) {
  const d = scan(g);
  const c = classify(d);
  const file = path.join('games', g, 'CLAUDE.md');
  const marker = '## 화면비 대응 표준 (필수)';
  let body = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (body.includes(marker)) body = body.slice(0, body.indexOf(marker)).trimEnd() + '\n'; // 재실행 시 갱신
  const next = (body ? body.trimEnd() + '\n\n' : '') + section(d);
  fs.writeFileSync(file, next, 'utf8');
  summary.push(`${c.icon} ${g.padEnd(14)} ${c.label}${c.wMax ? `  (wMax ${c.wMax})` : ''}`);
}
console.log(summary.sort().join('\n'));
console.log('\n기록한 파일: ' + games.length + '개 games/*/CLAUDE.md');
