/**
 * LoadingScene — 2단계 로딩 (화려한 로딩 UI + 본격 자산 로드).
 *
 * 흐름 (레퍼런스 합성 배치):
 *   1) Loding_BG_01 (펭귄+앵무새+보트 풀 씬) cover scale.
 *   2) 갈매기 3마리 (Loading_07-1/2/3) — 하늘 영역, 느린 활공.
 *   3) 점프 물고기 2마리 (Loading_06-1/2) — 하단 좌우, 상하 bobbing.
 *   4) Loading_01_logo (Fish & Go! 타이틀) 상단 중앙 (가장 앞 레이어).
 *   5) Loading_05-1 (빈 진행 바) 화면 최하단 + Loading_05-2/3/4 로 채움 (9-slice 식).
 *   6) ASSETS / SPRITESHEETS 로드 → progress 이벤트 마다 채움 너비 갱신.
 *   7) 모든 ANIMATIONS 등록 → URL hash 라우팅 (BootScene 의 기존 로직 이관).
 */

import Phaser from 'phaser';
import { ASSETS, ASSETS_SPRITESHEETS, ANIMATIONS, AUDIO_ASSETS } from '../config/assets.config.js';
import { smoothStart } from '../systems/sceneTransition.js';

// ─── Per-location lazy 자산 키 — LocationLoaderScene 이 책임지므로 LoadingScene 은 skip ───
//   BG: bg_fishing_hk / bg_fishing_glacier (2종) 만 lazy. bg_fishing 은 eager 로 유지
//     → HomeScene 콜드부트 backdrop + #fishing 직접 진입 fallback + beach location dedupe.
//   Fish: 5종 lazy (bluetang/porcupinefish/moorishidol/parrotfish/whiteshark).
//     clownfish + angelfish 는 eager 유지 → Home ambient 어항 + beach location dedupe.
//   공용 스프라이트(splash/castbtn/fish_effect/jellyfish) 는 계속 LoadingScene 이 로드.
const LAZY_BG_KEYS = new Set(['bg_fishing_hk', 'bg_fishing_glacier']);
const LAZY_FISH_SPRITE_KEYS = new Set([
  'sprite_bluetang',
  'sprite_porcupinefish',
  'sprite_moorishidol',
  'sprite_parrotfish',
  'sprite_whiteshark',
]);

// 진행 바 9-slice 상수 — Loading_05 자산 그룹 분석 결과.
//   bar_bg 428×63 → 안쪽 채움 영역 ≈ 가로 inset 24px (좌우), 세로 가운데 27px 높이.
//   cap_l 28×27, cap_r 29×27, mid 175×27 (가로로 stretch 가능).
const BAR_BG_W = 428;
const BAR_BG_H = 63;
const BAR_PAD_X = 24;     // 빈 바 안쪽 좌우 inset (시각 측정)
const BAR_CAP_L_W = 28;
const BAR_CAP_R_W = 29;
const BAR_FILL_H = 27;

export class LoadingScene extends Phaser.Scene {
  constructor() { super('LoadingScene'); }

