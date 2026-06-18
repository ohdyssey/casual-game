/**
 * LocationLoaderScene — 낚시터별 자산 lazy-load 전용 로더 씬.
 *
 * 흐름:
 *   HomeScene CAST 버튼 → scene.start('LocationLoaderScene', { locId, mode, targetScene })
 *     → LocationLoaderScene 가 해당 낚시터 전용 자산 (BG + fish 스프라이트시트) 로드
 *     → 로드 완료 시 ANIMATIONS 등록 → scene.start(targetScene, { location, mode })
 *
 * 자산 분류:
 *   - 항상 로드 (LoadingScene): UI, 공용 스프라이트(castbtn/splash/fish_effect/jellyfish), 오디오, 카드 썸네일.
 *   - 낚시터별 lazy (이 씬): 해당 낚시터 BG + fishSpecies 에 매핑된 fish 시트.
 *
 * 캐시 hit (이미 모든 텍스처가 cache 에 있음) → 로드 스킵, 즉시 전환.
 */

import Phaser from 'phaser';
import { ASSETS_SPRITESHEETS, ANIMATIONS } from '../config/assets.config.js';
import { FISH_SPECIES } from '../config/fish.config.js';
import { LOCATIONS_MANIFEST, getLocationManifest } from '../config/locations.config.js';
import * as LocationCache from '../systems/LocationCache.js';
import { smoothStart } from '../systems/sceneTransition.js';

// 신규 5종 — bleed 방지를 위해 NEAREST filter 강제 (mipmap/bilinear 비활성).
const NEW_FISH_SPRITE_KEYS = [
  'sprite_cutlasfish',
  'sprite_flounder',
  'sprite_marbledsole',
  'sprite_mullet',
  'sprite_whiting',
];

// 진행 바 9-slice 상수 — LoadingScene 과 동일 (Loading_05 자산 그룹).
const BAR_BG_W = 428;
const BAR_BG_H = 63;
const BAR_PAD_X = 24;
const BAR_CAP_L_W = 28;
const BAR_CAP_R_W = 29;

export class LocationLoaderScene extends Phaser.Scene {
  constructor() { super('LocationLoaderScene'); }

