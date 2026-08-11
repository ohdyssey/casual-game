/**
 * PWA 아이콘 생성 — `public/icons/` 에 192/512/512-maskable PNG 를 만든다.
 *
 * MS Store(PWA) 제출에 아이콘이 필수인데 게임 에셋에는 앱 아이콘이 없어서, 게임 정체성
 * (네온 다크 배경 + 시안 O / 핑크 X + 3×3 그리드)을 코드로 그려 낸다.
 * 디자이너 아이콘이 나오면 이 스크립트 대신 그 파일을 `public/icons/` 에 넣으면 된다.
 *
 * 실행: npm run icons   (레포 루트 devDependency 인 sharp 사용)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT_DIR = fileURLToPath(new URL('../public/icons/', import.meta.url));

const BG = '#0A0714';
const CYAN = '#27C4FF';
const PINK = '#FF2E7E';
const GRID = '#3A2E6B';

/**
 * 아이콘 SVG.
 * @param {number} size 캔버스 한 변(px)
 * @param {number} contentScale 내용물 비율 — maskable 은 안전영역(중앙 원) 안에 들어가게 줄인다.
 */
function iconSvg(size, contentScale) {
  const c = size / 2;
  const box = size * 0.62 * contentScale; // 3×3 그리드 한 변
  const cell = box / 3;
  const left = c - box / 2;
  const top = c - box / 2;
  const lw = Math.max(2, size * 0.018); // 그리드 선 두께
  const sw = Math.max(3, size * 0.032); // 말 획 두께

  // 그리드 내부 선 4개(가로 2 + 세로 2).
  const lines = [1, 2]
    .flatMap((i) => [
      `<line x1="${left + cell * i}" y1="${top}" x2="${left + cell * i}" y2="${top + box}" />`,
      `<line x1="${left}" y1="${top + cell * i}" x2="${left + box}" y2="${top + cell * i}" />`,
    ])
    .join('');

  // O = 좌상단 칸, X = 정중앙 칸. 글로우는 넓고 옅은 획을 아래 깔아 흉내낸다.
  const oc = { x: left + cell * 0.5, y: top + cell * 0.5 };
  const xc = { x: left + cell * 1.5, y: top + cell * 1.5 };
  const r = cell * 0.3;
  const h = cell * 0.28;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <g stroke="${GRID}" stroke-width="${lw}" stroke-linecap="round" opacity="0.9">${lines}</g>
  <g fill="none" stroke-linecap="round">
    <circle cx="${oc.x}" cy="${oc.y}" r="${r}" stroke="${CYAN}" stroke-width="${sw * 2.4}" opacity="0.22"/>
    <circle cx="${oc.x}" cy="${oc.y}" r="${r}" stroke="${CYAN}" stroke-width="${sw}"/>
    <g stroke="${PINK}" stroke-width="${sw * 2.4}" opacity="0.22">
      <line x1="${xc.x - h}" y1="${xc.y - h}" x2="${xc.x + h}" y2="${xc.y + h}"/>
      <line x1="${xc.x + h}" y1="${xc.y - h}" x2="${xc.x - h}" y2="${xc.y + h}"/>
    </g>
    <g stroke="${PINK}" stroke-width="${sw}">
      <line x1="${xc.x - h}" y1="${xc.y - h}" x2="${xc.x + h}" y2="${xc.y + h}"/>
      <line x1="${xc.x + h}" y1="${xc.y - h}" x2="${xc.x - h}" y2="${xc.y + h}"/>
    </g>
  </g>
</svg>`;
}

async function render(name, size, contentScale) {
  const svg = iconSvg(size, contentScale);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(new URL(name, `file://${OUT_DIR.replace(/\\/g, '/')}`), png);
  return `${name} (${size}×${size}, ${(png.length / 1024).toFixed(1)}KB)`;
}

await mkdir(OUT_DIR, { recursive: true });
const made = [
  await render('icon-192.png', 192, 1),
  await render('icon-512.png', 512, 1),
  // maskable 안전영역 = 중앙 80% 원. 내용물을 더 줄여 잘려도 온전히 보이게 한다.
  await render('icon-512-maskable.png', 512, 0.72),
];
console.log('PWA 아이콘 생성 완료:\n  ' + made.join('\n  '));