  preload() {
    // 사용자 요청: 로딩 화면 최소 2초 표시 — start time 기록 후 create() 에서 남은 시간 계산.
    this._startMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    // 본격 자산 로드 — LOADING_ASSETS 는 BootScene 에서 이미 로드됨.
    //   per-location BG / fish 시트는 LocationLoaderScene 이 lazy 로드 → 여기선 skip.
    for (const [key, path] of Object.entries(ASSETS)) {
      if (LAZY_BG_KEYS.has(key)) continue;
      this.load.image(key, path);
    }
    for (const [key, def] of Object.entries(ASSETS_SPRITESHEETS)) {
      if (LAZY_FISH_SPRITE_KEYS.has(key)) continue;
      this.load.spritesheet(key, def.path, {
        frameWidth:  def.frameWidth,
        frameHeight: def.frameHeight,
      });
    }
    // 오디오 — SFX 만 eager(가벼움, 즉시 피드백 필요). BGM(music_*, ~5.7MB)은 지연로드:
    //   FishingScene 진입 시 Music.js 가 캐시 미존재면 로드 후 재생 → 첫 로드 −5.7MB.
    for (const [key, path] of Object.entries(AUDIO_ASSETS ?? {})) {
      if (key.startsWith('music_')) continue;
      this.load.audio(key, path);
    }
    // 낚시터 카드 저작 레이아웃 (UI 저작도구 산출물). 없으면 LocationCard 가 DEFAULT_LAYOUT fallback.
    this.load.json('card_layout', 'card.layout.json');
    // 저작도구 업로드 커스텀 에셋 매니페스트 → 로드 중 동적으로 각 이미지 큐잉(2단계 로딩).
    this.load.json('card_assets', 'card.assets.json');
    this.load.on('filecomplete-json-card_assets', () => {
      const manifest = this.cache.json.get('card_assets') || {};
      for (const [key, path] of Object.entries(manifest)) {
        if (key && path && !this.textures.exists(key)) this.load.image(key, path);
      }
    });

    this._buildUI();
    // 부트 스플래시(HTML .loading) 제거 — penguin 로딩 UI 가 1~2프레임 렌더된 뒤(청색 갭 없이 전환).
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector('.loading')?.remove()));
    }

    this.load.on('progress', (p) => this._setProgress(p));
    this.load.on('complete', () => this._setProgress(1));
  }

  create() {
    // 애니메이션 등록 — 모든 씬에서 공유.
    for (const [animKey, def] of Object.entries(ANIMATIONS)) {
      if (this.anims.exists(animKey)) continue;
      if (!this.textures.exists(def.spriteKey)) continue;
      this.anims.create({
        key: animKey,
        frames: this.anims.generateFrameNumbers(def.spriteKey, { frames: def.frames }),
        frameRate: def.frameRate,
        repeat:    def.repeat,
      });
    }

    // 사용자 요청: 로딩 화면 최소 3초간 유지.
    //   _startMs 부터 경과 시간 계산 → 남은 시간만큼 delay (자산 로드가 짧아도 3초 보장).
    const MIN_DISPLAY_MS = 3000;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const elapsed = now - (this._startMs ?? now);
    const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
    this.time.delayedCall(remaining, () => this._routeNext());
  }

  // ─── UI 구성 ───
  //   배경(펭귄+앵무새+보트 풀 씬) 위에 갈매기 / 점프 물고기 / 로고 / 진행 바를 올린다.
  //   레이어 순서: bg → 갈매기 → 물고기 → 로고 → 진행 바.
  _buildUI() {
    const W = this.scale.width;
    const H = this.scale.height;

    // 배경 — cover scale (가로/세로 중 더 큰 비율로 맞춰서 화면을 가득 채움).
    const bg = this.add.image(W / 2, H / 2, 'loading_bg').setOrigin(0.5);
    const bgTex = bg.texture.getSourceImage();
    const bgScale = Math.max(W / bgTex.width, H / bgTex.height);
    bg.setScale(bgScale);

    // 갈매기 3마리 — 하늘 영역. [key, x비율, y비율, 목표폭px, drift(±x), 주기ms].
    const GULLS = [
      ['loading_gull_2', 0.13, 0.28, 80, 22, 3200],
      ['loading_gull_1', 0.80, 0.30, 72, 26, 3600],
      ['loading_gull_3', 0.90, 0.39, 56, 18, 2800],
    ];
    GULLS.forEach(([key, fx, fy, tw, drift, dur], i) => {
      const gull = this.add.image(W * fx, H * fy, key).setOrigin(0.5);
      gull.setScale(tw / gull.texture.getSourceImage().width);
      // 느린 활공 — 수평 drift + 살짝 상하.
      this.tweens.add({
        targets: gull, x: gull.x + drift, y: gull.y - 6,
        duration: dur, ease: 'Sine.InOut', yoyo: true, repeat: -1, delay: i * 250,
      });
    });

    // 점프 물고기 2마리 — 하단 좌우 (물 위로 튀어오른 연출).
    const fishA = this.add.image(W * 0.25, H * 0.79, 'loading_fish_a').setOrigin(0.5);
    fishA.setScale((W * 0.28) / fishA.texture.getSourceImage().width);
    const fishB = this.add.image(W * 0.85, H * 0.73, 'loading_fish_b').setOrigin(0.5);
    fishB.setScale((W * 0.17) / fishB.texture.getSourceImage().width);
    // 아주 미세한 상하 bobbing (사용자 요청: 폭을 아주 작게).
    this.tweens.add({
      targets: fishA, y: fishA.y - 4,
      duration: 1600, ease: 'Sine.InOut', yoyo: true, repeat: -1,
    });
    this.tweens.add({
      targets: fishB, y: fishB.y - 3,
      duration: 1400, ease: 'Sine.InOut', yoyo: true, repeat: -1, delay: 200,
    });

    // 로고 — 화면 상단 중앙 (가장 앞 레이어). 나무판자 버전(376×354).
    //   표시 폭 = 화면폭의 52% (사용자 70% 축소 의도 반영), 위치는 살짝 아래로.
    const logoY = H * 0.185;
    const logo = this.add.image(W / 2, logoY, 'loading_logo').setOrigin(0.5);
    logo.setScale((W * 0.52) / logo.texture.getSourceImage().width);
    this.tweens.add({
      targets: logo, y: logoY - 9,
      duration: 1900, ease: 'Sine.InOut', yoyo: true, repeat: -1,
    });

    // 진행 바 — 화면 최하단 가까이.
    //   원본 너비 428 → 화면 폭 0.72 정도로 스케일.
    const barTargetW = Math.min(W * 0.72, 500);
    const barScale = barTargetW / BAR_BG_W;
    const barH = BAR_BG_H * barScale;
    const barCx = W / 2;
    const barCy = H - barH / 2 - 50;

    const barBg = this.add.image(barCx, barCy, 'loading_bar_bg').setOrigin(0.5);
    barBg.setScale(barScale);

    // 채움 영역 좌측 시작 X (바 안쪽 inset 고려).
    const barLeft = barCx - barTargetW / 2;
    const fillStartX = barLeft + BAR_PAD_X * barScale;
    const fillMaxW = barTargetW - 2 * BAR_PAD_X * barScale;

    // 좌·우 캡(둥근 끝)을 먼저 깔고, 중앙 stretch 를 가장 위 레이어로 올려
    //   양 캡의 평평한 안쪽을 살짝 덮게 한다 → 9-slice 이음새(seam) 제거.
    const capL = this.add.image(fillStartX, barCy, 'loading_bar_l').setOrigin(0, 0.5);
    capL.setScale(barScale);
    capL.setVisible(false);   // 진행 0 일 때는 숨김

    const capR = this.add.image(fillStartX, barCy, 'loading_bar_r').setOrigin(0, 0.5);
    capR.setScale(barScale);
    capR.setVisible(false);

    // 중앙 stretch — origin 좌측, x 스케일을 progress 따라 조절 (캡 위에 그려짐).
    const mid = this.add.image(fillStartX, barCy, 'loading_bar_m').setOrigin(0, 0.5);
    mid.setScale(0, barScale);
    mid.setVisible(false);

    this._bar = {
      barScale,
      fillStartX,
      fillMaxW,
      capL, mid, capR,
    };

    // 진행률 텍스트 — 바 위쪽에 작게.
    this._progressText = this.add.text(barCx, barCy - barH / 2 - 18, 'Loading 0%', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px',
      color: '#ffffff',
      stroke: '#062a55',
      strokeThickness: 4,
    }).setOrigin(0.5);
  }

  // ─── 진행률 갱신 (0 ~ 1) ───
  _setProgress(p) {
    const b = this._bar;
    if (!b) return;
    const pct = Math.max(0, Math.min(1, p));

    // 채움 부분 총 너비 = fillMaxW × pct.
    const fillW = b.fillMaxW * pct;
    const capLW = BAR_CAP_L_W * b.barScale;
    const capRW = BAR_CAP_R_W * b.barScale;
    const MID_NATIVE_W = 175;            // Loading_05-3 원본 폭
    const OV = b.barScale * 3;           // 캡 평평한 안쪽으로 겹칠 양 (seam 제거)

    if (fillW < 1) {
      b.capL.setVisible(false);
      b.mid.setVisible(false);
      b.capR.setVisible(false);
    } else if (fillW < capLW + capRW) {
      // 매우 짧은 진행 — 좌측 캡만 fillW 너비로 (둥근 좌단 유지).
      b.capL.setScale(b.barScale * Math.min(1, fillW / capLW), b.barScale);
      b.capL.setVisible(true);
      b.mid.setVisible(false);
      b.capR.setVisible(false);
    } else {
      // 좌측 캡 — 항상 좌단.
      b.capL.setScale(b.barScale);
      b.capL.setVisible(true);

      // 우측 캡 — 채움 우단에 정렬 (둥근 우측 모서리).
      b.capR.x = b.fillStartX + fillW - capRW;
      b.capR.setScale(b.barScale);
      b.capR.setVisible(true);

      // 중앙 stretch — 양 캡의 평평한 안쪽으로 OV 만큼 겹쳐 이음새를 덮음.
      const midLeft = b.fillStartX + capLW - OV;
      const midWidth = (b.fillStartX + fillW - capRW + OV) - midLeft;
      b.mid.x = midLeft;
      b.mid.setScale(midWidth / MID_NATIVE_W, b.barScale);
      b.mid.setVisible(true);
    }

    if (this._progressText) {
      this._progressText.setText(`Loading ${Math.floor(pct * 100)}%`);
    }
  }

  // ─── 다음 씬으로 라우팅 (URL hash 기반 — BootScene 기존 로직 이관) ───
  //   #fishing 만 LocationLoaderScene 경유로 자산 보장 (lazy 자산 누락 회피).
  //   나머지 씬은 그대로 직접 진입.
  _routeNext() {
    const hash = (typeof window !== 'undefined' ? window.location.hash : '').toLowerCase();
    if (hash === '#fishing') {
      this.scene.start('LocationLoaderScene', {
        locId: 'beach', mode: 'user2', targetScene: 'FishingScene',
      });
      return;
    }
    const routes = {
      '#home':    'HomeScene',
      '#result':  'ResultScene',
      '#album':   'AlbumScene',
      '#shop':    'ShopScene',
      '#uilab':   'UiLabScene',     // UI 정밀 검증 하니스 (개발용)
      '#uieditor': 'UiEditorScene', // UI 저작도구 (개발용)
    };
    let target = routes[hash] || 'HomeScene';
    // 개발 전용 씬(#uieditor 등)이 프로덕션 번들에 없으면 홈으로 폴백(미등록 씬 start 방지).
    if (!this.scene.manager.keys[target]) target = 'HomeScene';
    smoothStart(this, target);   // 펭귄 로딩화면 유지 → 타깃 완전 준비 후 전환(청색 틈 방지)
  }
}
