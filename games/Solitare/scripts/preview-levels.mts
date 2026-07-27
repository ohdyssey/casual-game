/**
 * preview-levels.mts — 생성된 레벨 JSON → 겹침/비겹침이 한눈에 구분되는 HTML 프리뷰.
 * 사용: npx tsx scripts/preview-levels.mts <출력.html> <레벨.json> [레벨2.json ...]
 */
import fs from 'node:fs';

interface Slot { x: number; y: number; layer: number; face?: string }
interface LevelDoc { name: string; slots: Slot[]; deal?: { stock?: unknown[] } }

const outPath = process.argv[2];
const files = process.argv.slice(3);
if (!outPath || files.length === 0) { console.error('사용: preview-levels.mts <출력.html> <레벨.json> ...'); process.exit(1); }

const levels = new Map<number, LevelDoc>();
for (const f of files) {
  const parsed = JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, LevelDoc> | { levels: Record<string, LevelDoc> };
  const src = 'levels' in parsed ? parsed.levels : parsed;
  for (const [k, v] of Object.entries(src)) levels.set(Number(k), v);
}
const keys = [...levels.keys()].sort((a, b) => a - b);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const figures = keys.map((lv) => {
  const doc = levels.get(lv)!;
  const slots = [...doc.slots].sort((a, b) => a.layer - b.layer);
  const openN = doc.slots.filter((s) => s.face !== 'fold').length;
  const body = slots.map((s) => {
    const open = s.face !== 'fold';
    const fill = open ? 'var(--open-fill)' : 'var(--cover-fill)';
    const stroke = open ? 'var(--open-line)' : 'var(--cover-line)';
    const text = open ? 'var(--open-ink)' : 'var(--cover-ink)';
    return `<g transform="translate(${s.x} ${s.y})"><rect x="-60" y="-82" width="120" height="164" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="4"/><text y="10" font-size="26" text-anchor="middle" fill="${text}" font-weight="700">${s.layer}</text></g>`;
  }).join('');
  const [num, ...rest] = doc.name.split('. ');
  const title = rest.join('. ') || doc.name;
  return `<figure class="lvl"><figcaption><span class="lvl-num">${esc(num)}</span><span class="lvl-name">${esc(title)}</span><span class="lvl-stat">카드 ${doc.slots.length} · 오픈 ${openN} · 스톡 ${doc.deal?.stock?.length ?? '-'}</span></figcaption><svg viewBox="0 0 1080 2400" preserveAspectRatio="xMidYMid meet"><rect width="1080" height="2400" fill="var(--board)"/><line x1="540" y1="0" x2="540" y2="2400" stroke="var(--axis)" stroke-width="2" stroke-dasharray="12 12"/>${body}</svg></figure>`;
}).join('\n');

