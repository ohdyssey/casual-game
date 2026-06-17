/**
 * 에셋 매니페스트 — DragonBeat 디자인 데이터(public/assets/)의 단일 등록처.
 * 물/파티클은 별도 아트 없이 런타임 Graphics 로 생성한다(P0).
 */
import type Phaser from 'phaser';

export const LOGO_KEY = 'logo';
/**
 * 강물 배경 — 에디터에 저장한 원근 수면 이미지(ui/uploads, 레인 줄무늬가 위 소실점으로 수렴).
 * 레이스에서 세로 스크롤하면 먼 물이 다가와 지나가는 전진감을 만든다.
 * (ui-assets.json 매니페스트가 이 키로 프리로드 — 미로드 시 절차적 WATER_KEY 폴백.)
 */
export const WATER_IMG_KEY = 'up_ChatGPT_Image_2026__6__12_____07_08_16';
/** 에디터(phaser-ui-editor) 산출물 — 레이아웃 JSON 캐시 키 + 업로드 매니페스트. */
export const UI_LAYOUT_KEY = 'ui_layout';
export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';
/** 스프라이트 문서 레지스트리(에디터) — 캐릭터별 등록 애니(노젓기/춤) 조회용. */
export const UI_SPRITE_INDEX_KEY = 'ui_sprite_index';
export const UI_SPRITE_INDEX_PATH = 'ui/sprites/_index.json';
/** 런타임 생성 텍스처 키. */
export const WATER_KEY = 'water_tile';
export const ROPE_KEY = 'lane_rope';
export const FINISH_KEY = 'finish_line';
export const SPARK_KEY = 'spark';
export const SPRAY_KEY = 'spray';
/**
 * Tier1 고품질 수면 — 절차적 placeholder. 실제 텍스처 제공 시 같은 키로 IMAGE_MANIFEST 에 추가하면
 * (이미 textures.exists → 절차 생성 스킵) 자동 교체된다. 베이스/포말은 seamless tileable.
 */
export const WATER_BASE_KEY = 'water_base'; // 무한 스크롤 베이스 물(이음매 없음)
export const WATER_FOAM_KEY = 'water_foam'; // 흐르는 흰 포말 오버레이(투명, ADD 블렌드)
export const SPLASH_KEY = 'splash_drop'; // 노 스트로크 물보라 입자(부드러운 물방울)
export const WAKE_KEY = 'bow_wake'; // 뱃머리 항적 포말
export const VIGNETTE_KEY = 'water_vignette'; // 가장자리 비네트(집중·깊이)
/** 원근 뷰 — 수평선 배경(하늘/강둑/산), 수면 깊이 그라데이션, 돌진 포말 스트로크. 전부 swappable placeholder. */
export const BG_KEY = 'race_bg'; // 상단 수평선 배경(하늘+강둑+원경)
export const WATER_GRAD_KEY = 'water_grad'; // 수면 깊이 그라데이션(수평선쪽 어둡게)
export const FOAM_STREAK_KEY = 'foam_streak'; // 원근 포말 스트로크(가로 줄)
// ── 네온 듀얼 레인(리듬 노트 하이웨이) — 전부 흰색 베이스, 사용처에서 tint(좌 빨강/우 파랑) ──
export const NEON_GLOW_KEY = 'neon_glow'; // 부드러운 방사형 글로우(타깃 후광·스파클)
export const NEON_RING_KEY = 'neon_ring'; // 타깃 림(밝은 이중 링)
export const NEON_BURST_KEY = 'neon_burst'; // 타격 순간 별빛 폭발(스파이크)
export const NOTE_KEY = 'note_glyph'; // 음표 글리프(타격 시 분출되는 파티클)
// ── 노트 마커(가독성) — 컬러 디스크 + 흰 방향 화살표 + 홀드 꼬리 ──
export const MARK_DISC_KEY = 'mark_disc'; // 둥근 글로우 디스크(좌 빨강/우 파랑 tint)
export const ARROW_L_KEY = 'arrow_l'; // 흰 ◀ (왼쪽 북)
export const ARROW_R_KEY = 'arrow_r'; // 흰 ▶ (오른쪽 북)
export const HOLD_TAIL_KEY = 'hold_tail'; // 홀드(꾹누르기) 꼬리 막대(머리쪽 밝게)

// 보트·캐릭터(노젓기/춤)는 에디터 산출물(업로드 이미지 + 스프라이트 클립)로 대체 — 정적 크루 아트 없음.
const IMAGE_MANIFEST: ReadonlyArray<[key: string, path: string]> = [];

