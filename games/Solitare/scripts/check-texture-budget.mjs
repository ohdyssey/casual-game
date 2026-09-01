/**
 * check-texture-budget — **텍스처 메모리 예산 게이트**.
 *
 * 왜: 2026-08-27 아이폰 크래시의 첫 신호는 **사용자의 폰이 죽는 것**이었다. 그 전까지 아무도 몰랐다 —
 *   용량 대시보드는 WebP 라 "최적화됨"으로 보였고(압축은 다운로드만 줄인다), 텍스처 메모리를 보는
 *   눈이 어디에도 없었다. 그림은 앞으로 계속 늘어나므로, **넘으면 빌드가 먼저 실패해야 한다.**
 *
 * 재는 것(디코드 RGBA = 가로×세로×4):
 *   · 부팅 상주  = 매니페스트 − 미사용 − 화면 그룹
 *   · 그룹 상주  = assetBudget.BUDGET_BYTES 로 상한이 걸린다(런타임이 넘으면 내린다)
 *   · 최악 총량  = 부팅 + 예산
 *
 * ⚠️ 여기 한도는 "안전하다고 확인된 값"이 아니다 — iOS 웹콘텐츠 프로세스의 실제 한도는 기기·인앱
 *   브라우저마다 다르고 공개돼 있지 않다. **넘지 않기로 정한 선**이고, 근거가 생기면 조정할 값이다.
 *
 * 실행: `npm run check:budget` (CI·배포 전).
 */
import fs from 'node:fs';
import path from 'node:path';

/** 부팅에 항상 올라가 있어도 된다고 정한 상한. */
/*
 * ⚠️ **한도는 "실제 총량" 기준으로 재설정했다**(2026-08-31). 예전 160/208 은 게이트가 **매니페스트만 세던**
 *   시절의 값이라, 매니페스트 밖(아이템샵·부지 층·점원·컬렉션 카드·손님 시트 ≈50MB)이 빠진 착시였다.
 *   지금은 GPU 에 실제로 올라가는 것을 전부 센다 — 같은 빌드가 156MB → 212MB 로 보이는 이유가 이것이다.
 *   새 한도는 그 차이(+52MB)를 반영한 값이다. iOS 실측 사고(2026-08-27)는 이 기준으로 350MB 대였다.
 */
const BOOT_LIMIT = 220 * 1024 * 1024;
/** 부팅 + 그룹 예산의 최악 합계 상한. */
const TOTAL_LIMIT = 270 * 1024 * 1024;