const finalHtml = `<title>셀 조립 레벨 — 겹침/비겹침 진단</title>
<style>
:root{
  --bg:#0b0e16; --panel:#151a28; --line:#252d42; --text:#eef1f8; --muted:#8790a8;
  --board:#0e111a; --axis:#2a3350;
  --open-fill:#f2f5fc; --open-line:#e0453e; --open-ink:#b8332c; --open-glow:rgba(224,69,62,.35);
  --cover-fill:rgba(56,116,208,.52); --cover-line:#1f4b8f; --cover-ink:#dbe7ff;
}
:root[data-theme="light"]{
  --bg:#eef1f7; --panel:#fff; --line:#dde3ef; --text:#151a28; --muted:#5b6478;
  --board:#f6f8fc; --axis:#c6cfe2;
  --open-fill:#fff; --open-line:#d33a33; --open-ink:#b8332c; --open-glow:rgba(211,58,51,.18);
  --cover-fill:rgba(56,116,208,.28); --cover-line:#2e6ec4; --cover-ink:#1b3f74;
}
@media (prefers-color-scheme: light){
  :root:not([data-theme="dark"]){
    --bg:#eef1f7; --panel:#fff; --line:#dde3ef; --text:#151a28; --muted:#5b6478;
    --board:#f6f8fc; --axis:#c6cfe2;
    --open-fill:#fff; --open-line:#d33a33; --open-ink:#b8332c; --open-glow:rgba(211,58,51,.18);
    --cover-fill:rgba(56,116,208,.28); --cover-line:#2e6ec4; --cover-ink:#1b3f74;
  }
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,'Segoe UI',ui-sans-serif,system-ui,sans-serif}
.wrap{max-width:1500px;margin:0 auto;padding:40px 24px 80px}
header{display:flex;flex-direction:column;gap:18px;margin-bottom:30px}
h1{margin:0;font-size:27px;font-weight:800;letter-spacing:-.01em;text-wrap:balance}
.sub{margin:0;color:var(--muted);font-size:14.5px;line-height:1.65;max-width:84ch}
.legend{display:flex;flex-wrap:wrap;gap:14px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 18px}
.legend-item{display:flex;align-items:center;gap:10px;font-size:14px}
.sw{width:32px;height:44px;border-radius:5px;flex:none}
.sw.open{background:var(--open-fill);border:3px solid var(--open-line);box-shadow:0 0 0 4px var(--open-glow)}
.sw.cover{background:var(--cover-fill);border:3px solid var(--cover-line)}
.lab b{display:block;font-weight:700}
.lab span{color:var(--muted);font-size:12.5px}
.sep{width:1px;height:32px;background:var(--line)}
.note{font-size:12.5px;color:var(--muted);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:16px}
.lvl{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
.lvl svg{display:block;width:100%;height:auto;border-top:1px solid var(--line)}
figcaption{padding:11px 13px 9px;display:flex;flex-direction:column;gap:3px}
.lvl-num{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:var(--open-line);font-weight:700}
.lvl-name{font-weight:600;font-size:12.5px;line-height:1.35;word-break:break-all}
.lvl-stat{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:var(--muted)}
footer{margin-top:34px;color:var(--muted);font-size:12.5px;line-height:1.7}
footer code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--bg);border:1px solid var(--line);padding:1px 6px;border-radius:4px}
</style>
<div class="wrap">
<header>
  <h1>셀 조립 레벨 — 겹침 / 비겹침 진단</h1>
  <p class="sub">작은 셀(117종)을 세로로 쌓아 <b>그룹</b>을 만들고, 그룹을 좌우대칭으로 배치해 만든 레벨입니다.
  모든 카드는 열 60px · 행 82px 공용 격자 위에 놓이고 <b>레이어는 행에서만 유도</b>되므로,
  겹치는 두 카드는 반드시 위 카드가 아래 카드를 덮습니다 — 즉 <b>위에 카드가 있으면 아래 카드는 절대 오픈되지 않습니다.</b>
  점선은 좌우대칭축입니다.</p>
  <div class="legend">
    <div class="legend-item"><span class="sw open"></span><span class="lab"><b>겹치지 않음 (오픈)</b><span>위에 덮는 카드가 없음 — 지금 뽑을 수 있음</span></span></div>
    <div class="sep"></div>
    <div class="legend-item"><span class="sw cover"></span><span class="lab"><b>겹침 (폴드)</b><span>위 카드에 가려짐 — 위를 먼저 치워야 열림</span></span></div>
    <div class="sep"></div>
    <div class="note">숫자 = 레이어(클수록 위)</div>
  </div>
</header>
<div class="grid">
${figures}
</div>
<footer>레벨 ${keys.length}개 · 셀 라이브러리 117종 · 제목의 <code>골격·셀-셀-셀|셀</code> 은 어떤 셀을 쌓아 만들었는지를 뜻합니다(<code>-</code>=세로로 쌓음, <code>|</code>=다른 그룹).</footer>
</div>`;

fs.writeFileSync(outPath, finalHtml, 'utf8');
console.log(`프리뷰 생성 — ${keys.length}레벨 → ${outPath}`);
