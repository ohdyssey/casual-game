/**
 * diet-assets — 배포본(deploy/<game>/)의 업로드 이미지를 WebP 로 경량화한다.
 *
 * ⚠️ 비파괴: 이 모듈은 **deploy 복사본만** 건드린다. games/<game>/public 의 원본 PNG·
 *   디자이너 SSOT(main.json·ui-assets.json)는 절대 수정하지 않는다(assemble-deploy 가 dist→deploy
 *   복사한 뒤 호출).
 *
 * 변환 수준(사전 합의):
 *  - 리사이즈: main.json 표시노드가 있는 이미지만, **표시 footprint × 2 상한**으로 축소(그 이상은
 *    물리픽셀에 절대 안 닿음 → 육안 손실 0). 표시노드가 없는 시트/심볼/폰트/로비는 리사이즈 안 함
 *    (스프라이트 시트 프레임 슬라이싱 보호).
 *  - WebP: 기본 **무손실**(lossless, 색상 0 변경). **불투명 + 대형(사진형)만 near-lossless(q90)** —
 *    육안 무손실·색차 미세.
 *  - ⭐**풀스크린 배경**(레이아웃 프레임을 가로·세로 모두 거의 꽉 채우는 노드 = 스테이지/씬 배경)은
 *    near-lossless 가 아니라 **손실 WebP(q82) + 긴 변 상한 다운스케일**. 사진형 배경에서 near-lossless 는
 *    원본의 ~65% 밖에 못 줄이지만(거대), 손실 q82 는 ~8%로 동급 화질에 ~10배 작다. 100 스테이지처럼
 *    배경이 핵심 용량일 때 지배적 레버. 명명(up_StageNNN_BG_*)에 의존하지 않고 "프레임을 꽉 채우는
 *    노드"로 검출 → 스테이지 추가 시 자동 적용. (배경 위 작은 장식/오브젝트 스프라이트는 영향 없음.)
 *  - 변환 후 .png 삭제, ui-assets.json 경로 .png→.webp 재작성(배포본만).
 */