const manifest = JSON.parse(fs.readFileSync('public/ui-assets.json', 'utf8'));
const unused = new Set(fs.existsSync('unused-assets.json') ? JSON.parse(fs.readFileSync('unused-assets.json', 'utf8')).keys : []);
const groupsSrc = fs.readFileSync('src/ui/generated/assetGroups.ts', 'utf8');
const grouped = new Set([...groupsSrc.matchAll(/'(up_[^']+)'/g)].map((m) => m[1]));
const budget = Number(/export const BUDGET_BYTES = (\d+) \* 1024 \* 1024;/.exec(fs.readFileSync('src/ui/assetBudget.ts', 'utf8'))?.[1] ?? 0) * 1024 * 1024;

/** 배포본 기준을 쓰고 싶으면 --deploy <dir>. 없으면 원본(=상한)으로 잰다. */
const argv = process.argv.slice(2);
const deployIdx = argv.indexOf('--deploy');
/*
 * ⚠️ **기준은 배포본이다.** `public` 은 다이어트 전 원본이라 늘 한도를 넘는다(리사이즈·미사용 제거가
 *   배포 조립에서 일어난다). 그걸 모르고 보면 "고쳐도 안 줄어든다"로 읽힌다.
 *   그래서 `deploy/solitaire` 가 있으면 **그걸 기본으로** 쓰고, 없을 때만 원본으로 떨어진다.
 */
const DEPLOY_DEFAULT = '../../deploy/solitaire';
const root = deployIdx >= 0 && argv[deployIdx + 1]
  ? argv[deployIdx + 1]
  : (fs.existsSync(DEPLOY_DEFAULT) ? DEPLOY_DEFAULT : 'public');
const preDiet = root === 'public';

function size(rel) {
  const p = path.join(root, rel);
  for (const cand of [p, p.replace(/\.png$/i, '.webp')]) {
    try {
      const b = fs.readFileSync(cand);
      if (b.slice(1, 4).toString() === 'PNG') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
      // WebP(VP8X/VP8L/VP8) 크기 파싱.
      if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') {
        const fourcc = b.slice(12, 16).toString();
        if (fourcc === 'VP8X') return { w: (b.readUIntLE(24, 3) & 0xffffff) + 1, h: (b.readUIntLE(27, 3) & 0xffffff) + 1 };
        if (fourcc === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
        if (fourcc === 'VP8L') {
          const bits = b.readUInt32LE(21);
          return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
        }
      }
    } catch { /* 다음 후보 */ }
  }
  return null;
}

// **ASTC 표**(배포 조립본에만 — `python scripts/encode-astc.py --deploy <root>` 산출) — 있으면 그 키는 GPU 압축 크기로 센다.
//   RGBA 는 w×h×4 지만 ASTC 6×6 은 1/9, 4×4 는 1/4 다. 표가 없으면(원본·굽기 전) 전부 RGBA.
const astcPath = path.join(root, 'ui-assets-astc.json');
const astc = fs.existsSync(astcPath) ? JSON.parse(fs.readFileSync(astcPath, 'utf8')) : {};
let boot = 0, groupBytes = 0, missing = 0, astcN = 0, astcSaved = 0;
/*
 * ⚠️ **매니페스트 밖(수동 이식) 업로드와 손님 시트도 센다**(2026-08-31). 아이템샵(8.2MB)·부지 층·점원·컬렉션
 *   카드가 여기 속하는데, 예전에는 매니페스트만 세서 **줄여도 게이트 수치가 안 변했다**(그래서 상한만 계속
 *   낮추는 잘못된 조정을 했다). 실제 GPU 에 올라가는 것을 그대로 세는 것이 이 게이트의 목적이다.
 */
const extra = [];
{
  const up = path.join(root, 'ui', 'uploads');
  if (fs.existsSync(up)) {
    for (const f of fs.readdirSync(up)) {
      const m = /^(.+)\.(png|webp)$/i.exec(f);
      if (!m) continue;
      const k = m[1];
      if (manifest[k] || unused.has(k)) continue;
      extra.push([k, `ui/uploads/${f}`]);
    }
  }
  const cust = path.join(root, 'customers');
  if (fs.existsSync(cust)) {
    for (const f of fs.readdirSync(cust)) if (/\.(png|webp)$/i.test(f)) extra.push(['cust:' + f, `customers/${f}`]);
  }
}
for (const [k, rel] of [...Object.entries(manifest), ...extra]) {
  if (unused.has(k)) continue;
  const d = size(rel);
  if (!d) { missing++; continue; }
  let bytes = d.w * d.h * 4;
  if (astc[k]?.bytes) { astcN++; astcSaved += bytes - astc[k].bytes; bytes = astc[k].bytes; }
  if (grouped.has(k)) groupBytes += bytes;
  else boot += bytes;
}

const mb = (n) => (n / 1048576).toFixed(0);
const worst = boot + Math.min(groupBytes, budget);
console.log(`텍스처 메모리 (${root} 기준${missing ? ` · 크기 못 읽음 ${missing}장` : ''})`);
if (!preDiet) console.log('  (deploy/ 는 **직전 조립본**이다 — 방금 고친 것을 보려면 `npm run deploy:live` 를 다시 돌릴 것)');
if (preDiet) {
  console.log('  ⚠ 배포본이 없어 **다이어트 전 원본**으로 쟀다 — 실제 배포 수치보다 크게 나온다.');
  console.log('    정확히 보려면 `npm run deploy:live` 뒤 다시 돌리거나 `--deploy <경로>` 를 줄 것.');
}
if (astcN) console.log(`  ASTC 적용   ${astcN}장 (RGBA 대비 −${mb(astcSaved)} MB)`);
console.log(`  부팅 상주   ${mb(boot).padStart(4)} MB  / 한도 ${mb(BOOT_LIMIT)} MB`);
console.log(`  화면 그룹   ${mb(groupBytes).padStart(4)} MB  → 런타임 예산 ${mb(budget)} MB 로 제한됨`);
console.log(`  최악 총량   ${mb(worst).padStart(4)} MB  / 한도 ${mb(TOTAL_LIMIT)} MB`);

const fail = [];
if (boot > BOOT_LIMIT) fail.push(`부팅 상주 ${mb(boot)}MB > ${mb(BOOT_LIMIT)}MB`);
if (worst > TOTAL_LIMIT) fail.push(`최악 총량 ${mb(worst)}MB > ${mb(TOTAL_LIMIT)}MB`);
if (fail.length) {
  console.error(`\n✗ 예산 초과: ${fail.join(' · ')}`);
  console.error('  줄이는 길은 셋뿐이다 — 해상도(diet-hints)·미사용 제거(unused-assets)·화면 그룹으로 빼기(gen-asset-groups).');
  process.exit(1);
}
console.log('\n✓ 예산 이내');
