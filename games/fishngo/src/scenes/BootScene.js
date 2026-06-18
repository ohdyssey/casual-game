/**
 * BootScene — 1단계 부트 (로딩 화면 자산만 먼저 로드).
 *
 * 흐름:
 *   1) LOADING_ASSETS (로딩 화면용 이미지 — 메인/스테이지 BG·로고·타이틀·진행바·물고기·갈매기) 만 로드.
 *   2) 그 동안 minimal 텍스트 표시 ("Loading...").
 *   3) 완료되면 LoadingScene 으로 전환 → 본격 자산 로드 + 화려한 로딩 UI.
 *
 * 자산 분류 (per-location lazy split):
 *   - BootScene  : LOADING_ASSETS 만 (로딩 UI 우선).
 *   - LoadingScene : 공용 자산 (UI / 공용 스프라이트 splash/castbtn/fish_effect/jellyfish / 오디오).
 *                    낚시터별 BG (bg_fishing*) 및 fish 스프라이트시트는 skip.
 *   - LocationLoaderScene : 낚시터별 BG + fish 스프라이트시트 (HomeScene CAST 직후 lazy load).
 */

import Phaser from 'phaser';
import { LOADING_ASSETS } from '../config/assets.config.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config.js';

// ─── 신규 5종 sprite atlas — bleed 방지용 NEAREST 강제 키 목록 ───
//   원인: WebGL 의 LINEAR/MIPMAP filter 가 atlas 인접 셀 픽셀을 평균화 → 옆 frame 의
//   잔재가 sprite 가장자리에 보임. NEAREST 는 1픽셀 sampling 만 사용 → 완전 차단.
//   전역 'addtexture' 이벤트로 hook → 어느 씬(LocationLoader/Verify/Loading)에서
//   로드되든 텍스처가 cache 에 추가되는 즉시 filter 적용.
const NEAREST_FILTER_KEYS = new Set([
  'sprite_cutlasfish',
  'sprite_flounder',
  'sprite_marbledsole',
  'sprite_mullet',
  'sprite_whiting',
]);

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    // 전역 텍스처 추가 hook — 가장 일찍 등록되어야 LoadingScene/LocationLoaderScene
    // 의 로딩보다 먼저 적용됨. textures 는 game-global → BootScene 한 번 등록으로 충분.
    this.textures.on('addtexture', this._enforceNearestFilter, this);
    for (const [key, path] of Object.entries(LOADING_ASSETS)) {
      this.load.image(key, path);
    }
    this._drawMinimal();
  }

  /**
   * NEAREST 필터를 Phaser API + WebGL 직접 호출 양쪽으로 강제.
   *   Phaser API: tex.setFilter() → 내부적으로 renderer 거쳐 texParameteri 호출.
   *   직접 호출 : Phaser API 가 어떤 이유로 실패해도 GPU 에 NEAREST 가 확실히 박힘.
   *   추가로 mip filter 도 NEAREST 로 (mipmap 생성 여부 무관).
   *
   * @param {string} key
   */
  _enforceNearestFilter(key) {
    if (!NEAREST_FILTER_KEYS.has(key)) return;
    const tex = this.textures.get(key);
    if (!tex) return;
    try { tex.setFilter(Phaser.Textures.FilterMode.NEAREST); } catch { /* ignore */ }

    // WebGL 직접 호출 — Phaser 우회 (defense-in-depth).
    const gl = this.renderer?.gl;
    if (!gl || !tex.source) return;
    for (const src of tex.source) {
      const glTex = src.glTexture;
      if (!glTex) continue;
      try {
        gl.bindTexture(gl.TEXTURE_2D, glTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      } catch { /* ignore — non-WebGL renderer 등 */ }
    }
  }

  _drawMinimal() {
    const W = this.scale.width;
    const H = this.scale.height;

    const bg = this.add.graphics();
    bg.fillStyle(0x062a55, 1);
    bg.fillRect(0, 0, W, H);

    const label = this.add.text(W / 2, H / 2, 'Loading...', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '24px',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.load.on('complete', () => {
      bg.destroy();
      label.destroy();
    });
  }

  create() {
    // GPU 텍스처 사이즈 상한 가드 — 1024×1024 시트(sprite_fish_effect 등) 안전 로딩 확인.
    // MAX_TEXTURE_SIZE < 2048 인 저사양 GPU 에서는 큰 시트가 잘리거나 검게 나올 수 있음.
    const gl = this.renderer?.gl;
    const maxTex = gl?.getParameter?.(gl.MAX_TEXTURE_SIZE);
    if (maxTex && maxTex < 2048) {
      console.warn('Low MAX_TEXTURE_SIZE:', maxTex);
    }

    this.scene.start('LoadingScene');
  }
}
