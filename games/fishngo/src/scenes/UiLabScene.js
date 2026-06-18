/**
 * UiLabScene — UI 정밀제작 검증 하니스 (#uilab).
 *
 * "정밀제작 기법"의 검증 루프 도구. LocationCard 를 게임 흐름과 분리해 단독 렌더하고,
 *   ① 레퍼런스(통짜 baked 카드) 오버레이 ② 분수 그리드(10%) 로 카드 spec 의 분수 좌표를
 *   눈으로 보정한다. 스크린샷 비교에 최적화된 정적 화면.
 *
 * 조작:
 *   - 화면 좌/우 1/3 탭: 이전/다음 낚시터
 *   - 화면 중앙 탭 또는 [O]: 오버레이 모드 순환 (카드만 → 카드+레퍼런스50% → 레퍼런스만)
 *   - [G]: 분수 그리드 토글 (10% 격자 + 분수 라벨)
 *   - [1][2][3]: 낚시터 직접 선택
 *
 * 진입: URL 해시 #uilab (LoadingScene._routeNext 라우팅).
 */

import Phaser from 'phaser';
import { LOCATIONS } from '../config/assets.config.js';
import { buildLocationCard } from '../ui/LocationCard.js';
import { LOCATION_CARD_SPEC as SPEC } from '../config/card.spec.js';
import { strokeText } from '../ui/components.js';

const MODE = { CARD: 0, OVERLAY: 1, REF: 2 };
const MODE_LABEL = ['카드만', '카드+레퍼런스50%', '레퍼런스만'];

export class UiLabScene extends Phaser.Scene {
  constructor() { super('UiLabScene'); }

  create() {
    this._locIndex = 0;
    this._mode = MODE.OVERLAY;
    this._showGrid = false;
    this._refKey = null;     // 2번 원본 오버레이 (런타임 로드)

    const W = this.scale.width; const H = this.scale.height;
    this.add.rectangle(W / 2, H / 2, W, H, 0x223344, 1).setDepth(0);
    this._drawChecker(W, H);

    this._layer = this.add.container(0, 0).setDepth(10);
    this._cardCy = H * 0.47;
    this._cardScale = (H * 0.80) / SPEC.frame.designH;

    // 2번 원본 정밀 오버레이 — public/ui/card/_ref.png (또는 .webp) 가 있으면 레퍼런스로 사용.
    //   없으면 1번 baked 카드(loc.key)로 fallback. (사용자가 2번 저장 시 픽셀정렬 가능)
    this._tryLoadReference();

    this._build();
    this._bindInput();
  }

  // 2번 원본 레퍼런스를 런타임 로드 시도 (있으면 overlay/ref 모드가 이걸 사용).
  //   fetch HEAD 로 존재 확인 후에만 로드 → 누락 시 Phaser 로더 에러 회피.
  async _tryLoadReference() {
    const candidates = [
      ['__ref_png',  'ui/card/_ref.png'],
      ['__ref_webp', 'ui/card/_ref.webp'],
    ];
    let found = null;
    for (const [key, path] of candidates) {
      try {
        // Vite dev 는 누락 경로에 index.html(text/html) fallback → content-type 으로 실파일 판별.
        const res = await fetch(path, { method: 'HEAD' });
        const ct = res.headers.get('content-type') || '';
        if (res.ok && ct.startsWith('image')) { found = [key, path]; break; }
      } catch { /* 무시 */ }
    }
    if (!found) return;
    const [key, path] = found;
    this.load.image(key, path);
    this.load.once(`filecomplete-image-${key}`, () => { this._refKey = key; this._build(); });
    this.load.start();
  }

  _drawChecker(W, H) {
    const g = this.add.graphics().setDepth(1);
    const s = 32;
    for (let y = 0; y < H; y += s) {
      for (let x = 0; x < W; x += s) {
        if (((x / s) + (y / s)) % 2 === 0) {
          g.fillStyle(0x2b3d50, 1); g.fillRect(x, y, s, s);
        }
      }
    }
  }