/** LoadScene.preload 에서 호출 — 정적 이미지 + 에디터 UI(레이아웃/업로드/스프라이트 레지스트리) 로드. */
export function loadGameAssets(scene: Phaser.Scene): void {
  for (const [key, path] of IMAGE_MANIFEST) {
    if (!scene.textures.exists(key)) scene.load.image(key, path);
  }
  // 에디터 UI — 레이아웃 JSON + 업로드 매니페스트(ui-assets.json)의 이미지 일괄 로드.
  scene.load.json(UI_LAYOUT_KEY, 'ui/layouts/main.json');
  scene.load.json(UI_MANIFEST_KEY, UI_MANIFEST_PATH);
  // 스프라이트 레지스트리 — 캐릭터 등록 애니(노젓기/춤) 해석용(실패해도 진행). 시트는 클립 런타임이 on-demand 로드.
  scene.load.json(UI_SPRITE_INDEX_KEY, UI_SPRITE_INDEX_PATH);
  scene.load.on(`filecomplete-json-${UI_MANIFEST_KEY}`, () => {
    const manifest = (scene.cache.json.get(UI_MANIFEST_KEY) ?? {}) as Record<string, string>;
    for (const [key, path] of Object.entries(manifest)) {
      if (key && path && !scene.textures.exists(key)) scene.load.image(key, path);
    }
  });
}

/** 물/레인/파티클 텍스처를 Graphics 로 생성 (아트 미지급분 대체, 멱등). */
export function ensureGeneratedTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(WATER_KEY)) {
    // 물 타일(128×128) — 베이스 블루 + 밝은 물결 호(가로 줄무늬). tileSprite 로 세로 스크롤.
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x1a9ed9, 1);
    g.fillRect(0, 0, 128, 128);
    g.fillStyle(0x35b2e8, 0.5);
    for (let row = 0; row < 4; row++) {
      const y = 16 + row * 32;
      for (let i = 0; i < 4; i++) {
        g.fillEllipse(16 + i * 36 + (row % 2) * 18, y, 26, 7);
      }
    }
    g.fillStyle(0x8fdcff, 0.35);
    for (let row = 0; row < 4; row++) {
      const y = 24 + row * 32;
      for (let i = 0; i < 3; i++) {
        g.fillEllipse(28 + i * 44 + ((row + 1) % 2) * 20, y, 16, 4);
      }
    }
    g.generateTexture(WATER_KEY, 128, 128);
    g.destroy();
  }
  if (!scene.textures.exists(ROPE_KEY)) {
    // 레인 로프(16×64) — 빨강/흰색 교대 부표 라인.
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xe63946, 1);
    g.fillRoundedRect(2, 0, 12, 32, 6);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(2, 32, 12, 32, 6);
    g.generateTexture(ROPE_KEY, 16, 64);
    g.destroy();
  }
  if (!scene.textures.exists(FINISH_KEY)) {
    // 결승선(640×48) — 체커보드 배너.
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 640, 48);
    g.fillStyle(0x222222, 1);
    for (let cx = 0; cx < 640 / 16; cx++) {
      for (let cy = 0; cy < 3; cy++) {
        if ((cx + cy) % 2 === 0) g.fillRect(cx * 16, cy * 16, 16, 16);
      }
    }
    g.generateTexture(FINISH_KEY, 640, 48);
    g.destroy();
  }
  if (!scene.textures.exists(SPARK_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xfff3b0, 1);
    g.fillCircle(6, 6, 5);
    g.generateTexture(SPARK_KEY, 12, 12);
    g.destroy();
  }
  if (!scene.textures.exists(SPRAY_KEY)) {
    // 물보라 입자 — 흰 원, 파티클 alpha/scale 로 스플래시 연출.
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xeafbff, 1);
    g.fillCircle(5, 5, 4);
    g.generateTexture(SPRAY_KEY, 10, 10);
    g.destroy();
  }

  // ── Tier1 고품질 수면 텍스처 (절차적 placeholder — 실제 텍스처 제공 시 자동 대체) ──
  genWaterBase(scene, WATER_BASE_KEY);
  genWaterFoam(scene, WATER_FOAM_KEY);
  genSplash(scene, SPLASH_KEY);
  genWake(scene, WAKE_KEY);
  genVignette(scene, VIGNETTE_KEY, scene.scale.width, scene.scale.height);
  genBackground(scene, BG_KEY, scene.scale.width, Math.round(scene.scale.height * 0.5));
  genWaterGradient(scene, WATER_GRAD_KEY);
  genFoamStreak(scene, FOAM_STREAK_KEY);

  // ── 네온 듀얼 레인 텍스처(리듬 노트 하이웨이) ──
  genNeonGlow(scene, NEON_GLOW_KEY);
  genNeonRing(scene, NEON_RING_KEY);
  genNeonBurst(scene, NEON_BURST_KEY);
  genNote(scene, NOTE_KEY);
  // ── 노트 마커(가독성) + 홀드 꼬리 ──
  genMarkDisc(scene, MARK_DISC_KEY);
  genArrow(scene, ARROW_L_KEY, 'left');
  genArrow(scene, ARROW_R_KEY, 'right');
  genHoldTail(scene, HOLD_TAIL_KEY);
}

