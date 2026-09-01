/**
 * merge-level-parts.mts — build-cells-range.mts 가 구간별로 뱉은 조각 JSON 들을 하나의
 * cardLevels.json 팩으로 합친다(조각 파일은 동시쓰기 경합을 피하려고 나눠 쓴 것 — 병합은 마지막에 한 번).
 *
 * 사용: npx tsx scripts/merge-level-parts.mts <조각디렉터리> <출력경로>
 * 레벨 번호가 겹치면 **에러로 멈춘다**(조용한 덮어쓰기 금지 — 구간이 겹쳐 생성된 사고를 즉시 드러낸다).
 */
import fs from 'node:fs';
import path from 'node:path';

const [dir, outPath] = process.argv.slice(2);
if (!dir || !outPath) {
  console.error('사용: merge-level-parts.mts <조각디렉터리> <출력경로>');
  process.exit(1);
}

const levels: Record<string, unknown> = {};
const owner = new Map<string, string>();
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const part = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Record<string, unknown>;
  for (const [lv, doc] of Object.entries(part)) {
    const prev = owner.get(lv);
    if (prev) throw new Error(`레벨 ${lv} 중복 — ${prev} 와 ${f} 가 같은 레벨을 생성했다`);
    owner.set(lv, f);
    levels[lv] = doc;
  }
}
const keys = Object.keys(levels).map(Number).sort((a, b) => a - b);
const ordered: Record<string, unknown> = {};
for (const k of keys) ordered[String(k)] = levels[String(k)];
fs.writeFileSync(outPath, JSON.stringify({ kind: 'cardBoard', levels: ordered }, null, 2) + '\n', 'utf8');
console.log(`병합 ${keys.length} 레벨 (lv${keys[0]}~lv${keys[keys.length - 1]}) → ${outPath}`);
const missing = keys.length ? Array.from({ length: keys[keys.length - 1] }, (_, i) => i + 1).filter((n) => !(String(n) in ordered)) : [];
if (missing.length) console.warn(`⚠️ 빠진 레벨 ${missing.length}개: ${missing.slice(0, 20).join(',')}${missing.length > 20 ? '…' : ''}`);