import sharp from 'sharp';
import { readdir, readFile, writeFile, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

/** 표시 footprint 대비 보존할 최대 소스 배율. 2 = 어떤 고DPR 폰에서도 충분(육안 무손실). */
const RESIZE_CAP = 2.0;
/** 이 px 이상 최소변 + 불투명 = 사진형으로 보고 near-lossless 허용. */
const PHOTO_MIN_DIM = 512;
/** near-lossless 품질(높을수록 무손실에 가까움). */
const PHOTO_QUALITY = 90;

/** 풀스크린 배경 검출 — 노드가 레이아웃 프레임을 가로·세로 모두 이 비율 이상 덮으면 '배경'(손실+다운스케일 대상). */
const BG_COVER_FRAC = 0.9;
/** 배경 다운스케일 상한(긴 변, px) — 1080×2400 캔버스 대비 ~7% 헤드룸. 이 이상 해상도는 표시에 안 닿음. */
const BG_MAX_LONG_EDGE = 2560;
/** 배경 WebP 품질(손실) — 사진형 배경은 q82 가 육안 무손실에 가깝고 near-lossless 대비 ~10배 작다. */
const BG_QUALITY = 82;

const exists = (p) => stat(p).then(() => true).catch(() => false);

/**
 * ui/layouts/*.json 전체를 훑어 두 가지를 산출. 디렉터리 없거나 전부 파싱 실패 시 빈 결과.
 *  - dmap: 키 → **모든 레이아웃에 걸친 최대** 표시 footprint(image.key / rect.fillImage) — 리사이즈 상한 산정.
 *  - bgKeys: 레이아웃 프레임을 가로·세로 모두 BG_COVER_FRAC 이상 덮는 **풀스크린 노드** 키 집합
 *            (스테이지/씬 배경 후보). 명명 규칙에 의존하지 않아 스테이지 추가 시 자동 검출.
 *            ⚠️실제 손실-배경 처리 여부는 변환 시점에 **불투명** 조건까지 본다(투명 UI 프레임 제외).
 *
 * (이전엔 main.json 한 장만 봤으나, 스테이지 배경은 blank_3.json 등 별도 레이아웃에 있어 전체 스캔으로 확장.)
 */
async function scanLayouts(layoutsDir) {
  const dmap = new Map();
  const bgKeys = new Set();
  if (!(await exists(layoutsDir))) return { dmap, bgKeys };
  let files;
  try {
    files = (await readdir(layoutsDir)).filter((f) => f.toLowerCase().endsWith('.json'));
  } catch {
    return { dmap, bgKeys };
  }
  for (const file of files) {
    let doc;
    try {
      doc = JSON.parse(await readFile(join(layoutsDir, file), 'utf8'));
    } catch {
      continue; // 손상된 레이아웃 한 장이 전체 다이어트를 막지 않게
    }
    const fw = doc.frame?.designW ?? 0;
    const fh = doc.frame?.designH ?? 0;
    for (const n of doc.nodes ?? []) {
      const key = n.type === 'image' ? n.key : n.fillImage || null;
      if (!key || !n.w || !n.h) continue;
      const cur = dmap.get(key) ?? { w: 0, h: 0 };
      dmap.set(key, { w: Math.max(cur.w, n.w), h: Math.max(cur.h, n.h) });
      // 프레임을 가로·세로 모두 거의 꽉 채우는 노드 = 풀스크린 배경.
      if (fw > 0 && fh > 0 && n.w >= fw * BG_COVER_FRAC && n.h >= fh * BG_COVER_FRAC) bgKeys.add(key);
    }
  }
  return { dmap, bgKeys };
}

/**
 * deploy/<game> 디렉터리의 ui/uploads/*.png 를 WebP 로 변환(비파괴: 이 복사본 한정).
 * @param {string} deployGameDir 예: <out>/socialcasino
 * @returns {Promise<{files:number,before:number,after:number,resized:number,photos:number,backgrounds:number}|null>}
 */
export async function dietGameUploads(deployGameDir) {
  const uploadsDir = join(deployGameDir, 'ui/uploads');
  if (!(await exists(uploadsDir))) return null;

  const { dmap, bgKeys } = await scanLayouts(join(deployGameDir, 'ui/layouts'));
  const pngs = (await readdir(uploadsDir)).filter((f) => f.toLowerCase().endsWith('.png'));

  let before = 0;
  let after = 0;
  let resized = 0;
  let photos = 0;
  let backgrounds = 0;

  for (const file of pngs) {
    const src = join(uploadsDir, file);
    const key = file.replace(/\.png$/i, '');
    const srcSize = (await stat(src)).size;
    const meta = await sharp(src).metadata();

    let pipe = sharp(src);

    const disp = dmap.get(key);
    const isSheet = /_sheet$/i.test(key);
    // 풀스크린 배경 = 프레임을 꽉 채우고 + **불투명** + 시트 아님.
    //   불투명 조건으로 투명 UI 프레임/오버레이(예: 상점 패널)를 손실 압축에서 제외 → 경계 아티팩트 방지(fail-safe).
    //   사진형 스테이지 배경은 전부 불투명이라 use case 는 그대로 잡힌다.
    const isBg = bgKeys.has(key) && !isSheet && !meta.hasAlpha;

    // 리사이즈.
    if (isBg) {
      // 풀스크린 배경: 표시 footprint(=프레임)에 맞춰 **긴 변 BG_MAX_LONG_EDGE** 로 상한. 그 이상 해상도는 화면에 안 닿음.
      if (Math.max(meta.width, meta.height) > BG_MAX_LONG_EDGE) {
        pipe = pipe.resize({ width: BG_MAX_LONG_EDGE, height: BG_MAX_LONG_EDGE, fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' });
        resized++;
      }
    } else if (disp && !isSheet) {
      // 일반 표시노드: 표시 footprint × 2 상한 초과분만 축소.
      const capW = Math.ceil(disp.w * RESIZE_CAP);
      const capH = Math.ceil(disp.h * RESIZE_CAP);
      if (meta.width > capW || meta.height > capH) {
        pipe = pipe.resize({ width: capW, height: capH, fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' });
        resized++;
      }
    }

    // WebP 품질: 배경=손실(q82, ~10배↓) / 사진형(비배경)=near-lossless / 그 외=무손실(색상 0 변경).
    let webpOpts;
    let isPhoto = false;
    if (isBg) {
      backgrounds++;
      webpOpts = { quality: BG_QUALITY, effort: 6 };
    } else {
      isPhoto = !meta.hasAlpha && Math.min(meta.width, meta.height) >= PHOTO_MIN_DIM;
      if (isPhoto) photos++;
      webpOpts = isPhoto
        ? { nearLossless: true, quality: PHOTO_QUALITY, effort: 6 }
        : { lossless: true, effort: 6 };
    }

    const buf = await pipe.webp(webpOpts).withMetadata().toBuffer();
    await writeFile(join(uploadsDir, `${key}.webp`), buf);
    await unlink(src);

    before += srcSize;
    after += buf.length;
  }

  // 매니페스트 경로 .png → .webp (배포본만).
  const manifestPath = join(deployGameDir, 'ui-assets.json');
  if (await exists(manifestPath)) {
    const man = JSON.parse(await readFile(manifestPath, 'utf8'));
    for (const k of Object.keys(man)) {
      if (typeof man[k] === 'string') man[k] = man[k].replace(/\.png$/i, '.webp');
    }
    await writeFile(manifestPath, JSON.stringify(man, null, 2), 'utf8');
  }

  return { files: pngs.length, before, after, resized, photos, backgrounds };
}

// ── 스프라이트 시트 다이어트 ──────────────────────────────────────────────

/**
 * 스프라이트 시트 WebP 품질. 시트는 화면에 프레임 단위로 **축소돼** 그려지므로(예: 홈런팝 전광판
 * 957×720 프레임 → 441×332 표시) 손실 압축이 육안에 드러나지 않는다. 실제 표시 크기로 원본과
 * 나란히 비교해 차이가 안 보이는 선에서 잡았다(2026-08-03 실측).
 */
const SHEET_QUALITY = 80;

/**
 * deploy/<game>/ui/sprites/sheets/* 를 WebP(SHEET_QUALITY)로 재인코딩한다.
 *
 * 왜 uploads 다이어트와 따로 두는가 — uploads 쪽은 ui-assets.json 경로를 .png→.webp 로 재작성하는데,
 * 게임이 그 매니페스트를 안 거치고 파일을 직접 참조하는 곳이 있으면(예: 홈런팝 index.html 의
 * NO ADS 버튼 `<img src="/ui/uploads/....png">`) 그대로 깨진다. 그래서 게임별 배선 확인이 끝난
 * 곳만 켜는 allowlist 를 쓴다. 반면 시트는 **스프라이트 문서(source.path)만** 가리키고, 그 문서도
 * 배포본에 같이 복사되므로 여기서 경로까지 한꺼번에 고쳐 주면 자기완결적이다.
 *
 * ⚠️ **리사이즈는 하지 않는다** — 시트는 문서의 rects(절대 픽셀)로 프레임을 잘라내므로 크기를
 *    바꾸면 슬라이싱이 통째로 어긋난다. 압축률만 조정한다.
 * ⚠️ 비파괴 — deploy 복사본만 건드린다(원본 public/ 은 그대로).
 *
 * @param {string} deployGameDir 예: <out>/homerun
 * @returns {Promise<{files:number,before:number,after:number,converted:number}|null>}
 */
export async function dietGameSheets(deployGameDir) {
  const sheetsDir = join(deployGameDir, 'ui/sprites/sheets');
  if (!(await exists(sheetsDir))) return null;

  const names = (await readdir(sheetsDir)).filter((f) => /\.(png|webp|jpe?g)$/i.test(f));
  let before = 0;
  let after = 0;
  let converted = 0;
  /** 확장자가 바뀐 파일: 원래 이름 → 새 이름(스프라이트 문서 경로 재작성용). */
  const renamed = new Map();

  for (const file of names) {
    const src = join(sheetsDir, file);
    const srcSize = (await stat(src)).size;
    let buf;
    try {
      // ⚠️ 파일 경로를 sharp 에 그대로 주면 안 된다 — 입력이 이미 .webp 인 시트는 같은 이름으로
      //    덮어쓰는데, 윈도우에서 sharp 가 원본 핸들을 쥔 채라 쓰기가 EPERM/UNKNOWN 으로 죽는다.
      //    먼저 버퍼로 읽어 파일을 닫고 변환한다.
      buf = await sharp(await readFile(src)).webp({ quality: SHEET_QUALITY, effort: 4 }).toBuffer();
    } catch {
      before += srcSize;
      after += srcSize;
      continue; // 한 장 실패가 배포를 막지 않게 — 원본 그대로 둔다.
    }
    // 이미 잘 압축된 시트라면 커질 수도 있다 — 그럴 땐 원본을 유지한다(fail-safe).
    if (buf.length >= srcSize) {
      before += srcSize;
      after += srcSize;
      continue;
    }
    const outName = file.replace(/\.(png|jpe?g)$/i, '.webp');
    await writeFile(join(sheetsDir, outName), buf);
    if (outName !== file) {
      await unlink(src);
      renamed.set(file, outName);
    }
    before += srcSize;
    after += buf.length;
    converted++;
  }

  if (renamed.size) await rewriteSheetPaths(join(deployGameDir, 'ui/sprites'), renamed);
  return { files: names.length, before, after, converted };
}

/** 스프라이트 문서(ui/sprites/**\/*.json)의 source.path 를 새 파일명으로 고친다(배포본 한정). */
async function rewriteSheetPaths(spritesDir, renamed) {
  let entries;
  try {
    entries = await readdir(spritesDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(spritesDir, e.name);
    if (e.isDirectory()) {
      await rewriteSheetPaths(p, renamed);
      continue;
    }
    if (!e.name.toLowerCase().endsWith('.json')) continue;
    let text;
    try {
      text = await readFile(p, 'utf8');
    } catch {
      continue;
    }
    let changed = false;
    for (const [from, to] of renamed) {
      if (text.includes(from)) {
        text = text.split(from).join(to);
        changed = true;
      }
    }
    if (changed) await writeFile(p, text, 'utf8');
  }
}