/**
 * 노트 마커 디스크 — 솔리드 컬러 바디(사용처에서 좌/우 색으로 tint) + 어두운 분리 림.
 * NORMAL 블렌드로 같은 색 레인 위에서도 또렷하게 떠 보이게(가독성↑). 어두운 림이 레인과 경계를 만든다.
 */
function genMarkDisc(scene: Phaser.Scene, key: string, size = 96): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return;
  const ctx = tex.context;
  const c = size / 2;
  // 부드러운 후광(살짝).
  const glow = ctx.createRadialGradient(c, c, size * 0.28, c, c, c);
  glow.addColorStop(0, 'rgba(255,255,255,0.4)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  // 솔리드 바디(불투명 — tint 로 선명한 빨강/파랑 디스크).
  ctx.beginPath();
  ctx.arc(c, c, size * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  // 어두운 분리 림 — tint(곱셈) 아래에서도 어둡게 남아 레인과 경계.
  ctx.lineWidth = size * 0.06;
  ctx.strokeStyle = 'rgba(12,18,34,0.85)';
  ctx.beginPath();
  ctx.arc(c, c, size * 0.32, 0, Math.PI * 2);
  ctx.stroke();
  tex.refresh();
}

/** 방향 화살표 글리프(흰색 + 가는 어두운 윤곽) — 컬러 디스크 위에서 또렷하게 읽힌다. */
function genArrow(scene: Phaser.Scene, key: string, dir: 'left' | 'right', size = 64): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return;
  const ctx = tex.context;
  const c = size / 2;
  ctx.beginPath();
  if (dir === 'left') {
    ctx.moveTo(size * 0.32, c);
    ctx.lineTo(size * 0.64, size * 0.28);
    ctx.lineTo(size * 0.64, size * 0.72);
  } else {
    ctx.moveTo(size * 0.68, c);
    ctx.lineTo(size * 0.36, size * 0.28);
    ctx.lineTo(size * 0.36, size * 0.72);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = size * 0.05;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(20,30,50,0.55)';
  ctx.stroke();
  tex.refresh();
}

/** 홀드(꾹누르기) 꼬리 막대 — 머리쪽(아래) 밝고 위로 페이드, 둥근 캡슐(흰색, tint). */
function genHoldTail(scene: Phaser.Scene, key: string, w = 40, h = 128): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.context;
  const g = ctx.createLinearGradient(0, h, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.92)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0.28)');
  ctx.fillStyle = g;
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(0, r);
  ctx.arc(r, r, r, Math.PI, 0);
  ctx.lineTo(w, h - r);
  ctx.arc(r, h - r, r, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  tex.refresh();
}

// ─────────────────────────── 네온 레인 텍스처 (흰색 베이스, tint 대응) ───────────────────────────

/** 부드러운 방사형 글로우 — 타깃 후광·스파클 입자에 공용(흰색 → 투명). */
function genNeonGlow(scene: Phaser.Scene, key: string, size = 128): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return;
  const ctx = tex.context;
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
}

/** 타깃 림 — 밝은 이중 링(굵은 헤일로 + 가는 코어). */
function genNeonRing(scene: Phaser.Scene, key: string, size = 128): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return;
  const ctx = tex.context;
  const c = size / 2;
  const r = size * 0.36;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth = size * 0.12;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = size * 0.045;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.stroke();
  tex.refresh();
}