  init(data) {
    this.locId = data?.locId || 'beach';
    this.targetScene = data?.targetScene || 'FishingScene';
    this.mode = data?.mode || 'user2';
    // 매니페스트 lookup — 알 수 없는 id 면 beach 로 fallback.
    this.manifest = getLocationManifest(this.locId) || LOCATIONS_MANIFEST.beach;
    this._bar = null;
    this._progressText = null;
    // 사용자 요청: 스테이지 로딩화면은 아무리 짧아도 ~1초 표시.
    this._startMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  preload() {
    // UI 먼저 그려서 사용자에게 즉시 피드백.
    this._buildUI();

    // 필요한 fish sprite key 산출 (dedup) — 매니페스트의 fishSpecies → FISH_SPECIES.sprite.
    const fishSpriteKeys = this._computeFishSpriteKeys(this.manifest.fishSpecies);

    // 필요한 자산 중 cache 에 없는 것만 등록.
    const toLoad = [];

    // 1) 낚시터 BG (미캐시 시).
    if (this.manifest.bgKey && this.manifest.bgPath && !this.textures.exists(this.manifest.bgKey)) {
      this.load.image(this.manifest.bgKey, this.manifest.bgPath);
      toLoad.push(this.manifest.bgKey);
    }

    // 2) Fish 스프라이트시트 (미캐시 시).
    for (const spriteKey of fishSpriteKeys) {
      if (this.textures.exists(spriteKey)) continue;
      const def = ASSETS_SPRITESHEETS[spriteKey];
      if (!def) continue;   // 정의 누락 방어
      this.load.spritesheet(spriteKey, def.path, {
        frameWidth:  def.frameWidth,
        frameHeight: def.frameHeight,
      });
      toLoad.push(spriteKey);
    }

    // 모두 캐시 hit → 즉시 전환 (create() 에서 처리, 여기선 loader skip).
    if (toLoad.length === 0) {
      this._setProgress(1);
      return;
    }

    // 핸들러를 인스턴스 메서드로 만들어 shutdown 시 정확히 off 가능 (리스너 누수 방지).
    this._onProgress = (p) => this._setProgress(p);
    this._onComplete = () => this._setProgress(1);
    this.load.on('progress', this._onProgress);
    this.load.once('complete', this._onComplete);   // complete 는 1회만

    // 씬 종료 시 progress 리스너 명시적 제거 (재진입 누수 가드).
    this.events.once('shutdown', () => {
      if (this._onProgress) this.load.off('progress', this._onProgress);
      if (this._onComplete) this.load.off('complete', this._onComplete);
      this._onProgress = null;
      this._onComplete = null;
    });
  }

  create() {
    // 1) 로드 완료된 fish 시트에 대해 ANIMATIONS 등록 (이미 등록되어 있으면 skip).
    this._registerAnimationsForLoadedFish();

    // 2) LRU 캐시 기록 + (필요 시) evict. dev/prod 동일 — eviction 코드 경로를 항상 실행해
    //    개발 중 누락/leak 을 조기 검출 (이전에는 isDev 가드로 prod 만 노출되어 디버깅 곤란).
    const evicted = LocationCache.markVisited(this.locId);
    if (evicted) this._unloadLocation(evicted);

    // 3) targetScene 으로 전환 — 단, 스테이지 로딩화면을 최소 1초간 유지
    //    (사용자 요청: 캐시 hit 으로 로드가 즉시 끝나도 배경 씬을 잠깐 보여줌).
    const MIN_DISPLAY_MS = 1000;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const elapsed = now - (this._startMs ?? now);
    const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
    this.time.delayedCall(remaining, () => {
      smoothStart(this, this.targetScene, {   // 스테이지 로딩화면 유지 → 낚시 씬 완전 준비 후 전환
        location: this.locId,
        mode: this.mode,
      });
    });
  }

  // ─── 매니페스트의 fishSpecies → sprite key 목록 (dedup) ───
  _computeFishSpriteKeys(fishIds) {
    if (!Array.isArray(fishIds)) return [];
    const set = new Set();
    for (const fid of fishIds) {
      const def = FISH_SPECIES.find((f) => f.id === fid);
      if (def?.sprite) set.add(def.sprite);
    }
    return Array.from(set);
  }

  // ─── 로드된 fish 시트에 대해 ANIMATIONS 등록 ───
  //   LoadingScene 이 fish 시트를 더 이상 항상 로드하지 않으므로,
  //   이 씬에서 lazy-loaded 시트의 anim 을 책임지고 등록.
  _registerAnimationsForLoadedFish() {
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
    // 신규 5종 atlas bleed 방지 — NEAREST filter (mipmap/bilinear 비활성).
    //   원인: WebGL 이 텍스처 축소 시 mipmap 을 자동 생성 → 인접 셀 픽셀이 평균화되어
    //   다른 frame 의 잔재가 보임. 마진(8px) 으로는 mip 레벨 1-3 에서 여전히 누설됨.
    //   NEAREST 는 mip 생성 자체를 안 하므로 cell 경계가 완전 차단됨.
    NEW_FISH_SPRITE_KEYS.forEach((key) => {
      if (this.textures.exists(key)) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    });
  }

  // ─── LRU evict 시 해당 낚시터 전용 텍스처 + anim 정리 ───
  //   주의: BG 는 HomeScene 캐러셀 배경에도 쓰이므로 evict 하지 않음.
  //         fish 시트만 evict — 다른 낚시터에서 같은 시트를 쓰지 않는다는 보장이 없으므로
  //         "다른 캐시된 낚시터들에서 사용 중이 아닌 시트" 만 안전하게 제거.
  _unloadLocation(locId) {
    const evictManifest = getLocationManifest(locId);
    if (!evictManifest) return;

    // 현재 캐시 보유 중인 다른 낚시터들에서 사용 중인 sprite key set.
    const stillNeeded = new Set();
    for (const otherId of LocationCache.getCachedIds()) {
      const m = getLocationManifest(otherId);
      if (!m) continue;
      for (const fid of m.fishSpecies || []) {
        const def = FISH_SPECIES.find((f) => f.id === fid);
        if (def?.sprite) stillNeeded.add(def.sprite);
      }
    }

    // 이번에 evict 된 location 의 fish sprite key 중 stillNeeded 에 없는 것만 제거.
    for (const fid of evictManifest.fishSpecies || []) {
      const def = FISH_SPECIES.find((f) => f.id === fid);
      const spriteKey = def?.sprite;
      if (!spriteKey || stillNeeded.has(spriteKey)) continue;

      // 관련 anim 먼저 제거 (texture 가 사라지면 anim 이 dangling 됨).
      for (const [animKey, animDef] of Object.entries(ANIMATIONS)) {
        if (animDef.spriteKey !== spriteKey) continue;
        if (this.anims.exists(animKey)) this.anims.remove(animKey);
      }
      // 그 다음 texture 제거.
      if (this.textures.exists(spriteKey)) this.textures.remove(spriteKey);
    }
  }

  // ─── UI 구성 (LoadingScene 의 진행 바 9-slice 로직 압축 재현) ───
  _buildUI() {
    const W = this.scale.width;
    const H = this.scale.height;

    // 배경 — 스테이지 전용 풀 씬(등대 낮). stage_loading_bg 우선, 없으면 loading_bg → 단색.
    const bgKey = this.textures.exists('stage_loading_bg') ? 'stage_loading_bg'
                : this.textures.exists('loading_bg') ? 'loading_bg' : null;
    if (bgKey) {
      const bg = this.add.image(W / 2, H / 2, bgKey).setOrigin(0.5);
      const bgTex = bg.texture.getSourceImage();
      const bgScale = Math.max(W / bgTex.width, H / bgTex.height);
      bg.setScale(bgScale);
    } else {
      // fallback — 단색 배경.
      const g = this.add.graphics();
      g.fillStyle(0x062a55, 1);
      g.fillRect(0, 0, W, H);
    }

    // "STAGE LOADING" 타이틀 배너 — 화면 상단 중앙 (사용자 요청: 기준에서 100px 아래로).
    if (this.textures.exists('stage_loading_title')) {
      const titleY = H * 0.11 + 100;
      const title = this.add.image(W / 2, titleY, 'stage_loading_title').setOrigin(0.5);
      title.setScale((W * 0.50) / title.texture.getSourceImage().width);
      this.tweens.add({
        targets: title, y: titleY - 7,
        duration: 1900, ease: 'Sine.InOut', yoyo: true, repeat: -1,
      });
    }

    // 진행 바 — 화면 하단 (메인 로더와 동일한 여백).
    const barTargetW = Math.min(W * 0.72, 500);
    const barScale = barTargetW / BAR_BG_W;
    const barH = BAR_BG_H * barScale;
    const barCx = W / 2;
    const barCy = H - barH / 2 - 50;

    // 낚시터 이름 — 바 위(하단)에 표시해 풀 씬을 가리지 않음. (Loading % 텍스트보다 위)
    this.add.text(barCx, barCy - barH / 2 - 54, this.manifest?.name || '낚시터 준비 중...', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '26px',
      color: '#ffffff',
      stroke: '#062a55',
      strokeThickness: 5,
    }).setOrigin(0.5);

    if (!this.textures.exists('loading_bar_bg')) {
      // 자산 누락 시 단순 fallback (회색 막대).
      const g = this.add.graphics();
      g.fillStyle(0x062a55, 1);
      g.fillRect(barCx - barTargetW / 2, barCy - barH / 2, barTargetW, barH);
      this._bar = null;
      return;
    }

    const barBg = this.add.image(barCx, barCy, 'loading_bar_bg').setOrigin(0.5);
    barBg.setScale(barScale);

    const barLeft = barCx - barTargetW / 2;
    const fillStartX = barLeft + BAR_PAD_X * barScale;
    const fillMaxW = barTargetW - 2 * BAR_PAD_X * barScale;

    // 좌·우 캡을 먼저, 중앙 stretch 를 가장 위 레이어로 (캡 안쪽 살짝 덮어 seam 제거).
    const capL = this.add.image(fillStartX, barCy, 'loading_bar_l').setOrigin(0, 0.5);
    capL.setScale(barScale);
    capL.setVisible(false);

    const capR = this.add.image(fillStartX, barCy, 'loading_bar_r').setOrigin(0, 0.5);
    capR.setScale(barScale);
    capR.setVisible(false);

    const mid = this.add.image(fillStartX, barCy, 'loading_bar_m').setOrigin(0, 0.5);
    mid.setScale(0, barScale);
    mid.setVisible(false);

    this._bar = {
      barScale, fillStartX, fillMaxW,
      capL, mid, capR,
    };

    this._progressText = this.add.text(barCx, barCy - barH / 2 - 18, 'Loading 0%', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px',
      color: '#ffffff',
      stroke: '#062a55',
      strokeThickness: 4,
    }).setOrigin(0.5);
  }

  _setProgress(p) {
    const b = this._bar;
    const pct = Math.max(0, Math.min(1, p));

    if (b) {
      const fillW = b.fillMaxW * pct;
      const capLW = BAR_CAP_L_W * b.barScale;
      const capRW = BAR_CAP_R_W * b.barScale;
      const MID_NATIVE_W = 175;
      const OV = b.barScale * 3;          // 캡 안쪽 겹침 (seam 제거)

      if (fillW < 1) {
        b.capL.setVisible(false);
        b.mid.setVisible(false);
        b.capR.setVisible(false);
      } else if (fillW < capLW + capRW) {
        b.capL.setScale(b.barScale * Math.min(1, fillW / capLW), b.barScale);
        b.capL.setVisible(true);
        b.mid.setVisible(false);
        b.capR.setVisible(false);
      } else {
        b.capL.setScale(b.barScale);
        b.capL.setVisible(true);
        b.capR.x = b.fillStartX + fillW - capRW;
        b.capR.setScale(b.barScale);
        b.capR.setVisible(true);
        const midLeft = b.fillStartX + capLW - OV;
        const midWidth = (b.fillStartX + fillW - capRW + OV) - midLeft;
        b.mid.x = midLeft;
        b.mid.setScale(midWidth / MID_NATIVE_W, b.barScale);
        b.mid.setVisible(true);
      }
    }

    if (this._progressText) {
      this._progressText.setText(`Loading ${Math.floor(pct * 100)}%`);
    }
  }
}