  _build() {
    this._layer.removeAll(true);
    const W = this.scale.width;
    const loc = LOCATIONS[this._locIndex];

    // ── 레퍼런스 — 2번 원본(_ref.png/.webp) 우선, 없으면 1번 baked(loc.key) ──
    //   카드 프레임과 동일 표시 높이로 정렬 (2번도 프레임이 이미지 대부분을 채움).
    const refKey = (this._refKey && this.textures.exists(this._refKey)) ? this._refKey : loc.key;
    if (refKey && this.textures.exists(refKey)) {
      const ref = this.add.image(W / 2, this._cardCy, refKey).setOrigin(0.5);
      const refScale = (SPEC.frame.designH * this._cardScale) / ref.height;
      ref.setScale(refScale);
      ref.setAlpha(this._mode === MODE.CARD ? 0 : (this._mode === MODE.OVERLAY ? 0.5 : 1));
      ref.setDepth(this._mode === MODE.REF ? 5 : 20);   // 오버레이 모드일 때 카드 위
      this._layer.add(ref);
    }

    // ── 동적 카드 ──
    const card = buildLocationCard(this, W / 2, this._cardCy, { title: loc.name, ...loc.card });
    card.setScale(this._cardScale);
    card.setAlpha(this._mode === MODE.REF ? 0.12 : 1);
    card.setDepth(this._mode === MODE.REF ? 4 : 10);
    this._layer.add(card);

    if (this._showGrid) this._drawGrid(card);
    this._drawHud(loc);
  }

  // 카드 프레임 박스 기준 10% 분수 격자 + 라벨.
  _drawGrid(card) {
    const W = SPEC.frame.designW * this._cardScale;
    const H = SPEC.frame.designH * this._cardScale;
    const left = card.x - W / 2; const top = card.y - H / 2;
    const g = this.add.graphics().setDepth(30);
    g.lineStyle(1, 0x00e5ff, 0.45);
    for (let i = 0; i <= 10; i++) {
      const x = left + (W * i) / 10; const y = top + (H * i) / 10;
      g.lineBetween(x, top, x, top + H);
      g.lineBetween(left, y, left + W, y);
    }
    // 중심선 강조.
    g.lineStyle(1.5, 0xffd54a, 0.7);
    g.lineBetween(left + W / 2, top, left + W / 2, top + H);
    this._layer.add(g);
    // 세로 분수 라벨 (0.0~1.0).
    for (let i = 0; i <= 10; i++) {
      const y = top + (H * i) / 10;
      const t = strokeText(this, left - 4, y, (i / 10).toFixed(1), 13,
        { color: '#00e5ff', strokeColor: '#003', strokeWidth: 2 });
      t.setOrigin(1, 0.5); this._layer.add(t);
    }
  }

  _drawHud(loc) {
    const W = this.scale.width; const H = this.scale.height;
    const refSrc = this._refKey ? '2번 원본(_ref)' : '1번 baked(fallback)';
    const lines = [
      `#uilab — UI 정밀 검증 하니스`,
      `낚시터: ${loc.name}  (${this._locIndex + 1}/${LOCATIONS.length})  레퍼런스: ${refSrc}`,
      `모드: ${MODE_LABEL[this._mode]}   그리드: ${this._showGrid ? 'ON' : 'off'}`,
      `[좌/우 탭] 낚시터  ·  [중앙 탭/O] 오버레이  ·  [G] 그리드  ·  [1~3] 선택`,
    ];
    const t = strokeText(this, W / 2, H * 0.045, lines.join('\n'), 18,
      { color: '#ffffff', strokeColor: '#06223f', strokeWidth: 4 });
    t.setOrigin(0.5, 0.5); t.setAlign('center'); t.setLineSpacing(4);
    this._layer.add(t);

    const foot = strokeText(this, W / 2, H * 0.95,
      'card.spec.js 의 분수를 수정 → HMR 즉시 반영. 그리드로 위치 읽고 보정.', 15,
      { color: '#ffe9a8', strokeColor: '#5a3210', strokeWidth: 3 });
    foot.setOrigin(0.5, 0.5); this._layer.add(foot);
  }

  _bindInput() {
    const W = this.scale.width;
    this.input.on('pointerdown', (p) => {
      if (p.x < W / 3) this._cycleLoc(-1);
      else if (p.x > (2 * W) / 3) this._cycleLoc(1);
      else this._cycleMode();
    });
    this.input.keyboard?.on('keydown-O', () => this._cycleMode());
    this.input.keyboard?.on('keydown-G', () => { this._showGrid = !this._showGrid; this._build(); });
    for (let i = 1; i <= 3; i++) {
      this.input.keyboard?.on(`keydown-${['ONE', 'TWO', 'THREE'][i - 1]}`, () => {
        if (i - 1 < LOCATIONS.length) { this._locIndex = i - 1; this._build(); }
      });
    }
  }

  _cycleLoc(d) {
    this._locIndex = (this._locIndex + d + LOCATIONS.length) % LOCATIONS.length;
    this._build();
  }

  _cycleMode() {
    this._mode = (this._mode + 1) % 3;
    this._build();
  }
}