/** 별빛 폭발 — 타격 순간 타깃에서 터지는 방사형 스파이크 + 코어 글로우. */
function genNeonBurst(scene: Phaser.Scene, key: string, size = 256): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return;
  const ctx = tex.context;
  const c = size / 2;
  const spikes = 16;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2;
    const len = (i % 2 === 0 ? 0.46 : 0.28) * size;
    const w = size * 0.016;
    const px = -Math.sin(a) * w;
    const py = Math.cos(a) * w;
    ctx.beginPath();
    ctx.moveTo(c + px, c + py);
    ctx.lineTo(c - px, c - py);
    ctx.lineTo(c + Math.cos(a) * len, c + Math.sin(a) * len);
    ctx.closePath();
    ctx.fill();
  }
  const g = ctx.createRadialGradient(c, c, 0, c, c, size * 0.2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
}

/** 8분음표 글리프 — 뒤 글로우 후광 + 기둥 + 기울인 머리 + 깃발(벡터, 흰색). 후광이 밝은 수면 위에서도 또렷. */
function genNote(scene: Phaser.Scene, key: string, size = 72): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return;
  const ctx = tex.context;
  // 뒤 후광 — 음표가 수면 위에서 묻히지 않게 부드러운 글로우.
  const c = size / 2;
  const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
  glow.addColorStop(0, 'rgba(255,255,255,0.85)');
  glow.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  // 기둥(stem)
  ctx.fillRect(size * 0.52, size * 0.16, size * 0.07, size * 0.5);
  // 머리(head) — 기울인 타원
  ctx.save();
  ctx.translate(size * 0.36, size * 0.66);
  ctx.rotate(-0.35);
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.2, size * 0.145, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 깃발(flag)
  ctx.beginPath();
  ctx.moveTo(size * 0.59, size * 0.16);
  ctx.quadraticCurveTo(size * 0.86, size * 0.28, size * 0.62, size * 0.46);
  ctx.quadraticCurveTo(size * 0.72, size * 0.28, size * 0.59, size * 0.26);
  ctx.closePath();
  ctx.fill();
  tex.refresh();
}

// ─────────────────────────── 절차적 수면 텍스처 (seamless) ───────────────────────────

/** 정수 파수 사인 합 — 타일 경계에서 값이 일치해 seamless. 반환 ≈ [-1, 1]. */
function periodic(u: number, v: number, terms: ReadonlyArray<readonly [number, number, number]>): number {
  let n = 0;
  for (const [ku, kv, amp] of terms) n += Math.sin(u * ku + Math.cos(v * kv)) * amp;
  return n;
}

/** 베이스 물 — 잔물결 블루, 세로/가로 seamless. */
function genWaterBase(scene: Phaser.Scene, key: string, size = 256): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return;
  const ctx = tex.context;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const TAU = Math.PI * 2;
  const terms = [
    [2, 3, 0.5],
    [3, 2, 0.3],
    [5, 4, 0.2],
  ] as const;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * TAU;
      const v = (y / size) * TAU;
      const t = (periodic(u, v, terms) + 1) / 2; // 0..1
      // 밝고 선명한 시안-블루 + 마루에 흰 포말(레퍼런스의 청량한 물).
      const shade = 0.84 + 0.34 * t;
      const foam = t > 0.78 ? (t - 0.78) / 0.22 : 0;
      const i = (y * size + x) * 4;
      d[i] = Math.min(255, 38 * shade + foam * 220);
      d[i + 1] = Math.min(255, 186 * shade + foam * 130);
      d[i + 2] = Math.min(255, 242 * shade + foam * 60);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
}

/** 포말 오버레이 — 투명 + 흰 거품 마루, seamless. */
function genWaterFoam(scene: Phaser.Scene, key: string, size = 256): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return;
  const ctx = tex.context;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const TAU = Math.PI * 2;
  const terms = [
    [3, 2, 0.5],
    [5, 3, 0.3],
    [2, 8, 0.2], // 세로 디테일 — 흐를 때 줄무늬 포말 느낌
  ] as const;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * TAU;
      const v = (y / size) * TAU;
      const t = (periodic(u, v, terms) + 1) / 2;
      const a = t > 0.62 ? (t - 0.62) / 0.38 : 0; // 더 넓고 진한 흰 포말(거친 수면)
      const i = (y * size + x) * 4;
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = Math.round(Math.pow(a, 1.3) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
}

/** 물보라 입자 — 부드러운 흰 물방울(방사형 그라데이션). */
function genSplash(scene: Phaser.Scene, key: string, size = 64): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return;
  const ctx = tex.context;
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.45, 'rgba(220,245,255,0.55)');
  g.addColorStop(1, 'rgba(210,240,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
}

/** 뱃머리 항적 포말 — 가로로 긴 부드러운 타원. */
function genWake(scene: Phaser.Scene, key: string, w = 256, h = 150): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.context;
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.8)');
  g.addColorStop(0.5, 'rgba(235,250,255,0.32)');
  g.addColorStop(1, 'rgba(235,250,255,0)');
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(1, h / w); // 세로 눌러 타원
  ctx.translate(-w / 2, -h / 2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  tex.refresh();
}

/** 비네트 — 중앙 투명 → 가장자리 어둡게(집중·깊이). */
function genVignette(scene: Phaser.Scene, key: string, w: number, h: number): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, Math.max(2, Math.round(w / 2)), Math.max(2, Math.round(h / 2)));
  if (!tex) return;
  const cw = tex.width;
  const ch = tex.height;
  const ctx = tex.context;
  const g = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.28, cw / 2, ch / 2, ch * 0.62);
  g.addColorStop(0, 'rgba(2,26,38,0)');
  g.addColorStop(1, 'rgba(2,26,38,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
  tex.refresh();
}

/** 수평선 배경 — 하늘 그라데이션 + 원경 산 + 좌우 강둑(수평선으로 수렴). 이미지 하단이 수평선. */
function genBackground(scene: Phaser.Scene, key: string, w: number, h: number): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.context;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#7fc6ff');
  sky.addColorStop(0.62, '#bfe9ff');
  sky.addColorStop(1, '#e9f8ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // 원경 산 — 수평선 부근, 흐릿한 청록.
  const baseY = h * 0.78;
  ctx.fillStyle = 'rgba(96,150,140,0.45)';
  ctx.beginPath();
  ctx.moveTo(0, baseY);
  const peaks = 7;
  for (let i = 0; i <= peaks; i++) {
    const x = (w / peaks) * i;
    const py = baseY - (Math.sin(i * 1.7) * 0.5 + 0.5) * h * 0.22 - h * 0.04;
    ctx.lineTo(x, py);
  }
  ctx.lineTo(w, baseY);
  ctx.closePath();
  ctx.fill();
  // 강둑 — 좌우 하단 녹색 쐐기(수평선 중앙으로 수렴).
  ctx.fillStyle = 'rgba(70,140,70,0.9)';
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, baseY + 6);
  ctx.lineTo(w * 0.42, h);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w, h);
  ctx.lineTo(w, baseY + 6);
  ctx.lineTo(w * 0.58, h);
  ctx.closePath();
  ctx.fill();
  // 수평선 헤이즈.
  const haze = ctx.createLinearGradient(0, baseY - 10, 0, h);
  haze.addColorStop(0, 'rgba(233,248,255,0)');
  haze.addColorStop(1, 'rgba(210,240,255,0.5)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, baseY - 10, w, h - baseY + 10);
  tex.refresh();
}

/** 수면 깊이 그라데이션 — 수평선(far) 어둡게 → 카메라(near) 투명. 세로 8px, 가로로 늘려 사용. */
function genWaterGradient(scene: Phaser.Scene, key: string, h = 256): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, 8, h);
  if (!tex) return;
  const ctx = tex.context;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(8,60,100,0.6)');
  g.addColorStop(0.45, 'rgba(16,110,160,0.22)');
  g.addColorStop(1, 'rgba(40,180,220,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, h);
  tex.refresh();
}

/** 원근 포말 스트로크 — 가로로 긴 부드러운 흰 줄(수평선→카메라로 돌진). */
function genFoamStreak(scene: Phaser.Scene, key: string, w = 128, h = 28): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.context;
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.55, 'rgba(228,247,255,0.3)');
  g.addColorStop(1, 'rgba(228,247,255,0)');
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(1, h / w);
  ctx.translate(-w / 2, -h / 2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  tex.refresh();
}

/** 캔버스 렌더 전 한글 폰트 선로딩(미로드 폰트는 폴백으로 굳음). 실패해도 진행. */
export async function preloadKoreanFonts(): Promise<void> {
  const fonts = (typeof document !== 'undefined' ? document.fonts : undefined) as
    | (FontFaceSet & { load?: (f: string, t?: string) => Promise<unknown> })
    | undefined;
  if (!fonts?.load) return;
  try {
    await Promise.all([
      fonts.load('400 24px "Do Hyeon"', '가나다 0123 X/:%'),
      fonts.load('400 24px "Jua"', '가나다 0123'),
    ]);
    await fonts.ready;
  } catch {
    /* 폰트 실패 시 시스템 폴백 */
  }
}
